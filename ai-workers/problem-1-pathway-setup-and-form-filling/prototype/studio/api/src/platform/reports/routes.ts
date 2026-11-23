// PF-R1: the reporting service's one door under /api/platform/reports (AG-14-18 to -20, -22, -30).
//  * GET  dashboards/:role  the seeded layout for owner, case-manager, billing-finance or case-officer, as data; each
//    widget says whether its metric is registered yet. Another name is 404.
//  * POST query             metric keys plus filters (date range, person, client type), Zod-checked (AG-14-30): a body
//    or filter that fails its schema → 422 with the message and the fields (PF-28's field-error status on every PF/FO
//    door; the row says 400: asked of the tech lead in the PR), an unknown metric key → 400.
//    Each metric is read at the scope worked out on the server from agent/report:view.own, view.all and view-financial
//    (AG-14-19); a `scope` in the body is never read.
// Both need a report key: the guard lets any signed-in staff member in (AnyStaff) and the door refuses 403 without one,
// because view.own, view.all and view-financial each open it alone (PermissionKeys would need all of them). The request
// already runs as the caller's firm (PF-4's guard, PF-12's walls), so every read is walled. It writes nothing (AG-14-1).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { mayReport, queryRefusal, REPORT_KEYS, ReportQuery, ReportRefused, type ReportAnswer } from "../../../../ports/metrics.ts";
import { AnyStaff, forbidden, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { DASHBOARDS, isDashboardRole } from "./dashboards.ts";
import { MetricRegistry } from "./registry.ts";

type R = { platform?: StaffContext };
const NEEDS = `${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}, checked by the door (PF-R1)`;

export type DashboardAnswer = { role: string; title: string; widgets: { metricKey: string; visual: string; position: number; registered: boolean; label: string | null }[] };

@Controller("api/platform/reports")
export class ReportsController {
  constructor(@Inject(MetricRegistry) private readonly registry: MetricRegistry) {}

  @Get("dashboards/:role") @AnyStaff(NEEDS)
  dashboard(@Req() r: R, @Param("role") role: string): DashboardAnswer {
    const ctx = staffOf(r);
    if (!mayReport(ctx.keys)) forbidden(`Your roles include no report permission (${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}).`, "MISSING_PERMISSION");
    if (!isDashboardRole(role)) problem(404, "Not found", "No such dashboard.", { code: "NO_DASHBOARD" });
    const d = DASHBOARDS[role];
    const labels = new Map(this.registry.definitions().map((m) => [m.key, m.label]));
    return { role: d.role, title: d.title, widgets: d.widgets.map((w, position) => ({ metricKey: w.metricKey, visual: w.visual, position, registered: labels.has(w.metricKey), label: labels.get(w.metricKey) ?? null })) };
  }

  @Post("query") @HttpCode(200) @AnyStaff(NEEDS)
  async query(@Req() r: R, @Body() body: unknown): Promise<ReportAnswer> {
    const ctx = staffOf(r);
    try {
      if (!mayReport(ctx.keys)) throw new ReportRefused(403, "MISSING_PERMISSION", `Your roles include no report permission (${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}).`);
      const parsed = ReportQuery.safeParse(body ?? {});   // read here first (PF-28); the run rule reads the same schema again
      if (!parsed.success) throw queryRefusal(parsed.error);
      return await this.registry.query(ctx, parsed.data);
    } catch (e) {
      if (!(e instanceof ReportRefused)) throw e;
      return problem(e.status, e.status === 403 ? "Not allowed" : "Check the report", e.message, { code: e.code, fields: e.fields });
    }
  }
}
