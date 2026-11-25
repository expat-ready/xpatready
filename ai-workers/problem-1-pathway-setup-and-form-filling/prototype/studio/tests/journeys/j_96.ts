// J-96 (map row 96, R1.96: reversals, refunds, credit notes, payment plans, write-offs; design/briefs/R1.96-shape.md;
// parts #3631 (write-offs and the ledger check) and #3721 (payment plans, ledger only); P-606, P-719). A firm's Owner
// corrects money on an isolated copy (its own database and port, never :4400), through the API: the corrections and plan
// screens are FO-7s4's, not built, so every step is an API step, and each figure is read back from the money_* rows.
// Done when (CAPABILITIES R1.96): "A refund or credit note never exceeds what was paid; instalments sum exactly to the
// invoice; a write-off needs a reason and the key; the ledger stays balanced each time". The credit-note cap reads as
// "never exceeds what is left on the invoice" (AG-6-48; Lead 4's shape approval on #3631).
//   W1 a reversal: a trust deposit recorded by mistake is reversed through its preview, and the money returns;
//   W2 a refund never exceeds what was paid: 400.01 on a 400.00 payment refused, 150.00 refunded, then 250.01 refused;
//   W3 a credit note never exceeds what is left: 300.01 on a 300.00 invoice refused, 100.00 credited, then 200.01 refused;
//   W4 a write-off needs a reason and the key: no reason → 422, a Case Officer without agent/invoice:void → 403, the Owner
//      with a reason → Written off; a credit note afterwards → "Already settled by write-off";
//   W5 instalments sum exactly: 1 cent short → 409 naming the difference, exact → a plan; a payment settles instalment 1;
//      underneath, the database refuses a short plan written past the route;
//   W6 roles: firm B gets 404 on firm A's invoice; no session 401.
//   After every write, the ledger check (api/src/client-money/ledger-check.ts, L1-L6) is balanced for the firm;
//   W7 an unbalanced ledger stops the write: a planted L1 imbalance is named, and a write-off and a plan (the two writes
//      that run the check inside their transaction) are each rolled back with 409 UNBALANCED.
// Sample amounts and names (a run tag in every name, key and reference); US$0, no model call, no Stripe call, no live mail.
// Legal and accounting readings: Unconfirmed: no counsel; no accountant. Run from prototype/:
//   zsh studio/tools/isolated.sh j96 4496 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j96 4496 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_96.ts j96 4496
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { ledgerCheck } from "../../api/src/client-money/ledger-check.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
import { moneyVisible } from "../lib/money-visible.ts";

