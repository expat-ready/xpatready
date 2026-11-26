// FO-9b part 1 (BACKLOG row FO-9b; briefs design/lead-b-briefs/FO-9b.md "Part 1" and design/briefs/track-b/FO-9b-1.md;
// P-574 (2); AG-2-16 rules 1, 2, 2b, 4, 5, 8, 10, 11, §8, §10): merge two person (or two company) records, and Undo one
// merge, inside the caller's transaction (it never opens its own, so the caller's rollback leaves nothing merged).
// Merge: both ids locked in sorted order (pg_advisory_xact_lock), both re-read (another firm's → 404, a tombstone → 409,
// the same id → 400, a person with a company → 409); the chosen values to the survivor first; every column of
// columns.ts MOVE re-pointed (a lead's receipts, calls and notes follow by ON UPDATE CASCADE; a note moves only while
// fo_dup.merging is on, transaction-local); consent copied (COPY); the loser tombstoned (merged_into_id, never deleted);
// fo_dup_merge written with the loser's row, the survivor's replaced values and every changed row; one audit line (ids
// and field names, no contact values); `person.merged` outbox row last. Undo: refused while a later merge names either
// record, once anything new reached the survivor after the merge, or once a moved row changed since; otherwise every
// changed row put back in reverse order, the survivor's values restored, the tombstone ended, the record stamped, audit,
// `person.unmerged` last. Consent copies stay (consent rows are never changed or removed; AG-2-83 rule 8).
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { ConsentPort } from "../../../../../ports/consent.ts";
import { EVENT, PersonMergePayload } from "../../../../../ports/events.ts";
import { MERGE_FIELDS, MERGE_KEY, MergePersonsInput, PersonMergeRefused, resolvePicks, type FieldPick, type MergeKind, type MergeResult, type UnmergeResult } from "../../../../../ports/person-merge.ts";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import type { Tx } from "../../sales/common.ts";
import { COLUMNS } from "./columns.ts";

/** What the merge needs besides the transaction. `emit` writes the outbox row (a test may make it fail: DW6). */
export type MergePorts = {
  audit: AuditPort<Tx>;
  consent: ConsentPort<Tx>;
  emit?: (tx: Tx, e: { firmId: string; type: typeof EVENT.PERSON_MERGED | typeof EVENT.PERSON_UNMERGED; subjectId: string; payload: PersonMergePayload }) => Promise<void>;
};
const outbox: NonNullable<MergePorts["emit"]> = async (tx, e) => { await tx.moduleEvent.create({ data: { firmId: e.firmId, type: e.type, subjectId: e.subjectId, payload: PersonMergePayload.parse(e.payload) } }); };

/** One changed cell: Undo sets `c` of row `id` in `t` back to `from` (`ts`: a timestamp column, else a uuid). */
export type Change = { t: string; id: string; c: string; from: string | null; to: string | null; ts?: true };
/** fo_dup_merge.loser_snapshot. */
export type MergeSnapshot = { loser: Record<string, unknown>; changes: Change[]; copied: { consents: string[]; withdrawals: string[] }; survivorAfter: Record<string, unknown>; present: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE: Record<MergeKind, "fo_person" | "fo_company"> = { PERSON: "fo_person", COMPANY: "fo_company" };
/** A merge field's companion column (Prisma names): it travels with its field (ports/person-merge.ts MERGE_FIELDS). */
const COMPANION: Record<string, { field: string; column: string }> = { phone: { field: "phoneReadable", column: "phone_readable" }, operatingName: { field: "normalisedName", column: "normalised_name" } };
const column = (f: string) => f.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const actorOf = (ctx: StaffContext, automatic: boolean) => (automatic ? "system:fo-duplicates" : `staff:${ctx.staffId}`);

type Rec = { kind: MergeKind; row: Record<string, unknown> };
/** Reads a record and locks its row to the end of the transaction: a writer adding a row that names it (the arrival
 *  path's livePersonId, the database's fo_dup_live_party guard) waits, then sees the tombstone (review and break M1). */
async function find(tx: Tx, firmId: string, id: string): Promise<Rec | null> {
  for (const kind of ["PERSON", "COMPANY"] as const) {
    const [r] = await tx.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`select to_jsonb(x) as row from "${TABLE[kind]}" x where x."firm_id" = $1::uuid and x."id" = $2::uuid for update nowait`, firmId, id);
    if (r) return { kind, row: r.row };
  }
  return null;
}
const fieldsOf = (kind: MergeKind, row: Record<string, unknown>) => Object.fromEntries(MERGE_FIELDS[kind].map((f) => [f, row[column(f)] ?? null]));
/** The merge fields and their companions, by Prisma name: what Undo writes back to the survivor. */
const valuesOf = (kind: MergeKind, row: Record<string, unknown>) => {
  const out: Record<string, unknown> = fieldsOf(kind, row);
  for (const f of MERGE_FIELDS[kind]) if (COMPANION[f]) out[COMPANION[f].field] = row[COMPANION[f].column];
  return out;
};
/** Lead 5's ruling on #3042 (round 4: no fixed lock order serves every writer: Corporate engage takes the lead then
 *  the company, changeRole the company then the prospect, calls.ts the prospect then the lead): merge and Undo never
 *  wait while they hold locks. Every lock is taken NOWAIT inside a savepoint; when one is held, the savepoint is rolled
 *  back (the caller's transaction stays usable), and after a short bounded back-off the whole set is tried again; then
 *  MergeBusy (55P03, which busy.ts reads as "try again"; part 2's routes answer 503). A transaction that never waits
 *  cannot be part of a deadlock, so the other writers always finish. The order below is kept for fairness only. */
