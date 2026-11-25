// PF-21s part 3 (concept screens/pf-21-complaints §3, §5, §6): the shapes the complaints pages read from PF-21w's and
// PF-21v's answers (api/src/platform/complaints/complaints.ts), parsed at the edge so a changed answer fails loudly.
// The words for every stored code (EXPERIENCE §5) and the two keys. Every list and period is Sample until the College's
// by-laws are read (Unconfirmed: no counsel).
import { z } from "zod";
import type { Me } from "../../front-office/sales/contract.ts";   // relative: the api type-check reaches this file through the browser suite

export const KEY = { record: "agent/complaint:record", read: "agent/complaint:read" } as const;
export const has = (me: Me, key: string) => me.keys.includes(key);
/** BR-2 as PF-21j has it: the record key, as the handler or with the read key too, acts on an open complaint (the server
 *  still decides: api/src/platform/complaints/complaints.ts canAct). */
export const canAct = (me: Me, c: { handlerStaffId: string }) => has(me, KEY.record) && (c.handlerStaffId === me.staffId || has(me, KEY.read));

const when = z.string().nullable();
export const Complaint = z.object({
  id: z.string(), subjectKind: z.string(), subjectId: z.string().nullable(), complainantName: z.string().nullable(), complainantContact: z.string().nullable(),
  receivedAt: z.string(), channel: z.string(), category: z.string(), summary: z.string(), handlerStaffId: z.string(),
  acknowledgeBy: z.string(), acknowledgedAt: when, responseSentAt: when, status: z.enum(["OPEN", "CLOSED"]), outcome: z.string().nullable(), closedAt: when,
  recordedBy: z.string(), overdue: z.boolean(), businessDaysLeft: z.number().int().nullable(),
});
export type Complaint = z.infer<typeof Complaint>;
const People = z.record(z.string(), z.string());
export const Page = z.object({ items: z.array(Complaint), next: z.string().nullable(), people: People, firmTimeZone: z.string() });
export type Page = z.infer<typeof Page>;
export const Event = z.object({ id: z.string(), kind: z.string(), at: z.string(), actor: z.string(), note: z.string().nullable(), detail: z.unknown().nullable() });
export const Detail = Complaint.extend({ events: z.array(Event), people: People, firmTimeZone: z.string() });
export type Detail = z.infer<typeof Detail>;
export const Handlers = z.object({ items: z.array(z.object({ id: z.string(), displayName: z.string() })) });
export const Recorded = Complaint.extend({ reminderScheduled: z.boolean().optional() });

export const CHANNEL: Record<string, string> = { EMAIL: "Email", PHONE: "Phone", IN_PERSON: "In person", LETTER: "Letter", WEB_FORM: "Web form", OTHER: "Other" };
export const CATEGORY: Record<string, string> = { SERVICE: "Service", FEES: "Fees", COMMUNICATION: "Communication", CONDUCT: "Conduct", PRIVACY: "Privacy", OTHER: "Other" };
export const OUTCOME: Record<string, string> = { RESOLVED: "Resolved", UPHELD: "Upheld", NOT_UPHELD: "Not upheld", WITHDRAWN: "Withdrawn", REFERRED_TO_COLLEGE: "Referred to the College" };
export const KIND: Record<string, string> = { FRONT_OFFICE_PERSON: "Front-office contact", CASE_PARTY: "Person on a case", OTHER_PERSON: "Someone else" };
export const EVENT: Record<string, string> = {
  RECEIVED: "Complaint received", ACKNOWLEDGED: "Acknowledgement recorded", STEP: "Handling step", NOTE: "Note", RESPONSE_SENT: "Response sent",
  HANDLER_CHANGED: "Handler changed", REMINDER_SENT: "Reminder sent to acknowledge", CLOSED: "Closed",
};
export const word = (list: Record<string, string>, code: string | null) => (code === null ? "" : list[code] ?? code);

export const NOT_FOUND = "We can't find this complaint. It may not exist, or it may not be one you can see.";
export const READ_ONLY = "You can see this complaint but not change it: only an Owner, an Admin, or a handler who may record complaints can.";
/** §5 Refused: the panel's title; the server's own words follow it. */
export const FORBIDDEN = "You can't change this complaint. Ask an Owner or Admin.";
export const CLOSED_REFUSED = "This complaint is closed. It was closed while you were working; add it as a note instead.";

