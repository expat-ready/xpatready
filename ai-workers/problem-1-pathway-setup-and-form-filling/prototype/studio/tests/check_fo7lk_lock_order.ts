// FO-7lk (brief product/design/build-lead-c-briefs/FO-7lk.md; Lead 73's money read on #1991): one key and one order for
// the party's trust lock. money_trust_lock(firm, party, currency) is the only place the key is written; "Move back to
// trust" (a credit note, OVERPAID_TO_TRUST) takes the party's lock before the invoice row, as a withdrawal does.
// Four scratch databases: "t" gets every migration (the cases run here); "pre" every migration before FO-7lk's; "back"
// every migration, then FO-7lk's rollback.sql (#1991's function text); "plant" every migration, then a credit-note
// writer planted with the wrong order (the invoice row first), so the harness is shown to catch a 40P01 at all.
// No server, no browser, no model call, no Stripe call (US$0); nothing reads the clock (amounts and order only).
// All four are dropped at the end.
//   tsx studio/tests/check_fo7lk_lock_order.ts
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261118210000_fo7lk_trust_lock", FO7A2 = "20261116133000_fo7a2_ledger_rules";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const T = `xr_studio_fo7lk_t_${process.pid}`, PRE = `xr_studio_fo7lk_pre_${process.pid}`, BACK = `xr_studio_fo7lk_back_${process.pid}`, PLANT = `xr_studio_fo7lk_plant_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const RUNS = 20;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string) => psql(db, ["-Atc", q]);
const last = (db: string, q: string) => sql(db, q).split("\n").filter(Boolean).at(-1) ?? "";
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Each public function's text, by signature.
const texts = (db: string): Record<string, string> => Object.fromEntries(sql(db, `select p.oid::regprocedure::text || chr(31) || p.prosrc || chr(30) from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)
  .split("\u001e").map((r) => r.replace(/^\n/, "")).filter(Boolean).map((r) => r.split("\u001f") as [string, string]));
const INLINE = (f: string, p: string, c: string) => `pg_advisory_xact_lock(hashtextextended('money_trust:' || ${f} || ':' || ${p} || ':' || ${c}, 0))`;

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
const dbs = [T, PRE, BACK, PLANT];
for (const db of dbs) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------------------- the migration
  const before = all.filter((d) => d < NEW);
  ok(`FO-7lk pass: the migration's stamp is its own and later than every migration before it, FO-7a2's included (newest before it: ${before.at(-1)}; P-600)`,
    all.includes(NEW) && before.includes(FO7A2) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of before) for (const db of dbs) psql(db, ["-1", "-f", join(MIG, d, "migration.sql")]);
  const pre = texts(PRE);
  // Read right after this migration (as FO-7a2's check does): a later migration's own changes are not this row's. "back"
  // stops at FO-7lk plus its rollback (#1991's text); "t" and "plant" then take every later migration.
  for (const db of [T, BACK, PLANT]) psql(db, ["-1", "-f", join(MIG, NEW, "migration.sql")]);
  psql(BACK, ["-1", "-f", join(MIG, NEW, "rollback.sql")]);
  const t = texts(T), back = texts(BACK);
  for (const d of all.filter((x) => x > NEW)) for (const db of [T, PLANT]) psql(db, ["-1", "-f", join(MIG, d, "migration.sql")]);

  const changed = Object.keys(t).filter((k) => t[k] !== pre[k]).sort();
  ok("FO-7lk pass: the migration adds money_trust_lock and replaces only the four lock call sites and money_credit_note_write (functions only)",
    JSON.stringify(changed) === JSON.stringify(["money_credit_note_write()", "money_issued_invoice(uuid,uuid,\"MoneyCurrency\",text)", "money_move_batch_owed_back()", "money_move_line_write()", "money_trust_entry_write()", "money_trust_lock(uuid,uuid,\"MoneyCurrency\")"])
    && Object.keys(pre).every((k) => k in t), changed);
  // Each replaced function is its earlier text with only the lock line changed (and, in the credit note, the one block).
  const asBefore = (k: string) => t[k].replace(/PERFORM money_trust_lock\(([^,]+), ([^,]+), ([^)]+)\);/g, (_m, f, p, c) => `PERFORM ${INLINE(f, p, c)};`)
    .replace(/  -- FO-7lk: "Move back to trust"[\s\S]*?\n  END IF;\n(?=  open_amount := money_issued_invoice)/, "");
  const same = changed.filter((k) => !k.startsWith("money_trust_lock")).map((k) => [k, asBefore(k) === pre[k]] as const);
  ok("FO-7lk pass: each of the five is FO-7a's or FO-7a2's text exactly, but for its lock line (the helper in place of the inline key) and the credit note's one new block",
    same.every(([, s]) => s), same);
  ok("FO-7lk pass: the key text is written once — no function but money_trust_lock holds 'money_trust:' (it cannot drift); fail: before FO-7lk four functions held it inline",
    sql(T, `select string_agg(proname, ',' order by proname) from pg_proc where prosrc like '%''money_trust:''%'`) === "money_trust_lock"
    && sql(PRE, `select string_agg(proname, ',' order by proname) from pg_proc where prosrc like '%''money_trust:''%'`) === "money_issued_invoice,money_move_batch_owed_back,money_move_line_write,money_trust_entry_write");
  ok("FO-7lk pass: the trigger functions still run as PF-12's wall reader (SECURITY DEFINER, owner xr_wall_reader, search_path pinned); money_issued_invoice and money_trust_lock keep their caller's rights",
    sql(T, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader' and array_to_string(p.proconfig, ',') like 'search_path=%') from pg_proc p where p.proname in ('money_trust_entry_write','money_credit_note_write','money_move_line_write','money_move_batch_owed_back')`) === "t"
    && sql(T, `select bool_or(p.prosecdef) from pg_proc p where p.proname in ('money_issued_invoice','money_trust_lock')`) === "f");
  const backDiff = Object.keys({ ...pre, ...back }).filter((k) => pre[k] !== back[k]);
  ok("FO-7lk pass: rollback.sql restores #1991's (FO-7a2's) and FO-7a's function text exactly and drops the helper (every public function as before FO-7lk)",
    backDiff.length === 0 && sql(BACK, `select count(*) from pg_proc where proname = 'money_trust_lock'`) === "0"
    && sql(BACK, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader') from pg_proc p where p.proname in ('money_trust_entry_write','money_credit_note_write','money_move_line_write','money_move_batch_owed_back')`) === "t", backDiff);

  // ------------------------------------------------------------------------------------------- one key
  const firm = (db: string) => {
    const f = sql(db, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), 'firm-lk', 'LK', 'CA', 'office@firm-lk.example.com', now()) returning id`);
    sql(db, `insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'user-O', now()); update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${f}'`);
    return f;
  };
  const firmT = firm(T), firmB = firm(BACK), firmP = firm(PLANT);
  {
    const c = new pg.Client({ connectionString: urlOf(T) }); await c.connect();
    try {
      await c.query("begin"); await c.query(`select money_trust_lock($1, $2, 'CAD')`, [firmT, u(1)]);
      const other = sql(T, `select pg_try_advisory_xact_lock(hashtextextended('money_trust:' || '${firmT}' || ':' || '${u(1)}' || ':' || 'CAD', 0))`);
      const free = sql(T, `select pg_try_advisory_xact_lock(hashtextextended('money_trust:' || '${firmT}' || ':' || '${u(1)}' || ':' || 'USD', 0))`);
      ok("FO-7lk pass: money_trust_lock takes exactly the key the inline text took (another connection cannot take that key while it is held; the same party in USD is free)", other === "f" && free === "t", { other, free });
    } finally { await c.query("rollback").catch(() => {}); await c.end(); }
  }

  // ------------------------------------------------------------------------------------------- the two writers at once
  // The planted wrong order: money_credit_note_write touches the invoice row before anything else (as Lead 73's read
  // feared), then runs FO-7a2's text unchanged. Only in "plant".
  {
    const body = back["money_credit_note_write()"];
    psql(PLANT, ["-c", `create or replace function money_credit_note_write() returns trigger language plpgsql as $plant$${body.replace("BEGIN\n", "BEGIN\n  UPDATE \"money_invoice\" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = NEW.invoice_id;  -- planted: the invoice row first\n")}$plant$;
      alter function money_credit_note_write() security definer set search_path = pg_catalog, public, pg_temp; alter function money_credit_note_write() owner to xr_wall_reader;`]);
  }
  ok("FO-7lk harness: the planted writer touches the invoice row first (only in the plant database)",
    sql(PLANT, `select prosrc like '%planted: the invoice row first%' from pg_proc where proname = 'money_credit_note_write'`) === "t");

  type Out = { ok: boolean; code?: string; message?: string };
  // One run: party P holds 1000.00; invoice 300.00 paid 100.00 from trust (W1), and W1 moved to operating. A gate
  // connection holds P's lock; (A) "Move back to trust" — a credit note of 250.00, 50.00 of it moved back — and (B) a
  // withdrawal of 25.00 to the same invoice are sent in the given order and both seen waiting (the barrier); the gate
  // lets go and both run against each other. By hand: A alone leaves 1000.00 − 100.00 + 50.00 = 950.00; B alone
  // 1000.00 − 100.00 − 25.00 = 875.00. Each refuses the other in its own words when second: after A, nothing is
  // open on the invoice for B; after B, trust paid 125.00, so A is no longer the part trust paid and moved.
  async function run(db: string, f: string, order: "AB" | "BA", n: number) {
    const P = randomUUID(), inv = randomUUID(), pay = randomUUID(), batch = randomUUID();
    last(db, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${pay}', '${f}', 'E_TRANSFER', 100000, 'CAD', 'TRUST', now(), 'key-fo7lk-${order}-${n}-${pay.slice(0, 8)}', 'user-R', true);
      insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, created_by) values ('${f}', '${P}', 'DEPOSIT', 100000, 'CAD', '${pay}', 'user-R');
      insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${inv}', '${f}', '${P}', 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${f}', '${inv}', 1, 'FEE', 'Work permit application', 1, 30000, 30000, 'CAD');
      update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${inv}'`);
    const w1 = sql(db, `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${f}', '${P}', 'WITHDRAWAL_TO_INVOICE', -10000, 'CAD', '${inv}', 'user-R') returning id`);
    last(db, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${batch}', '${f}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R');
      insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${f}', '${batch}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10000, '${w1}'); commit;`);
    const A = `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice, overpaid_minor, overpaid_entry_id) values ('${f}', '${inv}', 25000, 'CAD', false, 'Service cancelled', 'user-R', 'OVERPAID_TO_TRUST', 5000, '${w1}')`;
    const B = `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${f}', '${P}', 'WITHDRAWAL_TO_INVOICE', -2500, 'CAD', '${inv}', 'user-R')`;
    const gate = new pg.Client({ connectionString: urlOf(db) }), ca = new pg.Client({ connectionString: urlOf(db) }), cb = new pg.Client({ connectionString: urlOf(db) });
    await Promise.all([gate.connect(), ca.connect(), cb.connect()]);
    try {
      for (const c of [ca, cb]) await c.query("set deadlock_timeout = '200ms'");
      const pids = { a: (await ca.query("select pg_backend_pid() p")).rows[0].p, b: (await cb.query("select pg_backend_pid() p")).rows[0].p };
      await gate.query("begin"); await gate.query(`select ${INLINE("$1::uuid", "$2::uuid", "'CAD'")}`, [f, P]);
      const waiting = async (pid: number) => { for (let i = 0; i < 500; i++) { if ((await gate.query("select wait_event_type from pg_stat_activity where pid = $1", [pid])).rows[0]?.wait_event_type === "Lock") return true; await sleep(5); } return false; };
      const send = (c: pg.Client, q: string): Promise<Out> => c.query(q).then(() => ({ ok: true }), (e: { code?: string; message?: string }) => ({ ok: false, code: e.code, message: e.message }));
      const [first, second] = order === "AB" ? [["a", ca, A], ["b", cb, B]] as const : [["b", cb, B], ["a", ca, A]] as const;
      const p1 = send(first[1], first[2]); const w1ok = await waiting(pids[first[0]]);
      const p2 = send(second[1], second[2]); const w2ok = await waiting(pids[second[0]]);
      await gate.query("commit");
      const r = Object.fromEntries([[first[0], await p1], [second[0], await p2]]) as { a: Out; b: Out };
      const balance = Number(sql(db, `select balance_after_minor from money_trust_entry where firm_id = '${f}' and person_id = '${P}' order by seq desc limit 1`));
      const seqs = sql(db, `select string_agg(seq::text, ',' order by seq) from money_trust_entry where firm_id = '${f}' and person_id = '${P}'`);
      return { ...r, barrier: w1ok && w2ok, balance, seqs };
    } finally { await gate.query("rollback").catch(() => {}); await Promise.all([gate.end(), ca.end(), cb.end()]); }
  }
  const words = { a: /paid from trust: return .* to trust first|covers only the part of this credit note that trust paid and that has moved/, b: /would pay more than is open on the invoice/ };
  async function series(db: string, f: string) {
    const out: Record<string, { deadlocks: number; ownWords: number; bothOk: number; balancesRight: number; barriers: number; odd: unknown[] }> = {};
    for (const order of ["AB", "BA"] as const) {
      const s = { deadlocks: 0, ownWords: 0, bothOk: 0, balancesRight: 0, barriers: 0, odd: [] as unknown[] };
      for (let n = 0; n < RUNS; n++) {
        const r = await run(db, f, order, n);
        if (r.barrier) s.barriers++;
        if (r.a.code === "40P01" || r.b.code === "40P01") s.deadlocks++;
        const want = (r.a.ok ? 5000 : 0) - (r.b.ok ? 2500 : 0) + 90000;
        if (r.balance === want && r.seqs === (r.a.ok && r.b.ok ? "1,2,3,4" : r.a.ok || r.b.ok ? "1,2,3" : "1,2")) s.balancesRight++;
        if (r.a.ok && r.b.ok) s.bothOk++;
        else if ((r.a.ok && !r.b.ok && words.b.test(r.b.message ?? "")) || (r.b.ok && !r.a.ok && words.a.test(r.a.message ?? ""))) s.ownWords++;
        else if (s.odd.length < 3) s.odd.push(r);
      }
      out[order] = s;
    }
    return out;
  }
  const onT = await series(T, firmT);
  for (const order of ["AB", "BA"] as const) {
    const s = onT[order];
    ok(`FO-7lk pass: ${RUNS} runs, ${order === "AB" ? "(A) Move back to trust, then (B) a withdrawal" : "(B) a withdrawal, then (A) Move back to trust"}, on one invoice and party, both waiting at the barrier: no 40P01; each pair commits both or refuses one in the ledger's own words; every balance is the hand-worked one (seq unbroken)`,
      s.barriers === RUNS && s.deadlocks === 0 && s.bothOk + s.ownWords === RUNS && s.balancesRight === RUNS, s);
  }
  const onBack = await series(BACK, firmB), onPlant = await series(PLANT, firmP);
  const backDeadlocks = onBack.AB.deadlocks + onBack.BA.deadlocks, plantDeadlocks = onPlant.AB.deadlocks + onPlant.BA.deadlocks;
  console.log(`      #1991's text (rollback applied): ${backDeadlocks} deadlocks in ${2 * RUNS} runs (A then B: ${onBack.AB.deadlocks}, B then A: ${onBack.BA.deadlocks}); planted wrong order: ${plantDeadlocks} (A then B: ${onPlant.AB.deadlocks}, B then A: ${onPlant.BA.deadlocks})`);
  ok(`FO-7lk harness (fail, planted): with the credit note touching the invoice row before the party lock, the same harness sees 40P01 (B then A: ${onPlant.BA.deadlocks} of ${RUNS}), so a pass above is not for want of overlap`,
    onPlant.BA.deadlocks >= 1 && onPlant.AB.barriers === RUNS && onPlant.BA.barriers === RUNS, onPlant);
  // Not a FAIL line either way: #1991's text already takes the invoice party's lock inside money_issued_invoice before the
  // invoice row (FO-7a review round 3, B-14), the same key as the withdrawal's party. The PR body states the count.
  ok(`FO-7lk note (not a fail case): #1991's text (the rollback applied) under the same harness — ${backDeadlocks} deadlock(s) in ${2 * RUNS} runs, recorded, not counted as proof (brief: "If it never deadlocks there, say so"); this line checks only that the harness ran there (barriers met, balances right)`,
    onBack.AB.barriers === RUNS && onBack.BA.barriers === RUNS && onBack.AB.balancesRight + onBack.BA.balancesRight === 2 * RUNS, onBack);

  // ------------------------------------------------------------------------------------------- neither: no new waits
  // A refund choice and a plain credit note take, on FO-7lk, exactly the advisory locks they took before it (the
  // invoice party's, inside money_issued_invoice): seen in pg_locks while the transaction is held open.
  async function locksOf(db: string, f: string, choice: "OVERPAID_REFUND" | "OVERPAID_TO_TRUST" | null) {
    const P = randomUUID(), inv = randomUUID(), pay = randomUUID(), batch = randomUUID();
    last(db, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${pay}', '${f}', 'E_TRANSFER', 100000, 'CAD', 'TRUST', now(), 'key-fo7lk-n-${pay.slice(0, 8)}', 'user-R', true);
      insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, created_by) values ('${f}', '${P}', 'DEPOSIT', 100000, 'CAD', '${pay}', 'user-R');
      insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${inv}', '${f}', '${P}', 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${f}', '${inv}', 1, 'FEE', 'Work permit application', 1, 30000, 30000, 'CAD');
      update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${inv}'`);
    const w1 = sql(db, `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${f}', '${P}', 'WITHDRAWAL_TO_INVOICE', -10000, 'CAD', '${inv}', 'user-R') returning id`);
    last(db, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${batch}', '${f}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R');
      insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${f}', '${batch}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10000, '${w1}'); commit;`);
    const q = choice ? `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice, overpaid_minor, overpaid_entry_id) values ('${f}', '${inv}', 25000, 'CAD', false, 'Service cancelled', 'user-R', '${choice}', 5000, '${w1}')`
      : `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by) values ('${f}', '${inv}', 5000, 'CAD', false, 'Goodwill', 'user-R')`;
    const c = new pg.Client({ connectionString: urlOf(db) }); await c.connect();
    try {
      await c.query("begin"); await c.query(q);
      const key = sql(db, `select (hashtextextended('money_trust:' || '${f}' || ':' || '${P}' || ':' || 'CAD', 0))`);
      const held = (await c.query(`select ((classid::bigint << 32) | objid::bigint) k from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted order by 1`)).rows.map((r) => String(BigInt.asIntN(64, BigInt(r.k))));
      return held.map((k) => (k === key ? "party" : "other")).join(",");
    } finally { await c.query("rollback").catch(() => {}); await c.end(); }
  }
  const lt = { refund: await locksOf(T, firmT, "OVERPAID_REFUND"), plain: await locksOf(T, firmT, null), toTrust: await locksOf(T, firmT, "OVERPAID_TO_TRUST") };
  const lb = { refund: await locksOf(BACK, firmB, "OVERPAID_REFUND"), plain: await locksOf(BACK, firmB, null), toTrust: await locksOf(BACK, firmB, "OVERPAID_TO_TRUST") };
  ok("FO-7lk neither: a Refund-to-the-client credit note and a plain credit note hold, in pg_locks, exactly the advisory locks they held before FO-7lk (the invoice party's one, from money_issued_invoice) — no new lock, no new wait",
    lt.refund === lb.refund && lt.plain === lb.plain && lt.refund === "party" && lt.plain === "party", { lt, lb });
  ok("FO-7lk pass: Move back to trust holds one advisory lock, the withdrawal party's (the same key it took inside money_issued_invoice before; now taken first, by the credit note itself)",
    lt.toTrust === "party" && lb.toTrust === "party", { lt, lb });
  {
    // B-1 (review and break on 9f30e673): a move-back naming another party's withdrawal is refused and, while its
    // transaction is open, holds no lock of that other party (no new two-party order).
    const P = randomUUID(), X = randomUUID(), inv = randomUUID(), invX = randomUUID(), payX = randomUUID();
    last(T, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${payX}', '${firmT}', 'E_TRANSFER', 10000, 'CAD', 'TRUST', now(), 'key-fo7lk-b1-${payX.slice(0, 8)}', 'user-R', true);
      insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, created_by) values ('${firmT}', '${X}', 'DEPOSIT', 10000, 'CAD', '${payX}', 'user-R');
      insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${inv}', '${firmT}', '${P}', 'CAD', '2026-12-15', 'user-R', now()), ('${invX}', '${firmT}', '${X}', 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${firmT}', '${inv}', 1, 'FEE', 'Work permit application', 1, 10000, 10000, 'CAD'), ('${firmT}', '${invX}', 1, 'FEE', 'Work permit application', 1, 10000, 10000, 'CAD');
      update money_invoice set issued_at = now(), issued_by = 'user-R' where id in ('${inv}', '${invX}')`);
    const wX = sql(T, `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${firmT}', '${X}', 'WITHDRAWAL_TO_INVOICE', -10000, 'CAD', '${invX}', 'user-R') returning id`);
    const g = new pg.Client({ connectionString: urlOf(T) }), c = new pg.Client({ connectionString: urlOf(T) }); await g.connect(); await c.connect();
    try {
      // The gate holds P's lock, so the credit note waits inside money_issued_invoice; then see which keys it holds.
      await g.query("begin"); await g.query(`select money_trust_lock($1, $2, 'CAD')`, [firmT, P]);
      const cpid = (await c.query("select pg_backend_pid() p")).rows[0].p;
      const pc = c.query(`insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice, overpaid_minor, overpaid_entry_id) values ('${firmT}', '${inv}', 5000, 'CAD', false, 'Service cancelled', 'user-R', 'OVERPAID_TO_TRUST', 5000, '${wX}')`).then(() => "ok", (e: { code?: string; message?: string }) => `${e.code} ${e.message}`);
      let waited = "";
      for (let i = 0; i < 400 && (waited = (await g.query("select wait_event_type w from pg_stat_activity where pid = $1", [cpid])).rows[0]?.w ?? "") !== "Lock"; i++) await sleep(5);
      const held = (await g.query(`select count(*)::int n from pg_locks where locktype = 'advisory' and granted and pid = $1`, [cpid])).rows[0].n;
      await g.query("commit"); const out = await pc;
      ok("FO-7lk pass (B-1): a move-back naming another party's withdrawal holds none of that party's locks while it waits, and is then refused in the ledger's words",
        waited === "Lock" && held === 0 && /names a trust application to this invoice/.test(out), { waited, held, out });
    } finally { await g.query("rollback").catch(() => {}); await g.end(); await c.end(); }
  }
  ok("FO-7lk pass: the MODULE card carries the invariant line",
    readFileSync(join(STUDIO, "api", "src", "client-money", "MODULE.md"), "utf8").includes("every trust write takes the party lock before the invoice row"));
} finally {
  for (const db of dbs) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
