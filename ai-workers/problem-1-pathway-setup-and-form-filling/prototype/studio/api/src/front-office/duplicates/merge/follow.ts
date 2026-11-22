// FO-9b part 1 (§8 M3 of the FO-9s concept, accepted on #2896; AG-2-68 rule 12; AG-2-16 §10 "the tombstone stays
// resolvable"): a person id that names a merged-away record is followed to its survivor. Writes nothing; its read share-locks each record it passes (the writer's transaction then waits for a merge in flight).
import type { PrismaClient } from "@prisma/client";
import type { Tx } from "../../sales/common.ts";
import { firmScope } from "../../../platform/firm-scope.ts";

/** At most this many hops (a merge chain is short: an Undo-first rule keeps it acyclic, AG-2-16 rule 5). */
const HOPS = 20;

/** The live person a person id resolves to: itself when it is live, its survivor when it was merged away; null when the
 *  firm has no such person. */
export async function livePersonId(db: Tx | PrismaClient, firmId: string, personId: string): Promise<string | null> {
  let id = personId;
  for (let i = 0; i < HOPS; i++) {
    // A locking read (break M1): inside the writer's transaction a merge in flight (which holds the row FOR UPDATE) is
    // waited for, and its tombstone then seen and followed; the row stays share-locked until the writer commits, so a
    // later merge waits for the writer and moves what it wrote.
    const [p] = await db.$queryRaw<{ id: string; merged_into_id: string | null }[]>`
      select "id"::text as id, "merged_into_id"::text as merged_into_id from "fo_person" where "firm_id" = ${firmScope(firmId).firmId}::uuid and "id" = ${id}::uuid for key share`;
    if (!p) return null;
    if (!p.merged_into_id) return p.id;
    id = p.merged_into_id;
  }
  return null;
}
