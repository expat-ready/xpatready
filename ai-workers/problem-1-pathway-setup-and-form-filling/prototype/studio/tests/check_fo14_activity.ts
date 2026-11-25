// FO-14 part A (R1.62; BACKLOG row FO-14; AG-15-29, -30, -54): the client's progress stream, data side. Each rule with a
// passing and a failing case:
//   DW1 an event recorded through the port is read back (newest first)
//   DW2 firm B's events never appear for firm A; the app role with no firm reads nothing
//   DW3 insert-only: update, delete and truncate refused
//   DW4 another firm's person refused; DW5 a bad kind or source refused
//   DW6 GET /api/front-office/people/:id/engagement: the firm's staff reads it; another firm's person and a malformed id
//       are the same 404; no token 401
//   PENDING DW7 the signing door records VIEW (first opening) and SIGNED: after the signing files' open PRs (baton)
//   DW8 both adapters pass PortalActivityPort's contract
//   PENDING payments (FO-7c's pay door) record PAID when it merges.
//   Part B, POST people/:id/updates ("Tell the client", through the real Messages with the local channel and the real gate):
//   DW9 a delivered update moves lastUpdate; DW10 a suppressed address is NOT_SENT and does not move it; DW11 no email
//   address is NOT_SENT and sends nothing; DW12 an activity event does not move it; DW13 another firm's person, another
//   client's case → 404, nothing written; DW14 no portal:message key 403; text over 2000 or empty 422; DW15 the table
//   refuses update and delete; the audit line holds no body text; DW16 streamFor: only sent updates, newest first;
//   DW17 one update per Idempotency-Key; DW18 a merged-away person refused, its history read through the survivor.
// One process: a scratch database (every migration, PF-3's Sample seed) and a small Nest app built from the feature's own
// classes with PF-4's guard and routes and PF-12's interceptor. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo14_activity.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { portalActivityPortContract, type PortalActivityHarness } from "../ports/contracts/portal-activity-port.contract.ts";
import { fakePortalActivity } from "../ports/fakes/portal-activity.fake.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo14_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refusedBySql = (q: string, like: RegExp) => { try { sql(q); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const call = async (base: string, path: string, auth?: string, post?: unknown, key?: string | null) => {
  const r = await fetch(`${base}${path}`, { method: post ? "POST" : "GET", headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(post ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) }, body: post ? JSON.stringify(post) : undefined });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, text };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { PgPortalActivity } = await import("../api/src/front-office/activity/adapter.ts");
