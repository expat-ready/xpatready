// PF-21d part 1 (R1.85): an approved deletion request on the register carried out. The erasure registry modules register
// their erasers into (ports/erasure.ts), approve and cancel under /api/system/erasure, the "Data erasure" switch under
// /api/system/switches, and the daily job on PF-14's runner. The hold check is PF-21b part 2's PgLegalHolds.
import type { Feature } from "../features.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { PgLegalHolds } from "../platform/register/holds/adapter.ts";
import { ErasureRegistry } from "../platform/erasure/registry.ts";
import { ErasureController } from "../platform/erasure/routes.ts";
import { ERASURE_CRON, ERASURE_HOLDS, ERASURE_QUEUE, ERASURE_ZONE, Erasure } from "../platform/erasure/service.ts";
import { PlatSwitchController } from "../platform/switches/routes.ts";
import { PlatSwitches } from "../platform/switches/service.ts";

/** The daily job's registration (before the runner starts). */
export const ERASURE_DAILY = Symbol("Erasure.daily");

export default {
  controllers: [ErasureController, PlatSwitchController],
  providers: [ErasureRegistry, PlatSwitches, { provide: ERASURE_HOLDS, useClass: PgLegalHolds }, Erasure, { provide: ERASURE_DAILY, useFactory: async (erasure: Erasure, jobs: PlatformJobs) => {
    await jobs.handle(ERASURE_QUEUE, async () => { const r = await erasure.run(); if (r.failed) throw new Error(`erasure: ${r.failed} order(s) failed; the next run retries them`); });
    await jobs.recurring(ERASURE_QUEUE, ERASURE_CRON, ERASURE_ZONE);
    return true;
  }, inject: [Erasure, PlatformJobs] }],
} satisfies Feature;
