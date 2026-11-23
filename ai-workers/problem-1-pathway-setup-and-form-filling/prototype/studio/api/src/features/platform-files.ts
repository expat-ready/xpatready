// PF-F2 part 1 (R1.64): the upload rail. UploadDoors is UploadDoorPort's registry (modules register their doors on it at
// start-up); UploadRail is tus at /api/platform/files/uploads, storing finished files through the app's FilesPort (the
// `LocalFiles` token: PF-15's EntitledFiles over the bound store, so plan storage limits hold), asking PgLegalHolds before
// the hourly cleanup removes an expired upload.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { LocalFiles } from "../front-office/files.ts";
import { UploadDoors } from "../platform/files/uploads/doors.ts";
import { UploadRail } from "../platform/files/uploads/rail.ts";
import { UploadsController } from "../platform/files/uploads/routes.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { PgLegalHolds } from "../platform/register/holds/adapter.ts";
import type { FilesPort } from "../../../ports/files.ts";

export default {
  controllers: [UploadsController],
  providers: [
    { provide: UploadDoors, useValue: new UploadDoors() },
    { provide: UploadRail, useFactory: async (db: Db, files: FilesPort, doors: UploadDoors, holds: PgLegalHolds, clock: PlatformClock, jobs: PlatformJobs) => {
      const rail = new UploadRail({ db, files, doors, holds, now: () => clock.now() });
      await rail.register(jobs);
      return rail;
    }, inject: [Db, LocalFiles, UploadDoors, PgLegalHolds, PlatformClock, PlatformJobs] },
  ],
} satisfies Feature;
