// PF-23 (SA-11 BR-16, SA-11-37, SA11-D13; NFR5-14 "PII redaction at the logger"): the redaction step every log line
// passes through. Personal data of clients and staff is never written to a system log: entries carry record ids and
// rule names only. Two passes:
//  * by name: a field whose name says it holds personal data or a secret (email, phone, names, document numbers,
//    tokens, Authorization, cookies, message bodies, subjects, attachment names, …) is replaced by "[redacted]";
//  * by pattern, in any text left: email addresses, bearer and basic credentials, JWTs, phone-like and document-like
//    numbers, query-string values and key=value secrets are replaced by a marker naming what was there.
// An error keeps its class, its code and its stack frames, never its message: a message can quote any value (a name in
// "No client Client A", a duplicate email from the database), and a name cannot be found by pattern.
// Never throws: a value that cannot be read becomes a marker.

/** Field names (compared lower case, letters only, last dotted part) whose values never reach a log. */
export const PERSONAL_FIELDS = new Set([
  "email", "emails", "emailaddress", "phone", "phones", "phonenumber", "mobile", "telephone", "telephonenumber", "tel", "fax", "faxnumber",
  "name", "names", "firstname", "lastname", "givenname", "givennames", "familyname", "surname", "fullname", "displayname", "middlename", "clientname", "staffname", "contactname",
  "documentnumber", "passportnumber", "passport", "uci", "sin", "ssn", "dob", "dateofbirth", "birthdate",
  "address", "street", "streetname", "postalcode", "zip",
  "token", "accesstoken", "refreshtoken", "idtoken", "apikey", "password", "passphrase", "secret", "clientsecret", "authorization", "cookie", "cookies", "setcookie", "xactor",
  "body", "text", "html", "subject", "attachments", "attachment", "attachmentname", "attachmentnames", "filename", "originalname",
  "to", "cc", "bcc", "from", "replyto", "recipient", "recipients", "sender",
  "detail", // a PostgreSQL error's DETAIL repeats the refused row's values (PF-23r, FO-13 break 11)
]);

const keyOf = (k: string) => (k.split(".").pop() ?? k).toLowerCase().replace(/[^a-z]/g, "");
// Compound names (review m3): a key ending in one of these, or starting "nameof", holds the same data
// (client_full_name, applicantName, family_names, visit_contact_name, recipientEmail, holderPassport, applicantUci).
const PERSONAL_SUFFIXES = ["name", "names", "email", "emails", "emailaddress", "phone", "phonenumber", "mobile", "birth", "dateofbirth", "birthdate", "passport", "passportnumber", "uci", "address", "surname", "documentnumber"];
/** Names that end like a personal field but hold a code's own word: a rule, a template, a queue, a form, an event, an
 *  error class, a route, a model, a field or section of the configuration, a host or a program. */
