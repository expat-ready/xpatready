// PF-21b part 3 (R1.85): the register of privacy requests made to ExpatReady. Our console's routes
// (/api/system/register/requests), the service, and its daily check on PF-14's runner (overdue and near-date alerts,
// NFR5-14). SystemIdentity and PlatformClock come from PF-4s's feature (every feature's providers share one module).
import type { Feature } from "../features.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { DataRequestController } from "../platform/register/requests/routes.ts";
import { DATA_REQUEST_CRON, DATA_REQUEST_QUEUE, DATA_REQUEST_ZONE, DataRequests } from "../platform/register/requests/service.ts";

/** The daily check's registration (before the runner starts). */
export const DATA_REQUEST_DAILY = Symbol("DataRequests.daily");

export default {
  controllers: [DataRequestController],
  providers: [DataRequests, { provide: DATA_REQUEST_DAILY, useFactory: async (requests: DataRequests, jobs: PlatformJobs) => {
    await jobs.handle(DATA_REQUEST_QUEUE, async () => { const r = await requests.sweep(); if (r.failed) throw new Error(`data requests: ${r.failed} check(s) failed; the next run retries them`); });
    await jobs.recurring(DATA_REQUEST_QUEUE, DATA_REQUEST_CRON, DATA_REQUEST_ZONE);
    return true;
  }, inject: [DataRequests, PlatformJobs] }],
} satisfies Feature;
