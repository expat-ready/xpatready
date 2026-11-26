// CS-S1 part 1 (map row 102, the case half; brief design/briefs/CS-S1.md part 1; contract v0.1 §3.1): the case party
// index and the triggers that keep it. Named cases CS-S1 DW1-DW5, each a pass and a fail. Scratch databases: "bare"
// (every migration before this row's, fixtures written in SQL, then this row's: the backfill, measured right after its
// own migration, rows rev 16.7) and "full" (every migration on main). Fixtures: two Sample firms (platform_firm, as PF-3's
// seed), cases written with the replica role (no stage or release needed), and people, profiles, participants and
// answers written normally, so the triggers under test run. A relative's subject is made as runtime.ts's relatives route
// makes it (an answer subject of the person's party with the relation as its kind, and no participant row). No server,
// no browser, no model call (US$0). Every value is Sample. Both databases are dropped at the end.
//   tsx studio/tests/check_css1_index.ts
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261117004500_css1_case_party_index";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const BARE = `xr_studio_css1_bare_${process.pid}`, FULL = `xr_studio_css1_full_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psql = (url: string, args: string[]) => execFileSync(join(BIN, "psql"), [url, "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user = "xr_studio") => psql(urlOf(db, user), ["-Atc", q]);
const err = (f: () => unknown) => { try { f(); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

const KEYS = ["person.given_names", "person.family_name", "person.email", "person.email_address", "person.phone_number", "person.phone_country_code", "organisation.employer_name", "organisation.name", "person.date_of_birth"];
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

/** The fixtures every database starts from: one workspace with its roles and fields, two Sample firms. */
type World = { W: string; field: Record<string, string>; firm: Record<string, string> };
function world(db: string): World {
  const W = randomUUID(), field = Object.fromEntries(KEYS.map((k) => [k, randomUUID()])), firm: Record<string, string> = { "sample-firm": randomUUID(), "sample-solo": randomUUID() };
  sql(db, `insert into workspace (id, key, label) values ('${W}', 'css1-${W.slice(0, 8)}', 'CS-S1 (Sample)');
    insert into person_role (id, workspace_id, role_key, label, meaning, takes_part_in_case, may_be_applicant) values
      ('${randomUUID()}', '${W}', 'principal', 'Principal', 'Sample', true, true), ('${randomUUID()}', '${W}', 'spouse_or_partner', 'Spouse', 'Sample', true, true),
      ('${randomUUID()}', '${W}', 'child', 'Child', 'Sample', true, true);
    set session_replication_role = replica;
    ${KEYS.map((k) => `insert into canonical_field (id, workspace_id, canonical_field_key, data_type, value_type, meaning, status, updated_by, version, subject_kind, scope, origin)
      values ('${field[k]}', '${W}', '${k}', 'STRING', 'text', 'Sample', 'PUBLISHED', 'css1', 1, 'person', 'CLIENT_LEVEL', 'HUMAN');`).join("\n")}
    ${Object.entries(firm).map(([k, id]) => `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${id}', '${k}', '${k} (Sample)', 'CA', '${k}@example.com', now()) on conflict (key) do nothing;`).join("\n")}`);
  for (const k of Object.keys(firm)) firm[k] = sql(db, `select id from platform_firm where key = '${k}'`);
  return { W, field, firm };
}
let caseNo = 0;
/** A case of a firm (written with the replica role: no stage, release or principal check needed for a fixture). */
const newCase = (db: string, w: World, firmKey: string) => {
  const id = randomUUID();
  sql(db, `set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key)
    values ('${id}', '${w.W}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(++caseNo).padStart(5, "0")}', '${firmKey}')`);
  return id;
};
/** A person (party, profile, subject) on a case in a role; role null: a relative's subject of `ofParty` (no participant). */
function person(db: string, w: World, caseId: string | null, role: string | null, profileName: string, ofParty?: string) {
  const party = ofParty ?? randomUUID(), subject = randomUUID();
  sql(db, `${ofParty ? "" : `insert into party (id, workspace_id) values ('${party}', '${w.W}');
    insert into party_profile (id, workspace_id, party_id, display_name) values ('${randomUUID()}', '${w.W}', '${party}', ${q(profileName)});`}
    insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${subject}', '${w.W}', '${party}', '${role ?? "parent_1"}', ${q(`${profileName} (${role ?? "parent_1"})`)});
    ${caseId && role ? `insert into case_participant (id, workspace_id, case_id, subject_id, role, "order") values ('${randomUUID()}', '${w.W}', '${caseId}', '${subject}', '${role}', (select coalesce(max("order"), 0) + 1 from case_participant where case_id = '${caseId}'));` : ""}`);
  return { party, subject };
}
/** An answer, as the write sites store one: the current version superseded by the new one, in one transaction. */
function answerSql(w: World, who: { party: string; subject: string }, key: string, value: unknown) {
  const id = randomUUID();
  return `update client_canonical_answer set superseded_by_id = '${id}' where subject_id = '${who.subject}' and canonical_field_key = '${key}' and row_key is null and superseded_by_id is null;
    insert into client_canonical_answer (id, workspace_id, party_id, subject_id, canonical_field_id, canonical_field_key, value_json, status, source_json)
      values ('${id}', '${w.W}', '${who.party}', '${who.subject}', '${w.field[key]}', '${key}', ${j(value)}, 'DECLARED', '{"channel":"questionnaire"}');`;
}
function answer(db: string, w: World, who: { party: string; subject: string }, key: string, value: unknown, extra = "") {
  sql(db, `begin; ${answerSql(w, who, key, value)} ${extra} commit;`);
}
const row = (db: string, subject: string) => {
  const r = sql(db, `select row_to_json(x) from case_party_index x where subject_id = '${subject}'`);
  return r ? JSON.parse(r) as Record<string, string | null> : null;
};

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [BARE, FULL]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------- DW5 (part 1): the migration itself
  const before = all.filter((d) => d < NEW), text = readFileSync(join(MIG, NEW, "migration.sql"), "utf8"), code = text.replace(/^\s*--.*$/gm, "");
  ok(`CS-S1 DW5 pass: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)}; P-348 (8))`,
    all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  const fns = [...code.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].map((m) => m[1]);
  ok(`CS-S1 DW5 pass: every function the migration creates is case_party_index_* (${fns.length})`, fns.length >= 5 && fns.every((f) => f.startsWith("case_party_index_")), fns);
  const altered = [...code.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
  ok("CS-S1 DW5 pass (parallel safety): the migration alters no table but its own (answers.prisma and cases.prisma tables only get triggers)",
    altered.every((t) => t === "case_party_index") && !/\b(DROP|ALTER)\s+(TABLE|COLUMN)\s+"?(client_canonical_answer|case_participant|party_profile|runtime_case|answer_subject)/i.test(code), altered);

  // ---------------------------------------------------------------------- DW4 (part 1): the backfill on a copy with data
  for (const d of before) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);
  const b = world(BARE);
  const bA = newCase(BARE, b, "sample-firm"), bB = newCase(BARE, b, "sample-solo");
  const bP = person(BARE, b, bA, "principal", "Marie Dupont (Sample)");
  answer(BARE, b, bP, "person.given_names", "Marie"); answer(BARE, b, bP, "person.family_name", "Dupont");
  const bS = person(BARE, b, bA, "spouse_or_partner", "Jean Dupont (Sample)"), bC = person(BARE, b, bA, "child", "Lea Dupont (Sample)");
  const bE = person(BARE, b, bA, "case", "Case A (Sample)"); answer(BARE, b, bE, "organisation.employer_name", "Sample Employer Ltd (Sample)");
  const bNoE = person(BARE, b, bA, "case", "Case A stage 2 (Sample)");   // a "case" participant with no employer name
  const bRel = person(BARE, b, null, null, "Marie Dupont (Sample)", bP.party); answer(BARE, b, bRel, "person.given_names", "Parent");
  const bB1 = person(BARE, b, bB, "principal", "Solo Client (Sample)");
  // The brief's count, with the refresh's own reading of "an employer name": a current single answer, a non-blank string.
  const expected = sql(BARE, `select count(*) from case_participant cp where cp.role <> 'case' or exists (select 1 from client_canonical_answer a
    where a.subject_id = cp.subject_id and a.superseded_by_id is null and a.row_key is null and a.canonical_field_key in ('organisation.employer_name', 'organisation.name')
      and jsonb_typeof(a.value_json) = 'string' and btrim(a.value_json #>> '{}') <> '')`);
  ok("CS-S1 DW4 fail: before the migration there is no index (the table does not exist)", /does not exist/.test(err(() => sql(BARE, "select count(*) from case_party_index"))));
  psql(urlOf(BARE), ["-f", join(MIG, NEW, "migration.sql")]);
  const got = sql(BARE, "select count(*) from case_party_index");
  ok(`CS-S1 DW4 pass: right after the migration the backfill count (${got}) equals person-role participants plus "case" participants with an employer name (${expected}, counted by SQL)`, got === expected && got === "5", { got, expected });
  ok("CS-S1 DW4 fail: the \"case\" participant with no employer name, and the relative's subject, have no row", row(BARE, bNoE.subject) === null && row(BARE, bRel.subject) === null);
  const bp = row(BARE, bP.subject), be = row(BARE, bE.subject);
  ok("CS-S1 DW4 pass: the backfilled rows carry their kind, role and name (principal CLIENT/PRINCIPAL from the answers; employer EMPLOYER/EMPLOYER; spouse and child FAMILY_MEMBER from the profile)",
    bp?.kind === "CLIENT" && bp.role_on_case === "PRINCIPAL" && bp.display_name === "Marie Dupont" && be?.kind === "EMPLOYER" && be.role_on_case === "EMPLOYER" && be.display_name === "Sample Employer Ltd (Sample)"
    && row(BARE, bS.subject)?.role_on_case === "SPOUSE_OR_PARTNER" && row(BARE, bC.subject)?.kind === "FAMILY_MEMBER" && row(BARE, bC.subject)?.name_norm === "lea dupont (sample)", { bp, be });
  ok("CS-S1 DW3 pass (backfill): each row's firm_id is its case's firm (the solo firm's case gets the solo firm's id)",
    bp?.firm_id === b.firm["sample-firm"] && row(BARE, bB1.subject)?.firm_id === b.firm["sample-solo"] && b.firm["sample-firm"] !== b.firm["sample-solo"]);
  ok("CS-S1 DW5 fail: the migration does not apply twice (its table and functions already exist)", /already exists/.test(err(() => psql(urlOf(BARE), ["-f", join(MIG, NEW, "migration.sql")]))));
  ok("CS-S1 DW5 pass: pg_trgm sits in its own schema (extensions): none of its functions lands among public's (suites that list public's functions stay true)",
    sql(BARE, "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'") === "extensions"
    && sql(BARE, "select count(*) from pg_proc where pronamespace = 'public'::regnamespace and (proname like '%trgm%' or proname in ('similarity', 'word_similarity'))") === "0");
  ok("CS-S1 DW5 pass: a second CREATE EXTENSION IF NOT EXISTS pg_trgm is harmless (FO-9a's may run before or after)", err(() => sql(BARE, "create extension if not exists pg_trgm")) === "" && sql(BARE, "select count(*) from pg_extension where extname = 'pg_trgm'") === "1");

  // -------------------------------------------------------------------------------- the full chain: every migration
  for (const d of all) psql(urlOf(FULL), ["-f", join(MIG, d, "migration.sql")]);
  const diff = () => {
    mkdirSync(join(STUDIO, "var"), { recursive: true });
    const cfg = join(STUDIO, "var", `css1-${process.pid}.config.ts`);
    writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(FULL))} } });\n`);
    const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
    rmSync(cfg, { force: true });
    return { status: r.status, mine: `${r.stdout}`.split("\n").filter((l) => /case_party_index|pg_trgm/.test(l)), err: r.stderr };
  };
  const d1 = diff();
  ok("CS-S1 DW5 pass: migrate diff from the migrated database to the schema names nothing of this row (table, indexes, trigram index)", d1.status === 0 && d1.mine.length === 0, d1.mine.length ? d1.mine : d1.err);
  sql(FULL, "drop index case_party_index_name_norm_trgm_idx");
  const d2 = diff();
  ok("CS-S1 DW5 fail: with the trigram index dropped, migrate diff names it (the schema file declares it)", d2.status === 0 && d2.mine.some((l) => /case_party_index_name_norm_trgm_idx/.test(l) && /gin_trgm_ops/i.test(l)), d2.mine);
  sql(FULL, `create index case_party_index_name_norm_trgm_idx on case_party_index using gin (name_norm extensions.gin_trgm_ops)`);
  const defs = sql(FULL, `select string_agg(p.proname || ':' || p.prosecdef || ':' || pg_get_userbyid(p.proowner), ',' order by p.proname) from pg_proc p where p.proname like 'case_party_index_%'`);
  ok("CS-S1 DW5 pass: the trigger functions run as the caller (SECURITY INVOKER); only the firm lookup is a definer, owned by xr_wall_reader",
    defs.split(",").every((d) => d.startsWith("case_party_index_firm_of:") ? d === "case_party_index_firm_of:true:xr_wall_reader" : d.includes(":false:")) && defs.includes("case_party_index_firm_of:true:xr_wall_reader"), defs);

  const w = world(FULL);
  const A = newCase(FULL, w, "sample-firm"), B = newCase(FULL, w, "sample-solo");
  // ------------------------------------------------------------------------------------------------ DW1: one row per person
  const P = person(FULL, w, A, "principal", "Profile Name (Sample)");
  answer(FULL, w, P, "person.given_names", "Marie"); answer(FULL, w, P, "person.family_name", "Dupont");
  answer(FULL, w, P, "person.email", " Dupont@X.com "); answer(FULL, w, P, "person.phone_number", { country_code: "1", number: "416-555-0101" });
  const p1 = row(FULL, P.subject);
  ok("CS-S1 DW1 pass: name, email and phone answers make one index row; phone_e164 +14165550101 (Sample) from country code 1 and number 416-555-0101",
    sql(FULL, `select count(*) from case_party_index where subject_id = '${P.subject}'`) === "1" && p1?.phone_e164 === "+14165550101" && p1.email_norm === "dupont@x.com"
    && p1.name_norm === "marie dupont" && p1.display_name === "Marie Dupont" && p1.case_id === A && p1.party_id === P.party && p1.workspace_id === w.W, p1);
  const N = person(FULL, w, A, "spouse_or_partner", "Jean Dupont (Sample)");
  answer(FULL, w, N, "person.phone_number", { number: "416-555-0101" });
  ok("CS-S1 DW1 fail: a phone with no country code gives phone_e164 null (never guessed from the firm's country)", row(FULL, N.subject)?.phone_e164 === null, row(FULL, N.subject));
  answer(FULL, w, N, "person.phone_number", "416 555 0102"); answer(FULL, w, N, "person.phone_country_code", "+1");
  ok("CS-S1 DW1 pass: a number stored as text with its own country-code answer (person.phone_country_code) gives +14165550102", row(FULL, N.subject)?.phone_e164 === "+14165550102", row(FULL, N.subject));
  answer(FULL, w, N, "person.phone_number", { country_code: "1", number: "1-800-FLOWERS" });
  ok("CS-S1 DW1 fail: a number holding letters gives phone_e164 null (the parts are never parsed or guessed)", row(FULL, N.subject)?.phone_e164 === null, row(FULL, N.subject));
  answer(FULL, w, N, "person.email_address", "Jean@Example.com");
  ok("CS-S1 DW1 pass: person.email_address stands in when person.email is not answered (lower case)", row(FULL, N.subject)?.email_norm === "jean@example.com");
  // Breaker B1: an email of 1000 CJK characters (3000 bytes) once overflowed the btree on (firm_id, email_norm) and failed the save.
  const long = `${"王".repeat(1000)}@example.com`;
  ok("CS-S1 DW1 fail (breaker B1): an email over 254 characters is not indexed, and its answer save still succeeds",
    err(() => answer(FULL, w, N, "person.email_address", long)) === "" && row(FULL, N.subject)?.email_norm === null);
  answer(FULL, w, N, "person.phone_number", { country_code: "44", number: "+44 20 7946 0000" });
  ok("CS-S1 DW1 pass: a number written with its own +<code> in front is read whole (+442079460000)", row(FULL, N.subject)?.phone_e164 === "+442079460000", row(FULL, N.subject));
  answer(FULL, w, N, "person.phone_number", { country_code: "+001", number: "416-555-0101" });
  ok("CS-S1 DW1 fail (breaker m8): a country code starting 0 gives null, never +001…", row(FULL, N.subject)?.phone_e164 === null);
  const junk = [{ country_code: "1", number: "-4165550101" }, { country_code: "1", number: 4165550101.5 }, { country_code: "1", number: "(0)-0.0 0" }].map((v) => { answer(FULL, w, N, "person.phone_number", v); return row(FULL, N.subject)?.phone_e164 ?? null; });
  const pair = [{ country_code: "358", number: "40 12345678" }, { country_code: "358", number: "+358 40 12345678" }, { country_code: "1", number: "+1 0000000000" }].map((v) => { answer(FULL, w, N, "person.phone_number", v); return row(FULL, N.subject)?.phone_e164 ?? null; });
  ok("CS-S1 DW1 pass (Devin review): a number in national and in +<code> form gives the same phone (+3584012345678)", pair[0] === "+3584012345678" && pair[1] === pair[0], pair);
  ok("CS-S1 DW1 fail (Devin review): a +<code> number of only zeros gives null (the check reads the digits after the code)", pair[2] === null, pair);
  ok("CS-S1 DW1 fail (breaker round 2): a leading minus, a JSON number with a fraction and a number of only zeros each give null", junk.every((x) => x === null), junk);
  const U = person(FULL, w, A, "child", "Profile Fallback (Sample)");
  answer(FULL, w, U, "person.given_names", "Ñúñez\u00a0\u00a0Ölçer"); answer(FULL, w, U, "person.family_name", "Дмитрий");
  ok("CS-S1 DW1 pass (breaker m6, m7): a no-break space is collapsed and non-ASCII letters are lower-cased whatever the cluster's collation",
    row(FULL, U.subject)?.name_norm === "ñúñez ölçer дмитрий" && row(FULL, U.subject)?.display_name === "Ñúñez Ölçer Дмитрий", row(FULL, U.subject));
  answer(FULL, w, U, "person.given_names", "\t\u200b"); answer(FULL, w, U, "person.family_name", "\u3000");
  ok("CS-S1 DW1 fail (breaker m7): a name of only tabs, zero-width and ideographic spaces is no name: the profile's name stands in",
    row(FULL, U.subject)?.display_name === "Profile Fallback (Sample)", row(FULL, U.subject));

  // ------------------------------------------------------------------------------------------------ DW2: later answers
  const id0 = p1!.id, at0 = sql(FULL, `select updated_at from case_party_index where subject_id = '${P.subject}'`);
  answer(FULL, w, P, "person.family_name", "Durand");
  const p2 = row(FULL, P.subject);
  ok("CS-S1 DW2 pass: an answer edited later (a new version superseding the old) updates the row", p2?.name_norm === "marie durand" && p2.display_name === "Marie Durand", p2);
  ok("CS-S1 DW2 fail: the old value no longer matches (no row's name holds dupont for that subject; the old version is kept in the answers)",
    sql(FULL, `select count(*) from case_party_index where subject_id = '${P.subject}' and name_norm like '%dupont%'`) === "0"
    && sql(FULL, `select count(*) from client_canonical_answer where subject_id = '${P.subject}' and canonical_field_key = 'person.family_name'`) === "2");
  const at1 = sql(FULL, `select updated_at from case_party_index where subject_id = '${P.subject}'`);
  answer(FULL, w, P, "person.date_of_birth", "1990-01-01");
  ok("CS-S1 DW2 fail: an unlisted key (person.date_of_birth) changes nothing (the row is not even touched: updated_at kept)",
    sql(FULL, `select updated_at from case_party_index where subject_id = '${P.subject}'`) === at1 && at1 !== at0);
  ok("CS-S1 DW2 fail: an answer written inside a rolled-back transaction leaves the row as it was",
    /css1 rollback/.test(err(() => answer(FULL, w, P, "person.family_name", "Rollback", "do $$ begin raise exception 'css1 rollback'; end $$;"))) && row(FULL, P.subject)?.name_norm === "marie durand");

  // ------------------------------------------------------------------------------------------------ DW3: the firm
  const S = person(FULL, w, B, "principal", "Solo Client (Sample)");
  ok("CS-S1 DW3 pass: the row's firm_id equals the case's firm (platform_firm by firm_key)", p2?.firm_id === sql(FULL, `select f.id from runtime_case c join platform_firm f on f.key = c.firm_key where c.id = '${A}'`));
  ok("CS-S1 DW3 pass: a case of the Sample solo firm gets the solo firm's id", row(FULL, S.subject)?.firm_id === w.firm["sample-solo"] && w.firm["sample-solo"] !== w.firm["sample-firm"]);
  // CS-W1 part 2 (20261126160000) makes a case's firm required: a case whose firm has no platform_firm row can no longer
  // exist, so the earlier check (such a case's answer write succeeds with no index row) is now the database's refusal of it.
  ok("CS-S1 DW3 fail: a case whose firm has no platform_firm row is refused (CS-W1 part 2), so no row can lack its firm",
    /null value in column "firm_id" of relation "runtime_case"/.test(err(() => newCase(FULL, w, "not-registered"))));
  // As the API writes (PF-12: xr_app, no firm set): the definer lookup sees the case's firm past the wall on platform_firm.
  const appId = randomUUID();
  const asApp = err(() => sql(FULL, `begin; update client_canonical_answer set superseded_by_id = '${appId}' where subject_id = '${S.subject}' and canonical_field_key = 'person.given_names' and superseded_by_id is null;
    insert into client_canonical_answer (id, workspace_id, party_id, subject_id, canonical_field_id, canonical_field_key, value_json, status, source_json)
    values ('${appId}', '${w.W}', '${S.party}', '${S.subject}', '${w.field["person.given_names"]}', 'person.given_names', '"Solene"', 'DECLARED', '{}'); commit;`, "xr_app"));
  ok("CS-S1 DW3 pass: as the app's role (xr_app, no firm set, platform_firm walled) an answer write keeps the row with its firm",
    asApp === "" && row(FULL, S.subject)?.name_norm === "solene" && row(FULL, S.subject)?.firm_id === w.firm["sample-solo"], asApp || row(FULL, S.subject));
  ok("CS-S1 DW3 fail: xr_app still reads no platform_firm row itself (the lookup is the one narrow door)", sql(FULL, "select count(*) from platform_firm", "xr_app") === "0");

  // ------------------------------------- DW2 (review M1, breaker M2-M5): two writers at once, as the API writes (xr_app)
  {
    const c1 = new pg.Client({ connectionString: urlOf(FULL, "xr_app") }), c2 = new pg.Client({ connectionString: urlOf(FULL, "xr_app") });
    await c1.connect(); await c2.connect();
    const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));
    /** c1 opens a transaction, writes, and makes its refresh run now (holding the subject's lock); c2 writes and commits
     *  meanwhile. Returns whether c2 was still waiting while c1 was open. */
    const race = async (first: string, second: string) => {
      await c1.query("begin"); await c1.query(first); await c1.query("set constraints all immediate");
      let done = false;
      const p2 = c2.query(`begin; ${second} commit;`).then(() => { done = true; });
      await nap(400); const waited = !done;
      await c1.query("commit"); await p2;
      return waited;
    };
    try {
      const G = person(FULL, w, A, "spouse_or_partner", "Ghost Before (Sample)");
      const wG = await race(`delete from case_participant where subject_id = '${G.subject}'`, answerSql(w, G, "person.given_names", "Ghost"));
      ok("CS-S1 DW2 pass (race): a name written while the participant is removed leaves no row (the person is off the case)",
        row(FULL, G.subject) === null && sql(FULL, `select count(*) from case_participant where subject_id = '${G.subject}'`) === "0", row(FULL, G.subject));
      ok("CS-S1 DW2 fail (race): the second writer waited for the first (one refresh of a subject at a time)", wG);
      const M = person(FULL, w, A, "child", "Mover (Sample)"); answer(FULL, w, M, "person.given_names", "Mover");
      const m0 = row(FULL, M.subject);
      const wM = await race(`update case_participant set case_id = '${B}', "order" = 98 where subject_id = '${M.subject}'`, answerSql(w, M, "person.email", "mover@example.com"));
      const m1 = row(FULL, M.subject);
      ok("CS-S1 DW2 pass (race): a participant moved to another firm's case while its email is written is indexed on the new case, firm and email, same id",
        m1?.case_id === B && m1.firm_id === w.firm["sample-solo"] && m1.email_norm === "mover@example.com" && m1.id === m0?.id, { m0, m1 });
      ok("CS-S1 DW2 fail (race): no row is left on the old firm", wM && sql(FULL, `select count(*) from case_party_index where subject_id = '${M.subject}' and firm_id = '${w.firm["sample-firm"]}'`) === "0");
      // Two keys in one transaction against one key in another (breaker M5: a deadlock before the refresh was deferred).
      const D = person(FULL, w, A, "child", "Two Keys (Sample)");
      await c1.query("begin"); await c1.query(answerSql(w, D, "person.family_name", "Fone"));
      let d2 = false; const q2 = c2.query(`begin; ${answerSql(w, D, "person.given_names", "Gtwo")} commit;`).then(() => { d2 = true; });
      await nap(400); const notBlocked = d2;
      const q1 = c1.query(answerSql(w, D, "person.given_names", "Gone")).then(() => c1.query("commit"));
      const res = await Promise.allSettled([q1, q2]);
      ok("CS-S1 DW2 pass (breaker M5): a transaction writing two keys and another writing one key both commit (no deadlock)", res.every((r) => r.status === "fulfilled"), res.map((r) => r.status === "rejected" ? String(r.reason) : "ok"));
      ok("CS-S1 DW2 fail (breaker M2): the row holds both writers' committed answers (no lost update), and the one-key writer was never blocked by the open one",
        notBlocked && row(FULL, D.subject)?.name_norm === "gone fone", row(FULL, D.subject));
    } finally { await c1.end().catch(() => undefined); await c2.end().catch(() => undefined); }
  }

  // Breaker round 2: one lock per subject ran out of shared lock memory past ~15 000 people in one transaction.
  const locks = (lock: boolean) => sql(FULL, `begin; select count(case_party_index_refresh(gen_random_uuid(), ${lock})) from generate_series(1, 2000);
    select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid(); commit;`).split("\n").at(-1);
  const lk = locks(true), lk0 = locks(false);
  ok(`CS-S1 DW4 pass (breaker round 2): one transaction refreshing 2000 subjects holds at most 256 advisory locks (${lk})`, Number(lk) > 0 && Number(lk) <= 256, lk);
  ok(`CS-S1 DW4 fail (breaker round 2): the backfill's path (no lock) takes none (${lk0})`, lk0 === "0", lk0);

  // ------------------------------------------------------------------------------------------------ DW4: sites, relatives, ids
  // The "answer-write sites unchanged" assertion (git diff of api/src against origin/main is empty) was CS-S1's own PR
  // proof; after its merge it failed every later PR that changes any api/src file (#2003, #2029, 17 Nov), so it is dropped
  // (tech lead, P-214 check fix); every other DW4 case below is unchanged.
  const before4 = sql(FULL, "select count(*) from case_party_index");
  const R = person(FULL, w, null, null, "Profile Name (Sample)", P.party);
  answer(FULL, w, R, "person.given_names", "Parent"); answer(FULL, w, R, "person.family_name", "Dupont");
  ok("CS-S1 DW4 fail: a relative's subject (the relatives route's shape: no participant row) gets no row", row(FULL, R.subject) === null && sql(FULL, "select count(*) from case_party_index") === before4);
  ok("CS-S1 DW4 pass: a refresh keeps the row's id (after four later answers, the same id)", row(FULL, P.subject)?.id === id0);
  const E = person(FULL, w, A, "case", "Case A (Sample)");
  ok("CS-S1 DW4 fail: a \"case\" participant with no organisation name has no row", row(FULL, E.subject) === null);
  answer(FULL, w, E, "organisation.name", "Northern Sample Inc. (Sample)");
  const e1 = row(FULL, E.subject);
  ok("CS-S1 DW4 pass: once it has an organisation name it is indexed as EMPLOYER (no email or phone)", e1?.kind === "EMPLOYER" && e1.role_on_case === "EMPLOYER" && e1.name_norm === "northern sample inc. (sample)" && e1.email_norm === null, e1);
  answer(FULL, w, E, "organisation.employer_name", "Sample Employer Ltd (Sample)");
  ok("CS-S1 DW4 pass: organisation.employer_name comes before organisation.name; the id is kept", row(FULL, E.subject)?.display_name === "Sample Employer Ltd (Sample)" && row(FULL, E.subject)?.id === e1?.id);
  sql(FULL, `update party_profile set display_name = 'Jean-Paul Dupont (Sample)' where party_id = '${N.party}'`);
  ok("CS-S1 DW4 pass: a profile name change reaches a person with no name answers (party_profile trigger)", row(FULL, N.subject)?.display_name === "Jean-Paul Dupont (Sample)");
  const C = person(FULL, w, A, "child", "Lea Dupont (Sample)"), c1 = row(FULL, C.subject);
  sql(FULL, `update case_participant set case_id = '${B}', "order" = 99 where subject_id = '${C.subject}'`);
  const c2 = row(FULL, C.subject);
  ok("CS-S1 DW4 pass: a participant moved to another case moves its row (new case and firm, same id)", c2?.case_id === B && c2.firm_id === w.firm["sample-solo"] && c2.id === c1?.id, { c1, c2 });
  sql(FULL, `delete from case_participant where subject_id = '${C.subject}'`);
  ok("CS-S1 DW4 fail: a removed participant's row goes with it", row(FULL, C.subject) === null);
  const pa = row(FULL, P.subject);
  sql(FULL, `delete from runtime_case where id = '${A}'`);
  ok("CS-S1 DW4 fail: a deleted case (as the demo reset deletes cases) leaves none of its rows", pa !== null && sql(FULL, `select count(*) from case_party_index where case_id = '${A}'`) === "0");
} finally {
  for (const db of [BARE, FULL]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db], { stdio: "ignore" }); } catch { /* left for prune-test-dbs.sh */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
