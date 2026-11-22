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
import { paymentRows, type PaymentRow } from "./payments.ts";
import { Day, Stamp, bad, cursorOf, cursorText, pageSizeOf, trustShows } from "./common.ts";
export { trustShows };

const InvoiceCursor = z.strictObject({ d: z.union([z.literal(0), z.literal(1)]), t: Stamp, id: z.string().regex(UUID) });

const Query = z.strictObject({
  status: z.string().optional(), partyKind: z.enum(["PERSON", "COMPANY"]).optional(), partyId: z.string().regex(UUID).optional(), caseId: z.string().regex(UUID).optional(),
  issuedFrom: Day.optional(), issuedTo: Day.optional(), overdue: z.literal("true").optional(), pageSize: z.string().optional(), after: z.string().optional(),
});

export type InvoiceRow = { id: string; number: string | null; statusWord: string; personId: string | null; companyId: string | null; caseId: string | null; currency: "CAD" | "USD";
  issuedOn: string | null; dueDate: string | null; totalMinor: number; paidMinor: number; dueMinor: number };
export type InvoicePage = { items: InvoiceRow[]; pageSize: number; next: string | null };
export type InvoiceDetail = { invoice: InvoiceView; caseId: string | null; issuedOn: string | null; creditableMinor: number; allowedActions: Action[];
  payments: PaymentRow[]; creditNotes: { id: string; number: string | null; full: boolean; amountMinor: number; currency: string; reason: string; createdAt: string }[];
  writeOff: { amountMinor: number; currency: string; reason: string; createdAt: string } | null; trustPaidMinor?: number };

