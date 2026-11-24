// FO-3v part 1 (BACKLOG row FO-3v; brief lead-b-briefs/FO-3v.md; AG-4-58 rules 2-5, §7-§10, §12; AG-4-59; AG-4-29 rules
// 2, 5-7, 9, §7, §9, §10; AG-16-73): each person's own video settings, and the link a Video booking gets from them.
//   * My account → Video is the caller's own record only (AG-4-59 rule 1): there is no route that takes another person's
//     id, and a body naming one (staffId, userId) is refused 403 with nothing saved. No permission key (rule 2; AG-4-58
//     rule 5): every signed-in staff member, every plan.
//   * My meeting link: one https URL, at most 2,048 characters; anything else is 422 "Enter a full link starting with
//     https://" and nothing is saved (AG-4-58 rule 2). The database checks the same (fo_video_link_ok).
//   * "Use for my video bookings" lists only the sources the person has, in the fixed order Meet/Teams → Zoom → My
//     meeting link, and is pre-set to the first (rule 3). Part 1 has only My meeting link: Meet/Teams come with the
//     calendar connection (map row 43, not shaped) and Zoom is hidden until Zoom approves the app (rule 1; part 2).
//     Clearing the link moves the choice to the next source the person has, or none (rule 4).
//   * The link for a booking (`linkFor`): the host's choice wins (AG-4-29 rule 2); if that source is empty, the next in
//     the order; else none ("Your join link will follow.", rule 7). A deactivated or suspended host's link is never
//     used. It is a plain read of saved values (no network), so it runs inside the booking's transaction and cannot
//     fail on its own; part 2's Zoom call runs after the commit.
//   * Audit "meeting link changed" and "video choice changed" through AuditPort.record(tx, …), never the URL (AG-4-58
//     §9): the line says only whether a link is saved. No link in any log line (§10).
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { parseInput } from "../../../platform/http/input.ts";

type Tx = Prisma.TransactionClient;
export type VideoPorts = { audit: AuditPort<Tx> };

export const VIDEO_WORDS = {
  link: "Enter a full link starting with https://",
  choice: "Choose one of your video sources.",
  notYours: "You can change only your own video settings.",
  noLink: "Your join link will follow.",
} as const;

/** The fixed order of AG-4-29 rule 6 and AG-4-58 rule 3. */
export const SOURCE_ORDER = ["CALENDAR", "ZOOM", "MY_LINK"] as const;
export type VideoSource = (typeof SOURCE_ORDER)[number];
export type Provider = "GOOGLE_MEET" | "TEAMS" | "ZOOM" | "MY_LINK" | "MANUAL";
type Pref = { myMeetingLink: string | null; sourceChoice: VideoSource | null };

const TX = { maxWait: 10_000, timeout: 20_000 };
const MAX = 2048;
/** One https URL with a host, no white space or control character anywhere (a calendar file or an email never reads a
 *  new line or field from it), at most 2,048 characters. */
export function linkOk(s: string): boolean {
  if ([...s].length > MAX || !/^https:\/\/[^\s\u0000-\u001f\u007f-\u009f\u2028\u2029]+$/.test(s)) return false;
  try { const u = new URL(s); return u.protocol === "https:" && u.hostname.length > 0 && !u.username && !u.password; } catch { return false; }
}
const Link = z.string({ error: VIDEO_WORDS.link }).refine((s) => s === "" || linkOk(s), VIDEO_WORDS.link);
export const VideoBody = z.strictObject({
  /** null or "" clears the link. */
  myMeetingLink: Link.nullable().optional(),
  sourceChoice: z.enum(SOURCE_ORDER, { error: VIDEO_WORDS.choice }).nullable().optional(),
});