const [NAME, PORT] = [process.argv[2] ?? "j96", Number(process.argv[3] ?? 4496)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n").map((l) => l.trim()).find((l) => l && !/^(BEGIN|COMMIT|ROLLBACK|INSERT \d+ \d+|UPDATE \d+|DELETE \d+)$/.test(l)) ?? "";
/** A direct write the database itself must refuse (the guard under the route; written as the owner, so no wall hides it). */
const refused = (q: string, re: RegExp) => { try { rawSql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const M = "/front-office/money";
let keyN = 0; const key = () => `j96-${run}-${++keyN}`;

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  // Payment settings with a trust details block (Getting paid is FO-7s1, not on main: written as seed lines, as J-58 does).
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:J-96', now()) on conflict (firm_id) do nothing`);
  sql(`update money_payment_settings set trust_details = 'Trust account (Sample): transit 00011, institution 001, account 1234567' where firm_id = '${A}'`);
  const person = (tag: string) => moneyVisible(sql, A, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${tag}${run}', 'Sample', 'j96.${tag.toLowerCase()}.${run}@example.org', 'seed:J-96', now()) returning id`));
  const PA = person("Ana"), PB = person("Ben"), PC = person("Cleo");
  const staff = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const signIn = async (firmKey: string, email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  // user-R: firm A's Owner (every money key). user-O: a Case Officer, who reads invoices but holds no agent/invoice:void.
  sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/invoice:show') on conflict do nothing;
       delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:void'`);
  const TA = await signIn("sample-firm", staff("user-R")), TO = await signIn("sample-firm", staff("user-O")), TB = await signIn("sample-solo", staff("user-S"));
  const trust = await api(TA, "PUT", `${M}/trust/answer`, { answer: "YES" });
  ok("J-96 setup: both Sample firms, firm A's payment settings with trust on, three clients of firm A, the Owner, a Case Officer and firm B's Owner signed in",
    !!A && !!B && fo.failed.length === 0 && !!PA && !!PB && !!PC && trust.status < 300, [fo.failed, trust.body]);
  const today = new Date().toISOString().slice(0, 10), addDays = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const issued = async (personId: string, unitMinor: number) => {
    const d = await api(TA, "POST", `${M}/invoices`, { personId, currency: "CAD" });
    await api(TA, "POST", `${M}/invoices/${d.body?.id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 0 });
    const i = await api(TA, "POST", `${M}/invoices/${d.body?.id}/issue`);
    if (i.status !== 200) throw new Error(`issue: ${JSON.stringify(i.body)}`);
    return d.body.id as string;
  };
  const pay = async (inv: string, amountMinor: number) => {
    const r = await api(TA, "POST", `${M}/invoices/${inv}/payments`, { method: "E_TRANSFER", amountMinor, receivedOn: today, reference: `ET-${run}-${++keyN}`, idempotencyKey: key() });
    if (r.status !== 201) throw new Error(`pay: ${JSON.stringify(r.body)}`); return (r.body.id ?? r.body.paymentId) as string;
  };
  const balanced = async (after: string) => { const c = await ledgerCheck(db, A); ok(`J-96 ledger balanced after ${after} (L1-L6, firm A)`, c.balanced, c.problems); };

  // ------------------------------------------------------------------------------------------ W1: a reversal
  const dep = await api(TA, "POST", `${M}/trust/deposits`, { personId: PA, method: "E_TRANSFER", amountMinor: 20000, currency: "CAD", reference: `DEP-${run}`, idempotencyKey: key() });
  const pid = dep.body?.paymentId as string, pre = await api(TA, "GET", `${M}/payments/${pid}/reverse-preview`);
  const bad = await api(TA, "POST", `${M}/payments/${pid}/reverse`, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: pre.body?.hash });
  const balanceOf = (party: string) => Number(sql(`select coalesce((select balance_after_minor from money_trust_entry where person_id = '${party}' and currency = 'CAD' order by seq desc limit 1), 0)`));
  ok("J-96 W1 pass (API step): a 200.00 trust deposit recorded by mistake is reversed through its preview: 200.00 out, the balance back to 0.00, one correction naming the deposit",
    dep.status === 201 && pre.status === 200 && pre.body?.reverseMinor === 20000 && bad.status === 201 && balanceOf(PA) === 0
      && sql(`select count(*) from money_trust_entry where person_id = '${PA}' and kind = 'CORRECTION'`) === "1", [dep.body, pre.body, bad.body]);
  const again = await api(TA, "POST", `${M}/payments/${pid}/reverse`, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: pre.body?.hash });
  ok("J-96 W1 fail: the same reversal a second time → 409, still one correction", again.status === 409 && sql(`select count(*) from money_trust_entry where person_id = '${PA}' and kind = 'CORRECTION'`) === "1", again.body);
  await balanced("a reversal");

  // ------------------------------------------------------------------------------------------ W2: a refund never exceeds what was paid
  const i2 = await issued(PB, 40000), p2 = await pay(i2, 40000);
  const refund = (amountMinor: number) => api(TA, "POST", `${M}/payments/${p2}/refunds`, { amountMinor, method: "E_TRANSFER", reason: "Refund (Sample)", idempotencyKey: key() });
  const refunded = () => Number(sql(`select coalesce(sum(amount_minor), 0) from money_refund where payment_id = '${p2}'`));
  const r2a = await refund(40001);
  ok("J-96 W2 fail: a refund of 400.01 on a 400.00 payment → 409 OVER_REFUND \"Only CAD 400.00 of this payment is left to refund\"; nothing refunded", r2a.status === 409 && r2a.body?.code === "OVER_REFUND" && /Only CAD 400\.00 of this payment is left to refund/.test(String(r2a.body?.detail)) && refunded() === 0, r2a.body);
  const r2b = await refund(15000);
  ok("J-96 W2 pass (API step): 150.00 of the 400.00 is refunded", r2b.status === 201 && refunded() === 15000, r2b.body);
  const r2c = await refund(25001);
  ok("J-96 W2 fail: then 250.01 (past the 250.00 left) → 409 OVER_REFUND \"Only CAD 250.00 …\"; refunds stay 150.00", r2c.status === 409 && r2c.body?.code === "OVER_REFUND" && r2c.body?.leftMinor === 25000 && refunded() === 15000, r2c.body);
  await balanced("refunds");

  // ------------------------------------------------------------------------------------------ W3: a credit note never exceeds what is left
  const i3 = await issued(PB, 30000), credited = () => Number(sql(`select coalesce(sum(amount_minor), 0) from money_credit_note where invoice_id = '${i3}'`));
  const c3a = await api(TA, "POST", `${M}/invoices/${i3}/credit-notes`, { amountMinor: 30001, reason: "Over (Sample)" });
  ok("J-96 W3 fail: a credit note of 300.01 on a 300.00 invoice → 409 OVER_CREDIT; nothing credited", c3a.status === 409 && c3a.body?.code === "OVER_CREDIT" && credited() === 0, c3a.body);
  const c3b = await api(TA, "POST", `${M}/invoices/${i3}/credit-notes`, { amountMinor: 10000, reason: "Fee reduced (Sample)" });
  ok("J-96 W3 pass (API step): a credit note of 100.00 with a reason; 200.00 is still due", c3b.status === 201 && credited() === 10000 && c3b.body?.invoice?.dueMinor === 20000, c3b.body);
  const c3c = await api(TA, "POST", `${M}/invoices/${i3}/credit-notes`, { amountMinor: 20001, reason: "Past what is left (Sample)" });
  ok("J-96 W3 fail: after it, a credit note of 200.01 (past the 200.00 left, though under the 300.00 total) → 409 OVER_CREDIT naming 200.00 left; still 100.00 credited",
    c3c.status === 409 && c3c.body?.code === "OVER_CREDIT" && c3c.body?.leftMinor === 20000 && credited() === 10000, c3c.body);
  await balanced("a credit note");

  // ------------------------------------------------------------------------------------------ W4: a write-off needs a reason and the key
  const writeOff = (t: string | null, body: unknown) => api(t, "POST", `${M}/invoices/${i3}/write-off`, body);
  const offs = () => sql(`select count(*) from money_write_off where invoice_id = '${i3}'`);
  const w4a = await writeOff(TA, {}), w4b = await writeOff(TO, { reason: "Small balance (Sample)" });
  ok("J-96 W4 fail: no reason → 422 naming the reason; a Case Officer without agent/invoice:void → 403; nothing written",
    w4a.status === 422 && Boolean(w4a.body?.fields?.reason) && w4b.status === 403 && offs() === "0", [w4a.body, w4b.status]);
  const w4c = await writeOff(TA, { reason: "Small balance (Sample)" });
  ok("J-96 W4 pass (API step): the Owner writes off the 200.00 still due with a reason → Written off, nothing due, one audit line and one event",
    w4c.status === 201 && w4c.body?.amountMinor === 20000 && w4c.body?.invoice?.statusWord === "Written off" && w4c.body?.invoice?.dueMinor === 0 && offs() === "1"
      && sql(`select count(*) from audit_event where action = 'invoice.written_off' and entity_key = '${w4c.body?.id}'`) === "1"
      && sql(`select count(*) from module_event where type = 'invoice.written_off' and subject_id = '${i3}'`) === "1", w4c.body);
  const w4d = await api(TA, "POST", `${M}/invoices/${i3}/credit-notes`, { amountMinor: 1000, reason: "After (Sample)" });
  ok("J-96 W4 fail: a credit note after the write-off → 409 \"Already settled by write-off\"", w4d.status === 409 && /Already settled by write-off/.test(String(w4d.body?.detail)) && credited() === 10000, w4d.body);
  await balanced("a write-off");

  // ------------------------------------------------------------------------------------------ W5: instalments sum exactly to the invoice
  const i5 = await issued(PC, 90000), plans = () => sql(`select count(*) from money_payment_plan where invoice_id = '${i5}'`);
  const three = (c: number) => [{ dueDate: today, amountMinor: 30000 }, { dueDate: addDays(30), amountMinor: 30000 }, { dueDate: addDays(60), amountMinor: c }];
  const w5a = await api(TA, "POST", `${M}/invoices/${i5}/plan`, { instalments: three(29999) });
  ok("J-96 W5 fail: three instalments 1 cent short of the 900.00 due → 409 SUM_MISMATCH naming 0.01 to add; no plan", w5a.status === 409 && w5a.body?.code === "SUM_MISMATCH" && w5a.body?.differenceMinor === 1 && plans() === "0", w5a.body);
  const w5b = await api(TA, "POST", `${M}/invoices/${i5}/plan`, { instalments: three(30000) });
  ok("J-96 W5 pass (API step): three instalments of 300.00 summing exactly to the 900.00 due → a plan covering 900.00",
    w5b.status === 201 && w5b.body?.amountMinor === 90000 && w5b.body?.instalments?.length === 3 && plans() === "1"
      && sql(`select sum(i.amount_minor) from money_instalment i join money_payment_plan p on p.id = i.plan_id where p.invoice_id = '${i5}'`) === "90000", w5b.body);
  await pay(i5, 30000);
  const w5c = await api(TA, "GET", `${M}/invoices/${i5}/plan`);
  ok("J-96 W5 pass (API step): a 300.00 payment settles instalment 1; 2 and 3 are still due", w5c.status === 200 && w5c.body?.instalments?.map((x: { status: string }) => x.status).join() === "Settled,Due,Due", w5c.body);
  const i5b = await issued(PC, 20000);
  ok("J-96 W5 fail (underneath): a plan written past the route whose instalments sum 1 cent short is refused by the database at commit",
    refused(`begin; with p as (insert into money_payment_plan (firm_id, invoice_id, currency, created_by) values ('${A}', '${i5b}', 'CAD', 'seed:J-96') returning id, firm_id)
      insert into money_instalment (firm_id, plan_id, position, due_date, amount_minor, currency) select firm_id, id, n, current_date + n, case when n = 1 then 10000 else 9999 end, 'CAD' from p, generate_series(1, 2) n; commit;`, /add up to 19999 but the plan covers 20000/)
      && sql(`select count(*) from money_payment_plan where invoice_id = '${i5b}'`) === "0");
  await balanced("a plan and a payment under it");

  // ------------------------------------------------------------------------------------------ W6: roles
  const b6 = [await api(TB, "POST", `${M}/invoices/${i5}/write-off`, { reason: "Other firm (Sample)" }), await api(TB, "GET", `${M}/invoices/${i5}/plan`), await api(TB, "POST", `${M}/payments/${p2}/refunds`, { amountMinor: 100, method: "E_TRANSFER", reason: "Other firm (Sample)", idempotencyKey: key() })];
  const n6 = [await api(null, "POST", `${M}/invoices/${i5}/write-off`, { reason: "No session (Sample)" }), await api(null, "GET", `${M}/invoices/${i5}/plan`)];
  ok("J-96 W6 fail: firm B gets 404 on firm A's write-off, plan and refund; no session gets 401; nothing written",
    b6.every((r) => r.status === 404) && n6.every((r) => r.status === 401) && sql(`select count(*) from money_write_off where invoice_id = '${i5}'`) === "0" && refunded() === 15000, [...b6, ...n6].map((r) => r.status));
  const own = await api(TA, "GET", `${M}/invoices/${i5}/plan`);
  ok("J-96 W6 pass (stand-in): firm A's own Owner reads the plan", own.status === 200 && own.body?.invoiceId === i5, own.status);
  await balanced("the whole journey");

  // ------------------------------------------------------------------------------------------ W7: an unbalanced ledger stops the write
  // A trust entry whose balance is not the running sum of its party's entries (written past the database's triggers, as
  // pack WO10 does) stands for a ledger gone wrong; the check must name it (L1), and the write-off and the plan, which
  // run the check inside their own transaction, must each be rolled back with nothing written.
  const PZ = person("Zed"), i7 = await issued(PZ, 30000), p7 = await pay(i7, 10000);
  sql(`set session_replication_role = replica; insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, payment_id, created_by) values ('${A}', '${PZ}', 'DEPOSIT', 500, 'CAD', 1, 700, '${p7}', 'seed:J-96')`);
  const broken = await ledgerCheck(db, A, i7);
  ok("J-96 W7 fail (stand-in): the check names the planted imbalance (L1) on that client's invoice", !broken.balanced && broken.problems.some((x) => x.startsWith("L1 ")), broken.problems);
  const before7 = () => sql(`select (select count(*) from money_write_off where invoice_id = '${i7}') || ':' || (select count(*) from money_payment_plan where invoice_id = '${i7}') || ':' || (select count(*) from audit_event where entity_key in (select id::text from money_write_off where invoice_id = '${i7}'))`), b7s = before7();
  const w7a = await api(TA, "POST", `${M}/invoices/${i7}/write-off`, { reason: "On a broken ledger (Sample)" });
  const w7b = await api(TA, "POST", `${M}/invoices/${i7}/plan`, { instalments: [{ dueDate: addDays(1), amountMinor: 10000 }, { dueDate: addDays(2), amountMinor: 10000 }] });
  ok("J-96 W7 fail: on that unbalanced ledger a write-off and a plan each get 409 UNBALANCED naming L1, and nothing is written",
    w7a.status === 409 && w7a.body?.code === "UNBALANCED" && w7a.body?.problems?.some((x: string) => x.startsWith("L1 "))
      && w7b.status === 409 && w7b.body?.code === "UNBALANCED" && w7b.body?.problems?.some((x: string) => x.startsWith("L1 ")) && before7() === b7s && b7s === "0:0:0", [w7a.body, w7b.body, b7s]);
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
