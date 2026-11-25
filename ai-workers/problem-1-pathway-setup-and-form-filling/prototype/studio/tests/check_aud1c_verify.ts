// AUD-1c part 2 (map row 97, R1.97; SA-11-4, SA-11-6, AG-13-42, NFR5-08; SA-11 BR-2): the audit chain's checker, its
// alarm and heartbeat, and the firm's integrity read. DW6-DW10, a pass and a fail each. A scratch database (every
// migration, PF-3's Sample firms) and a small Nest app built from PF-4's session classes, the guard and this row's
// controllers; the checker is the feature's own (registered on fakeJobs, so its 30-minute and weekly schedules are run by
// moving the clock). Lines are inserted as the table owner (the insert trigger chains them); tampering switches AUD-1a's
// trigger off in the owner's session, as an attacker with the owner's password could. No browser, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud1c_verify.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud1cv_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 600)}` : ""}`); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other suites
const call = async (base: string, path: string, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController } = await import("../api/src/platform/identity/session/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { useAlerts } = await import("../api/src/platform/observability/alerts.ts");
const { JsonLog, useLog } = await import("../api/src/platform/observability/log.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { FirmAuditIntegrityController } = await import("../api/src/platform/audit/chain/routes.ts");
const { AuditChainVerifier, CHAIN_CHECK_QUEUE, CHAIN_DEEP_QUEUE, HEARTBEAT } = await import("../api/src/platform/audit/chain/verify.ts");
const feature = (await import("../api/src/features/audit-chain.ts")).default;   // the row's own registration

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("aud1cv-check-signing-key-0123456789abcdef", () => clock.now());
const alerts = fakeAlerts(); useAlerts(alerts);
const logged: string[] = []; useLog(new JsonLog((l) => { logged.push(l); }));
const beats = () => logged.filter((l) => l.includes(`"${HEARTBEAT}"`)).length;
const jobClock = new FakeClock(new Date("2026-11-25T10:00:00Z")), jobs = fakeJobs(jobClock);

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: new LocalIdentityAdmin(() => clock.now()) }, { provide: MAIL_PORT, useValue: fakeMail() }, PlatformSession,
    { provide: PlatformJobs, useValue: jobs }, ...feature.providers];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, FirmAuditIntegrityController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  nest.use(requestMiddleware());
  await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const v = nest.get(AuditChainVerifier) as InstanceType<typeof AuditChainVerifier>;

  await seedSampleFirms(db);
  const staff = (actorId: string) => db.platformStaff.findFirstOrThrow({ where: { actorId }, select: { id: true, firmId: true, firm: { select: { key: true } } } });
  const R = await staff("user-R"), O = await staff("user-O"), S = await staff("user-S");
  const A = R.firmId, B = S.firmId;
  const WS = sql(`insert into workspace (id, key, label) values (gen_random_uuid(), 'aud1cv-check', 'AUD-1c checker lines') returning id`).split("\n")[0];
  const DEMO = sql(`insert into workspace (id, key, label) values (gen_random_uuid(), 'demo', 'Demo (check)') on conflict (key) do update set label = excluded.label returning id`).split("\n")[0];
  const add = (firm: string | null, n: number, ws = WS) => { for (let i = 0; i < n; i++) sql(`insert into audit_event (id, workspace_id, actor, action, entity, summary, detail, firm_id) values (gen_random_uuid(), '${ws}', 'system:aud1cv', 'check.line', 'aud1cv', 'Sample line ${i} with private words', '{"note": "private detail ${i}", "n": 1.0}'::jsonb, ${firm ? `'${firm}'` : "null"})`); };
  const owner = (q: string) => sql(`begin; alter table audit_event disable trigger aud_event_no_change; ${q}; alter table audit_event enable trigger aud_event_no_change; commit;`);
  // A third firm for the delete case (its own chain; no staff needed).
  const C = "00000000-0000-4000-8000-0000000a1c0c";   // a firm id with no firm row: audit_event.firm_id has no foreign key
  const headOf = (f: string) => Number(sql(`select coalesce(max(seq), 0) from audit_event where chain_key = '${f}'`));
  const a0 = headOf(A);   // the Sample firms' own lines come first
  const D = "00000000-0000-4000-8000-0000000a1c0d";   // a long chain (break Blocker: seq sorted as text broke every chain of 10+ lines)
  add(A, 6); add(B, 4); add(C, 4); add(null, 3); add(null, 2, DEMO); add(D, 25);
  const F = "00000000-0000-4000-8000-0000000a1c0f"; add(F, 12);   // review Major: a removed tail
  const signIn = async (actorId: string, firmKey: string) => { const r = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) }); return ((await r.json()) as { token: string }).token; };
  const tR = await signIn("user-R", R.firm.key), tO = await signIn("user-O", O.firm.key), tS = await signIn("user-S", S.firm.key);
  const aHead = headOf(A);   // signing in writes lines too

  // ------------------------------------------------------------------- the schedules (the feature's own registration)
  const runs0 = beats();
  await jobClock.advance(31 * 60_000);   // past the next :00 or :30
  const first = jobs.jobs.filter((j) => j.name === CHAIN_CHECK_QUEUE && j.status === "done").length;
  ok("AUD-1c DW10 pass: the feature registers the 30-minute check on the job runner; a run of it writes one heartbeat and every chain is INTACT",
    first >= 1 && beats() - runs0 === first && Number(sql(`select count(*) from aud_chain_check where status = 'INTACT'`)) === Number(sql(`select count(distinct chain_key) from audit_event`)), { first, beats: beats() - runs0 });
  ok("AUD-1c DW10 fail: no deep (weekly) pass ran on a Wednesday half hour", !jobs.jobs.some((j) => j.name === CHAIN_DEEP_QUEUE && j.status === "done"));
  const long1 = await v.pass("incremental"), long2 = await v.pass("full"), dRow = (await v.all()).find((i) => i.chainKey === D);
  ok("AUD-1c DW6 fail (break Blocker): a clean chain of 25 lines is no break, in the 30-minute and the weekly pass (lines read in number order, not text order)",
    !long1.findings.length && !long2.findings.length && dRow?.status === "INTACT" && dRow.verifiedSeq === "25", [long1.findings, long2.findings, dRow]);
  const intactA = await call(base, "/api/platform/audit/integrity", tR);
  ok("AUD-1c DW7 pass: the Owner's integrity read answers the firm's own chain: INTACT, checked, verified to its head",
    intactA.status === 200 && intactA.body.status === "INTACT" && intactA.body.verifiedSeq === String(aHead) && typeof intactA.body.lastCheckedAt === "string", intactA.body);

  // ------------------------------------------------------------------- DW8: only new lines, weekly all
  const again = await v.pass("incremental");
  const chains = again.chains;
  ok("AUD-1c DW8 pass: a second run on unchanged chains reads one line a chain (the verified place) and no older line", again.linesRead === chains && again.findings.length === 0, again);
  add(B, 2);
  const bHead = headOf(B);
  const more = await v.pass("incremental"), full = await v.pass("full"), all = Number(sql(`select count(*) from audit_event`));
  ok("AUD-1c DW8 fail: two new lines on firm B are read (chains + 2), and the weekly pass reads every line from seq 1 (plus each firm and platform chain's verified place)", more.linesRead === chains + 2 && full.linesRead === all + chains - 1, { more: more.linesRead, full: full.linesRead, all });

  // ------------------------------------------------------------------- DW6: a changed line, a removed line
  const raised0 = alerts.raised.length;
  owner(`update audit_event set summary = 'Sample line 2, rewritten' where firm_id = '${A}' and seq = ${a0 + 3}`);
  const inc = await v.pass("incremental");
  ok("AUD-1c DW6 fail: the 30-minute run reads only after the verified place, so a change to an old line waits for the weekly pass (no finding yet)", inc.findings.length === 0, inc.findings);
  const deep = await v.pass("full"), fA = deep.findings.find((f) => f.chainKey === A);
  ok("AUD-1c DW6 pass: the weekly pass reports exactly firm A's chain, from the changed line to its head, as a hash mismatch",
    deep.findings.length === 1 && fA?.fromSeq === String(a0 + 3) && fA.toSeq === String(aHead) && fA.why === "hash", deep.findings);
  owner(`delete from audit_event where firm_id = '${C}' and seq = 2`);
  const gap = await v.pass("full"), fC = gap.findings.find((f) => f.chainKey === C);
  ok("AUD-1c DW6 pass: a line deleted as the owner is reported as a gap on firm C's chain from seq 2", fC?.fromSeq === "2" && fC.why === "gap", gap.findings);
  owner(`delete from audit_event where firm_id = '${B}' and seq = (select max(seq) from audit_event where firm_id = '${B}')`);
  const tail = await v.pass("incremental"), fB = tail.findings.find((f) => f.chainKey === B);
  ok("AUD-1c DW6 pass: the newest verified line removed is found by the 30-minute run (the verified place is missing)", fB?.why === "missing" && fB.fromSeq === String(bHead) && fB.toSeq === String(bHead), tail.findings);

  owner(`delete from audit_event where chain_key = '${F}' and seq > 9`);
  const t1 = await v.pass("full"), t2 = await v.pass("incremental"), t3 = await v.pass("full"), fF = (await v.all()).find((i) => i.chainKey === F);
  ok("AUD-1c DW6 pass (review Major): the newest 3 lines removed are found by the weekly pass too, as the range 10-12, and the chain stays BROKEN on the next passes (never INTACT at a lower seq)",
    t1.findings.find((y) => y.chainKey === F)?.why === "missing" && t1.findings.find((y) => y.chainKey === F)?.fromSeq === "10" && fF?.status === "BROKEN" && fF.failingFromSeq === "10" && fF.failingToSeq === "12" && fF.verifiedSeq === "12"
      && [t2, t3].every((p) => p.findings.some((y) => y.chainKey === F)), [t1.findings, fF]);

  // ------------------------------------------------------------------- DW7: firm walls
  const readA = await call(base, "/api/platform/audit/integrity", tR), readB = await call(base, "/api/platform/audit/integrity", tS);
  ok("AUD-1c DW7 pass: firm A's Owner reads BROKEN with the range from the changed line to the head, after a 30-minute run too",
    readA.body.status === "BROKEN" && readA.body.failingFromSeq === String(a0 + 3) && readA.body.failingToSeq === String(aHead), readA.body);
  const platform = await v.all();
  ok("AUD-1c DW7 fail: firm A's break never marks another chain; the platform chain and every other unbroken chain stay INTACT",
    platform.filter((i) => i.status === "BROKEN").map((i) => i.chainKey).sort().join() === [A, B, C, F].sort().join() && platform.find((i) => i.chainKey === "platform")?.status === "INTACT", platform);
  add(B, 1);   // firm B's own new line after its break: still B's chain only
  await v.pass("incremental"); await v.pass("full");
  const readB2 = await call(base, "/api/platform/audit/integrity", tS);
  ok("AUD-1c DW7 pass: firm B's token gets firm B's chain only (its own range, never A's)", readB.status === 200 && readB.body.status === "BROKEN" && readB.body.failingFromSeq === String(bHead) && readB2.body.failingFromSeq === String(bHead) && readB2.body.status === "BROKEN", [readB.body, readB2.body]);

  // ------------------------------------------------------------------- DW9: ids only, once
  const mine = alerts.raised.slice(raised0);
  const text = JSON.stringify(mine);
  ok("AUD-1c DW9 pass: each alert carries ids and the range only (rule, firm, chain, from, to): no summary, no detail, no actor",
    mine.length === 4 && mine.every((a) => a.kind === "audit_chain_break" && Object.keys(a.detail).every((k) => ["rule", "firmId", "entity", "entityKey", "fromSeq", "toSeq"].includes(k)))
      && !/private|Sample line|rewritten|system:aud1cv/.test(text), mine);
  const before = alerts.raised.length; await v.pass("full"); await v.pass("incremental");
  ok("AUD-1c DW9 fail: the same breaks found again by two more passes raise no new alert", alerts.raised.length === before, alerts.raised.slice(before));

  // ------------------------------------------------------------------- the demo reset restarts a sample chain
  const demoKey = `sample:${DEMO}`;
  sql(`begin; set local app.audit_sample_reset = 'on'; delete from audit_event where workspace_id = '${DEMO}'; commit;`);
  const afterReset = await v.pass("incremental"), demoState = (await v.all()).find((i) => i.chainKey === demoKey);
  ok("AUD-1c DW6 fail: the demo reset's restart of a sample chain is not a break (re-read from seq 1, INTACT at its restart line)",
    !afterReset.findings.some((f) => f.chainKey === demoKey) && demoState?.status === "INTACT" && demoState.verifiedSeq === "1", [afterReset.findings, demoState]);

  // ------------------------------------------------------------------- break M3: one bad check row stops nothing
  sql(`insert into aud_chain_check (chain_key, verified_seq) values ('0 not a chain', 5)`);
  const m3b = beats(), m3a = alerts.raised.length;
  owner(`update audit_event set summary = 'changed during M3' where chain_key = '${D}' and seq = 4`);
  let m3threw = false; try { await v.pass("full"); } catch { m3threw = true; }
  const dState = (await v.all()).find((i) => i.chainKey === D);
  ok("AUD-1c DW10 fail (break M3): a check row whose key is no chain's fails the pass (no heartbeat), yet every other chain is checked: firm D's new break is found and raised",
    m3threw && beats() === m3b && dState?.status === "BROKEN" && dState.failingFromSeq === "4" && alerts.raised.length === m3a + 1, { m3threw, dState, alerts: alerts.raised.slice(m3a) });
  sql(`delete from aud_chain_check where chain_key = '0 not a chain'`);

  // ------------------------------------------------------------------- DW10: heartbeat and the key
  const beat0 = beats();
  const broken = new AuditChainVerifier({ db: { $queryRaw: () => Promise.reject(new Error("database gone")), $transaction: () => Promise.reject(new Error("database gone")) } as never, alerts, now: () => new Date() });
  let threw = false; try { await broken.pass("incremental"); } catch { threw = true; }
  await v.pass("incremental");
  ok("AUD-1c DW10 pass/fail: a completed pass writes one audit.chain_verify_ok line (valid EMF), a pass that fails writes none",
    threw && beats() - beat0 === 1 && logged.filter((l) => l.includes(`"${HEARTBEAT}"`)).every((l) => /"Namespace":"ExpatReady\/Studio"/.test(l)), { threw, beats: beats() - beat0 });
  const officer = await call(base, "/api/platform/audit/integrity", tO), nobody = await call(base, "/api/platform/audit/integrity");
  ok("AUD-1c DW10 fail: a Case Officer without agent/audit:read → 403; no token → 401", officer.status === 403 && nobody.status === 401, [officer.status, nobody.status]);
} finally {
  await app?.close(); await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
