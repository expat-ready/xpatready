// PF-5fp (R1.92): the firm profile, GET|PUT /api/platform/firm/profile (api/src/platform/settings/profile/).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { FirmProfileController } from "../platform/settings/profile/routes.ts";
import { FirmProfile } from "../platform/settings/profile/service.ts";

export default {
  controllers: [FirmProfileController],
  providers: [{ provide: FirmProfile, useFactory: (db: Db) => new FirmProfile({ db, audit: auditEvent }), inject: [Db] }],
} satisfies Feature;