const ROW_ORDER = ["fo_prospect", "fo_company_contact", "fo_lead", "fo_note", "fo_call", "fo_arrival_receipt", "fo_booking"];
export const BACKOFF_MS = [25, 50, 100, 200, 400] as const;
export class MergeBusy extends Error {
  constructor() { super("busy (55P03, lock not available): these records are being changed right now; nothing was merged or undone. Try again in a moment."); this.name = "MergeBusy"; }
}
const lockHeld = (e: unknown) => /55P03|lock not available|could not obtain lock/i.test(`${(e as Error)?.message ?? ""} ${JSON.stringify((e as { meta?: unknown })?.meta ?? {})}`);
/** Runs `take` (lock statements only, each NOWAIT) in a savepoint, retried with back-off; throws MergeBusy at the end. */
async function lockAll(tx: Tx, take: () => Promise<void>): Promise<void> {
  for (let i = 0; ; i++) {
    await tx.$executeRawUnsafe(`savepoint fo_dup_locks`);
    try { await take(); await tx.$executeRawUnsafe(`release savepoint fo_dup_locks`); return; } catch (e) {
      await tx.$executeRawUnsafe(`rollback to savepoint fo_dup_locks`);
      if (!lockHeld(e)) throw e;
      if (i >= BACKOFF_MS.length) throw new MergeBusy();
      await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    }
  }
}
/** The companies the person records are (or a moved link was) linked to, in id order. */
async function lockCompaniesOf(tx: Tx, firmId: string, ids: string[], moved: Change[] = []) {
  await tx.$queryRawUnsafe(`select 1 from "fo_company" where "firm_id" = $1::uuid and "id" in (select "company_id" from "fo_company_contact" where "firm_id" = $1::uuid and ("person_id" = any($2::uuid[]) or "id" = any($3::uuid[]))) order by "id" for update nowait`,
    firmId, ids, moved.filter((c) => c.t === "fo_company_contact").map((c) => c.id));
}
/** Every lock a merge or an Undo of this pair needs, NOWAIT: persons: their companies, their rows, the two records, then
 *  their companies again (a link committed between the first read and the record locks: none can commit after, since
 *  a new link's key waits on the locked record); companies: the two records in id order, then their rows. Returns the
 *  two records' rows. */
