// FO-9b part 2m (R1.29; BACKLOG "FO-9b part 2m", AG-2-16 r5, P-574 (2)): no money is ever written on a merged-away
// person or company. Every client-money writer that names a party calls `liveParty` inside its transaction, after the
// party's trust lock where it takes one (FO-7lk's order), before anything is written. It reads the party row FOR KEY
// SHARE, held to the end of the transaction:
// * a merge holding the row (FOR UPDATE NOWAIT, duplicates/merge/service.ts) makes this wait; once the merge commits, the
//   row is read again (READ COMMITTED) and shows merged_into_id: 409 PARTY_MERGED, nothing written;
// * a merge that comes while this holds the row finds it held (NOWAIT, busy, retried) until this commits, and then its own
//   hasMoney read sees the money (HAS_MONEY): a merge of a person with money stays refused.
// The survivor's id is named only when the caller sees it (C5 scope); otherwise the same words without it. A party not
// of this firm reads as missing (404), as the writers' own reads already answer.
import type { Prisma } from "@prisma/client";
import { firmScope } from "../platform/firm-scope.ts";
import { problem } from "../platform/identity/keys.ts";

type Tx = Prisma.TransactionClient;
/** The caller's money scope: MoneyScope ("ALL" or lists) or MoneyVisibility (lists); only `parties` is read. */
export type SeenParties = "ALL" | { parties: string[] };

/** 409 PARTY_MERGED when `partyId` (a person or company of the firm) has been merged away; else holds its row FOR KEY
 *  SHARE to the end of the transaction. A null party (none named) is nothing to check. */
export async function liveParty(tx: Tx, firm: string, partyId: string | null | undefined, seen?: SeenParties): Promise<void> {
  if (!partyId) return;
  const f = firmScope(firm).firmId, id = partyId.toLowerCase();
  let [r] = await tx.$queryRaw<{ merged: string | null }[]>`select merged_into_id::text as merged from fo_person where firm_id = ${f}::uuid and id = ${id}::uuid for key share`;
  let kind: "person" | "company" = "person";
  if (!r) { [r] = await tx.$queryRaw<{ merged: string | null }[]>`select merged_into_id::text as merged from fo_company where firm_id = ${f}::uuid and id = ${id}::uuid for key share`; kind = "company"; }
  if (!r) return problem(404, "Not found", "No such person or company in your firm.", { code: "NOT_FOUND" });
  if (!r.merged) return;
  const shown = seen !== undefined && (seen === "ALL" || seen.parties.includes(r.merged));
  problem(409, "Not possible now", `This ${kind} was merged into another record, so no money is recorded on it. ${shown ? "Use the record it was merged into." : "Ask someone who sees the record it was merged into."} Nothing was saved.`,
    { code: "PARTY_MERGED", ...(shown ? { survivorId: r.merged } : {}) });
}
