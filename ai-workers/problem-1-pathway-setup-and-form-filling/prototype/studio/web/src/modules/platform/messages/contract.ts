// PF-19b part 3 (R1.48): the shape the messages panel reads from GET /api/platform/messages (api/src/platform/messages/
// staff-routes.ts), parsed at the edge so a changed answer fails loudly, and the words for each stored code.
import { z } from "zod";

export const Message = z.object({
  id: z.string(), purpose: z.string().nullable(), class: z.string(), channel: z.string(), address: z.string(),
  state: z.string(), stateReason: z.string().nullable(), fromName: z.string().nullable(), createdAt: z.string(), sentAt: z.string().nullable(),
  events: z.array(z.object({ kind: z.string(), at: z.string() })),
});
export type Message = z.infer<typeof Message>;
export const MessagePage = z.object({ messages: z.array(Message), nextCursor: z.string().nullable() });

/** The state as a word, with a quiet tone (the word always carries the meaning; the colour only helps). */
export const STATE: Record<string, { word: string; tone: string }> = {
  QUEUED: { word: "Waiting to send", tone: "neutral" }, SENT: { word: "Sent", tone: "info" }, DELIVERED: { word: "Delivered", tone: "ok" },
  BOUNCED: { word: "Bounced", tone: "danger" }, FAILED: { word: "Failed", tone: "danger" }, SUPPRESSED: { word: "Not sent", tone: "warn" },
};
export const EVENT: Record<string, string> = { SENT: "Sent", DELIVERED: "Delivered", OPENED: "Opened", BOUNCED: "Bounced", COMPLAINED: "Marked as spam", FAILED: "Failed" };
/** Why a message is in its state, in words (the stored codes: the consent gate's `SUPPRESSED: <why>` and `NO_CONSENT|
 *  WITHDRAWN: <purpose>`, the worker's and the notices' plain reasons). A code not listed shows nothing (never raw). */
const SUPPRESSED_WHY: Record<string, string> = { HARD_BOUNCE: "an earlier email to this address bounced", COMPLAINT: "the person marked an email as spam", UNSUBSCRIBE: "the person unsubscribed", STOP: "the person replied STOP", STAFF: "staff stopped messages to this address" };
export function reasonWords(reason: string | null): string | null {
  if (!reason) return null;
  const [code, detail] = reason.split(": ");
  if (code === "SUPPRESSED") return SUPPRESSED_WHY[detail] ? `Not sent: ${SUPPRESSED_WHY[detail]}` : null;
  if (code === "NO_CONSENT") return detail === "MARKETING" ? "Not sent: no consent to marketing on this channel" : "Not sent: no consent on this channel";
  if (code === "WITHDRAWN") return "Not sent: the person withdrew consent";
  if (code === "ADDRESS_UNSUBSCRIBED") return "Not sent: someone at this email address unsubscribed from marketing";
  const plain: Record<string, string> = { "hard bounce": "The address does not exist or refuses email", complaint: "The person marked it as spam", "daily limit": "Waiting: the firm's daily sending limit is reached", "content changed": "Not sent: the stored message changed", "send failed": "The email provider did not take it" };
  if (plain[reason]) return plain[reason];
  if (/^send failed: try \d+ of \d+$/.test(reason)) return "Trying again: the email provider did not take it yet";
  return null;
}
export const CLASS: Record<string, string> = { TRANSACTIONAL: "Transactional", SERVICE: "Service", MARKETING: "Marketing" };
export const CHANNEL: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp" };
/** A purpose key (booking.confirmation) as words: "Booking confirmation". */
export const purposeWords = (p: string | null) => {
  if (!p) return "Message";
  const w = p.replace(/[._]+/g, " ").trim();
  return w ? w[0].toUpperCase() + w.slice(1) : "Message";
};
export const whenWords = (iso: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
