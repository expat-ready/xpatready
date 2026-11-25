// R1.79 part 2 (BACKLOG row PF-R2fo; map row 79; AG-14-5, -7, -31; AG-2-87 rules 1-6, 12, 13, 18): the front office's
// sales numbers, registered on PF-R1's one reporting door (MetricRegistry) at start-up. Reads only front-office tables
// and platform_staff (names on the per-person table); never a case-side or money table. Writes nothing (AG-14-1).
// Who is counted (AG-2-87 rule 1, AG-2-64): the lead and prospect lists' own rules, never re-derived (review M3):
//   * leads: `leadsSeenWhere` (source-filter.ts) with `visibilityOf` and `inactiveStaff`: all, else own and, when
//     Unassigned is visible, those with no active owner (an open lead of a deactivated owner is Unassigned, BR-4);
//   * prospects: `Prospects.list`'s rule: all with seesAll, else the viewer's own (an unassigned prospect is not theirs);
//   * report scope `own` (or a person filter): only that person's leads and prospects (owner), and a person filter
//     naming someone else counts nothing for a viewer who does not see all.
// Days and months are the firm's (platform.time_zone, AG-14 §6): the period is the lead list's `dayRange` (prospects.ts),
// both days included; a day before 1970 reads from 1970 and one after 2999 to 2999 (review m4).
// Drill-through (AG-14-22): none yet. The lead list's default view is open leads only, so a link there would open a
// different set than the figure (review M2); it comes with a list that can carry this exact set.
// A table is at most LIST_MAX_ROWS rows; past that, its last row says how many more there were (never a silent cut, M5).
// Rule 18: a lead closed as "Combined into another lead" or "Added to a prospect", and a prospect closed as "Combined
// into another prospect", count in no figure; a prospect lost as "Duplicate of another prospect" is out of the win rate.
// Release 1's model: the credited sales person of rule 13 is the prospect's owner; a prospect's engage date is its
// creation (a lead is engaged by making its prospect, prospects.ts); a WON prospect is one whose stage kind is WON.
// The client-type switch (AG-14-33) is the pipeline (Individual or Corporate), as AG-2-87 rule 2 says.
import { Prisma, type PrismaClient } from "@prisma/client";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { LIST_MAX_ROWS, type MetricFilters, type MetricReadContext, type MetricRegistration, type Reading } from "../../../../ports/metrics.ts";
import { Db } from "../../core.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { MetricRegistry } from "../../platform/reports/registry.ts";
import { readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { visibilityOf, type Visibility } from "../sales/common.ts";
import { dayRange } from "../sales/prospects.ts";
import { inactiveStaff, leadsSeenWhere } from "../sales/source-filter.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
type Row = Record<string, string | number | null>;
const MODULE = "front-office";
/** Rule 18: these closings make a lead or prospect count nowhere. */
export const NOT_COUNTED_LEAD = ["COMBINED_LEAD", "ADDED_TO_PROSPECT"], NOT_COUNTED_PROSPECT = ["COMBINED_PROSPECT"];
/** Rule 6: also out of the win rate. */
export const NOT_IN_WIN_RATE = ["DUPLICATE_PROSPECT", ...NOT_COUNTED_PROSPECT];
const EARLIEST_DAY = "1970-01-01", LATEST_DAY = "2999-12-31";
const clampDay = (d: string | undefined) => (d && d < EARLIEST_DAY ? EARLIEST_DAY : d && d > LATEST_DAY ? LATEST_DAY : d);

type Range = { gte?: Date; lt?: Date } | null;
/** The period in the firm's zone, as the lead list cuts it (dayRange). */
const periodOf = (db: Reader, ctx: MetricReadContext, f: MetricFilters): Promise<Range> => dayRange(db, ctx.firmId, clampDay(f.from), clampDay(f.to));
const between = (col: Prisma.Sql, r: Range) => Prisma.sql`${r?.gte ? Prisma.sql`and ${col} >= ${r.gte}` : Prisma.empty} ${r?.lt ? Prisma.sql`and ${col} < ${r.lt}` : Prisma.empty}`;
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);

