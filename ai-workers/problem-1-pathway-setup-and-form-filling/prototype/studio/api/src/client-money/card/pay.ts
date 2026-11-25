// FO-7c part 2a (R1.57; brief design/briefs/FO-7c.md part 2, as shaped in product/screens/FO-7c/shape-r1.57.md and
// approved by Lead 4 on #3633; AG-6-14 rules 2-3, 10; AG-6-49 rule 1(a)-(b); AG-16-17; P-567 (3)): the no-login pay link.
//   * makeLink (staff, `agent/payment:online`): an issued invoice of the caller's C5 scope with something still due, never
//     a draft, a credited, written-off or refunded one; a trust request is not an invoice (its id is the one 404). The
//     token is firm-first (`<firm id hex>.<43 base64url>`, the signing door's shape), so the public door reads the firm
//     from it and runs as that firm under PF-12's walls with no bypass and no new lookup; only its SHA-256 is stored, in
//     FO-7ts's `pay_link_token_hash`. A new link replaces the old one (the old one stops working). One audit line.
//   * read (GET /api/public/pay/:token): creates nothing (link previews and scanners fetch it). The invoice summary and the
//     full amount due; the card is offered only while the firm's account is ACTIVE with charges enabled and the firm is
//     not locked; otherwise the operating details block, or the firm's contact line when the block is empty (AG-6-49).
//   * session (POST …/session): a hosted payment on the firm's own account (a direct charge) for exactly the amount due,
//     in the invoice's currency, with `firm_id` and `invoice_id` metadata and an idempotency key from the invoice, the
//     amount due and the count of payments so far (the same session while nothing changed). Money never falls back to
//     another account (AG-16-17): no card account, no card.
//   * An unknown, malformed, replaced or settled link is the one not-found (LINK_NOT_WORKING), so a link tells a guesser nothing.
// No "deposit invoice" exists on main (an advance is a trust request, never an invoice; FO-7b has no deposit predicate):
// said in the PR. PF-27's firmAllows is not on main: `payAllowed` stands in for it (Lead 4 on #3633, (1)).
// Legal reading of card-into-operating: Unconfirmed: no counsel.
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import type { InvoiceView } from "../../../../ports/client-money.ts";
import { staffActor } from "../../../../ports/staff.ts";
import { firmScope, withFirm } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { logPort } from "../../platform/observability/log.ts";
import { MONEY, UUID, notFound } from "../invoices/drafts.ts";
import { dayOf, invoiceFacts } from "../invoices/facts.ts";
import { invoiceInScope, type ScopeOf } from "../reads/visibility.ts";
import { RailAccountGone, RailRefused, type CardRail } from "./rail.ts";

type Tx = Prisma.TransactionClient;
export const PAY_TOKEN = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/;
export const PAY_PATH = "/money/pay";   // the client's page (FO-7s2 part 2); Sample path until that part confirms it
export const LINK_NOT_WORKING = "This payment link does not work. It may have been replaced by a newer one, or the invoice is already settled. Please contact the firm that sent it.";
/** PF-27's neutral refusal (SA-2-35): it never says why. */
export const NOT_AVAILABLE = "Online payment is not available for this firm right now. Nothing was charged.";
export const CARD_DOWN = "Online payment is temporarily unavailable.";
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const notWork = (): never => problem(404, "Not found", LINK_NOT_WORKING, { code: "LINK_NOT_WORKING" });
const refuse = (code: string, detail: string): never => problem(409, "Not possible now", detail, { code });

export type PayPorts = { rail: CardRail; audit: AuditPort<Tx>; clock: ClockPort; appUrl: string; scopeOf: ScopeOf; notReady?: string | null };

/** PF-27 stands in here until `firmAllows(firmId, 'pay')` is on main: a firm under a security lock takes no card payment. */
export async function payAllowed(db: Tx | PrismaClient, firmId: string): Promise<boolean> {
  const f = await db.platformFirm.findFirst({ where: { id: firmId }, select: { status: true } });
  return !!f && f.status !== "SECURITY_LOCK";
}

