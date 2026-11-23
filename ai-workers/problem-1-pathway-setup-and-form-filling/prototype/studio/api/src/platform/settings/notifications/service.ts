// PF-18a part 2 (AG-16-10, AG-16 §3.3): My account → Notifications. A person reads and saves only their own switches (`agent/notification:manage-preferences`,
// self-scoped, all six roles). They see only the groups that can reach them (§3.3 "Who sees it", read from their roles and keys), each with its In-app and
// Email switch (their saved pair, or the §3.3 default), and the security emails, always on and not switchable. A save names one or more groups and the
// `version` it was made from (STANDARDS §4: a save from a stale view, such as a second tab, is 409 with the current view; break m1). A group that cannot
// reach the person, a repeated group or an unknown field refuses the whole save (400, nothing written). The body's size is checked before its items and the
// problems listed are capped (break M1: a 5 MB body must not stall the API). Two saves at once queue on the person; no firm ceiling, no digest. A personal
// choice: no audit line (the audit rule of AG-16 is for firm settings and sensitive actions).
import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../http/input.ts";
import { groupsFor, NotificationGroup, Switches } from "../../../../../ports/notification-prefs.ts";
import { firmScope } from "../../firm-scope.ts";
import { GROUPS, RULES, SECURITY_LABEL } from "./groups.ts";
type DbOrTx = PrismaClient | Prisma.TransactionClient;
/** Who asks: the guard's staff context (only these fields are read). */
export type PrefsActor = { firmId: string; staffId: string; roles: readonly string[]; keys: readonly string[] };
export type GroupView = { group: NotificationGroup; number: number; label: string; whatIsInIt: string; inApp: boolean; email: boolean; defaults: Switches; saved: boolean };
export type PrefsView = { version: string; groups: GroupView[]; security: { label: string; email: true; switchable: false } };
export const NOT_YOURS = "This group cannot reach you, so it has no switches.";
export const STALE = "Your notification settings were changed elsewhere since you opened them.";
const MAX_ISSUES = 20;   // and each line at most 200 characters (review r2 m2: zod lists every unknown key in one line)
/** PF-28 part 2b (R1.10): a refused setting is a field error (422), each field named in `fields`; `issues` stays. */
const refused = (detail: string, issues: string[], fields?: Record<string, string>): never => { throw new HttpException({ type: "https://expatready.local/problems/notification-settings-refused", title: "Notification settings not saved", status: FIELD_ERROR_STATUS, detail, code: "INVALID", issues: issues.slice(0, MAX_ISSUES).map((i) => i.slice(0, 200)), fields: fields ?? Object.fromEntries(issues.slice(0, MAX_ISSUES).map((x) => { const k = x.indexOf(": "); return k < 0 ? ["body", x.slice(0, 200)] : [x.slice(0, k).slice(0, 64), x.slice(k + 2, k + 202)]; })) }, FIELD_ERROR_STATUS); };
const Item = z.strictObject({ group: NotificationGroup, inApp: z.boolean(), email: z.boolean() });
/** The array's length is checked first (at most the eight groups), its items only then (break M1). */
export const SavePrefs = z.strictObject({ version: z.string().max(64), groups: z.array(z.unknown()).min(1).max(8).pipe(z.array(Item)) });
/** JSON.parse makes `__proto__` an own key, which zod's strict objects let through (break m2): refused like any unknown field. Only the body and its
 *  first eight `groups` items are looked at, the only objects the schema accepts; anything deeper is already an unknown key (review r2 M1: no recursion). */
const own = (v: unknown) => typeof v === "object" && v !== null && Object.prototype.hasOwnProperty.call(v, "__proto__");
const protoKey = (body: unknown): boolean => own(body) || (typeof body === "object" && body !== null && Array.isArray((body as { groups?: unknown }).groups) && ((body as { groups: unknown[] }).groups).slice(0, 8).some(own));
/** The person's saved rows, oldest group first. */
const savedRows = (db: DbOrTx, firmId: string, staffId: string) => db.platformNotificationPreference.findMany({ where: firmScope(firmId, { staffId }), select: { group: true, inApp: true, email: true }, orderBy: { group: "asc" } });
/** A view's version: a hash of what the person saved (the same switches give the same version, so only a real change elsewhere is a conflict). */
const versionOf = (rows: { group: string; inApp: boolean; email: boolean }[]) => createHash("sha256").update(rows.map((r) => `${r.group}=${+r.inApp}${+r.email}`).join(",")).digest("hex").slice(0, 20);
export class NotificationSettings {
  constructor(private readonly deps: { db: PrismaClient }) {}
  private view(a: PrefsActor, rows: { group: string; inApp: boolean; email: boolean }[]): PrefsView {
    const mine = new Set(groupsFor(RULES, a)), saved = new Map(rows.map((r) => [r.group, r]));
    return {
      version: versionOf(rows),
      groups: GROUPS.filter((g) => mine.has(g.group)).map((g) => { const s = saved.get(g.group); return { group: g.group, number: g.number, label: g.label, whatIsInIt: g.whatIsInIt, inApp: s?.inApp ?? g.defaults.inApp, email: s?.email ?? g.defaults.email, defaults: { ...g.defaults }, saved: !!s }; }),
      security: { label: SECURITY_LABEL, email: true, switchable: false },
    };
  }
  async read(a: PrefsActor): Promise<PrefsView> {
    return this.view(a, await savedRows(this.deps.db, firmScope(a.firmId).firmId, a.staffId));
  }
  async save(a: PrefsActor, body: unknown): Promise<PrefsView> {
    if (protoKey(body)) refused("Please check the highlighted switches.", ["body: __proto__ is not a field"]);
    const r = SavePrefs.safeParse(body ?? {});
    if (!r.success) return refused("Please check the highlighted switches.", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`), fieldsOf(r.error));
    const named = r.data.groups.map((g) => g.group), mine = new Set(groupsFor(RULES, a));
    if (new Set(named).size !== named.length) refused("Each group may be named once.", ["groups: a group is named twice"]);
    const notMine = named.filter((g) => !mine.has(g));
    if (notMine.length) refused(NOT_YOURS, notMine.map((g) => `groups: ${g} cannot reach you`));
    const firmId = firmScope(a.firmId).firmId;
    const rows = await this.deps.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('platform_notification_preference:' || ${a.staffId}, 0))`;
      const current = await savedRows(tx, firmId, a.staffId);
      if (versionOf(current) !== r.data.version) throw new HttpException({ type: "https://expatready.local/problems/notification-settings-changed", title: "Changed since you opened it", status: 409, detail: STALE, current: this.view(a, current) }, HttpStatus.CONFLICT);
      for (const g of r.data.groups) await tx.platformNotificationPreference.upsert({
        where: { staffId_group: { staffId: a.staffId, group: g.group } },
        create: { staffId: a.staffId, firmId, group: g.group, inApp: g.inApp, email: g.email },
        update: { inApp: g.inApp, email: g.email },
      });
      return savedRows(tx, firmId, a.staffId);
    });
    return this.view(a, rows);
  }
}
