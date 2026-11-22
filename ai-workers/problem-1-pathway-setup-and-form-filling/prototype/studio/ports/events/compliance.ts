// ports/events/compliance.ts — the events of identity and conflict-of-interest checks (front office: compliance):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const COMPLIANCE_EVENT = {
  /** A client identity check was recorded (front office, FO-13i; Code s. 24(2)(a)). Ids, the method and the detail names only. */
  IDENTITY_CHECKED: "identity.checked",
  /** A conflict-of-interest check was recorded or confirmed (front office, FO-13c; Code s. 15, 16). Ids and the result
   *  kind only, never a searched name, email or phone. The case side shows a conflict found on an existing client (s. 35(1)(c)). */
  CONFLICT_CHECKED: "conflict.checked",
} as const;

const Uuid = z.string().uuid();
/** The payload FO-13i writes for `identity.checked`: ids, the method and the names of the corroborated details only
 *  (never the document's number, its last 4 characters, its type or country, the copy's key or a link; a consumer reads
 *  the check). The firm is the outbox row's firm_id; module_event.subject_id is the check's id. */
export const IdentityCheckedPayload = z.strictObject({
  checkId: Uuid, personId: Uuid, checkedBy: Uuid,
  method: z.enum(["IN_PERSON", "VIDEO", "DOCUMENT_COPY", "OTHER"]),
  details: z.array(z.enum(["NAME", "HOME_ADDRESS", "PHONE", "EMAIL", "BUSINESS_DETAILS"])).min(1).max(5),
  copyKept: z.boolean(),
});
export type IdentityCheckedPayload = z.infer<typeof IdentityCheckedPayload>;
/** `conflict.checked` (FO-13c): written when a check is recorded and again when one with hidden matches is confirmed.
 *  `result` is null while hidden matches wait for a confirmation; `clientAlready` is true when the prospect was already
 *  won (a conflict found after signing, s. 35(1)(c): the case side shows it, nothing ends by itself). */
export const ConflictCheckedPayload = z.strictObject({
  checkId: Uuid, prospectId: Uuid, partyKind: z.enum(["PERSON", "COMPANY"]), personId: Uuid.nullable(), companyId: Uuid.nullable(),
  result: z.enum(["NO_CONFLICT", "POTENTIAL_CONFLICT", "CONFLICT_CANNOT_ACT"]).nullable(), hiddenMatches: z.boolean(), confirmed: z.boolean(), clientAlready: z.boolean(),
});
export type ConflictCheckedPayload = z.infer<typeof ConflictCheckedPayload>;
