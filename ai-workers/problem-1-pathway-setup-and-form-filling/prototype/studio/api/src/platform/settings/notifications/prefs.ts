// PF-18a part 2: NotificationPrefsPort's real adapter (ports/notification-prefs.ts) over platform_notification_preference, the person's active role grants
// and the role catalogue. Reads run with the caller's client and firm scope (PF-12): under another firm's scope, or none, the firm is not readable and the
// call is refused, never a silent "no" that would drop every notification.
import type { Prisma, PrismaClient } from "@prisma/client";
import { decide, NotificationChannel, NotificationGroup, SECURITY, type GroupRule, type Holder, type NotificationPrefsPort, type PrefGroup, type Switches } from "../../../../../ports/notification-prefs.ts";
import { firmScope } from "../../firm-scope.ts";
import { RULES } from "./groups.ts";
/** The injection token of NotificationPrefsPort's real adapter (api/src/features/platform-settings-personal.ts). */
export const NOTIFICATION_PREFS = Symbol.for("platform.NotificationPrefsPort");
type DbOrTx = PrismaClient | Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The firm's active staff member's roles and keys, or null (not this firm's, not active, or not an id). */
export async function holderOf(db: DbOrTx, firmId: string, staffId: string): Promise<Holder | null> {
  if (!UUID.test(staffId)) return null;
  const s = await db.platformStaff.findFirst({ where: firmScope(firmId, { id: staffId.toLowerCase(), status: "ACTIVE" as const }), select: { grants: { where: { endedAt: null }, select: { role: true } } } });
  if (!s) return null;
  const roles = s.grants.map((g) => g.role);
  const keys = roles.length ? (await db.platformRolePermission.findMany({ where: { role: { in: roles } }, select: { permissionKey: true } })).map((k) => k.permissionKey) : [];
  return { roles, keys: [...new Set(keys)] };
}
export class PrismaNotificationPrefs implements NotificationPrefsPort {
  constructor(private readonly db: DbOrTx, private readonly rules: readonly GroupRule[] = RULES) {}
  async allows(firmId: string, staffId: string, group: PrefGroup, channel: NotificationChannel): Promise<boolean> {
    if (group !== SECURITY) NotificationGroup.parse(group);
    NotificationChannel.parse(channel);
    const id = firmScope(firmId).firmId;
    if (!(await this.db.platformFirm.findUnique({ where: { id }, select: { id: true } }))) throw new Error("NotificationPrefs: the firm is not readable here (call it in the firm's own scope)");
    const person = await holderOf(this.db, id, staffId);
    if (!person || group === SECURITY) return decide(this.rules, person, group, channel, null);
    const row = await this.db.platformNotificationPreference.findFirst({ where: firmScope(id, { staffId: staffId.toLowerCase(), group }), select: { inApp: true, email: true } });
    const stored: Switches | null = row ? { inApp: row.inApp, email: row.email } : null;
    return decide(this.rules, person, group, channel, stored);
  }
}
