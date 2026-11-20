// CS-K1 part 1 (map row 72; brief design/build-lead-c-briefs/CS-K1.md; contract v0.1 §5, P-588 (2), AG-7-75 §7): the
// client record (case_client) and a client on every case. Named cases CS-K1 DW1-DW8 and DW8a, each a pass and a fail,
// and the case.closed / case.reopened events carrying the case's client (Build Lead C's ruling (1)). Part 2 (brief
// CS-K1-2.md, Build Lead C (4)'s answers of 20 Nov): DW9-DW13, every client linked to its front-office party through
// FoPersonPort (the opening, the one-time job case-clients/client-link.ts) and the NOT VALID link check.
//   1. a scratch database: every migration before 20261118230000_csk1_case_client, then cases in the old shape (many cases
//      of one firm, a CORPORATE and a family case, a principal with no profile, a case with no principal, a key with no
//      platform firm); then the migration and every later one: DW1, DW4 (backfill), DW6, DW8, DW8a, the fill triggers,
//      and the events (CS-C1a's CaseClose on fixture cases). A second scratch database forces a case left without a
//      client: the migration stops in words before NOT NULL (DW1 fail).
//   2. the isolated copy (the configured checkpoint): an in-process app on the copy's database with the opening route
//      (x-actor, as today), PF-4's sign-in and guard, and this row's read routes: DW2, DW3, DW4, DW5, DW7.
// No browser, no model call (US$0).
//   zsh studio/tools/isolated.sh csk1_client 4641 start && tsx studio/tests/check_csk1_client.ts 4641 xr_studio_csk1_client
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const PORT = Number(process.argv[2] ?? 4641), COPY = process.argv[3] ?? "xr_studio_csk1_client";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261118230000_csk1_case_client";
// core.ts reads the address once, when first imported: the app part's copy (the scratch part passes its own client).
process.env.DATABASE_URL = `postgresql://xr_studio@127.0.0.1:54329/${COPY}`;
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csk1_mig_${process.pid}`, FORCED = `xr_studio_csk1_forced_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psql = (db: string, args: string[], user?: string) => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sqlOn = (db: string, q: string, user?: string) => psql(db, ["-Atc", q], user);
const sql = (q: string, user?: string) => sqlOn(DB, q, user);
const err = (q: string, db = DB) => { try { sqlOn(db, q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [W, F1, F2] = [u(1), u(3), u(4)];
const [IND, CORP, FAM] = [u(21), u(22), u(23)];   // combinations under an INDIVIDUAL, a CORPORATE and a family (none) Pathway
const MANY = 240;

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
const before = all.filter((d) => d < NEW), after = all.filter((d) => d > NEW);
for (const d of [DB, FORCED]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }

/** The old shape: a case with (optionally) a principal whose party has (optionally) a profile. */
const oldCase = (db: string, o: { id: string; key: string; cmb: string; no: number; at: string; principal?: "profile" | "label" | "none"; name?: string }) => {
  const party = randomUUID(), subj = randomUUID(), cs = randomUUID();
  return `insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number, created_at) values ('${o.id}', '${W}', '${o.cmb}', 'user-P', 'user-O', '${o.key}', 'C-2026-${String(o.no).padStart(5, "0")}', '${o.at}');
    ${o.principal === "none" ? "" : `insert into party (id, workspace_id) values ('${party}', '${W}');
    insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${cs}', '${W}', '${party}', 'case', 'The application'), ('${subj}', '${W}', '${party}', 'principal', '${o.principal === "label" ? o.name : "Sample label"}');
    insert into case_participant (id, workspace_id, case_id, subject_id, role, "order") values (gen_random_uuid(), '${W}', '${o.id}', '${cs}', 'case', 0), (gen_random_uuid(), '${W}', '${o.id}', '${subj}', 'principal', 1);
    ${o.principal === "label" ? "" : `insert into party_profile (id, workspace_id, party_id, display_name) values (gen_random_uuid(), '${W}', '${party}', '${o.name}');`}`}`;
};
const fixtures = (db: string) => sqlOn(db, `set session_replication_role = replica;
  insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F1}', 'sample-firm', 'Sample Firm', 'CA', 'a@sample-firm.example.com', now()), ('${F2}', 'sample-solo', 'Sample Solo', 'CA', 'a@sample-solo.example.com', now());
  insert into workspace (id, key, label) values ('${W}', 'csk1-${process.pid}', 'CS-K1 check');
  insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by) values
    ('${u(31)}', '${W}', 'ind-pw', 'PATHWAY', 'Sample individual', 'INDIVIDUAL', 'seed'), ('${u(32)}', '${W}', 'ind-pr', 'PROGRAM', 'Sample program', null, 'seed'),
    ('${u(33)}', '${W}', 'corp-pw', 'PATHWAY', 'Sample corporate', 'CORPORATE', 'seed'), ('${u(34)}', '${W}', 'corp-pr', 'PROGRAM', 'Sample program', null, 'seed'),
    ('${u(35)}', '${W}', 'fam-pw', 'PATHWAY', 'Sample family', null, 'seed');
  update program_def set parent_node_key = 'ind-pw' where id = '${u(32)}'; update program_def set parent_node_key = 'corp-pw' where id = '${u(34)}';
  insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values
    ('${IND}', '${W}', '${u(32)}', 'csk1.ind', 'Sample', '[]', 'seed'), ('${CORP}', '${W}', '${u(34)}', 'csk1.corp', 'Sample', '[]', 'seed'), ('${FAM}', '${W}', '${u(35)}', 'csk1.fam', 'Sample', '[]', 'seed');
  ${oldCase(db, { id: u(101), key: "sample-firm", cmb: IND, no: 1, at: "2026-01-01T10:00:00Z", name: "Sample Client One" })}
  ${oldCase(db, { id: u(102), key: "sample-firm", cmb: CORP, no: 2, at: "2026-01-02T10:00:00Z", name: "Sample Company Ltd" })}
  ${oldCase(db, { id: u(103), key: "sample-solo", cmb: FAM, no: 1, at: "2026-01-03T10:00:00Z", principal: "label", name: "Sample Label Three" })}
  ${oldCase(db, { id: u(104), key: "ghost-firm", cmb: IND, no: 1, at: "2026-01-04T10:00:00Z", principal: "none" })}
  ${oldCase(db, { id: u(105), key: "sample-firm", cmb: IND, no: 3, at: "2026-01-05T10:00:00Z", name: "  Sample\tSpaced  " })}
  insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number, created_at)
    select gen_random_uuid(), '${W}', '${IND}', 'user-P', 'user-O', 'sample-firm', 'C-2027-' || lpad(g::text, 5, '0'), '2026-02-01T00:00:00Z'::timestamptz + g * interval '1 minute' from generate_series(1, ${MANY}) g;
  set session_replication_role = origin; select case_firm_backfill();`);

let app: { close(): Promise<void> } | null = null;
try {
  // ------------------------------------------------------------------------------------------------ 1. the migration
  ok(`CS-K1 DW8 pass: the migration has its own stamp, later than every one before it (newest before it: ${before.at(-1)}; rows rev 16.7, P-600 (4))`,
    all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  for (const d of before) { psql(DB, ["-f", join(MIG, d, "migration.sql")]); psql(FORCED, ["-f", join(MIG, d, "migration.sql")]); }
  fixtures(DB); fixtures(FORCED);
  const procs = () => sql(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace = 'public'::regnamespace`).split(",");
  const had = new Set(procs());
  psql(DB, ["-f", join(MIG, NEW, "migration.sql")]);
  const added = procs().filter((p) => !had.has(p));
  for (const d of after) psql(DB, ["-f", join(MIG, d, "migration.sql")]);
  const text = readFileSync(join(MIG, NEW, "migration.sql"), "utf8");

  // DW1: every existing case has a client
  const cases = Number(sql(`select count(*) from runtime_case`));
  ok(`CS-K1 DW1 pass: after the migration every case (${cases}, of three firm keys) has a client of its own, one per case (people stay per case)`,
    cases === MANY + 5 && sql(`select count(*) from runtime_case where client_id is null`) === "0" && Number(sql(`select count(distinct client_id) from runtime_case`)) === cases && Number(sql(`select count(*) from case_client`)) === cases);
  ok("CS-K1 DW1 pass: client_id is NOT NULL now", sql(`select is_nullable from information_schema.columns where table_name = 'runtime_case' and column_name = 'client_id'`) === "NO");
  const nameOf = (c: string) => sql(`select k.display_name || '|' || k.client_number || '|' || k.display_kind || '|' || k.firm_key from case_client k join runtime_case c on c.client_id = k.id where c.id = '${c}'`);
  ok("CS-K1 DW1 pass: named after the principal's display name (profile), in opening order per firm with no gap",
    nameOf(u(101)) === "Sample Client One|1|PERSON|sample-firm" && nameOf(u(102)).startsWith("Sample Company Ltd|2|") && nameOf(u(105)) === "Sample Spaced|3|PERSON|sample-firm"
    && sql(`select (max(client_number) = count(*) and min(client_number) = 1)::text from case_client where firm_key = 'sample-firm'`) === "true", [nameOf(u(101)), nameOf(u(105))]);
  ok("CS-K1 DW1 fail (breaker): a principal with no profile is named by its label; a case with no principal by its case number (never empty, never another case's)",
    nameOf(u(103)) === "Sample Label Three|1|PERSON|sample-solo" && nameOf(u(104)) === "Client of C-2026-00001|1|PERSON|ghost-firm", [nameOf(u(103)), nameOf(u(104))]);
  ok("CS-K1 DW1: the counters stand after the numbers given (the next client of sample-firm is the next number)",
    sql(`select string_agg(firm_key || ':' || next_value, ',' order by firm_key) from case_client_counter`) === `ghost-firm:2,sample-firm:${MANY + 4},sample-solo:2`);
  // DW1 fail: the forced fixture (a case the backfill skips, as a dump restored half-way would leave it)
  const skipped = text.replace("WHERE client_id IS NULL ORDER BY workspace_id", `WHERE client_id IS NULL AND id <> '${u(101)}' ORDER BY workspace_id`);
  writeFileSync(join(STUDIO, "var", `csk1-forced-${process.pid}.sql`), skipped);
  const e1 = (() => { try { psql(FORCED, ["-1", "-f", join(STUDIO, "var", `csk1-forced-${process.pid}.sql`)]); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } })();
  rmSync(join(STUDIO, "var", `csk1-forced-${process.pid}.sql`), { force: true });
  ok("CS-K1 DW1 fail: with one case left without a client, the migration stops in words before NOT NULL, and nothing is changed (one transaction)",
    skipped !== text && /csk1_case_client: 1 case\(s\) have no client after the backfill/.test(e1)
    && sqlOn(FORCED, `select count(*) from information_schema.tables where table_name = 'case_client'`) === "0", e1.split("\n")[0]);

  // DW4: the kind from the Pathway
  ok("CS-K1 DW4 pass (backfill): a case on a CORPORATE pathway gets a COMPANY client", nameOf(u(102)).split("|")[2] === "COMPANY");
  ok("CS-K1 DW4 fail (backfill): a family case (no client type) and an INDIVIDUAL case get PERSON clients, never COMPANY",
    nameOf(u(103)).split("|")[2] === "PERSON" && nameOf(u(101)).split("|")[2] === "PERSON" && sql(`select count(*) from case_client where display_kind = 'COMPANY'`) === "1");

  // DW6: the database's rules on a client row (each insert rolled back)
  const client = (o: { key?: string; person?: string; company?: string; prospect?: string; name?: string; n: number }) => `insert into case_client (id, workspace_id, firm_key, client_number, display_name, display_kind, fo_person_id, fo_company_id, prospect_id, created_by)
    values (gen_random_uuid(), '${W}', '${o.key ?? "sample-firm"}', ${o.n}, ${o.name ?? "'Sample Client X'"}, '${o.company && !o.person ? "COMPANY" : "PERSON"}', ${o.person ? `'${o.person}'` : o.company ? "null" : "gen_random_uuid()"}, ${o.company ? `'${o.company}'` : "null"}, ${o.prospect ? `'${o.prospect}'` : "null"}, 'user-O')`;
  const rolled = (q: string) => err(`begin; ${q}; rollback;`);
  ok("CS-K1 DW6 pass: one front-office id (a person, or a company) is kept", rolled(client({ n: 9001, person: u(501) })) === "" && rolled(client({ n: 9002, company: u(502) })) === "");
  ok("CS-K1 DW6 fail: both front-office ids set → refused by the database", /case_client_one_front_office_check/.test(rolled(client({ n: 9003, person: u(501), company: u(502) }))));
  ok("CS-K1 DW6 fail: the same prospect_id twice in one firm → refused", /case_client_workspace_id_firm_key_prospect_id_key/.test(rolled(`${client({ n: 9004, prospect: u(503) })}; ${client({ n: 9005, prospect: u(503) })}`)));
  ok("CS-K1 DW6 pass: the same prospect_id in two firms → allowed", rolled(`${client({ n: 9006, prospect: u(503) })}; ${client({ key: "sample-solo", n: 9006, prospect: u(503) })}`) === "");
  ok("CS-K1 DW6 fail: an empty, padded, too long, control- or invisible-character or spaces-only name (breaker 2a), a kind outside PERSON | COMPANY, a number twice in one firm → refused",
    ["''", "' Sample'", `'${"x".repeat(201)}'`, "'Sample' || chr(10) || 'Two'", "chr(160)", "'Sample' || chr(8203)", "'Sample' || chr(8238) || 'Two'", "chr(12288)"].every((nm) => /case_client_display_name_check/.test(rolled(client({ n: 9007, name: nm }))))
    && /case_client_display_kind_check/.test(rolled(client({ n: 9008 }).replace("'PERSON'", "'GROUP'")))
    && /case_client_workspace_id_firm_key_client_number_key/.test(rolled(client({ n: 1 }))));
  ok("CS-K1 DW6: no foreign key from case_client into the front office's tables (contract §1 rule 4)",
    sql(`select count(*) from pg_constraint where conrelid = 'case_client'::regclass and contype = 'f'`) === "0");

  // DW8: names, the diff
  ok("CS-K1 DW8 pass: every function the migration adds is named case_client_*", added.length === 5 && added.every((p) => p.startsWith("case_client_")) && !/CREATE (OR REPLACE )?FUNCTION (?!case_client_)/.test(text), added);
  ok("CS-K1 DW8 fail: no function of the migration runs as definer (part 2's one, case_client_validate_link_check, must: VALIDATE needs the owner), and its text says how to roll back",
    sql(`select string_agg(proname, ',') from pg_proc where proname like 'case_client%' and prosecdef`) === "case_client_validate_link_check" && /Rollback \(in this order\)/.test(text));
  {
    mkdirSync(join(STUDIO, "var"), { recursive: true });
    const cfg = join(STUDIO, "var", `csk1-${process.pid}.config.ts`);
    writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(DB))} } });\n`);
    const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
    rmSync(cfg, { force: true });
    ok("CS-K1 DW8 pass: migrate diff from the migrated database to the schema is empty", r.status === 0, `${r.stdout}${r.stderr}`.slice(-600));
  }
  ok("CS-K1 DW8 fail: the migration does not apply twice", (() => { try { psql(DB, ["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());

  // DW8a: the client's firm is its case's firm
  ok("CS-K1 DW8a pass: every client's firm_id equals its case's firm_id (CS-W1's column), and its firm key the case's",
    sql(`select count(*) from runtime_case c join case_client k on k.id = c.client_id where k.firm_id is distinct from c.firm_id or k.firm_key <> c.firm_key or k.workspace_id <> c.workspace_id`) === "0"
    && sql(`select k.firm_id::text from case_client k join runtime_case c on c.client_id = k.id where c.id = '${u(101)}'`) === F1);
  const soloClient = sql(`select client_id from runtime_case where id = '${u(103)}'`), firmClient = sql(`select client_id from runtime_case where id = '${u(101)}'`);
  ok("CS-K1 DW8a fail: a case pointed at another firm's client is refused by the foreign key",
    /runtime_case_client_id_(workspace_id_firm_key|firm_id)_fkey/.test(rolled(`update runtime_case set client_id = '${soloClient}' where id = '${u(101)}'`)));
  ok("CS-K1 DW8a fail: a forced mismatch, the client's firm_id set to the other firm, is refused by the foreign key",
    /runtime_case_client_id_firm_id_fkey/.test(rolled(`update case_client set firm_id = '${F2}', fo_person_id = gen_random_uuid() where id = '${firmClient}'`)));
  ok("CS-K1 DW8a fail: a client row whose firm_id is not its key's platform firm is refused (case_client_firm_from_key, by CS-W1's lookup)",
    /case_client_firm_from_key: the firm id given is not the platform firm of key "sample-firm"/.test(rolled(client({ n: 9009 }).replace("prospect_id, created_by)", "prospect_id, created_by, firm_id)").replace("'user-O')", `'user-O', '${F2}')`))));
  // The key with no platform firm: CS-W1's backfill later fills the case; its client follows (case_client_follow_firm).
  const ghost = () => sql(`select coalesce(c.firm_id::text, 'null') || '|' || coalesce(k.firm_id::text, 'null') from runtime_case c join case_client k on k.id = c.client_id where c.id = '${u(104)}'`);
  const g0 = ghost();
  sql(`set session_replication_role = replica; insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${u(8)}', 'ghost-firm', 'Ghost', 'CA', 'a@ghost.example.com', now())`);
  const filled = sql(`select case_firm_backfill()`);
  ok("CS-K1 DW8a pass: a case whose firm id is filled later (CS-W1's backfill, after the Sample seed) takes its client with it to the same firm",
    g0 === "null|null" && ghost() === `${u(8)}|${u(8)}` && Number(filled) >= 1, [g0, ghost(), filled]);

  // The fill trigger: a case written straight to the table gets a client of its own firm (also with the replica role)
  const direct = (id: string, key: string, extra = "") => `insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number${extra ? ", client_id" : ""}) values ('${id}', '${W}', '${CORP}', 'user-P', 'user-O', '${key}', 'C-2028-0${id.slice(-4)}'${extra}); select k.display_name || '|' || k.display_kind || '|' || k.firm_key || '|' || coalesce(k.firm_id::text, 'null') from case_client k join runtime_case c on c.client_id = k.id where c.id = '${id}'`;
  ok("CS-K1 pass: a case written straight to the table gets a new client of its own firm and kind, named after the case",
    sql(`begin; ${direct(u(601), "sample-solo")}; rollback;`) === `Client of C-2028-00601|COMPANY|sample-solo|${F2}`);
  ok("CS-K1 pass: so does one written with the replica role (a fixture or a restore): the trigger is ENABLE ALWAYS",
    sql(`begin; set local session_replication_role = replica; ${direct(u(602), "sample-firm")}; rollback;`).startsWith("Client of C-2028-00602|COMPANY|sample-firm|"));
  ok("CS-K1 pass: a case written with a client of its firm keeps it", sql(`begin; ${direct(u(603), "sample-firm", `, '${firmClient}'`)}; rollback;`).startsWith("Sample Client One|"));
  ok("CS-K1 fail: a case written with another firm's client is refused", /runtime_case_client_id_(workspace_id_firm_key|firm_id)_fkey/.test(rolled(direct(u(604), "sample-firm", `, '${soloClient}'`))));

  // CS-K1 part 2 DW13: the link check, NOT VALID (ruling 3): it refuses every new or changed row; old ones wait for the job.
  const bare = (kind: string, ids: string, key = "sample-firm") => `insert into case_client (id, workspace_id, firm_key, client_number, display_name, display_kind, fo_person_id, fo_company_id, created_by) values (gen_random_uuid(), '${W}', '${key}', 9100, 'Sample Bare', '${kind}', ${ids}, 'user-O')`;
  ok("CS-K1 DW13 fail: once in place, the check refuses a PERSON client of a platform firm with no fo_person_id (none, or a company's only), and a COMPANY client with no fo_company_id",
    [bare("PERSON", "null, null"), bare("PERSON", `null, '${u(502)}'`), bare("COMPANY", `'${u(501)}', null`)].every((q) => /case_client_front_office_link_check/.test(rolled(q))));
  ok("CS-K1 DW13 fail (review M1, breaker F3): a direct write cannot mark a client as waiting: an unlinked client inserted with fo_link_pending, and a linked one unlinked while setting it, are refused (only the database's two triggers set it)",
    /case_client_pending_guard/.test(rolled(bare("PERSON", "null, null").replace("display_kind, fo_person_id", "display_kind, fo_link_pending, fo_person_id").replace("'PERSON', null, null", "'PERSON', true, null, null")))
    && /case_client_pending_guard/.test(rolled(`${bare("PERSON", `'${u(501)}', null`)}; update case_client set fo_person_id = null, fo_link_pending = true where client_number = 9100 and firm_key = 'sample-firm'`))
    && /case_client_front_office_link_check/.test(rolled(`${bare("PERSON", `'${u(501)}', null`)}; update case_client set fo_person_id = null where client_number = 9100 and firm_key = 'sample-firm'`)));
  ok("CS-K1 DW13 pass: a client linked by its kind is kept, and so is one of a key with no platform firm yet (no front office to link to)",
    rolled(bare("PERSON", `'${u(501)}', null`)) === "" && rolled(bare("COMPANY", `null, '${u(502)}'`)) === "" && rolled(bare("PERSON", "null, null", "no-firm-yet")) === "");
  ok("CS-K1 DW13 pass: a case written straight to the table gets a pending client, and the client CS-W1's backfill moved into a firm is pending (the job links both); the check stays not validated while one waits",
    sql(`begin; ${direct(u(605), "sample-firm")}; select fo_link_pending from case_client k join runtime_case c on c.client_id = k.id where c.id = '${u(605)}'; rollback;`).endsWith("t")
    && sql(`select k.fo_link_pending from case_client k join runtime_case c on c.client_id = k.id where c.id = '${u(104)}'`) === "t"
    && sql(`select case_client_validate_link_check()`) === "f" && sql(`select convalidated from pg_constraint where conname = 'case_client_front_office_link_check'`) === "f");

  // The events (Build Lead C's ruling (1)): case.closed and case.reopened carry the case's client, through CaseClose.
  {
    const { CaseClose } = await import("../api/src/case-close.ts");
    const { EVENT } = await import("../ports/events.ts");
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
    try {
      const svc = new CaseClose(db as never), ctx = { staffId: "csk1-manager", firmId: F1, firmKey: "sample-firm", roles: [], keys: [], duties: [], authTime: 0, via: "local" } as never;
      const stage = (c: string) => `insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) values (gen_random_uuid(), '${W}', '${c}', 'sample-firm', 1, 'only', 'Application', 'Application', '${IND}', 'CURRENT', gen_random_uuid(), 'BEGIN')`;
      const [kw, kc, f] = [u(701), u(702), u(703)];
      sql(`set session_replication_role = replica; ${oldCase(DB, { id: kw, key: "sample-firm", cmb: IND, no: 701, at: "2026-03-01T00:00:00Z", name: "Sample Withdraw" })} ${stage(kw)}; ${oldCase(DB, { id: kc, key: "sample-firm", cmb: IND, no: 702, at: "2026-03-02T00:00:00Z", name: "Sample Close" })} ${stage(kc)};
        insert into submission_group (id, workspace_id, case_id, kind, stage_id) select '${u(704)}', '${W}', '${kc}', 'FAMILY', id from case_stage where case_id = '${kc}';
        insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) select '${f}', '${W}', '${kc}', '${u(704)}', gen_random_uuid(), 'csk1.ind', 'files_own', id from case_stage where case_id = '${kc}';
        insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts) values (gen_random_uuid(), '${W}', '${kc}', '${f}', '${u(704)}', 'SAMPLE-REF', current_date, 'V300012345', 'user-O', 'user-O', '[]');
        insert into case_decision (id, firm_id, case_id, filing_id, kind, outcome, decided_on, recorded_by) values (gen_random_uuid(), '${F1}', '${kc}', '${f}', 'DECISION', 'APPROVED', current_date, 'staff:csk1-manager')`);
      const cl = (c: string) => sql(`select client_id from runtime_case where id = '${c}'`);
      const ev = (c: string, type: string) => sql(`select coalesce(string_agg(payload->>'clientId', ',' order by occurred_at), '') from module_event where subject_id = '${c}' and type = '${type}'`);
      await svc.withdraw(ctx, kw, { reason: "Sample reason", withdrawnOn: "2026-03-03" });
      await svc.close(ctx, kc, { reason: "Sample reason" });
      await svc.reopen(ctx, kc, { reason: "Sample reason" });
      ok("CS-K1 pass (ruling 1): case.closed carries the case's client id, on a withdrawal and on a staff close", !!cl(kw) && ev(kw, EVENT.CASE_CLOSED) === cl(kw) && ev(kc, EVENT.CASE_CLOSED) === cl(kc), [ev(kw, EVENT.CASE_CLOSED), cl(kw)]);
      ok("CS-K1 pass (ruling 1): case.reopened carries the case's client id", ev(kc, EVENT.CASE_REOPENED) === cl(kc));
      ok("CS-K1 fail (ruling 1): no closed or reopened event of this check carries null or another case's client",
        sql(`select count(*) from module_event e join runtime_case c on c.id::text = e.subject_id where e.type in ('${EVENT.CASE_CLOSED}', '${EVENT.CASE_REOPENED}') and (e.payload->>'clientId') is distinct from c.client_id::text`) === "0" && cl(kw) !== cl(kc));
    } finally { await db.$disconnect(); }
  }
} finally {
  for (const d of [DB, FORCED]) execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]);
}

// ------------------------------------------------------------------------------------------------ 2. the copy, through the API
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
const copySql = (q: string) => sqlOn(COPY, q);
type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely, as in the other checks
const call = async (base: string, method: string, path: string, o: { token?: string; actor?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.actor) headers["x-actor"] = o.actor;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const t = await r.text(); let j: unknown = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j };
};
const copyBase = `http://127.0.0.1:${PORT}`;
const comboId = (key: string) => copySql(`select c.id from combination c where c.combination_key = '${key}' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!comboId("vv.single")) { const l = await call(copyBase, "POST", "/api/demo/load", { actor: "user-A", body: { sample: "configured" } }); if (l.status >= 300) { console.error("STOP  the configured checkpoint did not load", l.status); process.exit(2); } }
const VV = comboId("vv.single")!;

const { ConfigReadGuard, Db, Workspace, Audit } = await import("../api/src/core.ts");
const { Programs } = await import("../api/src/programs.ts");
const { Runtime, RuntimeController } = await import("../api/src/runtime.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PgEntitlements } = await import("../api/src/platform/entitlements/limits.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const feature = (await import("../api/src/features/clients.ts")).default;
const { FO_PERSON_PORT } = await import("../ports/fo-person.ts");
const { foPersonPort } = await import("../api/src/front-office/people/fo-person-port.ts");
const { linkClient } = await import("../api/src/clients.ts");
const { linkFirmClients } = await import("../api/src/case-clients/client-link.ts");
const { actorOf } = await import("../api/src/core.ts");
type EntitlementPort = import("../ports/entitlement.ts").EntitlementPort;

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("csk1-check-signing-key-0123456789abcdef", () => clock.now());
// Programs' only use in Runtime is the startable check (S4): the copy's own server opens a case on Visitor visa below.
const providers = [Db, Workspace, Audit, { provide: Programs, useValue: { startableMissing: async () => [] } }, Runtime, { provide: FO_PERSON_PORT, useValue: foPersonPort }, { provide: APP_GUARD, useClass: ConfigReadGuard },
  { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
@Module({ controllers: [RuntimeController, PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
const nest = await NestFactory.create(TestApp, { logger: false, abortOnError: false });
await nest.listen(0, "127.0.0.1");
app = nest;
const BASE = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
try {
  const runtime = nest.get(Runtime), db = nest.get(Db);
  await seedSampleFirms(db);
  runtime.useEntitlements((tx) => new PgEntitlements(tx));   // PF-15c: the real limits on the Sample plans, bound explicitly (no platform-entitlements feature here)
  const FA = copySql(`select id from platform_firm where key = 'sample-firm'`)!;
  const tag = `${process.pid}-${Date.now().toString(36)}`;
  const s = await db.platformStaff.create({ data: { firmId: FA, actorId: `csk1-mgr-${tag}`, email: `csk1-mgr-${tag}@sample.invalid`, displayName: "Sample Case Manager" } });
  await db.platformRoleGrant.create({ data: { firmId: FA, staffId: s.id, role: "CASE_MANAGER", grantedBy: "seed:csk1" } });
  const tokenOf = async (actorId: string, firmKey: string) => {
    const r = await call(BASE, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } });
    if (r.status !== 200) throw new Error(`sign-in ${actorId}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const TA = await tokenOf(`csk1-mgr-${tag}`, "sample-firm"), TB = await tokenOf("user-S", "sample-solo");
  const firmA = await call(copyBase, "GET", "/api/runtime/firm", { actor: "user-O" });
  const rep = (firmA.body?.users ?? []).find((x: { duties: string[] }) => x.duties.includes("representative"))?.id;
  const open = (actor = "user-O", extra: Record<string, unknown> = {}, name = "Sample Client K") => call(BASE, "POST", "/api/runtime/cases", { actor, body: { combinationId: VV, clientActor: "user-P", principal: { displayName: name }, ...(actor === "user-O" && rep ? { representative: rep, caseOfficers: ["user-O"] } : {}), ...extra } });
  const num = (r: Res) => Number(String(r.body?.client_record?.number ?? "").slice(3));
  const viaCopy = await call(copyBase, "POST", "/api/runtime/cases", { actor: "user-O", body: { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Client K" }, ...(rep ? { representative: rep, caseOfficers: ["user-O"] } : {}) } });
  ok("setup: the copy's own server opens a case (startable), with its client; the in-process app starts with this row's routes",
    viaCopy.status === 201 && /^CL-\d{5}$/.test(viaCopy.body?.client_record?.number ?? "") && !!BASE, [viaCopy.status, viaCopy.body?.detail, viaCopy.body?.client_record]);

  // DW2: a new client with the next number; two at once, two numbers, no gap
  const first = await open();
  ok("CS-K1 DW2 pass: a directly opened case gets a new client: the next client code, named after the principal, PERSON",
    first.status === 201 && num(first) === num(viaCopy) + 1 && first.body?.client_record?.display_name === "Sample Client K" && first.body?.client_record?.display_kind === "PERSON"
    && copySql(`select client_id from runtime_case where id = '${first.body?.id}'`) === first.body?.client_record?.id, [first.status, first.body?.client_record]);
  const two = await Promise.all([open(), open()]);
  const nums = two.map(num).sort((x, y) => x - y);
  ok("CS-K1 DW2 pass: two openings at once get two new clients with the next two numbers, no gap", two.every((r) => r.status === 201) && nums[0] === num(first) + 1 && nums[1] === num(first) + 2, two.map((r) => [r.status, r.body?.client_record?.number]));
  ok("CS-K1 DW2 fail: no two clients of the firm share a number, and no case of the copy is without a client",
    copySql(`select count(*) from (select client_number from case_client where firm_key = 'sample-firm' group by workspace_id, client_number having count(*) > 1) x`) === "0" && copySql(`select count(*) from runtime_case where client_id is null`) === "0");
  const audit = copySql(`select summary from audit_event where entity = 'case client' and entity_key = '${first.body?.client_record?.id}'`);
  ok("CS-K1 DW2 pass: the new client writes an audit line (its code, never the name), and no client.created event (Lead 61)",
    !!audit && audit.includes(first.body?.client_record?.number) && !audit.includes("Sample Client K") && copySql(`select count(*) from module_event where type = 'client.created'`) === "0", audit);

  // DW3: reuse; an unknown id is 404
  const counts = () => copySql(`select (select count(*) from runtime_case) || ':' || (select count(*) from case_client) || ':' || (select string_agg(next_value::text, ',' order by firm_key) from case_client_counter)`);
  const c0 = counts();
  const again = await open("user-O", { clientId: first.body?.client_record?.id }, "Sample Client K Two");
  ok("CS-K1 DW3 pass: opening with an existing client of the firm reuses it: one client, two cases, no new number",
    again.status === 201 && again.body?.client_record?.id === first.body?.client_record?.id && copySql(`select count(*) from runtime_case where client_id = '${first.body?.client_record?.id}'`) === "2"
    && counts().split(":")[1] === c0.split(":")[1] && counts().split(":")[2] === c0.split(":")[2], [again.status, again.body?.detail, c0, counts()]);
  const c1 = counts();
  const unknown = await Promise.all([open("user-O", { clientId: randomUUID() }), open("user-O", { clientId: "not-an-id" }), open("user-O", { clientId: "" })]);
  ok("CS-K1 DW3 fail: an unknown client id (or no id at all) → 404 \"No such client.\", nothing written (no case, no client, no number)",
    unknown.every((r) => r.status === 404 && /No such client\./.test(JSON.stringify(r.body))) && counts() === c1, [unknown.map((r) => [r.status, r.body?.message ?? r.body]), c1, counts()]);

  // DW4 through the opening: a CORPORATE pathway (Visitor visa's chain hung for one opening under a Sample CORPORATE
  // Pathway, then put back, as check_csc1_count.ts does)
  const chain = copySql(`with recursive up as (select p.*, 0 d from program_def p join combination x on x.program_def_id = p.id where x.id = '${VV}' union all select p.*, up.d + 1 from program_def p join up on p.workspace_id = up.workspace_id and p.program_node_key = up.parent_node_key) select string_agg(id || '|' || coalesce(parent_node_key, '') || '|' || node_kind || '|' || workspace_id, ',' order by d) from up`).split(",").map((r) => r.split("|"));
  const under = chain[chain.findIndex((r) => r[2] === "PATHWAY") - 1], corpKey = `csk1-${tag}-corp-pw`;
  copySql(`set session_replication_role = replica; insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by) values ('${randomUUID()}', '${under[3]}', '${corpKey}', 'PATHWAY', 'Sample corporate', 'CORPORATE', 'seed'); update program_def set parent_node_key = '${corpKey}' where id = '${under[0]}'`);
  let corp: Res;
  try { corp = await open("user-O", {}, "Sample Company K"); }
  finally { copySql(`set session_replication_role = replica; update program_def set parent_node_key = '${under[1]}' where id = '${under[0]}'; delete from program_def where program_node_key = '${corpKey}'`); }
  ok("CS-K1 DW4 pass: a case opened on a CORPORATE pathway gets a COMPANY client", corp.status === 201 && corp.body?.client_record?.display_kind === "COMPANY", [corp.status, corp.body?.detail, corp.body?.client_record]);
  ok("CS-K1 DW4 fail: the family case (Visitor visa's own Pathway) gets a PERSON client, never COMPANY", first.body?.client_record?.display_kind === "PERSON" && (await open()).body?.client_record?.display_kind === "PERSON");

  // DW5: firm B cannot pick, list or read firm A's client
  const aId = first.body?.client_record?.id as string, aCode = first.body?.client_record?.number as string;
  const row = () => copySql(`select row_to_json(k)::text from case_client k where id = '${aId}'`);
  const r0 = row();
  const aOne = await call(BASE, "GET", `/api/runtime/clients/${aId}`, { token: TA });
  ok("CS-K1 DW5 pass: firm A reads its client with its cases' ids and numbers",
    aOne.status === 200 && aOne.body?.number === aCode && aOne.body?.cases?.length === 2 && aOne.body.cases.every((x: { case_number: string }) => /^C-\d{4}-\d{5}$/.test(x.case_number)) && aOne.body.cases.some((x: { id: string }) => x.id === first.body?.id), [aOne.status, aOne.body]);
  const aList = await call(BASE, "GET", `/api/runtime/clients?query=${encodeURIComponent(aCode)}`, { token: TA }), aByName = await call(BASE, "GET", `/api/runtime/clients?query=client%20k`, { token: TA });
  ok("CS-K1 DW5 pass: firm A lists its clients by code and by name, paged 50",
    aList.status === 200 && aList.body?.clients?.length === 1 && aList.body.clients[0].id === aId && aByName.body?.page_size === 50 && aByName.body?.clients?.length <= 50 && aByName.body?.total >= 4 && aByName.body.clients.some((x: { id: string }) => x.id === aId), [aList.body, aByName.body?.total]);
  const bOne = await call(BASE, "GET", `/api/runtime/clients/${aId}`, { token: TB }), bList = await call(BASE, "GET", `/api/runtime/clients?query=${encodeURIComponent(aCode)}`, { token: TB });
  const bAll = await call(BASE, "GET", `/api/runtime/clients`, { token: TB });
  const bPick = await open("user-S", { clientId: aId });
  ok("CS-K1 DW5 fail: firm B reading firm A's client → 404; its list holds none of firm A's clients", bOne.status === 404 && bList.status === 200 && bList.body?.clients?.length === 0
    && bAll.status === 200 && !(bAll.body?.clients ?? []).some((x: { id: string }) => copySql(`select firm_key from case_client where id = '${x.id}'`) !== "sample-solo"), [bOne.status, bList.body, bAll.body?.total]);
  ok("CS-K1 DW5 fail (breaker): firm B opening a case with firm A's client id → 404 \"No such client.\" (the same answer as an unknown id)", bPick.status === 404 && /No such client\./.test(JSON.stringify(bPick.body)), [bPick.status, bPick.body]);
  ok("CS-K1 DW5 pass: firm A's client is unchanged after firm B's tries", row() === r0);
  const noToken = await Promise.all([call(BASE, "GET", `/api/runtime/clients`), call(BASE, "GET", `/api/runtime/clients/${aId}`), call(BASE, "GET", `/api/runtime/clients/${aId}`, { actor: "user-O" })]);
  ok("CS-K1 DW5 fail: the read routes need a staff session (PF-4's guard): no token, or x-actor alone → 401", noToken.every((r) => r.status === 401), noToken.map((r) => r.status));
  const aAll = await call(BASE, "GET", `/api/runtime/clients`, { token: TA });
  const odd = await Promise.all(["%25", "_", "%00", "%5C", "Sample%00Client"].map((x) => call(BASE, "GET", `/api/runtime/clients?query=${x}`, { token: TA })));
  ok("CS-K1 DW5 fail (review m3, breaker 7a/7b): a search for %, _, a backslash is 200 and matches no client (never all of them); a NUL is dropped (alone: the same as no search, the firm's own list; never a 500)",
    odd.every((r) => r.status === 200) && [0, 1, 3, 4].every((i) => odd[i].body?.total === 0)
    && odd[2].body?.total === (aAll.body?.total ?? -1) && odd[2].body?.total > 0, odd.map((r) => [r.status, r.body?.total]));
  const bad = await Promise.all(["not-an-id", randomUUID(), "%27%20or%201=1"].map((x) => call(BASE, "GET", `/api/runtime/clients/${x}`, { token: TA })));
  ok("CS-K1 DW5 fail: a malformed or unknown id → 404 for firm A too", bad.every((r) => r.status === 404), bad.map((r) => r.status));
  const caseRead = await call(BASE, "GET", `/api/runtime/cases/${again.body?.id}`, { actor: "user-O" });
  ok("CS-K1 pass: the case read gains client_record { id, number, display_name, display_kind }; client stays the login",
    caseRead.status === 200 && JSON.stringify(Object.keys(caseRead.body?.client_record ?? {})) === JSON.stringify(["id", "number", "display_name", "display_kind"]) && caseRead.body?.client === "user-P" && caseRead.body?.client_record?.id === aId, [caseRead.status, caseRead.body?.client_record]);

  // DW7: an opening refused by the plan limit leaves no client
  const full: EntitlementPort = { async check(_f, metric, used) { return { allowed: false, metric, limit: used ?? 0, used: used ?? 0 }; } };
  const was = runtime.useEntitlements(full);
  const c2 = counts();
  const refused = await Promise.all([open(), open("user-O", { clientId: aId })]);
  runtime.useEntitlements(was);
  ok("CS-K1 DW7 fail: an opening refused by the plan limit (409 PLAN_LIMIT_REACHED) leaves no client, no case and no client number", refused.every((r) => r.status === 409 && r.body?.code === "PLAN_LIMIT_REACHED") && counts() === c2, [refused.map((r) => r.status), c2, counts()]);
  const next = await open();
  ok("CS-K1 DW7 pass: the next opening allowed takes the next client number, with no gap", next.status === 201 && num(next) === Math.max(...[...nums, num(corp)]) + 2, [next.body?.client_record?.number, nums, num(corp)]);

  // ------------------------------------------------------------------------------------------------ part 2: the links
  const link = (id: string) => copySql(`select k.display_kind || '|' || coalesce(p.firm_id::text, '-') || '|' || coalesce(c.firm_id::text, '-') || '|' || k.firm_id || '|' || k.fo_link_pending || '|' || coalesce((p.xmin = k.xmin)::text, '-') from case_client k left join fo_person p on p.id = k.fo_person_id left join fo_company c on c.id = k.fo_company_id where k.id = '${id}'`);
  const FB = copySql(`select id from platform_firm where key = 'sample-solo'`)!;
  const parties = () => copySql(`select (select count(*) from fo_person) || '|' || (select count(*) from fo_company)`);
  // DW9: a new person client gets its fo_person in the opening's transaction; a forced rollback leaves neither row
  ok("CS-K1 DW9 pass: a directly opened case's new PERSON client names an fo_person of its own firm, written in the opening's transaction (same xmin), not pending",
    link(aId) === `PERSON|${FA}|-|${FA}|false|true`, link(aId));
  const p0 = parties(), k0 = counts();
  const forced = await runtime.createCase(actorOf("user-O"), { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Rolled Back" }, ...(rep ? { representative: rep, caseOfficers: ["user-O"] } : {}) },
    async () => { throw new Error("forced"); }).then(() => "opened", (e) => String(e));
  ok("CS-K1 DW9 fail: a failure forced at the end of the opening's transaction leaves no client and no fo_person (and the plan-limit refusal above none either)",
    /forced/.test(forced) && parties() === p0 && counts() === k0, [forced, p0, parties()]);
  // DW12: a COMPANY client gets an fo_company and no fo_person
  const corpId = corp.body?.client_record?.id as string;
  ok("CS-K1 DW12 pass: the CORPORATE opening's COMPANY client names an fo_company of its own firm and no fo_person", link(corpId).startsWith(`COMPANY|-|${FA}|${FA}|false|`), link(corpId));
  ok("CS-K1 DW12 fail: no COMPANY client of the copy names an fo_person, and no PERSON client an fo_company; the database refuses turning the COMPANY client's link into a person's (review m6)",
    copySql(`select count(*) from case_client where (display_kind = 'COMPANY' and fo_person_id is not null) or (display_kind = 'PERSON' and fo_company_id is not null)`) === "0"
    && /case_client_front_office_link_check/.test(err(`update case_client set fo_company_id = null, fo_person_id = gen_random_uuid() where id = '${corpId}'`, COPY)));
  // Breaker F1: a name the front office's text rule refuses (a Persian name's U+200C, a soft hyphen, "!!") still opens, linked
  const oddNames = await Promise.all(["\u0639\u0644\u06cc\u200c\u0631\u0636\u0627 Sample", "Sam\u00adple Hyphen", "!!", "Ab\u2065cd Sample", "\u0bbe\u0bbe\u0bbe"].map((nm) => open("user-O", {}, nm)));
  ok("CS-K1 DW9 pass (breaker F1): names with a joiner, a soft hyphen, no letter at all (\"!!\"), an unassigned mark or combining marks only (review m8) open (201) and are linked; the front office's copy drops the marks, and \"!!\" is named by its client code",
    oddNames.every((r) => r.status === 201) && oddNames.every((r) => link(r.body?.client_record?.id).startsWith(`PERSON|${FA}|`))
    && copySql(`select p.given_names from fo_person p join case_client k on k.fo_person_id = p.id where k.id = '${oddNames[2].body?.client_record?.id}'`) === `Client ${oddNames[2].body?.client_record?.number}`
    && copySql(`select p.given_names from fo_person p join case_client k on k.fo_person_id = p.id where k.id = '${oddNames[0].body?.client_record?.id}'`) === "\u0639\u0644\u06cc\u0631\u0636\u0627 Sample", oddNames.map((r) => [r.status, r.body?.detail]));
  // DW11: firm A's client never gets firm B's party
  const bCase = await call(BASE, "POST", "/api/runtime/cases", { actor: "user-S", body: { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Solo Client" } } });
  ok("CS-K1 DW11 pass: firm B's opening links its client to an fo_person of firm B", bCase.status === 201 && link(bCase.body?.client_record?.id).startsWith(`PERSON|${FB}|-|${FB}|`), [bCase.status, bCase.body?.detail, link(bCase.body?.client_record?.id ?? "")]);
  const pB = copySql(`select count(*) from fo_person where firm_id = '${FB}'`);
  const crossed = await db.$transaction(async (tx) => { const c = await tx.caseClient.findUniqueOrThrow({ where: { id: aId } }); await linkClient(tx, foPersonPort, { ...c, foPersonId: null, firmId: FB }, "system:csk1-check"); }).then(() => "linked", (e) => String(e));
  ok("CS-K1 DW11 fail: a link asked with firm B's id for firm A's client writes nothing (refused; firm B's new party rolls back), and no client of the copy names another firm's party",
    /linked meanwhile/.test(crossed) && copySql(`select count(*) from fo_person where firm_id = '${FB}'`) === pB && link(aId).startsWith(`PERSON|${FA}|`)
    && copySql(`select count(*) from case_client k left join fo_person p on p.id = k.fo_person_id left join fo_company c on c.id = k.fo_company_id where p.firm_id <> k.firm_id or c.firm_id <> k.firm_id`) === "0", crossed);
  // DW10: the one-time job links every existing client; a re-run changes nothing; then the check is validated
  copySql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number) select gen_random_uuid(), workspace_id, combination_id, 'user-P', 'seed:csk1', 'sample-firm', 'C-2099-' || lpad((${(process.pid % 30000) * 3} + g)::text, 5, '0') from runtime_case, generate_series(1, 3) g where id = '${first.body?.id}'`);
  const waiting = () => copySql(`select count(*) from case_client where firm_id is not null and (fo_link_pending or (fo_person_id is null and fo_company_id is null))`);
  const w0 = Number(waiting()), v0 = copySql(`select case_client_validate_link_check()`);
  const firms = copySql(`select string_agg(distinct firm_id::text, ',') from case_client where firm_id is not null and fo_person_id is null and fo_company_id is null`).split(",").filter(Boolean);
  const runs = []; for (const f of firms) runs.push(await linkFirmClients(db as never, foPersonPort, f));
  ok("CS-K1 DW10 pass: after the job (one run per firm) no client of a platform firm is missing its link or pending, and the last run validates the check",
    w0 >= 3 && v0 === "f" && waiting() === "0" && runs.every((r) => !r.failed.length) && runs.at(-1)?.validated === true
    && copySql(`select convalidated from pg_constraint where conname = 'case_client_front_office_link_check'`) === "t", [w0, v0, waiting(), runs]);
  const p1 = parties(), rerun = await linkFirmClients(db as never, foPersonPort, FA);
  ok("CS-K1 DW10 fail: a second run links nothing and makes no party (and the validation it repeats changes nothing)", rerun.linked === 0 && !rerun.failed.length && parties() === p1 && rerun.validated, rerun);
} finally {
  await app?.close().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
