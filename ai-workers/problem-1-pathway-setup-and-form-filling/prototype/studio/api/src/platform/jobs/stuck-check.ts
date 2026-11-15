// PF-23w (QA-452 (3); SA8-D40 "the stuck jobs limit is fixed in code"): the stuck-job check, a platform cron job run
// through PlatformJobs (so it is wrapped by observeJob like every other handler). Each run reads pg-boss's own job table
// (no table of ours) for jobs older than STUCK_JOB_MS: waiting ones (created or retry) whose due time passed that long
// ago, and active ones started that long ago. A job due tomorrow is not stuck. It hands them to PF-23's stuckJobs, which
// raises `job_stuck` (one alert per queue, naming its oldest job and the count). A job already in an alert is left out
// for ALERT_REPEAT_MS (5 min, Sample): the memory is this process's, as the brief rules (Lead B ruling 3, 15 Nov).
import { ALERT_REPEAT_MS, currentAlerts, STUCK_JOB_MS, stuckJobs } from "../observability/alerts.ts";
import type { AlertPort } from "../../../../ports/alert.ts";
import type { PgBossJobs } from "./pgboss-jobs.ts";
import { DEAD_LETTER } from "./pgboss-jobs.ts";

/** The cron job's queue and schedule: every minute, read in UTC (platform-wide, no firm). */
export const STUCK_CHECK_QUEUE = "platform.stuck_jobs";
export const STUCK_CHECK_CRON = "* * * * *";
/** The most jobs one check reads (oldest first); more than this stuck at once is one incident either way. */
const READ_LIMIT = 1000;

export type StuckCandidate = { queue: string; id: string; since: Date };

export class StuckCheck {
  readonly #alerted = new Map<string, number>();
  constructor(private readonly runner: PgBossJobs, private readonly alerts: () => AlertPort = currentAlerts) {}

  /** Jobs older than the limit by pg-boss's own clock (its TestClock in tests): waiting since their due time, or
   *  active since they started. pg-boss's own queues and the dead-letter list are left out. */
  async candidates(limitMs = STUCK_JOB_MS): Promise<StuckCandidate[]> {
    const before = new Date(this.runner.now() - limitMs);
    const { rows } = await this.runner.boss.getDb().executeSql(
      `select name, id, case when state = 'active' then started_on else start_after end as since
         from ${ident(this.runner.schema)}.job
        where state in ('created', 'retry', 'active') and name <> $1 and name not like '\\_\\_pgboss%'
          and case when state = 'active' then started_on else start_after end < $2
        order by since, id limit ${READ_LIMIT}`, [DEAD_LETTER, before]);
    return (rows as { name: string; id: string; since: Date | string }[]).map((r) => ({ queue: r.name, id: String(r.id), since: new Date(r.since) }));
  }

  /** One check: raises job_stuck for the queues holding a stuck job not alerted in the last 5 minutes; returns them. */
  async run(limitMs = STUCK_JOB_MS): Promise<string[]> {
    const now = this.runner.now();
    for (const [id, at] of this.#alerted) if (now - at >= ALERT_REPEAT_MS) this.#alerted.delete(id);
    const fresh = (await this.candidates(limitMs)).filter((j) => !this.#alerted.has(j.id));
    if (!fresh.length) return [];
    const queues = await stuckJobs(fresh, { now: () => new Date(now) }, this.alerts(), limitMs);
    for (const j of fresh) if (queues.includes(j.queue)) this.#alerted.set(j.id, now);
    return queues;
  }
}

const ident = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`jobs: not a schema name: ${s}`); return `"${s}"`; };
