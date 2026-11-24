// FO-7t part 1 (R1.58; briefs/track-b/FO-7t-1.md over design/briefs/FO-7t.md part 1; AG-6-59, AG-6-62, AG-6-63 rules 1,
// 3-5, 7, AG-6-69 rule 1, AG-6-71 rules 2, 4, AG-6-37 rules 1-3; P-567 (3), P-603, P-634 (1)): trust on and money in.
// * The Owner's trust answer (UNANSWERED | YES | NO, FO-7ts's columns): who is the session's staff member, when the
//   database's. Yes → No while money is held answers the held amounts, never a refusal (AG-6-59 rule 6).
// * Trust off and nothing held (the answer is not YES, and no balance or To move line): every trust route but the answer
//   is 404 (trustShows, FO-7q's one reading). Trust off with money held: reads answer, a new request or deposit is 409.
// * A trust request is created and sent in one step; the DR- number is the database's, taken at send; with the trust
//   details block empty it is stored unsent ("Add your trust payment details", AG-6-71 rule 4).
// * A deposit: one payment received into TRUST, its DEPOSIT entry and its TRUST receipt (R-, naming the entry, never the
//   payment) in one transaction under the party's trust lock (money_trust_lock, FO-7lk's one order), with one audit line
//   and one trust.deposited event; the receipt PDF is emailed after the commit and never undoes it. No card into trust.
// Every rule the database holds (trust on, a cancelled request takes no money, the request's currency, the never-below-
// zero balance) is its own: a refusal comes back as 409 in its words. Legal reading: Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { HandMethod, MINOR_MAX, MoneyCurrency } from "../../../../ports/client-money.ts";
import { TRUST_EVENT, TrustDepositedPayload } from "../../../../ports/events/client-money-trust.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { DocumentRenderPort, RenderData } from "../../../../ports/render.ts";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { SYSTEM_REPLY_TO } from "../../platform/identity/session/mail.ts";
import { forbidden, problem, type StaffContext } from "../../platform/identity/keys.ts";
import { MONEY, UUID, badField, notFound, parse } from "../invoices/drafts.ts";
import { dayOf } from "../invoices/facts.ts";
import { trustShows } from "../reads/common.ts";
import { TrustDocuments, trustSubject, trustText, type TrustTemplate } from "./documents.ts";
import { ApplyIn, RefundIn, applyTrust, refKey, refundTrust } from "./money-out.ts";
import { invoiceInScope } from "../reads/visibility.ts";
import type { MoneyVisibility } from "../../../../ports/money-visibility.ts";

type Tx = Prisma.TransactionClient;
const id = (what: string) => z.string().regex(UUID, `${what} is not an id.`);
const amount = z.number({ error: "The amount (in cents) must be a whole number." }).int("The amount (in cents) must be a whole number.").min(1, "The amount is at least 1 cent.").max(MINOR_MAX, `The amount is at most ${MONEY(MINOR_MAX)}.`);
const words = (what: string, max: number) => z.string().trim().min(1, `${what} is needed.`).max(max, `At most ${max} characters.`).regex(/^[^\u0000-\u001f\u007f\u2028\u2029]*$/, "One line, no tabs or control characters.");
const party = { personId: id("The person").optional(), companyId: id("The company").optional(), caseId: id("The case").optional() };
const oneParty = (d: { personId?: string; companyId?: string }) => (d.personId ? 1 : 0) + (d.companyId ? 1 : 0) === 1;
const ONE_PARTY = { message: "Name one client: a person or a company (never a prospect).", path: ["personId"] };
/** Offline methods into trust: FO-7b's hand methods less the card terminal (P-567 (3): card money is operating only). */
export const DEPOSIT_METHODS = HandMethod.options.filter((m) => m !== "CARD_TERMINAL") as [string, ...string[]];

