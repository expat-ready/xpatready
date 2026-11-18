// PF-15 part 2 (brief design/lead-b-briefs/PF-15.md, DW9; SA-3-43, SA-3-62): our team changes one plan's limit on a live
// plan. No route yet: it is wired with PF-4s's `system/plan:approve-change` key (PF-17's console) once PF-4s is on main;
// until then PlanLimitChanges.change is the service, tested with a StaffContext fake (the web-address pattern, PF-25).
// One insert into platform_limit_change does the change (its definer trigger writes the new value, keeps the old one,
// and for a lower limit stores each live firm's first renewal at least 30 days after approval); no downgrade check runs
// and nothing is deleted (SA-3-62). A raise reaches every firm at once. Each firm a lowering reaches gets one audit line
// in the same transaction and, after it commits, the "Live-plan removal notice" email to its Owners (SA-05 Appendix B.4;
// Sample words: the template has no text on main).
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { EntitlementMetric } from "../../../../ports/entitlement.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { StaffContext } from "../../../../ports/staff.ts";
import { asBypass } from "../firm-scope.ts";
import { SYSTEM_REPLY_TO } from "../identity/session/mail.ts";

type Tx = Prisma.TransactionClient;
export const LIMIT_CHANGE_KEY = "system/plan:approve-change";
const COLUMN: Record<EntitlementMetric, string> = { seats: "SEATS", active_individual_cases: "ACTIVE_INDIVIDUAL_CASES", active_corporate_cases: "ACTIVE_CORPORATE_CASES", storage_mb: "STORAGE_MB" };
const WORD: Record<EntitlementMetric, string> = { seats: "staff seats", active_individual_cases: "active individual cases", active_corporate_cases: "active corporate cases", storage_mb: "MB of storage" };
const shown = (v: number | null) => (v === null ? "Unlimited" : String(v));

const Input = z.strictObject({
  plan: z.string().trim().min(1).max(64),
  metric: EntitlementMetric,
  value: z.number().int().min(0).max(1_000_000_000).nullable(),
  reason: z.string().trim().min(3).max(500),
});

export type LimitChangeDeps = { db: PrismaClient; audit: AuditPort<Tx>; clock: ClockPort; mail: MailPort | null };
export type LimitChangeResult = { changeId: string; plan: string; metric: EntitlementMetric; oldValue: number | null; newValue: number | null; lowered: boolean; firms: { firmId: string; effectiveAt: string }[] };

function problem(status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}): never {
  throw new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, code, detail, ...extra }, status as HttpStatus);
}

export class PlanLimitChanges {
  constructor(private readonly d: LimitChangeDeps) {}

  /** Change `plan`'s limit on `metric` to `value` (null: Unlimited; seats at least 1). Our team only (the key). */
  async change(ctx: StaffContext, input: unknown): Promise<LimitChangeResult> {
    if (!ctx.keys.includes(LIMIT_CHANGE_KEY)) problem(403, "MISSING_PERMISSION", "Only ExpatReady staff change this", "A plan's limits are changed only by ExpatReady staff with the plan-change key.");
    const p = Input.safeParse(input);
    if (!p.success) problem(422, "LIMIT_CHANGE_FIELDS", "Check the highlighted fields", "Some fields need a change.", { fields: Object.fromEntries(p.error.issues.map((i) => [i.path.join(".") || "body", i.message])) });
    const { plan, metric, value, reason } = p.data;
    if (metric === "seats" && (value === null || value < 1)) problem(422, "LIMIT_CHANGE_FIELDS", "Check the highlighted fields", "Seats are at least 1 and never Unlimited.", { fields: { value: "Seats are at least 1 and never Unlimited." } });
    const actor = `staff:${ctx.staffId}`, at = this.d.clock.now();
    const out = await asBypass("platform.entitlements.limit-change", () => this.d.db.$transaction(async (tx) => {
      const planRow = (await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id::text AS id, name FROM platform_plan WHERE code = ${plan} FOR UPDATE`)[0];
      if (!planRow) problem(404, "PLAN_NOT_FOUND", "Not found", "No such plan.");
      let row: { id: string; old: number | null; lowered: boolean };
      try {
        row = (await tx.$queryRaw<{ id: string; old: number | null; lowered: boolean }[]>`
          INSERT INTO platform_limit_change (plan_id, metric, new_value, reason, approved_by, approved_at)
          VALUES (${planRow.id}::uuid, ${COLUMN[metric]}, ${value}, ${reason}, ${actor}, ${at}::timestamptz) RETURNING id::text AS id, old_value AS old, lowered`)[0];
      } catch (e) {
        if (/the limit is already/.test(String(e))) problem(409, "LIMIT_UNCHANGED", "Nothing to change", `${planRow.name} already allows ${shown(value)} ${WORD[metric]}.`);
        throw e;
      }
      const firms = await tx.$queryRaw<{ firmId: string; effectiveAt: Date }[]>`SELECT firm_id::text AS "firmId", effective_at AS "effectiveAt" FROM platform_limit_change_firm WHERE change_id = ${row.id}::uuid ORDER BY firm_id`;
      for (const f of firms) await this.d.audit.record(tx, { firmId: f.firmId, actor, action: "plan.limit.lowered", entity: "platform_limit_change", entityKey: row.id,
        summary: `${planRow.name}'s limit on ${WORD[metric]} lowered from ${shown(row.old)} to ${shown(value)}; it applies to this firm from ${f.effectiveAt.toISOString().slice(0, 10)}. Nothing is deleted.`,
        detail: { plan, metric, oldValue: row.old, newValue: value, effectiveAt: f.effectiveAt.toISOString() } });
      const owners = firms.length ? await tx.$queryRaw<{ firmId: string; id: string; email: string }[]>`
        SELECT s.firm_id::text AS "firmId", s.id::text AS id, s.email FROM platform_staff s JOIN platform_role_grant g ON g.staff_id = s.id AND g.firm_id = s.firm_id AND g.role = 'OWNER' AND g.ended_at IS NULL
        WHERE s.status = 'ACTIVE' AND s.firm_id = ANY(${firms.map((f) => f.firmId)}::uuid[]) ORDER BY s.firm_id, s.id` : [];
      return { row, planName: planRow.name, firms, owners };
    }));
    const result: LimitChangeResult = { changeId: out.row.id, plan, metric, oldValue: out.row.old, newValue: value, lowered: out.row.lowered, firms: out.firms.map((f) => ({ firmId: f.firmId, effectiveAt: f.effectiveAt.toISOString() })) };
    if (this.d.mail) for (const o of out.owners) {   // after the commit: a failed email never undoes the change
      const eff = out.firms.find((f) => f.firmId === o.firmId)!.effectiveAt.toISOString().slice(0, 10);
      await this.d.mail.send({ firmId: o.firmId, to: o.email, replyTo: SYSTEM_REPLY_TO, class: "SERVICE", templateKey: "platform.live_plan_removal_notice", idempotencyKey: `limit-change:${out.row.id}:owner:${o.id}`,
        subject: "Live-plan removal notice",
        text: `Your plan (${out.planName}) will allow ${shown(value)} ${WORD[metric]} instead of ${shown(out.row.old)}, from your renewal on ${eff}.\n\nUntil then nothing changes. From then, if your firm is over the new limit, everything it has keeps working and nothing is deleted; new ones are refused until it is back under or on a larger plan.` });
    }
    return result;
  }
}