const NOT_PERSONAL = new Set(["rule", "rulename", "template", "templatename", "queue", "queuename", "form", "formname", "event", "eventname", "error", "errorname", "route", "routename", "model", "modelname", "context", "kind", "type", "typename", "field", "fieldname", "sectionname", "documenttypename", "hostname", "servicename", "metricname", "dimensionname", "appname", "programname", "combinationname", "stepname", "jobname"]);
export const isPersonalField = (k: string) => {
  const key = keyOf(k);
  if (PERSONAL_FIELDS.has(key)) return true;
  if (NOT_PERSONAL.has(key)) return false;
  return key.startsWith("nameof") || PERSONAL_SUFFIXES.some((sfx) => key.endsWith(sfx));
};

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const CREDENTIAL = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{4,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
// A cookie header holds several pairs (review m4): everything after "cookie:" to the end of the line or quote.
// "Cookie sid=abc" (no ":") is a cookie header too (PF-23r).
// A quoted value runs to its closing quote (review r1 m2: `Cookie sid="abc"` lost only its first character).
const COOKIE = /\b(set-cookie|cookie)(["']?\s*[:=]\s*|\s+(?=[A-Za-z0-9_.-]+=))(?:"[^"\n]*"|[^\n"])+/gi;
const ASSIGNED_SECRET = /\b(password|passwd|secret|token|api[_-]?key|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi;
const QUERY_VALUE = /([?&][A-Za-z0-9_.[\]-]{1,60}=)[^&\s"'#]+/g;
// A run of 9 to 15 digits, with spaces, dots, dashes or brackets between them (a phone number, a document number), not
// part of a longer token (a uuid's last group, a hex id) and not an ISO date or time.
const NUMBER_RUN = /(?<![\w.:/-])\+?\(?\d[\d ().-]{6,}\d(?![\w:/-])/g;
const DOCUMENT_ID = /\b[A-Z]{1,2}\d{6,9}\b/g;
// An 8-digit UCI written 1234-5678 (review m5; 10-digit ones are number runs), never a year range such as 2026-2027
// nor a time range such as 0900-1700 (PF-23r: two 24-hour clock times, hhmm-hhmm).
const UCI8 = /(?<![\w.:/-])\d{4}-\d{4}(?![\w:/-])/g;
const YEAR_RANGE = /^(19|20)\d{2}-(19|20)\d{2}$/, TIME_RANGE = /^(?:(?:[01]\d|2[0-3])[03]0|2400)-(?:(?:[01]\d|2[0-3])[03]0|2400)$/; // whole and half hours only (review r1 m1; Devin: a UCI 1130-0845 stays hidden)
// PostgreSQL repeats a refused row's values (PF-23r, FO-13 break 11): "DETAIL:  Key (email)=(x@y) already exists.",
// "Failing row contains (…)". The words after DETAIL: and every value list are replaced; the column names stay.
// To the end of the line, quotes included (review r1 m2: a value "Client \"JJ\" Doe" leaked after its quote); a column
// list may hold one level of brackets, an expression index's lower(email::text) (review r1 m3).
const PG_DETAIL = /\b(DETAIL:)[^\n]*/g;
const PG_KEY = /\b(Key \((?:[^()\n]|\([^()\n]*\)){0,200}\)=\()[^\n]*\)(?=[\s.,"]|$)/g;
const PG_ROW = /\b(Failing row contains )\([^\n]*\)/g;
const isEpochMs = (m: string) => /^1\d{12}$/.test(m); // 13 plain digits from 1 (2001-2286): a time in ms, kept (review m6)

/** Free text with every personal pattern replaced by a marker. */
export function redactText(s: string): string {
  return s
    .replace(PG_DETAIL, "$1 [redacted]")
    .replace(PG_KEY, "$1[redacted])")
    .replace(PG_ROW, "$1([redacted])")
    .replace(JWT, "[token]")
    .replace(CREDENTIAL, (_m, kind: string) => `${kind} [token]`)
    .replace(COOKIE, (_m, k: string, sep: string) => `${k}${sep}[redacted]`)
    .replace(ASSIGNED_SECRET, (_m, k: string, sep: string) => `${k}${sep}[redacted]`)
    .replace(EMAIL, (m, domain: string) => (/^[\d.]+$/.test(domain) ? m : "[email]")) // a package@1.2.3 in a frame is not an address
    .replace(QUERY_VALUE, (_m, k: string) => `${k}[redacted]`)
    .replace(NUMBER_RUN, (m) => { const digits = m.replace(/\D/g, "").length; return digits >= 9 && digits <= 15 && !/^\d{4}-\d{2}-\d{2}/.test(m) && !isEpochMs(m) ? "[number]" : m; })
    .replace(UCI8, (m) => (YEAR_RANGE.test(m) || TIME_RANGE.test(m) ? m : "[number]"))
    .replace(DOCUMENT_ID, "[number]");
}

/** A V8 stack frame: "at …" ending in a place (file:line:col, <anonymous>, native), never "at 10:00 the job ran"
 *  (review r1 m4). */
const FRAME_END = /(:\d+:\d+\)?|\((?:<anonymous>|native|index \d+)\))$/;
const isFrame = (l: string) => l.startsWith("at ") && FRAME_END.test(l);

/** Stack frames only ("at …" lines): the first line of a stack repeats the message, so it is left out. */
export function framesOf(stack: unknown, max = 8): string[] {
  if (typeof stack !== "string") return [];
  return stack.split("\n").map((l) => l.trim()).filter(isFrame).slice(0, max).map(redactText);
}

/** An error as a log carries it: class, code, HTTP status and frames; never the message. */
export function safeError(e: unknown): Record<string, unknown> {
  try { return errorShape(e); } catch { return { errorName: "Error", message: "[not logged: unreadable error]" }; }
}
function errorShape(e: unknown): Record<string, unknown> {
  if (!(e instanceof Error)) return { errorName: typeof e, message: "[not logged: not an Error]" };
  const x = e as Error & { code?: unknown; status?: unknown };
  const out: Record<string, unknown> = { errorName: /^[A-Za-z0-9_$]{1,60}$/.test(x.name) ? x.name : "Error" };
  if (typeof x.code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(x.code)) out.code = x.code;
  if (typeof x.status === "number") out.status = x.status;
  out.frames = framesOf(x.stack);
  return out;
}

// PF-23m (SA-11-37 rule 1: "record id, mailbox id, rule name, result"): the database rule a refusal names, never its
// words. PostgreSQL names a constraint, trigger or policy in double quotes; only a name shaped like an identifier that
// pattern redaction leaves as it is comes back (a quoted value never does: it is not identifier-shaped, or it is not
// after one of these words).
const DB_RULE = /\b(?:constraint|trigger|policy|function)\s+"([A-Za-z_][A-Za-z0-9_]{0,62})"/;
/** The constraint, trigger, policy or function a database error names, or undefined. */
export function dbRuleOf(e: unknown): string | undefined {
  try {
    const x = e as { message?: unknown; meta?: { constraint?: unknown; target?: unknown } } | null;
    const fromMeta = typeof x?.meta?.constraint === "string" ? x.meta.constraint : undefined;
    const name = fromMeta ?? (typeof x?.message === "string" ? DB_RULE.exec(x.message)?.[1] : undefined);
    return name && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name) && redactText(name) === name ? name : undefined;
  } catch { return undefined; }
}

/** Sample: the most values one redact() call walks (PF-23r, review minor 1); what is left becomes "[over budget]". */
export const REDACT_BUDGET = 2_000;
type Walk = { left: number; seen: WeakSet<object>; path: WeakSet<object> };

/** A value made safe to log: personal fields replaced by name, text redacted by pattern, errors reduced to their shape.
 *  Cycles, deep nesting and values JSON cannot hold (bigint, functions, symbols) become markers. One call walks at most
 *  REDACT_BUDGET values; an object met a second time is written "[shared]" (a cycle, met again on its own path,
 *  "[cycle]"), so a graph of shared references is walked once, not once per path (PF-23r). */
export function redact(value: unknown): unknown {
  return walk(value, 0, { left: REDACT_BUDGET, seen: new WeakSet(), path: new WeakSet() });
}
function walk(value: unknown, depth: number, w: Walk): unknown {
  if (w.left <= 0) return "[over budget]";
  w.left--;
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return logText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return `[${typeof value}]`;
  // Leaves first: a Date or an Error met twice is written twice, never "[shared]" (review r1 m5).
  try {
    if (value instanceof Error) return safeError(value);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "[invalid date]" : value.toISOString();
  } catch { return "[not logged: unreadable value]"; }
  if (w.path.has(value)) return "[cycle]";
  if (w.seen.has(value)) return "[shared]";
  if (depth >= 6) return "[deep]";
  w.seen.add(value); w.path.add(value);
  try {
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => walk(v, depth + 1, w));
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[bytes]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, 100)) {
      const key = redactText(k);
      out[key] = keyOf(k) === "meta" && v && typeof v === "object" ? prismaMeta(v as Record<string, unknown>)
        : isPersonalField(k) && v != null && v !== "" ? "[redacted]" : walk(v, depth + 1, w);
    }
    return out;
  } catch { return "[not logged: unreadable value]"; } // a throwing getter, a revoked proxy (review m1)
  finally { w.path.delete(value); }
}

const COLUMN = /^[A-Za-z_][A-Za-z0-9_.]{0,62}$/;
/** Prisma's error `meta` (PF-23r, FO-13 break 11): its values can repeat the refused row (a driver's message, a DETAIL
 *  line). Only the model's name and the constraint's columns stay, and only when pattern redaction leaves them as they
 *  are (a document number AB123456 is shaped like a column name); every other value is replaced. */
function prismaMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (const [k, v] of Object.entries(meta).slice(0, 20)) {
      const cols = Array.isArray(v) ? v : typeof v === "string" ? [v] : null;
      out[redactText(k)] = (k === "modelName" || k === "target") && cols?.length && cols.every((c) => typeof c === "string" && COLUMN.test(c) && redactText(c) === c) ? v : "[redacted]";
    }
  } catch { return { meta: "[not logged: unreadable value]" }; }
  return out;
}

const hasFrame = (s: string) => s.split("\n").slice(1).some((l) => isFrame(l.trim()));
// The class only when it is shaped like one (TypeError, PrismaClientKnownRequestError, HttpException): a first line
// "Client: …" never gives "Client".
const ERROR_CLASS = /^\s*([A-Z][A-Za-z0-9_$]{0,50}(?:Error|Exception))(?=[:\s]|$)/;
/** Text as a log keeps it: a stack trace written as text (console.error(err.stack), Nest's error(message, stack)) is
 *  reduced to its frames, since its first lines are the error's message, which can span several lines (Prisma's do:
 *  PF-23r, review minor 3); only the frame lines and the first line's error class are kept. Any other text is
 *  redacted by pattern. */
export function logText(s: string): string {
  if (!hasFrame(s)) return redactText(s);
  const cls = ERROR_CLASS.exec(s.split("\n", 1)[0])?.[1];
  return `[stack]${cls ? ` ${cls}` : ""} ${framesOf(s).join(" | ")}`;
}
