// ports/events/booking.ts — the events of consultation bookings (front office: booking):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const BOOKING_EVENT = {
  /** A consultation was booked (front office, FO-3; AG-4-47). Keys: bookingId and bookingId:sequence. */
  BOOKING_SCHEDULED: "booking.scheduled",
  /** A booking moved to a new time or host (FO-3). */
  BOOKING_RESCHEDULED: "booking.rescheduled",
  /** A booking was cancelled (FO-3). */
  BOOKING_CANCELLED: "booking.cancelled",
  /** The host answered "Attended" (FO-3; AG-4-39). */
  BOOKING_COMPLETED: "booking.completed",
  /** The host answered "No-show" (FO-3; AG-4-39). Never written by a job. */
  BOOKING_NO_SHOW: "booking.no_show",
} as const;

/** What a booking event carries (module_event.payload, FO-3): ids and facts, never the person's details. */
export const BookingEvent = z.object({
  key: z.string(), bookingId: z.string().uuid(), sequence: z.number().int().min(0),
  status: z.enum(["SCHEDULED", "RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  typeId: z.string().uuid(), staffId: z.string().uuid(), personId: z.string().uuid().nullable(), prospectId: z.string().uuid().nullable(),
  mode: z.enum(["VIDEO", "PHONE", "IN_PERSON"]), startsAt: z.string(), endsAt: z.string(), bookerTimeZone: z.string(),
});
export type BookingEvent = z.infer<typeof BookingEvent>;
