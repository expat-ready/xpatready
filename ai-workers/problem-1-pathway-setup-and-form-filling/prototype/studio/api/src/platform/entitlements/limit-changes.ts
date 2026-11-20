// PF-15 part 2 (brief design/lead-b-briefs/PF-15.md, DW9; SA-3-43, SA-3-62): our team changes one plan's limit on a live
// plan. No route yet: it is wired with PF-4s's `system/plan:approve-change` key (PF-17's console) once PF-4s is on main;
// until then PlanLimitChanges.change is the service, tested with a StaffContext fake (the web-address pattern, PF-25).
// One insert into platform_limit_change does the change (its definer trigger writes the new value, keeps the old one,
// and for a lower limit stores each live firm's first renewal at least 30 days after approval); no downgrade check runs
// and nothing is deleted (SA-3-62). A raise reaches every firm at once. Each firm on the plan gets one audit line in the
// same transaction; after a lowering commits, the "Live-plan removal notice" email goes to the Owners of each firm it
// reaches (SA-05 Appendix B.4; Sample words: the template has no text on main), and can be sent again (sendNotices).
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { EntitlementMetric } from "../../../../ports/entitlement.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { StaffContext } from "../../../../ports/staff.ts";
import { asBypass, touchEachFirm, touchFirm } from "../firm-scope.ts";
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

export type LimitChangeDeps = { db: PrismaClient; audit: AuditPort<Tx>; mail: MailPort | null };
export type LimitChangeResult = { changeId: string; plan: string; metric: EntitlementMetric; oldValue: number | null; newValue: number | null; lowered: boolean; approvedAt: string; firms: { firmId: string; effectiveAt: string }[]; notices: { sent: number; failed: string[] } };

function problem(status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}): never {
  throw new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, code, detail, ...extra }, status as HttpStatus);
}

export class PlanLimitChanges {
  constructor(private readonly d: LimitChangeDeps) {}

