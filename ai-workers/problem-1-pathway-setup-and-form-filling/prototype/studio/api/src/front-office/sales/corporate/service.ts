// FO-2b (contracts §2.1, §2.6, §7 §2.1; AG-2-52, -53, -75, -76, -77, -79): Corporate prospects, API only. Engage as
// Corporate, the company and its contacts, Change type until signed, the two boards and the subject part of
// `prospect.won`. Each change is one transaction: the row under its lock, seen again, one audit line through AuditPort,
// the outbox rows last. The database's FO-1a checks stay the backstop (one live PRIMARY, a primary contact is linked).
import { Inject, Injectable } from "@nestjs/common";
import type { FoContactRole, FoPipeline, PrismaClient } from "@prisma/client";
import { EVENT, LeadEventPayload, ProspectEventPayload, ProspectWonSubject } from "../../../../../ports/events.ts";
import type { AuditValues } from "../../../../../ports/audit.ts";
import { Db } from "../../../core.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import type { StaffContext } from "../../../platform/identity/keys.ts";
import { possibleMatch } from "../arrival.ts";
import { actorOf, conflict, email, notFound, phone, sees, text, unprocessable, UUID, visibilityOf, type Tx } from "../common.ts";
import { boardTotals } from "../board-totals.ts";
import { SALES_PORTS, type SalesPorts } from "../public.ts";
import { sourcesChecked } from "../source-filter.ts";
import { companyMatches, normaliseCompanyName, seesCompany, type Seer } from "./match.ts";

export const ROLES = ["PRIMARY", "SIGNATORY", "HR", "BILLING", "OTHER"] as const;
const TYPES = ["INDIVIDUAL", "CORPORATE"] as const;
type B = Record<string, unknown>;
type Scalar = string | number | boolean | null;
type Detail = Record<string, Scalar | Scalar[]>;
type Values = { before: AuditValues | null; after: AuditValues | null };   // as AuditPort's AuditDetail (flat values or a list of at most 50)
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ") || "(no name)";
const idOf = (v: unknown, field: string, what: string) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : unprocessable(`${what}: choose one from the list.`, { [field]: "Choose one from the list." }));
const roleOf = (v: unknown) => ((ROLES as readonly unknown[]).includes(v) ? (v as FoContactRole) : unprocessable("Role: PRIMARY, SIGNATORY, HR, BILLING or OTHER (AG-2-77 rule 3).", { role: "Choose a role from the list." }));
const typeOf = (v: unknown) => ((TYPES as readonly unknown[]).includes(v) ? (v as FoPipeline) : unprocessable("Type: INDIVIDUAL or CORPORATE.", { type: "Choose Individual or Corporate." }));

/** The subject part of `prospect.won` (contracts §7 §2.6): the person, or the company with its live contacts and their
 *  roles, read from the links (linked, never copied, AG-2-77 rule 7). FO-2 part 3's Convert and FO-6's signature put
 *  it in the payload they write. */
export async function wonSubjectOf(db: Tx | PrismaClient, firmId: string, prospectId: string): Promise<ProspectWonSubject> {
  const p = await db.foProspect.findFirstOrThrow({ where: firmScope(firmId, { id: prospectId }), include: { subjectCompany: { include: { contacts: { where: { validTo: null }, include: { person: true }, orderBy: [{ validFrom: "asc" }, { id: "asc" }] } } } } });
  if (p.type === "INDIVIDUAL") return ProspectWonSubject.parse({ subject: "PERSON", personId: p.subjectPersonId });
  const people = new Map<string, { personId: string; givenNames: string | null; familyName: string | null; email: string | null; phone: string | null; roles: FoContactRole[]; primaryContact: boolean }>();
  for (const c of p.subjectCompany!.contacts) {
    const x = people.get(c.personId) ?? { personId: c.personId, givenNames: c.person.givenNames, familyName: c.person.familyName, email: c.person.email, phone: c.person.phone, roles: [], primaryContact: c.personId === p.primaryContactPersonId };
    x.roles.push(c.role);
    people.set(c.personId, x);
  }
  return ProspectWonSubject.parse({ subject: "COMPANY", company: { id: p.subjectCompany!.id, name: p.subjectCompany!.operatingName }, contacts: [...people.values()] });
}

@Injectable()
export class Corporate {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  /** Who sees a prospect (AG-2-64, the retainers' rule): all with view.all and "everyone sees all", else their own. */
  private async seer(ctx: StaffContext) {
    const vis = await visibilityOf(this.db, ctx);
    const see = (owner: string | null) => vis.seesAll || owner === ctx.staffId;
    return { vis, see, company: { see, seesAll: vis.seesAll, actor: actorOf(ctx) } satisfies Seer };
  }