export class InvoiceReads {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed, private readonly clock: ClockPort = systemClock) {}

  /** GET /api/front-office/money/invoices. */
  async list(ctx: StaffContext, query: unknown): Promise<InvoicePage> {
    const built = await this.listSql(ctx, query);
    if (!built.sql) return { items: [], pageSize: built.pageSize, next: null };
    const { sql, pageSize } = built;
    const rows = await this.db.$transaction((tx) => tx.$queryRaw<(Omit<InvoiceRow, "totalMinor" | "paidMinor" | "dueMinor"> & { total: bigint; paid: bigint; due: bigint; d: number; t: string })[]>(sql),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const page = rows.slice(0, pageSize), last = page.at(-1);
    return { pageSize, next: rows.length > pageSize && last ? cursorText({ d: last.d, t: last.t, id: last.id }) : null,
      items: page.map(({ total, paid, due, d: _d, t: _t, ...x }) => ({ ...x, totalMinor: Number(total), paidMinor: Number(paid), dueMinor: Number(due) })) };
  }

  /** The list's one query (its check EXPLAINs exactly this, DW1); null when the filters can match nothing. */
  async listSql(ctx: StaffContext, query: unknown): Promise<{ sql: Prisma.Sql | null; pageSize: number }> {
    const q = parseInput(Query, query ?? {}), pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, InvoiceCursor);
    const codes = q.status === undefined ? [] : q.status.split(",");
    if (codes.length > 8 || codes.some((c) => !Object.hasOwn(STATUS_CODES, c))) return bad("status", `status is one or more of ${Object.keys(STATUS_CODES).join(", ")}, separated by commas.`);
    if ((q.partyKind === undefined) !== (q.partyId === undefined)) return bad("partyId", "partyKind and partyId go together.");
    if (q.issuedFrom && q.issuedTo && q.issuedFrom > q.issuedTo) return bad("issuedTo", "issuedFrom is after issuedTo.");
    // overdue=true narrows to the Overdue word; with a status filter both must hold (no Overdue in it: an empty page)
    let want: string[] | null = codes.length ? codes.map((c) => STATUS_CODES[c as StatusCode] as string) : null;
    if (q.overdue === "true") want = want ? want.filter((w) => w === "Overdue") : ["Overdue"];
    if (want && !want.length) return { sql: null, pageSize };
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
    const status = statusSql(today);
    // Newest issued first (issued_at desc, id: the firm-first index's own order, FO-7ts part 3), then drafts newest
    // first (created_at desc, id). The cursor (d, t, id): d = 0 issued, 1 draft; t the issued (or created) time. Each
    // half filters on the status word inside its own ordered, limited read, so it stops after a page of matches and
    // reads the facts only of the rows it passes over (review M1, break B1).
    const where = Prisma.join(conds, " and "), at = after ? Prisma.sql`(${after.t}::timestamp at time zone 'UTC')` : null;
    const issuedAfter = !after ? Prisma.sql`true` : after.d === 1 ? Prisma.sql`false` : Prisma.sql`(i.issued_at < ${at} or (i.issued_at = ${at} and i.id > ${after.id}::uuid))`;
    const draftAfter = !after || after.d === 0 ? Prisma.sql`true` : Prisma.sql`(i.created_at < ${at} or (i.created_at = ${at} and i.id > ${after.id}::uuid))`;
    const words = want ? Prisma.sql`${status} in (${Prisma.join(want)})` : Prisma.sql`true`;
    const half = (which: Prisma.Sql, order: Prisma.Sql) => Prisma.sql`(select i.id::text as id, i.number, i.person_id::text as "personId", i.company_id::text as "companyId", i.case_id::text as "caseId", i.currency::text as currency,
          to_char(i.issued_at at time zone 'UTC', 'YYYY-MM-DD') as "issuedOn", to_char(i.due_date, 'YYYY-MM-DD') as "dueDate",
          f.total, ${PAID_SQL} as paid, ${DUE_SQL} as due, ${status} as "statusWord",
          (i.issued_at is null)::int as d, to_char(coalesce(i.issued_at, i.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t
        from money_invoice i cross join ${FACTS_LATERAL}
        where ${where} and ${which} and ${words} order by ${order} limit ${pageSize + 1})`;
    return { pageSize, sql: Prisma.sql`
      select * from (${half(Prisma.sql`i.issued_at is not null and ${issuedAfter}`, Prisma.sql`i.issued_at desc, i.id`)}
        union all ${half(Prisma.sql`i.issued_at is null and ${draftAfter}`, Prisma.sql`i.created_at desc, i.id`)}) x
      order by x.d, x.t desc, x.id limit ${pageSize + 1}` };
  }

  /** GET /api/front-office/money/invoices/:id/detail. Another firm's, an unknown, and one outside the caller's scope: the same 404. */
  async detail(ctx: StaffContext, invoiceId: string): Promise<InvoiceDetail> {
    if (!UUID.test(invoiceId)) notFound("invoice");
    const id = invoiceId.toLowerCase(), firmId = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => {
      const [seen] = await tx.$queryRaw<{ by: string }[]>`select i.created_by as by from money_invoice i where i.firm_id = ${firmId}::uuid and i.id = ${id}::uuid and ${scopeSql(scope)}`;
      if (!seen) return notFound("invoice");
      const f = (await invoiceFacts(tx, ctx.firmId, id, dayOf(this.clock.now()))) ?? notFound("invoice");
      const showTrust = await trustShows(tx, ctx.firmId);
      const credits = await tx.moneyCreditNote.findMany({ where: firmScope(ctx.firmId, { invoiceId: id }), orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, number: true, full: true, amountMinor: true, currency: true, reason: true, createdAt: true } });
      const w = await tx.moneyWriteOff.findFirst({ where: firmScope(ctx.firmId, { invoiceId: id }), select: { amountMinor: true, currency: true, reason: true, createdAt: true } });
      // what FO-7b's credit route would take: not credited or written off, less what was paid from trust (TRUST_PAID)
      const creditableMinor = f.view.status === "ISSUED" && f.view.statusWord !== "Written off" ? Math.max(0, f.openMinor - f.trustPaidMinor) : 0;
      return {
        invoice: f.view, caseId: f.caseId, issuedOn: f.issuedOn, creditableMinor,
        allowedActions: allowedActions({ status: f.view.statusWord, keys: ctx.keys, startedByCaller: seen.by === `staff:${ctx.staffId}`, creditableMinor }),
        payments: (await paymentRows(tx, ctx.firmId, { invoiceId: id }, showTrust)).map(({ t: _t, ...p }) => p),
        creditNotes: credits.map((c) => ({ ...c, currency: c.currency as string, createdAt: c.createdAt.toISOString() })),
        writeOff: w ? { ...w, currency: w.currency as string, createdAt: w.createdAt.toISOString() } : null,
        ...(showTrust ? { trustPaidMinor: f.trustPaidMinor } : {}),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
