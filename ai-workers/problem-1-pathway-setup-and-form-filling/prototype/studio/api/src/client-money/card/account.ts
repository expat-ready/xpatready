// FO-7c part 1 (R1.57; AG-16-14..18, AG-6-49 rule 1(e); P-567 (3)): the firm's own payment account.
//   * onboard: Owner-only (the route's key) with step-up; the connected account is made once per firm, under a per-firm
//     lock, and each call answers a fresh hosted sign-up link. No key is typed, stored, logged or answered (AG-16-18).
//   * view: the status, the two switches and the break alert's words. Nothing of the processor's object.
//   * receive (POST /api/hooks/stripe-connect): the signature first (400, nothing stored); the firm found by the narrow
//     lookup; then, as that firm and in one transaction, the receipt stored once (webhook_receipt, service
//     `stripe-connect`), the account read from the rail (so events in any order converge on what the processor says
//     now), the status moved, one audit line, and on a break one email and one home item per Owner. A failure rolls the
//     receipt back with the rest, so the processor's retry handles the event again; a handled event is never handled twice.
// The lifecycle (AG-16-15) on FO-7a's columns: PENDING until the rail's own read says charges are enabled; ACTIVE;
// RESTRICTED with charges on (Degraded: shown, no email); RESTRICTED with charges off (Failed: a break); DISCONNECTED
// (`account.application.deauthorized`: a break). Money never falls back to another account (AG-16-17).
import { HttpException } from "@nestjs/common";
import type { MoneyAccountStatus, Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../../ports/notifications.ts";
import { staffActor } from "../../../../ports/staff.ts";
import { firmScope, withFirm } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { SYSTEM_REPLY_TO } from "../../platform/identity/session/mail.ts";
import { requireStepUp } from "../../platform/identity/session/step-up.ts";
import { mailIn, mailReady } from "../../platform/messages/send/mail.ts";
import { logPort } from "../../platform/observability/log.ts";
import { RailAccountGone, RailSignatureError, type CardRail, type RailAccount, type RailEvent } from "./rail.ts";

type Tx = Prisma.TransactionClient;
export type AccountPorts = {
  rail: CardRail; audit: AuditPort<Tx>; clock: ClockPort; appUrl: string;
  mail?: MailPort | null; notifications?: NotificationPort<Tx> | null;
  /** Why card payments cannot be set up on this server (no Stripe key), for the server log only: onboarding and the door
   *  answer a plain 503 that names no setting (Lead B on #2938). */
  notReady?: string | null;
  /** The firm that holds a connected account, or null: the one read made before the firm is known (a narrow lookup). */
  firmOfAccount: (account: string) => Promise<string | null>;
};
export const RECEIPT_SERVICE = "stripe-connect";
const ACTOR = "system:stripe-connect";
/** AG-6-49 rule 1(e): the home item's words; the email's are Sample words. */
export const BREAK_WORDS = "Payment account disconnected. Reconnect it to take card payments again; until then, clients see your offline payment details.";
const HANDLED = new Set(["account.updated", "account.application.deauthorized"]);
const problem = (status: number, code: string, title: string, detail: string) => new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code }, status);

export type AccountState = { status: MoneyAccountStatus; chargesEnabled: boolean; payoutsEnabled: boolean };
/** A break (AG-16-16 rule 1): the firm removed us (Disconnected), or charges went off on an account that had them (Failed). */
export const isBroken = (s: AccountState) => s.status === "DISCONNECTED" || (s.status === "RESTRICTED" && !s.chargesEnabled);
/** The state an account read gives (the row's mapping). A disconnected account stays so: only a new sign-up reconnects it. */
export function stateFrom(prev: AccountState, snap: Pick<RailAccount, "chargesEnabled" | "payoutsEnabled" | "requirementsDue">): AccountState {
  if (prev.status === "DISCONNECTED" || prev.status === "NOT_CONNECTED") return prev;
  if (snap.chargesEnabled) return { status: snap.requirementsDue ? "RESTRICTED" : "ACTIVE", chargesEnabled: true, payoutsEnabled: snap.payoutsEnabled };
  if (prev.status === "PENDING") return { status: "PENDING", chargesEnabled: false, payoutsEnabled: false };   // never connected yet: not a break
  return { status: "RESTRICTED", chargesEnabled: false, payoutsEnabled: snap.payoutsEnabled };
}

export class PaymentAccounts {
  private saidNotReady = false;
  constructor(private readonly db: PrismaClient, private readonly ports: AccountPorts) {}

