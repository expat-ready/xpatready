// FO-7r part 3 (R1.111; AG-6-31 rules 1-4, 10, 12; AG-6-30; AG-6-25 rules 1-3; AG-6-59 rules 5-6): the period exports.
// Named per rule, each with a pass and a fail:
//   E1 R1.111's Done-when: for one client and currency, a period's export sums (invoices − payments into operating +
//      refunds − credit notes − write-offs) equal the statement's INVOICES closing − opening, two periods and two
//      currencies; the trust ledger's amounts equal the TRUST change and its last running balance the TRUST closing;
//   E2 one CSV per kind with AG-6-31 rule 2's columns, only the period's rows, each in its own currency, no total row;
//   E3 background: POST answers 202 QUEUED with one JobPort job; READY with links once the job ran; the download
//      before then is 409; a run that fails leaves FAILED;
//   E4 audited: one money_export.created line with who, period and row counts (0 for an empty period: header only);
//   E5 the key: without agent/billing:export, POST, state and download are 403; no session 401;
//   E6 walls: firm B's id of firm A's export is 404 (state and file); firm A's files hold no firm B row;
//   E7 rules: TRUST_LEDGER while trust does not show → 422 naming kinds; the same id twice → one job; the same id for
//      another period → 409; to before from → 422; an unknown field → 422;
//   E8 the link expires (EXPORT_DAYS, Sample): after it, EXPIRED and the file 410;
//   E9 CSV safety: a cell starting = + - @ is written inert ('=…), quotes and commas quoted;
//   E10 keyset pages (AG-6-30): 2,500 invoices with one shared issue time export whole, none twice, over three pages, and
//      the invoices page plans on the firm-first index (firm_id, issued_at, id).
// A scratch database (every migration), the money features in a Nest app with PF-4's guard and PF-12's walls, fakeJobs
// and fakeFiles; fixtures through the real routes. No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7r3_exports.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../ports/clock.ts";
import { fakeFiles, type FilesPort } from "../ports/files.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { moneyVisible } from "./lib/money-visible.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7r3_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const exportsFeature = (await import("../api/src/features/client-money-exports.ts")).default;
const features: { controllers: unknown[]; providers: unknown[] }[] = [(await import("../api/src/features/client-money-invoices.ts")).default, (await import("../api/src/features/client-money-reads.ts")).default,
  (await import("../api/src/features/client-money-refunds.ts")).default, (await import("../api/src/features/client-money-trust.ts")).default, (await import("../api/src/features/client-money-write-offs.ts")).default,
  (await import("../api/src/features/client-money-reports.ts")).default, exportsFeature];
