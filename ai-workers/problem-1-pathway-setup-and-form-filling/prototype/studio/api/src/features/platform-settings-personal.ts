// PF-18a: a firm's offices with their time zones (part 1: api/src/platform/settings/offices/), and each person's notification settings (part 2:
// api/src/platform/settings/notifications/). OFFICE_CLOCK is OfficeClockPort's real adapter (ports/offices.ts) and NOTIFICATION_PREFS is
// NotificationPrefsPort's (ports/notification-prefs.ts), for other modules.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { OFFICE_CLOCK, OfficeClock } from "../platform/settings/offices/clock.ts";
import { OfficesController, StaffOfficeController } from "../platform/settings/offices/routes.ts";
import { Offices } from "../platform/settings/offices/service.ts";
import { NOTIFICATION_PREFS, PrismaNotificationPrefs } from "../platform/settings/notifications/prefs.ts";
import { NotificationSettingsController } from "../platform/settings/notifications/routes.ts";
import { NotificationSettings } from "../platform/settings/notifications/service.ts";

export default {
  controllers: [OfficesController, StaffOfficeController, NotificationSettingsController],
  providers: [
    { provide: Offices, useFactory: (db: Db) => new Offices({ db, audit: auditEvent }), inject: [Db] },
    { provide: OFFICE_CLOCK, useFactory: (db: Db) => new OfficeClock(db), inject: [Db] },
    { provide: NotificationSettings, useFactory: (db: Db) => new NotificationSettings({ db }), inject: [Db] },
    { provide: NOTIFICATION_PREFS, useFactory: (db: Db) => new PrismaNotificationPrefs(db), inject: [Db] },
  ],
} satisfies Feature;
