// PF-11c part 1 (R1.105; SA-2-7, SA-2-21, SA-11 BR-1, BR-7, BR-8; contracts §7 "Firm exit") and AUD-2's write-once archive
// port: day 90, the firm is closed, archived first, nothing deleted, and deleting inside a keep period refused. A pass and a
// fail per line. A scratch database (removed), the Sample firms, a fake clock, fake mail, the fake archive and alerts; the
// hold is PF-5's firm.payment_hold event and its notices are PF-5's sweep. No server, no browser, no model call (US$0).
//   tsx studio/tests/check_pf11c_close.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";
import { ArchiveKeyExists, ArchiveRetained, fakeAuditArchive, sha256Of } from "../ports/audit-archive.ts";
import { FakeClock } from "../ports/clock.ts";
import { EVENT } from "../ports/events.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { ACTIVITY_LOG_YEARS } from "../ports/keep-period.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf11c_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => { try { return execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch (e) { throw new Error(`psql: ${String((e as { stderr?: unknown }).stderr ?? e).trim()}`); } };
const sqlFails = (q: string) => { try { sql(q); return false; } catch { return true; } };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const refusedWith = async (fn: () => Promise<unknown>, cls: new (...a: never[]) => Error) => { try { await fn(); return false; } catch (e) { return e instanceof cls; } };

execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ExitNotices } = await import("../api/src/platform/billing/exit-notices.ts");
const { exitClock } = await import("../api/src/platform/billing/exit-clock.ts");
const { ARCHIVE_YEARS, CLOSED_ACTION, CLOSURE_CRON, CLOSURE_QUEUE, CLOSURE_ZONE, FIRM_CLOSED_REASON, FirmClosure, HELD_ACTION, addYears, archiveKeyOf } = await import("../api/src/platform/firm-closure/closure.ts");
const { bypassUses, withFirm } = await import("../api/src/platform/firm-scope.ts");
const { PgLegalHolds } = await import("../api/src/platform/register/holds/adapter.ts");
const { PlatformIdentity, FIRM_CLOSED } = await import("../api/src/platform/identity/service.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const closureFeature = (await import("../api/src/features/platform-firm-closure.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const DAY = 86_400_000, T0 = new Date("2026-12-01T15:00:00Z"), at = (d: number, h = 1) => new Date(T0.getTime() + d * DAY + h * 3_600_000);
const fake = new FakeClock(T0.toISOString());
// The store's clock runs 25 ms ahead of the job's (break M2: on real clocks the store writes a little after the job starts).
const mail = fakeMail(), alerts = fakeAlerts(), archive = fakeAuditArchive(() => new Date(fake.now().getTime() + 25));
const notices = new ExitNotices({ db, mail, audit: auditEvent, now: () => fake.now(), appUrl: "https://app.example.test" });
const deps = { db, audit: auditEvent, archive, holds: new PgLegalHolds(), alerts: () => alerts, now: () => fake.now() };
const closure = new FirmClosure(deps);
const firmOf = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
const statusOf = (firm: string) => sql(`select status from platform_firm where id = '${firm}'`);
const hold = (firm: string, when: Date) => { sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${firm}'`); sql(`insert into module_event (id, firm_id, type, subject_id, payload, occurred_at) values (gen_random_uuid(), '${firm}', '${EVENT.FIRM_PAYMENT_HOLD}', '${firm}', '{"firmId":"${firm}","reason":"stripe unpaid"}', '${when.toISOString()}')`); };
const allLines = (firm: string) => Number(sql(`select count(*) from audit_event where firm_id = '${firm}'`));
const lines = (firm: string, action: string) => Number(sql(`select count(*) from audit_event where firm_id = '${firm}' and action = '${action}'`));
const alertsFor = (firm: string, rule: string) => alerts.raised.filter((a) => a.kind === "firm_closure_blocked" && a.detail.firmId === firm && a.detail.rule === rule).length;
/** Every table with a firm_id column: the firm's row count in each (the "nothing deleted" check). */
const firmTables = () => sql(`select c.table_name from information_schema.columns c join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema where c.table_schema = 'public' and c.column_name = 'firm_id' and t.table_type = 'BASE TABLE' order by 1`).split("\n").filter(Boolean);
const countsOf = (firm: string) => Object.fromEntries(firmTables().map((t) => [t, Number(sql(`select count(*) from "${t}" where firm_id = '${firm}'`))]));
const run = async <T,>(fn: () => Promise<T>, d: number, h = 1): Promise<T> => { await fake.set(at(d, h)); return fn(); };

try {
  await seedSampleFirms(db);
  const A = firmOf("sample-firm"), B = firmOf("sample-solo");

  // ------------------------------------------------------------------------- AUD-2's write-once archive (the port's rules)
  {
    const c = new FakeClock("2026-01-01T00:00:00Z"), ar = fakeAuditArchive(() => c.now());
    const until = addYears(c.now(), ACTIVITY_LOG_YEARS), bytes = Buffer.from("line one\n");
    const { sha256 } = await ar.put("audit/test/one.jsonl", bytes, until);
    const got = await ar.get("audit/test/one.jsonl");
    ok("AUD-2 pass: put then get returns the bytes, their sha256 and the keep-until date", got?.bytes.equals(bytes) && got.sha256 === sha256 && sha256 === sha256Of(bytes) && got.retainUntil.getTime() === until.getTime(), got);
    const again = await refusedWith(() => ar.put("audit/test/one.jsonl", Buffer.from("replaced\n"), until), ArchiveKeyExists);
    ok("AUD-2 fail: a key already written is refused (ArchiveKeyExists), never replaced", again && (await ar.get("audit/test/one.jsonl"))?.bytes.toString() === "line one\n");
    const early = await refusedWith(() => ar.remove("audit/test/one.jsonl"), ArchiveRetained);
    await c.set(new Date(until.getTime() - 1000)); const lastSecond = await refusedWith(() => ar.remove("audit/test/one.jsonl"), ArchiveRetained);
    ok("AUD-2 fail: deleting inside the keep period is refused (ArchiveRetained), on day one and one second before it ends; the object stays", early && lastSecond && (await ar.get("audit/test/one.jsonl")) !== null);
    await c.set(new Date(until.getTime() + 1000)); await ar.remove("audit/test/one.jsonl");
    ok("AUD-2 pass: after its keep period the object can be removed", (await ar.get("audit/test/one.jsonl")) === null);
    const badKeys = await Promise.all(["../x", "/abs", "Firms/UPPER", "a//b", "a/../b"].map((k) => refusedWith(() => ar.put(k, bytes, addYears(c.now(), 1)), Error)));
    ok("AUD-2 fail: a key with '..', a leading '/', upper case or an empty segment is refused", badKeys.every(Boolean), badKeys);
    ok("AUD-2 pass: list(prefix) returns the keys under a prefix, sorted", (await ar.put("audit/x/b.jsonl", bytes, addYears(c.now(), 1)), await ar.put("audit/x/a.jsonl", bytes, addYears(c.now(), 1)), (await ar.list("audit/x/")).join()) === "audit/x/a.jsonl,audit/x/b.jsonl");
    const past = await refusedWith(() => ar.put("audit/test/past.jsonl", bytes, new Date(c.now().getTime() - 1000)), RangeError);
    const nowOnly = await refusedWith(() => ar.put("audit/test/now.jsonl", bytes, c.now()), RangeError);
    ok("AUD-2 fail (break m2): a keep-until date in the past, or now, is refused", past && nowOnly && (await ar.list("audit/test/")).length === 0);
    ok("AUD-2 fail (break m3): the fake exposes no map of its objects (only its four calls reach them)", !("objects" in ar));
    ok("AUD-5 pass: the archive copy is kept for the longest floor of the keep-period table (the activity log's 7 years)", ARCHIVE_YEARS === 7 && ARCHIVE_YEARS === ACTIVITY_LOG_YEARS);
  }

  // ------------------------------------------------------------------------------------------- the job and the feature
  {
    const jc = new FakeClock("2026-12-01T05:00:00Z"), jobs = fakeJobs(jc);
    await new FirmClosure({ ...deps, now: () => jc.now() }).register(jobs);
    await jc.set("2026-12-01T12:20:00Z"); const early = jobs.jobs.filter((j) => j.name === CLOSURE_QUEUE).length;
    await jc.set("2026-12-01T12:40:00Z"); const first = jobs.jobs.filter((j) => j.name === CLOSURE_QUEUE).length;
    ok("job pass: the close runs daily on PF-14's runner at 07:30 Toronto", CLOSURE_CRON === "30 7 * * *" && CLOSURE_ZONE === "America/Toronto" && early === 0 && first === 1, { early, first });
    const use = bypassUses()[`job:${CLOSURE_QUEUE}`];
    ok("job fail: its bypass use is declared beside it (P-785 (2)), outside a request only, audited per firm", use?.outside === true && use.audit === "per-firm" && use.routes.length === 0, use);
    const p = (closureFeature.providers ?? []) as { provide?: unknown; inject?: unknown[] }[];
    ok("feature pass: platform-firm-closure.ts registers FirmClosure (legal holds, PF-14's runner, the archive when one is wired) and no route", p.length === 1 && p[0].provide === FirmClosure && (p[0].inject?.length ?? 0) === 5 && !("controllers" in closureFeature));
  }

  // ------------------------------------------------------------------------- the clock: day 0 to day 89, nothing happens
  hold(A, T0); hold(B, T0);
  for (const d of [0, 16, 46, 83]) await run(() => withFirm(A, () => notices.runFirm(A)), d);   // firm A gets every notice; B none
  const clockA = (await exitClock(db, A))!;
  ok("setup: firm A is on payment hold with its four notices sent (days 0, 16, 46, 83); firm B on hold with none", clockA.noticesSent.map((n) => n.day).join() === "0,16,46,83" && (await exitClock(db, B))!.noticesSent.length === 0, clockA.noticesSent);
  const before = countsOf(A), beforeB = countsOf(B), auditBefore = allLines(A);
  const day89 = await run(() => withFirm(A, () => closure.runFirm(A)), 89, 23);
  ok("day 89 pass: nothing happens: the firm stays on payment hold, nothing is archived, no alert", day89.state === "not_due" && statusOf(A) === "PAYMENT_HOLD" && (await archive.list("")).length === 0 && alerts.raised.length === 0, day89);

  // ------------------------------------------------------------------------- day 90, but the conditions are not met
  {
    const r = await run(() => withFirm(B, () => closure.runFirm(B)), 90, 2);
    ok("day 90 fail: a firm whose notices were not all sent is not closed; it waits and raises firm_closure_blocked", r.state === "blocked" && statusOf(B) === "PAYMENT_HOLD" && alertsFor(B, "PF-11c.notices_missing") === 1 && (await archive.list(`firms/${B}/`)).length === 0, r);
    const none = await withFirm(A, () => new FirmClosure({ ...deps, archive: null }).runFirm(A));
    ok("day 90 fail: with no write-once archive wired nothing is closed (archive first): blocked, alert raised", none.state === "blocked" && statusOf(A) === "PAYMENT_HOLD" && alertsFor(A, "PF-11c.no_archive") === 1 && lines(A, CLOSED_ACTION) === 0, none);
    archive.failPut = true;
    const broken = await withFirm(A, () => closure.runFirm(A));
    archive.failPut = false;
    ok("day 90 fail: an archive write that fails closes nothing: the firm stays on hold, no session ends, alert raised", broken.state === "blocked" && statusOf(A) === "PAYMENT_HOLD" && alertsFor(A, "PF-11c.archive_write_failed") === 1 && Number(sql(`select count(*) from platform_session_revocation where firm_id = '${A}' and reason = '${FIRM_CLOSED_REASON}'`)) === 0 && (await archive.list("")).length === 0, broken);
    const noHolds = await withFirm(A, () => new FirmClosure({ ...deps, holds: null }).runFirm(A));
    ok("day 90 fail: with no legal-hold check wired nothing is closed (BR-7: the hold is asked first)", noHolds.state === "blocked" && statusOf(A) === "PAYMENT_HOLD" && alertsFor(A, "PF-11c.no_hold_check") === 1, noHolds);
  }

  // ------------------------------------------------------------------------- a legal hold stops it; released, it runs
  const holdId = sql(`insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by) values (gen_random_uuid(), '${A}', 'FIRM', 'A court order (Sample)', 'staff:platform-owner') returning id`).split("\n")[0];
  {
    const h1 = await withFirm(A, () => closure.runFirm(A)), h2 = await withFirm(A, () => closure.runFirm(A));
    ok("hold fail: a legal hold on the firm stops the close: nothing archived, the firm stays on hold, one firm.closure_held line a day (run twice)", h1.state === "held" && h2.state === "held" && statusOf(A) === "PAYMENT_HOLD" && (await archive.list("")).length === 0 && lines(A, HELD_ACTION) === 1, { h1, h2, held: lines(A, HELD_ACTION) });
    sql(`update plat_legal_hold set released_at = now(), released_by = 'staff:platform-owner', release_reason = 'Order lifted (Sample)' where id = '${holdId}'`);
  }

  // ------------------------------------------------------------------------- a copy that is not the firm's whole log (break M1)
  {
    const lying = { ...archive, get: async (k: string) => { const o = await archive.get(k); return o && { ...o, bytes: o.bytes.subarray(0, 200) }; } };
    const partial = await withFirm(A, () => new FirmClosure({ ...deps, archive: lying }).runFirm(A));
    ok("M1 fail: a copy that does not read back byte for byte (a partial copy) closes nothing: blocked, alert raised", partial.state === "blocked" && partial.rule === "PF-11c.archive_unreadable" && statusOf(A) === "PAYMENT_HOLD" && alertsFor(A, "PF-11c.archive_unreadable") === 1 && lines(A, CLOSED_ACTION) === 0, partial);
    const ws = sql(`select workspace_id from audit_event where firm_id = '${A}' limit 1`);
    const late = { ...archive, put: async (k: string, b: Buffer, u: Date) => { const r = await archive.put(k, b, u); sql(`insert into audit_event (id, workspace_id, actor, action, entity, summary, firm_id) values (gen_random_uuid(), '${ws}', 'system:pf11c-check', 'pf11c.check.late_line', 'platform_firm', 'a line written after the copy', '${A}')`); return r; } };
    const stale = await withFirm(A, () => new FirmClosure({ ...deps, archive: late }).runFirm(A));
    ok("M1 fail: a line written after the copy (the copy is stale) closes nothing; the next run writes a new copy", stale.state === "changed" && statusOf(A) === "PAYMENT_HOLD" && lines(A, CLOSED_ACTION) === 0, stale);
  }

  // ------------------------------------------------------------------------- day 90 (after the release): the close
  const staffA = sql(`select id from platform_staff where firm_id = '${A}' order by id`).split("\n").filter(Boolean);
  const closedAt = at(91, 2);
  const r = await run(() => withFirm(A, () => closure.runFirm(A)), 91, 2);
  const key = r.state === "closed" ? r.archiveKey : "", copy = key ? await archive.get(key) : null;
  ok("close pass: after the hold is released the next run closes the firm (status DELETED, read as closed)", r.state === "closed" && statusOf(A) === "DELETED", r);
  ok("archive first pass: the copy is in the write-once archive under firms/<firm>/closure-<hold>-<run time>.jsonl (a fresh key each run), with the store's clock 25 ms ahead (M2), kept 7 years", copy !== null && r.state === "closed" && key.startsWith(archiveKeyOf(A, clockA.holdSeq, closedAt, "").slice(0, -".jsonl".length)) && /-[0-9a-f]{8}\.jsonl$/.test(key) && Math.abs(copy.writtenAt.getTime() - closedAt.getTime()) < 1000 && copy.retainUntil.getTime() === addYears(closedAt, 7).getTime(), copy && { key, writtenAt: copy.writtenAt, until: copy.retainUntil });
  {
    const rows = copy!.bytes.toString("utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const head = rows[0] as { kind: string; firmId: string; auditLines: number; firm: { id: string } };
    const body = rows.slice(1);
    ok("archive pass: the copy names the firm and holds every one of its activity-log lines at the time it was written", head.kind === "firm-closure-archive" && head.firmId === A && head.firm.id === A && body.length === head.auditLines && head.auditLines >= auditBefore && body.every((l) => l.kind === "audit_event" && l.firmId === A) && body.some((l) => l.action === "pf11c.check.late_line"), { head: { ...head, firm: undefined }, n: body.length, auditBefore });
    ok("archive fail: the copy holds no line of firm B", !copy!.bytes.toString("utf8").includes(B));
    const closedLine = sql(`select detail::text from audit_event where firm_id = '${A}' and action = '${CLOSED_ACTION}'`);
    const d = JSON.parse(closedLine) as { archiveKey: string; sha256: string; keepUntil: string };
    ok("close pass: one firm.closed line names the archive key, its sha256 and its keep-until date", lines(A, CLOSED_ACTION) === 1 && d.archiveKey === key && d.sha256 === copy!.sha256 && d.keepUntil === copy!.retainUntil.toISOString(), d);
  }
  {
    const revs = sql(`select staff_id from platform_session_revocation where firm_id = '${A}' and reason = '${FIRM_CLOSED_REASON}' order by staff_id`).split("\n").filter(Boolean);
    ok("sessions pass: every staff session of the firm is ended (a revocation per staff member)", staffA.length > 0 && revs.join() === staffA.join(), { staffA, revs });
    const local = new LocalIdentity("pf11c-check-signing-key-0123456789abcdef", () => Date.now());
    const identity = new PlatformIdentity(db, local, { now: () => Date.now() });
    const fresh = local.issue(staffA[0], { authTimeMs: Date.now(), secondStep: true });
    let refused: { status?: number; code?: string; detail?: string } = {};
    try { await identity.authenticate(fresh); } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => { code?: string; detail?: string } }; refused = { status: x.getStatus?.(), code: x.getResponse?.().code, detail: x.getResponse?.().detail }; }
    ok("sign-in fail: a new sign-in to the closed firm is refused (401 FIRM_CLOSED, in plain words)", refused.status === 401 && refused.code === "FIRM_CLOSED" && refused.detail === FIRM_CLOSED, refused);
    const staffB = sql(`select s.id from platform_staff s where s.firm_id = '${B}' and s.status = 'ACTIVE' order by s.id limit 1`);
    const ctxB = await identity.authenticate(local.issue(staffB, { authTimeMs: Date.now(), secondStep: true })).catch((e) => e as Error);
    const local2 = await identity.localSignIn({ firmKey: "sample-firm", actorId: staffA[0] }).then(() => ({}), (e) => { const x = e as { getStatus?: () => number; getResponse?: () => { code?: string } }; return { status: x.getStatus?.(), code: x.getResponse?.().code }; });
    ok("sign-in fail (break m1): the local sign-in door issues no token for the closed firm", (local2 as { code?: string }).code === "FIRM_CLOSED", local2);
    const token = randomBytes(32).toString("base64url"), staffBefore = Number(sql(`select count(*) from platform_staff where firm_id = '${A}'`));
    sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, expires_at) values (gen_random_uuid(), '${A}', 'late.invitee@example.test', '{CASE_OFFICER}', encode(sha256('${token}'::bytea), 'hex'), 'staff:${staffA[0]}', now() + interval '48 hours')`);
    const session = new PlatformSession(db, {} as never, mail, { now: () => Date.now() }, identity);
    const acc = await session.accept(token).then(() => ({}), (e) => { const x = e as { getStatus?: () => number; getResponse?: () => { code?: string } }; return { status: x.getStatus?.(), code: x.getResponse?.().code }; });
    ok("invitation fail (break M3): a pending invitation of the closed firm cannot be accepted (410); no staff member is added", (acc as { status?: number }).status === 410 && (acc as { code?: string }).code === "INVITATION_NOT_VALID" && Number(sql(`select count(*) from platform_staff where firm_id = '${A}'`)) === staffBefore, acc);
    ok("sign-in pass: firm B's staff still sign in", !(ctxB instanceof Error) && ctxB.firmId === B, ctxB instanceof Error ? ctxB.message : ctxB.firmId);
  }

  // ------------------------------------------------------------------------- nothing deleted; deleting inside a keep period refused
  {
    const after = countsOf(A);
    const shrunk = Object.keys(before).filter((t) => (after[t] ?? 0) < before[t]);
    ok("nothing deleted pass: no table holds fewer of the firm's rows after the close (live data stays until part 2's purge)", shrunk.length === 0 && Object.keys(before).length > 10, { shrunk, tables: Object.keys(before).length });
    ok("audit pass: every audit line of the firm remains, and more were added (BR-1, BR-8)", allLines(A) > auditBefore && allLines(A) >= auditBefore + 2);
    ok("keep period fail: deleting the firm's activity log is refused by the database (append-only, AUD-1a)", sqlFails(`delete from audit_event where firm_id = '${A}'`) && lines(A, CLOSED_ACTION) === 1);
    await fake.set(at(92)); const day1 = await refusedWith(() => archive.remove(key), ArchiveRetained);
    await fake.set(new Date(copy!.retainUntil.getTime() - DAY)); const lastDay = await refusedWith(() => archive.remove(key), ArchiveRetained);
    ok("keep period fail: deleting the archive copy inside its 7 years is refused (the day after the close and the last day); it stays", day1 && lastDay && (await archive.get(key)) !== null);
    const putAgain = await refusedWith(() => archive.put(key, Buffer.from("{}\n"), addYears(fake.now(), 1)), ArchiveKeyExists);
    ok("keep period fail: the copy cannot be replaced with a shorter keep period", putAgain && (await archive.get(key))!.retainUntil.getTime() === copy!.retainUntil.getTime());
    const afterB = countsOf(B);
    ok("firm B pass: firm B is untouched (still on hold, no archive copy, no row fewer)", statusOf(B) === "PAYMENT_HOLD" && (await archive.list(`firms/${B}/`)).length === 0 && Object.keys(beforeB).every((t) => (afterB[t] ?? 0) >= beforeB[t]));
  }

  // ------------------------------------------------------------------------- run twice, the same day and later
  {
    await fake.set(at(91, 5));
    const puts = (await archive.list("")).length, closedLines = lines(A, CLOSED_ACTION), revs = Number(sql(`select count(*) from platform_session_revocation where firm_id = '${A}'`));
    const again = await withFirm(A, () => closure.runFirm(A));
    const swept = await closure.sweep();
    ok("twice pass: the job run again the same day does nothing (no second copy, line or revocation; the sweep lists only firm B)", again.state === "not_due" && (await archive.list("")).length === puts && lines(A, CLOSED_ACTION) === closedLines && Number(sql(`select count(*) from platform_session_revocation where firm_id = '${A}'`)) === revs && swept.closed === 0 && swept.blocked === 1, { again, swept });
  }

  // ------------------------------------------------------------------------- a hold that ends before day 90 closes nothing
  {
    sql(`update platform_firm set status = 'ACTIVE' where id = '${B}'`);
    const paid = await run(() => withFirm(B, () => closure.runFirm(B)), 120);
    ok("paid fail: a firm whose hold ended (paid, ACTIVE) has no clock and is never closed", paid.state === "not_due" && statusOf(B) === "ACTIVE", paid);
  }
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await db.$disconnect().catch(() => undefined);
  try { execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the sweep */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
