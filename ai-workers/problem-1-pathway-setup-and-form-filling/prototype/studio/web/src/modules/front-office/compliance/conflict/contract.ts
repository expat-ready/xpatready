// FO-13s part 2 (concept screens/FO-13s2-conflict/concept.md rev 2, approved): the shapes the Conflict check panel reads,
// mirroring FO-13c's answers (api/src/front-office/compliance/conflict/service.ts `preview`, `record`, `list`), parsed at
// the edge. The server holds every rule; these only name its words.
import { z } from "zod";

export const ConflictMatch = z.object({
  source: z.enum(["FRONT_OFFICE", "CASE"]), kind: z.string(), recordId: z.string(), displayName: z.string().optional(), matchedOn: z.array(z.string()),
  score: z.number().optional(), caseId: z.string().optional(), caseNumber: z.string().optional(), roleOnCase: z.string().optional(),
});
export type ConflictMatch = z.infer<typeof ConflictMatch>;
const Searched = z.object({ name: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable() });
export const Preview = z.object({ searched: Searched, matches: z.array(ConflictMatch), notStored: z.number(), hiddenCount: z.number(), hiddenLine: z.string().nullable(), scope: z.string().nullable() });
export type Preview = z.infer<typeof Preview>;
export const RESULT_CODES = ["NO_CONFLICT", "POTENTIAL_CONFLICT", "CONFLICT_CANNOT_ACT"] as const;
export const ConflictCheck = z.object({
  id: z.string(), partyKind: z.enum(["PERSON", "COMPANY"]), searched: Searched, matches: z.array(ConflictMatch), hiddenCount: z.number(), hiddenLine: z.string().nullable(),
  needsConfirmation: z.boolean(), result: z.enum(RESULT_CODES).nullable(), disclosureText: z.string().nullable(), checkedAt: z.string(), confirmedAt: z.string().nullable(),
  checkedByName: z.string().nullable(), confirmedByName: z.string().nullable(),
});
export type ConflictCheck = z.infer<typeof ConflictCheck>;
/** The gate's own verdict for the prospect (FO-13c `clearance`): ok, or its refusal's code and words. */
export const Clearance = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), code: z.string(), detail: z.string() })]);
export const ConflictList = z.object({ checks: z.array(ConflictCheck), scope: z.string().nullable(), clearance: Clearance });
export type ConflictList = z.infer<typeof ConflictList>;

/** FO-13c's key: run and record a check (the list reads with agent/prospect:show). */
export const CONFLICT_KEY = "agent/conflict:check";
export const RESULTS: [(typeof RESULT_CODES)[number], string][] = [["NO_CONFLICT", "No conflict"], ["POTENTIAL_CONFLICT", "Potential conflict"], ["CONFLICT_CANNOT_ACT", "Conflict: the firm cannot act"]];
/** What each result means for the steps that make a client (the chip's tooltip; BIC-14, review M3, challenge m10). */
export const RESULT_TIP: Record<string, string> = {
  NO_CONFLICT: "No conflict found: Convert and the retainer may go ahead while the client's name, email and phone stay the same.",
  POTENTIAL_CONFLICT: "A possible conflict: the client must read the disclosure in the retainer and sign it before becoming a client.",
  CONFLICT_CANNOT_ACT: "The firm cannot act for this client: Convert, Send and Signed offline are refused.",
  WAITING: "Matches the checker could not open: a manager who may see them confirms the check before the client can be made.",
};
/** The result's refusal in plain words, the server's own sentence (FO-13c CHOOSE_RESULT): checked here before sending. */
export const CHOOSE_RESULT = "Choose a result: No conflict, Potential conflict or Conflict: the firm cannot act.";
export const resultLabel = (r: string | null) => (r === null ? "Waiting for a confirmation" : RESULTS.find(([k]) => k === r)?.[1] ?? r);
/** The refusals a new conflict check fixes; the disclosure and consent refusals are fixed in the retainer (challenge M2). */
export const FIXED_BY_A_CHECK = new Set(["CONFLICT_CHECK_REQUIRED", "CONFLICT_CHECK_UNCONFIRMED", "CONFLICT_CHECK_STALE", "CONFLICT_CANNOT_ACT"]);
export const MATCHED_ON: Record<string, string> = { NAME: "Name", EMAIL: "Email", PHONE: "Phone" };
/** The status after a potential conflict with nothing else outstanding: never "Cleared" (challenge M2). */
export const POTENTIAL_STATUS = "Potential conflict: the client must read the disclosure in the retainer and sign it before becoming a client.";
export const RUN_REASON = "Running a conflict check needs a role that works leads: ask your firm's Owner or Admin.";
export const COMPANY_TERMS = "A company is searched by its name only.";
export const conflictPath = (prospectId: string) => `/front-office/prospects/${encodeURIComponent(prospectId)}/conflict-checks`;
export const conflictKey = (prospectId: string) => ["fo", "conflict-checks", prospectId];
