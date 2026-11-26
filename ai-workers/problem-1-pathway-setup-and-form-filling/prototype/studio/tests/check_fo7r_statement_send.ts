// FO-7r part 2 (R1.111; AG-6-28 rules 3, 8-10, §13; AG-6-41; shape product/screens/fo-7s-money/build/r1-111-shape.md,
// Lead 4 on #3634): the statement PDF and Send statement. Named per rule, each with a pass and a fail:
//   P1 the PDF prints part 1's figures: every line's amount and running balance, each account's opening and closing,
//      owed, and "Held in trust for …" per case from the summary; an empty period prints "No entries in this period";
//   P2 Send statement: a person with agent/invoice:issue sends one email to the client's own address (no Cc) with the
//      statement text and the PDF, and one "statement.sent" audit line; without the key 403, nothing sent, no line;
//   P3 the recipient: a person's email, or a company's primary contact's; no address → 422 naming `to`, nothing sent;
//   P4 bounded: more than 5,000 lines → 422 "choose a shorter period"; a shorter period prints;
//   P5 who: another firm's client 404, no session 401, and a person without agent/invoice:show gets no PDF (403);
//   P6 a person only: no schedule field is taken (422 naming it); a mail failure answers NOT_SENT and writes no line;
//   P7 Send statement names its period on purpose: EVERYTHING or DATES (no period → 422 naming period, before the client).
// A scratch database (every migration), the money features in a Nest app with PF-4's guard and PF-12's walls; fixtures
// through FO-7b's and FO-7t's real routes. No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7r_statement_send.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { moneyVisible } from "./lib/money-visible.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7r2_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

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
const reports = (await import("../api/src/features/client-money-reports.ts")).default;
const features: { controllers: unknown[]; providers: unknown[] }[] = [(await import("../api/src/features/client-money-invoices.ts")).default, (await import("../api/src/features/client-money-reads.ts")).default,
  (await import("../api/src/features/client-money-refunds.ts")).default, (await import("../api/src/features/client-money-trust.ts")).default, reports];
const { StatementSend, STATEMENT_LINE_MAX } = await import("../api/src/client-money/reports/send.ts");
const { SIGNED } = await import("../api/src/client-money/reports/statement-document.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7r2-check-signing-key-0123456789abcdef", () => clock.now());
const inner = fakeMail({ failOn: (m) => m.to === "fo7r2.fails@example.org" });
/** The app's message layer refuses text over 100,000 characters (ports/messages.ts Words): the fake applies the same limit
 *  (review M1 on #3753: fakeMail alone takes any length). */
const TEXT_MAX = 100_000;
const mail = { get sent() { return inner.sent; }, inbox: (a: string) => inner.inbox(a),
  async send(m: Parameters<typeof inner.send>[0]) { if (m.text.length > TEXT_MAX) throw new Error(`text over ${TEXT_MAX} characters`); return inner.send(m); } };
