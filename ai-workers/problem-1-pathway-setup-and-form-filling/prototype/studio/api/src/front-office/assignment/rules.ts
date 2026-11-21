// FO-10 part 1 (P-574 (3); AG-2-13a, -13b, -13d): who owns a new lead that arrives with no owner. The arrival path
// (sales/arrival.ts) calls placeNewLead (place.ts) inside its own transaction; the firm's Owner and Admin keep the rules
// (agent/prospect:configure-source) through AssignmentRules. A lead the rule cannot place lands in Unassigned leads,
// and the lead's `lead.created` audit line names the rule and why (the timeline reads it).
// FO-10 part 2 (P-773): the firm's sharing setting is its catch-all rule (sharing/setSharing below). Not yet: the rule
// as an action of PF-20's automation engine (not built), the notices (AG-2-85 rules 9, 10, 20) and the settings panel.
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { type StaffContext } from "../../platform/identity/keys.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { actorOf, conflict, notFound, unprocessable, UUID, type Tx } from "../sales/common.ts";
import { seedFirmFrontOffice } from "../firm-seed.ts";
import { SALES_PORTS, type SalesPorts } from "../sales/public.ts";
import { eligible, RULE_DOORS, type Strategy } from "./place.ts";

export { NO_RULE, placeNewLead, SALES_KEY, type Placement } from "./place.ts";

/** The catch-all rule's criteria: any door, any service. It is the firm's sharing setting (FO-10 part 2). */
const CATCH_ALL = "ANY:ANY";

