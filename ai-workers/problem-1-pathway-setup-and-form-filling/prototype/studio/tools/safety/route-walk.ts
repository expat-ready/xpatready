// LR-161 (LR-074's other half; Lead 11 on #4017, 28 Nov): the live sign-in walk. Every route the API declares (read from
// the code by tests/lib/routes.ts, the same finder route-sweep.ts uses) is called on a running, seeded copy, twice:
//   signed-out  no person header, no bearer token.
//   wrong-role  the least person for the route's sign-in plane:
//                 /api/platform, /api/front-office, /api/system  a bearer token of a READ_ONLY staff member of the Sample firm,
//                   added to the copy by the walk (the seed has none) and signed in on the local stand-in; a firm's token on /api/system is the wrong plane, so any 2xx there counts;
//                 /api/public                                    not walked (public by design; signed-out covers it);
//                 everything else (the simulated-person plane)    x-actor "user-P", a client with only the answer duty;
//                   a route there that answers the client 401 (a keyed /api/runtime route wants a platform bearer) is
//                   called again with the READ_ONLY bearer, and that answer is judged (review I-1 on #4044).
// A 2xx is unexpected unless the route is a read a READ_ONLY member holds (a GET with the bearer), or the route and
// mode are on the reviewed list beside this file (tools/safety/route-walk-reviewed.txt: "<mode> <VERB> <path> # why").
// A listed line that no longer answers 2xx is reported too (the list only shrinks). The session's own sign-out runs
// last, other sign-out routes just before it, so no wrong-role call meets a dead token.
// LIMITS (review I-2 on #4044): path parameters get one fixed id and a write gets "{}", so a handler that checks its
// input (400, 422) or looks the record up (404) before it checks the caller never reaches the permission check here:
// a hole behind those checks answers 400/404/422, not 2xx, and is NOT seen (planted on #4044: a client past a removed
// duty check got 400; READ_ONLY past an @AnyStaff got 422 and 503). The summary prints how many wrong-role writes
// stopped there, and how many platform-plane writes the READ_ONLY bearer got past the guard (the guard runs before the
// handler, so anything but 401/403 there means the declared keys let READ_ONLY in): ROUTE_WALK_VERBOSE=1 lists them.
// LR-161 part 2, LR-187: the writes READ_ONLY gets past the guard (platform plane, the bearer retry of keyed
// /api/runtime routes, and /api/system) are judged too: each must be on
// route-walk-past-guard.txt ("<VERB> <path> # why"), so a route whose declared access newly lets READ_ONLY in is
// reported even when its empty write answers 400/404/422; a listed line the guard now refuses is reported as stale.
// "Never a 2xx for an empty write" is what this walk proves; the static sweep (route-sweep.ts) reads the order of checks.
// US$0, live AI off (the copy's default), no model call; run only against a disposable isolated copy (allowed writes
// really happen). The database must be the one isolated.sh started for this port (its comment names the port).
//   PLATFORM_IDENTITY=local zsh studio/tools/isolated.sh safety_walk 4612 start && tsx studio/tools/safety/route-walk.ts 4612 xr_studio_safety_walk
//   tsx studio/tools/safety/route-walk.ts --self-test     the judging rules on planted answers; exit 0 when each is right
// Exit 1 when anything is reported (report-only in safety.yml at first).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routes, type Route } from "../../tests/lib/routes.ts";

const STUDIO = join(import.meta.dirname, "..", "..");
const LIST = join(import.meta.dirname, "route-walk-reviewed.txt");
const PAST = join(import.meta.dirname, "route-walk-past-guard.txt");
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

/** Whether a wrong-role answer came from the READ_ONLY bearer on a plane where it holds reads: the platform plane, or
 *  the simulated-plane retry of a keyed route. Never /api/system: a firm's token there is the wrong plane (review R2-1). */
export const readsHeld = (plane: Plane, retried: boolean) => plane === "platform" || (plane === "simulated" && retried);

/** One answer judged: null when fine, else the reason it is reported. */
export function judge(mode: Mode, verb: string, path: string, status: number, allowed: Set<string>, bearer = false): string | null {
  if (status < 200 || status > 299) return null;
  if (allowed.has(key(mode, verb, path))) return null;
  if (mode === "wrong-role" && bearer && (verb === "GET" || verb === "HEAD")) return null;
  return `${mode} ${verb} ${path} answered ${status}`;
}

/** Walk order: the caller's own session/sign-out last (it ends the token), other sign-out routes just before it. */
export const order = (path: string) => (/\/session\/sign-?out$/i.test(path) ? 2 : /sign-?out/i.test(path) ? 1 : 0);

