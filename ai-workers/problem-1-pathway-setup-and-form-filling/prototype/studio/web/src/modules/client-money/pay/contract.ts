// FO-7s2 part 2 (concept screens/fo-7s-money/concept-pay-page.md; AG-6-14 r2-3, AG-6-17, AG-6-49 r1; P-567 (3)): what the
// client's public pay page reads and sends (FO-7c part 2a's `GET /api/public/pay/:token` and `POST …/session`), and its pure
// helpers. No imports from the app, so a test reads it in Node. The server decides the amount, the card offer and every
// refusal; the page never adds figures and has no amount field (full amount only).
import { z } from "zod";

export const PAY_PATH = "/money/pay";
/** The link's shape (FO-7c): `<firm id hex>.<43 base64url>`. Anything else is the one not-found without a call. */
export const PAY_TOKEN = /^[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/;

const Offline = z.object({ message: z.string(), details: z.string().nullable(), contact: z.string().nullable(), reference: z.string() });
export const PayAnswer = z.object({
  firm: z.object({ name: z.string() }),
  invoice: z.object({
    number: z.string(), currency: z.string(), dueDate: z.string().nullable(), statusWord: z.string(),
    lines: z.array(z.object({ description: z.string(), amountMinor: z.number().int(), taxMinor: z.number().int() })),
    totalMinor: z.number().int(), paidMinor: z.number().int(), dueMinor: z.number().int(),
  }),
  card: z.object({ offered: z.boolean() }),
  offline: Offline.nullable(),
});
export type PayAnswer = z.infer<typeof PayAnswer>;
export const Session = z.object({ url: z.string().url() });
/** A 409 from `…/session` that carries the offline block (the account went down between the read and the click). */
export const CardNotOffered = z.object({ code: z.literal("CARD_NOT_OFFERED"), offline: Offline });

export const NOT_VALID = "This payment link is no longer valid. Please contact the firm that sent it for a new one.";
export const TRY_LATER = "Too many tries just now. Please wait a minute and try again.";
export const RECEIVED = "Payment received — your receipt is on its way";
export const CONFIRMING = "Your payment is being confirmed. This page does not need to stay open.";

/** "CAD 1,385.00": one amount in its own currency (the invoice screens' formatter, copied: this page has no staff imports). */
export function money(minor: number, currency: string): string {
  const sign = minor < 0 ? "−" : "", abs = Math.abs(minor);
  return `${sign}${currency} ${Math.trunc(abs / 100).toLocaleString("en-CA")}.${String(abs % 100).padStart(2, "0")}`;
}
export function day(d: string | null): string | null {
  if (!d) return null;
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
/** The one button's words: "Pay CAD 1,385.00 by card". */
export const payWords = (a: Pick<PayAnswer["invoice"], "dueMinor" | "currency">) => `Pay ${money(a.dueMinor, a.currency)} by card`;
/** Only Stripe's hosted page (or the fake rail's, on a copy) is followed. */
export const safeCheckoutUrl = (u: string) => { try { const h = new URL(u); return h.protocol === "https:" && /(^|\.)(stripe\.com|fake-rail\.example)$/.test(h.hostname); } catch { return false; } };
/** The refusal's words by status: one not-found for unknown, replaced and settled links (FO-7c). */
export function problemWords(status: number, detail: string | undefined): string {
  if (status === 404) return NOT_VALID;
  if (status === 429) return TRY_LATER;
  if (status === 409 && detail && detail.length < 300) return detail;
  return "This page could not be loaded. Please try again.";
}
