// FO-7q (R1.56; brief design/briefs/FO-7q.md): the invoice reads the money screens use, paged on the server (AG-6-30,
// AG-6-37). GET …/money/invoices: filters on the derived status (in SQL, status-sql.ts), party, case, issued from/to
// and overdue; newest issued first, then drafts by created time; keyset paging, 50 by default, at most 200 (more is
// 400 in words, AG-6-37 rule 3). GET …/money/invoices/:id/detail: the invoice (facts.ts, the one view), its payments,
// credit notes and write-off, and allowedActions (actions.ts). Both firm-scoped (PF-12's walls and firmScope) and
// scoped by C5 (visibility.ts: fail closed on main). Amounts carry their currency; nothing is summed across currencies.
// A trust figure is answered only while trust shows (AG-6-59 rules 5-6). Reads only: no audit line.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import type { InvoiceView } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { dayOf, invoiceFacts } from "../invoices/facts.ts";
import { UUID, notFound } from "../invoices/drafts.ts";
import { allowedActions, type Action } from "./actions.ts";
import { DUE_SQL, FACTS_LATERAL, PAID_SQL, STATUS_CODES, type StatusCode, statusSql } from "./status-sql.ts";
import { failClosed, scopeSql, type ScopeOf } from "./visibility.ts";
import { paymentRows, type PaymentRow } from "./payments.ts";

type Tx = Prisma.TransactionClient;
export const PAGE_DEFAULT = 50, PAGE_MAX = 200;
const bad = (detail: string): never => problem(400, "Check the request", detail, { code: "BAD_QUERY" });
const day = /^\d{4}-\d{2}-\d{2}$/;

