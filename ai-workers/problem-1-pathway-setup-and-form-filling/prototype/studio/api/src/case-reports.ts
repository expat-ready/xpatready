// R1.79 part 1 (BACKLOG row CS-R1 part 1, batch 5; map row 79; AG-14-1, -4, -9, -10, -12, -19, -28, -33): the case side's
// dashboard numbers, registered on PF-R1's one reporting door (MetricRegistry, POST /api/platform/reports/query) at
// start-up. No second report route, no rollup table (Q8: live reads), nothing written (AG-14-1).
// Which cases a number counts is the one case rule, `caseScope` (case-access.ts), never re-derived here:
//   * the viewer's own case keys (agent/case:view.all or view.own) bound every number, whatever the report key says
//     (MetricReadContext.keys; break M1 on PF-R1): a report key never opens a case the person cannot open;
//   * at report scope `own` (agent/report:view.own without view.all) the door has set filters.staffId to the viewer, and
//     the number counts only the cases that person owns or is on the open team of (the own rule of caseScope);
//   * at scope `all` a person filter narrows the same way to that person's cases; a person who is not staff of the
//     firm counts nothing (caseScope's member check).
// The firm: runtime_case, case_stage and review_finding have no row-level policy yet (case side until CS-W4,
// check_pf12_walls.ts), so the explicit `c.firm_id = <the caller's firm>` here is the firm wall; it is tested.
// The client-type switch (AG-14-33) is the combination's Pathway client type: case-count.ts's groupOfCombination rule
// (the nearest PATHWAY node above it; CORPORATE, else individual), read here for all the firm's combinations in one query.
// Days and months are the firm's (platform.time_zone, AG-14 §6: buckets in the firm's zone); a date range is inclusive.
// Drill-through (AG-14-22): none yet. The case list (GET /api/runtime/cases) keeps neither to open cases nor to the
// viewer's case scope, so a link there would open a wider list than the figure (review M1); it comes with a scoped list.
// A table is at most LIST_MAX_ROWS rows; past that, its last row says how many more there were (never a silent cut).
// Every definition here is a Sample definition of the team's AG-14 words (no immigration value); the deficiency count is
// the open review findings (CS-R1: "Sample definition").
import { Prisma, type PrismaClient } from "@prisma/client";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { LIST_MAX_ROWS, type MetricFilters, type MetricReadContext, type MetricRegistration, type Reading } from "../../ports/metrics.ts";
import { CASE_VIEW_OWN, caseScope, caseVisibleSql } from "./case-access.ts";
import { Db } from "./core.ts";
import { readSetting, TIME_ZONE } from "./platform/settings.ts";
import { MetricRegistry } from "./platform/reports/registry.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
type Row = Record<string, string | number | null>;
const MODULE = "cases";
/** The new-versus-closed trend shows at most this many months (the last ones of the period). */
export const TREND_MAX_MONTHS = 24;
/** With no date range, the trend shows the months up to this one, this many in all. */
export const TREND_DEFAULT_MONTHS = 6;
/** The earliest day a figure reads from: an earlier start date reads from here (no case is older). */
export const EARLIEST_DAY = "1970-01-01";
/** A stage name as shown: at most this many characters, never a split character. */
const NAME_MAX = 120;

const clampDay = (d: string | undefined) => (d && d < EARLIEST_DAY ? EARLIEST_DAY : d);
const name = (v: string | null) => { const t = (v ?? "").trim(); return t ? Array.from(t).slice(0, NAME_MAX).join("") : null; };

/** The read's frame: the cases it may count (an SQL condition on runtime_case `c`), the firm's zone, and the period's
 *  start and end as timestamps in that zone (the end exclusive: the day after `to`). */
