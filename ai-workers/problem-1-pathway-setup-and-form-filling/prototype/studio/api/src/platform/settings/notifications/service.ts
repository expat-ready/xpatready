// PF-18a part 2 (AG-16-10, AG-16 §3.3): My account → Notifications. A person reads and saves only their own switches (`agent/notification:manage-preferences`,
// self-scoped, all six roles). They see only the groups that can reach them (§3.3 "Who sees it", read from their roles and keys), each with its In-app and
// Email switch (their saved pair, or the §3.3 default), and the security emails, always on and not switchable. A save names one or more groups; a group that
// cannot reach them, a repeated group or an unknown field refuses the whole save (400, nothing written). Two saves at once queue on the person; no firm
// ceiling, no digest. A personal choice: no audit line (the audit rule of AG-16 is for firm settings and sensitive actions).
import { HttpException, HttpStatus } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { groupsFor, NotificationGroup, Switches } from "../../../../../ports/notification-prefs.ts";
import { firmScope } from "../../firm-scope.ts";
import { GROUPS, RULES, SECURITY_LABEL } from "./groups.ts";
/** Who asks: the guard's staff context (only these fields are read). */
export type PrefsActor = { firmId: string; staffId: string; roles: readonly string[]; keys: readonly string[] };
export type GroupView = { group: NotificationGroup; number: number; label: string; whatIsInIt: string; inApp: boolean; email: boolean; defaults: Switches; saved: boolean };
export type PrefsView = { groups: GroupView[]; security: { label: string; email: true; switchable: false } };
export const NOT_YOURS = "This group cannot reach you, so it has no switches.";
const refused = (detail: string, issues: string[]): never => { throw new HttpException({ type: "https://expatready.local/problems/notification-settings-refused", title: "Notification settings not saved", status: 400, detail, issues }, HttpStatus.BAD_REQUEST); };
export const SavePrefs = z.strictObject({ groups: z.array(z.strictObject({ group: NotificationGroup, inApp: z.boolean(), email: z.boolean() })).min(1).max(8) });
export class NotificationSettings {
  constructor(private readonly deps: { db: PrismaClient }) {}
  async read(a: PrefsActor): Promise<PrefsView> {
    const firmId = firmScope(a.firmId).firmId, mine = new Set(groupsFor(RULES, a));
    const rows = await this.deps.db.platformNotificationPreference.findMany({ where: firmScope(firmId, { staffId: a.staffId }), select: { group: true, inApp: true, email: true } });
    const saved = new Map(rows.map((r) => [r.group, r]));
    return {
      groups: GROUPS.filter((g) => mine.has(g.group)).map((g) => { const s = saved.get(g.group); return { group: g.group, number: g.number, label: g.label, whatIsInIt: g.whatIsInIt, inApp: s?.inApp ?? g.defaults.inApp, email: s?.email ?? g.defaults.email, defaults: { ...g.defaults }, saved: !!s }; }),
      security: { label: SECURITY_LABEL, email: true, switchable: false },
    };
  }
  async save(a: PrefsActor, body: unknown): Promise<PrefsView> {
    const r = SavePrefs.safeParse(body ?? {});
    if (!r.success) return refused("Please check the highlighted switches.", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
    const named = r.data.groups.map((g) => g.group), mine = new Set(groupsFor(RULES, a));
    if (new Set(named).size !== named.length) refused("Each group may be named once.", ["groups: a group is named twice"]);
    const notMine = named.filter((g) => !mine.has(g));
    if (notMine.length) refused(NOT_YOURS, notMine.map((g) => `groups: ${g} cannot reach you`));
    const firmId = firmScope(a.firmId).firmId;
    await this.deps.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('platform_notification_preference:' || ${a.staffId}, 0))`;
      for (const g of r.data.groups) await tx.platformNotificationPreference.upsert({
        where: { staffId_group: { staffId: a.staffId, group: g.group } },
        create: { staffId: a.staffId, firmId, group: g.group, inApp: g.inApp, email: g.email },
        update: { inApp: g.inApp, email: g.email },
      });
    });
    return this.read(a);
  }
}
