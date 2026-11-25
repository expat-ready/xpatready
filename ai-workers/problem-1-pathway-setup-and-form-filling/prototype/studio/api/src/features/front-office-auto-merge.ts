// FO-9b part 2b (P-574 (2)): the merge by itself at arrival, a job on PF-14's runner that arrive() queues for each new
// person (api/src/front-office/duplicates/merge/at-arrival.ts). No route.
import { Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { ArrivalAutoMerge } from "../front-office/duplicates/merge/at-arrival.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { ConsentStore } from "../platform/messages/consent/consent-store.ts";

export default {
  providers: [{ provide: ArrivalAutoMerge, useFactory: async (db: Db, jobs: PlatformJobs) => {
    const auto = new ArrivalAutoMerge(db, jobs, { audit: auditEvent, consent: new ConsentStore(auditEvent) });
    await auto.register();
    return auto;
  }, inject: [Db, PlatformJobs] }],
} satisfies Feature;
