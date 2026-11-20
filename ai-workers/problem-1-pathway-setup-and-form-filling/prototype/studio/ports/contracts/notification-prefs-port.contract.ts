// PF-18a part 2 (PF-0c): NotificationPrefsPort's shared contract, run by the real adapter (PrismaNotificationPrefs, on a scratch database) and by
// fakeNotificationPrefs. The behaviours are the port file's rules (ports/notification-prefs.ts) and AG-16-10's tests: the §3.3 defaults when nothing is
// set; one switch never moves the other; a group that cannot reach the person is false on both channels, even with a stored switch; security emails
// always; another firm's person, or no such person, false.
import { defineContract, expect } from "./contract.ts";
import type { GroupRule, Holder, NotificationPrefsPort, Switches } from "../notification-prefs.ts";
import { NotificationGroup } from "../notifications.ts";

/** What an adapter's test hands the contract: two firms its store knows, the rules it uses, a way to make a person with roles and keys, and to store one switch pair. */
export type NotificationPrefsHarness = {
  port: NotificationPrefsPort; firmA: string; firmB: string; rules: readonly GroupRule[];
  person(firmId: string, holder: Holder): Promise<string>;
  set(firmId: string, staffId: string, group: NotificationGroup, s: Switches): Promise<void>;
};
const OWNER: Holder = { roles: ["OWNER"], keys: ["agent/case:assign", "agent/invoice:list", "agent/notification:manage-preferences"] };
const READER: Holder = { roles: ["READ_ONLY"], keys: ["agent/notification:manage-preferences"] };
const both = async (p: NotificationPrefsPort, f: string, s: string, g: NotificationGroup | "SECURITY") => [await p.allows(f, s, g, "IN_APP"), await p.allows(f, s, g, "EMAIL")];

export const notificationPrefsPortContract = defineContract("NotificationPrefsPort", (make: () => Promise<NotificationPrefsHarness> | NotificationPrefsHarness) => [
  { name: "nothing set → every group that reaches the person answers its §3.3 defaults on both channels", async run() {
    const h = await make(), s = await h.person(h.firmA, OWNER);
    for (const r of h.rules) { const got = await both(h.port, h.firmA, s, r.group); expect(got[0] === r.defaults.inApp && got[1] === r.defaults.email, `${r.group}: the defaults`, got); } } },
  { name: "email off for a group → EMAIL false and IN_APP still true; the other groups unchanged", async run() {
    const h = await make(), s = await h.person(h.firmA, OWNER); await h.set(h.firmA, s, "MENTIONS", { inApp: true, email: false });
    const got = await both(h.port, h.firmA, s, "MENTIONS"); expect(got[0] === true && got[1] === false, "in-app on, email off", got);
    expect(await h.port.allows(h.firmA, s, "NEEDS_YOU", "EMAIL"), "another group keeps its email"); } },
  { name: "in-app off leaves email as it was", async run() {
    const h = await make(), s = await h.person(h.firmA, OWNER); await h.set(h.firmA, s, "NEEDS_YOU", { inApp: false, email: true });
    const got = await both(h.port, h.firmA, s, "NEEDS_YOU"); expect(got[0] === false && got[1] === true, "in-app off, email on", got); } },
  { name: "a security email is allowed whatever the switches (security in-app, which §3.3 does not define, is not)", async run() {
    const h = await make(), s = await h.person(h.firmA, READER);
    for (const g of NotificationGroup.options) if (h.rules.some((r) => r.group === g && r.whoSeesIt.kind === "everyone")) await h.set(h.firmA, s, g, { inApp: false, email: false });
    expect(await h.port.allows(h.firmA, s, "SECURITY", "EMAIL"), "security email on"); expect(!(await h.port.allows(h.firmA, s, "SECURITY", "IN_APP")), "security in-app off"); } },
  { name: "a group that cannot reach the person (§3.3: Team watch, Payments, Firm and connections for a Read only person) → false on both channels, even with a switch stored for it", async run() {
    const h = await make(), s = await h.person(h.firmA, READER);
    for (const g of ["TEAM_WATCH", "PAYMENTS", "FIRM_AND_CONNECTIONS"] as const) {
      await h.set(h.firmA, s, g, { inApp: true, email: true });
      const got = await both(h.port, h.firmA, s, g); expect(!got[0] && !got[1], `${g}: nothing for a Read only person`, got);
    } } },
  { name: "another firm's person, or no such person, → false (security email too)", async run() {
    const h = await make(), s = await h.person(h.firmA, OWNER);
    expect(!(await h.port.allows(h.firmB, s, "NEEDS_YOU", "IN_APP")), "asked as firm B");
    expect(!(await h.port.allows(h.firmB, s, "SECURITY", "EMAIL")), "a security email asked as firm B");
    expect(!(await h.port.allows(h.firmA, globalThis.crypto.randomUUID(), "NEEDS_YOU", "IN_APP")), "an unknown person"); } },
]);
