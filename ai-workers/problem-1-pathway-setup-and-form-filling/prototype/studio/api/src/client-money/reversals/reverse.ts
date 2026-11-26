// FO-7v part T (R1.58; design/briefs/FO-7v.md as narrowed by P-694 and Lead 1's ruling on #3493, 24 Nov; AG-6-75 rules 1-3,
// 7, §6, §8-§10; P-603, P-634 (1), P-653 (2)): reversing a trust deposit recorded by hand, and the shortfall list.
// * Under P-694 (P-653 (2) supersedes P-607 (1)), a reversal of a payment recorded by hand is always accepted and may take
//   the client's trust balance below zero. The invoices that trust money paid stay paid, and the party then shows on the
//   shortfall list (`money_trust_shortfall`, FO-7a2). Departure from AG-6-75 rule 3 recorded: Unconfirmed: no counsel.
// * A reversal is one CORRECTION naming exactly the deposit, for what is left of it, with the reason's kind (P-603). The
//   database holds every rule: a correction capped at its deposit (so a second reversal is refused), below zero only for
//   a reversal kind, "Returned" never on an e-Transfer, card or cash payment, and a returned cheque never ticked cleared.
// * The preview is the plan: one function builds it; the preview answers it with a hash; the reverse rebuilds it under
//   the party's lock and refuses "Changed since the preview" when the hash differs (AG-6-75 §10).
// * Not in part T: a payment received into operating (it needs a reversed mark on money_payment: schema, FO-7v's later
//   part, R1.96) and the Owner's Needs-you item.
// * C5 (MoneyVisibilityPort): the deposit's case, or its party when it has no case, must be the caller's to see (404),
//   read before the transaction and checked before any lock. One audit line and payment.reversed per reversal.
import { createHash } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { MoneyCurrency } from "../../../../ports/client-money.ts";
import { PaymentReversedPayload, REVERSAL_EVENT } from "../../../../ports/events/client-money-reversals.ts";
import type { MoneyVisibility } from "../../../../ports/money-visibility.ts";
import { liveParty } from "../live-party.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { MONEY, UUID, badField, notFound, parse } from "../invoices/drafts.ts";
import { trustShows } from "../reads/common.ts";

type Tx = Prisma.TransactionClient;
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
export const REASON_WORDS = { RETURNED: "Returned", RECORDED_BY_MISTAKE: "Recorded by mistake", WRONG_CLIENT: "Wrong client", OTHER: "Other" } as const;
type ReasonCode = keyof typeof REASON_WORDS;
const CODES = Object.keys(REASON_WORDS) as [ReasonCode, ...ReasonCode[]];
/** Cleared when recorded: never "Returned" (P-634 (1); the database says the same). Card-terminal money never enters
 *  trust (the database's money_payment_card_not_trust), so it never reaches a reversal here. */
const NEVER_RETURNED = ["E_TRANSFER", "CASH"];
// Break M1: well formed (a lone surrogate breaks the audit line's JSON), and the database's own text rule is asked
// before writing (textOk below), so a refused reason is a field error, never a 500.
const typed = z.string().trim().min(1, "The reason is needed.").max(200, "At most 200 characters.").regex(/^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/, "One line, no tabs or control characters.")
  .refine((v) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "The reason holds a broken character.");   // a lone surrogate
export const ReverseIn = z.strictObject({
  reasonCode: z.enum(CODES, { message: "Choose a reason: RETURNED, RECORDED_BY_MISTAKE, WRONG_CLIENT or OTHER." }),
  reason: typed.optional(), previewHash: z.string().regex(/^[0-9a-f]{32}$/, "Preview the reversal first: its previewHash is needed."),
}).refine((d) => d.reasonCode !== "OTHER" || !!d.reason, { message: "A typed reason is needed with OTHER.", path: ["reason"] });
const ShortfallQuery = z.strictObject({ currency: MoneyCurrency.optional() });

export type Plan = { paymentId: string; depositEntryId: string; method: string; currency: string; personId: string | null; companyId: string | null; caseId: string | null;
  reverseMinor: number; balanceBeforeMinor: number; balanceAfterMinor: number; shortfallMinor: number; reasonsAllowed: ReasonCode[]; invoicesStayPaid: true; words: string; hash: string };

