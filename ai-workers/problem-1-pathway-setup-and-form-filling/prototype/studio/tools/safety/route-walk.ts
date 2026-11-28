// LR-161 (LR-074's other half; Lead 11 on #4017, 28 Nov): the live sign-in walk. Every route the API declares (read from
// the code by tests/lib/routes.ts, the same finder route-sweep.ts uses) is called on a running, seeded copy, twice:
//   signed-out  no person header, no bearer token.
//   wrong-role  the least person for the route's sign-in plane:
//                 /api/platform, /api/front-office, /api/system  a bearer token of a READ_ONLY staff member of the Sample firm,
//                   added to the copy by the walk (the seed has none) and signed in on the local stand-in; a firm's token on /api/system is the wrong plane, so any 2xx there counts;
//                 /api/public                                    not walked (public by design; signed-out covers it);
//                 everything else (the simulated-person plane)    x-actor "user-P", a client with only the answer duty.
// A 2xx is unexpected unless the route is a read a READ_ONLY member holds (a GET on the platform plane), or the route
// and mode are on the reviewed list beside this file (tools/safety/route-walk-reviewed.txt: "<mode> <VERB> <path> #
// why"). A listed line that no longer answers 2xx is reported too (the list only shrinks). Path parameters get one
// fixed id, a write gets "{}", so a handler that looks the record up before it checks the caller answers 404 here: the
// walk proves "never a 2xx", the static sweep (route-sweep.ts) reads the order of checks. US$0, live AI off (the copy's
// default), no model call; run only against a disposable isolated copy (writes that are allowed really happen).
//   PLATFORM_IDENTITY=local zsh studio/tools/isolated.sh safety_walk 4612 start && tsx studio/tools/safety/route-walk.ts 4612 xr_studio_safety_walk
//   tsx studio/tools/safety/route-walk.ts --self-test     the judging rules on planted answers; exit 0 when each is right
// Exit 1 when anything is reported (report-only in safety.yml at first).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routes, type Route } from "../../tests/lib/routes.ts";

const STUDIO = join(import.meta.dirname, "..", "..");
const LIST = join(import.meta.dirname, "route-walk-reviewed.txt");
const ID = "00000000-0000-4000-8000-000000000161";
type Mode = "signed-out" | "wrong-role";
type Plane = "platform" | "system" | "public" | "simulated";
const planeOf = (path: string): Plane =>
  /^\/api\/(platform|front-office)(\/|$)/i.test(path) ? "platform" : /^\/api\/system(\/|$)/i.test(path) ? "system"
  : /^\/api\/public(\/|$)/i.test(path) ? "public" : "simulated";
const key = (mode: Mode, verb: string, path: string) => `${mode} ${verb} ${path}`;

/** The reviewed list: "<mode> <VERB> <path> # why"; a line with no reason is refused. */
export function readList(text: string): { allowed: Set<string>; errors: string[] } {
  const allowed = new Set<string>(), errors: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^(signed-out|wrong-role) ([A-Z]+) (\/\S*)\s+#\s*(\S.*)$/.exec(line);
    if (!m) errors.push(`route-walk-reviewed.txt line ${i + 1}: not "<mode> <VERB> <path> # why": ${line}`);
    else allowed.add(key(m[1] as Mode, m[2], m[3]));
  });
  return { allowed, errors };
}

/** One answer judged: null when fine, else the reason it is reported. */
export function judge(mode: Mode, verb: string, path: string, status: number, allowed: Set<string>): string | null {
  if (status < 200 || status > 299) return null;
  if (allowed.has(key(mode, verb, path))) return null;
  if (mode === "wrong-role" && planeOf(path) === "platform" && (verb === "GET" || verb === "HEAD")) return null;
  return `${mode} ${verb} ${path} answered ${status}`;
}

/** Listed lines that did not answer 2xx this run (fixed or gone): the list must shrink with them. */
export const stale = (allowed: Set<string>, seen2xx: Set<string>) => [...allowed].filter((k) => !seen2xx.has(k));

const fill = (path: string) => path.replace(/:[A-Za-z0-9_]+\??/g, ID).replace(/\*/g, "x");

function selfTest(): number {
  const { allowed, errors } = readList("# c\nsigned-out GET /api/whoami # who-am-I before a person is chosen\nwrong-role POST /api/x\n");
  const cases: [string, boolean][] = [
    ["a line without a reason is refused", errors.length === 1 && allowed.size === 1],
    ["401 signed out is fine", judge("signed-out", "POST", "/api/cases", 401, allowed) === null],
    ["404 is fine (never a 2xx)", judge("wrong-role", "DELETE", "/api/cases/:id", 404, allowed) === null],
    ["200 signed out on an unlisted write is reported", judge("signed-out", "POST", "/api/cases", 200, allowed) !== null],
    ["201 for the client on a studio write is reported", judge("wrong-role", "POST", "/api/drafts", 201, allowed) !== null],
    ["a listed open read is fine", judge("signed-out", "GET", "/api/whoami", 200, allowed) === null],
    ["the list is per mode", judge("wrong-role", "GET", "/api/whoami", 200, allowed) !== null],
    ["READ_ONLY reading a platform page is fine", judge("wrong-role", "GET", "/api/front-office/leads", 200, allowed) === null],
    ["READ_ONLY writing on the platform plane is reported", judge("wrong-role", "POST", "/api/front-office/leads", 201, allowed) !== null],
    ["a firm token reading /api/system is reported", judge("wrong-role", "GET", "/api/system/firms", 200, allowed) !== null],
    ["signed out, a platform read is reported", judge("signed-out", "GET", "/api/platform/me", 200, allowed) !== null],
    ["a listed line that stopped answering 2xx is stale", stale(allowed, new Set()).includes("signed-out GET /api/whoami")],
    ["parameters are filled", fill("/api/cases/:id/files/:fileId?") === `/api/cases/${ID}/files/${ID}`],
  ];
  let bad = 0;
  for (const [name, okay] of cases) { console.log(`${okay ? "ok  " : "FAIL"}  ${name}`); bad += okay ? 0 : 1; }
  console.log(bad ? `FAIL  ${bad} self-test case(s)` : `PASS  route walk self-test, ${cases.length} cases`);
  return bad ? 1 : 0;
}

