// FO-10 part 1 (P-574 (3); AG-2-13a, -13b, -13d): who owns a new lead that arrives with no owner. The arrival path
// (sales/arrival.ts) calls placeNewLead inside its own transaction; the firm's Owner and Admin keep the rules
// (agent/prospect:configure-source) through AssignmentRules. A lead the rule cannot place lands in Unassigned leads,
// and the lead's `lead.created` audit line names the rule and why (the timeline reads it).
// Not yet (FO-10 part 2, named in the PR): the rule as an action of PF-20's automation engine (not built), the "needs
// you" notification when a rule names an inactive person, and the settings panel.
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { type StaffContext } from "../../platform/identity/keys.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { actorOf, notFound, unprocessable, UUID, type Tx } from "../sales/common.ts";
import { SALES_PORTS, type SalesPorts } from "../sales/public.ts";

/** The sales key a person needs to take a turn in round robin: the key that lets them work a lead (Take it). */
export const SALES_KEY = "agent/prospect:edit";
export const RULE_DOORS = ["WEB_FORM", "BOOKING"] as const;   // a hand-added lead belongs to its adder (AG-2-4 rule 8)
type Door = "WEB_FORM" | "MANUAL" | "BOOKING";
type Strategy = "OWNER" | "ROUND_ROBIN";

export type Placement = {
  ownerStaffId: string | null;
  ruleId: string | null;
  strategy: Strategy | null;
  /** Why a matching rule placed no one: its named owner is not active, or nobody in its set is active with the key. */
  fallback: "OWNER_INACTIVE" | "NO_ELIGIBLE" | null;
};
export const NO_RULE: Placement = { ownerStaffId: null, ruleId: null, strategy: null, fallback: null };

