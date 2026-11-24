// R1.10 A2 (PF-28 on booking and the platform's last fields; #3487's hand-over, 24 Nov): a field sent alone is named on its own
// field in plain words (never zod's "Invalid input…" or "Too big…", never a bare 400, never a 404 from a look-up made first).
// On an isolated copy, as the Sample firm's representative (user-R) and a Sample operator of ours holding every system role:
//   W  booking types, hours and the firm profile: a value of the wrong type or over its length → 422, its field, plain words;
//   L  the public booking doors, the support reply, the sign-up link's email, the keep-period reason (named with the years),
//      an office's version, a template's body and the web-address change's address → 422 naming that field;
//   Q  find's wrong-length q → 422 naming q (was 400), its code QUERY_LENGTH kept;
//   P  a value each rule takes passes the parse: the next rule or the look-up answers, never that field;
//   N  nothing stored (the booking, office, template, setting and support tables' row counts).
// Sample data only; no model call (US$0). Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh runtime_pf28a2 4798 start PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_pf28_a2_fields.ts 4798 xr_studio_runtime_pf28a2
// (the usage line run-suites.sh reads; by hand, stop the copy after: zsh studio/tools/isolated.sh runtime_pf28a2 4798 stop)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4798), DB = process.argv[3] ?? "xr_studio_runtime_pf28a2", BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-X", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const { ok, summary } = recorder();
type Answer = { status: number; code?: string; fields: Record<string, string> };
const call = async (method: string, path: string, token: string | undefined, body?: unknown): Promise<Answer> => {
  const bodyless = method === "GET";
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(bodyless ? {} : { "content-type": "application/json" }) }, body: bodyless ? undefined : JSON.stringify(body ?? {}) });
  const b = (await r.json().catch(() => null)) as { fields?: Record<string, string>; code?: string } | null;
  return { status: r.status, code: b?.code, fields: b?.fields ?? {} };
};
const id = () => randomUUID();
/** j_10's plain-words test: no zod words, no braces, 3 to 200 characters. */
const plain = (w: string | undefined) => !!w && /^[^{}<>]{3,200}$/.test(w) && !/zod|invalid_type|undefined|\[object|Expected |Invalid option|Invalid input|received |Too big|Too small/i.test(w);

const tR = (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json() as { token?: string }).token ?? "";
const run = id().slice(0, 8), opEmail = `pf28a2.operator.${run}@expatready.example`;
const opId = sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${opEmail}', 'Sample Operator A2') returning id) select id from s`);
sql(`insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), '${opId}', code from plat_system_role`);
const op = async () => (await (await fetch(`${BASE}/api/system/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: opEmail, secondStep: true }) })).json() as { token?: string }).token ?? "";
const tS = await op();
ok("A2 setup: the Sample firm's representative and a Sample operator of ours sign in on the local stand-ins", !!tR && !!tS);
if (!tR || !tS) process.exit(summary() ? 1 : 0);
const rows = () => sql(`select (select count(*) from fo_booking) || ':' || (select count(*) from fo_consultation_type) || ':' || (select count(*) from fo_availability_set) || ':' || (select count(*) from platform_office) || ':' || (select count(*) from platform_firm_setting) || ':' || (select count(*) from platform_support_message) || ':' || (select count(*) from platform_signup_link)`);
const before = rows();
const slug = sql(`select coalesce(min(slug), '') from fo_consultation_type where firm_id = (select id from platform_firm where key = 'sample-firm') and active and show_on_booking_page and deleted_at is null`);
const LONG = "a".repeat(20_000), OBJ = { pf28: 1 }, FO = "/api/front-office";

// [label, method, path, token, body, field, expected words (exact) or null for any plain words]
type Probe = [string, string, string, string | undefined, unknown, string, string | null];
const W: Probe[] = [
  ["booking type: active not a boolean", "POST", `${FO}/booking-types`, tR, { active: "x" }, "active", "This must be a boolean."],
  ["booking type: hosts not a list", "POST", `${FO}/booking-types`, tR, { hostStaffIds: "x" }, "hostStaffIds", "This must be a list."],
  ["booking type: description not text", "POST", `${FO}/booking-types`, tR, { description: OBJ }, "description", "This must be text."],
  ["booking type: meeting link over 2000", "PATCH", `${FO}/booking-types/${id()}`, tR, { meetingLink: LONG, version: 1 }, "meetingLink", "This is too long: at most 2000 characters."],
  ["booking type: nothing sent names modes in words", "POST", `${FO}/booking-types`, tR, {}, "modes", "This is required."],
  ["hours: isDefault not a boolean", "POST", `${FO}/me/availability-sets`, tR, { isDefault: "x" }, "isDefault", "This must be a boolean."],
  ["hours: windows not a list", "PATCH", `${FO}/me/availability-sets/${id()}`, tR, { windows: "x", version: 1 }, "windows", "This must be a list."],
  ["firm profile: public phone over 30", "PUT", "/api/platform/firm/profile", tR, { publicPhone: "1".repeat(31) }, "publicPhone", null],
  ["firm profile: website over 500", "PUT", "/api/platform/firm/profile", tR, { website: `https://${"a".repeat(600)}.ca` }, "website", null],
];
const L: Probe[] = [
  ["public booking: given names over-long", "POST", `/api/public/firms/sample-firm/book/${slug}/bookings`, undefined, { givenNames: LONG }, "givenNames", null],
  ["public slots: an unknown query field", "GET", `/api/public/firms/sample-firm/book/${slug}/slots?pf28Unknown=x`, undefined, undefined, "pf28Unknown", null],
  ["support reply over 5000", "POST", `/api/system/support/tickets/${id()}/replies`, tS, { body: LONG }, "body", "at most 5000 characters"],
  ["sign-up link: email over 254", "POST", "/api/system/signup-links", tS, { email: LONG, reason: "Sample reason for the A2 check" }, "email", "at most 254 characters"],
  ["keep period: an over-long reason is named with the years", "PUT", "/api/platform/keep-periods/closed-client-files", tR, { reason: LONG }, "reason", "This is too long: at most 500 characters."],
  ["office: version over-long", "PATCH", `/api/platform/offices/${id()}`, tR, { version: LONG }, "version", "This is too long: at most 40 characters."],
  ["template: body over 10000", "PUT", "/api/platform/templates/sales.lead.acknowledgement", tR, { body: LONG }, "body", "This is too long: at most 10000 characters."],
  ["web address: an address that is not text", "POST", `/api/system/firms/${id()}/web-address`, tS, { address: OBJ }, "address", null],
];
const bad: string[] = [];
for (const [label, m, p, t, b, f, words] of [...W, ...L]) {
  const a = await call(m, p, t === tS ? await op() : t, b);   // a system change asks for a sign-in in the last 5 minutes
  if (!(a.status === 422 && plain(a.fields[f]) && (words === null || a.fields[f] === words))) bad.push(`${label}: ${a.status} ${JSON.stringify(a.fields).slice(0, 160)}`);
}
ok(`A2 W/L fail: each field sent alone is named on its own field in plain words (${W.length + L.length} probes)`, bad.length === 0, bad);
const keep = await call("PUT", "/api/platform/keep-periods/closed-client-files", tR, { reason: LONG });
ok("A2 L fail: an over-long keep-period reason with no years names both fields at once", keep.status === 422 && !!keep.fields.years && !!keep.fields.reason, keep);
const q1 = await call("GET", "/api/platform/find?q=a", tR), q2 = await call("GET", `/api/platform/find?q=${"x".repeat(101)}`, tR);
ok("A2 Q fail: find with a 1- or 101-character q → 422 naming q, code QUERY_LENGTH (was a bare 400)", [q1, q2].every((a) => a.status === 422 && a.code === "QUERY_LENGTH" && plain(a.fields.q)), [q1, q2]);

// P: a value each rule takes passes on: the next rule or the look-up answers, never that field.
const P: [string, string, string | undefined, unknown, string][] = [
  ["PATCH", `${FO}/booking-types/${id()}`, tR, { meetingLink: "https://meet.example.ca/a", active: true, version: 1 }, "meetingLink"],
  ["POST", `/api/system/support/tickets/${id()}/replies`, tS, { body: "\u{1D400}".repeat(5000) }, "body"],
  ["PATCH", `/api/platform/offices/${id()}`, tR, { version: new Date().toISOString() }, "version"],
  ["POST", `/api/system/firms/${id()}/web-address`, tS, { address: "a2-sample-check", reason: "Sample reason for the A2 check" }, "address"],
  ["PUT", "/api/platform/templates/sales.lead.acknowledgement", tR, { body: "b".repeat(10_000) }, "body"],
];
const pBad: string[] = [];
for (const [m, p, t, b, f] of P) { const a = await call(m, p, t === tS ? await op() : t, b); if (!([404, 409, 422].includes(a.status) && !(f in a.fields))) pBad.push(`${m} ${p.replace(/[0-9a-f-]{36}/, ":id")} → ${a.status} ${JSON.stringify(a.fields).slice(0, 160)}`); }
const f2 = await call("GET", "/api/platform/find?q=ab", tR);
ok(`A2 P pass: a value each rule takes passes the parse (5000 letters of 2 UTF-16 units count as 5000; find with 2 characters answers 200) (${P.length + 1} calls)`, pBad.length === 0 && f2.status === 200, { pBad, find: f2.status });
ok("A2 N: nothing stored by any probe (bookings, types, hours, offices, settings, support messages, sign-up links)", rows() === before, { before, after: rows() });
process.exit(summary() ? 1 : 0);
