// R1.79 part 2 (BACKLOG PF-R2fo; map row 79; AG-14-5, -7, -31; AG-2-87 rules 1-6, 12, 13, 18): the front office's sales
// numbers on PF-R1's one door. Named "PF-R2fo DW<n>", each a pass and a fail. One scratch database with every migration,
// the two Sample firms and their front offices (stages, reasons); leads, prospects and calls are written with the replica
// role, then every read runs through the app role xr_app under PF-12's walls, inside the caller's firm, as the API server
// runs it. About 5,000 leads of the other firm stand in for about 100 firms' worth (P-562); at the end firm A grows to
// about 200 staff with about 5,000 more leads and calls, for the caps and the read budget. No server, no browser, no
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
import { NOT_COUNTED_LEAD, SalesReports, salesMetrics } from "../api/src/front-office/reports/metrics.ts";
import { visibilityOf } from "../api/src/front-office/sales/common.ts";
import { inactiveStaff, leadsSeenWhere } from "../api/src/front-office/sales/source-filter.ts";
import { firmScope, walledPool, wallUnscopedQueries, withFirm } from "../api/src/platform/firm-scope.ts";
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
const ctes = new Set([...SRC.matchAll(/(?:\bwith|,)\s+([a-z_]+) as \(/g)].map((m) => m[1]));   // the per-person query's own aggregates (with x as (...))
const tables = [...new Set([...SRC.matchAll(/\b(?:from|join)\s+([a-z_]+)\b/g)].map((m) => m[1]))].filter((t) => !ctes.has(t)).sort();
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
    if (o.state === "ENGAGED" && !o.engagedAt) Object.assign(o, { engagedAt: o.arrived ?? "2026-11-10T10:00:00Z", engagedBy: o.owner ?? OWNER.staffId });
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
  const call = (f: string, l: { id: string; person: string }, by: string, outcome: string, at = "2026-11-11T10:00:00Z") =>
    sql(`set session_replication_role = replica; insert into fo_call (id, firm_id, person_id, lead_id, direction, outcome, started_at, by_actor) values ('${randomUUID()}', '${f}', '${l.person}', '${l.id}', 'OUT', '${outcome}', '${at}', 'staff:${by}')`);

  // Firm A (zone America/Toronto, the Sample default), November: L1 the Owner's, engaged, its prospect WON (Corporate); L2
  // the Officer's, engaged, its prospect ACTIVE (Individual); L3 unassigned and open (Web form, arrived 1 Nov 16:00); L4
  // the Officer's, combined into another lead, and L9 the Officer's, added to a prospect (both out of every figure); L5 the
  // Owner's, arrived in October; L6 the Owner's, its prospect lost as a duplicate (out of the win rate); L7 the Owner's,
  // a NURTURE prospect; L8 unassigned and closed (Not interested); G1 open, owned by a deactivated person (Unassigned, BR-4).
  // The month edges, in the firm's zone: E1 at 31 Oct 22:00 (its Corporate ACTIVE prospect made then), E2 at 1 Nov 00:00,
  // E3 at 30 Nov 22:00 (all three the Owner's; in UTC E1 is in November and E3 in December). Out of the period: U1 (an
  // unassigned ACTIVE prospect, October), C1 (its prospect, made in November, combined into another: counts nowhere), W1
  // (its prospect made and WON in October). Calls: the Owner 2 in November (1 connected) and 1 in October, the Officer 1.
  // A deactivated person with one call in November keeps an (Inactive) row; one with none has no row.
  const gone = randomUUID(), idle = randomUUID();
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values ('${gone}', '${A}', 'gone@example.test', 'Former Rep (Sample)', 'DEACTIVATED', now()), ('${idle}', '${A}', 'idle@example.test', 'Idle Former (Sample)', 'DEACTIVATED', now())`);
  const L1 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", engagedBy: OWNER.staffId, engagedAt: "2026-11-10T11:00:00Z" });
  prospect(A, L1, { type: "CORPORATE", kind: "WON", owner: OWNER.staffId, wonAt: "2026-11-20T10:00:00Z" });
  const L2 = lead(A, { owner: OFFICER.staffId, state: "ENGAGED", engagedBy: OFFICER.staffId, engagedAt: "2026-11-10T11:00:00Z" });
  prospect(A, L2, { owner: OFFICER.staffId });
  const L3 = lead(A, { owner: null, source: "Web form", arrived: "2026-11-01T20:00:00Z" });
  lead(A, { owner: OFFICER.staffId, state: "CLOSED", closeKey: "COMBINED_LEAD" });
  lead(A, { owner: OFFICER.staffId, state: "CLOSED", closeKey: "ADDED_TO_PROSPECT" });
  lead(A, { owner: OWNER.staffId, arrived: "2026-10-05T10:00:00Z" });
  const L6 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", engagedBy: OWNER.staffId, engagedAt: "2026-11-12T10:00:00Z" });
  prospect(A, L6, { kind: "LOST", owner: OWNER.staffId, lostKey: "DUPLICATE_PROSPECT", created: "2026-11-12T10:00:00Z" });
  const L7 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", arrived: "2026-09-01T10:00:00Z", engagedBy: OWNER.staffId, engagedAt: "2026-09-02T10:00:00Z" });
  prospect(A, L7, { kind: "NURTURE", owner: OWNER.staffId, created: "2026-09-02T10:00:00Z" });
  lead(A, { owner: null, state: "CLOSED", closeKey: "NOT_INTERESTED" });
  lead(A, { owner: gone, arrived: "2026-11-15T15:00:00Z" });
  const E1 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", source: "Referral", arrived: "2026-11-01T02:00:00Z", engagedBy: OWNER.staffId, engagedAt: "2026-11-01T02:30:00Z" });
  prospect(A, E1, { type: "CORPORATE", owner: OWNER.staffId, created: "2026-11-01T02:30:00Z" });
  lead(A, { owner: OWNER.staffId, source: "Referral", arrived: "2026-11-01T04:00:00Z" });
  lead(A, { owner: OWNER.staffId, source: "Referral", arrived: "2026-12-01T03:00:00Z" });
  const U1 = lead(A, { owner: null, state: "ENGAGED", arrived: "2026-10-20T10:00:00Z" });
  prospect(A, U1, { created: "2026-10-20T11:00:00Z" });
  const C1 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", arrived: "2026-10-02T10:00:00Z" });
  prospect(A, C1, { kind: "LOST", owner: OWNER.staffId, lostKey: "COMBINED_PROSPECT", created: "2026-11-05T15:00:00Z" });
  const W1 = lead(A, { owner: OWNER.staffId, state: "ENGAGED", arrived: "2026-10-03T10:00:00Z" });
  prospect(A, W1, { kind: "WON", owner: OWNER.staffId, created: "2026-10-03T11:00:00Z", wonAt: "2026-10-15T10:00:00Z" });
  call(A, L1, OWNER.staffId, "CONNECTED"); call(A, L1, OWNER.staffId, "NO_ANSWER"); call(A, L2, OFFICER.staffId, "NO_ANSWER"); call(A, W1, OWNER.staffId, "CONNECTED", "2026-10-15T10:00:00Z");
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
  const notCounted = sql(`select string_agg(id::text, ',') from fo_reason where firm_id = '${A}' and key = any(array['${NOT_COUNTED_LEAD.join("','")}'])`).split(",");

  // ---------------------------------------------------------------------------------- DW1: registered on the one door
  const keys = registry.definitions().map((d) => d.key);
  ok("PF-R2fo DW1 pass: seven sales numbers are registered, each with its definition in words", eq(keys, ["reports.sales.leads_added", "reports.sales.leads_by_source", "reports.sales.unassigned_waiting", "reports.sales.stage_counts", "reports.sales.engage_rate", "reports.sales.win_rate", "reports.sales.per_person"]) && registry.definitions().every((d) => d.module === "front-office" && d.source.length > 30));
  ok("PF-R2fo DW1 pass: the feature file adds SalesReports at start-up, and the seeded dashboards light leads added, win rate and stage counts",
    salesReportsFeature.providers?.includes(SalesReports) && route.dashboard({ platform: OWNER }, "case-manager").widgets.filter((w) => w.metricKey.startsWith("reports.sales.") && w.registered).length === 2 && route.dashboard({ platform: OWNER }, "owner").widgets.filter((w) => w.metricKey.startsWith("reports.sales.") && w.registered).length === 2);
  ok("PF-R2fo DW1 fail: the reports.sales.* keys are the front office's: another module cannot register one", (() => { try { registry.register({ ...salesMetrics(walled)[0], key: "reports.sales.other", module: "cases" }); return false; } catch (e) { return /front-office's/.test(String(e)); } })());

  ok("PF-R2fo DW1 fail: no figure drills anywhere yet: every definition and every answer has no drill (the lead list would open a different set)", registry.definitions().every((d) => d.drillTarget === null) && (await ask(OWNER, { metrics: keys, filters: NOV })).metrics.every((m) => m.status === "OK" && m.drill === null));

  // ---------------------------------------------------------------------------------- DW2: the seeded leads give exact counts
  ok("PF-R2fo DW2 pass: leads added in November: L1, L2, L3, L6, L8, G1, E2, E3 (8); L4 (combined) and L9 (added to a prospect) count nowhere", val(await one(OWNER, "reports.sales.leads_added", NOV)) === 8);
  ok("PF-R2fo DW2 fail: without a period the October and September leads count too (14), never L4 or L9 (16)", val(await one(OWNER, "reports.sales.leads_added")) === 14);
  ok("PF-R2fo DW2 pass: by source: Phone call 5, Referral 2, Web form 1", eq(rows(await one(OWNER, "reports.sales.leads_by_source", NOV)), [{ source: "Phone call", leads: 5 }, { source: "Referral", leads: 2 }, { source: "Web form", leads: 1 }]));
  const wait = await one(OWNER, "reports.sales.unassigned_waiting");
  ok("PF-R2fo DW2 pass: two unassigned leads waiting (L3, and G1 of a deactivated owner; never the closed L8), the oldest 24 firm days (L3, 1 Nov 16:00; 23 days of 24 hours)", eq(rows(wait), [{ waiting: 2, oldest_days: 24 }]), wait);
  const stages = rows(await one(OWNER, "reports.sales.stage_counts")) ?? [];
  ok("PF-R2fo DW2 pass: stage counts now: Corporate Engaged 1 (E1), Individual Engaged 2 (L2, U1), Individual parked 1; WON and LOST ones out", eq(stages, [{ pipeline: "Corporate", stage: "Engaged", prospects: 1 }, { pipeline: "Individual", stage: "Engaged", prospects: 2 }, { pipeline: "Individual", stage: "Parked (Nurture)", prospects: 1 }]), stages);
  ok("PF-R2fo DW2 pass: engage rate in November: 3 of 8 leads now engaged = 37.5% (a closed lead is not engaged)", val(await one(OWNER, "reports.sales.engage_rate", NOV)) === 37.5);
  ok("PF-R2fo DW2 pass: win rate in November: 1 won of 2 engaged (the duplicate and the combined prospect left out) = 50%", val(await one(OWNER, "reports.sales.win_rate", NOV)) === 50);
  ok("PF-R2fo DW2 fail: with no lead or prospect in the period a rate is none (null), never 0% or an error", val(await one(OWNER, "reports.sales.engage_rate", { from: "2020-01-01", to: "2020-01-31" })) === null && val(await one(OWNER, "reports.sales.win_rate", { from: "2020-01-01", to: "2020-01-31" })) === null);
  const wide = await one(OWNER, "reports.sales.leads_added", { from: "0000-01-01", to: "9999-12-31" });
  ok("PF-R2fo DW2 fail: a day before 1970 or after 2999 reads from 1970 or to 2999 (14), never UNAVAILABLE", wide.status === "OK" && val(wide) === 14, wide);

  // ---------------------------------------------------------------------------------- DW7: days are the firm's (AG-14 §6)
  const day = async (d: string) => val(await one(OWNER, "reports.sales.leads_added", { from: d, to: d }));
  ok("PF-R2fo DW7 pass: in Toronto, 31 Oct holds E1 (22:00), 1 Nov holds E2 (00:00) and L3, 30 Nov holds E3 (22:00)", eq([await day("2026-10-31"), await day("2026-11-01"), await day("2026-11-30")], [1, 2, 1]));
  ok("PF-R2fo DW7 fail: the edges are not UTC's: Corporate in November is L1 only (E1 is October's) and its win rate 100%", val(await one(OWNER, "reports.sales.leads_added", { ...NOV, clientType: "CORPORATE" })) === 1 && val(await one(OWNER, "reports.sales.win_rate", { ...NOV, clientType: "CORPORATE" })) === 100);
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.time_zone', '"Asia/Kolkata"', 'pfr2fo')`);
  ok("PF-R2fo DW7 fail: with the firm's zone set to Asia/Kolkata, E3 moves to 1 Dec and 30 Nov is empty", eq([await day("2026-11-30"), await day("2026-12-01")], [0, 1]));
  sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`);

  // ---------------------------------------------------------------------------------- DW3: the per-person table (AG-14-7, -31)
  const people = rows(await one(OWNER, "reports.sales.per_person", NOV)) ?? [];
  const rowIn = (list: typeof people, name: string) => list.find((r) => String(r.person).includes(name));
  const row = (name: string) => rowIn(people, name);
  const ownerName = sql(`select display_name from platform_staff where id = '${OWNER.staffId}'`);
  const OWNER_ROW = { leads_owned: 9, open_prospects: 1, engaged: 2, won: 1, calls: 2, connected: 1 };
  ok("PF-R2fo DW3 pass: the Owner's row: 9 leads owned now, 1 open prospect, 2 engaged, 1 won, 2 calls (1 connected); C1's combined prospect, W1's October win and the October call out", eq(row(ownerName) && { ...row(ownerName), person: undefined }, { person: undefined, ...OWNER_ROW }), row(ownerName));
  ok("PF-R2fo DW3 pass: a deactivated person with a call in the period keeps a row as (Inactive)", row("Former Rep")?.person === "(Inactive) Former Rep (Sample)" && row("Former Rep")?.calls === 1);
  ok("PF-R2fo DW3 fail: a deactivated person with no activity in the period has no row", !row("Idle Former"));
  ok("PF-R2fo DW3 fail: the table is never ranked: it is in name order", eq(people.map((r) => String(r.person).replace("(Inactive) ", "")), [...people.map((r) => String(r.person).replace("(Inactive) ", ""))].sort((a, b) => a.localeCompare(b))));
  const indiv = rowIn(rows(await one(OWNER, "reports.sales.per_person", { ...NOV, clientType: "INDIVIDUAL" })) ?? [], ownerName);
  ok("PF-R2fo DW3 fail: Individual leaves the Owner's Corporate leads, win and calls out (4 leads owned: L6, L7, C1, W1; 0 won, 0 calls)", indiv?.leads_owned === 4 && indiv?.won === 0 && indiv?.calls === 0, indiv);

  // ---------------------------------------------------------------------------------- DW4: rights (AG-2-87 rule 1, AG-14-19)
  const oAdded = await one(OFFICER, "reports.sales.leads_added", NOV), oPeople = rows(await one(OFFICER, "reports.sales.per_person", NOV)) ?? [];
  ok("PF-R2fo DW4 pass: view.own counts only the viewer's leads (the Case Officer: L2, 1) and only their own row", val(oAdded) === 1 && oAdded.scope === "own" && oPeople.length === 1 && oPeople[0].leads_owned === 1, { oAdded, oPeople });
  ok("PF-R2fo DW4 fail: at view.own the stage counts and the win rate are the viewer's prospects only (L2's: Engaged 1; 0 won of 1)", eq(rows(await one(OFFICER, "reports.sales.stage_counts")), [{ pipeline: "Individual", stage: "Engaged", prospects: 1 }]) && val(await one(OFFICER, "reports.sales.win_rate", NOV)) === 0);
  ok("PF-R2fo DW4 fail: unassigned leads waiting is firm-wide only: withheld at own scope", (await one(OFFICER, "reports.sales.unassigned_waiting")).status === "WITHHELD");
  const noProspectAll = without(OWNER, "agent/prospect:view.all");
  const noAssign = without(noProspectAll, "agent/prospect:assign");
  ok("PF-R2fo DW4 fail: report view.all without prospect view.all counts own leads plus, with agent/prospect:assign, the Unassigned ones, a deactivated owner's included (7; without assign 4)",
    OWNER.keys.includes("agent/prospect:assign") && val(await one(noProspectAll, "reports.sales.leads_added", NOV)) === 7 && val(await one(noAssign, "reports.sales.leads_added", NOV)) === 4 && (rows(await one(noProspectAll, "reports.sales.per_person", NOV)) ?? []).length === 1);
  ok("PF-R2fo DW4 fail: a prospect is seen by its owner or by one who sees all: assign does not open U1's unassigned prospect", eq(rows(await one(noProspectAll, "reports.sales.stage_counts")), [{ pipeline: "Corporate", stage: "Engaged", prospects: 1 }, { pipeline: "Individual", stage: "Parked (Nurture)", prospects: 1 }]));
  ok("PF-R2fo DW4 fail: one who does not see all and names someone else counts nothing (0 leads, no row)", val(await one(noProspectAll, "reports.sales.leads_added", { ...NOV, staffId: OFFICER.staffId })) === 0 && eq(rows(await one(noProspectAll, "reports.sales.per_person", { ...NOV, staffId: OFFICER.staffId })), []));
  ok("PF-R2fo DW4 fail: without view.all or assign, unassigned leads waiting has no row (their Unassigned list is refused), never \"0 waiting\"", eq(rows(await one(noAssign, "reports.sales.unassigned_waiting")), []));
  ok("PF-R2fo DW4 fail: unassigned leads waiting under a person filter, or for Corporate (no unassigned lead has a Corporate prospect), is 0", eq(rows(await one(OWNER, "reports.sales.unassigned_waiting", { staffId: OFFICER.staffId })), [{ waiting: 0, oldest_days: null }]) && eq(rows(await one(OWNER, "reports.sales.unassigned_waiting", { clientType: "CORPORATE" })), [{ waiting: 0, oldest_days: null }]));
  const parity: string[] = [];
  for (const [label, c] of [["Owner", OWNER], ["no prospect view.all", noProspectAll], ["no assign", noAssign]] as const) {
    const vis = await visibilityOf(db, c), off = await inactiveStaff(db, c.firmId);
    const listed = await db.foLead.count({ where: firmScope(c.firmId, { AND: [leadsSeenWhere(c, vis, off), { OR: [{ closeReasonId: null }, { closeReasonId: { notIn: notCounted } }] }] }) });
    if (val(await one(c, "reports.sales.leads_added")) !== listed) parity.push(label);
  }
  ok("PF-R2fo DW4 pass: leads added equals the lead list's own rule (leadsSeenWhere) for each viewer", parity.length === 0, parity);
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.everyone_sees_all', 'false', 'pfr2fo')`);
  ok("PF-R2fo DW4 fail: with the firm's \"everyone sees all\" off, even the Owner counts own leads (plus Unassigned, as the lead list shows)", val(await one(OWNER, "reports.sales.leads_added", NOV)) === 7);
  sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'`);
  ok("PF-R2fo DW4 pass: the Owner's person filter narrows to that person (the Case Officer: 1)", val(await one(OWNER, "reports.sales.leads_added", { ...NOV, staffId: OFFICER.staffId })) === 1);
  ok("PF-R2fo DW4 fail: firm B's 5,000 leads and its unassigned lead never reach firm A; the solo firm counts its own", val(await one(OWNER, "reports.sales.leads_added")) === 14 && (val(await one(SOLO, "reports.sales.leads_added")) ?? 0) >= 5000);

  // ---------------------------------------------------------------------------------- DW5: client type is the pipeline (AG-14-33)
  ok("PF-R2fo DW5 pass: Corporate keeps the corporate prospects only: leads added L1 (1), win 100%, stage counts E1's alone", val(await one(OWNER, "reports.sales.leads_added", { ...NOV, clientType: "CORPORATE" })) === 1 && val(await one(OWNER, "reports.sales.win_rate", { ...NOV, clientType: "CORPORATE" })) === 100 && eq(rows(await one(OWNER, "reports.sales.stage_counts", { clientType: "CORPORATE" })), [{ pipeline: "Corporate", stage: "Engaged", prospects: 1 }]));
  ok("PF-R2fo DW5 fail: Individual leaves the corporate prospects out of the stage counts and the win rate (0 won of 1)", eq((rows(await one(OWNER, "reports.sales.stage_counts", { clientType: "INDIVIDUAL" })) ?? []).map((r) => r.pipeline), ["Individual", "Individual"]) && val(await one(OWNER, "reports.sales.win_rate", { ...NOV, clientType: "INDIVIDUAL" })) === 0);

  // ---------------------------------------------------------------------------------- DW8: no silent cut; a firm with many staff (M5, m3)
  // Firm A grows by 200 staff (names sorting before everyone's), 5,000 November leads over 250 more sources, and 5,000 calls.
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) select gen_random_uuid(), '${A}', 'bulk' || g || '@example.test', 'AAA Bulk ' || lpad(g::text, 3, '0') || ' (Sample)', 'ACTIVE', now() from generate_series(1, 200) g`);
  sql(`set session_replication_role = replica;
    create temp table bulk as select id, row_number() over (order by id) - 1 as k from platform_staff where firm_id = '${A}' and display_name like 'AAA Bulk %';
    insert into fo_lead (id, firm_id, number, person_id, door, source, owner_staff_id, arrived_at, created_by, updated_at)
      select gen_random_uuid(), '${A}', 'L-' || (400000 + g), '${L1.person}', 'MANUAL', 'Bulk source ' || lpad((g % 250)::text, 3, '0'), b.id, '2026-11-10T10:00:00Z', 'pfr2fo', now() from generate_series(1, 5000) g join bulk b on b.k = g % 200;
    insert into fo_call (id, firm_id, person_id, lead_id, direction, outcome, started_at, by_actor)
      select gen_random_uuid(), '${A}', '${L1.person}', '${L1.id}', 'OUT', 'NO_ANSWER', '2026-11-11T10:00:00Z', 'staff:' || b.id from generate_series(1, 5000) g join bulk b on b.k = g % 200; analyze`);
  const sources = rows(await one(OWNER, "reports.sales.leads_by_source", NOV)) ?? [];
  ok("PF-R2fo DW8 pass: 253 sources: 199 rows, then \"54 more sources\"; the rows add up to the 5,008 leads added", sources.length === 200 && sources[199].source === "54 more sources" && sources.reduce((n, r) => n + Number(r.leads), 0) === 5008 && val(await one(OWNER, "reports.sales.leads_added", NOV)) === 5008, sources.slice(-2));
  const many = rows(await one(OWNER, "reports.sales.per_person", NOV)) ?? [];
  ok("PF-R2fo DW8 fail: past 200 people the last row says how many more, the calls add up (5,004), and the caller's own row is kept", many.length === 200 && /^\d+ more people$/.test(String(many[199].person)) && many.reduce((n, r) => n + Number(r.calls), 0) === 5004 && eq(rowIn(many, ownerName) && { ...rowIn(many, ownerName), person: undefined }, { person: undefined, ...OWNER_ROW }), many.slice(-2));

  // ---------------------------------------------------------------------------------- DW6: the read budget (STANDARDS §9)
  const ctxs = [OWNER, OFFICER, SOLO].map((c) => ({ firmId: c.firmId, staffId: c.staffId, keys: c.keys, scope: (c === OFFICER ? "own" : "all") as "own" | "all" }));
  const slow = await overBudget(registry.all(), ctxs, (f, fn) => withFirm(f, fn), NOV);
  ok("PF-R2fo DW6 pass: every sales number answers within 200 ms at each scope in a firm of ~200 staff with ~5,000 leads and calls", slow.length === 0, slow);
  ok("PF-R2fo DW6 fail: the same check with no budget names every number (it bites)", (await overBudget(registry.all(), ctxs.slice(2), (f, fn) => withFirm(f, fn), {}, -1)).length === 7);
  void L3; void L7;
} finally {
  await walled.$disconnect().catch(() => {});
  await db.$disconnect().catch(() => {});
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nPF-R2fo sales numbers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