/** Active staff of the firm holding the sales key, ordered by id (the round robin's fixed order), within `among` when given. */
async function eligible(tx: Tx, firmId: string, among: string[]): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    select s.id::text from platform_staff s
    where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
      and exists (select 1 from platform_role_grant g join platform_role_permission rp on rp.role = g.role
                  where g.staff_id = s.id and rp.permission_key = ${SALES_KEY})
      and (cardinality(${among}::uuid[]) = 0 or s.id = any(${among}::uuid[]))
    order by s.id`;
  return rows.map((r) => r.id);
}

/** AG-2-13a: the most specific active rule for the lead's door and service (service first, then door), locked so parallel
 *  arrivals take turns one after another; its owner, or the next person after the rule's cursor (AG-2-13d). */
export async function placeNewLead(tx: Tx, firmId: string, door: Door, serviceId: string | null): Promise<Placement> {
  if (door === "MANUAL") return NO_RULE;
  const [rule] = await tx.$queryRaw<{ id: string; strategy: Strategy; owner: string | null; among: string[]; last: string | null }[]>`
    select id::text, strategy::text as strategy, owner_staff_id::text as owner, eligible_staff_ids::text[] as among, last_staff_id::text as last
    from fo_assignment_rule
    where firm_id = ${firmId}::uuid and active
      and (door is null or door = ${door}::"FoDoor") and (service_id is null or service_id = ${serviceId}::uuid)
    order by (service_id is not null) desc, (door is not null) desc
    limit 1 for update`;
  if (!rule) return NO_RULE;
  if (rule.strategy === "OWNER") {
    const active = await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: rule.owner!, status: "ACTIVE" as const }), select: { id: true } });
    return { ownerStaffId: active?.id ?? null, ruleId: rule.id, strategy: "OWNER", fallback: active ? null : "OWNER_INACTIVE" };
  }
  const set = await eligible(tx, firmId, rule.among);
  if (!set.length) return { ownerStaffId: null, ruleId: rule.id, strategy: "ROUND_ROBIN", fallback: "NO_ELIGIBLE" };
  const next = set.find((id) => rule.last !== null && id > rule.last) ?? set[0];
  await tx.foAssignmentRule.update({ where: { id: rule.id }, data: { lastStaffId: next } });
  return { ownerStaffId: next, ruleId: rule.id, strategy: "ROUND_ROBIN", fallback: null };
}

/** The firm's rules (AG-2-13b: criteria, strategy, eligible set), kept by people holding agent/prospect:configure-source. */
@Injectable()
export class AssignmentRules {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  async list(ctx: StaffContext) {
    const rows = await this.db.foAssignmentRule.findMany({ where: firmScope(ctx.firmId, {}), orderBy: [{ criteriaKey: "asc" }], include: { service: { select: { label: true } } } });
    return rows.map((r) => ({ id: r.id, door: r.door, serviceId: r.serviceId, serviceLabel: r.service?.label ?? null, strategy: r.strategy, ownerStaffId: r.ownerStaffId, eligibleStaffIds: r.eligibleStaffIds, active: r.active, updatedAt: r.updatedAt.toISOString() }));
  }

  /** One rule per criteria: a second save for the same door and service replaces the first and keeps its cursor. */
  async save(ctx: StaffContext, b: Record<string, unknown>) {
    const door = b.door === undefined || b.door === null ? null : (RULE_DOORS as readonly unknown[]).includes(b.door) ? (b.door as (typeof RULE_DOORS)[number])
      : unprocessable(b.door === "MANUAL" ? "A lead added by hand belongs to the person who added it, so no rule applies to it." : "Choose the web form, a booking, or any door.", { door: "Choose WEB_FORM, BOOKING or none." });
    const strategy: Strategy = b.strategy === "OWNER" || b.strategy === "ROUND_ROBIN" ? b.strategy : unprocessable("Choose one person or round robin.", { strategy: "Choose OWNER or ROUND_ROBIN." });
    const firmId = firmScope(ctx.firmId).firmId;
    return this.db.$transaction(async (tx) => {
      let serviceId: string | null = null;
      if (b.serviceId !== undefined && b.serviceId !== null) {
        const s = typeof b.serviceId === "string" && UUID.test(b.serviceId) ? await tx.foService.findFirst({ where: firmScope(firmId, { id: b.serviceId.toLowerCase(), active: true }), select: { id: true } }) : null;
        serviceId = s?.id ?? unprocessable("Choose a service from your firm's list.", { serviceId: "Choose from the list." });
      }
      let owner: string | null = null, among: string[] = [];
      if (strategy === "OWNER") {
        const o = typeof b.ownerStaffId === "string" && UUID.test(b.ownerStaffId) ? await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: b.ownerStaffId.toLowerCase(), status: "ACTIVE" as const }), select: { id: true } }) : null;
        owner = o?.id ?? unprocessable("Choose an active person of your firm.", { ownerStaffId: "Choose a person from the list." });
      } else {
        const asked = b.eligibleStaffIds === undefined ? [] : Array.isArray(b.eligibleStaffIds) && b.eligibleStaffIds.length <= 200 && b.eligibleStaffIds.every((x) => typeof x === "string" && UUID.test(x))
          ? [...new Set((b.eligibleStaffIds as string[]).map((x) => x.toLowerCase()))] : unprocessable("eligibleStaffIds: a list of people of your firm.", { eligibleStaffIds: "A list of people." });
        if (asked.length) {
          const ok = await eligible(tx, firmId, asked);
          if (ok.length !== asked.length) unprocessable("Everyone in the turn must be an active person of your firm who can work leads.", { eligibleStaffIds: "Someone here cannot work leads." });
        }
        among = asked.sort();
      }
      const criteriaKey = `${door ?? "ANY"}:${serviceId ?? "ANY"}`, by = actorOf(ctx);
      const rule = await tx.foAssignmentRule.upsert({
        where: { firmId_criteriaKey: { firmId, criteriaKey } },
        create: { firmId, door, serviceId, criteriaKey, strategy, ownerStaffId: owner, eligibleStaffIds: among, createdBy: by, updatedBy: by },
        update: { strategy, ownerStaffId: owner, eligibleStaffIds: among, active: true, updatedBy: by, updatedAt: new Date() },
      });
      await this.ports.audit.record(tx, { firmId, actor: by, action: "assignment_rule.saved", entity: "fo_assignment_rule", entityKey: rule.id,
        summary: `Assignment rule for ${door ?? "any door"}${serviceId ? " and one service" : ""} set to ${strategy === "OWNER" ? "one person" : "round robin"}.`,
        detail: { door, serviceId, strategy, ownerStaffId: owner, eligible: among.length } });
      return { id: rule.id, criteriaKey, strategy, ownerStaffId: owner, eligibleStaffIds: among, active: true };
    });
  }

  /** Switch a rule off: new leads it matched fall to the next rule, or Unassigned; its row and cursor stay. */
  async off(ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound("assignment rule");
    const firmId = firmScope(ctx.firmId).firmId;
    return this.db.$transaction(async (tx) => {
      const r = await tx.foAssignmentRule.findFirst({ where: firmScope(firmId, { id: id.toLowerCase() }), select: { id: true, active: true } }) ?? notFound("assignment rule");
      if (r.active) {
        await tx.foAssignmentRule.update({ where: { id: r.id }, data: { active: false, updatedBy: actorOf(ctx), updatedAt: new Date() } });
        await this.ports.audit.record(tx, { firmId, actor: actorOf(ctx), action: "assignment_rule.off", entity: "fo_assignment_rule", entityKey: r.id, summary: "Assignment rule switched off.", detail: {} });
      }
      return { id: r.id, active: false };
    });
  }
}
