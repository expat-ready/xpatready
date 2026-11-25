// PF-26 part 1: PersonExportPort's real registry, one per process (the export job, part 2, reads it). Modules register their
// exporter at start-up, in their feature's provider; rules 1 and 2 of ports/person-export.ts (registerInto), proven by its
// contract (tests/check_pf26_person_export_port.ts).
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { registerInto, type PersonExporter, type PersonExportPort } from "../../../../ports/person-export.ts";

type Tx = Prisma.TransactionClient;

@Injectable()
export class PersonExportRegistry implements PersonExportPort<Tx> {
  private readonly list: PersonExporter<Tx>[] = [];
  register(exporter: PersonExporter<Tx>): void { registerInto(this.list, exporter); }
  exporters(): ReadonlyArray<PersonExporter<Tx>> { return [...this.list]; }
}
