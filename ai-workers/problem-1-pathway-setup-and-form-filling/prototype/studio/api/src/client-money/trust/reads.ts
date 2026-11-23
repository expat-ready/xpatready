// FO-7t part 1 (AG-6-60 rules 1-4, 6, 8, AG-6-61 rule 8, AG-6-37 rule 3; C5 as ruled: Lead B comment 6901029156 on
// #1878): the trust reads. A request's status is derived from facts (Waiting | Sent | Part paid | Paid | Cancelled), never
// stored. The ledger is one party's entries, newest first, with the database's running balance (per party and
// currency), paged on the server (50, at most 200); the balances are per case and before a case, per currency, never
// summed across currencies. Who sees what is MoneyVisibilityPort's answer (CS-MV1): an entry or request is visible when
// its case is, or its person or company when it has no case; no role sees trust money firm-wide by its role, and an
// empty scope is an empty page (fail closed). While trust does not show (trustShows), every read is 404.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { MoneyVisibility } from "../../../../ports/money-visibility.ts";
import { MoneyCurrency } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { MONEY, UUID, notFound } from "../invoices/drafts.ts";
import { Stamp, bad, cursorOf, cursorText, pageSizeOf, trustShows } from "../reads/common.ts";
import { partyOf } from "./service.ts";

type Tx = Prisma.TransactionClient;
export type ScopeOf = (ctx: StaffContext) => Promise<MoneyVisibility>;
const uuid = z.string().regex(UUID);
const PartyQuery = { personId: uuid.optional(), companyId: uuid.optional() };
const LedgerQuery = z.strictObject({ ...PartyQuery, caseId: uuid.optional(), currency: MoneyCurrency.optional(), pageSize: z.string().optional(), after: z.string().optional() });
const BalanceQuery = z.strictObject(PartyQuery);
const Cursor = z.strictObject({ t: Stamp, seq: z.number().int(), id: uuid });
/** The C5 condition on a row `x` with case_id, person_id and company_id. */
const seen = (s: MoneyVisibility, x: string) => Prisma.sql`(${Prisma.raw(x)}.case_id = any(${s.cases}::uuid[]) or (${Prisma.raw(x)}.case_id is null and coalesce(${Prisma.raw(x)}.person_id, ${Prisma.raw(x)}.company_id) = any(${s.parties}::uuid[])))`;

