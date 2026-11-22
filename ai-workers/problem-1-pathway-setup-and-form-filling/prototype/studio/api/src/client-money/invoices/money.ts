// FO-7b part 1b (R1.56, R1.60; briefs/track-b/FO-7b-1b.md; Lead B's FO-7b.md rev 16.95, amendments 1, 3, 6, 8, 10;
// AG-6-1 rules 5-7, AG-6-19, AG-6-21, AG-6-46, AG-6-48, AG-6-63, AG-6-69 rules 4-5, AG-6-71 rule 3; P-603, P-634):
// issue an invoice, record a payment made outside the card link with its receipt, and credit an issued invoice.
// * One lock order (FO-7lk): the party's trust lock, then the invoice row. So two writers on one invoice go one at a
//   time and each reads what the other wrote: two payments at once, the second is the extra ("Paid twice?").
// * The numbers (INV-, R-, CN-) and their times are the database's, taken in the writing transaction.
// * An overpayment is never refused (amendment 1): the payment is stored whole, the part past what the invoice asks is
//   `extra`, waiting for a person's "Refund · Keep as credit" (those two actions are a later part's); nothing moves from
//   operating to trust by itself. Money received into trust (needs the trust answer YES) is a DEPOSIT on the party's
//   ledger and is applied to the invoice in the same step, up to what is due (AG-6-69 rule 5); the rest stays in trust.
// * Each change is one transaction with one audit line (fail-closed) and its outbox rows last (contracts §0.5). Emails
//   go after the commit and never undo it: the invoice email waits while the operating details are empty.
// Legal reading of the trust rules: Unconfirmed: no counsel. Tax and credit-note reading: Unconfirmed: no accountant.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { CreditNoteIn, CreditNoteView, InvoiceEventPayload, IssueIn, IssuedView, MINOR_MAX, MONEY_EVENT, PaymentEventPayload, PaymentIn, PaymentView, type InvoiceView } from "../../../../ports/client-money.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { DocumentRenderPort, RenderData } from "../../../../ports/render.ts";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { SYSTEM_REPLY_TO } from "../../platform/identity/session/mail.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { MoneyDocuments, creditNoteData, documentText, invoiceData, receiptData, type Letterhead, type MoneyTemplate } from "./documents.ts";
import { MONEY, UUID, badField, notFound, parse } from "./drafts.ts";
import { dayOf, invoiceFacts, type Facts } from "./facts.ts";

type Tx = Prisma.TransactionClient;
type Reader = Tx | PrismaClient;
type Locked = { issued: boolean; number: string | null; currency: "CAD" | "USD"; personId: string | null; companyId: string | null };
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
/** The firm's business address on one line (samples/firms.json's office shape), or "" when none is saved. */
const addressOf = (a: unknown): string => { if (!a || typeof a !== "object" || Array.isArray(a)) return ""; const o = a as Record<string, unknown>, t = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  return [[t("unit"), [t("street_number"), t("street_name")].filter(Boolean).join(" ")].filter(Boolean).join("-"), t("city"), [t("province_state"), t("postal_code")].filter(Boolean).join(" "), t("country")].filter(Boolean).join(", "); };
const idOf = (invoiceId: string) => (UUID.test(invoiceId) ? invoiceId.toLowerCase() : notFound("invoice"));

