// PF-18a: a firm's offices with their time zones (part 1: api/src/platform/settings/offices/), and later each person's
// notification settings (part 2). OFFICE_CLOCK is OfficeClockPort's real adapter for other modules (ports/offices.ts).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { OFFICE_CLOCK, OfficeClock } from "../platform/settings/offices/clock.ts";
import { OfficesController } from "../platform/settings/offices/routes.ts";
import { Offices } from "../platform/settings/offices/service.ts";

export default {
  controllers: [OfficesController],
  providers: [
    { provide: Offices, useFactory: (db: Db) => new Offices({ db, audit: auditEvent }), inject: [Db] },
    { provide: OFFICE_CLOCK, useFactory: (db: Db) => new OfficeClock(db), inject: [Db] },
  ],
} satisfies Feature;
