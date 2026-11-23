// FO-7q (R1.56; brief design/briefs/FO-7q.md): the invoice reads the money screens use, paged on the server (AG-6-30,
// AG-6-37). GET …/money/invoices: filters on the derived status (in SQL, status-sql.ts), party, case, issued from/to
// and overdue; newest issued first, then drafts by created time; keyset paging, 50 by default, at most 200 (more is
// 422 naming the field, AG-6-37 rule 3 by PF-28's one rule). GET …/money/invoices/:id/detail: the invoice (facts.ts, the one view), its payments,
// credit notes and write-off, and allowedActions (actions.ts). Both firm-scoped (PF-12's walls and firmScope) and
// scoped by C5 (visibility.ts: fail closed on main). Amounts carry their currency; nothing is summed across currencies.
// A trust figure is answered only while trust shows (AG-6-59 rules 5-6). Reads only: no audit line.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import type { InvoiceView } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { dayOf, invoiceFacts } from "../invoices/facts.ts";
import { UUID, notFound } from "../invoices/drafts.ts";
import { allowedActions, type Action } from "./actions.ts";
import { DUE_SQL, FACTS_LATERAL, PAID_SQL, STATUS_CODES, type StatusCode, statusSql } from "./status-sql.ts";
import { failClosed, scopeSql, type ScopeOf } from "./visibility.ts";
import { labelsOf, type BillTo } from "./parties.ts";
import { paymentRows, refundsReader, withPaymentActions, type PaymentRow } from "./payments.ts";
import type { Refunds } from "../invoices/refunds.ts";
import { Day, Stamp, bad, cursorOf, cursorText, pageSizeOf, trustShows } from "./common.ts";
export { trustShows };

const InvoiceCursor = z.strictObject({ d: z.union([z.literal(0), z.literal(1)]), t: Stamp, id: z.string().regex(UUID) });

const Query = z.strictObject({
  status: z.string().optional(), partyKind: z.enum(["PERSON", "COMPANY"]).optional(), partyId: z.string().regex(UUID).optional(), caseId: z.string().regex(UUID).optional(),
  issuedFrom: Day.optional(), issuedTo: Day.optional(), overdue: z.literal("true").optional(), pageSize: z.string().optional(), after: z.string().optional(),
});

export type InvoiceRow = { id: string; number: string | null; statusWord: string; personId: string | null; companyId: string | null; caseId: string | null; currency: "CAD" | "USD";
  issuedOn: string | null; dueDate: string | null; totalMinor: number; paidMinor: number; dueMinor: number;
  /** FO-7q part 3: the party's kind and stored name (null when none is stored: never guessed), and the case number. */
  billTo: BillTo; caseLabel: string | null };
export type InvoicePage = { items: InvoiceRow[]; pageSize: number; next: string | null };
export type InvoiceDetail = { invoice: InvoiceView; caseId: string | null; billTo: BillTo; caseLabel: string | null; issuedOn: string | null; creditableMinor: number; allowedActions: Action[];
  payments: PaymentRow[]; creditNotes: { id: string; number: string | null; full: boolean; amountMinor: number; currency: string; reason: string; createdAt: string }[];
  writeOff: { amountMinor: number; currency: string; reason: string; createdAt: string } | null; trustPaidMinor?: number };

type Plan = { pageSize: number; after: { d: 0 | 1; t: string; id: string } | null; want: string[] | null; today: string; firmId: string; where: Prisma.Sql };
type Row = Omit<InvoiceRow, "totalMinor" | "paidMinor" | "dueMinor" | "billTo" | "caseLabel"> & { total: bigint; paid: bigint; due: bigint; d: number; t: string; n: bigint };
/** A status filter reads candidates 200 at a time, doubling up to 2,000 (Sample sizes, measured on 10,000 invoices). */
const CHUNK_FIRST = 200, CHUNK_MAX = 2000;
/** The two halves: newest issued first (issued_at desc, id: FO-7ts part 3's index order), then drafts newest first. */
type Half = { d: 0 | 1; which: Prisma.Sql; key: Prisma.Sql; order: Prisma.Sql };
const ISSUED: Half = { d: 0, which: Prisma.sql`i.issued_at is not null`, key: Prisma.sql`i.issued_at`, order: Prisma.sql`i.issued_at desc, i.id` };
const DRAFTS: Half = { d: 1, which: Prisma.sql`i.issued_at is null`, key: Prisma.sql`i.created_at`, order: Prisma.sql`i.created_at desc, i.id` };

/** Query A: the next `limit` candidate ids of a half after `from` (its sort key and id), in order; no facts read. */
function candidates(p: Plan, h: Half, from: { t: string; id: string } | null, limit: number): Prisma.Sql {
  const at = from ? Prisma.sql`(${from.t}::timestamp at time zone 'UTC')` : null;
  const after = from ? Prisma.sql`(${h.key} < ${at} or (${h.key} = ${at} and i.id > ${from.id}::uuid))` : Prisma.sql`true`;
  return Prisma.sql`select i.id::text as id, to_char(${h.key} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t
    from money_invoice i where ${p.where} and ${h.which} and ${after} order by ${h.order} limit ${limit}`;
}
/** Query B: the facts and the status word of exactly these ids (by the firm's unique id index), once each, kept when the
 *  word is one asked for, in the candidates' order. */
