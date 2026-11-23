// FO-3st3 part 3a (concept screens/fo-3-booking r2 BR-19, §4 "Settings → Booking types", §5; AG-4-8, AG-4-9, AG-4-10):
// the shapes FO-3a part 1a's booking-type routes answer, parsed at the edge. The server decides every rule (name 1-80,
// length 5-480, the web address, the stale save, who may edit); the screen shows its answer on the field.
import { z } from "zod";

export const TYPES_LIST = "agent/booking-event-type:list", TYPES_EDIT = "agent/booking-event-type:edit";
export const CONFIGURE = "agent/booking-event-type:configure-availability", STAFF_MANAGE = "agent/staff:manage";
export const HOME = "/front-office/settings/booking-types";

export const MODES = [["VIDEO", "Video call"], ["PHONE", "Phone call"], ["IN_PERSON", "In person"]] as const;
/** AG-4-10's purposes in the server's own words (types.ts); PAID_CONSULT waits for map row 44 and is not offered. */
export const PURPOSES = [["FREE_CONSULT", "Free consultation"], ["FOLLOW_UP", "Follow-up"], ["CASE_REVIEW", "Case review"], ["OTHER", "Other"]] as const;
/** AG-4-10 rules 1, 4: a follow-up or case review is never on the booking page ("Never (case type)", concept §5). */
export const caseType = (purpose: string) => purpose === "FOLLOW_UP" || purpose === "CASE_REVIEW";

export const BookingType = z.object({
  id: z.string(), slug: z.string(), name: z.string(), description: z.string().nullable(), purpose: z.string(), minutes: z.number(),
  modes: z.array(z.string()), hostStaffIds: z.array(z.string()), active: z.boolean(), showOnBookingPage: z.boolean(), allowReschedule: z.boolean(), allowCancel: z.boolean(),
  onBookingPage: z.boolean(), version: z.number(),
});
export type BookingType = z.infer<typeof BookingType>;
export const TypeList = z.object({ types: z.array(BookingType) });
export const TypeDetail = BookingType.extend({ futureBookings: z.number(), hostSets: z.array(z.object({ staffId: z.string(), setId: z.string().nullable() })) });
export type TypeDetail = z.infer<typeof TypeDetail>;
export const Preview = z.object({
  type: z.object({ id: z.string(), name: z.string(), onBookingPage: z.boolean() }), timeZone: z.string(), reason: z.string().nullable(),
  days: z.array(z.object({ date: z.string(), reason: z.string().nullable(), slots: z.array(z.object({ startsAt: z.string(), label: z.string() })) })),
});
export type Preview = z.infer<typeof Preview>;
export const HostSets = z.object({ sets: z.array(z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() })) });

/** The public page's address as the share line shows it (concept BR-1: `/book/<firmKey>/<slug>` on this host). */
export const publicUrl = (firmKey: string, slug: string) => `${window.location.origin}/book/${encodeURIComponent(firmKey)}/${slug}`;
export const embedCode = (url: string, firm: string) => `<iframe src="${url}" title="Book a meeting with ${firm.replace(/"/g, "&quot;")}" width="100%" height="760"></iframe>`;
/** "YYYY-MM-DD" in a zone, and the instant a zone's midnight of that date is (from and to of the preview). */
export const todayIn = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const dayWords = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`)).replace(",", "");
