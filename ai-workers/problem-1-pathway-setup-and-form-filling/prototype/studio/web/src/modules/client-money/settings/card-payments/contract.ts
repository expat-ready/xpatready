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
  // A new account still PENDING after a disconnect keeps the alert (FO-7c, Lead B on #2938): the words stay "checking", the
  // alert line shows above them.
  if (a.status === "PENDING") return { words: "Stripe is checking your details.", step: "Continue set-up", tone: "info", broken: !!a.alert };
  return { words: "Clients can't pay by card yet.", step: "Connect with Stripe", tone: "info", broken: false };
}

/** The words for a back-link from Stripe (`?account=return|refresh`, FO-7c's return and refresh addresses). */
export function backWords(param: string | null): string | null {
  if (param === "return") return "Back from Stripe. If you finished, Stripe now checks your details; this page shows the result when Stripe tells us.";
  if (param === "refresh") return "That Stripe set-up link has expired. Use the button below to get a new one.";
  return null;
}

/** A refusal of the onboarding call, in words. Step-up is handled by "Confirm it's you" before this is reached. */
export function refusalWords(status: number, code: string | undefined, detail: string | undefined): string {
  if (code === "PAYMENT_ACCOUNT_NOT_SET_UP") return "Card payments are not set up on this server yet. Nothing was changed.";
  if (code === "PAYMENTS_NOT_SET_UP") return "Set up payments first: this firm's payment settings are not saved yet. Nothing was saved.";
  if (status === 403) return "Only the Owner manages card payments.";
  return detail && detail.length < 300 ? detail : "Could not reach Stripe now. Nothing was changed. Please try again.";
}

/** Only a Stripe address is followed (the server answers Stripe's hosted page; the fake rail answers a fake-rail address). */
export const safeStripeUrl = (u: string) => { try { const h = new URL(u); return h.protocol === "https:" && /(^|\.)(stripe\.com|fake-rail\.example)$/.test(h.hostname); } catch { return false; } };
