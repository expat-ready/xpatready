// FO-7w1: RetainerFeesPort's adapter (ports/retainer-fees.ts): the retainer, its party and its current version's fee
// rows, read in the caller's transaction, firm-scoped (PF-12's walls). Read only.
import type { Prisma } from "@prisma/client";
import { RetainerFees, type RetainerFeesPort } from "../../../../ports/retainer-fees.ts";
import { firmScope } from "../../platform/firm-scope.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const retainerFeesPort: RetainerFeesPort<Prisma.TransactionClient> = {
  async read(tx, firmId, retainerId) {
    if (typeof firmId !== "string" || !UUID.test(firmId) || typeof retainerId !== "string" || !UUID.test(retainerId)) return null;   // never thrown (the contract)
    const r = await tx.foRetainer.findFirst({ where: firmScope(firmId, { id: retainerId.toLowerCase() }), select: { id: true, kind: true, status: true, subject: true, signerPersonId: true, companyId: true, currentVersion: true } });
    if (!r) return null;
    const v = await tx.foRetainerVersion.findFirst({ where: firmScope(firmId, { retainerId: r.id, n: r.currentVersion }), select: { fees: { orderBy: { position: "asc" } } } });
    return RetainerFees.parse({
      id: r.id, kind: r.kind, status: r.status,
      personId: r.subject === "PERSON" ? r.signerPersonId : null, companyId: r.subject === "COMPANY" ? r.companyId : null,
      rows: (v?.fees ?? []).map((f) => ({ id: f.id, position: f.position, label: f.label, amountMinor: f.amountMinor === null ? null : Number(f.amountMinor), currency: f.currency, when: f.when })),
    });
  },
};
