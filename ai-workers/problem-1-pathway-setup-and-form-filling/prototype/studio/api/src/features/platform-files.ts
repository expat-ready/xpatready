// PF-F2 part 1 (R1.64): the upload rail. UploadDoors is UploadDoorPort's registry (modules register their doors on it at
// start-up); UploadRail is tus at /api/platform/files/uploads, storing finished files through the app's FilesPort (the
// `LocalFiles` token: PF-15's EntitledFiles over the bound store, so plan storage limits hold), asking PgLegalHolds before
// the hourly cleanup removes an expired upload. Off (every request 503) where the store is S3, i.e. the deployment, which
// runs two API tasks: disk staging and tus's in-process lock would lose resumes between them (review M1).
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
      // Off on S3 (the deployment's two tasks), read from the same setting PF-F1b binds the store by.
      const rail = new UploadRail({ db, files, doors, holds, now: () => clock.now(), off: process.env.PLATFORM_FILES?.trim() === "s3" });
      await rail.register(jobs);
      return rail;
    }, inject: [Db, LocalFiles, UploadDoors, PgLegalHolds, PlatformClock, PlatformJobs] },
  ],
} satisfies Feature;
