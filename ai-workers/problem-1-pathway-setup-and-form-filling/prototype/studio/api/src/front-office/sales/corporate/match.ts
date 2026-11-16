// FO-2b (AG-2-79): the company match at Corporate Engage and Change type. Suggest only: a hit is offered, never linked
// (rule 7); staff pick one or say "New company". Month one reads the one key fo_company holds, the normalised name
// (rule 3); the business number, website domain and main phone keys wait for AG-7-72's company fields (not known yet).
import type { PrismaClient } from "@prisma/client";
import { firmScope } from "../../../platform/firm-scope.ts";
import type { Tx } from "../common.ts";

/** AG-2-79 rule 3: case-folded, punctuation removed, and the words ltd, limited, inc, incorporated, corp, corporation,
 *  co, llc dropped. "Pine Bakery Ltd" and "pine bakery, ltd." are both "pine bakery". */
const DROPPED = new Set(["ltd", "limited", "inc", "incorporated", "corp", "corporation", "co", "llc"]);
export function normaliseCompanyName(name: string): string {
  const words = name.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);   // marks kept: रामा ≠ रीमा (Devin)
  const kept = words.filter((w) => !DROPPED.has(w));
  return (kept.length ? kept : words).join(" ");   // a name made only of dropped words ("Co. Inc.") keeps them
}

/** A match the viewer may see names the company; one they may not (none of its prospects is theirs) is only said to
 *  exist, with no id, so it cannot be picked or read (Devin: AG-2-79 §8, seeing a matched company follows AG-2-64). */
export type CompanyOffer = { companyId: string | null; name: string; matchedOn: "ORG_NAME"; openProspects: { id: string; number: string }[] };

/** The firm's companies with the same normalised name, oldest first, each with its open (ACTIVE or NURTURE) Corporate
 *  prospects the viewer may see (AG-2-79 rule 8 offers "add to it"; seeing a prospect follows AG-2-64). */
/** Who sees a company (AG-2-64 through its prospects): one of its prospects is theirs to see; a company with no
 *  prospect (its only one changed back to Individual) is seen by whoever sees all, or made it. */
export type Seer = { see: (ownerStaffId: string | null) => boolean; seesAll: boolean; actor: string };
export const seesCompany = (s: Seer, c: { createdBy: string; prospects: { ownerStaffId: string | null }[] }) =>
  c.prospects.some((p) => s.see(p.ownerStaffId)) || (!c.prospects.length && (s.seesAll || c.createdBy === s.actor));

export async function companyMatches(db: Tx | PrismaClient, firmId: string, name: string, s: Seer): Promise<CompanyOffer[]> {
  const normalisedName = normaliseCompanyName(name);
  if (!normalisedName) return [];
  const rows = await db.foCompany.findMany({
    where: firmScope(firmId, { normalisedName }), orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
    include: { prospects: { select: { id: true, number: true, ownerStaffId: true, stage: { select: { kind: true } } }, orderBy: { number: "asc" } } },
  });
  return rows.map((c) => {
    const seen = c.prospects.filter((p) => s.see(p.ownerStaffId));
    if (!seesCompany(s, c)) return { companyId: null, name: "A company with this name that you cannot see", matchedOn: "ORG_NAME" as const, openProspects: [] };
    return { companyId: c.id, name: c.operatingName, matchedOn: "ORG_NAME" as const, openProspects: seen.filter((p) => p.stage.kind === "ACTIVE" || p.stage.kind === "NURTURE").map(({ id, number }) => ({ id, number })) };
  });
}
