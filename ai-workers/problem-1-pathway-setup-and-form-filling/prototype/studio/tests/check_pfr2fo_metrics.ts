// R1.79 part 2 (BACKLOG PF-R2fo; map row 79; AG-14-5, -7, -31; AG-2-87 rules 1-6, 12, 13, 18): the front office's sales
// numbers on PF-R1's one door. Named "PF-R2fo DW<n>", each a pass and a fail. One scratch database with every migration,
// the two Sample firms and their front offices (stages, reasons); leads, prospects and calls are written with the replica
// role, then every read runs through the app role xr_app under PF-12's walls, inside the caller's firm, as the API server
// runs it. About 5,000 leads of the other firm stand in for about 100 firms' worth (P-562). No server, no browser, no
// model call (US$0). Every value is Sample. The database is dropped at the end.
//   tsx studio/tests/check_pfr2fo_metrics.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { overBudget, REPORT_KEYS, type MetricAnswer, type ReportAnswer } from "../ports/metrics.ts";
import type { Db } from "../api/src/core.ts";
import salesReportsFeature from "../api/src/features/front-office-reports.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { SalesReports, salesMetrics } from "../api/src/front-office/reports/metrics.ts";
import { walledPool, wallUnscopedQueries, withFirm } from "../api/src/platform/firm-scope.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { MetricRegistry } from "../api/src/platform/reports/registry.ts";
import { ReportsController } from "../api/src/platform/reports/routes.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pfr2fo_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The import boundary (row PF-R2fo: "no figure reads a case-side or money table"): the file names only fo_* tables and platform_staff.
const SRC = readFileSync(join(STUDIO, "api", "src", "front-office", "reports", "metrics.ts"), "utf8");
const tables = [...new Set([...SRC.matchAll(/\b(?:from|join)\s+([a-z_]+)\b/g)].map((m) => m[1]))].sort();
ok("PF-R2fo DW5 pass: the sales numbers read only front-office tables and platform_staff", tables.length > 0 && tables.every((t) => t.startsWith("fo_") || t === "platform_staff"), tables);
ok("PF-R2fo DW5 fail: no case-side or money table and no case or money import", !/runtime_case|case_stage|money_|review_finding/.test(SRC) && !/from "\.\.\/\.\.\/(case|client-money)/.test(SRC));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const walled = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_)) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("PF-R2fo setup: both Sample firms have a front office", fo.failed.length === 0, fo);
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
  ok("PF-R2fo setup: the Owner holds report and prospect view.all; the Case Officer report view.own only",
    OWNER.keys.includes(REPORT_KEYS.all) && OWNER.keys.includes("agent/prospect:view.all") && OFFICER.keys.includes(REPORT_KEYS.own) && !OFFICER.keys.includes(REPORT_KEYS.all), { R: OWNER.roles, O: OFFICER.roles });

  // ---------------------------------------------------------------------------------------------- fixtures (all Sample)
  const stageOf = (firm: string, pipeline: string, kind: string) => sql(`select id from fo_stage where firm_id = '${firm}' and pipeline = '${pipeline}' and kind = '${kind}' and active order by sort_order limit 1`);
  const reason = (firm: string, key: string) => sql(`select id || '|' || kind from fo_reason where firm_id = '${firm}' and key = '${key}'`).split("|");
  let seq = 700000;
  const person = (f: string) => { const id = randomUUID(); sql(`set session_replication_role = replica; insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) values ('${id}', '${f}', 'Pfr2fo${++seq}', 'Sample', 'pfr2fo', now())`); return id; };
  const lead = (f: string, o: { owner?: string | null; arrived?: string; state?: string; source?: string; closeKey?: string; engagedBy?: string; engagedAt?: string }) => {
    const id = randomUUID(), p = person(f), [rid, rkind] = o.closeKey ? reason(f, o.closeKey) : [null, null];
    sql(`set session_replication_role = replica; insert into fo_lead (id, firm_id, number, person_id, door, source, owner_staff_id, state, arrived_at, close_reason_id, close_reason_kind, closed_at, closed_by, engaged_at, engaged_by, created_by, updated_at)
      values ('${id}', '${f}', 'L-${++seq}', '${p}', 'MANUAL', '${o.source ?? "Phone call"}', ${o.owner ? `'${o.owner}'` : "null"}, '${o.state ?? "OPEN"}', '${o.arrived ?? "2026-11-10T10:00:00Z"}',
        ${rid ? `'${rid}', '${rkind}', now(), 'pfr2fo'` : "null, null, null, null"}, ${o.engagedAt ? `'${o.engagedAt}'` : "null"}, ${o.engagedBy ? `'staff:${o.engagedBy}'` : "null"}, 'pfr2fo', now())`);
    return { id, person: p };
  };
  const prospect = (f: string, l: { id: string; person: string }, o: { type?: string; kind?: string; owner?: string; created?: string; wonAt?: string; lostKey?: string }) => {
    const id = randomUUID(), type = o.type ?? "INDIVIDUAL", [rid, rkind] = o.lostKey ? reason(f, o.lostKey) : [null, null];
    sql(`set session_replication_role = replica; insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, won_at, won_via, lost_reason_id, lost_reason_kind, created_by, created_at, updated_at)
      values ('${id}', '${f}', 'P-${++seq}', '${l.id}', '${type}', '${stageOf(f, type, o.kind ?? "ACTIVE")}', ${type === "CORPORATE" ? `null, '${randomUUID()}'` : `'${l.person}', null`}, '${l.person}', ${o.owner ? `'${o.owner}'` : "null"}, ${o.wonAt ? `'${o.wonAt}', 'CONVERTED'` : "null, null"},
        ${rid ? `'${rid}', '${rkind}'` : "null, null"}, 'pfr2fo', '${o.created ?? "2026-11-10T11:00:00Z"}', now())`);
    return id;
  };
  const call = (f: string, l: { id: string; person: string }, by: string, outcome: string) =>
    sql(`set session_replication_role = replica; insert into fo_call (id, firm_id, person_id, lead_id, direction, outcome, started_at, by_actor) values ('${randomUUID()}', '${f}', '${l.person}', '${l.id}', 'OUT', '${outcome}', '2026-11-11T10:00:00Z', 'staff:${by}')`);

  // Firm A, November: L1 the Owner's, engaged by the Owner, its prospect WON (Corporate); L2 the Officer's, engaged, its
  // prospect ACTIVE (Individual); L3 unassigned and open (Web form, arrived 1 Nov); L4 the Officer's, combined into
  // another lead (out of every figure); L5 the Owner's, arrived in October; L6 the Owner's, its prospect lost as a
  // duplicate (out of the win rate); a NURTURE prospect of the Owner. Calls: the Owner 2 (1 connected), the Officer 1.
  // A deactivated person with one call in November keeps an (Inactive) row; one with none has no row.
  const L1 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", engagedBy: OWNER.staffId, engagedAt: "2026-11-10T11:00:00Z" });
  prospect(A, L1, { type: "CORPORATE", kind: "WON", owner: OWNER.staffId, wonAt: "2026-11-20T10:00:00Z" });
  const L2 = lead(A, { owner: OFFICER.staffId, state: "ENGAGED", engagedBy: OFFICER.staffId, engagedAt: "2026-11-10T11:00:00Z" });
  prospect(A, L2, { owner: OFFICER.staffId });
  const L3 = lead(A, { owner: null, source: "Web form", arrived: "2026-11-01T10:00:00Z" });
  lead(A, { owner: OFFICER.staffId, state: "CLOSED", closeKey: "COMBINED_LEAD" });
  lead(A, { owner: OWNER.staffId, arrived: "2026-10-05T10:00:00Z" });
  const L6 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", engagedBy: OWNER.staffId, engagedAt: "2026-11-12T10:00:00Z" });
  prospect(A, L6, { kind: "LOST", owner: OWNER.staffId, lostKey: "DUPLICATE_PROSPECT", created: "2026-11-12T10:00:00Z" });
  const L7 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", arrived: "2026-09-01T10:00:00Z", engagedBy: OWNER.staffId, engagedAt: "2026-09-02T10:00:00Z" });
  prospect(A, L7, { kind: "NURTURE", owner: OWNER.staffId, created: "2026-09-02T10:00:00Z" });
  call(A, L1, OWNER.staffId, "CONNECTED"); call(A, L1, OWNER.staffId, "NO_ANSWER"); call(A, L2, OFFICER.staffId, "NO_ANSWER");
  const gone = randomUUID(), idle = randomUUID();
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values ('${gone}', '${A}', 'gone@example.test', 'Former Rep (Sample)', 'DEACTIVATED', now()), ('${idle}', '${A}', 'idle@example.test', 'Idle Former (Sample)', 'DEACTIVATED', now())`);
  call(A, L3, gone, "CONNECTED");
  // Firm B: ~5,000 leads, one unassigned, a few prospects.
  const LB = lead(B, { owner: SOLO.staffId }); lead(B, { owner: null });
  prospect(B, LB, { owner: SOLO.staffId });
  sql(`set session_replication_role = replica; insert into fo_lead (id, firm_id, number, person_id, door, source, owner_staff_id, arrived_at, created_by, updated_at)
    select gen_random_uuid(), '${B}', 'L-' || (300000 + g), '${LB.person}', 'MANUAL', 'Phone call', '${SOLO.staffId}', '2026-11-10T10:00:00Z', 'pfr2fo', now() from generate_series(1, 4999) g; analyze`);

  wallUnscopedQueries();
  const NOW = new Date("2026-11-25T10:00:00Z");
  const registry = new MetricRegistry();
  for (const m of salesMetrics(walled, () => NOW)) registry.register(m);
  const route = new ReportsController(registry);
  const ask = (who: StaffContext, body: unknown): Promise<ReportAnswer> => withFirm(who.firmId, () => route.query({ platform: who }, body));
  const one = async (who: StaffContext, key: string, filters: Record<string, string> = {}): Promise<MetricAnswer> => (await ask(who, { metrics: [key], filters })).metrics[0];
  const val = (m: MetricAnswer) => (m.reading && "value" in m.reading ? m.reading.value : null);
  const rows = (m: MetricAnswer) => (m.reading?.kind === "LIST" ? m.reading.rows : null);
  const NOV = { from: "2026-11-01", to: "2026-11-30" };

  // ---------------------------------------------------------------------------------- DW1: registered on the one door
  const keys = registry.definitions().map((d) => d.key);
  ok("PF-R2fo DW1 pass: seven sales numbers are registered, each with its definition in words", eq(keys, ["reports.sales.leads_added", "reports.sales.leads_by_source", "reports.sales.unassigned_waiting", "reports.sales.stage_counts", "reports.sales.engage_rate", "reports.sales.win_rate", "reports.sales.per_person"]) && registry.definitions().every((d) => d.module === "front-office" && d.source.length > 30));
  ok("PF-R2fo DW1 pass: the feature file adds SalesReports at start-up, and the seeded dashboards light leads added, win rate and stage counts",
    salesReportsFeature.providers?.includes(SalesReports) && route.dashboard({ platform: OWNER }, "case-manager").widgets.filter((w) => w.metricKey.startsWith("reports.sales.") && w.registered).length === 2 && route.dashboard({ platform: OWNER }, "owner").widgets.filter((w) => w.metricKey.startsWith("reports.sales.") && w.registered).length === 2);
  ok("PF-R2fo DW1 fail: the reports.sales.* keys are the front office's: another module cannot register one", (() => { try { registry.register({ ...salesMetrics(walled)[0], key: "reports.sales.other", module: "cases" }); return false; } catch (e) { return /front-office's/.test(String(e)); } })());

  // ---------------------------------------------------------------------------------- DW2: the seeded leads give exact counts
  ok("PF-R2fo DW2 pass: leads added in November: L1, L2, L3, L6 (4); the combined lead L4 counts nowhere, L5 arrived in October", val(await one(OWNER, "reports.sales.leads_added", NOV)) === 4);
  ok("PF-R2fo DW2 fail: without a period the October and September leads count too (6), never the combined one (7)", val(await one(OWNER, "reports.sales.leads_added")) === 6);
  ok("PF-R2fo DW2 pass: by source: Phone call 3, Web form 1", eq(rows(await one(OWNER, "reports.sales.leads_by_source", NOV)), [{ source: "Phone call", leads: 3 }, { source: "Web form", leads: 1 }]));
  const wait = await one(OWNER, "reports.sales.unassigned_waiting");
  ok("PF-R2fo DW2 pass: one unassigned lead waiting, the oldest 24 days (arrived 1 Nov)", eq(rows(wait), [{ waiting: 1, oldest_days: 24 }]), wait);
  const stages = rows(await one(OWNER, "reports.sales.stage_counts")) ?? [];
  ok("PF-R2fo DW2 pass: stage counts now: one ACTIVE Individual prospect, one parked (Nurture); WON and LOST ones out", stages.length === 2 && stages.some((r) => r.pipeline === "Individual" && r.prospects === 1 && r.stage !== "Parked (Nurture)") && stages.some((r) => r.stage === "Parked (Nurture)" && r.prospects === 1), stages);
  ok("PF-R2fo DW2 pass: engage rate in November: 3 of 4 leads now engaged = 75%", val(await one(OWNER, "reports.sales.engage_rate", NOV)) === 75);
  ok("PF-R2fo DW2 pass: win rate in November: 1 won of 2 engaged (the duplicate left out) = 50%", val(await one(OWNER, "reports.sales.win_rate", NOV)) === 50);
  ok("PF-R2fo DW2 fail: with no lead or prospect in the period a rate is none (null), never 0% or an error", val(await one(OWNER, "reports.sales.engage_rate", { from: "2020-01-01", to: "2020-01-31" })) === null && val(await one(OWNER, "reports.sales.win_rate", { from: "2020-01-01", to: "2020-01-31" })) === null);

  // ---------------------------------------------------------------------------------- DW3: the per-person table (AG-14-7, -31)
  const people = rows(await one(OWNER, "reports.sales.per_person", NOV)) ?? [];
  const row = (name: string) => people.find((r) => String(r.person).includes(name));
  const ownerName = sql(`select display_name from platform_staff where id = '${OWNER.staffId}'`);
  ok("PF-R2fo DW3 pass: the Owner's row: 4 leads owned now, 0 open prospects, 2 engaged, 1 won, 2 calls (1 connected)", eq(row(ownerName) && { ...row(ownerName), person: undefined }, { person: undefined, leads_owned: 4, open_prospects: 0, engaged: 2, won: 1, calls: 2, connected: 1 }), row(ownerName));
  ok("PF-R2fo DW3 pass: a deactivated person with a call in the period keeps a row as (Inactive)", row("Former Rep")?.person === "(Inactive) Former Rep (Sample)" && row("Former Rep")?.calls === 1);
  ok("PF-R2fo DW3 fail: a deactivated person with no activity in the period has no row", !row("Idle Former"));
  ok("PF-R2fo DW3 fail: the table is never ranked: it is in name order", eq(people.map((r) => String(r.person).replace("(Inactive) ", "")), [...people.map((r) => String(r.person).replace("(Inactive) ", ""))].sort((a, b) => a.localeCompare(b))));

  // ---------------------------------------------------------------------------------- DW4: rights (AG-2-87 rule 1, AG-14-19)
  const oAdded = await one(OFFICER, "reports.sales.leads_added", NOV), oPeople = rows(await one(OFFICER, "reports.sales.per_person", NOV)) ?? [];
  ok("PF-R2fo DW4 pass: view.own counts only the viewer's leads (the Case Officer: L2, 1) and only their own row", val(oAdded) === 1 && oAdded.scope === "own" && oPeople.length === 1 && oPeople[0].leads_owned === 1, { oAdded, oPeople });
  ok("PF-R2fo DW4 fail: unassigned leads waiting is firm-wide only: withheld at own scope", (await one(OFFICER, "reports.sales.unassigned_waiting")).status === "WITHHELD");
  const noProspectAll = without(OWNER, "agent/prospect:view.all");
  const noAssign = without(noProspectAll, "agent/prospect:assign");
  ok("PF-R2fo DW4 fail: report view.all without prospect view.all counts own leads only, plus the unassigned one with agent/prospect:assign (the lead rule bounds every number)",
    OWNER.keys.includes("agent/prospect:assign") && val(await one(noProspectAll, "reports.sales.leads_added", NOV)) === 3 && val(await one(noAssign, "reports.sales.leads_added", NOV)) === 2 && (rows(await one(noProspectAll, "reports.sales.per_person", NOV)) ?? []).length === 1);
  ok("PF-R2fo DW4 fail: without view.all or assign, unassigned leads waiting is 0", eq(rows(await one(noAssign, "reports.sales.unassigned_waiting")), [{ waiting: 0, oldest_days: null }]));
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.everyone_sees_all', 'false', 'pfr2fo')`);
  ok("PF-R2fo DW4 fail: with the firm's \"everyone sees all\" off, even the Owner counts own leads (plus unassigned, as the lead list shows)", val(await one(OWNER, "reports.sales.leads_added", NOV)) === 3);
  sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'`);
  ok("PF-R2fo DW4 pass: the Owner's person filter narrows to that person (the Case Officer: 1)", val(await one(OWNER, "reports.sales.leads_added", { ...NOV, staffId: OFFICER.staffId })) === 1);
  ok("PF-R2fo DW4 fail: firm B's 5,000 leads and its unassigned lead never reach firm A; the solo firm counts its own", val(await one(OWNER, "reports.sales.leads_added")) === 6 && (val(await one(SOLO, "reports.sales.leads_added")) ?? 0) >= 5000);

  // ---------------------------------------------------------------------------------- DW5: client type is the pipeline (AG-14-33)
  ok("PF-R2fo DW5 pass: Corporate keeps the corporate prospect's lead (L1) and its win (100%)", val(await one(OWNER, "reports.sales.leads_added", { ...NOV, clientType: "CORPORATE" })) === 1 && val(await one(OWNER, "reports.sales.win_rate", { ...NOV, clientType: "CORPORATE" })) === 100);
  ok("PF-R2fo DW5 fail: Individual leaves the corporate prospect out of the stage counts and the win rate (0 won of 1)", val(await one(OWNER, "reports.sales.win_rate", { ...NOV, clientType: "INDIVIDUAL" })) === 0);

  // ---------------------------------------------------------------------------------- DW6: the read budget (STANDARDS §9)
  const ctxs = [OWNER, OFFICER, SOLO].map((c) => ({ firmId: c.firmId, staffId: c.staffId, keys: c.keys, scope: (c === OFFICER ? "own" : "all") as "own" | "all" }));
  const slow = await overBudget(registry.all(), ctxs, (f, fn) => withFirm(f, fn));
  ok("PF-R2fo DW6 pass: every sales number answers within 200 ms at each scope with ~5,000 leads of the other firm", slow.length === 0, slow);
  ok("PF-R2fo DW6 fail: the same check with no budget names every number (it bites)", (await overBudget(registry.all(), ctxs.slice(2), (f, fn) => withFirm(f, fn), {}, -1)).length === 7);
  void L3;
} finally {
  await walled.$disconnect().catch(() => {});
  await db.$disconnect().catch(() => {});
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nPF-R2fo sales numbers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
