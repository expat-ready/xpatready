// FO-3a part 2a (concept fo-3-booking Q3; brief FO-3a2.md): the ConsultRecordPort adapter FO-5's retainer draft calls
// (row FO-5cr) with the record's id. It reads through the service's one read, inside the caller's transaction; another
// firm's id, or an id that is not one, reads null (ports/contracts/consult-record-port.contract.ts, run by
// tests/check_fo3a2_consult_record.ts on this adapter and on the fake).
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ConsultRecordPort, ConsultRecordRead } from "../../../../../ports/consult-record.ts";
import type { ConsultRecordService } from "./service.ts";

type Db = Prisma.TransactionClient | PrismaClient;

export class PgConsultRecords implements ConsultRecordPort<Db> {
  /** `db`: the client a read without a transaction uses. */
  constructor(private readonly svc: ConsultRecordService, private readonly db: Db) {}
  read(tx: Db | undefined, firmId: string, recordId: string): Promise<ConsultRecordRead | null> { return this.svc.read(tx ?? this.db, firmId, recordId); }
}
