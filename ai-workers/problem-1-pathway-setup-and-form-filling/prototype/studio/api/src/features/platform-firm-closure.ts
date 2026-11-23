// PF-11c part 1 (R1.105): day 90, the firm is closed, archived first, never deleted early. The daily sweep on PF-14's
// runner, asking PF-21b's legal holds (PgLegalHolds) first. The write-once archive (AuditArchivePort) has no real adapter
// until AUD-2's S3 part: CLOSURE_ARCHIVE is unset, and PF-11's full export (FullExportPort) does not exist yet, so a due firm is not closed and firm_closure_blocked is raised. No route.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { AuditArchivePort } from "../../../ports/audit-archive.ts";
import { BILLING_PORTS } from "../platform/billing/routes.ts";
import type { BillingPorts } from "../platform/billing/webhook.ts";
import { FirmClosure } from "../platform/firm-closure/closure.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { currentAlerts } from "../platform/observability/alerts.ts";
import { PgLegalHolds } from "../platform/register/holds/adapter.ts";

/** The write-once archive's adapter, when one is wired (AUD-2's S3 part). */
export const CLOSURE_ARCHIVE = Symbol("FirmClosure.archive");

export default {
  providers: [{ provide: FirmClosure, useFactory: async (db: Db, ports: BillingPorts, jobs: PlatformJobs, holds: PgLegalHolds, archive: AuditArchivePort | undefined) => {
    const closure = new FirmClosure({ db, audit: ports.audit, archive: archive ?? null, holds, fullExport: null, alerts: currentAlerts, now: () => ports.clock.now() });
    await closure.register(jobs);
    return closure;
  }, inject: [Db, BILLING_PORTS, PlatformJobs, PgLegalHolds, { token: CLOSURE_ARCHIVE, optional: true }] }],
} satisfies Feature;