/** PF-21s part 4: the acts on a complaint, each one panel (concept §4 "Record page", "Drawers"). */
export type Action = "acknowledge" | "step" | "note" | "response" | "close" | "handler";
export const ACTION: Record<Action, { title: string; submit: string; done: string; description: string }> = {
  acknowledge: { title: "Record the acknowledgement", submit: "Record the acknowledgement", done: "Acknowledgement recorded.", description: "When the firm told the person it received their complaint. Recorded once." },
  step: { title: "Add a handling step", submit: "Add the step", done: "Handling step added.", description: "Something done to handle the complaint. It goes on the record and is never deleted." },
  note: { title: "Add a note", submit: "Add the note", done: "Note added.", description: "Something to keep on the record. It changes nothing else." },
  response: { title: "Record the response sent", submit: "Record the response", done: "Response recorded.", description: "When the firm sent its response to the person. Recorded once." },
  close: { title: "Close with an outcome", submit: "Close the complaint", done: "Complaint closed.", description: "A closed complaint is kept as it is; notes can still be added." },
  handler: { title: "Change handler", submit: "Change handler", done: "Handler changed.", description: "The new handler sees it and is reminded if it is not acknowledged by its date." },
};
/** The one filled button by status (concept §4): not acknowledged → acknowledge; response sent → close (steps are
 *  never required, §1; review m1); no step → a step; else response sent. A closed complaint takes a note only. */
export function nextAction(c: Detail): Action {
  if (c.status === "CLOSED") return "note";
  if (c.responseSentAt) return "close";   // also when answered before any acknowledgement (break m2a)
  if (!c.acknowledgedAt) return "acknowledge";
  if (!c.events.some((e) => e.kind === "STEP")) return "step";
  return "response";
}
/** The quiet secondary acts the service still allows while open, without the one filled. */
export function otherActions(c: Detail): Action[] {
  if (c.status === "CLOSED") return [];
  const all: Action[] = [...(c.acknowledgedAt ? [] : ["acknowledge" as const]), "step", "note", ...(c.responseSentAt ? [] : ["response" as const]), "close"];
  return all.filter((a) => a !== nextAction(c));
}
/** Every act this person may take on this complaint now (a restored panel for any other act is not opened, break m3). */
export const allowedActions = (me: Me, c: Detail): Action[] => (c.status === "CLOSED" ? ["note"] : [nextAction(c), ...otherActions(c), ...(canChangeHandler(me, c) ? ["handler" as const] : [])]);
/** BR-3: change handler, both keys and open only (the server still decides). */
export const canChangeHandler = (me: Me, c: { status: string }) => c.status === "OPEN" && has(me, KEY.record) && has(me, KEY.read);
export const OVERDUE_TIP = "Open and not acknowledged by its date. Once acknowledged, a complaint is not shown as overdue.";
export const HOW = "Record each complaint when it arrives. The handler acknowledges it, adds handling steps, records when the response was sent and closes it with an outcome. Everything stays on the record. A complaint is overdue only while it is not acknowledged by its date; once acknowledged it shows as Open however long it waits. The 2-business-day acknowledgement period and the lists of channels, topics and outcomes are Sample until the College's by-laws are read. Unconfirmed: no counsel.";

/** A name for a staff id or an event actor ("staff:<id>"), from the answer's `people` (G3); the system for anything else. */
export const nameOf = (people: Record<string, string>, idOrActor: string) => people[idOrActor.replace(/^staff:/, "")] ?? (idOrActor.startsWith("staff:") ? "A former staff member" : "The system");
/** "From": the complainant's name, or the kind alone when no name was given (a linked kind may leave it empty). */
export const fromOf = (c: Complaint) => c.complainantName ?? word(KIND, c.subjectKind);

/** Dates in the firm's zone (m1): the day alone, or the day and time. */
export const day = (iso: string, zone: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: zone }).format(new Date(iso));
export const dayTime = (iso: string, zone: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(iso));
/** The firm's zone for the label line, named once: "America/Toronto" → "America/Toronto" (not today's EST/EDT, which a
 *  date in the other half of the year would contradict; break m2). */
export const zoneName = (zone: string) => zone.replace(/_/g, " ");
/** G2: the business days left, as the server counted them (never worked out here). */
export function daysLeftWords(c: Complaint): { text: string; late: boolean } | null {
  const n = c.businessDaysLeft;
  if (n === null) return null;
  if (c.overdue) { const late = Math.max(1, -n); return { text: `${late} business ${late === 1 ? "day" : "days"} late`, late: true }; }
  return { text: n === 0 ? "due today" : `${n} business ${n === 1 ? "day" : "days"} left`, late: false };
}
/** Status: shape + word (EXPERIENCE §3), the "!" only for overdue. */
export const statusOf = (c: Complaint) => (c.status === "CLOSED" ? { mark: "✓", text: "Closed" } : c.overdue ? { mark: "!", text: "Overdue" } : { mark: "○", text: "Open" });

/** A "datetime-local" value typed in the firm's zone, as the instant it names (cut to the minute). */
export function zonedToIso(local: string, zone: string): string {
  const wall = Date.parse(`${local}:00Z`);
  // The zone's offset at an instant, as wall time minus the instant (break m1: taken at the answer, not at the guess,
  // so a time near a clock change keeps its wall time; a time the clock skips, e.g. 02:30 on spring-forward day, is read an hour earlier).
  const offset = (at: number) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - at; };
  let at = wall - offset(wall);
  at = wall - offset(at);
  return new Date(at).toISOString();
}
/** Now, in the firm's zone, as a "datetime-local" value. */
export function nowLocal(zone: string, now = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
