// PF-19m (R1.52 part 1, map row 52; shape screens/R1.52/shape.md, approved by Lead 5 on #3653; AG-10-3, -4, -9, -12, -62,
// -69, AG-16-18, SA-11-37; P-600): the mailbox tables. Every line of the row's "Done when", each with a passing and a
// failing case: the migration on empty and demo-data copies with migrate diff empty; a second main address refused; the
// same provider message twice in one mailbox refused; no token column (the sealed reference only); firm A's mailbox and
// email unreadable to firm B under the walls. Plus the rules the parts after it rely on: a message never changes, only its
// filing; only unfiled email is purged (its Unmatched entry with it); a disconnected mailbox stays disconnected. Three
// scratch databases: "bare" stops before PF-19m; "empty" gets every migration; "demo" gets every migration before PF-19m,
// then PF-3's Sample firms and staff, then PF-19m and any later one (rows rev 16.7: measured right after its own migration,
// never assumed the newest). No server, no browser, no model call, no mail (US$0). All are dropped at the end.
//   tsx studio/tests/check_pf19m_mailbox_schema.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261125060000_platform-messages__pf19m_mailboxes";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_pf19m_empty_${process.pid}`, DEMO = `xr_studio_pf19m_demo_${process.pid}`, BARE = `xr_studio_pf19m_bare_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `pf19m-check-${process.pid}`);
const TABLES = ["msg_mailbox", "msg_email", "msg_unmatched", "msg_address_link"];

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const psql = (db: string, args: string[], role?: string) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...(role ? { PGOPTIONS: `-c role=${role}` } : {}) } }).trim();
const sql = (db: string, q: string, role?: string) => psql(db, ["-Atc", q], role);
/** The SQLSTATE a statement is refused with ("" when it runs). */
const code = (db: string, q: string, role?: string) => { try { psql(db, ["-v", "VERBOSITY=verbose", "-Atc", q], role); return ""; } catch (e) { return /ERROR:\s+([0-9A-Z]{5}):/.exec(String((e as { stderr?: string }).stderr ?? e))?.[1] ?? "?"; } };
/** As the app's role inside one transaction with the session's firm set (PF-12's wall), as check_pf12_walls.ts does. */
const asApp = (db: string, firm: string, q: string) => sql(db, `begin; select set_config('app.firm_id', '${firm}', true); ${q}; commit;`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const asAppCode = (db: string, firm: string, q: string) => code(db, `begin; select set_config('app.firm_id', '${firm}', true); ${q}; commit;`, "xr_app");
const client = (db: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(db), options: "-c TimeZone=UTC" }) });
const SEALED = "fake1.v1.c2VhbGVk", UNSEALED_VALUE = "plain-access-token-not-sealed";

function msgDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /msg_mailbox|msg_email|msg_unmatched|msg_address_link|MsgMailbox|MsgEmail|MsgFiledBy|MsgUnmatched/.test(l));
}
const indexesNotFirmFirst = (db: string) => sql(db, `select coalesce(string_agg(ic.relname, ',' order by ic.relname), '') from pg_index i
  join pg_class c on c.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid left join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
  where c.relnamespace = 'public'::regnamespace and c.relname = any('{${TABLES.join(",")}}') and not i.indisprimary and coalesce(a.attname, '') <> 'firm_id'`);

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO, BARE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
const dbs: PrismaClient[] = [];
try {
  const before = all.filter((d) => d < NEW);
  ok(`PF-19m: the migration has a stamp of its own (P-600 (4); newest before it: ${before.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  const migSql = readFileSync(join(MIG, NEW, "migration.sql"), "utf8");
  const fns = [...migSql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+"?([a-z0-9_]+)/gi)].map((m) => m[1]!);
  const trg = [...migSql.matchAll(/CREATE TRIGGER\s+"?([a-z0-9_]+)/gi)].map((m) => m[1]!).filter((n) => n !== "0_pf12_firm_first");
  ok(`PF-19m (P-600 (3)): every function and trigger it creates is prefixed msg_ (PF-12's shared first-gate trigger aside; ${fns.length} functions, ${trg.length} triggers)`,
    fns.length === 4 && trg.length === 7 && [...fns, ...trg].every((n) => n.startsWith("msg_")), [...fns, ...trg]);
  ok("PF-19m (P-600 (2)): additive on its own tables only: it alters no other table and drops nothing",
    [...migSql.matchAll(/ALTER\s+TABLE\s+"?([a-z0-9_]+)/gi)].every((m) => TABLES.includes(m[1]!)) && !/\bDROP\s+(TABLE|TYPE|FUNCTION|INDEX|COLUMN)\b/i.test(migSql.replace(/^--.*$/gm, "")));

  // ---------------------------------------------------------------------------- migration on empty and demo-data copies
  for (const d of before) psql(BARE, ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-19m fail: before its migration there is no mailbox table and the schema differs (diff names msg_mailbox)",
    sql(BARE, `select count(*) from pg_tables where tablename = any('{${TABLES.join(",")}}')`) === "0" && msgDiff(BARE).some((l) => /msg_mailbox/.test(l)));
  for (const d of all) psql(EMPTY, ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-19m pass: every migration applies to an empty database; the four tables exist", sql(EMPTY, `select count(*) from pg_tables where schemaname='public' and tablename = any('{${TABLES.join(",")}}')`) === "4");
  ok("PF-19m pass: migrate diff from the migrated empty database to the schema names none of its tables or types", msgDiff(EMPTY).length === 0, msgDiff(EMPTY));

  for (const d of before) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  const pre = client(DEMO); dbs.push(pre);
  await seedSampleFirms(pre);
  await pre.$disconnect();
  const demoRows = `select (select count(*) from platform_firm) || ':' || (select count(*) from platform_staff) || ':' || (select count(*) from msg_firm) || ':' || (select count(*) from audit_event)`;
  const was = sql(DEMO, demoRows);
  for (const d of all.filter((x) => x >= NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-19m pass: it applies to a demo-data copy (the Sample firms and staff) and leaves their rows as they were", sql(DEMO, demoRows) === was, was);
  ok("PF-19m pass: migrate diff after it on the demo-data copy names none of its tables or types", msgDiff(DEMO).length === 0, msgDiff(DEMO));
  ok("PF-19m: the migration writes no data (no mailbox, email, Unmatched or link row)", sql(DEMO, `select ${TABLES.map((t) => `(select count(*) from ${t})`).join(" + ")}`) === "0");
  ok("PF-19m pass: firm_id is first in every index of its tables (primary keys aside)", indexesNotFirmFirst(DEMO) === "", indexesNotFirmFirst(DEMO));

  // ------------------------------------------------------------------------------------------------------- the rows
  const firmA = sql(DEMO, `select id from platform_firm where key='sample-firm'`), firmB = sql(DEMO, `select id from platform_firm where key='sample-solo'`);
  const staffR = sql(DEMO, `select id from platform_staff where actor_id='user-R'`), staffS = sql(DEMO, `select id from platform_staff where actor_id='user-S'`);
  sql(DEMO, `insert into msg_firm (firm_id) values ('${firmA}'), ('${firmB}') on conflict do nothing`);
  const mailbox = (firm: string, address: string, extra = "", vals = "") =>
    `insert into msg_mailbox (id, firm_id, provider, address, status, credential, connected_by, updated_at${extra}) values (gen_random_uuid(), '${firm}', 'GOOGLE', '${address}', 'CONNECTED', '${SEALED}', 'staff:${staffR}', now()${vals}) returning id`;
  const info = sql(DEMO, mailbox(firmA, "info@sample-firm.example.com", ", is_main", ", true")).split("\n")[0]!;
  const own = sql(DEMO, mailbox(firmA, "rep@sample-firm.example.com", ", owner_staff_id", `, '${staffR}'`)).split("\n")[0]!;

  // DW1 one main address per firm (AG-10-62)
  ok("PF-19m DW1 pass: a firm mailbox is the firm's main address", sql(DEMO, `select is_main and owner_staff_id is null from msg_mailbox where id = '${info}'`) === "t");
  ok("PF-19m DW1 fail: a second main address for the same firm is refused by the partial unique index (23505)", code(DEMO, mailbox(firmA, "hello@sample-firm.example.com", ", is_main", ", true")) === "23505");
  ok("PF-19m DW1 fail: a person's own mailbox cannot be the main address (23514); firm B may have its own main (another firm)",
    code(DEMO, `update msg_mailbox set is_main = true where id = '${own}'`) === "23514" && code(DEMO, mailbox(firmB, "solo@sample-solo.example.com", ", is_main", ", true")) === "");
  ok("PF-19m DW1 fail: the same address twice as a live mailbox of one firm is refused (23505)", code(DEMO, mailbox(firmA, "info@sample-firm.example.com")) === "23505");

  // DW2 the same provider message once per mailbox
  const email = (firm: string, box: string, pid: string, filed = "") =>
    `insert into msg_email (id, firm_id, mailbox_id, direction, provider_message_id, thread_key, from_address, sent_at${filed ? ", filed_kind, filed_id, filed_by, filed_rule, filed_at" : ""}) values (gen_random_uuid(), '${firm}', '${box}', 'INBOUND', '${pid}', 't-${pid}', 'lead@example.com', now()${filed}) returning id`;
  const e1 = sql(DEMO, email(firmA, info, "18c2a1")).split("\n")[0]!;
  ok("PF-19m DW2 fail: the same provider message id twice in one mailbox is refused (23505)", code(DEMO, email(firmA, info, "18c2a1")) === "23505");
  ok("PF-19m DW2 pass: the same provider message id in another mailbox is its own row (a copy to two people)", code(DEMO, email(firmA, own, "18c2a1")) === "");
  ok("PF-19m DW2 fail: an email cannot name another firm's mailbox (composite key, 23503)", code(DEMO, email(firmB, info, "zz1")) === "23503");

  // DW3 no token column
  ok("PF-19m DW3 pass: no column of the four tables is named like a token, secret, password or key; the credential is the sealed reference",
    sql(DEMO, `select count(*) from information_schema.columns where table_name = any('{${TABLES.join(",")}}') and column_name ~ '(token|secret|password|api_key|refresh)'`) === "0"
    && sql(DEMO, `select credential from msg_mailbox where id = '${info}'`) === SEALED);
  ok("PF-19m DW3 fail: a raw OAuth token in the credential column is refused (only a SecretBoxPort sealed value, 23514)",
    code(DEMO, `update msg_mailbox set credential = '${UNSEALED_VALUE}' where id = '${info}'`) === "23514");
  ok("PF-19m DW3 fail: CONNECTED without a credential is refused (23514)", code(DEMO, `update msg_mailbox set credential = null where id = '${info}'`) === "23514");

  // DW4 firm walls (PF-12)
  ok("PF-19m DW4 pass: firm A's session reads its own mailbox and email", asApp(DEMO, firmA, `select count(*) from msg_mailbox where id = '${info}'`) === "1" && asApp(DEMO, firmA, `select count(*) from msg_email where id = '${e1}'`) === "1");
  ok("PF-19m DW4 fail: firm B's session reads none of firm A's mailboxes or email, even by id",
    asApp(DEMO, firmB, `select count(*) from msg_mailbox where firm_id = '${firmA}'`) === "0" && asApp(DEMO, firmB, `select count(*) from msg_email where id = '${e1}'`) === "0");
  ok("PF-19m DW4 fail: firm B's session cannot write a row for firm A (the first gate, 42501; review m8)",
    asAppCode(DEMO, firmB, `insert into msg_address_link (id, firm_id, address, record_kind, record_id, created_by) values (gen_random_uuid(), '${firmA}', 'x@example.com', 'fo-lead', gen_random_uuid(), 'staff:${staffR}')`) === "42501");
  ok("PF-19m DW4: every table has its forced policy and the first gate; its trigger functions run as xr_wall_reader",
    sql(DEMO, `select count(*) from pg_class c where c.relname = any('{${TABLES.join(",")}}') and c.relrowsecurity and c.relforcerowsecurity
      and exists (select 1 from pg_policy p where p.polrelid = c.oid and pg_get_expr(p.polqual, p.polrelid) ~ 'platform_session_firm')
      and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = '0_pf12_firm_first')`) === "4"
    && sql(DEMO, `select count(*) from pg_proc where proname in ('msg_mailbox_write', 'msg_email_write', 'msg_unmatched_write', 'msg_mailbox_no_truncate') and prosecdef and pg_get_userbyid(proowner) = 'xr_wall_reader'`) === "4");

  // DW5 the message never changes; only unfiled email is purged (AG-10-4)
  ok("PF-19m DW5 fail: an email's subject, sender or thread never changes after insert (23514)",
    code(DEMO, `update msg_email set subject = 'changed' where id = '${e1}'`) === "23514" && code(DEMO, `update msg_email set from_address = 'x@example.com' where id = '${e1}'`) === "23514");
  ok("PF-19m DW5 pass: filing an email to a record by rule is an update of its filing only",
    code(DEMO, `update msg_email set filed_kind = 'fo-lead', filed_id = gen_random_uuid(), filed_by = 'RULE', filed_rule = 'thread', filed_at = now() where id = '${e1}'`) === "");
  ok("PF-19m DW5 fail: half a filing (a kind with no id, or a staff filing with a rule name) is refused (23514)",
    code(DEMO, email(firmA, info, "half", ", 'fo-lead', null, 'RULE', 'thread', now()")) === "23514" && code(DEMO, email(firmA, info, "half2", ", 'fo-lead', gen_random_uuid(), 'STAFF', 'thread', now()")) === "23514");
  ok("PF-19m DW5 fail: a filed email is kept: delete refused (23514)", code(DEMO, `delete from msg_email where id = '${e1}'`) === "23514");
  // Break M1, m2: in a live mailbox an email is never deleted, so a filed one cannot be un-filed, deleted and re-inserted.
  const e2 = sql(DEMO, email(firmA, info, "unfiled1")).split("\n")[0]!;
  sql(DEMO, `insert into msg_unmatched (id, firm_id, email_id, suggestions) values (gen_random_uuid(), '${firmA}', '${e2}', '[{"kind":"fo-prospect","id":"00000000-0000-4000-8000-000000000001"}]')`);
  ok("PF-19m DW5 fail (break m2): an open Unmatched email of a live mailbox cannot be deleted (23514); its entry stays",
    code(DEMO, `delete from msg_email where id = '${e2}'`) === "23514" && sql(DEMO, `select count(*) from msg_unmatched where email_id = '${e2}'`) === "1");
  ok("PF-19m DW5 fail (break M1): un-filing a filed email and deleting it in one transaction is refused (23514); its words stay",
    code(DEMO, `begin; update msg_email set filed_kind = null, filed_id = null, filed_by = null, filed_rule = null, filed_at = null where id = '${e1}'; delete from msg_email where id = '${e1}'; commit;`) === "23514"
    && sql(DEMO, `select filed_id is not null from msg_email where id = '${e1}'`) === "t");
  // The purge (AG-10-4): disconnect a mailbox, then its unfiled email goes, its filed email stays.
  const purge = sql(DEMO, mailbox(firmA, "purge@sample-firm.example.com")).split("\n")[0]!;
  const pf = sql(DEMO, email(firmA, purge, "pf1", ", 'fo-lead', gen_random_uuid(), 'RULE', 'thread', now()")).split("\n")[0]!;
  const pu = sql(DEMO, email(firmA, purge, "pu1")).split("\n")[0]!;
  sql(DEMO, `insert into msg_unmatched (id, firm_id, email_id) values (gen_random_uuid(), '${firmA}', '${pu}')`);
  sql(DEMO, `update msg_mailbox set status = 'DISCONNECTED', credential = null where id = '${purge}'`);
  ok("PF-19m DW5 pass: after the disconnect, the purge as the app removes the unfiled email and its Unmatched entry with it",
    asAppCode(DEMO, firmA, `delete from msg_email where mailbox_id = '${purge}' and filed_id is null`) === "" && sql(DEMO, `select count(*) from msg_email where id = '${pu}'`) === "0" && sql(DEMO, `select count(*) from msg_unmatched where email_id = '${pu}'`) === "0");
  ok("PF-19m DW5 fail: the purge keeps the filed email of the disconnected mailbox (delete refused, 23514)", code(DEMO, `delete from msg_email where id = '${pf}'`) === "23514");
  ok("PF-19m DW5 fail (break M2): a disconnected mailbox takes no new email, and its cursor and last check stay (23514)",
    code(DEMO, email(firmA, purge, "late1")) === "23514"
    && code(DEMO, `update msg_mailbox set sync_cursor = '99' where id = '${purge}'`) === "23514" && code(DEMO, `update msg_mailbox set last_checked_at = now() where id = '${purge}'`) === "23514");
  ok("PF-19m DW5 pass (review R2-M1; AG-10-83, SA-11-39): a disconnected mailbox's filed email is still moved, then un-filed",
    asAppCode(DEMO, firmA, `update msg_email set filed_kind = 'fo-prospect', filed_id = gen_random_uuid(), filed_by = 'STAFF', filed_rule = null, filed_at = now() where id = '${pf}'`) === ""
    && asAppCode(DEMO, firmA, `update msg_email set filed_kind = null, filed_id = null, filed_by = null, filed_rule = null, filed_at = null where id = '${pf}'`) === "");
  ok("PF-19m DW5 fail (break round 2 n1): an email once filed is never purged, even un-filed in a disconnected mailbox (23514), so it cannot be dropped and re-inserted with other words",
    asAppCode(DEMO, firmA, `delete from msg_email where id = '${pf}'`) === "23514" && sql(DEMO, `select was_filed from msg_email where id = '${pf}'`) === "t");
  ok("PF-19m DW5 fail: moving still keeps the message itself (its subject is refused even in a disconnected mailbox, 23514)",
    code(DEMO, `update msg_email set subject = 'changed' where id = '${pf}'`) === "23514" && code(DEMO, `update msg_email set subject = 'changed' where id = '${e1}'`) === "23514");
  ok("PF-19m DW5 fail (review m10, n1): msg_mailbox and msg_email refuse TRUNCATE (23001), saying so", code(DEMO, `truncate msg_email cascade`) === "23001" && code(DEMO, `truncate msg_mailbox cascade`) === "23001");

  // Review r2-m1, break M2: the insert locks its mailbox row, so a disconnect waits for a sync mid-run, and two syncs of one
  // mailbox queue instead of deadlocking when each then moves the cursor. Two real connections (the owner's).
  {
    const conn = () => { const c = new pg.Client({ connectionString: urlOf(DEMO) }); return c.connect().then(() => c); };
    const [a, b, watch] = [await conn(), await conn(), await conn()];
    const pids = new Map<pg.Client, number>();
    for (const c of [a, b]) pids.set(c, (await c.query("select pg_backend_pid() p")).rows[0].p as number);
    const waiting = async (c: pg.Client) => { const pid = pids.get(c); for (let i = 0; i < 50; i++) { const r = await watch.query("select wait_event_type from pg_stat_activity where pid = $1", [pid]); if (r.rows[0]?.wait_event_type === "Lock") return true; await new Promise((r2) => setTimeout(r2, 100)); } return false; };
    const box = sql(DEMO, mailbox(firmA, "race@sample-firm.example.com")).split("\n")[0]!;
    const ins = (pid: string) => email(firmA, box, pid).replace(" returning id", "");
    let deadlock = "";
    try {
      await a.query("begin"); await a.query(ins("s1"));
      await b.query("begin"); const bIns = b.query(ins("s2")).then(() => "", (e: { code?: string }) => e.code ?? "?");
      const bWaited = await waiting(b);
      await a.query(`update msg_mailbox set sync_cursor = '1' where id = '${box}'`); await a.query("commit");
      deadlock = await bIns; if (!deadlock) { await b.query(`update msg_mailbox set sync_cursor = '2' where id = '${box}'`).catch((e: { code?: string }) => { deadlock = e.code ?? "?"; }); }
      await b.query(deadlock ? "rollback" : "commit");
      ok("PF-19m r2-m1 pass: a second sync's insert waits for the first, and both move the cursor with no deadlock (40P01)", bWaited && deadlock === "" && sql(DEMO, `select sync_cursor from msg_mailbox where id = '${box}'`) === "2", { bWaited, deadlock });
      await a.query("begin"); await a.query(ins("s3"));
      const disc = b.query(`update msg_mailbox set status = 'DISCONNECTED', credential = null where id = '${box}'`).then(() => "", (e: { code?: string }) => e.code ?? "?");
      const dWaited = await waiting(b);
      await a.query("commit"); const dErr = await disc;
      ok("PF-19m r2-m1 / break M2 fail: a disconnect waits for the sync mid-run, so that sync's email is in before it and the purge then finds it",
        dWaited && dErr === "" && asAppCode(DEMO, firmA, `delete from msg_email where mailbox_id = '${box}' and filed_id is null`) === "" && sql(DEMO, `select count(*) from msg_email where mailbox_id = '${box}'`) === "0", { dWaited, dErr });
    } finally { for (const c of [a, b, watch]) await c.end().catch(() => undefined); }
  }
  ok("PF-19m DW5 fail: suggestions must be a list; a resolved entry names who resolved it (23514)",
    code(DEMO, `insert into msg_unmatched (id, firm_id, email_id, suggestions) values (gen_random_uuid(), '${firmA}', '${e1}', '{"kind":"x"}')`) === "23514"
    && code(DEMO, `insert into msg_unmatched (id, firm_id, email_id, state) values (gen_random_uuid(), '${firmA}', '${e1}', 'LINKED')`) === "23514");
  ok("PF-19m DW5 fail (break m4): an open Unmatched entry for a filed email, or suggestions over 4,000 characters, are refused (23514)",
    code(DEMO, `insert into msg_unmatched (id, firm_id, email_id) values (gen_random_uuid(), '${firmA}', '${e1}')`) === "23514"
    && code(DEMO, `update msg_unmatched set suggestions = jsonb_build_array(repeat('x', 5000)) where email_id = '${e2}'`) === "23514");

  // DW6 the mailbox's own rules
  ok("PF-19m DW6 fail: a mailbox's owner or address never changes, and a mailbox is never deleted (23514)",
    code(DEMO, `update msg_mailbox set owner_staff_id = '${staffR}' where id = '${info}'`) === "23514"
    && code(DEMO, `update msg_mailbox set address = 'other@sample-firm.example.com' where id = '${own}'`) === "23514"
    && code(DEMO, `delete from msg_mailbox where id = '${own}'`) === "23514");
  ok("PF-19m DW6 fail: a firm A mailbox cannot be owned by firm B's staff member (composite key, 23503)",
    code(DEMO, mailbox(firmA, "solo2@sample-firm.example.com", ", owner_staff_id", `, '${staffS}'`)) === "23503");
  ok("PF-19m DW6 pass: disconnect clears the credential; the address may then be connected again as a new row",
    code(DEMO, `update msg_mailbox set status = 'DISCONNECTED', credential = null where id = '${own}'`) === "" && code(DEMO, mailbox(firmA, "rep@sample-firm.example.com", ", owner_staff_id", `, '${staffR}'`)) === "");
  ok("PF-19m DW6 fail: a disconnected mailbox stays disconnected, and keeps no credential (23514)",
    code(DEMO, `update msg_mailbox set status = 'CONNECTED', credential = '${SEALED}' where id = '${own}'`) === "23514" && code(DEMO, `update msg_mailbox set credential = '${SEALED}' where id = '${own}'`) === "23514");
  ok("PF-19m r2-m2 fail: an email with an OPEN Unmatched entry is not filed until the entry is resolved (23514); then it is",
    code(DEMO, `update msg_email set filed_kind = 'fo-prospect', filed_id = gen_random_uuid(), filed_by = 'STAFF', filed_at = now() where id = '${e2}'`) === "23514"
    && code(DEMO, `begin; update msg_unmatched set state = 'LINKED', resolved_by = 'staff:${staffR}', resolved_at = now() where email_id = '${e2}'; update msg_email set filed_kind = 'fo-prospect', filed_id = gen_random_uuid(), filed_by = 'STAFF', filed_at = now() where id = '${e2}'; commit;`) === "");
  const e3 = sql(DEMO, email(firmA, info, "open3")).split("\n")[0]!;
  sql(DEMO, `insert into msg_unmatched (id, firm_id, email_id) values (gen_random_uuid(), '${firmA}', '${e3}')`);
  ok("PF-19m break round 2 n5 fail: an OPEN Unmatched entry of a live mailbox is never deleted, never re-pointed to another email, and a resolved one never re-opens (23514); its table and the links refuse TRUNCATE (23001)",
    code(DEMO, `delete from msg_unmatched where email_id = '${e3}'`) === "23514"
    && code(DEMO, `update msg_unmatched set email_id = '${e1}' where email_id = '${e2}'`) === "23514"
    && code(DEMO, `update msg_unmatched set state = 'OPEN', resolved_by = null, resolved_at = null where email_id = '${e2}'`) === "23514"
    && code(DEMO, `truncate msg_unmatched`) === "23001" && code(DEMO, `truncate msg_address_link`) === "23001");
  ok("PF-19m r2-m3 pass: the 'by' columns take AuditActor's words (seed:, ourstaff:, system:), ids without dots",
    code(DEMO, mailbox(firmA, "seed@sample-firm.example.com").replace(`'staff:${staffR}'`, "'seed:PF-19m'")) === "" && code(DEMO, mailbox(firmA, "ours@sample-firm.example.com").replace(`'staff:${staffR}'`, `'ourstaff:${staffR}'`)) === "" && code(DEMO, mailbox(firmA, "sys@sample-firm.example.com").replace(`'staff:${staffR}'`, "'system:platform.mailbox-sync'")) === "");
  ok("PF-19m DW6 fail (review m8): a disconnected mailbox can never be the main one (23514)", code(DEMO, `update msg_mailbox set is_main = false where id = '${info}'`) === "" && code(DEMO, `insert into msg_mailbox (id, firm_id, provider, address, status, is_main, connected_by, updated_at) values (gen_random_uuid(), '${firmA}', 'GOOGLE', 'old@sample-firm.example.com', 'DISCONNECTED', true, 'staff:${staffR}', now())`) === "23514");
  ok("PF-19m DW6 fail (break m1): a credential of the real box's prefix around a raw token, a sync cursor or a 'by' holding free text are refused (23514)",
    code(DEMO, `update msg_mailbox set credential = 'sb1.v1.plain-access-value-not-sealed-at-all' where id = '${info}'`) === "23514"
    && code(DEMO, `update msg_mailbox set sync_cursor = 'plain-access-value-not-sealed' where id = '${info}'`) === "23514"
    && code(DEMO, mailbox(firmA, "by@sample-firm.example.com").replace(`'staff:${staffR}'`, "'staff:plain.access.value.not.sealed'")) === "23514"
    && code(DEMO, `update msg_mailbox set sync_cursor = '4815162342' where id = '${info}'`) === "");
  ok("PF-19m DW6 fail (break m3): an address with an invisible space or a look-alike letter, a link address or a to-address in capitals is refused (23514)",
    code(DEMO, mailbox(firmA, "info\u200b@sample-firm.example.com")) === "23514" && code(DEMO, mailbox(firmA, "inf\u043e@sample-firm.example.com")) === "23514"
    && code(DEMO, `insert into msg_address_link (id, firm_id, address, record_kind, record_id, created_by) values (gen_random_uuid(), '${firmA}', 'Lead@Example.com', 'fo-lead', gen_random_uuid(), 'staff:${staffR}')`) === "23514"
    && code(DEMO, `insert into msg_email (id, firm_id, mailbox_id, direction, provider_message_id, thread_key, from_address, to_addresses, sent_at) values (gen_random_uuid(), '${firmA}', '${info}', 'INBOUND', 'caps1', 't', 'a@example.com', '{Info@A.Example}', now())`) === "23514");
  ok("PF-19m DW6 fail: an address in capitals, or an error code in words, is refused (23514)",
    code(DEMO, mailbox(firmA, "Caps@Sample-Firm.example.com")) === "23514" && code(DEMO, `update msg_mailbox set last_error_code = 'Token has been expired or revoked.' where id = '${info}'`) === "23514");
} finally {
  for (const d of dbs) await d.$disconnect().catch(() => undefined);
  for (const db of [EMPTY, DEMO, BARE]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
