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
  /** Why a matching rule placed no one: its named owner is not active or lost the sales key, nobody in its set is active
   *  with the key, or the lead is a possible match, which waits for a person (FO-10 part 2; AG-2-85 rule 10). */
  fallback: "OWNER_INACTIVE" | "NO_ELIGIBLE" | "POSSIBLE_MATCH" | null;
};
export const NO_RULE: Placement = { ownerStaffId: null, ruleId: null, strategy: null, fallback: null };

/** Active staff of the firm holding the sales key through a live grant (an ended grant gives no key, as the guard reads
 *  it: identity/service.ts), ordered by id (the round robin's fixed order), within `among` when given. The rows are
 *  share-locked, so a deactivation waits for the arrival that picked the person (break m3). */
export async function eligible(tx: Tx, firmId: string, among: string[], lock = true): Promise<string[]> {
  // One query, its filter and its lock together (review n1 on FO-10 part 2): a lock that waited on a deactivation sees the
  // row as committed and drops the person, which an unlocked read followed by a lock by id would not.
  const rows = lock
    ? await tx.$queryRaw<{ id: string }[]>`
      select s.id::text from platform_staff s
      where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
        and exists (select 1 from platform_role_grant g join platform_role_permission rp on rp.role = g.role
                    where g.staff_id = s.id and g.ended_at is null and rp.permission_key = ${SALES_KEY})
        and (cardinality(${among}::uuid[]) = 0 or s.id = any(${among}::uuid[]))
      order by s.id
      for share of s`
    : await tx.$queryRaw<{ id: string }[]>`
      select s.id::text from platform_staff s
      where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
        and exists (select 1 from platform_role_grant g join platform_role_permission rp on rp.role = g.role
                    where g.staff_id = s.id and g.ended_at is null and rp.permission_key = ${SALES_KEY})
        and (cardinality(${among}::uuid[]) = 0 or s.id = any(${among}::uuid[]))
      order by s.id`;
  return rows.map((r) => r.id);
}

/** AG-2-13a: the most specific active rule for the lead's door and service (service first, then door): its owner, or the
 *  person in its turn given a lead least recently (FO-10 part 2; AG-2-85 rule 5; the turn persisted per rule, AG-2-13d).
 *  A possible match is placed by no rule and moves no turn (AG-2-85 rule 10): it waits in Unassigned leads. */
export async function placeNewLead(tx: Tx, firmId: string, door: Door, serviceId: string | null, o: { possibleMatch?: boolean } = {}): Promise<Placement> {
  if (door === "MANUAL") return NO_RULE;
  const [rule] = await tx.$queryRaw<{ id: string; strategy: Strategy; owner: string | null }[]>`
    select id::text, strategy::text as strategy, owner_staff_id::text as owner
    from fo_assignment_rule
    where firm_id = ${firmId}::uuid and active
      and (door is null or door = ${door}::"FoDoor") and (service_id is null or service_id = ${serviceId}::uuid)
    order by (service_id is not null) desc, (door is not null) desc
    limit 1`;
  if (!rule) return NO_RULE;
  if (o.possibleMatch) return { ownerStaffId: null, ruleId: rule.id, strategy: rule.strategy, fallback: "POSSIBLE_MATCH" };
  if (rule.strategy === "OWNER") {
    // The named person must still be able to work leads (break M2): active, with the sales key; else Unassigned.
    const [able] = await eligible(tx, firmId, [rule.owner!]);
    return { ownerStaffId: able ?? null, ruleId: rule.id, strategy: "OWNER", fallback: able ? null : "OWNER_INACTIVE" };
  }
  // Only round robin writes its rule, so only it locks the row (review m2): parallel arrivals take turns one after another,
  // reading the turns afresh under the lock. A rule switched off or replaced meanwhile is read again as it now stands.
  const [locked] = await tx.$queryRaw<{ among: string[]; strategy: Strategy; active: boolean; turns: Record<string, number> }[]>`
    select eligible_staff_ids::text[] as among, strategy::text as strategy, active, turns
    from fo_assignment_rule where firm_id = ${firmId}::uuid and id = ${rule.id}::uuid for update`;
  if (!locked?.active || locked.strategy !== "ROUND_ROBIN") return placeNewLead(tx, firmId, door, serviceId, o);
  const set = await eligible(tx, firmId, locked.among);
  if (!set.length) return { ownerStaffId: null, ruleId: rule.id, strategy: "ROUND_ROBIN", fallback: "NO_ELIGIBLE" };
  // Least recently given first (never given = 0), ties by id; someone away keeps their old turn, so they come back first.
  // A value that is no whole number (only hand-written SQL could put one there) counts as never given (break m5).
  const turn = (id: string) => { const t = locked.turns[id]; return typeof t === "number" && Number.isSafeInteger(t) && t > 0 ? t : 0; };
  const next = set.reduce((best, id) => (turn(id) < turn(best) ? id : best));
  await tx.$executeRaw`update fo_assignment_rule set turn_no = turn_no + 1, turns = turns || jsonb_build_object(${next}::text, turn_no + 1), last_staff_id = ${next}::uuid
    where firm_id = ${firmId}::uuid and id = ${rule.id}::uuid`;
  return { ownerStaffId: next, ruleId: rule.id, strategy: "ROUND_ROBIN", fallback: null };
}
