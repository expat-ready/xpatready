// CS-SD1 (brief product/design/build-lead-c-briefs/CS-SD1.md; P-600, P-610): the schema text matches what main's migrations
// build. Four ids take their default from the database (gen_random_uuid(), as the migrations create them, since two
// migrations insert rows with no id), and canonical_field_name (the database's one-name-per-group guard behind
// rename-door.ts's 409) is stated as an @@ignore model. A passing and a failing case per "Done when" line:
//   DW1  a fresh database after prisma migrate deploy diffs to the schema with exit 0 and an empty script;
//        a schema copy with one id back to @default(uuid()), or without the @@ignore model, names its table.
//   DW2  a raw insert into person_role with no id still gets a UUID; without the default (scratch transaction) it fails.
//   DW3  a duplicate name in a group is refused by canonical_field_name_unique, and through the API a rename to a taken
//        name (also two at the same moment) answers 409; without the index (scratch transaction) the duplicate is accepted.
//   GEN  prisma generate succeeds and the client has no canonicalFieldName delegate (a copy without @@ignore has one).
// A scratch database (xr_studio_cssd1_<pid>) and folder are made and dropped. No browser, no model call (US$0).
//   zsh studio/tools/isolated.sh runtime_cssd1 4631 start && tsx studio/tests/check_cssd1_no_drift.ts 4631 xr_studio_runtime_cssd1
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedField } from "./seed_library.cjs";

const PORT = Number(process.argv[2] ?? 4631), APIDB = process.argv[3] ?? "xr_studio_runtime_cssd1";
const STUDIO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA = join(STUDIO, "node_modules", ".bin", "prisma"), SCHEMA = join(STUDIO, "prisma", "schema"), MIGRATIONS = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const SCRATCH = `xr_studio_cssd1_${process.pid}`, WORK = join(STUDIO, "var", `cssd1-check-${process.pid}`);
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sqlOn = (db: string) => (q: string) => execFileSync(bin("psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-qAtc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = sqlOn(SCRATCH), apiSql = sqlOn(APIDB);
const refused = (q: string, re: RegExp) => { try { sql(q); return { refused: false, err: "" }; } catch (e) { const err = String((e as { stderr?: string }).stderr ?? e); return { refused: re.test(err), err }; } };
const prisma = (args: string[]) => { const r = spawnSync(PRISMA, args, { cwd: STUDIO, encoding: "utf8" }); return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` }; };
// Prisma 7 reads the database from a config file (PF-8r's flags): one per schema folder, all on the scratch database.
const config = (name: string, schema: string) => {
  const cfg = join(WORK, `prisma.${name}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(schema)}, migrations: { path: ${JSON.stringify(MIGRATIONS)} }, datasource: { url: ${JSON.stringify(urlOf(SCRATCH))} } });\n`);
  return cfg;
};
const diff = (name: string, schema: string) => prisma(["migrate", "diff", "--config", config(name, schema), "--from-config-datasource", "--to-schema", schema, "--script", "--exit-code"]);
const sqlLines = (out: string) => out.split("\n").filter((l) => /^(ALTER|DROP|CREATE)\b/.test(l));
// A copy of the schema folder with one file changed by `edit` (which must change it).
const copyWith = (name: string, file: string, edit: (s: string) => string) => {
  const dir = join(WORK, name); cpSync(SCHEMA, dir, { recursive: true });
  const before = readFileSync(join(dir, file), "utf8"), after = edit(before);
  if (after === before) throw new Error(`${name}: the edit of ${file} changed nothing`);
  writeFileSync(join(dir, file), after); return dir;
};
const IGNORED = /\n\/\/ CS-SD1:[\s\S]*?model CanonicalFieldName \{[\s\S]*?@@ignore\n\}\n/;
// prisma generate of a schema copy into its own folder (never node_modules, which other suites use at the same time).
const generate = (name: string, dir: string) => {
  const out = join(WORK, `client-${name}`);
  writeFileSync(join(dir, "base.prisma"), readFileSync(join(dir, "base.prisma"), "utf8").replace(/provider = "prisma-client-js"\n/, `provider = "prisma-client-js"\n  output   = ${JSON.stringify(out)}\n`));
  const r = prisma(["generate", "--schema", dir]);
  const dts = existsSync(join(out, "index.d.ts")) ? readFileSync(join(out, "index.d.ts"), "utf8") : "";
  return { code: r.code, out: r.out, field: /get canonicalField\(\)/.test(dts), name: /get canonicalFieldName\(\)/.test(dts) };
};
type Res = { status: number; body: { detail?: string; applied?: boolean } };
const rename = async (key: string, name: string): Promise<Res> => {
  const r = await fetch(`http://localhost:${PORT}/api/library/fields/${key}/name`, { method: "PATCH", headers: { "x-actor": "user-A", "content-type": "application/json" }, body: JSON.stringify({ name }) });
  const t = await r.text(); let j: Res["body"] = {}; try { j = JSON.parse(t); } catch { j = { detail: t }; }
  return { status: r.status, body: j };
};

