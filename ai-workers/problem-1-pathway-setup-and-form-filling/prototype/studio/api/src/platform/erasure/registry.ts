// PF-21d part 1a: ErasurePort's real registry, one per process (the erasure job reads it). Modules register their eraser at
// start-up, in their feature's provider; rules 1 and 2 of ports/erasure.ts (registerInto), proven by its contract.
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { registerInto, type Eraser, type ErasurePort } from "../../../../ports/erasure.ts";

type Tx = Prisma.TransactionClient;

@Injectable()
export class ErasureRegistry implements ErasurePort<Tx> {
  private readonly list: Eraser<Tx>[] = [];
  register(eraser: Eraser<Tx>): void { registerInto(this.list, eraser); }
  erasers(): ReadonlyArray<Eraser<Tx>> { return [...this.list]; }
}