/** The firm's rules (AG-2-13b: criteria, strategy, eligible set), kept by people holding agent/prospect:configure-source. */
@Injectable()
export class AssignmentRules {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  async list(ctx: StaffContext) {
    const rows = await this.db.foAssignmentRule.findMany({ where: firmScope(ctx.firmId, {}), orderBy: [{ criteriaKey: "asc" }], include: { service: { select: { label: true, active: true } } } });
    return rows.map((r) => ({ id: r.id, door: r.door, serviceId: r.serviceId, serviceLabel: r.service?.label ?? null, serviceActive: r.service ? r.service.active : null, strategy: r.strategy, ownerStaffId: r.ownerStaffId, eligibleStaffIds: r.eligibleStaffIds, active: r.active, updatedAt: r.updatedAt.toISOString() }));
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
        if (b.eligibleStaffIds !== undefined) unprocessable("One person takes no turn list.", { eligibleStaffIds: "Leave empty for one person." });   // break m4
        const [o] = typeof b.ownerStaffId === "string" && UUID.test(b.ownerStaffId) ? await eligible(tx, firmId, [b.ownerStaffId.toLowerCase()]) : [];
        owner = o ?? unprocessable("Choose an active person of your firm who can work leads.", { ownerStaffId: "Choose a person who can work leads." });
      } else {
        if (b.ownerStaffId !== undefined && b.ownerStaffId !== null) unprocessable("Round robin names no single person.", { ownerStaffId: "Leave empty for round robin." });   // break m4
        const asked = b.eligibleStaffIds === undefined ? [] : Array.isArray(b.eligibleStaffIds) && b.eligibleStaffIds.length <= 200 && b.eligibleStaffIds.every((x) => typeof x === "string" && UUID.test(x))
          ? [...new Set((b.eligibleStaffIds as string[]).map((x) => x.toLowerCase()))] : unprocessable("eligibleStaffIds: a list of people of your firm.", { eligibleStaffIds: "A list of people." });
        if (asked.length) {
          const ok = await eligible(tx, firmId, asked);
          if (ok.length !== asked.length) unprocessable("Everyone in the turn must be an active person of your firm who can work leads.", { eligibleStaffIds: "Someone here cannot work leads." });
        }
        among = asked.sort();
      }
      const criteriaKey = `${door ?? "ANY"}:${serviceId ?? "ANY"}`, by = actorOf(ctx);
      // A firm's front office is set up lazily (its first booking or case client): a rule needs its setup row first
      // (review M1 on FO-10 part 2; idempotent). A firm that cannot be set up (closing, deleted) hears so in words.
      await seedFirmFrontOffice(tx, firmId);
      if (!(await tx.foSalesSetup.findUnique({ where: { firmId }, select: { firmId: true } }))) conflict("This firm's front office is not open, so leads are not shared yet.", "NO_FRONT_OFFICE");
      // R1.8 (QA-594): the rule's values before (none for a new rule) and after, in full.
      // Locked first (review r2-m1), so two saves of one criteria at once each record the values they replaced.
      const [was] = await tx.$queryRaw<{ strategy: Strategy; ownerStaffId: string | null; eligibleStaffIds: string[]; active: boolean }[]>`
        select strategy::text as strategy, owner_staff_id::text as "ownerStaffId", eligible_staff_ids::text[] as "eligibleStaffIds", active
        from fo_assignment_rule where firm_id = ${firmId}::uuid and criteria_key = ${criteriaKey} for update`;
      const rule = await tx.foAssignmentRule.upsert({
        where: { firmId_criteriaKey: { firmId, criteriaKey } },
        create: { firmId, door, serviceId, criteriaKey, strategy, ownerStaffId: owner, eligibleStaffIds: among, createdBy: by, updatedBy: by },
        update: { strategy, ownerStaffId: owner, eligibleStaffIds: among, active: true, updatedBy: by, updatedAt: new Date() },
      });
      await this.ports.audit.record(tx, { firmId, actor: by, action: "assignment_rule.saved", entity: "fo_assignment_rule", entityKey: rule.id,
        summary: criteriaKey === CATCH_ALL ? `How new leads are shared set to ${strategy === "OWNER" ? "always one person" : "round robin"}.`
          : `Assignment rule for ${door ?? "any door"}${serviceId ? " and one service" : ""} set to ${strategy === "OWNER" ? "one person" : "round robin"}.`,
        detail: { door, serviceId, strategy, ownerStaffId: owner, eligible: among.length },
        before: was ? { door, serviceId, strategy: was.strategy, ownerStaffId: was.ownerStaffId, eligibleStaffIds: was.eligibleStaffIds, active: was.active } : null,
        after: { door, serviceId, strategy, ownerStaffId: owner, eligibleStaffIds: among, active: true } });
      return { id: rule.id, criteriaKey, strategy, ownerStaffId: owner, eligibleStaffIds: among, active: true };
    });
  }

  /** Switch a rule off: new leads it matched fall to the next rule, or Unassigned; its row and cursor stay. */
  async off(ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound("assignment rule");
    const firmId = firmScope(ctx.firmId).firmId;
    return this.db.$transaction(async (tx) => {
      const r = await tx.foAssignmentRule.findFirst({ where: firmScope(firmId, { id: id.toLowerCase() }), select: { id: true, active: true, criteriaKey: true } }) ?? notFound("assignment rule");
      if (r.active) {
        await tx.foAssignmentRule.update({ where: { id: r.id }, data: { active: false, updatedBy: actorOf(ctx), updatedAt: new Date() } });
        await this.ports.audit.record(tx, { firmId, actor: actorOf(ctx), action: "assignment_rule.off", entity: "fo_assignment_rule", entityKey: r.id, summary: r.criteriaKey === CATCH_ALL ? "How new leads are shared set to anyone takes it." : "Assignment rule switched off.", detail: {}, before: { active: true }, after: { active: false } });
      }
      return { id: r.id, active: false };
    });
  }

  // ------------------------------------------------------------------ the firm's sharing setting (FO-10 part 2; P-773)
  /** "How new leads are shared" (AG-2-85 rule 3) is the firm's default rule: the catch-all rule (any door, any service).
   *  Anyone takes it = no active catch-all; Round robin and Always one person = that rule. Door and service rules (P-574)
   *  still come first, being more specific. */
  async sharing(ctx: StaffContext) {
    const r = await this.db.foAssignmentRule.findUnique({ where: { firmId_criteriaKey: { firmId: firmScope(ctx.firmId).firmId, criteriaKey: CATCH_ALL } } });
    if (!r?.active) return { mode: "ANYONE" as const, onePersonStaffId: null, rotationStaffIds: [] as string[] };
    return r.strategy === "OWNER" ? { mode: "ONE_PERSON" as const, onePersonStaffId: r.ownerStaffId, rotationStaffIds: [] as string[] } : { mode: "ROUND_ROBIN" as const, onePersonStaffId: null, rotationStaffIds: r.eligibleStaffIds };
  }

  async setSharing(ctx: StaffContext, b: Record<string, unknown>) {
    const extra = Object.keys(b).filter((k) => !["mode", "onePersonStaffId", "rotationStaffIds"].includes(k));
    if (extra.length) unprocessable(`Unknown field: ${extra[0]}.`, { [extra[0]]: "Not a field of the sharing setting." });
    // The body GET answers can be sent back with only the mode changed (review m2): an empty list and a null person are "none".
    const list = b.rotationStaffIds === undefined || b.rotationStaffIds === null || (Array.isArray(b.rotationStaffIds) && b.rotationStaffIds.length === 0) ? null : b.rotationStaffIds;
    const firmId = firmScope(ctx.firmId).firmId;
    if (b.mode === "ANYONE") {
      if (b.onePersonStaffId != null || list !== null) unprocessable("Anyone takes it names nobody.", { mode: "Anyone takes it names nobody." });
      const r = await this.db.foAssignmentRule.findUnique({ where: { firmId_criteriaKey: { firmId: firmScope(ctx.firmId).firmId, criteriaKey: CATCH_ALL } }, select: { id: true } });
      if (r) await this.off(ctx, r.id);
    } else if (b.mode === "ONE_PERSON") {
      if (list !== null) unprocessable("Always one person takes no rotation list.", { rotationStaffIds: "Leave empty for one person." });
      // Checked here so the error names this setting's field (review m3); save() checks it again in its transaction.
      const [o] = typeof b.onePersonStaffId === "string" && UUID.test(b.onePersonStaffId) ? await eligible(this.db as unknown as Tx, firmId, [b.onePersonStaffId.toLowerCase()], false) : [];
      if (!o) unprocessable("Choose an active person of your firm who can work leads.", { onePersonStaffId: "Choose a person who can work leads." });
      await this.save(ctx, { strategy: "OWNER", ownerStaffId: o });
    } else if (b.mode === "ROUND_ROBIN") {
      if (b.onePersonStaffId != null) unprocessable("Round robin names no single person.", { onePersonStaffId: "Leave empty for round robin." });
      // AG-2-85 rule 3: round robin is "between the people the admin ticks": the list is required, never "everyone" by
      // omission (break M1 on FO-10 part 2: an omitted list had silently widened the turn to every sales person).
      const ok = (Array.isArray(list) && list.length <= 200 && list.every((x) => typeof x === "string" && UUID.test(x)) ? [...new Set((list as string[]).map((x) => x.toLowerCase()))] : null)
        ?? unprocessable("Tick the people who share new leads.", { rotationStaffIds: "Tick at least one person." });
      if ((await eligible(this.db as unknown as Tx, firmId, ok, false)).length !== ok.length) unprocessable("Everyone ticked must be an active person of your firm who can work leads.", { rotationStaffIds: "Someone here cannot work leads." });
      await this.save(ctx, { strategy: "ROUND_ROBIN", eligibleStaffIds: ok });
    } else unprocessable("Choose Anyone takes it, Round robin or Always one person.", { mode: "Choose ANYONE, ROUND_ROBIN or ONE_PERSON." });
    return this.sharing(ctx);
  }
}
