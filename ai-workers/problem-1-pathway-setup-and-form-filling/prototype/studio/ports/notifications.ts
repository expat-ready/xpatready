// PF-18np (rows rev 16.31, 16.41; brief lead-b-briefs/PF-18np.md): the shared notification port, interface and fake only.
// A caller tells one person, inside its own transaction, that one item needs them: ids only, no free text, names or
// numbers (AG-7-39 rule 10). One notification per person, item and kind (AG-7-39 rule 2; "Duplicate beats a miss", AG16-60):
// a repeat marks it unread again with the new time (PF-18n part 1, brief PF-18n1.md), never a second one.
// The call promises no delivery: the real adapter (PF-18n) checks preferences, builds the link and stores the row.
// Consumers only ADD lines to NOTIFICATION_KIND, NOTIFICATION_GROUP and NOTIFICATION_ITEM_KIND, never reorder or rename.
// This folder imports only zod and its own files.
import { z } from "zod";
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");
/** The eight groups of AG-16 §3.3 (security emails are always on and are not a group). */
export const NotificationGroup = z.enum(["WORK_HANDED_TO_ME", "NEEDS_YOU", "MY_DEADLINES", "CLIENT_MESSAGED_ME", "MENTIONS", "TEAM_WATCH", "PAYMENTS", "FIRM_AND_CONNECTIONS"]);
export type NotificationGroup = z.infer<typeof NotificationGroup>;
/** Kind names to kebab-case strings. Each consumer row adds its own line. */
export const NOTIFICATION_KIND = {
  PORT_SELF_TEST: "port-self-test",
  CASE_STAGE_DEADLINE: "case-stage-deadline", // CS-DL1 part 2: a cited stage deadline's reminder (AG-7-94 r5)
  CASE_MILESTONE_DEADLINE: "case-milestone-deadline", // CS-DL3 part 1: a government step's due date, from IRCC's letter
  PAYMENT_ACCOUNT_DISCONNECTED: "payment-account-disconnected", // FO-7c part 1: the firm's payment account broke; the Owner's home item (AG-16-16)
} as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[keyof typeof NOTIFICATION_KIND];
/** Each kind's group, from AG-16 §3.3 "What is in it": a kind without a group fails the type check. */
export const NOTIFICATION_GROUP: Record<NotificationKind, NotificationGroup> = {
  [NOTIFICATION_KIND.PORT_SELF_TEST]: "NEEDS_YOU",
  [NOTIFICATION_KIND.CASE_STAGE_DEADLINE]: "MY_DEADLINES",
  [NOTIFICATION_KIND.CASE_MILESTONE_DEADLINE]: "MY_DEADLINES",
  [NOTIFICATION_KIND.PAYMENT_ACCOUNT_DISCONNECTED]: "FIRM_AND_CONNECTIONS",
};
/** What a notification points at. Consumers add their own. */
export const NOTIFICATION_ITEM_KIND = ["case", "firm", "staff", "review-round", "case-stage", "case-milestone"] as const;
export type NotificationItemKind = (typeof NOTIFICATION_ITEM_KIND)[number];
export const NotificationKindSchema = z.enum(NOTIFICATION_KIND);
export const NotificationRecipient = z.strictObject({ staffId: Uuid });
export const NotificationItem = z.strictObject({ kind: z.enum(NOTIFICATION_ITEM_KIND), id: Uuid });
export type NotificationRecipient = z.infer<typeof NotificationRecipient>;
export type NotificationItem = z.infer<typeof NotificationItem>;
/** Checks every argument before anything is written (a ZodError on an unknown kind, item kind or a non-uuid id). */
export function parseNotify(recipient: unknown, kind: unknown, item: unknown) {
  return { recipient: NotificationRecipient.parse(recipient), kind: NotificationKindSchema.parse(kind), item: NotificationItem.parse(item) };
}
export interface NotificationPort<Tx = unknown> {
  /** Inside the caller's transaction. Promises no delivery (preferences, a deactivated person: the adapter's). */
  notify(tx: Tx, recipient: NotificationRecipient, kind: NotificationKind, item: NotificationItem): Promise<void>;
}
export type NotificationRecord = { staffId: string; kind: NotificationKind; item: NotificationItem; at: Date; read: boolean };
export type FakeNotifications = NotificationPort<unknown> & {
  sent(): NotificationRecord[];
  markRead(staffId: string, item: NotificationItem): void;
};
/** In memory. A second notify for the same person, item and kind marks its record unread with the new time and adds none. */
export function fakeNotifications(opts: { now?: () => Date } = {}): FakeNotifications {
  const records: NotificationRecord[] = [], now = opts.now ?? (() => new Date());
  const of = (staffId: string, item: NotificationItem) => records.filter((r) => r.staffId === staffId && r.item.kind === item.kind && r.item.id === item.id);
  return {
    async notify(_tx, recipient, kind, item) {
      const p = parseNotify(recipient, kind, item), same = of(p.recipient.staffId, p.item).find((r) => r.kind === p.kind);
      if (same) Object.assign(same, { read: false, at: now() });
      else records.push({ staffId: p.recipient.staffId, kind: p.kind, item: p.item, at: now(), read: false });
    },
    sent: () => records.map((r) => ({ ...r, item: { ...r.item } })),
    markRead(staffId, item) { for (const r of of(staffId, item)) r.read = true; },
  };
}
