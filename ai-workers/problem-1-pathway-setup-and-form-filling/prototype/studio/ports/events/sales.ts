// ports/events/sales.ts — the events of leads, prospects, calls and notes (front office: sales):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const SALES_EVENT = {
  /** A lead arrived: by the web form or added by hand (front office, FO-2; AG-2-84). */
  LEAD_CREATED: "lead.created",
  /** A lead got an owner: Take it or Assign to (FO-2; AG-2-13c, AG-2-86). */
  LEAD_TAKEN: "lead.taken",
  /** A lead was closed with a reason (FO-2; AG-2-80). */
  LEAD_CLOSED: "lead.closed",
  /** A closed lead was reopened (FO-2; AG-2-80). */
  LEAD_REOPENED: "lead.reopened",
  /** A lead was engaged: a prospect was made from it (FO-2b for Corporate; contracts §2.1 "lead.engaged = prospect created"). */
  LEAD_ENGAGED: "lead.engaged",
  /** A prospect's type changed, Individual ↔ Corporate, before signing (FO-2b; AG-2-76 rule 13). */
  PROSPECT_TYPE_CHANGED: "prospect.type_changed",
  /** A prospect was won (contracts §2.6; its subject part is FO-2b's `ProspectWonSubject`, contracts §7 §2.6). */
  PROSPECT_WON: "prospect.won",
  /** A person moved a prospect between open stages (FO-2 part 3; AG-2-26 rule 10). */
  PROSPECT_STAGE_MOVED: "prospect.stage_moved",
  /** A prospect was marked lost with a reason (FO-2 part 3; AG-2-44). */
  PROSPECT_LOST: "prospect.lost",
  /** A Convert to client was undone while the client was empty (FO-2 part 3; AG-2-47 rule 18). */
  PROSPECT_UNCONVERTED: "prospect.unconverted",
  /** A call was logged on a lead or a prospect (FO-2 part 4; AG-2-37a): the audit action (no outbox row yet). */
  CALL_LOGGED: "call.logged",
  /** A note was added on a lead or a prospect (FO-2 part 4): the audit action (no outbox row). */
  NOTE_ADDED: "note.added",
} as const;

const Uuid = z.string().uuid();
/** The payload FO-2 writes for every lead.* event: ids and facts only (no name, email or phone; a consumer reads the lead
 *  itself). The firm is the outbox row's firm_id; module_event.subject_id is the lead's id. */
export const LeadEventPayload = z.object({
  leadId: z.string().uuid(),
  personId: z.string().uuid(),
  door: z.enum(["WEB_FORM", "MANUAL", "BOOKING"]),
  state: z.enum(["OPEN", "ENGAGED", "CLOSED"]),
  ownerStaffId: z.string().uuid().nullable(),
  /** lead.created only: the person of the firm with the same email or phone, flagged and never linked (AG-2-84). */
  possibleMatchPersonId: z.string().uuid().nullable().optional(),
  /** lead.closed only: the reason's key (AG-2-80 rule 2; its name for it). */
  closeReasonKey: z.string().optional(),
}).strict();
export type LeadEventPayload = z.infer<typeof LeadEventPayload>;

/** The payload FO-2b writes for `lead.engaged` and `prospect.type_changed`: ids and facts only (a consumer reads the
 *  prospect). module_event.subject_id is the prospect's id. */
export const ProspectEventPayload = z.strictObject({
  prospectId: Uuid, leadId: Uuid, type: z.enum(["INDIVIDUAL", "CORPORATE"]), stageKey: z.string(),
  subjectPersonId: Uuid.nullable(), subjectCompanyId: Uuid.nullable(), primaryContactPersonId: Uuid, ownerStaffId: Uuid.nullable(),
  /** prospect.type_changed only: where it came from (AG-2-76 §9). */
  fromType: z.enum(["INDIVIDUAL", "CORPORATE"]).optional(), fromStageKey: z.string().optional(),
});
export type ProspectEventPayload = z.infer<typeof ProspectEventPayload>;

/** The payload FO-2 part 3 writes for `prospect.stage_moved`, `prospect.lost` and `prospect.unconverted`: ids and keys
 *  only (never a note or a reason's words). module_event.subject_id is the prospect's id. */
export const ProspectMovePayload = z.strictObject({
  prospectId: Uuid, leadId: Uuid, type: z.enum(["INDIVIDUAL", "CORPORATE"]), fromStageKey: z.string(), stageKey: z.string(),
  ownerStaffId: Uuid.nullable(),
  /** Why it moved (contracts §2.1 "with cause"; fo_stage_move.cause): PERSON for a person's move, Mark lost and Undo convert. */
  cause: z.enum(["PERSON", "BOOKING", "RETAINER_SENT", "RETAINER_EXECUTED", "SIGNED_OFFLINE", "CONVERT", "CHANGE_TYPE"]),
  /** prospect.lost only: the reason's key (AG-2-44 rule 2). */
  lostReasonKey: z.string().optional(),
});
export type ProspectMovePayload = z.infer<typeof ProspectMovePayload>;

