// R1.79 part 4 (PF-R3; concept product/screens/pf-r3-reports/concept-draft.md r2, approved by Lead 5 on #3849): the Reports
// page's rules as plain code, so the page and its tests read the same words. The server decides every scope (BR-1).
import { z } from "zod";

export const REPORT = { own: "agent/report:view.own", all: "agent/report:view.all", financial: "agent/report:view-financial", export: "agent/report:export" } as const;
export const ROLES = ["owner", "billing-finance", "case-manager", "case-officer"] as const;
export type DashboardRole = (typeof ROLES)[number];
export const ROLE_WORDS: Record<DashboardRole, string> = { "owner": "Owner", "billing-finance": "Billing / Finance", "case-manager": "Case Manager", "case-officer": "Case Officer" };

/** BR-2: the default dashboard for the viewer's roles (Owner/Admin → Owner; Billing / Finance; Case Manager; anyone else → Case Officer). */
export function defaultDashboard(roles: readonly string[]): DashboardRole {
  if (roles.includes("OWNER") || roles.includes("ADMIN")) return "owner";
  if (roles.includes("BILLING_FINANCE")) return "billing-finance";
  if (roles.includes("CASE_MANAGER")) return "case-manager";
  return "case-officer";
}
export const mayReport = (keys: readonly string[]) => keys.includes(REPORT.own) || keys.includes(REPORT.all) || keys.includes(REPORT.financial);

export const Dashboard = z.object({
  role: z.enum(ROLES), title: z.string(),
  widgets: z.array(z.object({ metricKey: z.string(), visual: z.enum(["TILE", "TABLE", "BAR", "AGING"]), position: z.number(), registered: z.boolean(), label: z.string().nullable() })),
});
/** GET /api/platform/reports/filters: the default period (the firm's month), the people (view.all only), and whether the viewer may export. */
export const FilterContext = z.object({ period: z.object({ from: z.string(), to: z.string() }), people: z.array(z.object({ id: z.string(), name: z.string(), active: z.boolean() })).optional(), canExport: z.boolean() });
export type Dashboard = z.infer<typeof Dashboard>;
const Cell = z.union([z.string(), z.number(), z.null()]);
export const Reading = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("COUNT"), value: z.number() }),
  z.object({ kind: z.literal("PERCENT"), value: z.number().nullable() }),
  z.object({ kind: z.literal("MONEY"), figures: z.array(z.object({ currency: z.string(), amount: z.string() })) }),
  z.object({ kind: z.literal("LIST"), rows: z.array(z.record(z.string(), Cell)) }),
]);
export const Answer = z.object({ metrics: z.array(z.object({ key: z.string(), label: z.string(), kind: z.string(), source: z.string(), status: z.enum(["OK", "WITHHELD", "UNAVAILABLE"]), scope: z.enum(["own", "all", "financial"]).nullable(), reading: Reading.nullable() })) });
export type Metric = z.infer<typeof Answer>["metrics"][number];

/** The filter bar, read from and written to the address (BR-3). A viewer without view.all never carries a person. */
export type Filters = { dashboard: DashboardRole; from: string; to: string; staffId?: string; clientType?: "INDIVIDUAL" | "CORPORATE" };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function readFilters(p: URLSearchParams, o: { roles: readonly string[]; keys: readonly string[]; period: { from: string; to: string } | null }): Filters {
  const d = p.get("dashboard"), from = p.get("from"), to = p.get("to"), staffId = p.get("person"), ct = p.get("clientType");
  const seesAll = o.keys.includes(REPORT.all);
  const out: Filters = { dashboard: (ROLES as readonly string[]).includes(d ?? "") ? (d as DashboardRole) : defaultDashboard(o.roles),
    from: from && DAY.test(from) ? from : o.period?.from ?? "", to: to && DAY.test(to) ? to : o.period?.to ?? "" };
  if (out.from && out.to && out.from > out.to) { out.from = o.period?.from ?? ""; out.to = o.period?.to ?? ""; }
  if (seesAll && staffId && /^[0-9a-f-]{36}$/i.test(staffId)) out.staffId = staffId;
  // AG-14-32 (departure recorded in the concept, BR-3): All for view.all holders by default, Individual for others; anyone may pick
  const type = ct === "INDIVIDUAL" || ct === "CORPORATE" || ct === "ALL" ? ct : seesAll ? "ALL" : "INDIVIDUAL";
  if (type !== "ALL") out.clientType = type;
  return out;
}
export function writeFilters(f: Filters, period: { from: string; to: string } | null, seesAll: boolean): URLSearchParams {
  const p = new URLSearchParams();
  p.set("dashboard", f.dashboard);
  if (!period || f.from !== period.from || f.to !== period.to) { p.set("from", f.from); p.set("to", f.to); }
  if (f.staffId) p.set("person", f.staffId);
  const dflt = seesAll ? undefined : "INDIVIDUAL";
  if (f.clientType !== dflt) p.set("clientType", f.clientType ?? "ALL");
  return p;
}
/** The query's filters (never a person for a viewer without view.all: readFilters already dropped it). */
export const apiFilters = (f: Filters) => ({ ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.staffId ? { staffId: f.staffId } : {}), ...(f.clientType ? { clientType: f.clientType } : {}) });

/** BR-1: the card's scope words (none for a WITHHELD card). */
export function scopeWords(m: Pick<Metric, "status" | "scope">, personName: string | null): string | null {
  if (m.status === "WITHHELD" || !m.scope) return null;
  if (personName && m.scope !== "own") return `${personName}'s work`;
  return m.scope === "own" ? "Your work" : "Whole firm";
}
/** BR-4: one value per currency, side by side ("CAD 2,840.00"); never a sum. */
export function moneyWords(currency: string, amount: string): string {
  const neg = amount.startsWith("-"), [whole, cents = "00"] = amount.replace("-", "").split(".");
  return `${currency} ${neg ? "-" : ""}${Number(whole).toLocaleString("en-CA")}.${cents}`;
}
/** BR-6: what an empty figure says, per metric. */
export function emptyWords(key: string): string {
  if (key.startsWith("reports.money.overdue")) return "Nothing overdue today";
  if (key === "reports.money.trust_received") return "No trust money received in this period";
  if (key === "reports.money.tax_collected" || key.startsWith("reports.money.fees")) return "No invoices in this period";
  if (key.startsWith("reports.money.")) return "No money in this period";
  if (key.endsWith("_rate")) return "No prospects closed in this period";
  if (key.startsWith("reports.sales.")) return "No leads in this period";
  if (key === "reports.cases.new_vs_closed" || key === "reports.cases.case_load") return "No open cases in this period";
  if (key === "reports.cases.stage_durations") return "No stages ended in this period";
  return "Nothing to count in this period";
}
export const withheldTip = (key: string) => key.startsWith("reports.money.") ? "This figure needs the Financial reports permission. Ask your firm's Owner." : "This figure needs a Reports permission you don't have. Ask your firm's Owner.";
/** A column name as a heading ("average_days" → "Average days"). */
export const heading = (k: string) => { const t = k.replace(/_/g, " ").replace(/\bdays (\d+) (\d+)\b/, "$1-$2 days").replace(/\bdays 90 plus\b/, "90+ days"); return t.charAt(0).toUpperCase() + t.slice(1); };
/** True when the reading holds nothing to show. */
export const isEmpty = (m: Metric) => m.status === "OK" && !!m.reading && ((m.reading.kind === "LIST" && m.reading.rows.length === 0) || (m.reading.kind === "MONEY" && m.reading.figures.length === 0) || (m.reading.kind === "PERCENT" && m.reading.value === null));
