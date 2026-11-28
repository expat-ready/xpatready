// FO-2 part 3 (contracts §2.1, §2.6, §7; AG-2-26, -44, -47, -75; concept fo-4-sales r2 BR-7, -8, -9, -11; wave 1 Sales
// sheet): Individual Engage and the prospects: the list (stage with the Lost filter, owner, dates), one prospect, a
// person's move, Mark lost, Convert to client and Undo convert, and the board's totals per currency. Each change is one
// transaction: the prospect under its row lock and seen again, the prospect row first, then its move (FO-1a's chain
// trigger), one audit line through AuditPort with a typed actor, the outbox row last. Won by signature stays FO-6's.
// FO-2w: every win (Convert, Signed offline, and FO-6's e-signature) goes through `winProspect`, the one place that
// moves a prospect to WON and raises `prospect.won`, once per prospect, in the caller's transaction.
import { Inject, Injectable } from "@nestjs/common";
import type { FoPipeline, FoStageKind, Prisma, PrismaClient } from "@prisma/client";
import type { AuditValues } from "../../../../ports/audit.ts";
import { EVENT, LeadEventPayload, ProspectEventPayload, ProspectMovePayload, ProspectWonPayload, type EventName } from "../../../../ports/events.ts";
import { wonDuplicates } from "../duplicates/service.ts";
import { logPort } from "../../platform/observability/log.ts";
import { Db } from "../../core.ts";
import { customFieldIdsWhere } from "../../platform/custom-fields/filter.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { FIELD_ERROR_STATUS } from "../../platform/http/input.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { actorOf, conflict, notFound, sees, text, UUID, visibilityOf, type Tx } from "./common.ts";
import { wonSubjectOf } from "./corporate/service.ts";
import { SALES_PORTS, type SalesPorts } from "./public.ts";
import { sourcesChecked } from "./source-filter.ts";
import { clearForWin, lockPartyOf } from "../compliance/conflict/gate.ts";

const TYPES = ["INDIVIDUAL", "CORPORATE"] as const;
/** A retainer counts as signed once the client signed it, on screen or on paper (AG-2-47 rules 17-18). */
const SIGNED = ["CLIENT_SIGNED", "SIGNED", "SIGNED_OFFLINE"] as const;
/** Set only by a merge (FO-9b), never chosen in Mark lost. */
const MERGE_ONLY = ["COMBINED_PROSPECT"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const WON_REFUSED = "This stage is set when the prospect becomes a client. Use Convert to client, or Signed offline if the client signed on paper.";   // AG-2-26 rule 3
export const NOT_SIGNED = "Retainer not signed. Work can start. Invoices will warn you, and the case will show a warning.";   // AG-2-47 rule 16
/** A field error: 422, the field named (PF-28 part 3a moves it from 400; Lead B rev 17.21). */
const bad = (detail: string, field: string, code = "INVALID") => problem(FIELD_ERROR_STATUS, "Check the details", detail, { code, fields: { [field]: detail } });
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ") || "(no name)";
export type Locked = { id: string; number: string; type: FoPipeline; lead_id: string; owner_staff_id: string | null; stage_id: string; kind: FoStageKind; key: string; label: string; won_via: string | null; subject_person_id: string | null; subject_company_id: string | null; primary_contact_person_id: string };

/** A date filter's day (`YYYY-MM-DD`, years 1900 to 2999, in the firm's zone), or null; anything else → 422 at the field
 *  (break m2: year 0000 or 9999 reached the database and answered 500). */
export function dayOf(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v);
  return DAY.test(s) && s >= "1900-01-01" && s <= "2999-12-31" && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ? s : bad(`${field}: a date as YYYY-MM-DD.`, field);
}

/** The time range from `from` to `to` (both days included, in the firm's zone), worked out by the database, or null. */
export async function dayRange(db: Tx | PrismaClient, firmId: string, from: unknown, to: unknown): Promise<{ gte?: Date; lt?: Date } | null> {
  const f = dayOf(from, "from"), t = dayOf(to, "to");
  if (!f && !t) return null;
  if (f && t && f > t) bad("from: on or before to.", "from");
  const zone = await readSetting<string>(db, firmId, TIME_ZONE.key);
  const [r] = await db.$queryRaw<{ lo: Date | null; hi: Date | null }[]>`
    select (${f}::date::timestamp at time zone ${zone}) as lo, ((${t}::date + 1)::timestamp at time zone ${zone}) as hi`;
  return { ...(r.lo ? { gte: r.lo } : {}), ...(r.hi ? { lt: r.hi } : {}) };
}

