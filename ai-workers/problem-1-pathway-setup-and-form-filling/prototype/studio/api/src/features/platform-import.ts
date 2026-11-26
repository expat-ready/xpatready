// PF-10b part 1 (R1.35): the one import engine's routes (api/src/platform/import/). Targets register on IMPORT_TARGETS
// (PF-10t registers people); until one does, the engine lists none and refuses every upload by name. The file store is
// the app's LocalFiles token (EntitledFiles: the plan's storage limit applies, front-office-retainers.ts); audit is
// PF-0p's AuditPort over audit_event; the run is a job on PF-14's PlatformJobs (STANDARDS §3), registered once.
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { FilesPort } from "../../../ports/files.ts";
import { ImportTargets } from "../../../ports/import-target.ts";
import type { JobPort } from "../../../ports/jobs.ts";
import { LocalFiles } from "../front-office/files.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { ImportService, RUN_JOB } from "../platform/import/engine.ts";
import { ImportController } from "../platform/import/routes.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";

/** The registry every area adds its import targets to (one per app). */
export const IMPORT_TARGETS = Symbol.for("platform.ImportTargets");

const registered = new WeakSet<JobPort>();
/** Registers the run job's handler when the app starts (before PF-14's worker starts). */
export async function registerImportJobs(jobs: JobPort, svc: ImportService): Promise<void> {
  if (registered.has(jobs)) return;
  registered.add(jobs);
  await jobs.handle(RUN_JOB, async (job) => { if (job.firmId) await svc.work(job.firmId, String(job.payload.batchId)); });
}
@Injectable()
export class ImportJobs implements OnModuleInit {
  constructor(@Inject(PlatformJobs) private readonly jobs: JobPort, @Inject(ImportService) private readonly svc: ImportService) {}
  onModuleInit() { return registerImportJobs(this.jobs, this.svc); }
}

export default {
  controllers: [ImportController],
  providers: [
    { provide: IMPORT_TARGETS, useFactory: () => new ImportTargets<Prisma.TransactionClient>() },
    { provide: ImportService, useFactory: (db: Db, files: FilesPort, targets: ImportTargets<Prisma.TransactionClient>, jobs: JobPort) => new ImportService({ db, audit: auditEvent, files, targets, jobs }), inject: [Db, LocalFiles, IMPORT_TARGETS, PlatformJobs] },
    ImportJobs,
  ],
} satisfies Feature;
