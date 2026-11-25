// R1.10 A3 (PF-28 on the front office's sales and retainers; #3487's hand-over, 24 Nov): a field sent alone is named on its
// own field, in plain words, even when another field is missing or the record does not exist. On an isolated copy, as the
// Sample firm's representative (user-R), each route is asked with a random record id:
//   W  a value of the wrong type, alone: 422 naming that field in the rule's own words (never zod's words, never the
//      unknown-field refusal, never a 404 from a look-up made before the field was read);
//   L  a value over the field's own length (20,000 characters), alone: 422 naming it in the service's words;
//   P  a value the field's rule takes passes the parse unchanged: the next rule or the look-up answers (another field's 422,
//      a 409, or 404), never this field; 5000 letters of 2 UTF-16 units each (U+1D400) count as 5000 (text()'s count, not the units);
//   N  nothing stored by any of it (the front office's row counts).
// Sample data only; no model call (US$0). Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh runtime_pf28a3 4797 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf28_a3_fo_fields.ts 4797 xr_studio_runtime_pf28a3
// (the usage line run-suites.sh reads; by hand, stop the copy after: zsh studio/tools/isolated.sh runtime_pf28a3 4797 stop)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4797), DB = process.argv[3] ?? "xr_studio_runtime_pf28a3", BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-X", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const { ok, summary } = recorder();
type Answer = { status: number; fields: Record<string, string> };
let token = "";
const call = async (method: string, path: string, body: unknown): Promise<Answer> => {
  const r = await fetch(`${BASE}/api/front-office/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const b = (await r.json().catch(() => null)) as { fields?: Record<string, string> } | null;
  return { status: r.status, fields: b?.fields ?? {} };
};
const id = () => randomUUID();
/** j_10's plain-words test (W2): no zod words, no braces, 3 to 200 characters. */
const plain = (w: string | undefined) => !!w && /^[^{}<>]{3,200}$/.test(w) && !/zod|invalid_type|undefined|\[object|Expected |Invalid option|Invalid input|received /i.test(w);

token = (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json() as { token?: string }).token ?? "";
ok("A3 setup: the Sample firm's representative signs in on the local stand-in", !!token);
if (!token) process.exit(summary() ? 1 : 0);
const rows = () => sql(`select (select count(*) from fo_lead) || ':' || (select count(*) from fo_note) || ':' || (select count(*) from fo_conflict_check) || ':' || (select count(*) from fo_identity_check) || ':' || (select count(*) from fo_retainer) || ':' || (select count(*) from fo_retainer_template)`);
const before = rows();

const OBJ = { pf28: 1 }, LONG = "a".repeat(20_000), WIDE = "\u{1D400}";
const VERSION = "Send the version shown on your page.", STATUS = "Send the status shown on your page.", NOT_ID = "Not an id.";
const DISCLOSURE = "The disclosure is at most 10,000 characters of visible text, with no control or direction characters.";
const FULL = "Send only the last 4 characters of the document number (documentNumberLast4).";
// [method, path, field, value, the field's words]
const W: [string, string, string, unknown, string][] = [
  ["POST", `people/${id()}/identity-checks`, "documentNumber", OBJ, FULL],
  ["POST", "signature-requests", "signerPersonIds", OBJ, "Pick one to 9 people to sign, by their ids."],
  ["POST", "signature-requests", "firmSignerStaffId", OBJ, "This is not a valid id."],
  ["POST", "retainer-templates", "kind", OBJ, "RETAINER or CONSULTATION."],
  ["POST", `retainer-templates/${id()}/versions`, "expectedVersion", OBJ, VERSION],
  ["PATCH", `retainers/${id()}`, "templateId", OBJ, NOT_ID], ["PATCH", `retainers/${id()}`, "signerPersonId", OBJ, NOT_ID],
  ["PATCH", `retainers/${id()}`, "representativeStaffId", OBJ, NOT_ID], ["PATCH", `retainers/${id()}`, "fees", OBJ, "At most 50 rows."],
  ["PATCH", `retainers/${id()}`, "expectedVersion", OBJ, VERSION], ["PATCH", `retainers/${id()}`, "expectedStatus", OBJ, STATUS],
  ["PATCH", `retainers/${id()}`, "expectedVersion", "1", VERSION],   // a JSON route takes a whole number, never its digits
  ["POST", `retainers/${id()}/withdraw`, "expectedVersion", OBJ, VERSION], ["POST", `retainers/${id()}/withdraw`, "expectedStatus", "sent", STATUS],
  ["POST", `retainers/${id()}/signed-offline`, "expectedVersion", "01", VERSION], ["POST", `retainers/${id()}/signed-offline`, "signedVersion", OBJ, "A version number from 1 to the current one."],
  ["POST", `prospects/${id()}/retainers`, "fees", "x", "At most 50 rows."],
];
const L: [string, string, string, string][] = [
  ["POST", "conflict-checks", "disclosureText", DISCLOSURE], ["POST", `conflict-checks/${id()}/confirm`, "disclosureText", DISCLOSURE],
  ["POST", `people/${id()}/identity-checks`, "documentNumber", FULL],
  ["POST", "leads", "note", "at most 5000 characters."], ["POST", `leads/${id()}/close`, "note", "at most 2000 characters."],
  ["POST", `leads/${id()}/reopen`, "reason", "at most 2000 characters."], ["POST", `prospects/${id()}/lost`, "note", "at most 2000 characters."],
  ["POST", `prospects/${id()}/undo-convert`, "reason", "at most 2000 characters."],
  ["POST", `leads/${id()}/calls`, "notes", "at most 5000 characters."], ["POST", `prospects/${id()}/calls`, "notes", "at most 5000 characters."],
  ["POST", `leads/${id()}/notes`, "text", "at most 5000 characters."],
  ["PATCH", `retainers/${id()}`, "templateId", NOT_ID], ["PATCH", `retainers/${id()}`, "expectedStatus", STATUS],
  ["POST", `retainers/${id()}/signed-offline`, "signedVersion", "A version number from 1 to the current one."],
];
const wBad: string[] = [], lBad: string[] = [];
for (const [m, p, f, v, words] of W) { const a = await call(m, p, { [f]: v }); if (!(a.status === 422 && a.fields[f] === words && plain(a.fields[f]))) wBad.push(`${m} ${p.replace(/[0-9a-f-]{36}/, ":id")} ${f} → ${a.status} ${JSON.stringify(a.fields)}`); }
ok(`A3 W fail: a value of the wrong type, sent alone, is named on its own field in the rule's own plain words (${W.length} probes on random ids)`, wBad.length === 0, wBad);
for (const [m, p, f, words] of L) { const a = await call(m, p, { [f]: LONG }); if (!(a.status === 422 && a.fields[f] === words && plain(a.fields[f]))) lBad.push(`${m} ${p.replace(/[0-9a-f-]{36}/, ":id")} ${f} → ${a.status} ${JSON.stringify(a.fields)}`); }
ok(`A3 L fail: a value of 20,000 characters, sent alone, is named on its own field in the service's words, before another field's rule or the record's look-up (${L.length} probes)`, lBad.length === 0, lBad);
const missing = await call("POST", "signature-requests", {});
ok("A3 W fail: a signature request with nothing sent names each required field in plain words (never zod's \"Invalid input\")", missing.status === 422 && missing.fields.signerPersonIds === "This is required." && missing.fields.prospectId === "This is required." && Object.values(missing.fields).every(plain), missing);

// P: what each rule takes passes on: the next rule (another field) or the look-up (404) answers.
const P: [string, string, Record<string, unknown>, string[]][] = [
  ["POST", `leads/${id()}/close`, { reasonId: id(), note: "n".repeat(2000) }, ["note"]],
  ["POST", `leads/${id()}/reopen`, { reason: WIDE.repeat(2000) }, ["reason"]],
  ["POST", `leads/${id()}/notes`, { text: WIDE.repeat(5000) }, ["text"]],
  ["POST", "leads", { note: WIDE.repeat(5000) }, ["note"]],
  ["POST", `conflict-checks/${id()}/confirm`, { result: "POTENTIAL_CONFLICT", disclosureText: "d".repeat(10_000) }, ["disclosureText"]],
  ["POST", `people/${id()}/identity-checks`, { requestId: id() }, ["documentNumber"]],
  ["POST", "signature-requests", { title: "Sample addendum", prospectId: id(), signerPersonIds: `${id()},${id()}`, firmSignerStaffId: "" }, ["prospectId", "signerPersonIds", "firmSignerStaffId"]],
  ["PATCH", `retainers/${id()}`, { templateId: id(), signerPersonId: null, representativeStaffId: id(), fees: [], expectedVersion: 1, expectedStatus: "DRAFT" }, ["templateId", "signerPersonId", "representativeStaffId", "fees", "expectedVersion", "expectedStatus"]],
  ["POST", `retainers/${id()}/withdraw`, { reason: "Sample reason", expectedVersion: 2, expectedStatus: "SENT" }, ["expectedVersion", "expectedStatus"]],
  ["POST", `retainers/${id()}/signed-offline`, { reason: "Signed at the office", expectedVersion: "2", signedVersion: "1" }, ["expectedVersion", "signedVersion"]],
  ["POST", `retainer-templates/${id()}/versions`, { expectedVersion: "" }, ["expectedVersion"]],
  ["POST", "retainer-templates", { kind: "CONSULTATION" }, ["kind"]],
  ["POST", `prospects/${id()}/retainers`, { kind: null, templateId: "", fees: [] }, ["kind", "templateId", "fees"]],
];
const pBad: string[] = [];
for (const [m, p, body, fs] of P) {
  const a = await call(m, p, body);
  if (!((a.status === 404 || a.status === 409 || (a.status === 422 && Object.keys(a.fields).length > 0)) && fs.every((f) => !(f in a.fields)))) pBad.push(`${m} ${p.replace(/[0-9a-f-]{36}/, ":id")} → ${a.status} ${JSON.stringify(a.fields)}`);
}
ok(`A3 P pass: a value each rule takes passes the parse unchanged (5000 characters of 2 UTF-16 units count as 5000): the next rule or the look-up answers, never that field (${P.length} calls)`, pBad.length === 0, pBad);
ok("A3 N: nothing stored by any probe (leads, notes, conflict checks, identity checks, retainers, templates)", rows() === before, { before, after: rows() });
process.exit(summary() ? 1 : 0);
