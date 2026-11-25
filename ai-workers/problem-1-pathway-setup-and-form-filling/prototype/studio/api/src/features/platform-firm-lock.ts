// PF-27 part 3a: our Platform Owner's security lock and its lift (api/src/platform/firm-lock/), audit real.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { FirmLockController } from "../platform/firm-lock/routes.ts";
import { FirmLocks } from "../platform/firm-lock/service.ts";
import { SystemIdentity } from "../platform/system-identity/service.ts";

export default {
  controllers: [FirmLockController],
  providers: [{ provide: FirmLocks, useFactory: (db: Db, identity: SystemIdentity) => new FirmLocks({ db, identity, audit: auditEvent }), inject: [Db, SystemIdentity] }],
} satisfies Feature;
