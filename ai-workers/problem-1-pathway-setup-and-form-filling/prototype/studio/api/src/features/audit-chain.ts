// AUD-1c part 2 (R1.97): the audit chain's checker on PF-14's runner (every 30 minutes, and weekly from seq 1), its
// alarm through PF-23's AlertPort, and the integrity reads (GET /api/platform/audit/integrity, GET /api/system/audit/integrity).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { currentAlerts } from "../platform/observability/alerts.ts";
import { DemoAuditChainController, FirmAuditIntegrityController, SystemAuditIntegrityController } from "../platform/audit/chain/routes.ts";
import { AuditChainVerifier, CHAIN_CHECK_CRON, CHAIN_CHECK_QUEUE, CHAIN_DEEP_CRON, CHAIN_DEEP_QUEUE, CHAIN_ZONE } from "../platform/audit/chain/verify.ts";

export default {
  controllers: [FirmAuditIntegrityController, SystemAuditIntegrityController, DemoAuditChainController],
  providers: [{ provide: AuditChainVerifier, useFactory: async (db: Db, jobs: PlatformJobs) => {
    // currentAlerts() at each raise, so a test's useAlerts() fake is the one asked (as PF-23's own callers do).
    const v = new AuditChainVerifier({ db, alerts: { raise: (k, d) => currentAlerts().raise(k, d) }, now: () => new Date() });
    await jobs.handle(CHAIN_CHECK_QUEUE, async () => { await v.pass("incremental"); });
    await jobs.recurring(CHAIN_CHECK_QUEUE, CHAIN_CHECK_CRON, CHAIN_ZONE);
    await jobs.handle(CHAIN_DEEP_QUEUE, async () => { await v.pass("full"); });
    await jobs.recurring(CHAIN_DEEP_QUEUE, CHAIN_DEEP_CRON, CHAIN_ZONE);
    return v;
  }, inject: [Db, PlatformJobs] }],
} satisfies Feature;