/** The page size: none → 50; a whole number 1-200; anything else 400 in words. */
export function pageSizeOf(raw: unknown): number {
  if (raw === undefined) return PAGE_DEFAULT;
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) return bad(`pageSize must be a whole number from 1 to ${PAGE_MAX}.`);
  const n = Number(raw);
  if (n < 1 || n > PAGE_MAX) return bad(`pageSize is at most ${PAGE_MAX} (and at least 1).`);
  return n;
}
/** A cursor is the last row's sort key, base64url JSON; anything else is 400 (a cursor never widens the firm). */
export const cursorOf = <T>(raw: unknown, shape: z.ZodType<T>): T | null => {
  if (raw === undefined) return null;
  try { return shape.parse(JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"))); } catch { return bad("after is not a cursor this list gave."); }
};
export const cursorText = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
const Stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/);
const InvoiceCursor = z.strictObject({ d: z.union([z.literal(0), z.literal(1)]), t: Stamp, id: z.string().regex(UUID) });

const Query = z.strictObject({
  status: z.string().optional(), partyKind: z.enum(["PERSON", "COMPANY"]).optional(), partyId: z.string().regex(UUID).optional(), caseId: z.string().regex(UUID).optional(),
  issuedFrom: z.string().regex(day).optional(), issuedTo: z.string().regex(day).optional(), overdue: z.enum(["true", "false"]).optional(), pageSize: z.string().optional(), after: z.string().optional(),
});

export type InvoiceRow = { id: string; number: string | null; statusWord: string; personId: string | null; companyId: string | null; caseId: string | null; currency: "CAD" | "USD";
  issuedOn: string | null; dueDate: string | null; totalMinor: number; paidMinor: number; dueMinor: number };
export type InvoicePage = { items: InvoiceRow[]; pageSize: number; next: string | null };
export type InvoiceDetail = { invoice: InvoiceView; caseId: string | null; issuedOn: string | null; creditableMinor: number; allowedActions: Action[];
  payments: PaymentRow[]; creditNotes: { id: string; number: string | null; full: boolean; amountMinor: number; currency: string; reason: string; createdAt: string }[];
  writeOff: { amountMinor: number; currency: string; reason: string; createdAt: string } | null; trustPaidMinor?: number };

/** Trust shows (AG-6-59 rules 5-6; concept-invoices.md (a)): the answer is YES, or NO while any party's trust balance is
 *  not zero or the To move list is not empty. Unanswered: never. */
export async function trustShows(tx: Tx, firmId: string): Promise<boolean> {
  const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(firmId), select: { trustAnswer: true } });
  if (s?.trustAnswer === "YES") return true;
  if (s?.trustAnswer !== "NO") return false;
  const f = firmScope(firmId).firmId;
  const [r] = await tx.$queryRaw<{ held: boolean }[]>`select exists (select 1 from (select distinct on (coalesce(person_id, company_id), currency) balance_after_minor b
      from money_trust_entry where firm_id = ${f}::uuid order by coalesce(person_id, company_id), currency, seq desc) x where x.b <> 0)
    or exists (select 1 from money_to_move where firm_id = ${f}::uuid) as held`;
  return r?.held === true;
}

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
    const r = Query.safeParse(query ?? {});
    if (!r.success) return bad(`Some filters are not understood: ${r.error.issues.map((i) => i.path.join(".") || "query").join(", ")}.`);
    const q = r.data, pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, InvoiceCursor);
    const codes = q.status === undefined ? [] : q.status.split(",");
    if (codes.length > 8 || codes.some((c) => !Object.hasOwn(STATUS_CODES, c))) return bad(`status is one or more of ${Object.keys(STATUS_CODES).join(", ")}, separated by commas.`);
    if ((q.partyKind === undefined) !== (q.partyId === undefined)) return bad("partyKind and partyId go together.");
    if (q.issuedFrom && q.issuedTo && q.issuedFrom > q.issuedTo) return bad("issuedFrom is after issuedTo.");
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
    // first (created_at desc, id). The cursor (d, t, id): d = 0 issued, 1 draft; t the issued (or created) time.
    // With no status filter each half is cut to the page before any facts are read.
    const where = Prisma.join(conds, " and "), cut = want ? Prisma.empty : Prisma.sql`limit ${pageSize + 1}`, at = after ? Prisma.sql`(${after.t}::timestamp at time zone 'UTC')` : null;
    const issuedAfter = !after ? Prisma.sql`true` : after.d === 1 ? Prisma.sql`false` : Prisma.sql`(i.issued_at < ${at} or (i.issued_at = ${at} and i.id > ${after.id}::uuid))`;
    const draftAfter = !after || after.d === 0 ? Prisma.sql`true` : Prisma.sql`(i.created_at < ${at} or (i.created_at = ${at} and i.id > ${after.id}::uuid))`;
    const rowsOf = Prisma.sql`(select * from (select i.* from money_invoice i where ${where} and i.issued_at is not null and ${issuedAfter} order by i.issued_at desc, i.id ${cut}) a
        union all select * from (select i.* from money_invoice i where ${where} and i.issued_at is null and ${draftAfter} order by i.created_at desc, i.id ${cut}) b)`;
    return { pageSize, sql: Prisma.sql`
      select * from (select i.id::text as id, i.number, i.person_id::text as "personId", i.company_id::text as "companyId", i.case_id::text as "caseId", i.currency::text as currency,
          to_char(i.issued_at at time zone 'UTC', 'YYYY-MM-DD') as "issuedOn", to_char(i.due_date, 'YYYY-MM-DD') as "dueDate",
          f.total, ${PAID_SQL} as paid, ${DUE_SQL} as due, ${status} as "statusWord",
          (i.issued_at is null)::int as d, to_char(coalesce(i.issued_at, i.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t
        from ${rowsOf} i cross join ${FACTS_LATERAL}) x
      ${want ? Prisma.sql`where x."statusWord" in (${Prisma.join(want)})` : Prisma.empty}
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
      const creditableMinor = f.view.status === "ISSUED" ? Math.max(0, f.openMinor) : 0;
      return {
        invoice: f.view, caseId: f.caseId, issuedOn: f.issuedOn, creditableMinor,
        allowedActions: allowedActions({ status: f.view.statusWord, keys: ctx.keys, startedByCaller: seen.by === `staff:${ctx.staffId}`, creditableMinor }),
        payments: await paymentRows(tx, ctx.firmId, { invoiceId: id }, showTrust),
        creditNotes: credits.map((c) => ({ ...c, currency: c.currency as string, createdAt: c.createdAt.toISOString() })),
        writeOff: w ? { ...w, currency: w.currency as string, createdAt: w.createdAt.toISOString() } : null,
        ...(showTrust ? { trustPaidMinor: f.trustPaidMinor } : {}),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
