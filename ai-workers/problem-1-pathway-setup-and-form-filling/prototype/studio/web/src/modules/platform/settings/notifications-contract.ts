// PF-18s part 3 (concept screens/PF-18s §4 board A, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-10, AG-16 §3.3;
// R1.92): the shapes My account → Notifications reads from PF-18a part 2's `GET|PUT /api/platform/me/notifications`, parsed at the edge,
// and the page's pure helpers. No imports from the app, so a test reads it in Node. The server decides every rule (which groups reach the
// person, the security row, the version).
import { z } from "zod";

export const Switches = z.object({ inApp: z.boolean(), email: z.boolean() });
export type Switches = z.infer<typeof Switches>;
export const GroupView = z.object({ group: z.string(), number: z.number(), label: z.string(), whatIsInIt: z.string(), inApp: z.boolean(), email: z.boolean(), defaults: Switches, saved: z.boolean() });
export type GroupView = z.infer<typeof GroupView>;
export const PrefsView = z.object({ version: z.string(), groups: z.array(GroupView), security: z.object({ label: z.string(), email: z.literal(true), switchable: z.literal(false) }) });
export type PrefsView = z.infer<typeof PrefsView>;
/** The person's unsaved switches, by group code. */
export type Draft = Record<string, Switches>;

/** Every person holds it (self-scoped, all six roles, AG-16 §10). */
export const NOTIFICATIONS_KEY = "agent/notification:manage-preferences";

export const draftOf = (v: PrefsView): Draft => Object.fromEntries(v.groups.map((g) => [g.group, { inApp: g.inApp, email: g.email }]));
const same = (a: Switches | undefined, b: Switches | undefined) => !!a && !!b && a.inApp === b.inApp && a.email === b.email;
/** The groups whose switches differ from the view they were loaded from: what Save sends (one PUT, only these, one version). */
export const changedGroups = (view: PrefsView, draft: Draft) =>
  view.groups.filter((g) => draft[g.group] && !same(draft[g.group], g)).map((g) => ({ group: g.group, ...draft[g.group] }));
/** After a 409 (challenge m2): the latest view, with only the person's own changes laid on top. A group another tab changed and this
 *  person did not shows the other tab's value (per box); a group no longer in `current` (a role change took it away) is dropped, so the next Save
 *  is not refused as a whole. The next Save carries `current.version`. */
export function overlay(current: PrefsView, loaded: PrefsView, draft: Draft): Draft {
  const was = new Map(loaded.groups.map((g) => [g.group, g]));
  // Per box (review m2): a box the person changed keeps their value; the other box of the same group takes the latest.
  const pick = (g: GroupView, f: keyof Switches) => { const w = was.get(g.group), d = draft[g.group]; return w && d && d[f] !== w[f] ? d[f] : g[f]; };
  return Object.fromEntries(current.groups.map((g) => [g.group, { inApp: pick(g, "inApp"), email: pick(g, "email") }]));
}
/** Both switches equal the §3.3 default: the row says "Default" quietly. */
export const isDefault = (g: GroupView, s: Switches | undefined) => same(s, g.defaults);
