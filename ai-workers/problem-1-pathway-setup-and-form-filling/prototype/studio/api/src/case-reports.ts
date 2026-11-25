// R1.79 part 1 (BACKLOG row CS-R1 part 1, batch 5; map row 79; AG-14-1, -4, -9, -10, -12, -19, -33): the case side's
// dashboard numbers, registered on PF-R1's one reporting door (MetricRegistry, POST /api/platform/reports/query) at
// start-up. No second report route, no rollup table (Q8: live reads), nothing written (AG-14-1).
// Which cases a number counts is the one case rule, `caseScope` (case-access.ts), never re-derived here:
//   * the viewer's own case keys (agent/case:view.all or view.own) bound every number, whatever the report key says
//     (MetricReadContext.keys; break M1 on PF-R1): a report key never opens a case the person cannot open;
//   * at report scope `own` (agent/report:view.own without view.all) the door has set filters.staffId to the viewer, and
//     the number counts only the cases that person owns or is on the open team of (the own rule of caseScope);
//   * at scope `all` a person filter narrows the same way to that person's cases; a person who is not staff of the
//     firm counts nothing (caseScope's member check).
// The client-type switch (AG-14-33) is the combination's Pathway client type, read by case-count.ts's own rule
// (groupOfCombination), the same group as the case counts and the case.closed event.
// Drill-through (AG-14-22): the case list (GET /api/runtime/cases) takes no stage, date or person filter, so a figure
// drills there only when no filter is in effect (ports/metrics.ts drillOf: never a wider list than the figure).
// Every definition here is a Sample definition of the team's AG-14 words (no immigration value); the deficiency count is
// the open review findings (CS-R1: "Sample definition").
import { Prisma, type PrismaClient } from "@prisma/client";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { LIST_MAX_ROWS, type MetricFilters, type MetricReadContext, type MetricRegistration, type Reading } from "../../ports/metrics.ts";
import { CASE_VIEW_OWN, caseScope, caseVisibleSql } from "./case-access.ts";
import { groupOfCombination } from "./case-count.ts";
import { Db } from "./core.ts";
import { MetricRegistry } from "./platform/reports/registry.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
const MODULE = "cases";
/** The new-versus-closed trend shows at most this many months (the last ones of the period). */
export const TREND_MAX_MONTHS = 24;
/** With no date range, the trend shows the months up to this one, this many in all. */
export const TREND_DEFAULT_MONTHS = 6;
const CASE_LIST = { path: "/api/runtime/cases", carries: {} };

const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dayAfter = (d: string) => new Date(dayStart(d).getTime() + 86_400_000);

/** The SQL condition on a runtime_case row `c` for the cases this read may count: the firm, the viewer's case scope,
 *  the person filter (own scope: always the viewer) and the client type. */
export async function scopedCases(db: Reader, ctx: MetricReadContext, f: MetricFilters): Promise<Prisma.Sql> {
  const viewer = await caseScope(db, { firmId: ctx.firmId, staffId: ctx.staffId, keys: ctx.keys });
  if (!viewer.member || !viewer.own) return Prisma.sql`false`;
  const parts: Prisma.Sql[] = [Prisma.sql`c.firm_id = ${viewer.firmId}::uuid`, caseVisibleSql(viewer)];
  const personId = ctx.scope === "own" ? ctx.staffId : f.staffId;
  if (personId) {
    // the person's own cases (file owner or open team row), whatever wider keys that person holds
    const person = await caseScope(db, { firmId: ctx.firmId, staffId: personId, keys: [CASE_VIEW_OWN] });
    parts.push(caseVisibleSql(person));
  }
  if (f.clientType) {
    const combos = await db.$queryRaw<{ id: string }[]>`select distinct c.combination_id::text as id from runtime_case c where c.firm_id = ${viewer.firmId}::uuid`;
    const want = f.clientType === "CORPORATE" ? "corporate" : "individual", keep: string[] = [];
    for (const { id } of combos) if ((await groupOfCombination(db, id)) === want) keep.push(id);
    parts.push(Prisma.sql`c.combination_id::text = any(${keep}::text[])`);
  }
  return Prisma.join(parts, " and ");
}

/** The months of the trend, "YYYY-MM", oldest first: the period's months (its last TREND_MAX_MONTHS), or the
 *  TREND_DEFAULT_MONTHS up to `today`'s. */
export function trendMonths(f: MetricFilters, today: Date): string[] {
  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const end = f.to ? dayStart(f.to) : f.from && dayStart(f.from) > today ? dayStart(f.from) : today;
  const start = f.from ? dayStart(f.from) : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (TREND_DEFAULT_MONTHS - 1), 1));
  const out: string[] = [];
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? (y++, m = 0) : m++)
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  return out.slice(-TREND_MAX_MONTHS).filter((x) => x <= ym(end));
}

/** Average and median in days, one decimal. */
const days = (ms: number | null) => (ms === null ? null : Math.round((ms / 86_400_000) * 10) / 10);