const feature = (await import("../api/src/features/front-office-activity.ts")).default;
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { localEmail } = await import("../api/src/platform/messages/channels/email/local.ts");
const { channelsOf } = await import("../api/src/platform/messages/send/channels.ts");
const { Messages } = await import("../api/src/platform/messages/send/messages.ts");
const { MESSAGE_PORT } = await import("../api/src/features/platform-messages.ts");
const { Engagement } = await import("../api/src/front-office/activity/service.ts");
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const K = "fo14-local-key-0123456789abcdef-0123";
const apps: { close(): Promise<void> }[] = [];
const db = new Db();
try {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
  await seedSampleFirms(owner);
  await owner.$disconnect();
  const FA = sql(`select id from platform_firm where key = 'sample-firm'`), FB = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firmId: string, id = randomUUID(), email: string | null = null) => {
    sql(`set session_replication_role = replica; insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${id}', '${firmId}', 'Client', 'Sample', ${email ? `'${email}'` : "null"}, 'seed:fo14', now())`);
    return id;
  };
  const PA = person(FA), PB = person(FB);
  const pg = new PgPortalActivity(db);
  const rec = (firmId: string, e: Record<string, unknown>) => withFirm(firmId, () => db.$transaction((tx) => pg.record(tx, e as never)));
  const count = (where: string) => Number(sql(`select count(*) from fo_portal_activity_event where ${where}`));

  // DW1
  await rec(FA, { firmId: FA, personId: PA, kind: "SIGN_IN", source: "portal" });
  await rec(FA, { firmId: FA, personId: PA, kind: "UPLOAD", source: "portal", caseId: randomUUID() });
  const read = await withFirm(FA, () => pg.recent(FA, PA, 10));
  ok("FO-14 DW1 pass: an event recorded in the caller's transaction is read back, newest first", read.length === 2 && read[0].kind === "UPLOAD" && read[1].kind === "SIGN_IN" && read[0].source === "portal", read);
  ok("FO-14 DW1 fail: a record whose transaction rolls back keeps nothing",
    await withFirm(FA, () => db.$transaction(async (tx) => { await pg.record(tx, { firmId: FA, personId: PA, kind: "VIEW", source: "portal" }); throw new Error("rolled back"); })).then(() => false, () => count(`person_id = '${PA}' and kind = 'VIEW'`) === 0));

  // DW2
  await rec(FB, { firmId: FB, personId: PB, kind: "SIGNED", source: "signing" });
  const crossA = await withFirm(FA, () => pg.recent(FA, PB, 10)), crossB = await withFirm(FA, () => pg.recent(FB, PB, 10)).catch(() => []);
  ok("FO-14 DW2 pass: firm B reads its own event", (await withFirm(FB, () => pg.recent(FB, PB, 10))).length === 1);
  ok("FO-14 DW2 fail: firm B's event never appears for firm A (by firm A's scope, or naming firm B from firm A's session)", crossA.length === 0 && crossB.length === 0, { crossA, crossB });
  const noFirm = await db.foPortalActivityEvent.count().catch(() => 0);
  ok("FO-14 DW2 fail: the app role with no firm reads nothing (the owner sees 3 rows)", noFirm === 0 && count("true") === 3, { noFirm, all: count("true") });

  // DW3
  ok("FO-14 DW3 fail: an update is refused", refusedBySql(`update fo_portal_activity_event set source = 'booking'`, /written once, never changed or removed \(UPDATE refused\)/));
  ok("FO-14 DW3 fail: a delete is refused", refusedBySql(`delete from fo_portal_activity_event`, /DELETE refused/));
  ok("FO-14 DW3 fail: a truncate is refused", refusedBySql(`truncate fo_portal_activity_event`, /TRUNCATE refused/));
  ok("FO-14 DW3 fail: the app's update in its own firm is refused too", await withFirm(FA, () => db.foPortalActivityEvent.updateMany({ where: { firmId: FA }, data: { source: "booking" } })).then(() => false, () => true));
  ok("FO-14 DW3 pass: every event is still there", count("true") === 3);

  // DW4, DW5
  const ins = (firm: string, p: string, kind = "VIEW", source = "signing") => `insert into fo_portal_activity_event (firm_id, person_id, kind, source) values ('${firm}', '${p}', '${kind}', '${source}')`;
  ok("FO-14 DW4 pass: the firm's own person is accepted", (sql(ins(FA, PA)), count(`person_id = '${PA}'`) === 3));
  ok("FO-14 DW4 fail: another firm's person is refused (SQL and the adapter)", refusedBySql(ins(FA, PB), /not one of the firm's people/)
    && await rec(FA, { firmId: FA, personId: PB, kind: "VIEW", source: "signing" }).then(() => false, (e) => (e as Error).name === "PortalActivityRefused"));
  ok("FO-14 DW4 fail: an unknown person is refused", refusedBySql(ins(FA, randomUUID()), /not one of the firm's people/));
  ok("FO-14 DW5 fail: a kind that is not one is refused", refusedBySql(ins(FA, PA, "OPENED"), /invalid input value for enum/));
  ok("FO-14 DW5 fail: a source that is not one lower-case word is refused", refusedBySql(ins(FA, PA, "VIEW", "Pay link"), /fo_portal_activity_event_shape/) && refusedBySql(ins(FA, PA, "VIEW", "pay-"), /fo_portal_activity_event_shape/));
  ok("FO-14 DW5 pass: a word joined by '-' is a source", (sql(ins(FA, PA, "PAID", "pay-link")), count(`source = 'pay-link'`) === 1));

  // DW6: the engagement route
  const local = new LocalIdentity(K, () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...feature.providers];
  const mclock = new FakeClock(new Date()), jobs = fakeJobs(mclock);
  const messages = new Messages({ db: db as never, consent: new ConsentStore(auditEvent, mclock), files: new LocalFiles(mkdtempSync(join(tmpdir(), "fo14-files-"))), jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock: mclock });
  providers.push({ provide: MESSAGE_PORT, useValue: messages } as never);
  @Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false }); apps.push(app);
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const signIn = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) }).then((r) => r.json()) as { token: string };
  const t = signIn.token;
  const mine = await call(base, `/api/front-office/people/${PA}/engagement`, t);
  ok("FO-14 DW6 pass: the firm's staff reads a client's engagement (last seen = the newest event's time, newest first)",
    mine.status === 200 && mine.body.activity.length === 4 && mine.body.lastSeen === mine.body.activity[0].at && mine.body.activity[0].kind === "PAID" && Object.keys(mine.body.activity[0]).sort().join() === "at,caseId,kind,source", mine.body);
  const other = await call(base, `/api/front-office/people/${PB}/engagement`, t), bad = await call(base, `/api/front-office/people/not-a-uuid/engagement`, t);
  ok("FO-14 DW6 fail: another firm's person and a malformed id are the same 404", other.status === 404 && bad.status === 404 && other.text === bad.text, [other.body, bad.body]);
  const fresh = await call(base, `/api/front-office/people/${person(FA)}/engagement`, t);
  ok("FO-14 DW6 pass: a person with no event reads lastSeen null and no activity", fresh.status === 200 && fresh.body.lastSeen === null && fresh.body.activity.length === 0, fresh.body);
  ok("FO-14 DW6 fail: no token is 401", (await call(base, `/api/front-office/people/${PA}/engagement`)).status === 401);

  console.log("PENDING  FO-14 DW7: the signing door records VIEW and SIGNED once the signing files' open PRs (#3648, #3670, #3681, #3695) hand over the baton (not counted)");

  // DW8
  let n = 0;
  const pgHarness = (): PortalActivityHarness => ({ port: pg, firmA: FA, firmB: FB, person: async (f) => person(f),
    inFirm: (f, fn) => withFirm(f, () => db.$transaction((tx) => fn(tx))), read: (f, fn) => withFirm(f, fn) });
  const fake = fakePortalActivity();
  const fakeHarness = (): PortalActivityHarness => ({ port: fake, firmA: FA, firmB: FB, person: async (f) => { const id = randomUUID(); fake.person(f, id); n++; return id; },
    inFirm: (_f, fn) => fn(null), read: (_f, fn) => fn() });
  const label = (name: string, c: unknown, d?: unknown) => ok(`FO-14 DW8 ${c ? "pass" : "fail"}: ${name}`, c, d);
  await runContract(portalActivityPortContract, "PgPortalActivity", pgHarness, label);
  await runContract(portalActivityPortContract, "fakePortalActivity", fakeHarness, label);

  ok("FO-14 pass: the feature binds PORTAL_ACTIVITY_PORT and registers the engagement route", feature.controllers.length === 1 && feature.providers.length === 3 && n > 0);

  // DW9-DW18: "Tell the client" (part B)
  const outbox = () => Number(sql(`select count(*) from msg_outbox`)), updates = (w = "true") => Number(sql(`select count(*) from fo_client_update where ${w}`));
  let kn = 0;
  const tell = (p: string, body: unknown, tok = t, key: string | null = `k-${++kn}`) => call(base, `/api/front-office/people/${p}/updates`, tok, body, key);
  const work = (id: string) => withFirm(FA, async () => { for (let i = 0; i < 9; i++) { const r = await messages.deliver(FA, sql(`select outbox_id from fo_client_update where id = '${id}'`)).catch(() => ""); if (r) return r; } return ""; });
  const lastUpd = async (p: string) => (await call(base, `/api/front-office/people/${p}/engagement`, t)).body.lastUpdate;
  const suppress = (on: boolean, a = "client.c@sample-client.example") => sql(on ? `insert into msg_firm (firm_id) values ('${FA}') on conflict do nothing; insert into msg_suppression (id, firm_id, channel, address, reason, created_by) values (gen_random_uuid(), '${FA}', 'EMAIL', '${a}', 'HARD_BOUNCE', 'seed:fo14')`
    : `alter table msg_suppression disable trigger user; delete from msg_suppression where firm_id = '${FA}'; alter table msg_suppression enable trigger user`);

  const PC = person(FA, randomUUID(), "client.c@sample-client.example"), cs = (p: string) => {
    const k = randomUUID(), c = randomUUID(), w = randomUUID();
    sql(`set session_replication_role = replica; insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values ('${k}', '${w}', 'sample-firm', '${FA}', 1, 'Client Sample', 'PERSON', '${p}', 'seed:fo14');
      insert into runtime_case (id, workspace_id, combination_id, case_number, client_actor_id, created_by, firm_key, firm_id, client_id) values ('${c}', '${w}', '${randomUUID()}', 'C-2026-${10000 + Math.floor(Math.random() * 89999)}', 'user-P', 'seed:fo14', 'sample-firm', '${FA}', '${k}')`);
    return c;
  };
  const caseC = cs(PC);
  const first = await tell(PC, { text: "Your file was submitted.", caseId: caseC });
  ok("FO-14 DW9 fail: an update the outbox only accepted (QUEUED) does not count yet", first.status === 201 && first.body.state === "ACCEPTED" && first.body.lastUpdate === null && await lastUpd(PC) === null, first.body);
  const sent1 = await work(first.body.id), at1 = await lastUpd(PC);
  ok("FO-14 DW9 pass: once the worker sends it, it moves lastUpdate", sent1 === "sent" && typeof at1 === "string", { sent1, at1 });
  ok("FO-14 DW9 fail: before any update lastUpdate is null", await lastUpd(PA) === null);
  suppress(true);
  const supp = await tell(PC, { text: "A second update." });
  ok("FO-14 DW10 fail: a suppressed address is NOT_SENT with the gate's reason and does not move lastUpdate", supp.status === 201 && supp.body.state === "NOT_SENT" && /^SUPPRESSED/.test(supp.body.reason) && await lastUpd(PC) === at1, supp.body);
  ok("FO-14 DW10 pass: the NOT_SENT update is still recorded", updates(`person_id = '${PC}' and state = 'NOT_SENT'`) === 1);
  suppress(false);
  const late = await tell(PC, { text: "Suppressed after the post." });
  suppress(true); const lateR = await work(late.body.id); suppress(false);
  const PF = person(FA, randomUUID(), "refused@example.com"), refused = await tell(PF, { text: "To a refused address." }), refR = await work(refused.body.id);
  sql(`insert into msg_send_counter (firm_id, day, sent, updated_at) select '${FA}', d, 100000, now() from generate_series(current_date - 1, current_date + 1, interval '1 day') d on conflict (firm_id, day) do update set sent = 100000`);
  const held = await tell(PC, { text: "Held at the cap." }), heldR = await work(held.body.id);
  sql(`update msg_send_counter set sent = 0 where firm_id = '${FA}'`);
  ok("FO-14 DW10 fail: suppressed after the post, FAILED by the provider and held at the daily cap: none counts", lateR === "suppressed" && refR === "failed" && heldR === "held" && await lastUpd(PC) === at1 && await lastUpd(PF) === null, { lateR, refR, heldR });
  const before = outbox(), none = await tell(PA, { text: "No address here." });
  ok("FO-14 DW11 fail: a person with no email is NOT_SENT (\"no email address\"), sends nothing, lastUpdate stays null", none.status === 201 && none.body.state === "NOT_SENT" && none.body.reason === "no email address" && none.body.lastUpdate === null && outbox() === before, none.body);
  await rec(FA, { firmId: FA, personId: PC, kind: "VIEW", source: "government-letter" });
  await rec(FA, { firmId: FA, personId: PC, kind: "SIGN_IN", source: "portal" });
  const eng = (await call(base, `/api/front-office/people/${PC}/engagement`, t)).body;
  ok("FO-14 DW12 fail: an activity event or a government letter moves lastSeen, never lastUpdate", eng.lastUpdate === at1 && eng.lastSeen > eng.lastUpdate, eng);
  const n0 = updates(), o0 = outbox(), cross = await tell(PB, { text: "Hello." }), otherCase = await tell(PC, { text: "Hello.", caseId: cs(person(FA)) });
  ok("FO-14 DW13 fail: another firm's person → 404, another client's case → 404 \"No such case.\"; nothing written or sent", cross.status === 404 && otherCase.status === 404 && /No such case\./.test(otherCase.text) && updates() === n0 && outbox() === o0, [cross.body, otherCase.body]);
  ok("FO-14 DW13 pass: the client's own case is accepted", updates(`case_id = '${caseC}'`) === 1);
  const ro = randomUUID();
  sql(`insert into platform_staff (id, firm_id, actor_id, email, display_name, updated_at) values ('${ro}', '${FA}', 'user-fo14ro', 'user-fo14ro@sample.invalid', 'Sample read only', now()); insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${FA}', '${ro}', 'READ_ONLY', 'seed:fo14')`);
  const roT = (await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-fo14ro", secondStep: true }) }).then((r) => r.json()) as { token: string }).token;
  const denied = await tell(PC, { text: "Hello." }, roT);
  ok("FO-14 DW14 fail: a staff member without agent/portal:message → 403, nothing written", denied.status === 403 && updates() === n0, denied.body);
  const badT = await Promise.all([{ text: "x".repeat(2001) }, { text: "   " }, { text: "a\u0000b" }, { text: "\u200b\u200b" }, { text: "a\u202eb" }, { text: "🇨🇦".repeat(1001) }].map((b) => tell(PC, b)));
  ok("FO-14 DW14 fail: over 2000 code points, empty, NUL, zero-width only, a format character → 422 naming text", badT.every((r) => r.status === 422 && r.body.fields?.text) && badT[3].body.fields.text === "This is required." && updates() === n0, badT.map((r) => [r.status, r.body.fields]));
  const okLong = await tell(PC, { text: "🇨🇦".repeat(1000) }), last = await tell(PC, { text: "y".repeat(1990) + "\n\tend" });
  ok("FO-14 DW14 pass: 2000 code points (1000 flags) and line breaks and tabs are accepted", okLong.status === 201 && last.body.state === "ACCEPTED" && await work(last.body.id) === "sent", [okLong.body, last.body]);
  ok("FO-14 DW15 fail: fo_client_update refuses update and delete", refusedBySql(`update fo_client_update set state = 'NOT_SENT'`, /UPDATE refused/) && refusedBySql(`delete from fo_client_update`, /DELETE refused/));
  const insU = (p: string, extra = "", vals = "") => `insert into fo_client_update (firm_id, person_id, body, sent_by, state, request_key, request_hash${extra}) values ('${FA}', '${p}', 'b', 'staff:x', 'NOT_SENT', '${randomUUID()}', '${"0".repeat(64)}'${vals}) returning created_at > now() - interval '1 hour'`;
  ok("FO-14 DW15 fail: its own person trigger refuses another firm's person; ACCEPTED needs an outbox row; the time is the database's", refusedBySql(insU(PB), /not one of the firm's people/)
    && refusedBySql(insU(PC).replace("'NOT_SENT'", "'ACCEPTED'"), /fo_client_update_shape/) && sql(insU(PC, ", created_at", ", '2000-01-01'")) === "t");
  const lines = sql(`select string_agg(a::text, '|') from audit_event a where entity = 'fo_client_update'`);
  ok("FO-14 DW15 pass: one audit line per update, with no body text and no email", Number(sql(`select count(*) from audit_event where entity = 'fo_client_update'`)) === updates() - 1 && !/submitted|second update|No address|yyyy|sample-client/.test(lines), lines);
  const k = "fo14-same-key", n1 = updates(), o1 = outbox(), a1 = await tell(PC, { text: "Once." }, t, k), a2 = await tell(PC, { text: "Once." }, t, k), a3 = await tell(PC, { text: "Twice." }, t, k);
  ok("FO-14 DW17 fail: the same key and body answers the first update (200) and sends once; another body with it → 422; no key → 400", a1.status === 201 && a2.status === 200 && a2.body.id === a1.body.id && a3.status === 422
    && (await tell(PC, { text: "x" }, t, null)).status === 400 && updates() === n1 + 1 && outbox() === o1 + 1, [a2.body, a3.body]);
  const many = await Promise.all(Array.from({ length: 5 }, () => tell(PC, { text: "At once." }, t, "fo14-at-once")));
  ok("FO-14 DW17 pass: 5 posts at once with one key → one row, one outbox row", many.every((r) => r.body.id === many[0].body.id) && updates(`body = 'At once.'`) === 1 && Number(sql(`select count(*) from msg_outbox o join fo_client_update u on u.outbox_id = o.id where u.body = 'At once.'`)) === 1, many.map((r) => r.status));
  const PS = person(FA, randomUUID(), "survivor@sample-client.example"), PT = person(FA, randomUUID(), "tomb@sample-client.example"), tu = await tell(PT, { text: "Before the merge." });
  await work(tu.body.id); await rec(FA, { firmId: FA, personId: PT, kind: "UPLOAD", source: "portal" });
  sql(`set session_replication_role = replica; update fo_person set merged_into_id = '${PS}', merged_at = now() where id = '${PT}'`);
  const tomb = await tell(PT, { text: "After the merge." }), surv = (await call(base, `/api/front-office/people/${PS}/engagement`, t)).body;
  ok("FO-14 DW18 fail: a merged-away person: tell → the one 404; both tables refuse it", tomb.status === 404 && refusedBySql(insU(PT), /not one of the firm's people/) && refusedBySql(ins(FA, PT), /not one of the firm's people/), tomb.body);
  ok("FO-14 DW18 pass: the survivor's engagement shows the tombstone's events and last update (one level)", surv.activity[0]?.kind === "UPLOAD" && typeof surv.lastUpdate === "string", surv);
  const [P1, P2, P3] = [1, 2, 3].map((i) => person(FA, randomUUID(), `chain${i}@sample-client.example`)), u1 = await tell(P1, { text: "In the chain." });
  await work(u1.body.id); await rec(FA, { firmId: FA, personId: P1, kind: "UPLOAD", source: "portal" }); await rec(FA, { firmId: FA, personId: P3, kind: "SIGN_IN", source: "portal" });
  sql(`set session_replication_role = replica; update fo_person set merged_into_id = '${P2}', merged_at = now() where id = '${P1}'; update fo_person set merged_into_id = '${P3}', merged_at = now() where id = '${P2}'`);
  const e3 = (await call(base, `/api/front-office/people/${P3}/engagement`, t)).body, e1 = (await call(base, `/api/front-office/people/${P1}/engagement`, t)).body, s3 = await new Engagement(db, pg, messages).streamFor(FA, P3);
  ok("FO-14 DW19 fail/pass: P→S→T: T's engagement and streamFor hold P's event and sent update (the whole chain)", e3.activity.length === 2 && typeof e3.lastUpdate === "string" && s3.updates[0]?.text === "In the chain.", [e3, s3]);
  ok("FO-14 DW19 pass: the engagement of a merged-away id is its survivor's whole tree", JSON.stringify(e1) === JSON.stringify(e3), e1);
  const fine = await Promise.all([{ text: "می\u200cخواهم" }, { text: "👩\u200d💻" }].map((b) => tell(PC, b))), lone = await tell(PC, { text: "a\ud800b" });
  ok("FO-14 DW20 pass/fail: ZWNJ and ZWJ (a Persian word, 👩‍💻) are accepted; a lone surrogate → 422", fine.every((r) => r.status === 201) && lone.status === 422 && lone.body.fields?.text, [fine.map((r) => r.body), lone.body]);
  const PR = person(FA, randomUUID(), "repeat@sample-client.example"), r1 = await tell(PR, { text: "One." }, t, "fo14-r"), r1at = await work(r1.body.id) && await lastUpd(PR);
  const r2 = await tell(PR, { text: "Two." }); await work(r2.body.id);
  const again = await tell(PR, { text: "One." }, t, "fo14-r"), r2at = await lastUpd(PR);
  ok("FO-14 DW21 fail: an idempotent repeat answers the first answer's lastUpdate (as of the first update's time)", again.status === 200 && again.body.lastUpdate === r1.body.lastUpdate && r2at !== r1at, [r1.body, again.body]);
  sql(`set session_replication_role = replica; update msg_outbox set state = 'BOUNCED' where id = (select outbox_id from fo_client_update where id = '${r2.body.id}')`);
  ok("FO-14 DW21 fail: an update SENT then BOUNCED (set by SQL: the local channel does not bounce) no longer counts", await lastUpd(PR) === r1at && r1at !== null, [r1at, await lastUpd(PR)]);
  const stream = await new Engagement(db, pg, messages).streamFor(FA, PC);
  ok("FO-14 DW16 pass/fail: streamFor returns only sent updates, newest first (NOT_SENT, queued, suppressed, held left out), and the activity", stream.updates.length === 2 && stream.updates[0].text.startsWith("yyyy") && stream.updates[1].caseId === caseC
    && stream.lastUpdate?.getTime() === stream.updates[0].at.getTime() && stream.activity[0]?.kind === "SIGN_IN", stream);
  console.log("PENDING  FO-14: payments (FO-7c pay door, open PR) record PAID when it merges (not counted)");
} catch (e) {
  ok("FO-14: the test ran to its end", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 4).join(" ")}` : String(e));
} finally {
  for (const a of apps) await a.close().catch(() => {});
  await db.$disconnect().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for tools/prune-test-dbs.sh */ }
}
console.log(`\nFO-14: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
