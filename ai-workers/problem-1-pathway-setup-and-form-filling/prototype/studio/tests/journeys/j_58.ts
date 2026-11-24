// J-58 (map row 58, R1.58: trust or operating on every payment; per-client ledger; "to move" list): the join-and-walk for
// the row, written by the qa lane (22 Nov) BEFORE its parts merge, so qa only runs it when they do. Parts (MVP-CHECKLIST
// row 58): FO-7a (+ FO-7a2, FO-7mv, FO-7lk, FO-7ts parts 1-2: the money_* tables and their trust checks, on main),
// FO-7ts part 3 (refund details and the same-case pick; open PR #2368), FO-7t (the trust routes: answer, deposits,
// Pay from trust, refunds, To move; part 1 (answer, deposits, ledger, balances) merged as #3033, parts 2-3 not built), FO-7s3a, FO-7s3b (the screens), FO-7m (the monthly check). The walk also
// needs parts the checklist row does not list (noted in the qa report): FO-7b's offline payment route and issue step
// (part 1b, #2953), FO-7v (the reversal route), a move-to-case route (ruled into "a new FO-7t part", unnamed) and a read
// and screen of the shortfall list (no row names one; FO-7a2 built the view money_trust_shortfall only).
// Done when (CAPABILITIES R1.58): "Every payment is trust or operating (the database refuses neither); a client's trust
// balance never goes below zero through a payment out, a transfer or a move (fail case); a reversal of a payment recorded
// by hand is always accepted and may take it below zero, and the party then shows red on the shortfall list (P-634,
// P-653 (2)); earned trust money is on "to move" until moved. Unconfirmed: no counsel".
//   W0 (trust on): the firm's Owner answers the trust question Yes through the API.
//   W1 (every payment is trust or operating): a trust deposit and an operating payment are recorded through the API and
//       the database keeps TRUST and OPERATING on them; underneath, the database accepts both and refuses a payment with
//       neither or anything else.
//   W2 (never below zero through a payment out, fail case): Pay from trust and a refund of more than the client holds
//       are refused in words ("Only CAD … is available") and nothing is written; underneath, the database refuses it too.
//   W3 (never below zero through a transfer, fail case): moving more pre-case money to a case than the client holds is
//       refused, a move within it nets to zero; another payer's money on the same case pays an invoice only up to what
//       that payer holds there (the pick, #2368).
//   W4 (earned money is on "to move" until moved; never below zero through a move, fail case): money applied to an
//       issued invoice is listed on To move; a batch of more than is open is refused (409 MOVE_REFUSED), the exact batch
//       takes it off the list, and the trust balance does not move.
//   W5 (a reversal of a hand-recorded payment, below zero, red on the shortfall list): a cheque deposited by hand, its
//       money refunded, then reversed as Returned through the API: accepted, the balance goes below zero, the shortfall
//       list names the client, and the trust screen shows them in red.
//   W6 (roles): firm A's ledger reads for firm A; firm B gets 404 and no session 401.
// Fails on main today (P-606) only on the steps whose parts are not merged; each failing label names the part. Where a
// part a later step needs is missing, its data is written by SQL instead (a stand-in, printed as "note: stand-in"), so
// each step is scored on its own part. Route names not yet in any brief are this journey's guesses (marked "guessed").
// Sample data only (a run tag in every name, key and reference); US$0, no model call, no Stripe call, no live mail.
// Legal readings Unconfirmed: no counsel. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j58 4458 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j58 4458 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_58.ts j58 4458
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j58", Number(process.argv[3] ?? 4458)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
/** The first value a query answers (psql's command tags, printed for multi-statement input, are skipped). */
const sql = (q: string) => rawSql(q).split("\n").map((l) => l.trim()).find((l) => l && !/^(BEGIN|COMMIT|ROLLBACK|INSERT \d+ \d+|UPDATE \d+|DELETE \d+)$/.test(l)) ?? "";
const run = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: unknown = null; try { b = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: b, text };
};
const M = "/front-office/money";
const words = (a: Ans) => JSON.stringify(a.body ?? a.text);
const refusedWords = (a: Ans, re: RegExp) => [400, 409, 422].includes(a.status) && re.test(words(a));
/** A direct write the database itself must refuse, with these words. */
const refusedWrite = (q: string, re: RegExp) => { try { rawSql(q); return false; } catch (e) { const err = String((e as { stderr?: string }).stderr ?? e); if (!re.test(err)) console.log(`      (refused otherwise: ${err.split("\n").find((l) => /ERROR/.test(l)) ?? err.slice(0, 160)})`); return re.test(err); } };
const note = (s: string) => console.log(`  note: stand-in: ${s}`);
let keyN = 0; const key = () => `j58-${run}-${++keyN}`;

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  // The firms, firm A's payment settings with its trust details block (Getting paid is FO-7s1, not on main: written by
  // SQL as j_56 does), and four clients of firm A (people are written by SQL; R1.10's walk adds them by screen).
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:J-58', now()) on conflict (firm_id) do nothing`);
  sql(`update money_payment_settings set trust_details = 'Trust account (Sample): transit 00011, institution 001, account 1234567' where firm_id = '${A}'`);
  const person = (tag: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client${tag}${run}', 'Sample', 'j58.${tag.toLowerCase()}.${run}@example.org', 'seed:J-58', now()) returning id`);
  const PA = person("A"), PB = person("B"), PC = person("C"), PR = person("R");
  const staff = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const signIn = async (firmKey: string, email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  const emailA = staff("user-R"), TA = await signIn("sample-firm", emailA), TB = await signIn("sample-solo", staff("user-S"));
  // C5 (#3305 M1, CS-MV1): the money routes see a party only as a prospect's subject or a visible case's client, so each
  // Sample client is the subject of a won prospect owned by firm A's Owner (as j_56 seeds its client; Sample).
  const staffA = sql(`select id from platform_staff where actor_id = 'user-R'`);
  for (const pid of [PA, PB, PC, PR]) {
    sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${staffA}', 'ENGAGED', now(), 'seed:J-58', 'seed:J-58', now())`);
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, won_via, won_at, created_by, updated_at)
      select gen_random_uuid(), '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'RETAINER_SIGNED'), '${pid}', '${pid}', '${staffA}', 'E_SIGNED', now(), 'seed:J-58', now() from fo_lead l where l.person_id = '${pid}'`);
  }
  ok("J-58 setup: both Sample firms with payment settings, firm A's Owner and firm B's Owner signed in, four Sample clients of firm A", !!A && !!B && fo.failed.length === 0 && !!PA && !!PB && !!PC && !!PR && !!TA && !!TB);

  // database helpers (reads; and the stand-ins' writes, used only when a route is missing)
  const hasCol = (t: string, c: string) => sql(`select count(*) from information_schema.columns where table_schema = current_schema() and table_name = '${t}' and column_name = '${c}'`) === "1";
  const refundCols = hasCol("money_trust_entry", "refund_method");
  const balance = (pid: string) => Number(sql(`select coalesce((select balance_after_minor from money_trust_entry where firm_id = '${A}' and person_id = '${pid}' and currency = 'CAD' order by seq desc limit 1), 0)`));
  const entries = (pid: string) => Number(sql(`select count(*) from money_trust_entry where firm_id = '${A}' and person_id = '${pid}'`));
  const entryQ = (kind: string, amount: number, pid: string, x: { inv?: string; pay?: string; corrects?: string; ck?: string; reason?: string; kase?: string; from?: string; id?: string } = {}) =>
    `insert into money_trust_entry (id, firm_id, person_id, kind, amount_minor, currency, payment_id, invoice_id, corrects_entry_id, correction_kind, reason, case_id, moved_from_entry_id, created_by${kind === "REFUND_TO_CLIENT" && refundCols ? ", refund_method, refunded_on, refund_reference" : ""}) values ('${x.id ?? randomUUID()}', '${A}', '${pid}', '${kind}', ${amount}, 'CAD', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.corrects ? `'${x.corrects}'` : "null"}, ${x.ck ? `'${x.ck}'` : "null"}, ${x.reason ? `'${x.reason}'` : "null"}, ${x.kase ? `'${x.kase}'` : "null"}, ${x.from ? `'${x.from}'` : "null"}, 'seed:J-58'${kind === "REFUND_TO_CLIENT" && refundCols ? `, 'E_TRANSFER', current_date, 'J58-${run}-R${++keyN}'` : ""}) returning id`;
  const sqlDeposit = (pid: string, amount: number, method = "E_TRANSFER", cleared = true) => { const p = randomUUID();
    rawSql(`begin; insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, reference, idempotency_key, recorded_by, cleared) values ('${p}', '${A}', '${method}', ${amount}, 'CAD', 'TRUST', now(), 'J58-${run}-${keyN}', '${key()}', 'seed:J-58', ${cleared}); ${entryQ("DEPOSIT", amount, pid, { pay: p })}; commit;`); return p; };
  /** A deposit through FO-7t part 1's route; the payment's id, and whether the route took it. */
  const deposit = async (pid: string, amount: number, method = "E_TRANSFER") => {
    const r = await api(TA, "POST", `${M}/trust/deposits`, { personId: pid, currency: "CAD", amountMinor: amount, method, reference: `J58-${run}-${keyN}`, idempotencyKey: key() });   // DepositIn (#3033) is strict; the server stamps the time received
    const id = String(r.body?.paymentId ?? r.body?.id ?? "");
    const viaApi = (r.status === 201 || r.status === 200) && !!id && sql(`select received_into from money_payment where id = '${id}' and firm_id = '${A}'`) === "TRUST";
    return { r, viaApi, id: viaApi ? id : (note(`deposit of ${amount} for a client written by SQL (POST ${M}/trust/deposits answered ${r.status})`), sqlDeposit(pid, amount, method, method !== "CHEQUE")) };
  };
  /** An issued invoice of `total` for the client: drafted through FO-7b part 1a's routes (on main), issued through part 1b's. */
  const issuedInvoice = async (pid: string, total: number, kase?: string) => {
    const d = await api(TA, "POST", `${M}/invoices`, { personId: pid, currency: "CAD" });
    let id = String(d.body?.id ?? "");
    if (id) await api(TA, "POST", `${M}/invoices/${id}/lines`, { kind: "GOVERNMENT_FEE", description: `Government processing fee (Sample ${run})`, unitMinor: total });
    if (!id || sql(`select coalesce(sum(amount_minor + tax_minor), 0) from money_invoice_line where invoice_id = '${id}'`) !== String(total)) {
      id = randomUUID(); note(`invoice drafted by SQL (draft route answered ${d.status})`);
      rawSql(`insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${id}', '${A}', '${pid}', 'CAD', current_date + 14, 'seed:J-58', now());
        insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${A}', '${id}', 1, 'GOVERNMENT_FEE', 'Government processing fee (Sample)', 1, ${total}, ${total}, 'CAD')`);
    }
    if (kase) rawSql(`update money_invoice set case_id = '${kase}' where id = '${id}'`);
    const iss = await api(TA, "POST", `${M}/invoices/${id}/issue`, {});
    if (!sql(`select issued_at is not null from money_invoice where id = '${id}'`).startsWith("t")) {
      note(`invoice issued by SQL (POST ${M}/invoices/:id/issue answered ${iss.status}; FO-7b part 1b, #2953)`);
      rawSql(`update money_invoice set issued_at = now(), issued_by = 'seed:J-58', due_date = coalesce(due_date, current_date + 14) where id = '${id}'`);
    }
    return id;
  };

  // ---------------------------------------------------------------------------------------------- W0: trust on
  const w0 = await api(TA, "PUT", `${M}/trust/answer`, { answer: "YES" });
  ok("R1.58 W0 (FO-7t part 1, #3033, on main: PUT /trust/answer): the firm's Owner answers the trust question Yes through the API; the database keeps YES with who and when",
    w0.status === 200 && sql(`select trust_answer || ':' || (trust_answered_by is not null) || ':' || (trust_answered_at is not null) from money_payment_settings where firm_id = '${A}'`) === "YES:true:true", { status: w0.status, body: w0.body?.detail ?? null });
  if (sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`) !== "YES") { note("trust answer YES written by SQL"); rawSql(`update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'seed:J-58', trust_answered_at = now() where firm_id = '${A}'`); }

  // ------------------------------------------------------------------------- W1: every payment is trust or operating
  const d1 = await deposit(PA, 100000);
  ok("R1.58 W1 (FO-7t part 1, #3033, on main: POST /trust/deposits): a trust deposit of CAD 1,000.00 recorded through the API is kept as received into TRUST with its DEPOSIT entry; the client's trust balance is 1,000.00",
    d1.viaApi && sql(`select count(*) from money_trust_entry where payment_id = '${d1.id}' and kind = 'DEPOSIT' and amount_minor = 100000`) === "1" && balance(PA) === 100000, { status: d1.r.status, detail: d1.r.body?.detail ?? null });
  const INV0 = await issuedInvoice(PC, 25000);
  const op = await api(TA, "POST", `${M}/invoices/${INV0}/payments`, { method: "CHEQUE", amountMinor: 25000, currency: "CAD", reference: `J58-${run}-OP`, idempotencyKey: key(), receivedInto: "OPERATING", receivedOn: new Date().toISOString().slice(0, 10) });   // the PaymentIn body (ports/client-money.ts)
  ok("R1.58 W1 (FO-7b's offline payment route, on main: POST /invoices/:id/payments with the PaymentIn body): a cheque on an issued invoice recorded through the API is kept as received into OPERATING, on that invoice, with no trust entry",
    (op.status === 201 || op.status === 200) && sql(`select string_agg(received_into::text, ',') from money_payment where firm_id = '${A}' and invoice_id = '${INV0}'`) === "OPERATING"
    && sql(`select count(*) from money_trust_entry e join money_payment p on p.id = e.payment_id where p.invoice_id = '${INV0}'`) === "0", { status: op.status, detail: op.body?.detail ?? null });
  // Underneath (the database's half of the clause): both destinations are accepted, nothing else is.
  const pT = randomUUID(), pO = randomUUID();
  let bothOk = false;
  try {
    rawSql(`begin; insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${pT}', '${A}', 'WIRE', 1000, 'CAD', 'TRUST', now(), '${key()}', 'seed:J-58'); ${entryQ("DEPOSIT", 1000, PC, { pay: pT })};
      insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${pO}', '${A}', 'WIRE', 1000, 'CAD', 'OPERATING', now(), '${key()}', 'seed:J-58'); commit;`);
    bothOk = sql(`select string_agg(received_into::text, ',' order by received_into) from money_payment where id in ('${pT}', '${pO}')`) === "OPERATING,TRUST";
  } catch (e) { console.log(`      (a payment was refused: ${String((e as { stderr?: string }).stderr ?? e).split("\n")[0]})`); }
  const none = refusedWrite(`insert into money_payment (firm_id, method, amount_minor, currency, received_at, idempotency_key, recorded_by) values ('${A}', 'WIRE', 1000, 'CAD', now(), '${key()}', 'seed:J-58')`, /received_into/);
  const other = refusedWrite(`insert into money_payment (firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${A}', 'WIRE', 1000, 'CAD', 'ESCROW', now(), '${key()}', 'seed:J-58')`, /invalid input value for enum "MoneyAccountKind"/);
  ok("R1.58 W1 underneath (FO-7a, on main): the database accepts a payment into TRUST (with its deposit entry) and one into OPERATING, and refuses a payment with neither or with anything else",
    bothOk && none && other, { bothOk, none, other });

  // ----------------------------------------------------------------- W2: never below zero through a payment out
  const INV1 = await issuedInvoice(PA, 150000);
  const b2 = balance(PA), n2 = entries(PA);
  const w2a = await api(TA, "POST", `${M}/trust/applications`, { invoiceId: INV1, amountMinor: 100001 });
  ok("R1.58 W2 fail (part missing: FO-7t part 2, POST /trust/applications): Pay from trust of 1,000.01 with 1,000.00 held is refused, \"Only CAD 1,000.00 is available.\", and nothing is written",
    refusedWords(w2a, /Only CAD 1,000\.00 is available/) && balance(PA) === b2 && entries(PA) === n2, { status: w2a.status, body: w2a.body?.detail ?? w2a.text.slice(0, 120), balance: balance(PA) });
  const w2b = await api(TA, "POST", `${M}/trust/refunds`, { personId: PA, currency: "CAD", amountMinor: b2 + 1, reason: `Unused money returned (Sample ${run})`, method: "E_TRANSFER", reference: `J58-${run}-RF`, refundedOn: new Date().toISOString().slice(0, 10) });
  ok("R1.58 W2 fail (parts missing: FO-7t part 2, POST /trust/refunds; its method, date and reference: FO-7ts part 3, #2368): a refund of 0.01 more than the client holds is refused in words naming what is available, and nothing is written",
    refusedWords(w2b, /Only CAD 1,000\.00 is available/) && balance(PA) === b2 && entries(PA) === n2, { status: w2b.status, body: w2b.body?.detail ?? w2b.text.slice(0, 120) });
  ok("R1.58 W2 fail underneath (FO-7a, FO-7a2, on main): written straight to the ledger, a withdrawal of 1,000.01 to the issued invoice is refused by the database, \"Only CAD 1,000.00 is available.\"",
    refusedWrite(entryQ("WITHDRAWAL_TO_INVOICE", -(b2 + 1), PA, { inv: INV1 }), /Only CAD 1,000\.00 is available/) && balance(PA) === b2);

  // ----------------------------------------------------------------- W3: never below zero through a transfer
  const CASE = randomUUID();   // a case id (money_trust_entry.case_id has no foreign key; the move route checks the case: not built)
  const b3 = balance(PA), n3 = entries(PA);
  const w3over = await api(TA, "POST", `${M}/trust/moves-to-case`, { personId: PA, caseId: CASE, currency: "CAD", amountMinor: b3 + 1 });
  const over3 = refusedWords(w3over, /available|pre-case|before a case|more than/i) && entries(PA) === n3;
  const w3ok = await api(TA, "POST", `${M}/trust/moves-to-case`, { personId: PA, caseId: CASE, currency: "CAD", amountMinor: 40000 });
  ok("R1.58 W3 fail (part missing: the move-to-case route, \"a new FO-7t part\" (unnamed; route name guessed: POST /trust/moves-to-case)): moving 0.01 more pre-case money to a case than the client holds is refused, nothing written; moving 400.00 writes the pair and leaves the balance as it was",
    over3 && (w3ok.status === 201 || w3ok.status === 200) && sql(`select string_agg(amount_minor || '@' || (case_id is not null), ',' order by seq) from money_trust_entry where person_id = '${PA}' and kind = 'MOVE_TO_CASE'`) === "-40000@false,40000@true" && balance(PA) === b3,
    { over: w3over.status, within: w3ok.status, detail: w3ok.body?.detail ?? null });
  const mv = randomUUID();
  ok("R1.58 W3 fail underneath (FO-7ts part 2, on main): written straight to the ledger, a move to a case of 0.01 more than the client's pre-case money is refused by the database",
    refusedWrite(`begin; ${entryQ("MOVE_TO_CASE", -(b3 + 1), PA, { id: mv })}; ${entryQ("MOVE_TO_CASE", b3 + 1, PA, { kase: randomUUID(), from: mv })}; commit;`, /pre-case|available|below zero|balance/i) && balance(PA) === b3);
  // The pick (another payer's money on the same case pays an invoice; AG-6-68 rule 4): client B holds 300.00 on CASE2,
  // client C's invoice is on CASE2.
  const CASE2 = randomUUID();
  await deposit(PB, 30000);
  if (sql(`select count(*) from money_trust_entry where person_id = '${PB}' and case_id = '${CASE2}'`) === "0") {
    const m = randomUUID(); note("client B's 300.00 moved to the case by SQL (no move route on main)");
    rawSql(`begin; ${entryQ("MOVE_TO_CASE", -30000, PB, { id: m })}; ${entryQ("MOVE_TO_CASE", 30000, PB, { kase: CASE2, from: m })}; commit;`);
  }
  // Client B also holds 300.00 outside CASE2 (pre-case), so B's whole balance covers every over-pick below and the
  // refusal that fires is #2368's same-case pick rule, not the general balance rule (which runs first, migration :358).
  await deposit(PB, 30000);
  const INV2 = await issuedInvoice(PC, 50000, CASE2);
  const bB = balance(PB), nB = entries(PB);
  const pickOver = await api(TA, "POST", `${M}/trust/applications`, { invoiceId: INV2, amountMinor: 30001, otherFundsPick: { personId: PB, caseId: CASE2, reason: `Client B pays for Client C (Sample ${run})` } });
  const pickOk = await api(TA, "POST", `${M}/trust/applications`, { invoiceId: INV2, amountMinor: 20000, otherFundsPick: { personId: PB, caseId: CASE2, reason: `Client B pays for Client C (Sample ${run})` } });
  ok("R1.58 W3 fail (part missing: FO-7t part 2's deliberate pick; its rule FO-7ts part 3, #2368, on main): another payer's money on the same case pays at most what that payer holds there: 300.01 refused in words (\"Only CAD 300.00 is available\" or the pick rule's), 200.00 accepted and recorded as a pick with its reason",
    refusedWords(pickOver, /Only CAD 300\.00 is available|a pick takes only what the payer holds on that case/) && (pickOk.status === 201 || pickOk.status === 200) && entries(PB) === nB + 1 && balance(PB) === bB - 20000,
    { over: pickOver.status, within: pickOk.status, detail: pickOk.body?.detail ?? pickOver.body?.detail ?? null });
  const pickQ = (amount: number) => `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, case_id, created_by, picked_other_funds_by, picked_other_funds_at, picked_other_funds_reason) values ('${A}', '${PB}', 'WITHDRAWAL_TO_INVOICE', ${-amount}, 'CAD', '${INV2}', '${CASE2}', 'seed:J-58', 'seed:J-58', now(), 'Client B pays for Client C (Sample)') returning id`;
  const bB2 = balance(PB), openOnCase = Number(sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where person_id = '${PB}' and case_id = '${CASE2}'`));
  let pickWithin = false;
  if (hasCol("money_trust_entry", "picked_other_funds_by") && openOnCase >= 5000) { try { rawSql(pickQ(5000)); pickWithin = balance(PB) === bB2 - 5000; } catch (e) { console.log(`      (pick within refused: ${String((e as { stderr?: string }).stderr ?? e).split("\n")[0]})`); } }
  ok("R1.58 W3 underneath (FO-7ts part 3, #2368, on main): written straight to the ledger, a pick of another payer's money within what they hold on the case is accepted; one of 0.01 more is refused, \"a pick takes only what the payer holds on that case\"",
    pickWithin && refusedWrite(pickQ(openOnCase - 5000 + 1), /a pick takes only what the payer holds on that case/), { columns: hasCol("money_trust_entry", "picked_other_funds_by"), openOnCase, pickWithin, balance: balance(PB) });

  // --------------------------------------------------------------- W4: earned money on To move until moved (and moves)
  const b4 = balance(PA);
  const w4 = await api(TA, "POST", `${M}/trust/applications`, { invoiceId: INV1, amountMinor: 30000 });
  let W: string = sql(`select coalesce((select id::text from money_trust_entry where person_id = '${PA}' and kind = 'WITHDRAWAL_TO_INVOICE' and invoice_id = '${INV1}' order by seq desc limit 1), '')`);
  ok("R1.58 W4 (part missing: FO-7t part 2, POST /trust/applications): Pay from trust of 300.00 to the issued invoice is accepted; one withdrawal to that invoice, the balance falls by 300.00",
    (w4.status === 201 || w4.status === 200) && !!W && balance(PA) === b4 - 30000, { status: w4.status, detail: w4.body?.detail ?? null });
  if (!W) { note("the 300.00 withdrawal to the invoice written by SQL"); W = sql(entryQ("WITHDRAWAL_TO_INVOICE", -30000, PA, { inv: INV1 })); }
  const open = () => sql(`select coalesce((select open_minor::text from money_to_move where source_entry_id = '${W}' and direction = 'TRUST_TO_OPERATING'), '0')`);
  ok("R1.58 W4 underneath (FO-7mv, on main): the earned 300.00 is on the database's To move list (money_to_move, trust → operating) before any move", open() === "30000", { open: open() });
  const list = await api(TA, "GET", `${M}/trust/to-move`);
  ok("R1.58 W4 (part missing: FO-7t part 3, GET /trust/to-move): the To move list read through the API names the earned 300.00 line (trust → operating, CAD)",
    list.status === 200 && words(list).includes(W) && /30000/.test(words(list)), { status: list.status });
  const today = new Date().toISOString().slice(0, 10), batches = () => sql(`select count(*) from money_move_batch where firm_id = '${A}'`);
  const nb = batches(), b4b = balance(PA);
  const over4 = await api(TA, "POST", `${M}/trust/to-move/batches`, { currency: "CAD", direction: "TRUST_TO_OPERATING", transferDate: today, lines: [{ sourceEntryId: W, amountMinor: 30001 }] });
  ok("R1.58 W4 fail (part missing: FO-7t part 3, POST /trust/to-move/batches): a batch moving 300.01 of the 300.00 line is refused (409 MOVE_REFUSED, the database's words); no batch is written and the line stays open",
    over4.status === 409 && /MOVE_REFUSED/.test(words(over4)) && batches() === nb && open() === "30000", { status: over4.status, body: over4.body?.code ?? over4.body?.detail ?? null });
  const exact = await api(TA, "POST", `${M}/trust/to-move/batches`, { currency: "CAD", direction: "TRUST_TO_OPERATING", transferDate: today, lines: [{ sourceEntryId: W, amountMinor: 30000 }] });
  const after = await api(TA, "GET", `${M}/trust/to-move`);
  ok("R1.58 W4 (part missing: FO-7t part 3): \"I moved these\" for the 300.00 line records one batch, the line leaves the list (database and API), and the client's trust balance does not move",
    (exact.status === 201 || exact.status === 200) && batches() === String(Number(nb) + 1) && open() === "0" && after.status === 200 && !words(after).includes(W) && balance(PA) === b4b,
    { status: exact.status, open: open(), listed: after.status });

  // ------------------------------------------------- W5: a reversal of a hand-recorded payment, below zero, red
  await deposit(PR, 30000);
  const chq = await deposit(PR, 20000, "CHEQUE");
  const bR = balance(PR);
  const rf = await api(TA, "POST", `${M}/trust/refunds`, { personId: PR, currency: "CAD", amountMinor: 50000, reason: `Unused money returned (Sample ${run})`, method: "E_TRANSFER", reference: `J58-${run}-RF2`, refundedOn: today });
  if (balance(PR) !== bR - 50000) { note(`the 500.00 refund written by SQL (POST ${M}/trust/refunds answered ${rf.status})`); rawSql(entryQ("REFUND_TO_CLIENT", -50000, PR, { reason: "Unused money returned (Sample)" })); }
  const depEntry = sql(`select id from money_trust_entry where payment_id = '${chq.id}'`);
  const rev = await api(TA, "POST", `${M}/payments/${chq.id}/reverse`, { reason: "Returned" });
  const revEntry = () => sql(`select coalesce((select id::text from money_trust_entry where corrects_entry_id = '${depEntry}' and kind = 'CORRECTION' and correction_kind = 'RETURNED'), '')`);
  ok("R1.58 W5 (part missing: FO-7v, the reversal route (not on checklist row 58; route as FO-7v words it, prefix guessed /front-office/money)): the hand-recorded 200.00 cheque, its money already refunded, is reversed as Returned through the API: accepted, one correction naming the deposit, the balance −200.00",
    (rev.status === 200 || rev.status === 201) && !!revEntry() && balance(PR) === -20000, { status: rev.status, detail: rev.body?.detail ?? null, balance: balance(PR) });
  let underneath = !!revEntry();
  if (!underneath) { try { rawSql(entryQ("CORRECTION", -20000, PR, { corrects: depEntry, ck: "RETURNED", reason: "Returned" })); underneath = true; note("the reversal written straight to the ledger"); } catch (e) { console.log(`      (reversal refused: ${String((e as { stderr?: string }).stderr ?? e).split("\n")[0]})`); } }
  ok("R1.58 W5 underneath (FO-7a2, P-634, on main): the database accepts that reversal below zero (−200.00) and money_trust_shortfall lists the client at −200.00 with that reversal",
    underneath && balance(PR) === -20000 && sql(`select coalesce((select balance_minor || ':' || (reversal_entry_id = '${revEntry()}') from money_trust_shortfall where firm_id = '${A}' and person_id = '${PR}' and currency = 'CAD'), 'none')`) === "-20000:true");
  const sf = await api(TA, "GET", `${M}/trust/shortfall`);
  const sfRow = Array.isArray(sf.body?.items ?? sf.body) ? (sf.body?.items ?? sf.body).find((x: { personId?: string; partyId?: string }) => x.personId === PR || x.partyId === PR) : null;
  ok("R1.58 W5 (part missing: a read of the shortfall list (no backlog row names one; route name guessed: GET /trust/shortfall)): the shortfall list read through the API names the client at −200.00 CAD",
    sf.status === 200 && !!sfRow && (sfRow.balanceMinor === -20000 || sfRow.amountMinor === -20000), { status: sf.status, row: sfRow ?? null });

  // the screen: Money › Trust shows the client in red (FO-7s3b's trust area; P-634's red shortfall)
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await ctx.route(/stripe\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`${BASE}/account`);
    await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(emailA); await p.getByRole("button", { name: "Sign in" }).click();
    await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    await p.goto(`${BASE}/money/trust`); await p.waitForLoadState("networkidle").catch(() => undefined);
    const nameTag = `ClientR${run}`;
    // A string, not a function: tsx's name helper (__name) does not exist in the page.
    const red = await p.evaluate(`(() => {
      const tag = ${JSON.stringify(nameTag)};
      // an element whose own text is the −200.00 figure, in a row (or block) naming the client, coloured red
      const isRed = (el) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(getComputedStyle(el).color); return !!m && +m[1] > 150 && +m[1] > +m[2] + 60 && +m[1] > +m[3] + 60; };
      return [...document.querySelectorAll("body *")].some((el) => el.children.length === 0 && /[−-]\\s*(CAD\\s*)?200\\.00/.test(el.textContent || "") && isRed(el)
        && ((el.closest("tr, li, [role=row], article, section") || {}).textContent || "").includes(tag));
    })()`) as boolean;
    ok("R1.58 W5 (parts missing: FO-7s3b, the trust screens; the shortfall list's screen (no row names one)): Money › Trust shows the client below zero in red (−200.00)", red, { url: p.url() });
    await ctx.close();
  } finally { await browser.close(); }

  // ------------------------------------------------------------------------------------------------ W6: roles
  const depA = sql(`select coalesce((select id::text from money_trust_entry where person_id = '${PA}' and kind = 'DEPOSIT' order by seq limit 1), '')`);
  // W5's browser sign-in as the same Owner ends the API session TA (one session per person), so W6 signs in again.
  const TA2 = await signIn("sample-firm", emailA);
  const mine = await api(TA2, "GET", `${M}/trust/ledger?personId=${PA}&currency=CAD`), theirs = await api(TB, "GET", `${M}/trust/ledger?personId=${PA}&currency=CAD`), anon = await api(null, "GET", `${M}/trust/ledger?personId=${PA}&currency=CAD`);
  ok("R1.58 W6 (FO-7t part 1, #3033, on main: GET /trust/ledger?personId=): firm A's Owner reads the client's ledger (200, its entries); firm B gets 404 and no session 401",
    mine.status === 200 && /^[0-9a-f-]{36}$/.test(depA) && words(mine).includes(depA) && theirs.status === 404 && anon.status === 401, { mine: mine.status, theirs: theirs.status, anon: anon.status });
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
