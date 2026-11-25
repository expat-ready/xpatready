// AUD-1c part 2 and AUD-2 part 2 (R1.97): the audit chain's checker on PF-14's runner (every 30 minutes, and weekly
// from seq 1), its alarm through PF-23's AlertPort, the integrity reads (GET /api/platform/audit/integrity, GET
// /api/system/audit/integrity), and the daily export to the write-once archive (S3 Object Lock, or the fake: bind.ts),
// whose newest anchor the checker compares on every pass.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { currentAlerts } from "../platform/observability/alerts.ts";
import { chooseAuditArchive } from "../platform/audit/write-once/bind.ts";
import { AuditChainExport, EXPORT_CRON, EXPORT_QUEUE, EXPORT_ZONE } from "../platform/audit/write-once/daily-export.ts";
import { DemoAuditChainController, FirmAuditIntegrityController, SystemAuditIntegrityController } from "../platform/audit/chain/routes.ts";
import { AuditChainVerifier, CHAIN_CHECK_CRON, CHAIN_CHECK_QUEUE, CHAIN_DEEP_CRON, CHAIN_DEEP_QUEUE, CHAIN_ZONE, DEEP_SLICES } from "../platform/audit/chain/verify.ts";

export default {
  controllers: [FirmAuditIntegrityController, SystemAuditIntegrityController, DemoAuditChainController],
  providers: [
    { provide: AuditChainExport, useFactory: async (db: Db, jobs: PlatformJobs) => {
      const x = new AuditChainExport({ db, archive: chooseAuditArchive().archive, now: () => new Date() });
      await jobs.handle(EXPORT_QUEUE, async () => { const r = await x.run(); if (r.failed.length) throw new Error(`audit export: ${r.failed.length} chain(s) not exported`); });
      await jobs.recurring(EXPORT_QUEUE, EXPORT_CRON, EXPORT_ZONE);
      return x;
    }, inject: [Db, PlatformJobs] },
    { provide: AuditChainVerifier, useFactory: async (db: Db, jobs: PlatformJobs, x: AuditChainExport) => {
      // currentAlerts() at each raise, so a test's useAlerts() fake is the one asked (as PF-23's own callers do).
      const v = new AuditChainVerifier({ db, alerts: { raise: (k, d) => currentAlerts().raise(k, d) }, now: () => new Date(), anchors: x });
      await jobs.handle(CHAIN_CHECK_QUEUE, async () => { await v.pass("incremental"); });
      await jobs.recurring(CHAIN_CHECK_QUEUE, CHAIN_CHECK_CRON, CHAIN_ZONE);
      await jobs.handle(CHAIN_DEEP_QUEUE, async (job) => { await v.pass("full", job.runAt.getUTCHours() % DEEP_SLICES); });   // part 5: the hour's slice
      await jobs.recurring(CHAIN_DEEP_QUEUE, CHAIN_DEEP_CRON, CHAIN_ZONE);
      return v;
    }, inject: [Db, PlatformJobs, AuditChainExport] },
  ],
} satisfies Feature;
