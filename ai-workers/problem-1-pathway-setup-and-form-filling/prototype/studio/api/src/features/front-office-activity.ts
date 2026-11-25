// FO-14 part A: the client's progress stream (api/src/front-office/activity/): the real PortalActivityPort bound as
// PORTAL_ACTIVITY_PORT, and the staff engagement read.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { PORTAL_ACTIVITY_PORT } from "../../../ports/portal-activity.ts";
import { PgPortalActivity } from "../front-office/activity/adapter.ts";
import { EngagementController } from "../front-office/activity/routes.ts";
import { Engagement } from "../front-office/activity/service.ts";

export default {
  controllers: [EngagementController],
  providers: [{ provide: PORTAL_ACTIVITY_PORT, useFactory: (db: Db) => new PgPortalActivity(db), inject: [Db] }, Engagement],
} satisfies Feature;
