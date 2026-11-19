// PF-15 part 1a (brief design/lead-b-briefs/PF-15.md; SA-3-4, SA-3-5, SA-3-39, SA-3-40): plan limits through
// EntitlementPort's real adapter, a pass and a fail per Done when line: DW1 seats on the real invite route · DW2 storage on
// the retainer upload (warn on day 1 with its emails once, hard on day 15, back under by the daily job; break M1, m2, m4)
// · DW6 the last seat at the same moment · DW7 usedBytes · the EntitlementPort contract on the fake and PgEntitlements ·
// the migration's rules. A scratch database and file folder (both removed), PF-4's classes in a Nest app with the local
// stand-in, a fake clock and fake mail. No server, no browser, no model call (US$0).
//   tsx studio/tests/check_pf15_limits.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { entitlementPortContract } from "../ports/contracts/entitlement-port.contract.ts";
import { filesPortContract } from "../ports/contracts/files-port.contract.ts";
import { fakeEntitlements, type EntitlementMetric } from "../ports/entitlement.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf15_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `pf15-check-${process.pid}`);
const sql = (q: string) => execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 600)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};
const problemOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return x.getStatus ? { status: x.getStatus(), body: x.getResponse?.() as Record<string, any> } : { status: 0, body: { error: String(e) } as Record<string, any> }; } };

execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort(), NEW = all.find((d) => /_pf15_plan_limits$/.test(d))!;
for (const d of all) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { Retainers } = await import("../api/src/front-office/retainers/service.ts");
const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
const { PgEntitlements } = await import("../api/src/platform/entitlements/limits.ts");
const { EntitledFiles, StorageWatch, STORAGE_DAILY_QUEUE } = await import("../api/src/platform/entitlements/storage.ts");
const { TEAM_INBOX_SAMPLE } = await import("../api/src/platform/config/settings.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const fake = new FakeClock("2026-11-20T15:00:00Z");
const clock = new (class extends PlatformClock { override now() { return fake.now().getTime(); } })();
const local = new LocalIdentity("pf15-check-signing-key-0123456789abcdef", () => clock.now());
const mail = fakeMail();

let app: { close(): Promise<void> } | null = null;
mkdirSync(WORK, { recursive: true });
try {
  // ------------------------------------------------------------------------------------------ the migration's rules
  const plans = sql(`select string_agg(p.code || ':' || l.metric || '=' || coalesce(l.limit_value::text, 'null'), ',' order by p.code, l.metric) from platform_plan_limit l join platform_plan p on p.id = l.plan_id`);
  ok("PF-15 schema pass: every Sample plan has its three Sample limits (seats stay on platform_plan.seats_limit)", plans === "firm:ACTIVE_INDIVIDUAL_CASES=600,firm:ACTIVE_CORPORATE_CASES=120,firm:STORAGE_MB=102400,solo:ACTIVE_INDIVIDUAL_CASES=25,solo:ACTIVE_CORPORATE_CASES=5,solo:STORAGE_MB=5120,team:ACTIVE_INDIVIDUAL_CASES=150,team:ACTIVE_CORPORATE_CASES=30,team:STORAGE_MB=25600", plans);
  ok("PF-15 schema fail: a negative limit is refused; a second row for one plan and metric is refused", refused(`update platform_plan_limit set limit_value = -1 where metric = 'STORAGE_MB'`, /platform_plan_limit_value_ok/)
    && refused(`insert into platform_plan_limit (plan_id, metric, limit_value) select plan_id, metric, 1 from platform_plan_limit limit 1`, /platform_plan_limit_pkey/));
  ok("PF-15 schema fail: the app's role cannot write the limits (writes revoked from xr_data)", sql(`select has_table_privilege('xr_data', 'platform_plan_limit', 'SELECT')::text || has_table_privilege('xr_data', 'platform_plan_limit', 'UPDATE')::text`) === "truefalse");
  ok("PF-15 schema pass: platform_storage_over is behind PF-12's wall (forced row-level security, its policy)", sql(`select relforcerowsecurity::text || (select count(*) from pg_policy where polrelid = 'platform_storage_over'::regclass)::text from pg_class where relname = 'platform_storage_over'`) === "true1");
  ok("PF-15 schema fail: the migration does not apply twice", (() => { try { execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, NEW, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] }); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: Buffer }).stderr ?? e)); } })());
  {
    const cfg = join(WORK, "prisma.config.ts");
    writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(DB))} } });\n`);
    const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
    const lines = `${r.stdout}`.split("\n").filter((l) => /platform_plan_limit|platform_storage_over|platform_limit_metric/.test(l));
    ok("PF-15 schema pass: prisma migrate diff names no PF-15 table, column or type", r.status === 0 && lines.length === 0, { status: r.status, lines, err: r.stderr.slice(0, 300) });
  }

  // ------------------------------------------------------------------------------------- the app and the Sample firms
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: MAIL_PORT, useValue: mail }];
  @Module({ controllers: [PlatformIdentityController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await seedSampleFirms(db);
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM_B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const PLAN_A = sql(`select plan_id from platform_subscription where firm_id = '${FIRM_A}' and status <> 'ENDED'`);
  const signIn = async (actorId: string) => (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } })).body.token as string;
  let tR = await signIn("user-R");
  const used = () => Number(sql(`select ((select count(*) from platform_staff where firm_id = '${FIRM_A}' and status in ('ACTIVE','SUSPENDED')) + (select count(*) from platform_invitation where firm_id = '${FIRM_A}' and accepted_at is null and revoked_at is null and expires_at > now()))::int`));
  const clearInvites = () => sql(`update platform_invitation set revoked_at = now() where firm_id = '${FIRM_A}' and accepted_at is null and revoked_at is null`);
  const seats = (n: number) => sql(`update platform_plan set seats_limit = ${n} where id = '${PLAN_A}'`);
  let n = 0;
  const invite = () => call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: `pf15.person${++n}@example.com`, roles: ["CASE_OFFICER"] } });

  // ------------------------------------------------------------------------- the shared contract: fake and real
  await runContract(entitlementPortContract, "fakeEntitlements", async (limits, hard) => ({ port: fakeEntitlements(limits, { storageHard: hard }), firm: "sample-solo" }), ok);
  let k = 0;
  const realHarness = async (limits: Partial<Record<EntitlementMetric, number | null>>, hard = false) => {
    const code = `pf15-contract-${++k}`, v = (m: EntitlementMetric) => (limits[m] === undefined || limits[m] === null ? "null" : String(limits[m]));
    const planId = sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), '${code}', 'Contract ${k} (Sample)', ${limits.seats ?? 1000}) returning id`).split("\n")[0];
    sql(`insert into platform_plan_limit (plan_id, metric, limit_value) values ('${planId}', 'ACTIVE_INDIVIDUAL_CASES', ${v("active_individual_cases")}), ('${planId}', 'ACTIVE_CORPORATE_CASES', ${v("active_corporate_cases")}), ('${planId}', 'STORAGE_MB', ${v("storage_mb")})`);
    sql(`update platform_subscription set plan_id = '${planId}' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    const at = hard ? `now() - interval '20 days'` : `now()`;
    sql(`insert into platform_storage_over (firm_id, first_over_at, used_bytes) values ('${FIRM_B}', ${at}, 1) on conflict (firm_id) do update set first_over_at = ${at}, back_under_at = null, alerted_at = null`);
    return { port: new PgEntitlements(db, () => Date.now()), firm: "sample-solo" };
  };
  await runContract(entitlementPortContract, "PgEntitlements", realHarness, ok);
  sql(`update platform_subscription set plan_id = (select id from platform_plan where code = 'solo') where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
  sql(`update platform_storage_over set back_under_at = now() where firm_id = '${FIRM_B}'`);
  ok("PF-15 pass: PgEntitlements takes the firm's id as well as its key (the platform side and the case side)", (await new PgEntitlements(db).limitOf(FIRM_B, "storage_mb")).limit === 5120 && (await new PgEntitlements(db).limitOf("sample-solo", "storage_mb")).limit === 5120);
  ok("PF-15 fail: PgEntitlements never guesses a usage (no `used` → refused as a programming error)", (await problemOf(() => new PgEntitlements(db).check("sample-solo", "seats"))) !== null);

  // ------------------------------------------------------------------------- DW1: seats through the real invite route
  clearInvites();
  const u0 = used();
  seats(u0);
  const atLimit = await invite();
  ok("PF-15 DW1 fail: an invitation with every seat taken → 409 PLAN_LIMIT_REACHED naming seats, the limit and the upgrade path", atLimit.status === 409 && atLimit.body.code === "PLAN_LIMIT_REACHED" && atLimit.body.metric === "seats" && atLimit.body.limit === u0 && atLimit.body.seatsLimit === u0 && typeof atLimit.body.upgradePath === "string" && used() === u0, atLimit);
  seats(u0 + 1);
  const below = await invite();
  ok("PF-15 DW1 pass: one seat left → 201 (the limit follows platform_plan.seats_limit, as the suites that set it expect)", below.status === 201 && used() === u0 + 1, below);
  ok("PF-15 DW1 fail: seats have no 0 and no Unlimited: platform_plan.seats_limit refuses both (PF-3's check; 0 and null are the other metrics')", refused(`update platform_plan set seats_limit = 0 where id = '${PLAN_A}'`, /platform_plan_seats_check/) && refused(`update platform_plan set seats_limit = null where id = '${PLAN_A}'`, /null value|not-null/));
  seats(u0 + 5);
  sql(`update platform_subscription set status = 'ENDED' where firm_id = '${FIRM_A}' and plan_id = '${PLAN_A}'`);
  const noPlan = await invite();
  sql(`update platform_subscription set status = 'TRIAL' where firm_id = '${FIRM_A}' and plan_id = '${PLAN_A}'`);
  ok("PF-15 DW1 fail: no live subscription → refused (fail closed, never Unlimited)", noPlan.status === 409 && noPlan.body.code === "PLAN_LIMIT_REACHED" && noPlan.body.limit === 0 && /no live subscription/.test(noPlan.body.detail), noPlan);
  {
    const bare = sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), 'pf15-bare', 'Bare (Sample)', 3) returning id`).split("\n")[0];
    sql(`update platform_subscription set plan_id = '${bare}' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    const l = await new PgEntitlements(db).limitOf(FIRM_B, "active_individual_cases"), c = await new PgEntitlements(db).check(FIRM_B, "active_individual_cases", 0);
    ok("PF-15 DW1 fail: a plan with no row for a metric reads as 0 and refuses (fail closed)", l.limit === 0 && !c.allowed, { l, c });
    sql(`update platform_subscription set plan_id = (select id from platform_plan where code = 'solo') where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    ok("PF-15 DW1 pass: the same firm on a plan with its rows reads them", (await new PgEntitlements(db).limitOf(FIRM_B, "active_individual_cases")).limit === 25);
  }

  // ----------------------------------------------------------------- DW6: two invitations at the same moment, last seat
  clearInvites(); seats(used() + 1);
  const race = await Promise.all([invite(), invite()]);
  ok("PF-15 DW6 pass: two invitations at the last seat at the same moment → one 201, one 409", race.map((r) => r.status).sort().join() === "201,409", race.map((r) => [r.status, r.body.code]));
  clearInvites(); seats(used() + 2);
  const two = await Promise.all([invite(), invite()]);
  ok("PF-15 DW6 fail: with two seats left both pass (the lock serialises, it does not refuse)", two.every((r) => r.status === 201), two.map((r) => r.status));

  // ------------------------------------------------------------------------------------------- DW7: usedBytes
  await runContract(filesPortContract, "LocalFiles", () => new LocalFiles(join(WORK, "contract", crypto.randomUUID())), ok);   // fakeFiles: check_pf0p_ports.ts
  {
    const lf = new LocalFiles(join(WORK, "crash"));
    await lf.put(FIRM_A, "a/b.txt", new TextEncoder().encode("1234"), "text/plain");
    mkdirSync(join(WORK, "crash", FIRM_A, "a"), { recursive: true });
    writeFileSync(join(WORK, "crash", FIRM_A, "a", "c.txt.1.ab.tmp"), "left by a crash");
    writeFileSync(join(WORK, "crash", FIRM_A, "a", "orphan.txt"), "no meta");
    ok("PF-15 DW7 fail: a .tmp left by a crash and a file with no .meta do not count (LocalFiles)", await lf.usedBytes(FIRM_A) === 4, await lf.usedBytes(FIRM_A));
  }

  // ------------------------------------------------------------- DW2: storage on the retainer upload (EntitledFiles)
  const audit = () => sql(`select string_agg(action, ',' order by at, id) from audit_event where action like 'storage.%' and detail->>'firmId' = '${FIRM_A}'`);
  const jobs = fakeJobs(fake);
  const watch = new StorageWatch({ db, files: new LocalFiles(join(WORK, "store")), mail, now: () => clock.now() });
  await watch.register(jobs);
  const store = new EntitledFiles(db, () => clock.now(), watch, join(WORK, "store"));
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}'`);
  const R = { staffId: sid("user-R"), firmId: FIRM_A, firmKey: "sample-firm", roles: [], keys: [], duties: [], authTime: 0, via: "local" } as never;
  const svc = new Retainers(db, store, { now: () => clock.now() });
  const docx = (i: number) => ({ bytes: buildDocx([`# Retainer ${i}`, "Client: {client.name}"]), size: 1000 });
  const owners = Number(sql(`select count(distinct s.id) from platform_staff s join platform_role_grant g on g.firm_id = s.firm_id and g.staff_id = s.id where s.firm_id = '${FIRM_A}' and s.status = 'ACTIVE' and g.role = 'OWNER' and g.ended_at is null`));
  const toTeam = () => mail.sent.filter((m) => m.to === TEAM_INBOX_SAMPLE).length, toOwners = () => mail.sent.filter((m) => m.templateKey === "platform.storage_over_limit").length;
  const STORAGE_A = `plan_id = '${PLAN_A}' and metric = 'STORAGE_MB'`;
  const first = await svc.uploadTemplate(R, { name: "Under the limit" }, docx(0));
  ok("PF-15 DW2 fail: under the limit (Sample 25 600 MB) an upload sets no mark and sends nothing", !!first && sql(`select count(*) from platform_storage_over where firm_id = '${FIRM_A}'`) === "0" && toTeam() === 0, toTeam());
  sql(`update platform_plan_limit set limit_value = 0 where ${STORAGE_A}`);
  const t0 = fake.now().getTime();
  const day1 = await svc.uploadTemplate(R, { name: "Day one" }, docx(1));
  ok("PF-15 DW2 pass: over the limit on day 1 → the upload is allowed (warn), the mark is set", !!day1 && sql(`select (first_over_at = to_timestamp(${t0 / 1000}))::text || (back_under_at is null)::text from platform_storage_over where firm_id = '${FIRM_A}'`) === "truetrue");
  ok("PF-15 DW2 pass: day 1 sends one email to the team inbox and one to each Owner (the \"Storage over limit\" email)", owners >= 1 && toTeam() === 1 && toOwners() === owners && mail.sent.filter((m) => m.templateKey === "platform.storage_over_limit").every((m) => m.subject === "Storage over limit" && m.class === "SERVICE"), { team: toTeam(), owners, toOwners: toOwners() });
  await fake.advance(86_400_000);
  const day2 = await svc.uploadTemplate(R, { name: "Day two" }, docx(2));
  await watch.measure(FIRM_A);
  ok("PF-15 DW2 fail: day 2 (an upload and a measure) sends no second email", !!day2 && toTeam() === 1 && toOwners() === owners, { team: toTeam(), owners: toOwners() });
  await fake.set(new Date(t0 + 14 * 86_400_000 - 60_000));
  const day14 = await problemOf(() => svc.uploadTemplate(R, { name: "Day fourteen" }, docx(14)));
  ok("PF-15 DW2 pass: one minute before 14 days over, an upload is still allowed", day14 === null, day14);
  await fake.set(new Date(t0 + 14 * 86_400_000));
  const filesBefore = Number(sql(`select count(*) from fo_retainer_template where firm_id = '${FIRM_A}'`));
  const day15 = await problemOf(() => svc.uploadTemplate(R, { name: "Day fifteen" }, docx(15)));
  ok("PF-15 DW2 fail: day 15 (14 days over) → a new upload is refused 409 PLAN_LIMIT_REACHED (storage_mb, the limit), nothing saved", day15?.status === 409 && day15.body.code === "PLAN_LIMIT_REACHED" && day15.body.metric === "storage_mb" && day15.body.limit === 0 && Number(sql(`select count(*) from fo_retainer_template where firm_id = '${FIRM_A}'`)) === filesBefore, day15);
  const old = await db.foRetainerTemplate.findFirst({ where: { firmId: FIRM_A, name: "Day one" } });
  const read = old ? await store.get(FIRM_A, old.fileKey) : null;
  ok("PF-15 DW2 pass: on day 15 an old file still reads (nothing deleted or locked), and a retry of a stored key still works", !!read && read.sha256 === old!.fileSha256 && (await store.put(FIRM_A, old!.fileKey, read.bytes, read.contentType)).sha256 === old!.fileSha256);
  ok("PF-15 DW2 fail: firm B is not over: its uploads are never refused by firm A's mark", (await new PgEntitlements(db, () => clock.now()).check(FIRM_B, "storage_mb", 0)).allowed === true);
  // Back under: a higher limit, then the daily job (fake clock past 12:15 Toronto) clears the mark.
  sql(`update platform_plan_limit set limit_value = 25600 where ${STORAGE_A}`);
  await fake.set(new Date(t0 + 15 * 86_400_000 - 3 * 3_600_000));   // 2026-12-05 12:00Z = 07:00 Toronto
  const jobsBefore = jobs.jobs.filter((j) => j.name === STORAGE_DAILY_QUEUE && j.status === "done").length;
  await fake.advance(6 * 3_600_000);                                  // past 12:15 Toronto (17:15Z)
  const ran = jobs.jobs.filter((j) => j.name === STORAGE_DAILY_QUEUE && j.status === "done").length - jobsBefore;
  ok("PF-15 DW2 pass: the daily job runs once a day (fake clock) and clears the mark when back under", ran === 1 && sql(`select (back_under_at is not null)::text from platform_storage_over where firm_id = '${FIRM_A}'`) === "true", { ran, jobs: jobs.jobs.filter((j) => j.name === STORAGE_DAILY_QUEUE).map((j) => [j.status, j.error]) });
  const after = await problemOf(() => svc.uploadTemplate(R, { name: "Back under" }, docx(16)));
  ok("PF-15 DW2 pass: back under → uploads are allowed again", after === null, after);
  // A new episode: over again later → a fresh first day, alerted again (once).
  sql(`update platform_plan_limit set limit_value = 0 where ${STORAGE_A}`);
  await fake.advance(86_400_000);
  ok("PF-15 DW2 pass: over again later is a new episode: the daily job sets a fresh mark and alerts once more", sql(`select (back_under_at is null and first_over_at > to_timestamp(${(t0 + 15 * 86_400_000) / 1000}))::text from platform_storage_over where firm_id = '${FIRM_A}'`) === "true" && toTeam() === 2 && toOwners() === 2 * owners, { team: toTeam(), owners: toOwners() });
  ok("PF-15 DW2 fail: the new episode starts its own 14 days: an upload the next day is allowed", (await problemOf(() => svc.uploadTemplate(R, { name: "New episode" }, docx(17)))) === null);
  ok("PF-15 DW2 pass: every mark change is audited (over, alerted, back under, over, alerted)", audit() === "storage.over,storage.alerted,storage.back_under,storage.over,storage.alerted", audit());
  ok("PF-15 DW2 fail: a storage mark is never deleted", refused(`delete from platform_storage_over where firm_id = '${FIRM_A}'`, /never removed/));
  // Break M1: a failing email never undoes the mark (the 14 days still run); a later measure sends the rest, once.
  {
    let down = true;
    const flaky = fakeMail({ failOn: (m) => down && m.templateKey === "platform.storage_over_limit" });
    const wB = new StorageWatch({ db, files: new LocalFiles(join(WORK, "store")), mail: flaky, now: () => clock.now() });
    sql(`update platform_plan_limit set limit_value = 0 where metric = 'STORAGE_MB' and plan_id = (select id from platform_plan where code = 'solo')`);
    await new LocalFiles(join(WORK, "store")).put(FIRM_B, "b/one.txt", new TextEncoder().encode("firm B's bytes"), "text/plain");
    const markB = () => sql(`select extract(epoch from first_over_at)::text || ':' || (alerted_at is not null)::text || ':' || (back_under_at is null)::text from platform_storage_over where firm_id = '${FIRM_B}'`);
    const failed = await problemOf(() => wB.measure(FIRM_B)), m1 = markB();
    await problemOf(() => wB.measure(FIRM_B));   // a second try (the clock stays: the daily job's own watch has working mail)
    ok("PF-15 DW2 fail (break M1): an Owner email that fails leaves the mark set and its first day unchanged; a second try starts no new episode and sends the team inbox nothing more", failed !== null && m1.endsWith(":false:true") && markB() === m1 && flaky.sent.filter((m) => m.to === TEAM_INBOX_SAMPLE).length === 1, { failed, m1, now: markB(), sent: flaky.sent.length });
    down = false;
    const again = await wB.measure(FIRM_B);
    ok("PF-15 DW2 pass (break M1): once mail works, the next measure sends the Owner email and marks the episode alerted, once", again.alerted && markB().endsWith(":true:true") && flaky.sent.filter((m) => m.templateKey === "platform.storage_over_limit").length >= 1 && !(await wB.measure(FIRM_B)).alerted, { again, mark: markB() });
    sql(`update platform_plan_limit set limit_value = 5120 where metric = 'STORAGE_MB' and plan_id = (select id from platform_plan where code = 'solo')`);
  }
  // Review (merge 4): the day-one emails through the real MessagesMail (its PF-19r rules run before the MessagePort).
  {
    const { MessagesMail } = await import("../api/src/platform/messages/send/mail.ts");
    const got: { class: string; person?: { kind: string; id: string }; address: string }[] = [];
    const rec = { send: async (_tx: unknown, m: { class: string; person?: { kind: string; id: string }; address: string }) => { got.push(m); return { outboxId: crypto.randomUUID(), state: "QUEUED" }; }, dispatch: async () => {} };
    const real = new MessagesMail({ db, messages: rec as never, files: new LocalFiles(join(WORK, "mm")) });
    sql(`update platform_plan_limit set limit_value = 0 where metric = 'STORAGE_MB' and plan_id = (select id from platform_plan where code = 'solo')`);
    sql(`update platform_storage_over set back_under_at = first_over_at where firm_id = '${FIRM_B}'`);
    const r = await new StorageWatch({ db, files: new LocalFiles(join(WORK, "store")), mail: real, now: () => clock.now() }).measure(FIRM_B), ownersB = got.filter((m) => m.class === "SERVICE");
    ok("PF-15 DW2 pass (review, PF-19r): through the real MessagesMail the team inbox gets a transactional email and each Owner a service email naming them (STAFF); the episode is alerted",
      r.alerted && got.some((m) => m.class === "TRANSACTIONAL" && m.address === TEAM_INBOX_SAMPLE) && ownersB.length >= 1 && ownersB.every((m) => m.person?.kind === "STAFF" && !!m.person.id), { r, got });
    sql(`update platform_plan_limit set limit_value = 5120 where metric = 'STORAGE_MB' and plan_id = (select id from platform_plan where code = 'solo')`);
  }
  // Break m2 and m4: a firm the adapter cannot read fails closed for storage too; a retired key keeps its own refusal.
  ok("PF-15 DW2 fail (break m2): storage for a firm the adapter cannot find is refused, never allowed", (await new PgEntitlements(db).check("no-such-firm", "storage_mb", 0)).allowed === false);
  {
    sql(`update platform_plan_limit set limit_value = 0 where ${STORAGE_A}`); sql(`update platform_storage_over set first_over_at = now() - interval '20 days', back_under_at = null where firm_id = '${FIRM_A}'`);
    const kept = await db.foRetainerTemplate.findFirst({ where: { firmId: FIRM_A, name: "Day two" } });
    const bytes = (await store.get(FIRM_A, kept!.fileKey))!.bytes;
    await store.delete(FIRM_A, kept!.fileKey);
    const e = await problemOf(() => store.put(FIRM_A, kept!.fileKey, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).catch((x) => x);
    ok("PF-15 DW2 fail (break m4): while hard, a retired key is refused as FileKeyTaken (not the plan limit)", e?.status === 0 && /already holds other content/.test(String(e.body.error)), e);
    sql(`update platform_plan_limit set limit_value = 25600 where ${STORAGE_A}`);
  }
  sql(`update platform_plan_limit set limit_value = 25600 where ${STORAGE_A}`);

  // Review M1: the same adapter on the walled pool (xr_app), as the API runs it: the case side's key with no platform
  // scope, the platform side's id in the firm's scope, the storage mark in a job's withFirm; and the shared contract.
  const direct = new Db();   // direct mode first (a suite or tool): the bypass role, as check_fo13i's app runs
  ok("PF-15 pass: on the bypass role (direct mode) the definer function answers too", (await new PgEntitlements(direct).limitOf("sample-solo", "active_individual_cases")).limit === 25);
  await direct.$disconnect();
  const walls = await import("../api/src/platform/firm-scope.ts");
  walls.wallUnscopedQueries();
  const walled = new Db();
  try {
    const caseSide = await new PgEntitlements(walled).limitOf("sample-solo", "active_individual_cases");
    ok("PF-15 pass (review M1): walled, no platform scope, the case side's firm key reads its plan's limit (25 Sample cases)", caseSide.limit === 25 && caseSide.planCode === "solo", caseSide);
    ok("PF-15 pass (review M1): walled, the 1st case is allowed and the 26th refused by key", (await new PgEntitlements(walled).check("sample-solo", "active_individual_cases", 0)).allowed && !(await new PgEntitlements(walled).check("sample-solo", "active_individual_cases", 25)).allowed);
    ok("PF-15 fail (review M1): walled, the app still reads no firm table directly with no scope", (await walled.platformFirm.findMany({ select: { id: true } })).length === 0);
    sql(`update platform_storage_over set first_over_at = now() - interval '20 days', back_under_at = null where firm_id = '${FIRM_A}'`); sql(`update platform_plan_limit set limit_value = 0 where ${STORAGE_A}`);
    ok("PF-15 pass (review M1): walled, in firm A's scope its storage reads hard (the mark behind the wall)", await walls.withFirm(FIRM_A, async () => (await new PgEntitlements(walled, () => Date.now()).check(FIRM_A, "storage_mb", 1)).allowed === false));
    const m = await walls.withFirm(FIRM_A, () => new StorageWatch({ db: walled, files: new LocalFiles(join(WORK, "store")), mail, now: () => Date.now() }).measure(FIRM_A));
    ok("PF-15 pass (review M1): walled, a measure in the firm's scope keeps its mark", m.over && m.mark === "kept", m);
    sql(`update platform_plan_limit set limit_value = 25600 where ${STORAGE_A}`);
    await runContract(entitlementPortContract, "PgEntitlements", async (limits, hard) => ({ ...(await realHarness(limits, hard)), port: new PgEntitlements(walled, () => Date.now()) }), (n, c, d) => ok(`${n} (walled)`, c, d));
  } finally { await walled.$disconnect(); }
} catch (e) {
  fail++; console.log(`FAIL  PF-15: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