/** The `owner` filter: a staff member of the firm (active or not), or null; another firm's or unknown → 422. */
export async function ownerAsked(db: Tx | PrismaClient, firmId: string, v: unknown): Promise<string | null> {
  if (v === undefined || v === null || v === "") return null;
  const s = typeof v === "string" && UUID.test(v) ? await db.platformStaff.findFirst({ where: firmScope(firmId, { id: v.toLowerCase() }), select: { id: true } }) : null;
  return s?.id ?? bad("owner: choose a person of your firm.", "owner", "UNKNOWN_OWNER");
}

async function signedRetainer(db: Tx | PrismaClient, firmId: string, prospectId: string) {
  return (await db.foRetainer.count({ where: firmScope(firmId, { prospectId, kind: "RETAINER" as const, status: { in: [...SIGNED] } }) })) > 0;
}

/** The prospect under its row lock, with its stage (the row lock first, on the prospect alone; break M1). */
async function lockProspect(tx: Tx, firmId: string, id: string): Promise<Locked | null> {
  const [row] = await tx.$queryRaw<Omit<Locked, "kind" | "key" | "label">[]>`
    select p.id::text, p.number, p.type, p.lead_id::text, p.owner_staff_id::text, p.stage_id::text, p.won_via::text,
           p.subject_person_id::text, p.subject_company_id::text, p.primary_contact_person_id::text
      from fo_prospect p where p.firm_id = ${firmId}::uuid and p.id = ${id}::uuid for update`;
  const st = row ? await tx.foStage.findFirst({ where: firmScope(firmId, { id: row.stage_id }), select: { kind: true, key: true, label: true } }) : null;
  return row && st ? { ...row, ...st } : null;
}

export type WonVia = "CONVERTED" | "SIGNED_OFFLINE" | "E_SIGNED";
const CAUSE = { CONVERTED: "CONVERT", SIGNED_OFFLINE: "SIGNED_OFFLINE", E_SIGNED: "RETAINER_EXECUTED" } as const;

/** FO-2w: the one win (contracts §7 §2.6; AG-2-26 rule 3, AG-2-47). In the caller's transaction, under the prospect's row
 *  lock: a prospect already WON (or not found) → null and nothing written, so a second win of any kind raises nothing.
 *  Otherwise the prospect row moves to its pipeline's WON stage (`wonVia`, `wonAt`, any lost reason cleared), then its move
 *  from where the last one ended (FO-1a's chain), then the caller's audit line, then `prospect.won` with the subject part
 *  (`wonSubjectOf`) last. The caller's own refusals (Convert's 409s, a retainer's state) come before it.
 *  Callers: Convert (`Prospects.convert`) and Signed offline (`Retainers.signedOffline`). For FO-6's owner: the e-signature
 *  win calls this with `via: "E_SIGNED"` and the signed retainer's id; never raise `prospect.won` anywhere else. */
export async function winProspect(tx: Tx, ctx: StaffContext, prospectId: string, w: { via: WonVia; at: Date; retainerId?: string | null; audit: (p: Locked, retainerSigned: boolean) => Promise<unknown> }) {
  const p = await lockProspect(tx, ctx.firmId, prospectId);
  if (!p || p.kind === "WON") return null;
  const signed = await signedRetainer(tx, ctx.firmId, p.id);
  await clearForWin(tx, ctx.firmId, p.id, w.retainerId ?? null, signed);   // FO-13c: no client without a recorded conflict check
  const to = await tx.foStage.findFirstOrThrow({ where: firmScope(ctx.firmId, { pipeline: p.type, kind: "WON" as const }) });
  const last = await tx.foStageMove.findFirst({ where: firmScope(ctx.firmId, { prospectId: p.id }), orderBy: { seq: "desc" }, select: { toStageId: true } });
  await tx.foProspect.update({ where: { id: p.id }, data: { stageId: to.id, wonVia: w.via, wonAt: w.at, lostReasonId: null, lostReasonKind: null, lostNote: null } });
  await tx.foStageMove.create({ data: { firmId: ctx.firmId, prospectId: p.id, fromStageId: last?.toStageId ?? null, toStageId: to.id, cause: CAUSE[w.via], byActor: actorOf(ctx) } });
  await w.audit(p, signed);
  await tx.moduleEvent.create({ data: { firmId: ctx.firmId, type: EVENT.PROSPECT_WON, subjectId: p.id, payload: (await wonPayload(tx, ctx, p, w.via, signed, w.retainerId ?? null)) as Prisma.InputJsonValue } });
  return { prospect: p, retainerSigned: signed };
}

