// FO-7c part 1 (R1.57): the firm's payment account (api/src/client-money/card/) on the app's database, AuditPort's adapter
// over audit_event, the app's mail and notification ports when bound, and the card rail: Stripe with the platform's key
// and the connected-accounts signing secret (both through PF-24's Secret, revealed only to the adapter), else the fake
// with `notReady`, so a server without them connects nothing and its door answers 503 (never a fake account by mistake).
// FO-7c part 2a: the pay link and the client's pay door (card/pay.ts) on the same rail; C5-scoped by PgMoneyVisibility
// as the other money routes; with no rail the door offers no card (the offline details instead, AG-6-49).
// FO-7c part 2b: card payments booked from Stripe's events (card/payments.ts) through FO-7b's InvoiceMoney.recordCard, routed
// from the connected-accounts webhook, and the hourly poll on PF-14's runner.
import { randomBytes } from "node:crypto";
import type { MailPort } from "../../../ports/mail.ts";
import { systemClock } from "../../../ports/clock.ts";
import type { NotificationPort } from "../../../ports/notifications.ts";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { PaymentAccounts } from "../client-money/card/account.ts";
import { fakeCardRail, type CardRail } from "../client-money/card/rail.ts";
import { CardPay } from "../client-money/card/pay.ts";
import { CardPayments } from "../client-money/card/payments.ts";
import { InvoiceMoney } from "../client-money/invoices/money.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { PayLinkController, PaymentAccountController, PublicPayController, StripeConnectHookController } from "../client-money/card/routes.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import { StripeCardRail } from "../client-money/card/stripe-rail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { platformConfig } from "../platform/config/settings.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { NOTIFICATION_PORT as NOTES } from "../platform/notifications/store.ts";

/** The narrow lookup (money_firm_of_stripe_account: the firm id only, null when unknown), made before the firm is known. */
export const firmOfAccount = (db: Db) => async (account: string) => (await db.$queryRaw<{ f: string | null }[]>`select money_firm_of_stripe_account(${account}) as f`)[0]?.f ?? null;

/** The server's one card rail: Stripe with both settings, else the fake with the reason it is not ready (made once). */
let made: { rail: CardRail; notReady: string | null } | null = null;
export function cardRail() {
  if (made) return made;
  const { secretKey, connectWebhookSecret } = platformConfig().stripe;
  const live = secretKey && connectWebhookSecret ? StripeCardRail.fromKey(secretKey.reveal(), connectWebhookSecret.reveal()) : null;
  return (made = { rail: live ?? fakeCardRail({ webhookSecret: randomBytes(32).toString("hex") }),
    notReady: live ? null : "Stripe's key and its connected-accounts webhook secret are not set on this server (PLATFORM_STRIPE_SECRET_KEY, PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET)." });
}
const appUrl = () => process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}`;

export default {
  controllers: [PaymentAccountController, StripeConnectHookController, PayLinkController, PublicPayController],
  providers: [{ provide: PaymentAccounts, useFactory: (db: Db, mail?: MailPort, notifications?: NotificationPort<never>) => {
    const { rail, notReady } = cardRail();
    return new PaymentAccounts(db, { rail, notReady, audit: auditEvent, clock: systemClock, mail: mail ?? null, notifications: notifications ?? null, appUrl: appUrl(), firmOfAccount: firmOfAccount(db) });
  }, inject: [Db, { token: MAIL_PORT, optional: true }, { token: NOTES, optional: true }] },
  { provide: CardPay, useFactory: (db: Db) => {
    const { rail, notReady } = cardRail(), v = new PgMoneyVisibility(db);
    return new CardPay(db, { rail, notReady, audit: auditEvent, clock: systemClock, appUrl: appUrl(), scopeOf: (ctx) => v.scopeOf(ctx) });
  }, inject: [Db] },
  { provide: CardPayments, useFactory: async (db: Db, accounts: PaymentAccounts, money: InvoiceMoney, jobs?: PlatformJobs) => {
    const p = new CardPayments(db, { rail: cardRail().rail, audit: auditEvent, clock: systemClock, recorder: money });
    accounts.routePayments(p);
    if (jobs && !cardRail().notReady) await p.register(jobs);   // no rail, no poll (nothing can be paid by card here)
    return p;
  }, inject: [Db, PaymentAccounts, InvoiceMoney, { token: PlatformJobs, optional: true }] }],
} satisfies Feature;
