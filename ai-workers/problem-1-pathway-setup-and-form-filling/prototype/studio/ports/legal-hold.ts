// PF-21b part 1 (map row 85; brief lead-b-briefs/PF-21b.md): the legal-hold port, interface and fake only. Every deleter
// asks it first (SA-11 §3.5 "no in-scope data can be deleted or disposed of"; BR-7 "legal hold > a firm's keep-period
// warning > a deletion request"): CS-X3's case delete door, AUD-5's check(), PF-21d's erasure job, PF-F2 and PF-11.
// A held deletion answers HELD with the reason, never a false success (BR-12). Part 2 adds plat_legal_hold and the real
// adapter (api/src/platform/register/holds/); holds are placed by the Platform Owner only (`system/compliance:legal-hold`).
//
// The rules every adapter keeps (ports/contracts/legal-hold-port.contract.ts proves them on each):
// 1. isHeld(tx, firmId, subjects) runs inside the caller's transaction and reports EVERY matching active hold, each once,
//    oldest first, never just the first. The firm is the caller's session firm (or the job's firm scope), never a value
//    taken from a request.
// 2. Matching: a FIRM hold matches every subject of its firm; a CASE or PERSON hold matches a subject with that id; a
//    CATEGORY hold matches a subject naming that category; a DATE_RANGE hold matches a DATE subject inside its range, both
//    ends included (§3.5 "a deletion that intersects the hold is suspended"). An ALL_FIRM_DATA subject (the purge of a
//    cancelled firm, PF-11: §3.5 "refuses while any active hold exists") is matched by every active hold of its firm.
//    Another firm's hold never matches.
// 3. No race (the lock rule): isHeld takes the shared advisory lock LEGAL_HOLD_LOCK.shared on `legalHoldLockKey(firmId)`
//    ITSELF, through the caller's tx, before it reads, and keeps it until that transaction ends; placing and releasing a
//    hold take LEGAL_HOLD_LOCK.exclusive on the same key. So a hold placed while a deleter's transaction is open waits for
//    that deleter to finish, and a deleter that starts while a placement is open waits for it and then sees the hold. No
//    caller takes the lock itself. The real adapter reads at READ COMMITTED (each statement a fresh snapshot, so a hold
//    committed before the lock was granted is seen) and refuses a REPEATABLE READ or SERIALIZABLE transaction.
// 4. A released hold matches nothing. Release is recorded, never a delete of the hold.
// Categories: consumers only ADD lines to LEGAL_HOLD_CATEGORY (never rename or reorder); CS-X3's five case-side names ship.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";
import { AuditActor, FirmId } from "./audit.ts";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");

/** The data categories a CATEGORY hold or subject can name. Each module adds its own lines. */
export const LEGAL_HOLD_CATEGORY = ["case_documents", "case_answers", "case_notes", "case_tasks", "case_files"] as const;
export const LegalHoldCategory = z.enum(LEGAL_HOLD_CATEGORY);
export type LegalHoldCategory = z.infer<typeof LegalHoldCategory>;

/** What a deleter is about to delete: its firm, a case, a person record (SA-11-40), a data category, a record's date, or
 *  all of the firm's data at once (the purge of a cancelled firm). */
export const HoldSubject = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("FIRM") }),
  z.strictObject({ kind: z.literal("ALL_FIRM_DATA") }),
  z.strictObject({ kind: z.literal("CASE"), id: Uuid }),
  z.strictObject({ kind: z.literal("PERSON"), id: Uuid }),
  z.strictObject({ kind: z.literal("CATEGORY"), category: LegalHoldCategory }),
  z.strictObject({ kind: z.literal("DATE"), at: z.coerce.date() }),
]);
export type HoldSubject = z.input<typeof HoldSubject>;

