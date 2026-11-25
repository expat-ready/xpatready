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

// FO-9s part 3 (concept r3 §4 S3, BR-8, BR-9, M7): the guided merge's preview and merge answers.
export const FieldPick = z.enum(["SURVIVOR", "LOSER"]);
export type FieldPick = z.infer<typeof FieldPick>;
const FieldRow = z.object({ field: z.string(), survivor: z.unknown(), loser: z.unknown(), pick: FieldPick });
export const Preview = z.object({
  pairId: z.string(), survivorId: z.string(), loserId: z.string(), needsCaseSide: z.boolean(), hasMoney: z.boolean(), fields: z.array(FieldRow),
  moves: z.object({ leads: z.number(), notes: z.number(), calls: z.number(), bookings: z.number() }),
  updatedAt: z.object({ survivor: z.string(), loser: z.string() }),
});
export type Preview = z.infer<typeof Preview>;
export const Merged = z.object({ mergeRef: z.string() });
/** The person's merge fields (ports/person-merge.ts MERGE_FIELDS.PERSON), in words. */
export const FIELD_LABEL: Record<string, string> = { givenNames: "First name", familyName: "Last name", email: "Email", phone: "Phone", language: "Language", timeZone: "Time zone" };
const present = (v: unknown) => v !== null && v !== undefined && v !== "";
/** BR-8: why the server's default was picked (ports/person-merge.ts defaultPick: the only value, else the newer record's,
 *  a tie keeping the record that stays). Pure; the pick itself is always the server's. */
export function fieldWhy(f: { survivor: unknown; loser: unknown }, at?: { survivor: string; loser: string }): string {
  if (!present(f.survivor) && !present(f.loser)) return "neither has it";
  if (present(f.survivor) !== present(f.loser)) return "only value";
  if (String(f.survivor) === String(f.loser)) return "same";
  return at && Date.parse(at.loser) === Date.parse(at.survivor) ? "the record that stays" : "newer";   // a tie (break r1 m2)
}
/** Word for word: the stale answer (concept §4) and a failed merge (AG-2-16 §11, Minor 4). */
export const STALE_WORDS = "One of these records changed. Reload to see it.";
export const MERGE_FAILED = "Could not merge. Nothing changed.";
/** No answer came back (break r1 M1): the merge may have gone through, so never "Nothing changed". */
export const MERGE_UNKNOWN = "We did not hear back, so the merge may have gone through. The list was read again: check the Merged tab before trying again.";
