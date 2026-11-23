// AUD-5 part 1 (R1.105; brief build-lead-c-briefs/AUD-5-1.md): keep periods as data. Every named case, a pass and a fail
// each: DW1 the table (one activity-log constant, a source on every row, the College row a cited REFERENCE never used by
// check()), DW2 the firm's number (permission, range, one audit line, the below-6 warning and reason), DW3 not set and
// firm walls, DW4 the read's words, DW5 the port contract (fake and real adapter). A scratch database and a Nest app of
// PF-4's guard and this row's classes with the local stand-in sign-in. No network, US$0.
//   tsx studio/tests/check_aud5_keep_periods.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { keepPeriodPortContract, type KeepPeriodHarness } from "../ports/contracts/keep-period-port.contract.ts";
import {
  ACTIVITY_LOG_WORDS, ACTIVITY_LOG_YEARS, COLLEGE_CITATION, COLLEGE_CLIENT_FILE_YEARS, KEEP_PERIODS, KeepCheckNotBuilt, checkableRows, fakeKeepPeriods,
} from "../ports/keep-period.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud5_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };

type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

// ---------------------------------------------------------------------------------------------- DW1: the table (no db)
const row = (c: string) => KEEP_PERIODS.find((r) => r.class === c)!;
ok("AUD-5 DW1 pass: the activity-log number is 7, one constant, and the table's activity-log row is that constant", ACTIVITY_LOG_YEARS === 7 && row("activity_log").years === ACTIVITY_LOG_YEARS && row("activity_log").kind === "FLOOR");
const srcPort = readFileSync(join(STUDIO, "ports", "keep-period.ts"), "utf8");
ok("AUD-5 DW1 fail: no second activity-log number is written in the table (the row names the constant, not a literal 7)", /class: "activity_log", years: ACTIVITY_LOG_YEARS,/.test(srcPort) && (srcPort.match(/ACTIVITY_LOG_YEARS = /g) ?? []).length === 1);
ok("AUD-5 DW1 pass: every row names a source and plain words", KEEP_PERIODS.length === 7 && KEEP_PERIODS.every((r) => r.sources.length > 0 && r.sources.every((s) => s.trim()) && r.words.trim()));
ok("AUD-5 DW1 fail: the table is frozen (a caller cannot change a number at run time)", await throwsLike(() => { (row("activity_log") as { years: unknown }).years = 1; }, () => true) && row("activity_log").years === 7);
const college = row("college_client_file");
ok("AUD-5 DW1 pass: the College row is REFERENCE, 6 years from closing, cites s. 7.2 with page, quote and date, and is marked \"Unconfirmed: no counsel\"",
  college.kind === "REFERENCE" && college.years === 6 && college.from === "closedAt" && college.citation?.section === "s. 7.2" && college.citation.page === "page 7 of 9"
  && college.citation.quote === "A Client File shall be retained in a secure and accessible location for a minimum of six (6) years after the File has been closed."
  && college.citation.read === "2026-11-16" && college.citation.version.startsWith("2021-001") && college.unconfirmed === "Unconfirmed: no counsel" && college.sources.includes("P-607 S3 Q10"), college);
