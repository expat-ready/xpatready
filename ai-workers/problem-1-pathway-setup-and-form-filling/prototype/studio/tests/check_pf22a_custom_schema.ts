// PF-22a part 1 (R1.95, map row 95; Doc-1 "per-entity custom fields", ADR C1-2; AG-2-23; P-570, P-584 (2)): the custom
// field, value and saved view tables. Each "Done when" line passes and fails:
//   DW1 the migration on an empty and a demo-data copy, measured right after itself (rows rev 16.7), migrate diff empty;
//   DW2 a field's shape: key and kind are names; options only on SELECT and MULTI_SELECT (at least one, distinct);
//   DW3 a value fits its field: a DATE refuses "tomorrow", a SELECT refuses a value not in its options, and the rest;
//   DW4 a field is never deleted (archived instead, its values kept); archived → no new value; un-archived → writable;
//   DW5 a field's type never changes once it has values, and an option in use is never removed;
//   DW6 firm A cannot read or write firm B's fields, values or views (PF-12's policy) and never names B's staff or fields;
//   DW7 a saved view is personal or shared (owner null), its filter an object, its columns names; a leaver's view stays;
//   DW8 agent/custom-field:manage is a catalogue row for Owner and Admin only (Sample, question 8).
// One process, scratch databases dropped at the end, no model call (US$0). Every value is Sample.
//   tsx studio/tests/check_pf22a_custom_schema.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261127014900_shared__pf22a_custom_fields";
const TABLES = ["plat_custom_field", "plat_custom_value", "plat_saved_view"];
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf22a_${process.pid}`, EMPTY = `xr_studio_pf22a_empty_${process.pid}`, DEMO = `xr_studio_pf22a_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf22a-${process.pid}`);
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
const uuid = () => globalThis.crypto.randomUUID();
const j = (v: unknown) => JSON.stringify(v).replace(/'/g, "''");

for (const d of [DB, EMPTY, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();

try {
  // --------------------------------------------------- DW1: the migration, right after itself (rows rev 16.7)
  const before = all.filter((d) => d < NEW);
  ok(`PF-22a DW1: the migration has its own stamp, later than every one before it and unique (P-600; newest before: ${before.at(-1)})`,
    all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.length === all.indexOf(NEW));
  for (const d of before) { psqlFile(EMPTY, join(MIG, d, "migration.sql")); psqlFile(DEMO, join(MIG, d, "migration.sql")); }
  ok("PF-22a DW1 fail: before its migration there is no custom-field or saved-view table",
    sqlOn(EMPTY, `select count(*) from pg_class where relname in ('plat_custom_field', 'plat_custom_value', 'plat_saved_view') and relkind = 'r'`) === "0");
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  const demoFacts = (d: string) => sqlOn(d, `select (select count(*) from platform_firm) || ':' || (select count(*) from platform_staff) || ':' || (select count(*) from platform_role_grant) || ':' || (select count(*) from platform_role_permission where permission_key <> 'agent/custom-field:manage')`);
  const demoBefore = demoFacts(DEMO);
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  /** Each table: row-level security on and forced, one policy pf12_firm naming the session's firm, the firm-first gate. */
  const walled = (d: string) => TABLES.map((t) => sqlOn(d, `select c.relrowsecurity and c.relforcerowsecurity
      and (select string_agg(p.polname || '=' || pg_get_expr(p.polqual, p.polrelid) || '|' || pg_get_expr(p.polwithcheck, p.polrelid), ';') from pg_policy p where p.polrelid = c.oid)
          = 'pf12_firm=(firm_id = platform_session_firm())|(firm_id = platform_session_firm())'
      and exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = '0_pf12_firm_first')
    from pg_class c where c.relname = '${t}' and c.relnamespace = 'public'::regnamespace`)).join("");
  const DEFINERS = ["pf_custom_field_kept", "pf_custom_value_checked", "pf_custom_view_kept"];
  const readers = (d: string) => sqlOn(d, `select count(*) from pg_proc p where p.proname in (${DEFINERS.map((f) => `'${f}'`).join(", ")}) and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`);
  ok("PF-22a DW1 pass: right after its own migration, on an empty copy and on a demo-data copy: the three tables are forced behind PF-12's policy and gate, the three trigger functions are xr_wall_reader's; the demo's firms, staff, grants and other keys are untouched",
    walled(EMPTY) === "ttt" && walled(DEMO) === "ttt" && readers(EMPTY) === "3" && readers(DEMO) === "3" && demoFacts(DEMO) === demoBefore, { empty: walled(EMPTY), demo: walled(DEMO), r: readers(DEMO), demoBefore, after: demoFacts(DEMO) });
  const migSql = readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  ok("PF-22a DW1: every function the migration creates carries the area prefix pf_custom_ (rows rev 15.2)",
    [...migSql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("pf_custom_")));
  ok("PF-22a DW1: additive only — no ALTER of an existing table, no DROP, no data statement but the key's two catalogue inserts",
    (() => { const s = migSql.replace(/\$fn\$[\s\S]*?\$fn\$/g, "");
      const altered = [...s.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]).filter((t) => !TABLES.includes(t));
      const inserts = [...s.matchAll(/^\s*INSERT INTO "(\w+)"/gm)].map((m) => m[1]).sort().join(",");
      return altered.length === 0 && !/\bDROP\b/i.test(s) && !/^\s*(UPDATE|DELETE)\b/im.test(s) && inserts === "platform_permission_key,platform_role_permission"; })());
  // The rollback runs on the demo copy right after its own migration, before any later one (own-migration guard, P-600).
  ok("PF-22a DW1 pass: rollback.sql undoes it on the demo copy (no table, function, type or key left), and the migration applies again",
    (() => { // psql-applied copies have no _prisma_migrations: a stand-in lets rollback's last line run as it would after Prisma
      sqlOn(DEMO, `create table if not exists "_prisma_migrations" (migration_name text); insert into "_prisma_migrations" values ('${NEW}')`);
      psqlFile(DEMO, join(MIG, NEW, "rollback.sql"));
      const left = sqlOn(DEMO, `select (select count(*) from pg_class where relname like 'plat_custom_%' or relname = 'plat_saved_view') + (select count(*) from pg_proc where proname like 'pf_custom_%') + (select count(*) from pg_type where typname = 'PlatCustomFieldType') + (select count(*) from platform_permission_key where key = 'agent/custom-field:manage') + (select count(*) from "_prisma_migrations" where migration_name = '${NEW}')`);
      psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
      return left === "0" && walled(DEMO) === "ttt" && demoFacts(DEMO) === demoBefore; })());
  const later = all.filter((d) => d > NEW);
  for (const d of later) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok(`PF-22a DW1 pass: prisma migrate diff between the fully migrated database (this migration, then the ${later.length} after it) and the schema is empty`, diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 800));
  // ------------------------------------------------------------------------------- the working database (all, seeded)
  for (const d of all) psqlFile(DB, join(MIG, d, "migration.sql"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(db); } finally { await db.$disconnect(); }
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmB = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staffOf = (f: string, n = 0) => sql(`select id from platform_staff where firm_id = '${f}' order by id offset ${n} limit 1`);
  const sA = staffOf(firmA), sA2 = staffOf(firmA, 1), sB = staffOf(firmB);
  ok("PF-22a setup: the Sample firms have staff (firm A two)", !!firmA && !!firmB && !!sA && !!sA2 && !!sB && sA !== sA2, { firmA, firmB, sA, sA2, sB });

  const field = (id: string, firm: string, staff: string, key: string, type: string, options: unknown = [], kind = "fo_prospect") =>
    `insert into plat_custom_field (id, firm_id, entity_kind, key, label, type, options, created_by, updated_at)
     values ('${id}', '${firm}', '${kind}', '${key}', 'Label ${key}', '${type}', '${j(options)}', '${staff}', now())`;
  const value = (firm: string, fieldId: string, entity: string, v: unknown, staff: string, kind = "fo_prospect") =>
    `insert into plat_custom_value (id, firm_id, field_id, entity_kind, entity_id, value, updated_by, updated_at)
     values (gen_random_uuid(), '${firm}', '${fieldId}', '${kind}', '${entity}', '${j(v)}', '${staff}', now())`;

  // ----------------------------------------------------------------------------- DW2: a field's shape
  const fSel = uuid(), fDate = uuid();
  sql(field(fSel, firmA, sA, "referral_partner", "SELECT", ["Partner A", "Partner B"]));
  sql(field(fDate, firmA, sA, "next_call", "DATE"));
  ok("PF-22a DW2 pass: a SELECT field with two options and a DATE field with none are written (required false, position 0)",
    sql(`select count(*) from plat_custom_field where firm_id = '${firmA}' and required = false and position = 0`) === "2");
  ok("PF-22a DW2 fail: a SELECT field with no options is refused", refused(field(uuid(), firmA, sA, "empty_select", "SELECT", []), /plat_custom_field_options/));
  ok("PF-22a DW2 fail: a TEXT field with options is refused", refused(field(uuid(), firmA, sA, "text_opts", "TEXT", ["x"]), /plat_custom_field_options/));
  ok("PF-22a DW2 fail: a MULTI_SELECT with the same option twice (any case) is refused", refused(field(uuid(), firmA, sA, "dup", "MULTI_SELECT", ["Yes", "yes"]), /plat_custom_field_options/));
  ok("PF-22a DW2 fail: an option that is not a string, is blank or is padded is refused",
    [[1], [""], [" Pad"]].every((o) => refused(field(uuid(), firmA, sA, `bad_${uuid().slice(0, 6)}`, "SELECT", o), /plat_custom_field_options/)));
  ok("PF-22a DW2 fail: a key that is not a name (capitals, a space, a leading digit, over 40) is refused",
    ["Referral", "two words", "1st", "k".repeat(41)].every((k) => refused(field(uuid(), firmA, sA, k, "TEXT"), /plat_custom_field_shape/)));
  ok("PF-22a DW2 fail: an entity kind that is not a name is refused", refused(field(uuid(), firmA, sA, "ok_key", "TEXT", [], "Fo Prospect"), /plat_custom_field_shape/));
  ok("PF-22a DW2 fail: the same key twice on one kind of one firm is refused; the same key on another kind is kept",
    refused(field(uuid(), firmA, sA, "next_call", "TEXT"), /plat_custom_field_firm_id_entity_kind_key_key|duplicate key/)
    && (() => { sql(field(uuid(), firmA, sA, "next_call", "TEXT", [], "fo_person")); return true; })());
  ok("PF-22a DW2 fail: a blank or padded label is refused",
    refused(field(uuid(), firmA, sA, "lbl", "TEXT").replace("'Label lbl'", "' '"), /plat_custom_field_shape/)
    && refused(field(uuid(), firmA, sA, "lbl2", "TEXT").replace("'Label lbl2'", "' Pad '"), /plat_custom_field_shape/));

  // ----------------------------------------------------------------------------- DW3: a value fits its field
  const pA = uuid();
  const TYPES: [string, unknown[], unknown[], unknown[]][] = [
    // type, options, good values, bad values
    ["TEXT", [], ["Met at the fair", " padded is kept "], ["", "   ", "\t\n", "\u00a0", "\u200b", "\u3000", 5, "x".repeat(501), true]],
    ["LONG_TEXT", [], ["A longer note"], ["x".repeat(5001), ["a"]]],
    ["NUMBER", [], [42, -1.5, 0, 0.1, Math.PI, 0.1 + 0.2, 1 / 3, 123456789012345.6], ["42", true, 1e16]],
    ["DATE", [], ["2026-11-25", "2024-02-29"], ["tomorrow", "2026-02-30", "2025-02-29", "25/11/2026", "2026-11-25T10:00:00Z", 20261125]],
    ["MULTI_SELECT", ["Red", "Blue"], [["Red"], ["Red", "Blue"]], [[], ["Green"], ["Red", "Red"], "Red", [1]]],
    ["CHECKBOX", [], [true, false], ["true", 1, null]],
    ["EMAIL", [], ["person@example.com", "first.last+tag@mail.example.ca"], ["person", "a@b", "two words@example.com", "<script>@x.y", "a@b..c", "a@b.c\u3000"]],
    ["PHONE", [], ["+1 416 555 0100", "(416) 555-0100"], ["call me", "12", "+1 416 555 0100 ext 9", "((((", "(   )", "0---"]],
    ["URL", [], ["https://example.com/a"], ["example.com", "ftp://example.com", "https://exa mple.com", "https:// ", "https://"]],
  ];
  const typeFields: Record<string, string> = {};
  for (const [t, o] of TYPES) { typeFields[t] = uuid(); sql(field(typeFields[t], firmA, sA, `f_${t.toLowerCase()}`, t, o)); }
  ok("PF-22a DW3 pass: a SELECT value among its options is written", (() => { sql(value(firmA, fSel, pA, "Partner A", sA)); return sql(`select value #>> '{}' from plat_custom_value where field_id = '${fSel}' and entity_id = '${pA}'`) === "Partner A"; })());
  ok("PF-22a DW3 fail: a SELECT value not in its options is refused", refused(value(firmA, fSel, uuid(), "Partner Z", sA), /does not fit its field's type \(SELECT\)/));
  ok("PF-22a DW3 pass: a DATE value that is a calendar day is written", (() => { sql(value(firmA, fDate, pA, "2026-12-01", sA)); return true; })());
  ok("PF-22a DW3 fail: a DATE refuses \"tomorrow\"", refused(value(firmA, fDate, uuid(), "tomorrow", sA), /does not fit its field's type \(DATE\)/));
  for (const [t, , good, bad] of TYPES) {
    ok(`PF-22a DW3 pass: ${t} takes ${good.map((g) => JSON.stringify(g)).join(", ")}`, good.every((g) => { try { sql(value(firmA, typeFields[t], uuid(), g, sA)); return true; } catch { return false; } }));
    ok(`PF-22a DW3 fail: ${t} refuses ${bad.map((b) => JSON.stringify(b)).join(", ")}`, bad.every((b) => refused(value(firmA, typeFields[t], uuid(), b, sA), /does not fit its field's type|null value|violates not-null/)));
  }
  ok("PF-22a DW3 fail: a value whose record kind is not its field's is refused", refused(value(firmA, fSel, uuid(), "Partner A", sA, "fo_person"), /record kind is not its field's/));
  ok("PF-22a DW3 fail: one record has one value per field (a second row is refused)", refused(value(firmA, fSel, pA, "Partner B", sA), /plat_custom_value_firm_id_field_id_entity_id_key|duplicate key/));
  ok("PF-22a DW3 pass/fail: a value is changed in place to another option; to a value outside them it is refused; its record never changes",
    (() => { sql(`update plat_custom_value set value = '"Partner B"' where field_id = '${fSel}' and entity_id = '${pA}'`); return true; })()
    && refused(`update plat_custom_value set value = '"Nobody"' where field_id = '${fSel}' and entity_id = '${pA}'`, /does not fit/)
    && refused(`update plat_custom_value set entity_id = '${uuid()}' where field_id = '${fSel}' and entity_id = '${pA}'`, /never change/));
  ok("PF-22a DW3 pass: a cleared value is a deleted row (a value may be deleted)",
    (() => { const e = uuid(); sql(value(firmA, fDate, e, "2026-01-01", sA)); sql(`delete from plat_custom_value where field_id = '${fDate}' and entity_id = '${e}'`); return sql(`select count(*) from plat_custom_value where entity_id = '${e}'`) === "0"; })());

  // ----------------------------------------------------------------------------- DW4: archive, never delete
  ok("PF-22a DW4 fail: a field is never deleted (archive instead)", refused(`delete from plat_custom_field where id = '${fSel}'`, /archived, never removed \(DELETE refused\)/));
  ok("PF-22a DW4 fail: the fields table is never truncated", refused(`truncate plat_custom_field cascade`, /archived, never removed \(TRUNCATE refused\)/));
  ok("PF-22a DW4 fail: the app's role holds no DELETE or TRUNCATE on fields, and keeps INSERT and UPDATE",
    sql(`select has_table_privilege('xr_app', 'plat_custom_field', 'DELETE') or has_table_privilege('xr_app', 'plat_custom_field', 'TRUNCATE')`) === "f"
    && sql(`select has_table_privilege('xr_app', 'plat_custom_field', 'INSERT') and has_table_privilege('xr_app', 'plat_custom_field', 'UPDATE')`) === "t");
  sql(`update plat_custom_field set archived_at = now() where id = '${fSel}'`);
  ok("PF-22a DW4 pass: archiving keeps the field's values", sql(`select count(*) from plat_custom_value where field_id = '${fSel}'`) === "1");
  ok("PF-22a DW4 fail: an archived field takes no new value, and its value is not changed", refused(value(firmA, fSel, uuid(), "Partner A", sA), /archived/)
    && refused(`update plat_custom_value set value = '"Partner A"' where field_id = '${fSel}'`, /archived/));
  sql(`update plat_custom_field set archived_at = null where id = '${fSel}'`);
  ok("PF-22a DW4 pass: un-archived, the field shows its kept value again and takes new ones",
    sql(`select value #>> '{}' from plat_custom_value where field_id = '${fSel}' and entity_id = '${pA}'`) === "Partner B" && (() => { sql(value(firmA, fSel, uuid(), "Partner A", sA)); return true; })());
  ok("PF-22a DW4 fail: a field's key, kind and creator never change",
    refused(`update plat_custom_field set key = 'other' where id = '${fSel}'`, /never change/) && refused(`update plat_custom_field set entity_kind = 'fo_person' where id = '${fSel}'`, /never change/)
    && refused(`update plat_custom_field set created_by = '${sA2}' where id = '${fSel}'`, /never change/));
  ok("PF-22a DW4 pass: a field's label, help text, order and required flag change", (() => { sql(`update plat_custom_field set label = 'Referral partner', help_text = 'Who sent them', position = 3, required = true where id = '${fSel}'`); return true; })());

  // ----------------------------------------------------------------------------- DW5: the type and options of a field in use
  ok("PF-22a DW5 fail: a type change of a field with values is refused", refused(`update plat_custom_field set type = 'TEXT', options = '[]' where id = '${fDate}'`, /type of a field with values never changes/));
  ok("PF-22a DW5 pass: a type change of a field with no values is allowed", (() => { const f = uuid(); sql(field(f, firmA, sA, "no_values", "TEXT")); sql(`update plat_custom_field set type = 'NUMBER' where id = '${f}'`); return sql(`select type from plat_custom_field where id = '${f}'`) === "NUMBER"; })());
  ok("PF-22a DW5 fail: removing an option a value uses is refused", refused(`update plat_custom_field set options = '["Partner A"]' where id = '${fSel}'`, /option in use is never removed/));
  ok("PF-22a DW5 pass: adding an option, or removing one no value uses, is allowed",
    (() => { sql(`update plat_custom_field set options = '["Partner A", "Partner B", "Partner C"]' where id = '${fSel}'`); sql(`update plat_custom_field set options = '["Partner A", "Partner B"]' where id = '${fSel}'`); return true; })());

  // ----------------------------------------------------------------------------- DW7: saved views
  const view = (id: string, firm: string, owner: string | null, creator: string, extra: { filter?: unknown; columns?: unknown; name?: string } = {}) =>
    `insert into plat_saved_view (id, firm_id, owner_staff_id, list_kind, name, filter, columns, created_by, updated_at)
     values ('${id}', '${firm}', ${owner ? `'${owner}'` : "null"}, 'fo.pipeline.individual', '${extra.name ?? "All open"}', '${j(extra.filter ?? { stage: ["NEW"] })}', '${j(extra.columns ?? ["name", "custom:referral_partner"])}', '${creator}', now())`;
  const vP = uuid(), vS = uuid();
  sql(view(vP, firmA, sA, sA)); sql(view(vS, firmA, null, sA2));
  ok("PF-22a DW7 pass: a personal view (owner set) and a shared view (owner null) are written, both named \"All open\"",
    sql(`select count(*) || ':' || count(owner_staff_id) from plat_saved_view where firm_id = '${firmA}' and name = 'All open'`) === "2:1");
  ok("PF-22a DW7 fail: a filter that is not an object is refused", refused(view(uuid(), firmA, sA, sA, { filter: ["stage"] }), /plat_saved_view_shape/));
  ok("PF-22a DW7 fail: columns that are not a list of names are refused", refused(view(uuid(), firmA, sA, sA, { columns: [1] }), /plat_saved_view_columns/)
    && refused(view(uuid(), firmA, sA, sA, { columns: ["bad name"] }), /plat_saved_view_columns/) && refused(view(uuid(), firmA, sA, sA, { columns: "name" }), /plat_saved_view_(shape|columns)/));
  ok("PF-22a DW7 fail: a blank name is refused", refused(view(uuid(), firmA, sA, sA, { name: " " }), /plat_saved_view_shape/));
  ok("PF-22a DW7 pass/fail: a view is renamed and shared (owner to null); its list and creator never change",
    (() => { sql(`update plat_saved_view set name = 'Mine', owner_staff_id = null where id = '${vP}'`); return true; })()
    && refused(`update plat_saved_view set list_kind = 'fo.leads' where id = '${vP}'`, /never change/) && refused(`update plat_saved_view set created_by = '${sA2}' where id = '${vP}'`, /never change/));
  ok("PF-22a DW7 pass: a leaver's shared view stays (the person deactivated, the view kept)",
    (() => { sql(`begin; update platform_staff set status = 'DEACTIVATED' where id = '${sA2}'; commit`); const n = sql(`select count(*) from plat_saved_view where id = '${vS}'`); sql(`update platform_staff set status = 'ACTIVE' where id = '${sA2}'`); return n === "1"; })());

  // ------------------------------------------------------------------------------- review and break round 1
  const rawValue = (fieldId: string, v: string) => `insert into plat_custom_value (id, firm_id, field_id, entity_kind, entity_id, value, updated_by, updated_at)
     values (gen_random_uuid(), '${firmA}', '${fieldId}', 'fo_prospect', gen_random_uuid(), '${v}'::jsonb, '${sA}', now())`;
  ok("PF-22a break m4 fail: a NUMBER a JSON reader cannot get back unchanged is refused (1e-400, 0.1234567890123456789, 1.00000000000000001)",
    ["1e-400", "0.1234567890123456789", "1.00000000000000001"].every((n) => refused(rawValue(typeFields.NUMBER, n), /does not fit its field's type \(NUMBER\)/)));
  ok("PF-22a break m1 fail: a label or a choice padded or made only of Unicode spaces is refused",
    refused(field(uuid(), firmA, sA, "lbl3", "TEXT").replace("'Label lbl3'", "E'\\tTabbed'"), /plat_custom_field_shape/)
    && refused(field(uuid(), firmA, sA, "lbl4", "TEXT").replace("'Label lbl4'", "'　'"), /plat_custom_field_shape/)
    && refused(field(uuid(), firmA, sA, "opt_tab", "SELECT", ["\tYes", "No"]), /plat_custom_field_options/)
    && refused(field(uuid(), firmA, sA, "lbl_nel", "TEXT").replace("'Label lbl_nel'", "U&'Yes\\0085'"), /plat_custom_field_shape/));   // break round 2 n2: U+0085 under pg_c_utf8
  ok("PF-22a break m2 fail: choices that differ only by case or spelling (NFC) are one choice: refused",
    refused(field(uuid(), firmA, sA, "opt_case", "SELECT", ["Élan", "élan"]), /plat_custom_field_options/)
    && refused(field(uuid(), firmA, sA, "opt_nfc", "SELECT", ["café", "café"]), /plat_custom_field_options/));
  ok("PF-22a review m1 fail: a label over 80, a choice over 80, more than 100 choices, help text over 300 or a negative order is refused",
    refused(field(uuid(), firmA, sA, "long_lbl", "TEXT").replace("'Label long_lbl'", `'${"L".repeat(81)}'`), /plat_custom_field_shape/)
    && refused(field(uuid(), firmA, sA, "long_opt", "SELECT", ["x".repeat(81)]), /plat_custom_field_options/)
    && refused(field(uuid(), firmA, sA, "many_opt", "SELECT", Array.from({ length: 101 }, (_, i) => `Choice ${i}`)), /plat_custom_field_options/)
    && refused(`update plat_custom_field set help_text = '${"h".repeat(301)}' where id = '${fSel}'`, /plat_custom_field_shape/)
    && refused(`update plat_custom_field set position = -1 where id = '${fSel}'`, /plat_custom_field_shape/));
  ok("PF-22a review m1 pass: exactly 80, 100 choices, 300 of help text are kept",
    (() => { const f = uuid(); sql(field(f, firmA, sA, "edge_80", "SELECT", Array.from({ length: 100 }, (_, i) => `Choice ${i}`)).replace("'Label edge_80'", `'${"L".repeat(80)}'`));
      sql(`update plat_custom_field set help_text = '${"h".repeat(300)}' where id = '${f}'`); return true; })());
  ok("PF-22a review m2 / m1 fail: a field's id and created time never change", refused(`update plat_custom_field set id = gen_random_uuid() where id = '${fDate}'`, /never change/)
    && refused(`update plat_custom_field set created_at = now() - interval '1 day' where id = '${fDate}'`, /never change/));
  ok("PF-22a review m1 fail: a value's firm, field, kind and id never change",
    refused(`update plat_custom_value set field_id = '${fDate}' where field_id = '${fSel}' and entity_id = '${pA}'`, /never change/)
    && refused(`update plat_custom_value set entity_kind = 'fo_person' where field_id = '${fSel}' and entity_id = '${pA}'`, /never change/)
    && refused(`update plat_custom_value set firm_id = '${firmB}' where field_id = '${fSel}' and entity_id = '${pA}'`, /never change|foreign key/)
    && refused(`update plat_custom_value set id = gen_random_uuid() where field_id = '${fSel}' and entity_id = '${pA}'`, /never change/));
  ok("PF-22a break M1 fail: a type or choices change at REPEATABLE READ or SERIALIZABLE is refused (its values check would read an old snapshot)",
    refused(`begin isolation level repeatable read; update plat_custom_field set options = '["Partner A", "Partner B", "Partner D"]' where id = '${fSel}'; commit`, /only at READ COMMITTED/)
    && refused(`begin isolation level serializable; update plat_custom_field set type = 'NUMBER' where id = '${typeFields.TEXT}'; commit`, /only at READ COMMITTED/));
  ok("PF-22a break M1 pass: at REPEATABLE READ a field's label, order and archive still change; at READ COMMITTED its choices do",
    (() => { sql(`begin isolation level repeatable read; update plat_custom_field set label = 'Referral partner (RR)', position = 4 where id = '${fSel}'; commit`);
      sql(`update plat_custom_field set options = '["Partner A", "Partner B", "Partner D"]' where id = '${fSel}'`); return sql(`select label from plat_custom_field where id = '${fSel}'`) === "Referral partner (RR)"; })());
  {
    // Session 2 writes a value (its trigger holds the field FOR SHARE) and stays open 2 s; session 1's type change waits
    // for that lock, then its READ COMMITTED check reads the committed value and refuses.
    const f = uuid(); sql(field(f, firmA, sA, "race_num", "NUMBER"));
    const s2 = spawn(join(BIN, "psql"), [urlOf(DB), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", `begin; ${value(firmA, f, uuid(), 42, sA)}; select pg_sleep(2); commit;`], { stdio: "ignore" });
    const s2done = new Promise<number | null>((res) => s2.on("exit", res));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);   // session 2 is inside its transaction
    const t0 = Date.now(), refusedRace = refused(`update plat_custom_field set type = 'DATE' where id = '${f}'`, /type of a field with values never changes/), waited = Date.now() - t0;
    const code = await s2done;
    ok("PF-22a break M1 pass (two sessions): a type change waits for another session's uncommitted value, then sees it and is refused; the value stands",
      refusedRace && waited > 500 && code === 0 && sql(`select type from plat_custom_field where id = '${f}'`) === "NUMBER" && sql(`select value from plat_custom_value where field_id = '${f}'`) === "42", { refusedRace, waited, code });
  }
  ok("PF-22a break m6 (c) fail: a value of an archived field is not deleted (kept until un-archived); un-archived it is",
    (() => { const e = uuid(); sql(value(firmA, fDate, e, "2026-03-03", sA)); sql(`update plat_custom_field set archived_at = now() where id = '${fDate}'`);
      const kept = refused(`delete from plat_custom_value where field_id = '${fDate}' and entity_id = '${e}'`, /archived/);
      sql(`update plat_custom_field set archived_at = null where id = '${fDate}'`); sql(`delete from plat_custom_value where field_id = '${fDate}' and entity_id = '${e}'`);
      return kept && sql(`select count(*) from plat_custom_value where entity_id = '${e}'`) === "0"; })());
  ok("PF-22a break m6 (d) / review m1 fail: a view's filter over 16,384 characters, its sort over 2,048, more than 50 columns, a column twice, or a change of its id, firm or created time is refused",
    refused(view(uuid(), firmA, sA, sA, { filter: { big: "x".repeat(16_400) } }), /plat_saved_view_shape/)
    && refused(`update plat_saved_view set sort = '${j({ by: "x".repeat(2100) })}' where id = '${vS}'`, /plat_saved_view_shape/)
    && refused(view(uuid(), firmA, sA, sA, { columns: Array.from({ length: 51 }, (_, i) => `c${i}`) }), /plat_saved_view_(shape|columns)/)
    && refused(view(uuid(), firmA, sA, sA, { columns: ["name", "name"] }), /plat_saved_view_columns/)
    && refused(`update plat_saved_view set id = gen_random_uuid() where id = '${vS}'`, /never change/)
    && refused(`update plat_saved_view set firm_id = '${firmB}' where id = '${vS}'`, /never change|foreign key|firm/)
    && refused(`update plat_saved_view set created_at = now() - interval '1 day' where id = '${vS}'`, /never change/));
  ok("PF-22a review m1 pass: a view of exactly 50 distinct columns and a sort object are kept",
    (() => { const id = uuid(); sql(view(id, firmA, sA, sA, { columns: Array.from({ length: 50 }, (_, i) => `c${i}`), name: "Fifty" })); sql(`update plat_saved_view set sort = '{"by":"name","dir":"asc"}' where id = '${id}'`); return true; })());

  // ------------------------------------------------------------------------------- DW6: PF-12's wall and the firm keys
  ok("PF-22a DW6 fail: a field of firm A created by firm B's staff is refused by the (firm_id, staff_id) key", refused(field(uuid(), firmA, sB, "cross", "TEXT"), /foreign key/));
  ok("PF-22a DW6 fail: a value of firm B naming firm A's field is refused by the (firm_id, field_id) key", refused(value(firmB, fSel, uuid(), "Partner A", sB), /foreign key/));
  ok("PF-22a DW6 fail: a view of firm A owned by firm B's staff is refused", refused(view(uuid(), firmA, sB, sA), /foreign key/));
  const fB = uuid(); sql(field(fB, firmB, sB, "referral_partner", "SELECT", ["Partner B"])); sql(value(firmB, fB, uuid(), "Partner B", sB)); sql(view(uuid(), firmB, null, sB));
  const seen = (firm: string) => TABLES.map((t) => asApp(firm, `select count(*) from ${t} where firm_id = '${firmB}'`)).join(",");
  ok("PF-22a DW6 pass: firm B's own session reads its field, value and view", seen(firmB) === "1,1,1", seen(firmB));
  ok("PF-22a DW6 fail: firm A's session reads none of firm B's fields, values or views (the policy)", seen(firmA) === "0,0,0", seen(firmA));
  ok("PF-22a DW6 fail: firm A's session cannot write a field for firm B", refusedAsApp(firmA, field(uuid(), firmB, sB, "x_b", "TEXT"), /row-level security|firm|permission denied/));
  ok("PF-22a DW6 fail: firm A's session cannot change firm B's field (no row reached)",
    asApp(firmA, `with u as (update plat_custom_field set label = 'Taken' where id = '${fB}' returning 1) select count(*) from u`) === "0" && sql(`select label from plat_custom_field where id = '${fB}'`) === "Label referral_partner");
  ok("PF-22a DW6 pass: firm A's session writes and reads its own field, value and view",
    (() => { const f = uuid(), e = uuid(); asApp(firmA, field(f, firmA, sA, "app_written", "CHECKBOX")); asApp(firmA, value(firmA, f, e, true, sA)); asApp(firmA, view(uuid(), firmA, sA, sA, { name: "App" }));
      return asApp(firmA, `select count(*) from plat_custom_value where entity_id = '${e}'`) === "1" && asApp(firmA, `select count(*) from plat_saved_view where name = 'App'`) === "1"; })());
  ok("PF-22a DW6 fail: as the app, no role but the owner may call the trigger functions directly (EXECUTE revoked from PUBLIC)",
    DEFINERS.every((f) => sql(`select has_function_privilege('xr_app', '${f}()', 'EXECUTE') or has_function_privilege('xr_data', '${f}()', 'EXECUTE')`) === "f"));
  ok("PF-22a DW6 fail: a look-alike temp table fired from the field or value trigger is refused before any read",
    refused(`begin; create temp table plat_custom_value (firm_id uuid); create trigger t before insert on pg_temp.plat_custom_value for each row execute function public.pf_custom_value_checked(); insert into pg_temp.plat_custom_value values ('${firmB}'); rollback`, /own trigger only/)
    && refused(`begin; create temp table plat_custom_field (firm_id uuid); create trigger t before delete on pg_temp.plat_custom_field for each row execute function public.pf_custom_field_kept(); insert into pg_temp.plat_custom_field values ('${firmB}'); delete from pg_temp.plat_custom_field; rollback`, /own trigger only/));

  // ------------------------------------------------------------------------------- DW8: the key
  ok("PF-22a DW8 pass: agent/custom-field:manage is a catalogue row (scope NONE, class GENERAL) held by Owner and Admin only (Sample)",
    sql(`select k.scope || ':' || k.class || ':' || string_agg(rp.role::text, ',' order by rp.role::text) from platform_permission_key k join platform_role_permission rp on rp.permission_key = k.key where k.key = 'agent/custom-field:manage' group by k.scope, k.class`) === "NONE:GENERAL:ADMIN,OWNER");
  ok("PF-22a DW8 fail: no other agent/custom-field key exists", sql(`select count(*) from platform_permission_key where key like 'agent/custom-field:%'`) === "1");
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  rmSync(WORK, { recursive: true, force: true });
  for (const d of [DB, EMPTY, DEMO]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for the cleanup tool */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
