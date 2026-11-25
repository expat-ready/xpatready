// PF-18a part 2 (AG-16-10, AG-16-11, AG-16 §3.3): the eight notification groups as data, read once from samples/notification-groups.json (each value quotes
// §3.3) and checked against PF-18np's NotificationGroup: exactly those eight, once each, or the app refuses to start. The labels are the screen's words, in one
// place (AG-16-11: English only, translation-ready).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { checkRules, NotificationGroup, Switches, WhoSeesIt, type GroupRule } from "../../../../../ports/notification-prefs.ts";
const STUDIO = join(import.meta.dirname, "..", "..", "..", "..", "..");
const Group = z.object({ group: NotificationGroup, number: z.number().int().min(1).max(8), label: z.string().min(1), whatIsInIt: z.string().min(1), whoSeesIt: WhoSeesIt, defaults: Switches, emailNeverItems: z.array(z.string()).optional() });
const Pack = z.object({ securityEmails: z.object({ label: z.string().min(1) }), groups: z.array(Group) });
export type GroupInfo = z.infer<typeof Group>;
/** Parses and checks a pack (the file's JSON); throws on any group missing, repeated or invented. */
export function readGroups(raw: unknown): { groups: readonly GroupInfo[]; securityLabel: string } {
  const p = Pack.parse(raw);
  checkRules(p.groups);
  return { groups: [...p.groups].sort((a, b) => a.number - b.number), securityLabel: p.securityEmails.label };
}
const PACK = readGroups(JSON.parse(readFileSync(join(STUDIO, "samples", "notification-groups.json"), "utf8")));
export const GROUPS: readonly GroupInfo[] = PACK.groups;
export const SECURITY_LABEL = PACK.securityLabel;
export const RULES: readonly GroupRule[] = GROUPS.map((g) => ({ group: g.group, whoSeesIt: g.whoSeesIt, defaults: g.defaults }));
