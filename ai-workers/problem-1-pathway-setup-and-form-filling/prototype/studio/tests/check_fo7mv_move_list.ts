// FO-7mv (BACKLOG row FO-7mv as split by its brief, Lead B rev 16.31; B-18, B-19 from #1758; AG-6-73, AG-6-69 rule 2,
// AG-6-70, AG-6-77, AG-6-48; P-603, P-607 (1), P-600; Code SOR/2022-128 s. 32, Unconfirmed: no counsel): the "To move"
// list between the trust and operating bank accounts, in the database. DW1-DW10 of the brief, each passing and failing
// as named; parallel cases on real connections (READ COMMITTED and REPEATABLE READ). Three scratch databases: "t" gets
// every migration (the cases run here), "bad" stops before FO-7mv with a correction of a deposit (the migration must
// refuse), "empty" gets every migration. No server, no browser, no model call, no Stripe call (US$0). All are dropped.
//   tsx studio/tests/check_fo7mv_move_list.ts
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261116030000_fo7mv_move_list", FO7A = "20261115042334_fo7a_client_money_tables";
const FO7TS = "20261118200000_fo7ts_money_settings";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const T = `xr_studio_fo7mv_t_${process.pid}`, BAD = `xr_studio_fo7mv_bad_${process.pid}`, EMPTY = `xr_studio_fo7mv_empty_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `fo7mv-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string) => psql(db, ["-Atc", q]);
const last = (db: string, q: string) => sql(db, q).split("\n").filter(Boolean).at(-1) ?? "";
const refused = (db: string, q: string, re: RegExp, code?: string) => {
  try { psql(db, ["-v", "VERBOSITY=verbose", "-Atc", q]); return false; }
  catch (e) { const err = String((e as { stderr?: string }).stderr ?? e); if (!(re.test(err) && (!code || err.includes(`ERROR:  ${code}:`)))) console.log(`      (refused otherwise: ${err.split("\n")[0]})`); return re.test(err) && (!code || err.includes(`ERROR:  ${code}:`)); }
};
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function moneyDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /money_|Money[A-Z]/.test(l));
}
const fns = (db: string) => sql(db, `select coalesce(string_agg(proname, ',' order by proname), '') from pg_proc where pronamespace = 'public'::regnamespace`).split(",");
// n connections, each in its own transaction holding a snapshot, then each runs its statements and commits.
const conns: pg.Client[] = [];
async function race(stmts: string[], iso = "read committed"): Promise<{ ok: boolean; code?: string; message?: string }[]> {
  const cs = await Promise.all(stmts.map(async () => { const c = new pg.Client({ connectionString: urlOf(T) }); await c.connect(); conns.push(c); return c; }));
  for (const c of cs) { await c.query(`begin isolation level ${iso}`); await c.query("select 1 from money_trust_entry limit 1"); }
  const out = await Promise.all(cs.map(async (c, i) => {
    try { await c.query(stmts[i]); await c.query("commit"); return { ok: true }; }
    catch (e) { await c.query("rollback").catch(() => undefined); const err = e as { code?: string; message?: string }; return { ok: false, code: err.code, message: err.message }; }
  }));
  for (const c of cs) { await c.end(); conns.splice(conns.indexOf(c), 1); }
  return out;
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [T, BAD, EMPTY]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------- DW10: the migration (rev 16.7)
  const before = all.filter((d) => d < NEW);
  ok(`FO-7mv DW10 pass: the migration has its own stamp, later than every migration before it (newest before it: ${before.at(-1)}) and after FO-7a's (P-600)`,
    all.includes(NEW) && before.includes(FO7A) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const db of [T, BAD]) for (const d of before) psql(db, ["-1", "-f", join(MIG, d, "migration.sql")]);
  ok("FO-7mv DW10 fail: before its migration there is no move table and migrate diff names money_move_batch", sql(T, `select count(*) from pg_tables where tablename like 'money\\_move%'`) === "0" && moneyDiff(T).some((l) => /money_move_batch/.test(l)));
  const seed = (db: string, key: string) => {
    const f = sql(db, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), '${key}', '${key}', 'CA', 'office@${key}.example.com', now()) returning id`);
    sql(db, `insert into money_payment_settings (firm_id, updated_by, updated_at, trust_enabled) values ('${f}', 'user-O', now(), true)`);
    return f;
  };
  const firmA = seed(T, "firm-mv-a"), firmB = seed(T, "firm-mv-b"), firmX = seed(BAD, "firm-mv-x");
  // Fixtures (firm A unless named): an issued invoice of one fee line, money into trust with its deposit, entries.
  const P1 = u(1), P2 = u(2), P3 = u(3), P4 = u(4);
  let n = 0; const key = () => `key-fo7mv-${String(++n).padStart(6, "0")}`;
  const invoice = (db: string, total: number, pid = P1, f = firmA) => {
    const id = randomUUID();
    sql(db, `insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${id}', '${f}', '${pid}', 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${f}', '${id}', 1, 'FEE', 'Consultation', 1, ${total}, ${total}, 'CAD');
      update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${id}'`);
    return id;
  };
  const entry = (kind: string, amount: number, x: { inv?: string; pay?: string; corrects?: string; reason?: string; ck?: string; pid?: string; f?: string } = {}) =>
    `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, invoice_id, corrects_entry_id, ${x.ck ? "correction_kind, " : ""}reason, ${kind === "REFUND_TO_CLIENT" ? "refund_method, refunded_on, " : ""}created_by) values ('${x.f ?? firmA}', '${x.pid ?? P1}', '${kind}', ${amount}, 'CAD', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.corrects ? `'${x.corrects}'` : "null"}, ${x.ck ? `'${x.ck}', ` : ""}${x.reason ? `'${x.reason}'` : "null"}, ${kind === "REFUND_TO_CLIENT" ? "'E_TRANSFER', current_date, " : ""}'user-R') returning id`;
  const depositQ = (amount: number, pid = P1, f = firmA, method = "E_TRANSFER", cleared = true) => { const p = randomUUID();
    return `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${p}', '${f}', '${method}', ${amount}, 'CAD', 'TRUST', now(), '${key()}', 'user-R', ${cleared}); ${entry("DEPOSIT", amount, { pay: p, pid, f })}`; };
  const deposit = (amount: number, pid = P1, method = "E_TRANSFER", cleared = true) => last(T, depositQ(amount, pid, firmA, method, cleared));
  const withdraw = (inv: string, amount: number, pid = P1) => sql(T, entry("WITHDRAWAL_TO_INVOICE", -amount, { inv, pid }));
  const giveBackQ = (w: string, amount: number, pid = P1) => entry("CORRECTION", amount, { corrects: w, reason: "Returned before moving: invoice disputed", pid });
  const correctQ = (dep: string, amount: number, ck: string | undefined, pid = P1) => entry("CORRECTION", -amount, { corrects: dep, reason: "Deposit corrected", ck, pid });
  // One "I moved these": a batch and its lines in one transaction (AG-6-73 rule 3).
  type L = { kind?: string; src: string; amount: number; cur?: string; pid?: string };
  const moveQ = (lines: L[], o: { cur?: string; dir?: string; f?: string; id?: string } = {}) => { const b = o.id ?? randomUUID();
    return `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${b}', '${o.f ?? firmA}', '${o.cur ?? "CAD"}', '${o.dir ?? "TRUST_TO_OPERATING"}', '2026-11-20', 'user-R');
      ${lines.map((l) => `insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id${l.pid ? ", person_id" : ""}) values ('${o.f ?? firmA}', '${b}', '${l.kind ?? "TRUST_APPLIED"}', '${o.dir ?? "TRUST_TO_OPERATING"}', '${l.cur ?? o.cur ?? "CAD"}', ${l.amount}, '${l.src}'${l.pid ? `, '${l.pid}'` : ""});`).join("\n")} commit; select '${b}'`; };
  const move = (lines: L[], o: { cur?: string; dir?: string } = {}) => last(T, moveQ(lines, o));
  const undoQ = (batch: string, reason: string | null = "Recorded the wrong bank transfer") =>
    `insert into money_move_batch (firm_id, currency, direction, undoes_batch_id, reason, recorded_by) select firm_id, currency, direction, id, ${reason === null ? "null" : `'${reason}'`}, 'user-R' from money_move_batch where id = '${batch}' returning id`;
  const open = (src: string) => sql(T, `select coalesce((select open_minor from money_to_move where source_entry_id = '${src}'), 0)`);
  const balance = (pid = P1) => sql(T, `select coalesce((select balance_after_minor from money_trust_entry where firm_id = '${firmA}' and person_id = '${pid}' order by seq desc limit 1), 0)`);

  // A correction of a deposit with no kind stops the migration (rev 16.7: measured right after it, never newest).
  last(BAD, `${depositQ(5000, P1, firmX)}`);
  const dx = sql(BAD, `select id from money_trust_entry where kind = 'DEPOSIT'`);
  sql(BAD, `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, corrects_entry_id, reason, created_by) values ('${firmX}', '${P1}', 'CORRECTION', -5000, 'CAD', '${dx}', 'Cheque bounced', 'user-R')`);
  ok("FO-7mv DW10 fail: a database holding a correction of a deposit (no kind) refuses the migration with words that say so",
    refused(BAD, readFileSync(join(MIG, NEW, "migration.sql"), "utf8"), /1 correction\(s\) of a deposit have no correction kind .* cannot be given one: ask the tech lead/) && sql(BAD, `select count(*) from pg_tables where tablename like 'money\\_move%'`) === "0");
  const fnBefore = fns(T); last(T, depositQ(100, P4));  // a deposit (not a correction) does not stop it
  psql(T, ["-1", "-f", join(MIG, NEW, "migration.sql")]);
  const added = fns(T).filter((f) => !fnBefore.includes(f));
  ok("FO-7mv DW10 pass: right after its own migration the five functions it adds are all money_ (none of FO-7a's replaced)",
    added.length === 5 && added.every((f) => f.startsWith("money_")) && fnBefore.includes("money_trust_entry_write"), added);
  // FO-7ts part 1 replaces trust_enabled with the three-state answer and refuses a row still saying true: trust goes
  // off for that one step, then the Owner's Yes turns it on again.
  for (const d of all.filter((x) => x > NEW)) {
    if (d === FO7TS) sql(T, `update money_payment_settings set trust_enabled = false`);
    psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]);
    if (d === FO7TS) sql(T, `update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O'`);
  }
  for (const d of all) psql(EMPTY, ["-1", "-f", join(MIG, d, "migration.sql")]);
  ok("FO-7mv DW10 pass: migrate diff names no money table or type, on the copy with rows and on the empty one", moneyDiff(T).length === 0 && moneyDiff(EMPTY).length === 0, [moneyDiff(T), moneyDiff(EMPTY)]);
  ok("FO-7mv pass: firm_id is first in every move index (primary keys aside), and every move key is RESTRICT and starts with firm_id",
    sql(T, `select count(*) from pg_index i join pg_class c on c.oid = i.indrelid left join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
      where c.relname like 'money\\_move%' and not i.indisprimary and a.attname <> 'firm_id'`) === "0"
    && sql(T, `select bool_and(confdeltype = 'r' and confupdtype = 'r' and exists (select 1 from pg_attribute a where a.attrelid = conrelid and a.attnum = conkey[1] and a.attname = 'firm_id')) from pg_constraint where contype = 'f' and conrelid::regclass::text like 'money\\_move%'`) === "t");
  ok("FO-7mv pass: amounts are integers in minor units (the line and every amount of money_to_move), the transfer date is a date",
    sql(T, `select string_agg(table_name || '.' || column_name || ':' || data_type, ',' order by table_name, column_name) from information_schema.columns where table_name like 'money\\_%' and table_name <> 'money_trust_shortfall' and table_name not in (select tablename from pg_tables where tablename like 'money\\_%' and tablename not like 'money\\_move%') and (column_name like '%\\_minor' or data_type = 'date')`)
      === "money_move_batch.transfer_date:date,money_move_line.amount_minor:integer,money_to_move.eligible_minor:integer,money_to_move.moved_minor:integer,money_to_move.open_minor:integer,money_to_move.returned_minor:integer");

  // ------------------------------------------------------------------------------- correction kinds (B-19)
  const D0 = deposit(500000);  // P1's money, enough for the cases below
  ok("FO-7mv fail (B-19): a correction of a deposit with no kind is refused; with RECORDED_BY_MISTAKE it is written",
    refused(T, correctQ(D0, 100, undefined), /a correction of a deposit says why it was made/, "23514") && !!sql(T, correctQ(D0, 100, "RECORDED_BY_MISTAKE")));
  // Lead B (rev 16.51): a refusal from the AFTER trigger rolls its statement back — no row, no ledger effect.
  const ledger = () => sql(T, `select count(*) || ':' || coalesce((select balance_after_minor || '/' || seq from money_trust_entry where firm_id = '${firmA}' and person_id = '${P1}' order by seq desc limit 1), '0') from money_trust_entry where firm_id = '${firmA}'`);
  { const was = ledger(), refusedNoKind = refused(T, correctQ(D0, 200, undefined), /says why it was made/, "23514"), after = ledger(); sql(T, correctQ(D0, 200, "RECORDED_BY_MISTAKE")); const written = ledger();
    ok("FO-7mv fail/pass (Lead B rev 16.51): a refused deposit correction (no kind) leaves no row and the balance and seq as they were; the same correction with a kind writes one row and moves the balance",
      refusedNoKind && after === was && written !== was && Number(written.split(":")[0]) === Number(was.split(":")[0]) + 1, [was, after, written]); }
  const inv0 = invoice(T, 10000), W0 = withdraw(inv0, 1000);
  ok("FO-7mv fail: a correction kind on a return from a withdrawal, or on a refund to the client, is refused",
    refused(T, entry("CORRECTION", 100, { corrects: W0, reason: "x", ck: "WRONG_ACCOUNT" }), /only a correction of a deposit has a correction kind/, "23514")
    && refused(T, entry("REFUND_TO_CLIENT", -100, { reason: "x", ck: "RETURNED" }), /money_trust_entry_correction_kind_check/, "23514"));

  // ------------------------------------------------------------------------------- DW1 (B-18)
  {
    const inv = invoice(T, 10000), W = withdraw(inv, 10000); const outcomes: string[] = [];
    for (let k = 0; k < 3; k++) {
      outcomes.push(k === 0 ? "w" : refused(T, entry("WITHDRAWAL_TO_INVOICE", -10000, { inv }), /already paid from trust/) ? "w-refused" : "w?");
      outcomes.push(k === 0 ? (move([{ src: W, amount: 10000 }]) ? "m" : "m?") : refused(T, moveQ([{ src: W, amount: 10000 }]), /would move more than this entry still holds \(0 CAD to move/, "23514") ? "m-refused" : "m?");
      outcomes.push(refused(T, giveBackQ(W, 10000), /10000 CAD of this trust application has moved to operating, so only 0 can come back to trust: undo that move batch first/, "23514") ? "r-refused" : "r?");
    }
    const moved = sql(T, `select sum(amount_minor) from money_move_line where source_entry_id = '${W}'`);
    ok("FO-7mv DW1 fail (B-18): \"withdraw 100, move 100, return 100\" three times on one 100.00 invoice moves 100.00 once; the second move and every return of moved money are refused",
      outcomes.join(",") === "w,m,r-refused,w-refused,m-refused,r-refused,w-refused,m-refused,r-refused" && moved === "10000" && open(W) === "0", outcomes);
    // The other order (#1758 B-18): withdraw W1, return all of it, withdraw W2, then move 100.00 for each.
    const inv2 = invoice(T, 10000), W1 = withdraw(inv2, 10000); sql(T, giveBackQ(W1, 10000)); const W2 = withdraw(inv2, 10000);
    ok("FO-7mv DW1 fail (B-18, other order): after W1 is fully returned and W2 applied, a 100.00 move of W1 is refused; W2's 100.00 moves",
      refused(T, moveQ([{ src: W1, amount: 10000 }, { src: W2, amount: 10000 }]), /would move more than this entry still holds \(0 CAD to move: 10000 less 10000 returned/) && !!move([{ src: W2, amount: 10000 }]) && open(W2) === "0");
    // Undo first, then the return is accepted (rule 2's words).
    const inv3 = invoice(T, 10000), W3 = withdraw(inv3, 10000), B3 = move([{ src: W3, amount: 6000 }]);
    const l0 = ledger(), back40 = !!sql(T, giveBackQ(W3, 4000)), l1 = ledger(), no1 = refused(T, giveBackQ(W3, 1), /6000 CAD of this trust application has moved to operating, so only 0 can come back/), l2 = ledger();
    ok("FO-7mv DW1 pass/fail (Lead B rev 16.51): with 60.00 of a 100.00 application moved, 40.00 comes back to trust (one row, +40.00); 0.01 more is refused and leaves no row and no ledger effect; after the undo the rest comes back",
      back40 && l1 !== l0 && no1 && l2 === l1 && sql(T, `select count(*) from money_trust_entry where corrects_entry_id = '${W3}'`) === "1" && !!sql(T, undoQ(B3)) && !!sql(T, giveBackQ(W3, 6000)) && open(W3) === "0", [l0, l1, l2]);
  }

  // ------------------------------------------------------------------------------- DW2: parallel moves
  for (const iso of ["read committed", "repeatable read"]) {
    const inv = invoice(T, 10000), W = withdraw(inv, 10000);
    const r = await race([moveQ([{ src: W, amount: 10000 }]).replace(/^begin;|commit; select .*$/g, ""), moveQ([{ src: W, amount: 10000 }]).replace(/^begin;|commit; select .*$/g, "")], iso);
    ok(`FO-7mv DW2 fail (parallel, ${iso}): two moves of one 100.00 withdrawal at once — one commits, the other is refused; 100.00 moved`,
      r.filter((x) => x.ok).length === 1 && r.some((x) => ["23514", "23505", "40001"].includes(x.code ?? "")) && sql(T, `select sum(amount_minor) from money_move_line where source_entry_id = '${W}'`) === "10000", r);
    const inv2 = invoice(T, 10000), V = withdraw(inv2, 10000);
    const r2 = await race([moveQ([{ src: V, amount: 10000 }]).replace(/^begin;|commit; select .*$/g, ""), giveBackQ(V, 10000)], iso);
    const movedV = Number(sql(T, `select coalesce(sum(amount_minor), 0) from money_move_line where source_entry_id = '${V}'`)), backV = Number(sql(T, `select coalesce(sum(amount_minor), 0) from money_trust_entry where corrects_entry_id = '${V}'`));
    ok(`FO-7mv DW2 fail (parallel, ${iso}; B-18): a move and a return of one 100.00 withdrawal at once — one commits; moved + returned never pass 100.00`,
      r2.filter((x) => x.ok).length === 1 && movedV + backV === 10000, { r2, movedV, backV });
  }

  // ------------------------------------------------------------------------------- DW3, DW4, DW5 (B-19)
  {
    const C = deposit(30000, P2, "CHEQUE"), bounced = sql(T, correctQ(C, 30000, "RETURNED", P2));
    ok("FO-7mv DW3 fail (B-19 a): a bounced cheque corrected −300.00 (RETURNED), then a 300.00 wrong-account move of it → refused; not on the list",
      refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: bounced, amount: 30000 }]), /only a WRONG_ACCOUNT correction of a deposit licenses .* \(this entry is a RETURNED CORRECTION\)/, "23514") && open(bounced) === "0");
    deposit(50000, P3); const D = deposit(20000, P3);
    sql(T, entry("REFUND_TO_CLIENT", -20000, { reason: "Returned unused money", pid: P3 })); const err = sql(T, correctQ(D, 20000, "RECORDED_BY_MISTAKE", P3));
    ok("FO-7mv DW4 fail (B-19 b): a 200.00 deposit refunded and then corrected −200.00 (RECORDED_BY_MISTAKE), then a move → refused",
      refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: err, amount: 20000 }]), /only a WRONG_ACCOUNT correction .*RECORDED_BY_MISTAKE CORRECTION/, "23514")
      && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: D, amount: 100 }]), /only a WRONG_ACCOUNT correction .*\(this entry is a DEPOSIT\)/, "23514"));
    const WD = deposit(15000, P2), wrong = sql(T, correctQ(WD, 15000, "WRONG_ACCOUNT", P2));
    ok("FO-7mv DW5 pass/fail: a WRONG_ACCOUNT correction of 150.00 is on the list, 151.00 is refused, 150.00 moves, then 0.01 more is refused",
      open(wrong) === "15000" && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: wrong, amount: 15100 }]), /15000 CAD to move/, "23514")
      && !!move([{ kind: "WRONG_ACCOUNT", src: wrong, amount: 15000 }]) && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: wrong, amount: 1 }]), /0 CAD to move/) && open(wrong) === "0");
    ok("FO-7mv fail: a move's kind matches its entry (a trust application of a correction, a wrong-account move of a withdrawal), a card fee waits for FO-7c, and nothing moves into trust yet",
      refused(T, moveQ([{ kind: "TRUST_APPLIED", src: wrong, amount: 1 }]), /a trust application moves a withdrawal to an invoice, not a CORRECTION/)
      && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: W0, amount: 1 }]), /only a WRONG_ACCOUNT correction/)
      && refused(T, moveQ([{ kind: "CARD_FEE_ON_TRUST", src: W0, amount: 1 }], { dir: "OPERATING_TO_TRUST" }), /card fees on the trust account wait .*FO-7c/)
      && refused(T, moveQ([{ src: W0, amount: 1 }], { dir: "OPERATING_TO_TRUST" }), /moves from trust to operating/));
  }

  // ------------------------------------------------------------------------------- DW7: undo
  {
    const inv = invoice(T, 10000), W = withdraw(inv, 10000), B = move([{ src: W, amount: 10000 }]);
    ok("FO-7mv DW7 fail: an undo with no reason, or a reason naming no batch, is refused",
      refused(T, undoQ(B, null), /money_move_batch_kind_check/, "23514")
      && refused(T, `insert into money_move_batch (firm_id, currency, direction, transfer_date, reason, recorded_by) values ('${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'Wrong batch', 'user-R')`, /money_move_batch_kind_check/, "23514"));
    const U = sql(T, undoQ(B));
    ok("FO-7mv DW7 pass: an undo with a reason puts the line's 100.00 back on the list (the batch is never edited)", !!U && open(W) === "10000");
    ok("FO-7mv DW7 fail: a second undo of one batch, an undo of an undo, an undo in another currency, and a line on an undo batch are refused",
      refused(T, undoQ(B), /money_move_batch_firm_id_undoes_batch_id_key/, "23505") && refused(T, undoQ(U), /an undo is never undone/)
      && refused(T, `insert into money_move_batch (firm_id, currency, direction, undoes_batch_id, reason, recorded_by) values ('${firmA}', 'USD', 'TRUST_TO_OPERATING', '${B}', 'x', 'user-R')`, /currency and direction of the batch it undoes/)
      && refused(T, `insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${U}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 1, '${W}')`, /an undo batch carries no lines/));
    const Bp = move([{ src: W, amount: 10000 }]), r = await race([undoQ(Bp), undoQ(Bp)]);
    ok("FO-7mv DW7 fail (parallel): two undos of one batch at once — one written, the other refused (23505)", r.filter((x) => x.ok).length === 1 && r.some((x) => x.code === "23505") && open(W) === "10000", r);
    const B2 = randomUUID();
    ok("FO-7mv DW7 fail (B-16): a line added to a recorded batch later, or to a batch undone in its own transaction, is refused",
      !!move([{ src: W, amount: 100 }]) && refused(T, `insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) select '${firmA}', batch_id, 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 100, '${W}' from money_move_line where source_entry_id = '${W}' order by created_at desc limit 1`, /a recorded batch is never added to/)
      && refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${B2}', '${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${B2}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 100, '${W}'); ${undoQ(B2)}; insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${B2}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 100, '${W}'); commit;`, /an undone batch never gains a line/));
    ok("FO-7mv fail: a batch with no line is refused at commit (an empty \"I moved these\" records nothing)",
      refused(T, `insert into money_move_batch (firm_id, currency, direction, transfer_date, recorded_by) values ('${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R')`, /a batch records at least one line/));
  }

  // ------------------------------------------------------------------------------- DW8: currency, party, insert-only
  {
    const inv = invoice(T, 10000), W = withdraw(inv, 5000);
    ok("FO-7mv DW8 fail: a CAD line in a USD batch, a USD line in a CAD batch, a line whose party or invoice differs from its entry's, and another firm's entry are refused",
      refused(T, moveQ([{ src: W, amount: 100, cur: "CAD" }], { cur: "USD" }), /a line is in its batch's currency and direction \(USD TRUST_TO_OPERATING\); CAD and USD never share a batch/)
      && refused(T, moveQ([{ src: W, amount: 100, cur: "USD" }]), /batch's currency/)
      && refused(T, moveQ([{ src: W, amount: 100, pid: P2 }]), /a line's invoice and party are its trust entry's/)
      && refused(T, moveQ([{ src: W, amount: 100 }], { f: firmB }), /trust entry .* is not visible to this statement/, "23503"));
    const B = move([{ src: W, amount: 2000 }]);
    ok("FO-7mv DW8 pass: a line takes its entry's invoice and party (copied by the database) and its batch's currency; the time is the database's",
      sql(T, `select (invoice_id = '${inv}' and person_id = '${P1}' and company_id is null and move_ordinal = 1 and currency = 'CAD')::text from money_move_line where batch_id = '${B}'`) === "true"
      && sql(T, `select (recorded_at > now() - interval '1 minute')::text from money_move_batch where id = '${B}'`) === "true");
    ok("FO-7mv DW8 fail: UPDATE, DELETE and TRUNCATE on both move tables are refused (insert-only)",
      ["money_move_batch", "money_move_line"].every((t) => refused(T, `update ${t} set firm_id = firm_id`, /never changed or removed \(UPDATE refused\)/, "42501")
        && refused(T, `delete from ${t}`, /never changed or removed \(DELETE refused\)/, "42501") && refused(T, `truncate ${t} cascade`, /never changed or removed/, "42501")));
  }

  // ------------------------------------------------------------------------------- DW9: the derived list (AG-6-73 tests)
  {
    deposit(200000, P4);
    const i1 = invoice(T, 16950, P4), i2 = invoice(T, 96050, P4), w1 = withdraw(i1, 16950, P4), w2 = withdraw(i2, 96050, P4);
    const total = () => sql(T, `select coalesce(sum(open_minor), 0) || ':' || count(*) from money_to_move where firm_id = '${firmA}' and person_id = '${P4}' and currency = 'CAD' and direction = 'TRUST_TO_OPERATING'`);
    ok("FO-7mv DW9 pass (AG-6-73 test 1): INV for 169.50 and INV for 960.50 paid from trust → the list shows CAD 1,130.00 trust → operating in two lines", total() === "113000:2");
    sql(T, entry("CORRECTION", 96050, { corrects: w2, reason: "Client disputes this invoice: trust returned", pid: P4 }));
    ok("FO-7mv DW9 fail (AG-6-73 test 3): after a dispute returns 960.50 before the move, that line is removed and the total is 169.50; moving the 960.50 is refused",
      total() === "16950:1" && open(w2) === "0" && refused(T, moveQ([{ src: w2, amount: 96050, pid: P4 }]), /0 CAD to move: 96050 less 96050 returned/));
    move([{ src: w1, amount: 16950 }]);
    ok("FO-7mv DW9 pass: after \"I moved these\" the list is empty; firm B sees none of firm A's lines", total() === "0:0" && sql(T, `select count(*) from money_to_move where firm_id = '${firmB}'`) === "0");
  }

  // ------------------------------------------------------------------------------- the breaker's rounds 1-2 and the review's Minors
  {
    // The cover check for uncleared payments and the invoice cap after credit notes are FO-7a2's (Lead 65, P-638).
    const P7 = u(7), clear = (dep: string) => sql(T, `update money_payment set cleared = true, cleared_at = now(), cleared_by = 'user-R' where id = (select payment_id from money_trust_entry where id = '${dep}')`);
    const chq2 = deposit(30000, P7, "CHEQUE", false), wa = sql(T, correctQ(chq2, 30000, "WRONG_ACCOUNT", P7));
    ok("FO-7mv fail/pass (break B-2): a WRONG_ACCOUNT correction of a cheque not yet cleared waits for the cheque; after it clears, it moves",
      open(wa) === "0" && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: wa, amount: 30000, pid: P7 }]), /not cleared, or was returned; it moves only once it has cleared/) && (clear(chq2), open(wa) === "30000" && !!move([{ kind: "WRONG_ACCOUNT", src: wa, amount: 30000, pid: P7 }])));
    // The re-review's Major 1 (2abc41df3): cleared money beside the cheque must not let the cheque's own wrong-account money out.
    const P8 = u(8);
    deposit(50000, P8); const chq8 = deposit(30000, P8, "CHEQUE", false), wa8 = sql(T, correctQ(chq8, 30000, "WRONG_ACCOUNT", P8));
    ok("FO-7mv fail (re-review Major 1): e-transfer 500.00, an uncleared cheque 300.00 corrected WRONG_ACCOUNT — the 300.00 is not listed and does not move until the cheque clears",
      open(wa8) === "0" && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: wa8, amount: 30000, pid: P8 }]), /not cleared, or was returned/, "23514"));
    ok("FO-7mv fail (break B-9): a transfer date of infinity or 4713 BC is refused",
      refused(T, moveQ([{ src: W0, amount: 1 }]).replace("'2026-11-20'", "'infinity'"), /money_move_batch_date_check/) && refused(T, moveQ([{ src: W0, amount: 1 }]).replace("'2026-11-20'", "'4713-01-01 BC'"), /money_move_batch_date_check/));
    ok("FO-7mv fail (review m1): a USD line in a USD batch for a CAD entry is refused", refused(T, moveQ([{ src: W0, amount: 1 }], { cur: "USD" }), /a line is in its entry's currency \(CAD\)/));
    { const P9 = u(11); deposit(100000, P9); const chq9 = deposit(30000, P9, "CHEQUE", false), wa9 = sql(T, correctQ(chq9, 10000, "WRONG_ACCOUNT", P9)); sql(T, correctQ(chq9, 20000, "RETURNED", P9)); const ticked = refused(T, `update money_payment set cleared = true, cleared_at = now(), cleared_by = 'user-R' where id = (select payment_id from money_trust_entry where id = '${chq9}')`, /never ticked cleared/);
      ok("FO-7mv fail (break B-20): a cheque returned cannot be ticked cleared (FO-7a2, B-17), and its wrong-account 100.00 is not listed and does not move",
        ticked && open(wa9) === "0" && refused(T, moveQ([{ kind: "WRONG_ACCOUNT", src: wa9, amount: 10000, pid: P9 }]), /not cleared, or was returned/, "23514")); }
    { // break B-22 (READ COMMITTED): a "Returned" still open while a wrong-account move waits on the party's lock.
      const P12 = u(12); deposit(100000, P12); const chq = deposit(30000, P12, "CHEQUE", false), wa = sql(T, correctQ(chq, 10000, "WRONG_ACCOUNT", P12)); clear(chq);
      const c1 = new pg.Client({ connectionString: urlOf(T) }), c2 = new pg.Client({ connectionString: urlOf(T) }); await c1.connect(); await c2.connect(); conns.push(c1, c2);
      await c1.query("begin"); await c1.query(correctQ(chq, 20000, "RETURNED", P12));
      const mv = c2.query(moveQ([{ kind: "WRONG_ACCOUNT", src: wa, amount: 10000, pid: P12 }])).then(() => "moved", async (e: { message?: string }) => { await c2.query("rollback").catch(() => undefined); return String(e.message); });
      await new Promise((r) => setTimeout(r, 300)); await c1.query("commit"); const out = await mv;
      for (const c of [c1, c2]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
      ok("FO-7mv fail (break B-22, parallel, READ COMMITTED): a move waiting on an open \"Returned\" reads it after the lock and is refused", /not cleared, or was returned/.test(out), out); }
    const B3 = randomUUID();
    ok("FO-7mv fail (review m3): a line, then the batch's undo, then commit — refused at commit (an undone batch never gains a line)",
      refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${B3}', '${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${firmA}', '${B3}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 1, '${W0}'); ${undoQ(B3)}; commit;`, /an undone batch never gains a line/));
    for (const iso of ["read committed", "repeatable read"]) {
      const d = deposit(15000, P2), c = sql(T, correctQ(d, 15000, "WRONG_ACCOUNT", P2)), q = () => moveQ([{ kind: "WRONG_ACCOUNT", src: c, amount: 15000, pid: P2 }]).replace(/^begin;|commit; select .*$/g, "");
      const r = await race([q(), q()], iso);
      ok(`FO-7mv fail (review m2; parallel, ${iso}): two wrong-account moves of one 150.00 correction at once — one commits, 150.00 moved`,
        r.filter((x) => x.ok).length === 1 && sql(T, `select sum(amount_minor) from money_move_line where source_entry_id = '${c}'`) === "15000", r);
    }
  }

  // ------------------------------------------------------------------------------- DW6: a generated sequence against a model
  {
    let seed = Number(process.env.FO7MV_SEED ?? 7_301); const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed >>> 16) % k; };
    const P = u(9), c = new pg.Client({ connectionString: urlOf(T) }); await c.connect(); conns.push(c);
    const run = async (q: string) => { try { const r = await c.query(q) as unknown as pg.QueryResult | pg.QueryResult[]; const x = Array.isArray(r) ? r.filter((y) => y.rows?.length).at(-1) : r; return { ok: true, v: x?.rows?.[0] ? String(Object.values(x.rows[0])[0]) : "" }; }
      catch (e) { await c.query("rollback").catch(() => undefined); return { ok: false, v: String((e as Error).message) }; } };
    const invs = [invoice(T, 300000, P), invoice(T, 300000, P), invoice(T, 300000, P)];
    // The model: each source's eligible, returned and moved (net of undone); each batch's lines; the bank's trust account.
    type Src = { id: string; kind: "W" | "C"; ck?: string; dep?: string; eligible: number; returned: number };
    const returnedDeps = new Set<string>();  // a deposit "Returned" freezes its wrong-account money (B-20)
    const srcs: Src[] = [], deps: { id: string; amount: number }[] = [], batches: { id: string; lines: { src: string; amount: number }[]; undone: boolean; isUndo: boolean }[] = [];
    let bank = 0, steps = 0, mismatch: string[] = [], movesOk = 0, movesNo = 0, returnsOk = 0, returnsNo = 0, undos = 0;
    const movedOf = (s: string) => batches.filter((b) => !b.undone && !b.isUndo).flatMap((b) => b.lines).filter((l) => l.src === s).reduce((a, l) => a + l.amount, 0);
    const cap = (s: Src) => s.kind === "W" ? s.eligible - s.returned : s.ck === "WRONG_ACCOUNT" && !returnedDeps.has(s.dep ?? "") ? s.eligible : 0;
    const frozen = () => srcs.filter((s) => s.kind === "C" && s.ck === "WRONG_ACCOUNT" && returnedDeps.has(s.dep ?? "")).reduce((a, s) => a + s.eligible - movedOf(s.id), 0);
    const amt = () => [1, 100, 2500, 10000, 40000][rnd(5)] + rnd(3);
    for (let step = 0; steps < 240; step++) {
      const op = rnd(10), ws = srcs.filter((s) => s.kind === "W"), w = ws[rnd(Math.max(ws.length, 1))];
      if (op === 0 || deps.length < 2) {
        const a = 20000 + rnd(50000), r = await run(depositQ(a, P)); if (r.ok) { deps.push({ id: r.v, amount: a }); bank += a; } else mismatch.push(`${step} deposit ${r.v}`);
      } else if (op <= 2) {
        const a = amt(), r = await run(entry("WITHDRAWAL_TO_INVOICE", -a, { inv: invs[rnd(3)], pid: P })); if (r.ok) srcs.push({ id: r.v, kind: "W", eligible: a, returned: 0 });
      } else if (op === 3 && w) {
        const a = rnd(2) ? amt() : Math.max(cap(w) - movedOf(w.id), 1), expect = a <= w.eligible - w.returned - movedOf(w.id);
        const r = await run(giveBackQ(w.id, a, P)); if (r.ok) { w.returned += a; returnsOk++; } else returnsNo++;
        if (r.ok !== expect) mismatch.push(`${step} return ${a} of ${w.id}: db ${r.ok} model ${expect} ${r.v}`);
      } else if (op === 4 && deps.length) {
        const d = deps[rnd(deps.length)], ck = ["RETURNED", "WRONG_ACCOUNT", "RECORDED_BY_MISTAKE"][rnd(3)], a = amt();
        const r = await run(correctQ(d.id, a, ck, P)); if (r.ok) { srcs.push({ id: r.v, kind: "C", ck, dep: d.id, eligible: a, returned: 0 }); if (ck !== "WRONG_ACCOUNT") bank -= a; if (ck === "RETURNED") returnedDeps.add(d.id); }
      } else if (op === 5) {
        const a = amt(), r = await run(entry("REFUND_TO_CLIENT", -a, { reason: "Returned unused money", pid: P })); if (r.ok) bank -= a;
      } else if (op <= 8 && srcs.length) {
        const pick = () => srcs[rnd(srcs.length)], lines = Array.from({ length: 1 + rnd(2) }, () => { const s = pick(); return { s, amount: rnd(3) ? Math.max(cap(s) - movedOf(s.id), 1) - rnd(2) : amt() }; });
        let expect = true; const acc = new Map<string, number>();
        for (const l of lines) { const sofar = (acc.get(l.s.id) ?? 0) + l.amount; acc.set(l.s.id, sofar); if (l.amount <= 0 || cap(l.s) === 0 || movedOf(l.s.id) + sofar > cap(l.s)) expect = false; }
        if (lines.some((l) => l.amount <= 0)) continue;
        const id = randomUUID(), r = await run(moveQ(lines.map((l) => ({ kind: l.s.kind === "W" ? "TRUST_APPLIED" : "WRONG_ACCOUNT", src: l.s.id, amount: l.amount, pid: P })), { id }));
        if (r.ok) { batches.push({ id, lines: lines.map((l) => ({ src: l.s.id, amount: l.amount })), undone: false, isUndo: false }); bank -= lines.reduce((a, l) => a + l.amount, 0); movesOk++; } else movesNo++;
        if (r.ok !== expect) mismatch.push(`${step} move ${JSON.stringify(lines.map((l) => [l.s.kind, l.s.ck, l.amount, cap(l.s), movedOf(l.s.id)]))}: db ${r.ok} model ${expect} ${r.v}`);
      } else if (batches.length) {
        const b = batches[rnd(batches.length)], expect = !b.undone && !b.isUndo, r = await run(undoQ(b.id));
        if (r.ok) { b.undone = true; bank += b.lines.reduce((a, l) => a + l.amount, 0); batches.push({ id: r.v, lines: [], undone: false, isUndo: true }); undos++; }
        if (r.ok !== expect) mismatch.push(`${step} undo: db ${r.ok} model ${expect} ${r.v}`);
      }
      steps++;
      // After every step: the ledger never below zero; no source moved past what it holds; ledger + list = the bank.
      const inv = (await c.query(`select
          (select coalesce(min(balance_after_minor), 0) from money_trust_entry where person_id = '${P}') as low,
          (select coalesce(balance_after_minor, 0) from money_trust_entry where person_id = '${P}' order by seq desc limit 1) as bal,
          (select coalesce(sum(open_minor), 0) from money_to_move where person_id = '${P}') as listed,
          (select count(*) from money_move_line l join money_trust_entry e on e.id = l.source_entry_id where l.person_id = '${P}' group by l.source_entry_id, e.amount_minor, e.id
             having sum(l.amount_minor) filter (where not exists (select 1 from money_move_batch u where u.undoes_batch_id = l.batch_id))
               > -e.amount_minor - (select coalesce(sum(r.amount_minor), 0) from money_trust_entry r where r.corrects_entry_id = e.id) limit 1) as over`)).rows[0];
      if (inv.over !== null || Number(inv.bal) + Number(inv.listed) + frozen() !== bank) mismatch.push(`${step} invariant ${JSON.stringify(inv)} bank ${bank}`);
    }
    await c.end(); conns.splice(conns.indexOf(c), 1);
    ok(`FO-7mv DW6 pass (P-607 (1)): 240 generated steps (moves ${movesOk} written / ${movesNo} refused, returns ${returnsOk}/${returnsNo}, ${undos} undos) — the database agrees with the model at every step, the balance goes below zero only after a reversal (FO-7a2's check), no entry moves past what it holds, and ledger + list (+ wrong-account money frozen by a return) = the bank's trust account`,
      mismatch.length === 0 && movesOk > 10 && movesNo > 10 && returnsOk > 3 && returnsNo > 3 && undos > 3, mismatch.slice(0, 5));
    ok("FO-7mv DW6 fail: the same invariant query sees a move past its entry (written with the trigger off, inside a rolled-back transaction)",
      sql(T, `begin; alter table money_move_line disable trigger money_move_line_write; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${u(77)}', '${firmA}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R');
        insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id, person_id, move_ordinal) values ('${firmA}', '${u(77)}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 999999, '${W0}', '${P1}', 99);
        select count(*) from (select 1 from money_move_line l join money_trust_entry e on e.id = l.source_entry_id group by e.id having sum(l.amount_minor) > -e.amount_minor) x; rollback;`).split("\n").filter(Boolean).at(-1) !== "0"
      && sql(T, `select count(*) from pg_trigger where tgname = 'money_move_line_write' and tgenabled = 'O'`) === "1");
  }
  ok("FO-7mv pass: P1's ledger still sums to its entries (seq 1..n, running balance) after every case above", sql(T, `select bool_and(seq = rn and balance_after_minor = running) from (select seq, balance_after_minor, row_number() over w as rn, sum(amount_minor) over w as running
      from money_trust_entry where firm_id = '${firmA}' window w as (partition by person_id, company_id, currency order by seq)) t`) === "t" && Number(balance()) >= 0);
} finally {
  for (const c of conns) await c.end().catch(() => undefined);
  for (const db of [T, BAD, EMPTY]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
