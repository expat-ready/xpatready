// FO-7g part 3 (R1.56; P-797, decided 22 Nov from CRA GST/HST Memorandum 3-3-6 "Place of Supply in a Province - General
// Rules for Services", para 20 and Example 6; AG-6-4 rules 1, 4, 7, §8 and edge case 12; Tax readings: Unconfirmed: no
// accountant): the Bill-to province. The BACKLOG row's six cases, each a pass and a fail:
//   B1 an Ontario firm with Bill-to NB gives 15 % lines, not 13 %;
//   B2 Bill-to edited on a draft changes the default of new lines and (Lead B's read on #3156, superseding the row's
//      "leaves existing lines' stored tax unchanged") re-rates the lines taxed at the old default in the same change;
//   B7 only lines at the old default move: a 0 % line and a government fee stay at 0;
//   B3 Bill-to cannot change after issue (the route's 409 and the database's gate);
//   B4 a code outside the 13 is refused 422;
//   B5 no address and no edit gives the firm's province (filled on the new draft);
//   B6 firm A cannot set firm B's invoice's Bill-to (404);
//   B8 the tax default for one invoice (GET tax-default …&invoiceId=) reads its Bill-to: source PARTY_PROVINCE (j_56 W3).
// Also: the key (agent/invoice:edit, AG-6-4 §8: a Case Officer may draft but not change it, 403), one audit line per
// change with before and after, the same value again writes nothing, the column's CHECK, and the 13 codes of the port,
// the cited table and the database agree. A scratch database (every migration), a Nest app of PF-4's guard, PF-12's
// walls and FO-7b's draft routes, with the local sign-in stand-in. No network, no model call (US$0). The rates are the
// cited table's (canada-gst-hst.ts). Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7g3_bill_to.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";
import { PROVINCE_CODES, PROVINCE_TAX_RATES as T } from "../api/src/client-money/tax/canada-gst-hst.ts";
import { BILL_TO_PROVINCES } from "../ports/client-money.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261123020000_fo7g3_bill_to_province";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7g3_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, why: RegExp) => { try { sql(q); return false; } catch (e) { return why.test(String((e as { stderr?: string }).stderr ?? e)); } };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

