// PF-11 part 1: FirmExportPort's real adapter (ports/firm-export.ts). Each exporter runs inside one REPEATABLE READ, READ
// ONLY transaction opened inside withFirm(firmId) (PF-12: under the walls a read outside that scope returns nothing; a
// write is refused by the database), and its answer passes the port's one check (checkModuleExport).
import { Prisma, type PrismaClient } from "@prisma/client";
import { checkModuleExport, FirmExportRefused, type FirmExporter, type FirmExportPort, type ModuleExport } from "../../../../ports/firm-export.ts";
import { withFirm } from "../firm-scope.ts";

export type Tx = Prisma.TransactionClient;

export class PgFirmExport implements FirmExportPort<Tx> {
  private readonly list: { module: string; exporter: FirmExporter<Tx> }[] = [];
  constructor(private readonly db: PrismaClient) {}

  register(module: string, exporter: FirmExporter<Tx>) {
    if (this.list.some((m) => m.module === module)) throw new FirmExportRefused(`${module}: already registered`);
    this.list.push({ module, exporter });
  }

  modules() { return this.list.map((m) => m.module); }

  async collect(firmId: string): Promise<ModuleExport[]> {
    const out: ModuleExport[] = [];
    for (const m of this.list) {
      const raw = await withFirm(firmId, () => this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return m.exporter(firmId, tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 }));
      out.push(checkModuleExport(firmId, m.module, raw));
    }
    return out;
  }
}
