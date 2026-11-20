// FO-13c (P-579; brief lead-b-briefs/FO-13c.md, which wins; BACKLOG FO-13c): the conflict-of-interest check's API on
// FO-13's table fo_conflict_check (front-office-compliance.prisma; migration 20261115013000_fo13_compliance_tables, whose
// checks and trigger decide the write). A check is for a prospect's party (its person, or its company for Corporate) and
// searches that party's own current name, email and phone over the firm's people (leads, prospects and clients, company
// contacts) and companies by FO-9a's match (its definer functions fo_sales_person_matches / fo_sales_company_matches and
// ports/matching.ts), and over other parties on cases through the case side's PartySearchPort (contract v0.1 §3.1).
// Until CS-S1b puts the real port on main the feature runs with none: the answer says other parties on cases are not
// searched yet. Hidden matches (front-office records the checker may not open, plus the port's hidden_count) are counted,
// never named; while any exist a check may not say NO_CONFLICT until another staff member who may see them confirms.
// Code SOR/2022-128 s. 5, 15, 16, 24(3)(o), 35(1)(c), read from trace t8 §1b (current to 2026-10-19, read 16 Nov 2026 by
// Lead B); the College's own pages are out of a cloud lane's reach (P-601 (5)). Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { ConflictCheckedPayload, EVENT } from "../../../../../ports/events.ts";
import { matchScore, NAME_THRESHOLD, normaliseEmail, personNameKey, type MatchReason } from "../../../../../ports/matching.ts";
import type { PartySearchPort } from "../../../../../ports/party-search.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../../platform/identity/keys.ts";
import { phoneE164Exact } from "../../duplicates/phone.ts";
import { normaliseCompanyName, seesCompany, type Seer } from "../../sales/corporate/match.ts";
import { actorOf, visibilityOf } from "../../sales/common.ts";
import { partyOf, termsOf, type Party, type Terms } from "./gate.ts";

