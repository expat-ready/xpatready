// PF-21rs B1 (R1.85; concept r2 screens/PF-21rs/concept.md §3 BR-5, BR-7, BR-8, §4 "Data requests to us", §5; SA-11-27):
// the shapes and words of our console's register of requests made to ExpatReady, with no React, so the browser check
// reads the same words in Node. The answers are PF-21b part 3's (`/api/system/register/requests`) with PF-21rs R0's
// names; the key is SA-07 Appendix A's. Target dates are the API's (received + 30 days, our own reminder, not enforced);
// Overdue is set only by the daily check. Legal reading Unconfirmed: no counsel.
import { z } from "zod";

/** SA-07 Appendix A "Manage the register of requests made to ExpatReady" (the Platform Owner). */
export const DSR_KEY = "system/compliance:dsr-manage";

export const REQUEST_TYPES = ["ACCESS", "CORRECTION", "DELETION"] as const;
export const TYPE_WORDS: Record<(typeof REQUEST_TYPES)[number], string> = { ACCESS: "Access", CORRECTION: "Correction", DELETION: "Deletion" };
export const REQUEST_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "HELD"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
/** One word and a shape each (never colour alone, UXL-14). */
export const REQUEST_STATUS_WORDS: Record<RequestStatus, { word: string; mark: string; tone: string }> = {
  PENDING: { word: "Pending", mark: "○", tone: "text-text" },
  IN_PROGRESS: { word: "In progress", mark: "◐", tone: "text-text-link" },
  COMPLETED: { word: "Completed", mark: "●", tone: "text-text-ok" },
  OVERDUE: { word: "Overdue", mark: "▲", tone: "text-text-danger" },
  HELD: { word: "Held", mark: "◆", tone: "text-text-warn" },
};
/** The moves a person may ask for from each status (the API decides; Overdue only by the daily check, BR-5). */
export const MOVES: Record<RequestStatus, ("IN_PROGRESS" | "COMPLETED" | "HELD")[]> = {
  PENDING: ["IN_PROGRESS", "HELD"], IN_PROGRESS: ["COMPLETED", "HELD"], OVERDUE: ["COMPLETED", "HELD"], HELD: ["IN_PROGRESS", "COMPLETED"], COMPLETED: [],
};
export const MOVE_WORDS: Record<"IN_PROGRESS" | "COMPLETED" | "HELD", string> = { IN_PROGRESS: "Start work", COMPLETED: "Mark completed", HELD: "Put on hold" };

export const DataRequest = z.object({
  id: z.string(), type: z.enum(REQUEST_TYPES), requester: z.string(), requesterEmail: z.string(), receivedOn: z.string(), targetDate: z.string(), status: z.enum(REQUEST_STATUSES),
  actionsTaken: z.string().nullable(), completedOn: z.string().nullable(), firmId: z.string().nullable(), personId: z.string().nullable(), recordedBy: z.string(), createdAt: z.string(),
  firmName: z.string().nullable(), recordedByName: z.string().nullable(),
});
export type DataRequest = z.infer<typeof DataRequest>;
export const RequestList = z.object({ requests: z.array(DataRequest), truncated: z.boolean() });
export const RequestStep = z.object({ seq: z.number(), kind: z.string(), from: z.string().nullable(), to: z.string().nullable(), note: z.string().nullable(), actor: z.string(), actorName: z.string().nullable(), at: z.string() });
export type RequestStep = z.infer<typeof RequestStep>;
export const RequestOne = DataRequest.extend({ steps: z.array(RequestStep) });
export type RequestOne = z.infer<typeof RequestOne>;

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "24 Nov 2026" for a calendar day (YYYY-MM-DD). */
export const dayWords = (day: string) => DAY.format(new Date(`${day}T00:00:00Z`));
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
/** Beside the target date: "in 3 days", "today", "2 days late"; nothing once completed. */
export function dueWords(r: Pick<DataRequest, "targetDate" | "status">, today: string): string {
  if (r.status === "COMPLETED") return "";
  const n = dayNumber(r.targetDate) - dayNumber(today);
  return n === 0 ? "today" : n > 0 ? `in ${n} ${n === 1 ? "day" : "days"}` : `${-n} ${n === -1 ? "day" : "days"} late`;
}
/** Today's calendar day in Toronto (the register's own clock). */
export const torontoToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

