// PF-14: the one job runner of the app. A Nest provider: other modules inject `PlatformJobs` (a JobPort) and register
// their handlers in onModuleInit with `jobs.handle(name, fn)`; the worker starts once the app has started
// (onApplicationBootstrap, after every onModuleInit) and stops cleanly when the app closes (app.close(), or SIGTERM /
// SIGINT: stop.sh sends SIGTERM). On stop, no new job is fetched, a running handler gets up to 8 s to finish (STOP_LIMIT_MS; restart-api.sh and isolated.sh wait 10 s), and the
// pool closes; then the signal's default action (exit) runs as before.
// PF-23w (QA-452) joins it to PF-23's observability, in this one place:
//  * every handler registered through `handle` is wrapped once by `observeJob` (one job line and its metrics per run,
//    a failure line on a throw), so no module wraps its own; nothing outside this folder registers on `runner` directly
//    (tests/check_pf23w_jobs_wired.ts DW2 checks the code);
//  * it is the JOB_QUEUE_PROBE of /api/health/ready (features/platform-jobs.ts): ok while pg-boss runs and answers;
//  * it runs the stuck-job check (stuck-check.ts) as a platform cron job every minute.
import { Inject, Injectable, Optional, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import type { ConstructorOptions } from "pg-boss";
import type { JobHandler, JobOptions, JobPayload, JobPort, JobRun } from "../../../../ports/jobs.ts";
import { DATABASE_URL } from "../../core.ts";
import type { JobQueueProbe } from "../observability/health.ts";
import { observeJob } from "../observability/jobs.ts";
import { asJob, withFirm } from "../firm-scope.ts";
import { PgBossJobs, type DeadLetter } from "./pgboss-jobs.ts";
import { STUCK_CHECK_CRON, STUCK_CHECK_QUEUE, StuckCheck } from "./stuck-check.ts";
import { logPort } from "../observability/log.ts";

const SIGNALS = ["SIGTERM", "SIGINT"] as const;
/** Optional: pg-boss options for this runner (a test passes pg-boss's TestClock as `clock`; the app passes none). */
export const PLATFORM_JOBS_BOSS = "PF14_PLATFORM_JOBS_BOSS";

/** A handler wrapped by PF-23's observeJob: the job's key is its id, its due time its age's start, its firm its scope.
 *  A recurring run's key is `<name>@<minute, ISO>`; its "@" becomes ":at:" so the line keeps the run's id (observeJob
 *  takes ids of letters, digits and _ . : - only). A throw is passed on, so pg-boss still retries. */
export const observed = (queue: string, handler: JobHandler, now?: () => number): JobHandler => {
  const run = observeJob(queue, (j: { id: string; createdAt: Date; firmId?: string; run: JobRun }) => handler(j.run), now);
  return (job) => run({ id: job.key.replace(/@/g, ":at:"), createdAt: job.runAt, firmId: job.firmId ?? undefined, run: job });
};

@Injectable()
export class PlatformJobs implements JobPort, JobQueueProbe, OnApplicationBootstrap, OnApplicationShutdown {
  readonly runner: PgBossJobs;
  readonly stuck: StuckCheck;
  #onSignal = (signal: NodeJS.Signals) => {
    for (const s of SIGNALS) process.removeListener(s, this.#onSignal);
    void this.runner.stop().catch((e) => logPort.error("jobs_stop_failed", e)).finally(() => process.kill(process.pid, signal));
  };

  constructor(boss?: Partial<ConstructorOptions> | null) {
    this.runner = new PgBossJobs({ connectionString: DATABASE_URL, ...(boss ? { boss } : {}) });
    this.stuck = new StuckCheck(this.runner);
  }

  async onApplicationBootstrap() {
    // Registered before start, so both are applied when the runner starts.
    await this.handle(STUCK_CHECK_QUEUE, async () => { await this.stuck.run(); });
    await this.runner.recurring(STUCK_CHECK_QUEUE, STUCK_CHECK_CRON, "UTC");
    await this.runner.start();
    for (const s of SIGNALS) process.once(s, this.#onSignal);
  }

  async onApplicationShutdown() {
    for (const s of SIGNALS) process.removeListener(s, this.#onSignal);
    await this.runner.stop();
  }

  /** /api/health/ready's job-queue part: the worker runs and pg-boss's database answers. */
  async ready(): Promise<{ ok: boolean; words: string }> {
    if (!this.runner.started) return { ok: false, words: "The job queue is not running: reminders and other background jobs wait. Restart the API (restart-api.sh)." };
    await this.runner.boss.getDb().executeSql("select 1");
    return { ok: true, words: "The job queue runs." };
  }

  handle(name: string, handler: JobHandler) { return this.runner.handle(name, observed(name, (job) => (job.firmId ? withFirm(job.firmId, () => handler(job)) : asJob(name, () => handler(job))), () => this.runner.now())); }   // PF-12: a job runs as its firm, or a sweep on its named use
  enqueue(name: string, payload: JobPayload, opts: JobOptions) { return this.runner.enqueue(name, payload, opts); }
  schedule(name: string, at: Date, payload: JobPayload, opts: JobOptions) { return this.runner.schedule(name, at, payload, opts); }
  cancel(key: string) { return this.runner.cancel(key); }
  recurring(name: string, cron: string, zone: string) { return this.runner.recurring(name, cron, zone); }
  deadLetters(limit?: number): Promise<DeadLetter[]> { return this.runner.deadLetters(limit); }
}
// Applied by hand: parameter decorators are not available to this folder's TypeScript setting (as health.ts does).
Optional()(PlatformJobs, undefined, 0);
Inject(PLATFORM_JOBS_BOSS)(PlatformJobs, undefined, 0);
