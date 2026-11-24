// PF-21rs A1 (R1.86; concept r2 screens/PF-21rs/concept.md §3-§6, challenge m3, m5): our console's Privacy pages' shapes
// and words, with no React, so the browser check reads the same words in Node. The answers are PF-21c's
// (`/api/system/register/breaches`) with PF-21rs R0's names (firms and our staff); the keys are SA-07 Appendix A's.
import { z } from "zod";

/** SA-07 Appendix A "ExpatReady's data-incident (breach) register": the Platform Owner and the Auditor read. */
export const BREACH_READ_KEY = "system/breach:read";
/** The same row: only the Platform Owner records breaches and sends their notices (SA7-D74 (b)). */
export const BREACH_MANAGE_KEY = "system/breach:manage";

/** The console's "Privacy" menu group (concept §4): each link shown only with its key. Requests and holds come with part B. */
export const PRIVACY_SECTIONS = [{ path: "/system/privacy/breaches", label: "Breaches", key: BREACH_READ_KEY }];

/** PF-21c's list (SA-11-24 names the field, not its list: Sample), in the API's order, with the words the notice uses. */
export const CATEGORIES = [
  ["identity_documents", "identity documents"], ["contact_details", "contact details"], ["immigration_records", "immigration records"], ["financial_details", "financial details"],
  ["sign_in_credentials", "sign-in credentials"], ["messages_and_files", "messages and files"], ["other", "other data"],
] as const;
export const categoryWords = (k: string) => CATEGORIES.find(([c]) => c === k)?.[1] ?? k;

const Notice = z.object({ id: z.string(), firmId: z.string(), firmName: z.string().nullable(), sentAt: z.string(), sentBy: z.string(), sentByName: z.string().nullable() });
export const Breach = z.object({
  id: z.string(), status: z.enum(["DRAFT", "RECORDED"]), source: z.enum(["MANUAL", "ALERT"]), discoveredAt: z.string(), description: z.string(),
  affectedFirms: z.array(z.string()), firms: z.array(z.object({ id: z.string(), name: z.string().nullable() })), scope: z.enum(["UNDER_INVESTIGATION", "KNOWN"]),
  dataCategories: z.array(z.string()), rootCause: z.string().nullable(), containment: z.string().nullable(), otherNotifications: z.string().nullable(),
  decision: z.enum(["UNDECIDED", "NOTIFY_FIRMS", "NO_NOTICE"]), decisionReason: z.string().nullable(), decidedBy: z.string().nullable(), decidedByName: z.string().nullable(), decidedAt: z.string().nullable(),
  openedBy: z.string(), openedByName: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), notices: z.array(Notice),
});
export type Breach = z.infer<typeof Breach>;
export const BreachList = z.object({ breaches: z.array(Breach), truncated: z.boolean() });
export type BreachList = z.infer<typeof BreachList>;

/** A breach's calculated status (concept §4, challenge m5): one word and a shape (never colour alone, UXL-14), and its
 *  one next step. Notify firms with no firm named yet is "Firms to be named"; a firm the API refused (NO_RECIPIENTS) still
 *  counts as owed. */
export type BreachStatus = "DRAFT" | "DECISION_OWED" | "FIRMS_TO_NAME" | "NOTICES_OWED" | "RECORDED";
export const STATUS_WORDS: Record<BreachStatus, { word: string; mark: string; tone: string; hint: string }> = {
  DRAFT: { word: "Draft: confirm it", mark: "◇", tone: "text-text-warn", hint: "Opened from an alert; confirm the record before anything else." },
  DECISION_OWED: { word: "Decision owed", mark: "◆", tone: "text-text-warn", hint: "Recorded; decide whether the affected firms are told." },
  FIRMS_TO_NAME: { word: "Firms to be named", mark: "◆", tone: "text-text-warn", hint: "Firms are to be told, but none is named yet." },
  NOTICES_OWED: { word: "Notices owed", mark: "▲", tone: "text-text-danger", hint: "Firms are to be told and some have not been sent their notice." },
  RECORDED: { word: "Recorded", mark: "●", tone: "text-text-ok", hint: "Decided, and nothing is owed." },
};
type StatusOf = Pick<Breach, "status" | "decision" | "affectedFirms"> & { notices: { firmId: string }[] };
export function statusOf(b: StatusOf): BreachStatus {
  if (b.status === "DRAFT") return "DRAFT";
  if (b.decision === "UNDECIDED") return "DECISION_OWED";
  if (b.decision === "NO_NOTICE") return "RECORDED";
  if (!b.affectedFirms.length) return "FIRMS_TO_NAME";
  const sent = new Set(b.notices.map((n) => n.firmId));
  return b.affectedFirms.every((f) => sent.has(f)) ? "RECORDED" : "NOTICES_OWED";
}
/** "1 of 2 sent" once firms are to be told; a dash otherwise. */
export function noticesText(b: StatusOf): string {
  if (b.status === "DRAFT" || b.decision !== "NOTIFY_FIRMS") return "—";
  const sent = new Set(b.notices.map((n) => n.firmId));
  return `${b.affectedFirms.filter((f) => sent.has(f)).length} of ${b.affectedFirms.length} sent`;
}
export const DECISION_WORDS: Record<Breach["decision"], string> = { UNDECIDED: "Not decided", NOTIFY_FIRMS: "Notify firms", NO_NOTICE: "No notice" };