/** The past-guard list: "<VERB> <path> # why"; a line with no reason is refused. */
export function readPast(text: string): { allowed: Set<string>; errors: string[] } {
  const allowed = new Set<string>(), errors: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^([A-Z]+) (\/\S*)\s+#\s*(\S.*)$/.exec(line);
    if (!m) errors.push(`route-walk-past-guard.txt line ${i + 1}: not "<VERB> <path> # why": ${line}`);
    else allowed.add(`${m[1]} ${m[2]}`);
  });
  return { allowed, errors };
}
/** LR-187: which wrong-role answers count as "past the guard": a write made with the READ_ONLY bearer (the platform
 *  plane, the retry of a keyed /api/runtime route, where the platform guard also runs before the handler, and
 *  /api/system, where a firm's token is the wrong plane and the system guard should refuse it) that the guard did not
 *  refuse (not 401/403). Before LR-187 only the platform plane counted (review P-1 on #4159). */
export const pastGuardCounts = (mode: Mode, write: boolean, plane: Plane, retried: boolean, status: number) =>
  mode === "wrong-role" && write && (readsHeld(plane, retried) || plane === "system") && ![401, 403].includes(status);
/** A write READ_ONLY got past the guard: null when listed, else why it is reported. */
export const pastGuardJudge = (verb: string, path: string, status: number, allowed: Set<string>) =>
  [401, 403].includes(status) || allowed.has(`${verb} ${path}`) ? null : `wrong-role ${verb} ${path} got READ_ONLY past the guard (answered ${status}) and is not on route-walk-past-guard.txt`;

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
    ["READ_ONLY reading a platform page is fine", judge("wrong-role", "GET", "/api/front-office/leads", 200, allowed, readsHeld("platform", false)) === null],
    ["READ_ONLY writing on the platform plane is reported", judge("wrong-role", "POST", "/api/front-office/leads", 201, allowed, readsHeld("platform", false)) !== null],
    ["a firm token reading /api/system is reported", judge("wrong-role", "GET", "/api/system/firms", 200, allowed, readsHeld("system", false)) !== null],
    ["a client reading a studio page (no retry) is reported", judge("wrong-role", "GET", "/api/drafts", 200, allowed, readsHeld("simulated", false)) !== null],
    ["signed out, a platform read is reported", judge("signed-out", "GET", "/api/platform/me", 200, allowed) !== null],
    ["a listed line that stopped answering 2xx is stale", stale(allowed, new Set()).includes("signed-out GET /api/whoami")],
    ["READ_ONLY reading a keyed runtime route (bearer retry) is fine", judge("wrong-role", "GET", "/api/runtime/clients", 200, allowed, readsHeld("simulated", true)) === null],
    ["READ_ONLY writing a keyed runtime route (bearer retry) is reported", judge("wrong-role", "POST", "/api/runtime/cases", 201, allowed, readsHeld("simulated", true)) !== null],
    ["the session's own sign-out runs after every other route", order("/api/platform/session/sign-out") > order("/api/platform/staff/:id/sign-out-everywhere") && order("/api/platform/staff/:id/sign-out-everywhere") > order("/api/cases")],
    ["an unlisted platform write READ_ONLY gets past the guard is reported", pastGuardJudge("POST", "/api/front-office/leads", 422, readPast("PUT /api/platform/me/account # own\n").allowed) !== null],
    ["a listed past-guard write is fine", pastGuardJudge("PUT", "/api/platform/me/account", 422, readPast("PUT /api/platform/me/account # own\n").allowed) === null],
    ["a guard refusal (403) is never reported as past the guard", pastGuardJudge("POST", "/api/front-office/leads", 403, new Set()) === null],
    ["a keyed runtime write retried with the bearer and not refused counts as past the guard (LR-187)", pastGuardCounts("wrong-role", true, "simulated", true, 404)],
    ["a simulated-plane write the client made (no retry) is not a past-guard write", !pastGuardCounts("wrong-role", true, "simulated", false, 404)],
    ["a firm token's write past the /api/system guard counts as past the guard", pastGuardCounts("wrong-role", true, "system", false, 422)],
    ["a read is never a past-guard write", !pastGuardCounts("wrong-role", false, "platform", false, 200)],
    ["a past-guard line the guard now refuses is stale", stale(readPast("PUT /api/platform/me/account # own\n").allowed, new Set()).includes("PUT /api/platform/me/account")],
    ["a past-guard line without a reason is refused", readPast("PUT /api/x\n").errors.length === 1],
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
  const { allowed, errors: listErrors } = readList(readFileSync(LIST, "utf8"));
  const past = readPast(readFileSync(PAST, "utf8"));
  const errors = [...listErrors, ...past.errors];
  for (const e of errors) console.log(`::warning::${e}`);
  // The seed has no READ_ONLY member: the walk adds one to this disposable copy. Only the database isolated.sh started
  // for this very port (its comment: "isolated.sh server pid … port <port> …"); never the demo or a lane's database.
  const psql = (d: string, q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio", "-d", d, "-XAtqc", q], { encoding: "utf8" }).trim();
  const note = /^xr_studio_[a-z0-9_]+$/.test(db) && !/^xr_studio_(demo|screens|forms|runtime|evidence|qa)$/.test(db)
    ? psql("postgres", `select coalesce(shobj_description(oid, 'pg_database'), '') from pg_database where datname = '${db}'`) : "";
  if (!new RegExp(`^isolated\\.sh server pid \\d+ port ${port} `).test(note)) {
    console.error(`refused: ${db} is not the database isolated.sh started for port ${port} (comment: "${note}")`); return 2;
  }
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
  const all = routes(join(STUDIO, "api", "src")).sort((x, y) => order(x.path) - order(y.path));
  const counts = new Map<string, number>(), reported: string[] = [], seen2xx = new Set<string>();
  const unreached: string[] = [], pastGuard: string[] = [], seenPast = new Set<string>();
  for (const r of all) {
    const plane = planeOf(r.path);
    const tries: [Mode, Record<string, string> | null][] = [["signed-out", {}],
      ["wrong-role", plane === "public" ? null : plane === "simulated" ? { "x-actor": "user-P" } : token ? { authorization: `Bearer ${token}` } : null]];
    for (const [mode, headers] of tries) {
      if (!headers) continue;
      let status = await call(port, r, headers), retried = false;
      // I-1: a keyed /api/runtime route answers the client 401 (it wants a platform bearer): ask again with the bearer.
      if (mode === "wrong-role" && plane === "simulated" && status === 401 && token) { status = await call(port, r, { authorization: `Bearer ${token}` }); retried = true; }
      const bearer = mode === "wrong-role" && readsHeld(plane, retried);
      if (process.env.ROUTE_WALK_VERBOSE) console.log(`${mode}${mode === "wrong-role" && (plane === "platform" || plane === "system" || retried) ? " (bearer)" : ""} ${status} ${r.verb} ${r.path}`);   // every answer, for a reviewer
      const write = r.verb !== "GET" && r.verb !== "HEAD";
      if (mode === "wrong-role" && write && ![401, 403].includes(status) && (status < 200 || status > 299)) unreached.push(`${status} ${r.verb} ${r.path}`);
      if (pastGuardCounts(mode, write, plane, retried, status)) {
        pastGuard.push(`${status} ${r.verb} ${r.path}`); seenPast.add(`${r.verb} ${r.path}`);
        const why = pastGuardJudge(r.verb, r.path, status, past.allowed);
        if (why) reported.push(`${why} (${r.file}:${r.line})`);
      }
      const c = `${mode} ${status >= 200 && status < 300 ? "2xx" : String(status)}`;
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (status >= 200 && status < 300) seen2xx.add(key(mode, r.verb, r.path));
      const why = judge(mode, r.verb, r.path, status, allowed, bearer);
      if (why) reported.push(`${why} (${r.file}:${r.line})`);
    }
  }
  if (token) for (const s of stale(past.allowed, seenPast)) reported.push(`listed but the guard now refuses READ_ONLY (take it off route-walk-past-guard.txt): ${s}`);
  for (const s of stale(allowed, seen2xx)) reported.push(`listed but no longer 2xx (take it off route-walk-reviewed.txt): ${s}`);
  for (const line of reported) console.log(`::warning::${line}`);
  console.log(`${all.length} routes walked; answers: ${[...counts].sort().map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  if (process.env.ROUTE_WALK_VERBOSE) { for (const u of unreached) console.log(`unreached: ${u}`); for (const u of pastGuard) console.log(`past the guard: ${u}`); }
  console.log(`not proven (I-2): ${unreached.length} wrong-role writes stopped before a permission check (400/404/422/5xx with "{}"); ${pastGuard.length} writes got the READ_ONLY bearer past the guard (platform plane, keyed /api/runtime retries, /api/system) (not 401/403; each judged against route-walk-past-guard.txt); ROUTE_WALK_VERBOSE=1 lists both`);
  console.log(reported.length ? `${reported.length} unexpected` : "0 unexpected 2xx");
  return reported.length || errors.length ? 1 : 0;
}

const [a, b] = process.argv.slice(2);
if (a === "--self-test") process.exit(selfTest());
if (!/^\d+$/.test(a ?? "") || !b) { console.error("usage: route-walk.ts <port> <database> | --self-test"); process.exit(2); }
process.exit(await walk(Number(a), b));
