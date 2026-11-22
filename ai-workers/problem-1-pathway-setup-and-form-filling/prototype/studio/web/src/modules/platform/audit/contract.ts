// AUD-4s (concept screens/AUD-4s/concept.md C1-C9 over concept-draft.md; AG-16-26, SA-6-33, SA-2-29, SA-11-34; R1.88): the
// shapes the Activity log page reads from AUD-4's routes (GET /api/platform/audit, as merged: `ours`, not the draft's
// `staffAccess`; `who` is words; filter refusals are 422) and AUD-5's keep-periods read, parsed at the edge, and the page's
// pure helpers: the filters and the address, the dates in the log's zone, the sentence that reads the filters back. No
// imports from the app, so a test reads it in Node. The server decides every rule; the page shows it.
import { z } from "zod";

export const AUDIT_KEY = "agent/audit:read";

const Change = z.object({ field: z.string(), from: z.string(), to: z.string(), words: z.string() });
export const Line = z.object({
  id: z.string(), at: z.string(), who: z.string(), staffId: z.string().nullable(), area: z.string(), areaWords: z.string(), action: z.string(), actionWords: z.string().nullable(),
  summary: z.string(), changes: z.array(Change),
  advanced: z.object({ action: z.string(), actor: z.string(), actorType: z.string(), entity: z.string(), entityKey: z.string().nullable(), caseId: z.string().nullable(), correlationId: z.string().nullable(),
    supportSessionId: z.string().nullable(), detail: z.unknown() }),
});
export type Line = z.infer<typeof Line>;
export const Person = z.object({ staffId: z.string(), name: z.string(), active: z.boolean() });
export type Person = z.infer<typeof Person>;
/** One page. The first page (no cursor) also carries the filters' sources: the people with a line in the firm's log
 *  (deactivated kept, C3), the actions it holds and the areas. `timeZone` is not in AUD-4's answer today (C9, asked of
 *  the tech lead on the PR): when it arrives the page uses it; until then every time is UTC and says so. */
/** A time zone the browser can show times in (break round 2 m1: an unknown name threw while the page drew). */
const isZone = (z: string) => { try { new Intl.DateTimeFormat("en-CA", { timeZone: z }); return true; } catch { return false; } };
export const Page = z.object({
  lines: z.array(Line), next: z.string().nullable(),
  people: z.array(Person).optional(), actions: z.array(z.object({ action: z.string(), words: z.string().nullable() })).optional(),
  areas: z.array(z.object({ code: z.string(), words: z.string() })).optional(), timeZone: z.string().refine(isZone).optional(),
});
export type Page = z.infer<typeof Page>;
/** AUD-5's read: only the activity log's sentence is used here (C6). */
export const KeepPeriods = z.object({ activityLog: z.string() });

/** Who did it, as the Advanced "Done by" filter offers it (AUD-4's actor types). */
export const DONE_BY: Record<string, string> = { FIRM_STAFF: "Firm staff", OUR_STAFF: "ExpatReady staff", CLIENT: "A client", SYSTEM: "The system", SEED: "Sample data" };

export const COPY = {
  title: "Activity log", subtitle: "Who changed what in your firm. Read-only.",
  shortcut: "ExpatReady staff access", shortcutTip: "Show only changes made by ExpatReady staff, including support sessions.",
  sessions: "Session start, end, duration and reason show here once support sessions are recorded.",
  noAccess: "You do not have access to the activity log", noAccessAsk: "Ask your firm's Owner or an Admin.",
  loading: "Loading the activity log", loadFailed: "The activity log could not load", loadFailedTry: "Check your connection and try again.",
  emptyHelp: "Nothing matches these dates and filters. Try a wider date range or clear the filters.",
  firstUse: "No activity yet", firstUseHelp: "When your team changes settings, roles or connections, each change is listed here.",
  onlyPerson: "Show only this person's changes", raw: "Advanced: raw before and after",
  exportAsk: "Export these lines as CSV?", exportRecorded: "This export is recorded in the activity log.", exportFull: "Names and changes in full; times in UTC.",
  tooLarge: "This export is too large", exportFailed: "The export could not be made", exportFailedTry: "No file was saved. Try again.",
} as const;

// ------------------------------------------------------------------------------------------------ dates in a zone
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A real calendar day "2026-11-22" (no 31 February), from 1970 to 9998 (break M3: 31 Dec 9999 has no next day to end
 *  the range on, and threw while the page drew). */
