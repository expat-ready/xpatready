// J-56 (map row 56, R1.56: client invoices, tax by province, government-fee line): the join-and-walk for the row, over
// FO-7a (#1758, the money schema), FO-7b part 1a (drafts and lines, integer cents), FO-7g part 1 (the cited GST/HST
// table and the default from the firm's province), and the parts still to come: FO-7b part 1b (issue, PDF; #2953),
// FO-7g part 1w (the draft line takes the default; a government fee refuses tax), FO-7g part 3 (the Bill-to's own
// province), FO-7b's draft from a signed retainer, FO-7q (reads) and FO-7s1 (the invoice screens). Written by Track B's
// qa lane (22 Nov, A286) before the build finishes, so qa only runs it when the last part merges.
// Done when (CAPABILITIES R1.56): "An invoice from a signed retainer adds the client's province's tax from a cited
// table; the government fee is its own untaxed line; totals in integer cents".
//   W1 (an invoice from a signed retainer): a draft started from the client's signed retainer carries its fee rows.
//   W2 (the cited table): the tax default for the client is read from the cited CRA table (URL, quote, read date).
//   W3 (the client's province, P-797): a client whose Canadian address is in Nova Scotia gets Nova Scotia's HST (14 %),
//       not the Ontario firm's 13 %, through the editable Bill-to province; source PARTY_PROVINCE (FO-7g part 3).
//   W4 (the tax is added): a fee line sent with no rate takes the default; a rate in the request is never used.
//   W5 (the government fee is its own untaxed line): stored at 0 tax; asking to tax it is refused in words.
//   W6 (totals in integer cents): every figure on the invoice and in the database is a whole number of cents, and the
//       total is the sum of its lines.
//   W7 (the invoice is issued): an INV- number, the tax frozen, and the PDF shows the tax line and the untaxed
//       government-fee line.
//   W8 (roles): no session 401, another firm 404.
//   W9 (by screens): Money › Invoices lists the issued invoice with its tax; the walk ends at R1.57's first step
//       (the invoice offers the client a card payment link).
// Fails on main today (P-606) only on the steps whose parts are not merged; each failing label names the part.
// Sample data only (13 % ON and 14 % NS are read from the cited table, never typed here); US$0, no model call, no live
// mail, no Stripe call. Tax readings Unconfirmed: no counsel. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j56 4456 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j56 4456 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_56.ts j56 4456
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { CRA_RATES_URL, PROVINCE_TAX_RATES } from "../../api/src/client-money/tax/canada-gst-hst.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j56", Number(process.argv[3] ?? 4456)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-56", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: unknown = null; try { b = JSON.parse(text); } catch { /* not JSON (a PDF) */ }
  return { status: r.status, body: b, text };
};
const whole = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const ON = PROVINCE_TAX_RATES.ON, NS = PROVINCE_TAX_RATES.NS;

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  // The firms and their front office (seeded as the other money journeys do); the firm's Ontario business address is
  // R1.21's walk (not under test here); its tax registration is FO-7ts's setting (Getting paid is FO-7s1, not on main).
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  sql(`update platform_firm set business_address = '{"street_number":"100","street_name":"King Street West","city":"Toronto","province_state":"ON","postal_code":"M5X 1A9","country":"CA"}'::jsonb where id = '${A}'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:J-56', now()) on conflict (firm_id) do nothing`);
  sql(`update money_payment_settings set tax_number = '123456789RT0001', tax_registered = true where firm_id = '${A}'`);
  const PA = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Noémie${run}', 'Sample', 'j56.${run}@example.org', 'seed:J-56', now()) returning id`);
  ok("J-56 setup: both Sample firms, firm A in Ontario and registered for tax, one client of firm A", !!A && !!B && !!PA && fo.failed.length === 0
    && sql(`select business_address->>'province_state' || '|' || tax_registered from platform_firm f join money_payment_settings s on s.firm_id = f.id where f.id = '${A}'`) === "ON|true", fo.failed);
  const staff = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const signIn = async (firmKey: string, email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  const emailA = staff("user-R"), TA = await signIn("sample-firm", emailA), TB = await signIn("sample-solo", staff("user-S"));
  const lines = (id: string) => sql(`select coalesce(string_agg(kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor, ',' order by position), '') from money_invoice_line where invoice_id = '${id}'`);

  // The client's signed retainer (R1.53/R1.54 walk the retainer and its signing; seeded here as its rows, Sample):
  // a 2,000.00 professional fee on signing is a deposit, so the billable row is the 1,500.00 fee when submitted.
  const staffA = sql(`select id from platform_staff where actor_id = 'user-R'`);
  let RET = "";
  try {
    const T = sql(`select gen_random_uuid()`), R = sql(`select gen_random_uuid()`), PR = sql(`select gen_random_uuid()`);
    sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${PA}', 'MANUAL', 'WEBSITE', '${staffA}', 'ENGAGED', now(), 'seed:J-56', 'seed:J-56', now())`);
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, won_via, won_at, created_by, updated_at)
      select '${PR}', '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'RETAINER_SIGNED'), '${PA}', '${PA}', '${staffA}', 'E_SIGNED', now(), 'seed:J-56', now() from fo_lead l where l.person_id = '${PA}'`);
    sql(`insert into fo_retainer_template (id, firm_id, name, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${T}', '${A}', 'J-56 retainer ${run}', 'retainer-templates/${T}/v1.docx', repeat('a', 64), '{}', 'seed:J-56', 'seed:J-56', now())`);
    const V = sql(`select gen_random_uuid()`);
    // A retainer and its version 1 are written in one transaction (the database's own rule), as FO-5 writes them.
    sql(`begin; insert into fo_retainer (id, firm_id, prospect_id, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, status, created_by, updated_at) values ('${R}', '${A}', '${PR}', '${PA}', '${staffA}', '${T}', 1, 'retainer-templates/${T}/v1.docx', 'DRAFT', 'seed:J-56', now());
      insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${V}', '${A}', '${R}', 1, '{}', 'retainers/${R}/v1.pdf', repeat('b', 64), 'seed:J-56');
      insert into fo_retainer_fee_row (id, firm_id, version_id, position, label, amount_minor, "when") values (gen_random_uuid(), '${A}', '${V}', 1, 'Professional fee: application (Sample)', 150000, 'WHEN_SUBMITTED'); commit`);
    RET = R;
    sql(`begin; update fo_retainer_version set sent_at = now() where retainer_id = '${RET}'; update fo_retainer set status = 'SENT', updated_at = now() where id = '${RET}'; commit`);
    for (const st of ["CLIENT_SIGNED", "SIGNED"]) sql(`update fo_retainer set status = '${st}', updated_at = now() where id = '${RET}'`);   // the signing path (FO-6 moves it)
  } catch (e) { console.log(`  note: the signed retainer could not be seeded: ${String((e as { stderr?: string }).stderr ?? e).split("\n").slice(0, 2).join(" ")}`); }

  // ------------------------------------------------------------------------------- W1: from the signed retainer
  const w1 = await api(TA, "POST", "/front-office/money/invoices", { personId: PA, currency: "CAD", retainerId: RET });
  ok("R1.56 W1 (part missing: invoice from retainer (row to be named by Lead B); FO-7s1 'Start from retainer'): a draft started from the client's signed retainer carries its 1,500.00 fee row",
    w1.status === 201 && /FEE:150000:/.test(lines(w1.body?.id ?? "00000000-0000-0000-0000-000000000000")), { status: w1.status, detail: w1.body?.detail ?? w1.body?.errors ?? null, retainerSeeded: !!RET });
  // The rest of the walk drafts by hand (FO-7b part 1a) so each later step is scored on its own part.
  const d = w1.status === 201 ? w1 : await api(TA, "POST", "/front-office/money/invoices", { personId: PA, currency: "CAD" });
  const INV: string = d.body?.id ?? "";
  if (!INV) throw new Error(`STOP  no draft invoice (${d.status} ${JSON.stringify(d.body)}): the walk needs it`);

  // --------------------------------------------------------------------------------------- W2: the cited table
  const t2 = await api(TA, "GET", `/front-office/money/tax-default?partyKind=PERSON&partyId=${PA}`);
  ok("R1.56 W2: the tax default for the firm's client is Ontario's HST from the table (13 %, 130000 ppm, registered)", t2.status === 200 && t2.body?.taxName === "HST" && t2.body?.ratePpm === ON.ratePpm && t2.body?.registered === true, t2.body);
  const cites = Object.values(PROVINCE_TAX_RATES).every((e) => e.source?.url === CRA_RATES_URL && !!e.source?.quote && /^\d{4}-\d{2}-\d{2}$/.test(e.source?.readOn ?? ""));
  ok("R1.56 W2: every row of the table cites the CRA's own rates page (canada.ca URL, quote, read date) (P-170)", cites && /^https:\/\/www\.canada\.ca\//.test(CRA_RATES_URL), { url: CRA_RATES_URL, on: ON.source });
  const t2b = await api(TA, "GET", `/front-office/money/tax-default?partyKind=PERSON&partyId=${PA}&ratePpm=140000`);
  ok("R1.56 W2 fail: a rate in the request is refused (422), never used", t2b.status === 422, t2b.body);

  // -------------------------------------------------------------------------------- W3: the client's province
  // P-797 (CRA GST/HST Memorandum 3-3-6, para 20 and Example 6; Unconfirmed: no counsel): the tax follows the client's
  // province, read from the client's Canadian address on the record through an editable Bill-to province; with no
  // Canadian address it falls back to the firm's province (W2). FO-7g part 3 adds the Bill-to province (a migration);
  // the field names below are this journey's reading of P-797, aligned when part 3 merges.
  const addr = await api(TA, "PATCH", `/front-office/people/${PA}`, { address: { city: "Halifax", provinceState: "NS", postalCode: "B3H 1A1", country: "CA" } });
  const billTo = await api(TA, "PATCH", `/front-office/money/invoices/${INV}`, { billToProvince: "NS" });
  const t3 = await api(TA, "GET", `/front-office/money/tax-default?partyKind=PERSON&partyId=${PA}`);
  ok("R1.56 W3 (part missing: FO-7g part 3, the Bill-to province, P-797): a client whose Canadian address is in Nova Scotia gets Nova Scotia's HST (14 %), not the Ontario firm's 13 %, source PARTY_PROVINCE",
    t3.body?.ratePpm === NS.ratePpm && t3.body?.source === "PARTY_PROVINCE", { addressSave: addr.status, billToSave: billTo.status, default: t3.body });

  // ------------------------------------------------------------------------------------- W4: the tax is added
  const w4 = await api(TA, "POST", `/front-office/money/invoices/${INV}/lines`, { kind: "FEE", description: "Professional fee: application (Sample)", unitMinor: 150000 });
  const dflt = t3.body?.source === "PARTY_PROVINCE" ? NS.ratePpm : ON.ratePpm;
  ok("R1.56 W4 (part missing: FO-7g part 1w, the draft line takes taxDefault): a fee line sent with no rate takes the client's default tax",
    w4.status === 201 && lines(INV).startsWith(`FEE:150000:${dflt}:`), { status: w4.status, detail: w4.body?.detail ?? w4.body?.errors ?? null, lines: lines(INV) });
  const before4 = lines(INV);
  const w4b = await api(TA, "POST", `/front-office/money/invoices/${INV}/lines`, { kind: "FEE", description: "Second fee (Sample)", unitMinor: 10000, ratePpm: 1300 });
  ok("R1.56 W4 fail (part missing: FO-7g part 1w): a fee line sent with a rate of its own (1300 ppm) is refused or given the default; 1300 is never stored",
    !/:1300:/.test(lines(INV)) && (w4b.status === 422 || lines(INV) !== before4), { status: w4b.status, lines: lines(INV) });

  // --------------------------------------------------------------------------- W5: the government fee, untaxed
  const w5 = await api(TA, "POST", `/front-office/money/invoices/${INV}/lines`, { kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 15500 });
  ok("R1.56 W5: a government fee is its own line at 0 tax", (w5.status === 201 || w5.status === 200) && lines(INV).includes("GOVERNMENT_FEE:15500:0:0"), { status: w5.status, lines: lines(INV), detail: w5.body?.detail ?? w5.body?.errors });
  const n5 = lines(INV);
  const w5b = await api(TA, "POST", `/front-office/money/invoices/${INV}/lines`, { kind: "GOVERNMENT_FEE", description: "Biometrics fee (Sample)", unitMinor: 8500, ratePpm: dflt });
  ok("R1.56 W5 fail (part missing: FO-7g part 1w, lineRatePpm's refusal): asking to tax a government fee is refused in words (422), nothing saved",
    w5b.status === 422 && /government fee/i.test(JSON.stringify(w5b.body)) && lines(INV) === n5, { status: w5b.status, lines: lines(INV), body: w5b.body });

  // ------------------------------------------------------------------------------------ W6: integer cents
  const v = await api(TA, "GET", `/front-office/money/invoices/${INV}`);
  const sumLines = Number(sql(`select coalesce(sum(amount_minor + tax_minor), 0) from money_invoice_line where invoice_id = '${INV}'`));
  const types = sql(`select string_agg(distinct data_type, ',') from information_schema.columns where table_name = 'money_invoice_line' and column_name in ('amount_minor', 'tax_minor', 'unit_amount_minor')`);
  ok("R1.56 W6: totals in integer cents: subtotal, tax and total are whole cents, the columns are integers, and the total is the sum of its lines",
    v.status === 200 && whole(v.body?.taxMinor) && whole(v.body?.totalMinor) && v.body?.totalMinor === sumLines && /^(bigint|integer)(,(bigint|integer))*$/.test(types), { taxMinor: v.body?.taxMinor, totalMinor: v.body?.totalMinor, sumLines, types });

  // ------------------------------------------------------------------------------------ W7: issued, PDF
  const w7 = await api(TA, "POST", `/front-office/money/invoices/${INV}/issue`, {});
  ok("R1.56 W7 (part missing: FO-7b part 1b, #2953): the invoice issues with an INV- number and a due date; one audit line 'invoice.issued'",
    w7.status === 200 && /^INV-/.test(String(w7.body?.number ?? "")) && !!w7.body?.dueDate && sql(`select count(*) from audit_event where action = 'invoice.issued' and entity_key = '${INV}'`) === "1", { status: w7.status, body: w7.body?.detail ?? w7.body });
  const frozen = refusedWrite(`update money_invoice_line set tax_minor = tax_minor + 1 where invoice_id = '${INV}' and kind = 'FEE'`);
  ok("R1.56 W7 (part missing: FO-7b part 1b, #2953): once issued, the tax on its lines is frozen (the database refuses a change)", w7.status === 200 && frozen, { issued: w7.status });
  const pdf = await fetch(`${BASE}/api/front-office/money/invoices/${INV}/pdf`, { headers: { authorization: `Bearer ${TA}` } });
  ok("R1.56 W7 (part missing: FO-7b part 1b, #2953): the invoice PDF opens (application/pdf)", pdf.status === 200 && /pdf/.test(pdf.headers.get("content-type") ?? ""), { status: pdf.status, type: pdf.headers.get("content-type") });

  // ------------------------------------------------------------------------------------------- W8: roles
  const anon = await api(null, "GET", `/front-office/money/invoices/${INV}`), other = await api(TB, "GET", `/front-office/money/invoices/${INV}`), otherTax = await api(TB, "GET", `/front-office/money/tax-default?partyKind=PERSON&partyId=${PA}`);
  ok("R1.56 W8 fail: no session gets 401; firm B gets 404 on firm A's invoice and on its client's tax default", anon.status === 401 && other.status === 404 && otherTax.status === 404, [anon.status, other.status, otherTax.status]);

  // ----------------------------------------------------------------------- W9: by screens, to R1.57's first step
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await ctx.route(/stripe\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`${BASE}/account`);
    await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(emailA); await p.getByRole("button", { name: "Sign in" }).click();
    await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    await p.goto(`${BASE}/money/invoices`); await p.waitForLoadState("networkidle").catch(() => undefined);
    const words = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    const num = String(w7.body?.number ?? "");   // empty when the invoice did not issue: the step cannot pass on "INV-" alone
    await p.screenshot({ path: join(SHOTS, "w9-money-invoices-1440.png"), fullPage: true });
    ok("R1.56 W9 (parts missing: FO-7s1 the invoice screens, FO-7q the invoice reads): Money › Invoices lists the issued invoice with its number and its tax",
      /^INV-\d/.test(num) && words.includes(num) && /\bHST\b/.test(words) && (await p.locator("[data-invoice]").count()) >= 1, words.slice(0, 200));
    ok("R1.56 W9: the walk ends at R1.57's first step: the invoice offers the client a card payment link (parts missing: FO-7c, FO-7s1)",
      (await p.getByRole("button", { name: /pay(ment)? link|card/i }).count()) >= 1);
    await ctx.close();
  } finally { await browser.close(); }
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);

/** A direct write the database itself must refuse (the guard under the route). */
function refusedWrite(q: string): boolean { try { rawSql(q); return false; } catch { return true; } }