async function lockPairFor(tx: Tx, firmId: string, kind: MergeKind, loser: string, survivor: string, moved: Change[] = []): Promise<{ l: Rec | null; s: Rec | null }> {
  let l: Rec | null = null, s: Rec | null = null;
  await lockAll(tx, async () => {
    if (kind === "COMPANY") {
      for (const id of [loser, survivor].sort()) { const r = await find(tx, firmId, id); if (id === loser) l = r; else s = r; }
      await lockRowsByOrder(tx, firmId, "COMPANY", [loser, survivor], moved);
    } else {
      await lockCompaniesOf(tx, firmId, [loser, survivor], moved);
      await lockRowsByOrder(tx, firmId, "PERSON", [loser, survivor], moved);
      l = await find(tx, firmId, loser); s = await find(tx, firmId, survivor);
      await lockCompaniesOf(tx, firmId, [loser, survivor], moved);
    }
  });
  return { l, s };
}
/** Every row naming the records (a MOVE column of the kind), plus the rows a merge moved, table by table in ROW_ORDER. */
async function lockRowsByOrder(tx: Tx, firmId: string, kind: MergeKind, ids: string[], moved: Change[] = []) {
  const cols = Object.entries(COLUMNS).filter(([tc, [k]]) => k === "MOVE" && (kind === "COMPANY") === /company_id$/.test(tc)).map(([tc]) => tc.split("."));
  for (const t of ROW_ORDER) {
    const mine = cols.filter(([ct]) => ct === t).map(([, c]) => c);
    const movedIds = moved.filter((c) => c.t === t).map((c) => c.id);
    if (!mine.length && !movedIds.length) continue;
    const where = [...mine.map((c) => `"${c}" = any($2::uuid[])`), `"id" = any($3::uuid[])`].join(" or ");
    await tx.$queryRawUnsafe(`select 1 from "${t}" where "firm_id" = $1::uuid and (${where}) order by "id" for update nowait`, firmId, ids, movedIds);
  }
}
async function lockPair(tx: Tx, a: string, b: string) {
  for (const id of [a.toLowerCase(), b.toLowerCase()].sort()) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_dup_merge:${id}`}, 0))`;
}
const merging = (tx: Tx, on: boolean) => (on ? tx.$executeRaw`select set_config('fo_dup.merging', 'on', true)` : tx.$executeRaw`select set_config('fo_dup.merging', 'off', true)`);
/** The database's clock (never the app's): the merge time is compared with rows' database times (review m5). */
const dbNow = async (tx: Tx) => (await tx.$queryRaw<{ at: Date }[]>`select clock_timestamp() as at`)[0].at;
/** The cells Undo may write back: columns.ts MOVE, and a company link's end (review m6: a stored name is never trusted). */
const UNDOABLE = new Set([...Object.entries(COLUMNS).filter(([, [k]]) => k === "MOVE").map(([tc]) => tc), "fo_company_contact.valid_to"]);
const refuse = (code: ConstructorParameters<typeof PersonMergeRefused>[0], why: string): never => { throw new PersonMergeRefused(code, why); };
const mayMerge = (ctx: StaffContext) => { if (!ctx.keys.includes(MERGE_KEY)) refuse("MISSING_PERMISSION", "You may not merge records."); };

/** Re-points `c` of `t` from `from` to `to` for the rows `where` picks (all of `from`'s when empty); records each change. */
async function move(tx: Tx, firmId: string, changes: Change[], t: string, c: string, from: string, to: string | null, where = "", extra?: string) {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`update "${t}" set "${c}" = $3::uuid where "firm_id" = $1::uuid and "${c}" = $2::uuid ${where} returning "id"::text as id`, firmId, from, to, ...(extra ? [extra] : []));
  for (const r of rows) changes.push({ t, id: r.id, c, from, to });
}
/** Ends (valid_to = now) the loser's live company links that the survivor already holds live (the same company or person
 *  and role), so moving them breaks no "linked once while live" rule. */
async function endDuplicateLinks(tx: Tx, firmId: string, changes: Change[], side: "person_id" | "company_id", loser: string, survivor: string) {
  const other = side === "person_id" ? "company_id" : "person_id";
  const rows = await tx.$queryRawUnsafe<{ id: string; at: string }[]>(
    `update "fo_company_contact" l set "valid_to" = now() where l."firm_id" = $1::uuid and l."${side}" = $2::uuid and l."valid_to" is null
        and exists (select 1 from "fo_company_contact" s where s."firm_id" = l."firm_id" and s."${side}" = $3::uuid and s."${other}" = l."${other}" and s."role" = l."role" and s."valid_to" is null)
      returning "id"::text as id, "valid_to"::text as at`, firmId, loser, survivor);
  for (const r of rows) changes.push({ t: "fo_company_contact", id: r.id, c: "valid_to", from: null, to: r.at, ts: true });
}

