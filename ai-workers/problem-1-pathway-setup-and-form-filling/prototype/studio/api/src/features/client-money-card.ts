// FO-7c part 1 (R1.57): the firm's payment account (api/src/client-money/card/) on the app's database, AuditPort's adapter
// over audit_event, the app's mail and notification ports when bound, and the card rail: Stripe with the platform's key
// and the connected-accounts signing secret (both through PF-24's Secret, revealed only to the adapter), else the fake
// with `notReady`, so a server without them connects nothing and its door answers 503 (never a fake account by mistake).
import { randomBytes } from "node:crypto";
import type { MailPort } from "../../../ports/mail.ts";
import { systemClock } from "../../../ports/clock.ts";
import type { NotificationPort } from "../../../ports/notifications.ts";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { PaymentAccounts } from "../client-money/card/account.ts";
import { fakeCardRail } from "../client-money/card/rail.ts";
import { PaymentAccountController, StripeConnectHookController } from "../client-money/card/routes.ts";
import { StripeCardRail } from "../client-money/card/stripe-rail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { platformConfig } from "../platform/config/settings.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { NOTIFICATION_PORT as NOTES } from "../platform/notifications/store.ts";

/** The narrow lookup (money_firm_of_stripe_account: the firm id only, null when unknown), made before the firm is known. */
export const firmOfAccount = (db: Db) => async (account: string) => (await db.$queryRaw<{ f: string | null }[]>`select money_firm_of_stripe_account(${account}) as f`)[0]?.f ?? null;

export default {
  controllers: [PaymentAccountController, StripeConnectHookController],
  providers: [{ provide: PaymentAccounts, useFactory: (db: Db, mail?: MailPort, notifications?: NotificationPort<never>) => {
    const { secretKey, connectWebhookSecret } = platformConfig().stripe, env = process.env;
    const live = secretKey && connectWebhookSecret ? StripeCardRail.fromKey(secretKey.reveal(), connectWebhookSecret.reveal()) : null;
    return new PaymentAccounts(db, {
      rail: live ?? fakeCardRail({ webhookSecret: randomBytes(32).toString("hex") }), audit: auditEvent, clock: systemClock, mail: mail ?? null, notifications: notifications ?? null,
      appUrl: env.STUDIO_PUBLIC_URL ?? `http://localhost:${env.STUDIO_PORT ?? 4400}`, firmOfAccount: firmOfAccount(db),
      notReady: live ? null : "Stripe's key and its connected-accounts webhook secret are not set on this server (PLATFORM_STRIPE_SECRET_KEY, PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET).",
    });
  }, inject: [Db, { token: MAIL_PORT, optional: true }, { token: NOTES, optional: true }] }],
} satisfies Feature;