type Res = { status: number; body: any; type: string | null; bytes: Buffer };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: mail }, ...features.flatMap((x) => x.providers)];
  @Module({ controllers: [PlatformIdentityController, ...features.flatMap((x) => x.controllers)] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: process.env.FO7R_LOG ? ["error"] : false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the reports feature registers Send statement", reports.providers.some((p) => (p as { provide?: unknown }).provide === StatementSend));
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const bytes = Buffer.from(await r.arrayBuffer()), t = bytes.toString("utf8"); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text or a PDF */ }
    return { status: r.status, body: b, type: r.headers.get("content-type"), bytes };
  };
  /** The text a PDF page prints: each `(…) Tj` line of the plain text writer (invoices/documents.ts textPdf). */
  const pdfText = (bytes: Buffer) => [...bytes.toString("latin1").matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]!.replace(/\\(.)/g, "$1")).join("\n");
  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string, email: string | null) => moneyVisible(sql, firm, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', ${email === null ? "null" : `'${email}'`}, 'seed:FO-7r-2', now()) returning id`));
  const PA = person(A, "a", "fo7r2.a@example.org"), PN = person(A, "no-email", null), PF = person(A, "fails", "fo7r2.fails@example.org"), PB = person(B, "b", "fo7r2.b@example.org"), PBULK = person(A, "bulk", "fo7r2.bulk@example.org");
  const CO = moneyVisible(sql, A, "company", sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Company C Sample', 'company c sample', 'seed:FO-7r-2', now()) returning id`));
  const contact = person(A, "contact", "fo7r2.contact@example.org");
  sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO}', '${contact}', 'PRIMARY', 'seed:FO-7r-2')`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7r-2', now())`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm");

  // ------------------------------------------------------------------------------------------- fixtures (Sample)
  const M = "/front-office/money/invoices";
  const make = async (unitMinor: number, who = PA, currency = "CAD", party: "personId" | "companyId" = "personId") => { const d = await call(tA, "POST", M, { [party]: who, currency }); if (d.status !== 201) console.log("DRAFT", d.status, JSON.stringify(d.body).slice(0, 400)); await call(tA, "POST", `${M}/${d.body.id}/lines`, { kind: "FEE", description: "Fee (Sample)", unitMinor, ratePpm: 0 }); return d.body.id as string; };
  const issue = async (id: string) => (await call(tA, "POST", `${M}/${id}/issue`)).body;
  let key = 0; const pay = async (id: string, amountMinor: number) => (await call(tA, "POST", `${M}/${id}/payments`, { method: "CASH", amountMinor, reference: `CASH-${++key}`, idempotencyKey: `fo7r2-pay-${key}` })).body;
  await call(tA, "PUT", "/front-office/money/trust/answer", { answer: "YES" });
  const i1 = await make(265550), iss1 = await issue(i1), p1 = await pay(i1, 100000);
  const usd = await make(500000, PA, "USD"); await issue(usd); await pay(usd, 200000);
  const dep = await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PA, method: "E_TRANSFER", amountMinor: 150000, currency: "CAD", reference: "ET-1", idempotencyKey: "fo7r2-dep-1" });
  const ic = await make(30000, CO, "CAD", "companyId"); await issue(ic);
  const iN = await make(10000, PN); await issue(iN);
  const iF = await make(10000, PF); await issue(iF);
  const iB = await call(await signIn("user-S", "sample-solo"), "POST", M, { personId: PB, currency: "CAD" });
  ok("setup: invoices, payments and a trust deposit are recorded through the real routes", dep.status === 201 && iss1?.invoice?.status === "ISSUED" && !!p1?.id && !!i1 && !!usd && !!ic && iB.status === 201, { dep: dep.body, iB: iB.body, iss1, p1 });

  // ---------------------------------------------------------------------------------------------------- P1
  const S = `/front-office/money/parties/person/${PA}`;
  const json = await call(tA, "GET", `${S}/statement?pageSize=200`), sumR = await call(tA, "GET", `${S}/summary`), pdf = await call(tA, "GET", `${S}/statement.pdf`), text = pdfText(pdf.bytes);
  const cadOf = (acct: string, cur: string) => json.body.accounts.find((a: any) => a.account === acct && a.currency === cur);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const printed = (cur: string, n: number) => `${cur} ${SIGNED(n)}`;
  const everyLine = json.body.items.every((l: any) => text.includes(`${printed(l.currency, l.amountMinor)}  balance ${printed(l.currency, l.balanceAfterMinor)}`));   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r P1 pass: the PDF is a PDF, with every line's amount and running balance, each account's opening and closing, as part 1's JSON", pdf.status === 200 && pdf.type?.startsWith("application/pdf") && pdf.bytes.subarray(0, 5).toString() === "%PDF-"
    && everyLine && json.body.accounts.every((a: any) => text.includes(`Closing balance: ${printed(a.currency, a.closingMinor)}`) && text.includes(`Opening balance: ${printed(a.currency, a.openingMinor)}`))   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
    && text.includes("YOUR STATEMENT") && text.includes("For: Client a Sample"), { status: pdf.status, text: text.slice(0, 900) });
  ok("FO-7r P1 pass: owed per currency from the summary, and the trust held as \"Held in trust for …: CAD 1,500.00\"", sumR.body.totals.every((t: any) => text.includes(`Owed: ${printed(t.currency, t.owedMinor)}`))   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
    && text.includes("Held in trust for you (not yet on a case): CAD 1,500.00") && cadOf("INVOICES", "CAD")?.closingMinor === 165550, { text: text.slice(-600) });
  ok("FO-7r P1 pass: the two currencies print apart, never added (no total of CAD and USD)", text.includes("Invoices and payments (CAD)") && text.includes("Invoices and payments (USD)") && !text.includes(printed("CAD", 165550 + 300000)));
  const empty = pdfText((await call(tA, "GET", `${S}/statement.pdf?from=2020-01-01&to=2020-01-31`)).bytes);
  ok("FO-7r P1 fail: an empty period prints \"No entries in this period\" and its opening = closing, not this period's lines", empty.includes("No entries in this period") && !empty.includes("Payment received") && empty.includes("Closing balance: CAD 0.00"), empty.slice(0, 600));

  // ---------------------------------------------------------------------------------------------------- P2, P6
  const ALL = { period: "EVERYTHING" };   // P7: Send statement names its period on purpose
  const before = mail.sent.length, lines0 = Number(sql(`select count(*) from audit_event where action = 'statement.sent'`));
  const sent = await call(tA, "POST", `${S}/statement/send`, ALL);
  const m = mail.sent.at(-1), audit = sql(`select actor || '|' || entity || '|' || entity_key || '|' || (detail->>'lines') from audit_event where action = 'statement.sent' order by at desc limit 1`);
  ok("FO-7r P2 pass: Send statement emails the client once, to their address, no Cc: a cover note (today's owed) and the statement as the PDF attached", sent.status === 200 && sent.body.email === "SENT" && sent.body.to === "fo7r2.a@example.org"
    && mail.sent.length === before + 1 && m?.to === "fo7r2.a@example.org" && !(m as any)?.cc && m?.text.includes("is attached as a PDF") && m?.text.includes(`Owed: ${printed("CAD", 165550)}`)   // eslint-disable-line @typescript-eslint/no-explicit-any -- an absent field
    && m?.attachments?.length === 1 && m.attachments[0]!.contentType === "application/pdf" && pdfText(Buffer.from(m.attachments[0]!.bytes)) === text, { sent: sent.body, m: m && { to: m.to, subject: m.subject } });
  ok("FO-7r P2 pass: one audit line \"statement.sent\" by the person, on the client, with the line count", Number(sql(`select count(*) from audit_event where action = 'statement.sent'`)) === lines0 + 1
    && audit.startsWith(`staff:`) && audit.includes(`|money_statement|${PA}|${json.body.items.length}`), audit);
  // review M4: a Case Officer as seeded holds agent/invoice:show but not agent/invoice:issue: the PDF answers, Send is 403
  const keysO = sql(`select string_agg(permission_key, ',') from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/invoice:show', 'agent/invoice:issue')`);
  const tO = await signIn("user-O", "sample-firm"), n1 = mail.sent.length, l1 = Number(sql(`select count(*) from audit_event where action = 'statement.sent'`));
  const showOk = await call(tO, "GET", `${S}/statement.pdf`), noKey = await call(tO, "POST", `${S}/statement/send`, ALL);
  ok(`FO-7r P2 fail: a Case Officer with agent/invoice:show only (${keysO}) gets the PDF (200) but Send is 403, nothing sent, no line`, keysO === "agent/invoice:show" && showOk.status === 200 && noKey.status === 403 && mail.sent.length === n1
    && Number(sql(`select count(*) from audit_event where action = 'statement.sent'`)) === l1, { keysO, showOk: showOk.status, noKey: noKey.status });
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:show'`);   // this scratch database only
  const noShow = await call(await signIn("user-O", "sample-firm"), "GET", `${S}/statement.pdf`);
  ok("FO-7r P5 fail: without agent/invoice:show, no PDF (403)", noShow.status === 403, noShow.status);
  const sched = await call(tA, "POST", `${S}/statement/send`, { ...ALL, every: "month" });
  ok("FO-7r P6 fail: a schedule field is no field of Send statement (422 naming it): a person sends, never a schedule", sched.status === 422 && JSON.stringify(sched.body).includes("every") && mail.sent.length === n1, sched.body);
  // P7 (PF-28 (b) on #3753): the period is chosen on purpose; no period, or a period that contradicts its dates, sends nothing
  const l7 = Number(sql(`select count(*) from audit_event where action = 'statement.sent'`)), named = (r: { body: unknown }, k: string) => Object.hasOwn(((r.body as { fields?: object })?.fields) ?? {}, k);
  const noPeriod = await call(tA, "POST", `${S}/statement/send`, {}), noPeriodOther = await call(tA, "POST", `/front-office/money/parties/person/${sql(`select gen_random_uuid()`)}/statement/send`, {});
  const badKind = await call(tA, "POST", `/front-office/money/parties/logo/${PA}/statement/send`, {}), badId = await call(tA, "POST", `/front-office/money/parties/person/not-a-uuid/statement/send`, {});
  const allDated = await call(tA, "POST", `${S}/statement/send`, { period: "EVERYTHING", from: "2020-01-01" }), datesNone = await call(tA, "POST", `${S}/statement/send`, { period: "DATES" });
  ok("FO-7r P7 fail: a malformed kind or id → 404 before the body (the path's shape first)", badKind.status === 404 && badId.status === 404, [badKind.status, badId.status]);
  ok("FO-7r P7 fail: no period → 422 naming period, read before the client is looked up (an unknown client too); Everything with a date → 422 naming period; Dates with none → 422 naming from; nothing sent, no line",
    noPeriod.status === 422 && named(noPeriod, "period") && noPeriodOther.status === 422 && named(noPeriodOther, "period") && allDated.status === 422 && named(allDated, "period") && datesNone.status === 422 && named(datesNone, "from")
    && mail.sent.length === n1 && Number(sql(`select count(*) from audit_event where action = 'statement.sent'`)) === l7, [noPeriod.body, noPeriodOther.status, allDated.body, datesNone.body]);
  const dated = await call(tA, "POST", `${S}/statement/send`, { period: "DATES", from: "2020-01-01", to: "2020-01-31" }), dm = mail.sent.at(-1);
  ok("FO-7r P7 pass: Dates with a from and a to sends that period's statement (its PDF is the period's download), with its line",
    dated.status === 200 && dated.body.email === "SENT" && mail.sent.length === n1 + 1 && pdfText(Buffer.from(dm!.attachments![0]!.bytes)) === empty
    && Number(sql(`select count(*) from audit_event where action = 'statement.sent'`)) === l7 + 1, dated.body);
  const failed = await call(tA, "POST", `/front-office/money/parties/person/${PF}/statement/send`, ALL);
  ok("FO-7r P6 fail: a mail failure answers NOT_SENT and writes no audit line", failed.status === 200 && failed.body.email === "NOT_SENT" && Number(sql(`select count(*) from audit_event where action = 'statement.sent'`)) === l7 + 1, failed.body);

  // ---------------------------------------------------------------------------------------------------- P3
  const co = await call(tA, "POST", `/front-office/money/parties/company/${CO}/statement/send`, ALL), noMail = await call(tA, "POST", `/front-office/money/parties/person/${PN}/statement/send`, ALL);
  ok("FO-7r P3 pass: a company's statement goes to its primary contact", co.status === 200 && co.body.email === "SENT" && co.body.to === "fo7r2.contact@example.org" && mail.inbox("fo7r2.contact@example.org").length === 1, co.body);
  ok("FO-7r P3 fail: a client with no email address → 422 naming to, nothing sent", noMail.status === 422 && JSON.stringify(noMail.body).includes('"to"') && JSON.stringify(noMail.body).includes("no email address"), noMail.body);

  // ---------------------------------------------------------------------------------------------------- P5
  const other = await call(tA, "GET", `/front-office/money/parties/person/${PB}/statement.pdf`), otherSend = await call(tA, "POST", `/front-office/money/parties/person/${PB}/statement/send`, ALL), anon = await call(undefined, "GET", `${S}/statement.pdf`);
  ok("FO-7r P5 fail: another firm's client → 404 (PDF and send), no session → 401", other.status === 404 && otherSend.status === 404 && anon.status === 401, { other: other.status, otherSend: otherSend.status, anon: anon.status });

  // ---------------------------------------------------------------------------------------------------- break round 1
  // M3, M2: a case of this client narrows the statement and its figures, and the page names it; another case is 404.
  const W = "00000000-0000-4000-8000-00000000f7r2".replace("f7r2", "0f72"), K1 = sql(`select gen_random_uuid()`), K2 = sql(`select gen_random_uuid()`), CL = sql(`select gen_random_uuid()`), CLB = sql(`select gen_random_uuid()`);
  sql(`set session_replication_role = replica;
    insert into case_client (id, workspace_id, firm_id, firm_key, client_number, display_name, display_kind, fo_person_id, created_by) values ('${CL}', '${W}', '${A}', 'sample-firm', 9701, 'Client a Sample', 'PERSON', '${PA}', 'seed:FO-7r-2'),
      ('${CLB}', '${W}', '${A}', 'sample-firm', 9702, 'Client no-email Sample', 'PERSON', '${PN}', 'seed:FO-7r-2');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, firm_id, case_number, client_id) values
      ('${K1}', '${W}', gen_random_uuid(), 'user-P', 'user-O', 'sample-firm', '${A}', 'C-2026-97001', '${CL}'), ('${K2}', '${W}', gen_random_uuid(), 'user-P', 'user-O', 'sample-firm', '${A}', 'C-2026-97002', '${CLB}');
    update money_invoice set case_id = '${K1}' where id = '${i1}'`);
  const onCase = pdfText((await call(tA, "GET", `${S}/statement.pdf?caseId=${K1}`)).bytes);
  ok("FO-7r break M2 pass: a case's statement says \"case C-2026-97001 only\" and shows that case's owed alone (CAD 1,655.50), not the client's USD", onCase.includes("case C-2026-97001 only") && onCase.includes("Owed: CAD 1,655.50") && !onCase.includes("USD"), onCase.slice(0, 900));
  const notHers = await call(tA, "GET", `${S}/statement.pdf?caseId=${K2}`), n2 = mail.sent.length, notHersSend = await call(tA, "POST", `${S}/statement/send`, { ...ALL, caseId: K2 }), random = await call(tA, "GET", `${S}/statement.pdf?caseId=${sql(`select gen_random_uuid()`)}`);
  ok("FO-7r break M3 fail: another client's case, or an unknown case, → 404, nothing sent", notHers.status === 404 && notHersSend.status === 404 && random.status === 404 && mail.sent.length === n2, { notHers: notHers.status, notHersSend: notHersSend.status, random: random.status });
  const past = pdfText((await call(tA, "GET", `${S}/statement.pdf?to=2020-01-31`)).bytes);
  ok("FO-7r break M2 pass: today's figures on a past period's statement are headed \"As of <today>\"", past.includes(`As of ${new Date().toISOString().slice(0, 10)}:`) && past.includes("Closing balance: CAD 0.00"), past.slice(-500));
  // M1: an audit failure sends nothing (the line and the email are one step); a mail failure rolls the line back (P6)
  sql(`create function fo7r2_refuse() returns trigger language plpgsql as $$ begin if new.action = 'statement.sent' then raise exception 'refused for the check'; end if; return new; end $$;
    create trigger fo7r2_refuse before insert on audit_event for each row execute function fo7r2_refuse()`);
  const n3 = mail.sent.length, refused = await call(tA, "POST", `${S}/statement/send`, ALL);
  sql(`drop trigger fo7r2_refuse on audit_event; drop function fo7r2_refuse()`);
  ok("FO-7r break M1 fail: when the audit line cannot be written, no email is sent (and the caller is told it failed)", refused.status >= 500 && mail.sent.length === n3, { status: refused.status, sent: mail.sent.length - n3 });
  const again = await call(tA, "POST", `${S}/statement/send`, ALL);
  ok("FO-7r break M1 pass: with the audit working again, the send goes and writes its line", again.status === 200 && again.body.email === "SENT" && mail.sent.length === n3 + 1, again.body);
  // m2: an address the database holds but the mail port refuses is 422, not NOT_SENT
  sql(`update fo_person set email = 'a@@example.org' where id = '${PF}'`);
  const badAddr = await call(tA, "POST", `/front-office/money/parties/person/${PF}/statement/send`, ALL);
  ok("FO-7r break m2 fail: an email the mail port refuses (a@@example.org) → 422 naming to, nothing sent", badAddr.status === 422 && JSON.stringify(badAddr.body).includes('"to"'), badAddr.body);
  // m3: a merged-away person is not found (the survivor holds the money)
  sql(`set session_replication_role = replica; update fo_person set merged_into_id = '${PA}', merged_at = now() where id = '${PF}'`);
  const merged = await call(tA, "GET", `/front-office/money/parties/person/${PF}/statement.pdf`), mergedSum = await call(tA, "GET", `/front-office/money/parties/person/${PF}/summary`);
  ok("FO-7r break m3 fail: a merged-away person's statement and summary → 404", merged.status === 404 && mergedSum.status === 404, { merged: merged.status, mergedSum: mergedSum.status });

  // ---------------------------------------------------------------------------------------------------- P4
  const n = Math.ceil(STATEMENT_LINE_MAX / 2) + 1;   // each invoice is two lines (issued, paid)
  sql(`set session_replication_role = replica;
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', '${PBULK}', 'BULK2-' || g, 'CAD', date '2026-03-01', now() - interval '1 hour', 'seed:FO-7r-2', 'seed:FO-7r-2', now() from generate_series(1, ${n}) g;
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) select '${A}', i.id, 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD' from money_invoice i where i.person_id = '${PBULK}';
    insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) select '${A}', i.id, 'CASH', 1000, 'CAD', 'OPERATING', now(), 'bulk2-' || i.id, 'seed:FO-7r-2' from money_invoice i where i.person_id = '${PBULK}'; analyze`);   // statistics first (review: a 5,000-line read before them took minutes)
  const big = await call(tA, "GET", `/front-office/money/parties/person/${PBULK}/statement.pdf`), bigSend = await call(tA, "POST", `/front-office/money/parties/person/${PBULK}/statement/send`, ALL);
  const short = await call(tA, "GET", `/front-office/money/parties/person/${PBULK}/statement.pdf?to=2026-01-01`);
  ok(`FO-7r P4 fail: ${n * 2} lines (more than ${STATEMENT_LINE_MAX}) → 422 naming to, "choose a shorter period", nothing sent`, big.status === 422 && bigSend.status === 422 && JSON.stringify(big.body).includes("shorter period") && JSON.stringify(big.body).includes('"to"')
    && mail.inbox("fo7r2.bulk@example.org").length === 0, { big: big.body, bigSend: bigSend.status });
  ok("FO-7r P4 pass: a shorter period of the same client prints", short.status === 200 && short.type?.startsWith("application/pdf"), short.status);
  // review M1: a statement of 4,000 lines (past the ~1,400 the text limit once allowed) is sent: the cover note is short, the PDF holds it all
  const PLONG = person(A, "long", "fo7r2.long@example.org");
  sql(`set session_replication_role = replica;
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', '${PLONG}', 'LONG-' || g, 'CAD', date '2026-03-01', now() - interval '1 hour', 'seed:FO-7r-2', 'seed:FO-7r-2', now() from generate_series(1, 2000) g;
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) select '${A}', i.id, 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD' from money_invoice i where i.person_id = '${PLONG}';
    insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) select '${A}', i.id, 'CASH', 400, 'CAD', 'OPERATING', now(), 'long-' || i.id, 'seed:FO-7r-2' from money_invoice i where i.person_id = '${PLONG}'; analyze`);
  const long = await call(tA, "POST", `/front-office/money/parties/person/${PLONG}/statement/send`, ALL), lm = mail.inbox("fo7r2.long@example.org").at(-1);
  const lText = lm?.attachments?.[0] ? pdfText(Buffer.from(lm.attachments[0].bytes)) : "";
  ok(`FO-7r review M1 pass: a 4,000-line statement is sent (${long.body?.lines} lines): the cover note is ${lm?.text.length ?? 0} characters, the PDF holds every line`, long.status === 200 && long.body?.email === "SENT" && long.body?.lines === 4000
    && (lm?.text.length ?? TEXT_MAX) < 2_000 && lText.split("\n").filter((l) => l.includes("  balance CAD")).length === 4000, { long: long.body, len: lm?.text.length });
  ok("FO-7r review M1 fail: the same statement's full text is past the message layer's limit (why the body is a cover note)", lText.length > TEXT_MAX, lText.length);
  // break round 2 M1 and round 3 M1: statistics that lag a client's new rows (below autovacuum's re-analyze threshold, as in
  // a real firm): 20,000 other clients' invoices analyzed and autovacuum off on the money tables (this scratch database
  // only), then, not analyzed, one client with 2,500 invoices and a payment each (5,000 lines, the limit) and one with 5,000
  // invoices and no payment. Round 3: on the joins of round 2 these took 7.6-8.5 s and 17.8 s, a 500 at the 5 s limit.
  const PSTALE = person(A, "stale", "fo7r2.stale@example.org"), PNOPAY = person(A, "nopay", "fo7r2.nopay@example.org"), BOUND = 2000;
  sql(`set session_replication_role = replica;
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', gen_random_uuid(), 'POP-' || g, 'CAD', date '2026-03-01', now(), 'seed:FO-7r-2', 'seed:FO-7r-2', now() from generate_series(1, 20000) g;
    insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) select '${A}', i.id, 'CASH', 100, 'CAD', 'OPERATING', now(), 'pop-' || i.id, 'seed:FO-7r-2' from money_invoice i where i.number like 'POP-%';
    alter table money_invoice set (autovacuum_enabled = off); alter table money_invoice_line set (autovacuum_enabled = off); alter table money_payment set (autovacuum_enabled = off); analyze`);
  const seedClient = (pid: string, tag: string, n: number, pay: boolean) => sql(`set session_replication_role = replica;
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', '${pid}', '${tag}-' || g, 'CAD', date '2026-03-01', now() - interval '1 hour', 'seed:FO-7r-2', 'seed:FO-7r-2', now() from generate_series(1, ${n}) g;
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) select '${A}', i.id, 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD' from money_invoice i where i.person_id = '${pid}'
    ${pay ? `; insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) select '${A}', i.id, 'CASH', 400, 'CAD', 'OPERATING', now(), '${tag}-' || i.id, 'seed:FO-7r-2' from money_invoice i where i.person_id = '${pid}'` : ""}`);   // no analyze
  seedClient(PSTALE, "STALE", 2500, true); seedClient(PNOPAY, "NOPAY", 5000, false);
  const timed = async (m: string, path: string, body?: unknown) => { const t = performance.now(), r = await call(tA, m, path, body); return { ...r, ms: Math.round(performance.now() - t) }; };
  const S5 = `/front-office/money/parties/person/${PSTALE}`, N5 = `/front-office/money/parties/person/${PNOPAY}`;
  const stale = await timed("GET", `${S5}/statement.pdf`), staleSend = await timed("POST", `${S5}/statement/send`, ALL), staleSum = await timed("GET", `${S5}/summary`);
  const nopay = await timed("GET", `${N5}/statement.pdf`), nopaySum = await timed("GET", `${N5}/summary`);
  const owed = (r: { body: any }) => r.body?.totals?.find((t: any) => t.currency === "CAD")?.owedMinor;   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok(`FO-7r break R3-M1 pass: on lagging statistics 5,000 lines (the limit) print in ${stale.ms} ms and send in ${staleSend.ms} ms; 5,000 unpaid invoices print in ${nopay.ms} ms; the summaries in ${staleSum.ms} and ${nopaySum.ms} ms (each under ${BOUND} ms, the figures right)`,
    [stale, staleSend, staleSum, nopay, nopaySum].every((r) => r.status === 200 && r.ms < BOUND) && staleSend.body.email === "SENT" && staleSend.body.lines === 5000
    && pdfText(stale.bytes).includes(`Closing balance: CAD ${SIGNED(2500 * 600)}`) && pdfText(nopay.bytes).includes(`Closing balance: CAD ${SIGNED(5000 * 1000)}`) && owed(staleSum) === 2500 * 600 && owed(nopaySum) === 5000 * 1000,
    [stale, staleSend, staleSum, nopay, nopaySum].map((r) => [r.status, r.ms]));
  sql(`set session_replication_role = replica; insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) select '${A}', i.id, 'CASH', 400, 'CAD', 'OPERATING', now(), 'nopay-one', 'seed:FO-7r-2' from money_invoice i where i.person_id = '${PNOPAY}' limit 1`);
  const nSent = mail.sent.length, over = await timed("POST", `${N5}/statement/send`, ALL);
  ok(`FO-7r break R3-M1 fail: one line past the limit (5,001) on lagging statistics → 422 naming to in ${over.ms} ms (never the 5 s limit's 500), nothing sent`, over.status === 422 && JSON.stringify(over.body).includes('"to"') && over.ms < BOUND && mail.sent.length === nSent, [over.status, over.ms]);
  // review round 4 R4-1: the ids travel only when the planner's estimate is wrong; analyzed, the one-query path again
  const { invoiceIdsOf } = await import("../api/src/client-money/reports/statement.ts");
  const idsFor = (pid: string) => owner.$transaction((tx) => invoiceIdsOf(tx, A, { kind: "PERSON", id: pid, name: null }, "ALL", undefined));
  const lagging = await idsFor(PSTALE), small = await idsFor(PA);
  ok("FO-7r break R3-M1 pass: on lagging statistics the client's 2,500 invoice ids are bound (the planner's estimate is wrong); a small client's are not", lagging?.split(",").length === 2500 && small === null, [lagging?.split(",").length, small]);
  sql(`analyze money_invoice`);
  const analyzed = await idsFor(PSTALE);
  ok("FO-7r review R4-1 fail: once analyzed, the same 2,500 invoices plan from statistics, with no id list sent (part 1's page budget)", analyzed === null, analyzed?.length);
  // break round 2 m1: an address MailPort's own schema takes but the message layer's channel refuses (a@b-.example) is 422
  sql(`update fo_person set email = 'a@b-.example', merged_into_id = null, merged_at = null where id = '${PF}'`);
  const dash = await call(tA, "POST", `/front-office/money/parties/person/${PF}/statement/send`, ALL);
  ok("FO-7r break R2-m1 fail: a@b-.example → 422 naming to, nothing sent", dash.status === 422 && JSON.stringify(dash.body).includes('"to"'), dash.body);
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${(e as Error).stack ?? e}`);
} finally {
  await app?.close(); await owner.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* a later prune drops it */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
