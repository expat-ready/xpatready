// PF-18n part 1 (brief lead-b-briefs/PF-18n1.md; R1.74, QA-471): NotificationPort's real adapter (api/src/platform/notifications/),
// the person's own notification routes, and the binding that arms the case deadline reminders: CASE_DEADLINE_NOTIFICATIONS is the
// same adapter (useExisting), so CaseDeadlineJobs (features/case-deadlines.ts, not edited here) registers its jobs and sweep at start.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { CASE_DEADLINE_NOTIFICATIONS } from "./case-deadlines.ts";
import { PrismaNotificationPrefs } from "../platform/settings/notifications/prefs.ts";
import { MyNotifications, NOTIFICATION_PORT, PrismaNotificationPort } from "../platform/notifications/store.ts";
import { MyNotificationsController, NeedsYouController } from "../platform/notifications/routes.ts";
import { NotificationLabels } from "../platform/notifications/labels.ts";

export default {
  controllers: [MyNotificationsController, NeedsYouController],   // PF-18h: Home's Needs you
  providers: [
    // The switch is read by NOTIFICATION_PREFS' own adapter over the caller's transaction (breaker M1: the shared pool would
    // need a second connection per notify, and a switch changed in the same transaction would be missed).
    { provide: NOTIFICATION_PORT, useFactory: () => new PrismaNotificationPort((tx) => new PrismaNotificationPrefs(tx)) },
    { provide: CASE_DEADLINE_NOTIFICATIONS, useExisting: NOTIFICATION_PORT },
    { provide: MyNotifications, useFactory: (db: Db) => new MyNotifications(db), inject: [Db] },
    NotificationLabels,   // PF-18n part 2: the one registry each module's labeller joins at start-up (front-office-sales.ts: leads)
  ],
} satisfies Feature;
