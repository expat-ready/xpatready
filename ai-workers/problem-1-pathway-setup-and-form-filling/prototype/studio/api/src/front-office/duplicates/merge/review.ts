// FO-9b part 2 (BACKLOG row FO-9b; brief design/lead-b-briefs/FO-9b.md "Part 2"; P-574 (2); AG-2-16, AG-2-78, AG-2-96;
// concept screens/FO-9s/concept.md r3 BR-6, BR-7, BR-10, BR-11, M6-M8): the duplicate review list, the safe pair, the
// merge by itself and the guided merge routes' service.
// * A pair is written when a new person arrives with a match (notePairs, at the arrival path; FO-9a's keys and score),
//   once per pair (the pair in id order, unique), with its score, reasons and when it was first seen.
// * Safe pair (whyNotSafe, P-574 (2) "automatic merge only for leads and prospects with no case, document, invoice or
//   money"), fail-closed: an exact email or phone match, and for both people no case-side client row (case_client;
//   a failed read counts as a case), no retainer of any status and no identity check holding a copy (the rows that
//   name stored files: FilesPort has no list method), and ClientMoneyPort.hasMoney false (invoice, trust request or
//   entry, credit entry, a tax treatment, a trust entry naming them as payee). Only then mergeIfSafe merges, once,
//   `automatic: true`, by `system:fo-duplicates`; the newer record goes into the older.
// * Keys: the list, the Merged tab and Keep separate need REVIEW_KEY; preview, merge and Undo need MERGE_KEY
//   (AG-2-16 §8, AG-2-68 §8; seeded keys, concept M5). A pair is shown and acted on only when the viewer may open both
//   people (FO-9a's rule: one of their leads the viewer sees); else the one not-found (BR-6, DW8).
// * A pair where either person is a case-side client is listed with needsCaseSide and its merge is refused here (BR-7).
import type { PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { MatchReason, matchScore } from "../../../../../ports/matching.ts";
import { MERGE_FIELDS, MERGE_KEY, PersonMergeRefused, resolvePicks, type FieldPick } from "../../../../../ports/person-merge.ts";
import { ClientMoney } from "../../../client-money/port.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../../platform/identity/keys.ts";
import { visibilityOf, type Tx } from "../../sales/common.ts";
import { wonDuplicates } from "../service.ts";
import { MergeBusy, mergeRecords, unmergeRecords, type MergePorts } from "./service.ts";

/** The list, the Merged tab and Keep separate (concept r3 BR-6, M5: AG-2-68 §8's seeded key). */
export const REVIEW_KEY = "agent/prospect:edit";
export { MERGE_KEY };
export const SYSTEM_ACTOR = "system:fo-duplicates";
export const CASE_SIDE_LINE = "This person has a case; merge them from the client record.";
export type Unsafe = "NOT_EXACT" | "CASE" | "CASE_UNKNOWN" | "DOCUMENT" | "MONEY";

const notFound = (): never => problem(404, "Not found", "No such pair in your firm.", { code: "NOT_FOUND" });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
const pairOf = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? [a.toLowerCase(), b.toLowerCase()] : [b.toLowerCase(), a.toLowerCase()]) as [string, string];