export type Frame = { where: Prisma.Sql; zone: string; from: Prisma.Sql | null; to: Prisma.Sql | null };
export async function frameOf(db: Reader, ctx: MetricReadContext, f: MetricFilters): Promise<Frame> {
  const zone = await readSetting<string>(db as PrismaClient, ctx.firmId, TIME_ZONE.key);
  const from = clampDay(f.from), to = clampDay(f.to);
  const at = (day: string, plus = 0) => Prisma.sql`((${day}::date + ${plus}::int)::timestamp at time zone ${zone})`;
  const frame = { zone, from: from ? at(from) : null, to: to ? at(to, 1) : null };
  const viewer = await caseScope(db, { firmId: ctx.firmId, staffId: ctx.staffId, keys: ctx.keys });
  if (!viewer.member || !viewer.own) return { ...frame, where: Prisma.sql`false` };
  const parts: Prisma.Sql[] = [Prisma.sql`c.firm_id = ${viewer.firmId}::uuid`, caseVisibleSql(viewer)];
  const personId = ctx.scope === "own" ? ctx.staffId : f.staffId;
  if (personId) {
    // the person's own cases (file owner or open team row), whatever wider keys that person holds
    const person = await caseScope(db, { firmId: ctx.firmId, staffId: personId, keys: [CASE_VIEW_OWN] });
    parts.push(caseVisibleSql(person));
  }
  if (f.clientType) {
    // groupOfCombination's rule for every combination of the firm's cases at once (review and break M2: one query, not one per combination)
    const corporate = Prisma.sql`(with recursive up as (
        select x.id as combination_id, p.workspace_id, p.parent_node_key, p.node_kind, p.client_type, 0 as depth
          from combination x join program_def p on p.id = x.program_def_id
         where x.id in (select k.combination_id from runtime_case k where k.firm_id = ${viewer.firmId}::uuid)
        union all
        select up.combination_id, p.workspace_id, p.parent_node_key, p.node_kind, p.client_type, up.depth + 1
          from program_def p join up on p.workspace_id = up.workspace_id and p.program_node_key = up.parent_node_key where up.depth < 32
      ), grp as (select distinct on (combination_id) combination_id, client_type from up where node_kind = 'PATHWAY' order by combination_id, depth)
      select combination_id from grp where client_type = 'CORPORATE')`;
    parts.push(f.clientType === "CORPORATE" ? Prisma.sql`c.combination_id in ${corporate}` : Prisma.sql`c.combination_id not in ${corporate}`);
  }
  return { ...frame, where: Prisma.join(parts, " and ") };
}
const inFrame = (col: Prisma.Sql, fr: Frame) => Prisma.sql`${fr.from ? Prisma.sql`and ${col} >= ${fr.from}` : Prisma.empty} ${fr.to ? Prisma.sql`and ${col} < ${fr.to}` : Prisma.empty}`;

/** At most LIST_MAX_ROWS rows: past that, the first LIST_MAX_ROWS - 1 and one row saying how many more (`rest` builds it). */
export function capped<T>(rows: T[], keep: (r: T) => Row, rest: (more: T[]) => Row): Row[] {
  if (rows.length <= LIST_MAX_ROWS) return rows.map(keep);
  return [...rows.slice(0, LIST_MAX_ROWS - 1).map(keep), rest(rows.slice(LIST_MAX_ROWS - 1))];
}

/** The months of the trend, "YYYY-MM", oldest first: the period's months (its last TREND_MAX_MONTHS), or the
 *  TREND_DEFAULT_MONTHS up to `today`'s month (today as the firm's calendar date, YYYY-MM-DD). */
export function trendMonths(f: MetricFilters, today: string): string[] {
  const from = clampDay(f.from), to = clampDay(f.to);
  const end = to ?? (from && from > today ? from : today);
  const [ey, em] = end.split("-").map(Number);
  let [y, m] = from ? from.split("-").map(Number) : [ey, em - (TREND_DEFAULT_MONTHS - 1)];
  while (m < 1) { m += 12; y--; }
  const out: string[] = [];
  for (; y < ey || (y === ey && m <= em); m === 12 ? (y++, m = 1) : m++) out.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
  return out.slice(-TREND_MAX_MONTHS);
}

/** Average and median in days, one decimal. */
const days = (ms: number | null) => (ms === null ? null : Math.round((ms / 86_400_000) * 10) / 10);