/** A hold's scope (§3.5: a firm, a case, a data category or a date range; SA-11-40: one person record). */
export const HoldScope = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("FIRM") }),
  z.strictObject({ kind: z.literal("CASE"), id: Uuid }),
  z.strictObject({ kind: z.literal("PERSON"), id: Uuid }),
  z.strictObject({ kind: z.literal("CATEGORY"), category: LegalHoldCategory }),
  z.strictObject({ kind: z.literal("DATE_RANGE"), from: z.coerce.date(), to: z.coerce.date() }),
]).refine((s) => s.kind !== "DATE_RANGE" || s.from.getTime() <= s.to.getTime(), "a date range ends on or after its start");
export type HoldScope = z.output<typeof HoldScope>;

export const IsHeldQuery = z.strictObject({ firmId: FirmId, subjects: z.array(HoldSubject).min(1, "name at least one subject (an empty ask would pass every delete)").max(200) });

/** One matching hold, enough to answer "Why can't I delete this?" (§3.5: reason and owner). */
export type HoldMatch = { holdId: string; scope: HoldScope; reason: string; placedBy: string; placedAt: Date };
export type HoldAnswer = { held: false } | { held: true; holds: HoldMatch[] };

/** The port. `Tx` is the caller's transaction (a Prisma transaction client in the API); see rule 3 above. */
export interface LegalHoldPort<Tx = unknown> {
  isHeld(tx: Tx, firmId: string, subjects: ReadonlyArray<HoldSubject>): Promise<HoldAnswer>;
}

/** The advisory-lock key of a firm's holds and the two statements (rule 3); the real adapter passes the key as $1. */
export const legalHoldLockKey = (firmId: string) => `legal-hold:${FirmId.parse(firmId).toLowerCase()}`;
export const LEGAL_HOLD_LOCK = {
  shared: "SELECT pg_advisory_xact_lock_shared(hashtext($1))",
  exclusive: "SELECT pg_advisory_xact_lock(hashtext($1))",
} as const;

/** Rule 2: does an active hold of the asking firm with this scope match this subject? */
export function scopeMatches(scope: HoldScope, s: z.output<typeof HoldSubject>): boolean {
  if (s.kind === "ALL_FIRM_DATA") return true;
  switch (scope.kind) {
    case "FIRM": return true;
    case "CASE": return s.kind === "CASE" && s.id.toLowerCase() === scope.id.toLowerCase();
    case "PERSON": return s.kind === "PERSON" && s.id.toLowerCase() === scope.id.toLowerCase();
    case "CATEGORY": return s.kind === "CATEGORY" && s.category === scope.category;
    case "DATE_RANGE": return s.kind === "DATE" && s.at.getTime() >= scope.from.getTime() && s.at.getTime() <= scope.to.getTime();
  }
}

/** Rules 1, 2 and 4 over a firm's hold rows; every adapter answers through this (one matching rule). */
export function answer(rows: ReadonlyArray<HoldMatch & { firmId: string; releasedAt: Date | null }>, q: z.output<typeof IsHeldQuery>): HoldAnswer {
  const firm = q.firmId.toLowerCase();
  const holds = rows
    .filter((r) => r.firmId.toLowerCase() === firm && r.releasedAt === null && q.subjects.some((s) => scopeMatches(r.scope, s)))
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime() || a.holdId.localeCompare(b.holdId))
    .map(({ holdId, scope, reason, placedBy, placedAt }) => ({ holdId, scope, reason, placedBy, placedAt }));
  return holds.length ? { held: true, holds } : { held: false };
}

export const PlaceHoldInput = z.strictObject({ firmId: FirmId, scope: HoldScope, reason: z.string().trim().min(1).max(500), by: AuditActor });
export type PlaceHoldInput = z.input<typeof PlaceHoldInput>;
export const ReleaseHoldInput = z.strictObject({ holdId: Uuid, by: AuditActor, reason: z.string().trim().min(1).max(500) });
export type ReleaseHoldInput = z.input<typeof ReleaseHoldInput>;

/** A placement or release the store refused (unknown hold, released twice). */
export class LegalHoldRefused extends Error {
  constructor(readonly code: "NOT_FOUND" | "ALREADY_RELEASED", message: string) { super(message); this.name = "LegalHoldRefused"; }
}