/** Why an invoice takes no pay link now (null: it does). Full amount only (AG-6-14 rule 2): something must be due. */
export function notPayable(v: InvoiceView): { code: string; detail: string } | null {
  if (v.status !== "ISSUED") return { code: "DRAFT", detail: "Issue the invoice first: a draft has no pay link. Nothing was changed." };
  if (v.statusWord === "Credited" || v.statusWord === "Written off" || v.statusWord === "Refunded") return { code: "SETTLED", detail: `${v.number} is ${v.statusWord.toLowerCase()}: it takes no payment. Nothing was changed.` };
  if (v.dueMinor <= 0) return { code: "NOTHING_DUE", detail: `Nothing is left to pay on ${v.number}. Nothing was changed.` };
  return null;
}

type Firm = { name: string; phone: string | null; email: string };
export type PayAnswer = {
  firm: { name: string };
  invoice: { number: string; currency: "CAD" | "USD"; dueDate: string | null; statusWord: string; lines: { description: string; amountMinor: number; taxMinor: number }[]; totalMinor: number; paidMinor: number; dueMinor: number };
  card: { offered: boolean };
  /** When the card is not offered: the firm's offline details (AG-6-49 r1(a)), else its contact line (r1(b)). */
  offline: { message: string; details: string | null; contact: string | null; reference: string } | null;
};

export class CardPay {
  private saidNotReady = false;
  constructor(private readonly db: PrismaClient, private readonly p: PayPorts) {}

