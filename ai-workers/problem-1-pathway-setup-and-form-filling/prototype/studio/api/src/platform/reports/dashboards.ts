// PF-R1 (2): the seeded role dashboards as data (AG-14-18; AG-14 §7 DashboardWidget: metricKey, visual, position). Release 1
// seeds four (Q8): Owner, Case Manager, Billing / Finance and Case Officer; Rep and Compliance are not seeded. Each widget
// names a metric by key; the metric is registered by the row named beside it (PF-R2fo, PF-R2cm, CS-R1), so until that row
// merges the widget answers `registered: false` and PF-R3 shows it empty. The keys are this file's names for the figures
// those rows describe (an internal identifier, no immigration value); the row that registers one uses the same key.
// The same layout serves every viewer: the scope comes from the viewer's report keys, never from the layout (AG-14-19).
import { MetricKey } from "../../../../ports/metrics.ts";

export const DashboardRole = ["owner", "case-manager", "billing-finance", "case-officer"] as const;
export type DashboardRole = (typeof DashboardRole)[number];
export type Visual = "TILE" | "TABLE" | "BAR" | "AGING";
export type Widget = { metricKey: string; visual: Visual };
export type Dashboard = { role: DashboardRole; title: string; widgets: Widget[] };

const w = (metricKey: string, visual: Visual = "TILE"): Widget => ({ metricKey: MetricKey.parse(metricKey), visual });

export const DASHBOARDS: Readonly<Record<DashboardRole, Dashboard>> = Object.freeze({
  // Owner: firm-wide, across sales, delivery and money (AG-14 §3.6)
  "owner": { role: "owner", title: "Owner", widgets: [
    w("sales.leads_added"), w("sales.win_rate"),                                  // PF-R2fo (AG-14-5)
    w("cases.case_load", "BAR"), w("cases.stage_durations", "TABLE"),             // CS-R1 (AG-14-9, -10)
    w("money.fees_billed"), w("money.fees_collected"), w("money.overdue_ageing", "AGING"),   // PF-R2cm (AG-14-13, -14)
    w("cases.overdue_tasks_by_person", "TABLE"),                                  // CS-R1 (AG-13-68)
  ] },
  // Case Manager: funnel, delivery and team (AG-14 §3.6)
  "case-manager": { role: "case-manager", title: "Case Manager", widgets: [
    w("sales.stage_counts", "BAR"), w("sales.leads_added"),                       // PF-R2fo (AG-14-5)
    w("cases.case_load", "BAR"), w("cases.stage_durations", "TABLE"), w("cases.open_review_findings"),   // CS-R1 (AG-14-9, -10, -12)
    w("cases.overdue_tasks_by_person", "TABLE"),                                  // CS-R1 (AG-13-68)
  ] },
  // Billing / Finance: money (AG-14 §3.6; view-financial)
  "billing-finance": { role: "billing-finance", title: "Billing / Finance", widgets: [
    w("money.fees_billed"), w("money.fees_collected"), w("money.trust_received"),   // PF-R2cm (AG-14-13, -36)
    w("money.overdue_ageing", "AGING"), w("money.tax_collected", "TABLE"),        // PF-R2cm (AG-14-14, -37)
  ] },
  // Case Officer: my caseload (AG-14 §3.6)
  "case-officer": { role: "case-officer", title: "Case Officer", widgets: [
    w("cases.case_load", "BAR"), w("cases.documents_waiting"), w("cases.overdue_tasks_by_person", "TABLE"),   // CS-R1
  ] },
});

export const isDashboardRole = (v: unknown): v is DashboardRole => typeof v === "string" && (DashboardRole as readonly string[]).includes(v);
