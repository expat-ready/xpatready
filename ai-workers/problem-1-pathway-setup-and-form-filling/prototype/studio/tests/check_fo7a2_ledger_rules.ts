// FO-7a2 (brief product/design/lead-b-briefs/FO-7a2.md rev 16.53, order rev 16.58; P-634, P-638; AG-6-60 rule 7, AG-6-63 rule 7,
// AG-6-68 rules 5 and 8, AG-6-75 rules 1-6, AG-6-48 rules 3-4, AG-6-73 rules 1 and 4; FO-7mv's break report B-3, B-4, B-10,
// B-13, B-17; legal reading Unconfirmed: no counsel): the trust ledger's reversal and credit-note rules, in the database.
// DW1-DW7 of the brief, each passing and failing as named (rule 2c widened by Lead 69 on #1991).
// Two scratch databases: "t" gets every migration (the cases run here), "pre" every migration before FO-7a2's. No server,
// no browser, no model call, no Stripe call (US$0). Both are dropped at the end.
//   tsx studio/tests/check_fo7a2_ledger_rules.ts
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261116133000_fo7a2_ledger_rules", FO7MV = "20261116030000_fo7mv_move_list";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const T = `xr_studio_fo7a2_t_${process.pid}`, PRE = `xr_studio_fo7a2_pre_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `fo7a2-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string) => psql(db, ["-Atc", q]);
const last = (db: string, q: string) => sql(db, q).split("\n").filter(Boolean).at(-1) ?? "";
const refused = (db: string, q: string, re: RegExp, code?: string) => {
  try { psql(db, ["-v", "VERBOSITY=verbose", "-Atc", q]); return false; }
  catch (e) { const err = String((e as { stderr?: string }).stderr ?? e); const hit = re.test(err) && (!code || err.includes(`ERROR:  ${code}:`)); if (!hit) console.log(`      (refused otherwise: ${err.split("\n")[0]})`); return hit; }
};
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fns = (db: string) => sql(db, `select coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), '|' order by p.proname), '') from pg_proc p where p.pronamespace = 'public'::regnamespace`).split("|");
function moneyDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /money_|Money[A-Z]/.test(l));
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [T, PRE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------------------- DW7: the migration
  const before = all.filter((d) => d < NEW);
  ok(`FO-7a2 DW7 pass: the migration's stamp is its own and later than every migration before it, FO-7mv's included (newest before it: ${before.at(-1)}; P-600)`,
    all.includes(NEW) && before.includes(FO7MV) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of before) { psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]); psql(PRE, ["-1", "-f", join(MIG, d, "migration.sql")]); }
  const fnBefore = fns(T);
  psql(T, ["-1", "-f", join(MIG, NEW, "migration.sql")]);
  // read right after this migration: a later migration's own functions (e.g. CS-S1's case_party_index_*) are not this row's
  const changed = fns(T).filter((f) => !fnBefore.includes(f)).map((f) => f.split(":")[0]).sort();
  for (const d of all.filter((x) => x > NEW)) psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]);
  ok("FO-7a2 DW7 pass: right after its migration the functions it adds or replaces are all money_ (three of FO-7a's and two of FO-7mv's replaced for rule 2c, seven new)",
    JSON.stringify(changed) === JSON.stringify(["money_credit_note_owed_back()", "money_credit_note_write()", "money_move_batch_owed_back()", "money_move_line_write()", "money_moved_live(uuid,uuid,\"MoneyMoveDirection\")", "money_owed_back(uuid,uuid,boolean)", "money_owed_live(uuid,uuid)", "money_payment_returned_not_cleared()", "money_trust_entry_moves()", "money_trust_entry_write()", "money_trust_paid(uuid,uuid)", "money_write_off_write()"]), changed);
  ok("FO-7a2 DW7 pass: every trigger function runs as PF-12's wall reader (SECURITY DEFINER, owner xr_wall_reader, search_path pinned); the four helpers keep their caller's rights, so called directly they see only the session's firm (review M1, break B-3)",
    sql(T, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader' and array_to_string(p.proconfig, ',') like 'search_path=%') from pg_proc p where p.proname in ('money_credit_note_write','money_payment_returned_not_cleared','money_trust_entry_write','money_write_off_write','money_credit_note_owed_back','money_move_line_write','money_trust_entry_moves','money_move_batch_owed_back')`) === "t"
    && sql(T, `select bool_or(p.prosecdef) from pg_proc p where p.proname in ('money_trust_paid','money_moved_live','money_owed_back','money_owed_live')`) === "f");
  ok("FO-7a2 DW7 pass: migrate diff names no money table or type; the shortfall view and the To move list read with the caller's rights (PF-12's walls)",
    moneyDiff(T).length === 0 && sql(T, `select string_agg(coalesce(array_to_string(reloptions, ','), ''), '|' order by relname) from pg_class where relname in ('money_to_move', 'money_trust_shortfall')`) === "security_invoker=true|security_invoker=true", moneyDiff(T));
  ok("FO-7a2 DW7 fail: before its migration a reversal below zero is refused (the old balance check)",
    sql(PRE, `select pg_get_constraintdef(oid) from pg_constraint where conname = 'money_trust_entry_balance_check'`).includes("balance_after_minor >= 0) AND (seq >= 1"));

  const firmA = sql(T, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), 'firm-a2', 'A2', 'CA', 'office@firm-a2.example.com', now()) returning id`);
  sql(T, `insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${firmA}', 'user-O', now()); update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmA}'`);
  let n = 0; const key = () => `key-fo7a2-${String(++n).padStart(6, "0")}`;
  const invoice = (total: number, pid: string) => { const id = randomUUID();
    sql(T, `insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${id}', '${firmA}', '${pid}', 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${firmA}', '${id}', 1, 'FEE', 'Work permit application', 1, ${total}, ${total}, 'CAD');
      update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${id}'`); return id; };
  const entry = (kind: string, amount: number, pid: string, x: { inv?: string; pay?: string; corrects?: string; reason?: string; ck?: string } = {}) =>
    `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, invoice_id, corrects_entry_id, correction_kind, reason, ${kind === "REFUND_TO_CLIENT" ? "refund_method, refunded_on, " : ""}created_by) values ('${firmA}', '${pid}', '${kind}', ${amount}, 'CAD', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.corrects ? `'${x.corrects}'` : "null"}, ${x.ck ? `'${x.ck}'` : "null"}, ${x.reason ? `'${x.reason}'` : "null"}, ${kind === "REFUND_TO_CLIENT" ? "'E_TRANSFER', current_date, " : ""}'user-R') returning id`;
  const deposit = (amount: number, pid: string, method = "E_TRANSFER", cleared = true) => { const p = randomUUID();
    return last(T, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${p}', '${firmA}', '${method}', ${amount}, 'CAD', 'TRUST', now(), '${key()}', 'user-R', ${cleared}); ${entry("DEPOSIT", amount, pid, { pay: p })}`); };
  const reverse = (dep: string, amount: number, pid: string, ck = "RETURNED") => entry("CORRECTION", -amount, pid, { corrects: dep, ck, reason: ck === "OTHER" ? "Cheque stopped by the client" : "Reversed" });
  const refund = (amount: number, pid: string) => entry("REFUND_TO_CLIENT", -amount, pid, { reason: "Returned unused money" });
  const move = (src: string, amount: number) => { const b = randomUUID();
    return last(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${b}', '${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R');
      insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${b}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', ${amount}, '${src}'); commit; select '${b}'`); };
  const balance = (pid: string) => sql(T, `select coalesce((select balance_after_minor from money_trust_entry where firm_id = '${firmA}' and person_id = '${pid}' order by seq desc limit 1), 0)`);
  const shortfall = (pid: string) => sql(T, `select coalesce((select balance_minor || ':' || (reversal_entry_id is not null) from money_trust_shortfall where firm_id = '${firmA}' and person_id = '${pid}'), 'none')`);

  // ------------------------------------------------------------------------------------------- DW1 (B-10)
  {
    const P = u(1); deposit(50000, P); const chq = deposit(30000, P, "CHEQUE", false), inv = invoice(30000, P), w = sql(T, entry("WITHDRAWAL_TO_INVOICE", -30000, P, { inv }));
    move(w, 30000); sql(T, refund(50000, P));
    const rev = sql(T, reverse(chq, 30000, P));
    ok("FO-7a2 DW1 pass (B-10; AG-6-75 rule 4): 500.00 cleared + a 300.00 cheque not yet cleared, 300.00 applied and moved, 500.00 refunded; the cheque reversed as \"Returned\" is recorded, the balance is −300.00 and money_trust_shortfall lists −300.00 CAD with that reversal",
      !!rev && balance(P) === "-30000" && shortfall(P) === "-30000:true" && sql(T, `select reversal_entry_id from money_trust_shortfall where person_id = '${P}'`) === rev);
    ok("FO-7a2 DW1 fail (AG-6-68 rule 8): on the same ledger a further 1.00 refund is refused, \"Only CAD 0.00 is available.\"",
      refused(T, refund(100, P), /Only CAD 0\.00 is available/, "23514") && balance(P) === "-30000");
    const back = deposit(10000, P);
    ok("FO-7a2 DW1 pass (AG-6-60 rule 7): money in while below zero is recorded (−300.00 → −200.00) and the shortfall shrinks; fail: a withdrawal from it is refused",
      !!back && shortfall(P) === "-20000:true" && refused(T, entry("WITHDRAWAL_TO_INVOICE", -100, P, { inv: invoice(100, P) }), /Only CAD 0\.00 is available/));
  }

  // ------------------------------------------------------------------------------------------- DW2 (AG-6-68 rule 8)
  {
    const P = u(2); deposit(10000, P); const inv = invoice(20000, P);
    ok("FO-7a2 DW2 fail: an application of 100.01 with 100.00 held is refused, naming what is available", refused(T, entry("WITHDRAWAL_TO_INVOICE", -10001, P, { inv }), /Only CAD 100\.00 is available/, "23514"));
    ok("FO-7a2 DW2 pass: an application equal to the balance (100.00) is accepted and leaves 0.00", !!sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P, { inv })) && balance(P) === "0");
    const d = deposit(5000, u(3));
    ok("FO-7a2 DW2 fail: a WRONG_ACCOUNT correction is not a reversal: below zero it is refused like any outflow",
      (sql(T, refund(5000, u(3))), refused(T, entry("CORRECTION", -5000, u(3), { corrects: d, ck: "WRONG_ACCOUNT", reason: "Was for operating" }), /Only CAD 0\.00 is available/)));
  }

  // ------------------------------------------------------------------------------------------- DW3 (B-17)
  {
    const P = u(4);
    const et = deposit(10000, P), cash = deposit(10000, P, "CASH"), chq = deposit(10000, P, "CHEQUE", false);
    ok("FO-7a2 DW3 fail (AG-6-63 rule 7): \"Returned\" on an e-Transfer or a cash payment is refused (cleared when recorded); card money never reaches trust (FO-7a)",
      refused(T, reverse(et, 10000, P), /E_TRANSFER payment is cleared when recorded and is never "Returned"/, "23514") && refused(T, reverse(cash, 10000, P), /CASH payment is cleared when recorded/)
      && refused(T, `insert into money_payment (firm_id, method, amount_minor, currency, received_into, received_at, stripe_payment_intent_id, idempotency_key) values ('${firmA}', 'CARD', 100, 'CAD', 'TRUST', now(), 'pi_3Fo7a2', '${key()}')`, /money_payment_card_not_trust/));
    ok("FO-7a2 DW3 pass: the cheque's \"Returned\" is accepted; \"Recorded by mistake\" on the e-Transfer is too", !!sql(T, reverse(chq, 10000, P)) && !!sql(T, reverse(et, 10000, P, "RECORDED_BY_MISTAKE")));
    const tick = (dep: string) => `update money_payment set cleared = true, cleared_at = now(), cleared_by = 'user-R' where id = (select payment_id from money_trust_entry where id = '${dep}')`;
    const chq2 = deposit(10000, P, "CHEQUE", false);
    ok("FO-7a2 DW3 fail (B-17): ticking a returned cheque cleared is refused; pass: an uncleared cheque never returned is ticked",
      refused(T, tick(chq), /reversed as "Returned" \(it bounced\) and is never ticked cleared/, "23514") && sql(T, `${tick(chq2)} returning cleared`) === "t");
  }

  // ------------------------------------------------------------------------------------------- DW4 (AG-6-48's test)
  {
    const P = u(5); deposit(300000, P); const inv = invoice(282500, P), w = sql(T, entry("WITHDRAWAL_TO_INVOICE", -282500, P, { inv }));
    const credit = (amount: number) => `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by) values ('${firmA}', '${inv}', ${amount}, 'CAD', false, 'Goodwill', 'user-R') returning number`;
    const openW = () => sql(T, `select coalesce((select open_minor from money_to_move where source_entry_id = '${w}'), 0)`);
    ok("FO-7a2 DW4 fail (AG-6-48 rule 4): on INV paid from trust, not yet moved, a credit note of 282.50 with no RETURN is refused, naming 282.50",
      refused(T, credit(28250), /2,825\.00 CAD of this invoice was paid from trust: return 282\.50 CAD to trust first/, "23514") && openW() === "282500");
    const bal = Number(balance(P));
    ok("FO-7a2 DW4 pass (AG-6-48 rule 4, AG-6-73 rule 4): the same credit note with its RETURN in one transaction is accepted; trust rises by 282.50 and the To move line falls by it",
      last(T, `begin; ${entry("CORRECTION", 28250, P, { corrects: w, reason: "Credit note: trust returned" })}; ${credit(28250)}; commit;`).startsWith("CN-")
      && Number(balance(P)) === bal + 28250 && openW() === String(282500 - 28250));
    const inv2 = invoice(10000, P); sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P, { inv: inv2 }));
    ok("FO-7a2 DW4 fail: a write-off of a trust-paid invoice is refused (only what trust has not paid is written off)",
      refused(T, `insert into money_write_off (firm_id, invoice_id, amount_minor, currency, reason, created_by) values ('${firmA}', '${inv2}', 100, 'CAD', 'Small balance', 'user-R')`, /paid from trust: only what trust has not paid is written off \(0 left\)/));
    const inv3 = invoice(10000, P); sql(T, entry("WITHDRAWAL_TO_INVOICE", -4000, P, { inv: inv3 }));
    ok("FO-7a2 DW4 pass: on a part-paid invoice (40.00 of 100.00 from trust) a 60.00 credit note needs no return; 60.01 does",
      last(T, `begin; ${`insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by) values ('${firmA}', '${inv3}', 6000, 'CAD', false, 'Part cancelled', 'user-R') returning number`}; rollback;`).startsWith("CN-")
      && refused(T, `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by) values ('${firmA}', '${inv3}', 6001, 'CAD', false, 'Part cancelled', 'user-R')`, /return 0\.01 CAD to trust first/));
  }


  // ------------------------------------------------------------------------------------------- DW5 (B-13; rule 2c, P-634 (2))
  {
    const P = u(7); deposit(100000, P); const inv = invoice(20000, P), w = sql(T, entry("WITHDRAWAL_TO_INVOICE", -20000, P, { inv }));
    move(w, 20000);
    const cn = (amount: number, choice?: string, cover = amount) => `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by${choice ? ", overpaid_choice, overpaid_minor, overpaid_entry_id" : ""}) values ('${firmA}', '${inv}', ${amount}, 'CAD', false, 'Service cancelled', 'user-R'${choice ? `, '${choice}', ${cover}, '${w}'` : ""}) returning number`;
    const list = (dir: string) => sql(T, `select coalesce(sum(open_minor), 0) from money_to_move where source_entry_id = '${w}' and direction = '${dir}'`);
    const bank = () => Number(balance(P)) + Number(list("TRUST_TO_OPERATING")) - Number(list("OPERATING_TO_TRUST"));
    const bankBefore = bank();
    ok("FO-7a2 DW5 fail (P-634 (2)): a credit note on trust money already moved to operating, with no choice, is refused; there is no \"keep in operating\" choice",
      refused(T, cn(5000), /for money already moved to operating, choose Refund to the client or Move back to trust/, "23514")
      && refused(T, cn(5000, "KEEP_IN_OPERATING"), /invalid input value for enum "MoneyOverpaidChoice"/));
    const bal = Number(balance(P));
    ok("FO-7a2 DW5 pass (rule 2c): \"Move back to trust\" for 50.00 returns it to the client's trust balance at once and lists 50.00 operating → trust; ledger + list = the bank's trust account",
      sql(T, cn(5000, "OVERPAID_TO_TRUST")).startsWith("CN-") && Number(balance(P)) === bal + 5000 && list("OPERATING_TO_TRUST") === "5000" && list("TRUST_TO_OPERATING") === "0" && bank() === bankBefore);
    const back = randomUUID();
    ok("FO-7a2 DW5 fail: moving back more than is owed (50.01) is refused; pass: the 50.00 moves back and the list is clear",
      refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${randomUUID()}', '${firmA}', 'CAD', 'OPERATING_TO_TRUST', '2026-11-20', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) select firm_id, id, 'TRUST_APPLIED', 'OPERATING_TO_TRUST', 'CAD', 5001, '${w}' from money_move_batch where direction = 'OPERATING_TO_TRUST' order by recorded_at desc limit 1; commit;`, /back into trust only what a credit note owes \(5000 CAD owed back, 0 moved back\)/)
      && last(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${back}', '${firmA}', 'CAD', 'OPERATING_TO_TRUST', '2026-11-21', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${back}', 'TRUST_APPLIED', 'OPERATING_TO_TRUST', 'CAD', 5000, '${w}'); commit; select 1`) === "1"
      && list("OPERATING_TO_TRUST") === "0" && bank() === bankBefore + 5000);
    const before = Number(balance(P));
    ok("FO-7a2 DW5 pass: \"Refund to the client\" for another 50.00 records the choice and leaves trust as it is (the refund is from operating); fail: a choice for more than has moved and is not yet covered (100.01) is refused",
      sql(T, cn(5000, "OVERPAID_REFUND")).startsWith("CN-") && Number(balance(P)) === before && list("OPERATING_TO_TRUST") === "0"
      && refused(T, cn(10001, "OVERPAID_REFUND"), /only 100\.00 CAD of that trust application has moved to operating and has no refund or move-back choice yet/));
    ok("FO-7a2 DW5 fail: a choice without its amount or withdrawal, or naming another invoice's application, is refused",
      refused(T, `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice) values ('${firmA}', '${inv}', 100, 'CAD', false, 'x', 'user-R', 'OVERPAID_REFUND')`, /money_credit_note_overpaid_check/)
      && refused(T, `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice, overpaid_minor, overpaid_entry_id) values ('${firmA}', '${invoice(1000, P)}', 100, 'CAD', false, 'x', 'user-R', 'OVERPAID_REFUND', 100, '${w}')`, /names a trust application to this invoice/));
  }


  // ------------------------------------------------------------------------------------------- review and breaker round 1
  {
    const P = u(8); deposit(100000, P); const inv = invoice(10000, P), w = sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P, { inv }));
    const b1 = move(w, 10000);
    const cn = (amount: number, choice: string, cover: number, i = inv, src = w) => `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice, overpaid_minor, overpaid_entry_id) values ('${firmA}', '${i}', ${amount}, 'CAD', false, 'Service cancelled', 'user-R', '${choice}', ${cover}, '${src}') returning number`;
    ok("FO-7a2 fail (review M2, break B-1): a choice covers at most the part of its credit note that trust paid and that moved: 10.00 credited with 100.00 covered is refused",
      refused(T, cn(1000, "OVERPAID_TO_TRUST", 10000), /covers only the part of this credit note that trust paid and that has moved \(at most 10\.00 CAD\)/, "23514"));
    sql(T, cn(10000, "OVERPAID_REFUND", 10000));
    const undo = (b: string) => `insert into money_move_batch (firm_id, currency, direction, undoes_batch_id, reason, recorded_by) values ('${firmA}', 'CAD', 'TRUST_TO_OPERATING', '${b}', 'Recorded the wrong transfer', 'user-R')`;
    ok("FO-7a2 fail (review B1, N1; break B-2, B-9): after a full credit note with \"Refund to the client\", the move is never undone, the same 100.00 is not returned to trust too, and no second credit note credits it again",
      refused(T, undo(b1), /a credit note's refund or move-back choice covers this move, so it is never undone/, "23514")
      && refused(T, entry("CORRECTION", 10000, P, { corrects: w, reason: "returned" }), /has moved to operating, so only 0 can come back to trust/, "23514")
      && refused(T, `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by) values ('${firmA}', '${inv}', 10000, 'CAD', false, 'Again', 'user-R')`, /more than is left to credit on the invoice \(0\)/));
    const inv2 = invoice(10000, P), w2 = sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P, { inv: inv2 })), b2 = move(w2, 5000);
    sql(T, cn(5000, "OVERPAID_TO_TRUST", 5000, inv2, w2));
    const back = randomUUID(); last(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${back}', '${firmA}', 'CAD', 'OPERATING_TO_TRUST', '2026-11-21', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${back}', 'TRUST_APPLIED', 'OPERATING_TO_TRUST', 'CAD', 3000, '${w2}'); commit; select 1`);
    const listed = () => sql(T, `select coalesce(string_agg(direction || ':' || open_minor, ',' order by direction), '') from money_to_move where source_entry_id = '${w2}'`);
    ok("FO-7a2 fail (break B-9, review N1): after \"Move back to trust\" and a part moved back, the trust → operating batch is never undone; the list still owes 20.00 back and only the 50.00 trust still pays moves out",
      refused(T, undo(b2), /covers this move, so it is never undone/, "23514") && listed() === "TRUST_TO_OPERATING:5000,OPERATING_TO_TRUST:2000"
      && refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${u(92)}', '${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-22', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${u(92)}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 5001, '${w2}'); commit;`, /would move more than this entry still holds/));
    const inv4 = invoice(10000, P), w4 = sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P, { inv: inv4 })), b4 = move(w4, 10000);
    ok("FO-7a2 pass: a trust → operating batch no choice covers is still undone, as FO-7mv allows", !!sql(T, undo(b4) + " returning id"));
    // Devin review on #1991: after a refund choice and a return of the unmoved part, the rest is paid from trust again.
    const inv5 = invoice(10000, P), w5 = sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P, { inv: inv5 })); move(w5, 5000);
    sql(T, cn(5000, "OVERPAID_REFUND", 5000, inv5, w5)); sql(T, entry("CORRECTION", 5000, P, { corrects: w5, reason: "unmoved part returned" }));
    ok("FO-7a2 pass/fail (Devin review): after \"Refund to the client\" for the moved 50.00 and the unmoved 50.00 returned, the 50.00 still due is paid from trust again; 50.01 is refused",
      refused(T, entry("WITHDRAWAL_TO_INVOICE", -5001, P, { inv: inv5 }), /would pay more than is open on the invoice \(5000 open/) && !!sql(T, entry("WITHDRAWAL_TO_INVOICE", -5000, P, { inv: inv5 })));
    const inv6 = invoice(10000, P), w6 = sql(T, entry("WITHDRAWAL_TO_INVOICE", -4000, P, { inv: inv6 }));
    const fullQ = (amount: number) => `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by) values ('${firmA}', '${inv6}', ${amount}, 'CAD', true, 'Cancelled', 'user-R') returning number`;
    ok("FO-7a2 fail/pass (Devin review; AG-6-48 rule 2): with 40.00 of 100.00 paid from trust, a \"full\" credit of 60.00 is refused; after the 40.00 is returned, the full 100.00 credit is accepted",
      refused(T, fullQ(6000), /a full credit note credits all that is left \(10000\)/, "23514")
      && last(T, `begin; ${entry("CORRECTION", 4000, P, { corrects: w6, reason: "Cancelled: trust returned" })}; ${fullQ(10000)}; commit;`).startsWith("CN-"));
    const P9 = u(9); deposit(50000, P9); const chq = deposit(50000, P9, "CHEQUE", false), inv3 = invoice(10000, P9), w3 = sql(T, entry("WITHDRAWAL_TO_INVOICE", -10000, P9, { inv: inv3 }));
    sql(T, refund(50000, P9)); sql(T, reverse(chq, 50000, P9));
    ok("FO-7a2 fail (break B-4; AG-6-75 rule 3): after the cheque bounces and the party is below zero, its unmoved 100.00 application does not move out of trust",
      balance(P9) === "-10000" && refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${u(90)}', '${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${u(90)}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10000, '${w3}'); commit;`, /trust balance is -100\.00 CAD after a reversal; its unmoved trust applications are undone money/, "23514"));
    ok("FO-7a2 fail (Lead B, #1991): an operating → trust line that names no credit note's move-back is refused",
      refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${u(91)}', '${firmA}', 'CAD', 'OPERATING_TO_TRUST', '2026-11-20', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${u(91)}', 'TRUST_APPLIED', 'OPERATING_TO_TRUST', 'CAD', 100, '${w3}'); commit;`, /back into trust only what a credit note owes \(0 CAD owed back/, "23514"));
  }

  // ------------------------------------------------------------------------------------------- DW6 (B-3)
  {
    const P = u(6); const d = deposit(20000, P); sql(T, refund(20000, P));
    ok("FO-7a2 DW6 pass (B-3): a 200.00 deposit refunded, then reversed as \"Wrong client\", is recorded and the shortfall (−200.00) is listed",
      !!sql(T, reverse(d, 20000, P, "WRONG_CLIENT")) && shortfall(P) === "-20000:true");
    ok("FO-7a2 DW6 fail: a reversal still never exceeds its deposit (FO-7a): 0.01 more of the same deposit is refused", refused(T, reverse(d, 1, P, "OTHER"), /at most the deposit/));
    ok("FO-7a2 DW6 fail: a party at or above zero is not listed as a shortfall", shortfall(u(2)) === "none");
  }
  ok("FO-7a2 pass: every entry below zero is a reversal or money in (the balance check holds on every row)",
    sql(T, `select count(*) from money_trust_entry where balance_after_minor < 0 and not (amount_minor > 0 or (kind = 'CORRECTION' and correction_kind in ('RETURNED','RECORDED_BY_MISTAKE','WRONG_CLIENT','OTHER')))`) === "0");
} finally {
  for (const db of [T, PRE]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
