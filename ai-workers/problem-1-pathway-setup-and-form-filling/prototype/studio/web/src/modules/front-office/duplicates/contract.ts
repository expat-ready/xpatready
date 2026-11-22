// FO-9s part 1 (R1.29; concept screens/FO-9s/concept.md r3): the answer of FO-9a's `POST /api/front-office/duplicates/check`,
// as the screen reads it (the server's own shape is ports/matching.ts `DuplicateCheckOut`; the web keeps its own zod, as
// sales/contract.ts does). A match names a person or company the viewer may open; `hidden` is 1 when another one matched
// that they may not (never how many, never named; AG-2-68 rule 11).
import { z } from "zod";

const Reason = z.discriminatedUnion("key", [
  z.object({ key: z.literal("EMAIL") }),
  z.object({ key: z.literal("PHONE") }),
  z.object({ key: z.literal("NAME"), similarity: z.number() }),
]);
export type Reason = z.infer<typeof Reason>;
const PersonMatch = z.object({ kind: z.literal("PERSON"), personId: z.string(), name: z.string(), score: z.number(), reasons: z.array(Reason), lead: z.string().nullable().optional() });
const CompanyMatch = z.object({ kind: z.literal("COMPANY"), companyId: z.string(), name: z.string(), score: z.number(), reasons: z.array(Reason) });
export const DuplicateCheckOut = z.object({
  matches: z.array(z.discriminatedUnion("kind", [PersonMatch, CompanyMatch])),
  hidden: z.number(),
  hiddenLine: z.string().nullable(),
});
export type DuplicateCheckOut = z.infer<typeof DuplicateCheckOut>;
export type PersonMatch = z.infer<typeof PersonMatch>;

/** BR-3: what matched, in words ("Same email", "Same phone", "Similar name (78%)"). */
export function reasonWords(rs: Reason[]): string {
  return rs.map((r) => r.key === "EMAIL" ? "Same email" : r.key === "PHONE" ? "Same phone" : `Similar name (${Math.floor(r.similarity * 100)}%)`).join(" · ");
}