const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${slug}`, title, status, detail, ...extra }, status);

/** The sources a person has now (part 1: My meeting link once saved; Meet/Teams and Zoom are not offered yet). */
export const sourcesOf = (p: Pick<Pref, "myMeetingLink">): VideoSource[] => SOURCE_ORDER.filter((s) => s === "MY_LINK" && !!p.myMeetingLink);
/** The choice kept or moved (rules 3, 4): the one asked for, else the current one while the person still has it, else
 *  the first source they have, else none. */
const settle = (p: Pref, asked: VideoSource | null | undefined): VideoSource | null => {
  const have = sourcesOf(p);
  if (asked !== undefined && asked !== null) return asked;
  if (asked === null) return null;
  return p.sourceChoice && have.includes(p.sourceChoice) ? p.sourceChoice : have[0] ?? null;
};

/** The link a Video booking with this host gets (AG-4-29 rules 2, 6, 7), or null: the host's choice first, then the
 *  sources in the fixed order. Inside the booking's transaction; reads only. An inactive host has none. */
export async function linkFor(db: Tx | PrismaClient, firmId: string, staffId: string): Promise<{ link: string; provider: Provider; source: VideoSource } | null> {
  const host = await db.platformStaff.findFirst({ where: firmScope(firmId, { id: staffId }), select: { status: true, foVideoPref: { select: { myMeetingLink: true, sourceChoice: true } } } });
  if (!host || host.status !== "ACTIVE" || !host.foVideoPref) return null;
  const p = host.foVideoPref as Pref;
  const value = (s: VideoSource): { link: string; provider: Provider } | null => s === "MY_LINK" && p.myMeetingLink ? { link: p.myMeetingLink, provider: "MY_LINK" } : null;   // CALENDAR, ZOOM: part 2 and map row 43
  for (const s of [...(p.sourceChoice ? [p.sourceChoice] : []), ...SOURCE_ORDER]) { const v = value(s); if (v) return { ...v, source: s }; }
  return null;
}

export class VideoService {
  constructor(private readonly db: PrismaClient, private readonly ports: VideoPorts) {}

  /** GET my video settings: the link, the choice and the sources I have (what the panel lists), Zoom's door state. */
  async get(ctx: StaffContext) {
    const p = await this.db.foVideoPref.findFirst({ where: firmScope(ctx.firmId, { staffId: ctx.staffId }), select: { myMeetingLink: true, sourceChoice: true } });
    return this.answer((p as Pref | null) ?? { myMeetingLink: null, sourceChoice: null });
  }

  /** PUT my video settings: only the fields sent change. Another person's id in the body → 403, nothing saved. */
  async put(ctx: StaffContext, body: unknown) {
    if (body !== null && typeof body === "object" && ["staffId", "userId", "staff_id", "personId"].some((k) => Object.hasOwn(body, k)))
      throw problem(403, "not-your-record", "Not allowed", VIDEO_WORDS.notYours, { code: "OWN_RECORD_ONLY" });
    const v = parseInput(VideoBody, body ?? {});
    return this.db.$transaction(async (tx) => {
      const before = ((await tx.foVideoPref.findFirst({ where: firmScope(ctx.firmId, { staffId: ctx.staffId }), select: { myMeetingLink: true, sourceChoice: true } })) as Pref | null) ?? { myMeetingLink: null, sourceChoice: null };
      const link = v.myMeetingLink === undefined ? before.myMeetingLink : v.myMeetingLink || null;
      const next: Pref = { myMeetingLink: link, sourceChoice: null };
      next.sourceChoice = settle({ ...next, sourceChoice: before.sourceChoice }, v.sourceChoice);
      if (next.sourceChoice && !sourcesOf(next).includes(next.sourceChoice))
        throw problem(422, "video-refused", "Check the details", `One field needs a change: sourceChoice: ${VIDEO_WORDS.choice} Nothing was saved.`, { code: "INVALID", fields: { sourceChoice: VIDEO_WORDS.choice } });
      const linkChanged = next.myMeetingLink !== before.myMeetingLink, choiceChanged = next.sourceChoice !== before.sourceChoice;
      if (!linkChanged && !choiceChanged) return this.answer(before);
      const row = await tx.foVideoPref.upsert({ where: { firmId_staffId: { firmId: ctx.firmId, staffId: ctx.staffId } }, create: { firmId: ctx.firmId, staffId: ctx.staffId, ...next }, update: next, select: { id: true } });
      const actor = `staff:${ctx.staffId}`;
      // Never the URL (AG-4-58 §9): whether a link is saved, and the choice.
      if (linkChanged) await this.ports.audit.record(tx, { firmId: ctx.firmId, actor, action: "video.meeting_link_changed", entity: "fo_video_pref", entityKey: row.id, summary: next.myMeetingLink ? "Meeting link changed." : "Meeting link cleared.", detail: { staffId: ctx.staffId }, before: { hasLink: !!before.myMeetingLink }, after: { hasLink: !!next.myMeetingLink } });
      if (choiceChanged) await this.ports.audit.record(tx, { firmId: ctx.firmId, actor, action: "video.choice_changed", entity: "fo_video_pref", entityKey: row.id, summary: "Video choice changed.", detail: { staffId: ctx.staffId }, before: { sourceChoice: before.sourceChoice }, after: { sourceChoice: next.sourceChoice } });
      return this.answer(next);
    }, TX);
  }

  private answer(p: Pref) {
    return { myMeetingLink: p.myMeetingLink, sourceChoice: p.sourceChoice, sources: sourcesOf(p), zoomAvailable: false, calendarAvailable: false };
  }
}