/** `prospect.won` as contracts §2.6 lists it (P-559 (4)): the answers are the person's (the subject, or a company's
 *  primary contact), the consents are theirs (ids only), the retainer and its representative only when one is signed. */
async function wonPayload(tx: Tx, ctx: StaffContext, p: Locked, via: WonVia, signed: boolean, retainerId: string | null) {
  const personId = p.subject_person_id ?? p.primary_contact_person_id;
  const [person, lead, consents, retainer, subject] = await Promise.all([
    tx.foPerson.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: personId }), select: { givenNames: true, familyName: true, email: true, phone: true, phoneE164: true } }),
    tx.foLead.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: p.lead_id }), select: { interestedIn: { select: { id: true, label: true, combinationId: true } } } }),
    tx.msgConsent.findMany({ where: { firmId: ctx.firmId, subjectKind: "FO_PERSON", subjectId: personId }, select: { id: true }, orderBy: { id: "asc" } }),
    // The retainer that made the win when the caller names it, else the newest signed one.
    signed ? tx.foRetainer.findFirst({ where: firmScope(ctx.firmId, { prospectId: p.id, kind: "RETAINER" as const, status: { in: [...SIGNED] }, ...(retainerId ? { id: retainerId } : {}) }), select: { id: true, representativeStaffId: true }, orderBy: { createdAt: "desc" } }) : null,
    wonSubjectOf(tx, ctx.firmId, p.id),
  ]);
  // FO-9a (contract §4): the duplicate result for the subject, in this transaction (warn only; nothing linked or merged).
  // Under a savepoint (review m2): a failed warn-only read never rolls the win back; the event then carries no
  // `duplicates` (absent = not known, as on older events) and the failure is logged (no ids, the platform card).
  let duplicates: Awaited<ReturnType<typeof wonDuplicates>> | undefined;
  await tx.$executeRaw`savepoint fo9a_won_duplicates`;
  try { duplicates = await wonDuplicates(tx, ctx.firmId, subject); await tx.$executeRaw`release savepoint fo9a_won_duplicates`; }
  catch (e) { await tx.$executeRaw`rollback to savepoint fo9a_won_duplicates`; logPort.error("fo9a_won_duplicates_failed", e); }
  const rep = retainer?.representativeStaffId ? await tx.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: retainer.representativeStaffId }), select: { id: true, actorId: true } }) : null;
  return ProspectWonPayload.parse({
    firm_id: ctx.firmId, firm_key: ctx.firmKey, prospect_id: p.id, lead_id: p.lead_id, won_via: via,
    retainer_id: retainer?.id ?? null, representative_staff_id: rep?.id ?? null, representative_actor_id: rep?.actorId ?? null, owner_staff_id: p.owner_staff_id,
    interested_in: lead.interestedIn ? { serviceId: lead.interestedIn.id, label: lead.interestedIn.label, combinationId: lead.interestedIn.combinationId } : null,
    answers: { "person.given_names": person.givenNames, "person.family_name": person.familyName, "person.email": person.email, "person.phone_number": person.phoneE164 ?? person.phone, "person.current_residence_country": null },
    consent_ids: consents.map((c) => c.id), sealed_retainer_sha256: null,
    type: p.type, fromStageKey: p.key, retainerSigned: signed, subject, duplicates,
  });
}

@Injectable()
export class Prospects {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  /** Who sees a prospect (AG-2-64, as FO-2b and the retainers): all with view.all and "everyone sees all", else their own. */
  private async seer(ctx: StaffContext) {
    const vis = await visibilityOf(this.db, ctx);
    return { vis, see: (owner: string | null) => vis.seesAll || owner === ctx.staffId };
  }