const STEP_WORDS: Record<string, string> = { NOTE: "Note", ERASURE_APPROVED: "Erasure approved", ERASURE_CANCELLED: "Erasure cancelled", ERASURE_HELD: "Erasure held", ERASURE_RESULT: "Erasure result", ERASURE_SKIPPED: "Erasure skipped" };
/** One step in words: Logged · Pending → In progress · Overdue (the daily check's alert) · an erasure's steps by their kind. */
export function stepWords(s: Pick<RequestStep, "kind" | "from" | "to">): string {
  const w = (x: string | null) => (x && x in REQUEST_STATUS_WORDS ? REQUEST_STATUS_WORDS[x as RequestStatus].word : x ?? "");
  if (s.kind === "RECEIVED") return "Logged";
  if (s.kind === "OVERDUE_ALERTED") return "Overdue: the target date passed (the daily check raised one alert)";
  if (s.kind === "NEAR_DATE_ALERTED") return "Target date near (the daily check raised one alert)";
  if (s.from || s.to) return `${w(s.from)} → ${w(s.to)}`;
  return STEP_WORDS[s.kind] ?? s.kind.charAt(0) + s.kind.slice(1).toLowerCase().replace(/_/g, " ");
}

/** The "Log a request" body: firm and person sent together or not at all (the API refuses one alone). */
export type LogDraft = { type: string; requester: string; requesterEmail: string; receivedOn: string; firmId: string; personId: string };
export function logBody(d: LogDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { type: d.type, requester: d.requester, requesterEmail: d.requesterEmail, receivedOn: d.receivedOn };
  if (d.firmId.trim() || d.personId.trim()) { out.firmId = d.firmId.trim(); out.subject = { kind: "PERSON", id: d.personId.trim() }; }
  return out;
}
/** A 422's field names as the dialog's fields ("subject.id" → personId); anything else above the buttons. */
export function requestFieldErrors(fields: Record<string, string> | undefined): Record<string, string> {
  const map: Record<string, string> = { type: "type", requester: "requester", requesterEmail: "requesterEmail", receivedOn: "receivedOn", firmId: "firmId", subject: "personId", actionsTaken: "actionsTaken", note: "note", status: "other" };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields ?? {})) { const at = map[k.split(".")[0]] ?? "other"; out[at] = out[at] ? `${out[at]} ${v}` : v; }
  return out;
}

export const REQUEST_COPY = {
  title: "Data requests to us",
  lead: "Requests made to ExpatReady itself about the personal data we hold. The target is 30 days after receipt: our own reminder, not a legal deadline (Unconfirmed: no counsel).",
  empty: "No request to ExpatReady is logged. A client's request to their firm is the firm's and is not here.",
  filteredEmpty: "No request has this status.",
  loadFailed: "Could not load the requests. Please try again.",
  truncated: "Showing the newest 500.",
  logTitle: "Log a request",
  logLead: "Log a request made to ExpatReady the day it arrives. Its target date is set 30 days after the day received.",
  personHint: "Only when the request is about one person record in one firm: the firm's id and that record's id, together.",
  personCopy: "Person record id as the firm gave it; not checked against the firm's records.",
  logged: "Logged. Its target date is 30 days after the day received.",
  logFailed: "Could not log the request. Please try again.",
  missing: "No such request.",
  noteHint: "Optional: kept with the step.",
  actionsHint: "What was done to complete it: kept on the request.",
  overdueByCheck: "Overdue is set by the daily check when the target date passes; it cannot be chosen.",
  completedNoMore: "Completed: nothing more can be changed.",
} as const;