function statuses(p: Plan, ids: string[]): Prisma.Sql {
  const status = statusSql(p.today);
  return Prisma.sql`select * from (select i.id::text as id, i.number, i.person_id::text as "personId", i.company_id::text as "companyId", i.case_id::text as "caseId", i.currency::text as currency,
        to_char(i.issued_at at time zone 'UTC', 'YYYY-MM-DD') as "issuedOn", to_char(i.due_date, 'YYYY-MM-DD') as "dueDate",
        f.total, ${PAID_SQL} as paid, ${DUE_SQL} as due, ${status} as "statusWord", (i.issued_at is null)::int as d,
        to_char(coalesce(i.issued_at, i.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t, u.n
      from unnest(${ids}::uuid[]) with ordinality u(id, n) join money_invoice i on i.firm_id = ${p.firmId}::uuid and i.id = u.id cross join ${FACTS_LATERAL}) x
    ${p.want ? Prisma.sql`where x."statusWord" in (${Prisma.join(p.want)})` : Prisma.empty} order by x.n`;
}

export class InvoiceReads {
  private readonly refunds: Refunds;
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed, private readonly clock: ClockPort = systemClock) { this.refunds = refundsReader(db, clock); }

  /** GET /api/front-office/money/invoices. Each half (issued, then drafts) is read in candidate chunks: query A reads
   *  only ids and sort keys in order (the firm-first index's order; no facts), query B derives the facts and the status
   *  word of exactly those ids, once each, and keeps the words asked for. A page of matches stops it. So the facts are
   *  never computed for rows past the page, whatever plan the database picks (#3001 run 45070511287: a sort plan
   *  computed the status of every candidate before the limit, 696 ms). No status filter: one chunk of a page. */
  async list(ctx: StaffContext, query: unknown): Promise<InvoicePage> {
    const p = await this.plan(ctx, query);
    if (!p) return { items: [], pageSize: pageSizeOf((query as { pageSize?: unknown } | null)?.pageSize), next: null };
    const need = p.pageSize + 1, rows: Row[] = [];
    await this.db.$transaction(async (tx) => {
      for (const half of [ISSUED, DRAFTS]) {
        if (p.after && half.d < p.after.d) continue;   // a cursor in the drafts never goes back to the issued half
        let from = p.after && p.after.d === half.d ? { t: p.after.t, id: p.after.id } : null, chunk = p.want ? CHUNK_FIRST : need;
        while (rows.length < need) {
          const cands = await tx.$queryRaw<{ id: string; t: string }[]>(candidates(p, half, from, chunk));
          if (!cands.length) break;
          rows.push(...await tx.$queryRaw<Row[]>(statuses(p, cands.map((c) => c.id))));
          if (cands.length < chunk) break;
          from = cands.at(-1)!; chunk = Math.min(chunk * 2, CHUNK_MAX);
        }
        if (rows.length >= need) break;
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const page = rows.slice(0, p.pageSize), last = page.at(-1), labels = await labelsOf(this.db, p.firmId, page);
    return { pageSize: p.pageSize, next: rows.length > p.pageSize && last ? cursorText({ d: last.d, t: last.t, id: last.id }) : null,
      items: page.map(({ total, paid, due, d: _d, t: _t, n: _n, ...x }, i) => ({ ...x, totalMinor: Number(total), paidMinor: Number(paid), dueMinor: Number(due), ...labels[i]! })) };
  }

  /** The first candidate read of the issued half (query A), as list runs it: DW1 EXPLAINs exactly this. Null when the
   *  filters can match nothing. */
  async listSql(ctx: StaffContext, query: unknown): Promise<{ sql: Prisma.Sql | null; pageSize: number }> {
    const p = await this.plan(ctx, query);
    if (!p) return { sql: null, pageSize: pageSizeOf((query as { pageSize?: unknown } | null)?.pageSize) };
    return { pageSize: p.pageSize, sql: candidates(p, ISSUED, p.after?.d === 0 ? { t: p.after.t, id: p.after.id } : null, p.want ? CHUNK_FIRST : p.pageSize + 1) };
  }

  /** The filters read once (422 naming a bad one), the scope, and what each status word needs before any facts. */
  private async plan(ctx: StaffContext, query: unknown): Promise<Plan | null> {
    const q = parseInput(Query, query ?? {}), pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, InvoiceCursor);
    const codes = q.status === undefined ? [] : q.status.split(",");
    if (codes.length > 8 || codes.some((c) => !Object.hasOwn(STATUS_CODES, c))) return bad("status", `status is one or more of ${Object.keys(STATUS_CODES).join(", ")}, separated by commas.`);
    if ((q.partyKind === undefined) !== (q.partyId === undefined)) return bad("partyId", "partyKind and partyId go together.");
    if (q.issuedFrom && q.issuedTo && q.issuedFrom > q.issuedTo) return bad("issuedTo", "issuedFrom is after issuedTo.");
    // overdue=true narrows to the Overdue word; with a status filter both must hold (no Overdue in it: an empty page)
    let want: string[] | null = codes.length ? codes.map((c) => STATUS_CODES[c as StatusCode] as string) : null;
    if (q.overdue === "true") want = want ? want.filter((w) => w === "Overdue") : ["Overdue"];
    if (want && !want.length) return null;
    const today = dayOf(this.clock.now()), firmId = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx);
    const conds: Prisma.Sql[] = [Prisma.sql`i.firm_id = ${firmId}::uuid`, scopeSql(scope)];
    if (q.partyKind === "PERSON") conds.push(Prisma.sql`i.person_id = ${q.partyId!.toLowerCase()}::uuid`);
    if (q.partyKind === "COMPANY") conds.push(Prisma.sql`i.company_id = ${q.partyId!.toLowerCase()}::uuid`);
    if (q.caseId) conds.push(Prisma.sql`i.case_id = ${q.caseId.toLowerCase()}::uuid`);
    if (q.issuedFrom) conds.push(Prisma.sql`i.issued_at >= (${q.issuedFrom}::date::timestamp at time zone 'UTC')`);
    if (q.issuedTo) conds.push(Prisma.sql`i.issued_at < ((${q.issuedTo}::date + 1)::timestamp at time zone 'UTC')`);
    // What each word needs before any facts are read (statusSql's own order): a draft is not issued; overdue is issued
    // with a due date before today; every other word is issued. Only narrows; the word itself is still statusSql's.
    if (want) conds.push(Prisma.sql`(${Prisma.join(want.map((w) => w === "Draft" ? Prisma.sql`i.issued_at is null` : w === "Overdue" ? Prisma.sql`(i.issued_at is not null and i.due_date < ${today}::date)` : Prisma.sql`i.issued_at is not null`), " or ")})`);
    return { pageSize, after, want, today, firmId, where: Prisma.join(conds, " and ") };
  }

  /** GET /api/front-office/money/invoices/:id/detail. Another firm's, an unknown, and one outside the caller's scope: the same 404. */
  async detail(ctx: StaffContext, invoiceId: string): Promise<InvoiceDetail> {
    if (!UUID.test(invoiceId)) notFound("invoice");
    const id = invoiceId.toLowerCase(), firmId = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => {
      const [seen] = await tx.$queryRaw<{ by: string; personId: string | null; companyId: string | null; caseId: string | null }[]>`select i.created_by as by, i.person_id::text as "personId", i.company_id::text as "companyId", i.case_id::text as "caseId" from money_invoice i where i.firm_id = ${firmId}::uuid and i.id = ${id}::uuid and ${scopeSql(scope)}`;
      if (!seen) return notFound("invoice");
      const f = (await invoiceFacts(tx, ctx.firmId, id, dayOf(this.clock.now()))) ?? notFound("invoice");
      const showTrust = await trustShows(tx, ctx.firmId);
      const credits = await tx.moneyCreditNote.findMany({ where: firmScope(ctx.firmId, { invoiceId: id }), orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, number: true, full: true, amountMinor: true, currency: true, reason: true, createdAt: true } });
      const w = await tx.moneyWriteOff.findFirst({ where: firmScope(ctx.firmId, { invoiceId: id }), select: { amountMinor: true, currency: true, reason: true, createdAt: true } });
      // what FO-7b's credit route would take: not credited or written off, less what was paid from trust (TRUST_PAID)
      const creditableMinor = f.view.status === "ISSUED" && f.view.statusWord !== "Written off" ? Math.max(0, f.openMinor - f.trustPaidMinor) : 0;
      return {
        invoice: f.view, caseId: f.caseId, ...(await labelsOf(tx, ctx.firmId, [seen]))[0]!, issuedOn: f.issuedOn, creditableMinor,
        allowedActions: allowedActions({ status: f.view.statusWord, keys: ctx.keys, startedByCaller: seen.by === `staff:${ctx.staffId}`, creditableMinor }),
        payments: await withPaymentActions(tx, this.refunds, ctx.firmId, ctx.keys, (await paymentRows(tx, ctx.firmId, { invoiceId: id }, showTrust)).map(({ t: _t, ...p }) => p)),
        creditNotes: credits.map((c) => ({ ...c, currency: c.currency as string, createdAt: c.createdAt.toISOString() })),
        writeOff: w ? { ...w, currency: w.currency as string, createdAt: w.createdAt.toISOString() } : null,
        ...(showTrust ? { trustPaidMinor: f.trustPaidMinor } : {}),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
