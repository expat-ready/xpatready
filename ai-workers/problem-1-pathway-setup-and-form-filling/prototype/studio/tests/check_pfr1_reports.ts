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
import { overBudget, REPORT_KEYS, runMetrics, type MetricRegistration, type ReportAnswer } from "../ports/metrics.ts";
import { readFileSync } from "node:fs";
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
  const OWNER = ctxOf("user-R"), OFFICER = ctxOf("user-O"), SOLO = ctxOf("user-S"), MANAGER = ctxOf("user-T");
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
    key: "reports.sample.leads", module: "sample", label: "Leads (Sample)", source: "Leads that arrived in the period (Sample metric for PF-R1's test)",
    kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true,
    drillTarget: { path: "/api/front-office/leads", carries: { from: "from", to: "to", staffId: "owner" } },
    // the read counts only leads the viewer may open (AG-14-19, SA6-D6): without agent/prospect:view.all, their own
    read: async (ctx, f) => ({ kind: "COUNT", value: await walled.foLead.count({ where: { ...(f.staffId ? { ownerStaffId: f.staffId } : !ctx.keys.includes("agent/prospect:view.all") ? { ownerStaffId: ctx.staffId } : {}), ...(f.from || f.to ? { arrivedAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: nextDay(f.to) } : {}) } } : {}) } }) }),
  };
  const invoices = [{ currency: "CAD", cents: 4_200_000, owner: OWNER.staffId }, { currency: "USD", cents: 350_000, owner: OWNER.staffId }, { currency: "CAD", cents: 10_000, owner: OFFICER.staffId }];
  const feesMetric: MetricRegistration = {
    key: "reports.sample.fees", module: "sample", label: "Fees billed (Sample)", source: "Sample invoices, one total per currency", kind: "MONEY", aggregation: "SUM", moneyTreatment: "PER_CURRENCY", scopeAware: true, drillTarget: null,
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
  const value = (r: ReportAnswer, key = "reports.sample.leads") => { const m = r.metrics.find((x) => x.key === key); return m?.reading?.kind === "COUNT" ? m.reading.value : null; };

  // ----------------------------------------------------------------------------------------------- DW1: own versus all
  const ownerSees = await ask(OWNER, { metrics: ["reports.sample.leads"] }), officerSees = await ask(OFFICER, { metrics: ["reports.sample.leads"] });
  ok("PF-R1 DW1 pass: the Owner (view.all) gets the firm-wide figure for the metric, at scope all", value(ownerSees) === inA && ownerSees.metrics[0].scope === "all", ownerSees);
  ok("PF-R1 DW1 fail: the Case Officer (view.own) gets only own-record figures for the same metric, never the firm's", value(officerSees) === ownA && value(officerSees) !== inA && officerSees.metrics[0].scope === "own", officerSees);
  ok("PF-R1 DW1 fail: the Case Officer naming another person in the filter is refused 403 OWN_ONLY", (await refusal(() => ask(OFFICER, { metrics: ["reports.sample.leads"], filters: { staffId: OWNER.staffId } })))?.status === 403);
  ok("PF-R1 DW1 pass: the Owner may narrow to one person (the filter only narrows, AG-14-20)", value(await ask(OWNER, { metrics: ["reports.sample.leads"], filters: { staffId: OFFICER.staffId } })) === ownA);
  ok("PF-R1 DW1 pass: the date range narrows (October's lead is outside 1-30 November)", value(await ask(OWNER, { metrics: ["reports.sample.leads"], filters: { from: "2026-11-01", to: "2026-11-30" } })) === inA - 1);

  // ----------------------------------------------------------------------------------------------- DW2: a scope in the request
  const officerAsksAll = await ask(OFFICER, { metrics: ["reports.sample.leads"], scope: "all" });
  ok("PF-R1 DW2 pass: a scope sent in the request is ignored (the Case Officer sending scope=all still gets own)", value(officerAsksAll) === ownA && officerAsksAll.metrics[0].scope === "own", officerAsksAll);
  const ownerAsksOwn = await ask(OWNER, { metrics: ["reports.sample.leads"], scope: "own" });
  ok("PF-R1 DW2 fail: nor does scope=own narrow the Owner (the body never sets the scope)", value(ownerAsksOwn) === inA && ownerAsksOwn.metrics[0].scope === "all", ownerAsksOwn);
  ok("PF-R1 DW2 fail: without any report key the door refuses 403", (await refusal(() => ask(without(OWNER, REPORT_KEYS.own, REPORT_KEYS.all, REPORT_KEYS.financial), { metrics: ["reports.sample.leads"] })))?.status === 403);

  // ----------------------------------------------------------------------------------------------- DW3: money per currency
  const fin = await ask(FINANCE, { metrics: ["reports.sample.fees"] });
  const figs = fin.metrics[0].reading?.kind === "MONEY" ? fin.metrics[0].reading.figures : [];
  ok("PF-R1 DW3 pass: a money metric with CAD and USD returns two figures (Billing / Finance, view-financial: firm-wide)", fin.metrics[0].scope === "financial" && JSON.stringify(figs) === JSON.stringify([{ currency: "CAD", amount: "42100.00" }, { currency: "USD", amount: "3500.00" }]), fin);
  const summed = new MetricRegistry();
  summed.register({ ...feesMetric, read: async () => ({ kind: "MONEY", figures: [{ currency: "CAD", amount: "45600.00" }, { currency: "CAD", amount: "1.00" }] }) });
  summed.register({ ...feesMetric, key: "reports.sample.total", read: async () => ({ kind: "MONEY", total: "45600.00" }) as never });
  const bad = await withFirm(A, () => new ReportsController(summed).query({ platform: FINANCE }, { metrics: ["reports.sample.fees", "reports.sample.total"] }));
  ok("PF-R1 DW3 fail: a read giving one total, or one currency twice, is never passed on (UNAVAILABLE, no figure)", bad.metrics.every((m) => m.status === "UNAVAILABLE" && m.reading === null), bad);
  const officerFees = await ask(OFFICER, { metrics: ["reports.sample.fees"] }), managerFees = await ask(MANAGER, { metrics: ["reports.sample.fees"] });
  ok("PF-R1 DW3 fail (review M1; AG-14-35 to -37): without view-financial no money figure at all: the Case Officer (view.own) and the Case Manager (view.all) get WITHHELD",
    [officerFees, managerFees].every((r) => r.metrics[0].status === "WITHHELD" && r.metrics[0].reading === null) && MANAGER.keys.includes(REPORT_KEYS.all) && !MANAGER.keys.includes(REPORT_KEYS.financial), { officerFees, managerFees });
  const ageing: MetricRegistration = { key: "reports.sample.ageing", module: "sample", label: "Overdue ageing (Sample)", source: "Sample", kind: "LIST", aggregation: "LIST", moneyTreatment: "PER_CURRENCY", scopeAware: true, drillTarget: null,
    read: async (ctx) => ({ kind: "LIST", rows: [{ bucket: "1-30", currency: "CAD", amount: ctx.scope === "financial" ? "900.00" : "1.00" }, { bucket: "1-30", currency: "USD", amount: "50.00" }] }) };
  const lists = new MetricRegistry(); lists.register(ageing); lists.register({ ...ageing, key: "reports.sample.nocurrency", read: async () => ({ kind: "LIST", rows: [{ bucket: "1-30", amount: "950.00" }] }) });
  const fl = await withFirm(A, () => new ReportsController(lists).query({ platform: FINANCE }, { metrics: ["reports.sample.ageing", "reports.sample.nocurrency"] }));
  ok("PF-R1 DW3 pass (break M2): a per-currency table (ageing) is read firm-wide for Billing / Finance, a currency on each row", fl.metrics[0].scope === "financial" && fl.metrics[0].status === "OK" && JSON.stringify(fl.metrics[0].reading).includes("900.00"), fl);
  ok("PF-R1 DW3 fail (break M2): a per-currency table row without its currency is never passed on", fl.metrics[1].status === "UNAVAILABLE", fl.metrics[1]);

  // ----------------------------------------------------------------------------------------------- DW4: unknown key
  const unknown = await refusal(() => ask(OWNER, { metrics: ["reports.sample.leads", "reports.sample.nope"] }));
  ok("PF-R1 DW4 fail: an unknown metric key gives 400 UNKNOWN_METRIC naming it", unknown?.status === 400 && unknown.body.code === "UNKNOWN_METRIC" && String(unknown.body.detail).includes("reports.sample.nope"), unknown);
  ok("PF-R1 DW4 pass: the registered key answers", value(await ask(OWNER, { metrics: ["reports.sample.leads"] })) === inA);
  ok("PF-R1 DW4 fail: no metrics, or more than 30, gives 422 (a body failing its schema)", (await refusal(() => ask(OWNER, { metrics: [] })))?.status === 422 && (await refusal(() => ask(OWNER, { metrics: Array(31).fill("reports.sample.leads") })))?.status === 422);

  // ----------------------------------------------------------------------------------------------- DW5: filter schema
  const backwards = await refusal(() => ask(OWNER, { metrics: ["reports.sample.leads"], filters: { from: "2026-11-30", to: "2026-11-01" } }));
  ok("PF-R1 DW5 fail: a filter that fails its schema (start after end) gives 422 (PF-28; the row says 400) with the message", backwards?.status === 422 && backwards.body.code === "QUERY_INVALID" && backwards.body.detail === "the start date is after the end date", backwards);
  const typo = await refusal(() => ask(OWNER, { metrics: ["reports.sample.leads"], filters: { clientType: "COMPANY", office: "x" } }));
  ok("PF-R1 DW5 fail: an unknown client type and an unknown filter key give 422 naming the fields in plain words", typo?.status === 422 && JSON.stringify(typo.body.fields).includes("filters.clientType") && JSON.stringify(typo.body).includes("office") && JSON.stringify(typo.body).includes("not one of the allowed values") && !JSON.stringify(typo.body).includes("Invalid option"), typo);
  ok("PF-R1 DW5 fail: 31 February and a person that is not a staff id give 422", (await refusal(() => ask(OWNER, { metrics: ["reports.sample.leads"], filters: { from: "2026-02-31" } })))?.status === 422 && (await refusal(() => ask(OWNER, { metrics: ["reports.sample.leads"], filters: { staffId: "user-O" } })))?.status === 422);
  ok("PF-R1 DW5 pass: a well-formed filter (dates, person, client type) answers 200", value(await ask(OWNER, { metrics: ["reports.sample.leads"], filters: { from: "2026-01-01", to: "2026-12-31", staffId: OWNER.staffId, clientType: "INDIVIDUAL" } })) === 2);

  // ----------------------------------------------------------------------------------------------- DW6: firm walls
  const soloSees = await ask(SOLO, { metrics: ["reports.sample.leads"] });
  ok("PF-R1 DW6 pass: firm A's query never counts firm B's ~5,000 rows (the Owner's figure is firm A's alone)", value(ownerSees) === inA && value(ownerSees)! < inB, { a: value(ownerSees), inB });
  ok("PF-R1 DW6 pass: firm B's Owner counts firm B's rows, none of firm A's", value(soloSees) === inB, soloSees);
  const noFirm = await walled.foLead.count();
  ok("PF-R1 DW6 fail: the same read with no firm (outside a request) counts nothing (PF-12's wall, not the read, keeps firms apart)", noFirm === 0, noFirm);
  ok("PF-R1 DW6 fail: the same read as the owner role (no wall) would count both firms: the wall is what holds", Number(sql("select count(*) from fo_lead")) === inA + inB);
  ok("PF-R1 DW6 pass: a module's own firmScope agrees with the wall", (await withFirm(A, () => walled.foLead.count({ where: firmScope(A) }))) === inA);

  // ----------------------------------------------------------------------------------------------- M1: the viewer's view keys
  const narrowCM = without(MANAGER, "agent/prospect:view.all");
  ok("PF-R1 (break M1) pass: a read is given the viewer's keys, so a Case Manager without agent/prospect:view.all counts only the leads they may open",
    value(await ask(narrowCM, { metrics: ["reports.sample.leads"] })) === Number(sql(`select count(*) from fo_lead where firm_id = '${A}' and owner_staff_id = '${MANAGER.staffId}'`)) && value(await ask(MANAGER, { metrics: ["reports.sample.leads"] })) === inA);

  // ----------------------------------------------------------------------------------------------- DW7: read budget
  const ctxs = [OWNER, OFFICER, SOLO].map((c) => ({ firmId: c.firmId, staffId: c.staffId, keys: c.keys, scope: c === OFFICER ? "own" as const : "all" as const }));
  const timed = () => overBudget(new Map([["reports.sample.leads", leadsMetric]]), ctxs, withFirm);
  await timed();   // one warm-up: the first query opens the pool
  const late = await timed();
  ok("PF-R1 DW7 pass: the Sample leads metric reads within STANDARDS §9's 200 ms at every scope over ~5,000 rows", late.length === 0, late);
  const slow = new MetricRegistry();
  slow.register({ ...leadsMetric, key: "reports.sample.slow", read: async (c, f) => { await sleep(260); return leadsMetric.read(c, f); } });
  slow.register({ ...leadsMetric, key: "reports.sample.broken", read: async () => { throw new Error("Sample"); } });
  const over = await overBudget(slow.all(), [ctxs[0]], withFirm);
  ok("PF-R1 DW7 fail: a registered metric that reads over budget (260 ms) fails the budget test, as does one whose read fails", over.length === 2 && over[0].key === "reports.sample.slow" && (over[0].ms ?? 0) > 200 && over[1].key === "reports.sample.broken" && over[1].ms === null, over);

  const seen: number[] = [];
  const spy = new Map([["reports.sample.leads", { ...leadsMetric, read: async (c: never, f: never) => { const r = await leadsMetric.read(c, f); if (r.kind === "COUNT") seen.push(r.value); return r; } } as MetricRegistration]]);
  await overBudget(spy, [ctxs[2]], withFirm);
  ok("PF-R1 DW7 fail (break M3): the budget reads each context inside its own firm (firm B's context counts firm B's ~5,000 rows, never 0 or firm A's)", seen[0] === inB, seen);
  ok("PF-R1 DW7 fail: a read answering the wrong shape fails the budget test too", (await overBudget(new Map([["reports.sample.leads", { ...leadsMetric, read: async () => ({ kind: "COUNT", value: -1 }) }]]), [ctxs[0]], withFirm)).length === 1);
  // review M2: every module that registers metrics on the app's registry has a test that runs overBudget on them
  // a registrant imports the registry or the port (a module coded to MetricsPort, handed the registry: review round 2 m5)
  const registrants = (files: { path: string; text: string }[]) => files.filter((f) => !f.path.includes("/platform/reports/") && /platform\/reports\/registry|ports\/metrics(\.ts)?["']/.test(f.text) && /\.register\(/.test(f.text)).map((f) => f.path);
  const unbudgeted = (src: { path: string; text: string }[], tests: { path: string; text: string }[]) => registrants(src).filter((p) => !tests.some((t) => t.text.includes("overBudget(") && t.text.includes(p.replace(/^.*api\/src\//, "").replace(/\.ts$/, ""))));
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []));
  const src = walk(join(STUDIO, "api", "src")).map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const tests = readdirSync(join(STUDIO, "tests")).filter((f) => f.endsWith(".ts") && f !== "check_pfr1_reports.ts").map((f) => ({ path: f, text: readFileSync(join(STUDIO, "tests", f), "utf8") }));
  ok("PF-R1 DW7 pass (review M2): every module registering metrics on the app's registry has a test running overBudget on them", unbudgeted(src, tests).length === 0, unbudgeted(src, tests));
  // the planted paths are names no real module has (R1.79 parts 2 and 3 add front-office/ and client-money/reports/metrics.ts)
  const planted = [{ path: "/x/api/src/front-office/reports/planted-unbudgeted.ts", text: `import { MetricRegistry } from "../../platform/reports/registry.ts"; registry.register({})` }];
  ok("PF-R1 DW7 fail (review M2): a module that registers a metric with no budget test is named", JSON.stringify(unbudgeted(planted, tests)) === JSON.stringify([planted[0].path]) && unbudgeted(planted, [...tests, { path: "t.ts", text: "front-office/reports/planted-unbudgeted overBudget(" }]).length === 0);
  const viaPort = [{ path: "/x/api/src/client-money/reports/planted-unbudgeted.ts", text: `import type { MetricsPort } from "../../../../ports/metrics.ts"; export const add = (p: MetricsPort) => p.register({})` }];
  ok("PF-R1 DW7 fail (review round 2 m5): a module coded to MetricsPort that registers with no budget test is named too", JSON.stringify(unbudgeted(viaPort, tests)) === JSON.stringify([viaPort[0].path]));

  // ----------------------------------------------------------------------------------------------- break minors
  const reg = new MetricRegistry(); reg.register(leadsMetric);
  const flood = await refusal(() => ask(OWNER, { metrics: ["reports.sample.leads"], filters: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, "x"])) }));
  ok("PF-R1 (break m1) fail: 2,000 unknown filter keys give a short 422, never an echo of them", flood?.status === 422 && JSON.stringify(flood.body).length < 1500, JSON.stringify(flood).length);
  ok("PF-R1 (break m1, review m4) fail: a malformed metric key (control characters, HTML) is a QUERY_INVALID (422) naming the field, not echoed", ((r) => r?.status === 422 && r.body.code === "QUERY_INVALID" && !JSON.stringify(r.body).includes("<b>"))(await refusal(() => ask(OWNER, { metrics: ["<b>x\u202e</b>"] }))));
  const wide = new Map([["reports.sample.wide", { ...leadsMetric, key: "reports.sample.wide", kind: "LIST", aggregation: "LIST", read: async () => ({ kind: "LIST", rows: [Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`c${i}`, 1]))] }) } as MetricRegistration]]);
  ok("PF-R1 (break m3) fail: a LIST row over 20 columns is UNAVAILABLE", (await runMetrics(wide, OWNER, { metrics: ["reports.sample.wide"] })).metrics[0].status === "UNAVAILABLE");
  const moneyless = new Map([["reports.sample.table", { ...leadsMetric, key: "reports.sample.table", kind: "LIST", aggregation: "LIST", read: async () => ({ kind: "LIST", rows: [{ bucket: "1-30", currency: "CAD", amount: "900.00" }] }) } as MetricRegistration]]);
  ok("PF-R1 (break round 2 r1) fail: a table not declared per currency that carries a currency is UNAVAILABLE (it would skip view-financial)", (await runMetrics(moneyless, OFFICER, { metrics: ["reports.sample.table"] })).metrics[0].status === "UNAVAILABLE");
  const stuck = new Map([["reports.sample.stuck", { ...leadsMetric, key: "reports.sample.stuck", read: () => new Promise<never>(() => {}) } as MetricRegistration], ["reports.sample.leads", leadsMetric]]);
  const t0 = Date.now(), st = await withFirm(A, () => runMetrics(stuck, OWNER, { metrics: ["reports.sample.stuck", "reports.sample.leads"] }, undefined, 100));
  ok("PF-R1 (break m4, review m1) fail: a read that never answers is UNAVAILABLE at the time limit while the others answer", st.metrics[0].status === "UNAVAILABLE" && st.metrics[1].status === "OK" && Date.now() - t0 < 2000, st);
  const meddler = new Map([["reports.sample.meddle", { ...leadsMetric, key: "reports.sample.meddle", read: async (_c: never, f: { staffId?: string }) => { f.staffId = OFFICER.staffId; return { kind: "COUNT" as const, value: 0 }; } } as unknown as MetricRegistration], ["reports.sample.leads", leadsMetric]]);
  const md = await withFirm(A, () => runMetrics(meddler, OWNER, { metrics: ["reports.sample.meddle", "reports.sample.leads"] }));
  ok("PF-R1 (break m5) fail: a read cannot change the filters another read or its drill link sees", md.metrics[0].status === "UNAVAILABLE" && md.metrics[1].reading?.kind === "COUNT" && md.metrics[1].reading.value === inA && JSON.stringify(md.metrics[1].drill?.query) === "{}", md);
  const defs = reg.definitions(); (defs[0].drillTarget as { path: string }).path = "/api/elsewhere";
  ok("PF-R1 (break m5) fail: changing a definition handed out changes nothing registered", reg.definitions()[0].drillTarget?.path === "/api/front-office/leads");
  ok("PF-R1 (break m6) fail: without a report key the refusal is 403 even for a bad body", (await refusal(() => ask(without(OWNER, REPORT_KEYS.own, REPORT_KEYS.all, REPORT_KEYS.financial), { nope: 1 })))?.status === 403);
  ok("PF-R1 (break m2) fail: a LIST counted as COUNT, a COUNT treated per currency, and another module's key prefix are refused",
    [{ kind: "LIST", aggregation: "COUNT" }, { moneyTreatment: "PER_CURRENCY" }, { module: "other" }].every((o) => { try { reg.register({ ...leadsMetric, key: "reports.sample.extra", ...o } as MetricRegistration); return false; } catch { return true; } }));
  ok("PF-R1 (break m2) pass: the same module adds another key under its prefix", (() => { reg.register({ ...leadsMetric, key: "reports.sample.extra2" }); return reg.has("reports.sample.extra2"); })());

  // ----------------------------------------------------------------------------------------------- DW8: drill-through
  const drill = ownerSees.metrics[0].drill;
  const narrowedDrill = (await ask(OWNER, { metrics: ["reports.sample.leads"], filters: { from: "2026-11-01", to: "2026-11-30", staffId: OFFICER.staffId } })).metrics[0].drill;
  ok("PF-R1 DW8 pass: each figure carries its drill target and the exact filter, under the target's parameter names", drill?.path === "/api/front-office/leads" && JSON.stringify(narrowedDrill?.query) === JSON.stringify({ from: "2026-11-01", to: "2026-11-30", owner: OFFICER.staffId }), { drill, narrowedDrill });
  ok("PF-R1 DW8 pass: the Case Officer's drill link carries their own id (own scope)", officerSees.metrics[0].drill?.query.owner === OFFICER.staffId, officerSees.metrics[0].drill);
  const blunt = new Map([["reports.sample.blunt", { ...leadsMetric, key: "reports.sample.blunt", drillTarget: { path: "/api/front-office/leads", carries: { from: "from", to: "to" } } } as MetricRegistration]]);
  const bl = await withFirm(A, () => runMetrics(blunt, OFFICER, { metrics: ["reports.sample.blunt"] }));
  ok("PF-R1 DW8 fail (break M4): a target that cannot carry a filter in effect (the own scope's person) gives no drill link, never a wider one", bl.metrics[0].status === "OK" && bl.metrics[0].drill === null, bl);
  ok("PF-R1 DW8 fail (break M4): two filters sent to one parameter are refused at registration", (() => { try { new MetricRegistry().register({ ...leadsMetric, drillTarget: { path: "/api/front-office/leads", carries: { from: "d", to: "d" } } }); return false; } catch { return true; } })());
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
  const withCaseLoad = new MetricRegistry(); withCaseLoad.register({ ...leadsMetric, key: "reports.cases.case_load", label: "Case load (Sample)" });
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