ok("AUD-5 DW1 fail: the College row is not labelled \"needs the citation\" any more (the citation is in the repository)", !JSON.stringify(college).includes("needs the citation"));
ok("AUD-5 DW1 pass: the firm's closed-file row is the firm's setting, a REMINDER from closing", row("closed_client_file").years === "FIRM_SETTING" && row("closed_client_file").kind === "REMINDER" && row("closed_client_file").from === "closedAt");
ok("AUD-5 DW1 pass: billing records start at the fiscal year's end (SA4-D18), breach records 7 years (SA-11-14, the newer text)", row("our_billing").from === "fiscalYearEnd" && row("our_billing").years === 6 && row("breach_record").years === 7 && row("client_financial").years === 7);
ok("AUD-5 DW1 fail: the rows check() may use leave the College row out (its number plays no part)", checkableRows().length === 6 && !checkableRows().some((r) => r.class === "college_client_file" || r.kind === "REFERENCE"));
const srcSvc = readFileSync(join(STUDIO, "api", "src", "platform", "keep-period", "service.ts"), "utf8");
const checkBodies = [/async check\(\) \{[^\n]*\}/.exec(srcPort)?.[0] ?? "", /async check\([^)]*\)[^{]*\{[^\n]*\}/.exec(srcSvc)?.[0] ?? ""];
ok("AUD-5 DW1 fail: check() (fake and adapter) refuses until part 2 and never names the College number",
  checkBodies.every((b) => b.includes("KeepCheckNotBuilt") && !/COLLEGE/.test(b)) && await throwsLike(() => fakeKeepPeriods().check(null, { firmId: "0c0c0c0c-0000-4000-8000-0000000000a1", class: "closed_client_file", startedAt: new Date(0), subject: "x" }), (e) => e instanceof KeepCheckNotBuilt), checkBodies);

