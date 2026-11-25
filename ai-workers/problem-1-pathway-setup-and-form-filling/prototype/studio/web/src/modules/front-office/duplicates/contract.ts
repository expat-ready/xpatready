// FO-9s part 1 (R1.29; concept screens/FO-9s/concept.md r3): the answer of FO-9a's `POST /api/front-office/duplicates/check`,
// as the screen reads it (the server's own shape is ports/matching.ts `DuplicateCheckOut`; the web keeps its own zod, as
// sales/contract.ts does). A match names a person or company the viewer may open; `hidden` is 1 when another one matched
// that they may not (never how many, never named; AG-2-68 rule 11).
import { z } from "zod";
import { staffApi } from "../sales/session";

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

// FO-9s part 2 (concept r3 §4 S2, BR-6, BR-10): FO-9b part 2's review list (`GET duplicates/review?status=`) and its
// merge records (`GET duplicates/merges`), as People to merge reads them. A pair names both people with their newest
// lead number; `needsCaseSide` marks a pair merged from the client record only (BR-7).
const Card = z.object({ personId: z.string(), name: z.string(), lead: z.string().nullable() });
export const ReviewPair = z.object({
  id: z.string(), people: z.array(Card), score: z.number(), reasons: z.array(Reason), firstSeenAt: z.string(),
  status: z.enum(["OPEN", "MERGED", "KEPT_SEPARATE"]), decidedAt: z.string().nullable(), automatic: z.boolean(), needsCaseSide: z.boolean(),
});
export type ReviewPair = z.infer<typeof ReviewPair>;
export const ReviewList = z.object({ items: z.array(ReviewPair), openCount: z.number().optional() });
const Side = z.object({ personId: z.string(), name: z.string() });
export const MergeRecord = z.object({ id: z.string(), survivor: Side, loser: Side, automatic: z.boolean(), by: z.string(), at: z.string(), undoneAt: z.string().nullable() });
export type MergeRecord = z.infer<typeof MergeRecord>;
export const MergeList = z.object({ items: z.array(MergeRecord) });
/** The list, its tabs and Keep separate (AG-2-68 §8); Undo (and part 3's merge) need MERGE_KEY. */
export const REVIEW_KEY = "agent/prospect:edit";
export const MERGE_KEY = "agent/prospect:merge";
/** Who merged, in words: the system's merge by itself, the viewer, a named staff member, or "a staff member". Pure. */
export function mergedBy(m: Pick<MergeRecord, "automatic" | "by">, me: string, names: Map<string, string>): string {
  if (m.automatic) return "Merged automatically (an exact email or phone; no case, document or money)";
  const id = m.by.startsWith("staff:") ? m.by.slice(6) : "";
  return id === me ? "Merged by you" : `Merged by ${names.get(id) ?? "a staff member"}`;
}
/** One query per tab, shared by People to merge and the Sales menu's count (To review's openCount). */
export const reviewQuery = (status: "OPEN" | "KEPT_SEPARATE") => ({ queryKey: ["fo", "duplicates", "review", status], queryFn: async () => ReviewList.parse(await staffApi(`/front-office/duplicates/review?status=${status}`)) });