// ------------------------------------------------------------------------------------------- the codes and the stamp
const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
ok("FO-7g3 pass: the migration has its own stamp, later than every one before it (P-600)", all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && all.filter((d) => d < NEW).every((d) => d.slice(0, 14) < NEW.slice(0, 14)));
const checkCodes = [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").matchAll(/"bill_to_province" IN \(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/'([A-Z]{2})'/g)].map((x) => x[1]));
ok("FO-7g3 pass: the port's 13 codes, the cited table's and the database's CHECK are the same list", JSON.stringify([...BILL_TO_PROVINCES].sort()) === JSON.stringify([...PROVINCE_CODES].sort()) && JSON.stringify([...checkCodes].sort()) === JSON.stringify([...PROVINCE_CODES].sort()) && PROVINCE_CODES.length === 13, { BILL_TO_PROVINCES, checkCodes });

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  for (const d of all) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
  const { billToProvince } = await import("../api/src/client-money/invoices/bill-to.ts");
  const invoices = (await import("../api/src/features/client-money-invoices.ts")).default;
  const taxes = (await import("../api/src/features/client-money-tax.ts")).default;
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo7g3-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...invoices.providers, ...taxes.providers];
  @Module({ controllers: [PlatformIdentityController, InvoiceDraftsController, ...taxes.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7g3.${n}@example.org', 'seed:FO-7g-3', now()) returning id`);
  const PA = person(A, "a"), PB = person(B, "b");
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  // user-R: sample-firm's Owner (agent/invoice:edit); user-O: a Case Officer (drafts, no agent/invoice:edit); user-S: sample-solo's Owner.
  const tA = await signIn("user-R", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tB = await signIn("user-S", "sample-solo");
  const inProvince = (code: string) => `jsonb_build_object('street_name', 'Sample St', 'city', 'Sample', 'province_state', '${code}', 'country', 'CA')`;
  sql(`update platform_firm set business_address = ${inProvince("ON")} where id = '${A}'`); sql(`update platform_firm set business_address = ${inProvince("AB")} where id = '${B}'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, tax_registered, tax_number, updated_by, updated_at) values ('${f}', true, '123456789RT0001', 'seed:FO-7g-3', now())`);
  const M = "/front-office/money/invoices";
  const draft = (t = tA, personId = PA) => call(t, "POST", M, { personId, currency: "CAD" });
  const fee = (id: string, t = tA) => call(t, "POST", `${M}/${id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor: 100000 });
  const setTo = (id: string, province: unknown, t = tA) => call(t, "PUT", `${M}/${id}/bill-to`, { province });
  const stored = (id: string) => sql(`select coalesce(bill_to_province, '-') from money_invoice where id = '${id}'`);
  const lines = (id: string) => sql(`select string_agg(position || ':' || tax_rate_ppm || ':' || tax_minor, ',' order by position) from money_invoice_line where invoice_id = '${id}'`);
  const audits = (id: string) => sql(`select count(*) from audit_event where action = 'invoice.bill_to_changed' and entity_key = '${id}'`);

  // ------------------------------------------------------------------- B5: no address, no edit → the firm's province
  const d5 = await draft(), l5 = await fee(d5.body.id);
  ok("FO-7g3 B5 pass (AG-6-4 edge case 12): a new draft for a client with no address takes the firm's province (ON), stored and shown; its line is ON's 13 %",
    d5.status === 201 && d5.body.billToProvince === "ON" && stored(d5.body.id) === "ON" && l5.status === 201 && lines(d5.body.id) === `1:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}`, [d5.body, lines(d5.body.id)]);
  sql(`update platform_firm set business_address = null where id = '${A}'`);
  const d5n = await draft();
  ok("FO-7g3 B5 fail: a firm with no province leaves the Bill-to empty (never a guess); billToProvince answers null with nothing stored and no firm province",
    d5n.status === 201 && d5n.body.billToProvince === null && stored(d5n.body.id) === "-" && billToProvince({ businessAddress: null }, { kind: "PERSON", id: PA }) === null, d5n.body);
  sql(`update platform_firm set business_address = ${inProvince("ON")} where id = '${A}'`);
  ok("FO-7g3 B5 pass: billToProvince reads the stored Bill-to first, then the firm's province", billToProvince({ businessAddress: { province_state: "ON" } }, null, "NB") === "NB" && billToProvince({ businessAddress: { province_state: "ON" } }, null, null) === "ON");

  // ---------------------------------------------------------------------------- B1: an Ontario firm, Bill-to NB → 15 %
  const d1 = await draft(), s1 = await setTo(d1.body.id, "NB"), l1 = await fee(d1.body.id);
  ok("FO-7g3 B1 pass (P-797, Memorandum 3-3-6 Example 6): an Ontario firm with Bill-to NB → the line takes NB's 15 % HST, stored",
    s1.status === 200 && s1.body.billToProvince === "NB" && l1.status === 201 && lines(d1.body.id) === `1:${T.NB.ratePpm}:${taxForLine(100000, T.NB.ratePpm)}` && T.NB.ratePpm === 150000, [s1.body, lines(d1.body.id)]);
  ok("FO-7g3 B1 fail: the line is not the firm's 13 %", T.ON.ratePpm === 130000 && lines(d1.body.id) !== `1:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}`);

  // ------------------------------------------- B2 (Lead B's read on #3156): an edit re-rates the old default's lines
  const d2 = await draft(); await fee(d2.body.id); const before = lines(d2.body.id);
  const s2 = await setTo(d2.body.id, "AB"); await fee(d2.body.id);
  const ab = `1:${T.AB.ratePpm}:${taxForLine(100000, T.AB.ratePpm)}`;
  ok("FO-7g3 B2 pass: Bill-to ON → AB on a draft: line 1 (at ON's 13 % default) is re-rated to AB's 5 % with taxForLine, line 2 takes 5 %; one audit line: ON 130000 → AB 50000, 1 line re-rated, its tax 130.00 → 50.00",
    s2.status === 200 && before === `1:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)}` && lines(d2.body.id) === `${ab},2:${T.AB.ratePpm}:${taxForLine(100000, T.AB.ratePpm)}`
    && sql(`select count(*) || ':' || min(detail->>'billToProvince_before') || ':' || min(detail->>'billToProvince_after') || ':' || min(detail->>'ratePpm_before') || ':' || min(detail->>'ratePpm_after') || ':' || min(detail->>'linesReRated') || ':' || min(detail->>'taxBeforeMinor') || ':' || min(detail->>'taxAfterMinor') from audit_event where action = 'invoice.bill_to_changed' and entity_key = '${d2.body.id}'`) === `1:ON:AB:${T.ON.ratePpm}:${T.AB.ratePpm}:1:${taxForLine(100000, T.ON.ratePpm)}:${taxForLine(100000, T.AB.ratePpm)}`,
    [lines(d2.body.id), sql(`select detail from audit_event where action = 'invoice.bill_to_changed' and entity_key = '${d2.body.id}'`)]);
  const same = await setTo(d2.body.id, "AB");
  ok("FO-7g3 B2 fail: the same value again re-rates nothing and writes no second audit line", same.status === 200 && lines(d2.body.id).startsWith(ab) && audits(d2.body.id) === "1");

  // ------------------------------------------- B7 (Lead B's read): only lines at the old default move; 0 % stays 0 %
  const d7 = await draft(); await fee(d7.body.id);
  await call(tA, "POST", `${M}/${d7.body.id}/lines`, { kind: "FEE", description: "Not taxable (Sample)", unitMinor: 50000, ratePpm: 0 });
  await call(tA, "POST", `${M}/${d7.body.id}/lines`, { kind: "GOVERNMENT_FEE", description: "IRCC fee (Sample)", unitMinor: 15500 });
  const before7 = lines(d7.body.id), s7 = await setTo(d7.body.id, "NB");
  ok("FO-7g3 B7 pass: Bill-to ON → NB re-rates the 13 % fee to 15 % (1,000.00 → tax 150.00) in the same change; the 0 % line and the government fee stay at 0",
    s7.status === 200 && before7 === `1:${T.ON.ratePpm}:${taxForLine(100000, T.ON.ratePpm)},2:0:0,3:0:0` && lines(d7.body.id) === `1:${T.NB.ratePpm}:${taxForLine(100000, T.NB.ratePpm)},2:0:0,3:0:0`
    && s7.body.taxMinor === taxForLine(100000, T.NB.ratePpm), [before7, lines(d7.body.id), s7.body?.taxMinor]);
  ok("FO-7g3 B7 fail: the invoice no longer carries ON's 13 % on any line after the change", !lines(d7.body.id).includes(`:${T.ON.ratePpm}:`));
  const officer = await draft(tO), so = await setTo(officer.body.id, "NB", tO);
  ok("FO-7g3 keys fail (AG-6-4 §8): a Case Officer may start a draft but not change its Bill-to (403 agent/invoice:edit), unchanged", officer.status === 201 && so.status === 403 && stored(officer.body.id) === "ON", so.body);

  // -------------------------------------------------------------------------------------- B3: fixed once issued
  const d3 = await draft(); await fee(d3.body.id); sql(`update money_invoice set issued_at = now(), issued_by = 'user-R', due_date = current_date + 14 where id = '${d3.body.id}'`);
  const s3 = await setTo(d3.body.id, "NB");
  ok("FO-7g3 B3 fail: after issue the route refuses (409 ISSUED), the Bill-to stays ON, no audit line", s3.status === 409 && s3.body.code === "ISSUED" && stored(d3.body.id) === "ON" && audits(d3.body.id) === "0", s3.body);
  ok("FO-7g3 B3 fail (the database's gate, AG-6-4 rule 7): writing an issued invoice's Bill-to around the route is refused, and so is clearing it",
    refused(`update money_invoice set bill_to_province = 'NB' where id = '${d3.body.id}'`, /issued invoices can't be edited/) && refused(`update money_invoice set bill_to_province = null where id = '${d3.body.id}'`, /issued invoices can't be edited/) && stored(d3.body.id) === "ON");
  const d3b = await draft(); await fee(d3b.body.id);
  ok("FO-7g3 B3 fail (break m1): the issuing statement itself cannot change the Bill-to (the lines were taxed in ON), nothing issued",
    refused(`update money_invoice set issued_at = now(), issued_by = 'user-R', due_date = current_date + 14, bill_to_province = 'QC' where id = '${d3b.body.id}'`, /issued invoices can't be edited/) && sql(`select coalesce(bill_to_province, '-') || ':' || (issued_at is null) from money_invoice where id = '${d3b.body.id}'`) === "ON:true");
  ok("FO-7g3 B3 pass: a draft's Bill-to may be written (the gate is for issued invoices only), and issuing keeps it", stored(d1.body.id) === "NB" && (sql(`update money_invoice set issued_at = now(), issued_by = 'user-R', due_date = current_date + 14 where id = '${d1.body.id}'`), stored(d1.body.id)) === "NB");

  // ---------------------------------------------------------------------------------------- B4: outside the 13 → 422
  const bad = await Promise.all(["XX", "on", "Ontario", "", 13, null].map((p) => setTo(d2.body.id, p))), extra = await call(tA, "PUT", `${M}/${d2.body.id}/bill-to`, { province: "NB", country: "CA" });
  ok("FO-7g3 B4 fail: a code outside the 13 (XX, lower case, a name, empty, a number, null) or an unknown field → 422 at the field, the Bill-to unchanged (AB), no audit line",
    [...bad, extra].every((r) => r.status === 422) && bad[0].body.fields?.province && stored(d2.body.id) === "AB" && audits(d2.body.id) === "1", [...bad, extra].map((r) => [r.status, r.body?.fields]));
  ok("FO-7g3 B4 fail (the database's CHECK): a code outside the 13 written around the route is refused", refused(`update money_invoice set bill_to_province = 'XX' where id = '${d2.body.id}'`, /money_invoice_bill_to_province_check/));
  const each: number[] = []; for (const c of PROVINCE_CODES) each.push((await setTo(d2.body.id, c)).status);   // one after another: the last stays
  ok("FO-7g3 B4 pass: each of the 13 codes is accepted on a draft", each.every((s) => s === 200) && stored(d2.body.id) === PROVINCE_CODES.at(-1), each);

  // ------------------------------------------------------------------------------------------- B6: firm walls → 404
  const dB = await draft(tB, PB), sB = await setTo(dB.body.id, "NB", tA), malformed = await setTo("not-an-id", "NB");
  ok("FO-7g3 B6 fail: firm A setting firm B's invoice's Bill-to → 404, firm B's stays AB (its firm's province); a malformed id → 404",
    dB.status === 201 && dB.body.billToProvince === "AB" && sB.status === 404 && stored(dB.body.id) === "AB" && malformed.status === 404 && audits(dB.body.id) === "0", [sB.body, malformed.status]);
  const own = await setTo(dB.body.id, "NB", tB);
  ok("FO-7g3 B6 pass: firm B's own Owner may set it", own.status === 200 && stored(dB.body.id) === "NB", own.body);

  // ----------------------------- B8: the tax default for one invoice reads its Bill-to (j_56 W3; P-797, source PARTY_PROVINCE)
  const TD = "/front-office/money/tax-default?partyKind=PERSON";
  const forInv = (invoiceId: string, t = tA, partyId = PA) => call(t, "GET", `${TD}&partyId=${partyId}&invoiceId=${invoiceId}`);
  const nb = await forInv(d7.body.id), issuedNb = await forInv(d1.body.id), plain = await call(tA, "GET", `${TD}&partyId=${PA}`), fallback = await forInv(d5.body.id);
  ok("FO-7g3 B8 pass: the default for an invoice billed to NB is NB's 15 % HST from the table, source PARTY_PROVINCE (an issued one too: its Bill-to is fixed); without invoiceId the firm's ON, as before",
    nb.status === 200 && nb.body.taxName === T.NB.taxName && nb.body.ratePpm === T.NB.ratePpm && nb.body.source === "PARTY_PROVINCE" && nb.body.registered === true && nb.body.outsideCanada === false
    && issuedNb.body?.ratePpm === T.NB.ratePpm && issuedNb.body?.source === "PARTY_PROVINCE" && plain.body?.ratePpm === T.ON.ratePpm && plain.body?.source === "FIRM_PROVINCE", [nb.body, issuedNb.body, plain.body]);
  ok("FO-7g3 B8 pass: a Bill-to that is the firm's own province (a new draft's fallback copy) answers FIRM_PROVINCE at ON's rate, never claimed as the client's",
    fallback.status === 200 && fallback.body.ratePpm === T.ON.ratePpm && fallback.body.source === "FIRM_PROVINCE", fallback.body);
  sql(`update money_payment_settings set tax_registered = false, tax_number = null where firm_id = '${A}'`);
  const unreg = await forInv(d7.body.id);
  sql(`update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001' where firm_id = '${A}'`);
  ok("FO-7g3 B8 fail (AG-6-4 rule 5): a firm not registered gets no tax for a Bill-to NB invoice (0, source NONE)", unreg.status === 200 && unreg.body.ratePpm === 0 && unreg.body.source === "NONE" && unreg.body.registered === false, unreg.body);
  const PA2 = person(A, "a2"), d8 = await draft(tA, PA2);
  const otherParty = await forInv(d8.body.id), otherFirm = await forInv(dB.body.id), bAsks = await forInv(d7.body.id, tB), nobody = await forInv("00000000-0000-4000-8000-000000000000");
  const notId = await forInv("not-an-id"), twice = await call(tA, "GET", `${TD}&partyId=${PA}&invoiceId=${d7.body.id}&invoiceId=${d1.body.id}`);
  ok("FO-7g3 B8 fail (walls): another client's invoice, firm B's invoice, firm B asking with firm A's, and an id nobody has → the same 404, no rate",
    [otherParty, otherFirm, bAsks, nobody].every((r) => r.status === 404 && r.body.ratePpm === undefined) && otherParty.body.detail === nobody.body.detail && otherFirm.body.detail === nobody.body.detail, [otherParty.body, otherFirm.body, bAsks.body, nobody.body]);
  ok("FO-7g3 B8 fail (inputs): a malformed or repeated invoiceId → 422, never an answer", notId.status === 422 && twice.status === 422 && notId.body.ratePpm === undefined, [notId.body, twice.body]);

  // -------------------------------------------------------------------------------------------- the gate and audit
  ok("FO-7g3 pass: the gate runs as PF-12's wall reader (SECURITY DEFINER, search_path fixed), not executable by PUBLIC",
    sql(`select p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader' and array_to_string(p.proconfig, ',') like 'search_path=%' and not has_function_privilege('public', p.oid, 'EXECUTE') from pg_proc p where p.proname = 'money_invoice_bill_to_frozen'`) === "t");
  ok("FO-7g3 pass: every Bill-to change is one audit line by staff", sql(`select count(*) from audit_event where action = 'invoice.bill_to_changed' and actor not like 'staff:%'`) === "0"
    && sql(`select count(*) from audit_event where action = 'invoice.draft_created' and detail ? 'billToProvince_after'`) === sql(`select count(*) from money_invoice`));
} catch (e) {
  ok("FO-7g3: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
