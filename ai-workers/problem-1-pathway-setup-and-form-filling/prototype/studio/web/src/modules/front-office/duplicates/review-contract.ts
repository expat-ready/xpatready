// FO-9s part 2 (R1.29; concept screens/FO-9s/concept.md r3 §4 S2, BR-6, BR-10): FO-9b part 2's review list
// (`GET duplicates/review?status=`) and its merge records (`GET duplicates/merges`), as People to merge reads them. A pair
// names both people with their newest lead number; `needsCaseSide` marks a pair merged from the client record only (BR-7).
import { z } from "zod";
import { staffApi } from "../sales/session";
import { Reason } from "./contract";
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
/** BR-7, word for word (FO-9b part 2, review.ts CASE_SIDE_LINE). */
export const CASE_SIDE_LINE = "This person has a case; merge them from the client record.";
/** Who merged, in words: the system's merge by itself, the viewer, a named staff member, or "a staff member". Pure. */
export function mergedBy(m: Pick<MergeRecord, "automatic" | "by">, me: string, names: Map<string, string>): string {
  if (m.automatic) return "Merged automatically (an exact email or phone; no case, document or money)";
  const id = m.by.startsWith("staff:") ? m.by.slice(6) : "";
  return id === me ? "Merged by you" : `Merged by ${names.get(id) ?? "a staff member"}`;
}
/** One query per tab, shared by People to merge and the Sales menu's count (To review's openCount). */
export const reviewQuery = (status: "OPEN" | "KEPT_SEPARATE") => ({ queryKey: ["fo", "duplicates", "review", status], queryFn: async () => ReviewList.parse(await staffApi(`/front-office/duplicates/review?status=${status}`)) });
