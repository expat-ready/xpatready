// R1.79 part 3 (BACKLOG row PF-R2cm; map row 79; AG-14-13, -14, -15, -36, -37; MS-D20(15), MS-D24; P-567): client money's
// dashboard figures, registered on PF-R1's one reporting door (MetricRegistry, POST /api/platform/reports/query) at
// start-up. No second report route, no rollup table (Q8: live reads), nothing written (AG-14-1).
// Every figure is per currency (CAD and USD apart, never added or converted: AG-14-15, R18) and declared PER_CURRENCY, so
// the door answers it only to a holder of agent/report:view-financial, firm-wide (ports/metrics.ts scopeFor; AG-14 §2:
// "firm-wide financial reports come from view-financial, not from view.all"); anyone else gets WITHHELD.
// The facts are FO-7r's, term for term (reports/statement.ts ledgerCtes, the INVOICES account; reads/status-sql.ts):
//   * Fees billed: issued invoices' stored totals (money_invoice_total: lines with their tax, government fees included),
//     less credit notes (MS-D24: a credit note reduces the figure it reverses), each on its own day;
//   * Fees collected (AG-14-13, -36): money paid on issued invoices into operating, less its refunds, plus money paid
//     from trust to an invoice, less a correction of that withdrawal, less money a credit note refunded of a trust-paid
//     part (the statement's RETURNED_FROM_TRUST). Credit applied is the same money again, never counted (FO-7r break M1);
//     a trust deposit is never fees (MS-D20(15));
//   * Trust received (AG-14-36): deposits into trust, less a correction of a deposit and refunds out of trust to the
//     client (MS-D24); a withdrawal to an invoice is not taken off (that money was received). While trust does not show
//     for the firm (AG-6-59 rules 5-6), the answer holds no trust figure (an empty list of figures);
//   * Overdue ageing (AG-14-14): issued invoices with a balance (status-sql.ts DUE_SQL's terms, set-based) that are not written off, by days
//     past the due date on the firm's today; "Current" is not yet past due (or no due date). The date range does not
//     apply (it is today's book). "Disputed" (MS-D24) is not marked: no dispute is recorded on main (not known);
//   * Tax collected (AG-14-37): the tax on issued invoices' lines, by issue day, per tax name and currency. The tax name
//     is the cited table's (tax/canada-gst-hst.ts) for the line's rate: 5 % is GST, 13-15 % HST; a rate the table does
//     not hold is named by its percentage. Issue day and credit notes not deducted: AG-14 §13 Q10 leaves both to the
//     firm's accountant (Sample choice, stated in the figure's words). Unconfirmed: no accountant.
// A fact's day is the firm's (platform.time_zone, AG-14 §6) and a fact dated before its invoice's issue counts from the
// issue (the statement's greatest(…, issued_at)). The filter bar narrows: a person filter keeps the money on cases that
// person owns or is on the open team of (case-access.ts's own rule; money with no case is nobody's); the client-type
// switch is the billed party: a person is Individual, a company Corporate.
// A table is at most LIST_MAX_ROWS rows; past that, its last row says how many more there were (never a silent cut).
import { Prisma, type PrismaClient } from "@prisma/client";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { LIST_MAX_ROWS, type MetricFilters, type MetricReadContext, type MetricRegistration, type Reading } from "../../../../ports/metrics.ts";
import { CASE_VIEW_OWN, caseScope, caseVisibleSql } from "../../case-access.ts";
import { Db } from "../../core.ts";
import { PlatformClock } from "../../platform/identity/port.ts";
import { MetricRegistry } from "../../platform/reports/registry.ts";
import { readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { trustShows } from "../reads/common.ts";
import { PROVINCE_TAX_RATES } from "../tax/canada-gst-hst.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
type Row = Record<string, string | number | null>;
type Currency = "CAD" | "USD";
const MODULE = "client-money";
/** The earliest day a figure reads from (no money is older); a later start reads as given. */
const EARLIEST_DAY = "1970-01-01";
/** The ageing buckets (AG-14-14): days past the due date, upper bounds included; the last has none. */
export const AGEING_BUCKETS = [
  { key: "current", label: "Current", from: null, to: 0 },
  { key: "days_1_30", label: "1-30 days", from: 1, to: 30 },
  { key: "days_31_60", label: "31-60 days", from: 31, to: 60 },
  { key: "days_61_90", label: "61-90 days", from: 61, to: 90 },
  { key: "days_90_plus", label: "90+ days", from: 91, to: null },
] as const;
/** The bucket of an invoice `days` past its due date (null: no due date), the rule the SQL below spells out. */
export const bucketOf = (days: number | null) => AGEING_BUCKETS.find((b) => (b.from === null ? days === null || days <= b.to : days !== null && days >= b.from && (b.to === null || days <= b.to)))!.key;

/** Minor units as major units with two decimals ("1234.50"; AG-14-15: never raw minor units). */
export const major = (minor: bigint | number | string): string => {
  const v = BigInt(minor), neg = v < 0n, a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};
/** The tax name of a rate in parts per million: the cited table's (GST or HST), else the percentage in words. */
export function taxNameOf(ratePpm: number): string {
  const names = [...new Set(Object.values(PROVINCE_TAX_RATES).filter((e) => e.ratePpm === ratePpm).map((e) => e.taxName))];
  return names.length === 1 ? names[0]! : `Tax at ${ratePpm / 10_000}%`;
}

/** The read's frame: who (a condition on a money row with firm_id, case_id, person_id and company_id), the firm's zone and
 *  the period as timestamps in that zone (the end exclusive: the day after `to`). */
export type Frame = { firmId: string; who: (x: string) => Prisma.Sql; zone: string; from: Prisma.Sql | null; to: Prisma.Sql | null };
export async function frameOf(db: Reader, ctx: MetricReadContext, f: MetricFilters): Promise<Frame> {
  // the door reads a PER_CURRENCY figure only at the financial scope; any other read is refused here too (UNAVAILABLE)
  if (ctx.scope !== "financial") throw new Error("money figures are firm-wide (view-financial) only");
  const zone = await readSetting<string>(db as PrismaClient, ctx.firmId, TIME_ZONE.key);
  const clamp = (d: string | undefined) => (d && d < EARLIEST_DAY ? EARLIEST_DAY : d);
  const at = (day: string, plus = 0) => Prisma.sql`((${day}::date + ${plus}::int)::timestamp at time zone ${zone})`;
  const from = clamp(f.from), to = clamp(f.to);
  const person = f.staffId ? await caseScope(db, { firmId: ctx.firmId, staffId: f.staffId, keys: [CASE_VIEW_OWN] }) : null;
  const who = (x: string) => {
    const a = Prisma.raw(x), parts = [Prisma.sql`${a}.firm_id = ${ctx.firmId}::uuid`];
    if (person) parts.push(Prisma.sql`${a}.case_id in (select c.id from runtime_case c where c.firm_id = ${ctx.firmId}::uuid and ${caseVisibleSql(person)})`);
    if (f.clientType) parts.push(f.clientType === "CORPORATE" ? Prisma.sql`${a}.company_id is not null` : Prisma.sql`${a}.person_id is not null`);
    return Prisma.join(parts, " and ");
  };
  return { firmId: ctx.firmId, who, zone, from: from ? at(from) : null, to: to ? at(to, 1) : null };
}
const inPeriod = (col: Prisma.Sql, fr: Frame) => Prisma.sql`${fr.from ? Prisma.sql`and ${col} >= ${fr.from}` : Prisma.empty} ${fr.to ? Prisma.sql`and ${col} < ${fr.to}` : Prisma.empty}`;
/** One figure per currency that has one, CAD first (never one total). */
const perCurrency = (rows: { currency: Currency; amount: string }[]): Reading => ({ kind: "MONEY", figures: rows.sort((a, b) => a.currency.localeCompare(b.currency)).map((r) => ({ currency: r.currency, amount: major(r.amount) })) });
/** The firm's today (YYYY-MM-DD in its zone). */
const todayIn = (zone: string, now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
/** An issued invoice `i` the frame counts. */
const issued = (fr: Frame) => Prisma.sql`${fr.who("i")} and i.issued_at is not null`;
const ON_INVOICE = (x: string) => Prisma.sql`join money_invoice i on i.firm_id = ${Prisma.raw(x)}.firm_id and i.id = ${Prisma.raw(x)}.invoice_id`;

/** Fees billed, each fact signed and dated (exported for the plan check). */
export const billedSql = (fr: Frame) => Prisma.sql`
  select x.currency, sum(x.amount)::text as amount from (
    select i.currency::text as currency, money_invoice_total(i.firm_id, i.id)::bigint as amount, i.issued_at as at from money_invoice i where ${issued(fr)}
    union all select i.currency::text, -c.amount_minor::bigint, greatest(c.created_at, i.issued_at) from money_credit_note c ${ON_INVOICE("c")} where ${issued(fr)}
  ) x where true ${inPeriod(Prisma.sql`x.at`, fr)} group by x.currency`;
/** Fees collected, each fact signed and dated as the statement's INVOICES lines (exported for the plan check). */
export const collectedSql = (fr: Frame) => Prisma.sql`
  select x.currency, sum(x.amount)::text as amount from (
    select i.currency::text as currency, p.amount_minor::bigint as amount, greatest(p.received_at, i.issued_at) as at from money_payment p ${ON_INVOICE("p")} where ${issued(fr)} and p.received_into = 'OPERATING'
    union all select i.currency::text, -r.amount_minor::bigint, greatest(r.created_at, i.issued_at) from money_refund r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id ${ON_INVOICE("p")} where ${issued(fr)}
    union all select i.currency::text, -e.amount_minor::bigint, greatest(e.created_at, i.issued_at) from money_trust_entry e ${ON_INVOICE("e")} where ${issued(fr)} and e.kind = 'WITHDRAWAL_TO_INVOICE'
    union all select i.currency::text, -c.amount_minor::bigint, greatest(c.created_at, i.issued_at) from money_trust_entry c join money_trust_entry w on w.firm_id = c.firm_id and w.id = c.corrects_entry_id ${ON_INVOICE("w")} where ${issued(fr)} and c.kind = 'CORRECTION'
    union all select i.currency::text, -coalesce(c.overpaid_minor, 0)::bigint, greatest(c.created_at, i.issued_at) from money_credit_note c ${ON_INVOICE("c")} where ${issued(fr)} and c.overpaid_choice = 'OVERPAID_REFUND'
  ) x where true ${inPeriod(Prisma.sql`x.at`, fr)} group by x.currency`;
/** Trust received (exported for the plan check). */
export const trustSql = (fr: Frame) => Prisma.sql`
  select e.currency::text as currency, sum(e.amount_minor::bigint)::text as amount from money_trust_entry e
    left join money_trust_entry d on d.firm_id = e.firm_id and d.id = e.corrects_entry_id
   where ${fr.who("e")} and (e.kind in ('DEPOSIT', 'REFUND_TO_CLIENT') or (e.kind = 'CORRECTION' and d.kind = 'DEPOSIT')) ${inPeriod(Prisma.sql`e.created_at`, fr)}
   group by e.currency`;
/** Each issued invoice not written off, with its currency, party, days past due on `today` and what is still due: status-sql.ts's
 *  DUE_SQL over FACTS_LATERAL's terms (total − credited − paid, paid = operating − refunded + trust + applied, trust per
 *  invoice never below zero), read set-based: each fact table once for the firm's invoices, grouped, never a function per
 *  invoice (3,000 invoices: 250 ms that way). tests/check_pfr2cm_metrics.ts DW4 holds it equal to DUE_SQL per invoice. */
export const openSql = (fr: Frame, today: string) => {
  const F = Prisma.sql`${fr.firmId}::uuid`;
  return Prisma.sql`with inv as materialized (select i.id, i.currency, i.person_id, i.company_id, i.due_date from money_invoice i
        where ${issued(fr)} and not exists (select 1 from money_write_off w where w.firm_id = i.firm_id and w.invoice_id = i.id)),
      tot as (select l.invoice_id as id, sum(l.amount_minor::bigint + l.tax_minor) as v from money_invoice_line l join inv on inv.id = l.invoice_id where l.firm_id = ${F} group by 1),
      cn as (select c.invoice_id as id, sum(c.amount_minor::bigint) as v, sum(coalesce(c.overpaid_minor, 0)::bigint) filter (where c.overpaid_choice = 'OVERPAID_REFUND') as back
        from money_credit_note c join inv on inv.id = c.invoice_id where c.firm_id = ${F} group by 1),
      op as (select p.invoice_id as id, sum(p.amount_minor::bigint) as v from money_payment p join inv on inv.id = p.invoice_id where p.firm_id = ${F} and p.received_into = 'OPERATING' group by 1),
      rf as (select p.invoice_id as id, sum(r.amount_minor::bigint) as v from money_refund r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id join inv on inv.id = p.invoice_id where r.firm_id = ${F} group by 1),
      tw as (select x.id, sum(x.v) as v from (
          select e.invoice_id as id, -e.amount_minor::bigint as v from money_trust_entry e join inv on inv.id = e.invoice_id where e.firm_id = ${F} and e.kind = 'WITHDRAWAL_TO_INVOICE'
          union all select w.invoice_id, -c.amount_minor::bigint from money_trust_entry c join money_trust_entry w on w.firm_id = c.firm_id and w.id = c.corrects_entry_id join inv on inv.id = w.invoice_id where c.firm_id = ${F} and c.kind = 'CORRECTION') x group by 1),
      -- credit applied: money_invoice_credit's "e.invoice_id = inv or p.invoice_id = inv" as two joins (the statement's ca), with each entry's reversals
      ae as (select e.id as entry, e.invoice_id as id, e.amount_minor::bigint as v from money_credit_entry e join inv on inv.id = e.invoice_id where e.firm_id = ${F} and e.kind = 'APPLIED'
        union all select e.id, p.invoice_id, e.amount_minor::bigint from money_credit_entry e join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id join inv on inv.id = p.invoice_id
         where e.firm_id = ${F} and e.kind = 'APPLIED' and e.invoice_id is distinct from p.invoice_id),
      ap as (select ae.id, -sum(ae.v + coalesce((select sum(r.amount_minor::bigint) from money_credit_entry r where r.firm_id = ${F} and r.reverses_entry_id = ae.entry), 0)) as v from ae group by 1)
    select inv.currency::text as currency, inv.person_id, inv.company_id, (${today}::date - inv.due_date)::int as days,
           greatest(0, coalesce(tot.v, 0) - coalesce(cn.v, 0) - (coalesce(op.v, 0) - coalesce(rf.v, 0) + greatest(coalesce(tw.v, 0) - coalesce(cn.back, 0), 0) + coalesce(ap.v, 0))) as due
      from inv left join tot on tot.id = inv.id left join cn on cn.id = inv.id left join op on op.id = inv.id left join rf on rf.id = inv.id left join tw on tw.id = inv.id left join ap on ap.id = inv.id`;
};

export function moneyMetrics(db: Reader, now: () => Date = () => new Date()): MetricRegistration[] {
  const money = (key: string, label: string, source: string, sql: (fr: Frame) => Prisma.Sql, gate?: (ctx: MetricReadContext) => Promise<boolean>): MetricRegistration => ({
    key: `reports.money.${key}`, module: MODULE, label, kind: "MONEY", aggregation: "SUM", moneyTreatment: "PER_CURRENCY", scopeAware: false, drillTarget: null, source,
    async read(ctx, f): Promise<Reading> {
      const fr = await frameOf(db, ctx, f);
      if (gate && !(await gate(ctx))) return { kind: "MONEY", figures: [] };
      return perCurrency(await db.$queryRaw<{ currency: Currency; amount: string }[]>(sql(fr)));
    },
  });
  return [
    money("fees_billed", "Fees billed", "Issued invoices' totals (tax and government fees included) on their issue day, less credit notes on theirs, in the period. One total per currency, never added.", billedSql),
    money("fees_collected", "Fees collected", "Money paid on invoices in the period: paid into operating less its refunds, plus money paid from trust to an invoice less its corrections. Money paid into trust is never fees. One total per currency.", collectedSql),
    money("trust_received", "Trust received", "Money clients paid into trust in the period, less corrections of a deposit and refunds out of trust. Client money, apart from fees and never added to them. Only while the firm holds trust money.", trustSql,
      (ctx) => trustShows(db as Prisma.TransactionClient, ctx.firmId)),
    {
      key: "reports.money.overdue_total", module: MODULE, label: "Overdue", kind: "MONEY", aggregation: "SUM", moneyTreatment: "PER_CURRENCY", scopeAware: false, drillTarget: null,
      source: "What is still owed on issued invoices past their due date today, not written off. One total per currency. The date range does not apply.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f), today = todayIn(fr.zone, now());
        return perCurrency(await db.$queryRaw<{ currency: Currency; amount: string }[]>`select o.currency, sum(o.due)::text as amount from (${openSql(fr, today)}) o where o.due > 0 and o.days >= 1 group by o.currency`);
      },
    },
    {
      key: "reports.money.overdue_ageing", module: MODULE, label: "Overdue ageing", kind: "LIST", aggregation: "LIST", moneyTreatment: "PER_CURRENCY", scopeAware: false, drillTarget: null,
      source: "What is still owed on issued invoices, not written off, by days past the due date today: current, 1-30, 31-60, 61-90 and 90+, with the overdue total. One row per currency. The date range does not apply.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f), today = todayIn(fr.zone, now());
        const sum = (b: (typeof AGEING_BUCKETS)[number]) => Prisma.sql`coalesce(sum(o.due) filter (where ${b.from === null ? Prisma.sql`(o.days is null or o.days <= ${b.to})` : b.to === null ? Prisma.sql`o.days >= ${b.from}` : Prisma.sql`o.days between ${b.from} and ${b.to}`}), 0)::text as ${Prisma.raw(b.key)}`;
        const rows = await db.$queryRaw<(Record<string, string> & { currency: Currency })[]>`
          select o.currency, ${Prisma.join(AGEING_BUCKETS.map(sum), ", ")}, coalesce(sum(o.due) filter (where o.days >= 1), 0)::text as overdue_total
            from (${openSql(fr, today)}) o where o.due > 0 group by o.currency order by o.currency`;
        return { kind: "LIST", rows: rows.map((r) => ({ currency: r.currency, ...Object.fromEntries(AGEING_BUCKETS.map((b) => [b.key, major(r[b.key]!)])), overdue_total: major(r.overdue_total!) })) };
      },
    },
    {
      key: "reports.money.overdue_by_client", module: MODULE, label: "Overdue by client", kind: "LIST", aggregation: "LIST", moneyTreatment: "PER_CURRENCY", scopeAware: false, drillTarget: null,
      source: "Each client with money overdue today, per currency: the amount and how many days the oldest is past due; most owed first. The date range does not apply.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f), today = todayIn(fr.zone, now());
        const rows = await db.$queryRaw<{ client: string | null; kind: string; currency: Currency; amount: string; oldest: number }[]>`
          select coalesce(nullif(trim(concat_ws(' ', p.given_names, p.family_name)), ''), nullif(trim(c.operating_name), '')) as client,
                 case when o.person_id is not null then 'Individual' else 'Corporate' end as kind, o.currency, sum(o.due)::text as amount, max(o.days)::int as oldest
            from (${openSql(fr, today)}) o
            left join fo_person p on p.firm_id = ${ctx.firmId}::uuid and p.id = o.person_id left join fo_company c on c.firm_id = ${ctx.firmId}::uuid and c.id = o.company_id
           where o.due > 0 and o.days >= 1
           group by coalesce(o.person_id, o.company_id), 1, 2, o.currency order by sum(o.due) desc, 1 nulls last`;
        const keep = (r: (typeof rows)[number]): Row => ({ client: r.client ? Array.from(r.client).slice(0, 120).join("") : null, client_type: r.kind, currency: r.currency, overdue: major(r.amount), oldest_days: Number(r.oldest) });
        if (rows.length <= LIST_MAX_ROWS) return { kind: "LIST", rows: rows.map(keep) };
        // past the cap: one "more clients" row per currency for the rest, so no currency is ever added to another
        const head = rows.slice(0, LIST_MAX_ROWS - 2), rest = rows.slice(LIST_MAX_ROWS - 2);
        const more = (["CAD", "USD"] as const).flatMap((cur) => { const m = rest.filter((r) => r.currency === cur); return m.length ? [{ client: `${m.length} more clients`, client_type: null, currency: cur, overdue: major(m.reduce((n, r) => n + BigInt(r.amount), 0n)), oldest_days: Math.max(...m.map((r) => Number(r.oldest))) }] : []; });
        return { kind: "LIST", rows: [...head.map(keep), ...more] };
      },
    },
    {
      key: "reports.money.tax_collected", module: MODULE, label: "Tax collected", kind: "LIST", aggregation: "LIST", moneyTreatment: "PER_CURRENCY", scopeAware: false, drillTarget: null,
      source: "The tax charged on issued invoices in the period, by issue day, per tax name and currency; credit notes are not deducted (your accountant decides both: AG-14 Q10). Government fees carry no tax. For your tax return; ExpatReady files nothing.",
      async read(ctx, f): Promise<Reading> {
        const fr = await frameOf(db, ctx, f);
        const rows = await db.$queryRaw<{ currency: Currency; rate: number; tax: string }[]>`
          select l.currency::text as currency, l.tax_rate_ppm as rate, sum(l.tax_minor::bigint)::text as tax
            from money_invoice_line l join money_invoice i on i.firm_id = l.firm_id and i.id = l.invoice_id
           where ${issued(fr)} and l.tax_minor <> 0 ${inPeriod(Prisma.sql`i.issued_at`, fr)} group by l.currency, l.tax_rate_ppm`;
        // per tax name: two rates of one name (HST at 13 % and 15 %) add up, in one currency only
        const by = new Map<string, { currency: Currency; tax_name: string; minor: bigint }>();
        for (const r of rows) { const name = taxNameOf(Number(r.rate)), k = `${r.currency}|${name}`; const x = by.get(k) ?? { currency: r.currency, tax_name: name, minor: 0n }; x.minor += BigInt(r.tax); by.set(k, x); }
        return { kind: "LIST", rows: [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency) || a.tax_name.localeCompare(b.tax_name)).map((x) => ({ currency: x.currency, tax_name: x.tax_name, tax: major(x.minor) })) };
      },
    },
  ];
}

/** Registers client money's figures on the one reporting door at start-up. */
export class MoneyReports implements OnModuleInit {
  constructor(private readonly registry: MetricRegistry, private readonly db: Db, private readonly clock: PlatformClock) {}
  onModuleInit() { for (const m of moneyMetrics(this.db, () => new Date(this.clock.now()))) this.registry.register(m); }
}
Injectable()(MoneyReports);
[MetricRegistry, Db, PlatformClock].forEach((t, i) => Inject(t)(MoneyReports, undefined, i));
