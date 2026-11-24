// R1.10 A4 (PF-28 on /api/system; Lead 28's brief, 24 Nov): the system guard's answers to a bad input, in the ruled order.
// Every route under /api/system that asks for a written reason (@SystemReason) is asked, on an isolated copy, by:
//   P  a staff member of ours with NO system role: {} , an unknown field, a body that is not an object, a 501-character
//      reason and a malformed id each answer the SAME refusal, 403 MISSING_PERMISSION (authorise before validate; the
//      body never changes who may call) — the order of the permission checks is the thing under test;
//   R  a Platform Owner (every system role): {} answers 422 naming `reason` in fields (and the route's own required fields);
//      an unknown field answers 422 naming it; a 501-character reason 422 naming `reason`; a malformed id 404; never 400;
//   L  each refusal above writes exactly one audit line (REFUSED), and nothing else changes (the register, staff and firm
//      tables' row counts).
// Sample people of this run only; no model call (US$0). Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh runtime_pf28sys 4796 start PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_pf28_system_reason.ts 4796 xr_studio_runtime_pf28sys
// (the usage line run-suites.sh reads; by hand, stop the copy after: zsh studio/tools/isolated.sh runtime_pf28sys 4796 stop)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4796), DB = process.argv[3] ?? "xr_studio_runtime_pf28sys", BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-X", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const { ok, summary } = recorder();
type Answer = { status: number; body: Record<string, any> | null };
const call = async (method: string, path: string, token: string, body: string): Promise<Answer> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": randomUUID() }, body });   // as a client sends it (the breach register asks for one)
  const t = await r.text(); let b: Record<string, any> | null = null; try { b = JSON.parse(t); } catch { /* not JSON */ }
  return { status: r.status, body: b };
};

// The routes that ask for a reason (api/src: @SystemReason), with a malformed id where they take one.
const ROUTES: [string, string][] = [
  ["POST", "/api/system/register/holds"], ["POST", "/api/system/register/holds/:id/release"],
  ["POST", "/api/system/register/breaches"], ["POST", "/api/system/register/breaches/from-alert"],
  ["PATCH", "/api/system/register/breaches/:id"], ["POST", "/api/system/register/breaches/:id/notices"],
  ["POST", "/api/system/signup-links"], ["POST", "/api/system/firms/:id/web-address"],
  ["POST", "/api/system/staff/:id/deactivate"], ["POST", "/api/system/staff/:id/reset-mfa"],
];
const path = (p: string, id = randomUUID()) => p.replace(":id", id);
const LONG = "r".repeat(501);

const run = randomUUID().slice(0, 8);
const person = (tag: string, allRoles: boolean) => {
  const email = `pf28sys.${tag}.${run}@expatready.example`;
  const id = sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${email}', 'Sample ${tag} ${run}') returning id) select id from s`);
  if (allRoles) sql(`insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), '${id}', code from plat_system_role`);
  return { id, email };
};
const none = person("noroles", false), owner = person("owner", true);
const signIn = async (email: string) => (await (await fetch(`${BASE}/api/system/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, secondStep: true }) })).json() as { token?: string }).token ?? "";
const tNone = await signIn(none.email), tOwner = await signIn(owner.email);
ok("A4 setup: a staff member with no system role and a Platform Owner sign in on the local stand-in", !!tNone && !!tOwner, { tNone: !!tNone, tOwner: !!tOwner });
if (!tNone || !tOwner) process.exit(summary() ? 1 : 0);

const lines = (staff: string) => Number(sql(`select count(*) from plat_system_audit where staff_id = '${staff}' and route <> '/api/system/session/local'`));
const counts = () => sql(`select (select count(*) from plat_legal_hold) || ':' || (select count(*) from plat_breach) || ':' || (select count(*) from platform_signup_link) || ':' || (select count(*) from plat_system_staff) || ':' || (select count(*) from platform_firm)`);
const before = counts();

// P: no permission → the same 403, whatever the body.
const pBad: string[] = [];
const n0 = lines(none.id);
let pCalls = 0;
for (const [m, p] of ROUTES) {
  const asks: [string, string][] = [["{}", path(p)], ['{"pf28Unknown":1}', path(p)], ["[1]", path(p)], [JSON.stringify({ reason: LONG }), path(p)]];
  if (p.includes(":id")) asks.push(["{}", path(p, "not-a-uuid" as ReturnType<typeof randomUUID>)]);
  for (const [body, url] of asks) {
    pCalls++;
    const a = await call(m, url, tNone, body);
    if (!(a.status === 403 && a.body?.code === "MISSING_PERMISSION")) pBad.push(`${m} ${p} ${body.slice(0, 20)}${url.includes("not-a-uuid") ? " (malformed id)" : ""} → ${a.status} ${a.body?.code ?? ""}`);
  }
}
ok(`A4 P (authorise before validate): with no system role, every reason route answers the same 403 MISSING_PERMISSION to {}, an unknown field, a non-object body, a 501-character reason and a malformed id (${pCalls} calls)`, pBad.length === 0, pBad);
ok("A4 P/L: each refused call of the person with no role is one REFUSED audit line", lines(none.id) - n0 === pCalls, { lines: lines(none.id) - n0, calls: pCalls });

// R: a Platform Owner → 422 naming the field, 404 for a malformed id; never 400.
const rBad: string[] = [];
const o0 = lines(owner.id);
let rCalls = 0;
for (const [m, p] of ROUTES) {
  rCalls += 3;
  const missing = await call(m, path(p), tOwner, "{}");
  if (!(missing.status === 422 && typeof missing.body?.fields?.reason === "string" && missing.body.fields.reason.length > 0)) rBad.push(`${m} ${p} {} → ${missing.status} ${JSON.stringify(missing.body?.fields ?? missing.body?.code)}`);
  const unknown = await call(m, path(p), tOwner, JSON.stringify({ pf28Unknown: 1, reason: "Sample reason" }));
  if (!(unknown.status === 422 && "pf28Unknown" in (unknown.body?.fields ?? {}))) rBad.push(`${m} ${p} unknown → ${unknown.status} ${JSON.stringify(unknown.body?.fields ?? unknown.body?.code)}`);
  const long = await call(m, path(p), tOwner, JSON.stringify({ reason: LONG }));
  if (!(long.status === 422 && typeof long.body?.fields?.reason === "string")) rBad.push(`${m} ${p} 501-character reason → ${long.status} ${JSON.stringify(long.body?.fields ?? long.body?.code)}`);
  if (p.includes(":id")) {
    rCalls++;
    const bad = await call(m, path(p, "not-a-uuid" as ReturnType<typeof randomUUID>), tOwner, JSON.stringify({ reason: "Sample reason" }));
    if (bad.status !== 404) rBad.push(`${m} ${p} malformed id → ${bad.status} ${bad.body?.code ?? ""}`);
  }
}
ok(`A4 R: for a Platform Owner every reason route answers 422 naming reason (no reason, or 501 characters) and an unknown field, and 404 for a malformed id; never 400 (${rCalls} calls)`, rBad.length === 0, rBad);
ok("A4 R/L: each refused call of the Owner is one audit line, and nothing else changed (holds, breaches, sign-up links, staff, firms)", lines(owner.id) - o0 === rCalls && counts() === before, { lines: lines(owner.id) - o0, calls: rCalls, before, after: counts() });
process.exit(summary() ? 1 : 0);