/** The person plan (columns.ts MOVE), in order: company links, leads (their receipts, calls and notes follow), rows on
 *  no lead, possible-match flags, prospects, bookings. */
async function movePerson(tx: Tx, firmId: string, s: string, l: string, changes: Change[]) {
  await endDuplicateLinks(tx, firmId, changes, "person_id", l, s);
  await move(tx, firmId, changes, "fo_company_contact", "person_id", l, s);
  // AG-2-16 rule 10: a flag between the two records is done (cleared) BEFORE the leads move, since a lead never flags its
  // own person (fo_lead_links_check; break and review B1); every other flag naming the loser names the survivor after.
  await move(tx, firmId, changes, "fo_lead", "possible_match_person_id", s, null, `and "person_id" = $4::uuid`, l);
  await move(tx, firmId, changes, "fo_lead", "possible_match_person_id", l, null, `and "person_id" = $4::uuid`, s);
  await move(tx, firmId, changes, "fo_lead", "person_id", l, s);
  for (const t of ["fo_note", "fo_call", "fo_arrival_receipt"]) await move(tx, firmId, changes, t, "person_id", l, s);
  await move(tx, firmId, changes, "fo_lead", "possible_match_person_id", l, s);
  // A prospect's subject and primary contact move in one statement (an individual prospect's two are the same person).
  const pros = await tx.$queryRawUnsafe<{ id: string; sub: boolean; pri: boolean }[]>(
    `select "id"::text as id, coalesce("subject_person_id" = $2::uuid, false) as sub, "primary_contact_person_id" = $2::uuid as pri from "fo_prospect" where "firm_id" = $1::uuid and ("subject_person_id" = $2::uuid or "primary_contact_person_id" = $2::uuid)`, firmId, l);
  if (pros.length) {
    await tx.$executeRawUnsafe(`update "fo_prospect" set "subject_person_id" = case when "subject_person_id" = $2::uuid then $3::uuid else "subject_person_id" end,
        "primary_contact_person_id" = case when "primary_contact_person_id" = $2::uuid then $3::uuid else "primary_contact_person_id" end
      where "firm_id" = $1::uuid and "id" = any($4::uuid[])`, firmId, l, s, pros.map((p) => p.id));
    for (const p of pros) {
      if (p.sub) changes.push({ t: "fo_prospect", id: p.id, c: "subject_person_id", from: l, to: s });
      if (p.pri) changes.push({ t: "fo_prospect", id: p.id, c: "primary_contact_person_id", from: l, to: s });
    }
  }
  await move(tx, firmId, changes, "fo_booking", "person_id", l, s);
}
async function moveCompany(tx: Tx, firmId: string, s: string, l: string, changes: Change[]) {
  await endDuplicateLinks(tx, firmId, changes, "company_id", l, s);
  await move(tx, firmId, changes, "fo_company_contact", "company_id", l, s);
  await move(tx, firmId, changes, "fo_prospect", "subject_company_id", l, s);
}

/** AG-2-16 rule 2b: every consent and every withdrawal of the loser, written again for the survivor. */
async function copyConsent(tx: Tx, ports: MergePorts, firmId: string, s: string, l: string, actor: string) {
  const copied: MergeSnapshot["copied"] = { consents: [], withdrawals: [] };
  const consents = await tx.msgConsent.findMany({ where: firmScope(firmId, { subjectKind: "FO_PERSON" as const, subjectId: l }), orderBy: [{ givenAt: "asc" }, { id: "asc" }] });
  for (const c of consents) {
    const out = await ports.consent.record(tx, { firmId, subject: { kind: "FO_PERSON", id: s }, channel: c.channel, purpose: c.purpose, ...(c.wordingId ? { wordingId: c.wordingId } : {}),
      basis: c.basis, source: c.source, recordedKind: "SYSTEM", recordedBy: actor, copiedFromId: c.id });
    copied.consents.push(out.id);
  }
  const withdrawals = await tx.msgConsentWithdrawal.findMany({ where: firmScope(firmId, { subjectKind: "FO_PERSON" as const, subjectId: l }), orderBy: [{ withdrawnAt: "asc" }, { id: "asc" }] });
  for (const w of withdrawals) {
    const out = await ports.consent.withdraw(tx, { firmId, subject: { kind: "FO_PERSON", id: s }, channel: w.channel, purpose: w.purpose, via: w.via, by: actor, at: w.withdrawnAt });
    copied.withdrawals.push(out.withdrawalId);
  }
  return copied;
}