  /** POST /api/front-office/money/invoices/:id/pay-link. */
  async makeLink(ctx: StaffContext, invoiceId: string) {
    const id = UUID.test(invoiceId) ? invoiceId.toLowerCase() : notFound("invoice"), firmId = firmScope(ctx.firmId).firmId;
    const scope = await this.p.scopeOf(ctx);   // read before the transaction, as InvoiceMoney (a write never holds two connections)
    const token = `${firmId.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`;
    const v = await this.db.$transaction(async (tx) => {
      await invoiceInScope(tx, firmId, id, scope);   // C5 first: out of scope, another firm's or a trust request's id is the one 404
      await tx.$queryRaw`select 1 from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
      if (!(await payAllowed(tx, firmId))) refuse("NOT_AVAILABLE", NOT_AVAILABLE);
      const f = await invoiceFacts(tx, firmId, id, dayOf(this.p.clock.now()));
      if (!f) return notFound("invoice");
      const why = notPayable(f.view); if (why) refuse(why.code, why.detail);
      const had = (await tx.moneyInvoice.findFirst({ where: firmScope(firmId, { id }), select: { payLinkTokenHash: true } }))?.payLinkTokenHash ?? null;
      await tx.moneyInvoice.updateMany({ where: firmScope(firmId, { id }), data: { payLinkTokenHash: sha(token) } });
      await this.p.audit.record(tx, { firmId, actor: staffActor(ctx), action: "invoice.pay_link_made", entity: "money_invoice", entityKey: id,
        summary: `Pay link made for ${f.view.number}: ${f.view.currency} ${MONEY(f.view.dueMinor)} due${had ? "; the earlier link stops working" : ""}.`,
        detail: { invoiceId: id, number: f.view.number, dueMinor: f.view.dueMinor, replaced: had !== null }, before: { payLink: had ? "set" : "none" }, after: { payLink: "set" } });
      return f.view;
    }, { timeout: 30_000 });
    return { invoiceId: id, number: v.number, currency: v.currency, amountDueMinor: v.dueMinor, url: `${this.p.appUrl}${PAY_PATH}/${token}` };
  }

  /** The link's invoice, as its firm (else the one 404). */
  private open<T>(token: unknown, fn: (tx: PrismaClient, firmId: string, view: InvoiceView, firm: Firm) => Promise<T>): Promise<T> {
    const m = typeof token === "string" ? PAY_TOKEN.exec(token) : null;
    if (!m) return notWork();
    const firmId = m.slice(1, 6).join("-");
    return withFirm(firmId, async () => {
      const inv = await this.db.moneyInvoice.findFirst({ where: { firmId, payLinkTokenHash: sha(token as string) }, select: { id: true } });
      if (!inv) return notWork();
      const f = await invoiceFacts(this.db as unknown as Tx, firmId, inv.id, dayOf(this.p.clock.now()));
      if (!f || notPayable(f.view)) return notWork();   // paid in full, credited, written off: the link stops working
      const row = await this.db.platformFirm.findFirst({ where: { id: firmId }, select: { operatingName: true, businessAddress: true, billingEmail: true, contactEmail: true } });
      const a = row?.businessAddress as { phone?: unknown } | null, phone = typeof a?.phone === "string" && a.phone.trim() ? a.phone.trim() : null;
      return fn(this.db, firmId, f.view, { name: row?.operatingName ?? "your firm", phone, email: row?.billingEmail ?? row?.contactEmail ?? "" });
    });
  }

  /** Whether the card is offered now, and the account to charge: ACTIVE with charges on, the firm not locked, and a rail. */
  private async cardAccount(db: PrismaClient, firmId: string): Promise<string | null> {
    if (this.p.notReady || !(await payAllowed(db, firmId))) return null;
    const a = await db.moneyPaymentAccount.findFirst({ where: firmScope(firmId), select: { status: true, chargesEnabled: true, stripeAccountId: true } });
    return a && a.status === "ACTIVE" && a.chargesEnabled && a.stripeAccountId ? a.stripeAccountId : null;
  }

  private async offline(db: PrismaClient, firmId: string, v: InvoiceView, firm: Firm): Promise<NonNullable<PayAnswer["offline"]>> {
    const s = await db.moneyPaymentSettings.findFirst({ where: firmScope(firmId), select: { operatingDetails: true } }), details = s?.operatingDetails?.trim() || null;
    const message = (await payAllowed(db, firmId)) ? CARD_DOWN : NOT_AVAILABLE.replace(" Nothing was charged.", "");
    const reach = [firm.phone, firm.email].filter(Boolean).join(", ");
    return { message, details, contact: details ? null : `Please contact ${firm.name}${reach ? `, ${reach}` : ""} to arrange payment.`, reference: v.number ?? "" };
  }

  private answer(v: InvoiceView, firm: Firm, offered: boolean, offline: PayAnswer["offline"]): PayAnswer {
    return { firm: { name: firm.name }, card: { offered }, offline,
      invoice: { number: v.number ?? "", currency: v.currency, dueDate: v.dueDate, statusWord: v.statusWord, lines: v.lines.map((l) => ({ description: l.description, amountMinor: l.amountMinor, taxMinor: l.taxMinor })), totalMinor: v.totalMinor, paidMinor: v.paidMinor, dueMinor: v.dueMinor } };
  }

  /** GET /api/public/pay/:token: creates nothing. */
  read(token: unknown): Promise<PayAnswer> {
    return this.open(token, async (db, firmId, v, firm) => {
      const account = await this.cardAccount(db, firmId);
      return this.answer(v, firm, account !== null, account ? null : await this.offline(db, firmId, v, firm));
    });
  }

  /** POST /api/public/pay/:token/session: the hosted payment for the full amount due, on the firm's own account. */
  session(token: unknown): Promise<{ url: string }> {
    return this.open(token, async (db, firmId, v, firm) => {
      if (this.p.notReady && !this.saidNotReady) { this.saidNotReady = true; logPort.warn("card_pay_not_set_up", { why: this.p.notReady }); }
      if (!(await payAllowed(db, firmId))) refuse("NOT_AVAILABLE", NOT_AVAILABLE);
      const account = await this.cardAccount(db, firmId);
      if (!account) return problem(409, "Not possible now", CARD_DOWN, { code: "CARD_NOT_OFFERED", offline: await this.offline(db, firmId, v, firm) });
      const payments = await db.moneyPayment.count({ where: firmScope(firmId, { invoiceId: v.id }) });
      const back = `${this.p.appUrl}${PAY_PATH}/${token as string}`;
      try {
        const s = await this.p.rail.createHostedPayment({ account, amountMinor: v.dueMinor, currency: v.currency, description: `Invoice ${v.number} from ${firm.name}`.slice(0, 200),
          metadata: { firm_id: firmId, invoice_id: v.id }, successUrl: `${back}/done`, cancelUrl: back, idempotencyKey: `fo7c-pay-${v.id}-${v.dueMinor}-${payments}` });
        return { url: s.url };
      } catch (e) {
        if (!(e instanceof RailRefused || e instanceof RailAccountGone)) throw e;   // refused, or the account is no longer ours to charge
        logPort.info("card_pay_refused_by_rail", { invoiceId: v.id });
        return problem(409, "Not possible now", CARD_DOWN, { code: "CARD_NOT_OFFERED", offline: await this.offline(db, firmId, v, firm) });
      }
    });
  }
}
