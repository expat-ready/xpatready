// R1.96 part 1: writing off what is still due on an issued invoice (api/src/client-money/write-offs/), on the app's
// database, AuditPort's adapter over audit_event, the platform clock and CS-MV1's MoneyVisibilityPort adapter (C5).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { WriteOffs } from "../client-money/write-offs/write-off.ts";
import { WriteOffController } from "../client-money/write-offs/routes.ts";
import { moneyScopeOf } from "../client-money/visibility-adapter.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
export default { controllers: [WriteOffController], providers: [
  { provide: WriteOffs, useFactory: (db: Db, c: PlatformClock) => new WriteOffs(db, auditEvent, { now: () => new Date(c.now()) }, moneyScopeOf(db)), inject: [Db, PlatformClock] }] } satisfies Feature;