/** Every row that reaches the survivor (or a lead moved to it), by table and id: kept at the merge, compared at Undo, so
 *  "something new arrived" needs no clock (break and review round 2 m2/m3). A withdrawal is not counted: it only ever
 *  narrows what may be sent, and it stays after Undo (consent rows are never removed). */
async function reaching(tx: Tx, firmId: string, kind: MergeKind, s: string, changes: Change[]): Promise<string[]> {
  const leads = changes.filter((c) => c.t === "fo_lead" && c.c === "person_id").map((c) => c.id);
  const q = kind === "PERSON"
    ? `select 'fo_lead:' || "id" as k from "fo_lead" where "firm_id" = $1::uuid and "person_id" = $2::uuid
       union all select 'fo_note:' || "id" from "fo_note" where "firm_id" = $1::uuid and "person_id" = $2::uuid
       union all select 'fo_call:' || "id" from "fo_call" where "firm_id" = $1::uuid and "person_id" = $2::uuid
       union all select 'fo_arrival_receipt:' || "id" from "fo_arrival_receipt" where "firm_id" = $1::uuid and "person_id" = $2::uuid
       union all select 'fo_booking:' || "id" from "fo_booking" where "firm_id" = $1::uuid and "person_id" = $2::uuid
       union all select 'fo_company_contact:' || "id" from "fo_company_contact" where "firm_id" = $1::uuid and "person_id" = $2::uuid
       union all select 'fo_prospect:' || "id" from "fo_prospect" where "firm_id" = $1::uuid and ("subject_person_id" = $2::uuid or "primary_contact_person_id" = $2::uuid or "lead_id" = any($3::uuid[]))
       union all select 'msg_consent:' || "id" from "msg_consent" where "firm_id" = $1::uuid and "subject_kind" = 'FO_PERSON' and "subject_id" = $2::uuid`
    : `select 'fo_company_contact:' || "id" as k from "fo_company_contact" where "firm_id" = $1::uuid and "company_id" = $2::uuid
       union all select 'fo_prospect:' || "id" from "fo_prospect" where "firm_id" = $1::uuid and "subject_company_id" = $2::uuid and cardinality($3::uuid[]) >= 0`;
  return (await tx.$queryRawUnsafe<{ k: string }[]>(q, firmId, s, leads)).map((r) => r.k).sort();
}

