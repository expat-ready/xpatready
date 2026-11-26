// R1.79 part 1 (BACKLOG CS-R1 part 1; map row 79; AG-14-1, -4, -9, -10, -12, -19, -22, -33): the case side's dashboard
// numbers on PF-R1's one door. Named "CS-R1 DW<n>", each a pass and a fail. One scratch database with every migration and
// the two Sample firms' staff (seedSampleFirms); cases, stages and findings are written with the replica role (a fixture
// needs no release), then every read runs through the app role xr_app inside the caller's firm, as the API server runs
// it (the case tables have no row policy until CS-W4: the reads' own firm condition is the wall, and DW3 tests it). About 3,000 cases of the other firm stand in for about 100 firms' worth (P-562). No server, no
// browser, no model call (US$0). Every value is Sample. The database is dropped at the end.
//   tsx studio/tests/check_csr1_reports.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { overBudget, REPORT_KEYS, type MetricAnswer, type ReportAnswer } from "../ports/metrics.ts";
import { caseMetrics, CaseReports, trendMonths, TREND_DEFAULT_MONTHS, TREND_MAX_MONTHS } from "../api/src/case-reports.ts";
import { walledPool, wallUnscopedQueries, withFirm } from "../api/src/platform/firm-scope.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { MetricRegistry } from "../api/src/platform/reports/registry.ts";
import { ReportsController } from "../api/src/platform/reports/routes.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import type { Db } from "../api/src/core.ts";
import caseReportsFeature from "../api/src/features/case-reports.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csr1_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const qt = (s: string) => `'${s.replace(/'/g, "''")}'`;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------------------------------------ the trend's months (pure)
const TODAY = "2026-11-25";
ok("CS-R1 DW5 pass: with no dates the trend is the last 6 months up to this one", eq(trendMonths({}, TODAY), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]) && TREND_DEFAULT_MONTHS === 6);
ok("CS-R1 DW5 pass: a period across a year end lists its months in order", eq(trendMonths({ from: "2025-11-15", to: "2026-02-01" }, TODAY), ["2025-11", "2025-12", "2026-01", "2026-02"]));
ok("CS-R1 DW5 fail: a ten-year period is cut to the last 24 months, never an unbounded list (AG-14-28)", (() => { const m = trendMonths({ from: "2016-01-01", to: "2026-11-30" }, TODAY); return m.length === TREND_MAX_MONTHS && m[0] === "2024-12" && m.at(-1) === "2026-11"; })());
ok("CS-R1 DW5 fail (break m3): a start before 1970 reads from 1970, and a two-digit year is never read as 19xx", trendMonths({ from: "0000-01-01", to: "1970-02-10" }, TODAY).join() === "1970-01,1970-02" && trendMonths({ from: "0050-03-01", to: "0050-03-01" }, TODAY).join() === "1970-01");

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const walled = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_)) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const firmId = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firmId("sample-firm"), B = firmId("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firm] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const OWNER = ctxOf("user-R"), OFFICER = ctxOf("user-O"), SOLO = ctxOf("user-S");
  const without = (c: StaffContext, ...gone: string[]): StaffContext => ({ ...c, keys: c.keys.filter((k) => !gone.includes(k)) });
  ok("CS-R1 setup: user-R is the Sample firm's Owner (report view.all), user-O its Case Officer (report view.own only), both with agent/case:view.all; user-S the solo firm's",
    OWNER.keys.includes(REPORT_KEYS.all) && OFFICER.keys.includes(REPORT_KEYS.own) && !OFFICER.keys.includes(REPORT_KEYS.all) && OFFICER.keys.includes("agent/case:view.all") && SOLO.firmId === B && OWNER.firmId === A, { R: OWNER.roles, O: OFFICER.roles });

  // ---------------------------------------------------------------------------------------------- fixtures (all Sample)
  const W = randomUUID();
  sql(`insert into workspace (id, key, label) values ('${W}', 'csr1-${W.slice(0, 8)}', 'CS-R1 (Sample)')`);
  // A combination hangs below its Pathway, as on real data (check_csc1_count.ts): combination → PROGRAM → Pathway, and
  // that Pathway sits inside an outer Pathway of the other client type, so only the nearest Pathway gives the right group
  // (review 2 N1 (a): a walk that stops at the first node, or takes the farthest Pathway, fails DW5).
  const combo = (clientType: string) => {
    const k = randomUUID().slice(0, 8), c = randomUUID(), other = clientType === "CORPORATE" ? "INDIVIDUAL" : "CORPORATE";
    sql(`set session_replication_role = replica;
      insert into program_def (id, workspace_id, program_node_key, parent_node_key, node_kind, label, client_type, created_by) values
        ('${randomUUID()}', '${W}', 'csr1.${k}.outer', null, 'PATHWAY', 'Sample outer pathway', '${other}', 'csr1'),
        ('${randomUUID()}', '${W}', 'csr1.${k}.pathway', 'csr1.${k}.outer', 'PATHWAY', 'Sample pathway', '${clientType}', 'csr1');
      insert into program_def (id, workspace_id, program_node_key, parent_node_key, node_kind, label, created_by) values ('${c}', '${W}', 'csr1.${k}.program', 'csr1.${k}.pathway', 'PROGRAM', 'Sample program', 'csr1');
      insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${c}', '${W}', '${c}', 'csr1.${k}', 'Sample', '[]', 'csr1')`);
    return c;
  };
  const INDIVIDUAL = combo("INDIVIDUAL"), CORPORATE = combo("CORPORATE");
  let n = 0;
  const newCase = (firmKey: string, o: { combo?: string; created: string; closed?: string; fileOwner?: string }) => {
    const id = randomUUID(), client = randomUUID(), firm = firmId(firmKey);
    sql(`set session_replication_role = replica;
      insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, file_owner, created_by) values ('${client}', '${W}', '${firmKey}', '${firm}', ${++n}, 'Sample client ${n}', 'PERSON', '${randomUUID()}', ${o.fileOwner ? qt(o.fileOwner) : "null"}, 'csr1');
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status, created_at, closed_at, close_outcome, closed_reason)
        values ('${id}', '${W}', '${o.combo ?? INDIVIDUAL}', 'user-P', 'user-O', 'C-2026-${String(n).padStart(5, "0")}', '${firmKey}', '${firm}', '${client}', ${o.closed ? "'CLOSED'" : "'OPEN'"}, '${o.created}', ${o.closed ? `'${o.closed}', 'CLOSED_BY_STAFF', 'Sample'` : "null, null, null"})`);
    return id;
  };
  let ord = 0;
  const stage = (caseId: string, firmKey: string, name: string, state: string, started: string, ended?: string) => {
    const id = randomUUID();
    sql(`set session_replication_role = replica; insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, application_subject_id, started_from, state, started_at, ended_at)
      values ('${id}', '${W}', '${caseId}', '${firmKey}', '${firmId(firmKey)}', ${++ord}, 'csr1.${ord}', ${qt(name)}, ${qt(name)}, '${randomUUID()}', '${randomUUID()}', 'BEGIN', '${state}', '${started}', ${ended ? `'${ended}'` : "null"})`);
    return id;
  };
  const finding = (caseId: string, stageId: string, state: string, created = "2026-11-10T10:00:00Z") =>
    sql(`set session_replication_role = replica; insert into review_finding (id, workspace_id, case_id, subject_id, severity, source, state, quote, created_by, stage_id, created_at, state_reason, state_by, state_at, resolved_by, resolved_at)
      values ('${randomUUID()}', '${W}', '${caseId}', '${randomUUID()}', 'MAJOR', 'manual', '${state}', 'Sample', 'csr1', '${stageId}', '${created}',
        ${state === "open" || state === "resolved" ? "null, null, null" : "'Sample', 'csr1', now()"}, ${state === "resolved" ? "'csr1', now()" : "null, null"})`);
  const team = (caseId: string, userId: string, ended = false) =>
    sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by${ended ? ", ended_at, ended_by, end_reason" : ""}) values ('${randomUUID()}', '${W}', '${caseId}', '${userId}', 'OFFICER', 'user-R'${ended ? ", now(), 'user-R', 'Sample'" : ""})`);

  // Firm A. c1: open, individual, the Case Officer on its team; a finished Visitor stage (2 days), now in Study permit.
  // c2: open, corporate, nobody's; in Study permit. c3: closed in November, the Case Officer its client's file owner; a
  // finished Work permit stage (10 days). c5: open, the Case Officer's team row ended. Firm B: c4, open, with findings.
  const c1 = newCase("sample-firm", { created: "2026-10-05T09:00:00Z" });
  team(c1, OFFICER.staffId);
  stage(c1, "sample-firm", "Visitor record", "ENDED_NEXT_STARTED", "2026-10-05T09:00:00Z", "2026-10-07T09:00:00Z");
  const s1 = stage(c1, "sample-firm", "Study permit", "CURRENT", "2026-10-07T09:00:00Z");
  const c2 = newCase("sample-firm", { combo: CORPORATE, created: "2026-11-02T09:00:00Z" });
  const s2 = stage(c2, "sample-firm", "Study permit", "CURRENT", "2026-11-02T09:00:00Z");
  const c3 = newCase("sample-firm", { created: "2026-09-10T09:00:00Z", closed: "2026-11-03T09:00:00Z", fileOwner: OFFICER.staffId });
  const s3 = stage(c3, "sample-firm", "Work permit", "ENDED_NEXT_STARTED", "2026-09-10T09:00:00Z", "2026-09-20T09:00:00Z");
  const c5 = newCase("sample-firm", { created: "2026-11-04T09:00:00Z" });
  team(c5, OFFICER.staffId, true);
  stage(c5, "sample-firm", "Work permit", "CURRENT", "2026-11-04T09:00:00Z");
  // Biometrics, finished on three cases: 1, 2 and 9 days (average 4, median 2: the two differ, review M3); a stage that
  // "ends" before it starts (break m4) and a case with no stage yet (shown as stage null, never a made-up name: break m1).
  stage(c1, "sample-firm", "Biometrics", "ENDED_NEXT_STARTED", "2026-10-01T09:00:00Z", "2026-10-02T09:00:00Z");
  stage(c2, "sample-firm", "Biometrics", "ENDED_NEXT_STARTED", "2026-10-01T09:00:00Z", "2026-10-03T09:00:00Z");
  stage(c5, "sample-firm", "Biometrics", "ENDED_NEXT_STARTED", "2026-10-01T09:00:00Z", "2026-10-10T09:00:00Z");
  stage(c2, "sample-firm", "Backwards (Sample)", "ENDED_NEXT_STARTED", "2026-10-10T09:00:00Z", "2026-10-01T09:00:00Z");
  // c6: opened 31 Oct at 23:30 in Toronto (04:30 UTC on 1 Nov): an October case in the firm's zone (break m2)
  newCase("sample-firm", { created: "2026-11-01T03:30:00Z" });
  const c4 = newCase("sample-solo", { created: "2026-11-05T09:00:00Z" });
  const s4 = stage(c4, "sample-solo", "Study permit", "CURRENT", "2026-11-05T09:00:00Z");
  finding(c1, s1, "open"); finding(c1, s1, "resolved"); finding(c1, s1, "acknowledged", "2026-10-01T10:00:00Z");
  finding(c2, s2, "open", "2026-10-15T10:00:00Z");
  finding(c3, s3, "open");   // a closed case: not counted
  finding(c4, s4, "open"); finding(c4, s4, "open");
  // About 100 firms' worth (P-562): ~3,000 more cases of firm B, each in a stage, half with an open finding.
  sql(`set session_replication_role = replica;
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status, created_at)
      select gen_random_uuid(), '${W}', '${INDIVIDUAL}', 'user-P', 'user-S', 'C-2025-' || lpad(g::text, 5, '0'), 'sample-solo', '${B}', (select client_id from runtime_case where id = '${c4}'), 'OPEN', '2026-08-01'::timestamptz + (g || ' hours')::interval from generate_series(1, 3000) g;
    insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, application_subject_id, started_from, state, started_at, ended_at)
      select gen_random_uuid(), '${W}', c.id, 'sample-solo', '${B}', 1, 'csr1.b', 'Bulk stage', 'Bulk stage', '${INDIVIDUAL}', gen_random_uuid(), 'BEGIN', 'ENDED_NEXT_STARTED', c.created_at, c.created_at + interval '3 days' from runtime_case c where c.case_number like 'C-2025-%';
    insert into review_finding (id, workspace_id, case_id, subject_id, severity, source, state, quote, created_by, stage_id)
      select gen_random_uuid(), '${W}', s.case_id, gen_random_uuid(), 'MAJOR', 'manual', 'open', 'Sample', 'csr1', s.id from case_stage s where s.stage_key = 'csr1.b' and (s.ord + abs(hashtext(s.id::text))) % 2 = 0;
    analyze`);

  // Firm B also has 400 combinations, a third of them corporate, spread over its cases (the client-type filter's load,
  // review and break M2), and 206 more stage names (one of 45 days) on 206 more cases, past the 200-row cap (break M3).
  sql(`set session_replication_role = replica;
    insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by)
      select gen_random_uuid(), '${W}', 'csr1.many.' || g, 'PATHWAY', 'Sample pathway ' || g, case when g % 3 = 0 then 'CORPORATE' else 'INDIVIDUAL' end, 'csr1' from generate_series(1, 400) g;
    insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by)
      select gen_random_uuid(), '${W}', p.id, 'csr1.many.' || p.program_node_key, 'Sample', '[]', 'csr1' from program_def p where p.program_node_key like 'csr1.many.%';
    with m as (select id, row_number() over (order by id) as n from combination where combination_key like 'csr1.many.%'), k as (select id, row_number() over (order by id) as n from runtime_case where case_number like 'C-2025-%')
      update runtime_case c set combination_id = m.id from k, m where c.id = k.id and m.n = 1 + (k.n % 400);
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status, created_at, closed_at, close_outcome, closed_reason)
      select gen_random_uuid(), '${W}', '${INDIVIDUAL}', 'user-P', 'user-S', 'C-2024-' || lpad(g::text, 5, '0'), 'sample-solo', '${B}', (select client_id from runtime_case where id = '${c4}'), 'CLOSED', '2026-07-01'::timestamptz, '2026-07-02'::timestamptz, 'CLOSED_BY_STAFF', 'Sample' from generate_series(1, 206) g;
    insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, application_subject_id, started_from, state, started_at, ended_at)
      select gen_random_uuid(), '${W}', c.id, 'sample-solo', '${B}', 1, 'csr1.n', 'Many stage ' || lpad(substr(c.case_number, 8), 5, '0'), 'Sample', gen_random_uuid(), gen_random_uuid(), 'BEGIN', 'ENDED_NEXT_STARTED', '2026-07-01',
        case when c.case_number = 'C-2024-00103' then '2026-08-15'::timestamptz else '2026-07-02'::timestamptz end from runtime_case c where c.case_number like 'C-2024-%';
    analyze`);

  wallUnscopedQueries();   // from here as in the API server: a query with no firm reads nothing
  const registry = new MetricRegistry();
  new CaseReports(registry, walled as unknown as Db).onModuleInit();
  const route = new ReportsController(registry);
  const ask = (who: StaffContext, body: unknown): Promise<ReportAnswer> => withFirm(who.firmId, () => route.query({ platform: who }, body));
  const one = async (who: StaffContext, key: string, filters: Record<string, string> = {}): Promise<MetricAnswer> => (await ask(who, { metrics: [key], filters })).metrics[0];
  const rows = (m: MetricAnswer) => (m.reading?.kind === "LIST" ? m.reading.rows : null);
  const count = (m: MetricAnswer) => (m.reading?.kind === "COUNT" ? m.reading.value : null);

  // ---------------------------------------------------------------------------------- DW1: registered on the one door
  ok("CS-R1 DW1 pass: the feature file adds CaseReports to the app at start-up (features/case-reports.ts)", caseReportsFeature.providers?.includes(CaseReports) && !("controllers" in caseReportsFeature));
  const keys = registry.definitions().map((d) => d.key);
  ok("CS-R1 DW1 pass: the four case numbers are registered on PF-R1's registry, each with its definition in words (AG-14-4)",
    eq(keys, ["reports.cases.case_load", "reports.cases.new_vs_closed", "reports.cases.stage_durations", "reports.cases.open_review_findings"]) && registry.definitions().every((d) => d.module === "cases" && d.source.length > 20 && d.moneyTreatment === "NONE"));
  const ownerDash = route.dashboard({ platform: OWNER }, "owner").widgets;
  ok("CS-R1 DW1 pass: the seeded dashboards now light their case widgets (case load, stage durations), with the label", ownerDash.filter((w) => w.metricKey.startsWith("reports.cases.") && w.registered).map((w) => w.label).join() === "Open cases by stage,Time spent in each stage");
  ok("CS-R1 DW1 fail: a second registration of a case key is refused (one owner per key)", (() => { try { new CaseReports(registry, walled as unknown as Db).onModuleInit(); return false; } catch (e) { return /already registered/.test(String(e)); } })());

  // ---------------------------------------------------------------------------------- DW2: exact counts for the firm
  const load = await one(OWNER, "reports.cases.case_load");
  ok("CS-R1 DW2 pass: case load counts the firm's open cases by their current stage (Study permit 2, Work permit 1, no stage yet 1; closed c3 out)", load.status === "OK" && load.scope === "all" && eq(rows(load), [{ stage: "Study permit", cases: 2 }, { stage: "Work permit", cases: 1 }, { stage: null, cases: 1 }]), load);
  ok("CS-R1 DW2 pass: case load's date range keeps the cases opened in it (November: c2 and c5)", eq(rows(await one(OWNER, "reports.cases.case_load", { from: "2026-11-01", to: "2026-11-30" })), [{ stage: "Study permit", cases: 1 }, { stage: "Work permit", cases: 1 }]));
  const trend = await one(OWNER, "reports.cases.new_vs_closed", { from: "2026-09-01", to: "2026-11-30" });
  ok("CS-R1 DW2 pass: new versus closed per month (Sep 1 opened; Oct 1; Nov 2 opened, 1 closed)", eq(rows(trend), [{ month: "2026-09", opened: 1, closed: 0 }, { month: "2026-10", opened: 2, closed: 0 }, { month: "2026-11", opened: 2, closed: 1 }]), trend);
  ok("CS-R1 DW5 pass: months are the firm's (Toronto): a case opened 31 Oct 23:30 there is October's, not November's", rows(trend)?.[1]?.opened === 2);
  // review 2 N1 (b): the firm's stored zone is read, not assumed: in Kolkata the same case (09:00 on 1 Nov there) is November's
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.time_zone', '"Asia/Kolkata"', 'csr1')`);
  const kolkata = rows(await one(OWNER, "reports.cases.new_vs_closed", { from: "2026-09-01", to: "2026-11-30" }));
  sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`);
  ok("CS-R1 DW5 fail: with the firm's zone set to Asia/Kolkata, that case moves to November (Oct 1 opened, Nov 3)", kolkata?.[1]?.opened === 1 && kolkata?.[2]?.opened === 3, kolkata);
  ok("CS-R1 DW5 pass (break m3): a start date before 1970 reads from 1970 at the door, never UNAVAILABLE", (await one(OWNER, "reports.cases.open_review_findings", { from: "0001-01-01", to: "2026-11-30" })).status === "OK");
  const mid = await one(OWNER, "reports.cases.new_vs_closed", { from: "2026-09-15", to: "2026-11-02" });
  ok("CS-R1 DW5 fail: the trend keeps to the period's own days (c3 opened 10 Sep is before 15 Sep; c5 opened 4 Nov is after 2 Nov; c2 opened 2 Nov counts: the last day is inclusive)", eq(rows(mid), [{ month: "2026-09", opened: 0, closed: 0 }, { month: "2026-10", opened: 2, closed: 0 }, { month: "2026-11", opened: 1, closed: 0 }]), mid);
  const dur = await one(OWNER, "reports.cases.stage_durations");
  ok("CS-R1 DW2 pass: stage durations, slowest first, average and median in days (Work permit 10, Biometrics 4 and median 2, Visitor record 2)",
    eq(rows(dur), [{ stage: "Work permit", ended: 1, average_days: 10, median_days: 10, slowest: "Slowest" }, { stage: "Biometrics", ended: 3, average_days: 4, median_days: 2, slowest: null }, { stage: "Visitor record", ended: 1, average_days: 2, median_days: 2, slowest: null }]), dur);
  ok("CS-R1 DW2 fail: a stage that ends before it starts is never a negative duration (left out)", !(rows(dur) ?? []).some((r) => r.stage === "Backwards (Sample)"));
  const found = await one(OWNER, "reports.cases.open_review_findings");
  ok("CS-R1 DW2 pass: open review findings count only state open on open cases (c1 1, c2 1; resolved, acknowledged and closed-case ones out)", count(found) === 2, found);

  // ---------------------------------------------------------------------------------- DW3: another firm never changes them
  const soloFound = await one(SOLO, "reports.cases.open_review_findings"), soloLoad = await one(SOLO, "reports.cases.case_load");
  ok("CS-R1 DW3 pass: the solo firm sees its own numbers (its ~3,000 cases), never firm A's", (count(soloFound) ?? 0) > 1000 && !(rows(soloLoad) ?? []).some((r) => r.stage === "Work permit"), { soloFound, soloLoad: rows(soloLoad) });
  ok("CS-R1 DW3 fail: firm B's 1,500 open findings and its Study permit case never reach firm A's figures", count(found) === 2 && rows(load)?.[0]?.cases === 2);
  const outside = await withFirm(B, () => caseMetrics(walled)[3].read({ firmId: A, staffId: OWNER.staffId, keys: OWNER.keys, scope: "all" }, {}));
  ok("CS-R1 DW3 fail: a read run as firm B naming firm A's id counts nothing (PF-12's walls)", outside.kind === "COUNT" && outside.value === 0, outside);

  // ---------------------------------------------------------------------------------- DW4: rights (AG-14-19)
  const oLoad = await one(OFFICER, "reports.cases.case_load"), oFound = await one(OFFICER, "reports.cases.open_review_findings"), oDur = await one(OFFICER, "reports.cases.stage_durations");
  ok("CS-R1 DW4 pass: the Case Officer (report view.own) counts only own cases: the team case c1 (Study permit 1, 1 finding) and the file-owner case c3 (its Work permit stage)",
    oLoad.scope === "own" && eq(rows(oLoad), [{ stage: "Study permit", cases: 1 }]) && count(oFound) === 1 && eq(rows(oDur)?.map((r) => r.stage), ["Work permit", "Visitor record", "Biometrics"]), { oLoad, oFound, oDur });
  ok("CS-R1 DW4 fail: an ended team row (c5) gives the Case Officer nothing; the same metric firm-wide is wider", !(rows(oLoad) ?? []).some((r) => r.stage === "Work permit") && (rows(load)?.length ?? 0) > (rows(oLoad)?.length ?? 0));
  const sent = await ask(OFFICER, { metrics: ["reports.cases.open_review_findings"], scope: "all" });
  ok("CS-R1 DW4 fail: a scope sent in the request is ignored (still own)", sent.metrics[0].scope === "own" && count(sent.metrics[0]) === 1);
  const ownCases = without(OWNER, "agent/case:view.all");
  ok("CS-R1 DW4 fail: report view.all with case view.own only counts own cases (the case keys bound every number; the Owner owns none)", count(await one(ownCases, "reports.cases.open_review_findings")) === 0 && eq(rows(await one(ownCases, "reports.cases.case_load")), []));
  ok("CS-R1 DW4 fail: with neither case key, every number is empty or zero, never an error", count(await one(without(OWNER, "agent/case:view.all", "agent/case:view.own"), "reports.cases.open_review_findings")) === 0);
  const forT = await one(OWNER, "reports.cases.open_review_findings", { staffId: OFFICER.staffId });
  ok("CS-R1 DW4 pass: the Owner's person filter narrows to that person's cases (the Case Officer: 1)", count(forT) === 1, forT);
  ok("CS-R1 DW4 fail: a person filter naming another firm's staff counts nothing", count(await one(OWNER, "reports.cases.open_review_findings", { staffId: SOLO.staffId })) === 0);
  let refused = 0; try { await ask(OFFICER, { metrics: ["reports.cases.case_load"], filters: { staffId: OWNER.staffId } }); } catch (e) { refused = (e as { getStatus(): number }).getStatus(); }
  ok("CS-R1 DW4 fail: the Case Officer naming the Owner in the person filter is 403 (own only)", refused === 403);

  // ---------------------------------------------------------------------------------- DW5: client type and dates (AG-14-33, -20)
  const corp = await ask(OWNER, { metrics: ["reports.cases.case_load", "reports.cases.open_review_findings"], filters: { clientType: "CORPORATE" } });
  ok("CS-R1 DW5 pass: Corporate keeps the corporate case only (c2: Study permit 1, its finding)", eq(rows(corp.metrics[0]), [{ stage: "Study permit", cases: 1 }]) && count(corp.metrics[1]) === 1, corp);
  const indiv = await ask(OWNER, { metrics: ["reports.cases.open_review_findings"], filters: { clientType: "INDIVIDUAL" } });
  ok("CS-R1 DW5 fail: Individual leaves the corporate case out (c1's finding only)", count(indiv.metrics[0]) === 1);
  ok("CS-R1 DW5 pass: a date range keeps the findings raised in it (October: c2's)", count(await one(OWNER, "reports.cases.open_review_findings", { from: "2026-10-01", to: "2026-10-31" })) === 1);
  ok("CS-R1 DW5 pass: the last day of a range is inclusive (to 15 Oct keeps c2's finding of 15 Oct)", count(await one(OWNER, "reports.cases.open_review_findings", { from: "2026-10-15", to: "2026-10-15" })) === 1);
  ok("CS-R1 DW5 fail: a range with nothing in it is 0 and an empty table, never an error", count(await one(OWNER, "reports.cases.open_review_findings", { from: "2020-01-01", to: "2020-01-31" })) === 0 && eq(rows(await one(OWNER, "reports.cases.stage_durations", { from: "2020-01-01", to: "2020-01-31" })), []));

  // ---------------------------------------------------------------------------------- DW6: drill-through (AG-14-22)
  ok("CS-R1 DW6 pass (review M1): no case number drills yet: the case list keeps neither to open cases nor to the viewer's scope", registry.definitions().every((d) => d.drillTarget === null) && load.drill === null);
  ok("CS-R1 DW6 fail: not even with no filter, where the list would show closed and out-of-scope cases", (await one(ownCases, "reports.cases.case_load")).drill === null);

  // ---------------------------------------------------------------------------------- the 200-row cap (AG-14-28; break M3)
  const many = rows(await one(SOLO, "reports.cases.stage_durations")) ?? [];
  ok("CS-R1 DW2 pass: past 200 stage names the table keeps 199 and says how many more (8 of 207), never a silent cut", many.length === 200 && many.at(-1)?.stage === "8 more stages" && many.at(-1)?.ended === 8, many.at(-1));
  ok("CS-R1 DW2 fail: the slowest stage (45 days) is found before the cut: it is first and the only one marked", many[0]?.stage === "Many stage 00103" && many[0]?.slowest === "Slowest" && many.filter((r) => r.slowest).length === 1, many.slice(0, 2));

  // ---------------------------------------------------------------------------------- DW7: the read budget (STANDARDS §9)
  const ctxs = [OWNER, OFFICER, SOLO].map((c) => ({ firmId: c.firmId, staffId: c.staffId, keys: c.keys, scope: (c === OFFICER ? "own" : "all") as "own" | "all" }));
  const slow = await overBudget(registry.all(), ctxs, (f, fn) => withFirm(f, fn));
  ok("CS-R1 DW7 pass: every case number answers within 200 ms at each scope with ~3,000 cases of the other firm", slow.length === 0, slow);
  const corpSlow = await overBudget(registry.all(), ctxs, (f, fn) => withFirm(f, fn), { clientType: "CORPORATE" });
  ok("CS-R1 DW7 pass (review and break M2): with the client-type switch on and 400 combinations, still within 200 ms (one query, not one per combination)", corpSlow.length === 0, corpSlow);
  const soloCorp = count(await one(SOLO, "reports.cases.open_review_findings", { clientType: "CORPORATE" })), soloAll = count(await one(SOLO, "reports.cases.open_review_findings"));
  ok("CS-R1 DW5 pass: on 400 combinations Corporate keeps about a third of the findings, Individual the rest, together all", soloCorp !== null && soloAll !== null && soloCorp > soloAll / 5 && soloCorp < soloAll / 2 && soloCorp + (count(await one(SOLO, "reports.cases.open_review_findings", { clientType: "INDIVIDUAL" })) ?? 0) === soloAll, { soloCorp, soloAll });
  const tight = await overBudget(registry.all(), ctxs.slice(2), (f, fn) => withFirm(f, fn), {}, -1);
  ok("CS-R1 DW7 fail: the same check with no budget names every number (it bites)", tight.length === 4, tight);
} finally {
  await walled.$disconnect().catch(() => {});
  await db.$disconnect().catch(() => {});
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nCS-R1 case reports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
