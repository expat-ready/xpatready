// CS-K1 part 2 (Build Lead C (4)'s ruling 2 of 20 Nov): live delivery of `prospect.won` to the case side, a polling
// publisher over the outbox (Transactional Outbox, polling-publisher variant). At app start, and then every
// PROSPECT_WON_POLL_MS (default 10000 ms, Sample), FO-8's catch-up runs (prospect-won.ts catchUpProspectsWon): the due
// prospects are listed on the one bypass use `cases.prospect-won.catch-up`, and each is made a client as its own firm
// (withFirm), never on the bypass. Single-flight: a run never starts while the last one is still going; it stops on
// shutdown. A prospect that fails is logged by id and the poll goes on. The case side reads the outbox only: no import
// from the front office, no in-process call from it. While the job runner runs, each run queues the client-link job
// (client-link.ts) of each firm with a client still waiting, keyed on its oldest one (so once per waiting set; a job
// that fails a client throws, and pg-boss retries it); with none waiting, the link check is validated once. When PF-14's JobPort gets a schedule
// finer than a minute, a later row moves the poll onto it (its cron is minute-level, so not now).
import { Inject, Injectable, Optional, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { FO_PERSON_PORT, type FoPersonPort } from "../../../ports/fo-person.ts";
import { Db, Workspace } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { asBypass, touchFirms, withFirm } from "../platform/firm-scope.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { linkFirmClients, LINK_JOB, linkJobKey } from "./client-link.ts";
import { catchUpProspectsWon, type WonCatchUp } from "./prospect-won.ts";
import { logPort } from "../platform/observability/log.ts";
import { dbRuleOf } from "../platform/observability/redact.ts";

export const CATCH_UP_USE = "cases.prospect-won.catch-up";
/** Sample: how often the outbox is read (ms). */
export const pollMs = () => Math.min(3_600_000, Math.max(200, Number(process.env.PROSPECT_WON_POLL_MS) || 10_000));   // breaker F7

/** PF-12b (QA-499, P-607): how one run takes each due prospect. The list read crossed firms on CATCH_UP_USE, so each firm
 *  with a prospect tried this run gets its platform.bypass line once a run (its own transaction), before any of its
 *  clients is made as that firm (withFirm); a firm whose line cannot be written is not taken in: its prospects fail.
 *  `backoff` (the poller's, kept across runs; break M1 of 20 Nov): a prospect that failed is not tried again, and so
 *  writes no line, until its wait is over; the wait doubles from one poll to at most an hour (about 33 lines a day for a
 *  prospect that never succeeds, not one each poll). A prospect that succeeds leaves the backoff. */
export type WonBackoff = Map<string, { until: number; wait: number }>;
export const BACKOFF_MAX_MS = 3_600_000;
export function touchedEach(db: PrismaClient, backoff: WonBackoff = new Map(), now: () => number = Date.now, firstWait: number = pollMs()) {
  const lined = new Map<string, Promise<void>>();
  return async <T,>(firmId: string, fn: () => Promise<T>, prospectId: string): Promise<T | null> => {
    const key = `${firmId}:${prospectId}`, held = backoff.get(key);
    if (held && held.until > now()) return null;
    if (!lined.has(firmId)) lined.set(firmId, touchFirms(db, [firmId]));
    try {
      await lined.get(firmId)!;
      const r = await withFirm(firmId, fn);
      backoff.delete(key);
      return r;
    } catch (e) {
      const wait = held ? Math.min(BACKOFF_MAX_MS, held.wait * 2) : Math.min(BACKOFF_MAX_MS, firstWait);
      backoff.set(key, { until: now() + wait, wait });
      throw e;
    }
  };
}

export class ProspectWonPoll implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private validated = false;
  /** PF-12b: failed prospects wait before their next try (touchedEach). */
  private readonly backoff: WonBackoff = new Map();
  /** The last run's result (a test reads it). */
  last: WonCatchUp | null = null;
  constructor(private readonly db: Db, private readonly ws: Workspace, private readonly foPerson: FoPersonPort<Prisma.TransactionClient>, private readonly jobs?: PlatformJobs) {}

  async onModuleInit() {
    await this.jobs?.handle(LINK_JOB, async (job) => {
      const r = await linkFirmClients(this.db, this.foPerson, job.firmId!);
      if (r.failed.length) throw new Error(`CS-K1: ${r.failed.length} client(s) not linked: ${r.failed.map((f) => f.clientId).join(", ")}`);   // retried
    });
  }
  onApplicationBootstrap() { this.tick(); this.timer = setInterval(() => this.tick(), pollMs()); this.timer.unref(); }
  async onApplicationShutdown() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.running; }

  /** One run, unless one is still going (single-flight). */
  tick() { if (!this.running) this.running = this.run().finally(() => { this.running = null; }); return this.running; }

  private async run() {
    try {
      const deps = { workspaceId: await this.ws.id(), foPerson: this.foPerson, audit: auditEvent };
      // The outbox is walled (PF-12): only its read crosses firms; case_client is the case side's own table (review m7).
      this.last = await asBypass(CATCH_UP_USE, () => catchUpProspectsWon(this.db, deps, touchedEach(this.db, this.backoff)));
      if (this.last.failed.length) console.warn(`FO-8: ${this.last.failed.length} won prospect(s) not taken in: ${this.last.failed.map((f) => f.prospectId).join(", ")}`);
      if (!this.jobs?.runner.started) return;
      const waiting = await this.db.caseClient.findMany({ where: { firmId: { not: null }, foPersonId: null, foCompanyId: null }, distinct: ["firmId"], orderBy: [{ firmId: "asc" }, { clientNumber: "asc" }], select: { firmId: true, id: true } });
      for (const c of waiting) await this.jobs.enqueue(LINK_JOB, {}, { key: linkJobKey(c.firmId!, c.id), firmId: c.firmId! });
      if (!waiting.length && !this.validated) this.validated = (await this.db.$queryRaw<{ v: boolean }[]>`select case_client_validate_link_check() as v`)[0].v;   // review m3
    } catch (e) { logPort.error("won_prospect_poll_failed", e, { rule: dbRuleOf(e) }); }
  }
}
// Decorators as calls (this folder is outside api/tsconfig.json's decorator files, as web-address/routes.ts).
Injectable()(ProspectWonPoll);
[Db, Workspace, FO_PERSON_PORT, PlatformJobs].forEach((token, i) => Inject(token)(ProspectWonPoll, undefined, i));
Optional()(ProspectWonPoll, undefined, 3);