const { HEADERS, EXPORT_DAYS, PAGE, exportPageSql, cell } = await import("../api/src/client-money/reports/exports.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
let skew = 0;
const clock = new (class extends PlatformClock { override now() { return Date.now() + skew; } })();
const local = new LocalIdentity("fo7r3-check-signing-key-0123456789abcdef", () => Date.now());
const jobClock = new FakeClock(new Date()), jobs = fakeJobs(jobClock);
const inner = fakeFiles(); let failPut: RegExp | null = null;
const files: FilesPort = { ...inner, put: async (f, k, b, t) => { if (failPut?.test(k)) throw new Error("store refused (the check)"); return inner.put(f, k, b, t); } };
type Res = { status: number; body: any; text: string; headers: Headers };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
/** RFC 4180 rows (quotes, commas, CRLF), as a spreadsheet reads them. */
const parseCsv = (raw: string): string[][] => {
  const t = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(c); c = ""; } else if (ch === "\r" && t[i + 1] === "\n") { row.push(c); rows.push(row); row = []; c = ""; i++; } else c += ch;
  }
  if (c || row.length) { row.push(c); rows.push(row); }
  return rows;
};
const minor = (s: string) => Math.round(Number(s) * 100);
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() },
    { provide: LocalFiles, useValue: files }, { provide: PlatformJobs, useValue: jobs }, ...features.flatMap((x) => x.providers)];
  @Module({ controllers: [PlatformIdentityController, ...features.flatMap((x) => x.controllers)] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: process.env.FO7R_LOG ? ["error"] : false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* a CSV */ }
    return { status: r.status, body: b, text, headers: r.headers };
  };
  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => moneyVisible(sql, firm, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'seed:FO-7r-3', now()) returning id`));
  const PA = person(A, "a"), PO = person(A, "other"), PB = person(B, "b"), PBULK = person(A, "bulk");
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7r-3', now())`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo"), tO = await signIn("user-O", "sample-firm");

  // ------------------------------------------------------------------------------------------- fixtures (Sample)
  const M = "/front-office/money/invoices";
  const make = async (t: string, who: string, unitMinor: number, currency = "CAD") => { const d = await call(t, "POST", M, { personId: who, currency }); await call(t, "POST", `${M}/${d.body.id}/lines`, { kind: "FEE", description: "Fee (Sample)", unitMinor, ratePpm: 0 }); await call(t, "POST", `${M}/${d.body.id}/issue`); return d.body.id as string; };
  let n = 0; const pay = async (t: string, id: string, amountMinor: number) => (await call(t, "POST", `${M}/${id}/payments`, { method: "CASH", amountMinor, reference: `CASH-${++n}`, idempotencyKey: `fo7r3-pay-${n}` })).body;
  await call(tA, "PUT", "/front-office/money/trust/answer", { answer: "YES" });
  const iOld = await make(tA, PA, 100000), pOld = await pay(tA, iOld, 40000);
  const i2 = await make(tA, PA, 50000), p2 = await pay(tA, i2, 50000);
  const ref = await call(tA, "POST", `/front-office/money/payments/${p2.id}/refunds`, { amountMinor: 10000, method: "E_TRANSFER", reason: "Returned in part (Sample)", idempotencyKey: "fo7r3-refund-1" });
  const i3 = await make(tA, PA, 30000), cn = await call(tA, "POST", `${M}/${i3}/credit-notes`, { amountMinor: 5000, reason: "Fee reduced (Sample)" });
  const i4 = await make(tA, PA, 2500), wo = await call(tA, "POST", `${M}/${i4}/write-off`, { reason: "Wire fee (Sample)" });
  const iU = await make(tA, PA, 20000, "USD"); await pay(tA, iU, 5000);
  const dep = await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PA, method: "E_TRANSFER", amountMinor: 150000, currency: "CAD", reference: "ET-1", idempotencyKey: "fo7r3-dep-1" });
  const depU = await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PA, method: "E_TRANSFER", amountMinor: 10000, currency: "USD", reference: "ET-2", idempotencyKey: "fo7r3-dep-2" });
  const iOther = await make(tA, PO, 7000); await pay(tA, iOther, 7000);
  const iB = await make(tB, PB, 99900);
  // the old period: iOld and its payment, and the first trust deposit, dated 2020-03-15 (replica role: insert-only rows)
  sql(`set session_replication_role = replica; update money_invoice set issued_at = '2020-03-15 10:00:00+00' where id = '${iOld}'; update money_payment set received_at = '2020-03-15 11:00:00+00' where id = '${pOld.id}';
    update money_trust_entry set created_at = '2020-03-15 12:00:00+00' where payment_id = (select id from money_payment where idempotency_key = 'fo7r3-dep-1')`);
  ok("setup: invoices, payments, a refund, a credit note, a write-off and trust deposits through the real routes", !!pOld?.id && ref.status === 201 && cn.status === 201 && [200, 201].includes(wo.status) && dep.status === 201 && depU.status === 201 && !!iB,
    { pOld, ref: ref.body, cn: cn.body, wo: wo.body, dep: dep.body });

  const X = "/front-office/money/exports", ALL = ["INVOICES", "PAYMENTS", "REFUNDS", "CREDIT_NOTES", "WRITE_OFFS", "CREDITS", "TRUST_LEDGER"];
  const today = new Date().toISOString().slice(0, 10);
  const exportOf = async (t: string, from: string, to: string, kinds = ALL, id?: string) => {
    const q = await call(t, "POST", X, { from, to, kinds, ...(id ? { id } : {}) }); await jobs.runDue();
    const s = await call(t, "GET", `${X}/${q.body.id}`), out: Record<string, string[][]> = {};
    for (const f of s.body.files ?? []) out[f.kind] = parseCsv((await call(t, "GET", f.url.replace(/^\/api/, ""))).text);
    return { q, s, out };
  };

  // ---------------------------------------------------------------------------------------------------- E3 (queued first)
  const jobs0 = jobs.jobs.length, q0 = await call(tA, "POST", X, { from: "2020-03-01", to: today, kinds: ["PAYMENTS"] });
  const early = await call(tA, "GET", `${X}/${q0.body.id}/payments.csv`);
  ok("FO-7r3 E3 pass: POST answers 202 QUEUED and queues one job named client_money.export keyed money_export:<firm>:<id>", q0.status === 202 && q0.body.state === "QUEUED" && jobs.jobs.length === jobs0 + 1
    && jobs.jobs.at(-1)!.name === "client_money.export" && jobs.jobs.at(-1)!.key === `money_export:${A}:${q0.body.id}` && jobs.jobs.at(-1)!.firmId === A.toLowerCase(), { q0: q0.body, job: jobs.jobs.at(-1) });
  ok("FO-7r3 E3 fail: the file before the job ran → 409 \"still being prepared\"", early.status === 409 && JSON.stringify(early.body).includes("still being prepared"), early.body);
  await jobs.runDue();
  const s0 = await call(tA, "GET", `${X}/${q0.body.id}`);
  ok("FO-7r3 E3 pass: once the job ran, READY with one link per kind and its row counts", s0.body.state === "READY" && s0.body.files.length === 1 && s0.body.files[0].url.endsWith("/payments.csv") && s0.body.rows.PAYMENTS === 6, s0.body);

  // ---------------------------------------------------------------------------------------------------- E1 (R1.111 Done-when)
  const S = `/front-office/money/parties/person/${PA}/statement`;
  for (const [from, to] of [["2020-03-01", "2020-03-31"], ["2020-04-01", today]] as const) {
    const ex = await exportOf(tA, from, to), st = (await call(tA, "GET", `${S}?from=${from}&to=${to}&pageSize=200`)).body;
    for (const cur of ["CAD", "USD"]) {
      const mine = (k: string) => (ex.out[k] ?? []).slice(1).filter((r) => r[4] === "Client a Sample" && r[7] === cur);
      const sum = (k: string, only?: (r: string[]) => boolean) => mine(k).filter(only ?? (() => true)).reduce((s, r) => s + minor(r[5]!), 0);
      const exported = sum("INVOICES") - sum("PAYMENTS", (r) => r[9] === "OPERATING") + sum("REFUNDS") - sum("CREDIT_NOTES") - sum("WRITE_OFFS");
      const acct = st.accounts.find((a: any) => a.account === "INVOICES" && a.currency === cur) ?? { openingMinor: 0, closingMinor: 0 };   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
      ok(`FO-7r3 E1 pass: ${from}..${to} ${cur}: the export's sums (${exported}) equal the statement's running balance change (${acct.closingMinor - acct.openingMinor})`, exported === acct.closingMinor - acct.openingMinor && (cur === "USD" || from > "2020-03-31" || exported === 60000), { exported, acct });
      const trust = (ex.out.TRUST_LEDGER ?? []).slice(1).filter((r) => r[4] === "Client a Sample" && r[6] === cur), tAcct = st.accounts.find((a: any) => a.account === "TRUST" && a.currency === cur) ?? { openingMinor: 0, closingMinor: 0 };   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
      const tSum = trust.reduce((s, r) => s + minor(r[5]!), 0), lastRun = trust.length ? minor(trust.at(-1)![7]!) : tAcct.closingMinor;
      ok(`FO-7r3 E1 pass: ${from}..${to} ${cur}: the trust ledger's amounts equal the TRUST change and its running balance the TRUST closing`, tSum === tAcct.closingMinor - tAcct.openingMinor && lastRun === tAcct.closingMinor, { tSum, lastRun, tAcct });
    }
  }
  const wrong = await exportOf(tA, "2020-04-01", today), wSt = (await call(tA, "GET", `${S}?from=2020-04-01&to=${today}&pageSize=200`)).body;
  const withOld = (wrong.out.INVOICES ?? []).slice(1).filter((r) => r[4] === "Client a Sample" && r[7] === "CAD").reduce((s, r) => s + minor(r[5]!), 0) + 100000;
  ok("FO-7r3 E1 fail: a row of another period (iOld's CAD 1,000) would break the equality: it is not in the later period's file", !wrong.out.INVOICES!.some((r) => r[5] === "1000.00") && withOld !== wSt.accounts.find((a: any) => a.account === "INVOICES" && a.currency === "CAD").closingMinor - 0, withOld);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered

  // ---------------------------------------------------------------------------------------------------- E2
  const all = await exportOf(tA, "2020-03-01", today);
  ok("FO-7r3 E2 pass: seven files, each with AG-6-31 rule 2's columns (credit notes, credits and the trust ledger their own)", ALL.every((k) => all.out[k]?.[0]?.join() === HEADERS[k as keyof typeof HEADERS].join()), Object.fromEntries(ALL.map((k) => [k, all.out[k]?.[0]])));
  const payRows = all.out.PAYMENTS!.slice(1);
  ok("FO-7r3 E2 pass: payments in two currencies, each row in its own (CAD 400.00, USD 50.00), method and received into filled, no total row", payRows.some((r) => r[7] === "USD" && r[5] === "50.00") && payRows.some((r) => r[7] === "CAD" && r[5] === "400.00" && r[0] === "2020-03-15")
    && payRows.every((r) => r[2] !== "" && ["CAD", "USD"].includes(r[7]!) && r[8] !== "" && ["OPERATING", "TRUST"].includes(r[9]!)) && !payRows.some((r) => /total/i.test(r.join())), payRows);
  const inv = all.out.INVOICES!.slice(1), wos = all.out.WRITE_OFFS!.slice(1), cns = all.out.CREDIT_NOTES!.slice(1), rfs = all.out.REFUNDS!.slice(1);
  ok("FO-7r3 E2 pass: the write-off (CAD 25.00 on its invoice), the credit note (CAD 50.00), the refund (CAD 100.00) each in its own file with its related document",
    wos.length === 1 && wos[0]![5] === "25.00" && wos[0]![10]!.startsWith("INV") && cns.length === 1 && cns[0]![5] === "50.00" && rfs.length === 1 && rfs[0]![5] === "100.00" && inv.length === 6, { wos, cns, rfs, n: inv.length });
  const march = await exportOf(tA, "2020-03-01", "2020-03-31");
  ok("FO-7r3 E2 fail: a March period holds only March's rows (iOld and its payment), not today's", march.out.INVOICES!.length === 2 && march.out.PAYMENTS!.length === 2 && march.out.PAYMENTS![1]![0] === "2020-03-15", { inv: march.out.INVOICES, pay: march.out.PAYMENTS });

  // ---------------------------------------------------------------------------------------------------- E4, E6 (empty)
  const empty = await exportOf(tA, "2019-01-01", "2019-01-31");
  const aud = sql(`select actor || '|' || (detail->>'from') || '|' || (detail->>'to') || '|' || (detail->>'INVOICES') || '|' || (detail->>'TRUST_LEDGER') from audit_event where action = 'money_export.created' and entity_key = '${empty.q.body.id}'`);
  ok("FO-7r3 E4 pass: an empty period → header-only files for each kind asked", ALL.every((k) => empty.out[k]?.length === 1) && Object.values(empty.s.body.rows).every((v) => v === 0), empty.s.body);
  ok("FO-7r3 E4 pass: one audit line money_export.created by the person with the period and row counts 0", aud.split("\n").length === 1 && aud.startsWith("staff:") && aud.endsWith("|2019-01-01|2019-01-31|0|0"), aud);
  const audAll = sql(`select (detail->>'INVOICES') || '|' || (detail->>'PAYMENTS') from audit_event where action = 'money_export.created' and entity_key = '${all.q.body.id}'`);
  ok("FO-7r3 E4 fail: the counts are the rows written, not 0 (7 invoices, 6 payments in the firm)", audAll === `${all.out.INVOICES!.length - 1}|${payRows.length}` && audAll !== "0|0", audAll);

  // ---------------------------------------------------------------------------------------------------- E5
  const keyO = sql(`select count(*) from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/billing:export'`);
  const oPost = await call(tO, "POST", X, { from: "2020-03-01", to: today, kinds: ["INVOICES"] }), oState = await call(tO, "GET", `${X}/${all.q.body.id}`), oFile = await call(tO, "GET", `${X}/${all.q.body.id}/invoices.csv`), anon = await call(undefined, "GET", `${X}/${all.q.body.id}`);
  ok("FO-7r3 E5 fail: a person without agent/billing:export (a Case Officer) → 403 on POST, state and download; no session → 401", keyO === "0" && oPost.status === 403 && oState.status === 403 && oFile.status === 403 && anon.status === 401, [keyO, oPost.status, oState.status, oFile.status, anon.status]);
  const dl = await call(tA, "GET", `${X}/${all.q.body.id}/invoices.csv`);
  ok("FO-7r3 E5 pass: the key holder downloads the CSV as an attachment, not cached", dl.status === 200 && dl.headers.get("content-type")?.startsWith("text/csv") && /attachment; filename="invoices-2020-03-01-to-/.test(dl.headers.get("content-disposition") ?? "") && dl.headers.get("cache-control") === "no-store", [dl.status, dl.headers.get("content-disposition")]);

  // ---------------------------------------------------------------------------------------------------- E6
  const bState = await call(tB, "GET", `${X}/${all.q.body.id}`), bFile = await call(tB, "GET", `${X}/${all.q.body.id}/invoices.csv`), bad = await call(tA, "GET", `${X}/not-a-uuid`);
  ok("FO-7r3 E6 fail: firm B asking for firm A's export id → 404 (state and file); a malformed id 404", bState.status === 404 && bFile.status === 404 && bad.status === 404, [bState.status, bFile.status, bad.status]);
  const bOwn = await exportOf(tB, "2020-01-01", today, ["INVOICES"]);
  ok("FO-7r3 E6 pass: firm A's files hold no firm B row, and firm B's export holds only its own invoice", !all.out.INVOICES!.some((r) => r[4] === "Client b Sample") && bOwn.out.INVOICES!.length === 2 && bOwn.out.INVOICES![1]![4] === "Client b Sample", bOwn.out.INVOICES);

  // ---------------------------------------------------------------------------------------------------- E7
  const trustOff = await call(tB, "POST", X, { from: "2020-01-01", to: today, kinds: ["INVOICES", "TRUST_LEDGER"] });
  ok("FO-7r3 E7 fail: TRUST_LEDGER while trust does not show (firm B: unanswered, nothing held) → 422 naming kinds, nothing queued", trustOff.status === 422 && JSON.stringify(trustOff.body).includes("kinds") && JSON.stringify(trustOff.body).includes("no trust ledger"), trustOff.body);
  const ID = sql(`select gen_random_uuid()`), j1 = jobs.jobs.length;
  const once = await call(tA, "POST", X, { id: ID, from: "2020-03-01", to: "2020-03-31", kinds: ["INVOICES"] }), twice = await call(tA, "POST", X, { id: ID, from: "2020-03-01", to: "2020-03-31", kinds: ["INVOICES"] });
  ok("FO-7r3 E7 pass: the same export id queued twice → one job, the same export", once.status === 202 && twice.status === 202 && twice.body.id === ID && jobs.jobs.length === j1 + 1, [once.body, twice.body, jobs.jobs.length - j1]);
  const other = await call(tA, "POST", X, { id: ID, from: "2020-04-01", to: today, kinds: ["INVOICES"] }), back = await call(tA, "POST", X, { from: "2020-03-02", to: "2020-03-01", kinds: ["INVOICES"] });
  const extra = await call(tA, "POST", X, { from: "2020-03-01", to: today, kinds: ["INVOICES"], every: "month" }), none = await call(tA, "POST", X, { from: "2020-03-01", to: today, kinds: [] });
  ok("FO-7r3 E7 fail: the same id for another period → 409; to before from, an unknown field, no kind → 422", other.status === 409 && back.status === 422 && extra.status === 422 && none.status === 422 && jobs.jobs.length === j1 + 1, [other.status, back.status, extra.status, none.status]);
  await jobs.runDue();

  // ---------------------------------------------------------------------------------------------------- E9
  sql(`set session_replication_role = replica; update money_payment set reference = '=HYPERLINK("x"),1' where id = '${p2.id}'`);
  const inj = await exportOf(tA, "2020-04-01", today, ["PAYMENTS"]), raw = (await call(tA, "GET", `${X}/${inj.q.body.id}/payments.csv`)).text;
  ok("FO-7r3 E9 pass: a reference starting with = is written as '=… inside quotes (a spreadsheet shows text, runs nothing)", raw.includes(`"'=HYPERLINK(""x""),1"`) && inj.out.PAYMENTS!.some((r) => r[1] === `'=HYPERLINK("x"),1`), raw.slice(0, 400));
  ok("FO-7r3 E9 fail: + - @ starts are made inert too; a plain or a negative amount is not touched", cell("+1") === "'+1" && cell("-2") === "'-2" && cell("@x") === "'@x" && cell("plain") === "plain" && !raw.includes("'-"), [cell("+1"), cell("-2"), cell("@x")]);

  // ---------------------------------------------------------------------------------------------------- E3 (failure)
  failPut = /\/refunds\.csv$/;
  const failing = await exportOf(tA, "2020-03-01", today, ["INVOICES", "REFUNDS"]); failPut = null;
  const fDl = await call(tA, "GET", `${X}/${failing.q.body.id}/invoices.csv`);
  ok("FO-7r3 E3 fail: a run whose store refuses a file → FAILED, no link, the download says to make a new export, no audit line", failing.s.body.state === "FAILED" && failing.s.body.files.length === 0 && fDl.status === 409 && JSON.stringify(fDl.body).includes("failed")
    && sql(`select count(*) from audit_event where action = 'money_export.created' and entity_key = '${failing.q.body.id}'`) === "0", [failing.s.body, fDl.body]);

  // ---------------------------------------------------------------------------------------------------- E8
  const fresh = await call(tA, "GET", `${X}/${all.q.body.id}/invoices.csv`);
  skew = EXPORT_DAYS * 86_400_000 + 60_000;
  const late = await call(tA, "GET", `${X}/${all.q.body.id}`), lateFile = await call(tA, "GET", `${X}/${all.q.body.id}/invoices.csv`); skew = 0;
  ok(`FO-7r3 E8 pass: within ${EXPORT_DAYS} days the link works; after them the export reads EXPIRED, no links`, fresh.status === 200 && late.body.state === "EXPIRED" && late.body.files.length === 0, late.body);
  ok("FO-7r3 E8 fail: an expired link → 410 \"Make a new export\"", lateFile.status === 410 && JSON.stringify(lateFile.body).includes("Make a new export"), lateFile.body);

  // ---------------------------------------------------------------------------------------------------- E11 (review M1)
  // the rows read in order: eight deposits of one holder on one day → the trust ledger lists them in the ledger's seq, the
  // running balance rising by each amount to the statement's closing; every other file is in date order
  const PT = person(A, "trust"), amounts = [1000, 4000, 9000, 2000, 7000, 3000, 8000, 5000];
  for (const [k, a] of amounts.entries()) await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PT, method: "E_TRANSFER", amountMinor: a, currency: "CAD", reference: `ET-T${k}`, idempotencyKey: `fo7r3-dep-t${k}` });
  const ord = await exportOf(tA, "2020-03-01", today), tRows = ord.out.TRUST_LEDGER!.slice(1).filter((r) => r[4] === "Client trust Sample");
  const tClose = (await call(tA, "GET", `/front-office/money/parties/person/${PT}/statement?pageSize=200`)).body.accounts.find((a: any) => a.account === "TRUST" && a.currency === "CAD")?.closingMinor;   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  let run = 0; const rising = tRows.length === 8 && tRows.every((r, k) => minor(r[7]!) === (run += amounts[k]!) && minor(r[5]!) === amounts[k]);
  ok("FO-7r3 E11 pass: one holder's eight same-day deposits list in the ledger's order, each running balance the sum so far, the last the statement's trust closing", rising && minor(tRows.at(-1)![7]!) === tClose, { tRows: tRows.map((r) => r[7]), tClose });
  const firstPT = ord.out.TRUST_LEDGER!.findIndex((r) => r[4] === "Client trust Sample");
  ok("FO-7r3 E11 fail: no other holder's row falls inside that holder's run (a running balance never jumps to another client's)", ord.out.TRUST_LEDGER!.slice(firstPT, firstPT + 8).every((r) => r[4] === "Client trust Sample"), ord.out.TRUST_LEDGER!.map((r) => r[4]));
  const dated = ["INVOICES", "PAYMENTS", "REFUNDS", "CREDIT_NOTES", "WRITE_OFFS"].every((k) => ord.out[k]!.slice(1).every((r, i, a) => i === 0 || a[i - 1]![11]! <= r[11]!));
  ok("FO-7r3 E11 pass: every other file is in order of the day each row counts on (counted_on)", dated, ord.out.PAYMENTS!.map((r) => r[0]));
  // a holder with more entries than a page: 1,200 entries over two keyset pages, each once, in seq order
  const PT2 = person(A, "trust-bulk");
  sql(`set session_replication_role = replica; with p as (insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, created_at)
      select gen_random_uuid(), '${A}', 'E_TRANSFER', 100, 'CAD', 'TRUST', '2020-05-05 10:00:00+00', 'fo7r3-bulk-' || g, 'seed:FO-7r-3', '2020-05-05 10:00:00+00' from generate_series(1, 1200) g returning id, idempotency_key)
    insert into money_trust_entry (id, firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, payment_id, created_by, created_at)
    select gen_random_uuid(), '${A}', '${PT2}', 'DEPOSIT', 100, 'CAD', g, 100 * g, (select p.id from p where p.idempotency_key = 'fo7r3-bulk-' || g), 'seed:FO-7r-3', '2020-05-05 10:00:00+00' from generate_series(1, 1200) g`);
  const tb = await exportOf(tA, "2020-05-05", "2020-05-05", ["TRUST_LEDGER"]), tbRows = tb.out.TRUST_LEDGER!.slice(1);
  ok(`FO-7r3 E11 pass: 1,200 entries of one holder at one time export over two pages (${PAGE} a page), each once, in seq order`, tbRows.length === 1200 && tbRows.every((r, k) => minor(r[7]!) === 100 * (k + 1)), { n: tbRows.length, first: tbRows[0], last: tbRows.at(-1) });

  // ---------------------------------------------------------------------------------------------------- E12 (break M2)
  // a payment received before its invoice was issued: `date` is the day it came, `counted_on` the issue day the statement
  // counts it on; the period cuts by counted_on, so the export's sums still equal the statement's change
  const PE = person(A, "early"), iE = await make(tA, PE, 30000), pE = await pay(tA, iE, 10000);
  sql(`set session_replication_role = replica; update money_invoice set issued_at = '2020-02-20 10:00:00+00' where id = '${iE}'; update money_payment set received_at = '2020-02-02 10:00:00+00', reference = 'EARLY-1' where id = '${pE.id}'`);
  const feb = await exportOf(tA, "2020-02-01", "2020-02-29", ["INVOICES", "PAYMENTS"]), jan = await exportOf(tA, "2020-01-01", "2020-01-31", ["PAYMENTS"]);
  const earlyRow = feb.out.PAYMENTS!.find((r) => r[1] === "EARLY-1"), stE = (await call(tA, "GET", `/front-office/money/parties/person/${PE}/statement?from=2020-02-01&to=2020-02-29&pageSize=200`)).body.accounts.find((a: any) => a.account === "INVOICES" && a.currency === "CAD");   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const febSum = feb.out.INVOICES!.filter((r) => r[4] === "Client early Sample").reduce((t, r) => t + minor(r[5]!), 0) - feb.out.PAYMENTS!.filter((r) => r[4] === "Client early Sample" && r[9] === "OPERATING").reduce((t, r) => t + minor(r[5]!), 0);
  ok("FO-7r3 E12 pass: the early payment shows the day it came (2020-02-02) and counts on the issue day (2020-02-20); the period's sums equal the statement's change", earlyRow?.[0] === "2020-02-02" && earlyRow?.[11] === "2020-02-20" && febSum === stE.closingMinor - stE.openingMinor && febSum === 20000, { earlyRow, febSum, stE });
  ok("FO-7r3 E12 fail: January (the day it came) does not hold it: the period cuts by counted_on, as the statement", !jan.out.PAYMENTS!.some((r) => r[1] === "EARLY-1"), jan.out.PAYMENTS);

  // ---------------------------------------------------------------------------------------------------- E13 (Lead 1 on #3887)
  // the files reconcile across kinds in every case (AG-6-29's facts kept apart): paid from trust, money a credit note
  // returned from trust, credit kept, credit applied and its reversal, as check_fo7r_statement.ts S9 seeds them
  const PR = person(A, "recon"), today2 = today;
  await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PR, method: "E_TRANSFER", amountMinor: 100000, currency: "CAD", reference: "ET-R", idempotencyKey: "fo7r3-dep-r" });
  const rx = await make(tA, PR, 60000), rwx = await call(tA, "POST", "/front-office/money/trust/applications", { invoiceId: rx, amountMinor: 60000 });
  const RW = sql(`select id from money_trust_entry where invoice_id = '${rx}' and kind = 'WITHDRAWAL_TO_INVOICE'`);
  const rmoved = await call(tA, "POST", "/front-office/money/trust/to-move/batches", { currency: "CAD", direction: "TRUST_TO_OPERATING", transferDate: today2, lines: [{ sourceEntryId: RW, amountMinor: 60000 }] });
  sql(`insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, reason, overpaid_choice, overpaid_minor, overpaid_entry_id, created_by) values ('${A}', '${rx}', 5000, 'CAD', 'Refunded to the client (Sample)', 'OVERPAID_REFUND', 5000, '${RW}', 'seed:FO-7r-3')`);
  const ry = await make(tA, PR, 10000), rpy = await pay(tA, ry, 15000), rkeep = await call(tA, "POST", `/front-office/money/payments/${rpy.id}/extra`, { choice: "KEEP_AS_CREDIT" });
  const rz = await make(tA, PR, 8000);
  const rap = sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${A}', '${PR}', 'APPLIED', -3000, 'CAD', '${rz}', 'seed:FO-7r-3') returning id`);
  sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, reverses_entry_id, reason, created_by) values ('${A}', '${PR}', 'REVERSED', 1000, 'CAD', '${rap}', 'Applied too much (Sample)', 'seed:FO-7r-3')`);
  ok("setup E13: paid from trust, its move, a credit note returning money from trust, credit kept, applied and reversed are accepted", rwx.status === 201 && rmoved.status === 201 && rkeep.status === 201 && !!rap, { rwx: rwx.body, rmoved: rmoved.body, rkeep: rkeep.body });
  const rec = await exportOf(tA, "2020-01-01", today2), rSt = (await call(tA, "GET", `/front-office/money/parties/person/${PR}/statement?pageSize=200`)).body.accounts.find((a: any) => a.account === "INVOICES" && a.currency === "CAD");   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const of = (k: string, keep: (r: string[]) => boolean = () => true) => rec.out[k]!.slice(1).filter((r) => r[4] === "Client recon Sample" && keep(r));
  const sumOf = (rows: string[][], col = 5) => rows.reduce((t, r) => t + minor(r[col] || "0"), 0);
  const parts = { billed: sumOf(of("INVOICES")), paid: sumOf(of("PAYMENTS", (r) => r[9] === "OPERATING")), refunded: sumOf(of("REFUNDS")), credited: sumOf(of("CREDIT_NOTES")), returned: sumOf(of("CREDIT_NOTES"), 12),
    written: sumOf(of("WRITE_OFFS")), trust: sumOf(of("TRUST_LEDGER", (r) => !!r[8] && ["WITHDRAWAL_TO_INVOICE", "CORRECTION"].includes(r[2]!))),
    credit: sumOf(of("CREDITS", (r) => !!r[10] && ["APPLIED", "KEPT", "REVERSED_APPLIED", "REVERSED_KEPT"].includes(r[12]!))) };
  const owed = parts.billed - parts.paid + parts.refunded - parts.credited + parts.returned - parts.written + parts.trust + parts.credit;
  ok("FO-7r3 E13 pass: across kinds, billed − paid − paid from trust + returned from trust − credited − written off ± credit = the statement's change in what is owed (CAD)", owed === rSt.closingMinor - rSt.openingMinor && parts.trust === -60000 && parts.returned === 5000 && parts.credit === 3000, { parts, owed, rSt });
  ok("FO-7r3 E13 fail: leave out the credits file or the trust withdrawals and it no longer reconciles (each fact counts)", owed - parts.credit !== rSt.closingMinor - rSt.openingMinor && owed - parts.trust !== rSt.closingMinor - rSt.openingMinor, { parts });

  // ---------------------------------------------------------------------------------------------------- E14 (Lead 1's ruling (c) on #3887)
  // days in UTC, as the statement's, and each header says so: 22:30 on 31 March in Toronto is 02:30 UTC on 1 April
  const PZ = person(A, "zone"), iz = await make(tA, PZ, 4200);
  sql(`set session_replication_role = replica; update money_invoice set issued_at = '2025-03-31 22:30:00-04' where id = '${iz}'`);
  const mar = await exportOf(tA, "2025-03-01", "2025-03-31", ALL), apr = await exportOf(tA, "2025-04-01", "2025-04-30", ["INVOICES"]);
  const aprSt = (await call(tA, "GET", `/front-office/money/parties/person/${PZ}/statement?from=2025-04-01&to=2025-04-30&pageSize=200`)).body.accounts.find((a: any) => a.account === "INVOICES");   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r3 E14 pass: that invoice is in April's file, dated 2025-04-01, as the statement's April (its change CAD 42.00); every file's header ends \"Period cut in UTC\"", apr.out.INVOICES!.some((r) => r[4] === "Client zone Sample" && r[0] === "2025-04-01")
    && aprSt?.closingMinor - aprSt?.openingMinor === 4200 && ALL.every((k) => mar.out[k]![0]!.at(-1) === "Period cut in UTC") && mar.s.body.zone === "UTC", { apr: apr.out.INVOICES, aprSt, zone: mar.s.body.zone });
  ok("FO-7r3 E14 fail: it is not in March's file (the statement's March does not hold it either)", !mar.out.INVOICES!.some((r) => r[4] === "Client zone Sample"), mar.out.INVOICES);
  // a payment recorded by its day only (stored at 00:00 UTC) counts on that day, never the day before
  const iD = await make(tA, PZ, 1000), pD = await call(tA, "POST", `${M}/${iD}/payments`, { method: "CASH", amountMinor: 1000, reference: "DAY-ONLY", receivedOn: "2025-05-10", idempotencyKey: "fo7r3-day-only" });
  sql(`set session_replication_role = replica; update money_invoice set issued_at = '2025-05-09 12:00:00+00' where id = '${iD}'`);
  const may10 = await exportOf(tA, "2025-05-10", "2025-05-10", ["PAYMENTS"]), may9 = await exportOf(tA, "2025-05-09", "2025-05-09", ["PAYMENTS"]);
  ok("FO-7r3 E14 pass: a payment recorded as received on 10 May (stored 00:00 UTC) is in 10 May's file, dated 2025-05-10", pD.status === 201 && may10.out.PAYMENTS!.some((r) => r[1] === "DAY-ONLY" && r[0] === "2025-05-10" && r[11] === "2025-05-10"), { pD: pD.body, rows: may10.out.PAYMENTS });
  ok("FO-7r3 E14 fail: not in 9 May's file", !may9.out.PAYMENTS!.some((r) => r[1] === "DAY-ONLY"), may9.out.PAYMENTS);
  // a credit refunded to the client is a fact of the CREDITS file with no invoice: it never counts toward what is owed
  sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, reason, created_by) values ('${A}', '${PR}', 'REFUNDED', -500, 'CAD', 'Credit paid back (Sample)', 'seed:FO-7r-3')`);
  const rec2 = await exportOf(tA, "2020-01-01", today2, ["CREDITS"]), refunded = rec2.out.CREDITS!.slice(1).filter((r) => r[4] === "Client recon Sample" && r[12] === "REFUNDED");
  ok("FO-7r3 E14 pass: a REFUNDED credit entry is in the CREDITS file (-5.00) with no invoice, so E13's sum leaves it out", refunded.length === 1 && refunded[0]![5] === "-5.00" && refunded[0]![10] === "", refunded);

  // ---------------------------------------------------------------------------------------------------- E10
  const BULK = 2500;
  sql(`set session_replication_role = replica; insert into money_invoice (id, firm_id, person_id, number, currency, issued_at, issued_by, due_date, created_by, updated_at)
    select gen_random_uuid(), '${A}', '${PBULK}', 'BULK-' || g, 'CAD', '2019-06-01 09:00:00+00', 'seed:FO-7r-3', '2019-06-30', 'seed:FO-7r-3', now() from generate_series(1, ${BULK}) g; analyze money_invoice`);
  const bulk = await exportOf(tA, "2019-06-01", "2019-06-01", ["INVOICES"]), nums = bulk.out.INVOICES!.slice(1).map((r) => r[1]);
  ok(`FO-7r3 E10 pass: ${BULK} invoices sharing one issue time export whole over ${Math.ceil(BULK / PAGE)} keyset pages, none twice, none missed`, nums.length === BULK && new Set(nums).size === BULK && bulk.s.body.rows.INVOICES === BULK, { n: nums.length, uniq: new Set(nums).size });
  const plan = await owner.$transaction(async (tx) => { await tx.$executeRaw`set local enable_seqscan = off`;   // the plan's choice of index, not of a scan (a scratch table this small may favour one)
    return JSON.stringify(await tx.$queryRaw`explain (format json) ${exportPageSql(A, "INVOICES", "2019-06-01", "2019-06-01", "America/Toronto", new Date(), { k: "2019-06-01T09:00:00.000000", id: "00000000-0000-4000-8000-000000000000" })}`); });
  ok("FO-7r3 E10 pass: the invoices page plans on the firm-first index (firm_id, issued_at, id)", /money_invoice_firm_id_issued_at_id_idx/.test(plan), plan.slice(0, 600));
  const fullScan = await owner.$transaction(async (tx) => JSON.stringify(await tx.$queryRaw`explain (format json) select * from money_invoice i where i.firm_id = ${A}::uuid order by i.number limit 1000`));
  ok("FO-7r3 E10 fail: a read not keyed on (issued_at, id) does not use that index (the check tells the two apart)", !/money_invoice_firm_id_issued_at_id_idx/.test(fullScan), fullScan.slice(0, 300));
} catch (e) {
  fail++; console.log("FAIL  the check stopped:", e instanceof Error ? e.stack : e);
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nFO-7r part 3 exports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
