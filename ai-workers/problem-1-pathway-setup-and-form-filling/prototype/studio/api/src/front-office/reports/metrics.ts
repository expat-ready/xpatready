// R1.79 part 2 (BACKLOG row PF-R2fo; map row 79; AG-14-5, -7, -31; AG-2-87 rules 1-6, 12, 13, 18): the front office's
// sales numbers, registered on PF-R1's one reporting door (MetricRegistry) at start-up. Reads only front-office tables
// and platform_staff (names on the per-person table); never a case-side or money table. Writes nothing (AG-14-1).
// Who is counted (AG-2-87 rule 1, AG-2-64): the one lead rule, `visibilityOf` (sales/common.ts), never re-derived:
// every lead and prospect the figure counts is one the viewer may open in the lead and prospect lists (rule 16).
//   * report scope `own` (or a person filter): only that person's leads and prospects (owner);
//   * scope `all`: the firm's when the viewer sees all, else their own plus the unassigned leads they may see.
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
import { visibilityOf } from "../sales/common.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
const MODULE = "front-office";
/** Rule 18: these closings make a lead or prospect count nowhere. */
export const NOT_COUNTED_LEAD = ["COMBINED_LEAD", "ADDED_TO_PROSPECT"], NOT_COUNTED_PROSPECT = ["COMBINED_PROSPECT"];
/** Rule 6: also out of the win rate. */
export const NOT_IN_WIN_RATE = ["DUPLICATE_PROSPECT", ...NOT_COUNTED_PROSPECT];
const LEADS = { path: "/api/front-office/leads", carries: {} };

const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dayAfter = (d: string) => new Date(dayStart(d).getTime() + 86_400_000);
const between = (col: Prisma.Sql, f: MetricFilters) => Prisma.sql`${f.from ? Prisma.sql`and ${col} >= ${dayStart(f.from)}` : Prisma.empty} ${f.to ? Prisma.sql`and ${col} < ${dayAfter(f.to)}` : Prisma.empty}`;
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);

/** Who the figure may count, as an owner condition on a table aliased `t` with `owner_staff_id`: unassigned rows only
 *  where the viewer may see them, and never under a person filter. */
export async function ownerScope(db: Reader, ctx: MetricReadContext, f: MetricFilters): Promise<Prisma.Sql> {
  const v = await visibilityOf(db, { firmId: ctx.firmId, keys: ctx.keys } as StaffContext);
  const personId = ctx.scope === "own" ? ctx.staffId : f.staffId;
  if (personId) return v.seesAll || personId.toLowerCase() === ctx.staffId.toLowerCase() ? Prisma.sql`t.owner_staff_id = ${personId}::uuid` : Prisma.sql`false`;
  if (v.seesAll) return Prisma.sql`true`;
  return v.seesUnassigned ? Prisma.sql`(t.owner_staff_id = ${ctx.staffId}::uuid or t.owner_staff_id is null)` : Prisma.sql`t.owner_staff_id = ${ctx.staffId}::uuid`;
}
const leadCounted = Prisma.sql`not exists (select 1 from fo_reason r where r.id = t.close_reason_id and r.key = any(${NOT_COUNTED_LEAD}::text[]))`;
const prospectCounted = Prisma.sql`not exists (select 1 from fo_reason r where r.id = t.lost_reason_id and r.key = any(${NOT_COUNTED_PROSPECT}::text[]))`;
const pipeline = (f: MetricFilters, col: Prisma.Sql) => (f.clientType ? Prisma.sql`and ${col}::text = ${f.clientType}` : Prisma.empty);
/** A lead's pipeline is its prospect's; a lead with no prospect yet has none and is left out only when the switch is on. */
const leadPipeline = (f: MetricFilters) => (f.clientType ? Prisma.sql`and exists (select 1 from fo_prospect p where p.firm_id = t.firm_id and p.lead_id = t.id and p.type::text = ${f.clientType})` : Prisma.empty);