/** Merges `loser_fo_id` into `survivor_fo_id` in `tx` (PersonMergePort.mergePersons). `automatic`: part 2's safe merge. */
export async function mergeRecords(tx: Tx, ctx: StaffContext, raw: unknown, ports: MergePorts, opts: { automatic?: boolean } = {}): Promise<MergeResult> {
  mayMerge(ctx);
  const parsed = MergePersonsInput.safeParse(raw);
  if (!parsed.success) return refuse("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data, firmId = firmScope(ctx.firmId).firmId;
  const sId = input.survivor_fo_id.toLowerCase(), lId = input.loser_fo_id.toLowerCase();
  if (sId === lId) refuse("SELF_MERGE", "A record cannot be merged into itself.");
  await lockPair(tx, sId, lId);
  const { l, s } = await lockPairFor(tx, firmId, input.kind, lId, sId);
  if (!s || !l) return refuse("NOT_FOUND", "No such record.");
  if (s.row.merged_into_id || l.row.merged_into_id) refuse("ALREADY_MERGED", "This record was already merged.");
  if (s.kind !== l.kind || s.kind !== input.kind) refuse("KIND_MISMATCH", "A person and a company cannot be merged.");
  // One standing merge per loser (the database's fo_dup_merge_one_standing): refused before anything is written.
  if (await tx.foDupMerge.count({ where: firmScope(firmId, { loserId: lId, undoneAt: null }) })) refuse("ALREADY_MERGED", "This record has a merge that is not undone.");
  const kind = input.kind, automatic = !!opts.automatic, actor = actorOf(ctx, automatic);
  if (kind === "COMPANY") {   // refused before anything is written (review m1, break m2): two live primary contacts of two people
    const [two] = await tx.$queryRawUnsafe<{ n: number }[]>(`select count(distinct "person_id")::int as n from "fo_company_contact" where "firm_id" = $1::uuid and "company_id" in ($2::uuid, $3::uuid) and "role" = 'PRIMARY' and "valid_to" is null`, firmId, sId, lId);
    if (two.n > 1) refuse("INVALID_INPUT", "Both companies have a primary contact. End one of the two links first.");
  }

  // 1. the chosen values to the survivor (AG-2-16 rule 1)
  const picks: Record<string, FieldPick> = resolvePicks(kind, { fields: fieldsOf(kind, s.row), updatedAt: new Date(String(s.row.updated_at)) }, { fields: fieldsOf(kind, l.row), updatedAt: new Date(String(l.row.updated_at)) }, input.choices);
  const data: Record<string, unknown> = {};
  for (const [f, p] of Object.entries(picks)) if (p === "LOSER") {
    data[f] = l.row[column(f)] ?? null;
    if (COMPANION[f]) data[COMPANION[f].field] = l.row[COMPANION[f].column];
  }
  const fromLoser = Object.keys(picks).filter((f) => picks[f] === "LOSER");
  if (fromLoser.length) {
    if (kind === "PERSON") await tx.foPerson.updateMany({ where: firmScope(firmId, { id: sId }), data });
    else await tx.foCompany.updateMany({ where: firmScope(firmId, { id: sId }), data });
  }
  // 2. every row that names the loser (columns.ts MOVE), consent (COPY)
  await merging(tx, true);
  const changes: Change[] = [];
  if (kind === "PERSON") await movePerson(tx, firmId, sId, lId, changes);
  else await moveCompany(tx, firmId, sId, lId, changes);
  await merging(tx, false);   // off again for the rest of the caller's transaction (review m2)
  const copied = kind === "PERSON" ? await copyConsent(tx, ports, firmId, sId, lId, actor) : { consents: [], withdrawals: [] };
  // 3. the tombstone, the record, audit, the outbox row last
  const at = await dbNow(tx);
  if (kind === "PERSON") await tx.foPerson.updateMany({ where: firmScope(firmId, { id: lId }), data: { mergedIntoId: sId, mergedAt: at } });
  else await tx.foCompany.updateMany({ where: firmScope(firmId, { id: lId }), data: { mergedIntoId: sId, mergedAt: at } });
  const ref = randomUUID();
  const after = (await find(tx, firmId, sId))!.row;
  const present = await reaching(tx, firmId, kind, sId, changes);
  const snapshot: MergeSnapshot = { loser: l.row, changes, copied, survivorAfter: valuesOf(kind, after), present };
  await tx.foDupMerge.create({ data: { id: ref, firmId, kind, survivorId: sId, loserId: lId, loserSnapshot: snapshot as unknown as Prisma.InputJsonValue, survivorBefore: valuesOf(kind, s.row) as Prisma.InputJsonValue,
    choices: picks, automatic, reason: input.reason ?? null, by: actor, at } });
  const what = kind === "PERSON" ? "person" : "company";
  const line = { firmId, actor, action: EVENT.PERSON_MERGED, entityKey: lId,
    summary: `${automatic ? "Merged by itself" : "Merged"}: ${what} record ${lId} into ${sId} (merge ${ref}); ${changes.length} row${changes.length === 1 ? "" : "s"} moved.`,
    detail: { mergeRef: ref, kind, survivorId: sId, loserId: lId, automatic, fieldsFromLoser: fromLoser, rowsChanged: changes.length, consentsCopied: copied.consents.length, withdrawalsCopied: copied.withdrawals.length } };
  if (kind === "PERSON") await ports.audit.record(tx, { entity: "fo_person", ...line, before: { mergedIntoId: null }, after: { mergedIntoId: sId } });
  else await ports.audit.record(tx, { entity: "fo_company", ...line, before: { mergedIntoId: null }, after: { mergedIntoId: sId } });
  await (ports.emit ?? outbox)(tx, { firmId, type: EVENT.PERSON_MERGED, subjectId: sId, payload: { mergeRef: ref, kind, survivorId: sId, loserId: lId } });
  return { merge_ref: ref };
}

/** Undoes one merge in `tx` (PersonMergePort.unmergePersons). */
export async function unmergeRecords(tx: Tx, ctx: StaffContext, ref: string, ports: MergePorts): Promise<UnmergeResult> {
  mayMerge(ctx);
  const firmId = firmScope(ctx.firmId).firmId;
  const first = UUID.test(ref) ? await tx.foDupMerge.findFirst({ where: firmScope(firmId, { id: ref.toLowerCase() }), select: { survivorId: true, loserId: true } }) : null;
  if (!first) return refuse("NOT_FOUND", "No such merge.");
  await lockPair(tx, first.survivorId, first.loserId);
  const m = (await tx.foDupMerge.findFirst({ where: firmScope(firmId, { id: ref.toLowerCase() }) }))!;
  if (m.undoneAt) refuse("ALREADY_UNDONE", "This merge was already undone.");
  const ids = [m.survivorId, m.loserId], kind = m.kind as MergeKind;
  const later = await tx.foDupMerge.findFirst({ where: firmScope(firmId, { id: { not: m.id }, undoneAt: null, at: { gt: m.at }, OR: [{ survivorId: { in: ids } }, { loserId: { in: ids } }] }), select: { id: true } });
  if (later) refuse("UNDO_REFUSED", "A later merge involves one of these records; undo that one first.");
  const snap = m.loserSnapshot as unknown as MergeSnapshot, s = m.survivorId, l = m.loserId;
  if ((snap as unknown as { erased?: boolean })?.erased) refuse("UNDO_REFUSED", "These records were erased under a deletion request; the merge cannot be undone.");   // PF-21d 2b-2
  if (!snap?.changes?.every((c) => UNDOABLE.has(`${c.t}.${c.c}`) && UUID.test(c.id)) || !snap.survivorAfter || !Array.isArray(snap.present)) refuse("UNDO_REFUSED", "This merge record was not written by the merge; it cannot be undone.");
  // Every lock NOWAIT with back-off (lockPairFor, Lead 5's ruling): a writer adding to these records either finished
  // before (and is seen below) or waits for the Undo, which never waits itself.
  const { l: lo, s: sv } = await lockPairFor(tx, firmId, kind, l, s, snap.changes);
  // The record really is this merge's tombstone (break m4: a crafted record naming a live loser moves nothing).
  if (!lo || lo.row.merged_into_id !== s || Date.parse(String(lo.row.merged_at)) !== m.at.getTime()) refuse("UNDO_REFUSED", "This merge record does not match the records; it cannot be undone.");
  // The survivor edited since the merge (break M2): its values are not the merge's any more, so they are not overwritten.
  const nowValues = sv ? valuesOf(kind, sv.row) : {};   // compared field by field (jsonb does not keep key order)
  if (!sv || Object.keys(nowValues).some((k) => JSON.stringify(nowValues[k] ?? null) !== JSON.stringify(snap.survivorAfter[k] ?? null))) refuse("UNDO_REFUSED", "The merged record was edited after the merge; it cannot be undone.");
  // A consent the merge copied is still live (review M2): consent rows are never removed, so the survivor would keep it.
  // Withdrawing the copy first lets the Undo run.
  if (snap.copied.consents.length && await tx.msgConsent.count({ where: firmScope(firmId, { id: { in: snap.copied.consents }, withdrawnAt: null }) }))
    refuse("UNDO_REFUSED", "The merge copied a live consent to the merged record, and consent records are never removed; it cannot be undone while that copy is live.");
  // Anything new on the survivor or a moved lead since the merge (a lead, note, call, arrival, booking, link, prospect or
  // consent; compared by id, no clock) may have come by the loser's email or phone: it cannot be told apart, so the Undo
  // is refused (break M3).
  const was = new Set(snap.present ?? []);
  if ((await reaching(tx, firmId, kind, s, snap.changes)).some((k) => !was.has(k)))
    refuse("UNDO_REFUSED", "Something reached the merged record after the merge (it may have come by the other record's contact details); it cannot be undone.");
  // Every moved cell still holds what the merge wrote (typed comparison, one query per table and column; break m5).
  const byCell = new Map<string, Change[]>();
  for (const c of snap.changes) { const k = `${c.t}.${c.c}.${c.to}`; byCell.set(k, [...(byCell.get(k) ?? []), c]); }
  for (const g of byCell.values()) {
    const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from "${g[0].t}" where "firm_id" = $1::uuid and "id" = any($2::uuid[]) and "${g[0].c}" is not distinct from $3::${g[0].ts ? "timestamptz" : "uuid"}`, firmId, g.map((c) => c.id), g[0].to);
    if (n !== g.length) refuse("UNDO_REFUSED", "A record the merge moved has changed since; it cannot be undone.");
  }
  // The tombstone ends first (the database refuses a row naming a tombstone), then every cell goes back in reverse order:
  // neighbouring cells of one prospect in one statement (its subject and primary contact), else one statement per run of
  // one column and value.
  if (kind === "PERSON") await tx.foPerson.updateMany({ where: firmScope(firmId, { id: l }), data: { mergedIntoId: null, mergedAt: null } });
  else await tx.foCompany.updateMany({ where: firmScope(firmId, { id: l }), data: { mergedIntoId: null, mergedAt: null } });
  await merging(tx, true);
  const groups: Change[][] = [];
  for (const c of [...snap.changes].reverse()) {
    const g = groups[groups.length - 1], row = c.t === "fo_prospect";
    if (g && g[0].t === c.t && (row ? g[0].id === c.id : g[0].c === c.c && g[0].from === c.from)) g.push(c); else groups.push([c]);
  }
  for (const g of groups) {
    if (g[0].t === "fo_prospect") await tx.$executeRawUnsafe(`update "fo_prospect" set ${g.map((c, i) => `"${c.c}" = $${i + 3}::uuid`).join(", ")} where "firm_id" = $1::uuid and "id" = $2::uuid`, firmId, g[0].id, ...g.map((c) => c.from));
    else await tx.$executeRawUnsafe(`update "${g[0].t}" set "${g[0].c}" = $3::${g[0].ts ? "timestamptz" : "uuid"} where "firm_id" = $1::uuid and "id" = any($2::uuid[])`, firmId, g.map((c) => c.id), g[0].from);
  }
  await merging(tx, false);
  const back = m.survivorBefore as Record<string, unknown>;
  if (kind === "PERSON") await tx.foPerson.updateMany({ where: firmScope(firmId, { id: s }), data: back });
  else await tx.foCompany.updateMany({ where: firmScope(firmId, { id: s }), data: back });
  const actor = `staff:${ctx.staffId}`;
  await tx.foDupMerge.update({ where: { id: m.id }, data: { undoneAt: new Date(), undoneBy: actor } });
  const line = { firmId, actor, action: EVENT.PERSON_UNMERGED, entityKey: l,
    summary: `Merge ${m.id} undone: ${kind === "PERSON" ? "person" : "company"} record ${l} is live again; ${snap.changes.length} row${snap.changes.length === 1 ? "" : "s"} moved back.`,
    detail: { mergeRef: m.id, kind, survivorId: s, loserId: l, rowsRestored: snap.changes.length, consentCopiesKept: snap.copied.consents.length } };
  if (kind === "PERSON") await ports.audit.record(tx, { entity: "fo_person", ...line, before: { mergedIntoId: s }, after: { mergedIntoId: null } });
  else await ports.audit.record(tx, { entity: "fo_company", ...line, before: { mergedIntoId: s }, after: { mergedIntoId: null } });
  await (ports.emit ?? outbox)(tx, { firmId, type: EVENT.PERSON_UNMERGED, subjectId: s, payload: { mergeRef: m.id, kind, survivorId: s, loserId: l } });
  return { restored: true };
}
