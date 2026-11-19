// PF-18bk (brief: Lead B's briefs, PF-18bk.md, 18 Nov; P-606): support tickets' firm and staff foreign keys, migration
// 20261119170000_pf18bk_support_keys. Named cases DW1-DW5, each with a passing and a failing case:
//   DW1  a ticket (or a message) for a firm that does not exist is refused by a key, also with every user trigger off;
//        without the keys the same insert goes in.
//   DW2  a ticket raised under firm A by firm B's staff is refused with foreign_key_violation (23503) by the key with the
//        triggers off, and by the trigger with the same code when they are on; firm A's own staff is accepted; without the
//        composite key the cross-firm row goes in.
//   DW3  deleting a staff row or a firm a ticket or message points to is refused (RESTRICT: restrict_violation, 23001,
//        naming the key; ON UPDATE too), nothing is cascaded; without the key the staff delete goes through.
//   DW4  the migration applies cleanly on a copy with PF-3's Sample seed and tickets on it; on a copy with one planted
//        orphan ticket it stops with its message and changes nothing (no key, the rows as they were, the orphan kept);
//        with its check blinded, the failing raiser key takes the firm key added before it away too (all or nothing); a
//        runner row level security would blind is stopped first. (Through psql -f; prisma migrate deploy also records a
//        failed _prisma_migrations row, which the stop message's hint names how to clear.)
//   DW5  PF-18b's trigger functions and policies are byte-identical before and after; the schema folder diffs to the
//        migrated database with nothing in the support tables; a schema copy without the raiser relation names its key.
// Two scratch databases (every migration before this one, PF-3's Sample seed) and a scratch folder for Prisma's config.
// No server of the app, no browser, no model call (US$0). Both databases and the folder are removed at the end.
//   tsx studio/tests/check_pf18bk_keys.ts
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const OWN = "20261119170000_pf18bk_support_keys";
const DB = `xr_studio_pf18bk_${process.pid}`, ORPHAN = `xr_studio_pf18bk_orphan_${process.pid}`;
const WORK = join(STUDIO, "var", `pf18bk-check-${process.pid}`);
const KEYS = ["platform_support_ticket_firm_id_fkey", "platform_support_ticket_firm_id_raised_by_fkey", "platform_support_message_firm_id_fkey"] as const;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
/** One psql call, errors verbose (the SQLSTATE comes first: "ERROR:  23503: ..."). */
const sqlOn = (db: string) => (sql: string) => execFileSync(bin("psql"), [urlOf(db), "-XAtq", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
type Outcome = { refused: boolean; err: string };
const tryOn = (db: string) => (sql: string): Outcome => { try { sqlOn(db)(sql); return { refused: false, err: "" }; } catch (e) { return { refused: true, err: String((e as { stderr?: string }).stderr ?? e) }; } };
/** Refused with foreign_key_violation (23503) by one of the named keys. */
const byKey = (o: Outcome, ...keys: string[]) => o.refused && /ERROR: {2}23503:/.test(o.err) && keys.some((k) => o.err.includes(`"${k}"`));
/** Refused by an ON DELETE / ON UPDATE RESTRICT key: PostgreSQL's restrict_violation (23001), naming the key. */
const restrictedBy = (o: Outcome, key: string) => o.refused && /ERROR: {2}23001:/.test(o.err) && o.err.includes(`constraint "${key}"`);
const applyFile = (db: string, file: string) => spawnSync(bin("psql"), [urlOf(db), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { encoding: "utf8" });
const freshCopy = (db: string) => {
  execFileSync(bin("dropdb"), [...PG, "--if-exists", db], { stdio: "ignore" }); execFileSync(bin("createdb"), [...PG, db]);
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x) && x < OWN).sort()) {
    const r = applyFile(db, join(MIG, d, "migration.sql"));
    if (r.status !== 0) throw new Error(`${d}: ${r.stderr}`);
  }
};
const ownSql = join(MIG, OWN, "migration.sql");
const keysOn = (db: string) => Number(sqlOn(db)(`select count(*) from pg_constraint where conname in (${KEYS.map((k) => `'${k}'`).join(", ")})`));

