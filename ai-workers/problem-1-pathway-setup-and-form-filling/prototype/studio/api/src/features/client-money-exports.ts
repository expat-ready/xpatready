// FO-7r part 3 (R1.111): the period exports (api/src/client-money/reports/exports.ts) on the app's database, the app's
// FilesPort (LocalFiles), PF-14's job runner (PlatformJobs), AuditPort's adapter over audit_event and the platform clock.
// The worker is registered once per runner when the app starts; an app without a runner answers POST with 503.
import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { FilesPort } from "../../../ports/files.ts";
import type { JobPort } from "../../../ports/jobs.ts";
import { MoneyExportsController } from "../client-money/reports/export-routes.ts";
import { MoneyExports } from "../client-money/reports/exports.ts";
import { LocalFiles } from "../front-office/files.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";

const armed = new WeakSet<object>();

@Injectable()
export class MoneyExportJobs implements OnModuleInit {
  constructor(@Inject(MoneyExports) private readonly exports: MoneyExports, @Optional() @Inject(PlatformJobs) private readonly jobs?: JobPort) {}
  async onModuleInit() {
    if (!this.jobs || armed.has(this.jobs)) return;
    armed.add(this.jobs);
    try { await this.exports.register(); } catch (e) { armed.delete(this.jobs); throw e; }
  }
}

export default { controllers: [MoneyExportsController], providers: [
  { provide: MoneyExports, useFactory: (db: Db, files: FilesPort, c: PlatformClock, jobs?: JobPort) => new MoneyExports({ db, files, jobs: jobs ?? null, audit: auditEvent, clock: { now: () => new Date(c.now()) } }),
    inject: [Db, LocalFiles, PlatformClock, { token: PlatformJobs, optional: true }] },
  MoneyExportJobs] } satisfies Feature;
