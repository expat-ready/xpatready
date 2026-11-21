// FO-7b part 1a (QA-482: tax rounded per line by one stated rule; R1.59; brief build-lead-c-briefs/FO-7b-1a.md, with
// FO-7b.md's named cases and the rulings of 18 Nov): draft invoice lines through the route, each read back from
// money_invoice_line. R1-R8 and R10 (FO-7b.md; R2's and R7's planted fails: half up with Math.round, tax on the
// subtotal), R11 (another currency: 422, not 500, nothing written), R12 (rate in parts per million, taken as sent; out of
// range 422), R13 (a client-sent tax is ignored), R14 ("Prices include tax" on: refused in words); also the firm walls,
// one audit line per write, and two lines added at once. R9 (PDF, receipt, payload) is FO-7b part 1b's. The rates are
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
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";

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
const { InvoiceDraftsController } = await import("../api/src/client-money/invoices/routes.ts");
const feature = (await import("../api/src/features/client-money-invoices.ts")).default;
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7b-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...feature.providers];
  @Module({ controllers: [PlatformIdentityController, InvoiceDraftsController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers the invoice controller and its service", feature.controllers.length === 1 && feature.controllers[0] === InvoiceDraftsController && (feature.providers[0] as { provide: unknown }).provide === InvoiceDrafts);
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7b.${n}@example.org', 'seed:FO-7b-1a', now()) returning id`);
  const PA = person(A, "a"), PB = person(B, "b");
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo"), tO = await signIn("user-O", "sample-firm");
  const staffA = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);

  const noSettings = await call(tA, "POST", "/front-office/money/invoices", { personId: PA });
  ok("FO-7b setup fail: before the firm's payment settings exist, a draft is refused in words (409 PAYMENTS_NOT_SET_UP), nothing written",
    noSettings.status === 409 && noSettings.body?.code === "PAYMENTS_NOT_SET_UP" && sql(`select count(*) from money_invoice`) === "0", noSettings.body);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7b-1a', now())`);

  const draft = async (body: Record<string, unknown> = { personId: PA, currency: "CAD" }, t = tA) => call(t, "POST", "/front-office/money/invoices", body);
  const line = (id: string, body: Record<string, unknown>, t = tA) => call(t, "POST", `/front-office/money/invoices/${id}/lines`, body);
  const stored = (id: string) => sql(`select string_agg(position || ':' || kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor || ':' || currency, ',' order by position) from money_invoice_line where invoice_id = '${id}'`);
  const fee = (unitMinor: number, ratePpm: number, extra: Record<string, unknown> = {}) => ({ kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm, ...extra });
  /** One FEE line on a fresh CAD draft: the stored tax read back from money_invoice_line. */
  const taxOf = async (unitMinor: number, ratePpm: number) => { const d = await draft(); const r = await line(d.body.id, fee(unitMinor, ratePpm)); return { r, tax: Number(sql(`select tax_minor from money_invoice_line where invoice_id = '${d.body.id}'`)) }; };

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
  const planted = new InvoiceDrafts(nest.get(Db), auditEvent, halfUp), ctxA = { staffId: staffA, firmId: A, firmKey: "sample-firm", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" } as never;
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
  const d8 = await draft(); const r8 = await line(d8.body.id, fee(2147483647, 150000));
  ok("FO-7b R8 pass: unit 21,474,836.47 at 15 % → 3,221,225.47 exactly (exact 322,122,547.05 cents, down); the total past 2^31 is exact (24,696,061.94)",
    r8.status === 201 && stored(d8.body.id) === "1:FEE:2147483647:150000:322122547:CAD" && r8.body.totalMinor === 2469606194 && sql(`select money_invoice_total('${A}', '${d8.body.id}')`) === "2469606194", r8.body);
  const big = await line(d8.body.id, fee(2147483647, 0, { quantity: 2 }));
  ok("FO-7b R8 fail: a line whose quantity × unit passes 21,474,836.47 → 422 at unitMinor, in words, nothing written", big.status === 422 && big.body.errors?.[0]?.field === "unitMinor" && stored(d8.body.id).split(",").length === 1, big.body);

  // ------------------------------------------------------------------------------------- R10: a government fee
  const d10 = await draft(); await line(d10.body.id, { kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 25500, ratePpm: 130000 });
  const r10 = await line(d10.body.id, fee(100000, 130000));
  ok("FO-7b R10 pass: a 255.00 GOVERNMENT_FEE line (13 % sent) beside 1,000.00 FEE at 13 % → tax only on the fee (130.00); the fee line's rate and tax are 0",
    stored(d10.body.id) === "1:GOVERNMENT_FEE:25500:0:0:CAD,2:FEE:100000:130000:13000:CAD" && r10.body.taxMinor === 13000 && r10.body.totalMinor === 138500, r10.body);

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
  ok("FO-7b R12 pass: ratePpm 1300 (13 % typed in basis points) is stored as 1300 ppm, not corrected: 1,000.00 → tax 1.30", r12.status === 201 && stored(d12.body.id) === "1:FEE:100000:1300:130:CAD", r12.body);
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
} catch (e) {
  ok("FO-7b: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
