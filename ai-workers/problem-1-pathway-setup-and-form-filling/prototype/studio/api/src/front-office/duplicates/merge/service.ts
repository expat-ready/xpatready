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
export type MergeSnapshot = { loser: Record<string, unknown>; changes: Change[]; copied: { consents: string[]; withdrawals: string[] }; survivorAfter: Record<string, unknown> };

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
    const [r] = await tx.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`select to_jsonb(x) as row from "${TABLE[kind]}" x where x."firm_id" = $1::uuid and x."id" = $2::uuid for update`, firmId, id);
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
async function move(tx: Tx, firmId: string, changes: Change[], t: string, c: string, from: string, to: string | null, where = "") {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`update "${t}" set "${c}" = $3::uuid where "firm_id" = $1::uuid and "${c}" = $2::uuid ${where} returning "id"::text as id`, firmId, from, to);
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
  await move(tx, firmId, changes, "fo_lead", "person_id", l, s);
  for (const t of ["fo_note", "fo_call", "fo_arrival_receipt"]) await move(tx, firmId, changes, t, "person_id", l, s);
  // AG-2-16 rule 10: a flag naming the loser names the survivor, unless that is the lead's own person (then it is done).
  await move(tx, firmId, changes, "fo_lead", "possible_match_person_id", l, s, `and "person_id" <> $3::uuid`);
  await move(tx, firmId, changes, "fo_lead", "possible_match_person_id", l, null);
  await move(tx, firmId, changes, "fo_lead", "possible_match_person_id", s, null, `and "person_id" = $2::uuid`);
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

/** Merges `loser_fo_id` into `survivor_fo_id` in `tx` (PersonMergePort.mergePersons). `automatic`: part 2's safe merge. */
export async function mergeRecords(tx: Tx, ctx: StaffContext, raw: unknown, ports: MergePorts, opts: { automatic?: boolean } = {}): Promise<MergeResult> {
  mayMerge(ctx);
  const parsed = MergePersonsInput.safeParse(raw);
  if (!parsed.success) return refuse("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data, firmId = firmScope(ctx.firmId).firmId;
  const sId = input.survivor_fo_id.toLowerCase(), lId = input.loser_fo_id.toLowerCase();
  if (sId === lId) refuse("SELF_MERGE", "A record cannot be merged into itself.");
  await lockPair(tx, sId, lId);
  const s = await find(tx, firmId, sId), l = await find(tx, firmId, lId);
  if (!s || !l) return refuse("NOT_FOUND", "No such record.");
  if (s.row.merged_into_id || l.row.merged_into_id) refuse("ALREADY_MERGED", "This record was already merged.");
  if (s.kind !== l.kind || s.kind !== input.kind) refuse("KIND_MISMATCH", "A person and a company cannot be merged.");
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
  const snapshot: MergeSnapshot = { loser: l.row, changes, copied, survivorAfter: valuesOf(kind, after) };
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
  if (!snap?.changes?.every((c) => UNDOABLE.has(`${c.t}.${c.c}`) && UUID.test(c.id)) || !snap.survivorAfter) refuse("UNDO_REFUSED", "This merge record was not written by the merge; it cannot be undone.");
  // Lock both records and every moved lead first (break m1): a writer adding to them either finished before (and is seen
  // below) or waits for the Undo.
  const sv = await find(tx, firmId, s);
  await find(tx, firmId, l);
  const leads = snap.changes.filter((c) => c.t === "fo_lead" && c.c === "person_id").map((c) => c.id);
  if (leads.length) await tx.$queryRawUnsafe(`select 1 from "fo_lead" where "firm_id" = $1::uuid and "id" = any($2::uuid[]) for update`, firmId, leads);
  // The survivor edited since the merge (break M2): its values are not the merge's any more, so they are not overwritten.
  const nowValues = sv ? valuesOf(kind, sv.row) : {};   // compared field by field (jsonb does not keep key order)
  if (!sv || Object.keys(nowValues).some((k) => JSON.stringify(nowValues[k] ?? null) !== JSON.stringify(snap.survivorAfter[k] ?? null))) refuse("UNDO_REFUSED", "The merged record was edited after the merge; it cannot be undone.");
  // A consent the merge copied is still live (review M2): consent rows are never removed, so the survivor would keep it.
  if (snap.copied.consents.length && await tx.msgConsent.count({ where: firmScope(firmId, { id: { in: snap.copied.consents }, withdrawnAt: null }) }))
    refuse("UNDO_REFUSED", "The merge copied a live consent to the merged record; consent records are never removed, so it cannot be undone.");
  // Anything new on the survivor or a moved lead since the merge (a lead, note, call, arrival, booking, link, prospect or
  // consent) may have come by the loser's email or phone: it cannot be told apart, so the Undo is refused (break M3).
  const fresh = kind === "PERSON"
    ? `select 1 from "fo_lead" where "firm_id" = $1::uuid and "person_id" = $2::uuid and "created_at" > $3::timestamptz
       union all select 1 from "fo_note" where "firm_id" = $1::uuid and "person_id" = $2::uuid and "created_at" > $3::timestamptz
       union all select 1 from "fo_call" where "firm_id" = $1::uuid and "person_id" = $2::uuid and "created_at" > $3::timestamptz
       union all select 1 from "fo_arrival_receipt" where "firm_id" = $1::uuid and "person_id" = $2::uuid and "received_at" > $3::timestamptz
       union all select 1 from "fo_booking" where "firm_id" = $1::uuid and "person_id" = $2::uuid and "created_at" > $3::timestamptz
       union all select 1 from "fo_company_contact" where "firm_id" = $1::uuid and "person_id" = $2::uuid and "valid_from" > $3::timestamptz
       union all select 1 from "fo_prospect" where "firm_id" = $1::uuid and ("subject_person_id" = $2::uuid or "primary_contact_person_id" = $2::uuid or "lead_id" = any($4::uuid[])) and "created_at" > $3::timestamptz
       union all select 1 from "msg_consent" where "firm_id" = $1::uuid and "subject_kind" = 'FO_PERSON' and "subject_id" = $2::uuid and "created_at" > $3::timestamptz
       union all select 1 from "msg_consent_withdrawal" where "firm_id" = $1::uuid and "subject_kind" = 'FO_PERSON' and "subject_id" = $2::uuid and "created_at" > $3::timestamptz`
    : `select 1 from "fo_company_contact" where "firm_id" = $1::uuid and "company_id" = $2::uuid and "valid_from" > $3::timestamptz
       union all select 1 from "fo_prospect" where "firm_id" = $1::uuid and "subject_company_id" = $2::uuid and "created_at" > $3::timestamptz and cardinality($4::uuid[]) >= 0`;
  if ((await tx.$queryRawUnsafe<{ x: boolean }[]>(`select exists (${fresh}) as x`, firmId, s, m.at, leads))[0].x)
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