type Firm = { id: string; key: string };
type Staff = { id: string; firmId: string };
/** PF-3's Sample seed through the app's own code, then the two firms and one staff member of each. */
async function seed(db: string): Promise<{ a: Firm; b: Firm; staffA: Staff; staffB: Staff }> {
  process.env.DATABASE_URL = urlOf(db);
  const { Db } = await import("../api/src/core.ts");
  const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
  const client = new Db();
  try { await seedSampleFirms(client); } finally { await client.$disconnect(); }
  const sql = sqlOn(db);
  const firm = (key: string): Firm => ({ id: sql(`select id from platform_firm where key = '${key}'`), key });
  const a = firm("sample-firm"), b = firm("sample-solo");
  const staffOf = (f: Firm): Staff => {
    const id = sql(`select id from platform_staff where firm_id = '${f.id}' order by created_at, id limit 1`)
      || sql(`insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${f.id}', 'pf18bk-${f.key}@pf18bk.example.com', 'Sample PF-18bk', now()) returning id`);
    return { id, firmId: f.id };
  };
  return { a, b, staffA: staffOf(a), staffB: staffOf(b) };
}
const ticketSql = (id: string, firmId: string, raisedBy: string) => `insert into platform_support_ticket (id, firm_id, raised_by, page, updated_at) values ('${id}', '${firmId}', '${raisedBy}', '/cases', now())`;
const messageSql = (firmId: string, ticketId: string, authorId: string) => `insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body) values (gen_random_uuid(), '${firmId}', '${ticketId}', 'FIRM_STAFF', '${authorId}', 'Sample question')`;
/** In one transaction that is always rolled back: every user trigger on both tables off, then the statements. */
const triggersOff = (...stmts: string[]) => `begin; alter table platform_support_ticket disable trigger user; alter table platform_support_message disable trigger user; ${stmts.join("; ")}; rollback`;
const PF18B_OBJECTS = `select string_agg(x, E'\\n' order by x) from (
  select proname || ':' || md5(prosrc) || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ','), '') as x from pg_proc where proname like 'platform_support_%'
  union all select tgrelid::regclass || ':' || tgname || ':' || md5(pg_get_triggerdef(oid)) from pg_trigger where tgrelid in ('platform_support_ticket'::regclass, 'platform_support_message'::regclass) and not tgisinternal
  union all select tablename || ':' || policyname || ':' || md5(coalesce(qual, '') || coalesce(with_check, '')) from pg_policies where tablename like 'platform_support_%'
  union all select conrelid::regclass || ':' || conname || ':' || md5(pg_get_constraintdef(oid)) from pg_constraint where conrelid in ('platform_support_ticket'::regclass, 'platform_support_message'::regclass) and contype <> 'f') s`;

