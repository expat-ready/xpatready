// FO-9b part 0: the front office's person merge door (case-side contract v0.1 §3.3 and §7; AG-2-16). The case side's
// ClientMergePort (CS-K2) calls mergePersons inside its own transaction when a client merge involves front-office
// records; FO-9b's guided merge (part 1) and safe automatic merge (part 2, P-574 (2)) call it too. The adapter
// (FO-9b part 1, api/src/front-office/duplicates/merge/port.ts) runs inside the caller's `tx` and never opens its own,
// so a caller's rollback leaves nothing merged; it writes `person.merged` / `person.unmerged` (EVENT.*) last in that tx.
// Shape: CS-K2's brief, contract gap 1 (`kind`, `survivor_fo_id`, `loser_fo_id`), plus two optional fields: `choices`
// (AG-2-16 rule 1, field by field) and `reason`. This file imports only zod and its own folder (contract §1 rule 3).
import { z } from "zod";
import { EVENT } from "./events.ts";
import type { StaffContext } from "./staff.ts";

/** The key that allows a merge or its Undo (AG-2-16 §8: Owner, Admin, Case Manager; seeded on main by PF-3). */
export const MERGE_KEY = "agent/prospect:merge";

/** AG-2-16 rule 8: two persons or two companies, never one of each. */
export const MergeKind = z.enum(["PERSON", "COMPANY"]);
export type MergeKind = z.infer<typeof MergeKind>;

/** The fields a merge chooses between, per kind (fo_person's and fo_company's own columns, by their Prisma names).
 *  Companion columns travel with their field: `phone` carries `phoneReadable`, `operatingName` carries `normalisedName`. */
export const MERGE_FIELDS = {
  PERSON: ["givenNames", "familyName", "email", "phone", "language", "timeZone"],
  COMPANY: ["operatingName"],
} as const satisfies Record<MergeKind, readonly string[]>;

/** Which record's value a field keeps. */
export const FieldPick = z.enum(["SURVIVOR", "LOSER"]);
export type FieldPick = z.infer<typeof FieldPick>;

const Uuid = z.string().uuid();
export const MergePersonsInput = z.strictObject({
  kind: MergeKind,
  survivor_fo_id: Uuid,
  loser_fo_id: Uuid,
  /** Field name → pick (the guided merge). A field left out, or no `choices` at all (the case side's call), takes the
   *  default of AG-2-16 rule 1: the most complete value, then the most recent (`defaultPick`). */
  choices: z.record(z.string(), FieldPick).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
}).superRefine((v, c) => {
  const known: readonly string[] = MERGE_FIELDS[v.kind];
  for (const f of Object.keys(v.choices ?? {})) if (!known.includes(f)) c.addIssue({ code: "custom", path: ["choices", f], message: `not a ${v.kind} field` });
});
export type MergePersonsInput = z.input<typeof MergePersonsInput>;

/** `merge_ref` is the merge record's id (fo_dup_merge.id in part 1): the Undo names it. */
export const MergeResult = z.strictObject({ merge_ref: Uuid });
export type MergeResult = z.infer<typeof MergeResult>;
export const UnmergeResult = z.strictObject({ restored: z.literal(true) });
export type UnmergeResult = z.infer<typeof UnmergeResult>;

/** Why a merge or an Undo was refused, with the HTTP status a route answers (AG-2-16 rules 4, 5, 8; §8). A refusal
 *  changes nothing; the adapter throws it, so the caller's transaction rolls back. */
export const MERGE_REFUSAL = {
  INVALID_INPUT: 400,
  SELF_MERGE: 400,
  MISSING_PERMISSION: 403,
  /** Another firm's record or merge, or none: 404, never 403 (no hint that it exists). */
  NOT_FOUND: 404,
  KIND_MISMATCH: 409,
  ALREADY_MERGED: 409,
  /** Undo: something reached the survivor from the loser's channel after the merge. */
  UNDO_REFUSED: 409,
  ALREADY_UNDONE: 409,
} as const;
export type MergeRefusalCode = keyof typeof MERGE_REFUSAL;
export class PersonMergeRefused extends Error {
  readonly status: number;
  constructor(readonly code: MergeRefusalCode, message: string) { super(message); this.name = "PersonMergeRefused"; this.status = MERGE_REFUSAL[code]; }
}

