// PF-18ns (concept screens/PF-18ns r2, approved by the tech lead at c9353ae76; R1.50): what the person's own notification
// routes answer (PF-18n parts 1-2: GET /api/platform/me/notifications/items, …/unread-count) and the words the bell, its
// panel and the All page show. Ids only on the wire; the words come from the kind (one map, §5), the record's name and page
// from the server's `label` and `link` (null when the person can no longer open it, challenge M2). No imports but zod, so a
// test reads it in Node.
import { z } from "zod";

export const NotificationItem = z.object({
  id: z.string(),
  kind: z.string(),
  group: z.string(),
  item: z.object({ kind: z.string(), id: z.string() }),
  label: z.string().nullable(),
  /** Only an app path is trusted as a link (break m4: never "//host" or "https://…", whatever the server sends). */
  link: z.string().nullable().transform((l) => (l !== null && /^\/(?!\/)[A-Za-z0-9/_-]{1,200}$/.test(l) ? l : null)),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type NotificationItem = z.infer<typeof NotificationItem>;
export const NotificationList = z.object({ items: z.array(NotificationItem), page: z.number(), size: z.number(), nextPage: z.number().nullable(), zone: z.string() });
export type NotificationList = z.infer<typeof NotificationList>;
export const UnreadCount = z.object({ unread: z.number().int().min(0) });

/** The panel shows the newest this many (row PF-18ns); the All page pages by PAGE_SIZE. */
export const PANEL_SIZE = 20;
export const PAGE_SIZE = 25;
/** The bell refreshes this often while the tab is visible (row: no push channel in Release 1). */
export const POLL_MS = 60_000;

const WHAT: Record<string, string> = {
  "lead-assigned": "Lead assigned to you",
  "case-stage-deadline": "A stage deadline",
  "case-milestone-deadline": "A government step is due",
  "payment-account-disconnected": "Payment account disconnected",
  "retainer-declined": "A client declined a retainer",   // FO-5d (AG-5-68 r4)
};
/** What happened, from the kind; a kind this screen does not know yet reads "Something needs you" (never a blank row). */
export const whatOf = (kind: string) => WHAT[kind] ?? "Something needs you";
/** Item kinds that never have a page (a firm-wide notice): no "can no longer be opened" line for them (challenge m4). */
const PAGELESS = new Set(["firm", "staff"]);
export const pageless = (i: NotificationItem) => PAGELESS.has(i.item.kind);

/** "21 Nov, 09:00" in the person's zone; the zone itself is named once, in the heading line (BR-7). */
export const timeWords = (iso: string, zone: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(iso));
export const zoneLine = (zone: string) => `Times in ${zone.replace(/_/g, " ")}`;
/** The badge: 1-99, then "99+"; nothing at 0. */
export const badgeOf = (n: number) => (n <= 0 ? null : n > 99 ? "99+" : String(n));
/** The bell's accessible name carries the count, so it is never colour or a number alone. */
export const bellName = (n: number | null) => (n === null ? "Notifications, count not available" : n === 0 ? "Notifications, none unread" : `Notifications, ${n} unread`);

// BR-8 (challenge M1): the count is announced once per change, never on a poll or a page change. Each page mounts its own
// frame and so its own bell, so the last count announced lives here, once per tab, not in the bell's state.
let announced: number | null = null;
/** What the live region should newly say for this count: null when nothing changed (or on the tab's first count, which
 *  the bell's own name already carries). */
export function announcementFor(n: number): string | null {
  if (announced === n) return null;
  const first = announced === null;
  announced = n;
  return first ? null : n === 0 ? "No unread notifications" : n === 1 ? "1 unread notification" : `${n} unread notifications`;
}

export const COPY = {
  title: "Notifications",
  markAll: "Mark all read",
  seeAll: "See all",
  choose: "Choose what you get",
  empty: "Nothing new. Work handed to you will show here.",
  emptyUnread: "No unread notifications.",
  loading: "Loading your notifications…",
  loadFailed: "Could not load your notifications.",
  retry: "Try again",
  markFailed: "Could not mark this read.",
  gone: "This item can no longer be opened",
  markRead: "Mark read",
  unread: "Unread",
} as const;
