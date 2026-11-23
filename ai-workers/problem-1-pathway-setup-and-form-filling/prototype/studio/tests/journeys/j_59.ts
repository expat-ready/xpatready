// J-59 (map row 59, R1.59: money arithmetic in integer cents with currency, tax rounded per line by one stated rule,
// mixed currencies refused; brief design/build-lead-c-briefs/FO-7b-1a.md; QA-482; P-606, P-719): the join-and-walk row,
// merged with FO-7b part 1a. A firm's staff member drafts invoices on an isolated copy (its own database and port, never
// :4400), through the API: the invoice has no screen yet, so every step is an API step, and each figure is read back
// from money_invoice_line.
//   W1 a draft in CAD for the firm's client;
//   W2 AG-06's example: 850.00 FEE at 13 % → tax 110.50, total 960.50;
//   W3 two 0.50 lines at 13 % → 0.06 + 0.06 = 0.12 (per line, half to even, then summed);
//   W4 a 255.00 GOVERNMENT_FEE line beside 1,000.00 FEE at 13 % → 130.00 tax (the government fee untaxed);
//   W5 a USD line on the CAD draft → 422 in plain words, and nothing saved;
//   DW firm B gets 404 on firm A's draft; a client-sent taxMinor is ignored.
//   Each with its stand-in that must fail (or the planted wrong figure the step would catch). The 13 % rate is Ontario's
//   HST as CRA states it, used here as Sample (not cited in this file, P-701). US$0, no model call; live AI off.
//   Run from prototype/:
//   zsh studio/tools/isolated.sh j59 4459 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j59 4459 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_59.ts j59 4459
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j59", Number(process.argv[3] ?? 4459)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
/** A direct write the database itself must refuse (the guard under the route; written as the owner, so no wall hides it). */
const refused = (q: string, re: RegExp) => { try { rawSql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  // The firm's payment settings (FO-7ts's own route is not on main yet) and one client, written as seed lines.
  // FO-7g part 1w (Lead B ruling A, 22 Nov): a line's rate is the firm's tax default, so both firms are registered for tax;
  // the sample firms are in Ontario (samples/firms.json), whose cited default is the 13 % these steps use.
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:J-59', now()) on conflict (firm_id) do nothing`);
  for (const f of [A, B]) sql(`update money_payment_settings set tax_registered = true, tax_number = coalesce(tax_number, '123456789RT0001') where firm_id = '${f}'`);
  const PA = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Ana${run}', 'Sample', 'j59.${run}@example.org', 'seed:J-59', now()) returning id`);
  ok("J-59 setup: both Sample firms, their front office, payment settings with \"Prices include tax\" off, and one client of firm A", !!A && !!B && fo.failed.length === 0 && !!PA
    && sql(`select count(*) from money_payment_settings where firm_id in ('${A}', '${B}') and not prices_include_tax`) === "2", fo.failed);
  const staff = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const signIn = async (firmKey: string, email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  const TA = await signIn("sample-firm", staff("user-R")), TB = await signIn("sample-solo", staff("user-S"));
  const lines = (id: string) => sql(`select coalesce(string_agg(kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor || ':' || currency, ',' order by position), '') from money_invoice_line where invoice_id = '${id}'`);
  const draft = () => api(TA, "POST", "/front-office/money/invoices", { personId: PA, currency: "CAD" });
  const add = (id: string, body: Record<string, unknown>, t = TA) => api(t, "POST", `/front-office/money/invoices/${id}/lines`, body);
  const fee = (unitMinor: number, extra: Record<string, unknown> = {}) => ({ kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 130000, ...extra });

  // ------------------------------------------------------------------------------------------------ W1: a draft
  const w1 = await draft();
  ok("J-59 W1 pass (API step: the invoice has no screen yet): a draft in CAD for the firm's client, no number, with one audit line by the staff member",
    w1.status === 201 && w1.body?.status === "DRAFT" && w1.body?.currency === "CAD" && w1.body?.number === null && sql(`select count(*) from audit_event where action = 'invoice.draft_created' and entity_key = '${w1.body?.id}' and actor like 'staff:%'`) === "1", w1.body);
  const drafts = () => sql(`select count(*) from money_invoice where firm_id = '${A}'`), d0 = drafts();
  const w1b = await api(TA, "POST", "/front-office/money/invoices", { personId: PA, currency: "EUR" });
  ok("J-59 W1 fail (stand-in): a draft in a currency the firm can't hold (EUR) → 422 at currency, nothing saved", w1b.status === 422 && w1b.body?.errors?.[0]?.field === "currency" && drafts() === d0, w1b.body);

  // ------------------------------------------------------------------------------------------- W2: AG-06's example
  const w2 = await add(w1.body.id, fee(85000));
  const g2 = await api(TA, "GET", `/front-office/money/invoices/${w1.body.id}`);
  ok("J-59 W2 pass (API step): 850.00 FEE at 13 % → tax 110.50 and total 960.50, stored and read back", w2.status === 201 && lines(w1.body.id) === "FEE:85000:130000:11050:CAD" && g2.body?.taxMinor === 11050 && g2.body?.totalMinor === 96050, g2.body);
  const line2 = (kind: string, unit: number, ppm: number, tax: number) => `insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency, tax_rate_ppm, tax_minor) values ('${A}', '${w1.body.id}', 99, '${kind}', 'Planted (Sample)', 1, ${unit}, ${unit}, 'CAD', ${ppm}, ${tax})`;
  ok("J-59 W2 fail (planted): a writer that skips the route and stores 110.52 tax on the same line is refused by the database (more than a cent off), nothing saved",
    refused(line2("FEE", 85000, 130000, 11052), /money_invoice_line_tax_check/) && lines(w1.body.id) === "FEE:85000:130000:11050:CAD");

  // ------------------------------------------------------------------------------- W3: per line, half to even, summed
  const w3 = await draft(); await add(w3.body.id, fee(50)); const w3b = await add(w3.body.id, fee(50));
  ok("J-59 W3 pass (API step): two 0.50 lines at 13 % → 0.06 + 0.06 = 0.12 tax, total 1.12", lines(w3.body.id) === "FEE:50:130000:6:CAD,FEE:50:130000:6:CAD" && w3b.body?.taxMinor === 12 && w3b.body?.totalMinor === 112, w3b.body);
  const w3s = await draft(), sub = await add(w3s.body.id, fee(100));
  ok("J-59 W3 fail (stand-in): tax on the subtotal, as the route taxes one 1.00 line at 13 %, is 0.13, not the 0.12 of two lines taxed one by one", sub.status === 201 && sub.body?.taxMinor === 13 && w3b.body?.taxMinor !== sub.body?.taxMinor, sub.body);

  // ----------------------------------------------------------------------------------------- W4: a government fee
  const w4 = await draft(); await add(w4.body.id, { kind: "GOVERNMENT_FEE", description: "Government processing fee (Sample)", unitMinor: 25500 }); const w4b = await add(w4.body.id, fee(100000));
  ok("J-59 W4 pass (API step): a 255.00 GOVERNMENT_FEE beside 1,000.00 FEE at 13 % → 130.00 tax, total 1,385.00", lines(w4.body.id) === "GOVERNMENT_FEE:25500:0:0:CAD,FEE:100000:130000:13000:CAD" && w4b.body?.taxMinor === 13000 && w4b.body?.totalMinor === 138500, w4b.body);
  ok("J-59 W4 fail (planted): a government-fee line written with 13 % tax (33.15) is refused by the database, nothing saved",
    refused(line2("GOVERNMENT_FEE", 25500, 130000, 3315), /money_invoice_line_government_fee_untaxed/) && lines(w1.body.id) === "FEE:85000:130000:11050:CAD");

  // --------------------------------------------------------------------------------------- W5: another currency
  const n5 = lines(w1.body.id), w5 = await add(w1.body.id, fee(10000, { currency: "USD" }));
  ok("J-59 W5 pass (API step): a USD line on the CAD draft → 422 \"This invoice is in CAD; a line in USD can't be added. Nothing was saved.\", and nothing saved",
    w5.status === 422 && w5.body?.detail === "This invoice is in CAD; a line in USD can't be added. Nothing was saved." && lines(w1.body.id) === n5, w5.body);
  ok("J-59 W5 fail (stand-in): the same line in CAD is added", (await add(w1.body.id, fee(10000, { currency: "CAD" }))).status === 201);

  // --------------------------------------------------------------------------------------------------- the DW line
  const bRead = await api(TB, "GET", `/front-office/money/invoices/${w1.body.id}`), bAdd = await add(w1.body.id, fee(100), TB), aRead = await api(TA, "GET", `/front-office/money/invoices/${w1.body.id}`);
  ok("J-59 DW pass: firm B gets 404 on firm A's draft (read and add a line)", bRead.status === 404 && bAdd.status === 404, [bRead.status, bAdd.status]);
  ok("J-59 DW fail (stand-in): firm A's own read is 200", aRead.status === 200 && aRead.body?.id === w1.body.id, aRead.status);
  const dw = await draft(), sent = await add(dw.body.id, fee(85000, { taxMinor: 1 }));
  ok("J-59 DW pass: a client-sent taxMinor (0.01) is ignored: the stored tax is 110.50", sent.status === 201 && lines(dw.body.id) === "FEE:85000:130000:11050:CAD", sent.body);
  const strict = await add(dw.body.id, fee(100, { totalMinor: 1 }));
  ok("J-59 DW fail (stand-in): only the server's own figures are ignored; any other field (totalMinor) → 422 and nothing saved", strict.status === 422 && lines(dw.body.id) === "FEE:85000:130000:11050:CAD", strict.body);
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
