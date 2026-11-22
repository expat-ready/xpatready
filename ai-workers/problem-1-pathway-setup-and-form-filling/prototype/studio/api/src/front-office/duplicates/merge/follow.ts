// FO-9b part 1 (§8 M3 of the FO-9s concept, accepted on #2896; AG-2-68 rule 12; AG-2-16 §10 "the tombstone stays
// resolvable"): a person id that names a merged-away record is followed to its survivor. Reads only.
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
    const p = await db.foPerson.findFirst({ where: firmScope(firmId, { id }), select: { id: true, mergedIntoId: true } });
    if (!p) return null;
    if (!p.mergedIntoId) return p.id;
    id = p.mergedIntoId;
  }
  return null;
}
