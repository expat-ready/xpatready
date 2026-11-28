// FO-7s2 part 1 (concept screens/fo-7s-money/concept-settings.md "Card payments"; AG-16-14 to -18, AG-6-49; FO-7c part 1's
// `GET …/money/payment-account` and `POST …/payment-account/onboarding`, both key agent/payment-rail:connect, Owner only, C5):
// what the Card payments section reads and sends, and its pure helpers. No imports from the app, so a test reads it in Node.
// Codes never show: every state is said in the concept's words with one next step.
import { z } from "zod";

export const CONNECT_KEY = "agent/payment-rail:connect";
export const GETTING_PAID_HOME = "/money/settings/getting-paid";
export const ACCOUNT_PATH = "/front-office/money/payment-account";
export const ONBOARDING_PATH = `${ACCOUNT_PATH}/onboarding`;

export const Status = z.enum(["NOT_CONNECTED", "PENDING", "ACTIVE", "RESTRICTED", "DISCONNECTED"]);
export type Status = z.infer<typeof Status>;
/** FO-7c's view: the status, the two switches and the break alert. Nothing of the processor's object (AG-16-18). */
export const Account = z.object({
  status: Status, chargesEnabled: z.boolean(), payoutsEnabled: z.boolean(),
  alert: z.object({ code: z.string(), words: z.string() }).nullable(),
});
export type Account = z.infer<typeof Account>;
/** The onboarding answer: a fresh hosted sign-up link on Stripe (never stored by the page). */
export const Onboarding = z.object({ status: Status, url: z.string().url() });

export type Said = { words: string; step: string | null; tone: "info" | "ok" | "warn" | "danger"; broken: boolean };

/** The concept's table, one row per state. RESTRICTED splits on charges: with charges on clients still cannot pay by card here
 *  (FO-7c offers the card only when Active), with charges off it is the break (AG-6-49). */
export function said(a: Pick<Account, "status" | "chargesEnabled" | "alert">): Said {
  if (a.status === "DISCONNECTED" || (a.status === "RESTRICTED" && !a.chargesEnabled))
    return { words: "Payment account disconnected — Reconnect", step: "Reconnect", tone: "danger", broken: true };
  if (a.status === "RESTRICTED")
    return { words: "Stripe needs more details. Until you finish, clients see your payment details instead of a card button.", step: "Update details on Stripe", tone: "warn", broken: false };
  if (a.status === "ACTIVE") return { words: "Clients can pay invoices by card. Money goes to your own Stripe account.", step: null, tone: "ok", broken: false };
  // A new account still PENDING after a disconnect keeps the alert (FO-7c, Lead B on #2938): one alert, saying both (break m2).
  if (a.status === "PENDING" && a.alert) return { words: "Payment account disconnected. Stripe is checking the details of your new account; until it finishes, clients see your payment details instead of a card button.", step: "Continue set-up", tone: "danger", broken: true };
  if (a.status === "PENDING") return { words: "Stripe is checking your details.", step: "Continue set-up", tone: "info", broken: false };
  return { words: "Clients can't pay by card yet.", step: "Connect with Stripe", tone: "info", broken: false };
}

/** The words for a back-link from Stripe (`?account=return|refresh`, FO-7c's return and refresh addresses), read once when the
 *  page opens (the page then drops the query, so a reload never brings it back: break m1, review m3). "Use the button below"
 *  only while a step is offered; "checking" only while the account is still being checked. */
export function backWords(param: string | null, s: Pick<Said, "step"> & { status: Status }): string | null {
  if (param === "refresh" && s.step) return "That Stripe set-up link has expired. Use the button below to get a new one.";
  if (param === "return" && s.status === "PENDING") return "Back from Stripe. Stripe now checks your details; reload this page in a few minutes to see the result.";
  return null;
}

/** A refusal of the onboarding call, in words. Step-up is handled by "Confirm it's you" before this is reached. */
export function refusalWords(status: number, code: string | undefined): string {
  if (code === "PAYMENT_ACCOUNT_NOT_SET_UP") return "Card payments are not set up on this server yet. Nothing was changed.";
  if (code === "PAYMENTS_NOT_SET_UP") return "Set up payments first: this firm's payment settings are not saved yet. Nothing was saved.";
  if (status === 403) return "Only the Owner manages card payments.";
  if (status === 429) return "Too many tries just now. Nothing was changed. Please wait a minute and try again.";
  return "Could not reach Stripe now. Nothing was changed. Please try again.";   // never the server's raw text (break m3)
}

/** Only Stripe's hosted set-up page is followed: https, the default port, `connect.stripe.com`; on a copy the fake rail's
 *  `connect.fake-rail.example` (a name under the reserved .example domain, never resolvable). */
export const safeStripeUrl = (u: string) => { try { const h = new URL(u); return h.protocol === "https:" && h.port === "" && !h.username && (h.hostname === "connect.stripe.com" || h.hostname === "connect.fake-rail.example"); } catch { return false; } };
/** The read failed: fixed words, never the server's title (review m4); an unknown state is the same (break m4). */
export const READ_FAILED = "Card payments could not be read just now. Nothing has changed. Try again in a minute.";
