// qa, R1 Platform gate A by API (P-348 (3)): no Platform row has a screen yet (PF-4b, PF-21s, PF-5s are not merged), so
// each walk goes by the API from the row's own output to the next capability's first step, the way that step will use it.
//   R1.2 (PF-3 tables, seed)  → R1.5 (PF-4 sign-in): a seeded Sample staff member signs in and /me reads PF-3's firm,
//                               grants and permission keys.
//   R1.5/R1.6 (PF-4)          → refusals a person would hit: no second step, no token, a key the role lacks.
//   R1.24 (PF-25 address)     → FO-3's public page: the firm's host resolves the firm; an unknown host answers exactly
//                               like FO-3's unknown slug (the plain not-found), so the public page can be routed by it.
//   R1.13 (PF-23 logs)        → the alarm path: health live/ready answer; a request's X-Request-Id is kept in its JSON
//                               log line and a seeded email in the request never reaches the log.
//   R1.9 (PF-14 jobs)         → PF-21's reminder: the worker started with the app and made its own schema.
// Run (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qagate 4474 start --ttl 20 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//     && trap 'zsh studio/tools/isolated.sh qagate 4474 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r1_platform_gate_a.ts 4474 qagate
// US$0, no model call.
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.argv[2] ?? 4474), NAME = process.argv[3] ?? "qagate", BASE = `http://localhost:${PORT}`;
const STUDIO = join(import.meta.dirname, "..", ".."), LOG = join(STUDIO, "var", `isolated-${NAME}`, "api.log");
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };
const parse = (text: string) => { try { return JSON.parse(text); } catch { return text; } };
// fetch() drops a Host header silently, so a request on a firm's own host goes through node:http.
const onHost = (path: string, host: string) => new Promise<{ status: number; body: any }>((ok, no) => {
  const r = request({ host: "127.0.0.1", port: PORT, path, headers: { host } }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => ok({ status: res.statusCode ?? 0, body: parse(t) })); });
  r.on("error", no); r.end();
});
const call = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`${BASE}${path}`, init);
  return { status: r.status, body: parse(await r.text()) };
};
const signInAs = async (actorId: string) => (await call("/api/platform/session/local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId, secondStep: true }) })).body?.token as string;
const psql = (sql: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio", "-d", `xr_studio_${NAME}`, "-Atc", sql], { encoding: "utf8" }).trim();

// R1.2 → R1.5
const noStep = await call("/api/platform/session/local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R" }) });
check("R1.5: sign-in without the second step is refused in words", noStep.status === 401 && JSON.stringify(noStep.body).includes("second step"), `${noStep.status} ${JSON.stringify(noStep.body).slice(0, 120)}`);
const signIn = await call("/api/platform/session/local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) });
const token = signIn.body?.token ?? signIn.body?.accessToken ?? signIn.body?.sessionToken;
check("R1.2→R1.5: PF-3's seeded Sample staff user-R signs in (local stand-in, second step)", signIn.status < 300 && typeof token === "string", `${signIn.status} keys ${Object.keys(signIn.body ?? {}).join(",")}`);
const me = await call("/api/platform/me", { headers: { authorization: `Bearer ${token}` } });
const meText = JSON.stringify(me.body);
check("R1.2→R1.5: /me reads PF-3's firm, role grant and permission keys", me.status === 200 && /sample-firm|firm/i.test(meText) && /CASE_MANAGER/.test(meText) && /agent\//.test(meText), meText.slice(0, 200));
check("R1.5: user-R's duties include represent (licence record from PF-3's seed)", /represent/.test(meText));
// R1.6
const anon = await call("/api/platform/staff/invitations");
check("R1.6: a platform route with no token is refused (401), never data", anon.status === 401, String(anon.status));
const asOwner = await call("/api/platform/staff/invitations", { headers: { authorization: `Bearer ${token}` } });
check("R1.6: user-R (Owner + Case Manager in the seed) reads the invitations list", asOwner.status === 200, String(asOwner.status));
const tokenT = await signInAs("user-T");   // Case Manager only (seed): no agent/staff:manage
const asCm = await call("/api/platform/staff/invitations", { headers: { authorization: `Bearer ${tokenT}` } });
check("R1.6: user-T, a Case Manager without the staff key, is refused on the invitations list (403)", asCm.status === 403, `${asCm.status} ${JSON.stringify(asCm.body).slice(0, 120)}`);
const tokenO = await signInAs("user-O");   // Case Officer (seed)
const asCo = await call("/api/platform/staff/invitations", { method: "POST", headers: { authorization: `Bearer ${tokenO}`, "content-type": "application/json" }, body: JSON.stringify({ email: "new.person.qa@example.com", roles: ["READ_ONLY"] }) });
check("R1.6: user-O, a Case Officer, cannot invite staff (403)", asCo.status === 403, `${asCo.status}`);

// R1.24 → FO-3's public page
const address = psql(`select a.address from platform_firm_web_address a join platform_firm f on f.id = a.firm_id where f.key = 'sample-firm'`);
check("R1.24: the Sample firm has a web address from its key", /^[a-z0-9-]{3,63}$/.test(address), address);
const site = await onHost("/api/public/site", `${address}.localhost:${PORT}`);
check("R1.24: the firm's own host resolves the firm for its public pages", site.status === 200 && site.body?.webAddress === address, `${site.status} ${JSON.stringify(site.body).slice(0, 100)}`);
const unknownHost = await onHost("/api/public/site", `no-such-firm-qa.localhost:${PORT}`);
const privatePath = await onHost("/api/platform/me", `${address}.localhost:${PORT}`);
check("R1.24: a staff route asked on a firm's public address is the plain not-found (never served there)", privatePath.status === 404, String(privatePath.status));
const unknownSlug = await call("/api/public/firms/sample-firm/book/no-such-page-qa/slots");
check("R1.24→FO-3: an unknown host answers like FO-3's unknown booking slug (same status)", unknownHost.status === unknownSlug.status && unknownHost.status === 404, `host ${unknownHost.status}, slug ${unknownSlug.status}`);
for (const [bad, why] of [["Maple", "capitals"], ["-maple", "leading hyphen"], ["ma", "too short"], ["www", "reserved"]] as const) {
  const r = await call(`/api/public/web-address/availability?address=${encodeURIComponent(bad)}`);
  check(`R1.24: "${bad}" (${why}) is refused with a plain reason`, r.status < 500 && r.body?.available === false && typeof (r.body?.reason ?? r.body?.message) === "string", JSON.stringify(r.body).slice(0, 140));
}

// R1.13
const live = await call("/api/health/live"), ready = await call("/api/health/ready");
check("R1.13: health live and ready answer 200 with the database and job queue up", live.status === 200 && ready.status === 200, `${live.status}/${ready.status} ${JSON.stringify(ready.body).slice(0, 120)}`);
const rid = `qa-r1-${process.pid}`, seeded = "qa.leak.check@example.com";
await call("/api/platform/session/local", { method: "POST", headers: { "content-type": "application/json", "x-request-id": rid }, body: JSON.stringify({ firmKey: "sample-firm", email: seeded, secondStep: true }) });
await new Promise((r) => setTimeout(r, 500));
const log = readFileSync(LOG, "utf8"), line = log.split("\n").find((l) => l.includes(rid)) ?? "";
let parsed: any = null; try { parsed = JSON.parse(line.slice(line.indexOf("{"))); } catch { /* not JSON */ }
check("R1.13: the request's X-Request-Id is kept in one JSON log line with route and status", !!parsed && JSON.stringify(parsed).includes(rid) && /status|statusCode/.test(line), line.slice(0, 200));
check("R1.13: a seeded email in a request body never reaches the log", !log.includes(seeded));

// R1.9
const jobTables = psql(`select count(*) from information_schema.tables where table_schema = 'platform_jobs'`);
check("R1.9→PF-21: the job worker started with the app and made its own schema (platform_jobs)", Number(jobTables) > 0, `${jobTables} tables`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
