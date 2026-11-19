Entry points: PF-18a part 2: `GET|PUT /api/platform/me/notifications` (own only; `agent/notification:manage-preferences`; the groups that can reach the person, AG-16 §3.3), `NOTIFICATION_PREFS` (NotificationPrefsPort's real adapter `PrismaNotificationPrefs`; `ports/notification-prefs.ts` holds the port, `decide` and its fake), `settings/notifications/groups.ts` (the eight groups from `samples/notification-groups.json`, checked against PF-18np's NotificationGroup).
Tables: platformNotificationPreference
Tests: tests/check_pf18a_notifications.ts
