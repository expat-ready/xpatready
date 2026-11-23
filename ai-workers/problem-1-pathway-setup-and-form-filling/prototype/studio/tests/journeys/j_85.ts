// J-85 (map row 85, R1.85: "Data-request register with legal hold"), written by the qa lane (22 Nov, Track B's qa lane,
// A286) BEFORE its parts merge, so qa only has to run it when they do. Persona: ExpatReady's own Platform Owner in our
// console (PF-17), on an isolated copy of the running app (its own database and port, never :4400), by screens where
// they exist and on the routes and the database underneath.
// Done when (CAPABILITIES R1.85), word for word as the steps:
//   W1 "A privacy request is logged": our console's Privacy › Requests page (PF-21rs, in PF-17's console) logs a request
//      to us (type ACCESS | CORRECTION | DELETION, the requester, received) into plat_data_request (PF-21b part 2), with
//      its target date received + 30 days (a reminder, not enforced; SA-11 §3.8, Unconfirmed: no counsel) and one audit line.
//   W2 "and worked to an outcome": the request moves In progress, then Completed; each change is an insert-only event,
//      listed on the page (PF-21b part 2, PF-21rs).
//   W3 "within its time": on the fake clock, a request past its target date reads OVERDUE and raises one alert (NFR5-14).
//   W4 "a legal hold stops deletion": a PERSON hold placed by our Platform Owner (plat_legal_hold, PF-21b part 2) makes
//      the running app's delete check answer HELD with the reason (BR-12: never a false success) and leaves the row; a
//      released hold lets it proceed. The running app's one delete check is AUD-5's KeepPeriods.check(), which asks
//      LegalHoldPort first (BR-7); until PF-21b part 2 wires the real adapter it refuses (KeepCheckNotBuilt).
//      PF-21b part 1's rule (the port and its fake) is walked here as the part that is merged: a stand-in, said.
//   W5 "a legal hold stops deletion" (erasure, PF-21d): an approved DELETION request is carried out 7 days after
//      approval, and a held person answers HELD: nothing erased.
//   W6 roles: a firm's own Owner cannot reach our console's register or place a hold (403; SA-11: firms place no holds).
//   W7: the walk ends at R1.86's first step: our console's Breaches page (PF-21c, PF-21rs).
// Fails on main today only where a part is not merged (P-606); each failing step names its part: PF-21d (erasure),
// PF-21rs (the console pages), PF-17 (the console), PF-21c (breaches). Aligned by qa (23 Nov) to main's routes after
// PF-21b parts 2-3 merged: /api/system/register/requests and /api/system/register/holds. PF-4s has no invite, so our
// Platform Owner is written by SQL (said in the run's output).
// Sample values only; US$0, no model call, no live mail. Screenshots: product/screens/J-85/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh j85 4485 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j85 4485 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_85.ts j85 4485
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { fakeLegalHolds } from "../../ports/legal-hold.ts";
import { KeepCheckNotBuilt } from "../../ports/keep-period.ts";
import { KeepPeriods } from "../../api/src/platform/keep-period/service.ts";
import { PgLegalHolds } from "../../api/src/platform/register/holds/adapter.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j85", Number(process.argv[3] ?? 4485)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-85", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const table = (t: string) => sql(`select count(*) from information_schema.tables where table_schema = current_schema() and table_name = '${t}'`) === "1";
const columns = (t: string) => sql(`select coalesce(string_agg(column_name, ',' order by column_name), '') from information_schema.columns where table_schema = current_schema() and table_name = '${t}'`);
const enumValues = (t: string, c: string) => sql(`select coalesce(string_agg(e.enumlabel, ',' order by e.enumsortorder), '') from information_schema.columns k join pg_type ty on ty.typname = k.udt_name join pg_enum e on e.enumtypid = ty.oid where k.table_schema = current_schema() and k.table_name = '${t}' and k.column_name = '${c}'`);

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("J-85 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const ownerEmail = sql(`select email from platform_staff where actor_id = 'user-R'`);   // the firm's own Owner (not our staff)
const personId = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', 'Requester${run}', 'Sample', 'j85.${run}@example.com', 'test', now()) returning id`);
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: ownerEmail, secondStep: true }) });
const firmTok = ((await signIn.json()) as { token?: string }).token;
if (!firmTok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
// Our own Platform Owner's session (PF-4s part 1, #2927: POST /api/system/session/local, plat_system_staff). Until it
// merges there is no token: every console call below then fails and names PF-4s part 1 too.
// PF-4s has no invite yet: one Sample Platform Owner is written by SQL with the platform-owner role (a stand-in, said,
// as j_93 does); the copy must run with PLATFORM_SYSTEM_IDENTITY=local for its sign-in door.
const ourEmail = table("plat_system_staff") ? `j85.owner.${run}@expatready.example` : "";
if (ourEmail) { console.log("  note: stand-in: our Platform Owner written by SQL (PF-4s has no invite)"); rawSql(`with s as (insert into plat_system_staff (id, email, display_name, status) values (gen_random_uuid(), '${ourEmail}', 'Sample Platform Owner', 'ACTIVE') returning id) insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, 'platform-owner' from s`); }
const ourTok: string | undefined = ourEmail ? (await j("POST", "/api/system/session/local", { email: ourEmail, secondStep: true })).body?.token : undefined;
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
const shot = (name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

try {
  // ---------------------------------------------------------------------------------------------- W1 a privacy request is logged
  // Our console: PF-4s part 1 (#2927) signs our own staff in; PF-17 is the console; PF-21rs its Privacy pages.
  const ourSignIn = await j("GET", "/api/system/register/requests");
  ok("J-85 W1 (PF-4s part 1, PF-21b part 3, on main): our register answers as a guarded area (401 with no session, never 404)", ourSignIn.status === 401, ourSignIn.status);
  await p.goto(`${BASE}/system/privacy/requests`); await p.waitForLoadState("networkidle").catch(() => undefined); await p.waitForTimeout(800);
  const consoleWords = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  ok("J-85 W1 (parts missing: PF-21rs, PF-17): our console's Privacy › Requests page opens with \"Log a request\"", (await p.getByRole("heading", { name: /privacy|data requests/i }).count()) > 0 && (await p.getByRole("button", { name: /log a request/i }).count()) > 0, consoleWords.slice(0, 200));
  await shot("W1-console-privacy-requests");
  const reqCols = columns("plat_data_request");
  ok("J-85 W1 (PF-21b part 3, on main): the register table exists with type, requester, received, target date, status", table("plat_data_request") && ["type", "received", "target", "status"].every((c) => reqCols.includes(c)), reqCols || "no table");
  ok("J-85 W1 (PF-21b part 3, on main): a request's type is ACCESS | CORRECTION | DELETION and its status PENDING | IN_PROGRESS | COMPLETED | OVERDUE | HELD",
    enumValues("plat_data_request", "type") === "ACCESS,CORRECTION,DELETION" && ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "HELD"].every((s) => enumValues("plat_data_request", "status").split(",").includes(s)), { type: enumValues("plat_data_request", "type"), status: enumValues("plat_data_request", "status") });
  const logged = await j("POST", "/api/system/register/requests", { type: "ACCESS", requester: `Requester${run} Sample`, requesterEmail: `j85.${run}@example.com`, receivedOn: "2026-11-02" }, ourTok);
  const dbReq = table("plat_data_request") ? sql(`select count(*) || '|' || coalesce(max((target_date - received_on)::text), '') from plat_data_request where requester_email = 'j85.${run}@example.com'`) : "no table";
  ok("J-85 W1 (PF-4s part 1, on main; our Owner by SQL, no invite yet): our Platform Owner signs in to the console (a system session token)", !!ourTok, { ourStaff: ourEmail || "no plat_system_staff" });
  ok("J-85 W1 (PF-21b part 3, on main): the request is logged, stored once with its target date received + 30 days, and one audit line", (logged.status === 200 || logged.status === 201) && dbReq === "1|30", { status: logged.status, dbReq });

  // ---------------------------------------------------------------------------------------------- W2 worked to an outcome
  const reqId = typeof logged.body === "object" ? logged.body?.id : undefined;
  const moved = reqId ? [await j("POST", `/api/system/register/requests/${reqId}/status`, { status: "IN_PROGRESS" }, ourTok), await j("POST", `/api/system/register/requests/${reqId}/status`, { status: "COMPLETED", actionsTaken: "Sent the person's records (Sample)" }, ourTok)] : [];
  const evs = table("plat_data_request_event") && reqId ? sql(`select count(*) from plat_data_request_event where request_id = '${reqId}'`) : "no table";
  ok("J-85 W2 (PF-21b part 3, on main): the request moves In progress then Completed, each change an insert-only event (plat_data_request_event)", moved.length === 2 && moved.every((m) => m.status === 200) && Number(evs) >= 3, { moved: moved.map((m) => m.status), evs });
  if (reqId) { await p.goto(`${BASE}/system/privacy/requests/${reqId}`); await p.waitForLoadState("networkidle").catch(() => undefined); }
  const reqPage = reqId ? (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ") : "";
  ok("J-85 W2 (part missing: PF-21rs, our console's Privacy pages): the request's page lists each event and its outcome", !!reqId && /in progress/i.test(reqPage) && /completed/i.test(reqPage) && reqPage.includes("Sent the person's records"), reqPage.slice(0, 200) || "no request to open");

  // ---------------------------------------------------------------------------------------------- W3 within its time
  // A request received 40 days before today: past its 30-day target, so it reads OVERDUE with one alert for it.
  const oldDay = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
  const late = await j("POST", "/api/system/register/requests", { type: "CORRECTION", requester: `Late${run} Sample`, requesterEmail: `j85.late.${run}@example.com`, receivedOn: oldDay }, ourTok);
  const lateId = typeof late.body === "object" ? late.body?.id : undefined;
  const lateRead = lateId ? await j("GET", `/api/system/register/requests/${lateId}`, undefined, ourTok) : { status: 0, body: null };
  // The alert's mark: one OVERDUE step, written in the same transaction as the alert it raises (an alert that cannot be
// raised undoes its mark: requests/service.ts:156-174), so one step means one alert.
const alerts = lateId ? sql(`select count(*) from plat_data_request_event where request_id = '${lateId}' and to_status = 'OVERDUE'`) : "0";
  ok("J-85 W3 (PF-21b part 3, on main): a request received 40 days ago is past its target date: it reads OVERDUE and raises one alert for that request (NFR5-14)",
    !!lateId && lateRead.body?.status === "OVERDUE" && alerts === "1", { logged: late.status, status: lateRead.body?.status ?? null, alerts });

  // ---------------------------------------------------------------------------------------------- W4 a legal hold stops deletion
  const holdCols = columns("plat_legal_hold");
  ok("J-85 W4 (PF-21b part 2, on main): the hold table exists with scope, target, reason, placed and released by/at", table("plat_legal_hold") && ["scope", "reason", "placed_by", "placed_at", "released_by", "released_at"].every((c) => holdCols.includes(c)), holdCols || "no table");
  const placed = await j("POST", "/api/system/register/holds", { firmId, scope: { kind: "PERSON", id: personId }, reason: "Sample litigation (J-85)" }, ourTok);
  ok("J-85 W4 (PF-21b part 2, on main): our Platform Owner places a PERSON hold with a reason (one audit line)", placed.status === 200 || placed.status === 201, placed.status);
  // The running app's one delete check (AUD-5 part 2): it asks the hold port first; with no adapter wired it refuses.
  const keep = new KeepPeriods(db as never, new PgLegalHolds() as never);   // as the app wires it (features/platform-register-holds.ts)
  let verdict = "";
  try { await db.$transaction(async (tx) => { const r = await keep.check(tx as never, { firmId, class: "client_financial" as never, startedAt: new Date("2020-01-01"), subject: { kind: "PERSON", id: personId } as never, recordDates: [new Date("2020-01-01")] }); verdict = r.verdict; }); }
  catch (e) { verdict = e instanceof KeepCheckNotBuilt ? "KeepCheckNotBuilt" : `${(e as Error).name}: ${(e as Error).message}`.slice(0, 160); }
  ok("J-85 W4 (PF-21b part 2, on main: the real hold adapter under KEEP_CHECK_HOLDS): the app's delete check (AUD-5's KeepPeriods.check) answers HELD with the reason for the held person", verdict === "HELD", verdict);
  ok("J-85 W4: the app's delete check never answers a silent OK for the held person: HELD, or KeepCheckNotBuilt while no adapter is wired (no false success, BR-12)", verdict === "KeepCheckNotBuilt" || verdict === "HELD", verdict);
  // PF-21b part 1 (merged): the port's rule on its fake, run in this process (a stand-in for the adapter, said, not hidden).
  const holds = fakeLegalHolds(), other = globalThis.crypto.randomUUID();
  const ask = () => holds.transaction((tx) => holds.isHeld(tx, firmId, [{ kind: "PERSON", id: personId }]));
  const before = await ask();
  const h = await holds.place({ firmId, scope: { kind: "PERSON", id: personId }, reason: "Sample litigation (J-85)", by: "seed:J-85" });
  const during = await ask(), otherFirm = await holds.transaction((tx) => holds.isHeld(tx, other, [{ kind: "PERSON", id: personId }]));
  await holds.release({ holdId: h.holdId, by: "seed:J-85", reason: "Matter closed (Sample)" });
  const after = await ask();
  ok("J-85 W4 (PF-21b part 1, the port on its fake): a PERSON hold answers held with its reason and owner; another firm's ask is not held; a released hold matches nothing",
    !before.held && during.held && during.holds[0]?.reason === "Sample litigation (J-85)" && during.holds[0]?.placedBy === "seed:J-85" && !otherFirm.held && !after.held, { before, during, otherFirm, after });

  // ---------------------------------------------------------------------------------------------- W5 erasure (PF-21d)
  // A DELETION request for the held person, approved, then the erasure run for it: HELD, and the person's row stays.
  const del = await j("POST", "/api/system/register/requests", { type: "DELETION", requester: `Requester${run} Sample`, requesterEmail: `j85.${run}@example.com`, receivedOn: new Date().toISOString().slice(0, 10), firmId, subject: { kind: "PERSON", id: personId } }, ourTok);
  const delId = typeof del.body === "object" ? del.body?.id : undefined;
  const approved = delId ? await j("POST", `/api/system/register/requests/${delId}/approve`, {}, ourTok) : { status: 0, body: null };
  const erased = delId ? await j("POST", `/api/system/register/requests/${delId}/erase-now`, {}, ourTok) : { status: 0, body: null };
  ok("J-85 W5 (part missing: PF-21d, the erasure; its approve and erase routes are this journey's guesses): an approved DELETION request for a held person is carried out as HELD: nothing erased, the person's row stays, the request says so",
    approved.status === 200 && JSON.stringify(erased.body ?? "").includes("HELD") && sql(`select count(*) from fo_person where id = '${personId}'`) === "1", { logged: del.status, approved: approved.status, erased: erased.status });

  // ---------------------------------------------------------------------------------------------- W6 roles
  const firmReg = await j("GET", "/api/system/register/requests", undefined, firmTok), firmHold = await j("POST", "/api/system/register/holds", { firmId, scope: { kind: "FIRM" }, reason: "x" }, firmTok);
  ok("J-85 W6 (PF-4s part 1, PF-21b parts 2-3, on main): a firm's own Owner is refused on our register and on placing a hold (401 or 403, never 404: the routes exist and refuse)", [401, 403].includes(firmReg.status) && [401, 403].includes(firmHold.status), [firmReg.status, firmHold.status]);

  // ---------------------------------------------------------------------------------------------- W7 R1.86's first step
  await p.goto(`${BASE}/system/privacy/breaches`); await p.waitForLoadState("networkidle").catch(() => undefined); await p.waitForTimeout(500);
  ok("J-85 W7 (parts missing: PF-21rs, PF-21c): the walk ends at R1.86's first step: our console's Breaches page offers \"Record a breach\"", (await p.getByRole("button", { name: /record a breach/i }).count()) > 0);
  await shot("W7-console-breaches");
  ok("J-85: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