try {
  mkdirSync(WORK, { recursive: true });
  // ------------------------------------------------------------------------------------------------- DW4: clean, then orphan
  freshCopy(DB);
  const { a, b, staffA, staffB } = await seed(DB);
  const sql = sqlOn(DB), attempt = tryOn(DB);
  const t1 = crypto.randomUUID(), t2 = crypto.randomUUID();
  sql(ticketSql(t1, a.id, staffA.id)); sql(messageSql(a.id, t1, staffA.id));
  sql(ticketSql(t2, b.id, staffB.id)); sql(messageSql(b.id, t2, staffB.id));
  // The orphan copy: the same seeded database, cloned before this migration runs (PF-3's seed reads its URL once per process).
  execFileSync(bin("dropdb"), [...PG, "--if-exists", ORPHAN], { stdio: "ignore" }); execFileSync(bin("createdb"), [...PG, "-T", DB, ORPHAN]);
  const before = { rows: sql("select count(*) from platform_support_ticket") + "/" + sql("select count(*) from platform_support_message"), objects: sql(PF18B_OBJECTS) };
  const clean = applyFile(DB, ownSql);
  ok("DW4 pass: the migration applies cleanly on the Sample seed with two firms' tickets and messages, adding the three keys",
    clean.status === 0 && keysOn(DB) === 3 && `${sql("select count(*) from platform_support_ticket")}/${sql("select count(*) from platform_support_message")}` === before.rows, { status: clean.status, err: clean.stderr, keys: keysOn(DB) });
  ok("DW4 pass: every key is RESTRICT on delete and on update", sql(`select string_agg(conname || '=' || confdeltype::text || confupdtype::text, ',' order by conname) from pg_constraint where conname in (${KEYS.map((k) => `'${k}'`).join(", ")})`)
    === [...KEYS].sort().map((k) => `${k}=rr`).join(","));

  const osql = sqlOn(ORPHAN), orphanId = crypto.randomUUID();
  // The orphan: firm A's ticket raised by firm B's staff, planted with the triggers off (as a hand edit or an old bug might have).
  osql(`begin; alter table platform_support_ticket disable trigger user; ${ticketSql(orphanId, a.id, staffB.id)}; alter table platform_support_ticket enable trigger user; commit`);
  const oBefore = osql("select string_agg(id::text || ':' || raised_by::text || ':' || status::text, ',' order by id) from platform_support_ticket");
  const stopped = applyFile(ORPHAN, ownSql);
  ok("DW4 fail: with one planted orphan ticket the migration stops with its message (0 without firm, 1 without a raiser)",
    stopped.status !== 0 && /PF-18bk stopped, nothing changed: 0 support ticket\(s\) without their firm, 1 without a raiser/.test(stopped.stderr), stopped.stderr);
  ok("DW4 fail: and changes nothing: no key added, the tickets as they were, the orphan kept",
    keysOn(ORPHAN) === 0 && osql("select string_agg(id::text || ':' || raised_by::text || ':' || status::text, ',' order by id) from platform_support_ticket") === oBefore && osql(`select count(*) from platform_support_ticket where id = '${orphanId}'`) === "1");
  // A runner that row level security would blind (xr_app: no BYPASSRLS, not a superuser) is stopped before it counts.
  const blindRole = spawnSync(bin("psql"), [urlOf(ORPHAN), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", "set role xr_app", "-f", ownSql], { encoding: "utf8" });
  ok("DW4 fail: run as a role row level security would blind, it stops with its own message and adds no key",
    blindRole.status !== 0 && /PF-18bk stopped, nothing changed: xr_app cannot see every support row/.test(blindRole.stderr) && keysOn(ORPHAN) === 0, blindRole.stderr);
  // All or nothing (break 1): with the check blinded (a scratch copy of the file), the raiser key fails on the orphan and
  // the firm key, added just before it, goes too: one statement, so no half-applied migration that cannot be re-run.
  const blind = join(WORK, "blind.sql");
  writeFileSync(blind, readFileSync(ownSql, "utf8").replace("IF no_firm + no_raiser + msg_no_firm > 0 THEN", "IF false THEN"));
  const half = applyFile(ORPHAN, blind);
  ok("DW4 fail: with the check blinded, the orphan stops the raiser key and no key at all is left behind (one statement)",
    half.status !== 0 && /platform_support_ticket_firm_id_raised_by_fkey/.test(half.stderr) && keysOn(ORPHAN) === 0, { status: half.status, err: half.stderr, keys: keysOn(ORPHAN) });

  // ------------------------------------------------------------------------------------------------- DW1: unknown firm
  const ghost = crypto.randomUUID();
  const off1 = attempt(triggersOff(ticketSql(crypto.randomUUID(), ghost, staffA.id)));
  ok("DW1 pass: a ticket for a firm that does not exist is refused by a key with every user trigger off (23503)",
    byKey(off1, "platform_support_ticket_firm_id_fkey", "platform_support_ticket_firm_id_raised_by_fkey"), off1.err);
  const on1 = attempt(ticketSql(crypto.randomUUID(), ghost, staffA.id));
  ok("DW1 pass: and refused with the triggers on (23503)", on1.refused && /ERROR: {2}23503:/.test(on1.err), on1.err);
  const firmKeyOnly = attempt(triggersOff(`alter table platform_support_ticket drop constraint platform_support_ticket_firm_id_raised_by_fkey`, ticketSql(crypto.randomUUID(), ghost, staffA.id)));
  ok("DW1 pass: the ticket's firm key alone (triggers off, composite key dropped, rolled back) refuses it (23503)", byKey(firmKeyOnly, "platform_support_ticket_firm_id_fkey"), firmKeyOnly.err);
  const offM = attempt(triggersOff(messageSql(ghost, t1, staffA.id)));
  ok("DW1 pass: a message for a firm that does not exist is refused by a key with the triggers off (23503)",
    byKey(offM, "platform_support_message_firm_id_fkey", "platform_support_message_firm_id_ticket_id_fkey"), offM.err);
  const noKeys1 = attempt(triggersOff(`alter table platform_support_ticket drop constraint platform_support_ticket_firm_id_fkey, drop constraint platform_support_ticket_firm_id_raised_by_fkey`, ticketSql(crypto.randomUUID(), ghost, staffA.id)));
  ok("DW1 fail: without the two ticket keys (rolled back) the same insert goes in: the keys are what refuse it", !noKeys1.refused, noKeys1.err);

  // ------------------------------------------------------------------------------------------------- DW2: another firm's staff
  const off2 = attempt(triggersOff(ticketSql(crypto.randomUUID(), a.id, staffB.id)));
  ok("DW2 pass: firm A's ticket raised by firm B's staff is refused by the composite key with the triggers off (23503)",
    byKey(off2, "platform_support_ticket_firm_id_raised_by_fkey"), off2.err);
  const on2 = attempt(ticketSql(crypto.randomUUID(), a.id, staffB.id));
  ok("DW2 pass: with the triggers on the same row is refused with the same code, foreign_key_violation (the trigger's message stays)",
    on2.refused && /ERROR: {2}23503:/.test(on2.err) && /not staff of this firm/.test(on2.err), on2.err);
  const same = crypto.randomUUID();
  const ok2 = attempt(ticketSql(same, a.id, staffA.id));
  ok("DW2 pass: firm A's own staff raising firm A's ticket is accepted", !ok2.refused && sql(`select raised_by from platform_support_ticket where id = '${same}'`) === staffA.id, ok2.err);
  const noKey2 = attempt(triggersOff(`alter table platform_support_ticket drop constraint platform_support_ticket_firm_id_raised_by_fkey`, ticketSql(crypto.randomUUID(), a.id, staffB.id)));
  ok("DW2 fail: without the composite key and the trigger (rolled back) the cross-firm row goes in", !noKey2.refused, noKey2.err);

  // ------------------------------------------------------------------------------------------------- DW3: RESTRICT, no cascade
  const f3 = crypto.randomUUID(), s3 = crypto.randomUUID(), t3 = crypto.randomUUID();
  sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${f3}', 'pf18bk-${process.pid}', 'Sample PF-18bk firm', 'CA', 'pf18bk-${process.pid}@pf18bk.example.com', now())`);
  sql(`insert into platform_staff (id, firm_id, email, display_name, updated_at) values ('${s3}', '${f3}', 'raiser@pf18bk.example.com', 'Sample raiser', now())`);
  sql(ticketSql(t3, f3, s3)); sql(messageSql(f3, t3, s3));
  const rows = () => `${sql("select count(*) from platform_support_ticket")}/${sql("select count(*) from platform_support_message")}/${sql(`select count(*) from platform_staff where id = '${s3}'`)}/${sql(`select count(*) from platform_firm where id = '${f3}'`)}`;
  const rows3 = rows();
  const delStaff = attempt(`delete from platform_staff where id = '${s3}'`);
  ok("DW3 pass: deleting the staff member a ticket names as raiser is refused by the composite key (RESTRICT)", restrictedBy(delStaff, "platform_support_ticket_firm_id_raised_by_fkey"), delStaff.err);
  const updStaff = attempt(`update platform_staff set id = gen_random_uuid() where id = '${s3}'`);
  ok("DW3 pass: changing that staff member's id is refused too (ON UPDATE RESTRICT)", restrictedBy(updStaff, "platform_support_ticket_firm_id_raised_by_fkey"), updStaff.err);
  const delFirm = attempt(`delete from platform_firm where id = '${f3}'`);
  ok("DW3 pass: deleting the firm is refused (RESTRICT; its staff's own key answers first)", delFirm.refused && /ERROR: {2}23001:/.test(delFirm.err), delFirm.err);
  // Without the staff's own firm key (rolled back), the firm delete reaches the ticket's key, then (without that) the message's.
  const delFirmT = attempt(`begin; alter table platform_staff drop constraint platform_staff_firm_id_fkey; delete from platform_firm where id = '${f3}'; rollback`);
  ok("DW3 pass: the ticket's firm key refuses the firm delete on its own", restrictedBy(delFirmT, "platform_support_ticket_firm_id_fkey"), delFirmT.err);
  const delFirmM = attempt(`begin; alter table platform_staff drop constraint platform_staff_firm_id_fkey; alter table platform_support_ticket drop constraint platform_support_ticket_firm_id_fkey; delete from platform_firm where id = '${f3}'; rollback`);
  ok("DW3 pass: the message's firm key refuses it on its own", restrictedBy(delFirmM, "platform_support_message_firm_id_fkey"), delFirmM.err);
  ok("DW3 pass: nothing was cascaded: the tickets, messages, staff member and firm are all still there", rows() === rows3, { before: rows3, after: rows() });
  const noKey3 = attempt(`begin; alter table platform_support_ticket drop constraint platform_support_ticket_firm_id_raised_by_fkey; delete from platform_staff where id = '${s3}'; rollback`);
  ok("DW3 fail: without the composite key (rolled back) the staff delete goes through: the key is what refuses it", !noKey3.refused, noKey3.err);

  // ------------------------------------------------------------------------------------------------- DW5: PF-18b unchanged, no drift
  ok("DW5 pass: PF-18b's trigger functions, triggers, policies and checks are byte-identical before and after the migration", sql(PF18B_OBJECTS) === before.objects && before.objects.includes("platform_support_ticket_write:"));
  const prisma = join(STUDIO, "node_modules", ".bin", "prisma");
  const diffTo = (name: string, schema: string) => {
    const cfg = join(WORK, `prisma.${name}.config.ts`);
    writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(schema)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(DB))} } });\n`);
    const r = spawnSync(prisma, ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", schema, "--script"], { cwd: STUDIO, encoding: "utf8" });
    return { code: r.status ?? 1, lines: `${r.stdout}`.split("\n").filter((l) => /^(ALTER|DROP|CREATE)\b/.test(l) && /platform_support_/.test(l)), out: `${r.stdout}${r.stderr}` };
  };
  const d1 = diffTo("main", SCHEMA);
  ok("DW5 pass: the schema folder diffs to the migrated database with nothing about the support tables", d1.code === 0 && d1.lines.length === 0, d1.lines.length ? d1.lines : d1.out.slice(0, 400));
  const copy = join(WORK, "schema"); cpSync(SCHEMA, copy, { recursive: true });
  const sup = join(copy, "platform-support.prisma"), plat = join(copy, "platform.prisma");
  writeFileSync(sup, readFileSync(sup, "utf8").replace(/^ {2}raiser .*\n/m, ""));
  writeFileSync(plat, readFileSync(plat, "utf8").replace(/^ {2}supportTicketsRaised .*\n/m, ""));
  const d2 = diffTo("noraiser", copy);
  ok("DW5 fail: a schema copy without the raiser relation names its key in the diff", d2.code === 0 && d2.lines.some((l) => l.includes("platform_support_ticket_firm_id_raised_by_fkey")), d2.out.slice(0, 400));
} catch (e) {
  ok("the check ran to the end", false, String((e as Error).stack ?? e));
} finally {
  for (const db of [DB, ORPHAN]) try { execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" }); } catch { /* already gone */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