/** An id shown short: its first and last four, "3f2a…c91e" (UXL: ids chunked). */
export const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);
/** At most `n` firm names, then "and N more" (break m3: a breach may name up to 200 firms). */
export function firmsText(firms: { id: string; name: string | null }[], n = 3): string {
  const shown = firms.slice(0, n).map(firmWords).join(", ");
  return firms.length > n ? `${shown} and ${firms.length - n} more` : shown;
}
/** A firm's name, or its short id when the register could not name it. */
export const firmWords = (f: { id: string; name: string | null }) => f.name ?? `Firm ${shortId(f.id)}`;

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
/** "24 Nov 2026, 07:10" (UTC, named in the page's lead line), the console's own date style. */
export const whenWords = (iso: string) => WHEN.format(new Date(iso));

/** The value a datetime-local box holds for this moment in the browser's own zone ("2026-11-24T07:10"). */
export function localBox(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** The box's local time as an ISO instant for the API (null for an empty or unreadable box). */
export function fromLocalBox(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The "Record a breach" body (PF-21c OpenBody): optional texts left out when blank, never sent as "". */
export type RecordDraft = { discoveredAt: string; description: string; firms: { id: string; name: string | null }[]; categories: string[]; rootCause: string; containment: string; otherNotifications: string; reason: string };
export function recordBody(d: RecordDraft): Record<string, unknown> {
  // An empty or half-typed box is sent as typed: the API refuses it with every other field at once (break m4).
  const out: Record<string, unknown> = { reason: d.reason, discoveredAt: fromLocalBox(d.discoveredAt) ?? d.discoveredAt, description: d.description };
  if (d.firms.length) out.affectedFirms = d.firms.map((f) => f.id);
  if (d.categories.length) out.dataCategories = d.categories;
  for (const k of ["rootCause", "containment", "otherNotifications"] as const) if (d[k].trim()) out[k] = d[k];
  return out;
}
/** A 422's field names as the dialog's own fields ("affectedFirms.1" → "affectedFirms"); anything else under "other". */
export function fieldErrors(fields: Record<string, string> | undefined): Record<string, string> {
  const known = ["reason", "discoveredAt", "description", "affectedFirms", "dataCategories", "rootCause", "containment", "otherNotifications"];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields ?? {})) { const top = k.split(".")[0]; const at = known.includes(top) ? top : "other"; out[at] = out[at] ? `${out[at]} ${v}` : v; }
  return out;
}

export const COPY = {
  breachesTitle: "Breaches",
  breachesLead: "Every breach of our security safeguards, kept 7 years; never deleted. Times in UTC.",
  readOnly: "Read only: you hold system/breach:read.",
  breachesEmpty: "No breach is recorded. Record one the moment a breach of our safeguards is known: whether firms are told is decided after.",
  truncated: "Showing the newest 500.",
  underInvestigation: "Under investigation",
  loadFailed: "Could not load the breaches. Please try again.",
  recordTitle: "Record a breach",
  recordLead: "Record it now, even with little known (it can be completed later). Nothing is sent to anyone.",
  recorded: "Recorded. Next: decide whether firms are told.",
  firmsHint: "Pick from the firm list; leave empty while under investigation.",
  firmsSearchShort: "Type at least 2 letters of the firm's name.",
  firmsNone: "No firm matches.",
  firmsMore: "Showing the first 8 matches: type more of the name to narrow.",
  firmsFailed: "Could not search the firms.",
  discoveredHint: "Your local time; stored in UTC.",
  descriptionHint: "Firms will read this in their notice.",
  reasonHint: "Why you are recording it: kept on the audit line.",
  recordFailed: "Could not record the breach. Please try again.",
  maybeRecorded: "An earlier try may already have recorded this breach: check the list behind this dialog before recording it again.",
} as const;
