// PF-18n part 1 (brief lead-b-briefs/PF-18n1.md; R1.74, QA-471): NotificationPort's real adapter (api/src/platform/notifications/),
// the person's own notification routes, and the binding that arms the case deadline reminders: CASE_DEADLINE_NOTIFICATIONS is the
// same adapter (useExisting), so CaseDeadlineJobs (features/case-deadlines.ts, not edited here) registers its jobs and sweep at start.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { NotificationPrefsPort } from "../../../ports/notification-prefs.ts";
import { CASE_DEADLINE_NOTIFICATIONS } from "./case-deadlines.ts";
import { NOTIFICATION_PREFS } from "../platform/settings/notifications/prefs.ts";
import { MyNotifications, NOTIFICATION_PORT, PrismaNotificationPort } from "../platform/notifications/store.ts";
import { MyNotificationsController } from "../platform/notifications/routes.ts";

export default {
  controllers: [MyNotificationsController],
  providers: [
    { provide: NOTIFICATION_PORT, useFactory: (prefs: NotificationPrefsPort) => new PrismaNotificationPort(prefs), inject: [NOTIFICATION_PREFS] },
    { provide: CASE_DEADLINE_NOTIFICATIONS, useExisting: NOTIFICATION_PORT },
    { provide: MyNotifications, useFactory: (db: Db) => new MyNotifications(db), inject: [Db] },
  ],
} satisfies Feature;