  /** One audit line on a prospect, or on a company contact link (entities named literally, for check_case_feed's sweep). */
  /*  R1.8 (QA-594): `v` is the row's before and after (null for a side that does not exist), required. */
  private audit(tx: Tx, ctx: StaffContext, action: string, entityKey: string, summary: string, detail: Detail, v: Values) {
    return this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action, entity: "fo_prospect", entityKey, summary, detail, before: v.before, after: v.after });
  }
  private auditLink(tx: Tx, ctx: StaffContext, action: string, entityKey: string, summary: string, detail: Detail, v: Values) {
    return this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action, entity: "fo_company_contact", entityKey, summary, detail, before: v.before, after: v.after });
  }
  private event(tx: Tx, firmId: string, type: string, subjectId: string, payload: object) {
    return tx.moduleEvent.create({ data: { firmId, type, subjectId, payload: payload as never } });
  }

  /** The company match (AG-2-79): offered, never linked. */
  async match(ctx: StaffContext, name: unknown) {
    const n = text(name, { field: "name", what: "Company name", max: 200, required: true })!;
    return { offers: await companyMatches(this.db, ctx.firmId, n, (await this.seer(ctx)).company) };
  }

  /** The company picked (`companyId`) or a new one (`companyName`): a name that matches one on file is refused with the
   *  offers (409 COMPANY_MATCH) until the body picks one or says `newCompany: true` (AG-2-79 rules 7, 9). */
  private async company(tx: Tx, ctx: StaffContext, b: B, name: string | null, seer: Seer) {
    if (b.companyId !== undefined && b.companyId !== null) {
      // Only a company the person sees (one of its prospects is theirs to see): an unseen one is the same refusal as an unknown id (Devin).
      const found = await tx.foCompany.findFirst({ where: firmScope(ctx.firmId, { id: idOf(b.companyId, "companyId", "Company") }), select: { id: true, createdBy: true, prospects: { select: { ownerStaffId: true } } } });
      const c = found && seesCompany(seer, found) ? found : null;
      // A pick is the decision (AG-2-79 rule 9); the key it matched on is known only when a name was typed with it (review m1).
      const typed = typeof b.companyName === "string" && b.companyName.trim() ? normaliseCompanyName(b.companyName) : null;
      const matchedOn = typed && c && typed === (await tx.foCompany.findFirst({ where: firmScope(ctx.firmId, { id: c.id }), select: { normalisedName: true } }))?.normalisedName ? "ORG_NAME" : null;
      return c ? { id: c.id, created: false, picked: true, matchedOn, offered: matchedOn ? 1 : 0 } : unprocessable("Company: choose one from the list.", { companyId: "Choose one from the list." });
    }
    const offers = await companyMatches(tx, ctx.firmId, name!, seer);
    if (offers.length && b.newCompany !== true) conflict("A company with this name is already on file. Pick it, or choose New company.", "COMPANY_MATCH", { offers });
    const c = await tx.foCompany.create({ data: { firmId: ctx.firmId, operatingName: name!, normalisedName: normaliseCompanyName(name!), createdBy: actorOf(ctx) } });
    return { id: c.id, created: true, picked: false, matchedOn: offers.length ? "ORG_NAME" : null, offered: offers.length };
  }

  /** The enquirer's link (AG-2-77 rule 4): their live link if they have one, else PRIMARY, or OTHER when the company
   *  already has a live PRIMARY (one per company). The company row is locked first, so two links never race. */
  private async link(tx: Tx, ctx: StaffContext, companyId: string, personId: string): Promise<FoContactRole> {
    await tx.$queryRaw`select 1 from fo_company where firm_id = ${ctx.firmId}::uuid and id = ${companyId}::uuid for update`;
    const live = await tx.foCompanyContact.findMany({ where: firmScope(ctx.firmId, { companyId, validTo: null }), select: { personId: true, role: true } });
    const mine = live.filter((l) => l.personId === personId);
    if (mine.length) return mine.some((l) => l.role === "PRIMARY") ? "PRIMARY" : mine[0].role;
    const role: FoContactRole = live.some((l) => l.role === "PRIMARY") ? "OTHER" : "PRIMARY";
    await tx.foCompanyContact.create({ data: { firmId: ctx.firmId, companyId, personId, role, createdBy: actorOf(ctx) } });
    return role;
  }

  private async firstStage(tx: Tx, firmId: string, pipeline: FoPipeline) {
    return tx.foStage.findFirstOrThrow({ where: firmScope(firmId, { pipeline, kind: "ACTIVE" as const, active: true }), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  }

  /** Engage as Corporate (AG-2-75 rules 1, 4, 5): an open or engaged lead the person sees; a company name or a pick;
   *  the enquirer linked (PRIMARY) and still labelled Lead; the prospect in the Corporate pipeline's first stage (Engaged),
   *  owned by the lead's owner, or the clicker when the lead has none (rule 5c). */
  async engage(ctx: StaffContext, leadId: string, b: B) {
    if (typeof leadId !== "string" || !UUID.test(leadId)) return notFound();
    const name = b.companyId === undefined || b.companyId === null ? text(b.companyName, { field: "companyName", what: "Company name", max: 200, required: true }) : null;
    const seer = await this.seer(ctx), { vis } = seer;
    const staff = new Map((await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId), select: { id: true, status: true } })).map((s) => [s.id, s.status]));
    const id = await this.db.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ id: string; state: string; owner_staff_id: string | null; person_id: string; door: "WEB_FORM" | "MANUAL" | "BOOKING"; number: string }[]>`
        select id::text, state, owner_staff_id::text, person_id::text, door, number from fo_lead where firm_id = ${ctx.firmId}::uuid and id = ${leadId.toLowerCase()}::uuid for update`;
      const active = l?.owner_staff_id && staff.get(l.owner_staff_id) === "ACTIVE" ? l.owner_staff_id : null;
      if (!l || !sees(vis, ctx, active)) return notFound();
      if (l.state === "CLOSED") return conflict("This lead is closed. Reopen it first (AG-2-80).", "LEAD_CLOSED");
      const company = await this.company(tx, ctx, b, name, seer.company);
      const owner = active ?? ctx.staffId;
      // The first Engage's time and person stay (a second Engage on an ENGAGED lead keeps them; review m3).
      await tx.foLead.update({ where: { id: l.id }, data: { state: "ENGAGED", ownerStaffId: owner, ...(l.state === "OPEN" ? { engagedAt: new Date(), engagedBy: actorOf(ctx) } : {}) } });
      const role = await this.link(tx, ctx, company.id, l.person_id);
      const stage = await this.firstStage(tx, ctx.firmId, "CORPORATE");
      const p = await tx.foProspect.create({ data: { firmId: ctx.firmId, leadId: l.id, type: "CORPORATE", stageId: stage.id, subjectCompanyId: company.id, primaryContactPersonId: l.person_id, ownerStaffId: owner, createdBy: actorOf(ctx) } });
      await tx.foStageMove.create({ data: { firmId: ctx.firmId, prospectId: p.id, toStageId: stage.id, cause: "PERSON", byActor: actorOf(ctx) } });
      await this.audit(tx, ctx, EVENT.LEAD_ENGAGED, p.id, `Staff ${ctx.staffId} engaged lead ${l.number} as Corporate.`, {
        leadId: l.id, type: "CORPORATE", companyId: company.id, companyCreated: company.created, companyPicked: company.picked, matchedOn: company.matchedOn, offered: company.offered, enquirerRole: role, ownerStaffId: owner, ownerFilled: active === null,
      }, { before: null, after: { leadId: l.id, type: "CORPORATE", stage: stage.key, subjectCompanyId: company.id, primaryContactPersonId: l.person_id, ownerStaffId: owner } });
      // The lead's own line (AG-2-75 §7: "Engaged by … as Corporate" on the lead and the prospect; FO-2's one line per lead change; Devin).
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.LEAD_ENGAGED, entity: "fo_lead", entityKey: l.id, summary: `Staff ${ctx.staffId} engaged lead ${l.number} as Corporate.`, detail: { prospectId: p.id, type: "CORPORATE", fromState: l.state },
        before: { state: l.state, ownerStaffId: l.owner_staff_id }, after: { state: "ENGAGED", ownerStaffId: owner } });
      // An owner filled by Engage is a take (AG-2-75 rule 5c): its line on the lead, as Take it writes, so FO-2v's race answer reads it (review m3).
      if (active === null) await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.LEAD_TAKEN, entity: "fo_lead", entityKey: l.id, summary: `Staff ${ctx.staffId} took lead ${l.number} by engaging it.`, detail: { ownerStaffId: owner, previousOwnerStaffId: l.owner_staff_id, fromUnassigned: true, via: "ENGAGE" },
        before: { ownerStaffId: l.owner_staff_id }, after: { ownerStaffId: owner } });
      if (active === null) await this.event(tx, ctx.firmId, EVENT.LEAD_TAKEN, l.id, LeadEventPayload.parse({ leadId: l.id, personId: l.person_id, door: l.door, state: "ENGAGED", ownerStaffId: owner }));
      await this.event(tx, ctx.firmId, EVENT.LEAD_ENGAGED, p.id, ProspectEventPayload.parse({ prospectId: p.id, leadId: l.id, type: "CORPORATE", stageKey: stage.key, subjectPersonId: null, subjectCompanyId: company.id, primaryContactPersonId: l.person_id, ownerStaffId: owner }));
      return p.id;
    });
    return this.read(ctx, id);
  }

  /** One prospect with its company and live contacts, if the person sees it (404 otherwise, as another firm's). */
  async read(ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound("prospect");
    const p = await this.db.foProspect.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase() }), include: { stage: true, subjectPerson: true, subjectCompany: { include: { contacts: { where: { validTo: null }, include: { person: true }, orderBy: [{ validFrom: "asc" }, { id: "asc" }] } } } } });
    if (!p || !(await this.seer(ctx)).see(p.ownerStaffId)) return notFound("prospect");
    const contacts = p.subjectCompany?.contacts ?? [];
    const labels = await this.labels(contacts.map((c) => c.personId).concat(p.subjectPersonId ?? []), ctx.firmId);
    return {
      id: p.id, number: p.number, type: p.type, leadId: p.leadId, ownerStaffId: p.ownerStaffId, stage: { key: p.stage.key, label: p.stage.label, kind: p.stage.kind },
      company: p.subjectCompany ? { id: p.subjectCompany.id, name: p.subjectCompany.operatingName } : null,
      person: p.subjectPerson ? { id: p.subjectPerson.id, name: nameOf(p.subjectPerson), label: labels.get(p.subjectPerson.id) } : null,
      primaryContactPersonId: p.primaryContactPersonId,
      contacts: contacts.map((c) => ({ id: c.id, personId: c.personId, name: nameOf(c.person), role: c.role, label: labels.get(c.personId), primaryContact: c.personId === p.primaryContactPersonId })),
    };
  }

  /** A person's label (AG-2-75 rule 5e): "Active prospect" while they are the subject of an open Individual prospect,
   *  else "Lead"; a Corporate Engage never moves the enquirer (the company is the subject). */
  private async labels(personIds: string[], firmId: string) {
    const open = await this.db.foProspect.findMany({ where: firmScope(firmId, { type: "INDIVIDUAL" as const, subjectPersonId: { in: personIds }, stage: { kind: { in: ["ACTIVE" as const, "NURTURE" as const] } } }), select: { subjectPersonId: true } });
    const active = new Set(open.map((o) => o.subjectPersonId));
    return new Map(personIds.map((x) => [x, active.has(x) ? "Active prospect" : "Lead"]));
  }

  /** The board of one pipeline (AG-2-52 rules 1-2, AG-2-53): its live stages in order, each with the prospects of that
   *  type the person sees. A Corporate prospect is never on the Individual board, and the reverse. `source` (R1.30,
   *  QA-533; AG-2-23 rule 1) narrows the cards, the counts and the totals to prospects whose lead came from it, checked
   *  as Leads and the List check it (an unknown one → 400). */
  async board(ctx: StaffContext, type: unknown, source?: unknown) {
    const t = typeOf(type);
    const { vis } = await this.seer(ctx);
    const sources = await sourcesChecked(this.db, ctx, vis, source);
    const fromSources = sources.length ? { lead: { source: { in: sources } } } : {};
    const [stages, rows] = await Promise.all([
      this.db.foStage.findMany({ where: firmScope(ctx.firmId, { pipeline: t, active: true }), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      this.db.foProspect.findMany({ where: firmScope(ctx.firmId, { type: t, ...(vis.seesAll ? {} : { ownerStaffId: ctx.staffId }), ...fromSources }), include: { subjectPerson: true, subjectCompany: true }, orderBy: [{ number: "asc" }], take: 1000 }),
    ]);
    const money = await boardTotals(this.db, ctx.firmId, t, vis.seesAll ? null : ctx.staffId, sources);   // FO-2 part 3: totals per currency, never summed across (R1.31)
    return {
      type: t, totals: money.open, stages: stages.map((s) => ({
        id: s.id, key: s.key, label: s.label, kind: s.kind, totals: money.byStage.get(s.id) ?? [],
        prospects: rows.filter((p) => p.stageId === s.id).map((p) => ({ id: p.id, number: p.number, type: p.type, name: p.subjectCompany?.operatingName ?? nameOf(p.subjectPerson!), ownerStaffId: p.ownerStaffId })),
      })),
    };
  }

  /** A company the person may work on: one of its prospects is theirs to see (404 otherwise). */
  private async seenCompany(ctx: StaffContext, companyId: string) {
    const { company } = await this.seer(ctx);
    const c = await this.db.foCompany.findFirst({ where: firmScope(ctx.firmId, { id: companyId }), include: { prospects: { select: { ownerStaffId: true } } } });
    if (!c || !seesCompany(company, c)) return notFound("company");
    return c;
  }

  /** The company's live contacts (AG-2-77 rule 3). */
  async contacts(ctx: StaffContext, companyId: string) {
    const c = await this.seenCompany(ctx, typeof companyId === "string" && UUID.test(companyId) ? companyId.toLowerCase() : notFound("company"));
    const rows = await this.db.foCompanyContact.findMany({ where: firmScope(ctx.firmId, { companyId: c.id, validTo: null }), include: { person: true }, orderBy: [{ validFrom: "asc" }, { id: "asc" }] });
    return { company: { id: c.id, name: c.operatingName }, contacts: rows.map((r) => ({ id: r.id, personId: r.personId, name: nameOf(r.person), role: r.role })) };
  }

  /** Add a contact (AG-2-77 rules 3, 5): a person on file (`personId`) or a new one (checked against people first, as
   *  Add a lead: 409 KNOWN_PERSON unless `confirmedNew`); one person may hold several roles, never one role twice; a
   *  second PRIMARY is refused (use Make primary: change a role to PRIMARY). */
  async addContact(ctx: StaffContext, companyId: string, b: B) {
    const c = await this.seenCompany(ctx, typeof companyId === "string" && UUID.test(companyId) ? companyId.toLowerCase() : notFound("company"));
    const role = roleOf(b.role);
    let personId: string | null = null, newPerson: { givenNames: string; familyName: string | null; email: string | null; phone: { phone: string; readable: boolean } | null } | null = null;
    if (b.personId !== undefined && b.personId !== null) {
      // Only a person the adder may see: one of their leads is visible, or they are (or were) a contact of this company (Devin; as Add a lead, AG-2-4 rule 6).
      const want = idOf(b.personId, "personId", "Person"), { vis } = await this.seer(ctx);
      const [theirs, here] = await Promise.all([
        this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: want }), select: { ownerStaffId: true } }),
        this.db.foCompanyContact.count({ where: firmScope(ctx.firmId, { companyId: c.id, personId: want }) }),
      ]);
      personId = here > 0 || theirs.some((x) => sees(vis, ctx, x.ownerStaffId)) ? want : notFound("person");
    } else {
      newPerson = { givenNames: text(b.givenNames, { field: "givenNames", what: "First name", max: 100, required: true })!, familyName: text(b.familyName, { field: "familyName", what: "Last name", max: 100 }), email: email(b.email), phone: phone(b.phone) };
      const match = b.confirmedNew === true ? null : await possibleMatch(this.db, ctx.firmId, newPerson);
      if (match) {
        // Named only when the person may see them: one of their leads is visible, or they are a contact of this company (review m7).
        const { vis } = await this.seer(ctx);
        const [theirLeads, here, p] = await Promise.all([
          this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: match }), select: { ownerStaffId: true } }),
          this.db.foCompanyContact.count({ where: firmScope(ctx.firmId, { companyId: c.id, personId: match }) }),
          this.db.foPerson.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: match }) }),
        ]);
        const seen = here > 0 || theirLeads.some((x) => sees(vis, ctx, x.ownerStaffId));
        conflict("This person may already be on file. Pick them, or say it is someone new.", "KNOWN_PERSON", { matches: [seen ? { personId: match, name: nameOf(p) } : { personId: null, name: "A person you cannot see" }] });
      }
    }
    const linkId = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_company where firm_id = ${ctx.firmId}::uuid and id = ${c.id}::uuid for update`;
      if (newPerson) personId = (await tx.foPerson.create({ data: { firmId: ctx.firmId, givenNames: newPerson.givenNames, familyName: newPerson.familyName, email: newPerson.email, phone: newPerson.phone?.phone ?? null, phoneReadable: newPerson.phone?.readable ?? true, createdBy: actorOf(ctx) } })).id;
      const live = await tx.foCompanyContact.findMany({ where: firmScope(ctx.firmId, { companyId: c.id, validTo: null }), select: { personId: true, role: true } });
      if (live.some((l) => l.personId === personId && l.role === role)) conflict("This person already has this role at the company.", "ALREADY_LINKED");
      if (role === "PRIMARY" && live.some((l) => l.role === "PRIMARY")) conflict("The company has a primary contact. Make this person primary by changing their role.", "PRIMARY_TAKEN");
      const link = await tx.foCompanyContact.create({ data: { firmId: ctx.firmId, companyId: c.id, personId: personId!, role, createdBy: actorOf(ctx) } });
      await this.auditLink(tx, ctx, "company_contact.added", link.id, `Staff ${ctx.staffId} added a ${role} contact to company ${c.id}.`, { companyId: c.id, personId, role, newPerson: newPerson !== null },
        { before: null, after: { companyId: c.id, personId: personId!, role, ...(newPerson ? { givenNames: newPerson.givenNames, familyName: newPerson.familyName, email: newPerson.email, phone: newPerson.phone?.phone ?? null } : {}) } });
      return link.id;
    });
    return { id: linkId, ...(await this.contacts(ctx, c.id)) };
  }

  private async liveLink(ctx: StaffContext, linkId: string) {
    if (typeof linkId !== "string" || !UUID.test(linkId)) return notFound("contact");
    const l = await this.db.foCompanyContact.findFirst({ where: firmScope(ctx.firmId, { id: linkId.toLowerCase(), validTo: null }) });
    if (!l) return notFound("contact");
    await this.seenCompany(ctx, l.companyId);
    return l;
  }

  /** Change a contact's role (AG-2-77 rules 3, 6): the link ends and a new one starts, so the history stays. To PRIMARY
   *  is Make primary: the old primary becomes OTHER and the company's open prospects that named them now name this
   *  person, in one transaction. A PRIMARY link changes only by making another person primary. */
  async changeRole(ctx: StaffContext, linkId: string, b: B) {
    const l = await this.liveLink(ctx, linkId), role = roleOf(b.role);
    if (l.role === role) conflict("This contact already has this role.", "SAME_ROLE");
    if (l.role === "PRIMARY") conflict("Make another person primary first (AG-2-77 rule 6).", "PRIMARY_NEEDED");
    const { see } = await this.seer(ctx);
    let repointed: string[] = [];
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_company where firm_id = ${ctx.firmId}::uuid and id = ${l.companyId}::uuid for update`;
      const live = await tx.foCompanyContact.findMany({ where: firmScope(ctx.firmId, { companyId: l.companyId, validTo: null }) });
      if (!live.some((x) => x.id === l.id)) conflict("This contact changed. Reload it.", "CHANGED");
      if (live.some((x) => x.personId === l.personId && x.role === role)) conflict("This person already has this role at the company.", "ALREADY_LINKED");
      const now = new Date(), old = role === "PRIMARY" ? live.find((x) => x.role === "PRIMARY") : undefined;
      if (old) {
        await tx.foCompanyContact.update({ where: { id: old.id }, data: { validTo: now } });
        if (!live.some((x) => x.personId === old.personId && x.role === "OTHER")) await tx.foCompanyContact.create({ data: { firmId: ctx.firmId, companyId: l.companyId, personId: old.personId, role: "OTHER", createdBy: actorOf(ctx) } });
        // The company's open prospects that named the old primary: every one must be the person's to see, or nothing
        // changes (review M2: never a silent change to another person's prospect); each repoint gets its own line.
        const named = await tx.$queryRaw<{ id: string; number: string; owner_staff_id: string | null }[]>`
          select p.id::text, p.number, p.owner_staff_id::text from fo_prospect p join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
           where p.firm_id = ${ctx.firmId}::uuid and p.type = 'CORPORATE' and p.subject_company_id = ${l.companyId}::uuid
             and p.primary_contact_person_id = ${old.personId}::uuid and s.kind in ('ACTIVE', 'NURTURE') order by p.number for update of p`;
        if (named.some((x) => !see(x.owner_staff_id))) conflict("This company has open prospects you cannot see that name its primary contact. Their owner can change it, or an Owner can turn on \"Everyone sees all\" for staff who may see all prospects.", "HIDDEN_PROSPECTS");
        for (const x of named) {
          await tx.foProspect.update({ where: { id: x.id }, data: { primaryContactPersonId: l.personId } });
          await this.audit(tx, ctx, "prospect.primary_contact_changed", x.id, `Staff ${ctx.staffId} made another contact primary for ${x.number}.`, { companyId: l.companyId, fromPersonId: old.personId, toPersonId: l.personId },
            { before: { primaryContactPersonId: old.personId }, after: { primaryContactPersonId: l.personId } });
        }
        repointed = named.map((x) => x.id);
      }
      await tx.foCompanyContact.update({ where: { id: l.id }, data: { validTo: now } });
      const n = await tx.foCompanyContact.create({ data: { firmId: ctx.firmId, companyId: l.companyId, personId: l.personId, role, createdBy: actorOf(ctx) } });
      await this.auditLink(tx, ctx, "company_contact.role_changed", n.id, `Staff ${ctx.staffId} changed a contact's role from ${l.role} to ${role}.`, { companyId: l.companyId, personId: l.personId, fromRole: l.role, toRole: role, endedLinkId: l.id, previousPrimaryPersonId: old?.personId ?? null, repointedCount: repointed.length, repointedProspectIds: repointed.slice(0, 50) },
        { before: { companyId: l.companyId, personId: l.personId, role: l.role }, after: { companyId: l.companyId, personId: l.personId, role } });   // each repoint has its own line; the list is capped at the audit detail's 50 (Devin)
    });
    return this.contacts(ctx, l.companyId);
  }

  /** End a contact (AG-2-77 rule 6): the link ends with a date; the person stays. Not the PRIMARY link, and not the
   *  last link of an open prospect's primary contact (the database checks the same at commit). */
  async endContact(ctx: StaffContext, linkId: string) {
    const l = await this.liveLink(ctx, linkId);
    if (l.role === "PRIMARY") conflict("Make another person primary first (AG-2-77 rule 6).", "PRIMARY_NEEDED");
    const { see } = await this.seer(ctx);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_company where firm_id = ${ctx.firmId}::uuid and id = ${l.companyId}::uuid for update`;
      const others = await tx.foCompanyContact.count({ where: firmScope(ctx.firmId, { companyId: l.companyId, personId: l.personId, validTo: null, id: { not: l.id } }) });
      const named = await tx.foProspect.findFirst({ where: firmScope(ctx.firmId, { type: "CORPORATE" as const, subjectCompanyId: l.companyId, primaryContactPersonId: l.personId, stage: { kind: { in: ["ACTIVE" as const, "NURTURE" as const] } } }), select: { number: true, ownerStaffId: true } });
      if (!others && named) conflict(`This person is the primary contact of ${see(named.ownerStaffId) ? named.number : "an open prospect"}. Make another person primary first.`, "PRIMARY_NEEDED");
      const n = await tx.foCompanyContact.updateMany({ where: firmScope(ctx.firmId, { id: l.id, validTo: null }), data: { validTo: new Date() } });
      if (n.count !== 1) conflict("This contact changed. Reload it.", "CHANGED");
      await this.auditLink(tx, ctx, "company_contact.ended", l.id, `Staff ${ctx.staffId} ended a ${l.role} contact of company ${l.companyId}.`, { companyId: l.companyId, personId: l.personId, role: l.role },
        { before: { companyId: l.companyId, personId: l.personId, role: l.role }, after: null });
    });
    return this.contacts(ctx, l.companyId);
  }

  /** Change type (AG-2-76): Individual ↔ Corporate while open (ACTIVE or NURTURE) and before signing; the same row, so
   *  the number, owner, lead, notes, calls and history stay. The stage with the same key in the other pipeline, else
   *  the nearest earlier ACTIVE one (rule 6). To Corporate asks for a company as Engage does and links the person
   *  (rule 8); to Individual the subject is the primary contact, or another live contact picked (`personId`, rule 3). */
  async changeType(ctx: StaffContext, prospectId: string, b: B) {
    if (typeof prospectId !== "string" || !UUID.test(prospectId)) return notFound("prospect");
    const to = typeOf(b.type);
    const name = to === "CORPORATE" && (b.companyId === undefined || b.companyId === null) ? text(b.companyName, { field: "companyName", what: "Company name", max: 200, required: true }) : null;
    const seer = await this.seer(ctx), { see } = seer;
    const id = prospectId.toLowerCase();
    await this.db.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ type: FoPipeline; stage_id: string; owner_staff_id: string | null; lead_id: string; subject_person_id: string | null; subject_company_id: string | null; primary_contact_person_id: string; number: string }[]>`
        select type, stage_id::text, owner_staff_id::text, lead_id::text, subject_person_id::text, subject_company_id::text, primary_contact_person_id::text, number
          from fo_prospect where firm_id = ${ctx.firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !see(p.owner_staff_id)) return notFound("prospect");
      const cur = await tx.foStage.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: p.stage_id }) });
      if (cur.kind === "WON") conflict("This prospect is signed: its type is fixed (AG-2-76).", "SIGNED");
      if (cur.kind === "LOST") conflict("A lost prospect keeps its type. Start a new prospect instead.", "PROSPECT_CLOSED");
      if (p.type === to) conflict(`This prospect is already ${to === "CORPORATE" ? "Corporate" : "Individual"}.`, "SAME_TYPE");
      const r = await tx.foRetainer.findFirst({ where: firmScope(ctx.firmId, { prospectId: id, kind: "RETAINER" as const, status: { notIn: ["WITHDRAWN", "EXPIRED"] as never } }), select: { id: true, status: true } });
      if (r && ["SIGNED", "SIGNED_OFFLINE", "CLIENT_SIGNED"].includes(r.status)) conflict("This prospect was just signed: its type is fixed.", "SIGNED");
      if (r && ["SENT", "VIEWED"].includes(r.status)) conflict("Void the retainer in Agreements first.", "RETAINER_SENT");
      // A DRAFT or DECLINED retainer's subject was fixed at Prepare and FO-5 cannot re-subject or discard it (its status
      // moves: DRAFT → SENT | SIGNED_OFFLINE, DECLINED → DRAFT), so changing the type would leave an agreement naming the
      // wrong client that can only be sent. Refused, saying so plainly (review M1; stricter than AG-2-76 rule 2, PR question 2).
      if (r) conflict("This prospect has an agreement being prepared for the current client, and it cannot be discarded yet. Change type waits until it can (Agreements has no Discard draft yet).", "RETAINER_OPEN", { retainerId: r.id, retainerStatus: r.status });
      const stages = await tx.foStage.findMany({ where: firmScope(ctx.firmId, { pipeline: to, active: true }), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
      const same = stages.find((s) => s.key === cur.key && (s.kind === "ACTIVE" || s.kind === "NURTURE"));
      const earlier = stages.filter((s) => s.kind === "ACTIVE" && s.sortOrder < cur.sortOrder).at(-1);
      const stage = same ?? earlier ?? stages.find((s) => s.kind === "ACTIVE")!;
      let subject: { subjectPersonId: string | null; subjectCompanyId: string | null; primaryContactPersonId: string }, extra: Detail = {};
      if (to === "CORPORATE") {
        const company = await this.company(tx, ctx, b, name, seer.company);
        const role = await this.link(tx, ctx, company.id, p.subject_person_id!);
        subject = { subjectPersonId: null, subjectCompanyId: company.id, primaryContactPersonId: p.subject_person_id! };
        extra = { companyCreated: company.created, companyPicked: company.picked, matchedOn: company.matchedOn, enquirerRole: role };
      } else {
        const person = b.personId === undefined || b.personId === null ? p.primary_contact_person_id : idOf(b.personId, "personId", "Person");
        const linked = await tx.foCompanyContact.findFirst({ where: firmScope(ctx.firmId, { companyId: p.subject_company_id!, personId: person, validTo: null }), select: { id: true } });
        if (!linked) unprocessable("Choose one of the company's contacts.", { personId: "Choose one of the company's contacts." });
        subject = { subjectPersonId: person, subjectCompanyId: null, primaryContactPersonId: person };
      }
      await tx.foProspect.update({ where: { id }, data: { type: to, stageId: stage.id, ...subject } });
      await tx.foStageMove.create({ data: { firmId: ctx.firmId, prospectId: id, fromStageId: cur.id, toStageId: stage.id, cause: "CHANGE_TYPE", byActor: actorOf(ctx) } });
      await this.audit(tx, ctx, EVENT.PROSPECT_TYPE_CHANGED, id, `Staff ${ctx.staffId} changed ${p.number} from ${p.type} to ${to}${same ? "" : ` (stage ${cur.key} is not in that pipeline: now ${stage.key})`}.`, {
        fromType: p.type, toType: to, fromStageKey: cur.key, toStageKey: stage.key, sameStage: !!same,
        fromSubjectPersonId: p.subject_person_id, fromSubjectCompanyId: p.subject_company_id, toSubjectPersonId: subject.subjectPersonId, toSubjectCompanyId: subject.subjectCompanyId, ...extra,
      }, { before: { type: p.type, stage: cur.key, subjectPersonId: p.subject_person_id, subjectCompanyId: p.subject_company_id, primaryContactPersonId: p.primary_contact_person_id },
        after: { type: to, stage: stage.key, subjectPersonId: subject.subjectPersonId, subjectCompanyId: subject.subjectCompanyId, primaryContactPersonId: subject.primaryContactPersonId } });
      await this.event(tx, ctx.firmId, EVENT.PROSPECT_TYPE_CHANGED, id, ProspectEventPayload.parse({ prospectId: id, leadId: p.lead_id, type: to, stageKey: stage.key, ...subject, ownerStaffId: p.owner_staff_id, fromType: p.type, fromStageKey: cur.key }));
    });
    return this.read(ctx, id);
  }
}
