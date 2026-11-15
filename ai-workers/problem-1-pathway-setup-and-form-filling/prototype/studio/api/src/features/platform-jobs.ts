// PF-14: background jobs behind JobPort (pg-boss in its own schema; api/src/platform/jobs/). PF-23w: the same runner is
// /api/health/ready's job-queue probe (QA-452 (1)).
import type { Feature } from "../features.ts";
import { JOB_QUEUE_PROBE } from "../platform/observability/health.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
export default { providers: [PlatformJobs, { provide: JOB_QUEUE_PROBE, useExisting: PlatformJobs }] } satisfies Feature;
