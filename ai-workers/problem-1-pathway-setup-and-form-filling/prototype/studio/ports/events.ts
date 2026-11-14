// The shared events contract (case-side contract v0.1 §1 rule 3, §4; platform-and-front-office contracts §0.5): the names
// of the events modules write to the outbox (module_event, PF-3) and the shapes their consumers read. Every module
// imports these from here and spells no event name itself. This folder imports only zod and its own files.
// FO-1a adds the first name it consumes; each later row adds the names and payloads it writes or reads.
import { z } from "zod";

/** Event names (module_event.type), one per line, owner module in the comment. */
export const EVENT = {
  /** A firm was created (platform, contracts §1.1). Front office seeds the firm's pipelines on it (FO-1a). */
  FIRM_CREATED: "firm.created",
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
export type EventName = (typeof EVENT)[keyof typeof EVENT];

/** What a `firm.created` consumer needs: the outbox row's type and firm (module_event's envelope, contracts §0.5). */
export const FirmCreated = z.object({ type: z.literal(EVENT.FIRM_CREATED), firmId: z.string().uuid() });
export type FirmCreated = z.infer<typeof FirmCreated>;

/** What a booking event carries (module_event.payload, FO-3): ids and facts, never the person's details. */
export const BookingEvent = z.object({
  key: z.string(), bookingId: z.string().uuid(), sequence: z.number().int().min(0),
  status: z.enum(["SCHEDULED", "RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  typeId: z.string().uuid(), staffId: z.string().uuid(), personId: z.string().uuid().nullable(), prospectId: z.string().uuid().nullable(),
  mode: z.enum(["VIDEO", "PHONE", "IN_PERSON"]), startsAt: z.string(), endsAt: z.string(), visitorTimeZone: z.string(),
});
export type BookingEvent = z.infer<typeof BookingEvent>;