type Tx = Prisma.TransactionClient;
type Clock = { now(): number };
const RESULTS = ["NO_CONFLICT", "POTENTIAL_CONFLICT", "CONFLICT_CANNOT_ACT"] as const;
type Result = (typeof RESULTS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NOT_SEARCHED = "Other parties on cases are not searched yet (the case side's party search is not connected).";
export const HIDDEN_LINE = "Matches with records you cannot open: a manager who may see them confirms this check.";
const bad = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });
const notFound = (what = "prospect"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const forbidden = (detail: string): never => problem(403, "Not allowed", detail, { code: "FORBIDDEN" });
/** Stored match, FO-13's shape (fo_compliance_matches_ok). */
type StoredMatch = { source: "FRONT_OFFICE" | "CASE"; kind: string; recordId: string; displayName?: string; matchedOn: string[]; score?: number; caseId?: string; caseNumber?: string; clientId?: string; roleOnCase?: string };
type PersonRow = { id: string; given_names: string | null; family_name: string | null; by_email: boolean; by_phone: boolean; sim: number; seen: boolean };

/** Who may see every front-office match (contract v0.1 §3.1 "a person who may see the matches": a firm admin, or one who
 *  sees all records): the firm's Owner or Admin, or "everyone sees all" with agent/prospect:view.all. */
const seesEveryMatch = (ctx: StaffContext, vis: { seesAll: boolean }) => vis.seesAll || ctx.roles.some((r) => r === "OWNER" || r === "ADMIN");

export class ConflictChecks {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock, private readonly parties: PartySearchPort | null = null, private readonly audit: AuditPort<Tx> = auditEvent) {}

  /** The prospect and its party, when the checker may see the prospect (its owner, or one who sees all); 404 otherwise. */
  private async engagement(ctx: StaffContext, prospectId: unknown) {
    if (typeof prospectId !== "string" || !UUID.test(prospectId)) return bad("prospectId", "prospectId: the prospect the check is for (a uuid).");
    const p = await this.db.foProspect.findFirst({ where: firmScope(ctx.firmId, { id: prospectId.toLowerCase() }), select: { id: true, ownerStaffId: true, wonVia: true } });
    if (!p || (!seesEveryMatch(ctx, await visibilityOf(this.db, ctx)) && p.ownerStaffId !== ctx.staffId)) return notFound();
    const party = await partyOf(this.db, ctx.firmId, p.id) ?? notFound("party on this prospect");
    return { prospect: p, party };
  }

  /** The search, read-only: the visible matches in FO-13's shape and how many the checker may not see. */
  private async search(ctx: StaffContext, party: Party, t: Terms) {
    if (!t.name && !t.email && !t.phone) problem(422, "Check the details", "The client has no name, email or phone to search.", { code: "NOTHING_TO_SEARCH" });
    const v0 = await visibilityOf(this.db, ctx), every = seesEveryMatch(ctx, v0), vis = every ? { seesAll: true, seesUnassigned: true } : v0, out: StoredMatch[] = [];
    let hidden = 0;
    const email = normaliseEmail(t.email), phone = t.phone ? phoneE164Exact(t.phone) : null;
    if (party.kind === "PERSON") {
      const name = personNameKey(t.name, "");
      const rows = (await this.db.$queryRaw<PersonRow[]>`
        select id::text, given_names, family_name, by_email, by_phone, sim, seen
          from fo_sales_person_matches(${ctx.firmId}::uuid, ${email}::text, ${phone ? [phone] : []}::text[], ${name}::text, ${ctx.staffId}::uuid,
                                       ${vis.seesAll}, ${vis.seesUnassigned}, ${NAME_THRESHOLD}::real, 50)`).filter((r) => r.id !== party.id && (r.by_email || r.by_phone || r.sim >= NAME_THRESHOLD));
      hidden += rows.filter((r) => !r.seen).length;
      const seen = rows.filter((r) => r.seen), ids = seen.map((r) => r.id);
      const pros = await this.db.foProspect.findMany({ where: firmScope(ctx.firmId, { OR: [{ subjectPersonId: { in: ids } }, { primaryContactPersonId: { in: ids } }] }), select: { subjectPersonId: true, primaryContactPersonId: true, stage: { select: { kind: true } } } });
      const contacts = new Set((await this.db.foCompanyContact.findMany({ where: firmScope(ctx.firmId, { personId: { in: ids } }), select: { personId: true } })).map((c) => c.personId));
      const leads = new Set((await this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: { in: ids } }), select: { personId: true } })).map((l) => l.personId));
      for (const r of seen) {
        const mine = pros.filter((x) => x.subjectPersonId === r.id || x.primaryContactPersonId === r.id);
        const [kind, rel] = mine.some((x) => x.stage.kind === "WON") ? ["PROSPECT", "client"] : mine.length ? ["PROSPECT", "prospect"] : contacts.has(r.id) ? ["COMPANY_CONTACT", "company contact"] : leads.has(r.id) ? ["LEAD", "lead"] : ["PERSON", "person"];
        const reasons: MatchReason[] = [...(r.by_email ? [{ key: "EMAIL" as const }] : []), ...(r.by_phone ? [{ key: "PHONE" as const }] : []), ...(r.sim >= NAME_THRESHOLD ? [{ key: "NAME" as const, similarity: Math.min(1, r.sim) }] : [])];
        const nm = [r.given_names, r.family_name].filter(Boolean).join(" ") || "(no name)";
        out.push({ source: "FRONT_OFFICE", kind, recordId: r.id, displayName: `${nm.slice(0, 280)} · ${rel}`, matchedOn: reasons.map((x) => x.key), score: matchScore(reasons) / 100 });
      }
    } else if (t.name) {
      const rows = (await this.db.$queryRaw<{ id: string; operating_name: string; sim: number }[]>`
        select id::text, operating_name, sim from fo_sales_company_matches(${ctx.firmId}::uuid, ${normaliseCompanyName(t.name)}::text, ${NAME_THRESHOLD}::real, 50)`).filter((r) => r.id !== party.id && r.sim >= NAME_THRESHOLD);
      const seer: Seer = { see: (o) => vis.seesAll || o === ctx.staffId, seesAll: vis.seesAll, actor: actorOf(ctx) };
      const seen = new Set((await this.db.foCompany.findMany({ where: firmScope(ctx.firmId, { id: { in: rows.map((r) => r.id) } }), select: { id: true, createdBy: true, prospects: { select: { ownerStaffId: true } } } })).filter((c) => seesCompany(seer, c)).map((c) => c.id));
      hidden += rows.filter((r) => !seen.has(r.id)).length;
      for (const r of rows.filter((x) => seen.has(x.id))) out.push({ source: "FRONT_OFFICE", kind: "COMPANY", recordId: r.id, displayName: r.operating_name.slice(0, 300), matchedOn: ["NAME"], score: Math.floor(Math.min(1, r.sim) * 10000) / 10000 });
    }
    if (this.parties) {
      const c = await this.parties.search({ firmId: ctx.firmId, staffId: ctx.staffId }, { name: t.name, email, phone });
      hidden += c.hidden_count;
      for (const m of c.matches) out.push({ source: "CASE", ...m, score: Math.floor(m.score * 10000) / 10000 });
    }
    return { matches: out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), hidden, scope: this.parties ? null : NOT_SEARCHED };
  }

  /** What a check shows: the searched terms, the visible matches grouped by case for CASE ones, never the hidden ones. */
  /** M2: the names are shown to the checker and to a reader who sees every match; anyone else reads the check with its
   *  matches counted as hidden (the records' visibility may differ from the checker's). */
  private view(c: Prisma.FoConflictCheckGetPayload<object>, ctx: StaffContext, every: boolean) {
    const all = c.matches as StoredMatch[], named = every || c.checkedBy === ctx.staffId || c.confirmedBy === ctx.staffId;
    const matches = named ? all : [], hiddenCount = c.hiddenCount + (named ? 0 : all.length);
    return {
      id: c.id, prospectId: c.prospectId, partyKind: c.partyKind, personId: c.personId, companyId: c.companyId,
      searched: { name: c.searchedName, email: c.searchedEmail, phone: c.searchedPhone }, matches,
      byCase: Object.values(matches.filter((m) => m.source === "CASE").reduce<Record<string, { caseId: string; caseNumber: string | null; parties: StoredMatch[] }>>((a, m) => {
        (a[m.caseId!] ??= { caseId: m.caseId!, caseNumber: m.caseNumber ?? null, parties: [] }).parties.push(m); return a;
      }, {})),
      hiddenCount, hiddenLine: hiddenCount ? HIDDEN_LINE : null, needsConfirmation: c.hiddenCount > 0 && !c.confirmedBy,
      result: c.result, disclosureText: c.disclosureText, writtenConsentRef: c.writtenConsentRef,
      checkedBy: c.checkedBy, checkedAt: c.checkedAt, confirmedBy: c.confirmedBy, confirmedAt: c.confirmedAt,
    };
  }

  /** The result and disclosure of a body: POTENTIAL_CONFLICT needs the disclosure the client reads (s. 24(3)(o)); no other result carries one. */
  private outcome(b: Record<string, unknown>, required: boolean): { result: Result | null; disclosureText: string | null } {
    if (b.result === undefined || b.result === null) return required ? bad("result", `The result is one of ${RESULTS.join(", ")}.`) : { result: null, disclosureText: b.disclosureText ? bad("disclosureText", "A disclosure belongs to a POTENTIAL_CONFLICT result.") : null };
    const result = typeof b.result === "string" && (RESULTS as readonly string[]).includes(b.result) ? (b.result as Result) : bad("result", `The result is one of ${RESULTS.join(", ")}.`);
    const d = typeof b.disclosureText === "string" && b.disclosureText.trim() ? b.disclosureText.trim() : null;
    if (b.disclosureText !== undefined && b.disclosureText !== null && typeof b.disclosureText !== "string") bad("disclosureText", "The disclosure is text.");
    if (result === "POTENTIAL_CONFLICT" && !d) bad("disclosureText", "A potential conflict needs the disclosure text the client will read in the retainer (Code s. 15(1), 24(3)(o)).");
    if (result !== "POTENTIAL_CONFLICT" && d) bad("disclosureText", "A disclosure belongs to a POTENTIAL_CONFLICT result.");
    if (d && ([...d].length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(d))) bad("disclosureText", "The disclosure is at most 10,000 characters, with no control characters.");
    return { result, disclosureText: d };
  }

  /** Preview: what a check would find now (writes nothing). */
  async preview(ctx: StaffContext, body: Record<string, unknown>) {
    const { party } = await this.engagement(ctx, body?.prospectId);
    const t = await termsOf(this.db, ctx.firmId, party), s = await this.search(ctx, party, t);
    return { searched: t, matches: s.matches, hiddenCount: s.hidden, hiddenLine: s.hidden ? HIDDEN_LINE : null, scope: s.scope };
  }

  /** Runs and records one check (201): the search again, server-side, and the result in the same insert. Idempotent by
   *  `requestId` (the check's id): a replay by the same person for the same prospect returns the saved check. */
  async record(ctx: StaffContext, body: Record<string, unknown>, retried = false) {
    const b = body ?? {};
    const id = typeof b.requestId === "string" && UUID.test(b.requestId.trim()) ? b.requestId.trim().toLowerCase() : bad("requestId", "requestId: a uuid the screen makes once per check.");
    const { prospect, party } = await this.engagement(ctx, b.prospectId);
    const had = await this.db.foConflictCheck.findFirst({ where: firmScope(ctx.firmId, { id }) });
    if (had) return had.checkedBy === ctx.staffId && had.prospectId === prospect.id ? { ...this.view(had, ctx, false), scope: this.parties ? null : NOT_SEARCHED } : problem(409, "Already used", "This request was already used. Start a new check.", { code: "REQUEST_REUSED" });
    const t = await termsOf(this.db, ctx.firmId, party), s = await this.search(ctx, party, t);
    const o = this.outcome(b, s.hidden === 0);
    // M1 (brief): with hidden matches the check is written with no result; the confirmer, who sees them, gives it.
    if (s.hidden && o.result !== null) problem(409, "Needs a confirmation", `${HIDDEN_LINE} Record the check without a result.`, { code: "NEEDS_CONFIRMATION" });
    const now = new Date(this.clock.now());
    try {
      await this.db.$transaction(async (tx) => {
        await tx.foConflictCheck.create({ data: { id, firmId: ctx.firmId, partyKind: party.kind, personId: party.kind === "PERSON" ? party.id : null, companyId: party.kind === "COMPANY" ? party.id : null, prospectId: prospect.id,
          searchedName: t.name, searchedEmail: t.email, searchedPhone: t.phone, matches: s.matches as Prisma.InputJsonValue, hiddenCount: s.hidden, result: o.result, disclosureText: o.disclosureText, checkedBy: ctx.staffId, checkedAt: now } });
        await this.written(tx, ctx, "conflict.checked", id, `Conflict check recorded (${s.matches.length} match${s.matches.length === 1 ? "" : "es"}${s.hidden ? ", some hidden" : ""}; ${o.result ?? "waiting for a confirmation"})`,
          { checkId: id, prospectId: prospect.id, partyKind: party.kind, personId: party.kind === "PERSON" ? party.id : null, companyId: party.kind === "COMPANY" ? party.id : null, result: o.result, hiddenMatches: s.hidden > 0, confirmed: false, clientAlready: prospect.wonVia !== null });
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as { code?: unknown })?.code === "P2002" && !retried) return this.record(ctx, b, true);   // a concurrent replay won the id: answer as a replay, once
      throw e;
    }
    const c = await this.db.foConflictCheck.findFirstOrThrow({ where: firmScope(ctx.firmId, { id }) });
    return { ...this.view(c, ctx, false), scope: s.scope };
  }

  /** Confirms a check with hidden matches: another active staff member who may see them (sees every record, or the
   *  firm's Owner or Admin: contract v0.1 §3.1 FILE_OWNER / FIRM_ADMIN), once; gives the result if the check has none. */
  async confirm(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound("check");
    const c = await this.db.foConflictCheck.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase() }) }) ?? notFound("check");
    if (c.hiddenCount === 0) problem(409, "Not possible now", "This check has no hidden matches: there is nothing to confirm.", { code: "NOTHING_TO_CONFIRM" });
    if (c.confirmedBy) problem(409, "Not possible now", "This check is already confirmed.", { code: "ALREADY_CONFIRMED" });
    if (c.checkedBy === ctx.staffId) forbidden("Another staff member who may see the hidden matches confirms a check, never its checker.");
    if (!seesEveryMatch(ctx, await visibilityOf(this.db, ctx))) forbidden("Only a staff member who may see every record, or the firm's Owner or Admin, confirms a check with hidden matches.");
    // M3: the confirmer sees the matches: the same terms searched again with their visibility hide nothing.
    const party = { kind: c.partyKind, id: (c.personId ?? c.companyId)! } as Party;
    const seen = await this.search(ctx, party, { name: c.searchedName, email: c.searchedEmail, phone: c.searchedPhone });
    if (seen.hidden) forbidden("Some of this check's matches are hidden from you too (on cases you cannot open): a person who sees them confirms it.");
    const o = this.outcome(body ?? {}, c.result === null);
    if (c.result !== null && o.result !== null && o.result !== c.result) problem(409, "Not possible now", `This check already says ${c.result}; it never changes. Record a new check instead.`, { code: "RESULT_FIXED" });
    const now = new Date(this.clock.now()), won = c.prospectId ? (await this.db.foProspect.findFirst({ where: firmScope(ctx.firmId, { id: c.prospectId }), select: { wonVia: true } }))?.wonVia ?? null : null;
    await this.db.$transaction(async (tx) => {
      const n = await tx.foConflictCheck.updateMany({ where: firmScope(ctx.firmId, { id: c.id, confirmedBy: null }), data: { confirmedBy: ctx.staffId, confirmedAt: now, ...(c.result === null ? { result: o.result, disclosureText: o.disclosureText } : {}) } });
      if (n.count !== 1) problem(409, "Not possible now", "This check is already confirmed.", { code: "ALREADY_CONFIRMED" });
      await this.written(tx, ctx, "conflict.confirmed", c.id, `Conflict check confirmed (${c.result ?? o.result})`,
        { checkId: c.id, prospectId: c.prospectId!, partyKind: c.partyKind, personId: c.personId, companyId: c.companyId, result: c.result ?? o.result, hiddenMatches: true, confirmed: true, clientAlready: won !== null });
    });
    return { ...this.view(await this.db.foConflictCheck.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: c.id }) }), ctx, true), matchesNow: seen.matches };
  }

  /** The prospect's party's checks, newest first (on the person or company, whichever engagement they were for). */
  async list(ctx: StaffContext, prospectId: string) {
    const { party } = await this.engagement(ctx, prospectId);
    const rows = await this.db.foConflictCheck.findMany({ where: firmScope(ctx.firmId, party.kind === "PERSON" ? { personId: party.id } : { companyId: party.id }), orderBy: [{ checkedAt: "desc" }, { id: "desc" }] });
    const every = seesEveryMatch(ctx, await visibilityOf(this.db, ctx));
    return { checks: rows.map((r) => this.view(r, ctx, every)), scope: this.parties ? null : NOT_SEARCHED };
  }

  /** One audit line (ids and the result, never a searched value), then `conflict.checked` last (contracts §0.5). */
  private async written(tx: Tx, ctx: StaffContext, action: string, id: string, summary: string, payload: ConflictCheckedPayload) {
    const p = ConflictCheckedPayload.parse(payload);
    await this.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action, entity: "fo_conflict_check", entityKey: id, summary, detail: { checkId: p.checkId, prospectId: p.prospectId, result: p.result, hiddenMatches: p.hiddenMatches, clientAlready: p.clientAlready } });
    await tx.moduleEvent.create({ data: { firmId: ctx.firmId, type: EVENT.CONFLICT_CHECKED, subjectId: id, payload: p } });
  }
}
