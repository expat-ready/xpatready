// PF-26 part 2 (R1.34; AG-2-93 rule 4 "identity and details"): the front office's first person-export section, the person
// record itself and every earlier record merged into it (FO-9b), complete and unmasked (rule 5). The leads, prospects,
// calls, notes and the rest of the front office are part 3a's sections, registered beside this one.
import type { Prisma } from "@prisma/client";
import type { ExportSubject, PersonExporter } from "../../../../ports/person-export.ts";
import { firmScope } from "../../platform/firm-scope.ts";

type Tx = Prisma.TransactionClient;
const iso = (d: Date | null) => d?.toISOString() ?? null;

export const personRecordExporter: PersonExporter<Tx> = {
  module: "front-office.person",
  declares: ["person"],
  async sections(tx: Tx, s: ExportSubject) {
    const rows = await tx.foPerson.findMany({ where: firmScope(s.firmId, { id: { in: s.records } }), orderBy: { createdAt: "asc" } });
    const order = new Map(s.records.map((id, i) => [id.toLowerCase(), i]));
    rows.sort((a, b) => (order.get(a.id.toLowerCase()) ?? 0) - (order.get(b.id.toLowerCase()) ?? 0));
    return [{ name: "person", title: "Identity and details", items: rows.map((p) => ({
      recordId: p.id, givenNames: p.givenNames, familyName: p.familyName, email: p.email, phone: p.phone, phoneReadable: p.phoneReadable,
      language: p.language, timeZone: p.timeZone, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
      mergedIntoId: p.mergedIntoId, mergedAt: iso(p.mergedAt),
    })) }];
  },
};
