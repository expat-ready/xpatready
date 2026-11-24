// PF-17 part 4 (R1.93; concept r2 BR-5, challenge M2; Lead 15 on #3225; SA-10 §3.2 "firm (name and plan)"): a firm's live
// plan, the one helper both console pages call (the Firms page in firms.ts, each support queue row and ticket in
// support.ts), so the two pages cannot name different plans. It is PF-15's own read (PgEntitlements.limitOf, its definer
// function platform_entitlement_limit across PF-12's walls): a firm on payment hold or overdue keeps its plan; a firm with
// no live subscription (only an ENDED one, or none) has none (null). Read only.
import { PgEntitlements, type LimitsClient } from "../entitlements/limits.ts";

export type LivePlan = { code: string; name: string };

/** The firm's live plan (code and name), or null when it has none. `client`: the caller's transaction or a client. */
export async function livePlanOf(client: LimitsClient, firmId: string, now: number): Promise<LivePlan | null> {
  const l = await new PgEntitlements(client, () => now).limitOf(firmId, "seats");
  return l.planCode ? { code: l.planCode, name: l.planName ?? l.planCode } : null;
}
