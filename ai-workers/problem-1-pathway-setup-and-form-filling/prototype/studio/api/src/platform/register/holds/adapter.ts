// PF-21b part 2 (map row 85; SA-11 §3.5, SA-11-40, BR-7, BR-12; brief design/briefs/track-b/PF-21b-2.md): LegalHoldPort's
// real adapter over plat_legal_hold (migration 20261122180000_pf21b_legal_holds). It keeps the port file's four rules
// (ports/legal-hold.ts), proven by its shared contract in tests/check_pf21b_holds.ts:
// 1. isHeld runs inside the caller's open transaction (a root client is refused) and answers through the port's one
//    matching rule (`answer`): every matching active hold, each once, oldest first.
// 2. Matching is the port's own (scopeMatches), ALL_FIRM_DATA included (PF-11c's purge).
// 3. It takes the shared hold lock itself, through the caller's transaction, before it reads, and refuses a REPEATABLE
//    READ or SERIALIZABLE transaction (its snapshot could predate a hold committed before the lock was granted).
// 4. A released hold matches nothing (the read takes active holds only).
// Who reads what: a firm's deleter runs as xr_app in its own firm's transaction and reads through the definer
// plat_legal_hold_active(firm), which refuses any other firm and no firm; a caller whose role passes the walls (our
// staff's bypass role, the migration owner in a suite) reads the table itself. Never a value taken from a request.
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { answer, IsHeldQuery, LEGAL_HOLD_LOCK, legalHoldLockKey, type HoldAnswer, type HoldMatch, type HoldScope, type HoldSubject, type LegalHoldPort } from "../../../../../ports/legal-hold.ts";

type Tx = Prisma.TransactionClient;
/** One hold row as the two reads return it. */
export type HoldRow = { id: string; scope_kind: string; target_id: string | null; category: string | null; range_from: Date | null; range_to: Date | null; reason: string; placed_by: string; placed_at: Date };

/** A transaction the port cannot answer in: not the caller's open transaction, or not READ COMMITTED (rule 3). */
export class LegalHoldTxRefused extends Error {
  constructor(message: string) { super(message); this.name = "LegalHoldTxRefused"; }
}

/** A stored row's scope in the port's words. */
export function scopeOf(r: Pick<HoldRow, "scope_kind" | "target_id" | "category" | "range_from" | "range_to">): HoldScope {
  switch (r.scope_kind) {
    case "FIRM": return { kind: "FIRM" };
    case "CASE": return { kind: "CASE", id: r.target_id! };
    case "PERSON": return { kind: "PERSON", id: r.target_id! };
    case "CATEGORY": return { kind: "CATEGORY", category: r.category as Extract<HoldScope, { kind: "CATEGORY" }>["category"] };
    case "DATE_RANGE": return { kind: "DATE_RANGE", from: r.range_from!, to: r.range_to! };
    default: throw new Error(`plat_legal_hold: unknown scope kind ${r.scope_kind}`);
  }
}

@Injectable()
export class PgLegalHolds implements LegalHoldPort<Tx> {
  async isHeld(tx: Tx, firmId: string, subjects: ReadonlyArray<HoldSubject>): Promise<HoldAnswer> {
    const q = IsHeldQuery.parse({ firmId, subjects });
    // Rule 3: only in an open interactive transaction (a root client has $connect; a transaction client has not: AUD-5's check).
    if (!tx || typeof (tx as { $queryRaw?: unknown }).$queryRaw !== "function" || typeof (tx as { $connect?: unknown }).$connect === "function")
      throw new LegalHoldTxRefused("isHeld runs inside the deleter's own open transaction, never on the root client (ports/legal-hold.ts rule 3).");
    const firm = q.firmId.toLowerCase();
    const [s] = await tx.$queryRaw<{ iso: string; passes: boolean }[]>`
      SELECT current_setting('transaction_isolation') AS iso, (SELECT r.rolbypassrls OR r.rolsuper FROM pg_roles r WHERE r.rolname = current_user) AS passes`;
    if (s.iso !== "read committed") throw new LegalHoldTxRefused(`isHeld needs a READ COMMITTED transaction (this one is ${s.iso}): a later snapshot could miss a hold placed before the lock (ports/legal-hold.ts rule 3).`);
    await tx.$executeRawUnsafe(LEGAL_HOLD_LOCK.shared, legalHoldLockKey(firm));
    const rows = s.passes
      ? await tx.$queryRaw<HoldRow[]>`SELECT h.id::text AS id, h.scope_kind::text AS scope_kind, h.target_id::text AS target_id, h.category, h.range_from, h.range_to, h.reason, h.placed_by, h.placed_at
          FROM plat_legal_hold h WHERE h.firm_id = ${firm}::uuid AND h.released_at IS NULL`
      : await tx.$queryRaw<HoldRow[]>`SELECT a.id::text AS id, a.scope_kind, a.target_id::text AS target_id, a.category, a.range_from, a.range_to, a.reason, a.placed_by, a.placed_at
          FROM plat_legal_hold_active(${firm}::uuid) a`;
    const matches: (HoldMatch & { firmId: string; releasedAt: null })[] = rows.map((r) => ({ holdId: r.id, scope: scopeOf(r), reason: r.reason, placedBy: r.placed_by, placedAt: r.placed_at, firmId: firm, releasedAt: null }));
    return answer(matches, q);
  }
}