export function caseMetrics(db: Reader, now: () => Date = () => new Date()): MetricRegistration[] {
  return [
    {
      key: "reports.cases.case_load", module: MODULE, label: "Open cases by stage", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Open cases, counted by the stage each is in now; a date range keeps the cases opened in it. Only cases you may open.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f);
        const rows = await db.$queryRaw<{ stage: string | null; cases: number }[]>`
          select s.staff_name as stage, count(*)::int as cases from runtime_case c
            left join case_stage s on s.case_id = c.id and s.state = 'CURRENT'
           where ${fr.where} and c.status = 'OPEN' ${inFrame(Prisma.sql`c.created_at`, fr)}
           group by s.staff_name order by count(*) desc, s.staff_name nulls last`;   // one row per stage name of the firm, then capped
        // no stage yet: stage null (the screen words it), so a stage really named "No stage yet" stays its own row (break m1)
        return { kind: "LIST", rows: capped(rows, (r) => ({ stage: name(r.stage), cases: Number(r.cases) }), (more) => ({ stage: `${more.length} more stages`, cases: more.reduce((n, r) => n + Number(r.cases), 0) })) };
      },
    },
    {
      key: "reports.cases.new_vs_closed", module: MODULE, label: "New and closed cases by month", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: `Cases opened, and cases closed and still closed, in each month of the period in the firm's time zone (the last ${TREND_DEFAULT_MONTHS} months when no dates are set; at most ${TREND_MAX_MONTHS}). Only cases you may open.`,
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f);
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: fr.zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now());
        const months = trendMonths(f, today);
        if (!months.length) return { kind: "LIST", rows: [] };
        // the months' span, cut to the period's own days (inclusive)
        const first = clampDay(f.from) && clampDay(f.from)! > `${months[0]}-01` ? clampDay(f.from)! : `${months[0]}-01`;
        const lo = Prisma.sql`(${first}::date::timestamp at time zone ${fr.zone})`;
        const hi = fr.to && f.to && f.to.slice(0, 7) <= months.at(-1)! ? fr.to : Prisma.sql`((${`${months.at(-1)}-01`}::date + interval '1 month')::timestamp at time zone ${fr.zone})`;
        const rows = await db.$queryRaw<{ month: string; opened: number; closed: number }[]>`
          select to_char(x.at at time zone ${fr.zone}, 'YYYY-MM') as month, count(*) filter (where x.k = 'o')::int as opened, count(*) filter (where x.k = 'c')::int as closed
            from (select 'o' as k, c.created_at as at from runtime_case c where ${fr.where} and c.created_at >= ${lo} and c.created_at < ${hi}
                  union all
                  select 'c', c.closed_at from runtime_case c where ${fr.where} and c.status = 'CLOSED' and c.closed_at >= ${lo} and c.closed_at < ${hi}) x
           group by 1`;
        const by = new Map(rows.map((r) => [r.month, r]));
        return { kind: "LIST", rows: months.map((month) => ({ month, opened: Number(by.get(month)?.opened ?? 0), closed: Number(by.get(month)?.closed ?? 0) })) };
      },
    },
    {
      key: "reports.cases.stage_durations", module: MODULE, label: "Time spent in each stage", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "For each stage, how long finished stages took, start to end, in days (average and median), slowest first; the slowest is marked. A date range keeps the stages that ended in it. Only cases you may open.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f);
        // the slowest is found over every stage before any cut (break M3); a stage that ends before it starts is left out (break m4)
        const rows = await db.$queryRaw<{ stage: string; ended: number; avg_ms: number; median_ms: number; slowest: boolean }[]>`
          select g.*, g.avg_ms = max(g.avg_ms) over () and count(*) over () > 1 and min(g.avg_ms) over () < max(g.avg_ms) over () as slowest from (
            select s.staff_name as stage, count(*)::int as ended,
                   avg(extract(epoch from (s.ended_at - s.started_at)) * 1000)::float8 as avg_ms,
                   percentile_cont(0.5) within group (order by extract(epoch from (s.ended_at - s.started_at)) * 1000)::float8 as median_ms
              from case_stage s join runtime_case c on c.id = s.case_id
             where ${fr.where} and s.started_at is not null and s.ended_at is not null and s.ended_at >= s.started_at ${inFrame(Prisma.sql`s.ended_at`, fr)}
             group by s.staff_name) g
           order by g.avg_ms desc, g.stage`;
        return { kind: "LIST", rows: capped(rows,
          (r) => ({ stage: name(r.stage), ended: Number(r.ended), average_days: days(r.avg_ms), median_days: days(r.median_ms), slowest: r.slowest ? "Slowest" : null }),
          (more) => ({ stage: `${more.length} more stages`, ended: more.reduce((n, r) => n + Number(r.ended), 0), average_days: null, median_days: null, slowest: null })) };
      },
    },
    {
      key: "reports.cases.open_review_findings", module: MODULE, label: "Open review findings", kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Review findings still open (not acknowledged, waived, dismissed or resolved) on open cases: the deficiency count (Sample definition). A date range keeps the findings raised in it. Only cases you may open.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f);
        const [r] = await db.$queryRaw<{ n: number }[]>`
          select count(*)::int as n from review_finding x join runtime_case c on c.id = x.case_id
           where ${fr.where} and c.status = 'OPEN' and x.state = 'open' ${inFrame(Prisma.sql`x.created_at`, fr)}`;
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
