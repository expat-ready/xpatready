// PF-18a part 2 (AG-16-10; AG-16 §3.3; case-side contract v0.1 §1 rule 3): each person's notification switches. A sender
// (PF-18n's NotificationPort adapter, booking, the case side) asks `allows(firmId, staffId, group, channel)` before it tells
// a person anything. The store is platform_notification_preference (platform-offices.prisma), written only by
// api/src/platform/settings/notifications/ (its PrismaNotificationPrefs is the real adapter). The rules callers rely on:
//   * the eight groups are PF-18np's NotificationGroup (ports/notifications.ts), never a second list;
//   * a group that cannot reach the person (its "who sees it" rule, §3.3) → false on both channels: they see nothing of it;
//   * a group the person never switched → its §3.3 default (data: samples/notification-groups.json, read by the platform);
//   * one switch never moves the other: email off leaves in-app as it was;
//   * a security email (new sign-in, password change) → true on EMAIL whatever any switch (§3.3: always on, no switch); SECURITY on IN_APP
//     is not defined by §3.3 → false (break m3);
//   * the answer is the group's switch only: within Payments (group 7) the items §3.3 marks in-app only (payment received, invoice sent,
//     refund, dunning escalation) never send an email whatever `allows(…, "PAYMENTS", "EMAIL")` says. That item rule is the sender's (PF-18n;
//     samples/notification-groups.json `emailNeverItems`);
//   * a person who is not this firm's active staff member → false (nothing is sent to someone outside the firm).
// This folder imports only zod and its own files.
import { z } from "zod";
import { NotificationGroup } from "./notifications.ts";
export { NotificationGroup };
export const NotificationChannel = z.enum(["IN_APP", "EMAIL"]);
export type NotificationChannel = z.infer<typeof NotificationChannel>;
/** Not a group: security emails are always on (AG-16 §3.3). `allows(…, SECURITY, "EMAIL")` is always true for a firm's active person; on IN_APP false. */
export const SECURITY = "SECURITY" as const;
export type PrefGroup = NotificationGroup | typeof SECURITY;
/** Who a group can reach (§3.3 "Who sees it"): everyone, holders of one permission key, or people holding one of these roles. */
export const WhoSeesIt = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("everyone") }),
  z.strictObject({ kind: z.literal("key"), key: z.string().regex(/^agent\/[a-z-]+:[a-z-]+$/) }),
  z.strictObject({ kind: z.literal("roles"), roles: z.array(z.string().regex(/^[A-Z_]+$/)).min(1) }),
]);
export type WhoSeesIt = z.infer<typeof WhoSeesIt>;
export const Switches = z.strictObject({ inApp: z.boolean(), email: z.boolean() });
export type Switches = z.infer<typeof Switches>;
/** One group's rule: who it reaches and its defaults. */
export type GroupRule = { group: NotificationGroup; whoSeesIt: WhoSeesIt; defaults: Switches };
/** What the "who sees it" rules read of a person. */
export type Holder = { roles: readonly string[]; keys: readonly string[] };
export const reaches = (who: WhoSeesIt, p: Holder): boolean =>
  who.kind === "everyone" || (who.kind === "key" ? p.keys.includes(who.key) : who.roles.some((r) => p.roles.includes(r)));
/** The groups that can reach this person, in the rules' order. */
export const groupsFor = (rules: readonly GroupRule[], p: Holder): NotificationGroup[] => rules.filter((r) => reaches(r.whoSeesIt, p)).map((r) => r.group);
/** The rules must name each of the eight groups exactly once (no group invented, none missing). Throws otherwise. */
export function checkRules(rules: readonly GroupRule[]): readonly GroupRule[] {
  const named = rules.map((r) => NotificationGroup.parse(r.group));
  const missing = NotificationGroup.options.filter((g) => !named.includes(g));
  if (missing.length || new Set(named).size !== named.length || named.length !== NotificationGroup.options.length) throw new Error(`notification groups: need each of the eight once (missing ${missing.join(", ") || "none"}; named ${named.join(", ")})`);
  for (const r of rules) { WhoSeesIt.parse(r.whoSeesIt); Switches.parse(r.defaults); }
  return rules;
}
/** The decision itself, shared by every adapter: the person (null: not this firm's active staff), the rule, their stored switches (null: never set). */
export function decide(rules: readonly GroupRule[], person: Holder | null, group: PrefGroup, channel: NotificationChannel, stored: Switches | null): boolean {
  if (person === null) return false;
  if (group === SECURITY) return channel === "EMAIL";
  const rule = rules.find((r) => r.group === group);
  if (!rule || !reaches(rule.whoSeesIt, person)) return false;
  const s = stored ?? rule.defaults;
  return channel === "EMAIL" ? s.email : s.inApp;
}
export interface NotificationPrefsPort {
  allows(firmId: string, staffId: string, group: PrefGroup, channel: NotificationChannel): Promise<boolean>;
}
export type FakeNotificationPrefs = NotificationPrefsPort & {
  /** Makes (or changes) one of a firm's people, with the roles and keys the "who sees it" rules read. */
  setPerson(firmId: string, staffId: string, holder: Holder): void;
  /** Stores one person's switches for one group (as the platform's PUT does for a group that can reach them). */
  set(firmId: string, staffId: string, group: NotificationGroup, s: Switches): void;
};
/** In memory, with the same rules as the real adapter (pass the platform's rules, or your own in a unit test). */
export function fakeNotificationPrefs(rules: readonly GroupRule[]): FakeNotificationPrefs {
  checkRules(rules);
  const people = new Map<string, Holder>(), stored = new Map<string, Switches>();
  const k = (firmId: string, staffId: string) => `${firmId.toLowerCase()}|${staffId.toLowerCase()}`;
  return {
    async allows(firmId, staffId, group, channel) {
      if (group !== SECURITY) NotificationGroup.parse(group);
      NotificationChannel.parse(channel);
      const person = people.get(k(firmId, staffId)) ?? null;
      return decide(rules, person, group, channel, stored.get(`${k(firmId, staffId)}|${group}`) ?? null);
    },
    setPerson(firmId, staffId, holder) { people.set(k(firmId, staffId), { roles: [...holder.roles], keys: [...holder.keys] }); },
    set(firmId, staffId, group, s) { stored.set(`${k(firmId, staffId)}|${NotificationGroup.parse(group)}`, Switches.parse(s)); },
  };
}
