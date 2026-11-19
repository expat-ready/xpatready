// CS-K1 part 2 (Build Lead C (4)'s ruling 2 of 20 Nov): live delivery of `prospect.won` to the case side, a polling
// publisher over the outbox (Transactional Outbox, polling-publisher variant). At app start, and then every
// PROSPECT_WON_POLL_MS (default 10000 ms, Sample), FO-8's catch-up runs (prospect-won.ts catchUpProspectsWon): the due
// prospects are listed on the one bypass use `cases.prospect-won.catch-up`, and each is made a client as its own firm
// (withFirm), never on the bypass. Single-flight: a run never starts while the last one is still going; it stops on
// shutdown. A prospect that fails is logged by id and the poll goes on. The case side reads the outbox only: no import
// from the front office, no in-process call from it. When the first run finds the job runner started, it queues the
// one-time client-link job of each firm with an unlinked client (client-link.ts). When PF-14's JobPort gets a schedule
// finer than a minute, a later row moves the poll onto it (its cron is minute-level, so not now).
import { Inject, Injectable, Optional, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { FO_PERSON_PORT, type FoPersonPort } from "../../../ports/fo-person.ts";
import { Db, Workspace } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { asBypass, withFirm } from "../platform/firm-scope.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { linkFirmClients, LINK_JOB, linkJobKey } from "./client-link.ts";
import { catchUpProspectsWon, type WonCatchUp } from "./prospect-won.ts";

export const CATCH_UP_USE = "cases.prospect-won.catch-up";
/** Sample: how often the outbox is read (ms). */
export const pollMs = () => Math.max(200, Number(process.env.PROSPECT_WON_POLL_MS) || 10_000);

export class ProspectWonPoll implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private linkQueued = false;
  /** The last run's result (a test reads it). */
  last: WonCatchUp | null = null;
  constructor(private readonly db: Db, private readonly ws: Workspace, private readonly foPerson: FoPersonPort<Prisma.TransactionClient>, private readonly jobs?: PlatformJobs) {}

  async onModuleInit() {
    await this.jobs?.handle(LINK_JOB, async (job) => {
      const r = await linkFirmClients(this.db, this.foPerson, job.firmId!);
      if (r.failed.length) console.warn(`CS-K1: ${r.failed.length} client(s) not linked: ${r.failed.map((f) => f.clientId).join(", ")}`);
    });
  }
  onApplicationBootstrap() { this.tick(); this.timer = setInterval(() => this.tick(), pollMs()); this.timer.unref(); }
  async onApplicationShutdown() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.running; }

  /** One run, unless one is still going (single-flight). */
  tick() { if (!this.running) this.running = this.run().finally(() => { this.running = null; }); return this.running; }

  private async run() {
    try {
      const deps = { workspaceId: await this.ws.id(), foPerson: this.foPerson, audit: auditEvent };
      await asBypass(CATCH_UP_USE, async () => {
        this.last = await catchUpProspectsWon(this.db, deps, (firmId, fn) => withFirm(firmId, fn));
        if (this.last.failed.length) console.warn(`FO-8: ${this.last.failed.length} won prospect(s) not taken in: ${this.last.failed.map((f) => f.prospectId).join(", ")}`);
        if (this.linkQueued || !this.jobs?.runner.started) return;
        const firms = await this.db.caseClient.findMany({ where: { firmId: { not: null }, foPersonId: null, foCompanyId: null }, distinct: ["firmId"], select: { firmId: true } });
        for (const { firmId } of firms) await this.jobs.enqueue(LINK_JOB, {}, { key: linkJobKey(firmId!), firmId: firmId! });
        this.linkQueued = true;
      });
    } catch (e) { console.warn(`FO-8: the won-prospect poll did not run: ${String(e).slice(0, 200)}`); }
  }
}
// Decorators as calls (this folder is outside api/tsconfig.json's decorator files, as web-address/routes.ts).
Injectable()(ProspectWonPoll);
[Db, Workspace, FO_PERSON_PORT, PlatformJobs].forEach((token, i) => Inject(token)(ProspectWonPoll, undefined, i));
Optional()(ProspectWonPoll, undefined, 3);