export function caseMetrics(db: Reader, now: () => Date = () => new Date()): MetricRegistration[] {
  const opened = (f: MetricFilters) => Prisma.sql`${f.from ? Prisma.sql`and c.created_at >= ${dayStart(f.from)}` : Prisma.empty} ${f.to ? Prisma.sql`and c.created_at < ${dayAfter(f.to)}` : Prisma.empty}`;
  const drill = { drillTarget: CASE_LIST };
  return [
    {
      key: "reports.cases.case_load", module: MODULE, label: "Open cases by stage", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, ...drill,
      source: "Open cases, counted by the stage each is in now; a date range keeps the cases opened in it. Only cases you may open.",
      async read(ctx, f): Promise<Reading> {
        const where = await scopedCases(db, ctx, f);
        const rows = await db.$queryRaw<{ stage: string | null; cases: number }[]>`
          select s.staff_name as stage, count(*)::int as cases from runtime_case c
            left join case_stage s on s.case_id = c.id and s.state = 'CURRENT'
           where ${where} and c.status = 'OPEN' ${opened(f)}
           group by s.staff_name order by count(*) desc, s.staff_name nulls last limit ${LIST_MAX_ROWS}`;
        return { kind: "LIST", rows: rows.map((r) => ({ stage: (r.stage ?? "No stage yet").slice(0, 300), cases: Number(r.cases) })) };
      },
    },
    {
      key: "reports.cases.new_vs_closed", module: MODULE, label: "New and closed cases by month", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: `Cases opened and cases closed in each month of the period (the last ${TREND_DEFAULT_MONTHS} months when no dates are set; at most ${TREND_MAX_MONTHS}). Only cases you may open.`,
      async read(ctx, f): Promise<Reading> {
        const months = trendMonths(f, now());
        if (!months.length) return { kind: "LIST", rows: [] };
        const where = await scopedCases(db, ctx, f);
        const lo = new Date(`${months[0]}-01T00:00:00.000Z`), [y, m] = months.at(-1)!.split("-").map(Number), hi = new Date(Date.UTC(y, m, 1));
        const from = f.from && dayStart(f.from) > lo ? dayStart(f.from) : lo, to = f.to && dayAfter(f.to) < hi ? dayAfter(f.to) : hi;
        const rows = await db.$queryRaw<{ month: string; opened: number; closed: number }[]>`
          select to_char(x.at at time zone 'UTC', 'YYYY-MM') as month, count(*) filter (where x.k = 'o')::int as opened, count(*) filter (where x.k = 'c')::int as closed
            from (select 'o' as k, c.created_at as at from runtime_case c where ${where} and c.created_at >= ${from} and c.created_at < ${to}
                  union all
                  select 'c', c.closed_at from runtime_case c where ${where} and c.status = 'CLOSED' and c.closed_at >= ${from} and c.closed_at < ${to}) x
           group by 1`;
        const by = new Map(rows.map((r) => [r.month, r]));
        return { kind: "LIST", rows: months.map((month) => ({ month, opened: Number(by.get(month)?.opened ?? 0), closed: Number(by.get(month)?.closed ?? 0) })) };
      },
    },
    {
      key: "reports.cases.stage_durations", module: MODULE, label: "Time spent in each stage", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "For each stage, how long finished stages took, start to end, in days (average and median); the slowest is marked. A date range keeps the stages that ended in it. Only cases you may open.",
      async read(ctx, f): Promise<Reading> {
        const where = await scopedCases(db, ctx, f);
        const rows = await db.$queryRaw<{ stage: string; ended: number; avg_ms: number | null; median_ms: number | null }[]>`
          select s.staff_name as stage, count(*)::int as ended,
                 avg(extract(epoch from (s.ended_at - s.started_at)) * 1000)::float8 as avg_ms,
                 percentile_cont(0.5) within group (order by extract(epoch from (s.ended_at - s.started_at)) * 1000)::float8 as median_ms
            from case_stage s join runtime_case c on c.id = s.case_id
           where ${where} and s.started_at is not null and s.ended_at is not null
             ${f.from ? Prisma.sql`and s.ended_at >= ${dayStart(f.from)}` : Prisma.empty} ${f.to ? Prisma.sql`and s.ended_at < ${dayAfter(f.to)}` : Prisma.empty}
           group by s.staff_name order by s.staff_name limit ${LIST_MAX_ROWS}`;
        const slowest = rows.reduce<number | null>((m, r) => (r.avg_ms !== null && (m === null || r.avg_ms > m) ? r.avg_ms : m), null);
        return { kind: "LIST", rows: rows.map((r) => ({ stage: r.stage.slice(0, 300), ended: Number(r.ended), average_days: days(r.avg_ms), median_days: days(r.median_ms), slowest: rows.length > 1 && r.avg_ms === slowest ? "Slowest" : null })) };
      },
    },
    {
      key: "reports.cases.open_review_findings", module: MODULE, label: "Open review findings", kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Review findings still open (not acknowledged, waived, dismissed or resolved) on open cases: the deficiency count (Sample definition). A date range keeps the findings raised in it. Only cases you may open.",
      async read(ctx, f): Promise<Reading> {
        const where = await scopedCases(db, ctx, f);
        const [r] = await db.$queryRaw<{ n: number }[]>`
          select count(*)::int as n from review_finding x join runtime_case c on c.id = x.case_id
           where ${where} and c.status = 'OPEN' and x.state = 'open'
             ${f.from ? Prisma.sql`and x.created_at >= ${dayStart(f.from)}` : Prisma.empty} ${f.to ? Prisma.sql`and x.created_at < ${dayAfter(f.to)}` : Prisma.empty}`;
        return { kind: "COUNT", value: Number(r?.n ?? 0) };
      },
    },
  ];
}

/** Registers the case numbers on the one reporting door at start-up. */
export class CaseReports implements OnModuleInit {
  constructor(private readonly registry: MetricRegistry, private readonly db: Db) {}
  onModuleInit() { for (const m of caseMetrics(this.db)) this.registry.register(m); }
}
Injectable()(CaseReports);
[MetricRegistry, Db].forEach((t, i) => Inject(t)(CaseReports, undefined, i));
