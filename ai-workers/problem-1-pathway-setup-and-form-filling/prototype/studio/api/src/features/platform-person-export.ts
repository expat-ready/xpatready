// PF-26 (R1.34): one person's data as one export. Part 1: the registry modules register their exporters into
// (ports/person-export.ts). Part 2: the routes under /api/front-office/people/:personId/exports, the build and expiry jobs
// on PF-14's runner, the bound file store (not the plan-limited one: a person's copy is never refused for storage),
// audit real, PF-21b's legal holds. Each module registers its own exporter from its own feature file.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { boundFiles } from "../platform/files/choose.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { PgLegalHolds } from "../platform/register/holds/adapter.ts";
import { PersonExportRegistry } from "../platform/person-export/registry.ts";
import { PersonExportController } from "../platform/person-export/routes.ts";
import { PersonExports } from "../platform/person-export/service.ts";

export default {
  controllers: [PersonExportController],
  providers: [PersonExportRegistry, { provide: PersonExports, useFactory: async (db: Db, port: PersonExportRegistry, jobs: PlatformJobs, clock: PlatformClock) => {
    const svc = new PersonExports({ db, port, files: boundFiles(), jobs, audit: auditEvent, holds: new PgLegalHolds(), now: () => new Date(clock.now()) });
    await svc.register(jobs);
    return svc;
  }, inject: [Db, PersonExportRegistry, PlatformJobs, PlatformClock] }],
} satisfies Feature;