export function isDay(v: string): boolean {
  const m = DAY.exec(v); if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return y >= 1970 && y <= 9998 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const parts = (at: number, zone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
  .formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
/** Today's day in the zone. */
export const today = (zone: string, now = Date.now()) => { const p = parts(now, zone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
export const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** The moment a day starts in the zone (its midnight; where a clock change skips midnight, the first moment after). */
export function dayStart(day: string, zone: string): Date {
  const [y, m, d] = day.split("-").map(Number), wall = Date.UTC(y, m - 1, d);
  const offset = (at: number) => { const p = parts(at, zone); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at; };
  let at = wall - offset(wall); at = wall - offset(at);
  // Midnight skipped (break m7, America/Santiago 6 Sep 2026): the sum lands on the day before; the first moment of the day is
  // that far ahead (a gap is at most an hour, 30 minutes at Lord Howe), found in 15-minute steps.
  for (let i = 0; i < 8 && today(zone, at) < day; i++) at += 15 * 60_000;
  return new Date(at);
}
/** "Toronto time" for America/Toronto; "UTC" for UTC. Named once, in the sentence (BR-11). */
export const zoneWords = (zone: string) => (zone === "UTC" || zone === "Etc/UTC" ? "UTC" : `${(zone.split("/").pop() ?? zone).replace(/_/g, " ")} time`);
/** "9 Nov 2026" */
export const dayWords = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const ms = (at: string) => new Date(at.replace(/(\.\d{3})\d+Z$/, "$1Z"));   // the log's times carry microseconds
/** A line's time on the row: "16 Nov, 10:42" (the year too when it is not this year's). */
export function when(at: string, zone: string, now = Date.now()): string {
  const d = ms(at), sameYear = parts(d.getTime(), zone).year === parts(now, zone).year;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(d);
}
/** A line's time in full on the open row: "16 Nov 2026, 10:42:07". */
export const whenFull = (at: string, zone: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: zone }).format(ms(at));

// ------------------------------------------------------------------------------------------------ filters and the address
export type Filters = { from: string; to: string; person: string; area: string; ours: boolean; action: string; entity: string; entityKey: string; actorType: string };
export const ADVANCED = ["action", "entity", "entityKey", "actorType"] as const;
/** BR-3: the last 7 days by default (Sample), in the log's zone. */
export const defaults = (zone: string, now = Date.now()): Filters => { const to = today(zone, now); return { from: addDays(to, -7), to, person: "", area: "", ours: false, action: "", entity: "", entityKey: "", actorType: "" }; };
const TEXT = ["person", "area", "action", "entity", "entityKey", "actorType"] as const;
/** The filters an address carries; what it leaves out is the default. */
export function readFilters(q: URLSearchParams, zone: string, now = Date.now()): Filters {
  const f = defaults(zone, now);
  if (q.has("from")) f.from = q.get("from") ?? "";
  if (q.has("to")) f.to = q.get("to") ?? "";
  for (const k of TEXT) f[k] = q.get(k) ?? "";
  f.ours = q.get("ours") === "1";
  return f;
}
/** The address for these filters: only what differs from the default, so a shared link to "the last 7 days" stays that. */
export function writeFilters(f: Filters, zone: string, now = Date.now()): URLSearchParams {
  const d = defaults(zone, now), q = new URLSearchParams();
  if (f.from !== d.from || f.to !== d.to) { q.set("from", f.from); q.set("to", f.to); }
  for (const k of TEXT) if (f[k]) q.set(k, f[k]);
  if (f.ours) q.set("ours", "1");
  return q;
}
/** The query AUD-4's routes take: From's first moment to the moment after To's last (the server's `to` is exclusive). */
export function apiQuery(f: Filters, zone: string, cursor?: string): string {
  const q = new URLSearchParams({ from: dayStart(f.from, zone).toISOString(), to: dayStart(addDays(f.to, 1), zone).toISOString() });
  for (const k of TEXT) if (f[k]) q.set(k, f[k]);
  if (f.ours) q.set("ours", "1");
  if (cursor) q.set("cursor", cursor);
  return q.toString();
}
/** How long a range is, in words ("1 year 10 months", "2 years", "just over 1 year"). */
export function spanWords(from: string, toAfter: string): string {
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = toAfter.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1); if (d2 < d1) months--;
  const years = Math.floor(months / 12), rest = months % 12, plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (rest === 0) return d2 === d1 ? plural(years, "year") : `just over ${plural(years, "year")}`;
  return `${plural(years, "year")} ${plural(rest, "month")}`;
}
/** BR-3 on the field: both dates real, To not before From, at most one year (the server's own sum: From's first moment
 *  plus one calendar year, in UTC). Null: the range can be read. */
export function rangeProblem(f: Filters, zone: string): { field: "from" | "to"; words: string } | null {
  if (!isDay(f.from)) return { field: "from", words: "Pick a date." };
  if (!isDay(f.to)) return { field: "to", words: "Pick a date." };
  if (f.to < f.from) return { field: "to", words: "Pick a date on or after From." };
  const from = dayStart(f.from, zone), to = dayStart(addDays(f.to, 1), zone), limit = new Date(from); limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  return to > limit ? { field: "from", words: `Pick dates at most one year apart (this range is ${spanWords(f.from, addDays(f.to, 1))}).` } : null;
}

// ------------------------------------------------------------------------------------------------ the filters in words
export type Names = { people: readonly Person[]; areas: readonly { code: string; words: string }[]; actions: readonly { action: string; words: string | null }[] };
export const personWords = (id: string, n: Names) => { const p = n.people.find((x) => x.staffId === id); return p ? `${p.name}${p.active ? "" : " (left the firm)"}` : "a person not on this list"; };
export const areaWords = (code: string, n: Names) => n.areas.find((a) => a.code === code)?.words ?? code;
export const actionWords = (action: string, n: Names) => n.actions.find((a) => a.action === action)?.words ?? action;
/** Every filter that is set beyond the dates, with its words: the chips, and the sentence's Advanced part (BR-12). */
export function activeFilters(f: Filters, n: Names): { key: keyof Filters; words: string }[] {
  const out: { key: keyof Filters; words: string }[] = [];
  if (f.ours) out.push({ key: "ours", words: "ExpatReady staff only" });
  if (f.person) out.push({ key: "person", words: `Person: ${personWords(f.person, n)}` });
  if (f.area) out.push({ key: "area", words: `Area: ${areaWords(f.area, n)}` });
  if (f.action) out.push({ key: "action", words: `Action: ${actionWords(f.action, n)}` });
  if (f.entity) out.push({ key: "entity", words: `Record type: ${f.entity}` });
  if (f.entityKey) out.push({ key: "entityKey", words: `Record: ${f.entityKey}` });
  if (f.actorType) out.push({ key: "actorType", words: `Done by: ${DONE_BY[f.actorType] ?? f.actorType}` });
  return out;
}
/** The sentence that reads the filters back, so a filter that hides lines is never silent (BR-12); the export's confirm
 *  repeats it (the file holds exactly those lines). No count: the caller adds what is shown. */
export function sentence(f: Filters, n: Names, zone: string): string {
  const who = f.ours ? `ExpatReady staff changes${f.person ? ` by ${personWords(f.person, n)}` : ""}` : f.person ? `changes by ${personWords(f.person, n)}` : "everyone's changes";
  const advanced = [f.action ? `action ${actionWords(f.action, n)}` : "", f.entity ? `record type ${f.entity}` : "", f.entityKey ? `record ${f.entityKey}` : "", f.actorType ? `done by ${DONE_BY[f.actorType] ?? f.actorType}` : ""].filter(Boolean);
  return `${who} in ${f.area ? areaWords(f.area, n) : "all areas"}${advanced.length ? `, ${advanced.join(", ")} (Advanced)` : ""}, from ${dayWords(f.from)} to ${dayWords(f.to)} (${zoneWords(zone)})`;
}
/** The empty list's heading (BR-4: with the shortcut and a person, it names both). */
export const emptyTitle = (f: Filters, n: Names) => (f.ours && f.person ? `No ExpatReady staff changes by ${personWords(f.person, n)}` : `No changes from ${dayWords(f.from)} to ${dayWords(f.to)}`);
/** The file's name from the answer's Content-Disposition, else a plain one. */
export const fileName = (disposition: string | null) => /filename="([A-Za-z0-9._-]+)"/.exec(disposition ?? "")?.[1] ?? "activity-log.csv";
