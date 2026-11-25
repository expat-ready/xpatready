// FO-7t part 1 (AG-6-60 rules 1-4, 6, 8, AG-6-61 rule 8, AG-6-37 rule 3; C5 as ruled: Lead B comment 6901029156 on
// #1878): the trust reads. A request's status is derived from facts (Waiting | Sent | Part paid | Paid | Cancelled), never
// stored. The ledger is one party's entries, newest first in seq order, with a running balance summed over the rows the caller sees (per party and
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
import { bad, cursorOf, cursorText, pageSizeOf, trustShows } from "../reads/common.ts";
import { partyOf } from "./service.ts";

type Tx = Prisma.TransactionClient;
export type ScopeOf = (ctx: StaffContext) => Promise<MoneyVisibility>;
const uuid = z.string().regex(UUID);
const PartyQuery = { personId: uuid.optional(), companyId: uuid.optional() };
const LedgerQuery = z.strictObject({ ...PartyQuery, caseId: uuid.optional(), currency: MoneyCurrency.optional(), pageSize: z.string().optional(), after: z.string().optional() });
const BalanceQuery = z.strictObject(PartyQuery);
const Cursor = z.strictObject({ seq: z.number().int().min(1).max(2_147_483_647), currency: MoneyCurrency });
/** The C5 condition on a row `x` with case_id, person_id and company_id. */
const seen = (s: MoneyVisibility, x: string) => Prisma.sql`(${Prisma.raw(x)}.case_id = any(${s.cases}::uuid[]) or (${Prisma.raw(x)}.case_id is null and coalesce(${Prisma.raw(x)}.person_id, ${Prisma.raw(x)}.company_id) = any(${s.parties}::uuid[])))`;

export class TrustReads {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf) {}

  /** GET /trust/requests/:id. */
  async request(ctx: StaffContext, requestId: string) {
    const rid = UUID.test(requestId) ? requestId.toLowerCase() : notFound("trust request"), f = firmScope(ctx.firmId).firmId;
    return this.read(ctx, async (tx, scope) => {
      const [r] = await tx.$queryRaw<{ number: string | null; amount: number; currency: string; sent: boolean; cancelled: boolean; paid: string; caseId: string | null; personId: string | null; companyId: string | null; purpose: string; prepared: boolean; tax: number | null; version: string | null }[]>`
        select q.number, q.amount_minor as amount, q.currency::text as currency, q.sent_at is not null as sent, q.cancelled_at is not null as cancelled, q.purpose,
          q.prepared_at is not null as prepared, q.estimated_tax_minor as tax, q.retainer_version_id::text as version, q.case_id::text as "caseId", q.person_id::text as "personId", q.company_id::text as "companyId",
          (select coalesce(sum(p.amount_minor), 0) from money_payment p where p.firm_id = q.firm_id and p.trust_request_id = q.id)::text as paid
        from money_trust_request q where q.firm_id = ${f}::uuid and q.id = ${rid}::uuid and ${seen(scope, "q")}`;
      if (!r) return notFound("trust request");
      const paid = Number(r.paid), extra = paid - r.amount;
      // R1.60 a1: a deposit request prepared on signing is "Prepared" until a person sends it, never #3033's "Waiting" (B6).
      const status = r.cancelled ? "Cancelled" : !r.sent ? (r.prepared ? "Prepared" : "Waiting") : paid >= r.amount ? "Paid" : paid > 0 ? "Part paid" : "Sent";
      return { id: rid, number: r.number, status, amountMinor: r.amount, currency: r.currency, paidMinor: paid, purpose: r.purpose, personId: r.personId, companyId: r.companyId, caseId: r.caseId,
        ...(r.prepared ? { estimatedTaxMinor: r.tax, retainerVersionId: r.version } : {}),
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
      // Newest first in the ledger's own order: seq, the order writers took the party's lock (never created_at, the
      // transaction's start: break Major 1). The running balance is summed over the rows this caller may see and the
      // filters in force (C5: never the party-wide figure when part of it is hidden, review M2; per case with caseId).
      const rows = await tx.$queryRaw<{ seq: number; id: string; t: string; kind: string; reference: string | null; amountMinor: number; run: string; currency: string; caseId: string | null }[]>`
        with v as (select e.seq, e.id, e.created_at, e.kind, e.amount_minor, e.currency, e.case_id, e.payment_id, e.trust_request_id, e.invoice_id,
            sum(e.amount_minor) over (partition by e.currency order by e.seq) as run from money_trust_entry e where ${Prisma.join(c, " and ")})
        select v.seq, v.id::text as id, to_char(v.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t, v.kind::text as kind, v.amount_minor as "amountMinor", v.run::text as run,
          v.currency::text as currency, v.case_id::text as "caseId", coalesce(p.reference, r.number, i.number) as reference
        from v left join money_payment p on p.firm_id = ${f}::uuid and p.id = v.payment_id
          left join money_trust_request r on r.firm_id = ${f}::uuid and r.id = v.trust_request_id left join money_invoice i on i.firm_id = ${f}::uuid and i.id = v.invoice_id
        where ${after ? Prisma.sql`(v.seq < ${after.seq}::int or (v.seq = ${after.seq}::int and v.currency::text > ${after.currency}))` : Prisma.sql`true`}
        order by v.seq desc, v.currency::text asc limit ${pageSize + 1}`;
      const page = rows.slice(0, pageSize), last = page.at(-1);
      return { items: page.map((x) => ({ id: x.id, at: `${x.t}Z`, kind: x.kind, reference: x.reference, payer: who.name, amountMinor: x.amountMinor, currency: x.currency, balanceAfterMinor: Number(x.run), caseId: x.caseId })),
        pageSize, next: rows.length > pageSize && last ? cursorText({ seq: last.seq, currency: last.currency }) : null };
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
