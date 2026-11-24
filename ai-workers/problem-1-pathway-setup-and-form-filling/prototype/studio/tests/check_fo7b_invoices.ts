// FO-7b part 1a (QA-482: tax rounded per line by one stated rule; R1.59; brief build-lead-c-briefs/FO-7b-1a.md, with
// FO-7b.md's named cases and the rulings of 18 Nov): draft invoice lines through the route, each read back from
// money_invoice_line. R1-R8 and R10 (FO-7b.md; R2's and R7's planted fails: half up with Math.round, tax on the
// subtotal), R11 (another currency: 422, not 500, nothing written), R12 (rate in parts per million, taken as sent; out of
// range 422), R13 (a client-sent tax is ignored), R14 ("Prices include tax" on: refused in words); also the firm walls,
// one audit line per write, and two lines added at once.
// FO-7b part 1b (R1.56, R1.60; briefs/track-b/FO-7b-1b.md): issue (I), the invoice email held (E), R9 (the PDF, the receipt
// and the invoice.issued payload show the stored tax), payments recorded by hand with their receipts (P), Lead 91's read
// of #2204 (a paired move's one-row negative balance is never shown as a shortfall), credit notes (C), the derived status
// words (S, a table), overdue the day after the due date (a moved clock), ClientMoneyPort.hasMoney (H: the adapter and
// the fake, one contract), the walls and one audit line per change. Each a pass and a fail. The rates are
// CRA's GST/HST rates (5 %, 13 %, 15 %; P-701), used here as Sample (not cited in this file); 14 % is Sample only. A
// scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and this row's classes, with the local
// sign-in stand-in; the API connects as xr_app. No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7b_invoices.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";
import { FakeClock } from "../ports/clock.ts";
import { MONEY_EVENT, fakeClientMoney, invoiceStatus, type ClientMoneyPort, type InvoiceFacts } from "../ports/client-money.ts";
import { fakeMail } from "../ports/mail.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { documentRenderPortContract } from "../ports/contracts/document-render-port.contract.ts";
import { clientMoneyPortContract } from "../ports/contracts/client-money-port.contract.ts";
import { moneyVisible } from "./lib/money-visible.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7b_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

// --------------------------------------------------------------------------------------- the rule alone (no database)
/** The planted wrong implementations the cases must catch: half up through a float, and tax on the subtotal. */
const halfUp = (amount: number, ppm: number) => Math.round(amount * ppm / 1_000_000);
ok("FO-7b rule: JavaScript's Math.round(6.5) is 7 (half up), the reason taxForLine never uses it", Math.round(6.5) === 7 && halfUp(50, 130000) === 7);
ok("FO-7b rule pass: taxForLine is whole-number only: a float amount or rate, a negative, or a rate past 1,000,000 throws",
  [() => taxForLine(0.5, 130000), () => taxForLine(50, 0.13), () => taxForLine(-1, 130000), () => taxForLine(50, -1), () => taxForLine(50, 1_000_001), () => taxForLine(Number.MAX_SAFE_INTEGER + 1, 1)].every(throws)
  && taxForLine(0, 130000) === 0 && taxForLine(12345, 0) === 0 && taxForLine(100, 1_000_000) === 100);