/** The port. `Tx` is the caller's transaction (a Prisma transaction client in the API). */
export interface PersonMergePort<Tx = unknown> {
  /** Merges `loser_fo_id` into `survivor_fo_id` in `tx`: chosen values to the survivor first, every row moved, consent
   *  copied, the loser tombstoned (never deleted), audit, then `person.merged`. Refuses with PersonMergeRefused. */
  mergePersons(tx: Tx, ctx: StaffContext, input: MergePersonsInput): Promise<MergeResult>;
  /** Undoes one merge in `tx`: both records and exactly the moved rows restored, then `person.unmerged`. Refused once
   *  anything reached the survivor from the loser's channel after the merge, while a later merge naming either record
   *  stands (undo that one first; else a tombstone would come back live, AG-2-16 rule 5), or when it was undone already.
   *  Restoring both records exactly means the merge record keeps the survivor's replaced values too, not only the
   *  loser's snapshot (part 1's fo_dup_merge). */
  unmergePersons(tx: Tx, ctx: StaffContext, merge_ref: string): Promise<UnmergeResult>;
}

/** One side of a field: its value and when its record last changed. */
export type FieldSide = { value: unknown; updatedAt: Date };
const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);

/** AG-2-16 rule 1's default: a value beats no value (most complete); with both, the more recently changed record's
 *  (most recent: the record's updated_at, as there are no per-field times, so any write, an earlier merge included,
 *  makes a record the newer one); a tie keeps the survivor's. */
export function defaultPick(survivor: FieldSide, loser: FieldSide): FieldPick {
  if (present(survivor.value) !== present(loser.value)) return present(survivor.value) ? "SURVIVOR" : "LOSER";
  return loser.updatedAt.getTime() > survivor.updatedAt.getTime() ? "LOSER" : "SURVIVOR";
}

/** Every field of `kind` with its pick: the caller's choice, else the default. */
export function resolvePicks(kind: MergeKind, survivor: { fields: Record<string, unknown>; updatedAt: Date }, loser: { fields: Record<string, unknown>; updatedAt: Date }, choices: Record<string, FieldPick> = {}): Record<string, FieldPick> {
  return Object.fromEntries(MERGE_FIELDS[kind].map((f) => [f, choices[f] ?? defaultPick({ value: survivor.fields[f], updatedAt: survivor.updatedAt }, { value: loser.fields[f], updatedAt: loser.updatedAt })]));
}

// ------------------------------------------------------------------------------------------------------------ fake
type FakeRecord = { id: string; firmId: string; kind: MergeKind; fields: Record<string, unknown>; updatedAt: Date; mergedIntoId: string | null };
type FakeMerge = { ref: string; firmId: string; survivor: FakeRecord; loser: FakeRecord; at: number; undone: boolean; touchedAfter: boolean };
export type FakePersonMerge = PersonMergePort<unknown> & {
  /** Adds a record to the fake's store (committed), returns its id. */
  seed(firmId: string, kind: MergeKind, fields: Record<string, unknown>, updatedAt?: Date): string;
  read(id: string): { fields: Record<string, unknown>; mergedIntoId: string | null } | null;
  /** The events written so far, in order (a transaction's own drop out when it is discarded). */
  events(): { type: string; payload: { mergeRef: string; kind: MergeKind; survivorId: string; loserId: string } }[];
  /** Stands in for a new note on the survivor from the loser's email (it makes the Undo refuse). */
  addFromLoserChannel(merge_ref: string): void;
  /** Reverts everything done under `tx` (a test standing in for a rolled-back transaction). */
  discard(tx: unknown): void;
  /** Runs `fn` in a fresh transaction; a throw reverts it. */
  transaction<T>(fn: (tx: object) => Promise<T>): Promise<T>;
};