  private ready() {
    if (!this.ports.notReady) return;
    if (!this.saidNotReady) { this.saidNotReady = true; logPort.warn("payment_account_not_set_up", { why: this.ports.notReady }); }   // once per process (round 2 n3)
    throw problem(503, "PAYMENT_ACCOUNT_NOT_SET_UP", "Card payments are not set up here", "Card payments are not set up on this server yet. Nothing was changed.");
  }
  private lock(tx: Tx, firmId: string) { return tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`money_payment_account:${firmId}`}))`; }

  /** POST /payment-account/onboarding. */
  async onboard(actor: StaffContext): Promise<{ status: MoneyAccountStatus; url: string }> {
    this.ready();
    requireStepUp(actor, this.ports.clock.now().getTime(), "connecting the payment account");
    const firmId = actor.firmId.toLowerCase();
    const out = await this.db.$transaction(async (tx) => {
      await this.lock(tx, firmId);
      if (!(await tx.moneyPaymentSettings.findFirst({ where: firmScope(firmId), select: { firmId: true } })))
        throw problem(409, "PAYMENTS_NOT_SET_UP", "Not possible now", "Set up payments first: this firm's payment settings are not saved yet. Nothing was saved.");
      const row = await tx.moneyPaymentAccount.findFirst({ where: firmScope(firmId) });
      if (row?.stripeAccountId && row.status !== "DISCONNECTED") return { account: row.stripeAccountId, status: row.status };
      // Once per firm; after a disconnect, once per account lost (the old account is no longer ours to link).
      const made = await this.ports.rail.createAccount({ firmId, idempotencyKey: `fo7c-account-${firmId}${row?.stripeAccountId ? `-after-${row.stripeAccountId}` : ""}` });
      const data = { stripeAccountId: made.id, status: "PENDING" as const, chargesEnabled: false, payoutsEnabled: false };
      if (row) await tx.moneyPaymentAccount.updateMany({ where: firmScope(firmId, { id: row.id }), data }); else await tx.moneyPaymentAccount.create({ data: { firmId, ...data } });
      await this.ports.audit.record(tx, { firmId, actor: staffActor(actor), action: "payment_account.onboarding_started", entity: "money_payment_account", entityKey: firmId,
        summary: row ? "The Owner started connecting the firm's payment account again." : "The Owner started connecting the firm's payment account.",
        detail: { afterBreak: row?.status === "DISCONNECTED" },
        before: row ? { status: row.status, stripeAccountId: row.stripeAccountId } : null, after: { status: "PENDING", stripeAccountId: made.id } });
      return { account: made.id, status: "PENDING" as MoneyAccountStatus };
    }, { timeout: 30_000 });
    const back = `${this.ports.appUrl}/money/settings/getting-paid`;   // FO-7s2 part 1's Card payments section
    const link = await this.ports.rail.accountLink({ account: out.account, refreshUrl: `${back}?account=refresh`, returnUrl: `${back}?account=return` });
    return { status: out.status, url: link.url };
  }

  /** GET /payment-account: the firm's own row only (the session's firm, under the walls). The alert shows on a break and
   *  stays until a reconnect completes (Lead B on #2938): a new account still PENDING after a disconnect keeps it, read from
   *  the re-onboarding's own audit line (no column); charges enabled on the new account clears it. */
  async view(actor: Pick<StaffContext, "firmId">) {
    const row = await this.db.moneyPaymentAccount.findFirst({ where: firmScope(actor.firmId) });
    const s: AccountState = row ? { status: row.status, chargesEnabled: row.chargesEnabled, payoutsEnabled: row.payoutsEnabled } : { status: "NOT_CONNECTED", chargesEnabled: false, payoutsEnabled: false };
    return { ...s, alert: (await this.alertOn(this.db, actor.firmId, s)) ? { code: "PAYMENT_ACCOUNT_DISCONNECTED", words: BREAK_WORDS } : null };
  }

  /** Whether the break alert shows for this state: a break, or a new account still PENDING after a disconnect (its
   *  re-onboarding's audit line says so). One rule for the status read and for "is this a new break?" (round 2 n1). */
  private async alertOn(db: Tx | PrismaClient, firmId: string, s: AccountState): Promise<boolean> {
    if (isBroken(s)) return true;
    if (s.status !== "PENDING") return false;
    const last = await db.auditEvent.findFirst({ where: firmScope(firmId, { action: "payment_account.onboarding_started", entity: "money_payment_account", entityKey: firmId.toLowerCase() }), orderBy: { at: "desc" }, select: { detail: true } });
    return (last?.detail as { afterBreak?: unknown } | null)?.afterBreak === true;
  }

  /** POST /api/hooks/stripe-connect: the raw body and its Stripe-Signature header. */
  async receive(raw: unknown, signature: string | undefined) {
    this.ready();
    const body = Buffer.isBuffer(raw) ? raw.toString("utf8") : typeof raw === "string" ? raw : null;
    if (body === null) throw problem(400, "SIGNATURE", "Not signed", "An account event needs its raw body and its Stripe-Signature header.");
    let ev: RailEvent;
    try { ev = this.ports.rail.verifyEvent(body, signature); } catch (e) {
      if (e instanceof RailSignatureError) throw problem(400, "SIGNATURE", "Not signed", "The Stripe-Signature header does not match this body.");
      if (e instanceof SyntaxError || (e as { name?: string }).name === "ZodError") throw problem(400, "NOT_AN_EVENT", "Not an event", "The body is not an account event.");
      throw e;
    }
    if (!HANDLED.has(ev.type) || !ev.account) return { received: true };
    const firmId = await this.ports.firmOfAccount(ev.account);
    if (!firmId) { logPort.info("payment_account_event_unmatched", { eventId: ev.id }); return { received: true }; }
    return withFirm(firmId, () => this.handle(firmId, ev as RailEvent & { account: string }));
  }

  private async handle(firmId: string, ev: RailEvent & { account: string }) {
    if (this.ports.mail) await mailReady(this.ports.mail, firmId);   // before the firm's lock (PF-19r)
    const after: (() => Promise<void>)[] = [];
    const out = await this.db.$transaction(async (tx) => {
      await this.lock(tx, firmId);
      const stored = await tx.webhookReceipt.createMany({ data: [{ service: RECEIPT_SERVICE, eventId: ev.id, firmId }], skipDuplicates: true });
      if (stored.count === 0) return { received: true, duplicate: true };
      const outcome = await this.apply(tx, firmId, ev, after);
      await tx.webhookReceipt.updateMany({ where: firmScope(firmId, { service: RECEIPT_SERVICE, eventId: ev.id }), data: { handledAt: this.ports.clock.now(), outcome: `${ev.type}: ${outcome}`.slice(0, 200) } });
      return { received: true };
    }, { timeout: 30_000 });
    // Breaker m1: the break emails are written in the change's own transaction (the outbox) and sent only after it commits,
    // so a change that rolls back sends nothing.
    for (const d of after) await d();
    return out;
  }

  private async apply(tx: Tx, firmId: string, ev: RailEvent & { account: string }, after: (() => Promise<void>)[]): Promise<string> {
    const row = await tx.moneyPaymentAccount.findFirst({ where: firmScope(firmId, { stripeAccountId: ev.account }) });
    if (!row) return "not this firm's account now: ignored";
    const prev: AccountState = { status: row.status, chargesEnabled: row.chargesEnabled, payoutsEnabled: row.payoutsEnabled };
    let next: AccountState;
    if (ev.type === "account.application.deauthorized") next = { status: "DISCONNECTED", chargesEnabled: false, payoutsEnabled: false };
    else {
      let snap: RailAccount;
      try { snap = await this.ports.rail.readAccount(ev.account); } catch (e) { if (e instanceof RailAccountGone) return "the account cannot be read: no change"; throw e; }
      next = stateFrom(prev, snap);
    }
    if (next.status === prev.status && next.chargesEnabled === prev.chargesEnabled && next.payoutsEnabled === prev.payoutsEnabled) return "no change";
    await tx.moneyPaymentAccount.updateMany({ where: firmScope(firmId, { id: row.id }), data: next });
    // A new break only when the alert was not already showing: a half-made account removed while the firm is still
    // disconnected is the same break (AG-16-16 rule 3: never the email again for the same break; round 2 n1).
    const broke = isBroken(next) && !(await this.alertOn(tx, firmId, prev));
    await this.ports.audit.record(tx, { firmId, actor: ACTOR, action: broke ? "payment_account.broke" : "payment_account.status_changed", entity: "money_payment_account", entityKey: firmId,
      summary: broke ? `The firm's payment account stopped taking card payments (${next.status === "DISCONNECTED" ? "disconnected" : "charges turned off"}).` : `The firm's payment account is now ${next.status}, charges ${next.chargesEnabled ? "on" : "off"}.`,
      detail: { eventId: ev.id, eventType: ev.type }, before: prev, after: next });
    if (broke) await this.tellOwners(tx, firmId, ev.id, after);
    return `${prev.status} → ${next.status}${broke ? " (break)" : ""}`;
  }

  /** AG-16-16 rules 2-4: one email and one home item per break, to the Owner only; nothing when it is fixed. The email's
   *  key is the event's id, so a retried event sends it once. */
  private async tellOwners(tx: Tx, firmId: string, eventId: string, after: (() => Promise<void>)[]) {
    const owners = await tx.platformStaff.findMany({ where: firmScope(firmId, { status: "ACTIVE" as const, grants: { some: { firmId, role: "OWNER" as const, endedAt: null } } }), select: { id: true, email: true }, orderBy: { id: "asc" } });
    for (const o of owners) {
      await this.ports.notifications?.notify(tx, { staffId: o.id }, NOTIFICATION_KIND.PAYMENT_ACCOUNT_DISCONNECTED, { kind: "firm", id: firmId });
      // An email refused by the sender never holds back the status and the home item: the pay page must stop offering the
      // card either way (AG-6-49). Logged by the event's id.
      try { if (this.ports.mail) after.push((await mailIn(this.ports.mail, tx, { firmId, to: o.email, replyTo: SYSTEM_REPLY_TO, class: "SERVICE", person: { kind: "STAFF", id: o.id }, templateKey: "client_money.payment_account_disconnected", idempotencyKey: `payment-account-break:${eventId}:${o.id}`,
        subject: "Payment account disconnected",
        text: `Your firm's payment account stopped taking card payments.\n\nUntil it is reconnected, clients cannot pay by card: they see your offline payment details instead. No payment is sent anywhere else.\n\nTo reconnect, sign in and open Money, Getting paid: ${this.ports.appUrl}/money/settings/getting-paid` })).dispatch); }
      catch (e) { logPort.error("payment_account_break_mail_failed", e, { eventId }); }
    }
  }
}
