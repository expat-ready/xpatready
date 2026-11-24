// PF-11 part 1: the firm's full data download, on PgFirmExport with the platform's sections (part 2, the case side and client
// money register theirs from their own feature files); the bound file store, not the plan-limited one, so a firm over its
// storage limit still gets its data; PF-14's job runner; audit real; PF-21b's legal holds.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { boundFiles } from "../platform/files/choose.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { PgLegalHolds } from "../platform/register/holds/adapter.ts";
import { FirmExportController } from "../platform/firm-export/routes.ts";
import { FirmExports } from "../platform/firm-export/service.ts";
import { PgFirmExport } from "../platform/firm-export/registry.ts";
import { platformSections } from "../platform/firm-export/platform-sections.ts";

export default {
  controllers: [FirmExportController],
  providers: [
    { provide: PgFirmExport, useFactory: (db: Db) => { const p = new PgFirmExport(db); p.register("platform", platformSections); return p; }, inject: [Db] },
    { provide: FirmExports, useFactory: async (db: Db, port: PgFirmExport, jobs: PlatformJobs, clock: PlatformClock) => {
      const svc = new FirmExports({ db, port, files: boundFiles(), jobs, audit: auditEvent, holds: new PgLegalHolds(), now: () => new Date(clock.now()) });
      await svc.register(jobs);
      return svc;
    }, inject: [Db, PgFirmExport, PlatformJobs, PlatformClock] },
  ],
} satisfies Feature;
