// FO-7ts part 1 (brief product/design/briefs/FO-7ts.md with Build Lead C's FO-7ts-1.md; Lead B rev 16.33, 16.35 (b), 16.36,
// 16.37, 16.41; AG-6-59 §6-§8 rules 4-6, AG-6-4 §7 §13 rules 5-7, AG-6-19 rule 1, AG-6-69 rule 3 §7, AG-6-61 rules 7, 10
// §7, AG-6-14 rule 3, AG-6-42 §7; P-567 (3), P-568 (1), P-600; legal reading Unconfirmed: no counsel): the money settings
// and request columns in the database. DW1-DW4, DW9-DW11, DW19-DW20 of the brief, each passing and failing as named; one
// race on real connections (READ COMMITTED). Three scratch databases: "t" gets every migration, with rows written before
// this one (the cases run here); "bad" stops before it with a firm saying trust_enabled = true (the migration must
// refuse); "empty" gets every migration. No server, no browser, no model call, no Stripe call (US$0). All are dropped.
//   tsx studio/tests/check_fo7ts_money_settings.ts
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261117133000_fo7ts_money_settings", STEP2 = "20261117133100_fo7ts_card_terminal_trust", FO7A2 = "20261116133000_fo7a2_ledger_rules";
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
async function race(stmts: string[], iso = "read committed"): Promise<{ ok: boolean; code?: string }[]> {
  const cs = await Promise.all(stmts.map(async () => { const c = new pg.Client({ connectionString: urlOf(T) }); await c.connect(); conns.push(c); return c; }));
  for (const c of cs) { await c.query(`begin isolation level ${iso}`); await c.query("select 1 from money_trust_request limit 1"); }
  const out = await Promise.all(cs.map(async (c, i) => {
    try { await c.query(stmts[i]); await c.query("commit"); return { ok: true }; }
    catch (e) { await c.query("rollback").catch(() => undefined); return { ok: false, code: (e as { code?: string }).code }; }
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
  for (const d of all.filter((x) => x > NEW)) psql(T, ["-1", "-f", join(MIG, d, "migration.sql")]);
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

  // ---------------------------------------------------------------------------------- DW2: trust is on at YES only
  let n = 0; const key = () => `key-fo7ts-${String(++n).padStart(6, "0")}`;
  const reqQ = (f: string, o: { id?: string; sent?: boolean; version?: string | null; pid?: string } = {}) =>
    `insert into money_trust_request (id, firm_id, person_id, amount_minor, currency, purpose, created_by, sent_at, sent_by, retainer_version_id, updated_at) values ('${o.id ?? randomUUID()}', '${f}', '${o.pid ?? P1}', 100000, 'CAD', 'Deposit for the work permit', 'user-R', ${o.sent ? "now(), 'user-R'" : "null, null"}, ${o.version ? `'${o.version}'` : "null"}, now()) returning coalesce(number, '-')`;
  const entryQ = (f: string, kind: string, amount: number, x: { pay?: string; inv?: string; reason?: string } = {}) =>
    `insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, payment_id, invoice_id, reason, created_by) values ('${f}', '${P1}', '${kind}', ${amount}, 'CAD', ${x.pay ? `'${x.pay}'` : "null"}, ${x.inv ? `'${x.inv}'` : "null"}, ${x.reason ? `'${x.reason}'` : "null"}, 'user-R') returning balance_after_minor`;
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
  const draftU = randomUUID(); sql(T, `insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at, unsigned_retainer_confirmed_by, unsigned_retainer_confirmed_at) values ('${draftU}', '${firmD}', '${P2}', 'CAD', '2026-12-15', 'user-R', now(), '${u(77)}', now());
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${firmD}', '${draftU}', 1, 'FEE', 'Consultation', 1, 5000, 5000, 'CAD')`);
  ok("FO-7ts (AG-6-42 §7) fail: an unsigned-retainer confirmation with who and no when is refused; once issued it is fixed",
    refused(T, `update money_invoice set unsigned_retainer_confirmed_at = null where id = '${draftU}'`, /money_invoice_unsigned_retainer_check/, "23514")
    && (sql(T, `update money_invoice set issued_at = now(), issued_by = 'user-R' where id = '${draftU}'`), refused(T, `update money_invoice set unsigned_retainer_confirmed_by = '${u(78)}' where id = '${draftU}'`, /issued invoices can't be edited/)));

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
} finally {
  for (const c of conns) await c.end().catch(() => undefined);
  for (const db of [T, BAD, EMPTY]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); } catch { /* best effort */ } }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
