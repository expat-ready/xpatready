// PF-27 part 3a: our Platform Owner's security lock and its lift (api/src/platform/firm-lock/), audit real.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { FirmLockController } from "../platform/firm-lock/routes.ts";
import { FirmLocks } from "../platform/firm-lock/service.ts";
import { SystemIdentity } from "../platform/system-identity/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";

export default {
  controllers: [FirmLockController],
  providers: [{ provide: FirmLocks, useFactory: (db: Db, identity: SystemIdentity, clock: PlatformClock) => new FirmLocks({ db, identity, audit: auditEvent, now: () => new Date(clock.now()) }), inject: [Db, SystemIdentity, PlatformClock] }],
} satisfies Feature;
