// PF-15 part 2 (brief design/lead-b-briefs/PF-15.md part 2, plus its "Part 2 also" lines; SA-3-4, SA-3-39, SA-3-43,
// SA-3-47, SA-3-58, SA-3-62, SA-4-56): a pass and a fail per Done when line: DW8 the case limits (the case side's
// CaseCountPort fake) · DW3 checkDowngrade over all four metrics with the amount to reduce · DW9 a limit we lower reaches
// each firm at its first renewal at least 30 days later, then keeps what it has and refuses new ones, no downgrade check,
// every change audited · a firm's session reading another firm through the definer function · one live subscription.
// A scratch database (removed), the Sample firms, a fake clock, fake mail. No server, no browser, no model call (US$0).
//   tsx studio/tests/check_pf15_cases.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeCaseCount } from "../ports/case-count.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeMail } from "../ports/mail.ts";
import { fakeStaff } from "../ports/staff.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf15c_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const problemOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return x.getStatus ? { status: x.getStatus(), body: x.getResponse?.() as Record<string, any> } : { status: 0, body: { error: String(e) } as Record<string, any> }; } };
const DAY = 86_400_000;

execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);

const { Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PgEntitlements, checkDowngrade, planLimitReached, seatsUsed, FEATURES_NOTE } = await import("../api/src/platform/entitlements/limits.ts");
const { PlanLimitChanges, LIMIT_CHANGE_KEY } = await import("../api/src/platform/entitlements/limit-changes.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const walls = await import("../api/src/platform/firm-scope.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new FakeClock("2026-11-20T15:00:00Z");
const T0 = clock.now().getTime();
const mail = fakeMail();
const ours = fakeStaff({ keys: [LIMIT_CHANGE_KEY] }, clock);
const changes = new PlanLimitChanges({ db, audit: auditEvent, clock, mail });
const at = (ms: number) => new PgEntitlements(db, () => ms);
try {
  await seedSampleFirms(db);
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM_B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const team = sql(`select id from platform_plan where code = 'team'`);

  // ---------------------------------------------------------------------------------------- the migration's rules
  ok("PF-15 schema pass: platform_limit_change_firm is behind PF-12's wall (forced row-level security, its policy)", sql(`select relforcerowsecurity::text || (select count(*) from pg_policy where polrelid = 'platform_limit_change_firm'::regclass)::text from pg_class where relname = 'platform_limit_change_firm'`) === "true1");
  ok("PF-15 schema fail: the app's role may insert a change but never change or remove one, and never writes a firm row itself", sql(`select string_agg(has_table_privilege('xr_data', t, p)::text, ',') from (values ('platform_limit_change','INSERT'),('platform_limit_change','UPDATE'),('platform_limit_change','DELETE'),('platform_limit_change_firm','INSERT'),('platform_plan_limit','UPDATE')) v(t, p)`) === "true,false,false,false,false");

  // ------------------------------------------------------------------- several live subscriptions (P-423 read, minor)
  ok("PF-15 pass (several live subscriptions): a firm has at most one live subscription: a second live row is refused by platform_subscription_one_live", refused(`insert into platform_subscription (id, firm_id, plan_id, status, updated_at) values (gen_random_uuid(), '${FIRM_A}', '${team}', 'ACTIVE', now())`, /platform_subscription_one_live/));
  sql(`insert into platform_subscription (id, firm_id, plan_id, status, updated_at) select gen_random_uuid(), '${FIRM_A}', id, 'ENDED', now() from platform_plan where code = 'firm'`);
  ok("PF-15 pass (several live subscriptions): an ENDED row beside the live one is never read: the limit is the live plan's", (await at(T0).limitOf(FIRM_A, "active_individual_cases")).limit === 150 && (await at(T0).limitOf(FIRM_A, "active_individual_cases")).planCode === "team");

  // ------------------------------------------------------------------------------------------ DW8: the case limits
  sql(`update platform_plan_limit set limit_value = 10 where plan_id = '${team}' and metric = 'ACTIVE_INDIVIDUAL_CASES'`);
  sql(`update platform_plan_limit set limit_value = 2 where plan_id = '${team}' and metric = 'ACTIVE_CORPORATE_CASES'`);
  const cases = fakeCaseCount({ individual: 10, corporate: 0 });
  const caseCheck = async (metric: "active_individual_cases" | "active_corporate_cases") => { const c = await cases.activeCounts(); return at(T0).check("sample-firm", metric, metric === "active_individual_cases" ? c.individual : c.corporate); };
  const r11 = await caseCheck("active_individual_cases");
  const p11 = r11.allowed ? null : await problemOf(async () => planLimitReached(r11, "This case was not opened."));
  ok("PF-15 DW8 fail: the 11th active individual case on a 10-case plan → 409 PLAN_LIMIT_REACHED (metric, limit, used)", p11?.status === 409 && p11.body.code === "PLAN_LIMIT_REACHED" && p11.body.metric === "active_individual_cases" && p11.body.limit === 10 && p11.body.used === 10, p11);
  cases.set({ individual: 9, corporate: 0 });
  ok("PF-15 DW8 pass: a closed case frees one: with 9 active the next one is allowed", (await caseCheck("active_individual_cases")).allowed === true);
  cases.set({ individual: 10, corporate: 0 });
  ok("PF-15 DW8 fail: a reopened case counts again: back to 10, refused", (await caseCheck("active_individual_cases")).allowed === false);
  cases.set({ individual: 10, corporate: 1 });
  ok("PF-15 DW8 pass: a corporate case counts against the corporate limit only (10 individual full, 1 of 2 corporate → a corporate case allowed)", (await caseCheck("active_corporate_cases")).allowed === true && (await caseCheck("active_individual_cases")).allowed === false);
  cases.set({ individual: 0, corporate: 2 });
  ok("PF-15 DW8 fail: the corporate limit full (2 of 2) refuses a corporate case while individual cases still open", (await caseCheck("active_corporate_cases")).allowed === false && (await caseCheck("active_individual_cases")).allowed === true);
  sql(`update platform_plan_limit set limit_value = 150 where plan_id = '${team}' and metric = 'ACTIVE_INDIVIDUAL_CASES'`);
  sql(`update platform_plan_limit set limit_value = 30 where plan_id = '${team}' and metric = 'ACTIVE_CORPORATE_CASES'`);

  // ------------------------------------------------------------------------------- DW3: checkDowngrade, every metric
  const starter = sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), 'pf15-starter', 'Starter (Sample)', 3) returning id`).split("\n")[0];
  sql(`insert into platform_plan_limit (plan_id, metric, limit_value) values ('${starter}', 'ACTIVE_INDIVIDUAL_CASES', 5), ('${starter}', 'ACTIVE_CORPORATE_CASES', null), ('${starter}', 'STORAGE_MB', 100)`);
  const seated = await seatsUsed(db, FIRM_A);
  for (let i = seated; i < 8; i++) sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, expires_at) values (gen_random_uuid(), '${FIRM_A}', 'pf15c.${i}@example.com', '{CASE_OFFICER}', 'pf15c-${i}', 'seed:pf15', now() + interval '72 hours')`);
  const files = (mb: number) => ({ usedBytes: async () => mb * 1024 * 1024 });
  const over = await checkDowngrade(db, { files: files(250), cases: fakeCaseCount({ individual: 7, corporate: 40 }) }, FIRM_A, "pf15-starter");
  const seatC = over.conflicts.find((c) => c.metric === "seats");
  ok("PF-15 DW3 fail: 8 staff to a 3-seat plan → { metric: seats, used: 8, limit: 3, reduce: 5 } with SA-4-56's words", seatC?.used === 8 && seatC.limit === 3 && seatC.reduce === 5 && seatC.words === "You have 8 staff; Starter (Sample) allows 3. Remove 5 staff or choose a larger plan.", over);
  ok("PF-15 DW3 fail: every metric over the target is returned (seats, individual cases 7 > 5, storage 250 > 100 MB); an Unlimited one (corporate) never conflicts",
    over.conflicts.map((c) => `${c.metric}:${c.reduce}`).join() === "seats:5,active_individual_cases:2,storage_mb:150", over.conflicts);
  ok("PF-15 DW3 pass: feature conflicts are not checked yet and it says so (PF-17 brings the plan feature list)", over.features.length === 0 && over.featuresNote === FEATURES_NOTE);
  sql(`update platform_invitation set revoked_at = now() where firm_id = '${FIRM_A}' and token_hash like 'pf15c-%'`);
  const used3 = await seatsUsed(db, FIRM_A);
  if (used3 <= 3) {
    const fits = await checkDowngrade(db, { files: files(100), cases: fakeCaseCount({ individual: 5, corporate: 0 }) }, FIRM_A, "pf15-starter");
    ok(`PF-15 DW3 pass: with ${used3} staff, 5 cases and 100 MB (each at most the target's limit) → no conflict`, fits.conflicts.length === 0, fits);
  } else {
    sql(`update platform_plan set seats_limit = ${used3} where id = '${starter}'`);
    const fits = await checkDowngrade(db, { files: files(100), cases: fakeCaseCount({ individual: 5, corporate: 0 }) }, FIRM_A, "pf15-starter");
    ok(`PF-15 DW3 pass: at the target's limits exactly (${used3} staff of ${used3}, 5 cases, 100 MB) → no conflict`, fits.conflicts.length === 0, fits);
  }
  ok("PF-15 DW3 fail: an unknown target plan → 404 PLAN_NOT_FOUND", (await problemOf(() => checkDowngrade(db, { files: files(0), cases: fakeCaseCount() }, FIRM_A, "no-such-plan")))?.body.code === "PLAN_NOT_FOUND");

  // ------------------------------------------------------------------------------- DW9: a limit we lower on a live plan
  const renewal = T0 + 10 * DAY;   // firm A renews 10 days after approval: too soon, so its first renewal 30+ days on is a month later
  sql(`update platform_subscription set current_period_end = to_timestamp(${renewal / 1000}) where firm_id = '${FIRM_A}' and status <> 'ENDED'`);
  const expected = new Date(Date.UTC(2026, 11, 30, 15)).toISOString();   // 30 Nov 15:00 + 1 month
  const auditCount = () => Number(sql(`select count(*) from audit_event where action = 'plan.limit.lowered'`));
  ok("PF-15 DW9 fail: without our team's key → 403, nothing changed", (await problemOf(() => changes.change(fakeStaff({}, clock), { plan: "team", metric: "active_individual_cases", value: 5, reason: "Sample lowering" })))?.status === 403 && sql(`select count(*) from platform_limit_change`) === "0");
  ok("PF-15 DW9 fail: seats never Unlimited, a negative value and no reason → 422", (await problemOf(() => changes.change(ours, { plan: "team", metric: "seats", value: null, reason: "Sample" })))?.status === 422
    && (await problemOf(() => changes.change(ours, { plan: "team", metric: "storage_mb", value: -1, reason: "Sample" })))?.status === 422 && (await problemOf(() => changes.change(ours, { plan: "team", metric: "storage_mb", value: 1 })))?.status === 422);
  ok("PF-15 DW9 fail: the same value again → 409 LIMIT_UNCHANGED", (await problemOf(() => changes.change(ours, { plan: "team", metric: "active_individual_cases", value: 150, reason: "Sample same" })))?.body.code === "LIMIT_UNCHANGED");
  const low = await changes.change(ours, { plan: "team", metric: "active_individual_cases", value: 5, reason: "Sample lowering below firm A's use" });
  const mine = low.firms.find((f) => f.firmId === FIRM_A);
  ok("PF-15 DW9 pass: lowering 150 → 5 is accepted although firm A uses more (no downgrade check runs, SA-3-62); the old value is kept on the change", low.lowered && low.oldValue === 150 && low.newValue === 5 && !!mine);
  ok("PF-15 DW9 pass: firm A's effective date is stored: its first renewal at least 30 days after approval (renewal +10 days is too soon → +1 month)", mine?.effectiveAt === expected && sql(`select effective_at = '${expected}'::timestamptz from platform_limit_change_firm where firm_id = '${FIRM_A}'`) === "t", { mine, expected });
  const eff = Date.parse(expected);
  ok("PF-15 DW9 pass: until then firm A keeps its old limit (150): the 8th case is allowed a minute before", (await at(eff - 60_000).limitOf(FIRM_A, "active_individual_cases")).limit === 150 && (await at(eff - 60_000).check(FIRM_A, "active_individual_cases", 7)).allowed);
  ok("PF-15 DW9 fail: from its renewal the lower limit applies: 7 active of 5 → a new case refused", (await at(eff).limitOf(FIRM_A, "active_individual_cases")).limit === 5 && !(await at(eff).check(FIRM_A, "active_individual_cases", 7)).allowed);
  ok("PF-15 DW9 pass: existing items stay: the change deleted no case limit row and touched no firm's data (only the limit and the change rows were written)", sql(`select count(*) from platform_plan_limit where plan_id = '${team}'`) === "3" && Number(sql(`select count(*) from platform_staff where firm_id = '${FIRM_A}'`)) > 0);
  ok("PF-15 DW9 pass: every firm the lowering reaches gets one audit line with the old and new value and its date", auditCount() === low.firms.length && sql(`select (detail->>'oldValue') || ':' || (detail->>'newValue') || ':' || (detail->>'effectiveAt') from audit_event where action = 'plan.limit.lowered' and detail->>'firmId' = '${FIRM_A}'`) === `150:5:${expected}`);
  const notices = mail.sent.filter((m) => m.templateKey === "platform.live_plan_removal_notice");
  ok("PF-15 DW9 pass: the Owners are told at approval (\"Live-plan removal notice\", once each)", notices.length >= 1 && notices.every((m) => m.subject === "Live-plan removal notice" && m.firmId === FIRM_A) && new Set(notices.map((m) => m.idempotencyKey)).size === notices.length, notices.map((m) => m.to));
  ok("PF-15 DW9 fail: a change is a record: never changed or removed", refused(`update platform_limit_change set new_value = 1`, /never changed or removed/) && refused(`delete from platform_limit_change_firm`, /never changed or removed/));
  const raise = await changes.change(ours, { plan: "team", metric: "active_corporate_cases", value: null, reason: "Sample raise to Unlimited" });
  ok("PF-15 DW9 pass: a raise (30 → Unlimited) reaches every firm at once, with no firm dates and no audit line of a lowering", !raise.lowered && raise.firms.length === 0 && (await at(T0).limitOf(FIRM_A, "active_corporate_cases")).limit === null && auditCount() === low.firms.length);
  const seatsNow = Number(sql(`select seats_limit from platform_plan where id = '${team}'`));
  const ls = await changes.change(ours, { plan: "team", metric: "seats", value: 1, reason: "Sample seats lowering" });
  ok("PF-15 DW9 pass: seats follow the same rule: lowered on platform_plan.seats_limit, firm A keeps its seats until its renewal", ls.lowered && ls.oldValue === seatsNow && (await at(eff - 60_000).limitOf(FIRM_A, "seats")).limit === seatsNow && (await at(eff).limitOf(FIRM_A, "seats")).limit === 1);

  // ------------------------------------------------------------- a firm's session reads no other firm (P-423 read)
  walls.wallUnscopedQueries();
  const walled = new Db();
  try {
    const before = sql(`select (select count(*) from platform_storage_over where firm_id = '${FIRM_B}') || ':' || (select count(*) from platform_limit_change_firm where firm_id = '${FIRM_B}')`);
    const cross = await walls.withFirm(FIRM_A, () => new PgEntitlements(walled, () => T0).limitOf(FIRM_B, "active_individual_cases"));
    const crossKey = await walls.withFirm(FIRM_A, () => new PgEntitlements(walled, () => T0).check("sample-solo", "active_individual_cases", 0));
    ok("PF-15 fail (cross-firm definer): firm A's session asking the definer function about firm B (by id or key) gets no firm, no plan, limit 0, refused", cross.firmId === null && cross.planCode === null && cross.limit === 0 && crossKey.allowed === false, { cross, crossKey });
    ok("PF-15 fail (cross-firm definer): and nothing is written for firm B", sql(`select (select count(*) from platform_storage_over where firm_id = '${FIRM_B}') || ':' || (select count(*) from platform_limit_change_firm where firm_id = '${FIRM_B}')`) === before);
    ok("PF-15 pass (cross-firm definer): firm A's own session still reads its own limit, and the case side with no scope reads firm B by key", (await walls.withFirm(FIRM_A, () => new PgEntitlements(walled, () => T0).limitOf(FIRM_A, "storage_mb"))).limit === 25600 && (await new PgEntitlements(walled, () => T0).limitOf("sample-solo", "active_individual_cases")).limit === 25);
    ok("PF-15 fail (walls): in firm B's session, firm A's limit dates are not visible", (await walls.withFirm(FIRM_B, () => walled.platformLimitChangeFirm.findMany({ where: { firmId: FIRM_A } }))).length === 0);
    const wl = await walls.inRequest({ method: "PATCH", url: "/api/system/plans/solo/limits", originalUrl: "/api/system/plans/solo/limits", path: "/api/system/plans/solo/limits" }, () => new PlanLimitChanges({ db: walled, audit: auditEvent, clock, mail: null }).change(ours, { plan: "solo", metric: "storage_mb", value: 5000, reason: "Sample walled lowering" }));
    ok("PF-15 DW9 pass (walls): the change runs on the walled pool, in a request on PF-4s's future system route, through its named crossing and reaches firm B on the solo plan", wl.lowered && wl.firms.some((f) => f.firmId === FIRM_B), wl);
  } finally { await walled.$disconnect(); }
} catch (e) {
  fail++; console.log(`FAIL  PF-15: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await db.$disconnect();
  execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