  /** Change `plan`'s limit on `metric` to `value` (null: Unlimited; seats at least 1). Our team only (the key). The
   *  approval time is the database's (the trigger stamps it after the plan's lock). Every firm live on the plan gets one
   *  audit line (a lowering with its date, a raise "now"); a plan with no live firm has the change row as its record. */
  async change(ctx: StaffContext, input: unknown): Promise<LimitChangeResult> {
    if (!ctx.keys.includes(LIMIT_CHANGE_KEY)) problem(403, "MISSING_PERMISSION", "Only ExpatReady staff change this", "A plan's limits are changed only by ExpatReady staff with the plan-change key.");
    const p = Input.safeParse(input);
    if (!p.success) problem(422, "LIMIT_CHANGE_FIELDS", "Check the highlighted fields", "Some fields need a change.", { fields: Object.fromEntries(p.error.issues.map((i) => [i.path.join(".") || "body", i.message])) });
    const { plan, metric, value, reason } = p.data;
    if (metric === "seats" && (value === null || value < 1)) problem(422, "LIMIT_CHANGE_FIELDS", "Check the highlighted fields", "Seats are at least 1 and never Unlimited.", { fields: { value: "Seats are at least 1 and never Unlimited." } });
    const actor = `staff:${ctx.staffId}`;
    const out = await asBypass("platform.entitlements.limit-change", () => this.d.db.$transaction(async (tx) => {
      const planRow = (await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id::text AS id, name FROM platform_plan WHERE code = ${plan} FOR UPDATE`)[0];
      if (!planRow) problem(404, "PLAN_NOT_FOUND", "Not found", "No such plan.");
      let row: { id: string; old: number | null; lowered: boolean; approvedAt: Date };
      try {
        row = (await tx.$queryRaw<typeof row[]>`
          INSERT INTO platform_limit_change (id, plan_id, metric, new_value, reason, approved_by, approved_at)
          VALUES (gen_random_uuid(), ${planRow.id}::uuid, ${COLUMN[metric]}, ${value}, ${reason}, ${actor}, now()) RETURNING id::text AS id, old_value AS old, lowered, approved_at AS "approvedAt"`)[0];
      } catch (e) {
        if (/the limit is already/.test(String(e))) problem(409, "LIMIT_UNCHANGED", "Nothing to change", `${planRow.name} already allows ${shown(value)} ${WORD[metric]}.`);
        throw e;
      }
      const firms = await tx.$queryRaw<{ firmId: string; effectiveAt: Date }[]>`SELECT firm_id::text AS "firmId", effective_at AS "effectiveAt" FROM platform_limit_change_firm WHERE change_id = ${row.id}::uuid ORDER BY firm_id`;
      const live = row.lowered ? firms : (await tx.$queryRaw<{ firmId: string }[]>`SELECT firm_id::text AS "firmId" FROM platform_subscription WHERE plan_id = ${planRow.id}::uuid AND status <> 'ENDED' ORDER BY firm_id`).map((f) => ({ firmId: f.firmId, effectiveAt: row.approvedAt }));
      for (const f of live) {
        await touchFirm(tx, f.firmId);   // PF-12b: the firm's platform.bypass line, in this transaction, before its own line
        await this.d.audit.record(tx, { firmId: f.firmId, actor, action: row.lowered ? "plan.limit.lowered" : "plan.limit.raised", entity: "platform_limit_change", entityKey: row.id,
        summary: row.lowered
          ? `${planRow.name}'s limit on ${WORD[metric]} lowered from ${shown(row.old)} to ${shown(value)}; it applies to this firm from ${f.effectiveAt.toISOString().slice(0, 10)}. Nothing is deleted.`
          : `${planRow.name}'s limit on ${WORD[metric]} raised from ${shown(row.old)} to ${shown(value)}; it applies to this firm now.`,
        detail: { plan, metric, oldValue: row.old, newValue: value, effectiveAt: f.effectiveAt.toISOString() }, before: { [metric]: row.old }, after: { [metric]: value } });
      }
      return { row, firms };
    }));
    const notices = out.row.lowered ? await this.sendNotices(out.row.id) : { sent: 0, failed: [] };
    return { changeId: out.row.id, plan, metric, oldValue: out.row.old, newValue: value, lowered: out.row.lowered, approvedAt: out.row.approvedAt.toISOString(),
      firms: out.firms.map((f) => ({ firmId: f.firmId, effectiveAt: f.effectiveAt.toISOString() })), notices };
  }

  /** The "Live-plan removal notice" to every active Owner of each firm a lowering reaches (SA-3-43), after the commit. One
   *  idempotency key per change and Owner, so calling it again (a retry after a failed send) sends each once. A failed
   *  send never stops the others: it is listed by Owner id. A service email naming the Owner (PF-19r).
   *  PF-12b: each firm whose Owners were read gets its platform.bypass line first. A firm whose line cannot be written
   *  is sent nothing and its Owners are listed as failed (the change itself is already committed, so this never throws
   *  "nothing was done"); calling it again sends them. */
  async sendNotices(changeId: string): Promise<{ sent: number; failed: string[] }> {
    if (!this.d.mail) return { sent: 0, failed: [] };
    const { rows, unrecorded } = await asBypass("platform.entitlements.limit-change", async () => {
      const read = await this.d.db.$queryRaw<{ firmId: string; id: string; email: string; effectiveAt: Date; planName: string; metric: string; old: number | null; value: number | null }[]>`
      SELECT s.firm_id::text AS "firmId", s.id::text AS id, s.email, r.effective_at AS "effectiveAt", p.name AS "planName", c.metric, c.old_value AS old, c.new_value AS value
      FROM platform_limit_change c JOIN platform_plan p ON p.id = c.plan_id JOIN platform_limit_change_firm r ON r.change_id = c.id
      JOIN platform_staff s ON s.firm_id = r.firm_id AND s.status = 'ACTIVE'
      JOIN platform_role_grant g ON g.staff_id = s.id AND g.firm_id = s.firm_id AND g.role = 'OWNER' AND g.ended_at IS NULL
      WHERE c.id = ${changeId}::uuid ORDER BY s.firm_id, s.id`;
      const { failed } = await touchEachFirm(this.d.db, read.map((r) => r.firmId));   // inside the use: outside it a touch writes nothing
      return { rows: read, unrecorded: failed };
    });
    const out = { sent: 0, failed: [] as string[] };
    for (const o of rows) {
      if (unrecorded.has(o.firmId)) { out.failed.push(o.id); continue; }
      const m = (Object.keys(COLUMN) as EntitlementMetric[]).find((k) => COLUMN[k] === o.metric)!;
      try {
        await this.d.mail.send({ firmId: o.firmId, to: o.email, replyTo: SYSTEM_REPLY_TO, class: "SERVICE", person: { kind: "STAFF", id: o.id }, templateKey: "platform.live_plan_removal_notice", idempotencyKey: `limit-change:${changeId}:owner:${o.id}`,
          subject: "Live-plan removal notice",
          text: `Your plan (${o.planName}) will allow ${shown(o.value)} ${WORD[m]} instead of ${shown(o.old)}, from your renewal on ${o.effectiveAt.toISOString().slice(0, 10)}.\n\nUntil then nothing changes. From then, if your firm is over the new limit, everything it has keeps working and nothing is deleted; new ones are refused until it is back under or on a larger plan.` });
        out.sent++;
      } catch { out.failed.push(o.id); }
    }
    return out;
  }
}
