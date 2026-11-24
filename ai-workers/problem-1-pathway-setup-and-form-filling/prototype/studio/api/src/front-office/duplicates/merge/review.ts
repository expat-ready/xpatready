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
// * The pair model (product/screens/FO-9b-2/pair-model.md): a row stores only what was decided on that pair; what the
//   list shows (`listed`) is derived from the rows, the people's live roots and the undone merges. One lock order for
//   every writer: the people's advisory locks (sorted), then the pair row, then the merge's rows NOWAIT.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { MatchReason, matchScore, NAME_THRESHOLD } from "../../../../../ports/matching.ts";
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
export const STALE_LINE = "One of these records was changed after you opened the merge. Nothing was merged. Open it again to see the changes.";
export const MONEY_LINE = "This person has invoices, payments, trust money or a tax setting; their records cannot be merged here yet. Nothing was merged.";
export const CASE_SIDE_LINE = "This person has a case; merge them from the client record.";
export type Unsafe = "NOT_EXACT" | "CASE" | "CASE_UNKNOWN" | "DOCUMENT" | "MONEY" | "KEPT_SEPARATE" | "CONTACT_CONFLICT" | "CONSENT";
export const MERGED_AWAY_LINE = "One of these people was merged into another record after this pair was listed. Nothing was changed.";
export const KEPT_LINE = "These people were kept separate (a decision between their records). Nothing was merged.";
export const NOT_LISTED_LINE = "This pair is no longer on the list (the merge that found it was undone, and these people no longer match). Nothing was changed.";

const notFound = (): never => problem(404, "Not found", "No such pair in your firm.", { code: "NOT_FOUND" });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
const pairOf = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? [a.toLowerCase(), b.toLowerCase()] : [b.toLowerCase(), a.toLowerCase()]) as [string, string];

/** The people's advisory locks, the ones a merge and an Undo take (service.ts lockPair: the same keys, sorted, waiting).
 *  First in every writer's lock order (pair-model.md §2): a pair row is locked only while both are held. */
async function lockPeople(tx: Tx, a: string, b: string) {
  for (const id of [a.toLowerCase(), b.toLowerCase()].sort()) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_dup_merge:${id}`}, 0))`;
}

/** Each person's live root: the record its chain of merges ends at (merged_into_id is never re-pointed). */
async function rootsOf(tx: Tx | PrismaClient, firmId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await tx.$queryRaw<{ start: string; root: string }[]>`
    with recursive up(start, id, nxt, d) as (
      select p."id", p."id", p."merged_into_id", 0 from "fo_person" p where p."firm_id" = ${firmId}::uuid and p."id" = any(${ids}::uuid[])
      union all select up.start, p."id", p."merged_into_id", up.d + 1 from "fo_person" p join up on p."id" = up.nxt where p."firm_id" = ${firmId}::uuid and up.d < 64)
    select start::text, id::text as root from up where nxt is null`;
  const m = new Map(rows.map((r) => [r.start, r.root]));
  for (const id of ids) if (!m.has(id)) m.set(id, id);
  return m;
}

/** The Kept separate decision that keeps the two people's records apart: a KEPT_SEPARATE pair with one side in each
 *  person's live record (the root and every record merged into it, through any number of merges), or null. A merge
 *  never joins two records a person decided to keep apart (pair-model.md §1). */
async function keptBetween(tx: Tx | PrismaClient, firmId: string, x: string, y: string): Promise<{ id: string } | null> {
  const r = await rootsOf(tx, firmId, [x, y]), rx = r.get(x)!, ry = r.get(y)!;
  if (rx === ry) return null;
  const [kept] = await tx.$queryRaw<{ id: string }[]>`
    with recursive ca(id) as (select ${rx}::uuid union select p."id" from "fo_person" p join ca on p."merged_into_id" = ca.id where p."firm_id" = ${firmId}::uuid),
                   cb(id) as (select ${ry}::uuid union select p."id" from "fo_person" p join cb on p."merged_into_id" = cb.id where p."firm_id" = ${firmId}::uuid)
    select r."id"::text from "fo_dup_review" r
     where r."firm_id" = ${firmId}::uuid and r."status" = 'KEPT_SEPARATE'
       and ((r."low_id" in (select id from ca) and r."high_id" in (select id from cb)) or (r."low_id" in (select id from cb) and r."high_id" in (select id from ca)))
     order by r."id" limit 1`;
  return kept ?? null;
}