async function call(port: number, r: Route, headers: Record<string, string>): Promise<number> {
  const write = r.verb !== "GET" && r.verb !== "HEAD";
  const method = r.verb === "ALL" ? "POST" : r.verb;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${fill(r.path)}`, {
      method, signal: AbortSignal.timeout(15_000), redirect: "manual",
      headers: { ...headers, ...(write ? { "content-type": "application/json", "idempotency-key": `lr161-${Math.random()}` } : {}) },
      ...(write ? { body: "{}" } : {}),
    });
    await res.arrayBuffer();
    return res.status;
  } catch { return 0; }   // a timeout or a dropped connection: listed in the counts, never a 2xx
}

async function walk(port: number, db: string): Promise<number> {
  const { allowed, errors } = readList(readFileSync(LIST, "utf8"));
  for (const e of errors) console.log(`::warning::${e}`);
  // The seed has no READ_ONLY member: the walk adds one to this disposable copy (an isolated copy's database only).
  if (!/^xr_studio_[a-z0-9_]+$/.test(db)) { console.error(`refused: ${db} is not an isolated copy's database (xr_studio_<name>)`); return 2; }
  const actor = "lr161-read-only";
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio", "-d", db, "-XAtqc",
    `with f as (select id from platform_firm where key = 'sample-firm'),
     s as (insert into platform_staff (id, firm_id, email, display_name, updated_at, actor_id)
           select gen_random_uuid(), f.id, 'read-only-walk@example.invalid', 'Read-only (route walk)', now(), '${actor}' from f
           where not exists (select 1 from platform_staff where actor_id = '${actor}') returning id, firm_id)
     insert into platform_role_grant (id, firm_id, staff_id, role, granted_by)
     select gen_random_uuid(), firm_id, id, 'READ_ONLY', 'route-walk' from s`], { encoding: "utf8" });
  let token = "";
  {
    const r = await fetch(`http://127.0.0.1:${port}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: actor, secondStep: true }) });
    token = ((await r.json().catch(() => ({}))) as { token?: string }).token ?? "";
  }
  if (!token) console.log("::warning::the READ_ONLY member could not sign in (start the copy with PLATFORM_IDENTITY=local): the platform and system planes were walked signed out only");
  // A route that ends the caller's session (sign-out) runs last, or every later wrong-role call would be a plain 401.
  const ends = (r: Route) => /sign-?out/i.test(r.path);
  const all = routes(join(STUDIO, "api", "src")).sort((x, y) => Number(ends(x)) - Number(ends(y)));
  const counts = new Map<string, number>(), reported: string[] = [], seen2xx = new Set<string>();
  for (const r of all) {
    const plane = planeOf(r.path);
    const tries: [Mode, Record<string, string> | null][] = [["signed-out", {}],
      ["wrong-role", plane === "public" ? null : plane === "simulated" ? { "x-actor": "user-P" } : token ? { authorization: `Bearer ${token}` } : null]];
    for (const [mode, headers] of tries) {
      if (!headers) continue;
      const status = await call(port, r, headers);
      if (process.env.ROUTE_WALK_VERBOSE) console.log(`${mode} ${status} ${r.verb} ${r.path}`);   // every answer, for a reviewer
      const c = `${mode} ${status >= 200 && status < 300 ? "2xx" : String(status)}`;
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (status >= 200 && status < 300) seen2xx.add(key(mode, r.verb, r.path));
      const why = judge(mode, r.verb, r.path, status, allowed);
      if (why) reported.push(`${why} (${r.file}:${r.line})`);
    }
  }
  for (const s of stale(allowed, seen2xx)) reported.push(`listed but no longer 2xx (take it off route-walk-reviewed.txt): ${s}`);
  for (const line of reported) console.log(`::warning::${line}`);
  console.log(`${all.length} routes walked; answers: ${[...counts].sort().map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  console.log(reported.length ? `${reported.length} unexpected` : "0 unexpected 2xx");
  return reported.length || errors.length ? 1 : 0;
}

const [a, b] = process.argv.slice(2);
if (a === "--self-test") process.exit(selfTest());
if (!/^\d+$/.test(a ?? "") || !b) { console.error("usage: route-walk.ts <port> <database> | --self-test"); process.exit(2); }
process.exit(await walk(Number(a), b));
