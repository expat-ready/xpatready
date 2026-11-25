// PF-4p part 1 (R1.62, map row 62; BACKLOG row PF-4p; P-584 (4); AG-15-3, AG-15-38, AG16-23; SA-2-35): clients' own
// sign-in plane, the guard of /api/portal/* and a client's own cases. Each rule with a passing and a failing case:
//   DW1 a client token on /api/platform/me → 401; a staff token on /api/portal/me → 401; a client token on a case-side
//       route → 403 (core.ts: a bearer token outside /api/link)
//   DW2 a client sees only their own cases; another client's case by id (same firm or another firm), a random id and a
//       malformed id are the same 404; a client of firm A never reads firm B's rows
//   DW3 a suspended account cannot sign in and its live session ends at its next request; sign-out ends the session
//   DW4 each sign-in (and each refused one of a known account) writes one audit line, actor person:<id>, type CLIENT
//   DW5 the start-up rules: an undeclared /api/portal route, portal access off /api/portal, a mixed route each stop it
//   DW6 the schema: one account per person and per email in a firm, email lower case, a person of another firm refused,
//       PF-12's wall (no firm: nothing read)
//   PENDING PF-27's firmAllows (a held or locked firm): a stub until PF-27 merges; the line says so and is not counted.
// One process: a scratch database (every migration, PF-3's Sample seed) and a small Nest app built from the feature's own
// classes beside core.ts's ConfigReadGuard, PF-4's guard and routes and PF-12's interceptor. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf4p_client_identity.ts
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { identityPortContract } from "../ports/contracts/identity-port.contract.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf4p_scratch_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const sql = (q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(DB, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refusedBySql = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };

type Res = { status: number; body: any; text: string };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown; actor?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.actor) headers["x-actor"] = o.actor;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, text };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { AnyStaff } = await import("../api/src/platform/identity/keys.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { ClientLocalIdentity, CLIENT_LOCAL_ISSUER } = await import("../api/src/platform/client-identity/local.ts");
const { CLIENT_IDENTITY_PORT, ClientIdentity } = await import("../api/src/platform/client-identity/service.ts");
const { ClientGuard } = await import("../api/src/platform/client-identity/guard.ts");
const { PortalController } = await import("../api/src/platform/client-identity/routes.ts");
const { PortalClient, PortalSignIn } = await import("../api/src/platform/client-identity/keys.ts");
const { firmAllows } = await import("../api/src/platform/client-identity/firm-allows.ts");
const feature = (await import("../api/src/features/platform-client-identity.ts")).default;

// A case-side read (guarded by core.ts as before) and routes that must stop the start-up.
@Controller("api/probe") class ProbeController { @Get() read() { return { ok: true }; } }
@Controller("api/portal") class UndeclaredController { @Get("undeclared-thing") thing() { return 1; } }
@Controller("api/platform") class OutsideController { @Get("pf4p-outside") @PortalClient("declared on the firm plane by mistake") thing() { return 1; } }
@Controller("api/portal") class MixedController { @Get("pf4p-mixed") @PortalSignIn("a client's") @AnyStaff("and a firm's") thing() { return 1; } }

const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const SIGNING = "pf4p-shared-local-secret-0123456789abcdef";
const firmLocal = new LocalIdentity(SIGNING, () => clock.now());
const clientLocal = new ClientLocalIdentity(SIGNING, () => clock.now());   // the same setting: the client plane derives its own key

async function makeApp(o: { extra?: unknown[]; clientPort?: unknown } = {}) {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: CLIENT_IDENTITY_PORT, useValue: o.clientPort ?? clientLocal }, ClientIdentity, ClientGuard, { provide: APP_GUARD, useExisting: ClientGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }];
  @Module({ controllers: [ProbeController, PlatformIdentityController, PortalController, ...(o.extra ?? [])] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}` };
}

const apps: { close(): Promise<void> }[] = [];
try {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
  await seedSampleFirms(owner);
  await owner.$disconnect();
  const FA = sql(`select id from platform_firm where key = 'sample-firm'`), FB = sql(`select id from platform_firm where key = 'sample-solo'`);
  const W = randomUUID(), CMB = randomUUID();
  const [PA, PB, PC, PS, PE] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];   // Client A, Client B (firm A), Client C (firm B), a suspended client (firm A), a person with no account (firm A)
  const [KA, KB, KC] = [randomUUID(), randomUUID(), randomUUID()];   // case-side clients
  const [A1, A2, B1, C1] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];   // cases
  const [UA, UB, UC, US] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];   // portal accounts
  // Sample rows written as the owner with triggers and keys off (replica): the case side's rows are not this part's.
  sql(`set session_replication_role = replica;
    insert into fo_sales_setup (firm_id) values ('${FA}'), ('${FB}');
    insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values
      ('${PA}', '${FA}', 'Client', 'A', 'client.a@example.test', 'seed:pf4p', now()), ('${PB}', '${FA}', 'Client', 'B', 'client.b@example.test', 'seed:pf4p', now()),
      ('${PC}', '${FB}', 'Client', 'C', 'client.c@example.test', 'seed:pf4p', now()), ('${PS}', '${FA}', 'Client', 'S', 'client.s@example.test', 'seed:pf4p', now());
    insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${CMB}', '${W}', '${randomUUID()}', 'pf4p', 'Sample work permit', '[]', 'seed:pf4p');
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values
      ('${KA}', '${W}', 'sample-firm', '${FA}', 1, 'Client A', 'PERSON', '${PA}', 'seed:pf4p'), ('${KB}', '${W}', 'sample-firm', '${FA}', 2, 'Client B', 'PERSON', '${PB}', 'seed:pf4p'),
      ('${KC}', '${W}', 'sample-solo', '${FB}', 1, 'Client C', 'PERSON', '${PC}', 'seed:pf4p');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, client_id, firm_key, firm_id, created_at, closed_at, status, closed_reason, close_outcome) values
      ('${A1}', '${W}', '${CMB}', 'user-P', 'seed:pf4p', 'C-2026-00001', '${KA}', 'sample-firm', '${FA}', now() - interval '2 days', null, 'OPEN', null, null),
      ('${A2}', '${W}', '${CMB}', 'user-P', 'seed:pf4p', 'C-2026-00002', '${KA}', 'sample-firm', '${FA}', now() - interval '1 day', now(), 'CLOSED', 'Decision received', 'COMPLETED'),
      ('${B1}', '${W}', '${CMB}', 'user-Q', 'seed:pf4p', 'C-2026-00003', '${KB}', 'sample-firm', '${FA}', now(), null, 'OPEN', null, null),
      ('${C1}', '${W}', '${CMB}', 'user-Q', 'seed:pf4p', 'C-2026-00001', '${KC}', 'sample-solo', '${FB}', now(), null, 'OPEN', null, null);
    insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) values
      ('${randomUUID()}', '${W}', '${A1}', 'sample-firm', '${FA}', 1, 'prep', 'Preparation', 'Getting your application ready', '${CMB}', 'CURRENT', '${randomUUID()}', 'BEGIN'),
      ('${randomUUID()}', '${W}', '${B1}', 'sample-firm', '${FA}', 1, 'prep', 'Preparation', 'Client B stage words', '${CMB}', 'CURRENT', '${randomUUID()}', 'BEGIN');
    insert into platform_client_account (id, firm_id, person_id, email, status) values
      ('${UA}', '${FA}', '${PA}', 'client.a@example.test', 'ACTIVE'), ('${UB}', '${FA}', '${PB}', 'client.b@example.test', 'ACTIVE'),
      ('${UC}', '${FB}', '${PC}', 'client.c@example.test', 'ACTIVE'), ('${US}', '${FA}', '${PS}', 'client.s@example.test', 'SUSPENDED');`);
  ok("PF-4p pass: the feature registers the routes, the client guard (APP_GUARD) and its own port",
    feature.controllers.includes(PortalController) && (feature.providers as unknown[]).some((p) => (p as { provide?: unknown }).provide === APP_GUARD) && (feature.providers as unknown[]).some((p) => (p as { provide?: unknown }).provide === CLIENT_IDENTITY_PORT));
  ok("PF-4p DW5 fail: a route under /api/portal with no client access stops the start-up, naming it (deny by default)",
    await throwsLike(async () => { const a = await makeApp({ extra: [UndeclaredController] }); apps.push(a.app); }, (e) => /UndeclaredController\.thing \(GET \/api\/portal\/undeclared-thing\)/.test(String(e))));
  ok("PF-4p DW5 fail: a client's access declared on a firm path stops the start-up, naming it",
    await throwsLike(async () => { const a = await makeApp({ extra: [OutsideController] }); apps.push(a.app); }, (e) => /only under \/api\/portal.*OutsideController\.thing/.test(String(e))));
  ok("PF-4p DW5 fail: a portal route that also declares a firm's access stops the start-up, naming it",
    await throwsLike(async () => { const a = await makeApp({ extra: [MixedController] }); apps.push(a.app); }, (e) => /never also declares.*MixedController\.thing/.test(String(e))));
  ok("PF-4p fail: one port for staff and clients is refused (two planes, P-584 (4))",
    await throwsLike(() => new ClientIdentity({} as never, firmLocal, clock, firmLocal), (e) => /two ports/.test(String(e))));
  const A = await makeApp(); apps.push(A.app);
  const signIn = (firmKey: string, email: string) => call(A.base, "POST", "/api/portal/session/local", { body: { firmKey, email } });
  const lineCount = (accountId: string, action: string) => Number(sql(`select count(*) from audit_event where entity = 'platform_client_account' and entity_key = '${accountId}' and action = '${action}'`));
  const sA = await signIn("sample-firm", " Client.A@example.test ");
  ok("PF-4p pass: an ACTIVE client signs in on the local stand-in (email in any case and spacing)", sA.status === 200 && typeof sA.body.token === "string", sA.body);
  const tA = sA.body.token as string, tB = (await signIn("sample-firm", "client.b@example.test")).body.token as string, tC = (await signIn("sample-solo", "client.c@example.test")).body.token as string;
  const claims = JSON.parse(Buffer.from(tA.split(".")[1], "base64url").toString("utf8"));
  ok("PF-4p pass: the client token is the client plane's (its own issuer and plane claim) and carries no firm", claims.iss === CLIENT_LOCAL_ISSUER && claims.plane === "client" && !Object.keys(claims).some((k) => /firm/i.test(k)), claims);
  const me = await call(A.base, "GET", "/api/portal/me", { token: tA });
  ok("PF-4p pass: /api/portal/me names the client and their firm", me.status === 200 && me.body.accountId === UA && me.body.name === "Client A" && me.body.firm.key === "sample-firm", me.body);
  const unknown = await signIn("sample-firm", "nobody@example.test"), wrongFirm = await signIn("sample-solo", "client.a@example.test");
  ok("PF-4p fail: an unknown email, and a real client's email at another firm, are the same 401", unknown.status === 401 && wrongFirm.status === 401 && unknown.text === wrongFirm.text, [unknown.body, wrongFirm.body]);
  const staff = (await call(A.base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const staffMe = await call(A.base, "GET", "/api/platform/me", { token: staff });
  ok("PF-4p DW1 pass: the firm's staff token still reads /api/platform/me", staffMe.status === 200, staffMe.body);
  const clientOnStaff = await call(A.base, "GET", "/api/platform/me", { token: tA });
  ok("PF-4p DW1 fail: a client token on /api/platform/me → 401", clientOnStaff.status === 401, clientOnStaff.body);
  const staffOnPortal = await call(A.base, "GET", "/api/portal/me", { token: staff });
  ok("PF-4p DW1 fail: a staff token on /api/portal/me → 401 (not one this server issued for a client portal)", staffOnPortal.status === 401 && /client portal/.test(staffOnPortal.body.detail), staffOnPortal.body);
  ok("PF-4p DW1 fail: a staff token on /api/portal/cases → 401, nothing read", (await call(A.base, "GET", "/api/portal/cases", { token: staff })).status === 401);
  const caseSide = await call(A.base, "GET", "/api/probe", { token: tA, actor: "user-O" });
  ok("PF-4p DW1 fail: a client token on a case-side route → 403 (a bearer token outside /api/link)", caseSide.status === 403, caseSide.body);
  ok("PF-4p DW1 fail: no token on /api/portal/me → 401", (await call(A.base, "GET", "/api/portal/me")).status === 401);
  const forged = tA.slice(0, -2) + (tA.endsWith("AA") ? "BB" : "AA");
  ok("PF-4p DW1 fail: a token with a changed signature → 401", (await call(A.base, "GET", "/api/portal/me", { token: forged })).status === 401);
  ok("PF-4p DW1 fail: the firm stand-in cannot verify a client token, and the client stand-in cannot verify a staff token (one setting, two keys)",
    await throwsLike(() => firmLocal.verify(tA), () => true) && await throwsLike(() => clientLocal.verify(staff), () => true));
  const ghost = clientLocal.issue(randomUUID(), { authTimeMs: clock.now() });
  ok("PF-4p DW1 fail: a client stand-in token naming an account no firm has → 401", (await call(A.base, "GET", "/api/portal/me", { token: ghost })).status === 401);
  const list = await call(A.base, "GET", "/api/portal/cases", { token: tA });
  const ids = (list.body as { caseId: string }[]).map?.((c) => c.caseId) ?? [];
  ok("PF-4p DW2 pass: Client A's list holds exactly their two cases, newest first", list.status === 200 && ids.join() === [A2, A1].join(), list.body);
  const a1 = (list.body as any[]).find((c) => c.caseId === A1), a2 = (list.body as any[]).find((c) => c.caseId === A2);
  ok("PF-4p DW2 pass: each case shows its number, what it is, the stage in the client's words, open or closed", a1?.caseNumber === "C-2026-00001" && a1.title === "Sample work permit" && a1.stage === "Getting your application ready" && a1.open === true && a2?.open === false && a2.closedAt, list.body);
  ok("PF-4p DW2 fail: Client B's case and stage words appear nowhere in Client A's list", !list.text.includes(B1) && !list.text.includes("Client B stage words") && !list.text.includes("C-2026-00003"));
  const own = await call(A.base, "GET", `/api/portal/cases/${A1}`, { token: tA });
  ok("PF-4p DW2 pass: Client A opens their own case by id", own.status === 200 && own.body.caseId === A1, own.body);
  const other = await call(A.base, "GET", `/api/portal/cases/${B1}`, { token: tA }), otherFirm = await call(A.base, "GET", `/api/portal/cases/${C1}`, { token: tA });
  const random = await call(A.base, "GET", `/api/portal/cases/${randomUUID()}`, { token: tA }), bad = await call(A.base, "GET", "/api/portal/cases/not-a-uuid", { token: tA });
  ok("PF-4p DW2 fail: another client's case by URL → 404", other.status === 404, other.body);
  ok("PF-4p DW2 fail: another firm's case by URL → 404", otherFirm.status === 404, otherFirm.body);
  ok("PF-4p DW2 fail: another client's case, another firm's, a random id and a malformed id answer byte for byte the same", [otherFirm, random, bad].every((r) => r.status === 404 && r.text === other.text), [other.text, otherFirm.text, random.text, bad.text]);
  const lowerCase = await call(A.base, "GET", `/api/portal/cases/${A1.toUpperCase()}`, { token: tA });
  ok("PF-4p DW2 pass: an id in capitals is the same case", lowerCase.status === 200 && lowerCase.body.caseId === A1, lowerCase.body);
  const listB = await call(A.base, "GET", "/api/portal/cases", { token: tB }), listC = await call(A.base, "GET", "/api/portal/cases", { token: tC });
  ok("PF-4p DW2 pass: Client B sees only their case; Client C (firm B) only theirs", (listB.body as any[]).map((c) => c.caseId).join() === B1 && (listC.body as any[]).map((c) => c.caseId).join() === C1, [listB.body, listC.body]);
  const ownC = await call(A.base, "GET", `/api/portal/cases/${A1}`, { token: tC });
  ok("PF-4p DW2 fail: firm B's client asking for firm A's case → 404", ownC.status === 404, ownC.body);
  const sus = await signIn("sample-firm", "client.s@example.test");
  ok("PF-4p DW3 fail: a suspended account cannot sign in; it is told plainly to contact the firm", sus.status === 401 && sus.body.code === "CLIENT_PAUSED" && /paused/.test(sus.body.detail), sus.body);
  sql(`update platform_client_account set status = 'SUSPENDED' where id = '${UB}'`);
  const bAfter = await call(A.base, "GET", "/api/portal/cases", { token: tB });
  ok("PF-4p DW3 fail: a live session of an account suspended since sign-in ends at its next request (401, paused)", bAfter.status === 401 && bAfter.body.code === "CLIENT_PAUSED", bAfter.body);
  sql(`update platform_client_account set status = 'ACTIVE' where id = '${UB}'`);
  ok("PF-4p DW3 pass: once active again, the same session reads again (suspend is reversible, data kept)", (await call(A.base, "GET", "/api/portal/cases", { token: tB })).status === 200);
  const out = await call(A.base, "POST", "/api/portal/session/end", { token: tA, body: {} });
  const afterOut = await call(A.base, "GET", "/api/portal/me", { token: tA });
  ok("PF-4p DW3 fail: after sign-out, the old token → 401 at its next request", out.status === 200 && afterOut.status === 401 && afterOut.body.code === "SESSION_ENDED", [out.body, afterOut.body]);
  const again = await signIn("sample-firm", "client.a@example.test"), tAgain = String(again.body.token);
  ok("PF-4p DW3 pass: a sign-in after sign-out, in the same millisecond, works", again.status === 200 && (await call(A.base, "GET", "/api/portal/me", { token: tAgain })).status === 200, again.body);
  clock.t += 3601 * 1000;
  ok("PF-4p DW3 fail: a token past its hour → 401 (session ended)", (await call(A.base, "GET", "/api/portal/me", { token: tAgain })).status === 401);
  clock.t = Date.now();
  const typed = sql(`select string_agg(distinct actor_type::text || ' ' || actor, ',') from audit_event where entity = 'platform_client_account' and entity_key = '${UA}' and action = 'platform.client.sign_in'`);
  ok("PF-4p DW4 pass: each of Client A's two sign-ins wrote one line, typed CLIENT, actor person:<their party id>", lineCount(UA, "platform.client.sign_in") === 2 && typed === `CLIENT person:${PA}`, typed);
  ok("PF-4p DW4 pass: the sign-out wrote one line", lineCount(UA, "platform.client.sign_out") === 1);
  ok("PF-4p DW4 fail: the suspended account's refused sign-in wrote one refused line and no sign-in line", lineCount(US, "platform.client.sign_in_refused") === 1 && lineCount(US, "platform.client.sign_in") === 0);
  ok("PF-4p DW4 pass: no line holds an email address", sql(`select count(*) from audit_event where entity = 'platform_client_account' and (detail::text ~ '@' or summary ~ '@')`) === "0");
  const off = await makeApp({ clientPort: { via: "cognito", verify: async () => { throw new Error("no"); } } }); apps.push(off.app);
  const offSignIn = await call(off.base, "POST", "/api/portal/session/local", { body: { firmKey: "sample-firm", email: "client.a@example.test" } });
  ok("PF-4p fail: the local door is closed when the client port is not the stand-in (403, nothing issued)", offSignIn.status === 403 && offSignIn.body.code === "LOCAL_SIGN_IN_OFF", offSignIn.body);
  const extra = await call(A.base, "POST", "/api/portal/session/local", { body: { firmKey: "sample-firm", email: "client.a@example.test", password: "x" } });
  ok("PF-4p fail: an unknown field at the door is a field error naming it (PF-28's one input rule)", extra.status === 422 && /password/.test(JSON.stringify(extra.body)), extra.body);
  ok("PF-4p DW6 fail: a second account for the same person in a firm is refused", refusedBySql(`insert into platform_client_account (id, firm_id, person_id, email) values (gen_random_uuid(), '${FA}', '${PA}', 'other@example.test')`, /firm_id_person_id/));
  ok("PF-4p DW6 fail: a second account with the same email in a firm is refused", refusedBySql(`set session_replication_role = replica; insert into fo_person (id, firm_id, created_by, updated_at) values ('${PE}', '${FA}', 'seed:pf4p', now()); set session_replication_role = origin; insert into platform_client_account (id, firm_id, person_id, email) values (gen_random_uuid(), '${FA}', '${PE}', 'client.a@example.test')`, /firm_id_email/));
  ok("PF-4p DW6 fail: an email in capitals or with spaces is refused by the database", refusedBySql(`update platform_client_account set email = 'Client.A@example.test' where id = '${UA}'`, /email_ok/));
  ok("PF-4p DW6 fail: an account naming another firm's person is refused (the pair key)", refusedBySql(`insert into platform_client_account (id, firm_id, person_id, email) values (gen_random_uuid(), '${FA}', '${PC}', 'x@example.test')`, /person_fkey/));
  ok("PF-4p DW6 fail: an account's person cannot be changed, even to another of the firm's people", refusedBySql(`update platform_client_account set person_id = '${PE}' where id = '${UA}'`, /person_fixed/));
  ok("PF-4p DW6 fail: an invitation hash that is not 64 lower-case hex is refused", refusedBySql(`insert into platform_client_invitation (id, firm_id, account_id, token_hash, expires_at, created_by) values (gen_random_uuid(), '${FA}', '${UA}', 'ABC', now() + interval '7 days', 'staff:x')`, /hash_ok/));
  ok("PF-4p DW6 pass: an invitation for a firm's own account with a 7-day expiry is stored", sql(`insert into platform_client_invitation (id, firm_id, account_id, token_hash, expires_at, created_by) values (gen_random_uuid(), '${FA}', '${UA}', '${"a".repeat(64)}', now() + interval '7 days', 'staff:x') returning 1`) === "1");
  ok("PF-4p DW6 fail: an invitation naming another firm's account is refused", refusedBySql(`insert into platform_client_invitation (id, firm_id, account_id, token_hash, expires_at, created_by) values (gen_random_uuid(), '${FB}', '${UA}', '${"b".repeat(64)}', now() + interval '7 days', 'staff:x')`, /account_id_fkey/));
  ok("PF-4p DW6 fail (PF-12): the app role with no firm reads no account and no invitation", sql(`select (select count(*) from platform_client_account) + (select count(*) from platform_client_invitation)`, "xr_app") === "0");
  ok("PF-4p DW6 pass (PF-12): the app role as firm A reads firm A's accounts only", sql(`select set_config('app.firm_id', '${FA}', false); select count(*) from platform_client_account`, "xr_app").split("\n").pop() === "3");
  ok("PF-4p DW6 pass: the guard's lookup gives an account's firm id and nothing else; an unknown id gives null", sql(`select platform_client_account_firm('${UC}')`, "xr_app") === FB && sql(`select coalesce(platform_client_account_firm(gen_random_uuid())::text, 'null')`, "xr_app") === "null");
  ok("PF-4p DW6 fail (breaker m8): a client account cannot be deleted, not even by the app role in its own firm", refusedBySql(`select set_config('app.firm_id', '${FA}', false); delete from platform_client_account where id = '${US}'`, /never deleted/, "xr_app") && refusedBySql(`truncate platform_client_account cascade`, /never deleted/));
  ok("PF-4p DW6 fail (breaker m2): an email in NFD form (a second spelling of one NFC email) is refused", refusedBySql(`update platform_client_account set email = normalize('jose\u0301@example.test', NFD) where id = '${US}'`, /email_ok/));
  ok("PF-4p DW6 fail (breaker m2): an email holding a no-break space is refused", refusedBySql(`update platform_client_account set email = 'client.s@example.test' || chr(160) where id = '${US}'`, /email_ok/));
  ok("PF-4p DW6 pass: an NFC email with an accent is stored", sql(`update platform_client_account set email = normalize('josé@example.test', NFC) where id = '${US}' returning 1`) === "1");
  sql(`update platform_client_account set email = 'client.s@example.test' where id = '${US}'`);
  const big = await call(A.base, "POST", "/api/portal/session/local", { body: { firmKey: "sample-firm", email: "x".repeat(2_000_000) } });
  ok("PF-4p fail (breaker m3): a 2 MB body at the portal door is refused as too large (413), as at the staff door", big.status === 413, big.status);
  const s1 = await signIn("sample-firm", "client.a@example.test"), s2 = await signIn("sample-firm", "client.a@example.test");   // two sessions, the second dated after the first
  const ended = await call(A.base, "POST", "/api/portal/session/end", { token: String(s1.body.token), body: {} });
  ok("PF-4p DW3 fail (review m5): sign-out from the older session also ends a newer one", ended.status === 200 && (await call(A.base, "GET", "/api/portal/me", { token: String(s2.body.token) })).status === 401);
  ok("PF-4p pass (review m6): a paused client reads a plain title, not \"Sign in again\"", sus.body.title === "Access paused", sus.body);
  const live = String((await signIn("sample-solo", "client.c@example.test")).body.token);
  sql(`update platform_firm set status = 'DELETED' where id = '${FB}'`);
  const closedMe = await call(A.base, "GET", "/api/portal/me", { token: live }), closedIn = await signIn("sample-solo", "client.c@example.test");
  ok("PF-4p fail (review m1): a closed firm's client: the live session and a new sign-in are each 401 FIRM_CLOSED", closedMe.status === 401 && closedMe.body.code === "FIRM_CLOSED" && closedIn.status === 401 && closedIn.body.code === "FIRM_CLOSED", [closedMe.body, closedIn.body]);
  sql(`update platform_firm set status = 'ACTIVE' where id = '${FB}'`);
  ok("PF-4p pass (review m1): the firm active again, its client signs in", (await signIn("sample-solo", "client.c@example.test")).status === 200);
  // PF-0c: the client stand-in passes IdentityPort's contract, as every identity adapter does.
  const ACC = randomUUID();
  await runContract(identityPortContract, "ClientLocalIdentity", () => { const id = new ClientLocalIdentity(SIGNING, () => Date.now()); return { identity: id, who: { staffId: ACC }, token: ({ secondStep }: { secondStep: boolean }) => id.issue(ACC, { authTimeMs: Date.now() - 60_000, secondStep }), expiredToken: () => new ClientLocalIdentity(SIGNING, () => Date.now() - 2 * 3600_000).issue(ACC, { authTimeMs: Date.now() - 2 * 3600_000 - 60_000 }) }; }, ok);
  console.log(`PENDING  PF-4p SA-2-35: a held or locked firm's client reads status and own documents only — PF-27's firmAllows is not on main; the stub allows all (${await firmAllows(FA, "portal.upload")}). PF-27 turns this line into its test.`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the next run's drop */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
