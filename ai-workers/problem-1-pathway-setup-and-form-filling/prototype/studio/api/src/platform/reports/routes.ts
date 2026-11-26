// PF-R1: the reporting service's one door under /api/platform/reports (AG-14-18 to -20, -22, -30).
//  * GET  dashboards/:role  the seeded layout for owner, case-manager, billing-finance or case-officer, as data; each
//    widget says whether its metric is registered yet. Another name is 404.
//  * POST query             metric keys plus filters (date range, person, client type), Zod-checked (AG-14-30): a body
//    or filter that fails its schema → 422 with the message and the fields (PF-28's field-error status on every PF/FO
//    door; the row says 400: asked of the tech lead in the PR), an unknown metric key → 400.
//    Each metric is read at the scope worked out on the server from agent/report:view.own, view.all and view-financial
//    (AG-14-19); a `scope` in the body is never read.
// R1.79 part 4 (PF-R3, export.ts): GET filters answers the viewer's `period` (the firm's month), `people` (view.all only) and
// `canExport`, apart from the layout, which stays the same for every viewer (PF-R1 (2)); POST export answers one table's
// CSV, audited (one `report.exported` line before the file).
// All three need a report key: the guard lets any signed-in staff member in (AnyStaff) and the door refuses 403 without one,
// because view.own, view.all and view-financial each open it alone (PermissionKeys would need all of them). The request
// already runs as the caller's firm (PF-4's guard, PF-12's walls), so every read is walled. It writes nothing (AG-14-1).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { mayReport, queryRefusal, REPORT_KEYS, ReportQuery, ReportRefused, type ReportAnswer } from "../../../../ports/metrics.ts";
import { Db } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { firmScope } from "../firm-scope.ts";
import { actorWord } from "../identity/audit.ts";
import { AnyStaff, forbidden, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { PlatformClock } from "../identity/port.ts";
import { readSetting, TIME_ZONE } from "../settings.ts";
import { DASHBOARDS, isDashboardRole } from "./dashboards.ts";
import { csvOf, ExportBody, exportLine, fileNameOf, mayExport, monthOf, seesPeople } from "./export.ts";
import { MetricRegistry } from "./registry.ts";

type R = { platform?: StaffContext };
const NEEDS = `${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}, checked by the door (PF-R1)`;

export type DashboardAnswer = { role: string; title: string; widgets: { metricKey: string; visual: string; position: number; registered: boolean; label: string | null }[] };
export type FiltersAnswer = {
  /** Whether the viewer may export a table (agent/report:export). */
  canExport: boolean;
  /** The firm's current month (its zone): the page's default period. */
  period: { from: string; to: string };
  /** The firm's staff for the Person filter: only for a holder of agent/report:view.all (else absent). */
  people?: { id: string; name: string; active: boolean }[] };

@Controller("api/platform/reports")
export class ReportsController {
  // db and clock are optional for the tests that build the door with a registry alone (they call `query` only)
  constructor(@Inject(MetricRegistry) private readonly registry: MetricRegistry, @Inject(Db) private readonly dbOrNone?: Db, @Inject(PlatformClock) private readonly clock: PlatformClock = new PlatformClock()) {}
  // a method, not a getter: a start-up hook reads each prototype member, and a getter would run there with no instance
  private database(): Db { if (!this.dbOrNone) throw new Error("ReportsController: no database"); return this.dbOrNone; }

  @Get("dashboards/:role") @AnyStaff(NEEDS)
  dashboard(@Req() r: R, @Param("role") role: string): DashboardAnswer {
    const ctx = staffOf(r);
    if (!mayReport(ctx.keys)) forbidden(`Your roles include no report permission (${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}).`, "MISSING_PERMISSION");
    if (!isDashboardRole(role)) problem(404, "Not found", "No such dashboard.", { code: "NO_DASHBOARD" });
    const d = DASHBOARDS[role];
    const labels = new Map(this.registry.definitions().map((m) => [m.key, m.label]));
    return { role: d.role, title: d.title, widgets: d.widgets.map((w, position) => ({ metricKey: w.metricKey, visual: w.visual, position, registered: labels.has(w.metricKey), label: labels.get(w.metricKey) ?? null })) };
  }

  /** GET filters: the filter bar's default period (the firm's month) and, for view.all only, the firm's people (challenge M1, m7). */
  @Get("filters") @AnyStaff(NEEDS)
  async filters(@Req() r: R): Promise<FiltersAnswer> {
    const ctx = staffOf(r);
    if (!mayReport(ctx.keys)) forbidden(`Your roles include no report permission (${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}).`, "MISSING_PERMISSION");
    const zone = await readSetting<string>(this.database(), ctx.firmId, TIME_ZONE.key);
    const people = seesPeople(ctx.keys) ? (await this.database().platformStaff.findMany({ where: firmScope(ctx.firmId), select: { id: true, displayName: true, status: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }] }))
      .map((p) => ({ id: p.id, name: p.displayName, active: p.status === "ACTIVE" })) : undefined;
    return { period: monthOf(zone, new Date(this.clock.now())), ...(people ? { people } : {}), canExport: mayExport(ctx.keys) };
  }

  /** POST export: one table's CSV, read as `query` reads it; one audit line committed before the file (export.ts). */
  @Post("export") @AnyStaff(NEEDS)
  async export(@Req() r: R, @Body() body: unknown, @Res() res: Response): Promise<void> {
    const ctx = staffOf(r);
    if (!mayExport(ctx.keys)) forbidden(`Exporting a report needs ${REPORT_KEYS.export}. Ask your firm's Owner.`, "MISSING_PERMISSION");
    const parsed = ExportBody.safeParse(body ?? {});
    if (!parsed.success) { const e = queryRefusal(parsed.error); problem(422, "Check the export", e.message, { code: e.code, fields: e.fields }); }
    const { metric, filters } = parsed.data;
    const def = this.registry.definitions().find((d) => d.key === metric);
    if (!def) problem(400, "Check the export", `No such metric: ${metric}`, { code: "UNKNOWN_METRIC" });
    if (def.kind !== "LIST") problem(400, "Check the export", "Only a table can be exported; this figure is a single number.", { code: "NOT_A_TABLE" });
    let answer: ReportAnswer;
    try { answer = await this.registry.query(ctx, { metrics: [metric], filters }); } catch (e) {
      if (e instanceof ReportRefused) problem(e.status, e.status === 403 ? "Not allowed" : "Check the export", e.message, { code: e.code, fields: e.fields });
      throw e;
    }
    const a = answer.metrics[0]!;
    if (a.status === "WITHHELD") forbidden("This table is not in your access, so it cannot be exported.", "WITHHELD");
    if (a.status !== "OK" || a.reading?.kind !== "LIST") problem(503, "Try again", "This table could not be counted just now, so nothing was exported. Try again.", { code: "UNAVAILABLE" });
    const rows = a.reading.rows;
    // the line first, committed on its own; a line that cannot be written means no file (P-607 (3))
    await this.database().$transaction((tx) => auditEvent.record(tx, exportLine(firmScope(ctx.firmId).firmId, actorWord(ctx.staffId), a, filters, rows.length)));
    res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileNameOf(metric, filters)}"`);
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Export-Rows", String(rows.length));
    res.send(csvOf(rows));
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
