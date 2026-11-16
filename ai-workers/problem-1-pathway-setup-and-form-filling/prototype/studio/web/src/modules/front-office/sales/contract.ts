// FO-4 part 1: the shapes the sales screens read, mirroring FO-2 part 1's answers (api/src/front-office/sales/leads.ts,
// public.ts) and PF-4's `GET /api/platform/me`. Parsed at the edge, so a changed answer fails loudly, not on a screen.
import { z } from "zod";
export type Problem = { status?: number; title?: string; detail?: string; code?: string; fields?: Record<string, string>; ownerStaffId?: string };
/** A refused answer as Problem Details, or a plain one when the body is not (a proxy page, an empty 502). */
export function problemOf(data: unknown, status: number): Problem {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const fields = d.fields && typeof d.fields === "object" ? Object.fromEntries(Object.entries(d.fields as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string> : undefined;
    return { status, title: typeof d.title === "string" ? d.title : undefined, detail: typeof d.detail === "string" ? d.detail : undefined, code: typeof d.code === "string" ? d.code : undefined, fields, ownerStaffId: typeof d.ownerStaffId === "string" ? d.ownerStaffId : undefined };
  }
  return { status, detail: status >= 500 ? "Something went wrong on our side. Please try again." : `The request was refused (${status}).` };
}
export const Me = z.object({ staffId: z.string(), firmId: z.string(), firmKey: z.string(), displayName: z.string(), roles: z.array(z.string()), keys: z.array(z.string()) });
export type Me = z.infer<typeof Me>;
const when = z.string().nullable();
export const LeadRow = z.object({
  id: z.string(), number: z.string(), name: z.string(), state: z.string(), source: z.string(), interestedIn: z.string().nullable(),
  ownerStaffId: z.string().nullable(), owner: z.string().nullable(), arrivedAt: z.string(), possibleMatch: z.boolean(), fixNumber: z.boolean(),
});
export type LeadRow = z.infer<typeof LeadRow>;
export const LeadRows = z.array(LeadRow);
export const Lead = z.object({
  id: z.string(), number: z.string(), label: z.string(), state: z.string(), door: z.string(), source: z.string(), sourceDetail: z.string().nullable(),
  interestedIn: z.string().nullable(), ownerStaffId: z.string().nullable(), owner: z.string().nullable(), arrivedAt: z.string(), firstResponseAt: when,
  closeReason: z.string().nullable(), closeNote: z.string().nullable(), closedAt: when,
  person: z.object({ id: z.string(), givenNames: z.string().nullable(), familyName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), fixNumber: z.boolean() }),
  possibleMatch: z.object({ personId: z.string().nullable(), line: z.string() }).nullable(),
  attribution: z.record(z.string(), z.unknown()).nullable(),
});
export type Lead = z.infer<typeof Lead>;
/** A change the viewer may no longer see (assigned away while "everyone sees all" is off) answers only that it is done. */
export const LeadChanged = z.union([Lead, z.object({ id: z.string(), done: z.literal(true) })]);
export const PublicForm = z.object({
  name: z.string(), thankYouText: z.string(), interestedIn: z.array(z.object({ id: z.string(), label: z.string() })),
  consentText: z.string().nullable(), submissionId: z.string(), loadStamp: z.string(),
});
export type PublicForm = z.infer<typeof PublicForm>;
export const Thanks = z.object({ thankYouText: z.string() });
/** The permission keys each button needs (concept §6 as ruled on #1813: reads use `agent/prospect:show`). */
export const KEY = { show: "agent/prospect:show", edit: "agent/prospect:edit", assign: "agent/prospect:assign", viewAll: "agent/prospect:view.all" } as const;
/** A stored code in plain words (EXPERIENCE §5): the lead's source and state. */
const WORDS: Record<string, string> = { WEBSITE: "Website form", OPEN: "Open", CLOSED: "Closed" };
export const words = (code: string) => WORDS[code] ?? (code.charAt(0) + code.slice(1).toLowerCase()).replace(/_/g, " ");
/** FO-4sf (AG-2-23 rule 1): the lead's arrival door, the list's Source filter (`?source=`), in plain words. */
export const SOURCES = [{ code: "WEB_FORM", label: "Web form" }, { code: "MANUAL", label: "Added by staff" }, { code: "BOOKING", label: "Booking" }] as const;
export type SourceCode = (typeof SOURCES)[number]["code"];
/** The known codes of a `?source=` value, in the list's order; anything else is dropped (the API refuses it). */
export const sourcesIn = (raw: string | null): SourceCode[] => { const asked = new Set((raw ?? "").split(",")); return SOURCES.filter((s) => asked.has(s.code)).map((s) => s.code); };
/** Why a person sees no Take it (BIC-18): their role may read leads but not work them. */
export const READ_ONLY_REASON = "You can read leads. Taking one needs a role that works leads: ask your firm's Owner or Admin.";
export const can = (me: Me | undefined, key: string) => !!me?.keys.includes(key);
/** Unassigned leads are seen by people who may see all leads or assign them (AG-2-13c rule 6; FO-2 common.ts). */
export const seesUnassigned = (me: Me | undefined) => can(me, KEY.viewAll) || can(me, KEY.assign);