  /** R1.8 (QA-594): `v` is the prospect's before and after (null for a side that does not exist), required. */
  private audit(tx: Tx, ctx: StaffContext, action: string, entityKey: string, summary: string, detail: Record<string, string | number | boolean | null>, v: { before: AuditValues | null; after: AuditValues | null }) {
    return this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action, entity: "fo_prospect", entityKey, summary, detail, before: v.before, after: v.after });
  }
  private event(tx: Tx, firmId: string, type: EventName, subjectId: string, payload: object) {
    return tx.moduleEvent.create({ data: { firmId, type, subjectId, payload: payload as Prisma.InputJsonValue } });
  }

  /** A prospect's version: how many stage moves it has (every stage change writes one and moves are never removed, FO-1a's
   *  chain); per prospect, so it says nothing about other prospects or firms (break m1). */
  private async versionOf(db: Tx | PrismaClient, firmId: string, prospectId: string) {
    const [m, n] = await Promise.all([
      db.foStageMove.findFirst({ where: firmScope(firmId, { prospectId }), orderBy: { seq: "desc" }, select: { toStageId: true, fromStageId: true, cause: true } }),
      db.foStageMove.count({ where: firmScope(firmId, { prospectId }) }),
    ]);
    return { version: String(n), last: m };
  }

  /** Engage (Individual) (AG-2-75 rules 1, 5, 9, 12; BR-7): an open or engaged lead the person sees; every request makes a
   *  prospect in the Individual pipeline's first stage (Engaged), and a second one says so (`again`, with the earlier
   *  numbers the person may see). The prospect goes to the lead's owner, else the clicker (an owner filled is a take). */
  async engage(ctx: StaffContext, leadId: string) {
    if (typeof leadId !== "string" || !UUID.test(leadId)) return notFound();
    const { vis, see } = await this.seer(ctx);
    const staff = new Map((await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId), select: { id: true, status: true } })).map((s) => [s.id, s.status]));
    const out = await this.db.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ id: string; state: string; owner_staff_id: string | null; person_id: string; door: "WEB_FORM" | "MANUAL" | "BOOKING"; number: string }[]>`
        select id::text, state, owner_staff_id::text, person_id::text, door, number from fo_lead where firm_id = ${ctx.firmId}::uuid and id = ${leadId.toLowerCase()}::uuid for update`;
      const active = l?.owner_staff_id && staff.get(l.owner_staff_id) === "ACTIVE" ? l.owner_staff_id : null;
      if (!l || !sees(vis, ctx, active)) return notFound();
      if (l.state === "CLOSED") return conflict("This lead is closed. Reopen it first (AG-2-80).", "LEAD_CLOSED");
      const earlier = await tx.foProspect.findMany({ where: firmScope(ctx.firmId, { leadId: l.id }), select: { number: true, ownerStaffId: true }, orderBy: { number: "asc" } });
      const owner = active ?? ctx.staffId;
      await tx.foLead.update({ where: { id: l.id }, data: { state: "ENGAGED", ownerStaffId: owner, ...(l.state === "OPEN" ? { engagedAt: new Date(), engagedBy: actorOf(ctx) } : {}) } });
      const stage = await tx.foStage.findFirstOrThrow({ where: firmScope(ctx.firmId, { pipeline: "INDIVIDUAL" as const, kind: "ACTIVE" as const, active: true }), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
      const p = await tx.foProspect.create({ data: { firmId: ctx.firmId, leadId: l.id, type: "INDIVIDUAL", stageId: stage.id, subjectPersonId: l.person_id, primaryContactPersonId: l.person_id, ownerStaffId: owner, createdBy: actorOf(ctx) } });
      await tx.foStageMove.create({ data: { firmId: ctx.firmId, prospectId: p.id, toStageId: stage.id, cause: "PERSON", byActor: actorOf(ctx) } });
      await this.audit(tx, ctx, EVENT.LEAD_ENGAGED, p.id, `Staff ${ctx.staffId} engaged lead ${l.number} as Individual${earlier.length ? ` (prospect ${earlier.length + 1} of this lead)` : ""}.`, { leadId: l.id, type: "INDIVIDUAL", ownerStaffId: owner, ownerFilled: active === null, earlierProspects: earlier.length },
        { before: null, after: { leadId: l.id, type: "INDIVIDUAL", stage: stage.key, subjectPersonId: l.person_id, primaryContactPersonId: l.person_id, ownerStaffId: owner } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.LEAD_ENGAGED, entity: "fo_lead", entityKey: l.id, summary: `Staff ${ctx.staffId} engaged lead ${l.number} as Individual.`, detail: { prospectId: p.id, type: "INDIVIDUAL", fromState: l.state },
        before: { state: l.state, ownerStaffId: l.owner_staff_id }, after: { state: "ENGAGED", ownerStaffId: owner } });
      // An owner filled by Engage is a take (AG-2-75 rule 5c), written as Take it writes it, so FO-2v's race answer reads it.
      if (active === null) await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.LEAD_TAKEN, entity: "fo_lead", entityKey: l.id, summary: `Staff ${ctx.staffId} took lead ${l.number} by engaging it.`, detail: { ownerStaffId: owner, previousOwnerStaffId: l.owner_staff_id, fromUnassigned: true, via: "ENGAGE" },
        before: { ownerStaffId: l.owner_staff_id }, after: { ownerStaffId: owner } });
      if (active === null) await this.event(tx, ctx.firmId, EVENT.LEAD_TAKEN, l.id, LeadEventPayload.parse({ leadId: l.id, personId: l.person_id, door: l.door, state: "ENGAGED", ownerStaffId: owner }));
      await this.event(tx, ctx.firmId, EVENT.LEAD_ENGAGED, p.id, ProspectEventPayload.parse({ prospectId: p.id, leadId: l.id, type: "INDIVIDUAL", stageKey: stage.key, subjectPersonId: l.person_id, subjectCompanyId: null, primaryContactPersonId: l.person_id, ownerStaffId: owner }));
      return { id: p.id, earlier };
    });
    const seenEarlier = out.earlier.filter((e) => see(e.ownerStaffId)).map((e) => e.number);
    return {
      ...(await this.read(ctx, out.id)), again: out.earlier.length > 0,
      // Names and counts only the earlier prospects the person may see (review m2); an unseen one is "a prospect", uncounted.
      ...(out.earlier.length ? { message: `This lead already had ${seenEarlier.length ? `${seenEarlier.length === 1 ? "prospect" : "prospects"} ${seenEarlier.join(", ")}` : "a prospect"}. This is another one.` } : {}),
    };
  }

  /** The prospects the person sees (AG-2-26 rule 12, AG-2-44 rule 8): by type (Individual by default); open and won
   *  ones, never Lost unless `stage` asks for the LOST stage (the Lost filter); `owner`, `source` (the lead's, checked
   *  as Leads checks it; R1.30, QA-533) and `from`/`to` (the day it was engaged, in the firm's zone) narrow inside the
   *  visibility, never widen it. */
  async list(ctx: StaffContext, q: { type?: unknown; stage?: unknown; owner?: unknown; source?: unknown; from?: unknown; to?: unknown; cf?: Record<string, string[]> }) {
    const t = q.type === undefined || q.type === "" ? "INDIVIDUAL" : (TYPES as readonly unknown[]).includes(String(q.type).toUpperCase()) ? (String(q.type).toUpperCase() as FoPipeline) : bad("type: INDIVIDUAL or CORPORATE.", "type");
    const stages = await this.db.foStage.findMany({ where: firmScope(ctx.firmId, { pipeline: t }), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const stageKey = q.stage === undefined || q.stage === "" ? null : String(q.stage).toUpperCase();
    const stage = stageKey ? stages.find((s) => s.key === stageKey) ?? bad(`stage: one of ${stages.map((s) => s.key).join(", ")}.`, "stage", "UNKNOWN_STAGE") : null;
    const owner = await ownerAsked(this.db, ctx.firmId, q.owner);
    const range = await dayRange(this.db, ctx.firmId, q.from, q.to);
    const { vis } = await this.seer(ctx);
    const sources = await sourcesChecked(this.db, ctx, vis, q.source);
    const custom = await customFieldIdsWhere(this.db, ctx.firmId, "fo_prospect", q.cf ?? {});   // PF-22v: cf.<key>, inside the visibility
    const rows = await this.db.foProspect.findMany({
      where: firmScope(ctx.firmId, {
        AND: [{ type: t }, vis.seesAll ? {} : { ownerStaffId: ctx.staffId }, stage ? { stageId: stage.id } : { stage: { kind: { not: "LOST" as const } } },
          owner ? { ownerStaffId: owner } : {}, sources.length ? { lead: { source: { in: sources } } } : {}, range ? { createdAt: range } : {}, custom ? { id: { in: custom } } : {}],
      }),
      include: { stage: true, subjectPerson: true, subjectCompany: true, lostReason: { select: { key: true, label: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 500,
    });
    return rows.map((p) => ({
      id: p.id, number: p.number, type: p.type, name: p.subjectCompany?.operatingName ?? (p.subjectPerson ? nameOf(p.subjectPerson) : "(no name)"), ownerStaffId: p.ownerStaffId,
      stage: { key: p.stage.key, label: p.stage.label, kind: p.stage.kind }, valueCents: p.valueCents, currency: p.currency, engagedAt: p.createdAt,
      lostReason: p.lostReason ? { key: p.lostReason.key, label: p.lostReason.label } : null, wonVia: p.wonVia,
    }));
  }

  /** One prospect, if the person sees it (404 otherwise, the same as another firm's), with its version for a move. */
  async read(ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound("prospect");
    const p = await this.db.foProspect.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase() }), include: { stage: true, lead: { select: { number: true } }, subjectPerson: true, subjectCompany: true, lostReason: { select: { key: true, label: true } } } });
    if (!p || !(await this.seer(ctx)).see(p.ownerStaffId)) return notFound("prospect");
    const [{ version }, signed] = await Promise.all([this.versionOf(this.db, ctx.firmId, p.id), signedRetainer(this.db, ctx.firmId, p.id)]);
    return {
      id: p.id, number: p.number, type: p.type, leadId: p.leadId, leadNumber: p.lead.number, ownerStaffId: p.ownerStaffId, version,
      stage: { id: p.stageId, key: p.stage.key, label: p.stage.label, kind: p.stage.kind },
      // QA-779: the person's email and version (PF-31, sent as If-Match), for the page's Email field (PATCH people/:id).
      person: p.subjectPerson ? { id: p.subjectPerson.id, name: nameOf(p.subjectPerson), email: p.subjectPerson.email, version: p.subjectPerson.updatedAt.toISOString() } : null, company: p.subjectCompany ? { id: p.subjectCompany.id, name: p.subjectCompany.operatingName } : null,
      valueCents: p.valueCents, currency: p.currency, wonVia: p.wonVia, wonAt: p.wonAt, retainerSigned: signed,
      lostReason: p.lostReason ? { key: p.lostReason.key, label: p.lostReason.label } : null, lostNote: p.lostNote, engagedAt: p.createdAt,
      ...(p.wonVia === "CONVERTED" && !signed ? { warning: NOT_SIGNED } : {}),
    };
  }

  /** The prospect under its row lock with its stage, seen again (404 otherwise); a version given must be the current one. */
  private async locked(tx: Tx, ctx: StaffContext, id: string, version: unknown, see: (o: string | null) => boolean) {
    // The row lock first, on the prospect alone, then its stage (break M1): a join re-checked after a waiting lock no longer
    // matches once the other change moved the stage, and the loser would hear 404 instead of the stale-version 409.
    const p = await lockProspect(tx, ctx.firmId, id);
    if (!p || !see(p.owner_staff_id)) return notFound("prospect");
    const v = await this.versionOf(tx, ctx.firmId, id);
    if (version !== undefined && version !== null && String(version) !== v.version) {
      // AG-2-26 §12: "Client F moved this to Fees discussed" and nothing changes.
      const by = v.last ? (await tx.foStageMove.findFirst({ where: firmScope(ctx.firmId, { prospectId: id }), orderBy: { seq: "desc" }, select: { byActor: true } }))?.byActor : null;
      const who = by?.startsWith("staff:") ? (await tx.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: by.slice(6) }), select: { displayName: true } }))?.displayName : null;
      return conflict(`${who ?? "Someone"} moved this to ${p.label}. Reload it.`, "STALE", { version: v.version, stage: { key: p.key, label: p.label } });
    }
    return { p, last: v.last };
  }

  /** The prospect row changed first, then its move from where the last one ended (FO-1a's chain trigger checks both). */
  private async moveRow(tx: Tx, ctx: StaffContext, p: Locked, from: string | null, toStageId: string, cause: "PERSON" | "CONVERT", data: Prisma.FoProspectUncheckedUpdateInput) {
    await tx.foProspect.update({ where: { id: p.id }, data: { ...data, stageId: toStageId } });
    await tx.foStageMove.create({ data: { firmId: ctx.firmId, prospectId: p.id, fromStageId: from, toStageId, cause, byActor: actorOf(ctx) } });
  }

  /** FO-4 part 2a: the reasons Mark lost offers (AG-2-44 rule 2; BR-9): the firm's active prospect reasons in their
   *  order, exactly those `lost()` accepts (a merge's reason is never chosen). The lists' editing is FO-2 part 5's. */
  async lostReasons(ctx: StaffContext) {
    return this.db.foReason.findMany({ where: firmScope(ctx.firmId, { kind: "PROSPECT_LOST" as const, active: true, key: { notIn: MERGE_ONLY } }), select: { id: true, key: true, label: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  }

  private idOf(id: string) { return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : notFound("prospect"); }

  /** A person's move (AG-2-26 rules 1-5, 11, 13; BR-8): between open stages of the prospect's own pipeline, with the
   *  version the screen read (stale → 409 naming who moved it). The guards read the stage kind, never its name: never
   *  into WON (Convert or a signature), LOST (Mark lost) or NURTURE (the Park dialog, AG-2-45), never out of WON or LOST. */
  async move(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    const pid = this.idOf(id);
    if (b.cause !== undefined && b.cause !== "PERSON") return problem(422, "Check the details", "cause: a person's move has cause PERSON; the other causes are the system's (a booking, a retainer, Convert).", { code: "INVALID", fields: { cause: "PERSON only." } });
    if (b.version === undefined || b.version === null || !/^\d+$/.test(String(b.version))) return problem(422, "Check the details", "version: the prospect's version as read.", { code: "INVALID", fields: { version: "Required." } });
    const want = typeof b.stageId === "string" && UUID.test(b.stageId) ? b.stageId.toLowerCase() : null;
    const { see } = await this.seer(ctx);
    await this.db.$transaction(async (tx) => {
      const { p, last } = await this.locked(tx, ctx, pid, b.version, see);
      const to = want ? await tx.foStage.findFirst({ where: firmScope(ctx.firmId, { id: want, pipeline: p.type, active: true }) }) : null;
      if (!to) return problem(422, "Check the details", "Choose a stage of this prospect's pipeline.", { code: "INVALID", fields: { stageId: "Choose a stage from the board." } });
      if (p.kind === "WON") return conflict("A won prospect cannot go back. To work again, start a new prospect.", "TERMINAL");   // rule 2
      if (p.kind === "LOST") return conflict("A lost prospect does not move. To work again, start a new prospect.", "TERMINAL");
      if (to.kind === "WON") return problem(422, "Not a person's move", WON_REFUSED, { code: "WON_BY_EVENT" });   // rule 3, BR-8
      if (to.kind === "LOST") return problem(422, "Not a person's move", "Use Mark lost: it asks for the reason (AG-2-44).", { code: "USE_MARK_LOST" });
      if (to.kind === "NURTURE") return problem(422, "Not a person's move", "A prospect is parked through Park, which asks for a date (AG-2-45).", { code: "USE_PARK" });
      if (to.id === p.stage_id) return conflict(`This prospect is already in ${to.label}.`, "SAME_STAGE");
      await this.moveRow(tx, ctx, p, last?.toStageId ?? null, to.id, "PERSON", {});
      await this.audit(tx, ctx, EVENT.PROSPECT_STAGE_MOVED, p.id, `Staff ${ctx.staffId} moved ${p.number} from ${p.key} to ${to.key}.`, { fromStageKey: p.key, toStageKey: to.key, cause: "PERSON" },
        { before: { stage: p.key }, after: { stage: to.key } });
      await this.event(tx, ctx.firmId, EVENT.PROSPECT_STAGE_MOVED, p.id, ProspectMovePayload.parse({ prospectId: p.id, leadId: p.lead_id, type: p.type, fromStageKey: p.key, stageKey: to.key, ownerStaffId: p.owner_staff_id, cause: "PERSON" }));
    });
    return this.read(ctx, pid);
  }

  /** Mark lost (AG-2-44 rules 1-5; BR-9): from an ACTIVE stage or NURTURE, with a reason from the firm's prospect list
   *  (a lead-close reason, another firm's, an inactive one or a merge's → 422) and an optional note; status stays open. */
  async lost(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    const pid = this.idOf(id);
    const reason = typeof b.reasonId === "string" && UUID.test(b.reasonId)
      ? await this.db.foReason.findFirst({ where: firmScope(ctx.firmId, { id: b.reasonId.toLowerCase(), kind: "PROSPECT_LOST" as const, active: true, key: { notIn: MERGE_ONLY } }) }) : null;
    if (!reason) return bad("Choose why the prospect was lost, from the prospect reasons.", "reasonId", "REASON_REQUIRED");
    const note = text(b.note, { field: "note", what: "Note", max: 2000, multiline: true });
    const { see } = await this.seer(ctx);
    await this.db.$transaction(async (tx) => {
      const { p, last } = await this.locked(tx, ctx, pid, b.version, see);
      if (p.kind === "WON") return conflict("A won prospect cannot be marked lost.", "TERMINAL");
      if (p.kind === "LOST") return conflict("This prospect is already lost.", "TERMINAL");
      const to = await tx.foStage.findFirstOrThrow({ where: firmScope(ctx.firmId, { pipeline: p.type, kind: "LOST" as const }) });
      await this.moveRow(tx, ctx, p, last?.toStageId ?? null, to.id, "PERSON", { lostReasonId: reason.id, lostReasonKind: "PROSPECT_LOST", lostNote: note });
      await this.audit(tx, ctx, EVENT.PROSPECT_LOST, p.id, `Staff ${ctx.staffId} marked ${p.number} lost (${reason.key}).`, { fromStageKey: p.key, reasonKey: reason.key, withNote: note !== null },
        { before: { stage: p.key }, after: { stage: to.key, lostReasonKey: reason.key, lostNote: note } });
      await this.event(tx, ctx.firmId, EVENT.PROSPECT_LOST, p.id, ProspectMovePayload.parse({ prospectId: p.id, leadId: p.lead_id, type: p.type, fromStageKey: p.key, stageKey: to.key, ownerStaffId: p.owner_staff_id, cause: "PERSON", lostReasonKey: reason.key }));
    });
    return this.read(ctx, pid);
  }

  /** Convert to client (AG-2-47 rules 1, 3, 5, 16; AG-2-26 rule 3): an ACTIVE or NURTURE prospect becomes WON with
   *  `wonVia` CONVERTED, once (a second → 409); only this prospect changes. Without a signed retainer the answer carries
   *  the "Retainer not signed" warning. `prospect.won` carries the subject part (FO-2b's `wonSubjectOf`). */
  async convert(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    const pid = this.idOf(id);
    const { see } = await this.seer(ctx);
    await this.db.$transaction(async (tx) => {
      await lockPartyOf(tx, ctx.firmId, pid);   // FO-13c (review r4): the party's lock before the prospect's row, as Send and Signed offline take them
      const { p } = await this.locked(tx, ctx, pid, b.version, see);
      if (p.kind === "WON") return conflict("This prospect is already a client.", "ALREADY_WON");
      if (p.kind === "LOST") return conflict("A lost prospect cannot be converted. Start a new prospect.", "TERMINAL");
      // The lock above is held, so the helper's own lock is a re-read; it finds the prospect not yet won.
      await winProspect(tx, ctx, p.id, { via: "CONVERTED", at: new Date(), audit: (w, signed) =>
        this.audit(tx, ctx, EVENT.PROSPECT_WON, w.id, `Staff ${ctx.staffId} converted ${w.number} to a client${signed ? "" : " (retainer not signed)"}.`, { wonVia: "CONVERTED", fromStageKey: w.key, retainerSigned: signed },
          { before: { stage: w.key, wonVia: null }, after: { stage: "WON", wonVia: "CONVERTED" } }) });
    });
    return this.read(ctx, pid);
  }

  /** Undo convert (AG-2-47 rules 18-19; BR-11): only a prospect won by Convert, only while the client is empty, with a
   *  reason. A signed retainer → 409 saying so. The prospect returns to the stage it was in before WON (the Convert move's
   *  start; the pipeline's first open stage if that one was removed); WON is cleared; the reason is kept as an INTERNAL
   *  note, never in the audit line. Cases and invoices hold no prospect link on main yet (see sales/README.md). */
  async undoConvert(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    const pid = this.idOf(id);
    const why = text(b.reason, { field: "reason", what: "Reason", max: 2000, required: true, multiline: true })!;
    const { see } = await this.seer(ctx);
    await this.db.$transaction(async (tx) => {
      const { p, last } = await this.locked(tx, ctx, pid, b.version, see);
      if (p.kind !== "WON") return conflict("Only a converted prospect can be undone.", "NOT_WON");
      if (p.won_via !== "CONVERTED") return conflict("This prospect was won by a signed retainer: Undo convert is not possible.", "SIGNED");
      if (await signedRetainer(tx, ctx.firmId, p.id)) return conflict("The client has a signed retainer: Undo convert is not possible (AG-2-47 rule 18).", "SIGNED");
      const convertMove = last?.cause === "CONVERT" ? last : null;
      const before = convertMove?.fromStageId ? await tx.foStage.findFirst({ where: firmScope(ctx.firmId, { id: convertMove.fromStageId, pipeline: p.type, active: true }) }) : null;
      const to = before ?? (await tx.foStage.findFirstOrThrow({ where: firmScope(ctx.firmId, { pipeline: p.type, kind: "ACTIVE" as const, active: true }), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }));
      await this.moveRow(tx, ctx, p, last?.toStageId ?? null, to.id, "PERSON", { wonVia: null, wonAt: null });
      await tx.foNote.create({ data: { firmId: ctx.firmId, personId: p.subject_person_id ?? p.primary_contact_person_id, prospectId: p.id, visibility: "INTERNAL", text: `Convert undone: ${why}`, byActor: actorOf(ctx) } });
      await this.audit(tx, ctx, EVENT.PROSPECT_UNCONVERTED, p.id, `Staff ${ctx.staffId} undid the Convert of ${p.number}; back in ${to.key}.`, { toStageKey: to.key, earlierStage: before !== null },
        { before: { stage: p.key, wonVia: p.won_via }, after: { stage: to.key, wonVia: null } });
      await this.event(tx, ctx.firmId, EVENT.PROSPECT_UNCONVERTED, p.id, ProspectMovePayload.parse({ prospectId: p.id, leadId: p.lead_id, type: p.type, fromStageKey: p.key, stageKey: to.key, ownerStaffId: p.owner_staff_id, cause: "PERSON" }));
    });
    return this.read(ctx, pid);
  }
}
