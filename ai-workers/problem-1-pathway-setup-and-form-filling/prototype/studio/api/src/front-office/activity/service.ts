// FO-14 part A: the staff read of a client's engagement (R1.62's strip, data side): when the client was last seen at one
// of our doors and their newest 20 events. A person the firm does not have, or an id that is not one, is the one 404.
import { Inject } from "@nestjs/common";
import { PORTAL_ACTIVITY_PORT, type PortalActivityItem, type PortalActivityPort } from "../../../../ports/portal-activity.ts";
import { Db } from "../../core.ts";
import { firmScope, notInFirm } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ENGAGEMENT_EVENTS = 20;

export class Engagement {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PORTAL_ACTIVITY_PORT) private readonly activity: PortalActivityPort) {}

  async read(ctx: StaffContext, personId: string): Promise<{ lastSeen: Date | null; activity: PortalActivityItem[] }> {
    if (typeof personId !== "string" || !UUID.test(personId)) return notInFirm("person");
    const p = await this.db.foPerson.findFirst({ where: firmScope(ctx.firmId, { id: personId.toLowerCase() }), select: { id: true } });
    if (!p) return notInFirm("person");
    const activity = await this.activity.recent(ctx.firmId, p.id, ENGAGEMENT_EVENTS);
    return { lastSeen: activity[0]?.at ?? null, activity };
  }
}
