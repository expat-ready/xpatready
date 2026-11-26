// R1.79 part 3 (BACKLOG PF-R2cm; map row 79; AG-14-13, -14, -15, -36, -37; MS-D20(15), MS-D24): client money's dashboard
// figures on PF-R1's one door. Named "PF-R2cm DW<n>", each a pass and a fail:
//   DW1 registered: seven reports.money.* figures, each per currency with its words; a second registration is refused;
//   DW2 fees billed and collected (AG-14-13): billed = totals less credit notes; collected = paid into operating less its
//       refunds plus paid from trust; drafts, another firm's and other periods never count;
//   DW3 trust apart (AG-14-36, US-14): a trust deposit never counts as fees collected; with trust off, no trust figure;
//   DW4 ageing (AG-14-14): the buckets on the fake clock, a table test at each boundary day; written off is out;
//   DW5 currencies: CAD and USD are never summed, in any figure;
//   DW6 who: only agent/report:view-financial reads a money figure (view.own alone gets WITHHELD); a person filter keeps
//       that person's cases; the client-type switch is the billed party;
//   DW7 tax collected (AG-14-37): per tax name and currency, each name summed apart; government fees add nothing;
//   DW8 the read budget (STANDARDS §9) with ~3,000 invoices of the other firm (P-562), and the check bites.
// One scratch database with every migration and the two Sample firms' staff; money rows are written with the replica
// role (fixtures, Sample values), then every read runs through the app role inside the caller's firm, as the API server
// runs it (PF-12's walls). No server, no browser, no model call (US$0). The database is dropped at the end.
//   tsx studio/tests/check_pfr2cm_metrics.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { overBudget, REPORT_KEYS, type MetricAnswer, type MetricFilters, type ReportAnswer } from "../ports/metrics.ts";
import { AGEING_BUCKETS, bucketOf, frameOf, major, moneyMetrics, MoneyReports, openSql, taxNameOf } from "../api/src/client-money/reports/metrics.ts";
import { DUE_SQL, FACTS_LATERAL } from "../api/src/client-money/reads/status-sql.ts";
import { Prisma, PrismaClient } from "@prisma/client";
import { walledPool, wallUnscopedQueries, withFirm } from "../api/src/platform/firm-scope.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { PlatformClock } from "../api/src/platform/identity/port.ts";
import { MetricRegistry } from "../api/src/platform/reports/registry.ts";
import { ReportsController } from "../api/src/platform/reports/routes.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import type { Db } from "../api/src/core.ts";
import feature from "../api/src/features/client-money-metrics.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pfr2cm_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------------------- pure rules
ok("PF-R2cm DW4 pass: the bucket rule at each boundary day (0 current; 1 and 30; 31 and 60; 61 and 90; 91 on); no due date is current",
  eq([null, -5, 0, 1, 30, 31, 60, 61, 90, 91, 400].map(bucketOf), ["current", "current", "current", "days_1_30", "days_1_30", "days_31_60", "days_31_60", "days_61_90", "days_61_90", "days_90_plus", "days_90_plus"]));