/** At most LIST_MAX_ROWS rows: past that, the first LIST_MAX_ROWS - 1 (always with `pinned`, when given) and one row saying
 *  how many more (`rest` builds it). */
export function capped<T>(rows: T[], keep: (r: T) => Row, rest: (more: T[]) => Row, pinned?: (r: T) => boolean): Row[] {
  if (rows.length <= LIST_MAX_ROWS) return rows.map(keep);
  let head = rows.slice(0, LIST_MAX_ROWS - 1);
  const pin = pinned ? rows.find(pinned) : undefined;
  if (pin && !head.includes(pin)) head = [...head.slice(0, -1), pin];   // still in name order: the pinned row comes after every kept one
  return [...head.map(keep), rest(rows.filter((r) => !head.includes(r)))];
}

/** The lead list's rule, leadsSeenWhere (source-filter.ts), as a condition on fo_lead `t`. */
export function leadsSeenSql(me: string, vis: Visibility, inactive: string[]): Prisma.Sql {
  const w = leadsSeenWhere({ staffId: me } as StaffContext, vis, inactive);
  if (!w.OR) return Prisma.sql`true`;
  return Prisma.sql`(${Prisma.join(w.OR.map((o) => (o.ownerStaffId === null ? Prisma.sql`t.owner_staff_id is null` : typeof o.ownerStaffId === "string" ? Prisma.sql`t.owner_staff_id = ${o.ownerStaffId}::uuid` : Prisma.sql`t.owner_staff_id = any(${o.ownerStaffId.in}::uuid[])`)), " or ")})`;
}
/** An open lead with no active owner (the Unassigned list, BR-4). */
const unowned = (inactive: string[]) => Prisma.sql`(t.owner_staff_id is null or t.owner_staff_id = any(${inactive}::uuid[]))`;

/** Who the figure may count, as an owner condition on `t` (a fo_lead or fo_prospect): the list's rule, and under a
 *  person filter (or report scope own) only that person's, never another's for a viewer who does not see all. */
export async function ownerScope(db: Reader, ctx: MetricReadContext, f: MetricFilters, of: "lead" | "prospect"): Promise<Prisma.Sql> {
  const v = await visibilityOf(db, { firmId: ctx.firmId, keys: ctx.keys } as StaffContext);
  const personId = ctx.scope === "own" ? ctx.staffId : f.staffId;
  if (personId) return v.seesAll || personId.toLowerCase() === ctx.staffId.toLowerCase() ? Prisma.sql`t.owner_staff_id = ${personId}::uuid` : Prisma.sql`false`;
  if (of === "prospect") return v.seesAll ? Prisma.sql`true` : Prisma.sql`t.owner_staff_id = ${ctx.staffId}::uuid`;
  return leadsSeenSql(ctx.staffId, v, v.seesAll ? [] : await inactiveStaff(db, ctx.firmId));
}
const leadCounted = Prisma.sql`not exists (select 1 from fo_reason r where r.id = t.close_reason_id and r.key = any(${NOT_COUNTED_LEAD}::text[]))`;
const prospectCounted = Prisma.sql`not exists (select 1 from fo_reason r where r.id = t.lost_reason_id and r.key = any(${NOT_COUNTED_PROSPECT}::text[]))`;
const pipeline = (f: MetricFilters, col: Prisma.Sql) => (f.clientType ? Prisma.sql`and ${col}::text = ${f.clientType}` : Prisma.empty);
/** A lead's pipeline is its prospect's; a lead with no prospect yet has none and is left out only when the switch is on. */
const leadPipeline = (f: MetricFilters, lead = Prisma.sql`t.id`) => (f.clientType ? Prisma.sql`and exists (select 1 from fo_prospect p where p.firm_id = t.firm_id and p.lead_id = ${lead} and p.type::text = ${f.clientType})` : Prisma.empty);

