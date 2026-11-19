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
export const KEY = { show: "agent/prospect:show", edit: "agent/prospect:edit", assign: "agent/prospect:assign", viewAll: "agent/prospect:view.all", lose: "agent/prospect:lose", convert: "agent/prospect:convert" } as const;
/** A stored code in plain words (EXPERIENCE §5): the lead's source and state. */
const WORDS: Record<string, string> = { WEBSITE: "Website form", OPEN: "Open", ENGAGED: "Engaged", CLOSED: "Closed" };
/** A known stored code in plain words; anything else (a source a person typed: "VIP event", "Event, Toronto") is shown
 *  exactly as typed (FO-4sf review m6). */
export const words = (code: string) => WORDS[code] ?? code;
/** FO-4sf (AG-2-23 rule 1): the Source filter's choices, the stored sources of the leads the person may see (leads.ts). */
export const LeadSources = z.object({ sources: z.array(z.string()) });
/** Why a person sees no Take it (BIC-18): their role may read leads but not work them. */
export const READ_ONLY_REASON = "You can read leads. Taking one needs a role that works leads: ask your firm's Owner or Admin.";
export const can = (me: Me | undefined, key: string) => !!me?.keys.includes(key);
/** Unassigned leads are seen by people who may see all leads or assign them (AG-2-13c rule 6; FO-2 common.ts). */
export const seesUnassigned = (me: Me | undefined) => can(me, KEY.viewAll) || can(me, KEY.assign);
// FO-4 part 2a: prospects, mirroring FO-2 part 3 (api/src/front-office/sales/prospects.ts) and FO-2b's board
// (corporate/service.ts `board()`, with FO-2 part 3's totals per currency: never one sum across currencies, R1.31).
const Money = z.object({ currency: z.string(), valueCents: z.number(), count: z.number() });
export type Money = z.infer<typeof Money>;
const Stage = z.object({ key: z.string(), label: z.string(), kind: z.string() });
export const Board = z.object({
  type: z.string(), totals: z.array(Money),
  stages: z.array(Stage.extend({ id: z.string(), totals: z.array(Money), prospects: z.array(z.object({ id: z.string(), number: z.string(), name: z.string(), ownerStaffId: z.string().nullable() })) })),
});
export type Board = z.infer<typeof Board>;
const reason = z.object({ key: z.string(), label: z.string() }).nullable();
export const ProspectRows = z.array(z.object({
  id: z.string(), number: z.string(), name: z.string(), ownerStaffId: z.string().nullable(), stage: Stage,
  valueCents: z.number().nullable(), currency: z.string(), engagedAt: z.string(), lostReason: reason, wonVia: z.string().nullable(),
}));
export const Prospect = z.object({
  id: z.string(), number: z.string(), type: z.string(), leadId: z.string(), leadNumber: z.string(), ownerStaffId: z.string().nullable(), version: z.string(),
  stage: Stage.extend({ id: z.string() }), person: z.object({ id: z.string(), name: z.string() }).nullable(), company: z.object({ id: z.string(), name: z.string() }).nullable(),
  valueCents: z.number().nullable(), currency: z.string(), wonVia: z.string().nullable(), retainerSigned: z.boolean(), lostReason: reason, lostNote: z.string().nullable(), engagedAt: z.string(),
  warning: z.string().optional(), again: z.boolean().optional(), message: z.string().optional(),
});
export type Prospect = z.infer<typeof Prospect>;
export const LostReasons = z.array(z.object({ id: z.string(), key: z.string(), label: z.string() }));
export const Assignees = z.object({ oneUser: z.boolean(), assignees: z.array(z.object({ staffId: z.string(), displayName: z.string() })) });
/** An amount in its own currency (R1.31: amounts of different currencies are listed side by side, never added). */
export const money = (cents: number, currency: string) => new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 0 }).format(cents / 100);