export class InvoiceMoney {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly mail: MailPort | null, private readonly docs: DocumentRenderPort = new MoneyDocuments()) {}

  /** POST …/invoices/:id/issue: the next INV- number, the lines frozen, a due date (the firm's "Due in N days" when none is sent). */
  async issue(ctx: StaffContext, invoiceId: string, body: unknown): Promise<IssuedView> {
    const id = idOf(invoiceId), b = parse(IssueIn, body ?? {}), today = dayOf(this.clock.now());
    const view = await this.write(async (tx) => {
      const inv = await this.lock(tx, ctx.firmId, id);
      if (inv.issued) refuse("ISSUED", `This invoice is already issued (${inv.number}). Nothing was changed.`);
      const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(ctx.firmId), select: { dueInDays: true, pricesIncludeTax: true } });
      if (!s) return refuse("PAYMENTS_NOT_SET_UP", "Set up payments first: this firm's payment settings are not saved yet. Nothing was changed.");
      if (s.pricesIncludeTax) refuse("PRICES_INCLUDE_TAX", "Prices that include tax come later: this firm has \"Prices include tax\" on, so an invoice can't be issued yet. Nothing was changed.");
      const draft = (await this.facts(tx, ctx.firmId, id, today)).view;
      if (!draft.lines.length) refuse("NO_LINES", "Add a line first: an invoice with no lines can't be issued. Nothing was changed.");
      if (draft.totalMinor === 0) refuse("NOTHING_TO_BILL", "The total is 0.00: an invoice that asks for nothing can't be issued. Nothing was changed.");
      if (draft.totalMinor > MINOR_MAX) refuse("TOTAL_TOO_LARGE", `The total is more than one invoice can hold (${MONEY(MINOR_MAX)}). Nothing was changed.`);
      const due = new Date(`${today}T00:00:00Z`); due.setUTCDate(due.getUTCDate() + s.dueInDays);
      await tx.moneyInvoice.update({ where: { firmId_id: { firmId: firmScope(ctx.firmId).firmId, id } }, data: { issuedAt: this.clock.now(), issuedBy: `staff:${ctx.staffId}`, dueDate: new Date(`${b.dueDate ?? dayOf(due)}T00:00:00Z`) } });
      const f = await this.facts(tx, ctx.firmId, id, today), v = f.view;
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.issued", entity: "money_invoice", entityKey: id, summary: `Invoice ${v.number} issued: ${v.currency} ${MONEY(v.totalMinor)}, due ${v.dueDate}.`,
        detail: { invoiceId: id, number: v.number, totalMinor: v.totalMinor, taxMinor: v.taxMinor }, before: { status: "DRAFT", number: null, dueDate: null }, after: { status: "ISSUED", number: v.number, dueDate: v.dueDate, totalMinor: v.totalMinor, currency: v.currency } });
      await this.event(tx, ctx.firmId, MONEY_EVENT.INVOICE_ISSUED, f);
      return v;
    });
    return IssuedView.parse({ invoice: view, email: await this.emailInvoice(ctx.firmId, view) });
  }

  /** POST …/invoices/:id/send: sends the issued invoice's email (the one an empty operating details block held). */
  async send(ctx: StaffContext, invoiceId: string): Promise<IssuedView> {
    const view = (await this.facts(this.db, ctx.firmId, idOf(invoiceId), dayOf(this.clock.now()))).view;
    if (view.status !== "ISSUED") refuse("DRAFT", "Issue the invoice first: a draft is not sent.");
    if (view.statusWord === "Credited") refuse("CANCELLED", `${view.number} is cancelled: it is not sent.`);
    return IssuedView.parse({ invoice: view, email: await this.emailInvoice(ctx.firmId, view) });
  }

  /** POST …/invoices/:id/payments. Answers the payment and whether it is a replay of the same idempotency key. */
  async record(ctx: StaffContext, invoiceId: string, body: unknown): Promise<PaymentView> {
    const id = idOf(invoiceId), p = parse(PaymentIn, body), into = p.receivedInto ?? "OPERATING", now = this.clock.now(), today = dayOf(now), receivedOn = p.receivedOn ?? today;
    if (into === "TRUST" && p.method === "CARD_TERMINAL") badField("receivedInto", "A card terminal payment goes to the operating account only, never to trust. Nothing was saved.");
    if (receivedOn > today || receivedOn < "2000-01-01") badField("receivedOn", "The date received can't be in the future, or before the year 2000. Nothing was saved.");
    const firmId = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const done = await this.write(async (tx) => {
      const inv = await this.lock(tx, ctx.firmId, id);
      const had = await tx.moneyPayment.findFirst({ where: firmScope(ctx.firmId, { idempotencyKey: p.idempotencyKey }) });
      if (had) {   // a double click, or a retry: the one payment, never a second
        if (had.invoiceId !== id || had.amountMinor !== p.amountMinor || had.method !== p.method || had.receivedInto !== into) refuse("KEY_USED", "This idempotency key already recorded a different payment. Nothing was saved.");
        return { paymentId: had.id, replayed: true };
      }
      if (!inv.issued) refuse("DRAFT", "Issue the invoice first: a draft takes no payment. Nothing was saved.");
      if (p.currency && p.currency !== inv.currency) badField("currency", `This invoice is in ${inv.currency}; a payment in ${p.currency} can't be recorded on it. Nothing was saved.`);
      const before = await this.facts(tx, ctx.firmId, id, today);
      if (before.view.statusWord === "Credited") refuse("CANCELLED", `${inv.number} is cancelled: a payment can't be recorded on it. Record the money on the client instead. Nothing was saved.`);
      if (into === "TRUST") {
        const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(ctx.firmId), select: { trustAnswer: true } });
        if (s?.trustAnswer !== "YES") refuse("TRUST_OFF", "This firm doesn't hold client money in trust, so a payment can't be received into trust. Nothing was saved.");
        if (p.method === "CHEQUE" && !p.unclearedAcknowledged) refuse("UNCLEARED", "A cheque is not cleared when it is recorded, and money received into trust is applied to the invoice in the same step. Record anyway?", { acknowledge: "unclearedAcknowledged" });
      }
      if (p.reference && !p.duplicateReferenceAcknowledged) {
        const [dup] = await tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from money_payment where firm_id = ${firmId}::uuid and invoice_id = ${id}::uuid and lower(reference) = lower(${p.reference})`;
        if (dup.n > 0n) refuse("DUPLICATE_REFERENCE", `A payment with reference ${p.reference} is already recorded on this invoice. Record anyway?`, { acknowledge: "duplicateReferenceAcknowledged" });
      }
      const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select ${p.reference ?? null}::text is null or money_text_ok(${p.reference ?? null}, 200) as ok`;
      if (!text.ok) badField("reference", "The reference needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was saved.");
      let applied = Math.min(p.amountMinor, before.view.dueMinor);
      const pay = await tx.moneyPayment.create({ data: { firmId, invoiceId: id, method: p.method, amountMinor: p.amountMinor, currency: inv.currency, receivedInto: into, receivedAt: receivedOn === today ? now : new Date(`${receivedOn}T00:00:00Z`),
        reference: p.reference ?? null, idempotencyKey: p.idempotencyKey, recordedBy: by, cleared: p.method !== "CHEQUE" }, select: { id: true } });
      if (into === "TRUST") {   // the deposit, then its application to this invoice (never more than is due)
        const entry = { firmId, personId: inv.personId, companyId: inv.companyId, caseId: before.caseId, currency: inv.currency, createdBy: by };
        const held = (await tx.moneyTrustEntry.create({ data: { ...entry, kind: "DEPOSIT", amountMinor: p.amountMinor, paymentId: pay.id }, select: { balanceAfterMinor: true } })).balanceAfterMinor;
        applied = Math.max(0, Math.min(applied, held));   // a party below zero in trust (a reversal, P-634): the money is still recorded; only what the ledger holds is applied
        if (applied > 0) await tx.moneyTrustEntry.create({ data: { ...entry, kind: "WITHDRAWAL_TO_INVOICE", amountMinor: -applied, invoiceId: id } });
      }
      const receipt = await tx.moneyReceipt.create({ data: { firmId, kind: "PAYMENT", paymentId: pay.id }, select: { number: true } });
      const after = await this.facts(tx, ctx.firmId, id, today);
      await this.audit.record(tx, { firmId: ctx.firmId, actor: by, action: "payment.recorded", entity: "money_payment", entityKey: pay.id,
        summary: `Payment of ${inv.currency} ${MONEY(p.amountMinor)} recorded on ${inv.number}, receipt ${receipt.number}${p.amountMinor > applied ? `; ${inv.currency} ${MONEY(p.amountMinor - applied)} is extra` : ""}.`,
        detail: { invoiceId: id, paymentId: pay.id, receiptNumber: receipt.number, amountMinor: p.amountMinor, appliedMinor: applied, receivedInto: into, method: p.method },
        before: null, after: { amountMinor: p.amountMinor, currency: inv.currency, method: p.method, receivedInto: into, receivedOn, reference: p.reference ?? null, cleared: p.method !== "CHEQUE", receiptNumber: receipt.number, invoiceDueMinor: after.view.dueMinor } });
      await tx.moduleEvent.create({ data: { firmId, type: MONEY_EVENT.PAYMENT_SUCCEEDED, subjectId: pay.id, payload: PaymentEventPayload.parse({ paymentId: pay.id, externalId: `offline:${pay.id}`, invoiceId: id, method: p.method, amountMinor: p.amountMinor, currency: inv.currency, receivedInto: into, receiptNumber: receipt.number }) } });
      if (before.view.dueMinor > 0 && after.view.dueMinor === 0) await this.event(tx, ctx.firmId, MONEY_EVENT.INVOICE_PAID, after);
      return { paymentId: pay.id, replayed: false };
    });
    const view = await this.db.$transaction((tx) => this.paymentView(tx, ctx.firmId, done.paymentId, done.replayed, today));
    const { issuedOn: _on, balanceThen: _then, ...payment } = view.payment;
    return PaymentView.parse({ ...payment, receiptEmail: await this.emailReceipt(ctx.firmId, view.payment, view.extraNow) });
  }

  /** POST …/invoices/:id/credit-notes: part (a gross amount) or full (all that is left: a cancel), with a reason. */
  async credit(ctx: StaffContext, invoiceId: string, body: unknown): Promise<CreditNoteView> {
    const id = idOf(invoiceId), c = parse(CreditNoteIn, body), today = dayOf(this.clock.now()), firmId = firmScope(ctx.firmId).firmId;
    return this.write(async (tx) => {
      const inv = await this.lock(tx, ctx.firmId, id), cur = inv.currency;
      if (!inv.issued) refuse("DRAFT", "A draft is edited, not credited: a credit note is for an issued invoice. Nothing was saved.");
      const before = await this.facts(tx, ctx.firmId, id, today);
      if (before.view.statusWord === "Written off") refuse("WRITTEN_OFF", "Already settled by write-off. Nothing was saved.");
      if (before.openMinor <= 0) refuse("NOTHING_LEFT", `Nothing is left to credit on ${inv.number}. Nothing was saved.`);
      const amount = c.full ? before.openMinor : c.amountMinor!;
      if (amount > before.openMinor) refuse("OVER_CREDIT", `Only ${cur} ${MONEY(before.openMinor)} is left to credit on ${inv.number}. Nothing was saved.`, { leftMinor: before.openMinor });
      if (amount > before.openMinor - before.trustPaidMinor) refuse("TRUST_PAID", `${cur} ${MONEY(before.trustPaidMinor)} of ${inv.number} was paid from trust: return that money to trust first, then credit it. Nothing was saved.`, { trustPaidMinor: before.trustPaidMinor });
      const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${c.reason}, 200) as ok`;
      if (!text.ok) badField("reason", "The reason needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was saved.");
      const note = await tx.moneyCreditNote.create({ data: { firmId, invoiceId: id, full: c.full === true, amountMinor: amount, currency: cur, reason: c.reason, createdBy: `staff:${ctx.staffId}` }, select: { id: true, number: true } });
      const after = await this.facts(tx, ctx.firmId, id, today);
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.credit_note_issued", entity: "money_credit_note", entityKey: note.id,
        summary: `Credit note ${note.number} on ${inv.number}: ${cur} ${MONEY(amount)}${c.full ? " (the invoice is cancelled)" : ""}.`, detail: { invoiceId: id, creditNoteId: note.id, number: note.number, amountMinor: amount, full: c.full === true },
        before: { creditedMinor: before.view.creditedMinor, dueMinor: before.view.dueMinor }, after: { creditedMinor: after.view.creditedMinor, dueMinor: after.view.dueMinor, reason: c.reason } });
      if (after.view.statusWord === "Credited") await this.event(tx, ctx.firmId, MONEY_EVENT.INVOICE_VOIDED, after, note.id);
      else if (before.view.dueMinor > 0 && after.view.dueMinor === 0) await this.event(tx, ctx.firmId, MONEY_EVENT.INVOICE_PAID, after);
      return CreditNoteView.parse({ id: note.id, number: note.number, full: c.full === true, amountMinor: amount, currency: cur, reason: c.reason, invoice: after.view });
    });
  }

  /** GET …/invoices/:id/pdf, …/payments/:paymentId/receipt.pdf and …/credit-notes/:noteId/pdf: the stored figures, rendered. */
  async pdf(ctx: StaffContext, invoiceId: string, what: { paymentId?: string; creditNoteId?: string } = {}) {
    const id = idOf(invoiceId), today = dayOf(this.clock.now());
    const doc = await this.db.$transaction(async (tx) => {
      const f = await this.facts(tx, ctx.firmId, id, today);
      if (f.view.status !== "ISSUED") return refuse("DRAFT", "Issue the invoice first: a draft has no document.");
      if (what.paymentId !== undefined) {
        const pv = UUID.test(what.paymentId) ? await this.paymentView(tx, ctx.firmId, what.paymentId.toLowerCase(), false, today) : notFound("payment");
        if (pv.payment.invoiceId !== id) notFound("payment");
        return { key: "money.receipt" as const, name: pv.payment.receiptNumber, data: await this.receiptOf(tx, ctx.firmId, pv.payment, pv.extraNow) };
      }
      if (what.creditNoteId !== undefined) {
        const n = UUID.test(what.creditNoteId) ? await tx.moneyCreditNote.findFirst({ where: firmScope(ctx.firmId, { id: what.creditNoteId.toLowerCase(), invoiceId: id }) }) : null;
        if (!n) return notFound("credit note");
        return { key: "money.credit_note" as const, name: n.number!, data: creditNoteData(f.view, { number: n.number!, issuedOn: dayOf(n.createdAt), amountMinor: n.amountMinor, reason: n.reason }, await this.letterhead(tx, ctx.firmId, f.view)) };
      }
      return { key: "money.invoice" as const, name: f.view.number!, data: await this.invoiceOf(tx, ctx.firmId, f) };
    });
    return { filename: `${doc.name}.pdf`, ...(await this.docs.render(doc.key, doc.data)) };
  }

  // ------------------------------------------------------------------------------------------------- helpers
  /** One writing transaction; a rule the database itself refused (its own words name the rule) is a 409, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as { code?: string }).code === "P2002") refuse("KEY_USED", "This idempotency key is already in use for another payment. Nothing was saved.");   // the same key at the same moment on another invoice
      const said = /money_[a-z_]+: ([^\n]{1,300})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].replace(/\s*\(.*$/, "")}. Nothing was saved.`) : Promise.reject(e);
    }
  }
  /** The party's trust lock first, then the invoice row, held to the end of the transaction (FO-7lk's one order). */
  private async lock(tx: Tx, firm: string, id: string): Promise<Locked> {
    const firmId = firmScope(firm).firmId;
    const [p] = await tx.$queryRaw<{ party: string; currency: string }[]>`select coalesce(person_id, company_id)::text as party, currency::text as currency from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid`;
    if (!p) return notFound("invoice");
    await tx.$executeRaw`select money_trust_lock(${firmId}::uuid, ${p.party}::uuid, ${p.currency}::"MoneyCurrency")`;
    const [inv] = await tx.$queryRaw<Locked[]>`select issued_at is not null as issued, number, currency::text as currency, person_id::text as "personId", company_id::text as "companyId" from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
    return inv ?? notFound("invoice");
  }
  private async facts(tx: Reader, firmId: string, id: string, today: string): Promise<Facts> { return (await invoiceFacts(tx as Tx, firmId, id, today)) ?? notFound("invoice"); }
  /** An invoice event, written last: ids and the stored figures (the tax and total are the stored lines' sums, R9). */
  private async event(tx: Tx, firm: string, type: string, f: Facts, creditNoteId?: string) {
    const v = f.view;
    await tx.moduleEvent.create({ data: { firmId: firmScope(firm).firmId, type, subjectId: v.id, payload: InvoiceEventPayload.parse({ invoiceId: v.id, number: v.number, personId: v.personId, companyId: v.companyId, caseId: f.caseId, currency: v.currency,
      subtotalMinor: v.subtotalMinor, taxMinor: v.taxMinor, totalMinor: v.totalMinor, dueDate: v.dueDate, ...(creditNoteId ? { creditNoteId } : {}) }) } });
  }
  /** A payment read back from its stored rows. What of it settled the invoice: money into operating settles in the order
   *  it was recorded; money into trust settles by the application written with its deposit (the next ledger entry). The
   *  trust balance shown is the party's newest ledger entry's, never one row of a paired move (Lead 91's read of #2204). */
  private async paymentView(tx: Tx, firm: string, paymentId: string, replayed: boolean, today: string) {
    const firmId = firmScope(firm).firmId, p = await tx.moneyPayment.findFirst({ where: firmScope(firm, { id: paymentId }), include: { receipt: true, trustEntry: true } });
    if (!p?.invoiceId || !p.receipt) return notFound("payment");
    const f = await this.facts(tx, firm, p.invoiceId, today);
    // The receipt's figures are as of its own moment and never change after (AG-6-63 rule 8): what was left to pay then
    // (credit notes, the write-off and trust applications written up to the receipt; operating payments recorded before
    // it: receipt numbers are taken one at a time under the invoice's lock, so their order is the order of recording).
    const mine = Number(/\d+$/.exec(p.receipt.number!)![0]);
    const [then] = await tx.$queryRaw<{ open: string; trust: string; earlier: string }[]>`select
      (money_invoice_total(r.firm_id, ${p.invoiceId}::uuid) - (select coalesce(sum(c.amount_minor), 0) from money_credit_note c where c.firm_id = r.firm_id and c.invoice_id = ${p.invoiceId}::uuid and c.created_at <= r.issued_at)
        - (select coalesce(sum(w.amount_minor), 0) from money_write_off w where w.firm_id = r.firm_id and w.invoice_id = ${p.invoiceId}::uuid and w.created_at <= r.issued_at))::text as open,
      ((select coalesce(-sum(e.amount_minor), 0) from money_trust_entry e where e.firm_id = r.firm_id and e.invoice_id = ${p.invoiceId}::uuid and e.kind = 'WITHDRAWAL_TO_INVOICE' and e.created_at <= r.issued_at)
        - (select coalesce(sum(c.amount_minor), 0) from money_trust_entry c join money_trust_entry w on w.firm_id = c.firm_id and w.id = c.corrects_entry_id where c.firm_id = r.firm_id and c.kind = 'CORRECTION' and w.invoice_id = ${p.invoiceId}::uuid and c.created_at <= r.issued_at))::text as trust,
      (select coalesce(sum(q.amount_minor - (select coalesce(sum(x.amount_minor), 0) from money_refund x where x.firm_id = q.firm_id and x.payment_id = q.id and x.created_at <= r.issued_at)), 0)
         from money_payment q left join money_receipt qr on qr.firm_id = q.firm_id and qr.payment_id = q.id
        where q.firm_id = r.firm_id and q.invoice_id = ${p.invoiceId}::uuid and q.received_into = 'OPERATING' and q.id <> ${p.id}::uuid and coalesce(substring(qr.number from '[0-9]+$')::bigint, 0) < ${mine})::text as earlier
      from money_receipt r where r.firm_id = ${firmId}::uuid and r.id = ${p.receipt.id}::uuid`;
    const [credit] = await tx.$queryRaw<{ applied: string }[]>`select coalesce(-sum(e.amount_minor), 0)::text as applied from money_credit_entry e where e.firm_id = ${firmId}::uuid and (e.invoice_id = ${p.invoiceId}::uuid or e.reverses_entry_id in (select a.id from money_credit_entry a where a.firm_id = ${firmId}::uuid and a.invoice_id = ${p.invoiceId}::uuid and a.kind = 'APPLIED')) and e.kind in ('APPLIED', 'REVERSED') and e.created_at <= ${p.receipt.issuedAt}`;
    const left = Number(then.open) - Number(then.trust) - Number(then.earlier) - Number(credit.applied);   // before this payment, when it went to operating
    let applied: number, trust: PaymentView["trust"] = null;
    if (p.receivedInto === "TRUST" && p.trustEntry) {
      const e = p.trustEntry, party = e.personId ? { personId: e.personId } : { companyId: e.companyId };
      const next = await tx.moneyTrustEntry.findFirst({ where: firmScope(firm, { ...party, currency: e.currency, seq: e.seq + 1, kind: "WITHDRAWAL_TO_INVOICE" as const, invoiceId: p.invoiceId }) });
      const newest = await tx.moneyTrustEntry.findFirst({ where: firmScope(firm, { ...party, currency: e.currency }), orderBy: { seq: "desc" } });
      applied = next ? -next.amountMinor : 0;
      trust = { depositedMinor: e.amountMinor, appliedMinor: applied, balanceMinor: newest!.balanceAfterMinor };
    } else applied = Math.max(0, Math.min(p.amountMinor, left));
    const balanceThen = Math.max(0, left - (p.receivedInto === "OPERATING" ? p.amountMinor : 0)), extraNow = p.amountMinor - applied;
    const extra = extraNow > 0 ? { amountMinor: extraNow, choices: p.receivedInto === "OPERATING" ? ["REFUND", "KEEP_AS_CREDIT"] : [], note: applied === 0 && left <= 0 ? "Paid twice?" : null } : null;
    return { extraNow, payment: { id: p.id, invoiceId: p.invoiceId, method: p.method, amountMinor: p.amountMinor, currency: p.currency, receivedInto: p.receivedInto, receivedOn: dayOf(p.receivedAt), reference: p.reference, cleared: p.cleared,
      receiptNumber: p.receipt.number!, replayed, appliedMinor: applied, extra, trust, invoice: f.view, issuedOn: dayOf(p.receipt.issuedAt), balanceThen } };
  }
  /** Who the document is from and to: the firm's name and tax number, the bill-to's name and email (the company's primary contact's). */
  private async letterhead(tx: Reader, firm: string, v: InvoiceView): Promise<Letterhead & { email: string | null; operatingDetails: string | null }> {
    const f = await tx.platformFirm.findFirst({ where: ownFirm(firm), select: { operatingName: true, businessAddress: true } }), s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(firm), select: { taxNumber: true, taxRegistered: true, operatingDetails: true } });
    const who = v.personId
      ? await tx.foPerson.findFirst({ where: firmScope(firm, { id: v.personId }), select: { givenNames: true, familyName: true, email: true } }).then((x) => ({ name: [x?.givenNames, x?.familyName].filter(Boolean).join(" "), email: x?.email ?? null }))
      : { name: (await tx.foCompany.findFirst({ where: firmScope(firm, { id: v.companyId! }), select: { operatingName: true } }))?.operatingName ?? "",
          email: (await tx.foCompanyContact.findFirst({ where: firmScope(firm, { companyId: v.companyId!, role: "PRIMARY" as const, validTo: null }), select: { person: { select: { email: true } } } }))?.person.email ?? null };
    return { firmName: f?.operatingName ?? "", firmAddress: addressOf(f?.businessAddress), taxNumber: s?.taxRegistered ? s.taxNumber : null, billTo: who.name || "Client", email: who.email, operatingDetails: s?.operatingDetails?.trim() || null };
  }
  private async invoiceOf(tx: Reader, firm: string, f: Facts): Promise<RenderData> { return invoiceData(f.view, { ...(await this.letterhead(tx, firm, f.view)), issuedOn: f.issuedOn ?? "" }); }
  private async receiptOf(tx: Reader, firm: string, p: Awaited<ReturnType<InvoiceMoney["paymentView"]>>["payment"], extraMinor: number): Promise<RenderData> {
    return receiptData(p.invoice, { ...p, balanceMinor: p.balanceThen, extraMinor, keptInTrust: p.receivedInto === "TRUST" }, await this.letterhead(tx, firm, p.invoice));
  }
  /** One email to the bill-to, no Cc, with the PDF (AG-6-63 rule 5, AG-6-41). Never throws: the record is already saved. */
  private async email(firm: string, v: InvoiceView, key: MoneyTemplate, data: RenderData, subject: string, idempotencyKey: string, name: string): Promise<"SENT" | "NO_ADDRESS" | "NOT_SENT"> {
    try {
      const to = (await this.letterhead(this.db, firm, v)).email;
      if (!to) return "NO_ADDRESS";
      if (!this.mail) return "NOT_SENT";
      const doc = await this.docs.render(key, data);
      await this.mail.send({ firmId: firm, to, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: key, idempotencyKey, subject, text: documentText(key, data), attachments: [{ filename: `${name}.pdf`, contentType: doc.contentType, bytes: new Uint8Array(doc.bytes) }] });
      return "SENT";
    } catch { return "NOT_SENT"; }
  }
  private async emailInvoice(firm: string, v: InvoiceView): Promise<IssuedView["email"]> {
    const f = await this.facts(this.db, firm, v.id, dayOf(this.clock.now())), data = await this.invoiceOf(this.db, firm, f), h = await this.letterhead(this.db, firm, v);
    if (!h.operatingDetails) return "HELD";   // AG-6-71 rule 3: invoice messages wait until the operating details are filled
    return this.email(firm, v, "money.invoice", data, `Invoice ${v.number} from ${h.firmName}`, `money-invoice:${v.id}`, v.number!);
  }
  private async emailReceipt(firm: string, p: Awaited<ReturnType<InvoiceMoney["paymentView"]>>["payment"], extraMinor: number) {
    return this.email(firm, p.invoice, "money.receipt", await this.receiptOf(this.db, firm, p, extraMinor), `Receipt ${p.receiptNumber} for invoice ${p.invoice.number}`, `money-receipt:${p.id}`, p.receiptNumber);
  }
}
