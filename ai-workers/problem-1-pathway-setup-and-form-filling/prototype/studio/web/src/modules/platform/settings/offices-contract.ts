// PF-18s part 1 (concept screens/PF-18s, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-68, AG-16-75, AG-1-74):
// the shapes the Offices page reads from PF-18a part 1's routes and this part's two (provinces, placing a person), parsed at the
// edge, and the page's pure helpers. No imports from the app, so a test reads it in Node. The server decides every rule.
import { z } from "zod";

export const Hours = z.array(z.object({ day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]), opens: z.string(), closes: z.string() }));
export const Office = z.object({ id: z.string(), name: z.string(), countryCode: z.string(), province: z.string().nullable(), timeZone: z.string(), businessHours: Hours, closedDays: z.array(z.string()), isFirst: z.boolean(), version: z.string() });
export type Office = z.infer<typeof Office>;
/** One office: the firm's own settings, no office row and no zone field (AG-16-68, AG-1-74 rule 1). */
export const OfficeList = z.union([
  z.object({ multipleOffices: z.literal(false), offices: z.array(z.object({ id: z.null(), implicit: z.literal(true), name: z.string() })) }),
  z.object({ multipleOffices: z.literal(true), offices: z.array(Office) }),
]);
export type OfficeList = z.infer<typeof OfficeList>;
export const Provinces = z.object({ provinces: z.array(z.object({ code: z.string(), zone: z.string() })) });
export type Province = z.infer<typeof Provinces>["provinces"][number];
export const Added = z.object({ office: Office, first: Office.nullable(), timeZoneFrom: z.enum(["province", "firm", "chosen"]) });
export const Placed = z.object({ staffId: z.string(), officeId: z.string().nullable() });
/** The staff read's rows as this page needs them (GET /api/platform/staff; `officeId` since PF-18s part 1). */
export const People = z.object({ staff: z.array(z.object({ id: z.string(), displayName: z.string(), status: z.string(), officeId: z.string().nullable() })) });
export type Person = z.infer<typeof People>["staff"][number];

/** Who may open the page: Owner and Admin (challenge M1: AG-16 §3.0 "Advanced … Owner and Admin"). */
export const OFFICES_KEY = "agent/settings:edit";
/** Placing a person is a staff-profile change (challenge m1). */
export const PLACE_KEY = "agent/staff:manage";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const SHORT: Record<string, string> = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
/** "Mon–Fri 09:00–17:00", "Mon–Thu 09:00–17:00 · Fri 09:00–13:00"; no open day → "Closed every day". Days with the same hours
 *  next to each other are joined. */
export function hoursLine(hours: z.infer<typeof Hours>): string {
  const by = new Map(hours.map((h) => [h.day, `${h.opens}–${h.closes}`]));
  const runs: { from: string; to: string; t: string }[] = [];
  for (const d of DAYS) {
    const t = by.get(d); if (!t) continue;
    const last = runs[runs.length - 1];
    if (last && last.t === t && DAYS.indexOf(last.to as (typeof DAYS)[number]) === DAYS.indexOf(d) - 1) last.to = d; else runs.push({ from: d, to: d, t });
  }
  return runs.length ? runs.map((r) => `${SHORT[r.from]}${r.from === r.to ? "" : `–${SHORT[r.to]}`} ${r.t}`).join(" · ") : "Closed every day";
}
/** Where an office is, in words: "AB, Canada", "Canada", or the country's English name ("United Kingdom"). */
export function whereLine(o: { countryCode: string; province: string | null }): string {
  let country = o.countryCode;
  try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(o.countryCode) ?? o.countryCode; } catch { /* the code */ }
  return o.province ? `${o.province}, ${country}` : country;
}
/** The zone a new office would get before it is saved (AG-1-74 rule 2): its province's, else null (the firm's, filled by the server). */
export const prefill = (provinces: readonly Province[], inCanada: boolean, province: string) => (inCanada ? provinces.find((p) => p.code === province)?.zone ?? null : null);
/** The 422's field errors by our field names (the offices service names `name`, `country`, `province`, `timeZone`). */
export const fieldErrors = (fields: Record<string, string> | undefined) => ({ name: fields?.name ?? null, country: fields?.country ?? null, province: fields?.province ?? null, timeZone: fields?.timeZone ?? null });
