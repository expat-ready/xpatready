// FO-7g part 1 (R1.56; brief design/briefs/track-b/FO-7g-1.md over build-lead-c-briefs/FO-7g.md and briefs/FO-7g.md):
// the cited GST/HST table and the tax-default route. DW1-DW7, DW10, DW11 and the pure DW12, each with a pass and a
// fail, plus the check over the table that fails on a value with no source (URL, quote, read date). The draft-step
// calls in invoices/ are FO-7g part 1w's (Lead B (Track B) ruling of 22 Nov), so DW3 and DW6 prove the rule
// (lineRatePpm) and what the route refuses, and DW3 and DW5 use FO-7b's existing line route, read only, with the rate the
// tax-default route answered. Expected rates are read from the table, never typed here, except DW10, whose job is to
// hold the brief's table against the file. Tax readings are Unconfirmed: no accountant.
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and the two money features, with the
// local sign-in stand-in; the API connects as xr_app. No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7g_tax_defaults.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";
import { assertCited, CRA_RATES_URL, PROVINCE_CODES, PROVINCE_TAX_RATES, tableProblems, type ProvinceTaxTable } from "../api/src/client-money/tax/canada-gst-hst.ts";
import { lineRatePpm, NO_PROVINCE_WARNING, provinceCode, taxDefault, TaxRuleRefused } from "../api/src/client-money/tax/defaults.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7g_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const run = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = run;
const refused = (q: string, why: RegExp) => { try { run(q); return false; } catch (e) { return why.test(String((e as { stderr?: string }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throws = (f: () => unknown, kind: new (...a: never[]) => Error = Error) => { try { f(); return false; } catch (e) { return e instanceof kind; } };

// ------------------------------------------------------------------------------------ the table alone (no database)
const T = PROVINCE_TAX_RATES;
type Entry = ProvinceTaxTable["ON"];
/** A copy of the table with one entry replaced (the planted tables the cases must catch). */
const planted = (code: string, entry: unknown) => ({ ...T, [code]: entry }) as unknown as ProvinceTaxTable;
const without = (e: Entry, ...keys: string[]) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k)));
const withSource = (e: Entry, source: unknown) => ({ ...e, source });

ok("FO-7g source pass: every value of the table has its source (a URL on www.canada.ca, a quote, a read date) and equals its quote's rate", tableProblems(T).length === 0, tableProblems(T));
const noSource = [
  ["no source at all", planted("ON", without(T.ON, "source")), /ON: no source/],
  ["no URL", planted("ON", withSource(T.ON, { quote: T.ON.source.quote, readOn: T.ON.source.readOn })), /ON: the source has no URL/],
  ["no quote", planted("ON", withSource(T.ON, { url: T.ON.source.url, readOn: T.ON.source.readOn })), /ON: the source has no quote/],
  ["a blank quote", planted("ON", withSource(T.ON, { ...T.ON.source, quote: "  " })), /ON: the source has no quote/],
  ["no read date", planted("ON", withSource(T.ON, { url: T.ON.source.url, quote: T.ON.source.quote })), /ON: the source has no read date/],
  ["a date that is not one (2026-02-30)", planted("ON", withSource(T.ON, { ...T.ON.source, readOn: "2026-02-30" })), /ON: the source has no read date/],
  ["a URL that only looks like canada.ca", planted("ON", withSource(T.ON, { ...T.ON.source, url: "https://www.canada.ca.example.org/rates" })), /ON: the source has no URL/],
  ["a URL over http", planted("ON", withSource(T.ON, { ...T.ON.source, url: CRA_RATES_URL.replace("https:", "http:") })), /ON: the source has no URL/],
  ["a quote of another province's row", planted("ON", withSource(T.ON, { ...T.ON.source, quote: T.NB.source.quote })), /ON: the quote is not this province's row/],
] as const;
for (const [what, table, why] of noSource) ok(`FO-7g source fail (planted): ${what} → the check names it`, tableProblems(table).some((p) => why.test(p)), tableProblems(table));

const DW1 = (t: ProvinceTaxTable) => Object.keys(t).length === 13 && PROVINCE_CODES.every((c) => Object.hasOwn(t, c)) && tableProblems(t).length === 0
  && Object.values(t).every((e) => Number.isSafeInteger(e.ratePpm) && e.ratePpm >= 0 && e.ratePpm <= 1_000_000 && e.source.url === CRA_RATES_URL && /^\d{4}-\d{2}-\d{2}$/.test(e.source.readOn) && e.source.quote.length > 0);
ok("FO-7g DW1 pass (cited table): 13 entries, each with the CRA page's URL, its row quoted and a read date; every rate a whole number of parts per million", DW1(T));
ok("FO-7g DW1 fail (planted): an entry with no source, a 14th code, a missing province, and 13 % typed in basis points (1300) are each caught",
  !DW1(planted("NS", without(T.NS, "source"))) && !DW1(planted("XX", T.ON)) && !DW1(Object.fromEntries(Object.entries(T).filter(([c]) => c !== "YT")) as unknown as ProvinceTaxTable)
  && !DW1(planted("ON", { ...T.ON, ratePpm: 1300 })) && tableProblems(planted("ON", { ...T.ON, ratePpm: 1300 })).some((p) => /ON: the rate \(1300 ppm\) is not the quoted/.test(p))
  && !DW1(planted("ON", { ...T.ON, ratePpm: 13.5 })) && !DW1(planted("ON", { ...T.ON, ratePpm: 1_000_001 })));
ok("FO-7g load fail (review minor 1): the guard the module runs at load (assertCited) throws on an uncited table and on a mismatched rate, and returns the cited table unchanged",
  throws(() => assertCited(planted("ON", without(T.ON, "source")))) && throws(() => assertCited(planted("NS", { ...T.NS, ratePpm: 150000 }))) && assertCited(T) === T);
ok("FO-7g load fail (round 2, minor A): the module calls assertCited on its own table at load, as a top-level statement",
  /\nassertCited\(PROVINCE_TAX_RATES\);\s*$/.test(readFileSync(join(import.meta.dirname, "..", "api", "src", "client-money", "tax", "canada-gst-hst.ts"), "utf8")));
ok("FO-7g source fail (planted, round 2 minor C): a read date after today, or before the page's \"Date modified\" (2025-04-01), is refused",
  [["2099-01-01"], ["1900-01-01"], ["2025-03-31"]].every(([d]) => tableProblems(planted("ON", withSource(T.ON, { ...T.ON.source, readOn: d }))).some((p) => /ON: the read date is not between/.test(p))));
ok("FO-7g DW1: the loaded table is frozen (an entry, its source and the table refuse a change)", Object.isFrozen(T) && Object.values(T).every((e) => Object.isFrozen(e) && Object.isFrozen(e.source))
  && throws(() => { (T.ON as { ratePpm: number }).ratePpm = 1; }, TypeError));

// DW10: the table of the brief (build-lead-c-briefs/FO-7g.md, "The cited table"), held against the file.
const BRIEF: Record<string, ["GST" | "HST", number]> = { AB: ["GST", 50000], BC: ["GST", 50000], MB: ["GST", 50000], NB: ["HST", 150000], NL: ["HST", 150000], NT: ["GST", 50000], NS: ["HST", 140000],
  NU: ["GST", 50000], ON: ["HST", 130000], PE: ["HST", 150000], QC: ["GST", 50000], SK: ["GST", 50000], YT: ["GST", 50000] };
const DW10 = (t: ProvinceTaxTable) => Object.keys(BRIEF).length === 13 && Object.keys(t).sort().join() === Object.keys(BRIEF).sort().join()
  && Object.entries(BRIEF).every(([c, [name, ppm]]) => t[c as "ON"].taxName === name && t[c as "ON"].ratePpm === ppm)
  && Object.entries(t).filter(([, e]) => e.taxName === "HST").map(([c]) => c).sort().join() === "NB,NL,NS,ON,PE";
ok("FO-7g DW10 pass (the table matches the brief): each of the 13 rates equals the brief's table; the HST codes are exactly NB, NL, NS, ON, PE; Nova Scotia's start date is 2025-04-01 with the page's sentence",
  DW10(T) && T.NS.effectiveFrom === "2025-04-01" && /April 1, 2025/.test(T.NS.effectiveQuote ?? ""));
const ns15 = planted("NS", { ...T.NS, ratePpm: 150000 });
ok("FO-7g DW10 fail (planted): a Nova Scotia entry at 150000 (the rate before 1 April 2025) is caught, by the case and by the table's own check (its quote says 14 %)",
  !DW10(ns15) && tableProblems(ns15).some((p) => /NS: the rate \(150000 ppm\) is not the quoted "GST and HST" rate \(140000 ppm\)/.test(p)), tableProblems(ns15));
ok("FO-7g DW10 fail (planted): a start date without the page's sentence is caught", tableProblems(planted("NS", without(T.NS, "effectiveQuote"))).some((p) => /NS: a start date needs/.test(p)));

// DW11: no provincial tax anywhere.
const provincial = (v: unknown) => /pst|rst|qst/i.test(JSON.stringify(v, (k, x) => (k === "quote" || k === "effectiveQuote" ? undefined : x)).replace(/"taxName":"[GH]ST"/g, ""));
const DW11 = (t: ProvinceTaxTable) => (["BC", "MB", "SK"] as const).every((c) => { const d = taxDefault({ firmProvince: c, registered: true }, t); return d.taxName === "GST" && d.ratePpm === T.AB.ratePpm && !provincial(d); })
  && !provincial(t) && tableProblems(t).length === 0;
ok("FO-7g DW11 pass (no provincial tax): a firm in BC, MB or SK gets the GST entry only (the same rate as Alberta's), and no entry or answer carries a PST, RST or QST rate", DW11(T) && T.QC.taxName === "GST" && T.QC.ratePpm === T.AB.ratePpm);
const bc12 = planted("BC", { ...T.BC, ratePpm: 120000 }), bcPst = planted("BC", { ...T.BC, pstPpm: 70000 });
ok("FO-7g DW11 fail (planted): a BC entry at 120000 (GST + PST) is caught; so is an entry given a PST field", !DW11(bc12) && tableProblems(bc12).some((p) => /BC: the rate \(120000 ppm\)/.test(p))
  && !DW11(bcPst) && tableProblems(bcPst).some((p) => /BC: the field "pstPpm" is not part of an entry/.test(p)), [tableProblems(bc12), tableProblems(bcPst)]);

// Break report on 84a3e1ab (m2, m3): what the load-time check itself refuses, beyond the cases above.
const onAsAlberta = planted("ON", { ...T.AB }), onBp = planted("ON", { ...T.ON, ratePpm: 1300, source: { ...T.ON.source, quote: "Ontario | 0.13% | N/A" } });
const nsLater = planted("NS", { ...T.NS, effectiveFrom: "2999-01-01" });
ok("FO-7g source fail (planted, break m2): Alberta's whole entry under ON, and 13 % in basis points with its quote edited to \"0.13%\", are refused by the table's own check (not only by DW10)",
  tableProblems(onAsAlberta).some((p) => /ON: the province is not Ontario/.test(p)) && tableProblems(onBp).some((p) => /ON: the rate \(1300 ppm\) is below the 5 % GST/.test(p)), [tableProblems(onAsAlberta), tableProblems(onBp)]);
ok("FO-7g source fail (planted, break m3): a start date after today is refused (a rate that has not begun is never charged); today's table passes as of its own start date",
  tableProblems(nsLater).some((p) => /NS: the start date is after today/.test(p)) && !tableProblems(T, "2025-04-01").some((p) => /start date/.test(p)) && tableProblems(T).length === 0 && tableProblems(T, "2025-03-31").some((p) => /NS: the start date is after today/.test(p)));

// DW2 (pure): the firm's province.
const DW2 = (t: ProvinceTaxTable) => PROVINCE_CODES.every((c) => { const d = taxDefault({ firmProvince: c, registered: true }, t); return d.source === "FIRM_PROVINCE" && d.taxName === T[c].taxName && d.ratePpm === T[c].ratePpm && d.registered && !d.outsideCanada && d.warning === null; });
ok("FO-7g DW2 pass (firm province, the rule alone): each of the 13 codes gets its own entry of the table (HST where the table says HST, GST elsewhere), source FIRM_PROVINCE; \" on \" and \"on\" read as ON",
  DW2(T) && taxDefault({ firmProvince: " on ", registered: true }).ratePpm === T.ON.ratePpm && provinceCode("nS") === "NS");
ok("FO-7g DW2 fail (planted): a table whose Ontario entry was swapped for Alberta's is caught", !DW2(planted("ON", T.AB)));
const unknown: unknown[] = [undefined, null, "", "  ", "Ontario", "O N", "ZZ", "ONT", "O", "__proto__", "constructor", "toString", "ſk", "nſ", "ＯＮ", 13, {}, ["ON"]];
ok("FO-7g DW2 fail (unknown province): no province, a name spelled out, a typo, a look-alike letter or an object key → 0, no tax name, source NONE and the warning in the ruling's words, never a guess",
  unknown.every((p) => { const d = taxDefault({ firmProvince: p as string, registered: true }); return d.ratePpm === 0 && d.taxName === null && d.source === "NONE" && d.registered && d.warning === NO_PROVINCE_WARNING; })
  && NO_PROVINCE_WARNING === "Your firm's province isn't set — tax is not added", unknown.map((p) => taxDefault({ firmProvince: p as string, registered: true })));

// DW4 (pure): registered is its own fact.
ok("FO-7g DW4 pass (the rule alone): not registered → 0 and no tax name for every province, with no province warning; registered → taxed (a tax number is not an input of the rule)",
  PROVINCE_CODES.every((c) => { const d = taxDefault({ firmProvince: c, registered: false }); return d.ratePpm === 0 && d.taxName === null && d.registered === false && d.warning === null; })
  && taxDefault({ firmProvince: "ON", registered: true }).ratePpm === T.ON.ratePpm);
ok("FO-7g DW4 fail: anything but true (\"true\", 1, \"false\", null, nothing) is not registered → 0", ["true", 1, "false", null, undefined, {}].every((r) => { const d = taxDefault({ firmProvince: "ON", registered: r as boolean }); return d.ratePpm === 0 && d.registered === false; }));

// DW12 (pure): the default goes through QA-482's rounding (FO-7b's taxForLine, read only).
const halfUp = (amount: number, ppm: number) => Math.round(amount * ppm / 1_000_000);
const on = taxDefault({ firmProvince: "ON", registered: true });
const DW12 = (rule: (amount: number, ppm: number) => number, dflt = on) => rule(50, dflt.ratePpm) === 6;
ok("FO-7g DW12 pass: taxForLine(50, taxDefault({ firmProvince: \"ON\", registered: true }).ratePpm) is 6 (0.50 at Ontario's default → 0.06, a half to even)", DW12(taxForLine), [on, taxForLine(50, on.ratePpm)]);
ok("FO-7g DW12 fail (planted): the case refuses half up (Math.round, 0.07) in place of taxForLine, and a default from a planted table with Ontario at 15 %",
  !DW12(halfUp) && !DW12(taxForLine, taxDefault({ firmProvince: "ON", registered: true }, planted("ON", { ...T.ON, ratePpm: 150000 }))));

// DW3 and DW6 (pure): rule 3 for a draft line, the function FO-7g part 1w's draft step calls.
ok("FO-7g DW3 pass (the rule alone): a GOVERNMENT_FEE line is 0; AG-6-4 §11's example (government fee 255.00 and service 1,000.00, firm in Ontario) → tax only on the service line",
  lineRatePpm({ kind: "GOVERNMENT_FEE" }, on) === 0 && lineRatePpm({ kind: "GOVERNMENT_FEE", taxable: false }, on) === 0
  && taxForLine(25500, lineRatePpm({ kind: "GOVERNMENT_FEE" }, on)) === 0 && taxForLine(100000, lineRatePpm({ kind: "FEE" }, on)) === taxForLine(100000, T.ON.ratePpm) && taxForLine(100000, lineRatePpm({ kind: "FEE" }, on)) > 0);
ok("FO-7g DW3 fail: a request to tax a GOVERNMENT_FEE line is refused in words (no override)", throws(() => lineRatePpm({ kind: "GOVERNMENT_FEE", taxable: true }, on), TaxRuleRefused));
ok("FO-7g DW6 pass (the rule alone): a FEE or DISBURSEMENT line takes the default; set not taxable → 0; set taxable again → the default; not registered → 0 either way",
  (["FEE", "DISBURSEMENT"] as const).every((kind) => lineRatePpm({ kind }, on) === T.ON.ratePpm && lineRatePpm({ kind, taxable: false }, on) === 0 && lineRatePpm({ kind, taxable: true }, on) === T.ON.ratePpm
    && lineRatePpm({ kind, taxable: true }, taxDefault({ firmProvince: "ON", registered: false })) === 0));
ok("FO-7g DW6 fail: the rule takes no rate (a typed ratePpm beside the line changes nothing), and a taxable that is a number or text, or an unknown kind, is refused",
  lineRatePpm({ kind: "FEE", ratePpm: 99 } as never, on) === T.ON.ratePpm && [130000, "yes", null].every((taxable) => throws(() => lineRatePpm({ kind: "FEE", taxable } as never, on), TaxRuleRefused))
  && throws(() => lineRatePpm({ kind: "TIP" } as never, on), TaxRuleRefused));

ok("FO-7g DW6 fail (break m1): a default that is not 0 or a rate of the table (1300, 99, -1, text, nothing) and a missing line are refused, never passed through",
  [1300, 99, -1, "130000", undefined, NaN].every((ratePpm) => throws(() => lineRatePpm({ kind: "FEE" }, { ratePpm } as never), TaxRuleRefused))
  && throws(() => lineRatePpm(null as never, on), TaxRuleRefused) && throws(() => lineRatePpm({ kind: "FEE" }, null as never), TaxRuleRefused) && lineRatePpm({ kind: "FEE" }, { ratePpm: 0 }) === 0);

{ let reads = 0; const getter = { get ratePpm() { return reads++ === 0 ? 0 : 1300; } };
  const got = (() => { try { return lineRatePpm({ kind: "FEE" }, getter); } catch (e) { return e; } })();
  ok("FO-7g DW6 fail (round 2, minor B): a default whose ratePpm changes between reads (0, then 1300) never yields 1300: it is read once", got === 0 && reads === 1, [got, reads]); }

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
const { InvoiceDraftsController } = await import("../api/src/client-money/invoices/routes.ts");
const { InvoiceDrafts } = await import("../api/src/client-money/invoices/drafts.ts");
const { billToProvince } = await import("../api/src/client-money/invoices/bill-to.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { TaxDefaultController, TaxDefaults } = await import("../api/src/client-money/tax/routes.ts");
const invoices = (await import("../api/src/features/client-money-invoices.ts")).default;
const feature = (await import("../api/src/features/client-money-tax.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7g-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...invoices.providers, ...feature.providers];
  @Module({ controllers: [PlatformIdentityController, InvoiceDraftsController, TaxDefaultController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers the tax-default controller and its service", feature.controllers.length === 1 && feature.controllers[0] === TaxDefaultController && (feature.providers[0] as { provide: unknown }).provide === TaxDefaults);
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7g.${n}@example.org', 'seed:FO-7g-1', now()) returning id`);
  const PA = person(A, "a"), PB = person(B, "b");
  const CA = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Employer Sample Ltd', 'employer sample ltd', 'seed:FO-7g-1', now()) returning id`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo"), tO = await signIn("user-O", "sample-firm");
  const province = (firm: string, v: string) => sql(`update platform_firm set business_address = ${v} where id = '${firm}'`);
  const inProvince = (code: string) => `jsonb_build_object('street_name', 'Sample St', 'city', 'Sample', 'province_state', '${code}', 'country', 'CA')`;
  const ask = (t: string | undefined, query: string) => call(t, "GET", `/front-office/money/tax-default?${query}`);
  const forA = (t = tA) => ask(t, `partyKind=PERSON&partyId=${PA}`);
  const is = (r: Res, e: { taxName: string; ratePpm: number }) => r.status === 200 && r.body.taxName === e.taxName && r.body.ratePpm === e.ratePpm && r.body.source === "FIRM_PROVINCE" && r.body.registered === true && r.body.outsideCanada === false && r.body.warning === null;
  const none = (r: Res, registered: boolean) => r.status === 200 && r.body.taxName === null && r.body.ratePpm === 0 && r.body.source === "NONE" && r.body.registered === registered && r.body.warning === (registered ? NO_PROVINCE_WARNING : null);
  const written = () => sql(`select (select count(*) from audit_event) || '/' || (select count(*) from money_invoice) || '/' || (select count(*) from money_invoice_line)`);

  // ---------------------------------------------------------------------------------------- DW4: registered or not
  province(A, inProvince("ON")); province(B, inProvince("AB"));
  const w0 = written();
  const r0 = await forA();
  ok("FO-7g DW4 pass: before the firm has payment settings it is not registered → 200, 0, no tax name, registered false", none(r0, false), r0.body);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7g-1', now())`);
  sql(`update money_payment_settings set tax_number = '123456789RT0001' where firm_id = '${A}'`);
  const r4 = await forA();
  ok("FO-7g DW4 pass: tax_registered false with a tax number set → no tax and registered false in the answer (the two facts are apart)", none(r4, false) && sql(`select tax_number is not null and not tax_registered from money_payment_settings where firm_id = '${A}'`) === "t", r4.body);
  ok("FO-7g DW4: tax_registered true with no tax number is refused by the database's own check (FO-7ts), so the route never sees it; the rule alone taxes on registered (above)",
    refused(`update money_payment_settings set tax_registered = true where firm_id = '${B}'`, /money_payment_settings_tax_registered_check/));
  for (const f of [A, B]) sql(`update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001' where firm_id = '${f}'`);
  const r4b = await forA();
  ok("FO-7g DW4 fail (stand-in): the same firm, registered → taxed at its province's entry", is(r4b, T.ON), r4b.body);

  // ------------------------------------------------------------------------------------- DW2: the firm's province
  const company = await ask(tA, `partyKind=COMPANY&partyId=${CA}`);
  ok("FO-7g DW2 pass: a firm in Ontario (an HST province) gets the table's Ontario entry, for a person and for a company; the answer names the party", is(r4b, T.ON) && T.ON.taxName === "HST" && r4b.body.partyKind === "PERSON" && r4b.body.partyId === PA
    && is(company, T.ON) && company.body.partyKind === "COMPANY" && company.body.partyId === CA, [r4b.body, company.body]);
  const rB = await ask(tB, `partyKind=PERSON&partyId=${PB}`);
  ok("FO-7g DW2 pass: a firm in Alberta (GST only) gets the table's Alberta entry", is(rB, T.AB) && T.AB.taxName === "GST", rB.body);
  const each: [string, boolean][] = [];
  for (const c of PROVINCE_CODES) { province(A, inProvince(c)); each.push([c, is(await forA(), T[c])]); }
  ok("FO-7g DW2 pass: the route answers each of the 13 codes with that code's entry of the table", each.every(([, good]) => good), each);
  const odd: [string, string][] = [["no business address", "null"], ["an address with no province", `'{"city":"Sample"}'::jsonb`], ["a province spelled out", inProvince("Ontario")], ["a code that is not one of the 13", inProvince("ZZ")],
    ["an empty province", inProvince("")], ["a province that is a number", `'{"province_state":13}'::jsonb`], ["a province that is a list", `'{"province_state":["ON"]}'::jsonb`], ["an address that is a list", `'["ON"]'::jsonb`], ["an address that is text", `'"ON"'::jsonb`]];
  const oddAns: [string, boolean, unknown][] = [];
  for (const [what, v] of odd) { province(A, v); const r = await forA(); oddAns.push([what, none(r, true), r.body]); }
  ok("FO-7g DW2 fail: a firm with no business address, or a province that is not one of the 13 codes → 200, 0, source NONE and the warning \"Your firm's province isn't set — tax is not added\", never a guess and never a 500",
    oddAns.every(([, good]) => good), oddAns.filter(([, good]) => !good));
  province(A, inProvince("ON"));

  // ------------------------------------------------------------------------------------------------ DW7: the walls
  const bAsksA = await ask(tB, `partyKind=PERSON&partyId=${PA}`), aAsksB = await ask(tA, `partyKind=PERSON&partyId=${PB}`);
  const wrongKind = await ask(tA, `partyKind=COMPANY&partyId=${PA}`), nobody = await ask(tA, `partyKind=PERSON&partyId=00000000-0000-4000-8000-000000000000`);
  ok("FO-7g DW7 pass (walls): firm B asking for firm A's party → 404, and firm A for firm B's; a person's id asked as a company and an id nobody has are the same 404, with no rate in the answer",
    [bAsksA, aAsksB, wrongKind, nobody].every((x) => x.status === 404 && x.body.code === "NOT_FOUND" && x.body.ratePpm === undefined) && bAsksA.body.detail === nobody.body.detail, [bAsksA.body, aAsksB.body, wrongKind.body, nobody.body]);
  ok("FO-7g DW7 fail (stand-in): each firm asking for its own party is 200 with its own province's entry (Ontario for A, Alberta for B)", is(await forA(), T.ON) && is(await ask(tB, `partyKind=PERSON&partyId=${PB}`), T.AB));
  ok("FO-7g DW7: an upper-case id is the same party (200)", is(await ask(tA, `partyKind=PERSON&partyId=${PA.toUpperCase()}`), T.ON));

  // --------------------------------------------------------------------------- DW6: nothing typed reaches the rate
  const typed = await Promise.all([`partyKind=PERSON&partyId=${PA}&ratePpm=1300`, `partyKind=PERSON&partyId=${PA}&ratePpm=0`, `partyKind=PERSON&partyId=${PA}&province=AB`, `partyKind=PERSON&partyId=${PA}&firmProvince=AB`,
    `partyKind=PERSON&partyId=${PA}&registered=false`, `partyKind=PERSON&partyId=${PA}&firmId=${B}`, `partyKind=PERSON&partyId=${PA}&taxable=false`].map((q) => ask(tA, q)));
  ok("FO-7g DW6 fail: any typed rate (13 % in basis points, or 0), province, registered, firm or taxable in the request → 422 naming the field, never another number", typed.every((x) => x.status === 422 && x.body.code === "INVALID" && x.body.ratePpm === undefined), typed.map((x) => [x.status, x.body?.fields]));
  const shapes = await Promise.all(["", `partyId=${PA}`, "partyKind=PERSON", `partyKind=person&partyId=${PA}`, `partyKind=FIRM&partyId=${PA}`, "partyKind=PERSON&partyId=not-a-uuid", `partyKind=PERSON&partyId=${PA}&partyId=${PB}`,
    `partyKind=PERSON&partyKind=COMPANY&partyId=${PA}`, `partyKind=PERSON&partyId[$ne]=x`, `partyKind=PERSON&partyId=${PA}'--`, `partyKind=PERSON&partyId=${PA}&__proto__[x]=1`].map((q) => ask(tA, q)));
  ok("FO-7g inputs fail: a missing, repeated, mis-cased or malformed partyKind or partyId → 422 (never 500, never an answer)", shapes.every((x) => x.status === 422 && x.body.ratePpm === undefined), shapes.map((x) => [x.status, x.body?.fields ?? x.body]));
  ok("FO-7g DW6: the firm's old rate list is gone (FO-7ts dropped money_payment_settings.tax_rates), so no firm-set rate exists to be read",
    sql(`select count(*) from information_schema.columns where table_name = 'money_payment_settings' and column_name = 'tax_rates'`) === "0");
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:create'`);
  const noKey = await forA(tO), anon = await ask(undefined, `partyKind=PERSON&partyId=${PA}`);
  sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/invoice:create')`);
  const withKey = await forA(tO);
  ok("FO-7g keys fail: no session → 401; a staff member without agent/invoice:create → 403, no rate in the answer", anon.status === 401 && noKey.status === 403 && noKey.body.ratePpm === undefined && anon.body.ratePpm === undefined, [anon.body, noKey.body]);
  ok("FO-7g keys pass (stand-in): the same Case Officer with the key gets the default (200)", is(withKey, T.ON), withKey.body);
  ok("FO-7g read only: every call above wrote nothing (no audit line, no invoice, no line)", written() === w0, [w0, written()]);

  // --------------------------------------------------- DW3: a government fee, with the rate the route answered
  const dflt = (await forA()).body as { ratePpm: number };
  const draft = await call(tA, "POST", "/front-office/money/invoices", { personId: PA, currency: "CAD" });
  const line = (body: Record<string, unknown>) => call(tA, "POST", `/front-office/money/invoices/${draft.body.id}/lines`, body);
  const stored = () => sql(`select string_agg(position || ':' || kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor, ',' order by position) from money_invoice_line where invoice_id = '${draft.body.id}'`);
  await line({ kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 25500 });   // part 1w: a government fee carries no rate
  const svc = await line({ kind: "FEE", description: "Professional fee (Sample)", unitMinor: 100000, ratePpm: lineRatePpm({ kind: "FEE" }, dflt) });
  const DW3 = (rows: string) => rows === `1:GOVERNMENT_FEE:25500:0:0,2:FEE:100000:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}`;
  ok("FO-7g DW3 pass (AG-6-4 §11, through FO-7b's line route): firm in Ontario, a 255.00 government fee and a 1,000.00 service line at the default → the government line stores rate 0 and tax 0; tax only on the service line",
    svc.status === 201 && DW3(stored()) && svc.body.taxMinor === taxForLine(100000, T.ON.ratePpm), [svc.body, stored()]);
  ok("FO-7g DW3 fail (planted): rows in which the government fee kept the default rate are caught", !DW3(`1:GOVERNMENT_FEE:25500:${T.ON.ratePpm}:${taxForLine(25500, T.ON.ratePpm)},2:FEE:100000:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}`));
  const half = await line({ kind: "FEE", description: "Copy fee (Sample)", unitMinor: 50, ratePpm: dflt.ratePpm });
  ok("FO-7g DW12 (stored): a 0.50 FEE line at the route's Ontario default stores the table's rate and tax 0.06", half.status === 201 && sql(`select tax_rate_ppm || ':' || tax_minor from money_invoice_line where invoice_id = '${draft.body.id}' and position = 3`) === `${T.ON.ratePpm}:6`, half.body);

  // ------------------------------------------------- part 1w: the default reaches every new draft line (the route)
  // The draft step takes its rate from taxDefault through lineRatePpm, with the province from billToProvince (P-797's
  // fallback: the firm's province while no party has an address). A rate sent with a line is 0 (not taxable) or the
  // default (taxable); nothing sent is the default; anything else is 422 at ratePpm (Lead B ruling, 22 Nov).
  const fresh = async (t = tA, personId = PA) => (await call(t, "POST", "/front-office/money/invoices", { personId, currency: "CAD" })).body.id as string;
  const addTo = (id: string, body: Record<string, unknown>, t = tA) => call(t, "POST", `/front-office/money/invoices/${id}/lines`, body);
  const rows = (id: string) => sql(`select coalesce(string_agg(kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor, ',' order by position), '') from money_invoice_line where invoice_id = '${id}'`);
  const feeLine = (unitMinor: number, extra: Record<string, unknown> = {}) => ({ kind: "FEE", description: "Professional fee (Sample)", unitMinor, ...extra });
  const govLine = (extra: Record<string, unknown> = {}) => ({ kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 25500, ...extra });
  const count = () => sql(`select count(*) from money_invoice_line`);
  ok("FO-7g 1w: billToProvince(firm, party) answers the firm's province while no party has an address (P-797's fallback), and null for a firm with no province",
    billToProvince({ businessAddress: { province_state: "ON" } }, { kind: "PERSON", id: PA }) === "ON" && billToProvince({ businessAddress: { province_state: "ON" } }, null) === "ON"
    && [null, {}, [], "ON", { province_state: 13 }].every((a) => billToProvince({ businessAddress: a }, { kind: "PERSON", id: PA }) === null));

  // 1w case 1 (Build Lead C's DW12 through the route): Ontario, a 0.50 FEE line with no rate sent.
  const w1 = await fresh(), w1r = await addTo(w1, feeLine(50));
  const W1 = (r: string) => r === `FEE:50:${T.ON.ratePpm}:6`;
  ok("FO-7g 1w case 1 pass (DW12 through the route): an Ontario firm's 0.50 FEE line, no rate sent, stores tax_rate_ppm 130000 and tax 0.06 (a half to even), not 0.07",
    w1r.status === 201 && W1(rows(w1)) && T.ON.ratePpm === 130000, [w1r.body, rows(w1)]);
  const staffA = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
  const ctxA = { staffId: staffA, firmId: A, firmKey: "sample-firm", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" } as never;
  const plantedDrafts = new InvoiceDrafts(nest.get(Db), auditEvent, halfUp), w1p = await fresh();
  await withFirm(A, () => plantedDrafts.addLine(ctxA, w1p, feeLine(50)));
  ok("FO-7g 1w case 1 fail (planted): the same draft step with half up (Math.round) in place of taxForLine stores 0.07, and the case catches it", rows(w1p) === `FEE:50:${T.ON.ratePpm}:7` && !W1(rows(w1p)), rows(w1p));

  // 1w case 2: a government fee sent with a rate.
  let n = count(); const w2 = await fresh(), w2r = await addTo(w2, govLine({ ratePpm: 130000 }));
  ok("FO-7g 1w case 2 fail: a GOVERNMENT_FEE line sent with 130000 → 422 at ratePpm, in words, nothing written",
    w2r.status === 422 && w2r.body.errors?.[0]?.field === "ratePpm" && /government fee is never taxed/i.test(w2r.body.detail) && count() === n, w2r.body);
  const w2a = await addTo(w2, govLine()), w2b = await addTo(w2, govLine({ ratePpm: 0 }));
  ok("FO-7g 1w case 2 pass: a GOVERNMENT_FEE line with no rate, or with 0, is added at rate 0 and tax 0", w2a.status === 201 && w2b.status === 201 && rows(w2) === "GOVERNMENT_FEE:25500:0:0,GOVERNMENT_FEE:25500:0:0", rows(w2));

  // 1w case 3: a client-sent rate is never used: it may only say taxable (the default) or not taxable (0).
  n = count(); const w3 = await fresh();
  const sentBad = await Promise.all([150000, 1300, 50000, 130001, 1_000_000].map((ratePpm) => addTo(w3, feeLine(100000, { ratePpm }))));
  ok("FO-7g 1w case 3 fail: a FEE line sent with any rate that is neither Ontario's default nor 0 (15 %, 13 % in basis points, 5 %, 130001, 100 %) → 422 at ratePpm, nothing written",
    sentBad.every((x) => x.status === 422 && x.body.errors?.[0]?.field === "ratePpm") && count() === n, sentBad.map((x) => [x.status, x.body?.errors?.[0]]));
  const asDefault = await addTo(w3, feeLine(100000, { ratePpm: T.ON.ratePpm })), notTaxable = await addTo(w3, feeLine(100000, { ratePpm: 0 })), disb = await addTo(w3, { kind: "DISBURSEMENT", description: "Courier (Sample)", unitMinor: 2000 });
  ok("FO-7g 1w case 3 pass: the default sent (taxable) stores the table's rate, 0 sent (not taxable) stores 0, and a DISBURSEMENT with no rate takes the default",
    [asDefault, notTaxable, disb].every((x) => x.status === 201) && rows(w3) === `FEE:100000:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)},FEE:100000:0:0,DISBURSEMENT:2000:${T.ON.ratePpm}:${taxForLine(2000, T.ON.ratePpm)}`, rows(w3));

  // 1w case 4: not registered → 0 on every line.
  sql(`update money_payment_settings set tax_registered = false where firm_id = '${A}'`);
  n = count(); const w4 = await fresh();
  const w4r = [await addTo(w4, feeLine(100000)), await addTo(w4, { kind: "DISBURSEMENT", description: "Courier (Sample)", unitMinor: 2000 }), await addTo(w4, govLine()), await addTo(w4, feeLine(100000, { ratePpm: 0 }))];
  const w4bad = await addTo(w4, feeLine(100000, { ratePpm: T.ON.ratePpm }));
  ok("FO-7g 1w case 4 pass: a firm not registered gets rate 0 and tax 0 on every line (FEE, DISBURSEMENT, GOVERNMENT_FEE, FEE sent 0)",
    w4r.every((x) => x.status === 201) && rows(w4) === "FEE:100000:0:0,DISBURSEMENT:2000:0:0,GOVERNMENT_FEE:25500:0:0,FEE:100000:0:0", rows(w4));
  ok("FO-7g 1w case 4 fail: the same unregistered firm sending Ontario's 13 % → 422 (its default is 0), nothing written", w4bad.status === 422 && w4bad.body.errors?.[0]?.field === "ratePpm" && count() === String(Number(n) + 4), w4bad.body);
  sql(`update money_payment_settings set tax_registered = true where firm_id = '${A}'`);
  province(A, `'{"city":"Sample"}'::jsonb`); const w4u = await fresh(), w4ur = await addTo(w4u, feeLine(100000)); province(A, inProvince("ON"));
  ok("FO-7g 1w case 4: a registered firm whose province is not set gets 0 (source NONE: never a guess)", w4ur.status === 201 && rows(w4u) === "FEE:100000:0:0", rows(w4u));

  // 1w case 5: firm A never reads firm B's province.
  province(B, inProvince("NS"));
  const w5a = await fresh(), w5b = await fresh(tB, PB);
  await addTo(w5a, feeLine(100000)); await addTo(w5b, feeLine(100000), tB);
  ok("FO-7g 1w case 5 pass: with firm B moved to Nova Scotia, firm A's line still takes Ontario's rate and firm B's takes Nova Scotia's",
    rows(w5a) === `FEE:100000:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}` && rows(w5b) === `FEE:100000:${T.NS.ratePpm}:${taxForLine(100000, T.NS.ratePpm)}`, [rows(w5a), rows(w5b)]);
  province(A, inProvince("AB")); const w5c = await fresh(); await addTo(w5c, feeLine(100000)); province(A, inProvince("ON")); province(B, inProvince("AB"));
  ok("FO-7g 1w case 5 fail (stand-in): firm A moved to Alberta takes Alberta's rate on its next line, so the case above would catch a step that read another firm's province or none (the read names the session's firm, and PF-12's row rules on platform_firm hide firm B's row as well: either alone keeps this case green)",
    rows(w5c) === `FEE:100000:${T.AB.ratePpm}:${taxForLine(100000, T.AB.ratePpm)}` && T.AB.ratePpm !== T.ON.ratePpm, rows(w5c));
  // Break m1: "Prices include tax" turned on while a line waits on the invoice lock is seen after the lock (409, nothing written).
  const lockId = await fresh(); let release!: () => void; const held = new Promise<void>((r) => { release = r; });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const locker = owner.$transaction(async (tx) => { await tx.$queryRawUnsafe(`select 1 from money_invoice where id = '${lockId}' for update`); await held; await tx.$executeRawUnsafe(`update money_payment_settings set prices_include_tax = true where firm_id = '${A}'`); }, { timeout: 30_000 });
  await sleep(300); const waiting = addTo(lockId, feeLine(100000)); await sleep(700); release(); await locker; const m1 = await waiting;
  sql(`update money_payment_settings set prices_include_tax = false where firm_id = '${A}'`);
  ok("FO-7g 1w (break m1) fail: \"Prices include tax\" turned on while the line waited on the invoice lock → 409 PRICES_INCLUDE_TAX, nothing written (never taxed on top)", m1.status === 409 && m1.body.code === "PRICES_INCLUDE_TAX" && rows(lockId) === "", [m1.status, m1.body?.code, rows(lockId)]);
  const m1b = await addTo(lockId, feeLine(100000));
  ok("FO-7g 1w (break m1) pass (stand-in): with it off again, the same line is added at the default", m1b.status === 201 && rows(lockId) === `FEE:100000:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}`, rows(lockId));
  // Break m2: an in-process caller passing ratePpm: undefined gets the default, not 0 (undefined is "not sent").
  const realDrafts = nest.get(InvoiceDrafts), m2 = await fresh();
  await withFirm(A, () => realDrafts.addLine(ctxA, m2, feeLine(100000, { ratePpm: undefined })));
  ok("FO-7g 1w (break m2): ratePpm: undefined from an in-process caller is \"not sent\" → the default, not 0", rows(m2) === `FEE:100000:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}`, rows(m2));
  const m3 = await addTo(await fresh(), feeLine(100000, { ratePpm: 150000 }));
  ok("FO-7g 1w (review minor 2): the refusal names the rate as a person reads it (HST 13 %) beside its parts per million", m3.status === 422 && /HST 13 %/.test(m3.body.detail) && /130000 \(parts per million\)/.test(m3.body.detail), m3.body.detail);

  ok("FO-7g 1w audit: each line written above has one audit line by a typed staff actor, carrying the rate stored",
    sql(`select count(*) from money_invoice_line l join audit_event a on a.entity_key = l.id::text and a.action = 'invoice.line_added' where (a.detail->>'ratePpm')::int = l.tax_rate_ppm and a.actor like 'staff:%'`) === count());

  // ------------------------------------------------------------------------------------- DW5: frozen at issue
  const before = stored();
  sql(`update money_invoice set due_date = '2026-12-15', issued_at = now(), issued_by = 'staff:${sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`)}' where id = '${draft.body.id}'`);
  const changed = planted("ON", { ...T.ON, ratePpm: 150000, source: { ...T.ON.source, quote: "Ontario | 15% | N/A" } });
  const later = taxDefault({ firmProvince: "ON", registered: true }, changed);
  province(A, inProvince("AB")); const moved = await forA();
  const frozen = /issued invoices can't be edited/;
  ok("FO-7g DW5 pass (frozen): after issue, a changed table (Ontario at another rate) and a firm moved to Alberta change the default for new lines, and the issued invoice's tax_rate_ppm and tax_minor stay as issued",
    tableProblems(changed).length === 0 && later.ratePpm !== T.ON.ratePpm && is(moved, T.AB) && stored() === before && DW3(before.split(",").slice(0, 2).join(",")), [later, moved.body, before, stored()]);
  ok("FO-7g DW5 fail: writing the changed rate onto the issued line, or adding a line to the issued invoice, is refused (FO-7a's trigger; the route's 409), and nothing changes",
    refused(`update money_invoice_line set tax_rate_ppm = ${later.ratePpm}, tax_minor = ${taxForLine(100000, later.ratePpm)} where invoice_id = '${draft.body.id}' and position = 2`, frozen)
    && (await line({ kind: "FEE", description: "Late line (Sample)", unitMinor: 100, ratePpm: later.ratePpm })).status === 409 && stored() === before, stored());
} catch (e) {
  ok("FO-7g: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
