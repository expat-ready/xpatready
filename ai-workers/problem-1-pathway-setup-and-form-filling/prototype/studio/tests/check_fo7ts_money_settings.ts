// FO-7ts parts 1 and 2 (brief product/design/briefs/FO-7ts.md with Build Lead C's FO-7ts-1.md; Lead B rev 16.33, 16.35 (b), 16.36,
// 16.37, 16.41; AG-6-59 §6-§8 rules 4-6, AG-6-4 §7 §13 rules 5-7, AG-6-19 rule 1, AG-6-69 rule 3 §7, AG-6-61 rules 7, 10
// §7, AG-6-14 rule 3, AG-6-42 §7; P-567 (3), P-568 (1), P-600; legal reading Unconfirmed: no counsel): the money settings
// and request columns in the database. DW1-DW4, DW9-DW11, DW19-DW20 of the brief, each passing and failing as named; one
// race on real connections (READ COMMITTED). Part 2 (build-lead-c-briefs/FO-7ts-2.md; AG-6-60 rules 2-5, 9, AG-6-21
// rules 2-3, 5, AG-6-23 rules 1, 4; P-634): the pre-case → case pair and the credit ledger, DW5-DW8, DW10, DW12-DW14 and
// DW21-DW24, races at READ COMMITTED and REPEATABLE READ. Part 3 (build-lead-c-briefs/FO-7ts-3.md; AG-6-23 rules 2-3,
// AG-6-4 rule 2, AG-6-68 rule 4, AG-6-30 rules 2, 4; Lead 95's plan read): trust refund details, tax treatment, the
// same-case pick, the newest-issued index — DW10, DW15-DW18, DW25-DW27 and DW31 (the per-case limit, Lead 95). Three scratch databases: "t" gets every migration, with rows written before
// this one (the cases run here); "bad" stops before it with a firm saying trust_enabled = true (the migration must
// refuse); "empty" gets every migration. No server, no browser, no model call, no Stripe call (US$0). All are dropped.
//   tsx studio/tests/check_fo7ts_money_settings.ts
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW3 = "20261122170000_fo7ts_part3";
const NEW = "20261118200000_fo7ts_money_settings", STEP2 = "20261118200100_fo7ts_card_terminal_trust", NEW2 = "20261119080000_fo7ts_ledgers", FO7LK = "20261118210000_fo7lk_trust_lock", FO7A2 = "20261116133000_fo7a2_ledger_rules";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const T = `xr_studio_fo7ts_t_${process.pid}`, BAD = `xr_studio_fo7ts_bad_${process.pid}`, EMPTY = `xr_studio_fo7ts_empty_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `fo7ts-check-${process.pid}`);

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
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function moneyDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /money_|Money[A-Z]/.test(l));
}
const fns = (db: string) => sql(db, `select coalesce(string_agg(proname, ',' order by proname), '') from pg_proc where pronamespace = 'public'::regnamespace`).split(",");
// Functions a migration's text writes: every one must be money_ and CREATE OR REPLACE (prisma migrate reset keeps them).
const written = (text: string) => [...text.matchAll(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)].map((m) => ({ name: m[2], replace: !!m[1] }));
const badFns = (list: { name: string; replace: boolean }[]) => list.filter((f) => !f.name.startsWith("money_") || !f.replace).map((f) => f.name);
const conns: pg.Client[] = [];
async function race(stmts: string[], iso = "read committed"): Promise<{ ok: boolean; code?: string; message?: string }[]> {
  const cs = await Promise.all(stmts.map(async () => { const c = new pg.Client({ connectionString: urlOf(T) }); await c.connect(); conns.push(c); return c; }));
  for (const c of cs) { await c.query(`begin isolation level ${iso}`); await c.query("select 1 from money_trust_request limit 1"); }
  const out = await Promise.all(cs.map(async (c, i) => {
    try { await c.query(stmts[i]); await c.query("commit"); return { ok: true }; }
    catch (e) { await c.query("rollback").catch(() => undefined); return { ok: false, code: (e as { code?: string }).code, message: (e as { message?: string }).message }; }
  }));
  for (const c of cs) { await c.end(); conns.splice(conns.indexOf(c), 1); }
  return out;
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [T, BAD, EMPTY]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------- DW10: the migration (rev 16.7)
  const before = all.filter((d) => d < NEW);
  ok(`FO-7ts DW10 pass: the migration has its own stamp, later than every migration before it (newest before it: ${before.at(-1)}) and after FO-7a2's (P-600)`,
    all.includes(NEW) && before.includes(FO7A2) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const db of [T, BAD]) for (const d of before) psql(db, ["-1", "-f", join(MIG, d, "migration.sql")]);
  const firm = (db: string, key: string) => sql(db, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), '${key}', '${key}', 'CA', 'office@${key}.example.com', now()) returning id`);
  const settingsQ = (f: string) => `insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'user-O', now())`;
  const P1 = u(1), P2 = u(2);
  const invoiceQ = (f: string, total: number, rate = 0, pid = P1) => { const id = randomUUID(); const tax = Math.round(total * rate / 1000000);
    return { id, q: `insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values ('${id}', '${f}', '${pid}', 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency, tax_rate_ppm, tax_minor) values ('${f}', '${id}', 1, 'FEE', 'Work permit application', 1, ${total}, ${total}, 'CAD', ${rate}, ${tax});
      update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${id}'` }; };

  // DW3 and DW4's "before": a firm with trust_enabled = false and an issued invoice taxed at a Sample 13 % (130000 ppm).
  const firmA = firm(T, "firm-ts-a"); sql(T, settingsQ(firmA));
  const taxed = invoiceQ(firmA, 100000, 130000); sql(T, taxed.q);
  const rateBefore = sql(T, `select tax_rate_ppm || ':' || tax_minor from money_invoice_line where invoice_id = '${taxed.id}'`);
  const firmX = firm(BAD, "firm-ts-x"); sql(BAD, `${settingsQ(firmX)}; update money_payment_settings set trust_enabled = true where firm_id = '${firmX}'`);
  ok("FO-7ts DW3 fail: over a firm row with trust_enabled = true the migration refuses, naming that firm and saying to set the trust answer by hand, then rerun",
    refused(BAD, readFileSync(join(MIG, NEW, "migration.sql"), "utf8"), new RegExp(`firm ${firmX} has trust_enabled = true.*set the trust answer by hand, then rerun`))
    && sql(BAD, `select count(*) from information_schema.columns where table_name = 'money_payment_settings' and column_name = 'trust_answer'`) === "0");
  const fnBefore = fns(T);
  psql(T, ["-1", "-f", join(MIG, NEW, "migration.sql")]);
  const added = fns(T).filter((f) => !fnBefore.includes(f)), gone = fnBefore.filter((f) => !fns(T).includes(f));
  const text = readFileSync(join(MIG, NEW, "migration.sql"), "utf8");
  ok("FO-7ts DW10 pass: right after its own migration it adds one function (money_trust_answer_move), drops money_tax_rates_ok, and every function it writes is money_ and CREATE OR REPLACE",
    JSON.stringify(added) === JSON.stringify(["money_trust_answer_move"]) && JSON.stringify(gone) === JSON.stringify(["money_tax_rates_ok"]) && written(text).length === 4 && badFns(written(text)).length === 0, { added, gone, w: written(text) });
  sql(T, `create function fo7ts_planted() returns int language sql as 'select 1'`);
  const plantedAdded = fns(T).filter((f) => !fnBefore.includes(f));
  ok("FO-7ts DW10 fail: a planted function without the money_ prefix (made and dropped here), and a planted CREATE FUNCTION without OR REPLACE, are caught by the same checks",
    plantedAdded.some((f) => !f.startsWith("money_")) && JSON.stringify(badFns(written(`${text}\nCREATE FUNCTION fo7ts_planted() RETURNS int\nCREATE FUNCTION money_planted() RETURNS int`))) === JSON.stringify(["fo7ts_planted", "money_planted"]));
  sql(T, `drop function fo7ts_planted()`);
  ok("FO-7ts DW10 pass: the replaced and new trigger functions run as PF-12's wall reader (SECURITY DEFINER, owner xr_wall_reader, search_path pinned); money_trust_on keeps its caller's rights",
    sql(T, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader' and array_to_string(p.proconfig, ',') like 'search_path=%') from pg_proc p where p.proname in ('money_trust_answer_move', 'money_trust_request_write', 'money_invoice_write')`) === "t"
    && sql(T, `select prosecdef from pg_proc where proname = 'money_trust_on'`) === "f");
  // Step 2 (Lead 80 on #2106): a migration of its own, right after the first, changing one check and no function.
  ok("FO-7ts DW10 pass (step 2): the card-terminal step has its own stamp, right after the first step's, and adds or replaces no function",
    all.indexOf(STEP2) === all.indexOf(NEW) + 1 && all.filter((d) => d.slice(0, 14) === STEP2.slice(0, 14)).length === 1
    && written(readFileSync(join(MIG, STEP2, "migration.sql"), "utf8")).length === 0);
  const cardBefore = sql(T, `select pg_get_constraintdef(oid) from pg_constraint where conname = 'money_payment_card_not_trust'`);
  for (const d of all.filter((x) => x > NEW && x < NEW2)) psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]);
  // ------------------------------------------------------------------------- DW10, part 2: its own migration
  const before2 = all.filter((d) => d < NEW2);
  ok(`FO-7ts DW10 pass (part 2): the migration has its own stamp, later than every migration before it (newest before it: ${before2.at(-1)}), FO-7lk's included (P-600)`,
    all.includes(NEW2) && before2.includes(FO7LK) && before2.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW2.slice(0, 14)).length === 1);
  const fnBefore2 = fns(T), entryBefore = sql(T, `select md5(prosrc) from pg_proc where proname = 'money_trust_entry_write'`);
  const checksOf = (db: string) => sql(db, `select string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname) from pg_constraint where conrelid = 'money_trust_entry'::regclass`);
  const checksBefore = checksOf(T);
  psql(T, ["-1", "-f", join(MIG, NEW2, "migration.sql")]);
  const added2 = fns(T).filter((f) => !fnBefore2.includes(f)), gone2 = fnBefore2.filter((f) => !fns(T).includes(f)), text2 = readFileSync(join(MIG, NEW2, "migration.sql"), "utf8");
  ok("FO-7ts DW10 pass (part 2): right after its own migration it adds the credit and move functions (ten, with the five that keep the credit rules after later writes), drops none, replaces money_trust_entry_write, and every function it writes is money_ and CREATE OR REPLACE",
    JSON.stringify(added2) === JSON.stringify(["money_credit_entry_holds", "money_credit_entry_write", "money_credit_kept_holds", "money_invoice_credit", "money_invoice_credit_pinned", "money_invoice_due", "money_invoice_line_credit", "money_refund_credit_kept", "money_trust_entry_credit_kept", "money_trust_entry_move_paired"]) && gone2.length === 0 && written(text2).length === 11 && badFns(written(text2)).length === 0
    && sql(T, `select md5(prosrc) from pg_proc where proname = 'money_trust_entry_write'`) !== entryBefore, { added2, gone2, w: written(text2) });
  ok("FO-7ts DW10 pass (part 2): its trigger functions run as PF-12's wall reader; money_invoice_due keeps its caller's rights",
    sql(T, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader' and array_to_string(p.proconfig, ',') like 'search_path=%') from pg_proc p where p.proname in ('money_trust_entry_write', 'money_trust_entry_move_paired', 'money_credit_entry_write', 'money_credit_entry_holds', 'money_refund_credit_kept', 'money_trust_entry_credit_kept', 'money_invoice_line_credit', 'money_invoice_credit_pinned')`) === "t"
    && sql(T, `select prosecdef from pg_proc where proname = 'money_invoice_due'`) === "f");
  for (const d of all.filter((x) => x > NEW2 && x < NEW3)) psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]);
  // ------------------------------------------------------------------------- DW10, part 3: its own migration
  const before3 = all.filter((d) => d < NEW3);
  ok(`FO-7ts DW10 pass (part 3): the migration has its own stamp, later than every migration before it (newest before it: ${before3.at(-1)}), part 2's included (P-600)`,
    all.includes(NEW3) && before3.includes(NEW2) && all.filter((d) => d.slice(0, 14) === NEW3.slice(0, 14)).length === 1);
  const fnBefore3 = fns(T), src3 = (db: string) => sql(db, `select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc where proname in ('money_trust_entry_write', 'money_invoice_write', 'money_credit_note_write', 'money_move_batch_owed_back', 'money_move_line_write')`);
  const srcBefore3 = src3(T), checksBefore3 = checksOf(T), text3 = readFileSync(join(MIG, NEW3, "migration.sql"), "utf8");
  { const p = randomUUID();
    ok("FO-7ts part 3 fail (review Minor 4): over a database that already holds a trust refund (no method, no date) the migration refuses, naming the way out, and changes nothing",
      refused(T, `begin; update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmA}';
        insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${p}', '${firmA}', 'CASH', 1000, 'CAD', 'TRUST', now(), 'key-fo7ts-old-refund', 'user-R');
        insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, created_by) values ('${firmA}', '${P1}', 'DEPOSIT', 1000, 'CAD', '${p}', 'user-R');
        insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, reason, created_by) values ('${firmA}', '${P1}', 'REFUND_TO_CLIENT', -1000, 'CAD', 'Returned', 'user-R');
        ${text3}`, /trust refunds are recorded without a method or date: no route writes these yet, so only a test database holds one: ask the tech lead/)
      && sql(T, `select count(*) from money_trust_entry where firm_id = '${firmA}'`) === "0" && sql(T, `select count(*) from pg_class where relname = 'money_party_tax_treatment'`) === "0"); }
  // PF-8b F6 / review R7-1: a runner that is neither superuser nor BYPASSRLS (Amazon RDS's admin), owning the tables
  // through membership, over issued invoices of two firms with no treatment yet: part 3 applies, fills both firms' with
  // PF-12's firm gate stepped aside (PF-8b F7's lift), and leaves FORCE and the gate as it found them. A planted copy that
  // leaves PF-12's firm gate on is refused (42501).
  { const RDS = `${T}_rds`, ROLE = `xr_fo7ts_rds_${process.pid}`;
    execFileSync(join(BIN, "createdb"), [...PG, "-T", T, RDS]);
    try {
      const firmR = firm(RDS, "firm-ts-rds");
      for (const f of [firmA, firmR]) sql(RDS, `set session_replication_role = replica; insert into money_invoice (firm_id, person_id, currency, due_date, created_by, updated_at, number, issued_at, issued_by)
        values ('${f}', gen_random_uuid(), 'CAD', '2026-12-15', 'user-R', now(), 'RDS-1', now(), 'user-R')`);
      sql(RDS, `create role ${ROLE} nologin nosuperuser nobypassrls; grant xr_studio to ${ROLE}; grant xr_wall_reader to ${ROLE}`);
      const asRds = (text: string) => { writeFileSync(join(WORK, "rds.sql"), `set role ${ROLE};\n${text}`); return psql(RDS, ["-1", "-f", join(WORK, "rds.sql")]); };
      mkdirSync(WORK, { recursive: true });
      const planted = text3.replace(/^\s*FOREACH t IN ARRAY gated LOOP EXECUTE format\('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t\); END LOOP;\n/gm, "");
      let plantedErr = "";
      try { asRds(planted); } catch (e) { plantedErr = String((e as { stderr?: string }).stderr ?? e); }
      ok("FO-7ts part 3 fail (planted, review R7-1): with PF-12's firm gate left on, the RDS-shaped runner is refused by PF-12's firm-first trigger (42501), nothing changed",
        planted !== text3 && /violates row-level security policy for table "money_invoice"/.test(plantedErr) && sql(RDS, `select count(*) from pg_class where relname = 'money_party_tax_treatment'`) === "0", plantedErr.split("\n")[0]);
      let err = ""; try { asRds(text3); } catch (e) { err = String((e as { stderr?: string }).stderr ?? e); }
      ok("FO-7ts part 3 pass (PF-8b F6, review R7-1): as a runner that is neither superuser nor BYPASSRLS, the migration applies over issued invoices of two firms, sets both TAXABLE and leaves FORCE and PF-12's firm gate on money_invoice and money_trust_entry",
        err === "" && sql(RDS, `select count(*) filter (where tax_treatment = 'TAXABLE') || ':' || count(*) from money_invoice where number = 'RDS-1'`) === "2:2"
        && sql(RDS, `select bool_and(relforcerowsecurity) from pg_class where relname in ('money_invoice', 'money_trust_entry')`) === "t"
        && sql(RDS, `select string_agg(distinct tgenabled::text, '') from pg_trigger where tgname = '0_pf12_firm_first' and tgrelid in ('money_invoice'::regclass, 'money_trust_entry'::regclass)`) === "O", err.split("\n").slice(0, 3));
    } finally {
      execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", RDS], { stdio: "ignore" });
      try { sql(EMPTY, `drop role if exists ${ROLE}`); } catch { /* best effort */ }
    }
  }
  psql(T, ["-1", "-f", join(MIG, NEW3, "migration.sql")]);
  ok("FO-7ts DW10 pass (part 3): right after its own migration it adds and drops no function, replaces money_trust_entry_write, money_invoice_write and (Lead 96's rulings) FO-7lk's money_credit_note_write, money_move_batch_owed_back and money_move_line_write, all CREATE OR REPLACE and money_, all still run as PF-12's wall reader",
    JSON.stringify(fns(T)) === JSON.stringify(fnBefore3) && src3(T).split(",").every((x, i) => x !== srcBefore3.split(",")[i])
    && JSON.stringify(written(text3).map((f) => `${f.name}:${f.replace}`)) === JSON.stringify(["money_trust_entry_write:true", "money_invoice_write:true", "money_credit_note_write:true", "money_move_batch_owed_back:true", "money_move_line_write:true"])
    && sql(T, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader' and array_to_string(p.proconfig, ',') like 'search_path=%') from pg_proc p where p.proname in ('money_trust_entry_write', 'money_invoice_write', 'money_credit_note_write', 'money_move_batch_owed_back', 'money_move_line_write')`) === "t", { w: written(text3) });
  ok("FO-7ts DW10 pass (part 3): money_party_tax_treatment is behind PF-12's walls (forced policy naming the firm, the firm-first trigger)",
    sql(T, `select relforcerowsecurity and relrowsecurity from pg_class where relname = 'money_party_tax_treatment'`) === "t"
    && sql(T, `select count(*) from pg_policy where polrelid = 'money_party_tax_treatment'::regclass and polname = 'pf12_firm'`) === "1"
    && sql(T, `select count(*) from pg_trigger where tgrelid = 'money_party_tax_treatment'::regclass and tgname = '0_pf12_firm_first'`) === "1");
  for (const d of all.filter((x) => x > NEW3)) psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]);
  for (const d of all) psql(EMPTY, ["-1", "-f", join(MIG, d, "migration.sql")]);
  ok("FO-7ts DW10 pass: migrate diff names no money table or type, on the copy with rows and on the empty one", moneyDiff(T).length === 0 && moneyDiff(EMPTY).length === 0, [moneyDiff(T), moneyDiff(EMPTY)]);

  // ----------------------------------------------------------------------------------------- DW3 and DW4: mapping
  ok("FO-7ts DW3 pass: the row with trust_enabled = false is UNANSWERED with no who or when, and trust_enabled is gone",
    sql(T, `select trust_answer || ':' || num_nonnulls(trust_answered_by, trust_answered_at) from money_payment_settings where firm_id = '${firmA}'`) === "UNANSWERED:0"
    && sql(T, `select count(*) from information_schema.columns where table_name = 'money_payment_settings' and column_name in ('trust_enabled', 'tax_rates')`) === "0");
  ok("FO-7ts DW4 pass: tax_rates is gone and an issued invoice's frozen rate and tax are unchanged by the migration (13 %, Sample)",
    rateBefore === "130000:13000" && sql(T, `select tax_rate_ppm || ':' || tax_minor from money_invoice_line where invoice_id = '${taxed.id}'`) === rateBefore);
  ok("FO-7ts DW4 fail: registered for tax with no tax number is refused",
    refused(T, `update money_payment_settings set tax_registered = true where firm_id = '${firmA}'`, /money_payment_settings_tax_registered_check/, "23514"));
  ok("FO-7ts DW4 pass: registered with a tax number is accepted; Prices include tax and a QST number are stored (QST unused in R1)",
    sql(T, `update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001', prices_include_tax = true, qst_number = '1234567890TQ0001' where firm_id = '${firmA}' returning tax_registered || ':' || prices_include_tax`) === "true:true"
    && refused(T, `update money_payment_settings set tax_number = null where firm_id = '${firmA}'`, /money_payment_settings_tax_registered_check/));

  // ---------------------------------------------------------------------------------------- DW1: the three states
  const firmB = firm(T, "firm-ts-b");
  ok("FO-7ts DW1 pass: a new firm row is UNANSWERED with no who or when (and invoice payments into operating, DW20)",
    sql(T, `${settingsQ(firmB)} returning trust_answer || ':' || num_nonnulls(trust_answered_by, trust_answered_at) || ':' || invoice_payments_go_to || ':' || num_nonnulls(invoice_payments_changed_by, invoice_payments_changed_at)`) === "UNANSWERED:0:OPERATING:0");
  const firmC = firm(T, "firm-ts-c");
  ok("FO-7ts DW1 fail: a new row written as YES (or with who and when) is refused",
    refused(T, `insert into money_payment_settings (firm_id, updated_by, updated_at, trust_answer, trust_answered_by) values ('${firmC}', 'user-O', now(), 'YES', 'user-O')`, /starts with the trust question unanswered/, "23514")
    && refused(T, `insert into money_payment_settings (firm_id, updated_by, updated_at, trust_answered_by, trust_answered_at) values ('${firmC}', 'user-O', now(), 'user-O', now())`, /starts with the trust question unanswered/));
  ok("FO-7ts DW1 fail: UNANSWERED → YES without who is refused by the check after the trigger has filled the time",
    refused(T, `update money_payment_settings set trust_answer = 'YES' where firm_id = '${firmB}'`, /money_payment_settings_trust_answer_check/, "23514"));
  ok("FO-7ts DW1 pass: UNANSWERED → YES with who is accepted, and trust_answered_at is the database's (a typed 2001 time is replaced)",
    sql(T, `update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O', trust_answered_at = '2001-01-01' where firm_id = '${firmB}' returning trust_answer || ':' || trust_answered_by || ':' || (trust_answered_at > now() - interval '1 minute')`) === "YES:user-O:true");
  const at = () => sql(T, `select trust_answered_by || '@' || trust_answered_at from money_payment_settings where firm_id = '${firmB}'`);
  const atYes = at();
  ok("FO-7ts DW1 pass: an update of the tax number alone on a YES row is accepted, and the answer's who and when are unchanged",
    sql(T, `update money_payment_settings set tax_number = '987654321RT0001' where firm_id = '${firmB}' returning 1`) === "1" && at() === atYes);
  ok("FO-7ts DW1 fail: who answered and when do not change without the answer (no backdating, no new name on an old answer)",
    refused(T, `update money_payment_settings set trust_answered_at = '2001-01-01' where firm_id = '${firmB}'`, /change only with the answer/)
    && refused(T, `update money_payment_settings set trust_answered_by = 'user-X' where firm_id = '${firmB}'`, /change only with the answer/) && at() === atYes);
  ok("FO-7ts DW1 fail: YES → NO with no who is refused by the check",
    refused(T, `update money_payment_settings set trust_answer = 'NO', trust_answered_by = null where firm_id = '${firmB}'`, /money_payment_settings_trust_answer_check/, "23514"));
  ok("FO-7ts DW1 pass: YES → NO and NO → YES are accepted (AG-6-59 §6: YES ⇄ NO), each with who and a new time",
    sql(T, `update money_payment_settings set trust_answer = 'NO', trust_answered_by = 'user-O2' where firm_id = '${firmB}' returning trust_answer`) === "NO"
    && sql(T, `update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmB}' returning trust_answer`) === "YES" && at() !== atYes);
  ok("FO-7ts DW1 fail: YES → UNANSWERED (and NO → UNANSWERED) is refused by the trigger",
    refused(T, `update money_payment_settings set trust_answer = 'UNANSWERED', trust_answered_by = null, trust_answered_at = null where firm_id = '${firmB}'`, /never goes back to unanswered/, "23514")
    && (sql(T, `update money_payment_settings set trust_answer = 'NO', trust_answered_by = 'user-O' where firm_id = '${firmB}' returning 1`), refused(T, `update money_payment_settings set trust_answer = 'UNANSWERED' where firm_id = '${firmB}'`, /never goes back to unanswered/)));
  ok("FO-7ts DW1 fail (break F1 on facc5231): an answered firm's settings row is never deleted (delete and insert again would bring back UNANSWERED); pass: an unanswered row with no money may be",
    refused(T, `delete from money_payment_settings where firm_id = '${firmB}'`, /an answered firm's settings are never removed/, "23514")
    && (() => { const f = firm(T, "firm-ts-del"); sql(T, settingsQ(f)); return sql(T, `delete from money_payment_settings where firm_id = '${f}' returning 1`) === "1"; })());

  // ---------------------------------------------------------------------------------- DW2: trust is on at YES only
  let n = 0; const key = () => `key-fo7ts-${String(++n).padStart(6, "0")}`;
  const reqQ = (f: string, o: { id?: string; sent?: boolean; version?: string | null; pid?: string } = {}) =>
    `insert into money_trust_request (id, firm_id, person_id, amount_minor, currency, purpose, created_by, sent_at, sent_by, retainer_version_id, updated_at) values ('${o.id ?? randomUUID()}', '${f}', '${o.pid ?? P1}', 100000, 'CAD', 'Deposit for the work permit', 'user-R', ${o.sent ? "now(), 'user-R'" : "null, null"}, ${o.version ? `'${o.version}'` : "null"}, now()) returning coalesce(number, '-')`;
  const entryQ = (f: string, kind: string, amount: number, x: { pay?: string; inv?: string; reason?: string } = {}) =>
    `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, invoice_id, reason, ${kind === "REFUND_TO_CLIENT" ? "refund_method, refunded_on, " : ""}created_by) values ('${f}', '${P1}', '${kind}', ${amount}, 'CAD', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.reason ? `'${x.reason}'` : "null"}, ${kind === "REFUND_TO_CLIENT" ? "'E_TRANSFER', current_date, " : ""}'user-R') returning balance_after_minor`;
  const depositQ = (f: string, amount: number, method = "E_TRANSFER") => { const p = randomUUID();
    return `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${p}', '${f}', '${method}', ${amount}, 'CAD', 'TRUST', now(), '${key()}', 'user-R', true); ${entryQ(f, "DEPOSIT", amount, { pay: p })}`; };
  const firmU = firm(T, "firm-ts-u"); sql(T, settingsQ(firmU));                                       // UNANSWERED
  ok("FO-7ts DW2 fail: with the answer UNANSWERED a trust request and a deposit are refused (trust is off, AG-6-59 rule 4)",
    refused(T, reqQ(firmU), /trust is off/) && refused(T, depositQ(firmU, 1000), /trust is off/));
  // firm B answered NO above; firm D answers YES, takes money in, then the Owner switches to NO while it is held.
  ok("FO-7ts DW2 fail: with the answer NO a trust request (prepared or sent) and a deposit are refused",
    refused(T, reqQ(firmB), /trust is off/) && refused(T, reqQ(firmB, { sent: true }), /trust is off/) && refused(T, depositQ(firmB, 1000), /trust is off/));
  const firmD = firm(T, "firm-ts-d"); sql(T, `${settingsQ(firmD)}; update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmD}'`);
  const unsent = randomUUID();
  ok("FO-7ts DW2 pass: with YES a trust request is written and sent (DR-0001) and a deposit is accepted",
    sql(T, reqQ(firmD, { id: unsent })) === "-" && sql(T, reqQ(firmD, { sent: true })) === "DR-0001" && last(T, depositQ(firmD, 100000)) === "100000");
  const invD = invoiceQ(firmD, 30000); sql(T, invD.q);
  sql(T, `update money_payment_settings set trust_answer = 'NO', trust_answered_by = 'user-O' where firm_id = '${firmD}'`);
  ok("FO-7ts DW2 pass: with NO and money held, a withdrawal to an issued invoice and a refund to the client are accepted (AG-6-59 rule 6)",
    sql(T, entryQ(firmD, "WITHDRAWAL_TO_INVOICE", -30000, { inv: invD.id })) === "70000" && sql(T, entryQ(firmD, "REFUND_TO_CLIENT", -70000, { reason: "Work withdrawn: money returned" })) === "0");
  ok("FO-7ts DW2 fail: with NO and money held, a new deposit and sending the prepared request are still refused",
    refused(T, depositQ(firmD, 500), /trust is off/) && refused(T, `update money_trust_request set sent_at = now(), sent_by = 'user-R' where id = '${unsent}'`, /trust is off/));
  sql(T, `update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmD}'`);

  // --------------------------------------------------------------------------------------- DW9: retainer version
  const V1 = u(501), V2 = u(502), V3 = u(503);
  const r1 = randomUUID();
  sql(T, reqQ(firmD, { id: r1, sent: true, version: V1 }));
  ok("FO-7ts DW9 fail: a second deposit request for one retainer version is refused", refused(T, reqQ(firmD, { version: V1 }), /money_trust_request_one_per_retainer_version/, "23505"));
  ok("FO-7ts DW9 pass: requests with no version are accepted (two of them), and the same version in another firm is its own",
    sql(T, reqQ(firmD)) === "-" && sql(T, reqQ(firmD)) === "-" && (() => { const firmE = firm(T, "firm-ts-e"); sql(T, `${settingsQ(firmE)}; update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmE}'`); return sql(T, reqQ(firmE, { version: V1 })) === "-"; })());
  sql(T, `update money_trust_request set cancelled_at = now(), cancelled_by = 'user-R', cancel_reason = 'Retainer amended' where id = '${r1}'`);
  ok("FO-7ts DW9 pass: a cancelled request still holds its version (an amendment is a new version, AG-6-61 rule 10), and never changes",
    refused(T, reqQ(firmD, { version: V1 }), /money_trust_request_one_per_retainer_version/) && refused(T, `update money_trust_request set retainer_version_id = '${V3}' where id = '${r1}'`, /a cancelled request .* never changes/));
  const r2 = randomUUID(); sql(T, reqQ(firmD, { id: r2, version: V2 }));
  ok("FO-7ts DW9 pass: an unsent request's version may change", sql(T, `update money_trust_request set retainer_version_id = '${V3}' where id = '${r2}' returning retainer_version_id`) === V3);
  sql(T, `update money_trust_request set sent_at = now(), sent_by = 'user-R' where id = '${r2}'`);
  ok("FO-7ts DW9 fail: changing (or clearing) the version of a sent request is refused",
    refused(T, `update money_trust_request set retainer_version_id = '${V2}' where id = '${r2}'`, /sent request's party, case, currency, retainer version and sending never change/)
    && refused(T, `update money_trust_request set retainer_version_id = null where id = '${r2}'`, /retainer version and sending never change/));
  const V4 = u(504);
  const two = await race([reqQ(firmD, { version: V4 }), reqQ(firmD, { version: V4 })]);
  ok("FO-7ts DW9 fail: two connections writing a request for one version at once: one commits, the other is refused (23505)",
    two.filter((r) => r.ok).length === 1 && two.filter((r) => r.code === "23505").length === 1 && sql(T, `select count(*) from money_trust_request where retainer_version_id = '${V4}'`) === "1", two);

  // ---------------------------------------------------------------------------------------- DW11: pay-link hash
  const inv1 = invoiceQ(firmD, 20000), inv2 = invoiceQ(firmD, 20000); sql(T, inv1.q); sql(T, inv2.q);
  const h1 = hash("pay-link-token-one"), h2 = hash("pay-link-token-two");
  ok("FO-7ts DW11 pass: a 64-character hex hash on an issued invoice is accepted", sql(T, `update money_invoice set pay_link_token_hash = '${h1}' where id = '${inv1.id}' returning length(pay_link_token_hash)`) === "64");
  ok("FO-7ts DW11 fail: the same hash on a second invoice of the firm is refused", refused(T, `update money_invoice set pay_link_token_hash = '${h1}' where id = '${inv2.id}'`, /money_invoice_pay_link_token_hash/, "23505"));
  ok("FO-7ts DW11 fail: a raw token (or an upper-case or short hash) is refused, on an invoice and on a trust request",
    refused(T, `update money_invoice set pay_link_token_hash = 'pay-link-token-one' where id = '${inv2.id}'`, /money_invoice_pay_link_check/, "23514")
    && refused(T, `update money_invoice set pay_link_token_hash = '${h2.toUpperCase()}' where id = '${inv2.id}'`, /money_invoice_pay_link_check/)
    && refused(T, `update money_invoice set pay_link_token_hash = '${h2.slice(0, 63)}' where id = '${inv2.id}'`, /money_invoice_pay_link_check/)
    && refused(T, `update money_trust_request set pay_link_token_hash = 'raw-token' where id = '${r2}'`, /money_trust_request_pay_link_check/));
  ok("FO-7ts DW11 pass: changing the hash on an issued invoice is accepted (a new link replaces the old one)",
    sql(T, `update money_invoice set pay_link_token_hash = '${h2}' where id = '${inv1.id}' returning pay_link_token_hash`) === h2);
  ok("FO-7ts DW11 fail: changing an issued invoice's amount is still refused", refused(T, `update money_invoice_line set unit_amount_minor = 1, amount_minor = 1 where invoice_id = '${inv1.id}'`, /issued/));
  ok("FO-7ts DW11 pass: a trust request's hash is unique per firm too (unused in R1)",
    sql(T, `update money_trust_request set pay_link_token_hash = '${h1}' where id = '${r2}' returning 1`) === "1"
    && refused(T, `update money_trust_request set pay_link_token_hash = '${h1}' where id = '${unsent}'`, /money_trust_request_pay_link_token_hash/, "23505"));
  const draftU = randomUUID(); sql(T, `insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at, unsigned_retainer_confirmed_by, unsigned_retainer_confirmed_at) values ('${draftU}', '${firmD}', '${P2}', 'CAD', '2026-12-15', 'user-R', now(), '${u(77)}', '1999-01-01');
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${firmD}', '${draftU}', 1, 'FEE', 'Consultation', 1, 5000, 5000, 'CAD')`);
  const confirmedAt = () => sql(T, `select coalesce((unsigned_retainer_confirmed_at > now() - interval '1 minute' and unsigned_retainer_confirmed_at <= now())::text, 'null') from money_invoice where id = '${draftU}'`);
  ok("FO-7ts (AG-6-42 §7; Lead 82 on #2106, F3) pass: the confirmation's time is the database's — a typed 1999 on insert is not stored; a new who on the draft takes a new database time",
    confirmedAt() === "true" && sql(T, `update money_invoice set unsigned_retainer_confirmed_by = '${u(79)}', unsigned_retainer_confirmed_at = '2099-01-01' where id = '${draftU}' returning (unsigned_retainer_confirmed_at < '2099-01-01')`) === "t");
  ok("FO-7ts (F3) fail: a typed time alone (1999, 2099 or none) is refused on the draft, and the stored time is unchanged",
    refused(T, `update money_invoice set unsigned_retainer_confirmed_at = '2099-01-01' where id = '${draftU}'`, /is the database's, and changes only with who confirmed it/, "23514")
    && refused(T, `update money_invoice set unsigned_retainer_confirmed_at = '1999-01-01' where id = '${draftU}'`, /changes only with who confirmed it/)
    && refused(T, `update money_invoice set unsigned_retainer_confirmed_at = null where id = '${draftU}'`, /changes only with who confirmed it/) && confirmedAt() === "true");
  ok("FO-7ts (AG-6-42 §7) fail: once issued the confirmation is fixed",
    (sql(T, `update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${draftU}'`), refused(T, `update money_invoice set unsigned_retainer_confirmed_by = '${u(78)}' where id = '${draftU}'`, /issued invoices can't be edited/)));

  // --------------------------------------------------------------------------------------- DW19: payment methods
  ok("FO-7ts DW19 pass: a BANK_TRANSFER payment into trust (trust YES) is accepted with its deposit", last(T, depositQ(firmD, 2500, "BANK_TRANSFER")) === "2500");
  const eTransfer = randomUUID(); sql(T, `insert into money_payment (id, firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${eTransfer}', '${firmD}', '${inv2.id}', 'E_TRANSFER', 1000, 'CAD', 'OPERATING', now(), '${key()}', 'user-R')`);
  ok("FO-7ts DW19 pass: a stored E_TRANSFER payment reads back unchanged, and CARD_TERMINAL into operating is accepted",
    sql(T, `select method from money_payment where id = '${eTransfer}'`) === "E_TRANSFER"
    && sql(T, `insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${firmD}', '${inv2.id}', 'CARD_TERMINAL', 1000, 'CAD', 'OPERATING', now(), '${key()}', 'user-R') returning method`) === "CARD_TERMINAL");
  ok("FO-7ts DW19 fail (Lead 80 on #2106; P-567 (3)): a CARD_TERMINAL payment into trust is refused by the database (money_payment_card_not_trust, now CARD and CARD_TERMINAL); before step 2 the check named CARD only",
    refused(T, `insert into money_payment (firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${firmD}', 'CARD_TERMINAL', 1000, 'CAD', 'TRUST', now(), '${key()}', 'user-R')`, /money_payment_card_not_trust/, "23514")
    && !cardBefore.includes("CARD_TERMINAL") && sql(T, `select pg_get_constraintdef(oid) from pg_constraint where conname = 'money_payment_card_not_trust'`).includes("CARD_TERMINAL"));
  ok("FO-7ts DW19 fail: a method outside the list is refused", refused(T, `insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${firmD}', '${inv2.id}', 'BITCOIN', 1000, 'CAD', 'OPERATING', now(), '${key()}', 'user-R')`, /invalid input value for enum "MoneyPaymentMethod"/, "22P02"));
  ok("FO-7ts DW19 pass: the list is exactly AG-6-19 rule 1's seven plus CARD (online only), none removed or renamed",
    sql(T, `select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = '"MoneyPaymentMethod"'::regtype`) === "CARD,E_TRANSFER,CHEQUE,WIRE,CASH,OTHER,BANK_TRANSFER,CARD_TERMINAL");

  // ------------------------------------------------------------------------------- DW20: "Invoice payments go to"
  ok("FO-7ts DW20 fail: TRUST_FIRST with no who is refused by the check (after the trigger has filled the time)",
    refused(T, `update money_payment_settings set invoice_payments_go_to = 'TRUST_FIRST' where firm_id = '${firmD}'`, /money_payment_settings_invoice_payments_check/, "23514"));
  ok("FO-7ts DW20 pass: TRUST_FIRST with who is accepted, and invoice_payments_changed_at is the database's (a typed 2001 time is replaced)",
    sql(T, `update money_payment_settings set invoice_payments_go_to = 'TRUST_FIRST', invoice_payments_changed_by = 'user-O', invoice_payments_changed_at = '2001-01-01' where firm_id = '${firmD}' returning invoice_payments_go_to || ':' || invoice_payments_changed_by || ':' || (invoice_payments_changed_at > now() - interval '1 minute')`) === "TRUST_FIRST:user-O:true");
  ok("FO-7ts DW20 fail: who changed it and when do not change without the setting; a new row cannot start as TRUST_FIRST",
    refused(T, `update money_payment_settings set invoice_payments_changed_at = '2001-01-01' where firm_id = '${firmD}'`, /change only with it/)
    && refused(T, `insert into money_payment_settings (firm_id, updated_by, updated_at, invoice_payments_go_to) values ('${firmC}', 'user-O', now(), 'TRUST_FIRST')`, /invoice payments into operating/));

  // ========================================================================================= part 2 (firm D, trust YES)
  const F = firmD, C1 = u(901), C2 = u(902);
  // cols: part 3's columns as SQL literals ("null" clears a default); a trust refund defaults to an e-Transfer on a date.
  type E = { pay?: string; inv?: string; corrects?: string; ck?: string; reason?: string; kase?: string | null; from?: string; id?: string; cur?: string; cols?: Record<string, string> };
  const te = (pid: string, kind: string, amount: number, x: E = {}) => {
    const c = Object.entries({ ...(kind === "REFUND_TO_CLIENT" ? { refund_method: "'E_TRANSFER'", refunded_on: "current_date" } : {}), ...x.cols });
    return `insert into money_trust_entry (id, firm_id, person_id, kind, amount_minor, currency, payment_id, invoice_id, corrects_entry_id, correction_kind, reason, case_id, moved_from_entry_id, ${c.map(([k]) => `${k}, `).join("")}created_by) values ('${x.id ?? randomUUID()}', '${F}', '${pid}', '${kind}', ${amount}, '${x.cur ?? "CAD"}', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.corrects ? `'${x.corrects}'` : "null"}, ${x.ck ? `'${x.ck}'` : "null"}, ${x.reason ? `'${x.reason}'` : "null"}, ${x.kase ? `'${x.kase}'` : "null"}, ${x.from ? `'${x.from}'` : "null"}, ${c.map(([, v]) => `${v}, `).join("")}'user-R') returning id`; };
  const dep = (pid: string, amount: number, o: { method?: string; kase?: string; cleared?: boolean } = {}) => { const p = randomUUID();
    return last(T, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${p}', '${F}', '${o.method ?? "E_TRANSFER"}', ${amount}, 'CAD', 'TRUST', now(), '${key()}', 'user-R', ${o.cleared ?? true}); ${te(pid, "DEPOSIT", amount, { pay: p, kase: o.kase })}`); };
  // The pair as one transaction: − then + naming it (ids chosen here).
  const pairQ = (pid: string, amount: number, kase = C1, o: { plusPid?: string; plusAmount?: number; plusCur?: string } = {}) => { const m = randomUUID();
    return `begin; ${te(pid, "MOVE_TO_CASE", -amount, { id: m })}; ${te(o.plusPid ?? pid, "MOVE_TO_CASE", o.plusAmount ?? amount, { kase, from: m, cur: o.plusCur })}; commit;`; };
  const sums = (pid: string) => sql(T, `select coalesce(sum(amount_minor) filter (where case_id is null), 0) || ':' || coalesce(sum(amount_minor) filter (where case_id = '${C1}'), 0) || ':' || coalesce((select balance_after_minor from money_trust_entry where firm_id = '${F}' and person_id = '${pid}' order by seq desc limit 1), 0) from money_trust_entry where firm_id = '${F}' and person_id = '${pid}'`);
  const shortfalls = () => sql(T, `select coalesce(string_agg(person_id || '=' || balance_minor, ',' order by person_id), '') from money_trust_shortfall where firm_id = '${F}'`);

  // ------------------------------------------------------------------------------------ DW5: move to a case (AG-6-60)
  {
    const P = u(501); dep(P, 15000);
    ok("FO-7ts DW5 fail: with CAD 150.00 held before a case, a move of 151.00 is refused, naming what is available", refused(T, pairQ(P, 15100), /a move to a case takes only what is held before a case: Only CAD 150\.00 is available/, "23514"));
    sql(T, pairQ(P, 15000));
    ok("FO-7ts DW5 pass (AG-6-60's test): CAD 150.00 moved to a case leaves pre-case 0.00, the case 150.00 and the party's balance unchanged, one entry on each side",
      sums(P) === "0:15000:15000" && sql(T, `select string_agg(amount_minor || '@' || coalesce(case_id::text, '-'), ',' order by seq) from money_trust_entry where person_id = '${P}' and kind = 'MOVE_TO_CASE'`) === `-15000@-,15000@${C1}`);
  }
  // ---------------------------------------------------------------------------------------------- DW6: the pairing
  {
    const P = u(502), Q = u(503); dep(P, 50000); dep(Q, 50000);
    const m = randomUUID();
    ok("FO-7ts DW6 fail: a − half with no + half is refused at commit", refused(T, `begin; ${te(P, "MOVE_TO_CASE", -1000, { id: m })}; commit;`, /a move to a case is a pair/, "23514"));
    ok("FO-7ts DW6 fail: a + half naming another party's − half, another currency, or a different amount is refused",
      refused(T, pairQ(P, 1000, C1, { plusPid: Q }), /on the − half's party and currency, with the opposite amount \(1000\)/)
      && refused(T, pairQ(P, 1000, C1, { plusCur: "USD" }), /on the − half's party and currency/) && refused(T, pairQ(P, 1000, C1, { plusAmount: 999 }), /with the opposite amount/));
    const mOld = randomUUID(); sql(T, `begin; ${te(P, "MOVE_TO_CASE", -1000, { id: mOld })}; ${te(P, "MOVE_TO_CASE", 1000, { kase: C1, from: mOld })}; commit;`);
    ok("FO-7ts DW6 fail: a + half naming a − half from an earlier transaction is refused; a second + half on one − half is refused (one + per −)",
      refused(T, `begin; ${te(P, "MOVE_TO_CASE", 1000, { kase: C2, from: mOld })}; commit;`, /is written in the transaction that wrote its − half/)
      && refused(T, (() => { const x = randomUUID(); return `begin; ${te(P, "MOVE_TO_CASE", -1000, { id: x })}; ${te(P, "MOVE_TO_CASE", 1000, { kase: C1, from: x })}; ${te(P, "MOVE_TO_CASE", 1000, { kase: C2, from: x })}; commit;`; })(), /money_trust_entry_firm_id_moved_from_entry_id_key/, "23505"));
    ok("FO-7ts DW6 fail: a + half naming a deposit, a − half on a case, a + half with no case, and moved_from on another kind are refused",
      refused(T, `begin; ${te(P, "MOVE_TO_CASE", 1000, { kase: C1, from: sql(T, `select id from money_trust_entry where person_id = '${P}' and kind = 'DEPOSIT'`) })}; commit;`, /names the − half of a move, not a DEPOSIT/)
      && refused(T, `begin; ${te(P, "MOVE_TO_CASE", -1000, { kase: C1 })}; commit;`, /money_trust_entry_move_check/)
      && refused(T, (() => { const x = randomUUID(); return `begin; ${te(P, "MOVE_TO_CASE", -1000, { id: x })}; ${te(P, "MOVE_TO_CASE", 1000, { from: x })}; commit;`; })(), /money_trust_entry_move_check/)
      && refused(T, te(P, "REFUND_TO_CLIENT", -100, { reason: "Returned", from: mOld }), /money_trust_entry_move_check/));
    ok("FO-7ts DW6 pass: the pairs left P's balance where its deposits put it (500.00), nothing pending", sums(P).endsWith(":50000"));
  }
  // ------------------------------------------------------------------------------------------ DW7: one at a time
  for (const iso of ["read committed", "repeatable read"]) {
    const P = randomUUID(); dep(P, 15000);
    const mk = () => { const m = randomUUID(); return `${te(P, "MOVE_TO_CASE", -15000, { id: m })}; ${te(P, "MOVE_TO_CASE", 15000, { kase: C1, from: m })}`; };
    const r = await race([mk(), mk()], iso);
    ok(`FO-7ts DW7 pass (${iso}): two connections each moving CAD 150.00 of one 150.00 pre-case balance — one commits, the other is refused`,
      r.filter((x) => x.ok).length === 1 && r.some((x) => !x.ok && ["23514", "23505", "40001"].includes(x.code ?? "")) && sums(P) === "0:15000:15000", { r, s: sums(P) });
  }
  // ------------------------------------------------------------------------------------- DW8: not a way out (P-603)
  {
    const P = u(504), d = dep(P, 20000); const m = randomUUID();
    sql(T, `begin; ${te(P, "MOVE_TO_CASE", -5000, { id: m })}; ${te(P, "MOVE_TO_CASE", 5000, { kase: C1, from: m })}; commit;`);
    const plus = sql(T, `select id from money_trust_entry where moved_from_entry_id = '${m}'`);
    ok("FO-7ts DW8 fail: a correction naming either half of a move is refused (money leaves trust only by a withdrawal or a refund, P-603)",
      refused(T, te(P, "CORRECTION", 5000, { corrects: m, reason: "Move undone" }), /a correction names a withdrawal .* or a deposit .*, never a MOVE_TO_CASE/, "23514")
      && refused(T, te(P, "CORRECTION", -5000, { corrects: plus, reason: "Move undone" }), /never a MOVE_TO_CASE/));
    ok("FO-7ts DW8 pass: a correction naming a deposit is still accepted", !!sql(T, te(P, "CORRECTION", -1000, { corrects: d, ck: "RECORDED_BY_MISTAKE", reason: "Typed twice" })));
  }
  // ------------------------------------------------------------------------- DW21: outflow only from what is held
  {
    const P = u(505); const chq = dep(P, 5000, { method: "CHEQUE", cleared: false });
    sql(T, te(P, "REFUND_TO_CLIENT", -5000, { reason: "Returned unused money" })); sql(T, te(P, "CORRECTION", -5000, { corrects: chq, ck: "RETURNED", reason: "Cheque bounced" }));
    const view = shortfalls();
    ok("FO-7ts DW21 fail (P-634): pre-case CAD −50.00 after a returned cheque — a move of 1.00 to a case is refused, and money_trust_shortfall still lists the party at −50.00",
      refused(T, pairQ(P, 100), /Only CAD 0\.00 is available/, "23514") && view.includes(`${P}=-5000`) && shortfalls() === view);
    const R = u(506); dep(R, 15000);
    ok("FO-7ts DW21 pass: with pre-case CAD 150.00 the pair is accepted and the shortfall view is unchanged", (sql(T, pairQ(R, 15000)), shortfalls() === view && sums(R) === "0:15000:15000"));
    // Build Lead C's ruling: a pair may run while the party's case is below zero (it puts held money where the shortfall is).
    const S = u(507); const c2 = dep(S, 5000, { method: "CHEQUE", cleared: false, kase: C1 });
    sql(T, te(S, "REFUND_TO_CLIENT", -5000, { reason: "Returned unused money", kase: C1 })); sql(T, te(S, "CORRECTION", -5000, { corrects: c2, ck: "RETURNED", reason: "Cheque bounced", kase: C1 })); dep(S, 15000);
    ok("FO-7ts DW21 pass (Build Lead C's ruling): with the case at −50.00 and 150.00 held before a case, moving 150.00 to the case is accepted: the case 100.00, the party 100.00, no shortfall left",
      (sql(T, pairQ(S, 15000)), sums(S) === "0:10000:10000" && !shortfalls().includes(S)), sums(S));
  }
  // ------------------------------------------------------------------------------------ DW22: not on the To move list
  {
    const P = u(508); dep(P, 3000); sql(T, pairQ(P, 3000));
    const ids = sql(T, `select string_agg(id::text, ',') from money_trust_entry where person_id = '${P}' and kind = 'MOVE_TO_CASE'`).split(",");
    const plus = sql(T, `select id from money_trust_entry where person_id = '${P}' and kind = 'MOVE_TO_CASE' and amount_minor > 0`); const b = randomUUID();
    ok("FO-7ts DW22 pass: after a pair, money_to_move has no line for either half", sql(T, `select count(*) from money_to_move where source_entry_id in ('${ids.join("','")}')`) === "0");
    ok("FO-7ts DW22 fail: a hand-made move line naming the + half is refused by money_move_line_write",
      refused(T, `begin; insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${b}', '${F}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-20', 'user-R'); insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${F}', '${b}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 3000, '${plus}'); commit;`, /a trust application moves a withdrawal to an invoice/));
  }

  // ============================================================================================ the credit ledger
  type CE = { pay?: string; inv?: string; rev?: string; reason?: string; kase?: string | null; pid?: string; id?: string };
  const ce = (pid: string, kind: string, amount: number, x: CE = {}) =>
    `insert into money_credit_entry (id, firm_id, person_id, case_id, kind, amount_minor, currency, payment_id, invoice_id, reverses_entry_id, reason, created_by) values ('${x.id ?? randomUUID()}', '${F}', '${pid}', ${x.kase ? `'${x.kase}'` : "null"}, '${kind}', ${amount}, 'CAD', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.rev ? `'${x.rev}'` : "null"}, ${x.reason ? `'${x.reason}'` : "null"}, 'user-R') returning id`;
  const inv = (pid: string, total: number, o: { kase?: string; draft?: boolean } = {}) => { const id = randomUUID();
    sql(T, `insert into money_invoice (id, firm_id, person_id, case_id, currency, due_date, created_by, updated_at) values ('${id}', '${F}', '${pid}', ${o.kase ? `'${o.kase}'` : "null"}, 'CAD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${F}', '${id}', 1, 'FEE', 'Work permit application', 1, ${total}, ${total}, 'CAD');
      ${o.draft ? "select 1" : `update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${id}'`}`); return id; };
  const paid = (invId: string, amount: number) => last(T, `insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${F}', '${invId}', 'E_TRANSFER', ${amount}, 'CAD', 'OPERATING', now(), '${key()}', 'user-R') returning id`);
  const credit = (pid: string, kase: string | null = null) => sql(T, `select coalesce((select balance_after_minor from money_credit_entry where firm_id = '${F}' and ${kase ? `case_id = '${kase}'` : `case_id is null and person_id = '${pid}'`} order by seq desc limit 1), 0)`);
  // -------------------------------------------------------------------------- DW12: credit (AG-6-21's example)
  {
    const P = u(601), I1 = inv(P, 150000), pay = paid(I1, 170000);
    ok("FO-7ts DW12 fail: keeping CAD 201.00 from a CAD 1,700.00 payment on a CAD 1,500.00 invoice is refused, naming 200.00",
      refused(T, ce(P, "KEPT", 20100, { pay }), /only CAD 200\.00|only 200\.00 CAD was paid over this invoice/, "23514"));
    ok("FO-7ts DW12 pass: 150.00 kept → the holder's credit 150.00; fail: 60.00 more on that payment is refused (210.00 > 200.00); 50.00 → 200.00",
      (sql(T, ce(P, "KEPT", 15000, { pay })), credit(P) === "15000") && refused(T, ce(P, "KEPT", 6000, { pay }), /only 50\.00 CAD was paid over this invoice/) && (sql(T, ce(P, "KEPT", 5000, { pay })), credit(P) === "20000"));
    const D = inv(P, 30000, { draft: true });
    ok("FO-7ts DW12 pass: applying 200.00 to a draft of the same holder leaves 0.00; fail: 1.00 more is refused", (sql(T, ce(P, "APPLIED", -20000, { inv: D })), credit(P) === "0") && refused(T, ce(P, "APPLIED", -100, { inv: D }), /Only CAD 0\.00 of credit is available/, "23514"));
    const P2c = u(602), Ia = inv(P2c, 10000, { kase: C1 }), payA = paid(Ia, 15000); sql(T, ce(P2c, "KEPT", 5000, { pay: payA, kase: C1 }));
    ok("FO-7ts DW12 fail: credit held on one case does not pay an invoice of another case of the same party, nor one with no case; keeping it for the party when the invoice is the case's is refused",
      refused(T, ce(P2c, "APPLIED", -1000, { kase: C1, inv: inv(P2c, 5000, { kase: C2, draft: true }) }), /credit pays only an invoice of its holder/)
      && refused(T, ce(P2c, "APPLIED", -1000, { kase: C1, inv: inv(P2c, 5000, { draft: true }) }), /credit pays only an invoice of its holder/)
      && refused(T, ce(P2c, "KEPT", 100, { pay: payA }), /kept for its invoice's holder/));
    ok("FO-7ts DW12 fail: a refund of credit with no reason is refused; with one it is accepted; credit is never kept from money in trust",
      refused(T, ce(P2c, "REFUNDED", -1000, { kase: C1 }), /money_credit_entry_reason_check/) && !!sql(T, ce(P2c, "REFUNDED", -1000, { kase: C1, reason: "Paid back by e-Transfer" }))
      && refused(T, ce(P2c, "KEPT", 100, { pay: sql(T, `select payment_id from money_trust_entry where kind = 'DEPOSIT' and person_id = '${u(501)}'`) }), /kept from a payment into operating on an invoice/));
    ok("FO-7ts DW12 fail: an applied amount over what is due on the invoice is refused", refused(T, ce(P2c, "APPLIED", -4000, { kase: C1, inv: inv(P2c, 3000, { kase: C1, draft: true }) }), /more than is due on the invoice \(30\.00 CAD\)/));
    ok("FO-7ts DW12 fail: credit entries are never changed or removed",
      refused(T, `update money_credit_entry set amount_minor = 1 where person_id = '${P}'`, /rows are never changed or removed/, "42501") && refused(T, `delete from money_credit_entry where person_id = '${P}'`, /rows are never changed or removed/, "42501"));
  }
  // ---------------------------------------------------------------------------------------- DW14: credit reversed
  {
    const P = u(603), I = inv(P, 100000), pay = paid(I, 120000), k = sql(T, ce(P, "KEPT", 20000, { pay }));
    ok("FO-7ts DW14 fail: a REVERSED of 201.00 against a KEPT 200.00 is refused; a reversal with the KEPT's own sign is refused",
      refused(T, ce(P, "REVERSED", -20100, { rev: k, reason: "Payment reversed" }), /never undoes more than it/) && refused(T, ce(P, "REVERSED", 100, { rev: k, reason: "Payment reversed" }), /opposite sign/));
    ok("FO-7ts DW14 pass: a REVERSED of the KEPT 200.00 leaves 0.00", (sql(T, ce(P, "REVERSED", -20000, { rev: k, reason: "Payment reversed" })), credit(P) === "0"));
    const P3 = u(604), I3 = inv(P3, 100000), pay3 = paid(I3, 120000), k3 = sql(T, ce(P3, "KEPT", 20000, { pay: pay3 })), D3 = inv(P3, 50000);
    const a3 = sql(T, ce(P3, "APPLIED", -20000, { inv: D3 })); const due = () => sql(T, `select money_invoice_due('${F}', '${D3}')`);
    const dueApplied = due();
    ok("FO-7ts DW14 fail (Lead 61, 5c): with the 200.00 applied, reversing the KEPT first is refused (credit never goes below zero)", refused(T, ce(P3, "REVERSED", -20000, { rev: k3, reason: "Payment reversed" }), /Only CAD 0\.00 of credit is available/));
    ok("FO-7ts DW14 pass: REVERSED of the APPLIED (+200.00), then of the KEPT (−200.00) → 0.00, and the invoice is open again by 200.00",
      (sql(T, ce(P3, "REVERSED", 20000, { rev: a3, reason: "Payment reversed" })), sql(T, ce(P3, "REVERSED", -20000, { rev: k3, reason: "Payment reversed" })), credit(P3) === "0")
      && Number(due()) - Number(dueApplied) === 20000 && dueApplied === "30000", { dueApplied, now: due() });
  }
  // ------------------------------------------------------------------------- DW13: the credit lock and one lock order
  for (const iso of ["read committed", "repeatable read"]) {
    const P = randomUUID(), I = inv(P, 100000), pay = paid(I, 120000); sql(T, ce(P, "KEPT", 20000, { pay }));
    const D1 = inv(P, 30000, { draft: true }), D2 = inv(P, 30000, { draft: true });
    const r = await race([ce(P, "APPLIED", -20000, { inv: D1 }), ce(P, "APPLIED", -20000, { inv: D2 })], iso);
    ok(`FO-7ts DW13 pass (${iso}): two connections each applying CAD 200.00 of one 200.00 credit — one commits, the other is refused`,
      r.filter((x) => x.ok).length === 1 && r.some((x) => !x.ok && ["23514", "23505", "40001"].includes(x.code ?? "")) && credit(P) === "0", r);
  }
  {
    // One order: a credit application and a trust withdrawal on one party and invoice at once run in turn and both finish.
    const P = randomUUID(); dep(P, 50000); const I = inv(P, 50000), pay = paid(I, 60000); sql(T, ce(P, "KEPT", 10000, { pay }));
    const I2 = inv(P, 40000), outs: { ok: boolean; code?: string }[] = [];
    for (let i = 0; i < 10; i++) outs.push(...await race([ce(P, "APPLIED", -1000, { inv: I2 }), te(P, "WITHDRAWAL_TO_INVOICE", -1000, { inv: I2 })]));
    ok("FO-7ts DW13 pass: 10 rounds of a credit application and a trust withdrawal on one party and one invoice at once — all 20 finish, no 40P01",
      outs.every((x) => x.ok) && credit(P) === "0", outs.filter((x) => !x.ok));
    // The wrong order, by hand: the invoice row first, then the party's lock, against a credit writer → PostgreSQL's 40P01.
    const ca = new pg.Client({ connectionString: urlOf(T) }), cb = new pg.Client({ connectionString: urlOf(T) }); await ca.connect(); await cb.connect(); conns.push(ca, cb);
    sql(T, ce(P, "REVERSED", 1000, { rev: sql(T, `select id from money_credit_entry where person_id = '${P}' and kind = 'APPLIED' order by seq limit 1`), reason: "Applied in error" }));
    for (const c of [ca, cb]) await c.query("set deadlock_timeout = '200ms'; set lock_timeout = '10s'");  // a lost lock fails, never hangs (review m3)
    const bpid = (await cb.query("select pg_backend_pid() p")).rows[0].p;
    await ca.query("begin"); await ca.query(`update money_invoice set updated_at = now() where id = '${I2}'`);
    const pb = cb.query(ce(P, "APPLIED", -500, { inv: I2 })).then(() => "ok", (e: { code?: string }) => e.code ?? "error");
    for (let i = 0; i < 400 && (await ca.query(`select wait_event_type w from pg_stat_activity where pid = ${bpid}`)).rows[0]?.w !== "Lock"; i++) await new Promise((r) => setTimeout(r, 5));
    const pa = ca.query(`select money_trust_lock('${F}', '${P}', 'CAD')`).then(() => "ok", (e: { code?: string }) => e.code ?? "error");
    const [ra, rb] = await Promise.all([pa, pb]); await ca.query("rollback").catch(() => undefined);
    for (const c of [ca, cb]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
    ok("FO-7ts DW13 fail (planted wrong order): the invoice row first, then the party's lock, against a credit writer → one side gets 40P01", ra === "40P01" || rb === "40P01", { ra, rb });
    // No writer in the code takes that order: every function that touches an invoice row and takes the party's lock takes
    // the lock first; those that take none touch it through money_issued_invoice (which locks first), run after a trust
    // entry's own lock (money_trust_entry_moves, an AFTER trigger), or edit a draft's lines (no party lock at all).
    const order = sql(T, `select string_agg(proname || ':' || position('money_trust_lock(' in prosrc) || ':' || least(nullif(position('UPDATE "money_invoice"' in prosrc), 0), nullif(position('money_issued_invoice(' in prosrc), 0), nullif(position('FOR SHARE' in prosrc), 0)), ',' order by proname)
      from pg_proc where pronamespace = 'public'::regnamespace and proname <> 'money_issued_invoice' and (prosrc like '%UPDATE "money_invoice"%' or prosrc like '%money_issued_invoice(%' or (prosrc like '%"money_invoice"%' and prosrc like '%FOR SHARE%'))`).split(",");
    const wrong = order.map((x) => x.split(":")).filter(([name, lock, touch]) => Number(lock) === 0
      ? !["money_trust_entry_moves", "money_invoice_line_write", "money_write_off_write"].includes(name) : Number(lock) > Number(touch));
    ok("FO-7ts DW13 fail → pass: no function in the database touches an invoice row before the party's lock", wrong.length === 0 && order.length >= 6, order);
  }
  // ---------------------------------------------------------------------------------------- DW23: one lock key
  {
    const P = randomUUID(), Q = randomUUID(); dep(P, 20000); dep(Q, 20000);
    const I = inv(P, 10000), pay = paid(I, 15000), IQ = inv(Q, 10000), payQ = paid(IQ, 15000);
    const g = new pg.Client({ connectionString: urlOf(T) }), c = new pg.Client({ connectionString: urlOf(T) }); await g.connect(); await c.connect(); conns.push(g, c);
    const cpid = (await c.query("select pg_backend_pid() p")).rows[0].p;
    const pay990 = randomUUID();
    await g.query("begin"); await g.query(`insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${pay990}', '${F}', 'E_TRANSFER', 100, 'CAD', 'TRUST', now(), '${key()}', 'user-R'); ${te(P, "DEPOSIT", 100, { pay: pay990 })}`);
    const waits = async () => { for (let i = 0; i < 200; i++) { if ((await g.query(`select wait_event_type w from pg_stat_activity where pid = ${cpid}`)).rows[0]?.w === "Lock") return true; await new Promise((r) => setTimeout(r, 5)); } return false; };
    const pOther = await c.query(ce(Q, "KEPT", 5000, { pay: payQ })).then(() => true, () => false);
    const pc = c.query(ce(P, "KEPT", 5000, { pay })); const waited = await waits();
    const lockSeen = sql(T, `select count(*) from pg_locks l where l.locktype = 'advisory' and l.pid = ${cpid} and not l.granted`);
    await g.query("commit"); await pc;
    const m = randomUUID(); const pm = c.query("begin").then(() => c.query(`${te(P, "MOVE_TO_CASE", -100, { id: m })}`)).then(() => c.query(`${te(P, "MOVE_TO_CASE", 100, { kase: C1, from: m })}`)).then(() => c.query("commit"));
    await pm;
    for (const x of [g, c]) { await x.end(); conns.splice(conns.indexOf(x), 1); }
    ok("FO-7ts DW23 pass: with a deposit's transaction held open on party P, a credit write on P waits for the same advisory lock (seen in pg_locks); one on another party does not",
      pOther && waited && lockSeen === "1" && credit(P) === "5000", { pOther, waited, lockSeen });
    ok("FO-7ts DW23 pass: the credit trigger and the move pair take the lock through money_trust_lock (one key text, FO-7lk)",
      sql(T, `select string_agg(proname, ',' order by proname) from pg_proc where proname in ('money_credit_entry_write', 'money_trust_entry_write') and prosrc like '%money_trust_lock(%'`) === "money_credit_entry_write,money_trust_entry_write"
      && sql(T, `select string_agg(proname, ',' order by proname) from pg_proc where prosrc like '%''money_trust:''%'`) === "money_trust_lock");
  }
  // --------------------------------------------------------------------------------------------- DW24: PF-12's walls
  {
    const firmE = firm(T, "firm-ts-w"); sql(T, `${settingsQ(firmE)}; update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O' where firm_id = '${firmE}'`);
    const app = (f: string, q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_app@127.0.0.1:54329/${T}`, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", `select set_config('app.firm_id', '${f}', false) is null; ${q}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").at(-1);
    const appRefused = (f: string, q: string, re: RegExp) => { try { app(f, q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
    ok("FO-7ts DW24 fail: firm E's session reads no money_credit_entry row of firm D; pass: firm D's session reads its own",
      app(firmE, `select count(*) from money_credit_entry where firm_id = '${F}'`) === "0" && Number(app(F, `select count(*) from money_credit_entry`)) > 0);
    ok("FO-7ts DW24 fail: firm E's session inserting a credit entry naming firm D is refused by the wall",
      appRefused(firmE, ce(u(601), "REFUNDED", -1, { reason: "x" }), /row-level security/) && sql(T, `select count(*) from pg_policy where polrelid = 'money_credit_entry'::regclass and polname = 'pf12_firm'`) === "1"
      && sql(T, `select relforcerowsecurity from pg_class where relname = 'money_credit_entry'`) === "t");
  }

  // ------------------------------------------------- the credit rules after later writes (break on 692ea4be, B4-B8)
  {
    const refundQ = (pay: string, amount: number) => `insert into money_refund (firm_id, payment_id, amount_minor, currency, reason, route, idempotency_key, created_by) values ('${F}', '${pay}', ${amount}, 'CAD', 'Paid back', 'OFFLINE', '${key()}', 'user-R') returning amount_minor`;
    // B5: 300.00 applied to a 1,000.00 invoice, then 1,000.00 paid and 300.00 of it kept; reversing the application is refused.
    const P = randomUUID(), I0 = inv(P, 50000), p0 = paid(I0, 80000); sql(T, ce(P, "KEPT", 30000, { pay: p0 }));
    const I = inv(P, 100000), a = sql(T, ce(P, "APPLIED", -30000, { inv: I })), pI = paid(I, 100000); sql(T, ce(P, "KEPT", 30000, { pay: pI }));
    ok("FO-7ts break B5 fail: with 300.00 kept from an invoice's payments, reversing 300.00 of credit applied to it is refused (no credit from nothing); credit stays 300.00",
      refused(T, ce(P, "REVERSED", 30000, { rev: a, reason: "Applied in error" }), /held as credit, so the invoice must stay paid over/, "23514") && credit(P) === "30000");
    // B4: a refund of the payment the credit was kept from.
    ok("FO-7ts break B4 fail: a refund of 300.00 from the payment that 300.00 was kept from is refused; pass: once the kept credit is reversed, the refund is accepted",
      refused(T, refundQ(pI, 30000), /held as credit|never more than the payment less its refunds/, "23514")
      && (sql(T, ce(P, "REVERSED", -30000, { rev: sql(T, `select id from money_credit_entry where payment_id = '${pI}'`), reason: "Refunded instead" })), sql(T, refundQ(pI, 30000)) === "30000"));
    // B6: trust returned from a withdrawal re-opens an invoice whose overpayment was kept.
    const Q = randomUUID(); dep(Q, 150000); const IQ = inv(Q, 150000), w = sql(T, te(Q, "WITHDRAWAL_TO_INVOICE", -150000, { inv: IQ })), pQ = paid(IQ, 20000); sql(T, ce(Q, "KEPT", 20000, { pay: pQ }));
    ok("FO-7ts break B6 fail: returning the 1,500.00 to trust from the withdrawal that paid the invoice is refused while 200.00 of its overpayment is kept as credit",
      refused(T, te(Q, "CORRECTION", 150000, { corrects: w, reason: "Returned to trust" }), /held as credit, so the invoice must stay paid over/, "23514"));
    // B7: a draft's lines never fall below the credit applied to it.
    const R = randomUUID(), IR = inv(R, 100000), pR = paid(IR, 120000); sql(T, ce(R, "KEPT", 20000, { pay: pR }));
    const D = inv(R, 30000, { draft: true }); sql(T, ce(R, "APPLIED", -20000, { inv: D }));
    ok("FO-7ts break B7 fail: with 200.00 applied to a 300.00 draft, cutting its line to 50.00 or deleting it is refused; pass: cutting it to 200.00 is accepted",
      refused(T, `update money_invoice_line set unit_amount_minor = 5000, amount_minor = 5000 where invoice_id = '${D}'`, /credit is applied to this draft, more than its lines would leave/, "23514")
      && refused(T, `delete from money_invoice_line where invoice_id = '${D}'`, /more than its lines would leave/)
      && sql(T, `update money_invoice_line set unit_amount_minor = 20000, amount_minor = 20000 where invoice_id = '${D}' returning amount_minor`) === "20000");
    ok("FO-7ts break B8 fail: a draft holding applied credit keeps its party, case and currency; an issued invoice with kept credit too",
      refused(T, `update money_invoice set person_id = '${randomUUID()}' where id = '${D}'`, /holds credit .*never change/, "23514")
      && refused(T, `update money_invoice set case_id = '${C2}' where id = '${D}'`, /never change/) && refused(T, `update money_invoice set currency = 'USD' where id = '${D}'`, /never change/)
      && refused(T, `update money_invoice set person_id = '${randomUUID()}' where id = '${IR}'`, /holds credit .*never change/));
    const Iq = inv(R, 10000), big = paid(Iq, 20000), small = paid(Iq, 5000); sql(T, ce(R, "KEPT", 5000, { pay: small }));  // review m-d: the per-payment rule
    ok("FO-7ts fail (review m-d): refunding the 50.00 payment that 50.00 was kept from is refused, though the invoice stays over by 100.00", refused(T, refundQ(small, 5000), /never more than the payment less its refunds/, "23514") && !!big);
    ok("FO-7ts fail (review m-c): credit held on a case pays only an invoice of the holder's own party", refused(T, ce(randomUUID(), "APPLIED", -100, { kase: C1, inv: inv(u(602), 5000, { kase: C1, draft: true }) }), /pays only an invoice of its holder/));
    const Ix = inv(R, 100000), ra = paid(Ix, 1000), rb = paid(Ix, 1000);  // review M2: refunds on one party's invoice in two orders never deadlock
    const [u1, u2] = [0, 1].map(() => new pg.Client({ connectionString: urlOf(T) })); for (const c of [u1, u2]) { await c.connect(); conns.push(c); }  // review n-d: a fixed order
    await u1.query("begin"); await u1.query(refundQ(ra, 100)); const w2 = u2.query(refundQ(rb, 100)).then(() => ({ ok: true }), (e: { code?: string }) => ({ ok: false, code: e.code }));
    for (let i = 0; i < 400 && (await u1.query("select wait_event_type w from pg_stat_activity where pid = $1", [(u2 as unknown as { processID: number }).processID])).rows[0]?.w !== "Lock"; i++) await new Promise((r) => setTimeout(r, 5));
    const w1 = await u1.query(refundQ(rb, 100)).then(() => u1.query("commit")).then(() => ({ ok: true }), (e: { code?: string }) => ({ ok: false, code: e.code })); const rr = [w1, await w2];
    for (const c of [u1, u2]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
    ok("FO-7ts pass (review M2): one transaction refunding payments A then B while another refunds B both finish (the party lock is taken before the payment row)", rr.every((x) => x.ok), rr);
    const kr: { ok: boolean; code?: string }[] = [];  // break N9: a kept credit and a refund of one payment, started together, never deadlock
    for (let i = 0; i < 10; i++) { const Ik = inv(R, 10000), pk = paid(Ik, 15000); kr.push(...await race([ce(R, "KEPT", 3000, { pay: pk }), refundQ(pk, 1000)])); }
    ok("FO-7ts pass (break N9): 10 rounds of a KEPT and a refund of the same payment at once all finish, no 40P01", kr.every((x) => x.ok || x.code !== "40P01") && kr.filter((x) => x.ok).length === 20, kr.filter((x) => !x.ok));
    const Dn = inv(R, 30000, { draft: true }), cn = new pg.Client({ connectionString: urlOf(T) }); await cn.connect(); conns.push(cn);  // break N4, at REPEATABLE READ
    await cn.query("begin isolation level repeatable read"); await cn.query("select count(*) from money_credit_entry");
    sql(T, `update money_invoice_line set unit_amount_minor = 5000, amount_minor = 5000 where invoice_id = '${Dn}'`);
    const stale = await cn.query(ce(R, "APPLIED", -20000, { inv: Dn })).then(() => "ok", (e: { code?: string }) => e.code); await cn.query("rollback"); await cn.end(); conns.splice(conns.indexOf(cn), 1);
    ok("FO-7ts fail (break N4): at REPEATABLE READ, applying 200.00 to a draft whose line was cut to 50.00 after the snapshot is refused (40001), never accepted", stale === "40001", stale);
    {  // break N11: a header save holds the draft; credit applied and a line save queue behind it; neither gets 40P01
      const Dd = inv(R, 30000, { draft: true }), [t1, t2, t3] = [0, 1, 2].map(() => new pg.Client({ connectionString: urlOf(T) }));
      for (const c of [t1, t2, t3]) { await c.connect(); conns.push(c); }
      const waitLock = async (c: pg.Client) => { const pid = (c as unknown as { processID: number }).processID; for (let i = 0; i < 400; i++) { if ((await t3.query("select wait_event_type w from pg_stat_activity where pid = $1", [pid])).rows[0]?.w === "Lock") return; await new Promise((r) => setTimeout(r, 5)); } };
      await t3.query("begin"); await t3.query(`update money_invoice set due_date = '2026-12-20' where id = '${Dd}'`);
      const r1 = t1.query(ce(R, "APPLIED", -1000, { inv: Dd })).then(() => "ok", (e: { code?: string }) => e.code); await waitLock(t1);
      const r2 = t2.query(`update money_invoice_line set unit_amount_minor = 29000, amount_minor = 29000 where invoice_id = '${Dd}'`).then(() => "ok", (e: { code?: string }) => e.code); await waitLock(t2);
      await t3.query("commit"); const out = [await r1, await r2];
      for (const c of [t1, t2, t3]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
      ok("FO-7ts pass (break N11): a header save, then credit applied and a line save queued behind it on one draft — both finish, no 40P01", out.every((x) => x === "ok"), out);
    }
    {  // review M3 (D2): one transaction saves the draft's header, a line save waits on it, then the same transaction applies credit
      const Dd = inv(R, 30000, { draft: true }), [t1, t2] = [0, 1].map(() => new pg.Client({ connectionString: urlOf(T) }));
      for (const c of [t1, t2]) { await c.connect(); conns.push(c); }
      await t1.query("begin"); await t1.query(`update money_invoice set due_date = '2026-12-20' where id = '${Dd}'`);
      const r2 = t2.query(`update money_invoice_line set unit_amount_minor = 29000, amount_minor = 29000 where invoice_id = '${Dd}'`).then(() => "ok", (e: { code?: string }) => e.code);
      for (let i = 0; i < 400 && (await t1.query("select wait_event_type w from pg_stat_activity where pid = $1", [(t2 as unknown as { processID: number }).processID])).rows[0]?.w !== "Lock"; i++) await new Promise((r) => setTimeout(r, 5));
      const r1 = await t1.query(ce(R, "APPLIED", -1000, { inv: Dd })).then(() => t1.query("commit")).then(() => "ok", (e: { code?: string }) => e.code); const out = [r1, await r2];
      for (const c of [t1, t2]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
      ok("FO-7ts pass (review M3): header save then credit applied in one transaction, with a line save waiting between — both finish at READ COMMITTED, no 40P01", out.every((x) => x === "ok"), out);
    }
    {  // review n-g: the same shape at REPEATABLE READ — the apply never waits on the line (NOWAIT, 55P03), never 40P01
      const Dd = inv(R, 30000, { draft: true }), [t1, t2] = [0, 1].map(() => new pg.Client({ connectionString: urlOf(T) }));
      for (const c of [t1, t2]) { await c.connect(); conns.push(c); }
      await t1.query("begin isolation level repeatable read"); await t1.query(`update money_invoice set due_date = '2026-12-20' where id = '${Dd}'`);
      const r2 = t2.query(`update money_invoice_line set unit_amount_minor = 29000, amount_minor = 29000 where invoice_id = '${Dd}'`).then(() => "ok", (e: { code?: string }) => e.code);
      for (let i = 0; i < 400 && (await t1.query("select wait_event_type w from pg_stat_activity where pid = $1", [(t2 as unknown as { processID: number }).processID])).rows[0]?.w !== "Lock"; i++) await new Promise((r) => setTimeout(r, 5));
      const r1 = await t1.query(ce(R, "APPLIED", -1000, { inv: Dd })).then(() => "ok", (e: { code?: string }) => e.code); await t1.query("rollback"); const out = [r1, await r2];
      for (const c of [t1, t2]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
      ok("FO-7ts pass (review n-g): the same at REPEATABLE READ — the apply is refused at once (55P03), the line save then commits, no 40P01", out[0] === "55P03" && out[1] === "ok", out);
    }
    {  // break N12, review m-f: an editor saves the header, credit is applied at REPEATABLE READ, then the editor saves a line
      const Dd = inv(R, 30000, { draft: true }), [ed, ap] = [0, 1].map(() => new pg.Client({ connectionString: urlOf(T) }));
      for (const c of [ed, ap]) { await c.connect(); conns.push(c); }
      await ed.query("begin"); await ed.query(`update money_invoice set due_date = '2026-12-20' where id = '${Dd}'`);
      await ap.query("begin isolation level repeatable read"); const ra = ap.query(ce(R, "APPLIED", -1000, { inv: Dd })).then(() => "ok", (e: { code?: string }) => e.code);
      for (let i = 0; i < 400 && (await ed.query("select wait_event_type w from pg_stat_activity where pid = $1", [(ap as unknown as { processID: number }).processID])).rows[0]?.w !== "Lock"; i++) await new Promise((r) => setTimeout(r, 5));
      const re = await ed.query(`update money_invoice_line set unit_amount_minor = 29000, amount_minor = 29000 where invoice_id = '${Dd}'`).then(() => ed.query("commit")).then(() => "ok", (e: { code?: string }) => e.code);
      const out = [re, await ra]; await ap.query("rollback").catch(() => undefined);
      for (const c of [ed, ap]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
      ok("FO-7ts pass (break N12): header then line saved in one transaction while credit is applied at REPEATABLE READ — the save commits, the stale apply is refused (40001), no 40P01", out[0] === "ok" && out[1] === "40001", out);
    }
    const chqInv = inv(R, 10000), chq = last(T, `insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${F}', '${chqInv}', 'CHEQUE', 15000, 'CAD', 'OPERATING', now(), '${key()}', 'user-R', false) returning id`);
    const I2p = inv(R, 100000), q1 = paid(I2p, 110000), q2 = paid(I2p, 10000); ok("FO-7ts fail (review m4): credit kept from one payment is never more than that payment (150.00 from a 100.00 payment), though the invoice is over by 200.00", refused(T, ce(R, "KEPT", 15000, { pay: q2 }), /never more than the payment, less its refunds/) && !!q1);
    ok("FO-7ts fail (break note on 692ea4be): credit is never kept from an uncleared cheque", refused(T, ce(R, "KEPT", 5000, { pay: chq }), /not cleared yet/, "23514"));
  }
  // ========================================================================================= part 3 (firm D, trust YES)
  // ------------------------------------------------------------------------- DW15 and DW27: trust refund details
  {
    const P = randomUUID(); dep(P, 50000);
    const back = (x: Record<string, string>) => sql(T, te(P, "REFUND_TO_CLIENT", -1000, { reason: "Returned unused money", cols: x }));
    const id = back({ refund_method: "'CHEQUE'", refunded_on: "current_date", refund_reference: "'88213'" });
    ok("FO-7ts DW15 pass (AG-6-23 rule 2): a trust refund with method, date and reference is stored",
      sql(T, `select refund_method || ':' || refunded_on || ':' || refund_reference || ':' || num_nonnulls(payee_person_id, payee_company_id, payee_name, payee_reason) from money_trust_entry where id = '${id}'`) === `CHEQUE:${sql(T, "select current_date")}:88213:0`);
    ok("FO-7ts DW15 fail (Build Lead C's ruling): a trust refund by CARD or CARD_TERMINAL is refused in words",
      refused(T, te(P, "REFUND_TO_CLIENT", -1000, { reason: "x", cols: { refund_method: "'CARD'" } }), /never by card \(CARD\): card refunds come with card payments/, "23514")
      && refused(T, te(P, "REFUND_TO_CLIENT", -1000, { reason: "x", cols: { refund_method: "'CARD_TERMINAL'" } }), /never by card \(CARD_TERMINAL\)/, "23514"));
    ok("FO-7ts DW15 fail → pass (AG-6-23 rule 3): a payee other than the party (a name, or another person) with no reason is refused; with a reason it is accepted; the party itself needs none",
      refused(T, te(P, "REFUND_TO_CLIENT", -1000, { reason: "x", cols: { payee_name: "'Employer Ltd'" } }), /money_trust_entry_refund_check/, "23514")
      && refused(T, te(P, "REFUND_TO_CLIENT", -1000, { reason: "x", cols: { payee_person_id: `'${u(9101)}'` } }), /money_trust_entry_refund_check/)
      && !!back({ payee_name: "'Employer Ltd'", payee_reason: "'The employer paid this deposit'" }) && !!back({ payee_person_id: `'${P}'` })
      && refused(T, te(P, "REFUND_TO_CLIENT", -1000, { reason: "x", cols: { payee_person_id: `'${P}'`, payee_reason: "'Not needed'" } }), /money_trust_entry_refund_check/));
    ok("FO-7ts DW27 fail: refund details on a DEPOSIT or a WITHDRAWAL_TO_INVOICE are refused; a REFUND_TO_CLIENT with no method, or no date, is refused",
      refused(T, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${u(9102)}', '${F}', 'CASH', 100, 'CAD', 'TRUST', now(), '${key()}', 'user-R'); ${te(P, "DEPOSIT", 100, { pay: u(9102), cols: { refund_method: "'CASH'" } })}`, /money_trust_entry_refund_check/, "23514")
      && refused(T, te(P, "WITHDRAWAL_TO_INVOICE", -100, { inv: inv(P, 100), cols: { refund_method: "'CASH'" } }), /money_trust_entry_refund_check/, "23514")
      && refused(T, te(P, "REFUND_TO_CLIENT", -100, { reason: "x", cols: { refund_method: "null" } }), /money_trust_entry_refund_check/, "23514")
      && refused(T, te(P, "REFUND_TO_CLIENT", -100, { reason: "x", cols: { refunded_on: "null" } }), /money_trust_entry_refund_check/, "23514"));
  }
  // ---------------------------------------------------------------------------------------- DW16: tax treatment
  {
    const P = randomUUID(), Q = randomUUID(), tt = (pid: string, t: string) => `insert into money_party_tax_treatment (firm_id, person_id, treatment, updated_by) values ('${F}', '${pid}', '${t}', 'user-O') returning treatment`;
    const tr = (id: string) => sql(T, `select coalesce(tax_treatment::text, '-') from money_invoice where id = '${id}'`);
    ok("FO-7ts DW16 pass → fail: a party's treatment is stored; a second treatment row for that party is refused",
      sql(T, tt(P, "ZERO_RATED")) === "ZERO_RATED" && refused(T, tt(P, "EXEMPT"), /money_party_tax_treatment_firm_id_person_id_key/, "23505"));
    const d = inv(P, 10000, { draft: true });
    ok("FO-7ts DW16 pass: an invoice's treatment changed on a draft is accepted", sql(T, `update money_invoice set tax_treatment = 'EXEMPT' where id = '${d}' returning tax_treatment`) === "EXEMPT");
    sql(T, `update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${d}'`);
    ok("FO-7ts DW16 fail: changing the treatment of an issued invoice is refused (FO-7a's freeze, extended)",
      refused(T, `update money_invoice set tax_treatment = 'TAXABLE' where id = '${d}'`, /issued invoices can't be edited/, "23514") && tr(d) === "EXEMPT");
    const dp = inv(P, 10000), dq = inv(Q, 10000);
    sql(T, `update money_party_tax_treatment set treatment = 'EXEMPT' where person_id = '${P}'`);
    ok("FO-7ts DW16 pass: a draft left at null takes the party's treatment at issue (ZERO_RATED), or Taxable with no row, and a later change to the party never moves an issued invoice",
      tr(dp) === "ZERO_RATED" && tr(dq) === "TAXABLE");
    const firmW = firm(T, "firm-ts-tt"); sql(T, settingsQ(firmW));
    const app = (f: string, q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_app@127.0.0.1:54329/${T}`, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", `select set_config('app.firm_id', '${f}', false) is null; ${q}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").at(-1);
    ok("FO-7ts DW16 fail → pass (PF-12): another firm's session reads no treatment row of firm D, and cannot write one naming firm D; firm D's session reads its own",
      app(firmW, `select count(*) from money_party_tax_treatment where firm_id = '${F}'`) === "0" && Number(app(F, `select count(*) from money_party_tax_treatment`)) > 0
      && (() => { try { app(firmW, tt(randomUUID(), "TAXABLE")); return false; } catch (e) { return /row-level security/.test(String((e as { stderr?: string }).stderr ?? e)); } })());
  }
  // ------------------------------------------------------------------------------ DW17: the same-case pick (Lead 61)
  const pick = (o: { by?: string; reason?: string | null; at?: string } = {}) => ({ picked_other_funds_by: `'${o.by ?? "user-R"}'`, picked_other_funds_reason: o.reason === null ? "null" : `'${o.reason ?? "The employer agreed to pay these fees from its deposit"}'`, ...(o.at ? { picked_other_funds_at: `'${o.at}'` } : {}) });
  const held = (pid: string) => sql(T, `select balance_after_minor from money_trust_entry where firm_id = '${F}' and person_id = '${pid}' order by seq desc limit 1`);
  {
    const A = randomUUID(), B = randomUUID(), K = randomUUID(), K2 = randomUUID();
    dep(A, 20000, { kase: K }); dep(A, 5000, { kase: K2 }); const IB = inv(B, 30000, { kase: K }), IBnone = inv(B, 30000), IA = inv(A, 30000, { kase: K }), IA2 = inv(A, 1000, { kase: K2 });
    ok("FO-7ts DW17 fail: with no pick at all, A's money paying B's invoice on the same case is refused (as today)",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -5000, { inv: IB, kase: K }), /trust pays only an invoice of the same party and currency/, "23514"));
    const id = sql(T, te(A, "WITHDRAWAL_TO_INVOICE", -5000, { inv: IB, kase: K, cols: pick({ at: "2001-01-01" }) }));
    ok("FO-7ts DW17 pass (Lead 61's test): A's money paying B's invoice on the same case, with the pick, is accepted; who, why and when are stored, when is the database's (a typed 2001 is replaced), and A's balance takes it",
      sql(T, `select picked_other_funds_by || ':' || picked_other_funds_reason || ':' || (picked_other_funds_at > now() - interval '1 minute') from money_trust_entry where id = '${id}'`) === "user-R:The employer agreed to pay these fees from its deposit:true" && held(A) === "20000");
    ok("FO-7ts DW17 fail: the same pick across two cases, with no case on one side, or with no case on either side, is refused even with the pick",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IB, kase: K2, cols: pick() }), /a pick never crosses cases or clients/, "23514")
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IBnone, kase: K, cols: pick() }), /a pick never crosses cases or clients/)
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IB, cols: pick() }), /a pick never crosses cases or clients/)
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IBnone, cols: pick() }), /a pick never crosses cases or clients/));
    ok("FO-7ts DW17 fail: a pick with no reason, by someone other than the writer, a lone pick time, or on a deposit is refused",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IB, kase: K, cols: pick({ reason: null }) }), /money_trust_entry_pick_check/, "23514")
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IB, kase: K, cols: pick({ by: "user-T" }) }), /money_trust_entry_pick_check/, "23514")
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IB, kase: K, cols: { picked_other_funds_at: "now()" } }), /trust pays only an invoice of the same party and currency/)
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IA, kase: K, cols: { picked_other_funds_at: "now()" } }), /money_trust_entry_pick_check/, "23514")
      && refused(T, `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${u(9103)}', '${F}', 'CASH', 100, 'CAD', 'TRUST', now(), '${key()}', 'user-R'); ${te(A, "DEPOSIT", 100, { pay: u(9103), kase: K, cols: pick() })}`, /money_trust_entry_pick_check/, "23514"));
    const usd = randomUUID(); sql(T, `insert into money_invoice (id, firm_id, person_id, case_id, currency, due_date, created_by, updated_at) values ('${usd}', '${F}', '${B}', '${K}', 'USD', '2026-12-15', 'user-R', now());
      insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${F}', '${usd}', 1, 'FEE', 'Work permit application', 1, 10000, 10000, 'USD'); update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${usd}'`);
    ok("FO-7ts DW17 fail: a pick in another currency (B's USD invoice on case K from A's CAD) is refused",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: usd, kase: K, cols: pick() }), /trust pays only an invoice of the same party and currency/, "23514"));
    ok("FO-7ts DW17 fail (Lead 95, proposal 2): pick fields where nothing is picked (A's own invoice, A's money on its case) are refused in words",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IA, kase: K, cols: pick() }), /nothing to pick: this money is the invoice's own party's, on its own case/, "23514"));
    ok("FO-7ts DW17 pass (Lead 95, proposal 1): the same party on another case is accepted by the database without a pick (the route requires it) and with one",
      !!sql(T, te(A, "WITHDRAWAL_TO_INVOICE", -500, { inv: IA2, kase: K })) && !!sql(T, te(A, "WITHDRAWAL_TO_INVOICE", -500, { inv: IA2, kase: K, cols: pick() })));
  }
  // ------------------------------------------------------------------- DW25 and DW31: a pick never goes below zero
  {
    const A = randomUUID(), B = randomUUID(), K = randomUUID(); dep(A, 10000, { kase: K }); const IB = inv(B, 30000, { kase: K });
    ok("FO-7ts DW25 fail (P-634 (1)): A holds CAD 100.00 on case K; a pick of 100.01 for B's 300.00 invoice is refused with #1991's words",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -10001, { inv: IB, kase: K, cols: pick() }), /Only CAD 100\.00 is available; the trust balance would go below zero/, "23514"));
    ok("FO-7ts DW25 pass: a pick of 100.00 is accepted and A is at 0.00", !!sql(T, te(A, "WITHDRAWAL_TO_INVOICE", -10000, { inv: IB, kase: K, cols: pick() })) && held(A) === "0");
    const chq = dep(A, 5000, { method: "CHEQUE", cleared: false, kase: K });
    sql(T, te(A, "REFUND_TO_CLIENT", -5000, { reason: "Returned unused money", kase: K })); sql(T, te(A, "CORRECTION", -5000, { corrects: chq, ck: "RETURNED", reason: "Cheque bounced", kase: K }));
    ok("FO-7ts DW25 fail: after a returned cheque takes A to CAD −50.00, any pick from A (even 0.01) is refused", held(A) === "-5000"
      && refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -1, { inv: IB, kase: K, cols: pick() }), /Only CAD 0\.00 is available; the trust balance would go below zero/, "23514"));
    const A3 = randomUUID(), B3 = randomUUID(), K4 = randomUUID(), K5 = randomUUID(); dep(A3, 10000, { kase: K4 }); dep(A3, 50000, { kase: K5 }); const IB3 = inv(B3, 30000, { kase: K4 });
    ok("FO-7ts DW31 fail (Lead 95, proposal 3): A holds 100.00 on case K4 and 500.00 on K5; a pick of 300.00 on K4 is refused by the per-case limit, though A's party-wide 600.00 would allow it",
      refused(T, te(A3, "WITHDRAWAL_TO_INVOICE", -30000, { inv: IB3, kase: K4, cols: pick() }), /a pick takes only what the payer holds on that case: Only CAD 100\.00 is available on it/, "23514"));
    ok("FO-7ts DW31 pass: a pick of 100.00 on K4 is accepted; A's K5 money is untouched", !!sql(T, te(A3, "WITHDRAWAL_TO_INVOICE", -10000, { inv: IB3, kase: K4, cols: pick() }))
      && sql(T, `select sum(amount_minor) filter (where case_id = '${K4}') || ':' || sum(amount_minor) filter (where case_id = '${K5}') from money_trust_entry where person_id = '${A3}'`) === "0:50000");
  }
  // ---------------------------------------------------------- the breaker's round 1 on 738531142 (M1-M3, m2-m4)
  {
    const A = randomUUID(), B = randomUUID(), C = randomUUID(), K = randomUUID(), J = randomUUID();
    dep(A, 30000, { kase: K }); const IB = inv(B, 10000, { kase: K }), pk = sql(T, te(A, "WITHDRAWAL_TO_INVOICE", -10000, { inv: IB, kase: K, cols: pick() })), pay = paid(IB, 5000);
    const [t1, t2] = [0, 1].map(() => new pg.Client({ connectionString: urlOf(T) }));
    for (const c of [t1, t2]) { await c.connect(); conns.push(c); }
    await t1.query("begin"); await t1.query(ce(B, "KEPT", 5000, { pay, kase: K }));
    const r2 = t2.query(te(A, "CORRECTION", 10000, { corrects: pk, kase: K, reason: "Returned to trust" })).then(() => "ok", (e: { code?: string; message?: string }) => `${e.code}:${e.message}`);
    for (let i = 0; i < 400 && (await t1.query("select wait_event_type w from pg_stat_activity where pid = $1", [(t2 as unknown as { processID: number }).processID])).rows[0]?.w !== "Lock"; i++) await new Promise((r) => setTimeout(r, 5));
    await t1.query("commit"); const out = await r2;
    for (const c of [t1, t2]) { await c.end(); conns.splice(conns.indexOf(c), 1); }
    ok("FO-7ts break M1 fail → pass: B's credit kept on its invoice and A's correction of a pick on it, at once (READ COMMITTED) — the correction waits on B's lock, then is refused; the kept credit stays backed",
      /^23514:.*held as credit, so the invoice must stay paid over/.test(out) && credit(B, K) === "5000" && sql(T, `select money_invoice_due('${F}', '${IB}')`) === "-5000", out);
    dep(C, 50000, { kase: J }); const IC = inv(C, 30000, { kase: J }), wd = sql(T, te(C, "WITHDRAWAL_TO_INVOICE", -30000, { inv: IC, kase: J }));
    ok("FO-7ts break M2 fail → pass: a correction returning money from a withdrawal is refused on another case (no way round the per-case limit); on the withdrawal's own case it is accepted",
      refused(T, te(C, "CORRECTION", 30000, { corrects: wd, kase: K, reason: "Returned to trust" }), /a correction is on the case of the entry it corrects/, "23514")
      && !!sql(T, te(C, "CORRECTION", 30000, { corrects: wd, kase: J, reason: "Returned to trust" })));
    { // review Major 2 on e70a2c44e: a cheque paid before a case, moved to case K, then returned, comes off K
      const D = randomUUID(), Jd = randomUUID(); const chq = dep(D, 10000, { method: "CHEQUE", cleared: false }); dep(D, 50000, { kase: Jd }); sql(T, pairQ(D, 10000, K));
      const ID = inv(B, 10000, { kase: K });
      ok("FO-7ts review Major 2 fail → pass: the returned cheque's correction is refused on a case its money never reached (J), accepted on K where it was moved; a pick on K then finds nothing there",
        refused(T, te(D, "CORRECTION", -10000, { corrects: chq, ck: "RETURNED", reason: "Cheque bounced", kase: Jd }), /a correction is on the case of the entry it corrects/, "23514")
        && !!sql(T, te(D, "CORRECTION", -10000, { corrects: chq, ck: "RETURNED", reason: "Cheque bounced", kase: K }))
        && refused(T, te(D, "WITHDRAWAL_TO_INVOICE", -100, { inv: ID, kase: K, cols: pick() }), /Only CAD 0\.00 is available on it/, "23514"));
    }
    { // break round 2 on 73adf83e5: R2-M1 (the moved-to-case exception is capped), R2-m2 (no lock for a write that must fail), a refund dated before any trust money
      const G = randomUUID(), M = randomUUID(), Kg = randomUUID(); dep(G, 100000, { kase: M }); const chq = dep(G, 50000, { method: "CHEQUE", cleared: false }); sql(T, pairQ(G, 100, Kg));
      const bounce = (amount: number, kase: string | null) => te(G, "CORRECTION", -amount, { corrects: chq, ck: "RETURNED", reason: "Cheque bounced", kase });
      ok("FO-7ts break R2-M1, R3-m2 fail → pass: a 500.00 cheque with 1.00 of it moved to case K — its bounce on K is refused while 499.00 is held before a case; 499.00 before a case, then 1.00 on K, are accepted; beyond 1.00 on K is refused; nothing is left to move or pick",
        refused(T, bounce(100, Kg), /takes from before a case first \(CAD 499\.00 held there\)/, "23514") && !!sql(T, bounce(49900, null))
        && refused(T, bounce(101, Kg), /takes from a case at most what was moved there \(CAD 1\.00\)/, "23514") && !!sql(T, bounce(100, Kg))
        && refused(T, bounce(1, Kg), /at most what was moved there \(CAD 0\.00\)|at most the deposit/) && refused(T, pairQ(G, 100, randomUUID()), /Only CAD 0\.00 is available/));
      {  // review R4-1: the cap alone — the pre-case money spent on the party's own invoice first, so only the cap can refuse
        const G2 = randomUUID(), K2 = randomUUID(); dep(G2, 1000, { kase: M }); const chq2 = dep(G2, 50000, { method: "CHEQUE", cleared: false }); sql(T, pairQ(G2, 100, K2));
        sql(T, te(G2, "WITHDRAWAL_TO_INVOICE", -49900, { inv: inv(G2, 49900) }));
        const b2 = (amount: number) => te(G2, "CORRECTION", -amount, { corrects: chq2, ck: "RETURNED", reason: "Cheque bounced", kase: K2 });
        ok("FO-7ts review R4-1 fail → pass: with nothing held before a case, the 500.00 bounce on K (1.00 moved there) is refused by the cap in its own words; 1.00 on K is accepted",
          refused(T, b2(50000), /takes from a case at most what was moved there \(CAD 1\.00\)/, "23514") && !!sql(T, b2(100)));
      }
      const g = new pg.Client({ connectionString: urlOf(T) }), e = new pg.Client({ connectionString: urlOf(T) }); await g.connect(); await e.connect(); conns.push(g, e);
      const p0 = randomUUID(); await g.query("begin"); await g.query(`insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${p0}', '${F}', 'E_TRANSFER', 100, 'CAD', 'TRUST', now(), '${key()}', 'user-R'); ${te(B, "DEPOSIT", 100, { pay: p0, kase: K })}`);
      await e.query("set statement_timeout = '2s'");
      const other = await e.query(te(G, "CORRECTION", 100, { corrects: pk, kase: K, reason: "Returned to trust" })).then(() => "ok", (x: { code?: string; message?: string }) => `${x.code}:${x.message}`);
      await g.query("rollback"); for (const x of [g, e]) { await x.end(); conns.splice(conns.indexOf(x), 1); }
      ok("FO-7ts break R2-m2 fail → pass: with B's lock held, another party's correction naming A's pick on B's invoice is refused at once (no wait on B's lock), with the party words",
        /^23514:.*a correction is on the same party and currency as the entry it corrects/.test(other), other);
      ok("FO-7ts break round 2 fail: a trust refund dated before the party's money came into trust (2001-01-01) is refused",
        refused(T, te(G, "REFUND_TO_CLIENT", -100, { reason: "x", kase: M, cols: { refunded_on: "'2001-01-01'" } }), /never dated before the party's money came into trust/, "23514"));
    }
    const IB2 = inv(B, 10000, { kase: K }); paid(IB2, 6000);
    ok("FO-7ts break M3 fail → pass: B's 100.00 invoice with 60.00 paid into operating — a pick of 40.01 is refused (a pick pays at most what is due), 40.00 is accepted",
      refused(T, te(A, "WITHDRAWAL_TO_INVOICE", -4001, { inv: IB2, kase: K, cols: pick() }), /a pick pays at most what is still due on the invoice \(4000 due\)/, "23514")
      && !!sql(T, te(A, "WITHDRAWAL_TO_INVOICE", -4000, { inv: IB2, kase: K, cols: pick() })) && sql(T, `select money_invoice_due('${F}', '${IB2}')`) === "0");
    ok("FO-7ts break m2 pass: an invoice issued before part 3 reads Taxable (what issuing would have chosen), not null for good",
      sql(T, `select tax_treatment from money_invoice where id = '${taxed.id}'`) === "TAXABLE");
    ok("FO-7ts break m4 fail: a trust refund dated ahead of today is refused; today is accepted",
      refused(T, te(A, "REFUND_TO_CLIENT", -100, { reason: "x", kase: K, cols: { refunded_on: "current_date + 30" } }), /never ahead/, "23514")
      && !!sql(T, te(A, "REFUND_TO_CLIENT", -100, { reason: "Returned unused money", kase: K, cols: { refunded_on: "current_date" } })));
  }
  // ---------------------------------------------------------------------------- DW26: the lock is the paying party's
  {
    const A = randomUUID(), B = randomUUID(), C = randomUUID(), K = randomUUID(); dep(A, 100000, { kase: K }); dep(B, 100000, { kase: K }); dep(C, 1000); const IB = inv(B, 100000, { kase: K }), IA = inv(A, 100000, { kase: K });
    const depOf = (pid: string) => { const p = randomUUID(); return `insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) values ('${p}', '${F}', 'E_TRANSFER', 100, 'CAD', 'TRUST', now(), '${key()}', 'user-R'); ${te(pid, "DEPOSIT", 100, { pay: p, kase: K })}`; };
    const runs: { ok: boolean; code?: string }[] = [];
    for (let i = 0; i < 20; i++) runs.push(...await race([te(A, "WITHDRAWAL_TO_INVOICE", -100, { inv: IB, kase: K, cols: pick() }), depOf(A)]));
    ok("FO-7ts DW26 pass: a pick from A and a deposit to A at once run in turn under A's lock — 20 runs, all 40 commit, no 40P01", runs.length === 40 && runs.every((r) => r.ok) && held(A) === "100000", runs.filter((r) => !r.ok));
    const g = new pg.Client({ connectionString: urlOf(T) }), c = new pg.Client({ connectionString: urlOf(T) }); await g.connect(); await c.connect(); conns.push(g, c);
    const cpid = (await c.query("select pg_backend_pid() p")).rows[0].p;
    await g.query("begin"); await g.query(te(A, "WITHDRAWAL_TO_INVOICE", -100, { inv: IB, kase: K, cols: pick() }));
    await c.query("set statement_timeout = '3s'");
    const toC = await c.query(depOf(C)).then(() => "ok", (e: { code?: string }) => e.code);
    const b = new pg.Client({ connectionString: urlOf(T) }); await b.connect(); conns.push(b); const bpid = (await b.query("select pg_backend_pid() p")).rows[0].p;
    const toB = b.query(depOf(B)).then(() => "ok", (e: { code?: string }) => e.code);
    let bWaited = false; for (let i = 0; i < 200 && !bWaited; i++) { bWaited = sql(T, `select count(*) from pg_locks where pid = ${bpid} and locktype = 'advisory' and not granted`) === "1"; if (!bWaited) await new Promise((r) => setTimeout(r, 5)); }
    const toA = c.query(depOf(A)).then(() => "ok", (e: { code?: string }) => e.code);
    let waited = false; for (let i = 0; i < 200 && !waited; i++) { waited = sql(T, `select count(*) from pg_locks where pid = ${cpid} and locktype = 'advisory' and not granted`) === "1"; if (!waited) await new Promise((r) => setTimeout(r, 5)); }
    await g.query("commit"); const afterA = await toA, afterB = await toB;
    for (const x of [g, c, b]) { await x.end(); conns.splice(conns.indexOf(x), 1); }
    ok("FO-7ts DW26 (review Minor 1; the brief's line can't hold): a deposit to B, the invoice's party, does wait on the open pick (FO-7lk: the invoice party's lock), then commits", bWaited && afterB === "ok", { bWaited, afterB });
    ok("FO-7ts DW26 pass (pg_locks): with A's pick held open, a deposit to C (not on the invoice) does not wait; a deposit to A waits on A's advisory lock, then commits", toC === "ok" && waited && afterA === "ok", { toC, waited, afterA });
    // A pick holds two party locks (its own, and money_issued_invoice's on the invoice's party, FO-7lk), smaller id first.
    const cross: { ok: boolean; code?: string }[] = [];
    for (let i = 0; i < 20; i++) cross.push(...await race([te(A, "WITHDRAWAL_TO_INVOICE", -100, { inv: IB, kase: K, cols: pick() }), te(B, "WITHDRAWAL_TO_INVOICE", -100, { inv: IA, kase: K, cols: pick() })]));
    ok("FO-7ts DW26 pass: two picks crossing on one case at once (A pays B's invoice, B pays A's) — 20 runs, all 40 commit, no 40P01", cross.length === 40 && cross.every((r) => r.ok), cross.filter((r) => !r.ok));
    // Lead 96's ruling (review Major 1, break m1): FO-7lk's other two-party writers take the locks smaller id first too.
    {
      const [lo, hi] = [randomUUID(), randomUUID()].sort(); const Ai = lo, Bp = hi;  // the invoice's party has the smaller id
      dep(Bp, 200000, { kase: K }); const IAi = inv(Ai, 200000, { kase: K }); const pk = sql(T, te(Bp, "WITHDRAWAL_TO_INVOICE", -1000, { inv: IAi, kase: K, cols: pick() }));
      const cn = `insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, "full", reason, created_by, overpaid_choice, overpaid_minor, overpaid_entry_id) values ('${F}', '${IAi}', 100, 'CAD', false, 'Service cancelled', 'user-R', 'OVERPAID_TO_TRUST', 100, '${pk}')`;
      const rc: { ok: boolean; code?: string }[] = [];
      for (let i = 0; i < 100; i++) rc.push(...await race([cn, te(Bp, "WITHDRAWAL_TO_INVOICE", -10, { inv: IAi, kase: K, cols: pick() })]));
      ok("FO-7ts DW26 pass (Lead 96's ruling): a \"Move back to trust\" credit note on a picked invoice racing a pick by the same payer — 100 races, 0 deadlocks (money_credit_note_write takes the two party locks smaller id first)",
        rc.length === 200 && !rc.some((r) => r.code === "40P01"), { deadlocks: rc.filter((r) => r.code === "40P01").length, codes: [...new Set(rc.map((r) => r.code ?? "ok"))] });
    }
    {
      const ids = [randomUUID(), randomUUID(), randomUUID()].sort(), [Ai, Bp, Cp] = [ids[2], ids[0], ids[1]];  // two payers B < C; the invoice's party A
      dep(Bp, 200000, { kase: K }); dep(Cp, 200000, { kase: K }); const IAi = inv(Ai, 200000, { kase: K });
      const rb: { ok: boolean; code?: string }[] = [];
      for (let i = 0; i < 100; i++) {
        const wb = sql(T, te(Bp, "WITHDRAWAL_TO_INVOICE", -10, { inv: IAi, kase: K, cols: pick() })), wc = sql(T, te(Cp, "WITHDRAWAL_TO_INVOICE", -10, { inv: IAi, kase: K, cols: pick() })), b = randomUUID();
        sql(T, `insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${b}', '${F}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-18', 'user-R');
          insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${F}', '${b}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10, '${wb}'), ('${F}', '${b}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10, '${wc}')`);
        rb.push(...await race([`insert into money_move_batch (firm_id, currency, direction, undoes_batch_id, reason, recorded_by) values ('${F}', 'CAD', 'TRUST_TO_OPERATING', '${b}', 'Recorded the wrong transfer', 'user-R')`,
          te(Cp, "WITHDRAWAL_TO_INVOICE", -10, { inv: IAi, kase: K, cols: pick() })]));
      }
      ok("FO-7ts DW26 pass (Lead 96's ruling): undoing a move of two payers' picks racing a third pick on that invoice — 100 races, 0 deadlocks, all commit (money_move_batch_owed_back locks every party it touches first, smaller id first)",
        rb.length === 200 && rb.every((r) => r.ok), { deadlocks: rb.filter((r) => r.code === "40P01").length, codes: [...new Set(rb.map((r) => r.code ?? "ok"))] });
    }
    {  // Lead 96's ruling (review R2-1, break R2-m1): a move line of a pick takes the payer's and the invoice party's locks smaller id first
      const ids = [randomUUID(), randomUUID(), randomUUID()].sort(), [Bi, Ap, Dp] = ids;  // the invoice's party B < payer A < D
      dep(Ap, 200000, { kase: K }); dep(Dp, 200000, { kase: K }); const X = inv(Bi, 200000, { kase: K }), XD = inv(Dp, 200000, { kase: K });
      const rl: { ok: boolean; code?: string }[] = [];
      for (let i = 0; i < 100; i++) {
        const wa = sql(T, te(Ap, "WITHDRAWAL_TO_INVOICE", -10, { inv: X, kase: K, cols: pick() })), wd = sql(T, te(Dp, "WITHDRAWAL_TO_INVOICE", -10, { inv: XD, kase: K })), b = randomUUID();
        rl.push(...await race([`insert into money_move_batch (id, firm_id, currency, direction, transfer_date, recorded_by) values ('${b}', '${F}', 'CAD', 'TRUST_TO_OPERATING', '2026-11-18', 'user-R');
          insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id) values ('${F}', '${b}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10, '${wa}'), ('${F}', '${b}', 'TRUST_APPLIED', 'TRUST_TO_OPERATING', 'CAD', 10, '${wd}')`,
          te(Dp, "WITHDRAWAL_TO_INVOICE", -10, { inv: X, kase: K, cols: pick() })]));
      }
      ok("FO-7ts DW26 pass (Lead 96's ruling): a move batch whose first line is A's pick on B's invoice, racing D's pick on that invoice — 100 races, 0 deadlocks, all commit (money_move_line_write takes the two party locks smaller id first)",
        rl.length === 200 && rl.every((r) => r.ok), { deadlocks: rl.filter((r) => r.code === "40P01").length, codes: [...new Set(rl.map((r) => r.code ?? "ok"))] });
    }
    const lk = (x: string) => `select money_trust_lock('${F}', '${x}', 'CAD')`, [p1, p2] = [0, 1].map(() => new pg.Client({ connectionString: urlOf(T) }));
    for (const x of [p1, p2]) { await x.connect(); conns.push(x); await x.query("begin"); }
    await p1.query(lk(A)); await p2.query(lk(B));
    const dl = await Promise.all([p1.query(lk(B)), p2.query(lk(A))].map((q) => q.then(() => "ok", (e: { code?: string }) => e.code)));
    for (const x of [p1, p2]) { await x.query("rollback").catch(() => undefined); await x.end(); conns.splice(conns.indexOf(x), 1); }
    ok("FO-7ts DW26 fail (planted): the two party locks taken in opposite orders deadlock (40P01); money_trust_entry_write takes the invoice party's lock before its own when that id is smaller",
      dl.includes("40P01") && /IF inv_party < party THEN\s+PERFORM money_trust_lock\(NEW\.firm_id, inv_party, inv_cur\);/.test(sql(T, `select prosrc from pg_proc where proname = 'money_trust_entry_write'`)), dl);
  }
  // ----------------------------------------------------------------------------------- DW18: the newest-issued index
  {
    const firmX = firm(T, "firm-ts-ix"); sql(T, settingsQ(firmX));
    for (const f of [F, firmX]) sql(T, `set session_replication_role = replica; insert into money_invoice (firm_id, person_id, currency, due_date, created_by, updated_at, number, issued_at, issued_by)
      select '${f}', gen_random_uuid(), 'CAD', '2026-12-15', 'user-R', now(), 'IX-' || g, now() - g * interval '1 minute', 'user-R' from generate_series(1, 10000) g`);
    sql(T, "analyze money_invoice");
    const page = `explain select id, number, issued_at from money_invoice where firm_id = '${F}' and issued_at is not null order by issued_at desc, id limit 25`;
    const usesIndex = (plan: string) => plan.includes("money_invoice_firm_id_issued_at_id_idx") && !/Seq Scan on money_invoice|Sort/.test(plan);
    const withIdx = sql(T, page), without = sql(T, `begin; drop index money_invoice_firm_id_issued_at_id_idx; ${page}; rollback;`);
    ok("FO-7ts DW18 pass (AG-6-30): with 10,000 issued invoices in each of two firms, the newest-issued page uses (firm_id, issued_at DESC, id), with no sequential scan and no sort", usesIndex(withIdx), withIdx);
    ok("FO-7ts DW18 fail: with the index dropped inside the test's transaction, the same EXPLAIN is caught (a sequential scan or a sort), and the index is back after the rollback",
      !usesIndex(without) && /Seq Scan on money_invoice|Sort/.test(without) && sql(T, `select count(*) from pg_class where relname = 'money_invoice_firm_id_issued_at_id_idx'`) === "1", without);
  }
  // ------------------------------------------------------------------------------- the rollback note, on the empty copy
  ok("FO-7ts part 2 rollback fail (break R1 on 692ea4be): over a database holding moves or credit entries the rollback refuses and changes nothing",
    (() => { try { psql(T, ["-1", "-c", "set session_replication_role = replica; delete from money_trust_entry where kind::text = 'MOVE_TO_CASE'", "-f", join(MIG, NEW2, "rollback.sql")]); return false; }
      catch (e) { return /credit entries are recorded; they cannot be rolled back silently/.test(String((e as { stderr?: string }).stderr ?? e)); } })()  // review m-b: credit alone, no moves (in one rolled-back transaction)
    && sql(T, `select (select count(*) > 0 from money_credit_entry) and (select count(*) > 0 from money_trust_entry where kind::text = 'MOVE_TO_CASE')`) === "t");
  const rb3 = (db: string, cwd = STUDIO) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", join(MIG, NEW3, "rollback.sql")], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  ok("FO-7ts part 3 rollback fail: over a database holding picks, trust refund details or tax treatments the rollback refuses and changes nothing; run from another folder it refuses before dropping anything",
    (() => { try { rb3(T); return false; } catch (e) { return /picks or trust refunds with their details are recorded/.test(String((e as { stderr?: string }).stderr ?? e)); } })()
    && (() => { try { rb3(EMPTY, WORK); return false; } catch (e) { return /the earlier function texts were not read; run it from the studio folder/.test(String((e as { stderr?: string }).stderr ?? e)); } })()
    && sql(EMPTY, `select count(*) from information_schema.columns where table_name = 'money_trust_entry' and column_name = 'picked_other_funds_by'`) === "1");
  rb3(EMPTY);
  ok("FO-7ts part 3 rollback: rollback.sql restores money_trust_entry_write as part 2 left it, money_invoice_write as part 1 left it, and money_credit_note_write, money_move_batch_owed_back and money_move_line_write as FO-7lk left them, exactly, and money_trust_entry's checks as before",
    // own-migration: ok (checksOf reads only money_trust_entry's constraints, a money table: another area's migration cannot change it, and a money one waits in the same slot)
    src3(EMPTY) === srcBefore3 && checksOf(EMPTY) === checksBefore3 && sql(EMPTY, `select count(*) from pg_class where relname in ('money_party_tax_treatment', 'money_invoice_firm_id_issued_at_id_idx')`) === "0"
    && sql(EMPTY, `select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader') from pg_proc p where p.proname in ('money_trust_entry_write', 'money_invoice_write', 'money_credit_note_write', 'money_move_batch_owed_back', 'money_move_line_write')`) === "t", { s: src3(EMPTY), srcBefore3 });
  ok("FO-7ts part 3 pass: after its rollback the migration runs again, and rolls back again", (psql(EMPTY, ["-1", "-f", join(MIG, NEW3, "migration.sql")]), sql(EMPTY, `select count(*) from pg_class where relname = 'money_party_tax_treatment'`) === "1") && (rb3(EMPTY), src3(EMPTY) === srcBefore3));
  psql(EMPTY, ["-1", "-f", join(MIG, NEW2, "rollback.sql")]);
  ok("FO-7ts part 2 rollback: rollback.sql restores money_trust_entry_write exactly as FO-7lk left it and money_trust_entry's checks as before, and drops the credit ledger",
    // own-migration: ok (checksOf reads only money_trust_entry's constraints, a money table: another area's migration cannot change it, and a money one waits in the same slot)
    sql(EMPTY, `select md5(prosrc) from pg_proc where proname = 'money_trust_entry_write'`) === entryBefore && checksOf(EMPTY) === checksBefore
    && sql(EMPTY, `select count(*) from pg_class where relname = 'money_credit_entry'`) === "0" && sql(EMPTY, `select count(*) from pg_proc where proname in ('money_credit_entry_write', 'money_invoice_due', 'money_trust_entry_move_paired')`) === "0",
    // own-migration: ok (the same money_trust_entry read, in the failure detail)
    { e: sql(EMPTY, `select md5(prosrc) from pg_proc where proname = 'money_trust_entry_write'`), entryBefore, c: checksOf(EMPTY) === checksBefore });
  ok("FO-7ts part 2 pass (break R2): after the rollback the migration runs again", (psql(EMPTY, ["-1", "-f", join(MIG, NEW2, "migration.sql")]), sql(EMPTY, `select count(*) from pg_class where relname = 'money_credit_entry'`) === "1"));
} finally {
  for (const c of conns) await c.end().catch(() => undefined);
  for (const db of [T, BAD, EMPTY]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); } catch { /* best effort */ } }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