/** Whether pair row `r` is withdrawn (pair-model.md §1, Lead 9 on #3174): the merge that noted it is undone AND its two
 *  people no longer match, FO-9a's rule asked of the pair (wonDuplicates' predicate, no 10-match cap: equal email, equal
 *  E.164 phone, or a similar name, a key with a digit only exactly). The noter alone cannot say it: the other person can
 *  change while one is merged away. The one fragment `pairRow` and `list()` both read, so they cannot drift (I5). */
const WITHDRAWN = Prisma.sql`(exists (select 1 from "fo_dup_merge" um where um."id" = r."noted_by_merge_id" and um."undone_at" is not null)
  and not exists (select 1 from "fo_person" a, "fo_person" b where a."id" = r."low_id" and b."id" = r."high_id"
    and ((a."email" is not null and a."email" = b."email") or (a."phone_e164" is not null and a."phone_e164" = b."phone_e164")
      or (coalesce(a."name_key", '') <> '' and coalesce(b."name_key", '') <> '' and (
           ((a."name_key" ~ '[0-9]' or b."name_key" ~ '[0-9]') and lower(a."name_key") = lower(b."name_key"))
        or (a."name_key" !~ '[0-9]' and b."name_key" !~ '[0-9]' and extensions.similarity(lower(a."name_key"), lower(b."name_key")) >= ${NAME_THRESHOLD}::float8))))))`;

type PairRow = { id: string; low_id: string; high_id: string; status: string; merge_id: string | null; reasons: MatchReason[]; withdrawn: boolean };
/** One pair row, with `withdrawn` (WITHDRAWN); `lock` only under lockPeople. */
async function pairRow(tx: Tx, firmId: string, id: string, lock: boolean): Promise<PairRow | undefined> {
  return (await tx.$queryRaw<PairRow[]>`select r."id"::text, r."low_id"::text, r."high_id"::text, r."status"::text, r."merge_id"::text, r."reasons", ${WITHDRAWN} as withdrawn
    from "fo_dup_review" r where r."firm_id" = ${firmId}::uuid and r."id" = ${id}::uuid ${lock ? Prisma.sql`for update of r` : Prisma.empty}`)[0];
}

/** What the list shows for a pair (pair-model.md §1): its decision (MERGED, KEPT_SEPARATE); an OPEN pair is not listed
 *  (HIDDEN) when it is withdrawn (its noting merge undone and the two no longer match) or a side is merged away, is shown Kept separate when a decision between
 *  the two records keeps them apart (`keptThrough`), else To review (OPEN). */
async function listed(tx: Tx, firmId: string, p: PairRow): Promise<{ tab: "OPEN" | "KEPT_SEPARATE" | "MERGED" | "HIDDEN"; why?: "WITHDRAWN" | "MERGED_AWAY"; keptThrough?: string }> {
  if (p.status === "MERGED" || p.status === "KEPT_SEPARATE") return { tab: p.status };
  if (p.withdrawn) return { tab: "HIDDEN", why: "WITHDRAWN" };
  if (await tx.foPerson.count({ where: firmScope(firmId, { id: { in: [p.low_id, p.high_id] }, mergedIntoId: { not: null } }) })) return { tab: "HIDDEN", why: "MERGED_AWAY" };
  const k = await keptBetween(tx, firmId, p.low_id, p.high_id);
  return k ? { tab: "KEPT_SEPARATE", keptThrough: k.id } : { tab: "OPEN" };
}

/** One pair's tab as `listed` derives it, read in its own transaction (tests compare it with `list()`). */
export async function listedPair(db: PrismaClient, firmId: string, pairId: string): Promise<string> {
  return db.$transaction(async (tx) => { const p = await pairRow(tx as never, firmId, pairId, false); return p ? (await listed(tx as never, firmId, p)).tab : "NONE"; });
}

