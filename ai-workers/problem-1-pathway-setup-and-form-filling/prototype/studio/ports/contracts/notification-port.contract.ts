// PF-0c / PF-18np: NotificationPort's contract (ports/notifications.ts). Run by fakeNotifications and, from PF-18n, by the
// real adapter. One record per person, item and kind (AG-7-39 rule 2; AG16-60), marked unread again by a later notify (PF-18n
// part 1); an unknown kind or
// item kind, a non-uuid id or a field beyond the ids (AG-7-39 rule 10) is refused with nothing recorded.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { NOTIFICATION_KIND, type NotificationItem, type NotificationPort, type NotificationRecord } from "../notifications.ts";
/** What a notification adapter's test hands the contract. */
export type NotificationHarness = {
  notifications: NotificationPort<unknown>;
  /** Runs `fn` in a transaction that commits. */
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /** The adapter's records for one person, oldest first. */
  sent(staffId: string): Promise<NotificationRecord[]> | NotificationRecord[];
  markRead(staffId: string, item: NotificationItem): Promise<void> | void;
};
const uuid = () => globalThis.crypto.randomUUID();
const K = NOTIFICATION_KIND.PORT_SELF_TEST, K2 = NOTIFICATION_KIND.CASE_STAGE_DEADLINE;
export const notificationPortContract = defineContract("NotificationPort", (make: () => Promise<NotificationHarness> | NotificationHarness) => [
  {
    name: "PF-18np DW1: two notifies for one person, item and kind give one record (time replaced); another kind is its own record; after markRead a later notify marks the same record unread (PF-18n part 1)",
    async run() {
      const h = await make(), staffId = uuid(), item: NotificationItem = { kind: "case", id: uuid() };
      await h.tx((t) => h.notifications.notify(t, { staffId }, K, item)); const first = (await h.sent(staffId))[0];
      await h.tx((t) => h.notifications.notify(t, { staffId }, K, item)); const one = await h.sent(staffId);
      expect(one.length === 1 && one[0].kind === K && one[0].item.id === item.id && one[0].at.getTime() >= first.at.getTime() && !one[0].read, "one record, its time replaced (never older)", one);
      await h.tx((t) => h.notifications.notify(t, { staffId: uuid() }, K, item)); expect((await h.sent(staffId)).length === 1, "another person's notify is their own record");
      await h.markRead(staffId, item); const read = await h.sent(staffId);
      expect(read.length === 1 && read[0].read, "markRead marks it read", read);
      await h.tx((t) => h.notifications.notify(t, { staffId }, K, item)); const again = await h.sent(staffId);
      expect(again.length === 1 && !again[0].read && again[0].at.getTime() >= read[0].at.getTime(), "after reading, a later notify marks the same record unread with a time never older (no second record)", again);
      await h.tx((t) => h.notifications.notify(t, { staffId }, K2, item)); const kinds = await h.sent(staffId);
      expect(kinds.length === 2 && kinds.filter((r) => r.item.id === item.id).map((r) => r.kind).sort().join() === [K, K2].sort().join(), "another kind for the same item is its own record", kinds);
    },
  },
  {
    name: "PF-18np DW2: an unknown kind, an unknown item kind, a non-uuid id and a free-text field are each refused, nothing recorded",
    async run() {
      const h = await make(), staffId = uuid(), item = { kind: "case", id: uuid() } as const, n = h.notifications;
      const bad: [string, () => Promise<void>][] = [
        ["unknown kind", () => h.tx((t) => n.notify(t, { staffId }, "no-such-kind" as never, item))],
        ["unknown item kind", () => h.tx((t) => n.notify(t, { staffId }, K, { kind: "invoice-x" as never, id: uuid() }))],
        ["non-uuid staff id", () => h.tx((t) => n.notify(t, { staffId: "staff-1" }, K, item))],
        ["non-uuid item id", () => h.tx((t) => n.notify(t, { staffId }, K, { kind: "case", id: "C-2026-00012" }))],
        ["a name beside the ids", () => h.tx((t) => n.notify(t, { staffId, name: "Client I" } as never, K, item))],
      ];
      for (const [what, f] of bad) await expectRefused(f, what, (e) => e instanceof Error && e.name === "ZodError");
      expect((await h.sent(staffId)).length === 0, "nothing recorded", await h.sent(staffId));
    },
  },
]);