export function salesMetrics(db: Reader, now: () => Date = () => new Date()): MetricRegistration[] {
  const leadsIn = async (ctx: MetricReadContext, f: MetricFilters) => Prisma.sql`t.firm_id = ${ctx.firmId}::uuid and ${await ownerScope(db, ctx, f, "lead")} and ${leadCounted} ${between(Prisma.sql`t.arrived_at`, await periodOf(db, ctx, f))} ${leadPipeline(f)}`;
  return [
    {
      key: "reports.sales.leads_added", module: MODULE, label: "Leads added", kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Leads that arrived in the period, closed ones included; a lead combined into another or added to a prospect counts once, as the one kept (AG-2-87 rules 3, 18). Only leads you may open.",
      async read(ctx, f): Promise<Reading> {
        const [r] = await db.$queryRaw<{ n: number }[]>`select count(*)::int as n from fo_lead t where ${await leadsIn(ctx, f)}`;
        return { kind: "COUNT", value: Number(r?.n ?? 0) };
      },
    },
    {
      key: "reports.sales.leads_by_source", module: MODULE, label: "Leads by source", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "The leads added in the period, by source, most first; past 199 sources the last row counts the rest, so the rows add up to the leads added (AG-2-87 rule 4). Only leads you may open.",
      async read(ctx, f): Promise<Reading> {
        const rows = await db.$queryRaw<{ source: string; leads: number }[]>`select t.source, count(*)::int as leads from fo_lead t where ${await leadsIn(ctx, f)} group by t.source order by count(*) desc, t.source`;
        return { kind: "LIST", rows: capped(rows, (r) => ({ source: r.source.slice(0, 300), leads: Number(r.leads) }), (more) => ({ source: `${more.length} more sources`, leads: more.reduce((n, r) => n + Number(r.leads), 0) })) };
      },
    },
    {
      key: "reports.sales.unassigned_waiting", module: MODULE, label: "Unassigned leads waiting", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: false, drillTarget: null,
      source: "Open leads with no active owner now, and how many of the firm's days the oldest has waited (AG-2-87 rule 12). Firm-wide; no row for someone who may not see unassigned leads; 0 under a person filter.",
      async read(ctx, f): Promise<Reading> {
        const v = await visibilityOf(db, { firmId: ctx.firmId, keys: ctx.keys } as StaffContext);
        if (!v.seesUnassigned) return { kind: "LIST", rows: [] };   // the Unassigned list is refused to them: no figure, never "nobody waiting" (m4)
        if (f.staffId) return { kind: "LIST", rows: [{ waiting: 0, oldest_days: null }] };
        const zone = await readSetting<string>(db, ctx.firmId, TIME_ZONE.key);
        const [r] = await db.$queryRaw<{ n: number; oldest: number | null }[]>`
          select count(*)::int as n, ((${now()}::timestamptz at time zone ${zone})::date - (min(t.arrived_at) at time zone ${zone})::date)::int as oldest
            from fo_lead t where t.firm_id = ${ctx.firmId}::uuid and t.state = 'OPEN' and ${unowned(await inactiveStaff(db, ctx.firmId))} ${leadPipeline(f)}`;
        return { kind: "LIST", rows: [{ waiting: Number(r?.n ?? 0), oldest_days: r?.oldest ?? null }] };
      },
    },
    {
      key: "reports.sales.stage_counts", module: MODULE, label: "Prospects in each stage", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Prospects in each open stage now, per pipeline, with the parked (Nurture) ones as one count (AG-2-87 rule 5). Counted now: the date range does not apply. Only prospects you may open.",
      async read(ctx, f): Promise<Reading> {
        const rows = await db.$queryRaw<{ pipeline: string; stage: string; kind: string; prospects: number }[]>`
          select s.pipeline::text as pipeline, case when s.kind = 'NURTURE' then 'Parked (Nurture)' else s.label end as stage, s.kind::text as kind, count(*)::int as prospects
            from fo_prospect t join fo_stage s on s.id = t.stage_id and s.firm_id = t.firm_id
           where t.firm_id = ${ctx.firmId}::uuid and s.kind in ('ACTIVE', 'NURTURE') and ${await ownerScope(db, ctx, f, "prospect")} and ${prospectCounted} ${pipeline(f, Prisma.sql`t.type`)}
           group by 1, 2, 3, s.kind = 'NURTURE' order by 1, s.kind = 'NURTURE', min(s.sort_order), 2`;
        return { kind: "LIST", rows: capped(rows, (r) => ({ pipeline: r.pipeline === "CORPORATE" ? "Corporate" : "Individual", stage: r.stage.slice(0, 300), prospects: Number(r.prospects) }), (more) => ({ pipeline: null, stage: `${more.length} more stages`, prospects: more.reduce((n, r) => n + Number(r.prospects), 0) })) };
      },
    },
    {
      key: "reports.sales.engage_rate", module: MODULE, label: "Engage rate", kind: "PERCENT", aggregation: "RATIO", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Of the leads that arrived in the period, the share now engaged (AG-2-87 rule 6); none when no lead arrived. Only leads you may open.",
      async read(ctx, f): Promise<Reading> {
        const [r] = await db.$queryRaw<{ n: number; engaged: number }[]>`select count(*)::int as n, count(*) filter (where t.state = 'ENGAGED')::int as engaged from fo_lead t where ${await leadsIn(ctx, f)}`;
        return { kind: "PERCENT", value: pct(Number(r?.engaged ?? 0), Number(r?.n ?? 0)) };
      },
    },
    {
      key: "reports.sales.win_rate", module: MODULE, label: "Win rate", kind: "PERCENT", aggregation: "RATIO", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Of the prospects engaged in the period, the share now won; a prospect lost as a duplicate is left out (AG-2-87 rule 6); none when no prospect was engaged. Only prospects you may open.",
      async read(ctx, f): Promise<Reading> {
        const [r] = await db.$queryRaw<{ n: number; won: number }[]>`
          select count(*)::int as n, count(*) filter (where s.kind = 'WON')::int as won
            from fo_prospect t join fo_stage s on s.id = t.stage_id and s.firm_id = t.firm_id
           where t.firm_id = ${ctx.firmId}::uuid and ${await ownerScope(db, ctx, f, "prospect")} ${between(Prisma.sql`t.created_at`, await periodOf(db, ctx, f))} ${pipeline(f, Prisma.sql`t.type`)}
             and not exists (select 1 from fo_reason r where r.id = t.lost_reason_id and r.key = any(${NOT_IN_WIN_RATE}::text[]))`;
        return { kind: "PERCENT", value: pct(Number(r?.won ?? 0), Number(r?.n ?? 0)) };
      },
    },
    {
      key: "reports.sales.per_person", module: MODULE, label: "Sales by person", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "One row per person, in name order: leads owned now, open prospects owned, prospects engaged and won, calls logged (connected) in the period. A deactivated person keeps a row, as (Inactive), with activity in the period (AG-2-87 rule 13, AG-14-31). Your own row unless you see all.",
      async read(ctx, f): Promise<Reading> {
        const v = await visibilityOf(db, { firmId: ctx.firmId, keys: ctx.keys } as StaffContext);
        const personId = ctx.scope === "own" ? ctx.staffId : f.staffId ?? (v.seesAll ? null : ctx.staffId);
        if (personId && !v.seesAll && personId.toLowerCase() !== ctx.staffId.toLowerCase()) return { kind: "LIST", rows: [] };
        const who = personId ? Prisma.sql`and st.id = ${personId}::uuid` : Prisma.empty;
        const range = await periodOf(db, ctx, f), firm = Prisma.sql`t.firm_id = ${ctx.firmId}::uuid`;
        // one aggregate per column, grouped by person and joined to staff (review m3: never a subquery per staff row)
        const rows = await db.$queryRaw<{ id: string; name: string; status: string; leads: number; open_prospects: number; engaged: number; won: number; calls: number; connected: number }[]>`
          with leads as (select t.owner_staff_id as id, count(*)::int as n from fo_lead t where ${firm} and t.state <> 'CLOSED' ${leadPipeline(f)} group by 1),
          open_p as (select t.owner_staff_id as id, count(*)::int as n from fo_prospect t join fo_stage s on s.id = t.stage_id and s.firm_id = t.firm_id where ${firm} and s.kind = 'ACTIVE' ${pipeline(f, Prisma.sql`t.type`)} group by 1),
          engaged as (select t.owner_staff_id as id, count(*)::int as n from fo_prospect t where ${firm} and ${prospectCounted} ${between(Prisma.sql`t.created_at`, range)} ${pipeline(f, Prisma.sql`t.type`)} group by 1),
          won as (select t.owner_staff_id as id, count(*)::int as n from fo_prospect t join fo_stage s on s.id = t.stage_id and s.firm_id = t.firm_id where ${firm} and s.kind = 'WON' ${between(Prisma.sql`t.won_at`, range)} ${pipeline(f, Prisma.sql`t.type`)} group by 1),
          calls as (select t.by_actor as actor, count(*)::int as n, count(*) filter (where t.outcome = 'CONNECTED')::int as connected from fo_call t where ${firm} ${between(Prisma.sql`t.started_at`, range)} ${leadPipeline(f, Prisma.sql`t.lead_id`)} group by 1)
          select st.id::text as id, st.display_name as name, st.status::text as status, coalesce(l.n, 0)::int as leads, coalesce(o.n, 0)::int as open_prospects,
                 coalesce(e.n, 0)::int as engaged, coalesce(w.n, 0)::int as won, coalesce(c.n, 0)::int as calls, coalesce(c.connected, 0)::int as connected
            from platform_staff st left join leads l on l.id = st.id left join open_p o on o.id = st.id left join engaged e on e.id = st.id
                 left join won w on w.id = st.id left join calls c on c.actor = 'staff:' || st.id::text
           where st.firm_id = ${ctx.firmId}::uuid ${who}
             and (st.status = 'ACTIVE' or coalesce(e.n, 0) + coalesce(w.n, 0) + coalesce(c.n, 0) > 0)   -- AG-14-31: an inactive person only with activity in the period, before the cap (M5)
           order by st.display_name, st.id`;
        const sum = (more: typeof rows, k: "leads" | "open_prospects" | "engaged" | "won" | "calls" | "connected") => more.reduce((n, r) => n + Number(r[k]), 0);
        return { kind: "LIST", rows: capped(rows,
          (r) => ({ person: `${r.status === "ACTIVE" ? "" : "(Inactive) "}${r.name}`.slice(0, 300), leads_owned: Number(r.leads), open_prospects: Number(r.open_prospects), engaged: Number(r.engaged), won: Number(r.won), calls: Number(r.calls), connected: Number(r.connected) }),
          (more) => ({ person: `${more.length} more people`, leads_owned: sum(more, "leads"), open_prospects: sum(more, "open_prospects"), engaged: sum(more, "engaged"), won: sum(more, "won"), calls: sum(more, "calls"), connected: sum(more, "connected") }),
          (r) => r.id.toLowerCase() === ctx.staffId.toLowerCase()) };   // the caller's own row is never in the "more" (M5)
      },
    },
  ];
}

/** Registers the sales numbers on the one reporting door at start-up. */
export class SalesReports implements OnModuleInit {
  constructor(private readonly registry: MetricRegistry, private readonly db: Db) {}
  onModuleInit() { for (const m of salesMetrics(this.db)) this.registry.register(m); }
}
Injectable()(SalesReports);
[MetricRegistry, Db].forEach((t, i) => Inject(t)(SalesReports, undefined, i));
