// FO-3w (concept screens/fo-3-booking r2 §2, §6; contracts §2.2): the shapes of FO-3pa's public booking answers
// (api/src/front-office/booking/service.ts publicList, publicSlots, publicBook), parsed at the edge so a changed answer
// fails loudly, never on a visitor's screen. Calls are plain fetch to /api/public/...: no staff token, no x-actor.
import { z } from "zod";

export const MODES = ["VIDEO", "PHONE", "IN_PERSON"] as const;
export type Mode = (typeof MODES)[number];
export const MODE_WORDS: Record<Mode, string> = { VIDEO: "Video call", PHONE: "Phone call", IN_PERSON: "In person" };
const Address = z.record(z.string(), z.string()).nullable();
export const Firm = z.object({ name: z.string(), email: z.string(), phone: z.string().nullable(), address: Address });
export type Firm = z.infer<typeof Firm>;
export const List = z.object({ firm: Firm, types: z.array(z.object({ name: z.string(), slug: z.string(), minutes: z.number(), modes: z.array(z.enum(MODES)) })) });
export const Slot = z.object({ startsAt: z.string(), endsAt: z.string(), label: z.string() });
export type Slot = z.infer<typeof Slot>;
export const Slots = z.object({
  firm: Firm,
  type: z.object({ name: z.string(), minutes: z.number(), modes: z.array(z.enum(MODES)) }),
  timeZone: z.string(),
  consent: z.object({ wordingId: z.string(), text: z.string() }).nullable(),
  slots: z.array(Slot),
  formStamp: z.string(),
});
export type Slots = z.infer<typeof Slots>;
export const Booked = z.object({
  status: z.string(), mode: z.enum(MODES), startsAt: z.string(), endsAt: z.string(), timeZone: z.string(),
  typeName: z.string(), firm: Firm, joinLink: z.string().nullable(), manageToken: z.string(),
});
export type Booked = z.infer<typeof Booked>;

/** A refused answer: its status, the problem's slug (the last part of `type`), its sentence, field issues
 *  ("givenNames: required") and, for slot-taken, the fresh times. */
export type Problem = { status: number; slug?: string; detail?: string; issues: string[]; slots: Slot[] };
export function problemOf(data: unknown, status: number): Problem {
  const d = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const slots = z.array(Slot).safeParse(d.slots);
  return {
    status, slug: typeof d.type === "string" ? d.type.split("/").pop() : undefined, detail: typeof d.detail === "string" ? d.detail : undefined,
    issues: Array.isArray(d.issues) ? d.issues.filter((i): i is string => typeof i === "string") : [], slots: slots.success ? slots.data : [],
  };
}
export async function publicCall<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public/${path}`, { ...init, credentials: "omit", headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) } });
  const text = await res.text();
  let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw problemOf(data, res.status);
  return schema.parse(data);
}
export const NOT_AVAILABLE = "This page is not available.";
export const TRY_LATER = "Please try again in a minute.";