/** An in-memory PersonMergePort with the adapter's refusals, defaults and Undo, for callers' tests (CS-K2). */
export function fakePersonMerge(): FakePersonMerge {
  const records = new Map<string, FakeRecord>(), merges = new Map<string, FakeMerge>();
  const events: { tx: unknown; type: string; payload: { mergeRef: string; kind: MergeKind; survivorId: string; loserId: string } }[] = [];
  const undo: { tx: unknown; revert: () => void }[] = [];
  let tick = 0;
  const copy = (r: FakeRecord): FakeRecord => ({ ...r, fields: { ...r.fields } });
  const save = (tx: unknown, r: FakeRecord) => { const was = records.get(r.id); undo.push({ tx, revert: () => { if (was) records.set(was.id, was); else records.delete(r.id); } }); records.set(r.id, r); };
  const allowed = (ctx: StaffContext) => { if (!ctx.keys.includes(MERGE_KEY)) throw new PersonMergeRefused("MISSING_PERMISSION", "You may not merge records."); };
  const fake: FakePersonMerge = {
    async mergePersons(tx, ctx, raw) {
      allowed(ctx);
      const parsed = MergePersonsInput.safeParse(raw);
      if (!parsed.success) throw new PersonMergeRefused("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "));
      const input = parsed.data;
      if (input.survivor_fo_id === input.loser_fo_id) throw new PersonMergeRefused("SELF_MERGE", "A record cannot be merged into itself.");
      const s = records.get(input.survivor_fo_id), l = records.get(input.loser_fo_id);
      if (!s || !l || s.firmId !== ctx.firmId || l.firmId !== ctx.firmId) throw new PersonMergeRefused("NOT_FOUND", "No such record.");
      if (s.mergedIntoId || l.mergedIntoId) throw new PersonMergeRefused("ALREADY_MERGED", "This record was already merged.");
      if (s.kind !== l.kind || s.kind !== input.kind) throw new PersonMergeRefused("KIND_MISMATCH", "A person and a company cannot be merged.");
      const picks = resolvePicks(input.kind, s, l, input.choices);
      const ref = globalThis.crypto.randomUUID();
      const merged = copy(s);
      for (const [f, p] of Object.entries(picks)) if (p === "LOSER") merged.fields[f] = l.fields[f];
      save(tx, merged);
      save(tx, { ...copy(l), mergedIntoId: s.id });
      merges.set(ref, { ref, firmId: ctx.firmId, survivor: copy(s), loser: copy(l), at: ++tick, undone: false, touchedAfter: false });
      undo.push({ tx, revert: () => merges.delete(ref) });
      events.push({ tx, type: EVENT.PERSON_MERGED, payload: { mergeRef: ref, kind: input.kind, survivorId: s.id, loserId: l.id } });
      return { merge_ref: ref };
    },
    async unmergePersons(tx, ctx, ref) {
      allowed(ctx);
      const m = Uuid.safeParse(ref).success ? merges.get(ref) : undefined;
      if (!m || m.firmId !== ctx.firmId) throw new PersonMergeRefused("NOT_FOUND", "No such merge.");
      if (m.undone) throw new PersonMergeRefused("ALREADY_UNDONE", "This merge was already undone.");
      const ids = [m.survivor.id, m.loser.id];
      const later = [...merges.values()].some((o) => o !== m && o.at > m.at && !o.undone && (ids.includes(o.survivor.id) || ids.includes(o.loser.id)));
      if (later) throw new PersonMergeRefused("UNDO_REFUSED", "A later merge involves one of these records; undo that one first.");
      if (m.touchedAfter) throw new PersonMergeRefused("UNDO_REFUSED", "Something reached the merged record from the other record's contact details after the merge; it cannot be undone.");
      save(tx, copy(m.survivor));
      save(tx, copy(m.loser));
      m.undone = true;
      undo.push({ tx, revert: () => { m.undone = false; } });
      events.push({ tx, type: EVENT.PERSON_UNMERGED, payload: { mergeRef: ref, kind: m.survivor.kind, survivorId: m.survivor.id, loserId: m.loser.id } });
      return { restored: true };
    },
    seed(firmId, kind, fields, updatedAt = new Date(Date.parse("2026-11-16T00:00:00Z") + ++tick * 1000)) {
      const id = globalThis.crypto.randomUUID();
      records.set(id, { id, firmId, kind, fields: { ...fields }, updatedAt, mergedIntoId: null });
      return id;
    },
    read(id) { const r = records.get(id); return r ? { fields: { ...r.fields }, mergedIntoId: r.mergedIntoId } : null; },
    events() { return events.map(({ type, payload }) => ({ type, payload: { ...payload } })); },
    addFromLoserChannel(ref) { const m = merges.get(ref); if (m) m.touchedAfter = true; },
    discard(tx) {
      for (let i = undo.length - 1; i >= 0; i--) if (undo[i].tx === tx) { undo[i].revert(); undo.splice(i, 1); }
      for (let i = events.length - 1; i >= 0; i--) if (events[i].tx === tx) events.splice(i, 1);
    },
    async transaction(fn) { const tx = {}; try { return await fn(tx); } catch (err) { fake.discard(tx); throw err; } },
  };
  return fake;
}
