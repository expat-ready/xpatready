// PF-17 part 1 (R1.93): our team's console, read only: the firms list with health and usage (/api/system/firms). Its
// figures come from PF-15's reads, bound here as PF-15's own feature binds them (platform-entitlements.ts): PlatformClock
// for the limits and the trial window (review m5), and the case side's PgCaseCount for cases, by the firm's key. Storage is
// StorageWatch's stored measure, read from the firm rows (no FilesPort here). Failed jobs per firm come from PF-14's
// PlatformJobs.deadLetters (its one dead-letter list).
import { Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { PgCaseCount } from "../case-count.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { SystemFirms } from "../platform/system-console/firms.ts";
import { SystemFirmsController } from "../platform/system-console/routes.ts";

export default {
  controllers: [SystemFirmsController],
  providers: [{ provide: SystemFirms, useFactory: (db: Db, clock: PlatformClock, jobs: PlatformJobs) => new SystemFirms({ db, now: () => clock.now(), cases: (firmKey, tx) => new PgCaseCount(tx, firmKey), deadLetters: (limit) => jobs.deadLetters(limit) }), inject: [Db, PlatformClock, PlatformJobs] }],
} satisfies Feature;
