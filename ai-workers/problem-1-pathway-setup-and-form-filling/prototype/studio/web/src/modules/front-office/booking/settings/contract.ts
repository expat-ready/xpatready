// FO-3st3 part 1 (concept screens/fo-3-booking r2 BR-19, §5 Booking types; AG-4-8, -9, -10 §10; C5): the shapes the
// Booking types page reads from FO-3a's routes, parsed at the edge, and the page's words. The server decides every rule
// and sends its own words for a refused field; these are the labels around them. No imports from the app, so a test
// reads it in Node.
import { z } from "zod";

export const PURPOSES = ["FREE_CONSULT", "FOLLOW_UP", "CASE_REVIEW", "OTHER"] as const;
export const MODES = ["VIDEO", "PHONE", "IN_PERSON"] as const;
export const BookingType = z.object({
  id: z.string(), slug: z.string(), name: z.string(), description: z.string().nullable(), colour: z.string(), purpose: z.enum(PURPOSES), minutes: z.number(),
  modes: z.array(z.enum(MODES)), hostStaffIds: z.array(z.string()), active: z.boolean(), showOnBookingPage: z.boolean(), allowReschedule: z.boolean(), allowCancel: z.boolean(),
  onBookingPage: z.boolean(), version: z.number(),
});
export type BookingType = z.infer<typeof BookingType>;
export const TypeList = z.object({ types: z.array(BookingType) });
/** GET booking-types/:id adds the future bookings and each host's chosen set (null: the host's default). */
export const TypeDetail = BookingType.extend({ futureBookings: z.number(), hostSets: z.array(z.object({ staffId: z.string(), setId: z.string().nullable() })) });
export type TypeDetail = z.infer<typeof TypeDetail>;
export const Preview = z.object({
  timeZone: z.string(), reason: z.string().nullable(),
  days: z.array(z.object({ date: z.string(), reason: z.string().nullable(), slots: z.array(z.object({ startsAt: z.string(), label: z.string() })) })),
});
export type Preview = z.infer<typeof Preview>;
/** A host's sets (Owner and Admin read them by `staff/:id/availability-sets`, FO-3a 1b-i). */
export const HostSets = z.object({ sets: z.array(z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() })) });

export const KEYS = { list: "agent/booking-event-type:list", edit: "agent/booking-event-type:edit", staff: "agent/staff:manage", hours: "agent/booking-event-type:configure-availability" } as const;
export const PURPOSE_WORDS: Record<(typeof PURPOSES)[number], string> = { FREE_CONSULT: "Free consultation", FOLLOW_UP: "Follow-up", CASE_REVIEW: "Case review", OTHER: "Other" };
export const MODE_WORDS: Record<(typeof MODES)[number], string> = { VIDEO: "Video call", PHONE: "Phone call", IN_PERSON: "In person" };
/** AG-4-10 rule 3: a follow-up or case review is never on the booking page. */
export const isCaseType = (t: Pick<BookingType, "purpose">) => t.purpose === "FOLLOW_UP" || t.purpose === "CASE_REVIEW";
export const W = {
  title: "Booking types", sub: "What visitors and staff can book.", add: "New booking type", empty: "No booking types yet. Add one so visitors can book.",
  caseLine: "Clients book this from their case. It is not on your booking page.", caseCell: "Never (case type)",
  retire: (n: string) => `Retire ${n}? It leaves the booking page and staff lists. Its bookings stay.`,
  remove: (n: string, k: number) => `Delete "${n}"? ${k} future booking${k === 1 ? "" : "s"} stay${k === 1 ? "s" : ""} booked.`,
  readOnly: "You can view booking types. Only an Owner or Admin changes them.",
  noHosts: "No hosts yet: this type offers no times.",
};
/** The public page's address for a type (the firm's own address arrives with PF-25; today the app's /book/ path). */
export const shareLink = (origin: string, firmKey: string, slug: string) => `${origin}/book/${firmKey}/${slug}`;
export const embedCode = (link: string, firm: string) => `<iframe src="${link}" title="Book a meeting with ${firm}" width="100%" height="760"></iframe>`;