const cleanup = () => { spawnSync(bin("dropdb"), [...PG, "--if-exists", "--force", SCRATCH], { stdio: "ignore" }); rmSync(WORK, { recursive: true, force: true }); };
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { cleanup(); process.exit(1); });
mkdirSync(WORK, { recursive: true });
try {
  execFileSync(bin("createdb"), [...PG, SCRATCH], { stdio: "pipe" });
  const dep = prisma(["migrate", "deploy", "--config", config("main", SCHEMA)]);
  ok("setup: every migration applies to a fresh database (prisma migrate deploy)", dep.code === 0, dep.out.slice(-400));

  // ─────────── DW1: no drift from main's migrations to the schema
  const d = diff("main", SCHEMA);
  ok("CS-SD1 DW1 pass: migrate diff --from-config-datasource --to-schema --exit-code exits 0 with an empty script", d.code === 0 && sqlLines(d.out).length === 0 && /empty migration/.test(d.out), d.out.slice(-600));
  const uuidBack = copyWith("uuid-back", "pathways.prisma", (s) => s.replace(/(model PersonRole \{\n\s+id\s+String\s+@id )@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/, "$1@default(uuid())"));
  const du = diff("uuid-back", uuidBack);
  ok("CS-SD1 DW1 fail: a schema copy with person_role's id back to @default(uuid()) gives a non-empty script naming that table", du.code === 2 && sqlLines(du.out).join("\n") === `ALTER TABLE "person_role" ALTER COLUMN "id" DROP DEFAULT;`, du.out.slice(-600));
  const noModel = copyWith("no-model", "library.prisma", (s) => s.replace(IGNORED, "\n"));
  const dn = diff("no-model", noModel);
  ok("CS-SD1 DW1 fail: a schema copy without the @@ignore model would drop canonical_field_name (why the model stays)", dn.code === 2 && sqlLines(dn.out).join("\n") === `DROP TABLE "canonical_field_name";`, dn.out.slice(-600));

  // ─────────── DW2: the database default stays (migrations insert rows with no id)
  sql(`insert into workspace (id, key, label) values (gen_random_uuid(), 'cssd1', 'CS-SD1 check (Sample)')`);
  const WS = "(select id from workspace where key = 'cssd1')";
  const id = sql(`insert into person_role (workspace_id, role_key, label, meaning, takes_part_in_case, may_be_applicant, built_in, display_order) values (${WS}, 'cssd1_a', 'CS-SD1 role (Sample)', 'test', true, false, false, 90) returning id`);
  ok("CS-SD1 DW2 pass: a raw INSERT INTO person_role with no id gets a UUID from the database", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), id);
  const nd = refused(`begin; alter table "person_role" alter column "id" drop default; insert into person_role (workspace_id, role_key, label, meaning, takes_part_in_case, may_be_applicant, built_in, display_order) values (${WS}, 'cssd1_b', 'CS-SD1 role b (Sample)', 'test', true, false, false, 91); commit;`, /null value in column "id"/);
  ok("CS-SD1 DW2 fail: in a scratch transaction without the default, the same insert fails (why the default stays)", nd.refused, nd.err);
  ok("CS-SD1 DW2: the scratch transaction left the default in place", sql(`select column_default from information_schema.columns where table_name = 'person_role' and column_name = 'id'`) === "gen_random_uuid()");
  const defaults = sql(`select string_agg(table_name || '=' || coalesce(column_default, 'none'), ',' order by table_name) from information_schema.columns where column_name = 'id' and table_name in ('fact_source','form_edition_accept','person_role','validated_copy')`);
  ok("CS-SD1 DW2: all four tables keep gen_random_uuid() as their id default", defaults === "fact_source=gen_random_uuid(),form_edition_accept=gen_random_uuid(),person_role=gen_random_uuid(),validated_copy=gen_random_uuid()", defaults);

  // ─────────── DW3: canonical_field_name stays the database's one-name-per-group guard
  const field = (key: string, label: string) => `insert into canonical_field (id, workspace_id, canonical_field_key, version, status, meaning, value_type, data_type, scope, subject_kind, origin, label, group_key, updated_by) values (gen_random_uuid(), ${WS}, '${key}', 1, 'DRAFT', 'CS-SD1 test field (Sample)', 'text', 'STRING', 'CLIENT_LEVEL', 'PERSON', 'HUMAN', '${label}', 'person', 'user-A')`;
  sql(field("person.cssd1_one", "Cssd1 name"));
  const dup = refused(field("person.cssd1_two", "CSSD1 Name"), /canonical_field_name_unique/);
  ok("CS-SD1 DW3 pass: a second field with a name already used in its group is refused by canonical_field_name_unique (23505)", dup.refused, dup.err);
  const noIdx = sql(`begin; drop index "canonical_field_name_unique"; ${field("person.cssd1_two", "CSSD1 Name")}; select count(*) from canonical_field_name where group_key = 'person' and name_key = 'cssd1name'; rollback;`);
  ok("CS-SD1 DW3 fail: in a scratch transaction without the unique index, the duplicate is accepted (why the table and index stay)", noIdx === "2", noIdx);
  ok("CS-SD1 DW3: the scratch transaction left the partial unique index in place", /WHERE \(name_key <> ''::text\)/.test(sql(`select indexdef from pg_indexes where indexname = 'canonical_field_name_unique'`)));

  // Through the API on the isolated copy (the sample loaded first, as the G-CORE B2 suite does): rename-door.ts answers 409.
  const loaded = await fetch(`http://localhost:${PORT}/api/demo/load`, { method: "POST", headers: { "x-actor": "user-A" } });
  ok("CS-SD1 DW3 setup: the sample inputs load on the isolated copy", loaded.status === 201, loaded.status);
  const u = Date.now().toString(36), a = seedField(apiSql, { key: `person.cssd1_a_${u}`, meaning: "CS-SD1 test field (Sample)", review: false }), b = seedField(apiSql, { key: `person.cssd1_b_${u}`, meaning: "CS-SD1 test field (Sample)", review: false });
  const taken = `Cssd1 taken ${u}`;
  const r1 = await rename(a, taken);
  ok("CS-SD1 DW3 setup: a direct rename to a free name applies (200)", r1.status === 200 && r1.body.applied === true, r1);
  const r2 = await rename(b, taken.toUpperCase());
  ok("CS-SD1 DW3 pass: renaming a shared field to a name already used in its group answers 409, nothing written", r2.status === 409 && /already/.test(r2.body.detail ?? "") && apiSql(`select count(*) from canonical_field where canonical_field_key = '${b}' and label ilike '${taken}'`) === "0", r2);
  const c = seedField(apiSql, { key: `person.cssd1_c_${u}`, meaning: "CS-SD1 test field (Sample)", review: false }), e = seedField(apiSql, { key: `person.cssd1_e_${u}`, meaning: "CS-SD1 test field (Sample)", review: false });
  const race = `Cssd1 race ${u}`, [x, y] = await Promise.all([rename(c, race), rename(e, race)]);
  const won = apiSql(`select count(distinct canonical_field_key) from canonical_field_name where name_key = lower(regexp_replace('${race}', '[^A-Za-z0-9]+', '', 'g'))`);
  ok("CS-SD1 DW3 race: two renames to one name at the same moment: one 200, one 409 \"already\", one field holds the name", [x.status, y.status].sort().join() === "200,409" && /already/.test([x, y].find((r) => r.status === 409)?.body.detail ?? "") && won === "1", { x, y, won });

  // ─────────── GEN: the client never reaches canonical_field_name
  const g = generate("main", copyWith("gen-main", "base.prisma", (s) => `${s}\n`));
  ok("CS-SD1 GEN pass: prisma generate succeeds; the client has canonicalField and no canonicalFieldName delegate", g.code === 0 && g.field && !g.name, g.out.slice(-400));
  const gi = generate("no-ignore", copyWith("gen-no-ignore", "library.prisma", (s) => s.replace(/\n  @@ignore\n\}/, "\n}")));
  ok("CS-SD1 GEN fail: a copy without @@ignore would give the client a canonicalFieldName delegate (why @@ignore stays)", gi.code === 0 && gi.name, gi.out.slice(-400));
} catch (err) {
  ok("the CS-SD1 check ran", false, (err as Error).message);
} finally {
  cleanup();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
