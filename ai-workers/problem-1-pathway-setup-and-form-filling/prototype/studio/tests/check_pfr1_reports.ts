// PF-R1 (BACKLOG row PF-R1; map row 79, R1.79; AG-14-4, -15, -18 to -20, -22, -30, -33): the reporting service and its one
// door. Each Done-when line has a pass and a fail, named "PF-R1 DW<n>". MetricsPort's contract runs on the fake and the
// real registry. One scratch database with every migration and the two Sample firms (front office too); the Sample
// metric under test reads fo_lead through the app role xr_app under PF-12's walls, as a module's read will; ~5,000 rows
// of the other firm stand in for about 100 firms' worth (P-562). The routes are called as the app calls them, inside the
// caller's firm; the drill-through target is checked by PF-4's real guard. No server, no browser, no model call (US$0).
// Every value is Sample. The database is dropped at the end.
//   tsx studio/tests/check_pfr1_reports.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { ModulesContainer, Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { metricsPortContract } from "../ports/contracts/metrics-port.contract.ts";
import { fakeMetrics } from "../ports/fakes/metrics.fake.ts";
import { overBudget, REPORT_KEYS, type MetricRegistration, type ReportAnswer } from "../ports/metrics.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { SalesController } from "../api/src/front-office/sales/routes.ts";
import { firmScope, wallUnscopedQueries, walledPool, withFirm } from "../api/src/platform/firm-scope.ts";
import { PlatformGuard } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { DASHBOARDS, DashboardRole } from "../api/src/platform/reports/dashboards.ts";
import { MetricRegistry } from "../api/src/platform/reports/registry.ts";
import { ReportsController } from "../api/src/platform/reports/routes.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pfr1_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
async function refusal(fn: () => unknown): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) return { status: 0, body: { error: String(e) } };
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------- the port's contract, on both adapters
await runContract(metricsPortContract, "fakeMetrics", () => fakeMetrics(), ok);
await runContract(metricsPortContract, "MetricRegistry", () => new MetricRegistry(), ok);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const walled = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_)) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("PF-R1 setup: both Sample firms have a front office", fo.failed.length === 0, fo);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const keysOf = (roles: string[]) => sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
  const ctxOf = (actorId: string, roles?: string[]): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const r = roles ?? sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = keysOf(r);
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles: r, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const OWNER = ctxOf("user-R"), OFFICER = ctxOf("user-O"), SOLO = ctxOf("user-S");
  const FINANCE = ctxOf("user-O", ["BILLING_FINANCE"]);   // user-O's id with Billing / Finance's seeded keys
  const without = (c: StaffContext, ...gone: string[]): StaffContext => ({ ...c, keys: c.keys.filter((k) => !gone.includes(k)) });
  ok("PF-R1 setup: user-O is the Sample firm's Case Officer (view.own, no view.all); user-R its Owner (view.all); user-S the solo firm's",
    OFFICER.roles.join() === "CASE_OFFICER" && OFFICER.keys.includes(REPORT_KEYS.own) && !OFFICER.keys.includes(REPORT_KEYS.all) && OWNER.keys.includes(REPORT_KEYS.all) && OFFICER.firmId === A && SOLO.firmId === B, { O: OFFICER.roles, R: OWNER.roles });

  // ----------------------------------------------------------------------------------------------- fixtures (all Sample)
  // Firm A: three leads, one owned by the Case Officer. Firm B: one lead, copied to ~5,000 (about 100 firms' worth, P-562).
  const person = (f: string, name: string) => { const id = randomUUID(); sql(`set session_replication_role = replica; insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) values ('${id}', '${f}', '${name}', 'Sample', 'pfr1', now())`); return id; };
  let seq = 900000;
  const lead = (f: string, owner: string | null, arrived = "2026-11-10T10:00:00Z", n = String(++seq)) =>
    sql(`set session_replication_role = replica; insert into fo_lead (id, firm_id, number, person_id, door, source, owner_staff_id, arrived_at, created_by, updated_at) values ('${randomUUID()}', '${f}', 'L-${n}', '${person(f, `Pfr1${n}`)}', 'MANUAL', 'Phone call', ${owner ? `'${owner}'` : "null"}, '${arrived}', 'pfr1', now())`);
  lead(A, OWNER.staffId); lead(A, OWNER.staffId, "2026-10-01T10:00:00Z"); lead(A, OFFICER.staffId);
  lead(B, SOLO.staffId);
  const pB = sql(`select person_id from fo_lead where firm_id = '${B}' limit 1`);
  sql(`set session_replication_role = replica; insert into fo_lead (id, firm_id, number, person_id, door, source, owner_staff_id, arrived_at, created_by, updated_at)
    select gen_random_uuid(), '${B}', 'L-' || (200000 + g), '${pB}', 'MANUAL', 'Phone call', '${SOLO.staffId}', '2026-11-10T10:00:00Z', 'pfr1', now() from generate_series(1, 4999) g`);
  const inA = Number(sql(`select count(*) from fo_lead where firm_id = '${A}'`)), inB = Number(sql(`select count(*) from fo_lead where firm_id = '${B}'`));
  const ownA = Number(sql(`select count(*) from fo_lead where firm_id = '${A}' and owner_staff_id = '${OFFICER.staffId}'`));
  ok("PF-R1 setup: firm A has its leads (one the Case Officer's), firm B about 5,000", inA >= 3 && ownA === 1 && inB >= 5000, { inA, ownA, inB });

  wallUnscopedQueries();   // from here as in the API server: a query with no firm reads nothing (FirmWallsInterceptor's start-up)
  // A Sample metric, read as a module's read will be: through the app role, under the firm walls, with no firm filter of its own
  // beyond the scope (the walls are what keeps firm B out). It drills to the front office's leads list.
  const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000);
  const leadsMetric: MetricRegistration = {
    key: "sample.leads", module: "sample", label: "Leads (Sample)", source: "Leads that arrived in the period (Sample metric for PF-R1's test)",
    kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true,
    drillTarget: { path: "/api/front-office/leads", carries: { from: "from", to: "to", staffId: "owner" } },
    read: async (_ctx, f) => ({ kind: "COUNT", value: await walled.foLead.count({ where: { ...(f.staffId ? { ownerStaffId: f.staffId } : {}), ...(f.from || f.to ? { arrivedAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: nextDay(f.to) } : {}) } } : {}) } }) }),
  };
  const invoices = [{ currency: "CAD", cents: 4_200_000, owner: OWNER.staffId }, { currency: "USD", cents: 350_000, owner: OWNER.staffId }, { currency: "CAD", cents: 10_000, owner: OFFICER.staffId }];
  const feesMetric: MetricRegistration = {
    key: "sample.fees", module: "sample", label: "Fees billed (Sample)", source: "Sample invoices, one total per currency", kind: "MONEY", aggregation: "SUM", moneyTreatment: "PER_CURRENCY", scopeAware: true, drillTarget: null,
    read: async (ctx, f) => {
      const rows = invoices.filter((i) => ctx.scope !== "own" || i.owner === f.staffId);
      const by = new Map<string, number>(); for (const i of rows) by.set(i.currency, (by.get(i.currency) ?? 0) + i.cents);
      return { kind: "MONEY", figures: [...by].map(([currency, c]) => ({ currency: currency as "CAD" | "USD", amount: (c / 100).toFixed(2) })) };
    },
  };
  const registry = new MetricRegistry();
  registry.register(leadsMetric); registry.register(feesMetric);
  const route = new ReportsController(registry);
  const ask = (who: StaffContext, body: unknown) => withFirm(who.firmId, () => route.query({ platform: who }, body));
  const value = (r: ReportAnswer, key = "sample.leads") => { const m = r.metrics.find((x) => x.key === key); return m?.reading?.kind === "COUNT" ? m.reading.value : null; };

  // ----------------------------------------------------------------------------------------------- DW1: own versus all
  const ownerSees = await ask(OWNER, { metrics: ["sample.leads"] }), officerSees = await ask(OFFICER, { metrics: ["sample.leads"] });
  ok("PF-R1 DW1 pass: the Owner (view.all) gets the firm-wide figure for the metric, at scope all", value(ownerSees) === inA && ownerSees.metrics[0].scope === "all", ownerSees);
  ok("PF-R1 DW1 fail: the Case Officer (view.own) gets only own-record figures for the same metric, never the firm's", value(officerSees) === ownA && value(officerSees) !== inA && officerSees.metrics[0].scope === "own", officerSees);
  ok("PF-R1 DW1 fail: the Case Officer naming another person in the filter is refused 403 OWN_ONLY", (await refusal(() => ask(OFFICER, { metrics: ["sample.leads"], filters: { staffId: OWNER.staffId } })))?.status === 403);
  ok("PF-R1 DW1 pass: the Owner may narrow to one person (the filter only narrows, AG-14-20)", value(await ask(OWNER, { metrics: ["sample.leads"], filters: { staffId: OFFICER.staffId } })) === ownA);
  ok("PF-R1 DW1 pass: the date range narrows (October's lead is outside 1-30 November)", value(await ask(OWNER, { metrics: ["sample.leads"], filters: { from: "2026-11-01", to: "2026-11-30" } })) === inA - 1);

  // ----------------------------------------------------------------------------------------------- DW2: a scope in the request
  const officerAsksAll = await ask(OFFICER, { metrics: ["sample.leads"], scope: "all" });
  ok("PF-R1 DW2 pass: a scope sent in the request is ignored (the Case Officer sending scope=all still gets own)", value(officerAsksAll) === ownA && officerAsksAll.metrics[0].scope === "own", officerAsksAll);
  const ownerAsksOwn = await ask(OWNER, { metrics: ["sample.leads"], scope: "own" });
  ok("PF-R1 DW2 fail: nor does scope=own narrow the Owner (the body never sets the scope)", value(ownerAsksOwn) === inA && ownerAsksOwn.metrics[0].scope === "all", ownerAsksOwn);
  ok("PF-R1 DW2 fail: without any report key the door refuses 403", (await refusal(() => ask(without(OWNER, REPORT_KEYS.own, REPORT_KEYS.all, REPORT_KEYS.financial), { metrics: ["sample.leads"] })))?.status === 403);

  // ----------------------------------------------------------------------------------------------- DW3: money per currency
  const fin = await ask(FINANCE, { metrics: ["sample.fees"] });
  const figs = fin.metrics[0].reading?.kind === "MONEY" ? fin.metrics[0].reading.figures : [];
  ok("PF-R1 DW3 pass: a money metric with CAD and USD returns two figures (Billing / Finance, view-financial: firm-wide)", fin.metrics[0].scope === "financial" && JSON.stringify(figs) === JSON.stringify([{ currency: "CAD", amount: "42100.00" }, { currency: "USD", amount: "3500.00" }]), fin);
  const summed = new MetricRegistry();
  summed.register({ ...feesMetric, read: async () => ({ kind: "MONEY", figures: [{ currency: "CAD", amount: "45600.00" }, { currency: "CAD", amount: "1.00" }] }) });
  summed.register({ ...feesMetric, key: "sample.total", read: async () => ({ kind: "MONEY", total: "45600.00" }) as never });
  const bad = await withFirm(A, () => new ReportsController(summed).query({ platform: FINANCE }, { metrics: ["sample.fees", "sample.total"] }));
  ok("PF-R1 DW3 fail: a read giving one total, or one currency twice, is never passed on (UNAVAILABLE, no figure)", bad.metrics.every((m) => m.status === "UNAVAILABLE" && m.reading === null), bad);
  const officerFees = await ask(OFFICER, { metrics: ["sample.fees"] });
  ok("PF-R1 DW3 fail: the Case Officer (view.own, no view-financial) gets no firm-wide money figure, only their own", officerFees.metrics[0].scope === "own" && JSON.stringify(officerFees.metrics[0].reading) === JSON.stringify({ kind: "MONEY", figures: [{ currency: "CAD", amount: "100.00" }] }), officerFees);

  // ----------------------------------------------------------------------------------------------- DW4: unknown key
  const unknown = await refusal(() => ask(OWNER, { metrics: ["sample.leads", "sample.nope"] }));
  ok("PF-R1 DW4 fail: an unknown metric key gives 400 UNKNOWN_METRIC naming it", unknown?.status === 400 && unknown.body.code === "UNKNOWN_METRIC" && String(unknown.body.detail).includes("sample.nope"), unknown);
  ok("PF-R1 DW4 pass: the registered key answers", value(await ask(OWNER, { metrics: ["sample.leads"] })) === inA);
  ok("PF-R1 DW4 fail: no metrics, or more than 30, gives 400", (await refusal(() => ask(OWNER, { metrics: [] })))?.status === 400 && (await refusal(() => ask(OWNER, { metrics: Array(31).fill("sample.leads") })))?.status === 400);

  // ----------------------------------------------------------------------------------------------- DW5: filter schema
  const backwards = await refusal(() => ask(OWNER, { metrics: ["sample.leads"], filters: { from: "2026-11-30", to: "2026-11-01" } }));
  ok("PF-R1 DW5 fail: a filter that fails its schema (start after end) gives 400 with the message", backwards?.status === 400 && backwards.body.code === "QUERY_INVALID" && backwards.body.detail === "the start date is after the end date", backwards);
  const typo = await refusal(() => ask(OWNER, { metrics: ["sample.leads"], filters: { clientType: "COMPANY", office: "x" } }));
  ok("PF-R1 DW5 fail: an unknown client type and an unknown filter key give 400 naming the fields", typo?.status === 400 && JSON.stringify(typo.body.fields).includes("filters.clientType") && JSON.stringify(typo.body).includes("office"), typo);
  ok("PF-R1 DW5 fail: 31 February and a person that is not a staff id give 400", (await refusal(() => ask(OWNER, { metrics: ["sample.leads"], filters: { from: "2026-02-31" } })))?.status === 400 && (await refusal(() => ask(OWNER, { metrics: ["sample.leads"], filters: { staffId: "user-O" } })))?.status === 400);
  ok("PF-R1 DW5 pass: a well-formed filter (dates, person, client type) answers 200", value(await ask(OWNER, { metrics: ["sample.leads"], filters: { from: "2026-01-01", to: "2026-12-31", staffId: OWNER.staffId, clientType: "INDIVIDUAL" } })) === 2);

  // ----------------------------------------------------------------------------------------------- DW6: firm walls
  const soloSees = await ask(SOLO, { metrics: ["sample.leads"] });
  ok("PF-R1 DW6 pass: firm A's query never counts firm B's ~5,000 rows (the Owner's figure is firm A's alone)", value(ownerSees) === inA && value(ownerSees)! < inB, { a: value(ownerSees), inB });
  ok("PF-R1 DW6 pass: firm B's Owner counts firm B's rows, none of firm A's", value(soloSees) === inB, soloSees);
  const noFirm = await walled.foLead.count();
  ok("PF-R1 DW6 fail: the same read with no firm (outside a request) counts nothing (PF-12's wall, not the read, keeps firms apart)", noFirm === 0, noFirm);
  ok("PF-R1 DW6 fail: the same read as the owner role (no wall) would count both firms: the wall is what holds", Number(sql("select count(*) from fo_lead")) === inA + inB);
  ok("PF-R1 DW6 pass: a module's own firmScope agrees with the wall", (await withFirm(A, () => walled.foLead.count({ where: firmScope(A) }))) === inA);

  // ----------------------------------------------------------------------------------------------- DW7: read budget
  const ctxs = [OWNER, OFFICER, SOLO].map((c) => ({ firmId: c.firmId, staffId: c.staffId, scope: c === OFFICER ? "own" as const : "all" as const }));
  const timed = async () => { const out = []; for (const c of ctxs) out.push(...(await withFirm(c.firmId, () => overBudget(new Map([["sample.leads", leadsMetric]]), [c])))); return out; };
  await timed();   // one warm-up: the first query opens the pool
  const late = await timed();
  ok("PF-R1 DW7 pass: the Sample leads metric reads within STANDARDS §9's 200 ms at every scope over ~5,000 rows", late.length === 0, late);
  const slow = new MetricRegistry();
  slow.register({ ...leadsMetric, key: "sample.slow", read: async (c, f) => { await sleep(260); return leadsMetric.read(c, f); } });
  slow.register({ ...leadsMetric, key: "sample.broken", read: async () => { throw new Error("Sample"); } });
  const over = await withFirm(A, () => overBudget(slow.all(), [ctxs[0]]));
  ok("PF-R1 DW7 fail: a registered metric that reads over budget (260 ms) fails the budget test, as does one whose read fails", over.length === 2 && over[0].key === "sample.slow" && (over[0].ms ?? 0) > 200 && over[1].key === "sample.broken" && over[1].ms === null, over);

  // ----------------------------------------------------------------------------------------------- DW8: drill-through
  const drill = ownerSees.metrics[0].drill;
  const narrowedDrill = (await ask(OWNER, { metrics: ["sample.leads"], filters: { from: "2026-11-01", to: "2026-11-30", staffId: OFFICER.staffId } })).metrics[0].drill;
  ok("PF-R1 DW8 pass: each figure carries its drill target and the exact filter, under the target's parameter names", drill?.path === "/api/front-office/leads" && JSON.stringify(narrowedDrill?.query) === JSON.stringify({ from: "2026-11-01", to: "2026-11-30", owner: OFFICER.staffId }), { drill, narrowedDrill });
  ok("PF-R1 DW8 pass: the Case Officer's drill link carries their own id (own scope)", officerSees.metrics[0].drill?.query.owner === OFFICER.staffId, officerSees.metrics[0].drill);
  const guardFor = (who: StaffContext) => new PlatformGuard(new Reflector(), new ModulesContainer(), { authenticate: async () => who, catalogue: async () => [], isLicensed: async () => true } as never);
  const follow = (who: StaffContext) => {
    const req = { method: "GET", path: drill!.path, headers: { authorization: "Bearer sample" } };
    const ctx = { getHandler: () => SalesController.prototype.list, getClass: () => SalesController, switchToHttp: () => ({ getRequest: () => req }) };
    return guardFor(who).canActivate(ctx as never);
  };
  const noShow = await refusal(() => follow(without(OWNER, "agent/prospect:show")));
  ok("PF-R1 DW8 fail: the drill target, followed by someone without the target's key (agent/prospect:show), gives 403", noShow?.status === 403 && JSON.stringify(noShow.body).includes("agent/prospect:show"), noShow);
  ok("PF-R1 DW8 pass: followed by the Owner (who holds it), the target's guard lets them in", (await follow(OWNER)) === true);

  // ----------------------------------------------------------------------------------------------- (2) seeded dashboards
  const dash = (who: StaffContext, role: string) => route.dashboard({ platform: who }, role);
  ok("PF-R1 (2) pass: four seeded dashboards (Owner, Case Manager, Billing / Finance, Case Officer), each a non-empty layout", DashboardRole.length === 4 && DashboardRole.every((r) => dash(OWNER, r).widgets.length > 0));
  const officerDash = dash(OFFICER, "case-officer"), ownerOfficerDash = dash(OWNER, "case-officer");
  ok("PF-R1 (2) pass: the same layout for every viewer (the scope is the keys', not the layout's)", JSON.stringify(officerDash) === JSON.stringify(ownerOfficerDash) && officerDash.widgets.map((w) => w.metricKey).join() === DASHBOARDS["case-officer"].widgets.map((w) => w.metricKey).join());
  const withCaseLoad = new MetricRegistry(); withCaseLoad.register({ ...leadsMetric, key: "cases.case_load", label: "Case load (Sample)" });
  const lit = new ReportsController(withCaseLoad).dashboard({ platform: OFFICER }, "case-officer").widgets;
  ok("PF-R1 (2) pass: a widget whose metric is registered says so with its label; the others answer registered: false", lit[0].registered && lit[0].label === "Case load (Sample)" && lit.slice(1).every((w) => !w.registered && w.label === null), lit);
  ok("PF-R1 (2) fail: an unseeded dashboard (Rep, compliance, a typo) is 404", ["rep", "compliance", "Owner"].every((r) => (() => { try { dash(OWNER, r); return false; } catch (e) { return (e as { getStatus(): number }).getStatus() === 404; } })()));
  ok("PF-R1 (2) fail: without any report key a dashboard is 403", (await refusal(() => dash(without(OWNER, REPORT_KEYS.own, REPORT_KEYS.all, REPORT_KEYS.financial), "owner")))?.status === 403);

  // ----------------------------------------------------------------------------------------------- (6) the catalogue (AG-14 §10)
  const holders = (key: string) => sql(`select string_agg(role::text, ',' order by role::text) from platform_role_permission where permission_key = '${key}'`);
  const want = { [REPORT_KEYS.own]: "ADMIN,BILLING_FINANCE,CASE_MANAGER,CASE_OFFICER,OWNER,READ_ONLY", [REPORT_KEYS.all]: "ADMIN,CASE_MANAGER,OWNER", [REPORT_KEYS.financial]: "ADMIN,BILLING_FINANCE,OWNER", [REPORT_KEYS.export]: "ADMIN,CASE_MANAGER,OWNER" };
  const got = Object.fromEntries(Object.keys(want).map((k) => [k, holders(k)]));
  ok("PF-R1 (6) pass: the four report keys are in the catalogue with AG-14 §10's (SA6-D1) defaults: view.own on all six roles, view.all on Owner, Admin, Case Manager, view-financial for Billing / Finance", JSON.stringify(got) === JSON.stringify(want), got);
  ok("PF-R1 (6) fail: no own-only role (Case Officer, Billing / Finance, Read-only) holds view.all", !/CASE_OFFICER|BILLING_FINANCE|READ_ONLY/.test(got[REPORT_KEYS.all]));
  ok("PF-R1 (6) pass: each key is in platform_permission_key", Number(sql(`select count(*) from platform_permission_key where key in (${Object.keys(want).map((k) => `'${k}'`).join(",")})`)) === 4);
} finally {
  await walled.$disconnect().catch(() => {});
  await db.$disconnect().catch(() => {});
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nPF-R1 reports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
