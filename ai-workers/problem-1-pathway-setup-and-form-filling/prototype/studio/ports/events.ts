// The shared events contract (case-side contract v0.1 §1 rule 3, §4; platform-and-front-office contracts §0.5): the names
// of the events modules write to the outbox (module_event, PF-3) and the shapes their consumers read. Every module
// imports these from here and spells no event name itself. This folder imports only zod and its own files.
// FO-1a adds the first name it consumes; each later row adds the names and payloads it writes or reads.
import { z } from "zod";

/** Event names (module_event.type), one per line, owner module in the comment. */
export const EVENT = {
  /** A firm was created (platform, contracts §1.1). Front office seeds the firm's pipelines on it (FO-1a). */
  FIRM_CREATED: "firm.created",
  /** A staff member's roles changed (platform, PF-4; contracts §1.2 events out). */
  STAFF_ROLES_CHANGED: "staff.roles_changed",
  /** A staff member was deactivated: their sessions ended at once (platform, PF-4; contracts §1.2 events out). */
  STAFF_DEACTIVATED: "staff.deactivated",
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

  /** A complaint was recorded (platform register, PF-21; FO-13k rev 12). */
  COMPLAINT_RECEIVED: "complaint.received",
  /** A complaint was closed with its outcome (platform register, PF-21; FO-13k rev 12). */
  COMPLAINT_CLOSED: "complaint.closed",
  /** A retainer or consultation agreement was drafted from a template (front office, FO-5; contracts §2.3). */
  RETAINER_DRAFTED: "retainer.drafted",
  /** A retainer passed its send check and was sent (front office, FO-5; FO-6 adds the signing request; contracts §2.3). */
  RETAINER_SENT: "retainer.sent",
  /** A sent retainer was withdrawn with a reason (front office, FO-5; AG-5-34). */
  RETAINER_WITHDRAWN: "retainer.withdrawn",
  /** A retainer was recorded as signed on paper (front office, FO-5; AG-5-39; contracts §7 §2.3-§2.4). */
  RETAINER_SIGNED_OFFLINE: "retainer.signed_offline",
  /** A sent retainer's open request ended because an edit made a newer version (front office, FO-5f; payload `version` =
   *  the ended version, `reason` UPDATED). FO-6 cancels the signing request on it. */
  RETAINER_REQUEST_ENDED: "retainer.request_ended",
} as const;
export type EventName = (typeof EVENT)[keyof typeof EVENT];

/** What a `firm.created` consumer needs: the outbox row's type and firm (module_event's envelope, contracts §0.5). */
export const FirmCreated = z.object({ type: z.literal(EVENT.FIRM_CREATED), firmId: z.string().uuid() });
export type FirmCreated = z.infer<typeof FirmCreated>;

/** The payload PF-4 writes for `staff.roles_changed` and `staff.deactivated`: ids only (no name, email, role words or
 *  licence; a consumer reads the person's current roles from the platform). The firm is the outbox row's firm_id. */
export const StaffEventPayload = z.object({ staffId: z.string().uuid() }).strict();
export type StaffEventPayload = z.infer<typeof StaffEventPayload>;
/** What a consumer of either staff event needs: the outbox row's type and firm, and the payload's staff id. */
export const StaffRolesChanged = z.object({ type: z.literal(EVENT.STAFF_ROLES_CHANGED), firmId: z.string().uuid(), payload: StaffEventPayload });
export type StaffRolesChanged = z.infer<typeof StaffRolesChanged>;
export const StaffDeactivated = z.object({ type: z.literal(EVENT.STAFF_DEACTIVATED), firmId: z.string().uuid(), payload: StaffEventPayload });
export type StaffDeactivated = z.infer<typeof StaffDeactivated>;

/** What a booking event carries (module_event.payload, FO-3): ids and facts, never the person's details. */
export const BookingEvent = z.object({
  key: z.string(), bookingId: z.string().uuid(), sequence: z.number().int().min(0),
  status: z.enum(["SCHEDULED", "RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  typeId: z.string().uuid(), staffId: z.string().uuid(), personId: z.string().uuid().nullable(), prospectId: z.string().uuid().nullable(),
  mode: z.enum(["VIDEO", "PHONE", "IN_PERSON"]), startsAt: z.string(), endsAt: z.string(), bookerTimeZone: z.string(),
});
export type BookingEvent = z.infer<typeof BookingEvent>;

// PF-21 (FO-13k rev 12; Lead 47's answer 2 on #1753): the complaints register's two events, ids and facts only (never the
// complainant's name, contact or the summary). module_event.subject_id is the complaint's id.
const Uuid = z.string().uuid();
const ComplaintSubjectKind = z.enum(["FRONT_OFFICE_PERSON", "CASE_PARTY", "OTHER_PERSON"]);
/** `complaint.received`: who complained (the other module's id, none for another person) and when. */
export const ComplaintReceived = z.strictObject({
  type: z.literal(EVENT.COMPLAINT_RECEIVED), firmId: Uuid, complaintId: Uuid,
  subjectKind: ComplaintSubjectKind, subjectId: Uuid.nullable(), receivedAt: z.iso.datetime({ offset: true }),
});
export type ComplaintReceived = z.infer<typeof ComplaintReceived>;
/** `complaint.closed`: the outcome and when. */
export const ComplaintClosed = z.strictObject({
  type: z.literal(EVENT.COMPLAINT_CLOSED), firmId: Uuid, complaintId: Uuid,
  subjectKind: ComplaintSubjectKind, subjectId: Uuid.nullable(),
  outcome: z.enum(["RESOLVED", "UPHELD", "NOT_UPHELD", "WITHDRAWN", "REFERRED_TO_COLLEGE"]), closedAt: z.iso.datetime({ offset: true }),
});
export type ComplaintClosed = z.infer<typeof ComplaintClosed>;

/** The payload FO-5 writes for every retainer.* event: ids and facts only (no name, email or licence; a consumer reads the
 *  retainer itself). The firm is the outbox row's firm_id. */
export const RetainerEventPayload = z.object({
  retainerId: z.string().uuid(),
  kind: z.enum(["RETAINER", "CONSULTATION"]),
  prospectId: z.string().uuid().nullable(),
  version: z.number().int().min(1),
  /** Signed offline only: whether this made the prospect WON (false when it already was, or for a consultation agreement). */
  prospectWon: z.boolean().optional(),
  /** retainer.request_ended only: why the request ended (an edit made a newer version). */
  reason: z.enum(["UPDATED"]).optional(),
}).strict();
export type RetainerEventPayload = z.infer<typeof RetainerEventPayload>;