/** One line of a "what happened" timeline (FO-2 part 4; review D10: every reader of what happened uses this one shape,
 *  never its own). `kind` says where the line was read from: an audit line, an outbox event with no audit line of its
 *  own, a logged call or a note. `type` is the audit action, the event type, `call` or `note`; `refId` the row's id. */
export const TimelineLine = z.strictObject({
  at: z.string().datetime({ offset: true }), kind: z.enum(["AUDIT", "EVENT", "CALL", "NOTE"]), type: z.string().min(1),
  actor: z.string().nullable(), actorName: z.string().nullable(), summary: z.string(), refId: Uuid.nullable(),
});
export type TimelineLine = z.infer<typeof TimelineLine>;

/** The subject part of `prospect.won` (contracts §7 §2.6, AG-2-77 rule 2): a person, or a company with its name and its
 *  live contacts with their roles, linked and never copied (rule 7). The case side makes a person or a company client
 *  from it (FO-8). The rest of the payload (§2.6: won_via, owner, answers…) is the writer's (FO-2 part 3, FO-6). */
const WonContact = z.strictObject({
  personId: Uuid, givenNames: z.string().nullable(), familyName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(),
  roles: z.array(z.enum(["PRIMARY", "SIGNATORY", "HR", "BILLING", "OTHER"])).min(1), primaryContact: z.boolean(),
});
export const ProspectWonSubject = z.discriminatedUnion("subject", [
  z.strictObject({ subject: z.literal("PERSON"), personId: Uuid }),
  z.strictObject({ subject: z.literal("COMPANY"), company: z.strictObject({ id: Uuid, name: z.string().min(1) }), contacts: z.array(WonContact).min(1) }),
]);
export type ProspectWonSubject = z.infer<typeof ProspectWonSubject>;
/** FO-9a (case-side contract v0.1 §4, F6; P-574 (2)): the front office's duplicate result for the won subject, so the case
 *  side warns when it makes the client without calling back. Other records of the same firm whose email or E.164 phone
 *  equals the subject's, or whose name is similar (ports/matching.ts's keys, threshold and score): people for a person,
 *  companies for a company; never the subject itself; strongest first. Ids, score and reasons only (no names: the case
 *  side reads a record it may open). Warn only: nothing is linked or merged. Absent on events written before FO-9a's part. */
/** Fixed bounds (review M1 on e6e34790e): a stored event must stay readable if the Sample threshold or the list size in
 *  ports/matching.ts is tuned later, so the event checks only what can never change (a similarity 0-1, at most 50 matches);
 *  the writer applies the live threshold and cap. */
export const WON_DUPLICATES_MAX = 50;
const WonReason = z.discriminatedUnion("key", [
  z.strictObject({ key: z.literal("EMAIL") }),
  z.strictObject({ key: z.literal("PHONE") }),
  z.strictObject({ key: z.literal("NAME"), similarity: z.number().min(0).max(1) }),
]);
export const WonDuplicates = z.strictObject({
  matches: z.array(z.strictObject({ kind: z.enum(["PERSON", "COMPANY"]), id: Uuid, score: z.number().int().min(0).max(100), reasons: z.array(WonReason).min(1) })).max(WON_DUPLICATES_MAX),
});
export type WonDuplicates = z.infer<typeof WonDuplicates>;
/** The payload of `prospect.won` (contracts §2.6, P-559 (4); written by Convert in FO-2 part 3, AG-2-47 rule 16): the
 *  contract's fields, with FO-2b's subject part beside them. The person's facts travel as canonical answer keys; a field
 *  the front office does not hold is null (`person.current_residence_country` is not stored yet), never guessed. */
export const ProspectWonPayload = z.strictObject({
  firm_id: Uuid, firm_key: z.string().min(1), prospect_id: Uuid, lead_id: Uuid, won_via: z.enum(["E_SIGNED", "SIGNED_OFFLINE", "CONVERTED"]),
  retainer_id: Uuid.nullable(), representative_staff_id: Uuid.nullable(), representative_actor_id: z.string().nullable(), owner_staff_id: Uuid.nullable(),
  interested_in: z.strictObject({ serviceId: Uuid, label: z.string(), combinationId: Uuid.nullable() }).nullable(),
  answers: z.strictObject({
    "person.given_names": z.string().nullable(), "person.family_name": z.string().nullable(), "person.email": z.string().nullable(),
    "person.phone_number": z.string().nullable(), "person.current_residence_country": z.string().nullable(),
  }),
  consent_ids: z.array(Uuid), sealed_retainer_sha256: z.string().nullable(),
  /** FO-2 part 3 additions: the type, where it was won from, whether a retainer is signed ("Retainer not signed"), and FO-2b's subject part. */
  type: z.enum(["INDIVIDUAL", "CORPORATE"]), fromStageKey: z.string(), retainerSigned: z.boolean(), subject: ProspectWonSubject,
  /** FO-9a: the duplicate result (WonDuplicates); every win since FO-9a's part carries it, an empty list when none. */
  duplicates: WonDuplicates.optional(),
});
export type ProspectWonPayload = z.infer<typeof ProspectWonPayload>;
