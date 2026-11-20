// PF-18h (concept screens/pf-18h-home r3; R1.74, QA-471 part 2): what GET /api/platform/me/needs-you answers, and the
// words. An item is one of my unread MY_DEADLINES notifications (PF-18n part 1's rows: one per deadline, a later reminder
// brings it back). Ids only on the wire; the words come from the kind (BR-1), the case number from the link's case (Q1 (a)).
// No imports but zod, so a test reads it in Node.
import { z } from "zod";

export const NEEDS_YOU_KINDS = ["case-stage-deadline", "case-milestone-deadline"] as const;
export const NeedsYouItem = z.object({
  id: z.string(),
  /** One of NEEDS_YOU_KINDS today; read loosely, so a deadline kind added to MY_DEADLINES later never blanks the list (break m1). */
  kind: z.string(),
  /** The case's number (C-2026-00042); null when the case is gone or not this firm's (BR-6). */
  caseNumber: z.string().nullable(),
  /** The page it opens (`/cases/<id>`); null with the case number. */
  link: z.string().nullable(),
  createdAt: z.string(),
});
export type NeedsYouItem = z.infer<typeof NeedsYouItem>;
export const NeedsYou = z.object({ items: z.array(NeedsYouItem), total: z.number().int().min(0), zone: z.string() });
export type NeedsYou = z.infer<typeof NeedsYou>;

/** At most this many show (BR-5); the server sends no more. */
export const SHOWN = 20;

const WHAT: Record<(typeof NEEDS_YOU_KINDS)[number], string> = { "case-stage-deadline": "A stage deadline", "case-milestone-deadline": "A government step" };
/** What is due, from the kind; a kind this page does not know yet reads "A deadline" (break m1). */
export const whatOf = (kind: string) => WHAT[kind as keyof typeof WHAT] ?? "A deadline";
/** The row's words (BR-1): "A stage deadline on case C-2026-00042"; a row without its case says so (BR-6). */
export const itemWords = (i: NeedsYouItem) => `${whatOf(i.kind)} on ${i.caseNumber ? `case ${i.caseNumber}` : "a case you can no longer open"}`;
/** The count in words (BR-8): never colour alone. */
export const countWords = (n: number) => (n === 1 ? "1 item needs you" : `${n} items need you`);
/** "21 Nov 2026, 09:00" in the person's zone (BR-7). */
export const cameIn = (iso: string, zone: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(iso));
export const zoneName = (zone: string) => zone.replace(/_/g, " ");

export const COPY = {
  empty: "Nothing needs you right now.",
  emptyHint: "Deadline reminders on your cases show here when in-app reminders are on in your notification settings.",
  loading: "Loading what needs you…",
  loadFailed: "Could not load what needs you.",
  hide: "Hide until next reminder",
  hideFailed: "We could not hide this reminder.",
  openFailed: "We could not open this reminder.",
  cameBack: "A newer reminder came in for this deadline, so it stays on your list.",
  openAnyway: "Open the case anyway",
  more: (shown: number, total: number) => `Showing the newest ${shown} of ${total}. The rest are in your notifications.`,
} as const;