export const AnswerIn = z.strictObject({ answer: z.enum(["YES", "NO"], { message: "Answer YES or NO." }) });
export const RequestIn = z.strictObject({ ...party, amountMinor: amount, currency: MoneyCurrency, purpose: words("The purpose", 500) }).refine(oneParty, ONE_PARTY);
export const CancelIn = z.strictObject({ reason: words("The reason", 200) });
export const DepositIn = z.strictObject({ ...party, trustRequestId: id("The trust request").optional(),
  method: z.enum(DEPOSIT_METHODS, { message: "Trust takes bank transfer, e-Transfer, wire, cheque, cash or another offline method. Card money goes to the operating account only, never to trust." }),
  amountMinor: amount, currency: MoneyCurrency, reference: words("The reference", 200).optional(),
  evidenceFileKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9/._-]{0,299}$/, "The evidence is the key of a file uploaded first.").optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:._-]{8,200}$/, "8 to 200 letters, numbers, or : . _ -"), duplicateReferenceAcknowledged: z.boolean().optional() }).refine(oneParty, ONE_PARTY);

export type Party = { personId: string | null; companyId: string | null; id: string; name: string; email: string | null };
export type Held = { currency: string; amountMinor: number; cases: number };
export type DepositView = { paymentId: string; entryId: string; receiptNumber: string; cleared: boolean; receiptEmail: "SENT" | "NO_ADDRESS" | "NOT_SENT" };
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
const idOf = (v: string, what: string) => (UUID.test(v) ? v.toLowerCase() : notFound(what));
const METHOD: Record<string, string> = { BANK_TRANSFER: "bank transfer", WIRE: "wire", CHEQUE: "cheque", CASH: "cash", E_TRANSFER: "Interac e-Transfer", OTHER: "another method" };

/** The person or company of the firm a trust record is on (404 when it is not the firm's). */
export async function partyOf(tx: Tx | PrismaClient, firm: string, p: { personId?: string; companyId?: string }): Promise<Party> {
  if (p.personId) {
    const x = await tx.foPerson.findFirst({ where: firmScope(firm, { id: p.personId.toLowerCase() }), select: { id: true, givenNames: true, familyName: true, email: true } });
    return x ? { personId: x.id, companyId: null, id: x.id, name: [x.givenNames, x.familyName].filter(Boolean).join(" ") || "Client", email: x.email ?? null } : notFound("person");
  }
  const c = await tx.foCompany.findFirst({ where: firmScope(firm, { id: p.companyId!.toLowerCase() }), select: { id: true, operatingName: true } });
  if (!c) return notFound("company");
  const contact = await tx.foCompanyContact.findFirst({ where: firmScope(firm, { companyId: c.id, role: "PRIMARY" as const, validTo: null }), select: { person: { select: { email: true } } } });
  return { personId: null, companyId: c.id, id: c.id, name: c.operatingName || "Client", email: contact?.person.email ?? null };
}