// --------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
const { InvoiceDrafts } = await import("../api/src/client-money/invoices/drafts.ts");
const { InvoiceDraftsController, InvoiceMoneyController } = await import("../api/src/client-money/invoices/routes.ts");
const { MoneyDocuments, documentText, invoiceData } = await import("../api/src/client-money/invoices/documents.ts");
const { ClientMoney } = await import("../api/src/client-money/port.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const feature = (await import("../api/src/features/client-money-invoices.ts")).default;
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7b-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
const mail = fakeMail();
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: mail }, ...feature.providers];
  @Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers the invoice controller and its service", feature.controllers.length === 2 && feature.controllers[0] === InvoiceDraftsController && feature.controllers[1] === InvoiceMoneyController && (feature.providers[0] as { provide: unknown }).provide === InvoiceDrafts);
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => moneyVisible(sql, firm, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7b.${n}@example.org', 'seed:FO-7b-1a', now()) returning id`));   // C5 (#3305 M1): a client the caller sees
  const PA = person(A, "a"), PB = person(B, "b");
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo"), tO = await signIn("user-O", "sample-firm");
  const staffA = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);

  const noSettings = await call(tA, "POST", "/front-office/money/invoices", { personId: PA });
  ok("FO-7b setup fail: before the firm's payment settings exist, a draft is refused in words (409 PAYMENTS_NOT_SET_UP), nothing written",
    noSettings.status === 409 && noSettings.body?.code === "PAYMENTS_NOT_SET_UP" && sql(`select count(*) from money_invoice`) === "0", noSettings.body);
  // FO-7g part 1w (Lead B ruling A, 22 Nov): a line's rate is the firm's tax default, so both sample firms are registered
  // for tax; their province is Ontario (samples/firms.json), whose cited default is 13 %. A case at another rate puts
  // firm A in the province whose cited rate it is (atRate) while its draft is started (FO-7g part 3: a draft keeps the
  // Bill-to province it starts with, P-797), then back in Ontario.
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, tax_registered, tax_number, updated_by, updated_at) values ('${f}', true, '123456789RT0001', 'seed:FO-7b-1a', now())`);
  const PROVINCE_OF: Record<number, string> = { 130000: "ON", 150000: "NB", 140000: "NS", 50000: "AB" };
  const inProvince = (code: string) => sql(`update platform_firm set business_address = jsonb_set(coalesce(business_address, '{}'::jsonb), '{province_state}', to_jsonb('${code}'::text)) where id = '${A}'`);
  const atRate = async <T,>(ratePpm: number, run: () => Promise<T>): Promise<T> => { inProvince(PROVINCE_OF[ratePpm]); try { return await run(); } finally { inProvince("ON"); } };

  const draft = async (body: Record<string, unknown> = { personId: PA, currency: "CAD" }, t = tA) => call(t, "POST", "/front-office/money/invoices", body);
  const line = (id: string, body: Record<string, unknown>, t = tA) => call(t, "POST", `/front-office/money/invoices/${id}/lines`, body);
  const stored = (id: string) => sql(`select string_agg(position || ':' || kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor || ':' || currency, ',' order by position) from money_invoice_line where invoice_id = '${id}'`);
  const fee = (unitMinor: number, ratePpm: number, extra: Record<string, unknown> = {}) => ({ kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm, ...extra });
  /** One FEE line on a fresh CAD draft: the stored tax read back from money_invoice_line. */
  const taxOf = async (unitMinor: number, ratePpm: number) => { let d!: Res; const r = await atRate(ratePpm, async () => { d = await draft(); return line(d.body.id, fee(unitMinor, ratePpm)); }); return { r, tax: Number(sql(`select tax_minor from money_invoice_line where invoice_id = '${d.body.id}'`)) }; };

  // ------------------------------------------------------------------------------------------------- R1: AG-06
  const d1 = await draft();
  ok("FO-7b W1 pass: a draft in CAD for the firm's client (201, DRAFT, no number), one audit line by the staff member", d1.status === 201 && d1.body.status === "DRAFT" && d1.body.number === null && d1.body.currency === "CAD"
    && sql(`select count(*) || ':' || min(actor) || ':' || min(actor_type::text) from audit_event where action = 'invoice.draft_created' and entity_key = '${d1.body.id}'`) === `1:staff:${staffA}:FIRM_STAFF`, d1.body);
  const r1 = await line(d1.body.id, fee(85000, 130000));
  ok("FO-7b R1 pass (AG-06's example): CAD 850.00 FEE at 13 % → tax 110.50 stored, total 960.50 (money_invoice_total), one audit line",
    r1.status === 201 && stored(d1.body.id) === "1:FEE:85000:130000:11050:CAD" && r1.body.totalMinor === 96050 && sql(`select money_invoice_total('${A}', '${d1.body.id}')`) === "96050"
    && sql(`select count(*) from audit_event where action = 'invoice.line_added' and detail->>'invoiceId' = '${d1.body.id}'`) === "1", r1.body);
  const g1 = await call(tA, "GET", `/front-office/money/invoices/${d1.body.id}`);
  ok("FO-7b R1 pass: GET reads the draft back with its stored line and totals (850.00 + 110.50 = 960.50)", g1.status === 200 && g1.body.lines.length === 1 && g1.body.subtotalMinor === 85000 && g1.body.taxMinor === 11050 && g1.body.totalMinor === 96050, g1.body);

  // ------------------------------------------------------------------------------------------- R2-R6: half to even
  const R2 = (tax: number) => tax === 6;
  const t2 = await taxOf(50, 130000);
  ok("FO-7b R2 pass: 0.50 at 13 % (exact 6.5 cents) → 0.06 stored (a half goes to even, down)", R2(t2.tax), t2);
  // The planted service: the same InvoiceDrafts with half up through Math.round in place of taxForLine, run as firm A on
  // the app's walled database; the stored row is read back and the R2 case is asked of it.
  const planted = new InvoiceDrafts(nest.get(Db), auditEvent, halfUp, undefined, async () => "ALL" as const), ctxA = { staffId: staffA, firmId: A, firmKey: "sample-firm", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" } as never;
  const dP = await draft(); await withFirm(A, () => planted.addLine(ctxA, dP.body.id, fee(50, 130000)));
  const plantedTax = Number(sql(`select tax_minor from money_invoice_line where invoice_id = '${dP.body.id}'`));
  ok("FO-7b R2 fail (planted): the service with half up (Math.round) stores 0.07, and the case catches it", plantedTax === 7 && !R2(plantedTax), plantedTax);
  const cases: [string, number, number, number][] = [
    ["R3 (a half goes to even, up): 1.50 at 13 % (exact 19.5)", 150, 130000, 20],
    ["R4 (HST 15 %): 0.30 at 15 % (exact 4.5)", 30, 150000, 4], ["R4 (HST 15 %): 0.10 at 15 % (exact 1.5)", 10, 150000, 2],
    ["R4b (14 %, Sample): 0.25 at 14 % (exact 3.5)", 25, 140000, 4], ["R4b (14 %, Sample): 0.75 at 14 % (exact 10.5)", 75, 140000, 10],
    ["R5 (GST 5 %): 0.10 at 5 % (exact 0.5)", 10, 50000, 0], ["R5 (GST 5 %): 0.30 at 5 % (exact 1.5)", 30, 50000, 2],
    ["R6 (not a half): 0.51 at 13 % (6.63)", 51, 130000, 7], ["R6 (not a half): 0.49 at 13 % (6.37)", 49, 130000, 6],
  ];
  for (const [what, unit, ppm, want] of cases) { const t = await taxOf(unit, ppm); ok(`FO-7b ${what} → ${(want / 100).toFixed(2)} stored`, t.r.status === 201 && t.tax === want, t); }
  ok("FO-7b R3-R5 fail (planted): half up would store 0.05 for R4's 0.30 at 15 % and 0.01 for R5's 0.10 at 5 % (each case catches it)", halfUp(30, 150000) === 5 && halfUp(10, 50000) === 1);

  // ------------------------------------------------------------------------------------- R7: per line, then summed
  const d7 = await draft(); await line(d7.body.id, fee(50, 130000)); const r7 = await line(d7.body.id, fee(50, 130000));
  const R7 = (taxSum: number) => taxSum === 12;
  ok("FO-7b R7 pass: two lines of 0.50 at 13 % → tax 0.06 + 0.06 = 0.12, total 1.12", r7.status === 201 && stored(d7.body.id) === "1:FEE:50:130000:6:CAD,2:FEE:50:130000:6:CAD" && R7(r7.body.taxMinor) && r7.body.totalMinor === 112, r7.body);
  const dS = await draft(), sub = await line(dS.body.id, fee(100, 130000));
  ok("FO-7b R7 fail (planted): tax on the subtotal, as the route itself taxes one 1.00 line (0.13), is caught", sub.status === 201 && sub.body.taxMinor === 13 && !R7(sub.body.taxMinor), sub.body);

  // --------------------------------------------------------------------------------------- R8: large and exact
  let d8!: Res; const r8 = await atRate(150000, async () => { d8 = await draft(); return line(d8.body.id, fee(2147483647, 150000)); });
  ok("FO-7b R8 pass: unit 21,474,836.47 at 15 % → 3,221,225.47 exactly (exact 322,122,547.05 cents, down); the total past 2^31 is exact (24,696,061.94)",
    r8.status === 201 && stored(d8.body.id) === "1:FEE:2147483647:150000:322122547:CAD" && r8.body.totalMinor === 2469606194 && sql(`select money_invoice_total('${A}', '${d8.body.id}')`) === "2469606194", r8.body);
  const big = await line(d8.body.id, fee(2147483647, 0, { quantity: 2 }));
  ok("FO-7b R8 fail: a line whose quantity × unit passes 21,474,836.47 → 422 at unitMinor, in words, nothing written", big.status === 422 && big.body.errors?.[0]?.field === "unitMinor" && stored(d8.body.id).split(",").length === 1, big.body);

  // ------------------------------------------------------------------------------------- R10: a government fee
  const d10 = await draft(); await line(d10.body.id, { kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 25500 });
  const r10 = await line(d10.body.id, fee(100000, 130000));
  ok("FO-7b R10 pass: a 255.00 GOVERNMENT_FEE line beside 1,000.00 FEE at 13 % → tax only on the fee (130.00); the fee line's rate and tax are 0",
    stored(d10.body.id) === "1:GOVERNMENT_FEE:25500:0:0:CAD,2:FEE:100000:130000:13000:CAD" && r10.body.taxMinor === 13000 && r10.body.totalMinor === 138500, r10.body);
  const r10g = await line(d10.body.id, { kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 25500, ratePpm: 130000 });
  ok("FO-7b R10 fail (FO-7g part 1w): a GOVERNMENT_FEE line sent with 13 % → 422 at ratePpm (never taxed, no override), nothing written",
    r10g.status === 422 && r10g.body.errors?.[0]?.field === "ratePpm" && stored(d10.body.id).split(",").length === 2, r10g.body);

  // ------------------------------------------------------------------------------------- R11: another currency
  const linesNow = () => sql(`select count(*) from money_invoice_line`);
  let n0 = linesNow(); const r11 = await line(d1.body.id, fee(1000, 0, { currency: "USD" }));
  ok("FO-7b R11 pass: a USD line on the CAD draft → 422 (not 500) at currency, in plain words, and no row written",
    r11.status === 422 && r11.body.errors?.[0]?.field === "currency" && r11.body.detail === "This invoice is in CAD; a line in USD can't be added. Nothing was saved." && linesNow() === n0, r11.body);
  ok("FO-7b R11 fail (stand-in): a CAD line, sent with its currency, on the same draft is added (201)", (await line(d1.body.id, fee(1000, 0, { currency: "CAD" }))).status === 201);
  const dUsd = await draft({ personId: PA, currency: "USD" }), rUsd = await line(dUsd.body.id, fee(85000, 130000));
  ok("FO-7b R11 pass: a USD draft takes its own lines in USD (the line's currency is the invoice's)", rUsd.status === 201 && stored(dUsd.body.id) === "1:FEE:85000:130000:11050:USD", rUsd.body);

  // ------------------------------------------------------------------------------------ R12: parts per million
  const d12 = await draft(); const r12 = await line(d12.body.id, fee(100000, 1300));
  ok("FO-7b R12 pass (FO-7g part 1w): ratePpm 1300 (13 % typed in basis points) is neither the default nor 0 → 422 at ratePpm, nothing written; the default (130000) is taken",
    r12.status === 422 && r12.body.errors?.[0]?.field === "ratePpm" && stored(d12.body.id) === "" && (await line(d12.body.id, fee(100000, 130000))).status === 201 && stored(d12.body.id) === "1:FEE:100000:130000:13000:CAD", r12.body);
  n0 = linesNow();
  const bad = await Promise.all([-1, 1_000_001, 1.5, "130000"].map((ratePpm) => line(d12.body.id, fee(100000, 0, { ratePpm }))));
  ok("FO-7b R12 fail: ratePpm −1, 1,000,001, 1.5 and the text \"130000\" → 422 at ratePpm, nothing written",
    bad.every((x) => x.status === 422 && x.body.errors?.some((e: { field: string }) => e.field === "ratePpm")) && linesNow() === n0, bad.map((x) => [x.status, x.body?.errors]));
  const badUnit = await Promise.all([-1, 0.5, "100"].map((unitMinor) => line(d12.body.id, fee(0, 0, { unitMinor }))));
  ok("FO-7b R12 fail: a unit amount of −1, 0.5 cents or text → 422 at unitMinor (never a float total), nothing written", badUnit.every((x) => x.status === 422 && x.body.errors?.[0]?.field === "unitMinor") && linesNow() === n0, badUnit.map((x) => x.body?.errors));

  // ----------------------------------------------------------------- descriptions (break report 8a243502f, Major 1)
  n0 = linesNow();
  const odd = ["\u200b", "Fee \u0085 x", "Fee \u0080", "Fee \u202e gnp.exe", "Fee \u2066x\u2069", "\u0301\u0301", "\u3164", "Fee \ud800 x", "\udc00"];   // the last two: a lone surrogate (break report on #2883, Major 1: was a 500 at the audit write)
  const oddAns = await Promise.all(odd.map((description) => line(d12.body.id, fee(100, 0, { description }))));
  ok("FO-7b text fail: a description the database's text rule refuses (zero-width only, C1 controls, bidi override and isolate, combining marks only, Hangul filler, a lone surrogate) → 422 at description, never 500, nothing written",
    oddAns.every((x) => x.status === 422 && x.body.errors?.[0]?.field === "description") && linesNow() === n0, oddAns.map((x) => [x.status, x.body?.errors?.[0]?.field]));
  const emoji = await line(d12.body.id, fee(100, 0, { description: "\u{1F4B8}".repeat(300) })), words = await line(d12.body.id, fee(100, 0, { description: "Frais de dossier — été, 申请费, رسوم" }));
  ok("FO-7b text pass: 300 emoji (600 UTF-16 units, 300 characters) and mixed-script words are stored as sent", emoji.status === 201 && words.status === 201 && linesNow() === String(Number(n0) + 2), [emoji.body?.errors, words.body?.errors]);

  // ------------------------------------------------------------------------------------- R13: a client's tax
  const d13 = await draft(); const r13 = await line(d13.body.id, fee(85000, 130000, { taxMinor: 1, amountMinor: 5 }));
  ok("FO-7b R13 pass: a client-sent taxMinor (1) and amountMinor (5) are ignored: the stored line is 850.00 and 110.50", r13.status === 201 && stored(d13.body.id) === "1:FEE:85000:130000:11050:CAD", r13.body);
  const unknown = await line(d13.body.id, fee(100, 0, { firmId: B }));
  ok("FO-7b R13 fail (stand-in): any other unknown field (a firm id from the request) → 422, nothing written", unknown.status === 422 && stored(d13.body.id).split(",").length === 1, unknown.body);
  // PF-28 part 6 (break report on #2883, minors 1-2): a "__proto__" key is refused in the money shape (its errors list at
  // the field); an unknown key's name is never echoed in full (a 10,000-character key → a small answer, the name cut).
  const proto = await call(tA, "POST", `/front-office/money/invoices/${d13.body.id}/lines`, JSON.parse(`{"kind":"FEE","description":"Sample","unitMinor":1,"__proto__":{"x":1}}`));
  const longKey = await line(d13.body.id, fee(100, 0, { ["k".repeat(10_000)]: 1 }));
  ok("PF-28 part 6 fail: a __proto__ key → 422 with errors and fields at __proto__; a 10,000-character unknown key → 422 in under 4 KB, the name cut; nothing written",
    proto.status === 422 && proto.body.errors?.[0]?.field === "__proto__" && Object.hasOwn(proto.body.fields ?? {}, "__proto__") && longKey.status === 422 && JSON.stringify(longKey.body).length < 4096 && stored(d13.body.id).split(",").length === 1, [proto.body, JSON.stringify(longKey.body).length]);

  // ---------------------------------------------------------------------------- R14: "Prices include tax" on
  sql(`update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001', prices_include_tax = true where firm_id = '${A}'`);
  const before14 = sql(`select count(*) from money_invoice`) + "/" + linesNow();
  const c14 = await draft(), l14 = await line(d1.body.id, fee(1000, 130000));
  ok("FO-7b R14 pass: with \"Prices include tax\" on, a new draft and a new line are refused in words (409 PRICES_INCLUDE_TAX), nothing written",
    [c14, l14].every((x) => x.status === 409 && x.body.code === "PRICES_INCLUDE_TAX" && /Prices that include tax come later/.test(x.body.detail)) && sql(`select count(*) from money_invoice`) + "/" + linesNow() === before14, [c14.body, l14.body]);
  sql(`update money_payment_settings set prices_include_tax = false where firm_id = '${A}'`);
  ok("FO-7b R14 fail (stand-in): with it off again, the same draft is made (201)", (await draft()).status === 201);

  // ------------------------------------------------------------------------------------------- the firm walls
  const bRead = await call(tB, "GET", `/front-office/money/invoices/${d1.body.id}`), bLine = await line(d1.body.id, fee(100, 0), tB), bDraft = await draft({ personId: PA }, tB);
  ok("FO-7b walls pass: firm B gets 404 on firm A's draft (read and add a line) and on a draft for firm A's client; nothing written",
    [bRead, bLine, bDraft].every((x) => x.status === 404) && sql(`select count(*) from money_invoice where firm_id = '${B}'`) === "0", [bRead.status, bLine.status, bDraft.status]);
  const bOwn = await draft({ personId: PB }, tB);
  ok("FO-7b walls fail (stand-in): firm B's own draft for its own client is 201, in firm B", bOwn.status === 201 && sql(`select firm_id from money_invoice where id = '${bOwn.body.id}'`) === B, bOwn.body);
  ok("FO-7b inputs: no session → 401; a malformed id → 404, never 500", (await call(undefined, "GET", `/front-office/money/invoices/${d1.body.id}`)).status === 401
    && (await call(tA, "GET", "/front-office/money/invoices/not-a-uuid")).status === 404 && (await line("not-a-uuid", fee(100, 0))).status === 404);

  // ---------------------------------------------------- who may add a line (review 8a243502f, Minor 1; AG-06 C5)
  n0 = linesNow(); const byO = await line(d1.body.id, fee(999999, 0), tO);
  ok("FO-7b keys fail: a Case Officer (agent/invoice:create, no :edit) adding to the Owner's draft → 403 MISSING_PERMISSION, nothing written",
    byO.status === 403 && byO.body.code === "MISSING_PERMISSION" && linesNow() === n0, byO.body);
  const dO = await draft({ personId: PA }, tO), ownO = await line(dO.body.id, fee(1000, 130000), tO);
  ok("FO-7b keys pass (stand-in): the Case Officer adds a line to the draft they started (201); the Owner (:edit) adds to it too",
    dO.status === 201 && ownO.status === 201 && (await line(dO.body.id, fee(1000, 0))).status === 201, [dO.status, ownO.body]);

  // ------------------------------------------------------------------------------------ two lines added at once
  const dRace = await draft(); const both = await Promise.all([line(dRace.body.id, fee(50, 130000)), line(dRace.body.id, fee(150, 130000))]);
  const gRace = await call(tA, "GET", `/front-office/money/invoices/${dRace.body.id}`);
  ok("FO-7b race pass: two lines added at once both land (positions 1 and 2) and the total is the sum of both (0.50 + 0.06 + 1.50 + 0.20 = 2.26)",
    both.every((x) => x.status === 201) && sql(`select string_agg(position::text, ',' order by position) from money_invoice_line where invoice_id = '${dRace.body.id}'`) === "1,2" && gRace.body.totalMinor === 226, [both.map((x) => x.status), gRace.body]);
  ok("FO-7b audit pass: one line per write (every draft and every line written above), each by a typed staff actor",
    sql(`select count(*) from audit_event where action = 'invoice.draft_created'`) === sql(`select count(*) from money_invoice`) && sql(`select count(*) from audit_event where action = 'invoice.line_added'`) === linesNow()
    && sql(`select count(*) from audit_event where action like 'invoice.%' and actor not like 'staff:%'`) === "0");

  // ======================================================================================== FO-7b part 1b
  const M = "/front-office/money/invoices", post = (path: string, body: unknown = {}, t = tA) => call(t, "POST", `${M}/${path}`, body);
  const auditN = (action: string, key: string) => sql(`select count(*) from audit_event where action = '${action}' and (entity_key = '${key}' or detail->>'invoiceId' = '${key}')`);
  const events = (type: string, subject: string) => sql(`select count(*) from module_event where type = '${type}' and subject_id = '${subject}'`);
  const today = new Date().toISOString().slice(0, 10), plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  /** An issued invoice of one FEE line for a client of firm A. */
  const issued = async (unitMinor: number, ratePpm = 130000, body: Record<string, unknown> = {}, personId = PA) => { const d = await draft({ personId, currency: "CAD" }); await line(d.body.id, fee(unitMinor, ratePpm)); return (await post(`${d.body.id}/issue`, body)).body.invoice; };
  let key = 0; const pay = (id: string, amountMinor: number, extra: Record<string, unknown> = {}, t = tA) => post(`${id}/payments`, { method: "E_TRANSFER", amountMinor, idempotencyKey: `fo7b-1b-${++key}`, ...extra }, t);
  const pdfText = async (path: string) => { const r = await fetch(`${base}/api${M}/${path}`, { headers: { authorization: `Bearer ${tA}` } }); const b = Buffer.from(await r.arrayBuffer()).toString("latin1");
    return { status: r.status, type: r.headers.get("content-type"), pdf: b.startsWith("%PDF-1.4") && b.trimEnd().endsWith("%%EOF"), text: [...b.matchAll(/^\((.*)\) Tj T\*$/gm)].map((m) => m[1].replace(/\\([\\()])/g, "$1")).join("\n") }; };

  // ------------------------------------------------------------------------------------------------- I: issue
  const dI = await draft(); await line(dI.body.id, fee(100000, 130000));
  const noKey = await post(`${dI.body.id}/issue`, {}, tO), wallI = await post(`${dI.body.id}/issue`, {}, tB), empty = await post(`${(await draft()).body.id}/issue`);
  ok("FO-7b I fail: a Case Officer (no agent/invoice:issue) → 403; firm B → 404; a draft with no lines → 409 NO_LINES; nothing issued", noKey.status === 403 && wallI.status === 404 && empty.status === 409 && empty.body.code === "NO_LINES" && sql(`select count(*) from money_invoice where issued_at is not null`) === "0", [noKey.status, wallI.status, empty.body]);
  const i1 = await post(`${dI.body.id}/issue`), inv1 = i1.body.invoice;
  ok("FO-7b I pass: issue → 200, INV-0001, ISSUED, Open, due in 14 days (the firm's default), the email HELD while the operating details are empty (nothing sent), one audit line, invoice.issued written",
    i1.status === 200 && inv1.number === "INV-0001" && inv1.status === "ISSUED" && inv1.statusWord === "Open" && inv1.dueDate === plus(today, 14) && inv1.dueMinor === 113000 && i1.body.email === "HELD" && mail.sent.length === 0
    && auditN("invoice.issued", inv1.id) === "1" && events(MONEY_EVENT.INVOICE_ISSUED, inv1.id) === "1", i1.body);
  const again = await post(`${inv1.id}/issue`), edit = await line(inv1.id, fee(100, 0));
  ok("FO-7b I fail: issuing it again → 409 ISSUED (no second number); a line on the issued invoice → 409 \"use a credit note\"; its lines are unchanged",
    again.status === 409 && again.body.code === "ISSUED" && edit.status === 409 && /Use a credit note/.test(edit.body.detail) && stored(inv1.id) === "1:FEE:100000:130000:13000:CAD" && sql(`select next_number from money_number_series where firm_id = '${A}' and kind = 'INVOICE'`) === "2", [again.body, edit.body]);
  const two = await Promise.all([draft(), draft()]); await Promise.all(two.map((d) => line(d.body.id, fee(1000, 0))));
  const both2 = await Promise.all(two.map((d) => post(`${d.body.id}/issue?dueDate=${plus(today, 30)}`)));
  ok("FO-7b I pass: two invoices issued at the same moment take INV-0002 and INV-0003 (no gap, no clash), each with the due date sent",
    both2.map((x) => x.body.invoice?.number).sort().join() === "INV-0002,INV-0003" && both2.every((x) => x.body.invoice.dueDate === plus(today, 30)), both2.map((x) => x.body));
  // Batch #3016 (check_pf28_inputs): issue's one input is the query, parsed strictly before the invoice is read.
  const dQ = await draft(); await line(dQ.body.id, fee(100, 0)); const qUnknown = await post(`${dQ.body.id}/issue?pf28Unknown=x`), qBadId = await post(`not-a-uuid/issue?pf28Unknown=x`);
  ok("FO-7b I fail (PF-28): an unknown query field on issue → 422 naming it, before anything is read (also for a malformed id); the draft stays a draft",
    qUnknown.status === 422 && Object.hasOwn(qUnknown.body.fields ?? {}, "pf28Unknown") && qBadId.status === 422 && sql(`select issued_at is null from money_invoice where id = '${dQ.body.id}'`) === "t", [qUnknown.body, qBadId.status]);
  ok("FO-7b I fail: a due date that is not a date → 422 at dueDate, the draft stays a draft", await (async () => { const d = await draft(); await line(d.body.id, fee(100, 0)); const r = await post(`${d.body.id}/issue?dueDate=2026-02-30`); return r.status === 422 && r.body.fields?.dueDate && sql(`select issued_at is null from money_invoice where id = '${d.body.id}'`) === "t"; })());

  // ----------------------------------------------------------------- E: the invoice email waits (AG-6-71 rule 3)
  sql(`update money_payment_settings set operating_details = 'Payee: Sample Firm. Interac e-Transfer: pay@example.org (Sample)' where firm_id = '${A}'`);
  const sent = await post(`${inv1.id}/send`), m1 = mail.inbox("fo7b.a@example.org");
  ok("FO-7b E pass: with the operating details filled, send → SENT: one email to the bill-to, no Cc, the invoice PDF attached, the details printed",
    sent.status === 200 && sent.body.email === "SENT" && mail.sent.length === 1 && m1.length === 1 && !("cc" in m1[0]) && m1[0].attachments?.[0]?.filename === "INV-0001.pdf" && m1[0].attachments[0].contentType === "application/pdf" && /pay@example\.org/.test(m1[0].text) && /INVOICE INV-0001/.test(m1[0].text), sent.body);
  ok("FO-7b E fail (stand-in): a draft is not sent (409 DRAFT); sending INV-0001 twice is still one email", (await post(`${(await draft()).body.id}/send`)).body.code === "DRAFT" && (await post(`${inv1.id}/send`)).body.email === "SENT" && mail.sent.length === 1);

  // ------------------------------------------------------------- R9: one rule everywhere (the stored 0.06, total 0.56)
  const inv9 = await issued(50), p9 = await pay(inv9.id, 56), pdf9 = await pdfText(`${inv9.id}/pdf`), rec9 = await pdfText(`${inv9.id}/payments/${p9.body.id}/receipt.pdf`);
  const ev9 = JSON.parse(sql(`select payload::text from module_event where type = 'invoice.issued' and subject_id = '${inv9.id}'`)), row9 = sql(`select tax_minor || ':' || amount_minor + tax_minor from money_invoice_line where invoice_id = '${inv9.id}'`);
  const R9 = (invoiceText: string, receiptText: string, payload: { taxMinor: number; totalMinor: number }) => /tax 13% = 0\.06$/m.test(invoiceText) && /^Tax: CAD 0\.06$/m.test(invoiceText) && /^Total: CAD 0\.56$/m.test(invoiceText)
    && /total CAD 0\.56, of which tax CAD 0\.06\)/.test(receiptText) && `${payload.taxMinor}:${payload.totalMinor}` === row9;
  ok("FO-7b R9 pass: for R2's line (0.50 at 13 %), the invoice PDF, the receipt PDF and the invoice.issued payload show the stored 0.06 and total 0.56",
    row9 === "6:56" && pdf9.status === 200 && pdf9.pdf && pdf9.type === "application/pdf" && rec9.pdf && R9(pdf9.text, rec9.text, ev9), [row9, pdf9, rec9.text, ev9]);
  const refloat = { ...inv9, lines: inv9.lines.map((l: { amountMinor: number; ratePpm: number }) => ({ ...l, taxMinor: halfUp(l.amountMinor, l.ratePpm) })), taxMinor: halfUp(50, 130000), totalMinor: 50 + halfUp(50, 130000) };
  const planted9 = documentText("client_money.invoice", invoiceData(refloat, { firmName: "Sample", taxNumber: null, billTo: "Client", issuedOn: today, operatingDetails: null }));
  ok("FO-7b R9 fail (planted): a document whose tax is recomputed from a float (half up) prints 0.07 and 0.57, and the case catches it; so does a payload of 7", /= 0\.07$/m.test(planted9) && !R9(planted9, rec9.text, ev9) && !R9(pdf9.text, rec9.text, { taxMinor: 7, totalMinor: 57 }), planted9);

  // ----------------------------------------------------------------------------- P: payments recorded by hand
  const invP = await issued(100000);   // 1,130.00
  const pNoKey = await pay(invP.id, 100, {}, tO), pDraft = await pay(dRace.body.id, 100), pBad = await post(`${invP.id}/payments`, { method: "CHEQUE", amountMinor: 100 }), pCard = await pay(invP.id, 100, { method: "CARD" }), pUsd = await pay(invP.id, 100, { currency: "USD" }), pZero = await pay(invP.id, 0);
  ok("FO-7b P fail: no agent/payment:record → 403; a draft → 409 DRAFT; no idempotency key, the online CARD method, USD on a CAD invoice, an amount of 0 → 422; nothing recorded",
    pNoKey.status === 403 && pDraft.body.code === "DRAFT" && [pBad, pCard, pUsd, pZero].every((x) => x.status === 422) && sql(`select count(*) from money_payment where invoice_id = '${invP.id}'`) === "0", [pNoKey.status, pDraft.body, pBad.body, pCard.body, pUsd.body]);
  const c1 = await pay(invP.id, 50000, { method: "CHEQUE", reference: "4471" }), recC = await pdfText(`${invP.id}/payments/${c1.body.id}/receipt.pdf`);
  ok("FO-7b P pass: a 500.00 cheque on 1,130.00 → 201, Part paid with 630.00 due, received into OPERATING by default, not cleared, receipt R-0002 (\"Not yet cleared\", the balance after) emailed to the bill-to, one audit line, payment.succeeded",
    c1.status === 201 && c1.body.invoice.statusWord === "Part paid" && c1.body.invoice.dueMinor === 63000 && c1.body.receivedInto === "OPERATING" && c1.body.cleared === false && c1.body.receiptNumber === "R-0002" && c1.body.extra === null && c1.body.receiptEmail === "SENT"
    && /Not yet cleared/.test(recC.text) && /Balance due on INV-\d+ after this payment: CAD 630\.00/.test(recC.text) && mail.inbox("fo7b.a@example.org").at(-1)?.attachments?.[0]?.filename === "R-0002.pdf"
    && auditN("payment.recorded", c1.body.id) === "1" && events(MONEY_EVENT.PAYMENT_SUCCEEDED, c1.body.id) === "1" && sql(`select kind || ':' || number from money_receipt where payment_id = '${c1.body.id}'`) === "PAYMENT:R-0002", [c1.body, recC.text]);
  const dbl = { method: "WIRE", amountMinor: 10000, idempotencyKey: "fo7b-double-click" }, clicks = await Promise.all([post(`${invP.id}/payments`, dbl), post(`${invP.id}/payments`, dbl)]), other = await post(`${invP.id}/payments`, { ...dbl, amountMinor: 20000 });
  ok("FO-7b P pass: a double click on Record payment (one idempotency key, twice at once) → one payment and one receipt (201 and a 200 replay)",
    clicks.map((x) => x.status).sort().join() === "200,201" && clicks[0].body.id === clicks[1].body.id && sql(`select count(*) from money_payment where idempotency_key = 'fo7b-double-click'`) === "1" && sql(`select count(*) from money_receipt where payment_id = '${clicks[0].body.id}'`) === "1", clicks.map((x) => x.body));
  ok("FO-7b P fail: the same key with another amount → 409 KEY_USED, no second payment", other.status === 409 && other.body.code === "KEY_USED" && sql(`select count(*) from money_payment where invoice_id = '${invP.id}'`) === "2", other.body);
  const dupe = await pay(invP.id, 1000, { reference: " 4471 " }), dupeOk = await pay(invP.id, 1000, { reference: "4471", duplicateReferenceAcknowledged: true });
  ok("FO-7b P fail then pass: a second payment with reference 4471 → 409 DUPLICATE_REFERENCE \"Record anyway?\", nothing recorded; with the acknowledgement → 201",
    dupe.status === 409 && dupe.body.code === "DUPLICATE_REFERENCE" && /reference 4471 is already recorded on this invoice\. Record anyway\?/.test(dupe.body.detail) && dupeOk.status === 201 && dupeOk.body.invoice.dueMinor === 52000, [dupe.body, dupeOk.body]);
  sql(`update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'seed:FO-7b-1b' where firm_id = '${A}'`);   // the "neither" case: trust on, the extra into operating
  const trustRows = () => sql(`select count(*) from money_trust_entry where firm_id = '${A}'`), t0 = trustRows();
  const over = await pay(invP.id, 60000), twice = await pay(invP.id, 2500);
  ok("FO-7b P pass (amendment 1): 600.00 on 520.00 due is never refused: Paid, 80.00 extra offering Refund · Keep as credit, invoice.paid once; with the trust answer YES no trust entry is made; a later 25.00 is all extra, \"Paid twice?\"",
    over.status === 201 && over.body.appliedMinor === 52000 && over.body.extra?.amountMinor === 8000 && over.body.extra.choices.join() === "REFUND,KEEP_AS_CREDIT" && over.body.extra.note === null && over.body.invoice.statusWord === "Paid" && over.body.invoice.extraMinor === 8000
    && twice.status === 201 && twice.body.appliedMinor === 0 && twice.body.extra?.note === "Paid twice?" && twice.body.invoice.extraMinor === 10500 && events(MONEY_EVENT.INVOICE_PAID, invP.id) === "1" && trustRows() === t0, [over.body, twice.body]);
  const toTrust = (() => { try { sql(`insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, created_by) values ('${A}', '${PA}', 'DEPOSIT', 8000, 'CAD', '${over.body.id}', 'seed:FO-7b-1b')`); return "written"; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } })();
  ok("FO-7b P fail (amendment 1, planted): a rule moving the 80.00 extra from operating into trust by itself (a trust deposit naming the operating payment) is refused by the database, and no trust entry exists", /a deposit comes from a payment received into trust/.test(toTrust) && trustRows() === t0, toTrust);
  const invR = await issued(10000, 0), race = await Promise.all([pay(invR.id, 10000), pay(invR.id, 10000)]);
  ok("FO-7b P pass: two full payments at the same moment → one settles the invoice, the other is all extra (\"Paid twice?\"); paid once", race.every((x) => x.status === 201) && race.map((x) => x.body.appliedMinor).sort().join() === "0,10000" && race.find((x) => x.body.appliedMinor === 0)?.body.extra.note === "Paid twice?" && events(MONEY_EVENT.INVOICE_PAID, invR.id) === "1", race.map((x) => x.body));

  // ------------------------------------------------------------- P: received into trust (amendment 8; AG-6-69 rule 5)
  const PT = person(A, "t"), invT = await issued(10000, 130000, {}, PT);   // 113.00
  const tTerm = await pay(invT.id, 100, { method: "CARD_TERMINAL", receivedInto: "TRUST" }), tChq = await pay(invT.id, 100, { method: "CHEQUE", receivedInto: "TRUST" }), bTrust = await (async () => { const d = await draft({ personId: PB }, tB); await line(d.body.id, fee(100, 0), tB); const i = await post(`${d.body.id}/issue`, {}, tB); return pay(i.body.invoice.id, 100, { receivedInto: "TRUST" }, tB); })();
  ok("FO-7b P fail: a card terminal payment into TRUST → 422 at receivedInto; a cheque into TRUST without the acknowledgement → 409 UNCLEARED; TRUST in a firm whose trust answer is not YES → 409 TRUST_OFF; nothing recorded",
    tTerm.status === 422 && tTerm.body.fields?.receivedInto && tChq.body.code === "UNCLEARED" && bTrust.status === 409 && bTrust.body.code === "TRUST_OFF" && sql(`select count(*) from money_payment where received_into = 'TRUST'`) === "0", [tTerm.body, tChq.body, bTrust.body]);
  const tPay = await pay(invT.id, 15000, { receivedInto: "TRUST" });
  ok("FO-7b P pass: 150.00 received into TRUST on 113.00 → a DEPOSIT of 150.00 and 113.00 applied to the invoice in the same step (Paid), 37.00 stays in trust (no Refund · Keep as credit), a PAYMENT receipt",
    tPay.status === 201 && tPay.body.invoice.statusWord === "Paid" && tPay.body.trust?.depositedMinor === 15000 && tPay.body.trust.appliedMinor === 11300 && tPay.body.trust.balanceMinor === 3700 && tPay.body.extra?.amountMinor === 3700 && tPay.body.extra.choices.length === 0
    && sql(`select string_agg(kind || ':' || amount_minor || ':' || balance_after_minor, ',' order by seq) from money_trust_entry where person_id = '${PT}'`) === "DEPOSIT:15000:15000,WITHDRAWAL_TO_INVOICE:-11300:3700" && sql(`select kind from money_receipt where payment_id = '${tPay.body.id}'`) === "PAYMENT", tPay.body);
  // Lead 91's read of #2204: a move to a case writes a − half whose own row may be below zero while the pair nets to
  // zero. The figure this part shows (the newest entry's balance) never reads that row as a shortfall.
  const PM = person(A, "m"); let who = PM; const [pa, pb, ea, eb, em, CASE] = Array.from({ length: 6 }, () => randomUUID());
  const dep = (pid: string, eid: string, minor: number, caseId: string | null) => `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${pid}', '${A}', 'E_TRANSFER', ${minor}, 'CAD', 'TRUST', now(), 'seed-${pid}', 'seed:FO-7b-1b');
    insert into money_trust_entry (id, firm_id, person_id, case_id, kind, amount_minor, currency, payment_id, created_by) values ('${eid}', '${A}', '${who}', ${caseId ? `'${caseId}'` : "null"}, 'DEPOSIT', ${minor}, 'CAD', '${pid}', 'seed:FO-7b-1b');`;
  const entry = (cols: string, vals: string) => `insert into money_trust_entry (firm_id, person_id, currency, created_by, ${cols}) values ('${A}', '${who}', 'CAD', 'seed:FO-7b-1b', ${vals});`;
  sql(`begin; ${dep(pa, ea, 10000, null)} ${dep(pb, eb, 5000, CASE)} commit;`);
  sql(entry("case_id, kind, amount_minor, reason, refund_method, refunded_on", `'${CASE}', 'REFUND_TO_CLIENT', -5000, 'Sample refund', 'E_TRANSFER', current_date`)); sql(entry("case_id, kind, amount_minor, reason, corrects_entry_id, correction_kind", `'${CASE}', 'CORRECTION', -5000, 'Recorded twice (Sample)', '${eb}', 'RECORDED_BY_MISTAKE'`));
  sql(`begin; ${entry("id, kind, amount_minor", `'${em}', 'MOVE_TO_CASE', -10000`)} ${entry("case_id, kind, amount_minor, moved_from_entry_id", `'${CASE}', 'MOVE_TO_CASE', 10000, '${em}'`)} commit;`);
  const invM = await issued(3000, 0, {}, PM), mPay = await pay(invM.id, 3000, { receivedInto: "TRUST" });
  const halfRow = Number(sql(`select balance_after_minor from money_trust_entry where id = '${em}'`)), plantedShort = (rows: number[]) => rows.some((b) => b < 0);
  ok("FO-7b ledger pass (Lead 91 on #2204): after a paired move whose − half's own row reads −50.00, a payment into trust shows the party's balance 50.00 (the newest entry), no shortfall, and money_trust_shortfall lists nobody",
    halfRow === -5000 && mPay.status === 201 && mPay.body.trust?.balanceMinor === 5000 && sql(`select count(*) from money_trust_shortfall where person_id = '${PM}'`) === "0", [halfRow, mPay.body]);
  ok("FO-7b ledger fail (planted): a check that reads any one row below zero as a shortfall flags this party, and is caught (the shown figure is not below zero)",
    plantedShort(sql(`select string_agg(balance_after_minor::text, ',') from money_trust_entry where person_id = '${PM}'`).split(",").map(Number)) && !plantedShort([mPay.body.trust.balanceMinor]));
  // Break report d6948072e F1 (Major): a client already below zero in trust (a reversal, P-634) pays into trust. The money
  // is recorded and only what the ledger then holds is applied; it was a 409 that recorded nothing.
  const PZ = person(A, "z"), [pz, ez] = [randomUUID(), randomUUID()]; who = PZ;
  sql(`begin; ${dep(pz, ez, 5000, null)} commit;`); sql(entry("kind, amount_minor, reason, refund_method, refunded_on", `'REFUND_TO_CLIENT', -5000, 'Sample refund', 'E_TRANSFER', current_date`)); sql(entry("kind, amount_minor, reason, corrects_entry_id, correction_kind", `'CORRECTION', -5000, 'Recorded twice (Sample)', '${ez}', 'RECORDED_BY_MISTAKE'`));
  const invZ = await issued(10000, 0, {}, PZ), zPay = await pay(invZ.id, 10000, { receivedInto: "TRUST" });
  const zRec = await pdfText(`${invZ.id}/payments/${zPay.body.id}/receipt.pdf`);
  ok("FO-7b P pass (break F1; R2 review M1, break R2-F2): a client at −50.00 in trust pays 100.00 into trust on a 100.00 invoice → 201: 50.00 makes up the shortfall, 50.00 is applied, 50.00 stays due, no extra; the receipt says so and never says \"kept in trust\"",
    zPay.status === 201 && zPay.body.trust?.depositedMinor === 10000 && zPay.body.trust.shortfallCoveredMinor === 5000 && zPay.body.trust.appliedMinor === 5000 && zPay.body.trust.balanceMinor === 0 && zPay.body.extra === null && zPay.body.invoice.dueMinor === 5000 && zPay.body.invoice.statusWord === "Part paid"
    && /CAD 50\.00 of this payment made up the client's trust balance, which was below zero\./.test(zRec.text) && /after this payment: CAD 50\.00/.test(zRec.text) && !/kept in trust/.test(zRec.text), [zPay.body, zRec.text]);
  // Round 3 M1 / R3-F1: a client who already holds 50.00 in trust pays 100.00 into trust on a 300.00 invoice. Only this
  // payment's 100.00 is applied; the 50.00 already held stays held (a person applies it, FO-7t), and no extra is negative.
  const PH = person(A, "h"), [ph, eh] = [randomUUID(), randomUUID()]; who = PH;
  sql(`begin; ${dep(ph, eh, 5000, null)} commit;`);
  const invH = await issued(30000, 0, {}, PH), hPay = await pay(invH.id, 10000, { receivedInto: "TRUST" }), hRec = await pdfText(`${invH.id}/payments/${hPay.body.id}/receipt.pdf`);
  ok("FO-7b P pass (round 3 M1, R3-F1): +50.00 already held, 100.00 into trust on 300.00 → 100.00 applied (this payment's own), 200.00 due, the 50.00 still held, no extra; the receipt says 200.00 due and nothing \"more than asked\"",
    hPay.status === 201 && hPay.body.trust?.appliedMinor === 10000 && hPay.body.trust.shortfallCoveredMinor === 0 && hPay.body.trust.balanceMinor === 5000 && hPay.body.extra === null && hPay.body.invoice.dueMinor === 20000
    && /after this payment: CAD 200\.00/.test(hRec.text) && !/more than this invoice asked/.test(hRec.text) && sql(`select count(*) from audit_event where action = 'payment.recorded' and entity_key = '${hPay.body.id}' and (detail->>'extraMinor')::int < 0`) === "0", [hPay.body, hRec.text]);
  const round3Rule = (due: number, heldAfterDeposit: number) => Math.max(0, Math.min(due, heldAfterDeposit));   // the planted wrong rule, fed the stored facts
  const planted3 = round3Rule(invH.dueMinor, hPay.body.trust.balanceMinor + hPay.body.trust.appliedMinor);
  ok("FO-7b P fail (round 3 M1, planted): the round-3 rule, fed this payment's stored facts, applies 150.00 (an extra of −50.00) and so differs from what was stored; the case catches it",
    planted3 === 15000 && planted3 !== hPay.body.trust.appliedMinor && 10000 - planted3 < 0, [planted3, hPay.body.trust]);
  const PY = person(A, "y"), [py, ey] = [randomUUID(), randomUUID()]; who = PY;
  sql(`begin; ${dep(py, ey, 15000, null)} commit;`); sql(entry("kind, amount_minor, reason, refund_method, refunded_on", `'REFUND_TO_CLIENT', -15000, 'Sample refund', 'E_TRANSFER', current_date`)); sql(entry("kind, amount_minor, reason, corrects_entry_id, correction_kind", `'CORRECTION', -15000, 'Recorded twice (Sample)', '${ey}', 'RECORDED_BY_MISTAKE'`));
  const invY = await issued(10000, 0, {}, PY), yPay = await pay(invY.id, 10000, { receivedInto: "TRUST" });
  ok("FO-7b P fail (break R2-F2): at −150.00, 100.00 into trust all goes to the shortfall: nothing applied, nothing \"kept\", 100.00 still due, the balance −50.00 (shown red by money_trust_shortfall), never a refusal",
    yPay.status === 201 && yPay.body.trust?.shortfallCoveredMinor === 10000 && yPay.body.trust.appliedMinor === 0 && yPay.body.trust.balanceMinor === -5000 && yPay.body.extra === null && yPay.body.invoice.dueMinor === 10000 && sql(`select count(*) from money_trust_shortfall where person_id = '${PY}'`) === "1", yPay.body);
  // Review M5 on d6948072e: credit applied to an invoice counts as paid (money_invoice_due), so a trust payment never applies
  // money the invoice does not owe; credit kept from a payment is no longer waiting extra.
  const PK = person(A, "k"), invK = await issued(10000, 0, {}, PK), kOver = await pay(invK.id, 13000); const kOverKey = `fo7b-1b-${key}`;
  sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, created_by) values ('${A}', '${PK}', 'KEPT', 3000, 'CAD', '${kOver.body.id}', 'seed:FO-7b-1b')`);
  const invK2 = await issued(10000, 0, {}, PK); sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${A}', '${PK}', 'APPLIED', -3000, 'CAD', '${invK2.id}', 'seed:FO-7b-1b')`);
  const gK = await call(tA, "GET", `${M}/${invK.id}`), gK2 = await call(tA, "GET", `${M}/${invK2.id}`), dbDue = sql(`select money_invoice_due('${A}', '${invK2.id}')`), kTrust = await pay(invK2.id, 10000, { receivedInto: "TRUST" });
  ok("FO-7b credit pass (review M5): 30.00 extra kept as credit is no longer waiting extra; 30.00 of credit applied to a 100.00 invoice leaves 70.00 due (as money_invoice_due), so 100.00 into trust applies 70.00 and leaves 30.00 in trust",
    gK.body.extraMinor === 0 && gK2.body.dueMinor === 7000 && dbDue === "7000" && kTrust.status === 201 && kTrust.body.trust?.appliedMinor === 7000 && kTrust.body.trust.balanceMinor === 3000 && kTrust.body.invoice.statusWord === "Paid", [gK.body.extraMinor, gK2.body.dueMinor, dbDue, kTrust.status, kTrust.body.trust ?? kTrust.body, kTrust.body.invoice?.statusWord]);
  const kReplay = await post(`${invK.id}/payments`, { method: "E_TRANSFER", amountMinor: 13000, idempotencyKey: kOverKey }), pTrust = await post(`${invK2.id}/payments`, { method: "E_TRANSFER", amountMinor: 100, idempotencyKey: "fo7b-after-credit" });
  ok("FO-7b credit fail (review M5, break R2-F4): with its 30.00 extra already kept as credit, the overpaying payment's replay no longer offers Refund · Keep as credit; the invoice paid by credit and trust takes any more money as extra, never as due",
    kReplay.status === 200 && kReplay.body.replayed === true && kReplay.body.extra?.amountMinor === 3000 && kReplay.body.extra.waitingMinor === 0 && kReplay.body.extra.choices.length === 0 && pTrust.status === 201 && pTrust.body.appliedMinor === 0 && pTrust.body.extra?.amountMinor === 100, [kReplay.body, pTrust.body]);
  // Break report F2 (Major): a receipt never changes after it is issued (AG-6-63 rule 8). The cheque's receipt said 630.00
  // due; since then three more payments were recorded on that invoice.
  const recLater = await pdfText(`${invP.id}/payments/${c1.body.id}/receipt.pdf`), recOver = await pdfText(`${invP.id}/payments/${over.body.id}/receipt.pdf`);
  ok("FO-7b P pass (break F2): read again after later payments, the cheque's receipt is word for word the one issued (630.00 due after it); the overpaying receipt keeps its own 80.00 extra",
    recLater.text === recC.text && /CAD 80\.00 is more than this invoice asked/.test(recOver.text) && /after this payment: CAD 0\.00/.test(recOver.text), [recLater.text, recOver.text]);
  ok("FO-7b P fail (break F2, planted): a receipt printed from today's balance would say 0.00 for the cheque, and the case catches it", invP.id === c1.body.invoiceId && (await call(tA, "GET", `${M}/${invP.id}`)).body.dueMinor === 0 && !/after this payment: CAD 0\.00/.test(recLater.text));
  // Break F3: one idempotency key sent at the same moment on two parties' invoices → one 201 and one 409 KEY_USED, never a 500.
  const PF = person(A, "f"), invF1 = await issued(1000, 0), invF2 = await issued(1000, 0, {}, PF), clash = await Promise.all([invF1, invF2].map((i) => post(`${i.id}/payments`, { method: "CASH", amountMinor: 1000, idempotencyKey: "fo7b-clash-key" })));
  ok("FO-7b P fail (break F3): one key on two parties' invoices at once → 201 and 409 KEY_USED (never 500), one payment", clash.map((x) => x.status).sort().join() === "201,409" && clash.some((x) => x.body.code === "KEY_USED") && sql(`select count(*) from money_payment where idempotency_key = 'fo7b-clash-key'`) === "1", clash.map((x) => [x.status, x.body.code]));
  // Break report F4, F6, F7 (Minors): a due date before 2000 is 422 (was 500); an invoice of 0.00 is not issued; a cancelled invoice is not sent.
  const dZero = await draft(); await line(dZero.body.id, fee(0, 0)); const zero = await post(`${dZero.body.id}/issue`), oldDue = await post(`${dZero.body.id}/issue?dueDate=0000-01-01`);
  ok("FO-7b I fail (break F4, F7): a due date of 0000-01-01 → 422 at dueDate, never 500; an invoice whose total is 0.00 → 409 NOTHING_TO_BILL; it stays a draft", oldDue.status === 422 && zero.status === 409 && zero.body.code === "NOTHING_TO_BILL" && sql(`select issued_at is null from money_invoice where id = '${dZero.body.id}'`) === "t", [oldDue.body, zero.body]);

  // ------------------------------------------------------------------------------------ C: credit notes (AG-6-48)
  const invC = await issued(250000);   // 2,825.00
  const cNoKey = await post(`${invC.id}/credit-notes`, { amountMinor: 100, reason: "Goodwill" }, tO), cNoWhy = await post(`${invC.id}/credit-notes`, { amountMinor: 100 }), cBoth = await post(`${invC.id}/credit-notes`, { full: true, amountMinor: 100, reason: "x" }), cOver = await post(`${invC.id}/credit-notes`, { amountMinor: 282501, reason: "Too much" }), cDraft = await post(`${dRace.body.id}/credit-notes`, { full: true, reason: "x" });
  ok("FO-7b C fail: no agent/invoice:void → 403; no reason, or both full and an amount → 422; above the remaining total → 409 OVER_CREDIT with what is left; on a draft → 409; no credit note written",
    cNoKey.status === 403 && cNoWhy.status === 422 && cBoth.status === 422 && cOver.status === 409 && cOver.body.code === "OVER_CREDIT" && cOver.body.leftMinor === 282500 && /Only CAD 2,825\.00 is left/.test(cOver.body.detail) && cDraft.body.code === "DRAFT" && sql(`select count(*) from money_credit_note`) === "0", [cNoWhy.body, cOver.body, cDraft.body]);
  const cn1 = await post(`${invC.id}/credit-notes`, { amountMinor: 28250, reason: "Goodwill" }), cnPdf = await pdfText(`${invC.id}/credit-notes/${cn1.body.id}/pdf`);
  ok("FO-7b C pass (AG-6-48's example): 282.50 \"Goodwill\" on 2,825.00 → CN-0001, the balance falls to 2,542.50, still Open, one audit line, its PDF names the reason; the invoice's lines are untouched",
    cn1.status === 201 && cn1.body.number === "CN-0001" && cn1.body.invoice.dueMinor === 254250 && cn1.body.invoice.creditedMinor === 28250 && cn1.body.invoice.statusWord === "Open" && auditN("invoice.credit_note_issued", cn1.body.id) === "1" && /CREDIT NOTE CN-0001/.test(cnPdf.text) && /Reason: Goodwill/.test(cnPdf.text) && stored(invC.id) === "1:FEE:250000:130000:32500:CAD", [cn1.body, cnPdf.text]);
  const cn2 = await post(`${invC.id}/credit-notes`, { full: true, reason: "Wrong amount" }), cn3 = await post(`${invC.id}/credit-notes`, { full: true, reason: "Again" }), payCancelled = await pay(invC.id, 100);
  ok("FO-7b C pass: a full credit note cancels what is left (CN-0002, 2,542.50): Credited, the number kept, invoice.voided written", cn2.status === 201 && cn2.body.number === "CN-0002" && cn2.body.amountMinor === 254250 && cn2.body.invoice.statusWord === "Credited" && cn2.body.invoice.number === invC.number && events(MONEY_EVENT.INVOICE_VOIDED, invC.id) === "1", cn2.body);
  ok("FO-7b C fail: a credit note on the cancelled invoice → 409 NOTHING_LEFT; a payment on it → 409 CANCELLED; nothing written", cn3.body.code === "NOTHING_LEFT" && payCancelled.body.code === "CANCELLED" && sql(`select count(*) from money_credit_note where invoice_id = '${invC.id}'`) === "2" && sql(`select count(*) from money_payment where invoice_id = '${invC.id}'`) === "0", [cn3.body, payCancelled.body]);
  const mailsBefore = mail.sent.length, sentCancelled = await post(`${invC.id}/send`);
  ok("FO-7b E fail (break F6): a cancelled invoice is not sent (409 CANCELLED, no email)", sentCancelled.status === 409 && sentCancelled.body.code === "CANCELLED" && mail.sent.length === mailsBefore, sentCancelled.body);
  const cTrust = await post(`${invT.id}/credit-notes`, { full: true, reason: "Cancel" });
  ok("FO-7b C fail: crediting an invoice paid from trust → 409 TRUST_PAID in words (return the money to trust first), never the database's 500", cTrust.status === 409 && cTrust.body.code === "TRUST_PAID" && /CAD 113\.00 of INV-\d+ was paid from trust/.test(cTrust.body.detail), cTrust.body);
  const invW = await issued(5000, 0); await pay(invW.id, 4900); sql(`insert into money_write_off (firm_id, invoice_id, amount_minor, currency, reason, created_by) values ('${A}', '${invW.id}', 100, 'CAD', 'Small balance (Sample)', 'seed:FO-7b-1b')`);
  const gW = await call(tA, "GET", `${M}/${invW.id}`), cW = await post(`${invW.id}/credit-notes`, { amountMinor: 100, reason: "Late" });
  ok("FO-7b S pass: a seeded write-off row → Written off (nothing due); FO-7b C fail: a credit note on it → 409 \"Already settled by write-off\"", gW.body.statusWord === "Written off" && gW.body.writtenOffMinor === 100 && gW.body.dueMinor === 0 && cW.status === 409 && /Already settled by write-off/.test(cW.body.detail), [gW.body, cW.body]);

  // R2 review M2, break R2-F1: a writer that began before the payment but saved after it (here a credit note in a
  // transaction opened first, which waits for the invoice's lock) never changes the receipt: its figures were stored
  // under the lock with the payment. Also the letterhead (R2-F3): a later change of the firm's name is not printed.
  const invX = await issued(100000, 0), early = owner.$transaction(async (t) => { await t.$queryRaw`select now()`; await new Promise((r) => setTimeout(r, 300));
    await t.$executeRawUnsafe(`insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, reason, created_by) values ('${A}', '${invX.id}', 10000, 'CAD', 'Opened first (Sample)', 'seed:FO-7b-1b')`); });
  const xPay = await pay(invX.id, 30000), xKey = key; await early;
  const xRec1 = mail.inbox("fo7b.a@example.org").find((m) => m.subject.startsWith(`Receipt ${xPay.body.receiptNumber} `))?.text ?? "";
  const firmName = sql(`select operating_name from platform_firm where id = '${A}'`);
  sql(`update platform_firm set operating_name = 'Renamed Firm (Sample)' where id = '${A}'`);
  const xRec2 = await pdfText(`${invX.id}/payments/${xPay.body.id}/receipt.pdf`), xReplay = await post(`${invX.id}/payments`, { method: "E_TRANSFER", amountMinor: 30000, idempotencyKey: `fo7b-1b-${key}` });
  ok("FO-7b P pass (R2 M2, R2-F1, R2-F3): a credit note opened before a 300.00 payment and saved after it: the emailed receipt and the re-downloaded one both say 700.00 due after the payment (true when it was recorded), the firm's later new name is not printed, the replay answers the same applied 300.00",
    /after this payment: CAD 700\.00/.test(xRec1) && /after this payment: CAD 700\.00/.test(xRec2.text) && !/Renamed Firm/.test(xRec2.text) && xReplay.body.appliedMinor === 30000 && xReplay.body.extra === null && sql(`select count(*) from money_credit_note where invoice_id = '${invX.id}'`) === "1", [xRec1, xRec2.text, xReplay.body]);
  ok("FO-7b P fail (R2 M2, planted): a receipt read from the rows by their times would now say 600.00 for that payment (the credit note's time is before the receipt's), and the case catches it",
    sql(`select (select created_at from money_credit_note where invoice_id = '${invX.id}') < (select issued_at from money_receipt where payment_id = '${xPay.body.id}')`) === "t" && (await call(tA, "GET", `${M}/${invX.id}`)).body.dueMinor === 60000 && !/CAD 600\.00/.test(xRec2.text));
  // R3-F2: a second, backdated audit line naming the payment (written by SQL, damaged figures) never changes its receipt or replay.
  sql(`insert into audit_event (id, workspace_id, at, detail, actor_type, firm_id, actor, action, entity, entity_key, summary) select gen_random_uuid(), workspace_id, at - interval '1 day', detail || '{"appliedMinor": 0, "dueAfterMinor": "x"}'::jsonb, actor_type, firm_id, actor, action, entity, entity_key, summary from audit_event where action = 'payment.recorded' and entity_key = '${xPay.body.id}'`);
  const xRec3 = await pdfText(`${invX.id}/payments/${xPay.body.id}/receipt.pdf`), xReplay2 = await post(`${invX.id}/payments`, { method: "E_TRANSFER", amountMinor: 30000, idempotencyKey: `fo7b-1b-${xKey}` });
  ok("FO-7b P fail (R3-F2): a forged, backdated second audit line for the payment never changes what is printed: the receipt and the replay answer 404 (never other figures, never a 500)",
    xRec3.status === 404 && xReplay2.status === 404 && sql(`select count(*) from audit_event where action = 'payment.recorded' and entity_key = '${xPay.body.id}'`) === "2", [xRec3.text, xReplay2.status, xReplay2.body]);
  // Round 4 (review M, R4-F1): a cheque's "Cleared" tick (the one change a payment row allows) keeps its receipt and replay.
  const chq = await pay(invX.id, 1000, { method: "CHEQUE" }), chqKey = key, chqRec = await pdfText(`${invX.id}/payments/${chq.body.id}/receipt.pdf`);
  sql(`update money_payment set cleared = true, cleared_at = now(), cleared_by = 'staff:${staffA}' where id = '${chq.body.id}'`);
  const chqRec2 = await pdfText(`${invX.id}/payments/${chq.body.id}/receipt.pdf`), chqReplay = await post(`${invX.id}/payments`, { method: "CHEQUE", amountMinor: 1000, idempotencyKey: `fo7b-1b-${chqKey}` });
  ok("FO-7b P pass (round 4, R4-F1): after the cheque is ticked Cleared, its receipt still answers 200, word for word the one issued (\"Not yet cleared\" was true then: a receipt never changes, AG-6-63 rule 8) and its replay answers 200",
    chq.status === 201 && chqRec.status === 200 && chqRec2.status === 200 && chqRec2.text === chqRec.text && /Not yet cleared/.test(chqRec2.text) && chqReplay.status === 200 && chqReplay.body.appliedMinor === chq.body.appliedMinor, [chqRec2.status, chqReplay.status, chqRec.text, chqRec2.text]);
  // R4-F2: a forged line with the payment's own time and receipt number (two lines now match), or a figure left out, is 404: never other figures, never a 500.
  sql(`insert into audit_event (id, workspace_id, at, detail, actor_type, firm_id, actor, action, entity, entity_key, summary) select gen_random_uuid(), workspace_id, at, detail - 'dueAfterMinor', actor_type, firm_id, actor, action, entity, entity_key, summary from audit_event where action = 'payment.recorded' and entity_key = '${chq.body.id}'`);
  const chqRec3 = await pdfText(`${invX.id}/payments/${chq.body.id}/receipt.pdf`), chqReplay3 = await post(`${invX.id}/payments`, { method: "CHEQUE", amountMinor: 1000, idempotencyKey: `fo7b-1b-${chqKey}` });
  ok("FO-7b P fail (R4-F2): a forged second line with the payment's own time and receipt number, missing a figure → the receipt and the replay answer 404 (not other figures, not 500)", chqRec3.status === 404 && chqReplay3.status === 404, [chqRec3.status, chqReplay3.status, chqReplay3.body]);
  sql(`update platform_firm set operating_name = '${firmName.replace(/'/g, "''")}' where id = '${A}'`);

  // ------------------------------------------------------------------------- S: the status words, derived (a table)
  const F: InvoiceFacts = { issued: true, totalMinor: 1000, creditedMinor: 0, writtenOffMinor: 0, hasWriteOff: false, paidMinor: 0, refundedMinor: 0, dueDate: "2026-12-01", today: "2026-12-01" };
  const table: [string, Partial<InvoiceFacts>][] = [["Draft", { issued: false, paidMinor: 5 }], ["Open", {}], ["Part paid", { paidMinor: 400 }], ["Paid", { paidMinor: 1000 }], ["Paid", { paidMinor: 700, creditedMinor: 300 }], ["Paid", { paidMinor: 1200 }],
    ["Overdue", { today: "2026-12-02" }], ["Overdue", { today: "2026-12-02", paidMinor: 400 }], ["Paid", { today: "2026-12-02", paidMinor: 1000 }], ["Credited", { creditedMinor: 1000, today: "2026-12-02" }], ["Refunded", { refundedMinor: 1000 }],
    ["Part paid", { refundedMinor: 300, paidMinor: 200 }], ["Written off", { hasWriteOff: true, writtenOffMinor: 50, paidMinor: 950 }], ["Open", { totalMinor: 0, creditedMinor: 0, paidMinor: -1 }]];
  const wrong = table.filter(([want, f]) => invoiceStatus({ ...F, ...f }) !== want);
  ok("FO-7b S pass: status follows payments, credits, refunds, the write-off and the due date (14 rows of facts → Draft, Open, Part paid, Paid, Overdue, Credited, Refunded, Written off)", wrong.length === 0, wrong);
  ok("FO-7b S fail (stand-in): on the due date itself an unpaid invoice is Open, not Overdue; a part credit alone is never Credited", invoiceStatus(F) !== "Overdue" && invoiceStatus({ ...F, creditedMinor: 999 }) !== "Credited");
  const moved = new FakeClock(`${plus(today, 14)}T23:00:00Z`), reader = new InvoiceDrafts(nest.get(Db), auditEvent, undefined, moved, async () => "ALL" as const), at = async () => (await withFirm(A, () => reader.read(ctxA, both2[0].body.invoice.id))).statusWord;
  const onDue = await withFirm(A, () => reader.read(ctxA, inv1.id)); await moved.advance({ hours: 2 }); const dayAfter = await withFirm(A, () => reader.read(ctxA, inv1.id));
  ok("FO-7b S pass (the clock moved): INV-0001, due in 14 days, is Open on its due date and Overdue the day after; FO-7b S fail (stand-in): the invoice due in 30 days is still Open that day",
    onDue.statusWord === "Open" && dayAfter.statusWord === "Overdue" && (await at()) === "Open", [onDue.statusWord, dayAfter.statusWord]);

  // ------------------------------------------------------------- H: ClientMoneyPort.hasMoney (adapter and fake, one contract)
  const PN = person(A, "n"), real = new ClientMoney(nest.get(Db)), walled: ClientMoneyPort = { hasMoney: (f, p) => withFirm(f, () => real.hasMoney(f, p)) };
  const harness = (port: ClientMoneyPort) => () => ({ port, firmId: A, withMoney: PM, without: PN, otherFirmId: B });
  await runContract(clientMoneyPortContract, "ClientMoney", harness(walled), ok);
  await runContract(clientMoneyPortContract, "fakeClientMoney", harness(fakeClientMoney([{ firmId: A, personId: PM }])), ok);
  const brokenH = await runContract(clientMoneyPortContract, "brokenHasMoney", harness({ hasMoney: async () => true }), null);
  ok("FO-7b H fail (planted): an adapter answering true for every party fails the contract", brokenH.failed.length > 0, brokenH);
  ok("FO-7b H pass: hasMoney is true for a party with only an invoice (draft or issued), as well as for one with trust entries", await walled.hasMoney(A, { personId: PA }) === true);

  // Review M1 on d6948072e: MoneyDocuments is a DocumentRenderPort adapter, so it runs that port's shared contract (PF-0c).
  const cn = { firmName: "Sample Firm", firmAddress: "", taxLine: "", billTo: "Client A", number: "CN-0001", issuedOn: today, invoiceNumber: "INV-0001", currency: "CAD", total: "1.13", amount: "0.13", reason: "Goodwill" };
  const pdfReader = (bytes: Uint8Array) => [...Buffer.from(bytes).toString("latin1").matchAll(/^\((.*)\) Tj T\*$/gm)].map((m) => m[1]).join("\n");
  await runContract(documentRenderPortContract, "MoneyDocuments", () => ({ render: new MoneyDocuments(), template: "client_money.credit_note", data: cn, reordered: Object.fromEntries(Object.entries(cn).reverse()), other: { ...cn, amount: "0.14" }, text: pdfReader }), ok);

  // ------------------------------------------------------------------------------------- walls, inputs, audit
  const wall = await Promise.all([post(`${invP.id}/payments`, { method: "CASH", amountMinor: 100, idempotencyKey: "fo7b-wall-1" }, tB), post(`${invP.id}/credit-notes`, { full: true, reason: "x" }, tB), post(`${invP.id}/send`, {}, tB), call(tB, "GET", `${M}/${invP.id}/pdf`), call(tA, "GET", `${M}/${invP.id}/payments/${tPay.body.id}/receipt.pdf`), post("not-a-uuid/issue")]);
  ok("FO-7b walls pass: firm B gets 404 on firm A's invoice (pay, credit, send, PDF); a receipt asked under another invoice, and a malformed id, are 404; nothing written", wall.every((x) => x.status === 404) && sql(`select count(*) from money_payment where idempotency_key = 'fo7b-wall-1'`) === "0", wall.map((x) => x.status));
  ok("FO-7b audit pass: one line per change: every issued invoice, every payment and every credit note; each receipt has its own number (no gap); every money event is one of the named five",
    sql(`select count(*) from audit_event where action = 'invoice.issued'`) === sql(`select count(*) from money_invoice where issued_at is not null`) && sql(`select count(*) from audit_event where action = 'payment.recorded' and coalesce(detail->>'dueAfterMinor', '') ~ '^[0-9]+$'`) === sql(`select count(*) from money_payment where recorded_by like 'staff:%'`)
    && sql(`select count(*) from audit_event where action = 'invoice.credit_note_issued'`) === sql(`select count(*) from money_credit_note where created_by like 'staff:%'`) && sql(`select count(*) = max(substr(number, 3)::int) from money_receipt where firm_id = '${A}'`) === "t"
    && sql(`select count(*) from module_event where type like 'invoice.%' or type like 'payment.%'`) === sql(`select count(*) from module_event where type in ('${Object.values(MONEY_EVENT).join("','")}')`));
} catch (e) {
  ok("FO-7b: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
