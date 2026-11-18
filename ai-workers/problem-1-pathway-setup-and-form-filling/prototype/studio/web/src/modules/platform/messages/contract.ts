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
export const CLASS: Record<string, string> = { TRANSACTIONAL: "Transactional", SERVICE: "Service", MARKETING: "Marketing" };
export const CHANNEL: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp" };
/** A purpose key (booking.confirmation) as words: "Booking confirmation". */
export const purposeWords = (p: string | null) => {
  if (!p) return "Message";
  const w = p.replace(/[._]+/g, " ").trim();
  return w ? w[0].toUpperCase() + w.slice(1) : "Message";
};
export const whenWords = (iso: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
