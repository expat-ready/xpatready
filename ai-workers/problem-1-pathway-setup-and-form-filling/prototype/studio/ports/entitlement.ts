// CS-C1b (map row 77; brief design/build-lead-c-briefs/CS-C1b.md): PF-15's plan-limit port, created here with PF-15's
// name and signature (BACKLOG PF-15: one `EntitlementPort.check(firm, metric)` for seats, active individual cases, active
// corporate cases and storage; over a hard limit → 409 PLAN_LIMIT_REACHED with the metric and limit) because PF-15 is
// not on main. PF-15 owns this file: it builds the plan table and the real adapter; this row builds neither. The
// default binding is the allow-all fake (contract v0.1 §6): with no limit configured nothing is refused.
// `used` is the caller's own count, read in the caller's transaction (P-588 (3): an opening counts inside its own
// transaction, so two openings at the same moment cannot both pass); without it an adapter reads the usage itself.
// A limit is the number of items allowed (SA-3-4): adding one more is allowed while `used` is below it. `firm`: the
// caller's name for the firm: the case side passes its firm key (runtime_case.firm_key) until CS-W1, since the
// case-opening route has no staff session and platform_firm sits behind PF-12's walls. This folder imports only zod.
import { z } from "zod";

export const EntitlementMetric = z.enum(["seats", "active_individual_cases", "active_corporate_cases", "storage_mb"]);
export type EntitlementMetric = z.infer<typeof EntitlementMetric>;

/** Allowed, or refused with the metric and its limit (and the usage the check read). */
export type EntitlementResult = { allowed: true } | { allowed: false; metric: EntitlementMetric; limit: number; used: number };

export interface EntitlementPort {
  /** May the firm add one more of `metric`? `used`: the caller's count of it now (read in the caller's transaction). */
  check(firm: string, metric: EntitlementMetric, used?: number): Promise<EntitlementResult>;
}

/** The fake: allow-all by default (the default binding); a test sets a limit per metric. A limit set without `used`
 *  given refuses nothing it cannot count (it never guesses a usage). */
export function fakeEntitlements(limits: Partial<Record<EntitlementMetric, number>> = {}): EntitlementPort {
  return {
    async check(firm, metric, used) {
      z.string().min(1).max(200).parse(firm); EntitlementMetric.parse(metric);
      if (used !== undefined) z.number().int().min(0).parse(used);
      const limit = limits[metric];
      if (limit === undefined || used === undefined || used < limit) return { allowed: true };
      return { allowed: false, metric, limit, used };
    },
  };
}
