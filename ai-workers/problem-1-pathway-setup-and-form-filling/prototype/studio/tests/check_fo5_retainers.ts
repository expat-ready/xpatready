// FO-5 (P-558, P-559, P-576, P-600; BACKLOG row FO-5 rows rev 6.2, 9, 10 part 2; contracts §2.3, §7; concept
// fo-5s-retainer-signing r2 BR-1..BR-11; AG-5-3, -9, -34, -39, -47, -50, -64, -65): retainer agreements. Part 1, the
// schema step: the four tables and every database rule of the migration, each with a passing and a failing case; part 2:
// the service and routes (the row's whole "Done when"), on a third database. Two
// scratch databases: "empty" gets every migration; "demo" gets every migration before FO-5's, then demo-shaped rows (a
// Sample case, an audit line, the Sample firms and staff), then FO-5's migration and any later one. No server, no
// browser, no model call (US$0). Both are dropped at the end.
//   tsx studio/tests/check_fo5_retainers.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { fakeAudit } from "../ports/audit.ts";
import { EVENT } from "../ports/events.ts";
import { FileKeyTaken, sha256Hex } from "../ports/files.ts";
import { FileLinks, LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { DOCX, DocxRender, buildDocx, placeholdersOf, starterFrame } from "../api/src/front-office/retainers/docx.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { documentRenderPortContract } from "../ports/contracts/document-render-port.contract.ts";
import { filesPortContract } from "../ports/contracts/files-port.contract.ts";
import { checkPlaceholders } from "../api/src/front-office/retainers/placeholders.ts";
import { RetainersController } from "../api/src/front-office/retainers/routes.ts";
import { OFFLINE_PDF_MAX_BYTES, Retainers } from "../api/src/front-office/retainers/service.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";
import { PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261114210000_fo5_retainer_tables";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_fo5_empty_${process.pid}`, DEMO = `xr_studio_fo5_demo_${process.pid}`, API = `xr_studio_fo5_api_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `fo5-check-${process.pid}`);
const TABLES = ["fo_retainer_template", "fo_retainer", "fo_retainer_version", "fo_retainer_fee_row"];

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string) => psql(db, ["-Atc", q]);
const refused = (db: string, q: string, re: RegExp) => { try { sql(db, q); return false; } catch (e) { const m = String((e as { stderr?: string }).stderr ?? e); if (!re.test(m)) console.log(`      (refused, but not as expected: ${m.trim().slice(0, 300)})`); return re.test(m); } };
const client = (db: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(db), options: "-c TimeZone=UTC" }) });
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hex = (n: number) => n.toString(16).padStart(64, "0");