ok("PF-R2cm DW4 fail: five buckets, in AG-14-14's order, never a sixth", eq(AGEING_BUCKETS.map((b) => b.label), ["Current", "1-30 days", "31-60 days", "61-90 days", "90+ days"]));
ok("PF-R2cm DW5 pass: minor units shown as major units with two decimals (AG-14-15), negatives and large sums exact", major(163000) === "1630.00" && major(-5) === "-0.05" && major("123456789012345") === "1234567890123.45" && major(0) === "0.00");
ok("PF-R2cm DW7 pass: the tax name is the cited table's for the rate: 5 % GST, 13 % and 15 % HST; another rate is named by its percentage",
  taxNameOf(50000) === "GST" && taxNameOf(130000) === "HST" && taxNameOf(150000) === "HST" && taxNameOf(70000) === "Tax at 7%");

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
  ok("PF-R2cm setup: user-R (Owner) holds agent/report:view-financial; user-O (Case Officer) holds report view.own and not view-financial; user-S is the solo firm's Owner",
    OWNER.keys.includes(REPORT_KEYS.financial) && OFFICER.keys.includes(REPORT_KEYS.own) && !OFFICER.keys.includes(REPORT_KEYS.financial) && SOLO.firmId === B && SOLO.keys.includes(REPORT_KEYS.financial), { R: OWNER.roles, O: OFFICER.roles });

  // ---------------------------------------------------------------------------------------------- fixtures (all Sample)
  const R = "set session_replication_role = replica;";
  sql(`${R} insert into money_payment_settings (firm_id, trust_answer, trust_answered_by, trust_answered_at, updated_by, updated_at) values ('${A}', 'YES', 'seed', now(), 'seed:PF-R2cm', now()), ('${B}', 'UNANSWERED', null, null, 'seed:PF-R2cm', now())`);
  const person = (firm: string, n: string) => sql(`${R} insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'pfr2cm.${n.toLowerCase()}@example.org', 'seed:PF-R2cm', now()) returning id`);
  const PA = person(A, "A"), PB = person(B, "B");
  const CA = sql(`${R} insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Maple Sample Ltd', 'maple sample ltd', 'seed:PF-R2cm', now()) returning id`);
  let no = 0, seq = 0;
  /** An invoice with lines [kind, amount, ratePpm, tax]; issued at `issued` (null: a draft), due `due`, on `caseId`. */
  const invoice = (o: { firm?: string; person?: string; company?: string; currency?: string; issued: string | null; due?: string; caseId?: string; lines: [string, number, number, number][] }) => {
    const firm = o.firm ?? A, cur = o.currency ?? "CAD";
    const id = sql(`${R} insert into money_invoice (firm_id, person_id, company_id, case_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) values ('${firm}', ${o.person ? `'${o.person}'` : "null"}, ${o.company ? `'${o.company}'` : "null"}, ${o.caseId ? `'${o.caseId}'` : "null"},
      ${o.issued ? `'R2CM-${++no}'` : "null"}, '${cur}', ${o.due ? `'${o.due}'` : "null"}, ${o.issued ? `'${o.issued}', 'seed'` : "null, null"}, 'seed', now()) returning id`);
    o.lines.forEach(([kind, amount, rate, tax], i) => sql(`${R} insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${firm}', '${id}', ${i + 1}, '${kind}', 'Sample', 1, ${amount}, ${amount}, ${rate}, ${tax}, '${cur}')`));
    return id;
  };
  const pay = (inv: string, amount: number, at: string, into = "OPERATING", cur = "CAD", firm = A) => sql(`${R} insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${firm}', '${inv}', 'CHEQUE', ${amount}, '${cur}', '${into}', '${at}', 'r2cm-${randomUUID()}', 'seed') returning id`);
  /** A trust entry; a deposit names its payment into trust (no invoice), as FO-7a's check asks. */
  const trust = (kind: string, amount: number, at: string, more = "") => {
    if (kind === "DEPOSIT") more = `payment_id=${sql(`${R} insert into money_payment (firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${A}', 'E_TRANSFER', ${amount}, 'CAD', 'TRUST', '${at}', 'r2cm-${randomUUID()}', 'seed') returning id`)}`;
    return trustEntry(kind, amount, at, more);
  };
  const trustEntry = (kind: string, amount: number, at: string, more = "") => sql(`${R} insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, created_by, created_at${more ? `, ${more.split("=")[0]}` : ""}) values ('${A}', '${PA}', '${kind}', ${amount}, 'CAD', ${++seq}, 0, 'seed', '${at}'${more ? `, '${more.split("=")[1]}'` : ""}) returning id`);

  // a case of firm A whose file owner is user-O (the person filter's case)
  const caseO = randomUUID(), clientO = randomUUID();
  sql(`${R} insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, file_owner, created_by) values ('${clientO}', '${randomUUID()}', 'sample-firm', '${A}', 1, 'Sample client', 'PERSON', '${PA}', '${OFFICER.staffId}', 'seed');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status, created_at) values ('${caseO}', '${randomUUID()}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-00001', 'sample-firm', '${A}', '${clientO}', 'OPEN', '2026-10-01T12:00:00Z')`);

  // I1: CAD, HST 13 % fee + a government fee; paid 600.00 into operating, 100.00 refunded, a 30.00 credit note; due 20 Nov
  const I1 = invoice({ person: PA, issued: "2026-11-05T15:00:00Z", due: "2026-11-20", lines: [["FEE", 100000, 130000, 13000], ["GOVERNMENT_FEE", 50000, 0, 0]] });
  const P1 = pay(I1, 60000, "2026-11-10T15:00:00Z");
  sql(`${R} insert into money_refund (firm_id, payment_id, amount_minor, currency, reason, route, idempotency_key, refund_ordinal, created_by, created_at) values ('${A}', '${P1}', 10000, 'CAD', 'Sample', 'OFFLINE', 'r2cm-refund-1', 1, 'seed', '2026-11-12T15:00:00Z')`);
  sql(`${R} insert into money_credit_note (firm_id, invoice_id, number, amount_minor, currency, reason, created_by, created_at) values ('${A}', '${I1}', 'CN-R2CM-1', 3000, 'CAD', 'Sample', 'seed', '2026-11-15T15:00:00Z')`);
  // US-14: 1,000.00 paid into trust on 3 Nov; 600.00 of fees paid from trust on 20 Nov (I2, no tax)
  trust("DEPOSIT", 100000, "2026-11-03T15:00:00Z");
  const I2 = invoice({ person: PA, issued: "2026-11-20T15:00:00Z", due: "2026-12-20", lines: [["FEE", 60000, 0, 0]] });
  trust("WITHDRAWAL_TO_INVOICE", -60000, "2026-11-20T16:00:00Z", `invoice_id=${I2}`);
  // I3: USD, a company, GST; due 1 Oct; 50.00 paid
  const I3 = invoice({ company: CA, currency: "USD", issued: "2026-11-06T15:00:00Z", due: "2026-10-01", lines: [["FEE", 20000, 50000, 1000]] });
  pay(I3, 5000, "2026-11-08T15:00:00Z", "OPERATING", "USD");
  // I4: CAD, issued in August and written off: never in the ageing
  const I4 = invoice({ person: PA, issued: "2026-08-15T15:00:00Z", due: "2026-09-01", lines: [["FEE", 10000, 0, 0]] });
  sql(`${R} insert into money_write_off (firm_id, invoice_id, amount_minor, currency, reason, created_by) values ('${A}', '${I4}', 10000, 'CAD', 'Small balance (Sample)', 'seed')`);
  // I5: CAD on user-O's case, HST 15 % + GST 5 % lines; due 31 Dec (current)
  invoice({ person: PA, caseId: caseO, issued: "2026-11-21T15:00:00Z", due: "2026-12-31", lines: [["FEE", 10000, 150000, 1500], ["FEE", 50000, 50000, 2500]] });
  // never counted: a draft of firm A, and firm B's invoice (B's trust is unanswered)
  invoice({ person: PA, issued: null, lines: [["FEE", 9999900, 130000, 1299987]] });
  const IB = invoice({ firm: B, person: PB, issued: "2026-11-07T15:00:00Z", due: "2026-06-01", lines: [["FEE", 77777, 0, 0]] });
  void IB;

  wallUnscopedQueries();   // from here as in the API server: a query with no firm reads nothing
  const NOW = new Date("2026-11-25T17:00:00Z");
  const registry = new MetricRegistry();
  new MoneyReports(registry, walled as unknown as Db, { now: () => NOW.getTime() } as PlatformClock).onModuleInit();
  const route = new ReportsController(registry);
  const ask = (who: StaffContext, body: unknown): Promise<ReportAnswer> => withFirm(who.firmId, () => route.query({ platform: who }, body));
  const one = async (who: StaffContext, key: string, filters: MetricFilters = {}): Promise<MetricAnswer> => (await ask(who, { metrics: [key], filters })).metrics[0]!;
  const figs = (a: MetricAnswer) => (a.status === "OK" && a.reading?.kind === "MONEY" ? Object.fromEntries(a.reading.figures.map((x) => [x.currency, x.amount])) : a.status);
  const rows = (a: MetricAnswer) => (a.status === "OK" && a.reading?.kind === "LIST" ? a.reading.rows : a.status);
  const NOV = { from: "2026-11-01", to: "2026-11-30" };
  const K = (k: string) => `reports.money.${k}`;

  // ------------------------------------------------------------------------------------------------------------ DW1
  const keys = registry.definitions().map((d) => d.key);
  ok("PF-R2cm DW1 pass: seven money figures on PF-R1's registry, each per currency, firm-wide, with its words in plain language",
    eq(keys, ["fees_billed", "fees_collected", "trust_received", "overdue_total", "overdue_ageing", "overdue_by_client", "tax_collected"].map(K)) && registry.definitions().every((d) => d.module === "client-money" && d.moneyTreatment === "PER_CURRENCY" && !d.scopeAware && d.source.length > 40), registry.definitions());
  ok("PF-R2cm DW1 fail: a second registration of a money key is refused (one owner per key)", (() => { try { new MoneyReports(registry, walled as unknown as Db, new PlatformClock()).onModuleInit(); return false; } catch (e) { return /already registered/.test(String(e)); } })());
  ok("PF-R2cm DW1 pass: the feature file registers the service, no route of its own", eq(feature, { providers: [MoneyReports] }));

  // ------------------------------------------------------------------------------------------------------------ DW2
  const billed = figs(await one(OWNER, K("fees_billed"), NOV)), collected = figs(await one(OWNER, K("fees_collected"), NOV));
  // billed CAD: I1 1,630.00 + I2 600.00 + I5 640.00 − credit note 30.00; USD: I3 210.00
  ok("PF-R2cm DW2 pass: fees billed in November = issued totals (tax and government fees in) less credit notes, per currency", eq(billed, { CAD: "2840.00", USD: "210.00" }), billed);
  // collected CAD: 600.00 − 100.00 refunded + 600.00 paid from trust; USD 50.00
  ok("PF-R2cm DW2 pass: fees collected in November = paid into operating less refunds, plus paid from trust (US-14's 600.00)", eq(collected, { CAD: "1100.00", USD: "50.00" }), collected);
  const oct = figs(await one(OWNER, K("fees_billed"), { from: "2026-10-01", to: "2026-10-31" })), aug = figs(await one(OWNER, K("fees_billed"), { from: "2026-08-01", to: "2026-08-31" }));
  ok("PF-R2cm DW2 fail: another period never counts November's money, and the draft's 112,998.87 counts in no period", eq(oct, {}) && eq(aug, { CAD: "100.00" }) && !JSON.stringify(figs(await one(OWNER, K("fees_billed")))).includes("1129"), { oct, aug });

  // ------------------------------------------------------------------------------------------------------------ DW3
  const trustA = figs(await one(OWNER, K("trust_received"), NOV));
  ok("PF-R2cm DW3 pass (US-14): trust received shows 1,000.00 and fees collected 1,100.00: the deposit is not in fees, the 600.00 from trust is", eq(trustA, { CAD: "1000.00" }) && collected !== "WITHHELD" && (collected as Record<string, string>).CAD === "1100.00", trustA);
  trust("DEPOSIT", 250000, "2026-11-22T15:00:00Z");
  const collected2 = figs(await one(OWNER, K("fees_collected"), NOV)), trust2 = figs(await one(OWNER, K("trust_received"), NOV));
  ok("PF-R2cm DW3 fail (AG-14-36): a further 2,500.00 trust deposit raises trust received and leaves fees collected as it was", eq(collected2, collected) && eq(trust2, { CAD: "3500.00" }), { collected2, trust2 });
  const D = trust("DEPOSIT", 40000, "2026-11-23T15:00:00Z");
  sql(`${R} insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, corrects_entry_id, correction_kind, reason, created_by, created_at) values ('${A}', '${PA}', 'CORRECTION', -40000, 'CAD', ${++seq}, 0, '${D}', 'RECORDED_BY_MISTAKE', 'Sample', 'seed', '2026-11-23T16:00:00Z')`);
  ok("PF-R2cm DW3 pass (MS-D24): a corrected deposit takes itself back out of trust received", eq(figs(await one(OWNER, K("trust_received"), NOV)), { CAD: "3500.00" }));
  const trustB = await one(SOLO, K("trust_received"), NOV);
  ok("PF-R2cm DW3 fail: with trust off for the solo firm, the answer holds no trust figure", trustB.status === "OK" && trustB.reading?.kind === "MONEY" && trustB.reading.figures.length === 0, trustB);

  // ------------------------------------------------------------------------------------------------------------ DW4
  const ageing = rows(await one(OWNER, K("overdue_ageing")));
  // on 25 Nov: I1 owes 1,100.00, 5 days late (1-30); I5 640.00 current; I3 USD 160.00, 55 days late (31-60); I4 written off
  ok("PF-R2cm DW4 pass: ageing on the fake clock (25 Nov): CAD current 640.00 and 1-30 1,100.00; USD 31-60 160.00; overdue totals per currency",
    eq(ageing, [{ currency: "CAD", current: "640.00", days_1_30: "1100.00", days_31_60: "0.00", days_61_90: "0.00", days_90_plus: "0.00", overdue_total: "1100.00" },
      { currency: "USD", current: "0.00", days_1_30: "0.00", days_31_60: "160.00", days_61_90: "0.00", days_90_plus: "0.00", overdue_total: "160.00" }]), ageing);
  ok("PF-R2cm DW4 fail: the written-off invoice (due 1 Sep, 100.00) is in no bucket, and the date range changes nothing", Array.isArray(ageing) && (ageing as Record<string, string>[]).filter((r) => r.currency === "CAD").every((r) => AGEING_BUCKETS.reduce((n, b) => n + Math.round(Number(r[b.key]) * 100), 0) === 174000) && eq(rows(await one(OWNER, K("overdue_ageing"), { from: "2020-01-01", to: "2020-01-02" })), ageing));
  ok("PF-R2cm DW4 pass: overdue total and overdue by client (AG-14-14): the client, the amount and the oldest days late, per currency",
    eq(figs(await one(OWNER, K("overdue_total"))), { CAD: "1100.00", USD: "160.00" }) && eq(rows(await one(OWNER, K("overdue_by_client"))), [
      { client: "Client A Sample", client_type: "Individual", currency: "CAD", overdue: "1100.00", oldest_days: 5 }, { client: "Maple Sample Ltd", client_type: "Corporate", currency: "USD", overdue: "160.00", oldest_days: 55 }]), rows(await one(OWNER, K("overdue_by_client"))));
  // the solo firm's one invoice (777.77, due 1 Jun) on the clock at each boundary day after its due date
  const bucketAt = async (days: number) => {
    const at = new Date(Date.parse("2026-06-01T17:00:00Z") + days * 86_400_000);
    const m = moneyMetrics(walled, () => at).find((x) => x.key === K("overdue_ageing"))!;
    const got = await withFirm(B, () => m.read({ firmId: B, staffId: SOLO.staffId, keys: SOLO.keys, scope: "financial" }, {}));
    const r = got.kind === "LIST" ? got.rows[0] : null;
    return r ? AGEING_BUCKETS.find((b) => r[b.key] === "777.77")?.key ?? null : null;
  };
  const table = [[0, "current"], [1, "days_1_30"], [30, "days_1_30"], [31, "days_31_60"], [60, "days_31_60"], [61, "days_61_90"], [90, "days_61_90"], [91, "days_90_plus"]] as const;
  const got: [number, string | null][] = [];
  for (const [d] of table) got.push([d, await bucketAt(d)]);
  ok("PF-R2cm DW4 pass (table): the database puts the invoice in the right bucket on each boundary day (0, 1, 30, 31, 60, 61, 90, 91)", eq(got, table), got);
  ok("PF-R2cm DW4 fail (table): one day either side of a boundary moves the invoice (30 → 1-30, 31 → 31-60: never both, never neither)", got[2]![1] !== got[3]![1] && got.every(([, b]) => b !== null));

  // ------------------------------------------------------------------------------------------------------------ DW5
  const all = await ask(OWNER, { metrics: keys, filters: NOV });
  const currencies = all.metrics.flatMap((m) => (m.reading?.kind === "MONEY" ? [m.reading.figures.map((x) => x.currency)] : m.reading?.kind === "LIST" ? [m.reading.rows.map((r) => r.currency)] : []));
  ok("PF-R2cm DW5 pass: every figure is one value per currency, CAD and USD side by side (each currency once in a MONEY figure)", all.metrics.every((m) => m.status === "OK") && all.metrics.filter((m) => m.reading?.kind === "MONEY").every((m) => m.reading?.kind === "MONEY" && new Set(m.reading.figures.map((x) => x.currency)).size === m.reading.figures.length), all.metrics.map((m) => m.status));
  ok("PF-R2cm DW5 fail: no figure holds a CAD + USD sum (2,840.00 + 210.00 = 3,050.00; 1,100.00 + 50.00 = 1,150.00) or a row without its currency",
    !JSON.stringify(all).includes("3050.00") && !JSON.stringify(all).includes("1150.00") && currencies.flat().every((c) => c === "CAD" || c === "USD"), currencies);

  // ------------------------------------------------------------------------------------------------------------ DW6
  const officer = await ask(OFFICER, { metrics: keys, filters: {} });
  ok("PF-R2cm DW6 pass: a person with agent/report:view.own and no view-financial gets no money figure: every one WITHHELD, nothing read",
    officer.metrics.every((m) => m.status === "WITHHELD" && m.reading === null && m.scope === null), officer.metrics.map((m) => m.status));
  ok("PF-R2cm DW6 fail: the Owner, holding view-financial, reads them at the financial scope", all.metrics.every((m) => m.scope === "financial"));
  const mine = { ...NOV, staffId: OFFICER.staffId };
  const oBilled = figs(await one(OWNER, K("fees_billed"), mine)), oTax = rows(await one(OWNER, K("tax_collected"), mine));
  ok("PF-R2cm DW6 pass: a person filter keeps the money on that person's cases: user-O's case holds I5 only (640.00; HST 15.00, GST 25.00)", eq(oBilled, { CAD: "640.00" }) && eq(oTax, [{ currency: "CAD", tax_name: "GST", tax: "25.00" }, { currency: "CAD", tax_name: "HST", tax: "15.00" }]), { oBilled, oTax });
  ok("PF-R2cm DW6 fail: a person filter naming someone with no case counts nothing (money with no case is nobody's)", eq(figs(await one(OWNER, K("fees_billed"), { ...NOV, staffId: OWNER.staffId })), {}));
  const corp = figs(await one(OWNER, K("fees_billed"), { ...NOV, clientType: "CORPORATE" })), ind = figs(await one(OWNER, K("fees_billed"), { ...NOV, clientType: "INDIVIDUAL" }));
  ok("PF-R2cm DW6 pass: the client-type switch is the billed party: Corporate is the company's USD invoice, Individual the person's CAD ones", eq(corp, { USD: "210.00" }) && eq(ind, { CAD: "2840.00" }), { corp, ind });
  const soloBilled = figs(await one(SOLO, K("fees_billed"), NOV));
  ok("PF-R2cm DW6 fail (walls): the solo firm sees only its own 777.77, never the Sample firm's money; a read named for the Sample firm inside the solo firm reads nothing",
    eq(soloBilled, { CAD: "777.77" }) && eq(await withFirm(B, () => moneyMetrics(walled, () => NOW)[0]!.read({ firmId: A, staffId: OWNER.staffId, keys: OWNER.keys, scope: "financial" }, NOV)), { kind: "MONEY", figures: [] }), soloBilled);

  // break M1: 1,000.00 deposited with no case, moved onto user-O's case, 300.00 refunded from the case
  const firmTrust0 = figs(await one(OWNER, K("trust_received"), NOV));
  const DM = trust("DEPOSIT", 100000, "2026-11-24T15:00:00Z");
  void DM;
  const out = sql(`${R} insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, created_by, created_at) values ('${A}', '${PA}', 'MOVE_TO_CASE', -100000, 'CAD', ${++seq}, 0, 'seed', '2026-11-24T16:00:00Z') returning id`);
  sql(`${R} insert into money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, seq, balance_after_minor, moved_from_entry_id, created_by, created_at) values ('${A}', '${PA}', '${caseO}', 'MOVE_TO_CASE', 100000, 'CAD', ${++seq}, 0, '${out}', 'seed', '2026-11-24T16:00:00Z');
    insert into money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, seq, balance_after_minor, refund_method, refunded_on, refund_reference, reason, created_by, created_at) values ('${A}', '${PA}', '${caseO}', 'REFUND_TO_CLIENT', -30000, 'CAD', ${++seq}, 0, 'E_TRANSFER', '2026-11-24', 'ET-R2CM', 'Sample', 'seed', '2026-11-24T17:00:00Z')`);
  const oTrust = figs(await one(OWNER, K("trust_received"), mine)), firmTrust1 = figs(await one(OWNER, K("trust_received"), NOV));
  ok("PF-R2cm DW6 pass (break M1): under a person filter, money moved onto that person's case counts as received there: 1,000.00 in, 300.00 refunded = 700.00", eq(oTrust, { CAD: "700.00" }), oTrust);
  ok("PF-R2cm DW6 fail (break M1): firm-wide the move nets to nothing (+700.00 only), and the case's refund never stands alone as a negative figure",
    eq(firmTrust1, { CAD: major(Math.round(Number((firmTrust0 as Record<string, string>).CAD) * 100) + 70000) }) && !JSON.stringify(oTrust).includes("-"), { firmTrust0, firmTrust1, oTrust });

  // ------------------------------------------------------------------------------------------------------------ DW7
  const tax = rows(await one(OWNER, K("tax_collected"), NOV));
  ok("PF-R2cm DW7 pass (AG-14-37): tax collected per tax name and currency: CAD HST 145.00 (13 % and 15 % summed under one name), CAD GST 25.00, USD GST 10.00",
    eq(tax, [{ currency: "CAD", tax_name: "GST", tax: "25.00" }, { currency: "CAD", tax_name: "HST", tax: "145.00" }, { currency: "USD", tax_name: "GST", tax: "10.00" }]), tax);
  ok("PF-R2cm DW7 fail: each name is summed apart (GST never inside HST, CAD GST never with USD GST: 35.00 and 170.00 appear nowhere); the government fee adds nothing",
    !JSON.stringify(tax).includes("35.00") && !JSON.stringify(tax).includes("170.00"));

  // ------------------------------------------------------------------------------------------------------------ DW8
  sql(`${R} insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at)
      select '${B}', '${PB}', 'BULK-' || g, case when g % 4 = 0 then 'USD' else 'CAD' end::"MoneyCurrency", date '2026-06-01' + (g % 150), timestamptz '2026-11-01 12:00Z' - (g || ' minutes')::interval, 'seed', 'seed', now() from generate_series(1, 3000) g;
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency)
      select '${B}', i.id, 1, 'FEE', 'Sample', 1, 10000, 10000, 130000, 1300, i.currency from money_invoice i where i.firm_id = '${B}' and i.number like 'BULK-%';
    insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by)
      select '${B}', i.id, 'CASH', 4000, i.currency, 'OPERATING', i.issued_at + interval '1 day', 'bulk-' || i.id, 'seed' from money_invoice i where i.firm_id = '${B}' and i.number like 'BULK-%3';
    -- break m2: 15,000 credit applications (five per invoice) and 15,000 reversals
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by)
      select '${B}', '${PB}', 'APPLIED', -10, i.currency, 1000 + row_number() over (), 0, i.id, 'seed:bulk' from money_invoice i cross join generate_series(1, 5) k where i.firm_id = '${B}' and i.number like 'BULK-%';
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, reverses_entry_id, reason, created_by)
      select '${B}', '${PB}', 'REVERSED', 4, e.currency, 100000 + row_number() over (), 0, e.id, 'Sample', 'seed:bulk' from money_credit_entry e where e.created_by = 'seed:bulk';
    analyze`);
  // a December invoice of the solo firm with credit applied (and part of it reversed) and a part payment, for the parity check
  const IC = invoice({ firm: B, person: PB, issued: "2026-12-01T15:00:00Z", due: "2026-12-02", lines: [["FEE", 30000, 0, 0]] });
  pay(IC, 1000, "2026-12-01T16:00:00Z", "OPERATING", "CAD", B);
  const AP = sql(`${R} insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) values ('${B}', '${PB}', 'APPLIED', -4000, 'CAD', 1, 0, '${IC}', 'seed') returning id`);
  sql(`${R} insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, reverses_entry_id, reason, created_by) values ('${B}', '${PB}', 'REVERSED', 1500, 'CAD', 2, 0, '${AP}', 'Sample', 'seed')`);
  const parity = async (firm: string, who: StaffContext) => {
    const today = "2026-11-25";
    const fr = await withFirm(firm, () => frameOf(walled, { firmId: firm, staffId: who.staffId, keys: who.keys, scope: "financial" }, {}));
    const set = await withFirm(firm, () => walled.$queryRaw<{ currency: string; days: number | null; due: bigint }[]>`select o.currency, o.days, o.due::bigint as due from (${openSql(fr, today)}) o order by 1, 2, 3`);
    const per = await db.$queryRaw<{ currency: string; days: number | null; due: bigint }[]>`select i.currency::text as currency, (${today}::date - i.due_date)::int as days, (${DUE_SQL})::bigint as due
      from money_invoice i cross join ${FACTS_LATERAL} where i.firm_id = ${firm}::uuid and i.issued_at is not null and f.write_offs = 0 order by 1, 2, 3`;
    return { same: eq(set.map((r) => [r.currency, r.days, String(r.due)]), per.map((r) => [r.currency, r.days, String(r.due)])), n: set.length, ic: per.some((r) => String(r.due) === "26500") };
  };
  const pA = await parity(A, OWNER), pB = await parity(B, SOLO);
  ok("PF-R2cm DW4 pass (parity): the set-based balance equals status-sql.ts's DUE_SQL invoice for invoice, in both firms (credit applied and reversed, refunds, trust paid, ~3,000 invoices)", pA.same && pB.same && pB.n > 3000 && pB.ic, { pA, pB });
  ok("PF-R2cm DW4 fail (parity): the written-off invoice is in neither list, and the credit-applied invoice owes 265.00 (300.00 − 10.00 paid − 40.00 applied + 15.00 reversed)", pA.n === 4 && pB.ic, { pA, pB });
  const ctxs = [{ firmId: A, staffId: OWNER.staffId, keys: OWNER.keys, scope: "financial" as const }, { firmId: B, staffId: SOLO.staffId, keys: SOLO.keys, scope: "financial" as const }];
  const slow = await overBudget(registry.all(), ctxs, (f, fn) => withFirm(f, fn), NOV);
  ok("PF-R2cm DW8 pass: every money figure answers within 200 ms (STANDARDS §9) in each firm with ~3,000 invoices in the other (15,000 credit applications and their reversals among them: break m2)", slow.length === 0, slow);
  const tight = await overBudget(registry.all(), ctxs.slice(1), (f, fn) => withFirm(f, fn), {}, -1);
  ok("PF-R2cm DW8 fail: the same check with no budget names every figure (it bites)", tight.length === keys.length, tight);

  // break m1 and m3: 102 CAD clients and 100 USD clients (with Client A and Maple) overdue in the Sample firm, past the 200-row cap
  sql(`${R} insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) select gen_random_uuid(), '${A}', 'Cap ' || g, 'Sample', 'cap' || g || '@example.org', 'seed:cap', now() from generate_series(1, 200) g;
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at)
      select '${A}', p.id, 'CAP-' || p.given_names, case when split_part(p.given_names, ' ', 2)::int <= 101 then 'CAD' else 'USD' end::"MoneyCurrency", '2026-11-01', '2026-10-15T12:00Z', 'seed', 'seed', now()
        from fo_person p where p.created_by = 'seed:cap';
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency)
      select '${A}', i.id, 1, 'FEE', 'Sample', 1, case when i.currency = 'CAD' then 100000 else 90000 end, case when i.currency = 'CAD' then 100000 else 90000 end, 0, 0, i.currency from money_invoice i where i.number like 'CAP-%'`);
  const capped = rows(await one(OWNER, K("overdue_by_client"))) as Record<string, string | number | null>[];
  const named = (cur: string) => capped.filter((r) => r.currency === cur && r.client_type !== null).length;
  ok("PF-R2cm DW4 pass (break m1): past the cap each currency keeps its own most owed (99 CAD, 99 USD named), never ranked CAD against USD", capped.length === 200 && named("CAD") === 99 && named("USD") === 99, { n: capped.length, cad: named("CAD"), usd: named("USD") });
  ok("PF-R2cm DW4 fail (break m1, m3): the rest is one row per currency with its sum: \"3 more clients\" CAD 3,000.00 and \"1 more client\" USD 160.00 (singular)",
    eq(capped.slice(-2), [{ client: "3 more clients", client_type: null, currency: "CAD", overdue: "3000.00", oldest_days: 24 }, { client: "1 more client", client_type: null, currency: "USD", overdue: "160.00", oldest_days: 55 }]), capped.slice(-2));
} finally {
  await walled.$disconnect().catch(() => {});
  await db.$disconnect().catch(() => {});
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nPF-R2cm money reports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
