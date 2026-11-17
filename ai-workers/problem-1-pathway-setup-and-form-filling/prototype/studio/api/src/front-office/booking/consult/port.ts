// FO-3a part 2a (concept fo-3-booking Q3; brief FO-3a2.md): the ConsultRecordPort adapter FO-5's retainer draft calls
// (row FO-5cr) with the record's id. It reads through the service's one read, inside the caller's transaction; another
// firm's id, or an id that is not one, reads null (the contract case in tests/check_fo3a2_consult_record.ts).
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ConsultRecordPort } from "../../../../../ports/consult-record.ts";
import type { ConsultRecordService } from "./service.ts";

export const consultRecordPort = (svc: ConsultRecordService): ConsultRecordPort<Prisma.TransactionClient | PrismaClient> => ({
  read: (tx, firmId, recordId) => svc.read(tx, firmId, recordId),
});
