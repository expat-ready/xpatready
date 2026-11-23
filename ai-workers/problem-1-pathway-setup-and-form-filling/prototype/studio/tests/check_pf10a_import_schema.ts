// PF-10a (R1.35; map row 35; AG-18 §7; AG-18-11, -12, -15, -39, -49, -52, -54, -56): the import batch tables. Each "Done
// when" line passes and fails:
//   DW1 the migration on an empty and a demo-data copy, measured right after itself (rows rev 16.7), migrate diff empty;
//   DW2 a row's reasons are {field, rule} names only: a raw value, an extra key, a name too long or too many reasons are
//       refused by the check on the reasons' shape (AG-18-12);
//   DW3 an attestation refuses update, delete and truncate, and only an active Owner of its own firm writes one (AG-18-49);
//   DW4 a batch naming another firm's staff as importer is refused by the (firm_id, staff_id) key (and its attestation and
//       rows by their (firm_id, id) keys);
//   DW5 firm A cannot read or write firm B's batch, row, mapping or attestation under PF-12's policy (AG-18-52);
//   DW6 the three agent/import:* keys are catalogue rows for Owner and Admin only (PF-3's seed; this row adds none).
// Plus: a batch's file, target and importer never change; its state does. One process, scratch databases dropped at the
// end, no model call (US$0). Every value is Sample.
//   tsx studio/tests/check_pf10a_import_schema.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261124050000_pf10a_import_tables";
const TABLES = ["plat_import_batch", "plat_import_row", "plat_import_mapping", "plat_import_attestation"];
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf10a_${process.pid}`, EMPTY = `xr_studio_pf10a_empty_${process.pid}`, DEMO = `xr_studio_pf10a_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf10a-${process.pid}`);
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (db: string, f: string) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sqlOn = (db: string, q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, user = "xr_studio") => sqlOn(DB, q, user);
const refused = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };
/** As the app's role, in one transaction acting for `firm`. */
const asApp = (firm: string, q: string) => sql(`begin; select set_config('app.firm_id', '${firm}', true); ${q}; commit`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const refusedAsApp = (firm: string, q: string, like: RegExp) => { try { asApp(firm, q); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const HASH = "a".repeat(64);
const uuid = () => globalThis.crypto.randomUUID();

for (const d of [DB, EMPTY, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();

try {
  // --------------------------------------------------- DW1: the migration, right after itself (rows rev 16.7)
  const before = all.filter((d) => d < NEW);
  ok(`PF-10a DW1: the migration has its own stamp, later than every one before it and unique (P-600; newest before: ${before.at(-1)})`,
    all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.length === all.indexOf(NEW));
  for (const d of before) { psqlFile(EMPTY, join(MIG, d, "migration.sql")); psqlFile(DEMO, join(MIG, d, "migration.sql")); }
  ok("PF-10a DW1 fail: before its migration there is no import table", sqlOn(EMPTY, `select count(*) from pg_class where relname like 'plat_import_%' and relkind = 'r'`) === "0");
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  const demoFacts = (d: string) => sqlOn(d, `select (select count(*) from platform_firm) || ':' || (select count(*) from platform_staff) || ':' || (select count(*) from platform_role_grant) || ':' || (select count(*) from platform_role_permission)`);
  const demoBefore = demoFacts(DEMO);
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  /** Each table: row-level security on and forced, one policy pf12_firm naming the session's firm, the firm-first gate. */
  const walled = (d: string) => TABLES.map((t) => sqlOn(d, `select c.relrowsecurity and c.relforcerowsecurity
      and (select string_agg(p.polname || '=' || pg_get_expr(p.polqual, p.polrelid) || '|' || pg_get_expr(p.polwithcheck, p.polrelid), ';') from pg_policy p where p.polrelid = c.oid)
          = 'pf12_firm=(firm_id = platform_session_firm())|(firm_id = platform_session_firm())'
      and exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = '0_pf12_firm_first')
    from pg_class c where c.relname = '${t}' and c.relnamespace = 'public'::regnamespace`)).join("");
  const readers = (d: string) => sqlOn(d, `select count(*) from pg_proc p where p.proname in ('pf_import_batch_facts_kept', 'pf_import_attestation_owner', 'pf_import_attestation_kept') and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`);
  ok("PF-10a DW1 pass: right after its own migration, on an empty copy and on a demo-data copy: the four tables are forced behind PF-12's policy and gate, the three trigger functions are xr_wall_reader's; the demo's firms, staff, grants and keys are untouched",
    walled(EMPTY) === "tttt" && walled(DEMO) === "tttt" && readers(EMPTY) === "3" && readers(DEMO) === "3" && demoFacts(DEMO) === demoBefore, { empty: walled(EMPTY), demo: walled(DEMO), r: readers(DEMO), demoBefore, after: demoFacts(DEMO) });
  ok("PF-10a DW1: every function the migration creates carries the area prefix pf_ (rows rev 15.2)",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("pf_import_")));
  ok("PF-10a DW1: additive only — no ALTER of an existing table, no DROP, no data statement (no INSERT, UPDATE or DELETE outside function bodies)",
    (() => { const s = readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").replace(/\$fn\$[\s\S]*?\$fn\$/g, "");
      const altered = [...s.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]).filter((t) => !TABLES.includes(t));
      return altered.length === 0 && !/\bDROP\b/i.test(s) && !/^\s*(INSERT|UPDATE|DELETE)\b/im.test(s); })());
  const later = all.filter((d) => d > NEW);
  for (const d of later) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok(`PF-10a DW1 pass: prisma migrate diff between the fully migrated database (this migration, then the ${later.length} after it) and the schema is empty`, diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 800));

  // ------------------------------------------------------------------------------- the working database (all, seeded)
  for (const d of all) psqlFile(DB, join(MIG, d, "migration.sql"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(db); } finally { await db.$disconnect(); }
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmB = sql(`select id from platform_firm where key = 'sample-solo'`);
  const ownerOf = (f: string) => sql(`select s.id from platform_staff s join platform_role_grant g on g.firm_id = s.firm_id and g.staff_id = s.id where s.firm_id = '${f}' and g.role = 'OWNER' and g.ended_at is null and s.status = 'ACTIVE' order by s.id limit 1`);
  const ownerA = ownerOf(firmA), ownerB = ownerOf(firmB);
  const notOwnerA = sql(`select s.id from platform_staff s where s.firm_id = '${firmA}' and not exists (select 1 from platform_role_grant g where g.firm_id = s.firm_id and g.staff_id = s.id and g.role = 'OWNER' and g.ended_at is null) order by s.id limit 1`);
  ok("PF-10a setup: the Sample firms each have an active Owner, and firm A a staff member who is not an Owner", !!firmA && !!firmB && !!ownerA && !!ownerB && !!notOwnerA, { firmA, firmB, ownerA, ownerB, notOwnerA });

  const batch = (id: string, firm: string, importer: string, att: string | null = null) =>
    `insert into plat_import_batch (id, firm_id, target_key, source_name, file_key, file_sha256, file_kind, mapping, importer_staff_id, attestation_id)
     values ('${id}', '${firm}', 'person', 'Old CRM export', 'import/${id}/file.csv', '${HASH}', 'CSV', '{"Email":"email"}', '${importer}', ${att ? `'${att}'` : "null"})`;
  const row = (batchId: string, firm: string, n: number, outcome: string, reasons: string, extra = "") =>
    `insert into plat_import_row (id, firm_id, batch_id, row_number, outcome, reasons${extra ? ", record_kind, record_id, before_image" : ""}) values (gen_random_uuid(), '${firm}', '${batchId}', ${n}, '${outcome}', '${reasons}'${extra})`;

  // ----------------------------------------------------------------------------- DW3: the Owner's attestation
  const attA = uuid();
  sql(`insert into plat_import_attestation (id, firm_id, owner_staff_id, wording_version) values ('${attA}', '${firmA}', '${ownerA}', 'v1')`);
  ok("PF-10a DW3 pass: an active Owner of the firm records an attestation (who, when, wording version)", sql(`select owner_staff_id || ':' || wording_version || ':' || (at is not null) from plat_import_attestation where id = '${attA}'`) === `${ownerA}:v1:true`);
  ok("PF-10a DW3 fail: a staff member of the firm who is not an Owner cannot record one",
    refused(`insert into plat_import_attestation (id, firm_id, owner_staff_id, wording_version) values (gen_random_uuid(), '${firmA}', '${notOwnerA}', 'v1')`, /only an active Owner/));
  ok("PF-10a DW3 fail: another firm's Owner cannot attest for firm A (the (firm_id, staff_id) key)",
    refused(`insert into plat_import_attestation (id, firm_id, owner_staff_id, wording_version) values (gen_random_uuid(), '${firmA}', '${ownerB}', 'v1')`, /only an active Owner|foreign key/));
  ok("PF-10a DW3 fail: an attestation refuses update", refused(`update plat_import_attestation set wording_version = 'v2' where id = '${attA}'`, /written once, never changed or removed \(UPDATE refused\)/));
  ok("PF-10a DW3 fail: an attestation refuses delete", refused(`delete from plat_import_attestation where id = '${attA}'`, /written once, never changed or removed \(DELETE refused\)/));
  ok("PF-10a DW3 fail: an attestation refuses truncate", refused(`truncate plat_import_attestation cascade`, /never changed or removed \(TRUNCATE refused\)/));
  ok("PF-10a DW3 fail: the app's role holds no UPDATE, DELETE or TRUNCATE on attestations",
    sql(`select has_table_privilege('xr_app', 'plat_import_attestation', 'UPDATE') or has_table_privilege('xr_app', 'plat_import_attestation', 'DELETE') or has_table_privilege('xr_app', 'plat_import_attestation', 'TRUNCATE')`) === "f"
    && sql(`select has_table_privilege('xr_app', 'plat_import_attestation', 'INSERT')`) === "t");
  ok("PF-10a DW3 pass: the attestation still stands as written", sql(`select wording_version from plat_import_attestation where id = '${attA}'`) === "v1");

  // ------------------------------------------------------------------------------- DW4: the firm-scoped keys
  const bA = uuid();
  sql(batch(bA, firmA, ownerA, attA));
  ok("PF-10a DW4 pass: a batch of firm A by firm A's staff under firm A's attestation is written (state DRAFT, counts 0)",
    sql(`select state || ':' || created_count || merged_count || skipped_count || error_count from plat_import_batch where id = '${bA}'`) === "DRAFT:0000");
  ok("PF-10a DW4 fail: a batch of firm A whose importer is firm B's staff is refused by the (firm_id, staff_id) key",
    refused(batch(uuid(), firmA, ownerB), /plat_import_batch_firm_id_importer_staff_id_fkey/));
  const attB = uuid();
  sql(`insert into plat_import_attestation (id, firm_id, owner_staff_id, wording_version) values ('${attB}', '${firmB}', '${ownerB}', 'v1')`);
  ok("PF-10a DW4 fail: a batch of firm A under firm B's attestation is refused by the (firm_id, attestation_id) key",
    refused(batch(uuid(), firmA, ownerA, attB), /plat_import_batch_firm_id_attestation_id_fkey/));
  const bB = uuid();
  sql(batch(bB, firmB, ownerB, attB));
  ok("PF-10a DW4 fail: a row of firm A naming firm B's batch is refused by the (firm_id, batch_id) key",
    refused(row(bB, firmA, 1, "SKIP", "[]"), /plat_import_row_firm_id_batch_id_fkey/));
  ok("PF-10a DW4 fail: a mapping of firm A saved by firm B's staff is refused by the (firm_id, saved_by) key",
    refused(`insert into plat_import_mapping (id, firm_id, source_name, target_key, mapping, saved_by) values (gen_random_uuid(), '${firmA}', 'Old CRM export', 'person', '{}', '${ownerB}')`, /plat_import_mapping_firm_id_saved_by_fkey/));

  // ------------------------------------------------------------------------------- DW2: reasons are names, never values
  sql(row(bA, firmA, 1, "ERROR", `[{"field":"email","rule":"email.format"},{"field":"phone","rule":"required"}]`));
  sql(row(bA, firmA, 2, "CREATE", "[]", `, 'person', '${uuid()}', null`));
  sql(row(bA, firmA, 3, "MERGE", `[{"field":"givenNames","rule":"merge.filled_kept"}]`, `, 'person', '${uuid()}', '{"phone":null}'`));
  ok("PF-10a DW2 pass: an ERROR row with two {field, rule} reasons, a CREATE naming its record, and a MERGE with its before-image are written",
    sql(`select string_agg(row_number::text || outcome::text || jsonb_array_length(reasons)::text, ',' order by row_number) from plat_import_row where batch_id = '${bA}'`) === "1ERROR2,2CREATE0,3MERGE1");
  const reasonRefused = (r: string) => refused(row(bA, firmA, 9, "ERROR", r), /plat_import_row_reasons_shape/);
  ok("PF-10a DW2 fail: a reason carrying the raw value (an extra key \"value\") is refused", reasonRefused(`[{"field":"email","rule":"email.format","value":"jane@example.com"}]`));
  ok("PF-10a DW2 fail: a raw value smuggled in as the rule name (spaces, @) is refused", reasonRefused(`[{"field":"email","rule":"jane doe@example.com"}]`));
  ok("PF-10a DW2 fail: a name longer than 64 characters is refused", reasonRefused(`[{"field":"${"a".repeat(65)}","rule":"required"}]`));
  ok("PF-10a DW2 fail: a reason missing its rule, a reason that is a bare string, and a reasons value that is an object are refused",
    reasonRefused(`[{"field":"email"}]`) && reasonRefused(`["email is jane@example.com"]`)
    && refused(row(bA, firmA, 9, "SKIP", `{"field":"email","rule":"required"}`), /plat_import_row_reasons_shape/));   // SKIP: only the reasons' check can refuse it
  ok("PF-10a DW2 fail: a non-string name (a number) is refused", reasonRefused(`[{"field":"email","rule":12345}]`));
  ok("PF-10a DW2 pass/fail: 50 reasons are taken, 51 are refused",
    (() => { const many = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ field: `f${i}`, rule: "required" })));
      sql(row(bA, firmA, 4, "ERROR", many(50))); return reasonRefused(many(51)); })());
  ok("PF-10a DW2 fail: an ERROR row with no reason is refused", refused(row(bA, firmA, 9, "ERROR", "[]"), /plat_import_row_outcome_shape/));
  ok("PF-10a DW2 fail: a before-image on a CREATE is refused (only a merge keeps what it overwrote)",
    refused(row(bA, firmA, 9, "CREATE", "[]", `, 'person', '${uuid()}', '{"phone":null}'`), /plat_import_row_outcome_shape/));
  ok("PF-10a DW2 fail: a record named on a SKIP, and a record kind with no id, are refused",
    refused(row(bA, firmA, 9, "SKIP", "[]", `, 'person', '${uuid()}', null`), /plat_import_row_outcome_shape/)
    && refused(row(bA, firmA, 9, "CREATE", "[]", `, 'person', null, null`), /plat_import_row_outcome_shape/));
  ok("PF-10a pass/fail: one row per batch and row number (a resumed job never writes row 1 twice; AG-18-20)",
    refused(row(bA, firmA, 1, "SKIP", "[]"), /plat_import_row_batch_id_row_number_key/));

  // ------------------------------------------------------------------------------- a batch's facts never change
  sql(`update plat_import_batch set state = 'DRY_RUN_READY', dry_run_hash = '${"b".repeat(64)}', error_count = 2, created_count = 1 where id = '${bA}'`);
  ok("PF-10a pass: a batch's state, dry-run hash and counts change", sql(`select state || ':' || error_count from plat_import_batch where id = '${bA}'`) === "DRY_RUN_READY:2");
  ok("PF-10a fail: a batch's file hash, file key, target or importer never change",
    ["file_sha256 = '" + "c".repeat(64) + "'", "file_key = 'import/other.csv'", "target_key = 'company'", `importer_staff_id = '${notOwnerA}'`]
      .every((set) => refused(`update plat_import_batch set ${set} where id = '${bA}'`, /never change/)));
  ok("PF-10a fail: a hash that is not 64 lower-case hex, a negative count, or a mapping that is not an object is refused",
    refused(`update plat_import_batch set dry_run_hash = '${"B".repeat(64)}' where id = '${bA}'`, /plat_import_batch_facts/)
    && refused(`update plat_import_batch set error_count = -1 where id = '${bA}'`, /plat_import_batch_facts/)
    && refused(`update plat_import_batch set mapping = '[]' where id = '${bA}'`, /plat_import_batch_facts/));

  // ------------------------------------------------------------------------------- DW5: PF-12's wall
  sql(`insert into plat_import_mapping (id, firm_id, source_name, target_key, mapping, saved_by) values (gen_random_uuid(), '${firmB}', 'Old CRM export', 'person', '{"Email":"email"}', '${ownerB}')`);
  sql(row(bB, firmB, 1, "SKIP", "[]"));
  const seen = (firm: string) => TABLES.map((t) => asApp(firm, `select count(*) from ${t} where firm_id = '${firmB}'`)).join(",");
  ok("PF-10a DW5 pass: firm B's own session reads its batch, row, mapping and attestation", seen(firmB) === "1,1,1,1", seen(firmB));
  ok("PF-10a DW5 fail: firm A's session reads none of firm B's batch, row, mapping or attestation (the policy)", seen(firmA) === "0,0,0,0", seen(firmA));
  ok("PF-10a DW5 fail: firm A's session reading firm B's batch by its id gets nothing", asApp(firmA, `select count(*) from plat_import_batch where id = '${bB}'`) === "0");
  ok("PF-10a DW5 fail: firm A's session cannot write a batch for firm B (the policy's check, or the firm-first gate)",
    refusedAsApp(firmA, batch(uuid(), firmB, ownerB, attB), /row-level security|firm|permission denied/));
  ok("PF-10a DW5 fail: firm A's session cannot change firm B's batch (no row reached)",
    asApp(firmA, `with u as (update plat_import_batch set state = 'FAILED' where id = '${bB}' returning 1) select count(*) from u`) === "0"
    && sql(`select state from plat_import_batch where id = '${bB}'`) === "DRAFT");
  ok("PF-10a DW5 pass: firm A's session writes and reads its own batch", (() => { const id = uuid(); asApp(firmA, batch(id, firmA, ownerA, attA)); return asApp(firmA, `select count(*) from plat_import_batch where id = '${id}'`) === "1"; })());

  // ------------------------------------------------------------------------------- DW6: the keys (PF-3's seed)
  ok("PF-10a DW6 pass: agent/import:run, :undo and :view-report are catalogue rows held by Owner and Admin only (Sample)",
    sql(`select string_agg(rp.permission_key || '=' || rp.role, ',' order by rp.permission_key, rp.role::text) from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key where rp.permission_key like 'agent/import:%'`)
      === "agent/import:run=ADMIN,agent/import:run=OWNER,agent/import:undo=ADMIN,agent/import:undo=OWNER,agent/import:view-report=ADMIN,agent/import:view-report=OWNER");
  ok("PF-10a DW6 fail: no other agent/import key exists", sql(`select count(*) from platform_permission_key where key like 'agent/import:%'`) === "3");
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  rmSync(WORK, { recursive: true, force: true });
  for (const d of [DB, EMPTY, DEMO]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for the cleanup tool */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