export type ScopeOf = (ctx: StaffContext) => Promise<MoneyVisibility>;
/** C5 (fail closed, 404): a case the caller sees, or with no case a party the caller sees. */
const visible = (seen: MoneyVisibility, caseId: string | null, party: string | null) => (caseId ? seen.cases.includes(caseId) : !!party && seen.parties.includes(party));

/** The one plan the preview answers and the reverse runs (AG-6-75 rule 3). C5 first (review M1): a payment the caller
 *  may not see is 404 before anything about it is said; then a payment this part cannot reverse is refused. */
export async function planReversal(tx: Tx, firmId: string, paymentId: string, seen: MoneyVisibility): Promise<Plan> {
  const [p] = await tx.$queryRaw<{ method: string; into: string; stripe: string | null; amount: number; currency: string; reference: string | null; entry: string | null; person: string | null; company: string | null; case_id: string | null;
    inv_case: string | null; inv_party: string | null }[]>`
    select p.method::text as method, p.received_into::text as into, p.stripe_payment_intent_id as stripe, p.amount_minor as amount, p.currency::text as currency, p.reference,
      e.id::text as entry, e.person_id::text as person, e.company_id::text as company, e.case_id::text as case_id, i.case_id::text as inv_case, coalesce(i.person_id, i.company_id)::text as inv_party
    from money_payment p left join money_trust_entry e on e.firm_id = p.firm_id and e.payment_id = p.id and e.kind = 'DEPOSIT'
      left join money_invoice i on i.firm_id = p.firm_id and i.id = p.invoice_id
    where p.firm_id = ${firmId}::uuid and p.id = ${paymentId}::uuid`;
  if (!p) return notFound("payment");
  if (!(p.entry ? visible(seen, p.case_id, p.person ?? p.company) : visible(seen, p.inv_case, p.inv_party))) return notFound("payment");
  if (p.method === "CARD" || p.stripe) refuse("USE_A_REFUND", "Use a refund: a card payment is never reversed (AG-6-75 rule 1).");
  if (p.into !== "TRUST" || !p.entry) refuse("NOT_YET", "Reversing a payment received into operating is not available yet. Nothing was changed.");
  const party = (p.person ?? p.company)!;
  const [s] = await tx.$queryRaw<{ left: string; reversed: boolean; seq: number; balance: number }[]>`select
      (${p.amount}::int + coalesce((select sum(c.amount_minor) from money_trust_entry c where c.firm_id = ${firmId}::uuid and c.corrects_entry_id = ${p.entry}::uuid), 0))::text as left,
      exists (select 1 from money_trust_entry c where c.firm_id = ${firmId}::uuid and c.corrects_entry_id = ${p.entry}::uuid and c.correction_kind in ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER')) as reversed,
      coalesce(l.seq, 0) as seq, coalesce(l.balance_after_minor, 0) as balance
    from (select 1) one left join lateral (select e.seq, e.balance_after_minor from money_trust_entry e where e.firm_id = ${firmId}::uuid
      and ${p.person ? Prisma.sql`e.person_id = ${party}::uuid` : Prisma.sql`e.company_id = ${party}::uuid`} and e.currency = ${p.currency}::"MoneyCurrency" order by e.seq desc limit 1) l on true`;
  if (s.reversed) refuse("ALREADY_REVERSED", "This payment is already reversed. Nothing was changed.");
  const reverseMinor = Number(s.left);
  if (reverseMinor <= 0) refuse("NOTHING_LEFT", "Nothing of this deposit is left to reverse: it was corrected in full. Nothing was changed.");
  const balanceAfterMinor = s.balance - reverseMinor, shortfallMinor = Math.max(0, -balanceAfterMinor);
  const reasonsAllowed = CODES.filter((c) => c !== "RETURNED" || !NEVER_RETURNED.includes(p.method));
  const ref = p.reference ? ` (${p.reference})` : "";
  const words = `Reversing this deposit${ref} takes ${p.currency} ${MONEY(reverseMinor)} out of the client's trust ledger: the balance goes from ${p.currency} ${MONEY(s.balance)} to ${balanceAfterMinor < 0 ? "−" : ""}${p.currency} ${MONEY(Math.abs(balanceAfterMinor))}.`
    + (shortfallMinor > 0 ? ` That is ${p.currency} ${MONEY(shortfallMinor)} below zero: the client will show in red on the shortfall list.` : "")
    + " Invoices already paid from trust stay paid. The receipt already sent is not recalled.";
  const hash = createHash("sha256").update([paymentId, p.entry, reverseMinor, s.seq, s.balance].join("|")).digest("hex").slice(0, 32);
  return { paymentId, depositEntryId: p.entry!, method: p.method, currency: p.currency, personId: p.person, companyId: p.company, caseId: p.case_id, reverseMinor,
    balanceBeforeMinor: s.balance, balanceAfterMinor, shortfallMinor, reasonsAllowed, invoicesStayPaid: true, words, hash };
}