/** Writes every pair the new person makes with a live person of the firm (no-op for a pair that has a row). A person
 *  added with "Add as new" (Add a lead's confirmedNew) writes the pair Kept separate, decided by the adder, so the
 *  merge by itself never joins them (concept §8 B1, founder question 1; AG-2-68 rule 16). After a merge (`mergeRef`),
 *  a pair it writes names that merge, as history: once it is undone the pair leaves the list only while its two people
 *  no longer match (WITHDRAWN, pair-model.md §1). Nothing here waits on a pair row: an insert that meets one does
 *  nothing (pair-model.md §2). */
export async function notePairs(tx: Tx, firmId: string, personId: string, addedAsNew: { by: string } | null = null, mergeRef: string | null = null): Promise<string[]> {
  const found = await wonDuplicates(tx, firmId, { subject: "PERSON", personId });
  const ids: string[] = [];
  for (const m of found.matches) {
    const [lo, hi] = pairOf(personId, m.id);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      insert into "fo_dup_review" ("firm_id", "kind", "low_id", "high_id", "score", "reasons", "status", "decided_by", "decided_at", "noted_by_merge_id")
      values (${firmId}::uuid, 'PERSON', ${lo}::uuid, ${hi}::uuid, ${m.score}, ${JSON.stringify(m.reasons)}::jsonb,
              ${addedAsNew ? "KEPT_SEPARATE" : "OPEN"}::"FoDupReviewStatus", ${addedAsNew?.by ?? null}, ${addedAsNew ? new Date() : null}, ${mergeRef}::uuid)
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
export async function whyNotSafe(tx: Tx, firmId: string, ids: string[], reasons: MatchReason[], opts: { kept?: boolean } = {}): Promise<Unsafe[]> {
  const out = new Set<Unsafe>();
  if (!reasons.some((r) => r.key === "EMAIL" || r.key === "PHONE")) out.add("NOT_EXACT");
  const cases = await caseOf(tx, ids);
  if (cases === null) out.add("CASE_UNKNOWN"); else if (cases.size) out.add("CASE");
  const [docs] = await tx.$queryRaw<{ n: number }[]>`
    select ((select count(*) from "fo_retainer" r where r."firm_id" = ${firmId}::uuid and (r."signer_person_id" = any(${ids}::uuid[])
               or r."prospect_id" in (select p."id" from "fo_prospect" p where p."firm_id" = ${firmId}::uuid and (p."subject_person_id" = any(${ids}::uuid[]) or p."primary_contact_person_id" = any(${ids}::uuid[])))))
          + (select count(*) from "fo_identity_check" where "firm_id" = ${firmId}::uuid and "person_id" = any(${ids}::uuid[]) and "copy_file_key" is not null)
          + (select count(*) from "fo_signer" where "firm_id" = ${firmId}::uuid and "person_id" = any(${ids}::uuid[])))::int as n`;
  if (docs.n) out.add("DOCUMENT");
  if (await anyMoney(tx, firmId, ids)) out.add("MONEY");
  if (opts.kept !== false && ids.length === 2 && (await keptBetween(tx, firmId, ids[0], ids[1]))) out.add("KEPT_SEPARATE");
  return [...out];
}

/** The exact keys the two records share now (email, readable E.164 phone). */
async function liveReasons(tx: Tx, firmId: string, ids: string[]): Promise<MatchReason[]> {
  const r = await tx.foPerson.findMany({ where: firmScope(firmId, { id: { in: ids } }), select: { email: true, phoneE164: true } });
  if (r.length !== 2) return [];
  return [...(r[0].email && r[0].email.toLowerCase() === r[1].email?.toLowerCase() ? [{ key: "EMAIL" as const }] : []), ...(r[0].phoneE164 && r[0].phoneE164 === r[1].phoneE164 ? [{ key: "PHONE" as const }] : [])];
}

/** The exact keys the two records shared as the merge locked them (its snapshots), before it copied any value into the
 *  survivor (break R3-3: a loser's key changed while the merge waited would otherwise be copied and match itself). */
async function lockedReasons(tx: Tx, firmId: string, mergeRef: string): Promise<MatchReason[]> {
  const [k] = await tx.$queryRaw<{ email: boolean | null; phone: boolean | null }[]>`
    select lower(m."survivor_before"->>'email') = lower(m."loser_snapshot"->'loser'->>'email') as email,
           fo_sales_phone_e164(m."survivor_before"->>'phone', coalesce((m."survivor_before"->>'phoneReadable')::boolean, true)) = m."loser_snapshot"->'loser'->>'phone_e164' as phone
      from "fo_dup_merge" m where m."firm_id" = ${firmId}::uuid and m."id" = ${mergeRef}::uuid`;
  return [...(k?.email ? [{ key: "EMAIL" as const }] : []), ...(k?.phone ? [{ key: "PHONE" as const }] : [])];
}

/** Whether either person has money with client money (ClientMoneyPort.hasMoney, read in `tx`). */
async function anyMoney(tx: Tx, firmId: string, ids: string[]): Promise<boolean> {
  const money = new ClientMoney(tx as unknown as PrismaClient);
  for (const id of ids) if (await money.hasMoney(firmId, { personId: id })) return true;
  return false;
}

const systemCtx = (firmId: string, firmKey = ""): StaffContext => ({ staffId: "00000000-0000-0000-0000-000000000000", firmId, firmKey, roles: [], keys: [MERGE_KEY], duties: [], authTime: 0, via: "local" });

/** P-574 (2): merges an OPEN pair by itself when it is safe (the newer record into the older), once. */
export async function mergeIfSafe(tx: Tx, firmId: string, pairId: string, ports: MergePorts): Promise<{ mergeRef: string } | { refused: Unsafe[] }> {
  const h = await pairRow(tx, firmId, pairId, false);
  if (!h) return { refused: [] };
  await lockPeople(tx, h.low_id, h.high_id);   // pair-model.md §2: the people first, then the pair row
  const p = (await pairRow(tx, firmId, pairId, true))!;
  // Only a pair on To review (pair-model.md §1); anything else is a refusal, never a throw (review r7-m4).
  const shown = await listed(tx, firmId, p);
  if (shown.tab !== "OPEN") return { refused: shown.tab === "KEPT_SEPARATE" ? ["KEPT_SEPARATE"] : [] };
  const ids = [p.low_id, p.high_id];
  // The match as the records are now, never as stored when the pair was first seen (break F1). Kept separate is read
  // under the people's locks: no decision on either record and no merge into either can commit until this one ends.
  const why = await whyNotSafe(tx, firmId, ids, await liveReasons(tx, firmId, ids));
  if (why.length) return { refused: why };
  const people = await tx.foPerson.findMany({ where: firmScope(firmId, { id: { in: ids } }), orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (people.length !== 2) return { refused: [] };
  // Part 2b (break B1 on #3527): one key matches, but the other differs on both records (two emails on one phone, two
  // phones on one email): not shown to be one person, so a person decides (To review).
  const [S, L] = people;
  if ((S.email && L.email && S.email.toLowerCase() !== L.email.toLowerCase()) || (S.phoneE164 && L.phoneE164 && S.phoneE164 !== L.phoneE164)) return { refused: ["CONTACT_CONFLICT"] };
  // The record on file keeps its values; the newcomer's fill only its empty fields (break B1: an arrival is unchecked,
  // so it never overwrites a person's name, email or phone by itself).
  const val = (r: typeof S, f: string) => (r as unknown as Record<string, unknown>)[f];
  const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  const choices = Object.fromEntries(MERGE_FIELDS.PERSON.map((f) => [f, empty(val(S, f)) && !empty(val(L, f)) ? "LOSER" : "SURVIVOR"])) as Record<string, FieldPick>;
  await tx.$executeRaw`savepoint fo_dup_auto`;
  const { merge_ref } = await mergeRecords(tx, systemCtx(firmId), { kind: "PERSON", survivor_fo_id: S.id, loser_fo_id: L.id, choices, reason: "Merged by itself: exact match, no case, document or money (P-574 (2))." }, ports, { automatic: true });
  // A merge that copies a live consent cannot be undone (part 1: consent rows are never removed), and an arrival's
  // consent is unchecked: never by itself; the pair waits for a person (break M1 on #3527).
  const snap = (await tx.foDupMerge.findFirst({ where: firmScope(firmId, { id: merge_ref }), select: { loserSnapshot: true } }))?.loserSnapshot as { copied?: { consents?: string[] } } | null;
  if (snap?.copied?.consents?.length) { await tx.$executeRaw`rollback to savepoint fo_dup_auto`; return { refused: ["CONSENT"] }; }
  // Checked again once the merge holds both records' locks (break F2, F3): a case, document or money row committed while
  // the merge ran is seen now (read committed), and the merge is rolled back. A writer that starts after these locks
  // waits on them; that it then writes on the merged-away record is the money side's check (Question for the tech lead).
  const after = await whyNotSafe(tx, firmId, ids, await lockedReasons(tx, firmId, merge_ref), { kept: false });   // the keys as locked (break R2-2, R3-3)
  if (after.length) { await tx.$executeRaw`rollback to savepoint fo_dup_auto`; return { refused: after }; }
  await tx.$executeRaw`release savepoint fo_dup_auto`;
  await notePairs(tx, firmId, S.id, null, merge_ref);   // the loser's other matches now meet the survivor (review m7)
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
  // A deadlock PostgreSQL broke (40P01) rolled this transaction back: nothing changed, the same "try again" (break R4-1).
  const deadlock = /40P01|deadlock detected/i.test(`${(e as Error)?.message ?? ""} ${JSON.stringify((e as { meta?: unknown })?.meta ?? {})}`);
  if (e instanceof MergeBusy || deadlock) problem(503, "Busy", "These records were being changed by someone else at the same moment. Nothing was changed. Try again.", { code: "BUSY" });
  throw e;
};

export class DuplicateReview {
  constructor(private readonly db: PrismaClient, private readonly ports: MergePorts & { audit: AuditPort<Tx> }) {}

  /** A pair the viewer may act on, or the one not-found. A merged-away side is seen through its live root (its leads
   *  moved there), so a decided pair answers 409, not 404. `lock`: the people's advisory locks, then the row (§2). */
  private async pair(tx: Tx, ctx: StaffContext, id: string, lock = true): Promise<PairRow> {
    const h = await pairRow(tx, ctx.firmId, id, false);
    if (!h) return notFound();
    const roots = await rootsOf(tx, ctx.firmId, [h.low_id, h.high_id]);
    if (!(await sees(tx, ctx, [roots.get(h.low_id)!, roots.get(h.high_id)!]))) return notFound();
    if (!lock) return h;
    await lockPeople(tx, h.low_id, h.high_id);
    return (await pairRow(tx, ctx.firmId, id, true))!;
  }

  /** The pair must be on To review as the list shows it (`listed`), else the 409 that says why. */
  private async mustBeOpen(tx: Tx, ctx: StaffContext, p: PairRow, onKept: [string, string]) {
    if (p.status !== "OPEN") conflict("This pair was already decided.", "DECIDED");
    const v = await listed(tx, ctx.firmId, p);
    if (v.why === "WITHDRAWN") conflict(NOT_LISTED_LINE, "NOT_LISTED");
    if (v.why === "MERGED_AWAY") conflict(MERGED_AWAY_LINE, "MERGED_AWAY");
    if (v.tab === "KEPT_SEPARATE") conflict(onKept[0], onKept[1]);
  }

  /** The list's tabs, derived as `listed` derives one pair (pair-model.md §1), for every pair of the firm at once. */
  async list(ctx: StaffContext, status: "OPEN" | "MERGED" | "KEPT_SEPARATE" = "OPEN") {
    const rows = await this.db.foDupReview.findMany({ where: firmScope(ctx.firmId, {}), orderBy: [{ score: "desc" }, { firstSeenAt: "asc" }, { id: "asc" }] });
    const withdrawn = new Set((await this.db.$queryRaw<{ id: string }[]>`select r."id"::text from "fo_dup_review" r where r."firm_id" = ${ctx.firmId}::uuid and r."status" = 'OPEN' and ${WITHDRAWN}`).map((r) => r.id));
    const ids = [...new Set(rows.flatMap((r) => [r.lowId, r.highId]))];
    const roots = await rootsOf(this.db, ctx.firmId, ids), root = (id: string) => roots.get(id) ?? id;
    const key = (a: string, b: string) => [root(a), root(b)].sort().join("|");
    const keptBy = new Map<string, string>();
    for (const r of [...rows].sort((a, b) => a.id.localeCompare(b.id))) if (r.status === "KEPT_SEPARATE" && root(r.lowId) !== root(r.highId) && !keptBy.has(key(r.lowId, r.highId))) keptBy.set(key(r.lowId, r.highId), r.id);
    const tabOf = (r: (typeof rows)[number]): { tab: string; keptThrough?: string } => {
      if (r.status !== "OPEN") return { tab: r.status };
      if (withdrawn.has(r.id) || root(r.lowId) !== r.lowId || root(r.highId) !== r.highId) return { tab: "HIDDEN" };
      const k = keptBy.get(key(r.lowId, r.highId));
      return k ? { tab: "KEPT_SEPARATE", keptThrough: k } : { tab: "OPEN" };
    };
    const mine = rows.map((r) => ({ r, t: tabOf(r) })).filter((x) => x.t.tab === status);
    const shown = [...new Set(mine.flatMap((x) => [x.r.lowId, x.r.highId]))];
    const card = await cards(this.db, ctx.firmId, shown);
    const [see, cases] = await Promise.all([seen(this.db, ctx, [...new Set(shown.map(root))]), this.db.$transaction((tx) => caseOf(tx, shown))]);
    const items = mine.filter(({ r }) => see.has(root(r.lowId)) && see.has(root(r.highId)))
      .map(({ r, t }) => ({ id: r.id, kind: r.kind, people: [card.get(r.lowId)!, card.get(r.highId)!].map(({ mergedIntoId: _, ...c }) => c), score: r.score, reasons: r.reasons, firstSeenAt: r.firstSeenAt, status: t.tab,
        keptThrough: t.keptThrough ?? null, decidedAt: r.decidedAt, automatic: r.decidedBy === SYSTEM_ACTOR, mergeRef: r.mergeId, needsCaseSide: cases === null || cases.has(r.lowId) || cases.has(r.highId) })).slice(0, 500);   // filtered by visibility first (break F8)
    return { items, openCount: status === "OPEN" ? items.length : undefined };
  }

  /** The Merged tab (concept M6): every merge whose surviving record the viewer may open, newest first. */
  async merges(ctx: StaffContext) {
    const rows = await this.db.foDupMerge.findMany({ where: firmScope(ctx.firmId, { kind: "PERSON" as const }), orderBy: [{ at: "desc" }, { id: "asc" }] });
    const ids = [...new Set(rows.flatMap((m) => [m.survivorId, m.loserId]))];
    const roots = await rootsOf(this.db, ctx.firmId, ids), root = (id: string) => roots.get(id) ?? id;   // a later merge: seen through its live root
    const see = await seen(this.db, ctx, [...new Set(ids.map(root))]);
    const card = await cards(this.db, ctx.firmId, ids);
    return { items: rows.filter((m) => see.has(root(m.survivorId)) && (m.undoneAt === null || see.has(root(m.loserId)))).map((m) => ({
      id: m.id, mergeRef: m.id, kind: m.kind, survivor: { personId: m.survivorId, name: card.get(m.survivorId)?.name ?? "" }, loser: { personId: m.loserId, name: card.get(m.loserId)?.name ?? "" },
      automatic: m.automatic, by: m.by, at: m.at, undoneAt: m.undoneAt })).slice(0, 500) };
  }

  /** Both values of every field, the default pick, what will move, each side's updatedAt (concept M7). */
  async preview(ctx: StaffContext, id: string, survivorId: string) {
    return this.db.$transaction(async (tx) => {
      const p = await this.pair(tx, ctx, id, false);   // reads only: no lock
      await this.mustBeOpen(tx, ctx, p, [KEPT_LINE, "KEPT_SEPARATE"]);
      const s = survivorId.toLowerCase(), l = s === p.low_id ? p.high_id : s === p.high_id ? p.low_id : null;
      if (!l) return problem(422, "Check the details", "survivorId: Pick one of the pair's two people. Nothing was saved.", { code: "INVALID", fields: { survivorId: "Pick one of the pair's two people." } });
      const rows = await tx.foPerson.findMany({ where: firmScope(ctx.firmId, { id: { in: [s, l] } }) });
      const S = rows.find((r) => r.id === s)!, L = rows.find((r) => r.id === l)!;
      const val = (r: typeof S, f: string) => (r as unknown as Record<string, unknown>)[f] ?? null;
      const picks = resolvePicks("PERSON", { fields: Object.fromEntries(MERGE_FIELDS.PERSON.map((f) => [f, val(S, f)])), updatedAt: S.updatedAt }, { fields: Object.fromEntries(MERGE_FIELDS.PERSON.map((f) => [f, val(L, f)])), updatedAt: L.updatedAt });
      const n = async (t: string) => Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from "${t}" where "firm_id" = $1::uuid and "person_id" = $2::uuid`, ctx.firmId, l))[0].n);
      const cases = await caseOf(tx, [s, l]);
      return { pairId: p.id, survivorId: s, loserId: l, needsCaseSide: cases === null || cases.size > 0, hasMoney: await anyMoney(tx, ctx.firmId, [s, l]),
        fields: MERGE_FIELDS.PERSON.map((f) => ({ field: f, survivor: val(S, f), loser: val(L, f), pick: picks[f] as FieldPick })),
        moves: { leads: await n("fo_lead"), notes: await n("fo_note"), calls: await n("fo_call"), bookings: await n("fo_booking") },
        updatedAt: { survivor: S.updatedAt, loser: L.updatedAt } };
    });
  }

  /** The guided merge (P-574 (2)): the viewer picks the survivor and, field by field, the values. */
  async merge(ctx: StaffContext, id: string, body: { survivorId: string; choices?: Record<string, FieldPick>; reason?: string; updatedAt?: { survivor: string; loser: string } }) {
    try {
      return await this.db.$transaction(async (tx) => {
        const p = await this.pair(tx, ctx, id);
        await this.mustBeOpen(tx, ctx, p, [KEPT_LINE, "KEPT_SEPARATE"]);   // read under the people's locks (§2)
        const s = body.survivorId.toLowerCase(), l = s === p.low_id ? p.high_id : s === p.high_id ? p.low_id : null;
        if (!l) return problem(422, "Check the details", "survivorId: Pick one of the pair's two people. Nothing was saved.", { code: "INVALID", fields: { survivorId: "Pick one of the pair's two people." } });
        const cases = await caseOf(tx, [s, l]);
        if (cases === null || cases.size) conflict(CASE_SIDE_LINE, "NEEDS_CASE_SIDE");
        // Client money never follows merged_into_id, so a merge would leave money on the merged-away record (AG-2-16 rule
        // 5; review M6): refused until client money can move it (Question for the tech lead on the PR).
        if (await anyMoney(tx, ctx.firmId, [s, l])) conflict(MONEY_LINE, "HAS_MONEY");
        if (body.updatedAt) {   // the survivor as the person merging saw it (preview's updatedAt)
          const now = await tx.foPerson.findMany({ where: firmScope(ctx.firmId, { id: { in: [s, l] } }), select: { id: true, updatedAt: true } });
          const at = (id: string) => now.find((x) => x.id === id)?.updatedAt.getTime();
          if (at(s) !== Date.parse(body.updatedAt.survivor) || at(l) !== Date.parse(body.updatedAt.loser)) conflict(STALE_LINE, "STALE_VERSION");
        }
        const { merge_ref } = await mergeRecords(tx, ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l, ...(body.choices ? { choices: body.choices } : {}), ...(body.reason ? { reason: body.reason } : {}) }, this.ports);
        // With both records locked (break F3, F4): a case opened while the merge ran rolls it back; the values the person
        // merging saw (preview's updatedAt, concept M7) must still be the records' (STANDARDS §4: a stale save is a 409).
        const again = await caseOf(tx, [s, l]);
        if (again === null || again.size) conflict(CASE_SIDE_LINE, "NEEDS_CASE_SIDE");
        if (await anyMoney(tx, ctx.firmId, [s, l])) conflict(MONEY_LINE, "HAS_MONEY");
        if (body.updatedAt) {   // the loser as the merge locked and read it (its snapshot)
          const m = await tx.foDupMerge.findFirst({ where: firmScope(ctx.firmId, { id: merge_ref }), select: { loserSnapshot: true } });
          const was = (m?.loserSnapshot as { loser?: { updated_at?: string } } | null)?.loser?.updated_at;
          if (!was || Date.parse(String(was)) !== Date.parse(body.updatedAt.loser)) conflict(STALE_LINE, "STALE_VERSION");
        }
        await tx.foDupReview.updateMany({ where: firmScope(ctx.firmId, { id: p.id }), data: { status: "MERGED", mergeId: merge_ref, decidedBy: `staff:${ctx.staffId}`, decidedAt: new Date() } });
        await notePairs(tx, ctx.firmId, s, null, merge_ref);   // the loser's other matches now meet the survivor (review m7)
        return { mergeRef: merge_ref };
      });
    } catch (e) { return asRefusal(e); }
  }

  /** Undo from the Merged tab (BR-10): part 1's Undo, and the pair opens again. */
  async undo(ctx: StaffContext, mergeRef: string) {
    try {
      return await this.db.$transaction(async (tx) => {
        const m = await tx.foDupMerge.findFirst({ where: firmScope(ctx.firmId, { id: mergeRef, kind: "PERSON" as const }), select: { survivorId: true, loserId: true } });
        // The survivor as the Merged tab sees it: through its live root, so an earlier merge of a chain is a 409, never 404 (break R7-1).
        const sroot = m ? (await rootsOf(tx, ctx.firmId, [m.survivorId])).get(m.survivorId)! : "";
        if (!m || !(await seen(tx, ctx, [sroot])).size) return problem(404, "Not found", "No such merge in your firm.", { code: "NOT_FOUND" });
        // A person who became a case-side client since the merge is split by the case side only (break F5).
        const cases = await caseOf(tx, [m.survivorId, m.loserId]);
        if (cases === null || cases.size) conflict("This person has a case now; undo the merge from the client record.", "NEEDS_CASE_SIDE");
        const out = await unmergeRecords(tx, ctx, mergeRef, this.ports);
        const again = await caseOf(tx, [m.survivorId, m.loserId]);   // under Undo's locks too (break R2-5)
        if (again === null || again.size) conflict("This person has a case now; undo the merge from the client record.", "NEEDS_CASE_SIDE");
        await tx.foDupReview.updateMany({ where: firmScope(ctx.firmId, { mergeId: mergeRef }), data: { status: "OPEN", mergeId: null, decidedBy: null, decidedAt: null } });
        // A pair this merge noted leaves the list by itself while its two people no longer match (WITHDRAWN), and a pair a
        // Kept separate decision blocked only through the merged record is To review again. Nothing else is withdrawn: a
        // pair written while the merge stood stays listed even if it no longer matches (pair-model.md §1, Lead 9 on #3174:
        // a pair that still matches is never hidden). The loser's pairs are written, so someone who arrived meanwhile meets it too.
        await notePairs(tx, ctx.firmId, m.loserId);
        return out;
      });
    } catch (e) { return asRefusal(e); }
  }

  /** Keep separate (BR-11): the pair is decided, and each person's possible-match flag naming the other is cleared. */
  async keepSeparate(ctx: StaffContext, id: string) {
    try {
      return await this.db.$transaction(async (tx) => {
        const p = await this.pair(tx, ctx, id);   // the people's locks, then the row (§2): a merge on either person goes first
        // A side merged away since the pair was listed is refused, never decided on a tombstone (break R3-1).
        await this.mustBeOpen(tx, ctx, p, ["These people are already kept separate (a decision between their records).", "DECIDED"]);
        await tx.foDupReview.updateMany({ where: firmScope(ctx.firmId, { id: p.id }), data: { status: "KEPT_SEPARATE", decidedBy: `staff:${ctx.staffId}`, decidedAt: new Date() } });
        const cleared = await tx.$executeRaw`update "fo_lead" set "possible_match_person_id" = null where "firm_id" = ${ctx.firmId}::uuid
          and (("person_id" = ${p.low_id}::uuid and "possible_match_person_id" = ${p.high_id}::uuid) or ("person_id" = ${p.high_id}::uuid and "possible_match_person_id" = ${p.low_id}::uuid))`;
        await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "fo.duplicates.kept_separate", entity: "fo_dup_review", entityKey: p.id,
          summary: `Kept separate: person records ${p.low_id} and ${p.high_id}; ${cleared} possible-match flag${cleared === 1 ? "" : "s"} cleared.`, detail: { pairId: p.id, lowId: p.low_id, highId: p.high_id, flagsCleared: cleared },
          before: { status: "OPEN" }, after: { status: "KEPT_SEPARATE" } });
        return { id: p.id, status: "KEPT_SEPARATE" as const };
      });
    } catch (e) { return asRefusal(e); }
  }
}
