// CS-DL1 part 2 (R1.74): stage-deadline reminders on PF-14's job runner (api/src/case-deadlines/). The handlers and the
// 10-minute sweep register when the app starts, only once a NotificationPort is bound to CASE_DEADLINE_NOTIFICATIONS: the
// port's real adapter is PF-18n's and is not on main, so until it is the app arms nothing and says so once in its log
// (every route on main is Sample, so nothing would remind yet either: P-412 F13 (b)). The clock is the system's (P-607).
import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { systemClock } from "../../../ports/clock.ts";
import type { JobPort } from "../../../ports/jobs.ts";
import type { NotificationPort } from "../../../ports/notifications.ts";
import { CaseDeadlines } from "../case-deadlines/reminders.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { logPort } from "../platform/observability/log.ts";

/** PF-18n binds its NotificationPort here (a test binds the fake). */
export const CASE_DEADLINE_NOTIFICATIONS = "CSDL1_CASE_DEADLINE_NOTIFICATIONS";
const registered = new WeakSet<JobPort>();
let saidWaiting = false;

@Injectable()
export class CaseDeadlineJobs implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PlatformJobs) private readonly jobs: JobPort, @Optional() @Inject(CASE_DEADLINE_NOTIFICATIONS) private readonly notifications?: NotificationPort) {}
  async onModuleInit() {
    if (!this.notifications) { if (!saidWaiting) logPort.info("case_deadlines_waiting", { why: "no NotificationPort bound (PF-18n): stage-deadline reminders are not armed" }); saidWaiting = true; return; }
    if (registered.has(this.jobs)) return;
    registered.add(this.jobs);
    try { await new CaseDeadlines({ db: this.db, jobs: this.jobs, notifications: this.notifications as never, clock: systemClock }).register({ sweep: true }); }
    catch (e) { registered.delete(this.jobs); throw e; }
  }
}

export default { providers: [CaseDeadlineJobs] } satisfies Feature;
