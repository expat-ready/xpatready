// PF-10b part 1 (R1.35): the one import engine's routes (api/src/platform/import/). Targets register on IMPORT_TARGETS
// (PF-10t registers people); until one does, the engine lists none and refuses every upload by name. The file store is
// the app's LocalFiles token (EntitledFiles: the plan's storage limit applies, front-office-retainers.ts); audit is
// PF-0p's AuditPort over audit_event.
import type { Prisma } from "@prisma/client";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { FilesPort } from "../../../ports/files.ts";
import { ImportTargets } from "../../../ports/import-target.ts";
import { LocalFiles } from "../front-office/files.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { ImportService } from "../platform/import/engine.ts";
import { ImportController } from "../platform/import/routes.ts";

/** The registry every area adds its import targets to (one per app). */
export const IMPORT_TARGETS = Symbol.for("platform.ImportTargets");

export default {
  controllers: [ImportController],
  providers: [
    { provide: IMPORT_TARGETS, useFactory: () => new ImportTargets<Prisma.TransactionClient>() },
    { provide: ImportService, useFactory: (db: Db, files: FilesPort, targets: ImportTargets<Prisma.TransactionClient>) => new ImportService({ db, audit: auditEvent, files, targets }), inject: [Db, LocalFiles, IMPORT_TARGETS] },
  ],
} satisfies Feature;
