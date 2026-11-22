// ports/events/cases.ts — the events of cases and clients (case side):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const CASE_EVENT = {
  /** A case closed: withdrawn, or closed by staff with a reason (case side, CS-C1a; contract v0.1 §4). */
  CASE_CLOSED: "case.closed",
  /** A closed case was reopened with a reason, back at the stage it closed from (case side, CS-C1a; AG-7-13). */
  CASE_REOPENED: "case.reopened",
  /** A government step (an IRCC letter: biometrics, medical, ...) was recorded on a case (CS-DL3 part 1). Ids only. */
  CASE_MILESTONE_RECORDED: "case.milestone_recorded",
  /** A recorded government step was cancelled (a wrong due date is cancelled and recorded again; CS-DL3 part 1). Ids only. */
  CASE_MILESTONE_CANCELLED: "case.milestone_cancelled",
  /** The case side made a client from a won prospect (FO-8; P-560; case-side contract v0.1 §4). Written last in the
   *  transaction that makes the client; module_event.subject_id is the client id. */
  CLIENT_CREATED: "client.created",
  /** A case was opened (P-560; contract v0.1 §4). FO-8 writes it on the "Open a case?" offer path, in the opening's own
   *  transaction; a direct opening does not write it yet. module_event.subject_id is the case id. */
  CASE_OPENED: "case.opened",
} as const;

const Uuid = z.string().uuid();
// CS-C1a (case-side contract v0.1 §4): the case side's close and reopen events, ids and facts only (never the reason's
// words: a reason is free text and may hold personal data; a consumer reads the case). The firm is the outbox row's
// firm_id and module_event.subject_id is the case id. clientId stays null until CS-K1 gives every case a client.
const CaseClientType = z.enum(["INDIVIDUAL", "CORPORATE"]).nullable();
/** `case.closed`: why (the contract's DECISION | WITHDRAWAL) and the close outcome. */
export const CaseClosedPayload = z.strictObject({
  caseId: Uuid, clientId: Uuid.nullable(), clientType: CaseClientType,
  reason: z.enum(["DECISION", "WITHDRAWAL"]), outcome: z.enum(["WITHDRAWN", "COMPLETED", "CLOSED_BY_STAFF"]),
  closedAt: z.iso.datetime({ offset: true }),
});
export type CaseClosedPayload = z.infer<typeof CaseClosedPayload>;
/** `case.reopened`: the stage it returned to and the outcome it was closed with. */
export const CaseReopenedPayload = z.strictObject({
  caseId: Uuid, clientId: Uuid.nullable(), clientType: CaseClientType,
  stageId: Uuid.nullable(), previousOutcome: z.enum(["WITHDRAWN", "COMPLETED", "CLOSED_BY_STAFF"]),
  reopenedAt: z.iso.datetime({ offset: true }),
});
export type CaseReopenedPayload = z.infer<typeof CaseReopenedPayload>;
/** `case.milestone_recorded` and `case.milestone_cancelled` (CS-DL3 part 1): the case and the step, ids only (never the
 *  note, the reference or a reason: a consumer reads the step). */
export const CaseMilestonePayload = z.strictObject({ caseId: Uuid, milestoneId: Uuid });
export type CaseMilestonePayload = z.infer<typeof CaseMilestonePayload>;

// FO-8 (P-560; case-side contract v0.1 §4, front-office contracts §2.6): what the case side writes back, ids and codes only
// (never a name: a consumer reads the client or the case). The firm is also the outbox row's firm_id.
/** `client.created`: the won prospect and the client made from it (client_number is the client code, CL-00001). */
export const ClientCreatedPayload = z.strictObject({ firm_id: Uuid, prospect_id: Uuid, client_id: Uuid, client_number: z.string().regex(/^CL-\d{5,}$/) });
export type ClientCreatedPayload = z.infer<typeof ClientCreatedPayload>;
/** `case.opened`: the case opened from a won prospect's offer (client_type is the Pathway's, as `case.closed` carries it). */
export const CaseOpenedPayload = z.strictObject({
  firm_id: Uuid, prospect_id: Uuid.nullable(), client_id: Uuid, case_id: Uuid, case_number: z.string().min(1), client_type: z.enum(["INDIVIDUAL", "CORPORATE"]).nullable(),
});
export type CaseOpenedPayload = z.infer<typeof CaseOpenedPayload>;