/** The fake's transaction: locks it took are kept until transaction() ends (rule 3). */
export type FakeHoldTx = { readonly fakeHoldTx: true };
export type FakeLegalHolds = LegalHoldPort<FakeHoldTx | unknown> & {
  /** Runs `fn` as one transaction; shared locks isHeld takes through it end when it settles. */
  transaction<T>(fn: (tx: FakeHoldTx) => Promise<T>): Promise<T>;
  /** Places a hold under the exclusive lock; `during` runs while the lock is held, before the hold is visible. */
  place(input: PlaceHoldInput, during?: () => Promise<void>): Promise<{ holdId: string }>;
  release(input: ReleaseHoldInput, during?: () => Promise<void>): Promise<void>;
};

/** An in-memory store with one reader-writer lock per firm, modelling Postgres' advisory locks (rule 3). */
export function fakeLegalHolds(opts: { now?: () => Date } = {}): FakeLegalHolds {
  const now = opts.now ?? (() => new Date());
  const rows: (HoldMatch & { firmId: string; releasedAt: Date | null })[] = [];
  const locks = new Map<string, { shared: Set<FakeHoldTx>; exclusive: boolean; waiters: (() => void)[] }>();
  const held = new Map<FakeHoldTx, Set<string>>();
  const lockOf = (key: string) => { let l = locks.get(key); if (!l) locks.set(key, (l = { shared: new Set(), exclusive: false, waiters: [] })); return l; };
  const wake = (l: ReturnType<typeof lockOf>) => { const w = l.waiters.splice(0); w.forEach((f) => f()); };
  const until = async (l: ReturnType<typeof lockOf>, free: () => boolean) => { while (!free()) await new Promise<void>((r) => l.waiters.push(r)); };
  async function share(tx: FakeHoldTx, key: string) {
    const l = lockOf(key);
    if (l.shared.has(tx)) return;
    await until(l, () => !l.exclusive);
    l.shared.add(tx); held.get(tx)?.add(key);
  }
  async function exclusively<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const l = lockOf(key);
    await until(l, () => !l.exclusive && l.shared.size === 0);
    l.exclusive = true;
    try { return await fn(); } finally { l.exclusive = false; wake(l); }
  }
  return {
    async transaction(fn) {
      const tx: FakeHoldTx = Object.freeze({ fakeHoldTx: true as const });
      held.set(tx, new Set());
      try { return await fn(tx); } finally {
        for (const key of held.get(tx) ?? []) { const l = lockOf(key); l.shared.delete(tx); wake(l); }
        held.delete(tx);
      }
    },
    async isHeld(tx, firmId, subjects) {
      const q = IsHeldQuery.parse({ firmId, subjects });
      const key = legalHoldLockKey(q.firmId);
      if (tx && typeof tx === "object" && held.has(tx as FakeHoldTx)) await share(tx as FakeHoldTx, key);
      else await until(lockOf(key), () => !lockOf(key).exclusive);   // no open transaction: the lock lasts the one read
      return answer(rows, q);
    },
    async place(input, during) {
      const p = PlaceHoldInput.parse(input);
      return exclusively(legalHoldLockKey(p.firmId), async () => {
        await during?.();
        const holdId = globalThis.crypto.randomUUID();
        rows.push({ holdId, firmId: p.firmId, scope: p.scope, reason: p.reason, placedBy: p.by, placedAt: now(), releasedAt: null });
        return { holdId };
      });
    },
    async release(input, during) {
      const r = ReleaseHoldInput.parse(input);
      const row = rows.find((x) => x.holdId === r.holdId.toLowerCase());
      if (!row) throw new LegalHoldRefused("NOT_FOUND", "No such hold.");
      await exclusively(legalHoldLockKey(row.firmId), async () => {
        await during?.();
        if (row.releasedAt) throw new LegalHoldRefused("ALREADY_RELEASED", "This hold is already released.");
        row.releasedAt = now();
      });
    },
  };
}
