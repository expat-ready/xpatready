// ports/events/complaints.ts — the events of the complaints register (platform: complaints):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const COMPLAINT_EVENT = {
  /** A complaint was recorded (platform register, PF-21; FO-13k rev 12). */
  COMPLAINT_RECEIVED: "complaint.received",
  /** A complaint was closed with its outcome (platform register, PF-21; FO-13k rev 12). */
  COMPLAINT_CLOSED: "complaint.closed",
} as const;

const Uuid = z.string().uuid();
// PF-21 (FO-13k rev 12; Lead 47's answer 2 on #1753): the complaints register's two events, ids and facts only (never the
// complainant's name, contact or the summary). module_event.subject_id is the complaint's id.
const ComplaintSubjectKind = z.enum(["FRONT_OFFICE_PERSON", "CASE_PARTY", "OTHER_PERSON"]);
/** `complaint.received`: who complained (the other module's id, none for another person) and when. */
export const ComplaintReceived = z.strictObject({
  type: z.literal(COMPLAINT_EVENT.COMPLAINT_RECEIVED), firmId: Uuid, complaintId: Uuid,
  subjectKind: ComplaintSubjectKind, subjectId: Uuid.nullable(), receivedAt: z.iso.datetime({ offset: true }),
});
export type ComplaintReceived = z.infer<typeof ComplaintReceived>;
/** `complaint.closed`: the outcome and when. */
export const ComplaintClosed = z.strictObject({
  type: z.literal(COMPLAINT_EVENT.COMPLAINT_CLOSED), firmId: Uuid, complaintId: Uuid,
  subjectKind: ComplaintSubjectKind, subjectId: Uuid.nullable(),
  outcome: z.enum(["RESOLVED", "UPHELD", "NOT_UPHELD", "WITHDRAWN", "REFERRED_TO_COLLEGE"]), closedAt: z.iso.datetime({ offset: true }),
});
export type ComplaintClosed = z.infer<typeof ComplaintClosed>;