/** Writes every pair the new person makes with a live person of the firm (no-op for a pair already listed). */
export async function notePairs(tx: Tx, firmId: string, personId: string): Promise<string[]> {
  const found = await wonDuplicates(tx, firmId, { subject: "PERSON", personId });
  const ids: string[] = [];
  for (const m of found.matches) {
    const [lo, hi] = pairOf(personId, m.id);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      insert into "fo_dup_review" ("firm_id", "kind", "low_id", "high_id", "score", "reasons")
      values (${firmId}::uuid, 'PERSON', ${lo}::uuid, ${hi}::uuid, ${m.score}, ${JSON.stringify(m.reasons)}::jsonb)
      on conflict ("firm_id", "low_id", "high_id") do nothing returning "id"::text as id`;
    if (row) ids.push(row.id);
  }
  return ids;
}

/** Whether either person is a case-side client (case_client.fo_person_id, CS-K1). null: the read failed (fail-closed). */
async function caseOf(tx: Tx, ids: string[]): Promise<Set<string> | null> {
  await tx.$executeRaw`savepoint fo_dup_case`;
  try {
    const rows = await tx.$queryRaw<{ id: string }[]>`select distinct "fo_person_id"::text as id from "case_client" where "fo_person_id" = any(${ids}::uuid[])`;
    await tx.$executeRaw`release savepoint fo_dup_case`;
    return new Set(rows.map((r) => r.id));
  } catch { await tx.$executeRaw`rollback to savepoint fo_dup_case`; return null; }
}

/** Why the pair may not merge by itself (empty: safe). Reads in `tx`, so it sees what the merge will see. */
export async function whyNotSafe(tx: Tx, firmId: string, ids: string[], reasons: MatchReason[]): Promise<Unsafe[]> {
  const out = new Set<Unsafe>();
  if (!reasons.some((r) => r.key === "EMAIL" || r.key === "PHONE")) out.add("NOT_EXACT");
  const cases = await caseOf(tx, ids);
  if (cases === null) out.add("CASE_UNKNOWN"); else if (cases.size) out.add("CASE");
  const [docs] = await tx.$queryRaw<{ n: number }[]>`
    select ((select count(*) from "fo_retainer" where "firm_id" = ${firmId}::uuid and "signer_person_id" = any(${ids}::uuid[]))
          + (select count(*) from "fo_identity_check" where "firm_id" = ${firmId}::uuid and "person_id" = any(${ids}::uuid[]) and "copy_file_key" is not null))::int as n`;
  if (docs.n) out.add("DOCUMENT");
  const money = new ClientMoney(tx as unknown as PrismaClient);
  for (const id of ids) if (await money.hasMoney(firmId, { personId: id })) { out.add("MONEY"); break; }
  return [...out];
}

const systemCtx = (firmId: string, firmKey = ""): StaffContext => ({ staffId: "00000000-0000-0000-0000-000000000000", firmId, firmKey, roles: [], keys: [MERGE_KEY], duties: [], authTime: 0, via: "local" });

/** P-574 (2): merges an OPEN pair by itself when it is safe (the newer record into the older), once. */
export async function mergeIfSafe(tx: Tx, firmId: string, pairId: string, ports: MergePorts): Promise<{ mergeRef: string } | { refused: Unsafe[] }> {
  const [p] = await tx.$queryRaw<{ low_id: string; high_id: string; reasons: MatchReason[]; status: string }[]>`
    select "low_id"::text, "high_id"::text, "reasons", "status"::text from "fo_dup_review" where "firm_id" = ${firmId}::uuid and "id" = ${pairId}::uuid for update`;
  if (!p || p.status !== "OPEN") return { refused: [] };
  const why = await whyNotSafe(tx, firmId, [p.low_id, p.high_id], p.reasons);
  if (why.length) return { refused: why };
  const people = await tx.foPerson.findMany({ where: firmScope(firmId, { id: { in: [p.low_id, p.high_id] } }), select: { id: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (people.length !== 2) return { refused: [] };
  const { merge_ref } = await mergeRecords(tx, systemCtx(firmId), { kind: "PERSON", survivor_fo_id: people[0].id, loser_fo_id: people[1].id, reason: "Merged by itself: exact match, no case, document or money (P-574 (2))." }, ports, { automatic: true });
  await tx.foDupReview.updateMany({ where: firmScope(firmId, { id: pairId }), data: { status: "MERGED", mergeId: merge_ref, decidedBy: SYSTEM_ACTOR, decidedAt: new Date() } });
  return { mergeRef: merge_ref };
}

/** The people of `ids` the viewer may open (FO-9a's rule: a lead of theirs the viewer sees; an inactive owner = unassigned). */
async function seen(tx: Tx | PrismaClient, ctx: StaffContext, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const v = await visibilityOf(tx, ctx);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    select distinct l."person_id"::text as id from "fo_lead" l left join "platform_staff" s on s."firm_id" = l."firm_id" and s."id" = l."owner_staff_id"
     where l."firm_id" = ${ctx.firmId}::uuid and l."person_id" = any(${ids}::uuid[])
       and (${v.seesAll} or (s."status" = 'ACTIVE' and l."owner_staff_id" = ${ctx.staffId}::uuid) or (${v.seesUnassigned} and (l."owner_staff_id" is null or s."status" is distinct from 'ACTIVE')))`;
  return new Set(rows.map((r) => r.id));
}

/** Whether the viewer may open every one of `ids` (repeats allowed: a merged pair resolves to one survivor). */
const sees = async (tx: Tx | PrismaClient, ctx: StaffContext, ids: string[]) => { const s = await seen(tx, ctx, ids); return ids.every((id) => s.has(id)); };

type PersonCard = { personId: string; name: string; lead: string | null; mergedIntoId: string | null };
async function cards(tx: Tx | PrismaClient, firmId: string, ids: string[]): Promise<Map<string, PersonCard>> {
  const people = await tx.foPerson.findMany({ where: firmScope(firmId, { id: { in: ids } }), select: { id: true, givenNames: true, familyName: true, mergedIntoId: true } });
  const leads = await tx.foLead.findMany({ where: firmScope(firmId, { personId: { in: ids } }), select: { personId: true, number: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  return new Map(people.map((p) => [p.id, { personId: p.id, name: [p.givenNames, p.familyName].filter(Boolean).join(" ") || "(no name)", lead: leads.find((l) => l.personId === p.id)?.number ?? null, mergedIntoId: p.mergedIntoId }]));
}

const asRefusal = (e: unknown): never => {
  if (e instanceof PersonMergeRefused) problem(e.status, e.status === 404 ? "Not found" : e.status === 403 ? "Not allowed" : "Not possible now", e.message, { code: e.code });
  if (e instanceof MergeBusy) problem(409, "Busy", "These records were being changed by someone else at the same moment. Nothing was changed. Try again.", { code: "BUSY" });
  throw e;
};

export class DuplicateReview {
  constructor(private readonly db: PrismaClient, private readonly ports: MergePorts & { audit: AuditPort<Tx> }) {}

  /** A pair the viewer may act on, locked in `tx`, or the one not-found. */
  private async pair(tx: Tx, ctx: StaffContext, id: string) {
    const [p] = await tx.$queryRaw<{ id: string; low_id: string; high_id: string; status: string; merge_id: string | null; reasons: MatchReason[] }[]>`
      select "id"::text, "low_id"::text, "high_id"::text, "status"::text, "merge_id"::text, "reasons" from "fo_dup_review" where "firm_id" = ${ctx.firmId}::uuid and "id" = ${id}::uuid for update`;
    if (!p) return notFound();
    // A merged-away side is seen through its survivor (its leads moved there), so a decided pair answers 409, not 404.
    const live = await tx.foPerson.findMany({ where: firmScope(ctx.firmId, { id: { in: [p.low_id, p.high_id] } }), select: { id: true, mergedIntoId: true } });
    const ids = [p.low_id, p.high_id].map((id) => live.find((x) => x.id === id)?.mergedIntoId ?? id);
    if (!(await sees(tx, ctx, ids))) return notFound();
    return p;
  }

  async list(ctx: StaffContext, status: "OPEN" | "MERGED" | "KEPT_SEPARATE" = "OPEN") {
    const rows = await this.db.foDupReview.findMany({ where: firmScope(ctx.firmId, { status }), orderBy: [{ score: "desc" }, { firstSeenAt: "asc" }, { id: "asc" }], take: 500 });
    const ids = [...new Set(rows.flatMap((r) => [r.lowId, r.highId]))];
    const card = await cards(this.db, ctx.firmId, ids), via = (id: string) => card.get(id)?.mergedIntoId ?? id;   // a merged-away side is seen through its survivor
    const [see, cases] = await Promise.all([seen(this.db, ctx, [...new Set(ids.map(via))]), this.db.$transaction((tx) => caseOf(tx, ids))]);
    const items = rows.filter((r) => see.has(via(r.lowId)) && see.has(via(r.highId)) && (status !== "OPEN" || (!card.get(r.lowId)?.mergedIntoId && !card.get(r.highId)?.mergedIntoId)))
      .map((r) => ({ id: r.id, kind: r.kind, people: [card.get(r.lowId)!, card.get(r.highId)!].map(({ mergedIntoId: _, ...c }) => c), score: r.score, reasons: r.reasons, firstSeenAt: r.firstSeenAt, status: r.status,
        decidedAt: r.decidedAt, automatic: r.decidedBy === SYSTEM_ACTOR, mergeRef: r.mergeId, needsCaseSide: cases === null || cases.has(r.lowId) || cases.has(r.highId) }));
    return { items, openCount: status === "OPEN" ? items.length : undefined };
  }

  /** The Merged tab (concept M6): every merge whose surviving record the viewer may open, newest first. */
  async merges(ctx: StaffContext) {
    const rows = await this.db.foDupMerge.findMany({ where: firmScope(ctx.firmId, { kind: "PERSON" as const }), orderBy: [{ at: "desc" }, { id: "asc" }], take: 500 });
    const see = await seen(this.db, ctx, [...new Set(rows.flatMap((m) => [m.survivorId, m.loserId]))]);
    const card = await cards(this.db, ctx.firmId, [...new Set(rows.flatMap((m) => [m.survivorId, m.loserId]))]);
    return { items: rows.filter((m) => see.has(m.survivorId) && (m.undoneAt === null || see.has(m.loserId))).map((m) => ({
      id: m.id, mergeRef: m.id, kind: m.kind, survivor: { personId: m.survivorId, name: card.get(m.survivorId)?.name ?? "" }, loser: { personId: m.loserId, name: card.get(m.loserId)?.name ?? "" },
      automatic: m.automatic, by: m.by, at: m.at, undoneAt: m.undoneAt })) };
  }

  /** Both values of every field, the default pick, what will move, each side's updatedAt (concept M7). */
  async preview(ctx: StaffContext, id: string, survivorId: string) {
    return this.db.$transaction(async (tx) => {
      const p = await this.pair(tx, ctx, id);
      if (p.status !== "OPEN") conflict("This pair was already decided.", "DECIDED");
      const s = survivorId.toLowerCase(), l = s === p.low_id ? p.high_id : s === p.high_id ? p.low_id : null;
      if (!l) return problem(422, "Check the details", "survivorId: Pick one of the pair's two people. Nothing was saved.", { code: "INVALID", fields: { survivorId: "Pick one of the pair's two people." } });
      const rows = await tx.foPerson.findMany({ where: firmScope(ctx.firmId, { id: { in: [s, l] } }) });
      const S = rows.find((r) => r.id === s)!, L = rows.find((r) => r.id === l)!;
      const val = (r: typeof S, f: string) => (r as unknown as Record<string, unknown>)[f] ?? null;
      const picks = resolvePicks("PERSON", { fields: Object.fromEntries(MERGE_FIELDS.PERSON.map((f) => [f, val(S, f)])), updatedAt: S.updatedAt }, { fields: Object.fromEntries(MERGE_FIELDS.PERSON.map((f) => [f, val(L, f)])), updatedAt: L.updatedAt });
      const n = async (t: string) => Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from "${t}" where "firm_id" = $1::uuid and "person_id" = $2::uuid`, ctx.firmId, l))[0].n);
      const cases = await caseOf(tx, [s, l]);
      return { pairId: p.id, survivorId: s, loserId: l, needsCaseSide: cases === null || cases.size > 0,
        fields: MERGE_FIELDS.PERSON.map((f) => ({ field: f, survivor: val(S, f), loser: val(L, f), pick: picks[f] as FieldPick })),
        moves: { leads: await n("fo_lead"), notes: await n("fo_note"), calls: await n("fo_call"), bookings: await n("fo_booking") },
        updatedAt: { survivor: S.updatedAt, loser: L.updatedAt } };
    });
  }

  /** The guided merge (P-574 (2)): the viewer picks the survivor and, field by field, the values. */
  async merge(ctx: StaffContext, id: string, body: { survivorId: string; choices?: Record<string, FieldPick>; reason?: string }) {
    try {
      return await this.db.$transaction(async (tx) => {
        const p = await this.pair(tx, ctx, id);
        if (p.status !== "OPEN") conflict("This pair was already decided.", "DECIDED");
        const s = body.survivorId.toLowerCase(), l = s === p.low_id ? p.high_id : s === p.high_id ? p.low_id : null;
        if (!l) return problem(422, "Check the details", "survivorId: Pick one of the pair's two people. Nothing was saved.", { code: "INVALID", fields: { survivorId: "Pick one of the pair's two people." } });
        const cases = await caseOf(tx, [s, l]);
        if (cases === null || cases.size) conflict(CASE_SIDE_LINE, "NEEDS_CASE_SIDE");
        const { merge_ref } = await mergeRecords(tx, ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l, ...(body.choices ? { choices: body.choices } : {}), ...(body.reason ? { reason: body.reason } : {}) }, this.ports);
        await tx.foDupReview.updateMany({ where: firmScope(ctx.firmId, { id: p.id }), data: { status: "MERGED", mergeId: merge_ref, decidedBy: `staff:${ctx.staffId}`, decidedAt: new Date() } });
        return { mergeRef: merge_ref };
      });
    } catch (e) { return asRefusal(e); }
  }

  /** Undo from the Merged tab (BR-10): part 1's Undo, and the pair opens again. */
  async undo(ctx: StaffContext, mergeRef: string) {
    try {
      return await this.db.$transaction(async (tx) => {
        const m = await tx.foDupMerge.findFirst({ where: firmScope(ctx.firmId, { id: mergeRef, kind: "PERSON" as const }), select: { survivorId: true } });
        if (!m || !(await seen(tx, ctx, [m.survivorId])).size) return problem(404, "Not found", "No such merge in your firm.", { code: "NOT_FOUND" });
        const out = await unmergeRecords(tx, ctx, mergeRef, this.ports);
        await tx.foDupReview.updateMany({ where: firmScope(ctx.firmId, { mergeId: mergeRef }), data: { status: "OPEN", mergeId: null, decidedBy: null, decidedAt: null } });
        return out;
      });
    } catch (e) { return asRefusal(e); }
  }

  /** Keep separate (BR-11): the pair is decided, and each person's possible-match flag naming the other is cleared. */
  async keepSeparate(ctx: StaffContext, id: string) {
    return this.db.$transaction(async (tx) => {
      const p = await this.pair(tx, ctx, id);
      if (p.status !== "OPEN") conflict("This pair was already decided.", "DECIDED");
      await tx.foDupReview.updateMany({ where: firmScope(ctx.firmId, { id: p.id }), data: { status: "KEPT_SEPARATE", decidedBy: `staff:${ctx.staffId}`, decidedAt: new Date() } });
      const cleared = await tx.$executeRaw`update "fo_lead" set "possible_match_person_id" = null where "firm_id" = ${ctx.firmId}::uuid
        and (("person_id" = ${p.low_id}::uuid and "possible_match_person_id" = ${p.high_id}::uuid) or ("person_id" = ${p.high_id}::uuid and "possible_match_person_id" = ${p.low_id}::uuid))`;
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "fo.duplicates.kept_separate", entity: "fo_dup_review", entityKey: p.id,
        summary: `Kept separate: person records ${p.low_id} and ${p.high_id}; ${cleared} possible-match flag${cleared === 1 ? "" : "s"} cleared.`, detail: { pairId: p.id, lowId: p.low_id, highId: p.high_id, flagsCleared: cleared },
        before: { status: "OPEN" }, after: { status: "KEPT_SEPARATE" } });
      return { id: p.id, status: "KEPT_SEPARATE" as const };
    });
  }
}
