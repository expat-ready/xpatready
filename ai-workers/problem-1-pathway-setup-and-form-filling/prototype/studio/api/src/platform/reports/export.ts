// R1.79 part 4 (PF-R3; concept product/screens/pf-r3-reports/concept-draft.md r2, approved by Lead 5 on #3849; AG-14-25,
// -26, -29): what the Reports page's door adds to PF-R1's.
//  * the dashboard answer's `people` (only for a holder of agent/report:view.all: the firm's staff, so the Person filter
//    never shows anyone to a viewer who may count only their own work; challenge M1) and `period` (the firm's current
//    month in its zone, so the page's default month is the firm's, never the browser's; challenge m7);
//  * the CSV of one table (a LIST metric) read exactly as `query` reads it: same filters, same server-worked scope. A
//    WITHHELD table is 403 and an UNAVAILABLE one 503, both with no audit line. Otherwise one `report.exported` line is
//    committed first (metric, filters, scope, row count; never a figure), and only then is the file made (challenge M4;
//    AUD-4's "line before the data", P-607 (3)). Header words are the table's own column names; a per-currency table
//    has `currency` first; amounts as answered; no total row; the audit trail's one CSV writer (formula-safe).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MetricFilters, MetricKey, REPORT_KEYS, type MetricAnswer } from "../../../../ports/metrics.ts";
import { csvRow } from "../audit/csv.ts";
import { AuditActionNames } from "../audit/firm-read/action-names.ts";

AuditActionNames.register("platform", { "report.exported": "Exported a report table" });

/** The export's body: one metric and the filter bar's filters. */
export const ExportBody = z.strictObject({ metric: MetricKey, filters: MetricFilters.default({}) });
export const mayExport = (keys: readonly string[]) => keys.includes(REPORT_KEYS.export);
export const seesPeople = (keys: readonly string[]) => keys.includes(REPORT_KEYS.all);

/** The firm's month holding `now`, in its zone: the first and last days (YYYY-MM-DD). */
export function monthOf(zone: string, now: Date): { from: string; to: string } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** The table's columns: every key of its rows in first-seen order, `currency` first when present. */
export function columnsOf(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k);
  return seen.includes("currency") ? ["currency", ...seen.filter((k) => k !== "currency")] : seen;
}

/** The CSV of a LIST answer (UTF-8 with its mark, a header row, CRLF rows). */
export function csvOf(rows: Record<string, unknown>[]): string {
  const cols = columnsOf(rows);
  return `﻿${csvRow(cols)}${rows.map((r) => csvRow(cols.map((c) => r[c] ?? null))).join("")}`;
}

/** The file's name: reports-<metric's last part, dashed>-<from>[-to-<to>].csv. */
export function fileNameOf(key: string, f: MetricFilters): string {
  const what = key.split(".").at(-1)!.replace(/_/g, "-");
  const when = f.from && f.to && f.from.slice(0, 7) === f.to.slice(0, 7) && f.from.endsWith("-01") ? f.from.slice(0, 7) : [f.from, f.to].filter(Boolean).join("-to-") || "all";
  return `reports-${what}-${when}.csv`;
}

/** The audit line's fields (ids and facts only: the metric key, the filters, the scope and the row count). */
export function exportLine(firmId: string, actor: string, a: MetricAnswer, f: MetricFilters, rows: number) {
  const detail: Record<string, string | number> = { metric: a.key, scope: a.scope ?? "none", rows };
  for (const [k, v] of Object.entries(f)) if (typeof v === "string") detail[k] = v;
  return { firmId, actor, action: "report.exported", entity: "plat_report_export", entityKey: randomUUID(),
    summary: `Report table exported: ${a.label}, ${rows} row${rows === 1 ? "" : "s"}.`, detail, before: null, after: null };
}
