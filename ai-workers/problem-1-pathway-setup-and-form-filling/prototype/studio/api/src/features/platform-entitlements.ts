// PF-15 part 1a: plan limits. StorageWatch (api/src/platform/entitlements/storage.ts) measures each firm's storage, keeps
// its storage-over mark, sends the day-one emails and runs the daily measure on PF-14's runner. The seats limit is read
// by identity's seat check through PgEntitlements in its own transaction; the uploads go through EntitledFiles, bound in
// front-office-retainers.ts.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { LocalFiles } from "../front-office/files.ts";
import { StorageWatch } from "../platform/entitlements/storage.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import type { MailPort } from "../../../ports/mail.ts";

export default {
  providers: [
    { provide: StorageWatch, useFactory: async (db: Db, clock: PlatformClock, mail: MailPort | undefined, jobs: PlatformJobs) => {
      const watch = new StorageWatch({ db, files: new LocalFiles(), mail: mail ?? null, now: () => clock.now() });
      await watch.register(jobs);
      return watch;
    }, inject: [Db, PlatformClock, { token: MAIL_PORT, optional: true }, PlatformJobs] },
  ],
} satisfies Feature;
