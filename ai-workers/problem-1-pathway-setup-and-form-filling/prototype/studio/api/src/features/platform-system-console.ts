// PF-17 part 1 (R1.93): our team's console API, the firms list with health and usage (api/src/platform/system-console/).
// It sits behind PF-4s's guard (features/platform-system-identity.ts). Failed jobs come from PF-14's runner.
import type { Feature } from "../features.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { FAILED_JOBS, SystemConsoleFirms } from "../platform/system-console/firms.ts";
import { SystemConsoleController } from "../platform/system-console/routes.ts";

export default {
  controllers: [SystemConsoleController],
  providers: [{ provide: FAILED_JOBS, useExisting: PlatformJobs }, SystemConsoleFirms],
} satisfies Feature;
