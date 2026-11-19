// CS-C1b (map row 77; brief design/build-lead-c-briefs/CS-C1b.md): PF-15's plan-limit port, created here with PF-15's
// name and signature (BACKLOG PF-15: one `EntitlementPort.check(firm, metric)` for seats, active individual cases, active
// corporate cases and storage; over a hard limit → 409 PLAN_LIMIT_REACHED with the metric and limit) because PF-15 is
// not on main. PF-15 owns this file: it builds the plan table and the real adapter; this row builds neither. The
// default binding is the allow-all fake (contract v0.1 §6): with no limit configured nothing is refused.
// `used` is the caller's own count, read in the caller's transaction (P-588 (3): an opening counts inside its own
// transaction, so two openings at the same moment cannot both pass); the real adapter refuses a check without it (it
// never reads a usage; review m3), the fake allows.
// A limit is the number of items allowed (SA-3-4): adding one more is allowed while `used` is below it. `firm`: the
// caller's name for the firm: the case side passes its firm key (runtime_case.firm_key) until CS-W1, since the
// case-opening route has no staff session and platform_firm sits behind PF-12's walls. This folder imports only zod.
// PF-15 part 1a: the real adapter is PgEntitlements (api/src/platform/entitlements/limits.ts), which also takes the firm's
// id; its contract is ports/contracts/entitlement-port.contract.ts, run by the fake and by it.
import { z } from "zod";

export const EntitlementMetric = z.enum(["seats", "active_individual_cases", "active_corporate_cases", "storage_mb"]);
export type EntitlementMetric = z.infer<typeof EntitlementMetric>;

/** Allowed, or refused with the metric and its limit (and the usage the check read). PF-15c: `noLivePlan` when the
 *  firm has no live subscription (its limit is 0 because there is no plan, not because the plan says 0). */
export type EntitlementResult = { allowed: true } | { allowed: false; metric: EntitlementMetric; limit: number; used: number; noLivePlan?: true };

export interface EntitlementPort {
  /** May the firm add one more of `metric`? `used`: the caller's count of it now (read in the caller's transaction). */
  check(firm: string, metric: EntitlementMetric, used?: number): Promise<EntitlementResult>;
}

/** PF-15: a limit's meaning. `null` = Unlimited, 0 = none allowed (SA-3-4). Seats and both case metrics are hard
 *  (SA-3-39): allowed while `used` is below the limit. Storage is warn: allowed whatever the usage, unless the firm's
 *  storage limit has turned hard (SA-3-40: still over 14 days after it first went over), when it is allowed only while
 *  `used` (MB) is at or under the limit. An adapter never guesses a usage: `used` is the caller's. */
export const STORAGE_HARD_AFTER_DAYS = 14;

/** The fake: allow-all by default (the default binding); a test sets a limit per metric (`null`: Unlimited), and
 *  `storageHard` makes the storage limit hard as SA-3-40's day 15 does. A limit set without `used` given refuses nothing
 *  it cannot count (it never guesses a usage). */
export function fakeEntitlements(limits: Partial<Record<EntitlementMetric, number | null>> = {}, opts: { storageHard?: boolean } = {}): EntitlementPort {
  return {
    async check(firm, metric, used) {
      z.string().min(1).max(200).parse(firm); EntitlementMetric.parse(metric);
      if (used !== undefined) z.number().int().min(0).parse(used);
      const limit = limits[metric];
      if (limit === undefined || limit === null || used === undefined) return { allowed: true };
      if (metric === "storage_mb" ? !opts.storageHard || used <= limit : used < limit) return { allowed: true };
      return { allowed: false, metric, limit, used };
    },
  };
}