export class TrustMoney {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly mail: MailPort | null,
    private readonly scopeOf: (ctx: StaffContext) => Promise<MoneyVisibility>, private readonly docs: DocumentRenderPort = new TrustDocuments()) {}

  /** GET /trust/answer: always answers, also with trust off (it is how trust is turned on). */
  async answer(ctx: StaffContext) {
    const s = await this.db.moneyPaymentSettings.findFirst({ where: firmScope(ctx.firmId), select: { trustAnswer: true, trustAnsweredBy: true, trustAnsweredAt: true } });
    return { answer: s?.trustAnswer ?? "UNANSWERED", answeredBy: s?.trustAnsweredBy ?? null, answeredAt: s?.trustAnsweredAt?.toISOString() ?? null };
  }

  /** PUT /trust/answer: the Owner only (AG-6-59 rule 8; the route is @AnyStaff, the role is checked here). */
  async setAnswer(ctx: StaffContext, body: unknown) {
    if (!ctx.roles.includes("OWNER")) forbidden("Only the firm's Owner answers whether the firm holds client money in trust.", "OWNER_ONLY");
    const { answer } = parse(AnswerIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    return this.write(async (tx) => {
      const [s] = await tx.$queryRaw<{ answer: string }[]>`select trust_answer::text as answer from money_payment_settings where firm_id = ${f}::uuid for update`;
      if (!s) return refuse("PAYMENTS_NOT_SET_UP", "Set up payments first: this firm's payment settings are not saved yet. Nothing was changed.");
      if (s.answer !== answer) {
        await tx.moneyPaymentSettings.update({ where: { firmId: f }, data: { trustAnswer: answer, trustAnsweredBy: by } });
        await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.answered", entity: "money_payment_settings", entityKey: f, summary: `Holds client money in trust: ${s.answer} → ${answer}.`, before: { answer: s.answer }, after: { answer } });
      }
      const held = answer === "NO" ? await heldOf(tx, f) : [];
      const message = held.length ? `${held.map((h) => `${h.currency} ${MONEY(h.amountMinor)} is held for ${h.cases} case${h.cases === 1 ? "" : "s"}.`).join(" ")} Trust screens stay visible until it is settled.` : undefined;
      return { answer, held, ...(message ? { message } : {}) };
    });
  }

  /** POST /trust/requests: create and send in one step (AG-6-62 §6); unsent while the trust details block is empty. */
  async createRequest(ctx: StaffContext, body: unknown) {
    const r = parse(RequestIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const seen = await this.scopeOf(ctx);   // breaker r9-M1: read before the transaction, never on a second connection inside it
    const made = await this.write(async (tx) => {
      await this.trustOn(tx, f);
      const who = await partyOf(tx, f, r), caseId = r.caseId ? await this.caseOf(tx, ctx, seen, r.caseId, who) : this.partySeen(seen, who);
      await textOk(tx, "purpose", r.purpose, 500);
      const details = (await tx.moneyPaymentSettings.findFirst({ where: firmScope(f), select: { trustDetails: true } }))?.trustDetails?.trim() || null;
      const row = await tx.moneyTrustRequest.create({ data: { firmId: f, personId: who.personId, companyId: who.companyId, caseId, amountMinor: r.amountMinor, currency: r.currency, purpose: r.purpose, createdBy: by,
        ...(details ? { sentAt: this.clock.now(), sentBy: by } : {}) }, select: { id: true, number: true, sentAt: true } });
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.request_created", entity: "money_trust_request", entityKey: row.id,
        summary: row.number ? `Trust request ${row.number} sent: ${r.currency} ${MONEY(r.amountMinor)}.` : `Trust request saved unsent (no trust payment details yet): ${r.currency} ${MONEY(r.amountMinor)}.`,
        detail: { trustRequestId: row.id, sent: !!row.number }, before: null, after: { number: row.number, personId: who.personId, companyId: who.companyId, caseId, amountMinor: r.amountMinor, currency: r.currency, purpose: r.purpose } });
      return { ...row, who, details };
    });
    if (!made.number || !made.details) return { id: made.id, number: null, status: "Waiting", email: "HELD", message: "Add your trust payment details in the payment settings first. This request is saved but not sent: cancel it and make it again once the details are in." };
    const firmName = await this.firmName(f);
    const data = { firmName, number: made.number, sentOn: dayOf(made.sentAt!), party: made.who.name, currency: r.currency, amount: MONEY(r.amountMinor), purpose: r.purpose, trustDetails: made.details };
    return { id: made.id, number: made.number, status: "Sent", email: await this.email(f, made.who, "client_money.trust_request", data, `trust-request:${made.id}`) };
  }

  /** POST /trust/requests/:id/cancel: a reason is required; the request keeps its number. */
  async cancel(ctx: StaffContext, requestId: string, body: unknown) {
    const rid = idOf(requestId, "trust request"), c = parse(CancelIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    // Lead 17 (C5): the caller must see the request's case, or with no case its client, as the request read requires.
    // Read once before the transaction (the r9-M1 shape); an unseen request is 404 before the cancelled check, so nothing
    // tells it apart from a missing one.
    const seen = await this.scopeOf(ctx);
    return this.write(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust request");
      const [r] = await tx.$queryRaw<{ number: string | null; cancelled: boolean; case_id: string | null; party: string | null }[]>`select number, cancelled_at is not null as cancelled, case_id::text, coalesce(person_id, company_id)::text as party
        from money_trust_request where firm_id = ${f}::uuid and id = ${rid}::uuid for update`;
      if (!r || !(r.case_id ? seen.cases.includes(r.case_id) : !!r.party && seen.parties.includes(r.party))) return notFound("trust request");
      if (r.cancelled) refuse("CANCELLED", `${r.number ?? "This request"} is already cancelled. Nothing was changed.`);
      await textOk(tx, "reason", c.reason, 200);
      await tx.moneyTrustRequest.update({ where: { firmId_id: { firmId: f, id: rid } }, data: { cancelledAt: this.clock.now(), cancelledBy: by, cancelReason: c.reason } });
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.request_cancelled", entity: "money_trust_request", entityKey: rid, summary: `Trust request ${r.number ?? "(unsent)"} cancelled.`,
        detail: { trustRequestId: rid }, before: { status: "Open", cancelReason: null }, after: { status: "Cancelled", cancelReason: c.reason } });
      return { id: rid, status: "Cancelled", number: r.number };
    });
  }

  /** POST /trust/deposits. A replay of the same idempotency key answers the payment already recorded. */
  async deposit(ctx: StaffContext, body: unknown): Promise<DepositView & { replayed: boolean }> {
    const d = parse(DepositIn, body), f = firmScope(ctx.firmId).firmId;
    let done: { paymentId: string; replayed: boolean };
    try { done = await this.recordDeposit(ctx, d); } catch (e) {
      // Two calls with one new key at the same moment on two parties: the unique key refuses the later one; read it again.
      if (!(e instanceof HttpException && (e.getResponse() as { code?: string }).code === "KEY_USED")) throw e;
      done = await this.recordDeposit(ctx, d);
    }
    const [v] = await this.db.$queryRaw<{ entryId: string; receiptNumber: string; issuedAt: Date; cleared: boolean; receivedAt: Date; requestNumber: string | null }[]>`
      select e.id::text as "entryId", r.number as "receiptNumber", r.issued_at as "issuedAt", p.cleared, p.received_at as "receivedAt", q.number as "requestNumber"
      from money_payment p join money_trust_entry e on e.firm_id = p.firm_id and e.payment_id = p.id join money_receipt r on r.firm_id = e.firm_id and r.trust_entry_id = e.id
      left join money_trust_request q on q.firm_id = p.firm_id and q.id = p.trust_request_id where p.firm_id = ${f}::uuid and p.id = ${done.paymentId}::uuid`;
    const who = await partyOf(this.db, f, d);
    const data = { firmName: await this.firmName(f), number: v.receiptNumber, issuedOn: dayOf(v.issuedAt), party: who.name, currency: d.currency, amount: MONEY(d.amountMinor), method: METHOD[d.method] ?? d.method, receivedOn: dayOf(v.receivedAt),
      reference: d.reference ? `, reference ${d.reference}` : "", request: v.requestNumber ? `For trust request ${v.requestNumber}.` : "", cleared: v.cleared ? "" : "Not yet cleared" };
    const receiptEmail = await this.email(f, who, "client_money.trust_receipt", data, `trust-receipt:${done.paymentId}`, v.receiptNumber);
    return { paymentId: done.paymentId, entryId: v.entryId, receiptNumber: v.receiptNumber, cleared: v.cleared, receiptEmail, replayed: done.replayed };
  }

  private async recordDeposit(ctx: StaffContext, d: z.infer<typeof DepositIn>) {
    const f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`, requestId = d.trustRequestId?.toLowerCase() ?? null;
    // Breaker r9-M1: the caller's visibility is read once, before the transaction. Read inside it (on another pooled
    // connection), the lock's holder waited for a connection the lock's waiters held: 10 writes at once all timed out.
    const seen = await this.scopeOf(ctx);
    return this.write(async (tx) => {
      const who = await partyOf(tx, f, d);
      await tx.$executeRaw`select money_trust_lock(${f}::uuid, ${who.id}::uuid, ${d.currency}::"MoneyCurrency")`;
      const had = await tx.moneyPayment.findFirst({ where: firmScope(f, { idempotencyKey: d.idempotencyKey }), include: { trustEntry: true } });
      if (had) {   // a double click, or a retry: the one payment, never a second
        const e = had.trustEntry;
        if (had.receivedInto !== "TRUST" || had.method !== d.method || had.amountMinor !== d.amountMinor || had.currency !== d.currency || had.trustRequestId !== requestId || (e?.personId ?? e?.companyId) !== who.id
          || had.reference !== (d.reference ?? null) || had.evidenceFileKey !== (d.evidenceFileKey ?? null) || (d.caseId !== undefined && e?.caseId !== d.caseId.toLowerCase()))
          refuse("KEY_USED", "This idempotency key already recorded a different payment. Nothing was saved.");
        return { paymentId: had.id, replayed: true };
      }
      await this.trustOn(tx, f);   // after the replay: a retry of money already recorded answers it, also after Yes → No
      let caseId = d.caseId ? await this.caseOf(tx, ctx, seen, d.caseId, who) : null;
      if (requestId) {
        const q = await tx.moneyTrustRequest.findFirst({ where: firmScope(f, { id: requestId }), select: { personId: true, companyId: true, caseId: true } });
        if (!q) return notFound("trust request");
        if ((q.personId ?? q.companyId) !== who.id) badField("trustRequestId", "This trust request is for another client. Nothing was saved.");
        if (caseId && q.caseId && caseId !== q.caseId) badField("caseId", "This trust request is for another case: a deposit on it keeps the request's case. Nothing was saved.");
        if (!caseId && q.caseId && !seen.cases.includes(q.caseId)) notFound("case");   // the request's case, unseen
        caseId ??= q.caseId;
      }
      if (!caseId) this.partySeen(seen, who);
      if (d.reference) {
        await textOk(tx, "reference", d.reference, 200);
        const [dup] = await tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from money_payment p join money_trust_entry e on e.firm_id = p.firm_id and e.payment_id = p.id
          where p.firm_id = ${f}::uuid and p.received_into = 'TRUST' and coalesce(e.person_id, e.company_id) = ${who.id}::uuid and ${refKey(Prisma.sql`p.reference`)} = ${refKey(Prisma.sql`${d.reference}`)}`;
        if (dup.n > 0n && !d.duplicateReferenceAcknowledged) refuse("DUPLICATE_REFERENCE", `A trust deposit with reference ${d.reference} is already recorded for ${who.name}. Record anyway?`, { acknowledge: "duplicateReferenceAcknowledged" });
      }
      const cleared = d.method !== "CHEQUE";   // a cheque is "Not yet cleared" until ticked (AG-6-63 rule 7)
      const pay = await tx.moneyPayment.create({ data: { firmId: f, trustRequestId: requestId, method: d.method as never, amountMinor: d.amountMinor, currency: d.currency, receivedInto: "TRUST", receivedAt: this.clock.now(),
        reference: d.reference ?? null, evidenceFileKey: d.evidenceFileKey ?? null, idempotencyKey: d.idempotencyKey, recordedBy: by, cleared }, select: { id: true } });
      const entry = await tx.moneyTrustEntry.create({ data: { firmId: f, personId: who.personId, companyId: who.companyId, caseId, kind: "DEPOSIT", amountMinor: d.amountMinor, currency: d.currency, paymentId: pay.id, trustRequestId: requestId, createdBy: by },
        select: { id: true, balanceAfterMinor: true } });
      const receipt = await tx.moneyReceipt.create({ data: { firmId: f, kind: "TRUST", trustEntryId: entry.id }, select: { number: true } });
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.deposited", entity: "money_payment", entityKey: pay.id, summary: `${d.currency} ${MONEY(d.amountMinor)} received into trust for ${who.name}, receipt ${receipt.number}.`,
        detail: { paymentId: pay.id, entryId: entry.id, receiptNumber: receipt.number, amountMinor: d.amountMinor, balanceAfterMinor: entry.balanceAfterMinor },
        before: null, after: { method: d.method, amountMinor: d.amountMinor, currency: d.currency, reference: d.reference ?? null, caseId, trustRequestId: requestId, cleared, evidenceFileKey: d.evidenceFileKey ?? null, receiptNumber: receipt.number } });
      await tx.moduleEvent.create({ data: { firmId: f, type: TRUST_EVENT.TRUST_DEPOSITED, subjectId: pay.id, payload: TrustDepositedPayload.parse({ paymentId: pay.id, entryId: entry.id, personId: who.personId, companyId: who.companyId, caseId, trustRequestId: requestId, amountMinor: d.amountMinor, currency: d.currency }) } });
      return { paymentId: pay.id, replayed: false };
    });
  }

  /** POST /trust/applications (FO-7t part 2, AG-6-68): Pay from trust on an issued invoice. Trust off with money held
   *  still answers (AG-6-59 rule 6). C5: the invoice, and a picked case or payer, must be the caller's to see (404). */
  async apply(ctx: StaffContext, body: unknown) {
    const a = parse(ApplyIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const seen = await this.scopeOf(ctx);   // read before the transaction (breaker r9-M1)
    return this.write(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust record");
      await invoiceInScope(tx, f, a.invoiceId, seen);
      const payer = a.pick && (a.pick.personId || a.pick.companyId) ? await partyOf(tx, f, a.pick) : null;
      if (a.pick) {
        const [inv] = await tx.$queryRaw<{ case_id: string | null; party: string }[]>`select case_id::text, coalesce(person_id, company_id)::text as party from money_invoice where firm_id = ${f}::uuid and id = ${a.invoiceId}::uuid`;
        const caseId = a.pick.caseId !== undefined ? a.pick.caseId : inv.case_id;
        if (caseId ? !seen.cases.includes(caseId) : !seen.parties.includes(payer?.id ?? inv.party)) notFound(caseId ? "case" : "person");
        await textOk(tx, "pick", a.pick.reason, 200);
      }
      const done = await applyTrust(tx, this.audit, { firmId: f, by, today: dayOf(this.clock.now()), invoiceId: a.invoiceId, amountMinor: a.amountMinor, unclearedAcknowledged: a.unclearedAcknowledged, duplicateAcknowledged: a.duplicateAcknowledged,
        pick: a.pick, ...(payer ? { payer: { personId: payer.personId, companyId: payer.companyId } } : {}) });
      const v = done.after.view;
      return { entryId: done.entryId, invoiceId: done.invoiceId, amountMinor: done.amountMinor, currency: done.currency, invoice: { number: v.number, statusWord: v.statusWord, dueMinor: v.dueMinor } };
    });
  }

  /** POST /trust/refunds (FO-7t part 2, AG-6-23): an offline refund to the client from what the payer holds on a case (or
   *  before a case); to the payer unless another payee is named with a reason. Trust off with money held still answers. */
  async refund(ctx: StaffContext, body: unknown) {
    const r = parse(RefundIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const seen = await this.scopeOf(ctx);
    return this.write(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust record");
      const who = await partyOf(tx, f, r), caseId = r.caseId ? await this.caseOf(tx, ctx, seen, r.caseId, who) : this.partySeen(seen, who);
      for (const [field, v, max] of [["reason", r.reason, 200], ["reference", r.reference, 100], ["payeeName", r.payee?.name, 200], ["payeeReason", r.payee?.reason, 200]] as const) if (v) await textOk(tx, field, v, max);
      let payee: { personId?: string; companyId?: string; name?: string; reason?: string } | null = null;
      if (r.payee && !(r.payee.personId || r.payee.companyId || r.payee.name)) badField("payee", "Name the payee: a person, a company or a name (or leave the payee out to refund the payer). Nothing was saved.");   // break m1
      if (r.payee) {
        const other = r.payee.name ? null : await partyOf(tx, f, r.payee);
        if (other?.id === who.id && r.payee.reason) badField("payee", "This is the payer: leave the payee out, or name someone else. Nothing was saved.");   // break m1: never a reason dropped silently
        if (!other || other.id !== who.id) {
          if (!r.payee.reason) badField("payee", "Refunding to someone other than the payer needs a reason. Nothing was saved.");
          payee = other ? { ...(other.personId ? { personId: other.personId } : { companyId: other.companyId! }), reason: r.payee.reason } : { name: r.payee.name, reason: r.payee.reason };
        }
      }
      return refundTrust(tx, this.audit, { firmId: f, by, today: dayOf(this.clock.now()), holder: { personId: who.personId, companyId: who.companyId }, caseId, r, payee });
    });
  }

  // ------------------------------------------------------------------------------------------------- helpers
  /** With no case, the party itself must be one the caller sees (MoneyVisibilityPort; Lead B's money read): 404, as an
   *  unseen case, failing closed as the reads do. */
  private partySeen(seen: MoneyVisibility, who: Party): null {
    if (!seen.parties.includes(who.id)) notFound(who.personId ? "person" : "company");
    return null;
  }
  /** A case given on a request or deposit: one the caller sees (MoneyVisibilityPort: of this firm, existing, in their C5
   *  scope; fail closed, 404) and of this client (422). The client is read from case_client's front-office link
   *  (fo_person_id / fo_company_id, "no foreign key, contract §1 rule 4"): a plain read, no case-side code imported. */
  private async caseOf(tx: Tx, ctx: StaffContext, seen: MoneyVisibility, caseId: string, who: Party): Promise<string> {
    const id = caseId.toLowerCase();
    if (!seen.cases.includes(id)) return notFound("case");
    const [c] = await tx.$queryRaw<{ party: string | null }[]>`select coalesce(cc.fo_person_id, cc.fo_company_id)::text as party from runtime_case rc join case_client cc on cc.id = rc.client_id
      where rc.firm_id = ${firmScope(ctx.firmId).firmId}::uuid and rc.id = ${id}::uuid`;
    if (!c) return notFound("case");
    if (c.party !== who.id) badField("caseId", "This case is another client's. Nothing was saved.");
    return id;
  }
  /** A new request or deposit: 404 while trust does not show at all; 409 while it shows only for money held (rule 6). */
  private async trustOn(tx: Tx, f: string) {
    if (!(await trustShows(tx, f))) notFound("trust record");
    const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(f), select: { trustAnswer: true } });
    if (s?.trustAnswer !== "YES") refuse("TRUST_OFF", "This firm no longer takes money into trust: the money already held can only be paid out or refunded. Nothing was saved.");
  }
  /** One writing transaction; a rule the database refused (its own words name the rule) is a 409, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as { code?: string }).code === "P2002" && /idempotency_key/.test(JSON.stringify((e as { meta?: unknown }).meta ?? ""))) refuse("KEY_USED", "This idempotency key is already in use for another payment. Nothing was saved.");
      if (/out of range for type integer|integer out of range/.test(e instanceof Error ? e.message : "")) refuse("TOO_LARGE", `This would take a trust balance past the most one balance holds (${MONEY(MINOR_MAX)}). Nothing was saved.`);
      const said = /money_[a-z_]+: ([^\n]{1,300})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].replace(/\s*\(.*$/, "")}. Nothing was saved.`) : Promise.reject(e);
    }
  }
  private async firmName(f: string) { return (await this.db.platformFirm.findFirst({ where: ownFirm(f), select: { operatingName: true } }))?.operatingName ?? ""; }
  /** One email to the party, no Cc (AG-6-63 rule 5), the receipt with its PDF. Never throws: the record is already saved. */
  private async email(f: string, who: Party, key: TrustTemplate, data: RenderData, idempotencyKey: string, pdfName?: string): Promise<DepositView["receiptEmail"]> {
    try {
      if (!who.email) return "NO_ADDRESS";
      if (!this.mail) return "NOT_SENT";
      const doc = pdfName ? await this.docs.render(key, data) : null;
      await this.mail.send({ firmId: f, to: who.email, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: key, idempotencyKey, subject: trustSubject(key, data), text: trustText(key, data),
        ...(doc ? { attachments: [{ filename: `${pdfName}.pdf`, contentType: doc.contentType, bytes: new Uint8Array(doc.bytes) }] } : {}) });
      return "SENT";
    } catch { return "NOT_SENT"; }
  }
}

/** The database's own text rule (money_text_ok), asked before writing so a refusal is a field error, never a 500. */
async function textOk(tx: Tx, field: string, value: string, max: number) {
  const [t] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${value}, ${max}::int) as ok`;
  if (!t.ok) badField(field, "This needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was saved.");
}
/** What the firm holds in trust per currency, and on how many cases (or clients before a case) it is held. */
async function heldOf(tx: Tx, f: string): Promise<Held[]> {
  const rows = await tx.$queryRaw<{ currency: string; amount: string; cases: number }[]>`select currency, sum(b)::text as amount, count(*)::int as cases from (
      select currency::text as currency, sum(amount_minor) as b from money_trust_entry where firm_id = ${f}::uuid group by coalesce(person_id, company_id), case_id, currency having sum(amount_minor) <> 0) x
    group by currency order by currency`;
  return rows.map((r) => ({ currency: r.currency, amountMinor: Number(r.amount), cases: r.cases }));
}