// prisma migrate diff from a database to the schema folder: the lines that name an FO-5 table or type.
function foDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /fo_retainer|FoRetainer/.test(l));
}
const indexesNotFirmFirst = (db: string) => sql(db, `select coalesce(string_agg(ic.relname, ',' order by ic.relname), '') from pg_index i
  join pg_class c on c.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
  left join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
  where c.relnamespace = 'public'::regnamespace and c.relname = any('{${TABLES.join(",")}}') and not i.indisprimary and coalesce(a.attname, '') <> 'firm_id'`);

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO, API]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------------------- the migration (P-600)
  const newest = all.filter((d) => d < NEW).at(-1) ?? "";
  ok(`FO-5: the migration has its own stamp, later than every one before it (newest before it: ${newest}; P-600 (4))`,
    all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && newest < NEW, all.slice(-3));
  ok("FO-5: every database function of the migration carries the fo_retainer_ prefix (rows rev 15.2)",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").matchAll(/CREATE FUNCTION (\w+)/g)].every((m) => m[1].startsWith("fo_retainer_")));
  for (const d of all) psql(EMPTY, ["-f", join(MIG, d, "migration.sql")]);
  ok("FO-5 pass: every migration applies to an empty database and makes the four tables",
    sql(EMPTY, `select count(*) from pg_tables where schemaname='public' and tablename = any('{${TABLES.join(",")}}')`) === "4");
  ok("FO-5 pass: migrate diff from the migrated empty database to the schema names no FO-5 table or type", foDiff(EMPTY).length === 0, foDiff(EMPTY));
  ok("FO-5 pass: every index but a primary key starts with firm_id (contracts §0.2)", indexesNotFirmFirst(EMPTY) === "", indexesNotFirmFirst(EMPTY));
  ok("FO-5 fail: the migration does not apply twice", (() => { try { psql(EMPTY, ["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());

  for (const d of all.filter((x) => x < NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  ok("FO-5 fail: before FO-5's migration there is no fo_retainer table and the schema differs", sql(DEMO, `select count(*) from pg_tables where tablename like 'fo\\_retainer%'`) === "0" && foDiff(DEMO).length > 0);
  sql(DEMO, `set session_replication_role = replica;
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number) values ('${u(10)}', '${u(1)}', '${u(2)}', 'user-P', 'user-O', 'sample-firm', 'C-2026-00001');
    insert into audit_event (id, workspace_id, actor, action, entity, summary) values (gen_random_uuid(), '${u(1)}', 'user-R', 'case.open', 'runtime_case', 'Sample');`);
  const pre = client(DEMO);
  await seedSampleFirms(pre);
  await pre.$disconnect();
  const demoRows = `select (select count(*) from runtime_case) || ':' || (select count(*) from audit_event) || ':' || (select count(*) from platform_firm) || ':' || (select count(*) from platform_staff)`;
  const before = sql(DEMO, demoRows);
  for (const d of all.filter((x) => x >= NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  ok("FO-5 pass: the migration applies to a demo-data copy (a case, an audit line, the Sample firms and staff) and leaves its rows as they were", sql(DEMO, demoRows) === before, before);
  ok("FO-5 pass: migrate diff after it on the demo-data copy names no FO-5 table or type", foDiff(DEMO).length === 0, foDiff(DEMO));

  const firmA = sql(DEMO, `select id from platform_firm where key='sample-firm'`), firmB = sql(DEMO, `select id from platform_firm where key='sample-solo'`);
  const staffR = sql(DEMO, `select id from platform_staff where actor_id='user-R'`), staffS = sql(DEMO, `select id from platform_staff where actor_id='user-S'`);

  // ------------------------------------------------------------------------------------------------------ templates
  const KEY = (t: string, n: number) => `retainer-templates/${t}/v${n}.docx`;
  const SEED = "seed:FO-5";
  const tpl = (id: string, firm: string, name: string, kind = "RETAINER", ph = "{client.name,fees}") =>
    `insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${id}', '${firm}', '${name}', '${kind}', '${KEY(id, 1)}', '${hex(1)}', '${ph}', '${SEED}', '${SEED}', now()) returning version`;
  const tplRaw = (cols: Record<string, string>) => {
    const c: Record<string, string> = { id: `'${u(103)}'`, firm_id: `'${firmA}'`, name: "'X'", file_key: `'${KEY(u(103), 1)}'`, file_sha256: `'${hex(1)}'`, placeholders: "'{}'", created_by: `'${SEED}'`, updated_by: `'${SEED}'`, updated_at: "now()", ...cols };
    return `insert into fo_retainer_template (${Object.keys(c).join(", ")}) values (${Object.values(c).join(", ")})`;
  };
  const TA = u(100), TC = u(101), TB = u(102), TD = u(104);
  ok("FO-5 pass: a template is written at version 1, active, kind RETAINER by default", sql(DEMO, tpl(TA, firmA, "Standard retainer")) === "1" && sql(DEMO, `select active || ':' || kind from fo_retainer_template where id='${TA}'`) === "true:RETAINER");
  ok("FO-5 pass: a CONSULTATION template, and the same name in another firm, are accepted", sql(DEMO, tpl(TC, firmA, "Consultation agreement", "CONSULTATION")) === "1" && sql(DEMO, tpl(TB, firmB, "Standard retainer")) === "1");
  ok("FO-5 fail: the same template name twice in a firm is refused, also in another case or spacing (B-15)",
    refused(DEMO, tpl(u(103), firmA, "Standard retainer"), /fo_retainer_template_firm_id_name_key/)
    && refused(DEMO, tpl(u(103), firmA, "standard  RETAINER"), /fo_retainer_template_firm_id_name_norm_key/)
    && refused(DEMO, tpl(u(103), firmA, "Standard retainer"), /fo_retainer_template_firm_id_name_norm_key/));
  ok("FO-5 fail: a blank, padded, zero-width or two-line name, a bad sha256, a key not named by the template and version (.., upper case, another template's), a placeholder that is not a dotted lower-case name or is listed twice, a blank actor",
    refused(DEMO, tpl(u(103), firmA, " "), /fo_retainer_template_name_check/)
    && refused(DEMO, tpl(u(103), firmA, " Padded"), /fo_retainer_template_name_check/)
    && refused(DEMO, tpl(u(103), firmA, "​​"), /fo_retainer_template_name_check/)
    && refused(DEMO, tplRaw({ name: "E'Two\\nlines'" }), /fo_retainer_template_name_check/)
    && refused(DEMO, tplRaw({ file_sha256: "'ABC'" }), /fo_retainer_template_file_sha256_check/)
    && refused(DEMO, tplRaw({ file_key: `'retainer-templates/${u(103)}/../v1.docx'` }), /fo_retainer_template_file_key_check/)
    && refused(DEMO, tplRaw({ file_key: `'${KEY(TA, 1)}'` }), /fo_retainer_template_file_key_check/)
    && refused(DEMO, tplRaw({ placeholders: "'{Client.Passport}'" }), /fo_retainer_template_placeholders_check/)
    && refused(DEMO, tplRaw({ placeholders: "'{fees,fees}'" }), /fo_retainer_template_placeholders_check/)
    && refused(DEMO, tplRaw({ created_by: "''" }), /fo_retainer_template_actors_check/));
  ok("FO-5 fail: a template is not written at version 3", refused(DEMO, tplRaw({ version: "3", file_key: `'retainer-templates/${u(103)}/v3.docx'` }), /starts at version 1/));
  ok("FO-5 pass: a new file makes version 2 under its own key (BR-1)",
    sql(DEMO, `update fo_retainer_template set version = 2, file_key = '${KEY(TA, 2)}', file_sha256 = '${hex(2)}', placeholders = '{client.name,fees,representative.name}' where id = '${TA}' returning version`) === "2");
  ok("FO-5 fail: the file changes without a new version, the version jumps or goes back, a new version keeps the old key (B-16), the kind, the id or the firm changes",
    refused(DEMO, `update fo_retainer_template set file_sha256 = '${hex(3)}' where id = '${TA}'`, /a new file makes version 3/)
    && refused(DEMO, `update fo_retainer_template set version = 4, file_key = '${KEY(TA, 4)}' where id = '${TA}'`, /version moves from 2 to 3, not 4/)
    && refused(DEMO, `update fo_retainer_template set version = 1, file_key = '${KEY(TA, 1)}' where id = '${TA}'`, /version moves from 2 to 3, not 1/)
    && refused(DEMO, `update fo_retainer_template set version = 3 where id = '${TA}'`, /fo_retainer_template_file_key_check/)
    && refused(DEMO, `update fo_retainer_template set kind = 'CONSULTATION' where id = '${TA}'`, /kind, created_by and created_at never change/)
    && refused(DEMO, `update fo_retainer_template set id = '${u(109)}', file_key = '${KEY(u(109), 2)}' where id = '${TA}'`, /firm_id and id never change/)
    && refused(DEMO, `update fo_retainer_template set firm_id = '${firmB}' where id = '${TA}'`, /firm_id and id never change/));
  ok("FO-5 pass: a template can be switched off and on, and renamed", sql(DEMO, `update fo_retainer_template set active = false, name = 'Standard retainer 2026' where id = '${TA}' returning 1`) === "1" && sql(DEMO, `update fo_retainer_template set active = true where id = '${TA}' returning 1`) === "1");
  sql(DEMO, tpl(TD, firmA, "Express Entry retainer"));

  // ------------------------------------------------------------------------------------- retainers with their versions
  // A retainer and each edit write their version in the same transaction (one psql call = one transaction).
  const P1 = u(300), P2 = u(301), P3 = u(302), P5 = u(303), P6 = u(304), PERSON = u(310), CO = u(320);
  type RetOpts = { firm?: string; prospect?: string | null; t?: string; tv?: number; key?: string; kind?: string; staff?: string; subject?: string; company?: string | null; status?: string };
  const ret = (id: string, o: RetOpts = {}) =>
    `insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, company_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at${o.status ? ", status" : ""})
     values ('${id}', '${o.firm ?? firmA}', '${o.kind ?? "RETAINER"}', ${o.prospect === null ? "null" : `'${o.prospect ?? P1}'`}, '${o.subject ?? "PERSON"}', '${PERSON}', ${o.company ? `'${o.company}'` : "null"}, '${o.staff ?? staffR}', '${o.t ?? TA}', ${o.tv ?? 2}, '${o.key ?? KEY(o.t ?? TA, o.tv ?? 2)}', 'staff:${staffR}', now()${o.status ? `, '${o.status}'` : ""})`;
  const ver = (id: string, r: string, n: number, extra = "") =>
    `insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by${extra ? ", " + extra.split("=")[0] : ""}) values ('${id}', '${firmA}', '${r}', ${n}, '{"client.name":"Client A"}', 'retainers/${r}/v${n}.docx', '${hex(10 + n)}', 'staff:${staffR}'${extra ? ", " + extra.split("=").slice(1).join("=") : ""})`;
  const fee = (id: string, v: string, pos: number, amount: string | null = "250000", when = "ON_SIGNING", due: string | null = null, label = "'Deposit on signing'") =>
    `insert into fo_retainer_fee_row (id, firm_id, version_id, position, label, amount_minor, "when", due_on) values ('${id}', '${firmA}', '${v}', ${pos}, ${label}, ${amount ?? "null"}, '${when}', ${due ? `'${due}'` : "null"})`;
  const state = (r: string) => sql(DEMO, `select status || ':' || current_version from fo_retainer where id = '${r}'`);
  const draft = (r: string, v: string, o: RetOpts = {}, fees: string[] = []) => sql(DEMO, [ret(r, o), ver(v, r, 1), ...fees].join("; ") + "; select 1");
  const send = (r: string, v: string) => `update fo_retainer_version set sent_at = now() where id = '${v}'; update fo_retainer set status = 'SENT' where id = '${r}'`;
  const end = (r: string, v: string, why: string, retSet: string) => `update fo_retainer_version set ended_at = now(), end_reason = '${why}' where id = '${v}'; update fo_retainer set ${retSet} where id = '${r}'`;
  const R1 = u(400), V1 = u(500), V2 = u(501), V3 = u(502);
  ok("FO-5 pass: a retainer is written DRAFT at version 1 with its version 1 (the merge values snapshot) and fee rows (CAD, minor units; one with no amount yet)",
    draft(R1, V1, {}, [fee(u(600), V1, 1), fee(u(601), V1, 2, null, "ON_DATE", "2027-01-15")]) === "1" && state(R1) === "DRAFT:1"
    && sql(DEMO, `select string_agg(currency || coalesce(amount_minor::text, '-'), ',' order by position) from fo_retainer_fee_row where version_id = '${V1}'`) === "CAD250000,CAD-");
  ok("FO-5 fail: a retainer without its version, or a second live retainer for the same prospect, is refused (at commit; one live per prospect, BR-10)",
    refused(DEMO, ret(u(401), { prospect: P2 }), /has no version 1/) && refused(DEMO, `${ret(u(401))}; ${ver(u(503), u(401), 1)}`, /fo_retainer_one_live_per_prospect/));
  ok("FO-5 fail: written in another status, from an older or later template version than its current one, with another key, a CONSULTATION template for a RETAINER, an inactive template",
    refused(DEMO, ret(u(401), { prospect: P2, status: "SENT" }), /written DRAFT at version 1/)
    && refused(DEMO, ret(u(401), { prospect: P2, tv: 3 }), /takes the template's current version \(2\) and its file, not version 3/)
    && refused(DEMO, ret(u(401), { prospect: P2, tv: 1 }), /takes the template's current version \(2\) and its file, not version 1/)
    && refused(DEMO, ret(u(401), { prospect: P2, key: KEY(TD, 1) }), /takes the template's current version \(2\) and its file/)
    && refused(DEMO, ret(u(401), { prospect: P2, t: TC, tv: 1 }), /a CONSULTATION template cannot make a RETAINER agreement/)
    && (sql(DEMO, `update fo_retainer_template set active = false where id = '${TA}'`), refused(DEMO, ret(u(401), { prospect: P2 }), /inactive template/))
    && sql(DEMO, `update fo_retainer_template set active = true where id = '${TA}' returning 1`) === "1");
  ok("FO-5 fail: firm A's retainer naming firm B's template or firm B's staff member is refused (composite keys)",
    refused(DEMO, ret(u(401), { prospect: P2, t: TB, tv: 1 }), /fo_retainer_firm_id_template_id_fkey/)
    && refused(DEMO, ret(u(401), { prospect: P2, staff: staffS }), /fo_retainer_firm_id_representative_staff_id_fkey/));
  ok("FO-5 fail: a RETAINER without a prospect, a COMPANY subject without a company, a PERSON subject with one, are refused",
    refused(DEMO, ret(u(401), { prospect: null }), /fo_retainer_prospect_check/)
    && refused(DEMO, ret(u(401), { prospect: P2, subject: "COMPANY" }), /fo_retainer_subject_check/)
    && refused(DEMO, ret(u(401), { prospect: P2, company: CO }), /fo_retainer_subject_check/));
  ok("FO-5 pass: a CONSULTATION agreement without a prospect, and a COMPANY retainer with its company, are accepted",
    draft(u(402), u(504), { prospect: null, kind: "CONSULTATION", t: TC, tv: 1 }) === "1" && draft(u(403), u(505), { prospect: u(307), subject: "COMPANY", company: CO }) === "1");
  ok("FO-5 fail: a version that is not the retainer's current one, or written already sent, is refused",
    refused(DEMO, ver(u(506), R1, 2), /written only as the current version \(1\)/)
    && refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1, "sent_at=now()")}`, /written unsent/));
  ok("FO-5 fail: a fee row in another currency, negative, over CAD 100 million, a due date on a non-date row or out of range (infinity, BC; B-13), position 0, a blank, zero-width or two-line label (B-14)",
    refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1)}; ${fee(u(602), u(506), 1).replace("due_on)", "due_on, currency)").replace("null)", "null, 'USD')")}`, /fo_retainer_fee_row_currency_check/)
    && [["-1"], ["10000000001"]].every(([a]) => refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1)}; ${fee(u(602), u(506), 1, a)}`, /fo_retainer_fee_row_amount_check/))
    && [["ON_SIGNING", "2027-01-01"], ["ON_DATE", "infinity"], ["ON_DATE", "0001-01-01 BC"]].every(([w, d]) => refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1)}; ${fee(u(602), u(506), 1, "100", w, d)}`, /fo_retainer_fee_row_due_on_check/))
    && refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1)}; ${fee(u(602), u(506), 0)}`, /fo_retainer_fee_row_position_check/)
    && ["'  '", "E'\\u200b'", "E'Two\\nlines'"].every((l) => refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1)}; ${fee(u(602), u(506), 1, "100", "ON_SIGNING", null, l)}`, /fo_retainer_fee_row_label_check/)));
  ok("FO-5 fail: merge values over 64 KB, or not an object, are refused (B-14)",
    refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1).replace(`'{"client.name":"Client A"}'`, `jsonb_build_object('x', repeat('a', 70000))`)}`, /fo_retainer_version_merge_values_check/)
    && refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1).replace(`'{"client.name":"Client A"}'`, `'[1]'`)}`, /fo_retainer_version_merge_values_check/));
  ok("FO-5 fail: a fee row added in a later transaction than its version (its file is already stored) is refused (review m1)", refused(DEMO, fee(u(603), V1, 3), /written in the transaction that wrote their version/));
  ok("FO-5 fail: a fee row or a version never changes, and is never deleted or truncated (AG-5-3)",
    refused(DEMO, `update fo_retainer_fee_row set amount_minor = 1 where id = '${u(600)}'`, /fee rows never change/)
    && refused(DEMO, `delete from fo_retainer_fee_row where id = '${u(600)}'`, /never deleted/)
    && refused(DEMO, `truncate fo_retainer_fee_row`, /never deleted/)
    && refused(DEMO, `update fo_retainer_version set merge_values = '{"client.name":"Someone else"}' where id = '${V1}'`, /a version never changes/)
    && refused(DEMO, `update fo_retainer_version set original_sha256 = '${hex(99)}' where id = '${V1}'`, /a version never changes/)
    && refused(DEMO, `delete from fo_retainer_version where id = '${V1}'`, /never deleted/)
    && refused(DEMO, `delete from fo_retainer where id = '${R1}'`, /never deleted/)
    && refused(DEMO, `update fo_retainer set id = '${u(499)}' where id = '${R1}'`, /firm_id and id never change|fo_retainer_version_firm_id_retainer_id_fkey/));

  // Send (FO-6 moves it on): the version's request and the status together; never apart (B-8).
  ok("FO-5 fail: SENT while the version is unsent, or a sent version on a DRAFT retainer, is refused at commit (B-8)",
    refused(DEMO, `update fo_retainer set status = 'SENT' where id = '${R1}'`, /a SENT retainer's current version 1 has request sent f/)
    && refused(DEMO, `update fo_retainer_version set sent_at = now() where id = '${V1}'`, /a DRAFT retainer's current version 1 has request sent t/));
  ok("FO-5 pass: DRAFT → SENT with version 1's request sent, in one transaction", (sql(DEMO, `${send(R1, V1)}; select 1`), state(R1) === "SENT:1"));
  ok("FO-5 fail: sent_at is set once; SENT does not come back to DRAFT without a new version; a fee row on a sent version is refused",
    refused(DEMO, `update fo_retainer_version set sent_at = now() - interval '1 day' where id = '${V1}'`, /sent_at is set once/)
    && refused(DEMO, `update fo_retainer set status = 'DRAFT' where id = '${R1}'`, /comes back to DRAFT only with a new version/)
    && refused(DEMO, fee(u(604), V1, 3), /only with the current unsent version of a DRAFT retainer/));
  ok("FO-5 fail: the representative or signer of a sent retainer changes only by an edit", refused(DEMO, `update fo_retainer set signer_person_id = '${u(311)}' where id = '${R1}'`, /change only by an edit/));
  ok("FO-5 fail: version 2 before version 1's request ended is refused (BR-9: the old request ends first)",
    refused(DEMO, `update fo_retainer set status = 'DRAFT', current_version = 2 where id = '${R1}'; ${ver(V2, R1, 2)}`, /version 1's request must end before version 2/));
  ok("FO-5 fail: a new version number with no version row is refused at commit (B-8)", refused(DEMO, `${end(R1, V1, "UPDATED", "status = 'DRAFT', current_version = 2")}`, /has no version 2/));
  ok("FO-5 pass: an edit before any signature: v1's request ends (UPDATED), version 2 with its own fee rows, in one transaction",
    (sql(DEMO, `${end(R1, V1, "UPDATED", "status = 'DRAFT', current_version = 2")}; ${ver(V2, R1, 2)}; ${fee(u(605), V2, 1, "300000")}; select 1`), state(R1) === "DRAFT:2"));
  ok("FO-5 fail: a request ends once; an ended_at without its reason is refused; the version count does not jump",
    refused(DEMO, `update fo_retainer_version set end_reason = 'WITHDRAWN' where id = '${V1}'`, /a request ends once/)
    && refused(DEMO, `update fo_retainer_version set ended_at = now() where id = '${V2}'`, /fo_retainer_version_end_check/)
    && refused(DEMO, `update fo_retainer set current_version = 4 where id = '${R1}'`, /current_version moves from 2 to 3, not 4/));
  ok("FO-5 pass: version 1 still holds its own values and fee (a later edit never alters it, AG-5-3)",
    sql(DEMO, `select merge_values->>'client.name' || ':' || (select string_agg(amount_minor::text, ',' order by position) from fo_retainer_fee_row where version_id = '${V1}') from fo_retainer_version where id = '${V1}'`) === "Client A:250000");

  // A draft is edited, never stuck (review M1, break B-12): template, subject and signer change with a new version.
  const R5 = u(406), V51 = u(520), V52 = u(521), V53 = u(522);
  draft(R5, V51, { prospect: P5 });
  ok("FO-5 fail: a draft's template, signer or subject does not change without a new version",
    refused(DEMO, `update fo_retainer set template_id = '${TD}', template_version = 1, template_file_key = '${KEY(TD, 1)}' where id = '${R5}'`, /change only by an edit/)
    && refused(DEMO, `update fo_retainer set signer_person_id = '${u(311)}' where id = '${R5}'`, /change only by an edit/));
  ok("FO-5 fail: an edit to an inactive template, an older version of it, or a CONSULTATION template is refused",
    (sql(DEMO, `update fo_retainer_template set active = false where id = '${TD}'`), refused(DEMO, `update fo_retainer set template_id = '${TD}', template_version = 1, template_file_key = '${KEY(TD, 1)}', current_version = 2 where id = '${R5}'`, /inactive template/))
    && sql(DEMO, `update fo_retainer_template set active = true where id = '${TD}' returning 1`) === "1"
    && refused(DEMO, `update fo_retainer set template_version = 1, template_file_key = '${KEY(TA, 1)}', current_version = 2 where id = '${R5}'`, /current version \(2\) and its file, not version 1/)
    && refused(DEMO, `update fo_retainer set template_id = '${TC}', template_version = 1, template_file_key = '${KEY(TC, 1)}', current_version = 2 where id = '${R5}'`, /a CONSULTATION template cannot make a RETAINER/));
  ok("FO-5 pass: a draft switches to another template, then to another signer and to a company subject, each with a new version (M1)",
    (sql(DEMO, `update fo_retainer set template_id = '${TD}', template_version = 1, template_file_key = '${KEY(TD, 1)}', current_version = 2 where id = '${R5}'; ${ver(V52, R5, 2)}; select 1`),
     sql(DEMO, `update fo_retainer set signer_person_id = '${u(311)}', subject = 'COMPANY', company_id = '${CO}', current_version = 3 where id = '${R5}'; ${ver(V53, R5, 3)}; select 1`),
     sql(DEMO, `select status || ':' || current_version || ':' || template_id || ':' || subject from fo_retainer where id = '${R5}'`) === `DRAFT:3:${TD}:COMPANY`));
  ok("FO-5 fail: an older, never-sent version is not sent or ended once a newer one exists (B-7: one open request)",
    refused(DEMO, `update fo_retainer_version set sent_at = now() where id = '${V51}'`, /only the current version \(3\) is sent or ended, not version 1/)
    && refused(DEMO, `update fo_retainer_version set ended_at = now(), end_reason = 'UPDATED' where id = '${V52}'`, /only the current version \(3\) is sent or ended, not version 2/));
  ok("FO-5 pass: Signed offline straight from a draft (the unsent request ends SIGNED_OFFLINE; BR-11)",
    (sql(DEMO, `${end(R5, V53, "SIGNED_OFFLINE", `status = 'SIGNED_OFFLINE', offline_at = now(), offline_by = 'staff:${staffR}', offline_reason = 'Signed at the office', offline_file_key = 'retainers/${R5}/signed-offline.pdf', offline_file_sha256 = '${hex(76)}'`)}; select 1`), state(R5) === "SIGNED_OFFLINE:3"));

  // Client signed: no edit (AG-5-65); withdraw needs a reason; Signed offline needs its file, reason and actor, and is final.
  sql(DEMO, `${send(R1, V2)}; update fo_retainer set status = 'VIEWED' where id = '${R1}'; update fo_retainer set status = 'CLIENT_SIGNED' where id = '${R1}'`);
  ok("FO-5 pass: SENT → VIEWED → CLIENT_SIGNED with the request open", state(R1) === "CLIENT_SIGNED:2");
  ok("FO-5 fail: an edit after the client signed is refused (AG-5-65), and CLIENT_SIGNED never expires (BR-16)",
    refused(DEMO, `${end(R1, V2, "UPDATED", "status = 'DRAFT', current_version = 3")}`, /request of a CLIENT_SIGNED|status cannot move from CLIENT_SIGNED to DRAFT/)
    && refused(DEMO, `update fo_retainer set status = 'DRAFT', current_version = 3 where id = '${R1}'`, /status cannot move from CLIENT_SIGNED to DRAFT/)
    && refused(DEMO, `${end(R1, V2, "EXPIRED", "status = 'EXPIRED'")}`, /status cannot move from CLIENT_SIGNED to EXPIRED/));
  const withdraw = (r: string, v: string, reason: string) => end(r, v, "WITHDRAWN", `status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = 'staff:${staffR}', withdrawn_reason = ${reason}`);
  ok("FO-5 fail: withdraw without a reason, with a blank or line-break-only one, one over 200 characters, or a blank actor, is refused (AG-5-34, B-14)",
    refused(DEMO, `${end(R1, V2, "WITHDRAWN", `status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = 'staff:x'`)}`, /fo_retainer_withdrawn_check/)
    && ["'   '", "E'\\n\\t'", "repeat('x', 201)"].every((r) => refused(DEMO, withdraw(R1, V2, r), /fo_retainer_withdrawn_check/))
    && refused(DEMO, withdraw(R1, V2, "'x'").replace(`withdrawn_by = 'staff:${staffR}'`, "withdrawn_by = ''"), /fo_retainer_actors_check/));
  ok("FO-5 fail: WITHDRAWN while the request is still open is refused at commit (B-9)",
    refused(DEMO, `update fo_retainer set status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = 'staff:x', withdrawn_reason = 'x' where id = '${R1}'`, /a WITHDRAWN retainer's current version 2 has request sent t, ended f/));
  const offline = (r: string, v: string, over: Record<string, string> = {}) => {
    const cols: Record<string, string> = { status: "'SIGNED_OFFLINE'", offline_at: "now()", offline_by: `'staff:${staffR}'`, offline_reason: "'Signed at the office'", offline_file_key: `'retainers/${r}/signed-offline.pdf'`, offline_file_sha256: `'${hex(77)}'`, ...over };
    return end(r, v, "SIGNED_OFFLINE", Object.entries(cols).map(([k, x]) => `${k} = ${x}`).join(", "));
  };
  ok("FO-5 fail: Signed offline without the PDF, without a reason, with a bad hash or another retainer's file key is refused (AG-5-39, AG-5-47)",
    refused(DEMO, offline(R1, V2, { offline_file_key: "null" }), /fo_retainer_offline_check/)
    && refused(DEMO, offline(R1, V2, { offline_reason: "null" }), /fo_retainer_offline_check/)
    && refused(DEMO, offline(R1, V2, { offline_file_sha256: "'nope'" }), /fo_retainer_offline_check/)
    && refused(DEMO, offline(R1, V2, { offline_file_key: `'retainers/${R5}/signed-offline.pdf'` }), /fo_retainer_offline_check/));
  ok("FO-5 pass: Signed offline from Client signed, with its file, reason and actor", (sql(DEMO, `${offline(R1, V2)}; select 1`), state(R1) === "SIGNED_OFFLINE:2"));
  ok("FO-5 fail: a Signed offline retainer cannot be undone, withdrawn or changed, and its request does not change (final)",
    refused(DEMO, `update fo_retainer set status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = 'staff:x', withdrawn_reason = 'x' where id = '${R1}'`, /a SIGNED_OFFLINE retainer does not change/)
    && refused(DEMO, `update fo_retainer set offline_reason = 'changed' where id = '${R1}'`, /a SIGNED_OFFLINE retainer does not change/));

  // Withdraw from SENT and from CLIENT_SIGNED with a reason frees the prospect; WITHDRAWN and SIGNED are final; a DECLINED
  // or EXPIRED one comes back to DRAFT only by an edit (AG-5-65 r1); a DRAFT is not withdrawn (BR-10).
  const R3 = u(404), R4 = u(405), R6 = u(407), R7 = u(408);
  draft(R3, u(510), { prospect: P3 });
  sql(DEMO, send(R3, u(510)));
  ok("FO-5 fail: a DRAFT retainer is not withdrawn (BR-10)", refused(DEMO, withdraw(u(403), u(505), "'x'"), /status cannot move from DRAFT to WITHDRAWN/));
  ok("FO-5 pass: withdraw from SENT with a reason; the prospect then takes a new retainer",
    (sql(DEMO, `${withdraw(R3, u(510), "'Client changed plans'")}; select 1`), state(R3) === "WITHDRAWN:1") && draft(R4, u(511), { prospect: P3 }) === "1");
  ok("FO-5 fail: a WITHDRAWN retainer does not change, and its request does not change",
    refused(DEMO, `update fo_retainer set withdrawn_reason = 'other' where id = '${R3}'`, /a WITHDRAWN retainer does not change/)
    && refused(DEMO, `update fo_retainer_version set sent_at = now() where id = '${u(510)}'`, /sent_at is set once/));
  sql(DEMO, `${send(R4, u(511))}`);
  sql(DEMO, end(R4, u(511), "DECLINED", "status = 'DECLINED'"));
  ok("FO-5 fail: a DECLINED retainer keeps the prospect (no second live one) and does not go back to SENT",
    refused(DEMO, `${ret(u(409), { prospect: P3 })}; ${ver(u(530), u(409), 1)}`, /fo_retainer_one_live_per_prospect/) && refused(DEMO, `update fo_retainer set status = 'SENT' where id = '${R4}'`, /status cannot move from DECLINED to SENT/));
  ok("FO-5 pass: Edit and resend from DECLINED makes version 2 (AG-5-65 r1)",
    (sql(DEMO, `update fo_retainer set status = 'DRAFT', current_version = 2 where id = '${R4}'; ${ver(V3, R4, 2)}; select 1`), state(R4) === "DRAFT:2"));
  draft(R6, u(512), { prospect: P6 });
  sql(DEMO, send(R6, u(512)));
  sql(DEMO, end(R6, u(512), "EXPIRED", "status = 'EXPIRED'"));
  ok("FO-5 pass: Edit and resend from EXPIRED makes version 2 while no other retainer took the prospect", (sql(DEMO, `update fo_retainer set status = 'DRAFT', current_version = 2 where id = '${R6}'; ${ver(u(513), R6, 2)}; select 1`), state(R6) === "DRAFT:2"));
  sql(DEMO, `${send(R6, u(513))}; update fo_retainer set status = 'CLIENT_SIGNED' where id = '${R6}'`);
  ok("FO-5 pass: withdraw from CLIENT_SIGNED with a reason (BR-10)", (sql(DEMO, `${withdraw(R6, u(513), "'Firm cannot act'")}; select 1`), state(R6) === "WITHDRAWN:2"));
  draft(R7, u(514), { prospect: u(305) });
  sql(DEMO, `${send(R7, u(514))}; update fo_retainer set status = 'CLIENT_SIGNED' where id = '${R7}'; update fo_retainer set status = 'SIGNED' where id = '${R7}'`);
  ok("FO-5 pass: CLIENT_SIGNED → SIGNED (FO-6's completion) with the request open", state(R7) === "SIGNED:1");
  ok("FO-5 fail: a SIGNED retainer does not change, and its request is not ended later (B-9)",
    refused(DEMO, `update fo_retainer set status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = 'staff:x', withdrawn_reason = 'x' where id = '${R7}'`, /a SIGNED retainer does not change/)
    && refused(DEMO, `update fo_retainer_version set ended_at = now(), end_reason = 'DECLINED' where id = '${u(514)}'`, /the request of a SIGNED retainer does not change/));
  ok("FO-5 fail: a fee row names firm B's version → refused (composite key)", refused(DEMO, `${ret(u(401), { prospect: P2 })}; ${ver(u(506), u(401), 1)}; ${fee(u(606), u(506), 1).replace(`'${firmA}'`, `'${firmB}'`)}`, /fo_retainer_fee_row_firm_id_version_id_fkey/));
  ok("FO-5 fail: firm_id of a retainer never changes", refused(DEMO, `update fo_retainer set firm_id = '${firmB}' where id = '${R4}'`, /firm_id and id never change/));

  // ===================================================================================== part 2: the service and routes
  // A third database ("api"): every migration, the Sample firms and staff (PF-3's seed: user-R Owner + Case Manager with a
  // licence, user-T Case Manager with a licence, user-O Case Officer without one; firm B's user-S) and their front office
  // (FO-1a's seed). The real FilesPort (a scratch folder) and DocumentRenderPort (docxtemplater); the clock is the test's.
  for (const d of all) psql(API, ["-f", join(MIG, d, "migration.sql")]);
  const db = client(API);
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(API, `select id from platform_firm where key='sample-firm'`), B = sql(API, `select id from platform_firm where key='sample-solo'`);
  const sid = (actor: string) => sql(API, `select id from platform_staff where actor_id='${actor}'`);
  const ctxOf = (actor: string, firmId: string, firmKey: string): StaffContext => ({ staffId: sid(actor), firmId, firmKey, roles: [], keys: [], duties: [], authTime: 0, via: "local" });
  const R = ctxOf("user-R", A, "sample-firm"), T = ctxOf("user-T", A, "sample-firm"), O = ctxOf("user-O", A, "sample-firm"), S = ctxOf("user-S", B, "sample-solo");
  let nowMs = Date.parse("2026-11-24T14:00:00Z");
  const clock = { now: () => nowMs };
  const store = new LocalFiles(join(WORK, "files")), links = new FileLinks("test-link-key-0123456789abcdef");
  const svc = new Retainers(db, store, clock);
  clearingConflicts(db, { retainers: Retainers.prototype });   // FO-13c: the conflict check first
  // An edit sends the version the page shows (the stale-save rule): the retainer's current one, read just before.
  const cv = async (id: string) => (await db.foRetainer.findUnique({ where: { id } }))?.currentVersion ?? 1;
  const sd = async (c: StaffContext, id: string) => svc.send(c, id, { expectedVersion: await cv(id) });
  const so = async (s: Retainers, c: StaffContext, id: string, body: Record<string, unknown>, file?: { bytes: Uint8Array; size: number }) =>
    s.signedOffline(c, id, { expectedVersion: String(await cv(id)), ...body }, file);
  // FO-5f item 2 (B-25): Edit and Withdraw also send the status the page shows.
  const shown = async (id: string) => { const x = await db.foRetainer.findUnique({ where: { id } }); return { expectedVersion: x?.currentVersion ?? 1, expectedStatus: x?.status ?? "DRAFT" }; };
  const ed = async (s: Retainers, c: StaffContext, id: string, body: Record<string, unknown>) => s.edit(c, id, { ...(await shown(id)), ...body });
  const wdr = async (c: StaffContext, id: string, body: Record<string, unknown>) => svc.withdraw(c, id, { ...(await shown(id)), ...body });
  const fails = async (f: () => Promise<unknown>, status: number, re: RegExp = /./) => {
    try { await f(); return false; } catch (e) {
      const r = (e as { getResponse?: () => Record<string, unknown>; getStatus?: () => number });
      const body = JSON.stringify(r.getResponse?.() ?? String(e));
      const okay = r.getStatus?.() === status && re.test(body);
      if (!okay) console.log(`      (refused ${r.getStatus?.()}: ${body.slice(0, 300)})`);
      return okay;
    }
  };
  const docx = (lines: string[]) => ({ bytes: buildDocx(lines), size: 1000 });
  const pdf = (s = "signed") => { const b = Buffer.from(`%PDF-1.4\n% ${s}\n%%EOF\n`); return { bytes: new Uint8Array(b), size: b.length }; };
  const audits = (key: string) => Number(sql(API, `select count(*) from audit_event where entity_key = '${key}'`));
  const events = (type: string, key: string) => Number(sql(API, `select count(*) from module_event where type = '${type}' and subject_id = '${key}'`));

  // PF-0c: the real FilesPort (a fresh scratch folder each time) and DocumentRenderPort run their shared contracts.
  await runContract(filesPortContract, "LocalFiles", () => new LocalFiles(join(WORK, "pf0c-files", crypto.randomUUID())), ok);
  await runContract(documentRenderPortContract, "DocxRender", () => ({ render: new DocxRender(async (k) => (k === "retainer.starter" ? starterFrame() : null)), template: "retainer.starter", data: { lines: [{ text: "Client A", n: 1 }], firm: "sample-firm" }, reordered: { firm: "sample-firm", lines: [{ n: 1, text: "Client A" }] }, other: { lines: [{ text: "Client B", n: 1 }], firm: "sample-firm" }, text: (b: Uint8Array) => new PizZip(b).file("word/document.xml")?.asText().replace(/<[^>]+>/g, "") ?? "" }), ok);

  // Templates (BR-1).
  const GOOD = ["# Retainer", "Client: {client.name} ({client.email})", "Representative: {representative.name}", "{#fees}", "{label}: {amount} ({when}{due_on})", "{/fees}", "Total {fees.total}"];
  ok("FO-5 pass: the known placeholder list names client.name and fees as must-fill", (() => { const p = svc.placeholders().placeholders; return p.find((x) => x.name === "client.name")?.mustFill && p.find((x) => x.name === "fees")?.mustFill && p.length >= 15; })());
  const tplA = await svc.uploadTemplate(R, { name: "Standard retainer" }, docx(GOOD));
  ok("FO-5 pass: a template with known placeholders is accepted with no warning, version 1 (BR-1)", tplA.version === 1 && tplA.warnings.length === 0 && tplA.placeholders.includes("fees.amount"), tplA);
  ok("FO-5 fail: a template with an unknown placeholder is refused with its name (BR-1)", await fails(() => svc.uploadTemplate(R, { name: "Bad" }, docx(["{client.passport} {client.name}"])), 422, /\{client\.passport\} is not a placeholder we know/));
  const noFee = await svc.uploadTemplate(R, { name: "No fee" }, docx(["Client {client.name}"]));
  ok("FO-5 pass: a template without a fee placeholder is accepted with a warning (BR-1)", noFee.warnings.some((w) => /never prints the fee/.test(w)), noFee);
  ok("FO-5 fail: an unreadable file is refused with \"We could not read this file.\"", await fails(() => svc.uploadTemplate(R, { name: "Junk" }, { bytes: new Uint8Array([80, 75, 3, 4, 1, 2]), size: 6 }), 422, /We could not read this file\./));
  ok("FO-5 fail: a broken placeholder ({client.name with no close) is also unreadable", await fails(() => svc.uploadTemplate(R, { name: "Broken" }, docx(["{client.name"])), 422, /UNREADABLE_FILE/));
  ok("FO-5 fail: the same name twice in the firm is refused", await fails(() => svc.uploadTemplate(R, { name: "standard RETAINER" }, docx(GOOD)), 409, /NAME_TAKEN/));
  await svc.changeTemplate(R, noFee.id, { active: false });
  const st = await svc.starter();
  const starterPh = await placeholdersOf(st.bytes);
  ok("FO-5 pass: the starter is a .docx built at run time from the committed text, Sample, with the fee loop and only known placeholders (M5)",
    st.contentType === DOCX && /Unconfirmed: no counsel/.test(st.note) && starterPh.includes("fees.label") && starterPh.includes("client.name") && checkPlaceholders(starterPh).unknown.length === 0 && checkPlaceholders(starterPh).warnings.length === 0, starterPh);

  // People and prospects (FO-1a's tables).
  const person = (id: string, given: string | null, email: string | null) => sql(API, `insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${id}', '${A}', ${given ? `'${given}'` : "null"}, ${given ? "'Sample'" : "null"}, ${email ? `'${email}'` : "null"}, 'test', now())`);
  const stage = (pipe: string, key: string, f = A) => sql(API, `select id from fo_stage where firm_id = '${f}' and pipeline = '${pipe}' and key = '${key}'`);
  let n = 900;
  const prospect = (p: string, owner: string | null, corp?: { company: string; contact: string }, f = A) => {
    const L = u(n++), id = u(n++);
    sql(API, `insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values ('${L}', '${f}', '${corp?.contact ?? p}', 'MANUAL', 'WEBSITE', 'test', now()); update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where id = '${L}'`);
    sql(API, corp
      ? `insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values ('${id}', '${f}', '${L}', 'CORPORATE', '${stage("CORPORATE", "ENGAGED", f)}', '${corp.company}', '${corp.contact}', ${owner ? `'${owner}'` : "null"}, 'test', now())`
      : `insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values ('${id}', '${f}', '${L}', 'INDIVIDUAL', '${stage("INDIVIDUAL", "ENGAGED", f)}', '${p}', '${p}', ${owner ? `'${owner}'` : "null"}, 'test', now())`);
    sql(API, `insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);   // Engage's first move
    return id;
  };
  const PA = u(800), PNONAME = u(801);
  person(PA, "Client A", "client.a@example.com"); person(PNONAME, null, "no.name@example.com");
  const PROS = prospect(PA, R.staffId), PROS2 = prospect(PNONAME, R.staffId);

  // AG-5-49: no active licensed person → no draft.
  sql(API, `update platform_staff set status = 'DEACTIVATED' where firm_id = '${A}' and actor_id in ('user-R', 'user-T')`);
  ok("FO-5 fail: with no active licensed person there is no draft: \"No active licensed consultant\" (AG-5-49)", await fails(() => svc.draft(O, PROS, { templateId: tplA.id }), 409, /No active licensed consultant/));
  sql(API, `update platform_staff set status = 'ACTIVE' where firm_id = '${A}' and actor_id in ('user-R', 'user-T')`);
  ok("FO-5 pass: the representatives are the active people with a licence and the case-manager keys (user-R, user-T; not user-O)",
    JSON.stringify((await svc.representatives(A)).map((x) => x.staffId).sort()) === JSON.stringify([R.staffId, T.staffId].sort()));
  ok("FO-5 fail: a case officer without a licence is not a representative", await fails(() => svc.draft(R, PROS, { templateId: tplA.id, representativeStaffId: O.staffId }), 422, /Not eligible to represent/));
  ok("FO-5 fail: a switched-off template is not offered for a draft (BR-1)", await fails(() => svc.draft(R, PROS, { templateId: noFee.id }), 422, /Switched off/));

  // Draft (preparer R is eligible: pre-selected, BR-3), the default fee row (BR-5), audit line and event.
  const d1 = await svc.draft(R, PROS, { templateId: tplA.id });
  const RA1 = d1.id;
  ok("FO-5 pass: a draft from a prospect: DRAFT, version 1, the preparer as representative, one \"Deposit on signing\" row with no amount (BR-2, BR-3, BR-5)",
    d1.status === "DRAFT" && d1.version.n === 1 && d1.representativeStaffId === R.staffId && d1.version.fees.length === 1 && d1.version.fees[0].label === "Deposit on signing" && d1.version.fees[0].amountMinor === null && d1.template.version === 1, d1);
  ok("FO-5 pass: the draft wrote one audit line and the retainer.drafted event", audits(RA1) === 1 && events(EVENT.RETAINER_DRAFTED, RA1) === 1);

  // AG-5-9: only the client name and the fee block Send; everything else shows "missing".
  ok("FO-5 pass: the draft lists the fee as blocking and the phone only as missing (BR-6)", d1.blockers.fees === "Fee is missing. Add a fee row." && !d1.blockers["client.name"] && d1.canSend === false && Array.isArray(d1.missing), d1);
  ok("FO-5 fail: Send with the fee empty is refused at the field (AG-5-9)", await fails(() => sd(R, RA1), 422, /"fees":"Fee is missing\. Add a fee row\."/));
  const dNo = await svc.draft(R, PROS2, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 100000, when: "ON_SIGNING" }] });
  ok("FO-5 fail: Send with the client name empty is refused at the field (AG-5-9)", await fails(() => sd(R, dNo.id), 422, /"client\.name":"Client name is missing\."/));

  // Fee rows (BR-5, money): cents, CAD, dates only for ON_DATE.
  ok("FO-5 fail: a negative fee, a fee over CAD 100 million, a fraction of a cent, or a date on an \"On signing\" row is refused",
    await fails(() => ed(svc, R, RA1, { fees: [{ label: "x", amountMinor: -1 }] }), 422, /cents/)
    && await fails(() => ed(svc, R, RA1, { fees: [{ label: "x", amountMinor: "10000000001" }] }), 422, /cents/)
    && await fails(() => ed(svc, R, RA1, { fees: [{ label: "x", amountMinor: 10.5 }] }), 422, /cents/)
    && await fails(() => ed(svc, R, RA1, { fees: [{ label: "x", amountMinor: 1, when: "ON_SIGNING", dueOn: "2027-01-01" }] }), 422, /On a date/));
  const e2 = await ed(svc, R, RA1, { fees: [{ label: "Professional fee", amountMinor: 250000, when: "ON_SIGNING" }, { label: "Balance", amountMinor: 125050, when: "ON_DATE", dueOn: "2027-01-15" }] });
  ok("FO-5 pass: an edit of a draft makes version 2 with its fee rows in cents, CAD, and the total (BR-5)",
    e2.version.n === 2 && e2.version.fees.map((f) => `${f.amountMinor}:${f.currency}:${f.when}:${f.dueOn}`).join(",") === "250000:CAD:ON_SIGNING:null,125050:CAD:ON_DATE:2027-01-15" && e2.version.values["fees.total"] === "CAD 3,750.50" && e2.canSend, e2);

  // AG-5-3: values are copied into the version; a later change to the person never alters it.
  sql(API, `update fo_person set given_names = 'Renamed' where id = '${PA}'`);
  const again = await svc.read(R, RA1);
  ok("FO-5 pass: a later change to the person leaves version 2's values as they were (AG-5-3)", again.version.values["client.name"] === "Client A Sample", again.version.values);
  ok("FO-5 fail: the new name is not in version 2 (it comes only with a new version)", again.version.values["client.name"] !== "Renamed Sample");

  // original_sha256 matches the stored file.
  const v2 = await db.foRetainerVersion.findFirstOrThrow({ where: { retainerId: RA1, n: 2 } });
  const f2 = await store.get(A, v2.fileKey);
  ok("FO-5 pass: original_sha256 matches the stored file's bytes", !!f2 && (await sha256Hex(f2.bytes)) === v2.originalSha256 && /Client A Sample/.test(textOf(f2.bytes)) && /CAD 2,500\.00/.test(textOf(f2.bytes)));
  ok("FO-5 fail: other bytes under the same key are refused (a stored document never changes)", await (async () => { try { await store.put(A, v2.fileKey, new Uint8Array([1, 2, 3]), DOCX); return false; } catch (e) { return e instanceof FileKeyTaken; } })());
  ok("FO-5 fail: firm B cannot read firm A's file under the same key", (await store.get(B, v2.fileKey)) === null);

  // Send, then an edit before any signature: version 3, version 2's request ends (BR-9).
  const sent = await sd(R, RA1);
  ok("FO-5 pass: Send with the client name and a fee: SENT, the request open, one audit line and retainer.sent", sent.status === "SENT" && !!sent.version.sentAt && events(EVENT.RETAINER_SENT, RA1) === 1);
  ok("FO-5 fail: Send of a sent retainer is refused (only a draft is sent)", await fails(() => sd(R, RA1), 409, /NOT_DRAFT/));
  const e3 = await ed(svc, R, RA1, { signerPersonId: PA });
  const ended = e3.versions.find((v) => v.n === 2)!;
  ok("FO-5 pass: an edit before any signature makes version 3 and ends version 2's request (UPDATED), back to DRAFT (BR-9)", e3.version.n === 3 && e3.status === "DRAFT" && !!ended.endedAt && ended.endReason === "UPDATED", e3.versions);
  ok("FO-5 pass: the new version takes the person's current name", e3.version.values["client.name"] === "Renamed Sample");

  // AG-5-65: once the client signed, edit is refused; withdraw needs a reason; signed → no withdraw.
  await sd(R, RA1);
  sql(API, `update fo_retainer set status = 'CLIENT_SIGNED' where id = '${RA1}'`);   // FO-6's signing hook
  ok("FO-5 fail: an edit after the client signed is refused (AG-5-65)", await fails(() => ed(svc, R, RA1, { fees: [{ label: "x", amountMinor: 1 }] }), 409, /can no longer be edited/));
  ok("FO-5 fail: withdraw without a reason, or with only spaces, is refused (AG-5-34)", await fails(() => wdr(R, RA1, {}), 422, /reason/) && await fails(() => wdr(R, RA1, { reason: "   " }), 422, /reason/));

  // Signed offline (BR-11): needs a PDF and a reason; makes the prospect WON once; cannot be undone.
  ok("FO-5 fail: Signed offline without a file, without a reason, or with a file that is not a PDF is refused (AG-5-39, AG-5-47)",
    await fails(() => so(svc, R, RA1, { reason: "Signed at the office" }, undefined), 422, /signed PDF/)
    && await fails(() => so(svc, R, RA1, {}, pdf()), 422, /reason/)
    && await fails(() => so(svc, R, RA1, { reason: "x" }, { bytes: new Uint8Array(Buffer.from("not a pdf")), size: 9 }), 422, /A PDF only/)
    && await fails(() => so(svc, R, RA1, { reason: "x" }, { bytes: pdf().bytes, size: OFFLINE_PDF_MAX_BYTES + 1 }), 422, /At most 10 MB/));
  const off = await so(svc, R, RA1, { reason: "Signed at the office" }, pdf());
  ok("FO-5 pass: Signed offline from Client signed: SIGNED_OFFLINE, filed \"Signed on paper\", the prospect WON via SIGNED_OFFLINE with one stage move",
    off.status === "SIGNED_OFFLINE" && off.signedOffline?.filed === "Signed on paper" && off.prospectWon === true
    && sql(API, `select s.kind || ':' || p.won_via from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${PROS}'`) === "WON:SIGNED_OFFLINE"
    && sql(API, `select count(*) from fo_stage_move where prospect_id = '${PROS}' and cause = 'SIGNED_OFFLINE'`) === "1", off);
  ok("FO-5 fail: Signed offline again, or withdraw after it, is refused (cannot be undone), and the prospect is won once",
    await fails(() => so(svc, R, RA1, { reason: "again" }, pdf("again")), 409, /already signed/)
    && await fails(() => wdr(R, RA1, { reason: "changed mind" }), 409, /A signed agreement cannot be withdrawn/)
    && sql(API, `select count(*) from fo_stage_move where prospect_id = '${PROS}' and cause = 'SIGNED_OFFLINE'`) === "1");
  ok("FO-5 fail: a won prospect takes no new retainer", await fails(() => svc.draft(R, PROS, { templateId: tplA.id }), 409, /PROSPECT_CLOSED/));

  // Withdraw (BR-10) from Sent with a reason; a draft is not withdrawn; Edit and resend from Declined (AG-5-65 r1).
  const PB = u(802); person(PB, "Client B", "client.b@example.com");
  const PROSB = prospect(PB, R.staffId);
  const w = await svc.draft(R, PROSB, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 50000 }] });
  ok("FO-5 fail: a draft is not withdrawn (BR-10)", await fails(() => wdr(R, w.id, { reason: "x" }), 409, /draft has not been sent/));
  await sd(R, w.id);
  const wd = await wdr(R, w.id, { reason: "Client changed plans" });
  ok("FO-5 pass: withdraw from Sent with a reason ends the request; retainer.withdrawn written", wd.status === "WITHDRAWN" && wd.versions[0].endReason === "WITHDRAWN" && wd.withdrawn?.reason === "Client changed plans" && events(EVENT.RETAINER_WITHDRAWN, w.id) === 1);
  const w2 = await svc.draft(R, PROSB, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 50000 }] });
  ok("FO-5 pass: after Withdrawn, Prepare retainer is offered again for the prospect (BR-10)", w2.status === "DRAFT");
  await sd(R, w2.id);
  sql(API, `begin; update fo_retainer_version set ended_at = now(), end_reason = 'DECLINED' where retainer_id = '${w2.id}' and n = 1; update fo_retainer set status = 'DECLINED' where id = '${w2.id}'; commit;`);   // FO-6's decline
  const rs = await ed(svc, R, w2.id, { fees: [{ label: "Fee", amountMinor: 45000 }] });
  ok("FO-5 pass: Edit and resend from Declined makes version 2 as a draft (AG-5-65 r1)", rs.status === "DRAFT" && rs.version.n === 2);

  // Corporate (BR-4, AG-5-50): no SIGNATORY → a warning and a pick, never a block; the client name is the company's.
  const COA = u(803), CP = u(804), CS = u(805);
  person(CP, "Primary Person", "primary@example.com"); person(CS, "Signing Person", "signer@example.com");
  sql(API, `insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${COA}', '${A}', 'Sample Bakery Ltd', 'sample bakery', 'test', now()); insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${COA}', '${CP}', 'PRIMARY', 'test'), ('${A}', '${COA}', '${CS}', 'OTHER', 'test')`);
  const PC = prospect(CP, R.staffId, { company: COA, contact: CP });
  const c1 = await svc.draft(R, PC, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1 }] });
  ok("FO-5 pass: a Corporate prospect with no signatory contact still gets a draft, with a warning and the company's contacts to pick from (AG-5-50)",
    c1.status === "DRAFT" && c1.signerPersonId === null && c1.warnings.some((x) => /no signatory/.test(x)) && c1.signerOptions.length === 2 && c1.version.values["client.name"] === "Sample Bakery Ltd", c1);
  ok("FO-5 fail: it cannot be sent until someone who signs is chosen", await fails(() => sd(R, c1.id), 422, /Choose who signs/));
  ok("FO-5 fail: a signer who is not one of the company's contacts is refused", await fails(() => ed(svc, R, c1.id, { signerPersonId: PA }), 422, /company's contacts/));
  const c2 = await ed(svc, R, c1.id, { signerPersonId: CS });
  ok("FO-5 pass: picking a contact as signer makes the retainer sendable; the client name stays the company's (BR-4)", c2.signerPersonId === CS && c2.canSend && c2.version.values["signer.name"] === "Signing Person Sample", c2.blockers);
  sql(API, `insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${COA}', '${CS}', 'SIGNATORY', 'test')`);
  const PC2 = prospect(CP, R.staffId, { company: COA, contact: CP });
  const c3 = await svc.draft(R, PC2, { templateId: tplA.id });
  ok("FO-5 pass: with a SIGNATORY contact the signer is chosen for the person (BR-4)", c3.signerPersonId === CS && c3.warnings.length === 0);

  // Visibility: "everyone sees all" off → the owner and the retainer's representative read it; another case officer does not.
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  const PV = u(806); person(PV, "Private Client", "p@example.com");
  const PROSV = prospect(PV, R.staffId);
  const v = await svc.draft(R, PROSV, { templateId: tplA.id, representativeStaffId: T.staffId });
  ok("FO-5 pass: with everyone-sees-all off, the retainer's representative (user-T, not the owner) reads it and the prospect's header (BR-3)", (await svc.read(T, v.id)).prospect?.id === PROSV);
  ok("FO-5 fail: with everyone-sees-all off, a case officer who does not own the prospect gets 404", await fails(() => svc.read(O, v.id), 404));
  ok("FO-5 pass: the prospect's owner reads it too", (await svc.read(R, v.id)).id === v.id);

  // Firm walls and download links (BR-15).
  ok("FO-5 fail: firm B reading firm A's retainer → 404 (and editing, sending, withdrawing it)",
    await fails(() => svc.read(S, RA1), 404) && await fails(() => ed(svc, S, v.id, {}), 404) && await fails(() => sd(S, v.id), 404) && await fails(() => wdr(S, w.id, { reason: "x" }), 404));
  ok("FO-5 fail: firm B drafting on firm A's prospect → 404", await fails(() => svc.draft(S, PROSB, {}), 404));
  const key = await svc.fileKey(R, RA1, {}), signed = await svc.fileKey(R, RA1, { file: "signed-offline" });
  const l = links.sign(A, R.staffId, key, nowMs);
  ok("FO-5 pass: a download link names the version's file for its firm", "key" in links.check(l.token, A, R.staffId, nowMs) && (links.check(l.token, A, R.staffId, nowMs) as { key: string }).key === key && /signed-offline-[0-9a-f]{12}\.pdf$/.test(signed));
  ok("FO-5 fail: the link is refused for another firm, another person (m7) and altered", (links.check(l.token, B, R.staffId, nowMs) as { refused?: string }).refused === "invalid" && (links.check(l.token, A, O.staffId, nowMs) as { refused?: string }).refused === "invalid" && (links.check(l.token.slice(0, -2) + "AA", A, R.staffId, nowMs) as { refused?: string }).refused === "invalid");
  ok("FO-5 fail: the link expires (Sample 5 minutes)", (links.check(l.token, A, R.staffId, nowMs + 5 * 60_000) as { refused?: string }).refused === "expired");

  // Audit through AuditPort, in the change's transaction: a failed line rolls the change back.
  const failing = new Retainers(db, store, clock, fakeAudit({ failOn: (e) => e.action === "retainer.drafted" }) as never);
  const PF = u(807); person(PF, "Audit Client", "a@example.com");
  const PROSF = prospect(PF, R.staffId);
  ok("FO-5 fail: a forced audit failure rolls the draft back (no retainer, no event)", await (async () => { try { await failing.draft(R, PROSF, { templateId: tplA.id }); return false; } catch { return sql(API, `select count(*) from fo_retainer where prospect_id = '${PROSF}'`) === "0"; } })());
  ok("FO-5 pass: every change wrote one audit line (RA1: the draft, two edits, two sends, Signed offline = 6 lines; refused changes none)", audits(RA1) === 6, audits(RA1));

  // ----------------------------------------------------------------- review round 1 (M1, m3-m9) and break round 1 (B-1..B-15)
  // M1, B-1: a change rolled back after its file was stored never blocks the next attempt (keys carry an attempt suffix).
  const PM = u(808); person(PM, "Rollback Client", "rb@example.com");
  const PROSM = prospect(PM, R.staffId);
  const m0 = await svc.draft(R, PROSM, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1000 }] });
  const failEdit = new Retainers(db, store, clock, fakeAudit({ failOn: (e) => e.action === "retainer.edited" }) as never);
  ok("FO-5 fail (M1, B-1): an edit rolled back after its file was stored leaves the retainer at version 1",
    await (async () => { try { await ed(failEdit, R, m0.id, { fees: [{ label: "Fee", amountMinor: 2000 }] }); return false; } catch { return (await svc.read(R, m0.id)).version.n === 1; } })());
  const m1 = await ed(svc, R, m0.id, { fees: [{ label: "Fee", amountMinor: 3000 }] });
  ok("FO-5 pass (M1, B-1): the next edit succeeds with version 2 (no \"key taken\" from the lost attempt)", m1.version.n === 2 && m1.version.fees[0].amountMinor === "3000");
  await sd(R, m0.id);
  const failOff = new Retainers(db, store, clock, fakeAudit({ failOn: (e) => e.action === "retainer.signed_offline" }) as never);
  ok("FO-5 fail (B-1): Signed offline rolled back after its PDF was stored leaves the retainer SENT",
    await (async () => { try { await so(failOff, R, m0.id, { reason: "Paper" }, pdf("first scan")); return false; } catch { return (await svc.read(R, m0.id)).status === "SENT"; } })());
  ok("FO-5 pass (B-1): Signed offline with another scan then succeeds", (await so(svc, R, m0.id, { reason: "Paper" }, pdf("second scan"))).status === "SIGNED_OFFLINE");
  // B-5: a lost race answers 409, never 500.
  const PX = u(809); person(PX, "Race Client", "race@example.com");
  const PROSX = prospect(PX, R.staffId);
  const x0 = await svc.draft(R, PROSX, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1000 }] });
  const race = await Promise.allSettled([ed(svc, R, x0.id, { fees: [{ label: "A", amountMinor: 1 }] }), ed(svc, R, x0.id, { fees: [{ label: "B", amountMinor: 2 }] })]);
  const lost = race.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason as { getStatus?: () => number });
  ok("FO-5 pass (B-5): of two edits at once one wins (version 2) and a loser, if any, gets 409", (await svc.read(R, x0.id)).version.n >= 2 && lost.every((e) => e.getStatus?.() === 409), lost.map((e) => e.getStatus?.() ?? String(e)));
  // B-2: a zip bomb is refused before it is decompressed.
  const bomb = new PizZip(buildDocx(["{client.name}"])); bomb.file("word/media/pad.xml", " ".repeat(31 * 1024 * 1024));
  ok("FO-5 fail (B-2): a .docx expanding to more than 30 MB is refused as unreadable", await fails(() => svc.uploadTemplate(R, { name: "Bomb" }, { bytes: new Uint8Array(bomb.generate({ type: "uint8array", compression: "DEFLATE" })), size: 40000 }), 422, /UNREADABLE_FILE/));
  // B-3: unknown placeholders anywhere in the package are refused.
  const fn = new PizZip(buildDocx(["{client.name}"])); fn.file("word/footnotes.xml", `<?xml version="1.0"?><w:footnotes xmlns:w="x"><w:footnote><w:p><w:r><w:t>{client.passport}</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  ok("FO-5 fail (B-3): an unknown placeholder in a footnote is refused with its name", await fails(() => svc.uploadTemplate(R, { name: "Footnote" }, { bytes: new Uint8Array(fn.generate({ type: "uint8array" })), size: 2000 }), 422, /client\.passport/));
  // m4: {fees.label} inside the loop names the same field; outside the loop it is refused.
  const loopT = await svc.uploadTemplate(R, { name: "Prefixed loop" }, docx(["{client.name}", "{#fees}", "{fees.label} = {fees.amount}", "{/fees}"]));
  ok("FO-5 pass (m4): {fees.label} inside the fee loop is accepted", loopT.placeholders.includes("fees.label") && !loopT.placeholders.some((x) => x.includes("fees.fees")));
  ok("FO-5 fail (m4): {fees.label} outside the fee loop is refused (it would print nothing)", await fails(() => svc.uploadTemplate(R, { name: "Outside" }, docx(["{client.name} {fees.label}"])), 422, /outside-the-fee-loop/));
  // B-6, B-10, B-12: fee rows and edits.
  ok("FO-5 fail (B-6): an \"On a date\" fee without its date blocks Send", (await ed(svc, R, x0.id, { fees: [{ label: "Later", amountMinor: 500, when: "ON_DATE" }] })).blockers.fees === "A fee due on a date needs its date.");
  ok("FO-5 fail (B-10): an amount given as a list is refused", await fails(() => ed(svc, R, x0.id, { fees: [{ label: "x", amountMinor: [100] }] }), 422, /cents/));
  ok("FO-5 fail (B-12): an edit with nothing to change is refused (no new version)", await fails(() => ed(svc, R, x0.id, {}), 422, /Nothing to change/));
  // B-9: a second Prepare on a prospect with an open retainer: a plain 409, before any rendering.
  ok("FO-5 fail (B-9): a second retainer on a prospect with an open one → 409 RETAINER_OPEN", await fails(() => svc.draft(R, PROSX, { templateId: tplA.id }), 409, /RETAINER_OPEN/));
  // B-11, m3: the representative reads, but does not change, a retainer they cannot otherwise see.
  ok("FO-5 fail (B-11): with everyone-sees-all off the representative (not the owner) cannot edit, send or withdraw → 404",
    await fails(() => ed(svc, T, v.id, { fees: [{ label: "x", amountMinor: 1 }] }), 404) && await fails(() => sd(T, v.id), 404) && await fails(() => wdr(T, v.id, { reason: "x" }), 404));
  // B-4, m9: Send re-checks the representative.
  sql(API, `update platform_role_grant set ended_at = now(), ended_by = 'test', end_reason = 'test' where staff_id = '${T.staffId}' and role = 'CASE_MANAGER' and ended_at is null`);
  const vT = await ed(svc, R, v.id, { fees: [{ label: "Fee", amountMinor: 900 }] }).catch(() => null);
  ok("FO-5 fail (B-4): once the representative lost the case-manager role, the retainer shows it and Send is refused",
    !!vT && /no longer active/.test(vT.blockers.representativeStaffId ?? "") && await fails(() => sd(R, v.id), 422, /representativeStaffId/));
  sql(API, `insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${T.staffId}', 'CASE_MANAGER', 'test')`);
  // B-13, B-14: names and ids.
  ok("FO-5 fail (B-13): a template name with a hidden character, or the same name in another Unicode form, is refused",
    await fails(() => svc.uploadTemplate(R, { name: "Std​retainer" }, docx(GOOD)), 422, /hidden characters/)
    && (await svc.uploadTemplate(R, { name: "Café retainer" }, docx(GOOD)), await fails(() => svc.uploadTemplate(R, { name: "Café retainer" }, docx(GOOD)), 409, /NAME_TAKEN/)));
  ok("FO-5 fail (B-14): a malformed template id → 404 NOT_FOUND (no database error)", await fails(() => svc.changeTemplate(R, "not-a-uuid", { active: false }), 404, /NOT_FOUND/) && await fails(() => svc.read(R, "------------------------------------"), 404, /NOT_FOUND/));
  // B-15: a PDF needs its trailer too.
  ok("FO-5 fail (B-15): a file that only starts like a PDF is refused", await fails(() => so(svc, R, x0.id, { reason: "x" }, { bytes: new Uint8Array(Buffer.from("%PDF-1.4 but nothing else")), size: 25 }), 422, /A PDF only/));
  // Migration 20261115010000: a key may carry one attempt suffix of 12 lower-case hex characters, nothing else.
  const TS = u(110);
  ok("FO-5 pass (migration 20261115010000): a template key with an attempt suffix is accepted, the part 1 form too",
    sql(API, `insert into fo_retainer_template (id, firm_id, name, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TS}', '${A}', 'Suffix check', 'retainer-templates/${TS}/v1-0123456789ab.docx', '${hex(1)}', '{}', 'seed:FO-5', 'seed:FO-5', now()) returning version`) === "1");
  ok("FO-5 fail (migration 20261115010000): a suffix that is not 12 lower-case hex characters, or another template's key, is refused",
    ["v1-XYZ.docx", "v1-0123456789AB.docx", "v1-0123456789ab-0123456789ab.docx", "v1-0123456789a.docx"].every((k) => refused(API, `update fo_retainer_template set version = 2, file_key = 'retainer-templates/${TS}/${k.replace("v1", "v2")}' where id = '${TS}'`, /fo_retainer_template_file_key_check/))
    && refused(API, `update fo_retainer_template set version = 2, file_key = 'retainer-templates/${tplA.id}/v2-0123456789ab.docx' where id = '${TS}'`, /fo_retainer_template_file_key_check/));
  // m6, B-7: the file store.
  ok("FO-5 fail (m6): the same key with another content type, or a key ending .meta, is refused",
    await (async () => { try { await store.put(A, "t/x.bin", new Uint8Array([1]), "text/plain"); await store.put(A, "t/x.bin", new Uint8Array([1]), "application/pdf"); return false; } catch (e) { return e instanceof FileKeyTaken; } })()
    && await (async () => { try { await store.put(A, "t/x.bin.meta", new Uint8Array([1]), "text/plain"); return false; } catch (e) { return /\.meta/.test(String(e)); } })());
  ok("FO-5 pass (B-7): the file store lives under the copy's own STUDIO_VAR", (() => { const had = process.env.STUDIO_VAR; process.env.STUDIO_VAR = "/tmp/fo5-var-check"; try { return new LocalFiles().root === "/tmp/fo5-var-check/front-office-files"; } finally { if (had === undefined) delete process.env.STUDIO_VAR; else process.env.STUDIO_VAR = had; } })());

  // ----------------------------------------------------------------- review round 2 (r2-M1, r2-m1, r2-m2) and break round 2 (B-16..B-19)
  // B-17, r2-M1: a part whose declared size lies is inflated here under a hard cap, so it costs no more than the limit.
  const liar = (() => {
    const z = new PizZip(buildDocx(["{client.name}"])); z.file("word/media/pad.xml", " ".repeat(64 * 1024 * 1024));
    const b = Buffer.from(z.generate({ type: "uint8array", compression: "DEFLATE" })), big = 64 * 1024 * 1024;
    for (let i = 0; i + 4 <= b.length; i++) {
      if (b.readUInt32LE(i) === 0x04034b50 && b.readUInt32LE(i + 22) === big) b.writeUInt32LE(1000, i + 22);
      if (b.readUInt32LE(i) === 0x02014b50 && b.readUInt32LE(i + 24) === big) b.writeUInt32LE(1000, i + 24);
    }
    return new Uint8Array(b);
  })();
  const t0 = Date.now();
  ok("FO-5 fail (B-17, r2-M1): a .docx whose part lies about its size (64 MB declared as 1000 bytes) is refused within the limit's cost",
    await fails(() => svc.uploadTemplate(R, { name: "Liar" }, { bytes: liar, size: liar.length }), 422, /UNREADABLE_FILE/) && Date.now() - t0 < 5000, Date.now() - t0);
  // B-18: Word's own field codes, citation data and tracked deletions are not text and do not count as placeholders.
  const wordish = new PizZip(buildDocx(["{client.name}", "{#fees}{label}{/fees}"]));
  const doc = wordish.file("word/document.xml")!.asText().replace("<w:sectPr/>", `<w:p><w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"x"} </w:instrText></w:r><w:del><w:r><w:delText>{old.tag}</w:delText></w:r></w:del></w:p><w:sectPr/>`);
  wordish.file("word/document.xml", doc); wordish.file("customXml/item1.xml", `<b:Sources xmlns:b="x"><b:Source><b:Guid>{3F2504E0-4F89-11D3-9A0C-0305E82C3301}</b:Guid></b:Source></b:Sources>`);
  ok("FO-5 pass (B-18): a template with a citation field code, a bibliography GUID and a tracked deletion is accepted",
    (await svc.uploadTemplate(R, { name: "Word fields" }, { bytes: new Uint8Array(wordish.generate({ type: "uint8array" })), size: 3000 })).placeholders.join(",") === "client.name,fees,fees.label");
  // B-3 rest: a Word part declared under any name is read.
  const hidden = new PizZip(buildDocx(["{client.name}"]));
  hidden.file("[Content_Types].xml", hidden.file("[Content_Types].xml")!.asText().replace("</Types>", `<Override PartName="/word/hdr1.bin" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`));
  hidden.file("word/hdr1.bin", `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>{client.passport}</w:t></w:r></w:p></w:hdr>`);
  ok("FO-5 fail (B-3): a header declared under a non-.xml name is refused (FO-5f2 item 1: not its standard place)", await fails(() => svc.uploadTemplate(R, { name: "Hidden header" }, { bytes: new Uint8Array(hidden.generate({ type: "uint8array" })), size: 2000 }), 422, /PARTS_NOT_ALLOWED/));
  // B-19: a bounded number of placeholders, and a short refusal.
  ok("FO-5 fail (B-19): a template with more than 2000 placeholders is refused, saying why (FO-5f item 5)", await fails(() => svc.uploadTemplate(R, { name: "Many" }, docx([Array.from({ length: 2100 }, (_, i) => `{x${i}}`).join(" ")])), 422, /more than 2000 placeholders.*TOO_MANY_PLACEHOLDERS/));
  ok("FO-5 fail (B-19): fifteen unknown placeholders are named ten at a time, \"and 5 more\"", await fails(() => svc.uploadTemplate(R, { name: "Fifteen" }, docx([Array.from({ length: 15 }, (_, i) => `{y${i}}`).join(" ")])), 422, /and 5 more/));
  // B-16, r2-m1: text the database refuses is refused at the field (422), never "someone else saved it".
  ok("FO-5 fail (B-16): a fee label with a tab, or a reason with a control character, is refused at the field (422)",
    await fails(() => ed(svc, R, x0.id, { fees: [{ label: "Fee\tpasted", amountMinor: 100 }] }), 422, /One line, no tabs/)
    && await fails(() => ed(svc, R, x0.id, { fees: [{ label: "Fee x", amountMinor: 100 }] }), 422, /One line, no tabs/));
  const PW = u(810); person(PW, "Reason Client", "rc@example.com");
  const PROSW = prospect(PW, R.staffId);
  const rw = await svc.draft(R, PROSW, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 100 }] });
  await sd(R, rw.id);
  ok("FO-5 fail (B-16): a withdraw reason with a control character → 422; one with a line break is accepted",
    await fails(() => wdr(R, rw.id, { reason: "bad\u0007bell" }), 422, /control characters/) && (await wdr(R, rw.id, { reason: "Line one\nline two" })).status === "WITHDRAWN");
  // r2-m2: Edit and resend of an Expired retainer after a new one took the prospect → RETAINER_OPEN, before rendering.
  const PE = u(811); person(PE, "Expiry Client", "ex@example.com");
  const PROSE = prospect(PE, R.staffId);
  const ex = await svc.draft(R, PROSE, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 100 }] });
  await sd(R, ex.id);
  sql(API, `begin; update fo_retainer_version set ended_at = now(), end_reason = 'EXPIRED' where retainer_id = '${ex.id}' and n = 1; update fo_retainer set status = 'EXPIRED' where id = '${ex.id}'; commit;`);
  await svc.draft(R, PROSE, { templateId: tplA.id });
  ok("FO-5 fail (r2-m2): Edit and resend of an Expired retainer after a new one took the prospect → 409 RETAINER_OPEN", await fails(() => ed(svc, R, ex.id, { fees: [{ label: "Fee", amountMinor: 200 }] }), 409, /RETAINER_OPEN/));

  // ----------------------------------------------------------------- Devin's review at 7a11b144f (the two red findings)
  // Stale save (4575579111): an edit names the version it was made from; another one saved meanwhile → 409, never a silent overwrite.
  const PS = u(812); person(PS, "Stale Client", "st@example.com");
  const PROSS = prospect(PS, R.staffId);
  const st0 = await svc.draft(R, PROSS, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 10000 }] });
  await svc.edit(R, st0.id, { expectedStatus: "DRAFT", expectedVersion: 1, fees: [{ label: "Fee", amountMinor: 20000 }] });   // one tab saves version 2; another still shows version 1
  ok("FO-5 fail (stale save): a save from the version-1 page after version 2 exists → 409 CHANGED, and version 2's fee stays",
    await fails(() => svc.edit(R, st0.id, { expectedStatus: "DRAFT", expectedVersion: 1, fees: [{ label: "Fee", amountMinor: 15000 }] }), 409, /newer version \(2\)/)
    && (await svc.read(R, st0.id)).version.fees[0].amountMinor === "20000");
  ok("FO-5 fail (stale save): an edit without expectedVersion is refused at the field (422)", await fails(() => svc.edit(R, st0.id, { fees: [{ label: "Fee", amountMinor: 1 }] }), 422, /expectedVersion/));
  ok("FO-5 pass (stale save): an edit naming the current version makes version 3", (await svc.edit(R, st0.id, { expectedStatus: "DRAFT", expectedVersion: 2, fees: [{ label: "Fee", amountMinor: 30000 }] })).version.n === 3);
  // Download after access is lost (4575579436): the download re-checks visibility, not only the link.
  const vKey = await svc.fileKey(R, v.id, {});
  ok("FO-5 pass (download): the prospect's owner may download the retainer's file", await svc.assertFileVisible(R, vKey).then(() => true, () => false));
  sql(API, `update fo_prospect set owner_staff_id = '${O.staffId}' where id = '${PROSV}'`);   // the prospect changes owner (everyone-sees-all is off)
  ok("FO-5 fail (download): after the prospect changed owner, the former owner's link no longer downloads (404)", await fails(() => svc.assertFileVisible(R, vKey), 404));
  ok("FO-5 pass (download): the new owner and the retainer's representative still may", await svc.assertFileVisible(O, vKey).then(() => true, () => false) && await svc.assertFileVisible(T, vKey).then(() => true, () => false));
  ok("FO-5 fail (download): a key that names no retainer → 404", await fails(() => svc.assertFileVisible(R, "retainer-templates/x/v1.docx"), 404));
  sql(API, `update fo_prospect set owner_staff_id = '${R.staffId}' where id = '${PROSV}'`);

  // B-24 (breaker round 4): Send and Signed offline act only on the version the person saw.
  const PB24 = u(813); person(PB24, "Version Client", "vc@example.com");
  const PROSB24 = prospect(PB24, R.staffId);
  const b0 = await svc.draft(R, PROSB24, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 4444 }] });   // the screen shows v1 at CAD 44.44
  await svc.edit(R, b0.id, { expectedStatus: "DRAFT", expectedVersion: 1, fees: [{ label: "Fee", amountMinor: 99999900 }] });            // a colleague saves v2 at CAD 999,999.00
  ok("FO-5 fail (B-24): Send from the version-1 page after version 2 exists → 409 CHANGED, nothing sent",
    await fails(() => svc.send(R, b0.id, { expectedVersion: 1 }), 409, /newer version \(2\)/) && (await svc.read(R, b0.id)).status === "DRAFT");
  ok("FO-5 fail (B-24): Send without expectedVersion is refused at the field (422)", await fails(() => svc.send(R, b0.id, {}), 422, /expectedVersion/));
  ok("FO-5 pass (B-24): Send naming the version shown (2) sends it", (await svc.send(R, b0.id, { expectedVersion: 2 })).status === "SENT");
  sql(API, `update fo_retainer set status = 'CLIENT_SIGNED' where id = '${b0.id}'`);   // the client signed v2 (FO-6)
  const PB25 = u(814); person(PB25, "Paper Client", "pc@example.com");
  const PROSB25 = prospect(PB25, R.staffId);
  const p0 = await svc.draft(R, PROSB25, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 150000 }] });   // paper signed on v1 at CAD 1,500.00
  await svc.edit(R, p0.id, { expectedStatus: "DRAFT", expectedVersion: 1, fees: [{ label: "Fee", amountMinor: 500000000 }] });            // a colleague saves v2 at CAD 5,000,000.00
  ok("FO-5 fail (B-24): Signed offline naming the version the paper was signed on (1) after version 2 exists → 409, nothing filed, the prospect not won",
    await fails(() => svc.signedOffline(R, p0.id, { expectedVersion: "1", reason: "Signed at the office" }, pdf("v1 paper")), 409, /newer version \(2\)/)
    && (await svc.read(R, p0.id)).status === "DRAFT" && sql(API, `select s.kind from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${PROSB25}'`) !== "WON");
  ok("FO-5 fail (B-24): Signed offline without expectedVersion, or with a malformed one, is refused at the field (422)",
    await fails(() => svc.signedOffline(R, p0.id, { reason: "x" }, pdf()), 422, /expectedVersion/) && await fails(() => svc.signedOffline(R, p0.id, { expectedVersion: "1.0", reason: "x" }, pdf()), 422, /expectedVersion/));
  ok("FO-5 pass (B-24): Signed offline naming the current version (multipart text \"2\") files version 2",
    (await svc.signedOffline(R, p0.id, { expectedVersion: "2", reason: "Signed at the office" }, pdf("v2 paper"))).status === "SIGNED_OFFLINE");

  // ===================================================================================== FO-5f: retainer hardening
  // Row FO-5f (rows rev 16.8; FO-5 part 2's Minors, #1777 comments 6883913744, 6884091038, 6884260179). Each numbered
  // item has a pass and a fail test, named after its code.
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });   // two staff on one retainer
  const reqEnded = (id: string) => events(EVENT.RETAINER_REQUEST_ENDED, id);
  const payloadOf = (type: string, id: string) => sql(API, `select coalesce(string_agg(payload::text, '|' order by seq), '') from module_event where type = '${type}' and subject_id = '${id}'`);
  const newClient = (n: number, name: string) => { const p = u(7000 + n); person(p, name, `c${n}@example.com`); return prospect(p, R.staffId); };

  // Item 1: an edit that ends a live request writes retainer.request_ended (version = the ended one, reason UPDATED).
  const e1 = await svc.draft(R, newClient(1, "Ended Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1000 }] });
  await ed(svc, R, e1.id, { fees: [{ label: "Fee", amountMinor: 1100 }] });   // a draft's edit: no request to end
  ok("FO-5f fail (item 1): an edit of an unsent draft writes no retainer.request_ended", reqEnded(e1.id) === 0);
  await sd(R, e1.id);
  await ed(svc, R, e1.id, { fees: [{ label: "Fee", amountMinor: 1200 }] });   // ends version 2's request
  const p1 = JSON.parse(payloadOf(EVENT.RETAINER_REQUEST_ENDED, e1.id) || "{}");
  ok("FO-5f pass (item 1): an edit that ends a sent request writes exactly one retainer.request_ended, naming the ended version 2 and reason UPDATED",
    reqEnded(e1.id) === 1 && p1.version === 2 && p1.reason === "UPDATED" && p1.retainerId === e1.id && (await svc.read(R, e1.id)).versions[1].endReason === "UPDATED", p1);
  ok("FO-5f pass (item 1): the event carries ids and facts only (strict payload: no name, email or licence)", !/example\.com|Ended Client/.test(payloadOf(EVENT.RETAINER_REQUEST_ENDED, e1.id)));

  // Item 2 (B-25): Edit and Withdraw send the status the page showed, and Withdraw the version.
  const b25 = await svc.draft(R, newClient(2, "Two Staff Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 2000 }] });
  const tPage = await svc.read(T, b25.id);                                  // user-T opens the Draft page: version 1, DRAFT
  await sd(R, b25.id);                                                      // user-R sends it (the version stays 1)
  ok("FO-5f fail (B-25): user-T's edit from the Draft page after user-R's Send → 409 CHANGED; the request stays open, no new version, no request_ended",
    await fails(() => svc.edit(T, b25.id, { expectedVersion: tPage.version.n, expectedStatus: tPage.status, fees: [{ label: "Fee", amountMinor: 1 }] }), 409, /CHANGED.*|now sent \(your page showed a draft\)/)
    && await (async () => { const x = await svc.read(R, b25.id); return x.status === "SENT" && x.version.n === 1 && !x.versions[0].endedAt && reqEnded(b25.id) === 0; })());
  ok("FO-5f fail (B-25): an edit or a withdraw without expectedStatus, or with an unknown one, is refused at the field (422)",
    await fails(() => svc.edit(T, b25.id, { expectedVersion: 1, fees: [{ label: "Fee", amountMinor: 1 }] }), 422, /expectedStatus/)
    && await fails(() => svc.edit(T, b25.id, { expectedVersion: 1, expectedStatus: "sent", fees: [{ label: "Fee", amountMinor: 1 }] }), 422, /expectedStatus/)
    && await fails(() => svc.withdraw(R, b25.id, { expectedVersion: 1, reason: "x" }), 422, /expectedStatus/));
  ok("FO-5f pass (B-25): the same edit from the page showing SENT makes version 2 and ends the request once",
    (await svc.edit(T, b25.id, { expectedVersion: 1, expectedStatus: "SENT", fees: [{ label: "Fee", amountMinor: 2100 }] })).version.n === 2 && reqEnded(b25.id) === 1);
  // Withdraw: the version gap (a newer version sent meanwhile) and the status gap (viewed meanwhile).
  await sd(R, b25.id);                                                      // version 2 sent
  ok("FO-5f fail (item 2, Withdraw): a withdraw without expectedVersion is refused at the field (422)", await fails(() => svc.withdraw(R, b25.id, { expectedStatus: "SENT", reason: "x" }), 422, /expectedVersion/));
  ok("FO-5f fail (item 2, Withdraw): a withdraw from the version-1 page after version 2 was sent → 409 CHANGED, nothing withdrawn",
    await fails(() => svc.withdraw(R, b25.id, { expectedVersion: 1, expectedStatus: "SENT", reason: "Client changed plans" }), 409, /newer version \(2\)/) && (await svc.read(R, b25.id)).status === "SENT");
  sql(API, `update fo_retainer set status = 'VIEWED' where id = '${b25.id}'`);   // the client opened it (FO-6)
  ok("FO-5f fail (item 2, Withdraw): a withdraw from a page showing SENT after the client viewed it → 409 CHANGED", await fails(() => svc.withdraw(R, b25.id, { expectedVersion: 2, expectedStatus: "SENT", reason: "x" }), 409, /now viewed \(your page showed sent\)/));
  ok("FO-5f pass (item 2, Withdraw): naming version 2 and VIEWED withdraws it", (await svc.withdraw(R, b25.id, { expectedVersion: 2, expectedStatus: "VIEWED", reason: "Client changed plans" })).status === "WITHDRAWN");

  // Item 3: Signed offline on paper signed against an earlier version files a copy of that version as signed.
  const PR3 = newClient(3, "Paper One Client");
  const s3 = await svc.draft(R, PR3, { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 150000 }] });   // v1 at CAD 1,500.00: printed, signed on paper
  await ed(svc, R, s3.id, { fees: [{ label: "Fee", amountMinor: 500000000 }] });                                  // v2 at CAD 5,000,000.00
  await sd(R, s3.id);                                                                                             // v2 sent for e-signing
  const v1sha = (await svc.read(R, s3.id)).versions[0].sha256;
  ok("FO-5f fail (item 3): signedVersion outside 1 … current (3, 0, \"1.5\", \"x\") is refused at the field (422), nothing filed",
    (await Promise.all(["3", "0", "1.5", "x"].map((sv) => fails(() => so(svc, R, s3.id, { signedVersion: sv, reason: "Signed at the office" }, pdf()), 422, /signedVersion/)))).every(Boolean)
    && (await svc.read(R, s3.id)).status === "SENT");
  ok("FO-5f fail (item 3): the stale check still holds: expectedVersion 1 while version 2 exists → 409, even naming signedVersion 1",
    await fails(() => svc.signedOffline(R, s3.id, { expectedVersion: "1", signedVersion: "1", reason: "x" }, pdf()), 409, /newer version \(2\)/));
  const s3d = await svc.signedOffline(R, s3.id, { expectedVersion: "2", signedVersion: "1", reason: "Signed at the office on version 1" }, pdf("v1 paper"));
  const a3 = JSON.parse(sql(API, `select detail::text from audit_event where entity_key = '${s3.id}' and action = 'retainer.signed_offline'`) || "{}");
  const se3 = JSON.parse(payloadOf(EVENT.RETAINER_SIGNED_OFFLINE, s3.id) || "{}"), re3 = JSON.parse(payloadOf(EVENT.RETAINER_REQUEST_ENDED, s3.id) || "{}");
  ok("FO-5f pass (item 3): naming version 1 while version 2 exists files version 3 = a copy of 1 (its fee, its file's sha256), marked signed",
    s3d.status === "SIGNED_OFFLINE" && s3d.version.n === 3 && s3d.version.fees.length === 1 && s3d.version.fees[0].amountMinor === "150000" && s3d.version.sha256 === v1sha
      && s3d.versions[2].copiedFrom === 1 && s3d.versions[2].signed === true && /Copied from version 1, signed on paper/.test(String(s3d.versions[2].note)), s3d.versions);
  ok("FO-5f pass (item 3): the newer version 2 stays, marked \"Not signed\", its request ended (UPDATED, one retainer.request_ended)",
    s3d.versions[1].signed === false && s3d.versions[1].note === "Not signed" && s3d.versions[1].fees[0].amountMinor === "500000000" && s3d.versions[1].endReason === "UPDATED" && reqEnded(s3.id) === 1 && re3.version === 2, s3d.versions);
  ok("FO-5f pass (item 3): the audit line names version 1 (signed) and version 3 (filed); the event names version 3; the prospect is won",
    a3.signedVersion === 1 && a3.version === 3 && a3.copiedFrom === 1 && a3.endedVersion === 2 && se3.version === 3 && se3.prospectWon === true
      && sql(API, `select s.kind from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${PR3}'`) === "WON", { a3, se3 });
  ok("FO-5f fail (item 3): the copy's stored file is its own key for version 3 (the part 1 key rule), the same bytes as version 1's",
    /^retainers\/[0-9a-f-]{36}\/v3-[0-9a-f]{12}\.docx$/.test(await svc.fileKey(R, s3.id, { version: 3 }))
      && await sha256Hex((await store.get(A, await svc.fileKey(R, s3.id, { version: 3 })))!.bytes) === await sha256Hex((await store.get(A, await svc.fileKey(R, s3.id, { version: 1 })))!.bytes));
  // A draft whose newer version was never sent: the copy is filed, and no request ends.
  const s3b = await svc.draft(R, newClient(4, "Paper Two Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 7000 }] });
  await ed(svc, R, s3b.id, { fees: [{ label: "Fee", amountMinor: 9000 }] });
  const s3bd = await so(svc, R, s3b.id, { signedVersion: "1", reason: "Signed on version 1" }, pdf());
  ok("FO-5f pass (item 3): from a Draft at version 2, signedVersion 1 files version 3 (fee CAD 70.00) and writes no request_ended", s3bd.version.n === 3 && s3bd.version.fees[0].amountMinor === "7000" && reqEnded(s3b.id) === 0);
  ok("FO-5f pass (item 3): signedVersion omitted (or the current one) files the current version, as before", (await so(svc, R, (await svc.draft(R, newClient(5, "Paper Three Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1 }] })).id, { reason: "Signed" }, pdf())).version.n === 1);
  // The client signed the current version electronically: no copy is made after that (AG-5-65).
  const s3c = await svc.draft(R, newClient(6, "Paper Four Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 100 }] });
  await ed(svc, R, s3c.id, { fees: [{ label: "Fee", amountMinor: 200 }] });
  await sd(R, s3c.id);
  sql(API, `update fo_retainer set status = 'CLIENT_SIGNED' where id = '${s3c.id}'`);
  ok("FO-5f fail (item 3): after the client signed version 2, Signed offline naming version 1 → 409 NOT_SIGNABLE, nothing filed",
    await fails(() => so(svc, R, s3c.id, { signedVersion: "1", reason: "x" }, pdf()), 409, /NOT_SIGNABLE/) && (await svc.read(R, s3c.id)).status === "CLIENT_SIGNED" && (await svc.read(R, s3c.id)).versions.length === 2);

  // Items 4-8: reading a template.
  const zipOf = (parts: Record<string, string>, types = "") => {
    const z = new PizZip();
    z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${types}</Types>`);
    z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    for (const [k, v] of Object.entries(parts)) z.file(k, v);
    const bytes = new Uint8Array(z.generate({ type: "uint8array", compression: "DEFLATE" }));
    return { bytes, size: bytes.length };
  };
  const W = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const BASE = P("Client {client.name}") + P("{#fees}{label} {amount}{/fees}");
  // Item 4 (r3-m1 / B-21).
  ok("FO-5f fail (B-21): a placeholder inside an equation (m:t) is refused with the plain sentence",
    await fails(() => svc.uploadTemplate(R, { name: "Equation" }, zipOf({ "word/document.xml": W(BASE + `<w:p><m:oMath><m:r><m:t>{client.passport}</m:t></m:r></m:oMath></w:p>`) })), 422, /Placeholders inside equations, drawings or SmartArt are not filled\. Move it into normal text\..*PLACEHOLDER_NOT_FILLED/));
  ok("FO-5f fail (B-21): a placeholder in SmartArt (a:t in word/diagrams/data1.xml) or a drawing is refused the same way, never printed blank",
    await fails(() => svc.uploadTemplate(R, { name: "SmartArt" }, zipOf({ "word/document.xml": W(BASE), "word/diagrams/data1.xml": `<?xml version="1.0"?><dgm:dataModel xmlns:dgm="d" xmlns:a="a"><a:p><a:r><a:t>{client.name}</a:t></a:r></a:p></dgm:dataModel>` })), 422, /not filled/)
    && await fails(() => svc.uploadTemplate(R, { name: "Drawing" }, zipOf({ "word/document.xml": W(BASE + `<w:p><a:p><a:r><a:t>Fee {fees.total}</a:t></a:r></a:p></w:p>`) })), 422, /not filled/));
  ok("FO-5f pass (B-21): an equation or a drawing without a placeholder is accepted",
    (await svc.uploadTemplate(R, { name: "Equation plain" }, zipOf({ "word/document.xml": W(BASE + `<w:p><m:oMath><m:r><m:t>x=2</m:t></m:r></m:oMath><a:p><a:r><a:t>Logo</a:t></a:r></a:p></w:p>`) }))).placeholders.includes("client.name"));
  // Item 5 (B-19 rest): the cap is counted from the text runs before docxtemplater compiles, and the refusal says why.
  const flood = zipOf({ "word/document.xml": W(BASE + P("{client.name}".repeat(1_500_000))) });
  const t5 = Date.now();
  ok("FO-5f fail (B-19): a file with 1.5 million placeholders is refused saying why (\"more than 2000 placeholders\"), in under 3 s",
    await fails(() => svc.uploadTemplate(R, { name: "Flood" }, flood), 422, /more than 2000 placeholders.*TOO_MANY_PLACEHOLDERS/) && Date.now() - t5 < 3000, `${Date.now() - t5} ms`);
  ok("FO-5f fail (B-19): 2001 placeholders, one over the cap, are refused", await fails(() => svc.uploadTemplate(R, { name: "Cap plus one" }, zipOf({ "word/document.xml": W(P("{client.name}".repeat(1999)) + P("{#fees}{/fees}")) })), 422, /more than 2000/));
  ok("FO-5f pass (B-19): exactly 2000 placeholders are accepted", (await svc.uploadTemplate(R, { name: "Cap" }, zipOf({ "word/document.xml": W(P("{client.name}".repeat(1998)) + P("{#fees}{/fees}")) }))).placeholders.includes("fees"));
  // Item 6 (B-20): a part whose size is not what it declares → 422 "damaged", never a 500.
  const lying = (() => {
    const good = zipOf({ "word/document.xml": W(BASE), "word/extra.xml": `<?xml version="1.0"?><x>${"a".repeat(500)}</x>` });
    const b = Buffer.from(good.bytes), name = Buffer.from("word/extra.xml");
    for (let i = 0; i < b.length - 4; i++) {
      const sig = b.readUInt32LE(i);
      if (sig === 0x04034b50 && b.subarray(i + 30, i + 30 + name.length).equals(name)) b.writeUInt32LE(100, i + 22);   // local header: uncompressed size
      if (sig === 0x02014b50 && b.subarray(i + 46, i + 46 + name.length).equals(name)) b.writeUInt32LE(100, i + 24);   // central directory
    }
    return { bytes: new Uint8Array(b), size: b.length };
  })();
  ok("FO-5f fail (B-20): a part declaring 100 bytes that inflates to more is a 422 \"This file is damaged or is not a Word file.\", not a 500",
    await fails(() => svc.uploadTemplate(R, { name: "Lying" }, lying), 422, /This file is damaged or is not a Word file\..*DAMAGED_FILE/));
  ok("FO-5f pass (B-20): the same file with true sizes is accepted", (await svc.uploadTemplate(R, { name: "Not lying" }, zipOf({ "word/document.xml": W(BASE), "word/extra.xml": `<?xml version="1.0"?><x>${"a".repeat(500)}</x>` }))).version === 1);
  // Item 7 (B-22): the name's length is checked after NFC (U+2ADC becomes two characters).
  ok("FO-5f fail (B-22): a name of 65 characters that is 125 after NFC is a 422 (at most 120), not a 500",
    await fails(() => svc.uploadTemplate(R, { name: "Fork " + "⫝̸".repeat(60) }, docx(GOOD)), 422, /at most 120 characters/));
  const nfc = await svc.uploadTemplate(R, { name: "Fork " + "⫝̸".repeat(50) }, docx(GOOD));
  ok("FO-5f pass (B-22): a name of 105 characters after NFC is accepted and stored normalized", nfc.name.length === 105 && nfc.name === nfc.name.normalize("NFC"));
  ok("FO-5f fail (B-22): a rename that grows past 120 under NFC is a 422 too", await fails(() => svc.changeTemplate(R, nfc.id, { name: "⫝̸".repeat(61) }), 422, /at most 120/));
  // Item 8 (B-23): the glossary (building blocks) is never rendered, so it is not read.
  const GLOSS = `<Override PartName="/word/glossary/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml"/>`;
  const gl = await svc.uploadTemplate(R, { name: "With glossary" }, zipOf({ "word/document.xml": W(BASE), "word/glossary/document.xml": W(P("{client.passport}")) }, GLOSS));
  ok("FO-5f pass (B-23): an unknown placeholder only in the glossary is not a refusal and is not listed", !gl.placeholders.includes("client.passport"), gl);
  ok("FO-5f fail (B-23, FO-5f2 item 1): a glossary declared under another name is refused (not its standard place)", await fails(() => svc.uploadTemplate(R, { name: "Renamed glossary" }, zipOf({ "word/document.xml": W(BASE), "word/blocks.xml": W(P("{client.passport}")) }, `<Override PartName="/word/blocks.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml"/>`)), 422, /PARTS_NOT_ALLOWED/));
  ok("FO-5f fail (B-23): the same placeholder in the body is still refused", await fails(() => svc.uploadTemplate(R, { name: "Body passport" }, zipOf({ "word/document.xml": W(BASE + P("{client.passport}")) }, GLOSS)), 422, /client\.passport/));

  // Item 9 (Devin 4575579359): the "missing" list uses the template version the agreement was made from.
  const t9 = await svc.uploadTemplate(R, { name: "Pinned" }, docx(["{client.name} {client.phone}", "{#fees}{label} {amount}{/fees}"]));
  const r9 = await svc.draft(R, newClient(9, "Pinned Client"), { templateId: t9.id, fees: [{ label: "Fee", amountMinor: 900 }] });   // the person has no phone
  await svc.newTemplateVersion(R, t9.id, docx(["{client.name} {company.name}", "{#fees}{label} {amount}{/fees}"]));   // version 2 drops the phone, adds the company
  const m9 = (await svc.read(R, r9.id)).missing;
  ok("FO-5f pass (item 9): an agreement made from template version 1 lists version 1's empty placeholder (client.phone)", m9.includes("client.phone"), m9);
  ok("FO-5f fail (item 9): it does not list version 2's placeholders (company.name)", !m9.includes("company.name"), m9);

  // Item 10 (r3-m2): tx()'s log line carries only the error code and the constraint name.
  const logged: string[] = [], errLog = console.error;
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  const txOf = svc as unknown as { tx: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
  try {
    await txOf.tx(async () => { throw Object.assign(new Error("Failing row contains (secret-person@example.com)"), { code: "P2010", meta: { code: "23514", message: "new row for relation violates check: secret-person@example.com", constraint: "fo_retainer_version_merge_values_check" } }); }).catch(() => undefined);
    await txOf.tx(async (tx) => (tx as { $queryRawUnsafe: (q: string) => Promise<unknown> }).$queryRawUnsafe("select ('secret-person@example.com')::int")).catch(() => undefined);
  } finally { console.error = errLog; }
  ok("FO-5f pass (r3-m2): the log line names the error code and the constraint", logged.length === 2 && /code=P2010 constraint=fo_retainer_version_merge_values_check$/.test(logged[0]) && /code=\S+ constraint=unknown$/.test(logged[1]), logged);
  ok("FO-5f fail (r3-m2): neither line carries Prisma's message or meta (the personal value)", logged.length === 2 && logged.every((l) => !/secret-person|Failing row|violates/.test(l)), logged);

  // Item 11 (B-26): a refused download says "No such file".
  const r11 = await svc.draft(R, newClient(11, "File Client"), { templateId: tplA.id, representativeStaffId: T.staffId });   // user-T represents: user-R sees it only as the owner
  const k11 = await svc.fileKey(R, r11.id, {});
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  sql(API, `update fo_prospect set owner_staff_id = '${O.staffId}' where id = (select prospect_id from fo_retainer where id = '${r11.id}')`);
  ok("FO-5f fail (B-26): after access is lost the download is refused as \"No such file in your firm.\", never naming a retainer",
    await fails(() => svc.assertFileVisible(R, k11), 404, /No such file in your firm\./) && !(await fails(() => svc.assertFileVisible(R, k11), 404, /retainer/)));
  ok("FO-5f pass (B-26): the new owner still downloads it", await svc.assertFileVisible(O, k11).then(() => true, () => false));

  // Item 12 (B-8): the shared upload filter names no size; each route's own message names its number.
  const mainLine = readFileSync(join(STUDIO, "api", "src", "main.ts"), "utf8").split("\n").find((l) => /FO-5f item 12/.test(l)) ?? "";
  ok("FO-5f pass (B-8): the shared upload filter's single-file message is \"This file is too large for this upload.\"", mainLine.includes(': "This file is too large for this upload.");'), mainLine);
  ok("FO-5f fail (B-8): it names no size; only the intake and the form library (whose 25 MB limit this is) keep their number (review m-1)",
    /\? `A file is larger than \$\{mb\} MB\. Nothing was added; add files up to \$\{mb\} MB each\.` : "This file is too large for this upload\."\);/.test(mainLine) && mainLine.includes("(intake|library"), mainLine);
  ok("FO-5f pass (B-8): the routes' own limits name their numbers (template 5 MB, signed paper 10 MB)",
    await fails(() => svc.uploadTemplate(R, { name: "Big" }, { bytes: docx(GOOD).bytes, size: 5 * 1024 * 1024 + 1 }), 422, /at most 5 MB/)
    && await fails(async () => so(svc, R, (await svc.draft(R, newClient(12, "Big Paper Client"), { templateId: tplA.id })).id, { reason: "x" }, { bytes: pdf().bytes, size: OFFLINE_PDF_MAX_BYTES + 1 }), 422, /at most 10 MB/));

  // Item 13 (B-15, accepted risk): the signed-paper download is an attachment with nosniff, so HTML inside a PDF wrapper is never shown inline.
  const h13 = await svc.draft(R, newClient(13, "Header Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1 }] });
  const html = Buffer.from("%PDF-1.4\n<html><script>alert(1)</script></html>\n%%EOF\n");
  await so(svc, R, h13.id, { reason: "Signed" }, { bytes: new Uint8Array(html), size: html.length });
  const ctrl = new RetainersController(svc, store, links, clock as never);
  const res13 = { headers: {} as Record<string, string>, ct: "", body: undefined as unknown, setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; }, type(t: string) { this.ct = t; return this; }, send(b: unknown) { this.body = b; return this; } };
  const tok = links.sign(A, R.staffId, await svc.fileKey(R, h13.id, { file: "signed-offline" }), clock.now()).token;
  await ctrl.download({ platform: R }, tok, res13 as never);
  ok("FO-5f pass (B-15): the signed-paper download sends Content-Disposition: attachment and X-Content-Type-Options: nosniff",
    /^attachment;/.test(res13.headers["content-disposition"] ?? "") && res13.headers["x-content-type-options"] === "nosniff" && Buffer.isBuffer(res13.body), res13.headers);
  ok("FO-5f fail (B-15): it is never served as HTML or inline", res13.ct === "application/pdf" && !/inline/i.test(res13.headers["content-disposition"] ?? ""), { ct: res13.ct, h: res13.headers });

  // ------------------------------------------------------------- FO-5f review round 1 (review.md, break-report.md)
  // Review M-1: lone braces count toward the cap before the compile (a 2 KB file of "{" ran the API out of memory).
  for (const [n, label] of [[300_000, "300,000"], [1_500_000, "1.5 million"]] as const) {
    const t = Date.now();
    ok(`FO-5f fail (review M-1): ${label} lone "{" are refused before the compile (TOO_MANY_PLACEHOLDERS), in under 2 s`,
      await fails(() => svc.uploadTemplate(R, { name: `Lone ${n}` }, zipOf({ "word/document.xml": W(BASE + P("{".repeat(n))) })), 422, /more than 2000 placeholders.*TOO_MANY_PLACEHOLDERS/) && Date.now() - t < 2000, `${Date.now() - t} ms`);
  }
  ok("FO-5f fail (review M-1): 4001 braces (one over twice the cap) are refused, paired or not", await fails(() => svc.uploadTemplate(R, { name: "Braces 4001" }, zipOf({ "word/document.xml": W(P("{client.name}".repeat(1999)) + P("{#fees}{/fees}") + P("}")) })), 422, /TOO_MANY_PLACEHOLDERS/));
  ok("FO-5f pass (review M-1): 4000 braces (2000 placeholders) are accepted", (await svc.uploadTemplate(R, { name: "Braces 4000" }, zipOf({ "word/document.xml": W(P("{client.name}".repeat(1998)) + P("{#fees}{/fees}")) }))).version === 1);
  // Review m-4: a chart is never rendered, so a brace in a chart title is not a refusal; SmartArt still is.
  const CHART = `<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
  ok("FO-5f fail (review m-4, FO-5f2 item 1): a chart is a part a template cannot have", await fails(() => svc.uploadTemplate(R, { name: "Chart" }, zipOf({ "word/document.xml": W(BASE), "word/charts/chart1.xml": `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><a:p><a:r><a:t>{Revenue}</a:t></a:r></a:p></c:chartSpace>` }, CHART)), 422, /PARTS_NOT_ALLOWED/));
  ok("FO-5f fail (review m-4): the same text in SmartArt is still refused", await fails(() => svc.uploadTemplate(R, { name: "SmartArt 2" }, zipOf({ "word/document.xml": W(BASE), "word/diagrams/data1.xml": `<?xml version="1.0"?><dgm:dataModel xmlns:dgm="d" xmlns:a="a"><a:p><a:r><a:t>{Revenue}</a:t></a:r></a:p></dgm:dataModel>` })), 422, /not filled/));

  // Review M-2 (break M-1): Signed offline on an earlier version names that version's representative and signer.
  // ("Everyone sees all" is off here, since item 11.)
  const m2 = await svc.draft(R, newClient(21, "People Client"), { templateId: tplA.id, representativeStaffId: R.staffId, fees: [{ label: "Fee", amountMinor: 100000 }] });   // v1: user-R represents
  await sd(R, m2.id);
  await ed(svc, R, m2.id, { representativeStaffId: T.staffId });   // v2: user-T represents
  await sd(R, m2.id);
  ok("FO-5f pass (review M-2): before filing, user-T (v2's representative) reads the retainer", await svc.read(T, m2.id).then(() => true, () => false));
  const m2d = await so(svc, R, m2.id, { signedVersion: "1", reason: "Signed on paper on version 1" }, pdf());
  const a2 = JSON.parse(sql(API, `select detail::text from audit_event where entity_key = '${m2.id}' and action = 'retainer.signed_offline'`) || "{}");
  ok("FO-5f pass (review M-2): the filed copy of version 1 names user-R as the representative, on the record and in the audit",
    m2d.version.n === 3 && m2d.representativeStaffId === R.staffId && a2.representativeStaffId === R.staffId && a2.signedVersion === 1 && m2d.version.values["representative.staff_id"] === R.staffId, { rep: m2d.representativeStaffId, a2 });
  ok("FO-5f fail (review M-2): user-T, on no signed paper, no longer reads the signed retainer (404)", await fails(() => svc.read(T, m2.id), 404));
  // A version made before FO-5f records no ids: filed only when it names the same people as the current version.
  const mvOf = svc as unknown as { mergeValues: (...a: unknown[]) => Promise<Record<string, unknown>> };
  const realMv = mvOf.mergeValues;
  mvOf.mergeValues = async function (this: unknown, ...a: unknown[]) { const v = await realMv.apply(this, a); delete v["signer.person_id"]; delete v["representative.staff_id"]; return v; };
  const lg = await svc.draft(R, newClient(22, "Legacy Client"), { templateId: tplA.id, representativeStaffId: R.staffId, fees: [{ label: "Fee", amountMinor: 100 }] });
  await ed(svc, R, lg.id, { representativeStaffId: T.staffId });
  const lg2 = await svc.draft(R, newClient(23, "Legacy Same Client"), { templateId: tplA.id, representativeStaffId: R.staffId, fees: [{ label: "Fee", amountMinor: 100 }] });
  await ed(svc, R, lg2.id, { fees: [{ label: "Fee", amountMinor: 200 }] });
  mvOf.mergeValues = realMv;
  ok("FO-5f fail (review M-2): a version without recorded ids that names another representative → 409 NOT_SIGNABLE, nothing filed",
    await fails(() => so(svc, R, lg.id, { signedVersion: "1", reason: "x" }, pdf()), 409, /another signer or representative.*NOT_SIGNABLE/) && (await svc.read(R, lg.id)).status === "DRAFT");
  ok("FO-5f pass (break r2-m1): the refusal says the version predates recorded ids and to record a new version as signed",
    await fails(() => so(svc, R, lg.id, { signedVersion: "1", reason: "x" }, pdf()), 409, /saved before people were recorded by id; record a new version as signed instead/));
  ok("FO-5f fail (break r2-m1): it never promises \"Edit the agreement back\" (an edit prints today's details, so it could never match)",
    !(await fails(() => so(svc, R, lg.id, { signedVersion: "1", reason: "x" }, pdf()), 409, /Edit the agreement back/)));
  ok("FO-5f pass (review M-2): a version without recorded ids that names the same people is filed (version 3, user-R)",
    await (async () => { const x = await so(svc, R, lg2.id, { signedVersion: "1", reason: "x" }, pdf()); return x.version.n === 3 && x.representativeStaffId === R.staffId; })());
  // Review m-2: the version signed on paper says so; only the newer versions say "Not signed".
  ok("FO-5f pass (review m-2): version 1 (signed on paper) says \"Signed on paper; filed as version 3\"", m2d.versions[0].note === "Signed on paper; filed as version 3", m2d.versions);
  ok("FO-5f fail (review m-2): version 2 says \"Not signed\", and the signed version is never labelled so", m2d.versions[1].note === "Not signed" && m2d.versions[0].note !== "Not signed");

  // Review m-5: the copy path re-checks the retainer under its lock (a change between the read and the transaction → 409).
  let hook: (() => void) | null = null;
  const hooked = { put: async (f: string, k: string, b: Uint8Array, c: string) => { if (hook && /\/v\d+-[0-9a-f]{12}\.docx$/.test(k)) { const h = hook; hook = null; h(); } return store.put(f, k, b, c); }, get: (f: string, k: string) => store.get(f, k), exists: (f: string, k: string) => store.exists(f, k) };
  const svcH = new Retainers(db, hooked as never, clock);
  const lk = await svc.draft(R, newClient(24, "Lock Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 100 }] });
  await ed(svc, R, lk.id, { fees: [{ label: "Fee", amountMinor: 200 }] });
  await sd(R, lk.id);
  hook = () => sql(API, `update fo_retainer set status = 'VIEWED' where id = '${lk.id}'`);   // the client opens it while the copy is stored
  ok("FO-5f fail (review m-5): the client viewed it between the read and the transaction → 409 CHANGED, nothing filed",
    await fails(() => so(svcH, R, lk.id, { signedVersion: "1", reason: "x" }, pdf()), 409, /CHANGED/) && (await svc.read(R, lk.id)).status === "VIEWED" && (await svc.read(R, lk.id)).versions.length === 2);
  ok("FO-5f pass (review m-5): from the page showing that state, the copy is filed", (await so(svc, R, lk.id, { signedVersion: "1", reason: "x" }, pdf())).version.n === 3);

  // Review m-3: a fault on a download stays a fault (500), never "No such file".
  const brokenDb = new Proxy(db, { get: (t, k) => (k === "foRetainer" ? { findFirst: async () => { throw new Error("connection lost"); } } : Reflect.get(t, k)) });
  const svcB = new Retainers(brokenDb as never, store, clock);
  ok("FO-5f fail (review m-3): a database fault during the download check is not answered \"No such file\" (404)",
    await svcB.assertFileVisible(R, k11).then(() => false, (e) => !(e instanceof Error && "getStatus" in e) && /connection lost/.test(String(e))));
  ok("FO-5f pass (review m-3): a refusal (user-R lost access) is still \"No such file\" (404)", await fails(() => svc.assertFileVisible(R, k11), 404, /No such file/));

  // Break m-3: the stale message reads the right way round; break m-4: plain digits only.
  ok("FO-5f fail (break m-3): a page naming version 5 when the agreement is at version 1 → \"at version 1, not version 5\"", await fails(() => svc.withdraw(R, lk.id, { expectedVersion: 5, expectedStatus: "SIGNED_OFFLINE", reason: "x" }), 409, /at version 3, not version 5/));
  ok("FO-5f fail (break m-4): signedVersion \"01\" and expectedVersion \"02\" are refused at the field (422)",
    await fails(async () => svc.signedOffline(R, (await svc.draft(R, newClient(25, "Digits Client"), { templateId: tplA.id })).id, { expectedVersion: "01", reason: "x" }, pdf()), 422, /expectedVersion/)
    && await fails(async () => svc.signedOffline(R, (await svc.draft(R, newClient(26, "Digits Two Client"), { templateId: tplA.id })).id, { expectedVersion: "1", signedVersion: "01", reason: "x" }, pdf()), 422, /signedVersion/));
  ok("FO-5f pass (break m-4): expectedVersion \"1\" (plain) is accepted", (await so(svc, R, (await svc.draft(R, newClient(27, "Digits Three Client"), { templateId: tplA.id, fees: [{ label: "Fee", amountMinor: 1 }] })).id, { reason: "x" }, pdf())).status === "SIGNED_OFFLINE");

  // ------------------------------------------------------------- FO-5f review round 2 (review.md M-1 rest; break r2-m2, r2-m3)
  // docxtemplater also compiles a coverPageProps customXml part and any part typed XML by a Default rule (h.bin): both are
  // read, for the cap and for placeholders.
  const COVERX = (t: string) => `<?xml version="1.0"?><CoverPageProperties xmlns="http://schemas.microsoft.com/office/2006/coverPageProps"><PublishDate/><Abstract>${t}</Abstract></CoverPageProperties>`;
  const HDR = (t: string) => `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${P(t)}</w:hdr>`;
  const BIN = `<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`;
  // FO-5f2 item 1: a header typed by a Default rule is now refused by the allowlist, before the brace count.
  for (const [where, parts, types, code] of [["a coverPageProps customXml part", { "customXml/item1.xml": COVERX("{".repeat(1_500_000)) }, "", /TOO_MANY_PLACEHOLDERS/], ["a header typed by a Default rule (word/h.bin)", { "word/h.bin": HDR("{".repeat(1_500_000)) }, BIN, /PARTS_NOT_ALLOWED/]] as const) {
    const t = Date.now();
    ok(`FO-5f fail (review r2 M-1): 1.5 million lone "{" in ${where} are refused before the compile, in under 2 s`,
      await fails(() => svc.uploadTemplate(R, { name: `Flood ${where}` }, zipOf({ "word/document.xml": W(BASE), ...parts }, types)), 422, code) && Date.now() - t < 2000, `${Date.now() - t} ms`);
  }
  ok("FO-5f fail (review r2, B-3 rest): an unknown placeholder in the coverPageProps part or the h.bin header is refused, never printed blank",
    await fails(() => svc.uploadTemplate(R, { name: "Cover passport" }, zipOf({ "word/document.xml": W(BASE), "customXml/item1.xml": COVERX("{client.passport}") })), 422, /client\.passport/)
    && await fails(() => svc.uploadTemplate(R, { name: "Bin passport" }, zipOf({ "word/document.xml": W(BASE), "word/h.bin": HDR("{client.passport}") }, BIN)), 422, /PARTS_NOT_ALLOWED/)
    && await fails(() => svc.uploadTemplate(R, { name: "Lpwstr passport" }, zipOf({ "word/document.xml": W(BASE + `<vt:lpwstr xmlns:vt="v">{client.passport}</vt:lpwstr>`) })), 422, /client\.passport/));
  const binOk = await svc.uploadTemplate(R, { name: "Bin header" }, zipOf({ "word/document.xml": W(BASE), "word/header1.xml": HDR("{firm.name}"), "customXml/item1.xml": COVERX("{agreement.date}"), "customXml/item2.xml": `<?xml version="1.0"?><b:Sources xmlns:b="bib"><b:Source><b:Guid>{3F2504E0-4F89-11D3-9A0C-0305E82C3301}</b:Guid></b:Source></b:Sources>` }, `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`));
  ok("FO-5f pass (review r2): known placeholders in the header and the cover part are listed; other customXml (a citation GUID) is not read",
    binOk.placeholders.includes("firm.name") && binOk.placeholders.includes("agreement.date") && !binOk.placeholders.some((p) => /3F2504E0/.test(p)), binOk.placeholders);
  // Break r2-m2: an older version (no ids) naming another licensing body is not taken for the same representative.
  mvOf.mergeValues = async function (this: unknown, ...a: unknown[]) { const v = await realMv.apply(this, a); delete v["signer.person_id"]; delete v["representative.staff_id"]; return v; };
  const lb = await svc.draft(R, newClient(31, "Body Client"), { templateId: tplA.id, representativeStaffId: R.staffId, fees: [{ label: "Fee", amountMinor: 100 }] });
  const bodyWas = sql(API, `select licensing_body from platform_staff_credential where staff_id = '${R.staffId}'`);
  sql(API, `update platform_staff_credential set licensing_body = 'Another body (Sample)' where staff_id = '${R.staffId}'`);
  await ed(svc, R, lb.id, { fees: [{ label: "Fee", amountMinor: 200 }] });
  sql(API, `update platform_staff_credential set licensing_body = '${bodyWas.replace(/'/g, "''")}' where staff_id = '${R.staffId}'`);
  mvOf.mergeValues = realMv;
  ok("FO-5f fail (break r2-m2): an older version naming another licensing body → 409 NOT_SIGNABLE", await fails(() => so(svc, R, lb.id, { signedVersion: "1", reason: "x" }, pdf()), 409, /NOT_SIGNABLE/));
  // Break r2-m3: a closed agreement shows no "Edit to choose another".
  const repsOf = svc as unknown as { representatives: (f: string) => Promise<{ staffId: string; name: string }[]> };
  const realReps = repsOf.representatives;
  const openOne = await svc.draft(R, newClient(32, "Blocker Client"), { templateId: tplA.id, representativeStaffId: R.staffId });
  repsOf.representatives = async () => [];   // every representative has lost the keys
  const closedPage = await svc.read(R, m2.id), draftPage = await svc.read(R, openOne.id);
  repsOf.representatives = realReps;
  ok("FO-5f fail (break r2-m3): a signed agreement whose representative lost the keys lists no blocker (no \"Edit to choose another\")", closedPage.status === "SIGNED_OFFLINE" && Object.keys(closedPage.blockers).length === 0, closedPage.blockers);
  ok("FO-5f pass (break r2-m3): an open agreement still lists it", draftPage.status === "DRAFT" && /Edit to choose another/.test(String(draftPage.blockers.representativeStaffId)), draftPage.blockers);

  // Routes (PF-4's guard): every route declares its agent/retainer:* key.
  const keysOf = (m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (RetainersController.prototype as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  const want: Record<string, string> = { placeholders: "agent/retainer:list", starter: "agent/retainer:configure-template", templates: "agent/retainer:list", upload: "agent/retainer:configure-template", newVersion: "agent/retainer:configure-template", changeTemplate: "agent/retainer:configure-template", representatives: "agent/retainer:draft", draft: "agent/retainer:draft", read: "agent/retainer:show", edit: "agent/retainer:draft", send: "agent/retainer:send", withdraw: "agent/retainer:void", signedOffline: "agent/retainer:offline-sign", link: "agent/retainer:download", download: "agent/retainer:download" };
  ok("FO-5 pass: every route declares its AG-05 C5 key (default deny)", Object.entries(want).every(([m, k]) => keysOf(m) === k), Object.keys(want).map((m) => `${m}=${keysOf(m)}`));
  ok("FO-5 pass: each declared key is one PF-3 seeded for a role", Object.values(want).every((k) => Number(sql(API, `select count(*) from platform_role_permission where permission_key = '${k}'`)) > 0));
  ok("FO-5 fail: a Case Officer's roles do not hold configure-template, offline-sign or void (SA-06's seed)", ["agent/retainer:configure-template", "agent/retainer:offline-sign", "agent/retainer:void"].every((k) => sql(API, `select count(*) from platform_role_permission where role = 'CASE_OFFICER' and permission_key = '${k}'`) === "0"));
  await db.$disconnect();
} catch (e) {
  fail++;
  console.log(`FAIL  FO-5: the check stopped — ${String((e as { stderr?: string }).stderr ?? "").trim().slice(0, 600)} ${String((e as Error).stack ?? e).slice(0, 400)}`);
} finally {
  for (const db of [EMPTY, DEMO, API]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]); } catch { /* reported by the next run's createdb */ } }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nFO-5 retainers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function textOf(docx: Uint8Array): string { return new PizZip(docx).file("word/document.xml")!.asText().replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); }
