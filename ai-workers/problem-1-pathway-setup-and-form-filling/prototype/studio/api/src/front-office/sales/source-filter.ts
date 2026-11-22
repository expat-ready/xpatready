// FO-4sf (AG-2-23 rule 1) and R1.30 (QA-533): the one Source filter. Leads, the prospects List and the board filter by the
// lead's stored source (AG-02 glossary: "where a lead came from … not the door"); a prospect's source is its lead's. The
// choices are the sources of the leads the person may see (FO-2v), so another person's free-text source is never named,
// and the same choices check every list: one unknown → 422 UNKNOWN_SOURCE with the allowed ones (PF-28 part 3a; was 400).
import type { PrismaClient } from "@prisma/client";
import { firmScope } from "../../platform/firm-scope.ts";
import { FIELD_ERROR_STATUS } from "../../platform/http/input.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import type { Tx, Visibility } from "./common.ts";

/** `?source=` given once or repeated (`source=A&source=B`; a source may hold a comma, so values are never split). Empty = all. */
export function sourcesAsked(q: unknown): string[] {
  return [...new Set((Array.isArray(q) ? q : q === undefined || q === null ? [] : [q]).map((x) => String(x).trim()).filter(Boolean))];
}

/** The firm's deactivated staff: their leads count as unassigned (BR-4). */
export async function inactiveStaff(db: Tx | PrismaClient, firmId: string): Promise<string[]> {
  return (await db.platformStaff.findMany({ where: firmScope(firmId, { status: { not: "ACTIVE" as const } }), select: { id: true } })).map((s) => s.id);
}

/** The leads a person may see, as a query (FO-2v): all, else their own and, when Unassigned is visible, those with no active owner. */
export function leadsSeenWhere(ctx: StaffContext, vis: Visibility, inactive: string[]) {
  return vis.seesAll ? {} : { OR: [{ ownerStaffId: ctx.staffId }, ...(vis.seesUnassigned ? [{ ownerStaffId: null }, { ownerStaffId: { in: inactive } }] : [])] };
}

/** The Source filter's choices: the stored sources of the leads this person may see, A to Z. GROUP BY in the database
 *  (review m5): one row per source, never every lead, and no cap that would hide a source. */
export async function sourcesSeen(db: Tx | PrismaClient, ctx: StaffContext, vis: Visibility, inactive?: string[]): Promise<string[]> {
  const off = inactive ?? (vis.seesAll ? [] : await inactiveStaff(db, ctx.firmId));
  const rows = await db.foLead.groupBy({ by: ["source"], where: firmScope(ctx.firmId, leadsSeenWhere(ctx, vis, off)), orderBy: { source: "asc" } });
  return rows.map((r) => r.source);
}

/** The sources asked, each one checked against the person's choices; any other → 422 UNKNOWN_SOURCE, `source`
 *  named (a field error, PF-28 part 3a; was 400; never ignored, QA-533). */
export async function sourcesChecked(db: Tx | PrismaClient, ctx: StaffContext, vis: Visibility, q: unknown, inactive?: string[]): Promise<string[]> {
  const asked = sourcesAsked(q);
  if (!asked.length) return asked;
  const allowed = await sourcesSeen(db, ctx, vis, inactive), bad = asked.filter((x) => !allowed.includes(x));
  return bad.length ? problem(FIELD_ERROR_STATUS, "Check the filter", `Unknown source: ${bad.join(", ").slice(0, 200)}. Choose from: ${allowed.join(", ").slice(0, 500) || "no source yet"}.`, { code: "UNKNOWN_SOURCE", allowed, fields: { source: "Choose a source from the list." } }) : asked;
}