// --------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms, seedSampleSettings, SAMPLE_SETTING_VALUES } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleOnStart } = await import("../api/src/platform/identity/sample-seed.ts");
const { resetSampleFirmSettings } = await import("../api/src/platform/identity/demo-reset.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { KeepPeriods, CLOSED_CLIENT_FILES } = await import("../api/src/platform/keep-period/service.ts");
const { KeepPeriodController } = await import("../api/src/platform/keep-period/routes.ts");
const feature = (await import("../api/src/features/platform-keep-period.ts")).default;
const { readSetting, writeSetting } = await import("../api/src/platform/settings.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("aud5-check-signing-key-0123456789abcdef", () => clock.now());
const KEY = CLOSED_CLIENT_FILES.key;

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, KeepPeriods];
  @Module({ controllers: [PlatformIdentityController, KeepPeriodController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers the keep-period controller and its service", feature.controllers.length === 1 && feature.controllers[0] === KeepPeriodController && (feature.providers as unknown[]).includes(KeepPeriods));

  await seedSampleFirms(db);
  ok("AUD-5 fail (seed): PF-3's seed alone stores no setting value (check_pf3 unchanged)", sql(`select count(*) from platform_firm_setting`) === "0");
  await seedSampleSettings(db);
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  const FIRM_B = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } })).id;
  const lines = () => Number(sql(`select count(*) from audit_event where entity = 'platform_firm_setting' and entity_key like '%:${KEY}'`));
  ok("AUD-5 pass (seed): each Sample firm is seeded with the Sample value 6 years, through the settings write path (one audit line each)",
    SAMPLE_SETTING_VALUES[KEY] === 6 && await readSetting(db, FIRM_A, KEY) === 6 && await readSetting(db, FIRM_B, KEY) === 6 && lines() === 2
    && sql(`select count(*) from audit_event where entity_key like '%:${KEY}' and actor = 'seed:AUD-5' and detail->>'reason' = 'Sample value'`) === "2");
  await seedSampleFirms(db); await seedSampleSettings(db);
  ok("AUD-5 fail (seed): a second seed writes nothing (no second line, the value kept)", lines() === 2 && await readSetting(db, FIRM_A, KEY) === 6);

  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tR = await signIn("user-R"), tO = await signIn("user-O"), tS = await signIn("user-S", "sample-solo");
  const put = (token: string | undefined, body: unknown) => call(base, "PUT", "/api/platform/keep-periods/closed-client-files", { token, body });
  const get = (token: string) => call(base, "GET", "/api/platform/keep-periods", { token });

  // ------------------------------------------------------------------------------------------ DW2: the firm's number
  let before = lines();
  const byO = await put(tO, { years: 9 });
  ok("AUD-5 DW2 fail: an Agent without agent/legal-settings:manage (the Case Officer) → 403 MISSING_PERMISSION, nothing saved, no line",
    byO.status === 403 && byO.body.code === "MISSING_PERMISSION" && await readSetting(db, FIRM_A, KEY) === 6 && lines() === before, byO.body);
  ok("AUD-5 DW2 fail: no session → 401", (await put(undefined, { years: 9 })).status === 401 && await readSetting(db, FIRM_A, KEY) === 6);
  const byR = await put(tR, { years: 8 });
  ok("AUD-5 DW2 pass: the Owner saves 8 → saved, read back by forFirm, one audit line (who, from 6 to 8)",
    byR.status === 200 && byR.body.years === 8 && byR.body.saved === true && (await new KeepPeriods(db).forFirm(FIRM_A)).closedClientFilesYears === 8 && lines() === before + 1
    && sql(`select (detail->>'from') || '>' || (detail->>'to') || '|' || actor from audit_event where entity_key = '${FIRM_A}:${KEY}' order by at desc, id desc limit 1`).startsWith("6>8|staff:"), byR.body);
  before = lines();
  const bad = await Promise.all([0, 51, -1, 1000, 6.5, "6.5", "6", null, true].map((years) => put(tR, { years })));
  ok("AUD-5 DW2 fail: 0, 51, -1, 1000, 6.5, \"6.5\", \"6\", null and true → 400 in words, nothing saved",
    bad.every((b) => b.status === 422 && b.body.code === "INVALID_YEARS" && /whole number of years from 1 to 50/.test(b.body.detail)) && await readSetting(db, FIRM_A, KEY) === 8 && lines() === before, bad.map((b) => b.status));
  const odd = await Promise.all([put(tR, { years: 9, firmId: FIRM_B }), put(tR, {}), put(tR, { years: 4, reason: 42 })]);
  ok("AUD-5 DW2 fail: a body naming a firm, a body without years, a reason that is not text → 400, nothing saved anywhere",
    odd.every((b) => b.status === 422) && await readSetting(db, FIRM_A, KEY) === 8 && await readSetting(db, FIRM_B, KEY) === 6 && lines() === before, odd.map((b) => b.body.code));
  // The below-6 warning (Build Lead C's ruling: allowed with a warning that names s. 7.2 and a typed reason).
  const noReason = await Promise.all([put(tR, { years: 5 }), put(tR, { years: 5, reason: "   " })]);
  ok("AUD-5 DW2 fail: saving 5 without a reason (or with an empty one) is refused in words naming s. 7.2; nothing saved",
    noReason.every((b) => b.status === 422 && b.body.code === "REASON_NEEDED" && /s\. 7\.2/.test(b.body.detail) && /Give a reason/.test(b.body.detail)) && await readSetting(db, FIRM_A, KEY) === 8 && lines() === before, noReason.map((b) => b.body));
  ok("AUD-5 DW2 fail: a reason over 500 characters is refused", (await put(tR, { years: 5, reason: "x".repeat(501) })).status === 422 && lines() === before);
  const oddReasons = await Promise.all(["\u200b", "\u00ad\u2060", "\u3164", "a\u0000b", "bell\u0007", "\ud800", "x\udc00"].map((reason) => put(tR, { years: 5, reason })));
  ok("AUD-5 DW2 fail (break m1, m2): a reason of invisible characters only, or with a control character or broken text, is refused 400 (never 404/500), nothing saved",
    oddReasons.every((b) => b.status === 422 && ["REASON_NEEDED", "INVALID_REASON"].includes(b.body.code)) && await readSetting(db, FIRM_A, KEY) === 8 && lines() === before, oddReasons.map((b) => [b.status, b.body.code]));
  const multi = await put(tR, { years: 7, reason: "\tFirst line.\nSecond line. \n" });
  ok("AUD-5 DW2 pass (re-review n2): a reason on several lines (line breaks, tabs) is trimmed and kept", multi.status === 200 && JSON.parse(sql(`select detail::text from audit_event where entity_key = '${FIRM_A}:${KEY}' order by at desc, id desc limit 1`)).reason === "Reason given: First line.\nSecond line.", multi.body);
  before = lines();
  ok("AUD-5 DW2 pass (break m7): the 500-character limit counts characters as a person does (300 emoji are allowed)", (await put(tR, { years: 7, reason: "📁".repeat(300) })).status === 200 && lines() === before + 1);
  before = lines();
  const withReason = await put(tR, { years: 5, reason: "Files are also kept by our parent firm's records office." });
  const last = JSON.parse(sql(`select detail::text from audit_event where entity_key = '${FIRM_A}:${KEY}' order by at desc, id desc limit 1`));
  ok("AUD-5 DW2 pass: saving 5 with a reason is saved, and the warning (s. 7.2) and the reason are on its one audit line",
    withReason.status === 200 && withReason.body.years === 5 && /s\. 7\.2/.test(withReason.body.warning ?? "") && await readSetting(db, FIRM_A, KEY) === 5 && lines() === before + 1
    // AUD-1m part 2c (Lead 94's (A1) on #2289): detail keeps the reason cut to 200 characters; the line's summary keeps it whole.
    && last.to === 5 && /^Below the College's rule: .*s\. 7\.2/.test(last.reason) && last.reason.length <= 200
    && /Below the College's rule: .*s\. 7\.2.* Reason given: Files are also kept by our parent firm's records office\./.test(sql(`select summary from audit_event where entity_key = '${FIRM_A}:${KEY}' order by at desc, id desc limit 1`)), [withReason.body, last]);
  before = lines();
  const six = await put(tR, { years: 6 });
  const sixLine = JSON.parse(sql(`select detail::text from audit_event where entity_key = '${FIRM_A}:${KEY}' order by at desc, id desc limit 1`));
  ok("AUD-5 DW2 pass: saving 6 gives no warning and needs no reason (no reason on the line)", six.status === 200 && six.body.warning === null && !("reason" in sixLine) && sixLine.to === 6 && lines() === before + 1, [six.body, sixLine]);
  const sixWhy = await put(tR, { years: 6, reason: "Back to the College's number." });
  const sixWhyLine = JSON.parse(sql(`select detail::text from audit_event where entity_key = '${FIRM_A}:${KEY}' order by at desc, id desc limit 1`));
  ok("AUD-5 DW2 pass (review m4): a reason given at 6 or more is kept on the line, with no warning", sixWhy.status === 200 && sixWhy.body.warning === null && sixWhyLine.reason === "Reason given: Back to the College's number.", sixWhyLine);
  // Re-review n1: the answer is built from the value this save wrote, never re-read (a re-read under parallel saves can
  // answer with another request's value). A read that always says 42 must not reach the answer.
  class StaleRead extends KeepPeriods { override async forFirm() { return { closedClientFilesYears: 42, source: "firm setting" as const }; } }
  const ctxR = { staffId: (await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-R" } })).id, firmId: FIRM_A, firmKey: "sample-firm", roles: ["OWNER"], keys: ["agent/legal-settings:manage"], duties: [], authTime: 0, via: "local" as const };
  const own = await new StaleRead(db).save(ctxR as never, { years: 9 });
  ok("AUD-5 DW2 fail (break m5, re-review n1): the save's answer is the value it wrote (9), never a later read (42)", own.years === 9 && own.warning === null && own.saved === true && await readSetting(db, FIRM_A, KEY) === 9, own);
  await put(tR, { years: 6 });
  ok("AUD-5 DW2 fail: a forced settings refusal through the write path (unregistered value) is a 400, never a save",
    await throwsLike(() => writeSetting(db, { firmId: FIRM_A, key: KEY, value: 0, by: "staff:x", workspaceId: sql("select id from workspace where key = 'platform-audit'") }), (e) => (e as { getStatus?: () => number }).getStatus?.() === 400) && await readSetting(db, FIRM_A, KEY) === 6);

  // --------------------------------------------------------------------------------------------- DW3: not set, walls
  await put(tS, { years: 12 });
  const readA = await get(tR), readB = await get(tS);
  ok("AUD-5 DW3 fail: firm B's number (12) never shows on firm A's read (A reads 6), and A's PUT never changed B",
    readA.body.closedClientFiles.years === 6 && readB.body.closedClientFiles.years === 12 && !JSON.stringify(readA.body).includes("12 years"), [readA.body.closedClientFiles, readB.body.closedClientFiles]);
  sql(`delete from platform_firm_setting where firm_id = '${FIRM_A}' and key = '${KEY}'`);
  const notSet = await new KeepPeriods(db).forFirm(FIRM_A), readNotSet = await get(tO);
  ok("AUD-5 DW3 pass: a firm with no setting → forFirm null, \"not set\"; the read says \"Not set\" and has no default number",
    notSet.closedClientFilesYears === null && notSet.source === "not set" && readNotSet.status === 200 && readNotSet.body.closedClientFiles.years === null && /^Not set/.test(readNotSet.body.closedClientFiles.words), [notSet, readNotSet.body.closedClientFiles]);
  ok("AUD-5 DW3 pass: any staff member reads it (the Case Officer, canChange false); the Owner's read says canChange true",
    readNotSet.body.closedClientFiles.canChange === false && readA.body.closedClientFiles.canChange === true);

  // --------------------------------------------------------------------------------------------------- DW4: the words
  const states: Res[] = [readNotSet];
  for (const y of [1, 5, 6, 50]) { sql(`delete from platform_firm_setting where firm_id = '${FIRM_A}' and key = '${KEY}'`); await writeSetting(db, { firmId: FIRM_A, key: KEY, value: y, by: "staff:check", workspaceId: sql("select id from workspace where key = 'platform-audit'") }); states.push(await get(tR)); }
  ok("AUD-5 DW4 fail: no answer of the read route, at any setting (not set, 1, 5, 6, 50), says \"legal obligation\" or \"required by law\"",
    states.length === 5 && states.every((s) => s.status === 200 && !/legal obligation|required by law|legally required/i.test(JSON.stringify(s.body))), states.map((s) => s.status));
  ok("AUD-5 DW4 pass: the activity-log sentence is SA-11-14's, word for word, in every state",
    states.every((s) => s.body.activityLog === "Your activity log is kept for 7 years for security.") && ACTIVITY_LOG_WORDS === "Your activity log is kept for 7 years for security.");
  ok("AUD-5 DW4 pass: the College row shows beside the setting with its link, s. 7.2 and \"Unconfirmed: no counsel\"",
    states.every((s) => s.body.college.words === "The College's rule: at least 6 years after closing (Client File Management Regulation s. 7.2)" && s.body.college.url === COLLEGE_CITATION.url && s.body.college.unconfirmed === "Unconfirmed: no counsel" && s.body.college.years === COLLEGE_CLIENT_FILE_YEARS));
  ok("AUD-5 DW4 pass: the closed-file row of the table carries the firm's number (50), the others their own", states[4].body.periods.find((p: any) => p.class === "closed_client_file").years === 50 && states[4].body.periods.find((p: any) => p.class === "activity_log").years === 7 && states[4].body.periods.length === 7);
  ok("AUD-5 DW4 fail: a number below 6 shows the College warning on the read; 6 and over show none", /s\. 7\.2/.test(states[2].body.closedClientFiles.warning ?? "") && states[3].body.closedClientFiles.warning === null && states[4].body.closedClientFiles.warning === null);

  // ------------------------------------------------------------------------------------------ the demo reset (P-571 (1))
  await writeSetting(db, { firmId: FIRM_A, key: KEY, value: 3, by: "staff:check", workspaceId: sql("select id from workspace where key = 'platform-audit'"), reason: "check" });
  // A key with no Sample value (platform.language: default "en") changed by a person, to prove the other branch.
  await writeSetting(db, { firmId: FIRM_A, key: "platform.language", value: "fr", by: "staff:check", workspaceId: sql("select id from workspace where key = 'platform-audit'") });
  const reset = await resetSampleFirmSettings(db);
  ok("AUD-5 pass (demo reset, Build Lead C 6924927144): a key with no Sample value goes back to its registered default (platform.language fr → en)",
    !Object.hasOwn(SAMPLE_SETTING_VALUES, "platform.language") && await readSetting(db, FIRM_A, "platform.language") === "en" && reset.changed.some((c) => c.key === "platform.language"), reset);
  ok("AUD-5 fail (demo reset, Build Lead C 6924927144): a Sample firm's number set to 3 is not left at 3 nor wiped to the empty default: it is 6 again, audited", await readSetting(db, FIRM_A, KEY) === 6 && reset.changed.some((c) => c.key === KEY) && await readSetting(db, FIRM_B, KEY) === 6, reset);
  ok("AUD-5 fail (demo reset): a second reset changes nothing", (await resetSampleFirmSettings(db)).changed.length === 0);

  sql(`delete from platform_firm_setting where firm_id = '${FIRM_A}' and key = '${KEY}'`);
  await seedSampleOnStart({ PLATFORM_ENVIRONMENT: "local", PLATFORM_SAMPLE_SEED: "on", DATABASE_URL: urlOf(DB) });
  ok("AUD-5 pass (start-up seed): PLATFORM_SAMPLE_SEED=on writes the Sample value a Sample firm lacks (6), keeping firm B's", await readSetting(db, FIRM_A, KEY) === 6 && await readSetting(db, FIRM_B, KEY) === 6);

  // The real adapter on the API's own walled Db (xr_app, PF-12), as a request runs it (review m2).
  const { withFirm } = await import("../api/src/platform/firm-scope.ts");
  const walledDb = new Db(), walled = new KeepPeriods(walledDb as never);
  try {
    const inA = await withFirm(FIRM_A, () => walled.forFirm(FIRM_A)), crossed = await withFirm(FIRM_B, () => walled.forFirm(FIRM_A));
    ok("AUD-5 DW3 fail (review m2): on the walled Db, firm A's request reads its 6; firm B's request asking for firm A reads nothing (\"not set\")",
      inA.closedClientFilesYears === 6 && crossed.closedClientFilesYears === null, { inA, crossed });
  } finally { await walledDb.$disconnect(); }

  // ------------------------------------------------------------------------------------------------ DW5: the contract
  const real = new KeepPeriods(db), ws = sql("select id from workspace where key = 'platform-audit'");
  const clearBoth = async () => { sql(`delete from platform_firm_setting where firm_id in ('${FIRM_A}', '${FIRM_B}') and key = '${KEY}'`); };
  const realHarness = (): KeepPeriodHarness => ({ port: real as never, firmA: FIRM_A, firmB: FIRM_B, clear: clearBoth, set: async (f, y) => { await writeSetting(db, { firmId: f, key: KEY, value: y, by: "staff:contract", workspaceId: ws }); } });
  const fake = fakeKeepPeriods();
  const fakeHarness = (): KeepPeriodHarness => ({ port: fake, firmA: FIRM_A, firmB: FIRM_B, clear: async () => { fake.set(FIRM_A, null); fake.set(FIRM_B, null); }, set: async (f, y) => fake.set(f, y) });
  const rFake = await runContract(keepPeriodPortContract, "fakeKeepPeriods", fakeHarness, ok);
  const rReal = await runContract(keepPeriodPortContract, "KeepPeriods", realHarness, ok);
  ok("AUD-5 DW5 pass: the contract passes for the fake and the real adapter", rFake.failed.length === 0 && rReal.failed.length === 0 && rFake.passed.length === 5 && rReal.passed.length === 5);
  const broken = await runContract(keepPeriodPortContract, "broken", () => ({ ...fakeHarness(), port: { ...fake, forFirm: async () => ({ closedClientFilesYears: 6, source: "firm setting" as const }) } }), null);
  ok("AUD-5 DW5 fail: an adapter that gives a default number (6) when nothing is set breaks the contract", broken.failed.length > 0, broken);
  let contracts = 0; try { execFileSync(process.execPath, [join(STUDIO, "tools", "check-port-contracts.mjs")], { stdio: "pipe" }); } catch (e) { contracts = (e as { status?: number }).status ?? 1; }
  ok("AUD-5 DW5 pass: node studio/tools/check-port-contracts.mjs exits 0", contracts === 0, contracts);
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