export class TrustReads {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf) {}

  /** GET /trust/requests/:id. */
  async request(ctx: StaffContext, requestId: string) {
    const rid = UUID.test(requestId) ? requestId.toLowerCase() : notFound("trust request"), f = firmScope(ctx.firmId).firmId;
    return this.read(ctx, async (tx, scope) => {
      const [r] = await tx.$queryRaw<{ number: string | null; amount: number; currency: string; sent: boolean; cancelled: boolean; paid: string; caseId: string | null; personId: string | null; companyId: string | null; purpose: string }[]>`
        select q.number, q.amount_minor as amount, q.currency::text as currency, q.sent_at is not null as sent, q.cancelled_at is not null as cancelled, q.purpose, q.case_id::text as "caseId", q.person_id::text as "personId", q.company_id::text as "companyId",
          (select coalesce(sum(p.amount_minor), 0) from money_payment p where p.firm_id = q.firm_id and p.trust_request_id = q.id)::text as paid
        from money_trust_request q where q.firm_id = ${f}::uuid and q.id = ${rid}::uuid and ${seen(scope, "q")}`;
      if (!r) return notFound("trust request");
      const paid = Number(r.paid), extra = paid - r.amount;
      const status = r.cancelled ? "Cancelled" : !r.sent ? "Waiting" : paid >= r.amount ? "Paid" : paid > 0 ? "Part paid" : "Sent";
      return { id: rid, number: r.number, status, amountMinor: r.amount, currency: r.currency, paidMinor: paid, purpose: r.purpose, personId: r.personId, companyId: r.companyId, caseId: r.caseId,
        ...(extra > 0 ? { extraNote: `${r.currency} ${MONEY(extra)} more than requested` } : {}) };
    });
  }

  /** GET /trust/ledger?personId|companyId=&caseId=&currency=&pageSize=&after=. */
  async ledger(ctx: StaffContext, query: unknown) {
    const q = parseInput(LedgerQuery, query ?? {}), pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, Cursor), f = firmScope(ctx.firmId).firmId;
    if ((q.personId ? 1 : 0) + (q.companyId ? 1 : 0) !== 1) bad("personId", "Name one client: a person or a company.");
    return this.read(ctx, async (tx, scope) => {
      const who = await partyOf(tx, f, q), c = [Prisma.sql`e.firm_id = ${f}::uuid`, Prisma.sql`coalesce(e.person_id, e.company_id) = ${who.id}::uuid`, seen(scope, "e")];
      if (q.caseId) c.push(Prisma.sql`e.case_id = ${q.caseId.toLowerCase()}::uuid`);
      if (q.currency) c.push(Prisma.sql`e.currency = ${q.currency}::"MoneyCurrency"`);
      if (after) c.push(Prisma.sql`(e.created_at, e.seq, e.id) < (${after.t}::timestamp at time zone 'UTC', ${after.seq}::int, ${after.id}::uuid)`);
      const rows = await tx.$queryRaw<{ t: string; seq: number; id: string; kind: string; reference: string | null; amountMinor: number; balanceAfterMinor: number; currency: string; caseId: string | null }[]>`
        select to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t, e.seq, e.id::text as id, e.kind::text as kind, e.amount_minor as "amountMinor", e.balance_after_minor as "balanceAfterMinor",
          e.currency::text as currency, e.case_id::text as "caseId", coalesce(p.reference, r.number, i.number) as reference
        from money_trust_entry e left join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id
          left join money_trust_request r on r.firm_id = e.firm_id and r.id = e.trust_request_id left join money_invoice i on i.firm_id = e.firm_id and i.id = e.invoice_id
        where ${Prisma.join(c, " and ")} order by e.created_at desc, e.seq desc, e.id desc limit ${pageSize + 1}`;
      const page = rows.slice(0, pageSize), last = page.at(-1);
      return { items: page.map((x) => ({ id: x.id, at: `${x.t}Z`, kind: x.kind, reference: x.reference, payer: who.name, amountMinor: x.amountMinor, currency: x.currency, balanceAfterMinor: x.balanceAfterMinor, caseId: x.caseId })),
        pageSize, next: rows.length > pageSize && last ? cursorText({ t: last.t, seq: last.seq, id: last.id }) : null };
    });
  }

  /** GET /trust/balances?personId|companyId=: per case and before a case (caseId null), per currency; a total per currency. */
  async balances(ctx: StaffContext, query: unknown) {
    const q = parseInput(BalanceQuery, query ?? {}), f = firmScope(ctx.firmId).firmId;
    if ((q.personId ? 1 : 0) + (q.companyId ? 1 : 0) !== 1) bad("personId", "Name one client: a person or a company.");
    return this.read(ctx, async (tx, scope) => {
      const who = await partyOf(tx, f, q);
      const rows = await tx.$queryRaw<{ currency: string; caseId: string | null; amount: string }[]>`select e.currency::text as currency, e.case_id::text as "caseId", sum(e.amount_minor)::text as amount
        from money_trust_entry e where e.firm_id = ${f}::uuid and coalesce(e.person_id, e.company_id) = ${who.id}::uuid and ${seen(scope, "e")} group by e.currency, e.case_id order by e.currency, e.case_id nulls first`;
      const balances = rows.map((r) => ({ currency: r.currency, caseId: r.caseId, amountMinor: Number(r.amount) }));
      const totals = [...new Set(balances.map((b) => b.currency))].map((cur) => ({ currency: cur, amountMinor: balances.filter((b) => b.currency === cur).reduce((s, b) => s + b.amountMinor, 0) }));
      return { balances, totals };
    });
  }

  private async read<T>(ctx: StaffContext, fn: (tx: Tx, scope: MoneyVisibility) => Promise<T>): Promise<T> {
    const scope = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => {
      if (!(await trustShows(tx, ctx.firmId))) notFound("trust record");   // trust off and nothing held (AG-6-59 rule 4)
      return fn(tx, scope);
    });
  }
}
