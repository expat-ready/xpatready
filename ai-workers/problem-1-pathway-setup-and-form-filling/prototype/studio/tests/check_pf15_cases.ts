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
const changes = new PlanLimitChanges({ db, audit: auditEvent, mail });
const at = (ms: number) => new PgEntitlements(db, () => ms);
try {
  await seedSampleFirms(db);
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM_B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const team = sql(`select id from platform_plan where code = 'team'`);

  // ---------------------------------------------------------------------------------------- the migration's rules
  ok("PF-15 schema pass: platform_limit_change_firm is behind PF-12's wall (forced row-level security, its policy)", sql(`select relforcerowsecurity::text || (select count(*) from pg_policy where polrelid = 'platform_limit_change_firm'::regclass)::text from pg_class where relname = 'platform_limit_change_firm'`) === "true1");
  ok("PF-15 schema fail: only our staff's bypass role inserts or reads a change; the app's role neither, and never writes a firm row or a limit", sql(`select string_agg(has_table_privilege(r, t, p)::text, ',') from (values ('xr_staff_bypass','platform_limit_change','INSERT'),('xr_staff_bypass','platform_limit_change','SELECT'),('xr_staff_bypass','platform_limit_change','UPDATE'),('xr_data','platform_limit_change','INSERT'),('xr_data','platform_limit_change','SELECT'),('xr_data','platform_limit_change_firm','INSERT'),('xr_data','platform_plan_limit','UPDATE')) v(r, t, p)`) === "true,true,false,false,false,false,false");

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
  // The approval time is the database's (stamped after the plan's lock), so dates here are read back from the database.
  const ts = (q: string) => Date.parse(sql(`set timezone = 'UTC'; select to_char(date_trunc('milliseconds', (${q}) + interval '999 microseconds') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`));   // month arithmetic in UTC, as the trigger
  const subA = `platform_subscription where firm_id = '${FIRM_A}' and status <> 'ENDED'`;
  sql(`update platform_subscription set current_period_end = now() + interval '10 days' where firm_id = '${FIRM_A}' and status <> 'ENDED'`);   // renews in 10 days: too soon, so a month later
  const expected = ts(`(select current_period_end from ${subA}) + interval '1 month'`);
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));
  const live = (plan: string) => Number(sql(`select count(*) from platform_subscription s join platform_plan p on p.id = s.plan_id where p.code = '${plan}' and s.status <> 'ENDED'`));
  ok("PF-15 DW9 fail: without our team's key → 403, nothing changed", (await problemOf(() => changes.change(fakeStaff({}, clock), { plan: "team", metric: "active_individual_cases", value: 5, reason: "Sample lowering" })))?.status === 403 && sql(`select count(*) from platform_limit_change`) === "0");
  ok("PF-15 DW9 fail: seats never Unlimited, a negative value and no reason → 422", (await problemOf(() => changes.change(ours, { plan: "team", metric: "seats", value: null, reason: "Sample" })))?.status === 422
    && (await problemOf(() => changes.change(ours, { plan: "team", metric: "storage_mb", value: -1, reason: "Sample" })))?.status === 422 && (await problemOf(() => changes.change(ours, { plan: "team", metric: "storage_mb", value: 1 })))?.status === 422);
  ok("PF-15 DW9 fail: the same value again → 409 LIMIT_UNCHANGED", (await problemOf(() => changes.change(ours, { plan: "team", metric: "active_individual_cases", value: 150, reason: "Sample same" })))?.body.code === "LIMIT_UNCHANGED");
  const low = await changes.change(ours, { plan: "team", metric: "active_individual_cases", value: 5, reason: "Sample lowering below firm A's use" });
  const mine = low.firms.find((f) => f.firmId === FIRM_A);
  ok("PF-15 DW9 pass: lowering 150 → 5 is accepted although firm A uses more (no downgrade check runs, SA-3-62); the old value is kept on the change", low.lowered && low.oldValue === 150 && low.newValue === 5 && !!mine);
  ok("PF-15 DW9 pass: firm A's effective date is stored: its first renewal at least 30 days after approval (renewal in 10 days is too soon → a month later)", Date.parse(mine!.effectiveAt) === expected && Date.parse(mine!.effectiveAt) >= Date.parse(low.approvedAt) + 30 * DAY, { mine, expected: new Date(expected) });
  const eff = expected;
  ok("PF-15 DW9 pass: until then firm A keeps its old limit (150): the 8th case is allowed a minute before", (await at(eff - 60_000).limitOf(FIRM_A, "active_individual_cases")).limit === 150 && (await at(eff - 60_000).check(FIRM_A, "active_individual_cases", 7)).allowed);
  ok("PF-15 DW9 fail: from its renewal the lower limit applies: 7 active of 5 → a new case refused", (await at(eff).limitOf(FIRM_A, "active_individual_cases")).limit === 5 && !(await at(eff).check(FIRM_A, "active_individual_cases", 7)).allowed, [await at(eff).limitOf(FIRM_A, "active_individual_cases"), new Date(eff), sql(`select effective_at::text from platform_limit_change_firm`)]);
  ok("PF-15 DW9 pass: existing items stay: the change deleted no limit row and no firm's data", sql(`select count(*) from platform_plan_limit where plan_id = '${team}'`) === "3" && Number(sql(`select count(*) from platform_staff where firm_id = '${FIRM_A}'`)) > 0);
  ok("PF-15 DW9 pass: every firm the lowering reaches gets one audit line with the old and new value and its date", audits("plan.limit.lowered") === low.firms.length && low.firms.length === live("team")
    && sql(`select (detail->>'oldValue') || ':' || (detail->>'newValue') || ':' || (detail->>'effectiveAt') from audit_event where action = 'plan.limit.lowered' and detail->>'firmId' = '${FIRM_A}'`) === `150:5:${mine!.effectiveAt}`);
  const notices = mail.sent.filter((m) => m.templateKey === "platform.live_plan_removal_notice");
  ok("PF-15 DW9 pass: the Owners are told at approval (\"Live-plan removal notice\", once each)", low.notices.sent >= 1 && low.notices.failed.length === 0 && notices.length === low.notices.sent && notices.every((m) => m.subject === "Live-plan removal notice" && "firmId" in m && m.firmId === FIRM_A) && new Set(notices.map((m) => m.idempotencyKey)).size === notices.length, notices.map((m) => m.to));
  ok("PF-15 DW9 fail: a change is a record: never changed or removed", refused(`update platform_limit_change set new_value = 1`, /never changed or removed/) && refused(`delete from platform_limit_change_firm`, /never changed or removed/));
  const raise = await changes.change(ours, { plan: "team", metric: "active_corporate_cases", value: null, reason: "Sample raise to Unlimited" });
  ok("PF-15 DW9 pass: a raise (30 → Unlimited) reaches every firm at once, with no firm dates and no notice", !raise.lowered && raise.firms.length === 0 && raise.notices.sent === 0 && (await at(Date.now()).limitOf(FIRM_A, "active_corporate_cases")).limit === null);
  ok("PF-15 DW9 pass (review M3): a raise is audited too: one line per firm live on the plan", audits("plan.limit.raised") === live("team") && audits("plan.limit.lowered") === low.firms.length);
  const seatsNow = Number(sql(`select seats_limit from platform_plan where id = '${team}'`));
  const ls = await changes.change(ours, { plan: "team", metric: "seats", value: 1, reason: "Sample seats lowering" });
  const effS = Date.parse(ls.firms.find((f) => f.firmId === FIRM_A)!.effectiveAt);
  ok("PF-15 DW9 pass: seats follow the same rule: lowered on platform_plan.seats_limit, firm A keeps its seats until its renewal", ls.lowered && ls.oldValue === seatsNow && effS === expected && (await at(effS - 60_000).limitOf(FIRM_A, "seats")).limit === seatsNow && (await at(effS).limitOf(FIRM_A, "seats")).limit === 1);

  // Review M1 and M2: the kept value is the highest a firm had before any pending lowering, never below today's value.
  // Storage on the team plan (25 600): lower to 20 000, raise to 30 000, lower to 10 000; all pending for firm A.
  const st = (ms: number) => at(ms).limitOf(FIRM_A, "storage_mb").then((x) => x.limit);
  await changes.change(ours, { plan: "team", metric: "storage_mb", value: 20000, reason: "Sample lower 1" });
  ok("PF-15 DW9 fail (review M2): two lowerings pending (25 600 → 20 000, then → 10 000 later): the firm keeps 25 600, the value before the oldest", (await (async () => { const l2 = await changes.change(ours, { plan: "team", metric: "storage_mb", value: 10000, reason: "Sample lower 2" }); return (await st(eff - 60_000)) === 25600 && (await st(eff)) === 10000 && !!l2; })()));
  await changes.change(ours, { plan: "team", metric: "storage_mb", value: 30000, reason: "Sample raise between" });
  const l3 = await changes.change(ours, { plan: "team", metric: "storage_mb", value: 15000, reason: "Sample lower 3" });
  ok("PF-15 DW9 pass (review M1): lower, raise to 30 000, lower again: until its renewal the firm keeps 30 000 (the highest it had), not the older 25 600", (await st(eff - 60_000)) === 30000 && (await st(Date.parse(l3.firms.find((f) => f.firmId === FIRM_A)!.effectiveAt))) === 15000, [await st(eff - 60_000), await st(eff)]);
  const rNow = await changes.change(ours, { plan: "team", metric: "storage_mb", value: 40000, reason: "Sample raise above every kept value" });
  ok("PF-15 DW9 pass (review M2): a raise above every kept value applies at once, even while lowerings are pending", !rNow.lowered && (await st(eff - 60_000)) === 40000 && (await st(eff)) === 40000);
  // From Unlimited: a lowering from null keeps Unlimited until the renewal.
  await changes.change(ours, { plan: "team", metric: "active_corporate_cases", value: 3, reason: "Sample lower from Unlimited" });
  ok("PF-15 DW9 pass (review M2): lowering from Unlimited keeps Unlimited until the renewal, then 3", (await at(eff - 60_000).limitOf(FIRM_A, "active_corporate_cases")).limit === null && (await at(eff).limitOf(FIRM_A, "active_corporate_cases")).limit === 3);
  // Review m8: Unlimited among the pending old values wins (corporate is pending from Unlimited; lower it once more).
  await changes.change(ours, { plan: "team", metric: "active_corporate_cases", value: 2, reason: "Sample second lowering after Unlimited" });
  ok("PF-15 DW9 pass (review m8): two lowerings pending, the older from Unlimited (null → 3 → 2): the firm keeps Unlimited until the renewal, then 2", (await at(eff - 60_000).limitOf(FIRM_A, "active_corporate_cases")).limit === null && (await at(eff).limitOf(FIRM_A, "active_corporate_cases")).limit === 2);
  // The boundary: a firm whose renewal is exactly 30 days after approval moves then, not a month later.
  {
    const p30 = sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), 'pf15-b30', 'Boundary (Sample)', 9) returning id`).split("\n")[0];
    sql(`insert into platform_plan_limit (plan_id, metric, limit_value) values ('${p30}', 'STORAGE_MB', 500)`);
    sql(`update platform_subscription set plan_id = '${p30}', current_period_end = now() + interval '30 days 2 seconds' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    const b = await changes.change(ours, { plan: "pf15-b30", metric: "storage_mb", value: 100, reason: "Sample boundary" });
    const pe = ts(`(select current_period_end from platform_subscription where firm_id = '${FIRM_B}' and status <> 'ENDED')`);
    ok("PF-15 DW9 pass (review M2): a renewal 30 days after approval (to the second) is the effective date, not a month later", Date.parse(b.firms[0]?.effectiveAt ?? "") === pe, { b: b.firms, pe: new Date(pe) });
    // Break M2: an infinite renewal date is not a date: the subscription's creation is the anchor, and nothing hangs.
    sql(`update platform_subscription set current_period_end = '-infinity' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    const t = Date.now(), inf = await changes.change(ours, { plan: "pf15-b30", metric: "storage_mb", value: 50, reason: "Sample infinite anchor" });
    const e = Date.parse(inf.firms[0]?.effectiveAt ?? "");
    ok("PF-15 DW9 fail (break M2): a -infinity renewal date neither hangs the change nor keeps the old value for ever (a date within 31 days after the 30)", Date.now() - t < 10_000 && e >= Date.parse(inf.approvedAt) + 30 * DAY && e <= Date.parse(inf.approvedAt) + 62 * DAY, inf.firms);
    sql(`update platform_subscription set current_period_end = '9999-12-31' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    const far = await changes.change(ours, { plan: "pf15-b30", metric: "storage_mb", value: 45, reason: "Sample far anchor" });
    const fe = Date.parse(far.firms[0]?.effectiveAt ?? "");
    ok("PF-15 DW9 fail (break re-check M2): a far-future renewal date (9999-12-31) is capped at a month after the 30 days, never for ever", fe <= Date.parse(far.approvedAt) + 30 * DAY + 32 * DAY && fe >= Date.parse(far.approvedAt) + 30 * DAY, far.firms);
    // Break m2: the date is the same whatever the session's time zone (31 Oct 05:00 UTC is 30 Oct in Vancouver; the
    // trigger works in UTC, so +2 months is 31 Dec 05:00 UTC, not 30 Dec local).
    sql(`update platform_subscription set current_period_end = '2026-10-31 05:00:00+00' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    const zid = sql(`set timezone = 'America/Vancouver'; insert into platform_limit_change (id, plan_id, metric, new_value, reason, approved_by, approved_at) values (gen_random_uuid(), '${p30}', 'STORAGE_MB', 40, 'Sample zone', 'staff:zone', now()) returning id`).split("\n").pop();
    const zEff = sql(`select to_char(effective_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from platform_limit_change_firm where change_id = '${zid}'`);
    const months = Date.now() + 30 * DAY > Date.parse("2026-12-31T05:00:00Z") ? null : "2026-12-31 05:00";
    ok("PF-15 pass (break m2): a change made from a Vancouver session gets the UTC month date (31 Dec 05:00 UTC, not 30 Dec local)", months === null || zEff === months, { zEff, months });
    sql(`update platform_subscription set plan_id = (select id from platform_plan where code = 'solo'), current_period_end = null where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
  }
  // Break m3: a firm that leaves the plan and comes back takes the plan as it is now, like any new firm.
  {
    const p2 = sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), 'pf15-back', 'Come back (Sample)', 9) returning id`).split("\n")[0];
    sql(`insert into platform_plan_limit (plan_id, metric, limit_value) values ('${p2}', 'STORAGE_MB', 900)`);
    sql(`update platform_subscription set plan_id = '${p2}' where firm_id = '${FIRM_B}' and status <> 'ENDED'`);
    await changes.change(ours, { plan: "pf15-back", metric: "storage_mb", value: 300, reason: "Sample lower before leaving" });
    const kept = (await at(Date.now()).limitOf(FIRM_B, "storage_mb")).limit;
    sql(`update platform_subscription set status = 'ENDED' where firm_id = '${FIRM_B}' and status <> 'ENDED'; insert into platform_subscription (id, firm_id, plan_id, status, updated_at) values (gen_random_uuid(), '${FIRM_B}', '${p2}', 'ACTIVE', now())`);
    ok("PF-15 DW9 fail (break m3): firm B kept 900 while on the plan, but after leaving and coming back it reads today's 300, as a new firm does", kept === 900 && (await at(Date.now()).limitOf(FIRM_B, "storage_mb")).limit === 300);
    sql(`update platform_subscription set status = 'ENDED' where firm_id = '${FIRM_B}' and status <> 'ENDED'; insert into platform_subscription (id, firm_id, plan_id, status, updated_at) select gen_random_uuid(), '${FIRM_B}', id, 'ACTIVE', now() from platform_plan where code = 'solo'`);
  }
  // Two changes at the same moment on one plan: applied one after the other, each keeping the value before it.
  {
    const [x, y] = await Promise.all([changes.change(ours, { plan: "team", metric: "storage_mb", value: 35000, reason: "Sample parallel 1" }), changes.change(ours, { plan: "team", metric: "storage_mb", value: 36000, reason: "Sample parallel 2" })]);
    const [first, second] = Date.parse(x.approvedAt) <= Date.parse(y.approvedAt) ? [x, y] : [y, x];
    ok("PF-15 DW9 pass (review M2): two changes at once on one plan are serialised: the later one's old value is the earlier one's new value", first.oldValue === 40000 && second.oldValue === first.newValue && Number(sql(`select limit_value from platform_plan_limit where plan_id = '${team}' and metric = 'STORAGE_MB'`)) === second.newValue, [x, y].map((r) => [r.approvedAt, r.oldValue, r.newValue]));
  }
  // Review m4, break M3: a failing email never stops the others, and the notices can be sent again.
  {
    let down = true;
    const flaky = fakeMail({ failOn: () => down });
    const c2 = new PlanLimitChanges({ db, audit: auditEvent, mail: flaky });
    const r = await c2.change(ours, { plan: "team", metric: "active_individual_cases", value: 4, reason: "Sample lowering with mail down" });
    ok("PF-15 DW9 fail (break M3): with mail down the change still commits and every unsent Owner is listed, none skipped", r.lowered && r.notices.sent === 0 && r.notices.failed.length === Number(sql(`select count(*) from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.role = 'OWNER' and g.ended_at is null where s.status = 'ACTIVE' and s.firm_id in (select firm_id from platform_limit_change_firm where change_id = '${r.changeId}')`)) && r.notices.failed.length > 0, r.notices);
    down = false;
    const again = await c2.sendNotices(r.changeId);
    ok("PF-15 DW9 pass (break M3): sendNotices sends them once mail works", again.sent === r.notices.failed.length && again.failed.length === 0 && flaky.sent.filter((m) => m.templateKey === "platform.live_plan_removal_notice").length >= again.sent);
  }
  // Break B1, M1; review M5, m3: a firm's session writes no change, changes no seats and reads no change history.
  {
    const asApp = (q: string) => sql(`begin; set local role xr_app; select set_config('app.firm_id', '${FIRM_B}', true); ${q}; commit`);
    const appRefused = (q: string) => { try { asApp(q); console.log(`  (xr_app was not refused: ${q.slice(0, 60)})`); return false; } catch (e) { return /permission denied|42501|seats_limit changes only/.test(String((e as { stderr?: string }).stderr ?? e)); } };
    const solo = sql(`select id from platform_plan where code = 'solo'`);
    ok("PF-15 fail (break B1, review M5): a firm's session (xr_app) cannot insert a limit change (so no plan-wide or back-dated change)", appRefused(`insert into platform_limit_change (id, plan_id, metric, new_value, reason, approved_by, approved_at) values (gen_random_uuid(), '${solo}', 'STORAGE_MB', null, 'forged', 'staff:nobody', now() - interval '10 years')`) && (await at(Date.now()).limitOf(FIRM_B, "storage_mb")).limit === 5120);
    ok("PF-15 fail (break M1): a firm's session cannot change platform_plan.seats_limit directly", appRefused(`update platform_plan set seats_limit = seats_limit + 7 where id = '${solo}'`));
    ok("PF-15 fail (review m3, break m7): a firm's session cannot read the change history (reasons, staff ids)", appRefused(`select count(*) from platform_limit_change`));
    const back = await changes.change(ours, { plan: "solo", metric: "storage_mb", value: 5000, reason: "Sample stamp check" });
    ok("PF-15 pass (break B1): the approval time is the database's, never the caller's (now, not back-dated)", Math.abs(Date.parse(back.approvedAt) - Date.now()) < 60_000);
  }
  ok("PF-15 DW3 fail (break m5): checkDowngrade for firm A inside firm B's scope is refused (its usage would read 0), never an empty answer", (await walls.withFirm(FIRM_B, () => problemOf(() => checkDowngrade(db, { files: files(0), cases: fakeCaseCount() }, FIRM_A, "pf15-starter"))))?.status === 404);
  const words = (await checkDowngrade(db, { files: files(250), cases: fakeCaseCount({ individual: 7, corporate: 0 }) }, FIRM_A, "pf15-starter")).conflicts;
  ok("PF-15 DW3 pass (review m5): cases close or are withdrawn and storage is in MB of documents", words.find((c) => c.metric === "active_individual_cases")?.words === "You have 7 active individual cases; Starter (Sample) allows 5. Close or withdraw 2 of them or choose a larger plan."
    && words.find((c) => c.metric === "storage_mb")?.words === "Your documents take 250 MB; Starter (Sample) allows 100 MB. Remove 150 MB of documents or choose a larger plan.", words);

  // ------------------------------------------------------------- a firm's session reads no other firm (P-423 read)
  walls.wallUnscopedQueries();
  const walled = new Db();
  try {
    const before = sql(`select (select count(*) from platform_storage_over where firm_id = '${FIRM_B}') || ':' || (select count(*) from platform_limit_change_firm where firm_id = '${FIRM_B}')`);
    const cross = await walls.withFirm(FIRM_A, () => new PgEntitlements(walled, () => T0).limitOf(FIRM_B, "active_individual_cases"));
    const crossKey = await walls.withFirm(FIRM_A, () => new PgEntitlements(walled, () => T0).check("sample-solo", "active_individual_cases", 0));
    ok("PF-15 fail (cross-firm definer): firm A's session asking the definer function about firm B (by id or key) gets no firm, no plan, limit 0, refused", cross.firmId === null && cross.planCode === null && cross.limit === 0 && crossKey.allowed === false, { cross, crossKey });
    ok("PF-15 fail (cross-firm definer): and nothing is written for firm B", sql(`select (select count(*) from platform_storage_over where firm_id = '${FIRM_B}') || ':' || (select count(*) from platform_limit_change_firm where firm_id = '${FIRM_B}')`) === before);
    ok("PF-15 pass (cross-firm definer): firm A's own session still reads its own limit, and the case side with no scope reads firm B by key", (await walls.withFirm(FIRM_A, () => new PgEntitlements(walled, () => T0).limitOf(FIRM_A, "storage_mb"))).limit === (await new PgEntitlements(db, () => T0).limitOf(FIRM_A, "storage_mb")).limit && (await new PgEntitlements(walled, () => T0).limitOf("sample-solo", "active_individual_cases")).limit === 25);
    ok("PF-15 fail (walls): in firm B's session, firm A's limit dates are not visible", (await walls.withFirm(FIRM_B, () => walled.platformLimitChangeFirm.findMany({ where: { firmId: FIRM_A } }))).length === 0);
    const wl = await walls.inRequest({ method: "PATCH", url: "/api/system/plans/solo/limits", originalUrl: "/api/system/plans/solo/limits", path: "/api/system/plans/solo/limits" }, () => new PlanLimitChanges({ db: walled, audit: auditEvent, mail: null }).change(ours, { plan: "solo", metric: "storage_mb", value: 4900, reason: "Sample walled lowering" }));
    ok("PF-15 DW9 pass (walls): the change runs on the walled pool, in a request on PF-4s's future system route, through its named crossing and reaches firm B on the solo plan", wl.lowered && wl.firms.some((f) => f.firmId === FIRM_B), wl);
    const soloSeats = Number(sql(`select seats_limit from platform_plan where code = 'solo'`));
    const ws = await walls.inRequest({ method: "PATCH", url: "/api/system/plans/solo/limits", path: "/api/system/plans/solo/limits" }, () => new PlanLimitChanges({ db: walled, audit: auditEvent, mail: null }).change(ours, { plan: "solo", metric: "seats", value: soloSeats + 2, reason: "Sample walled seats raise" }));
    ok("PF-15 DW9 pass (walls, break M1): a seats change through the change row works on the walled pool (only a direct update is refused)", !ws.lowered && Number(sql(`select seats_limit from platform_plan where code = 'solo'`)) === soloSeats + 2);
  } finally { await walled.$disconnect(); }
} catch (e) {
  fail++; console.log(`FAIL  PF-15: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await db.$disconnect();
  execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
