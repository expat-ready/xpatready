// PF-11 part 1: FirmExportPort's real adapter (ports/firm-export.ts). Each exporter runs inside one REPEATABLE READ, READ
// ONLY transaction opened inside withFirm(firmId) (PF-12: under the walls a read outside that scope returns nothing; a
// write is refused by the database), and its answer passes the port's one check (checkModuleExport).
import { Prisma, type PrismaClient } from "@prisma/client";
import { exportRegistry, type FirmExporter, type FirmExportPort, type ModuleExport } from "../../../../ports/firm-export.ts";
import { withFirm } from "../firm-scope.ts";

export type Tx = Prisma.TransactionClient;

export class PgFirmExport implements FirmExportPort<Tx> {
  private readonly r: FirmExportPort<Tx>;
  constructor(db: PrismaClient) {
    this.r = exportRegistry<Tx>((firmId, exporter) => withFirm(firmId, () => db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return exporter(firmId, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 })));
  }
  register(module: string, exporter: FirmExporter<Tx>) { this.r.register(module, exporter); }
  modules() { return this.r.modules(); }
  collect(firmId: string): Promise<ModuleExport[]> { return this.r.collect(firmId); }
}
