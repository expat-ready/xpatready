// FO-10 part 1 (P-574 (3); AG-2-13a, -13d): the placement engine, called by the one arrival path (sales/arrival.ts) inside
// its own transaction. Kept apart from the rules service (rules.ts) so the arrival path imports nothing that imports
// sales/public.ts: public.ts → arrival.ts → here must never loop back to public.ts (an import cycle left SALES_PORTS
// uninitialised for any suite that loaded public.ts first; merge batch #2500, check_fo9a_phone_edit).
import { firmScope } from "../../platform/firm-scope.ts";
import type { Tx } from "../sales/common.ts";

/** The sales key a person needs to take a turn in round robin: the key that lets them work a lead (Take it). */
export const SALES_KEY = "agent/prospect:edit";
export const RULE_DOORS = ["WEB_FORM", "BOOKING"] as const;   // a hand-added lead belongs to its adder (AG-2-4 rule 8)
type Door = "WEB_FORM" | "MANUAL" | "BOOKING";
export type Strategy = "OWNER" | "ROUND_ROBIN";

export type Placement = {
  ownerStaffId: string | null;
  ruleId: string | null;
  strategy: Strategy | null;
  /** Why a matching rule placed no one: its named owner is not active or lost the sales key, or nobody in its set is active with the key. */
  fallback: "OWNER_INACTIVE" | "NO_ELIGIBLE" | null;
};
export const NO_RULE: Placement = { ownerStaffId: null, ruleId: null, strategy: null, fallback: null };

/** Active staff of the firm holding the sales key through a live grant (an ended grant gives no key, as the guard reads
 *  it: identity/service.ts), ordered by id (the round robin's fixed order), within `among` when given. The rows are
 *  share-locked, so a deactivation waits for the arrival that picked the person (break m3). */
export async function eligible(tx: Tx, firmId: string, among: string[]): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    select s.id::text from platform_staff s
    where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
      and exists (select 1 from platform_role_grant g join platform_role_permission rp on rp.role = g.role
                  where g.staff_id = s.id and g.ended_at is null and rp.permission_key = ${SALES_KEY})
      and (cardinality(${among}::uuid[]) = 0 or s.id = any(${among}::uuid[]))
    order by s.id
    for share of s`;
  return rows.map((r) => r.id);
}

/** AG-2-13a: the most specific active rule for the lead's door and service (service first, then door): its owner, or the
 *  next person after the rule's cursor (AG-2-13d). */
export async function placeNewLead(tx: Tx, firmId: string, door: Door, serviceId: string | null): Promise<Placement> {
  if (door === "MANUAL") return NO_RULE;
  const [rule] = await tx.$queryRaw<{ id: string; strategy: Strategy; owner: string | null; among: string[]; last: string | null }[]>`
    select id::text, strategy::text as strategy, owner_staff_id::text as owner, eligible_staff_ids::text[] as among, last_staff_id::text as last
    from fo_assignment_rule
    where firm_id = ${firmId}::uuid and active
      and (door is null or door = ${door}::"FoDoor") and (service_id is null or service_id = ${serviceId}::uuid)
    order by (service_id is not null) desc, (door is not null) desc
    limit 1`;
  if (!rule) return NO_RULE;
  if (rule.strategy === "OWNER") {
    // The named person must still be able to work leads (break M2): active, with the sales key; else Unassigned.
    const [able] = await eligible(tx, firmId, [rule.owner!]);
    return { ownerStaffId: able ?? null, ruleId: rule.id, strategy: "OWNER", fallback: able ? null : "OWNER_INACTIVE" };
  }
  // Only round robin writes its rule, so only it locks the row (review m2): parallel arrivals take turns one after another,
  // reading the cursor afresh under the lock. A rule switched off or replaced meanwhile is read again as it now stands.
  const [locked] = await tx.$queryRaw<{ last: string | null; among: string[]; strategy: Strategy; active: boolean }[]>`
    select last_staff_id::text as last, eligible_staff_ids::text[] as among, strategy::text as strategy, active
    from fo_assignment_rule where firm_id = ${firmId}::uuid and id = ${rule.id}::uuid for update`;
  if (!locked?.active || locked.strategy !== "ROUND_ROBIN") return placeNewLead(tx, firmId, door, serviceId);
  rule.last = locked.last; rule.among = locked.among;
  const set = await eligible(tx, firmId, rule.among);
  if (!set.length) return { ownerStaffId: null, ruleId: rule.id, strategy: "ROUND_ROBIN", fallback: "NO_ELIGIBLE" };
  const next = set.find((id) => rule.last !== null && id > rule.last) ?? set[0];
  await tx.foAssignmentRule.update({ where: { id: rule.id }, data: { lastStaffId: next } });
  return { ownerStaffId: next, ruleId: rule.id, strategy: "ROUND_ROBIN", fallback: null };
}