const idOf = (v: string) => (UUID.test(v) ? v.toLowerCase() : notFound("payment"));

export class Reversals {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly scopeOf: ScopeOf) {}

  /** GET /payments/:id/reverse-preview: the plan, read only; nothing is locked or written. */
  async preview(ctx: StaffContext, paymentId: string) {
    const pid = idOf(paymentId), f = firmScope(ctx.firmId).firmId, seen = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("payment");
      return planReversal(tx, f, pid, seen);
    });
  }

  /** POST /payments/:id/reverse { reasonCode, reason?, previewHash }: one CORRECTION naming the deposit, under its party's lock. */
  async reverse(ctx: StaffContext, paymentId: string, body: unknown) {
    const pid = idOf(paymentId), d = parse(ReverseIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const seen = await this.scopeOf(ctx);   // read before the transaction (FO-7t's breaker r9-M1)
    return this.write(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("payment");
      const first = await planReversal(tx, f, pid, seen);   // C5 before any lock
      await tx.$executeRaw`select money_trust_lock(${f}::uuid, ${(first.personId ?? first.companyId)!}::uuid, ${first.currency}::"MoneyCurrency")`;
      await liveParty(tx, f, first.personId ?? first.companyId, seen);   // FO-9b part 2m, under the party's lock
      const plan = await planReversal(tx, f, pid, seen);   // again, under the lock: what is written is what was read
      if (!plan.reasonsAllowed.includes(d.reasonCode))
        refuse("NOT_RETURNED", "This payment was cleared when it was recorded, so it is never \"Returned\": reverse it as \"Recorded by mistake\", \"Wrong client\" or with a typed reason.", { reasonsAllowed: plan.reasonsAllowed });
      if (plan.hash !== d.previewHash) refuse("CHANGED", "Changed since the preview: this client's trust ledger moved. Look at the preview again. Nothing was changed.");
      const reason = d.reason ?? REASON_WORDS[d.reasonCode];
      const [t] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${reason}, 200) as ok`;   // break M1: the database's text rule, asked first
      if (!t.ok) badField("reason", "This needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was changed.");
      const e = await tx.moneyTrustEntry.create({ data: { firmId: f, personId: plan.personId, companyId: plan.companyId, caseId: plan.caseId, kind: "CORRECTION", amountMinor: -plan.reverseMinor, currency: plan.currency as never,
        correctsEntryId: plan.depositEntryId, correctionKind: d.reasonCode, reason, createdBy: by }, select: { id: true, balanceAfterMinor: true } });
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.reversed", entity: "money_payment", entityKey: pid,
        summary: `${plan.currency} ${MONEY(plan.reverseMinor)} trust deposit reversed (${REASON_WORDS[d.reasonCode]})${e.balanceAfterMinor < 0 ? ", the client's trust is now below zero" : ""}.`,
        detail: { paymentId: pid, entryId: e.id, depositEntryId: plan.depositEntryId, reasonCode: d.reasonCode, amountMinor: plan.reverseMinor, shortfallMinor: Math.max(0, -e.balanceAfterMinor), previewHash: plan.hash, plannedBalanceAfterMinor: plan.balanceAfterMinor },
        before: { balanceMinor: plan.balanceBeforeMinor }, after: { balanceMinor: e.balanceAfterMinor, reasonCode: d.reasonCode, reason } });
      await tx.moduleEvent.create({ data: { firmId: f, type: REVERSAL_EVENT.PAYMENT_REVERSED, subjectId: pid, payload: PaymentReversedPayload.parse({ paymentId: pid, entryId: e.id, personId: plan.personId, companyId: plan.companyId, caseId: plan.caseId,
        reasonCode: d.reasonCode, amountMinor: plan.reverseMinor, currency: plan.currency }) } });
      return { paymentId: pid, entryId: e.id, status: "Reversed", reasonCode: d.reasonCode, amountMinor: plan.reverseMinor, currency: plan.currency, balanceAfterMinor: e.balanceAfterMinor, shortfallMinor: Math.max(0, -e.balanceAfterMinor) };
    });
  }

  /** GET /trust/shortfall[?currency=]: every party below zero, each with the latest reversal (FO-7a2's
   *  money_trust_shortfall, read in one pass over the firm's entries: break M2, the view's per-row scan). C5 (review M2):
   *  a row shows only to a caller who sees every entry of that party in that currency, so its figure is never money on
   *  a case the caller cannot see; a partial view shows no row (fail closed). */
  async shortfall(ctx: StaffContext, query: unknown) {
    const q = parseInput(ShortfallQuery, query ?? {}), f = firmScope(ctx.firmId).firmId, seen = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust record");
      const rows = await tx.$queryRaw<{ personId: string | null; companyId: string | null; name: string | null; currency: string; balanceMinor: number; reversalEntryId: string | null; paymentId: string | null; caseId: string | null; reasonCode: string | null }[]>`
        with e as (select x.*, (x.case_id = any(${seen.cases}::uuid[]) or (x.case_id is null and coalesce(x.person_id, x.company_id) = any(${seen.parties}::uuid[]))) as seen
            from money_trust_entry x where x.firm_id = ${f}::uuid ${q.currency ? Prisma.sql`and x.currency = ${q.currency}::"MoneyCurrency"` : Prisma.empty}),
          last as (select distinct on (person_id, company_id, currency) person_id, company_id, currency, balance_after_minor from e order by person_id, company_id, currency, seq desc),
          rev as (select distinct on (person_id, company_id, currency) person_id, company_id, currency, id, case_id, corrects_entry_id, correction_kind from e
            where kind = 'CORRECTION' and correction_kind in ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER') order by person_id, company_id, currency, seq desc),
          whole as (select person_id, company_id, currency from e group by person_id, company_id, currency having bool_and(coalesce(seen, false)))   -- round 3 (n1): an entry the caller cannot see is false, never a skipped NULL
        select l.person_id::text as "personId", l.company_id::text as "companyId", coalesce(nullif(btrim(concat_ws(' ', fp.given_names, fp.family_name)), ''), fc.operating_name) as name,
          l.currency::text as currency, l.balance_after_minor as "balanceMinor", r.id::text as "reversalEntryId", d.payment_id::text as "paymentId", r.case_id::text as "caseId", r.correction_kind::text as "reasonCode"
        from last l join whole w on w.person_id is not distinct from l.person_id and w.company_id is not distinct from l.company_id and w.currency = l.currency
          left join rev r on r.person_id is not distinct from l.person_id and r.company_id is not distinct from l.company_id and r.currency = l.currency
          left join money_trust_entry d on d.firm_id = ${f}::uuid and d.id = r.corrects_entry_id
          left join fo_person fp on fp.firm_id = ${f}::uuid and fp.id = l.person_id left join fo_company fc on fc.firm_id = ${f}::uuid and fc.id = l.company_id
        where l.balance_after_minor < 0
        order by l.balance_after_minor asc, coalesce(l.person_id, l.company_id)`;
      return { items: rows.map((x) => ({ ...x, belowZero: true as const })) };
    });
  }

  /** One writing transaction; a rule the database refused (its own words name the rule) is a 409, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      const said = /money_[a-z_]+: ([^\n]{1,300})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].replace(/\s*\(.*$/, "")}. Nothing was changed.`) : Promise.reject(e);
    }
  }
}