export function salesMetrics(db: Reader, now: () => Date = () => new Date()): MetricRegistration[] {
  const leadsIn = async (ctx: MetricReadContext, f: MetricFilters) => Prisma.sql`t.firm_id = ${ctx.firmId}::uuid and ${await ownerScope(db, ctx, f)} and ${leadCounted} ${between(Prisma.sql`t.arrived_at`, f)} ${leadPipeline(f)}`;
  return [
    {
      key: "reports.sales.leads_added", module: MODULE, label: "Leads added", kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true, drillTarget: LEADS,
      source: "Leads that arrived in the period, closed ones included; a lead combined into another or added to a prospect counts once, as the one kept (AG-2-87 rules 3, 18). Only leads you may open.",
      async read(ctx, f): Promise<Reading> {
        const [r] = await db.$queryRaw<{ n: number }[]>`select count(*)::int as n from fo_lead t where ${await leadsIn(ctx, f)}`;
        return { kind: "COUNT", value: Number(r?.n ?? 0) };
      },
    },
    {
      key: "reports.sales.leads_by_source", module: MODULE, label: "Leads by source", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "The leads added in the period, by source; nothing is dropped (AG-2-87 rule 4). Only leads you may open.",
      async read(ctx, f): Promise<Reading> {
        const rows = await db.$queryRaw<{ source: string; leads: number }[]>`select t.source, count(*)::int as leads from fo_lead t where ${await leadsIn(ctx, f)} group by t.source order by count(*) desc, t.source limit ${LIST_MAX_ROWS}`;
        return { kind: "LIST", rows: rows.map((r) => ({ source: r.source.slice(0, 300), leads: Number(r.leads) })) };
      },
    },
    {
      key: "reports.sales.unassigned_waiting", module: MODULE, label: "Unassigned leads waiting", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: false, drillTarget: null,
      source: "Open leads with no owner now, and how many days the oldest has waited (AG-2-87 rule 12). Firm-wide; only for those who may see unassigned leads.",
      async read(ctx, f): Promise<Reading> {
        const v = await visibilityOf(db, { firmId: ctx.firmId, keys: ctx.keys } as StaffContext);
        if (!v.seesUnassigned || f.staffId) return { kind: "LIST", rows: [{ waiting: 0, oldest_days: null }] };
        const [r] = await db.$queryRaw<{ n: number; oldest: Date | null }[]>`select count(*)::int as n, min(t.arrived_at) as oldest from fo_lead t where t.firm_id = ${ctx.firmId}::uuid and t.state = 'OPEN' and t.owner_staff_id is null ${leadPipeline(f)}`;
        const oldest = r?.oldest ? Math.floor((now().getTime() - new Date(r.oldest).getTime()) / 86_400_000) : null;
        return { kind: "LIST", rows: [{ waiting: Number(r?.n ?? 0), oldest_days: oldest }] };
      },
    },
    {
      key: "reports.sales.stage_counts", module: MODULE, label: "Prospects in each stage", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "Prospects in each open stage now, per pipeline, with the parked (Nurture) ones as one count (AG-2-87 rule 5). Counted now: the date range does not apply. Only prospects you may open.",
      async read(ctx, f): Promise<Reading> {
        const rows = await db.$queryRaw<{ pipeline: string; stage: string; kind: string; prospects: number }[]>`
          select s.pipeline::text as pipeline, case when s.kind = 'NURTURE' then 'Parked (Nurture)' else s.label end as stage, s.kind::text as kind, count(*)::int as prospects
            from fo_prospect t join fo_stage s on s.id = t.stage_id and s.firm_id = t.firm_id
           where t.firm_id = ${ctx.firmId}::uuid and s.kind in ('ACTIVE', 'NURTURE') and ${await ownerScope(db, ctx, f)} and ${prospectCounted} ${pipeline(f, Prisma.sql`t.type`)}
           group by 1, 2, 3, s.kind = 'NURTURE' order by 1, s.kind = 'NURTURE', min(s.sort_order), 2 limit ${LIST_MAX_ROWS}`;
        return { kind: "LIST", rows: rows.map((r) => ({ pipeline: r.pipeline === "CORPORATE" ? "Corporate" : "Individual", stage: r.stage.slice(0, 300), prospects: Number(r.prospects) })) };
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
           where t.firm_id = ${ctx.firmId}::uuid and ${await ownerScope(db, ctx, f)} ${between(Prisma.sql`t.created_at`, f)} ${pipeline(f, Prisma.sql`t.type`)}
             and not exists (select 1 from fo_reason r where r.id = t.lost_reason_id and r.key = any(${NOT_IN_WIN_RATE}::text[]))`;
        return { kind: "PERCENT", value: pct(Number(r?.won ?? 0), Number(r?.n ?? 0)) };
      },
    },
    {
      key: "reports.sales.per_person", module: MODULE, label: "Sales by person", kind: "LIST", aggregation: "LIST", moneyTreatment: "NONE", scopeAware: true, drillTarget: null,
      source: "One row per person, never ranked: leads owned now, open prospects owned, prospects engaged, prospects won and calls logged (connected) in the period. Someone deactivated keeps a row, as (Inactive), when they had activity in the period (AG-2-87 rule 13, AG-14-31). Only your own row unless you see all.",
      async read(ctx, f): Promise<Reading> {
        const v = await visibilityOf(db, { firmId: ctx.firmId, keys: ctx.keys } as StaffContext);
        const personId = ctx.scope === "own" ? ctx.staffId : f.staffId ?? (v.seesAll ? null : ctx.staffId);
        if (personId && !v.seesAll && personId.toLowerCase() !== ctx.staffId.toLowerCase()) return { kind: "LIST", rows: [] };
        const who = personId ? Prisma.sql`and st.id = ${personId}::uuid` : Prisma.empty;
        const actor = Prisma.sql`('staff:' || st.id::text)`;
        const rows = await db.$queryRaw<{ name: string; status: string; leads: number; open_prospects: number; engaged: number; won: number; calls: number; connected: number }[]>`
          select st.display_name as name, st.status::text as status,
            (select count(*) from fo_lead t where t.firm_id = st.firm_id and t.owner_staff_id = st.id and t.state <> 'CLOSED')::int as leads,
            (select count(*) from fo_prospect t join fo_stage s on s.id = t.stage_id where t.firm_id = st.firm_id and t.owner_staff_id = st.id and s.kind = 'ACTIVE' ${pipeline(f, Prisma.sql`t.type`)})::int as open_prospects,
            (select count(*) from fo_lead t where t.firm_id = st.firm_id and t.engaged_by = ${actor} and ${leadCounted} ${between(Prisma.sql`t.engaged_at`, f)} ${leadPipeline(f)})::int as engaged,
            (select count(*) from fo_prospect t join fo_stage s on s.id = t.stage_id where t.firm_id = st.firm_id and t.owner_staff_id = st.id and s.kind = 'WON' ${between(Prisma.sql`t.won_at`, f)} ${pipeline(f, Prisma.sql`t.type`)})::int as won,
            (select count(*) from fo_call c where c.firm_id = st.firm_id and c.by_actor = ${actor} ${between(Prisma.sql`c.started_at`, f)})::int as calls,
            (select count(*) from fo_call c where c.firm_id = st.firm_id and c.by_actor = ${actor} and c.outcome = 'CONNECTED' ${between(Prisma.sql`c.started_at`, f)})::int as connected
            from platform_staff st where st.firm_id = ${ctx.firmId}::uuid ${who}
           order by st.display_name, st.id limit ${LIST_MAX_ROWS}`;
        return { kind: "LIST", rows: rows
          .filter((r) => r.status === "ACTIVE" || Number(r.engaged) + Number(r.won) + Number(r.calls) > 0)   // AG-14-31: an inactive person only with activity in the period
          .map((r) => ({ person: `${r.status === "ACTIVE" ? "" : "(Inactive) "}${r.name}`.slice(0, 300), leads_owned: Number(r.leads), open_prospects: Number(r.open_prospects), engaged: Number(r.engaged), won: Number(r.won), calls: Number(r.calls), connected: Number(r.connected) })) };
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
