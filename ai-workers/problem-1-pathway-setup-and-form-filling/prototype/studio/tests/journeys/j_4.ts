// J-4 (map row 4, R1.4 "Each query runs inside its firm"; PF-12, PF-12b parts 1-2, PF-12b3): qa's API walk on an
// isolated copy of the running app (the real main.ts as xr_app; its own database and port, never :4400). R1.4 has no
// screen (P-616), so the walk is by API and its recording is walk.mjs's step board. It is qa's gate A for R1.4
// (tests/qa/check_r14_walls_gate_a.ts, the same checks), run by walks.yml on main's head (P-339, P-700), plus W6:
//   1 firm A's staff never see firm B's rows: a lead firm B made is absent from firm A's list, 404 by id and on take;
//   2 a raw session as the app's role with no app.firm_id reads no row of a walled table (fail case); with firm A set it
//     reads exactly firm A's rows;
//   3 the firm comes from the session only: a header, ?firmId= or body firmId naming firm B never reaches firm B;
//   4 the app's role owns no table, and the running server's connections are the app's role;
//   5 (run last, so the walk ends there) the next capability's first step (R1.5: staff sign-in, /me) answers for the right firm on each side;
//   6 the seven own-firm doors left the bypass (PF-12b2): the run's sign-ins and staff routes make 0 bypass uses;
//   7 every walled table forces row-level security with the firm policy (the catalogues aside, as PF-12's pack);
//   W6 (PF-12b3, Lead 15's ruling on #2752: every bypass use writes an audit_event row): a visitor signs up through the
//      public door (GET /api/public/plans, then POST /api/public/signup after the form's minimum fill time); its no-firm
//      steps (platform.firms.signup) and the verification email (platform.account.mail) each write platform.bypass lines
//      with no firm, naming their use; no line names a firm, and no firm exists before the email is confirmed.
// Sample rows only (the two sample firms, written by their seeds; the sign-up's firm name and email are Sample); US$0,
// no model call. Run from prototype/:
//   zsh studio/tools/isolated.sh j4 4434 start --ttl 20 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j4 4434 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_4.ts j4 4434
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { recorder } from "../runtime/api.ts";
const [NAME, PORT] = [process.argv[2] ?? "j4", Number(process.argv[3] ?? 4434)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, LOG = join(import.meta.dirname, "..", "..", "var", `isolated-${NAME}`, "api.log");
const { ok, summary } = recorder();
const PSQL = ["/opt/homebrew/opt/postgresql@18/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"].find((p) => existsSync(p)) ?? "psql";
const as = (user: string, q: string) => execFileSync(PSQL, [`postgresql://${user}@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const owner = (q: string) => as("xr_studio", q);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const call = async (m: string, p: string, t?: string, b?: unknown, h: Record<string, string> = {}) => {
  const r = await fetch(`${BASE}${p}`, { method: m, headers: { ...h, ...(t ? { authorization: `Bearer ${t}` } : {}), ...(b === undefined ? {} : { "content-type": "application/json" }) }, body: b === undefined ? undefined : JSON.stringify(b) });
  let j: any = null; try { j = await r.json(); } catch { /* not json */ } return { status: r.status, body: j };
};
const firmA = owner(`select id from platform_firm where key = 'sample-firm'`), firmB = owner(`select id from platform_firm where key = 'sample-solo'`);
const staffOf = (firm: string) => owner(`select email from platform_staff where firm_id = '${firm}' and status = 'ACTIVE' order by actor_id limit 1`);
const signIn = async (key: string, email: string) => (await call("POST", "/api/platform/session/local", undefined, { firmKey: key, email, secondStep: true })).body?.token as string | undefined;
// Step 6 counts only request uses (a log line with an HTTP method): background jobs on the copy (the outbox sweep,
// cases.prospect-won.catch-up every ~10 s) log their own bypass uses with method "none" at any moment, and a per-firm
// job that touches no firm writes no line (PF-12b DW7: uses x firms touched), so counting every line made step 6 flaky.
const DOORS = ["platform.identity.authenticate", "platform.identity.sign-in", "platform.identity.invitation", "fo.sales.web-form", "fo.booking.public-page", "fo.booking.self-service", "platform.web-address.host"];
const requestUses = () => existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes('"event":"platform_bypass"') && !l.includes('"method":"none"')).length : -1;
const doorLines = () => Number(owner(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'use' in ('${DOORS.join("','")}')`));
const logBefore = Math.max(requestUses(), 0);
const auditBefore = doorLines();
const tA = await signIn("sample-firm", owner(`select email from platform_staff where actor_id = 'user-R'`)), tB = await signIn("sample-solo", staffOf(firmB));
ok("setup: a staff member of firm A (Owner) and of firm B sign in", !!tA && !!tB, { firmA, firmB });
const run = Date.now().toString(36);
const addLead = (t: string, given: string, extra: Record<string, unknown> = {}, h: Record<string, string> = {}) =>
  call("POST", "/api/front-office/leads", t, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}@r14.example`, source: "Phone call (Sample)", ...extra }, h);
const bLead = await addLead(tB!, `Bee${run}`), aLead = await addLead(tA!, `Ay${run}`);
const bId = String(bLead.body?.id ?? ""), aId = String(aLead.body?.id ?? "");
ok("setup: each firm adds a lead through the API", bLead.status === 201 && aLead.status === 201 && owner(`select firm_id from fo_lead where id = '${bId}'`) === firmB, { b: bLead.status, a: aLead.status });

// 1 firm A never sees firm B's rows
const listA = await call("GET", "/api/front-office/leads?view=all", tA);
const ids = (r: any) => (Array.isArray(r.body) ? r.body : r.body?.items ?? []).map((x: any) => x.id);
ok("R1.4 1: firm B's lead is absent from firm A's list (firm A's own lead is in it)", listA.status === 200 && !ids(listA).includes(bId) && ids(listA).includes(aId), { status: listA.status, n: ids(listA).length });
const readA = await call("GET", `/api/front-office/leads/${bId}`, tA);
ok("R1.4 1: firm B's lead by id, as firm A, is the plain 404", readA.status === 404, readA.status);
const bOwnerBefore = owner(`select coalesce(owner_staff_id::text, '-') || '|' || updated_at from fo_lead where id = '${bId}'`);
const takeA = await call("POST", `/api/front-office/leads/${bId}/take`, tA, {});
const bOwnerAfter = owner(`select coalesce(owner_staff_id::text, '-') || '|' || updated_at from fo_lead where id = '${bId}'`);
ok("R1.4 1: a write to firm B's lead, as firm A (take), is 404 and changes nothing (owner and updated_at as before)", takeA.status === 404 && bOwnerAfter === bOwnerBefore, { status: takeA.status, same: bOwnerAfter === bOwnerBefore });

// 2 a raw session as the app's role
const all = Number(owner(`select count(*) from fo_lead`)), ofA = Number(owner(`select count(*) from fo_lead where firm_id = '${firmA}'`));
const noFirm = as("xr_app", `select count(*) from fo_lead`);
ok("R1.4 2 (fail case): as xr_app with no app.firm_id, a walled table (fo_lead) reads no row", noFirm === "0" && all > 0, { noFirm, all });
const withA = as("xr_app", `begin; select set_config('app.firm_id', '${firmA}', true); select count(*) from fo_lead; commit;`).split("\n").filter((l) => /^\d+$/.test(l)).pop();
ok("R1.4 2: with firm A set, xr_app reads exactly firm A's leads", withA === String(ofA) && ofA < all, { withA, ofA, all });
const noFirmStaff = as("xr_app", `select count(*) from platform_staff`), allStaff = Number(owner(`select count(*) from platform_staff`));
ok("R1.4 2 (fail case): as xr_app with no firm, platform_staff reads no row (the owner sees them all)", noFirmStaff === "0" && allStaff > 0, { noFirmStaff, allStaff });

// 3 the firm comes from the session only
const viaHeader = await call("GET", `/api/front-office/leads/${bId}`, tA, undefined, { "x-firm-id": firmB, "x-firm-key": "sample-solo" });
const viaQuery = await call("GET", `/api/front-office/leads/${bId}?firmId=${firmB}&firmKey=sample-solo`, tA);
ok("R1.4 3: an X-Firm-Id / X-Firm-Key header or a ?firmId= naming firm B never reaches firm B's lead (404)", viaHeader.status === 404 && viaQuery.status === 404, { header: viaHeader.status, query: viaQuery.status });
const viaBody = await addLead(tA!, `Bod${run}`, { firmId: firmB });
const bodyFirm = viaBody.body?.id ? owner(`select firm_id from fo_lead where id = '${viaBody.body.id}'`) : "";
ok("R1.4 3: a body firmId naming firm B is refused or ignored, never lands in firm B", viaBody.status === 400 || (viaBody.status === 201 && bodyFirm === firmA), { status: viaBody.status, firm: bodyFirm === firmA ? "A" : bodyFirm === firmB ? "B" : bodyFirm });
const hdrAdd = await addLead(tA!, `Hdr${run}`, {}, { "x-firm-id": firmB });
ok("R1.4 3: a lead added with an X-Firm-Id header naming firm B lands in the signed-in person's firm A", hdrAdd.status === 201 && owner(`select firm_id from fo_lead where id = '${hdrAdd.body?.id}'`) === firmA, hdrAdd.status);

// 4 the app's role owns nothing; the server runs as it
const owned = owner(`select count(*) from pg_class c join pg_roles r on r.oid = c.relowner where c.relnamespace = 'public'::regnamespace and r.rolname = 'xr_app'`);
ok("R1.4 4: xr_app owns no table", owned === "0", owned);
const serverRoles = owner(`select string_agg(distinct usename, ',') from pg_stat_activity where datname = '${DBNAME}' and pid <> pg_backend_pid() and usename <> 'xr_studio'`);
// Only "the server uses xr_app" is checkable here: this check's own connections are the owner's, so the owner's
// absence from the server's pool cannot be told apart (the pf12 pack proves main.ts refuses to start as the owner).
ok("R1.4 4: the running server's pooled connections include the app's role (xr_app)", /\bxr_app\b/.test(serverRoles ?? ""), serverRoles);

// 7 underneath: every walled table (platform_*, fo_*, money_*, msg_*, auto_*, plat_complaint*) forces row-level security,
// and every one but the catalogues and our own registers has a policy firm_id (platform_firm: id) = platform_session_firm() for read and write (the function reads app.firm_id) (the list as PF-12's pack keeps it)
const EXCEPT = ["platform_plan", "platform_role_permission", "platform_setting_definition", "platform_permission_key", "platform_terms_version", "platform_plan_limit", "platform_limit_change", "platform_signup_pending", "plat_breach", "plat_data_request", "plat_legal_hold"];
const walled = owner(`select string_agg(relname, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname ~ '^(platform_|fo_|money_|msg_|auto_|plat_complaint)'`).split(",").filter(Boolean);
const notForced = owner(`select coalesce(string_agg(relname, ','), '') from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname ~ '^(platform_|fo_|money_|msg_|auto_|plat_complaint)' and not (relrowsecurity and relforcerowsecurity) and relname <> all(array['${EXCEPT.slice(0, 7).join("','")}'])`);
// The firm column is firm_id, or id on platform_firm itself; read and write both name it (matched here, not in SQL).
const WALL = /\((firm_id|id) = platform_session_firm\(\)\)/;
const noPolicy = walled.filter((t) => !EXCEPT.includes(t)).filter((t) => !owner(`select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' | ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = '${t}'`)
  .split("\n").some((l) => { const [read, write] = l.split(" | "); return WALL.test(read ?? "") && WALL.test(write ?? ""); }));
ok(`R1.4 7: every walled table (${walled.length}) forces row-level security (the 7 catalogues aside: PF-15's plan_limit and limit_change, no firm_id, as PF-12's pack's LATER_CATALOGUES)`, walled.length > 30 && notForced === "", notForced);
ok("R1.4 7: every walled table but the catalogues and our own registers has a policy firm_id (platform_firm: id) = platform_session_firm() for read and write (the function reads app.firm_id)", noPolicy.length === 0, noPolicy);

// 6 the bypass record
await new Promise((r) => setTimeout(r, 500));
const logAfter = requestUses();
const auditAfter = doorLines();
// PF-12b part 2 (#2752): the seven own-firm doors (sign-in among them) left the bypass, so signing in and the staff routes
// above are no bypass use at all: the log must be readable and show none, and no audit_event line is written for them.
// Before #2752 this step expected a positive count (sign-in was a bypass use with no audit line: QA-499).
ok("R1.4 6: the server log is readable and the run's sign-ins and staff routes make 0 request uses of the bypass, and no audit line names a door (the doors left it, PF-12b2)", logAfter >= 0 && logAfter - logBefore === 0 && auditAfter - auditBefore === 0, { logBefore, logAfter, auditBefore, auditAfter });
console.log(`NOTE  R1.4 6: bypass uses during this run: ${logAfter - logBefore} request-use platform_bypass lines in the server log (${LOG.split("/").slice(-2).join("/")}); ${auditAfter - auditBefore} audit_event lines naming one of the seven doors`);
// W6 PF-12b3: the public sign-up's no-firm steps and its verification email write firm-less platform.bypass lines
const firmless = (use: string) => Number(owner(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'use' = '${use}' and firm_id is null and coalesce(detail->>'firmId', '') = ''`));
const named = () => Number(owner(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'use' in ('platform.firms.signup', 'platform.account.mail') and (firm_id is not null or coalesce(detail->>'firmId', '') <> '')`));
const before6 = { signup: firmless("platform.firms.signup"), mail: firmless("platform.account.mail"), named: named(), firms: Number(owner(`select count(*) from platform_firm`)) };
const plans = await call("GET", "/api/public/plans");
await new Promise((r) => setTimeout(r, 3500));   // the form's minimum fill time (signup.ts LIMITS.minFillSeconds 3)
const su = await call("POST", "/api/public/signup", undefined, { email: `owner.${run}@j4-sample.example.com`, password: `Sample-pass-${run}-x`, firmName: `J4 Sample Firm ${run}`, countryCode: "CA", acceptedTerms: (plans.body?.terms ?? []).map((t: any) => t.id), formStamp: plans.body?.formStamp ?? "" });
await new Promise((r) => setTimeout(r, 1500));   // the verification email is written in sign-up's background step
const after6 = { signup: firmless("platform.firms.signup"), mail: firmless("platform.account.mail"), named: named(), firms: Number(owner(`select count(*) from platform_firm`)) };
ok("R1.4 W6: a visitor's sign-up through the public door is accepted in plain words (202, check your email); no firm exists yet", plans.status === 200 && su.status === 202 && after6.firms === before6.firms, { plans: plans.status, signup: su.status, status: su.body?.status });
ok("R1.4 W6 (PF-12b3): sign-up's no-firm steps write platform.bypass lines with no firm, naming platform.firms.signup", after6.signup > before6.signup, { before: before6.signup, after: after6.signup });
ok("R1.4 W6 (PF-12b3): the verification email writes one platform.bypass line with no firm, naming platform.account.mail", after6.mail === before6.mail + 1, { before: before6.mail, after: after6.mail });
ok("R1.4 W6 (fail case): no line of either platform use names a firm", after6.named === before6.named && after6.named === 0, after6.named);

// last: the walk ends at the next capability's first step (P-348 (3))
// 5 the next capability's first step answers for the right firm
const meA = await call("GET", "/api/platform/me", tA), meB = await call("GET", "/api/platform/me", tB);
ok("R1.4 5: R1.5's first step (/me after sign-in) answers firm A for firm A's person and firm B for firm B's", meA.body?.firmId === firmA && meB.body?.firmId === firmB, { a: meA.body?.firmId === firmA, b: meB.body?.firmId === firmB });
await db.$disconnect();
// Exit explicitly, as every journey does (walks 44923980977: 21/21 PASS, then exit 143 because the event loop never
// emptied: record.ts's step-board browser for an API walk stays open, so its beforeExit hook never came).
// record.ts turns process.exit into: finish the recording, then exit with this code (the number of failed checks).
process.exit(Math.min(summary(), 125));
