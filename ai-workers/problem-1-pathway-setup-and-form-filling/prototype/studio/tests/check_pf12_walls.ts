// PF-12 (BACKLOG row PF-12, rows rev 4, 14, 16.2, 16.7, 16.34; Lead B's brief; contracts §0 rule 2, §7, §9; map row 3;
// AG-1-1, -3, -45): database walls between firms. Every Done-when line with a passing and a failing case: no firm reads
// nothing; firm A cannot read or write firm B's rows (one table per family); the app's role owns nothing, has no
// superuser, BYPASSRLS, session_replication_role or trigger switch, logs terse errors, and the real main.ts refuses to
// start as the owner; the bypass only for named uses on their routes, each logged; xr_case_lookup and xr_wall_reader
// cannot log in; the guard for every later firm table (forced policy naming the firm, trigger functions as the reader);
// the doors through the real walled server over HTTP. Scratch databases: "bare" (every migration before PF-12's), "empty"
// (all), "demo" (before PF-12's, Sample firms and front-office rows, then the rest); the migration is measured right
// after itself (rows rev 16.7). No browser, no model call (US$0). Every value is Sample. All dropped at the end.
//   tsx studio/tests/check_pf12_walls.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { appDatabaseUrl, appRoleProblems, asBypass, BypassRefused, currentFirm, enterFirm, inRequest, onBypassLine, oneQueryPerCaller, unscopedMode, setRequestFirm, WalledPool, withFirm } from "../api/src/platform/firm-scope.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261116013000_pf12_firm_walls";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_pf12_empty_${process.pid}`, DEMO = `xr_studio_pf12_demo_${process.pid}`, BARE = `xr_studio_pf12_bare_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
/** The families the walls cover (contracts §9) and the named exceptions (brief): catalogues with no firm_id, and our own
 *  registers that only the bypass role reaches. Nothing else may go without a forced policy. */
const FAMILIES = /^(platform_|fo_|money_|msg_|auto_|plat_complaint)/;
const CATALOGUES = ["platform_plan", "platform_role_permission", "platform_setting_definition", "platform_permission_key", "platform_terms_version"];
/** Our own registers: row-level security forced and no policy at all, so only the bypass role reaches them. */
const OWN = ["platform_signup_pending", "plat_breach", "plat_breach_event", "plat_breach_notice", "plat_data_request", "plat_legal_hold"];
/** Catalogues made after PF-12 (no firm_id; read by every firm and the case side): PF-15's plan limits. */
const LATER_CATALOGUES = ["platform_plan_limit", "platform_limit_change"];
const EXCEPTIONS = [...CATALOGUES, ...LATER_CATALOGUES, ...OWN];
/** PF-12b part 5 (QA-703): beyond the families, every table with a firm_id column is walled too, unless it is named here
 *  with why it is not under the platform firm's policy. A new firm_id table therefore fails the guard until it ships its
 *  forced policy or is added here on purpose (the next webhook_receipt cannot slip). */
const FIRM_ID_ELSEWHERE: Record<string, string> = {
  audit_event: "the one trail: append-only at the database (AUD-1a); written with no platform firm by the case side too; a firm reads its own lines through AUD-4's own firm filter (audit/firm-read/service.ts)",
  module_event: "the event bus: written in each change's transaction and read across firms, and by the case side with no platform firm (case-count.ts, prospect-won.ts); its wall has no owner row yet (the tech lead's)",
  runtime_case: "case side: case requests run with no platform firm until CS-W4 walls them",
  case_client: "case side (CS-W4)", case_decision: "case side (CS-W4)", case_milestone: "case side (CS-W4)",
  case_party_index: "case side (CS-W4)", case_stage: "case side (CS-W4)", firm_case_counter: "case side: a firm's case numbers (CS-W4)",
  case_client_counter: "case side: a firm's client numbers, by firm_key (CS-W4)",
  case_note: "case side: notes on a case (CS-NT1 part 1); the firm is checked on insert by its trigger; walled with the case side (CS-W4)",
  // CS-W2 part filings (#3811): the firm column on the nine filings tables, filled from the parent and kept once set; walled with the case side (CS-W4)
  submission_group: "case side (CS-W2 filings; CS-W4)", filing: "case side (CS-W2 filings; CS-W4)", filing_applicant: "case side (CS-W2 filings; CS-W4)",
  filing_item: "case side (CS-W2 filings; CS-W4)", assessment: "case side (CS-W2 filings; CS-W4)", assessment_override: "case side (CS-W2 filings; CS-W4)",
  assessment_review: "case side (CS-W2 filings; CS-W4)", filing_change: "case side (CS-W2 filings; CS-W4)", filing_form_addition: "case side (CS-W2 filings; CS-W4)",
  // CS-W2 part review (#3831): the firm column on the seven review tables; walled with the case side (CS-W4)
  review_finding: "case side (CS-W2 review; CS-W4)", filing_review: "case side (CS-W2 review; CS-W4)", readiness_pass: "case side (CS-W2 review; CS-W4)",
  review_round: "case side (CS-W2 review; CS-W4)", review_round_filing: "case side (CS-W2 review; CS-W4)", review_round_form: "case side (CS-W2 review; CS-W4)",
  review_check: "case side (CS-W2 review; CS-W4)",
  // CS-W2 part submission: the firm column on the six submission tables; walled with the case side (CS-W4)
  sign_step: "case side (CS-W2 submission; CS-W4)", signed_scan: "case side (CS-W2 submission; CS-W4)", filing_record: "case side (CS-W2 submission; CS-W4)",
  fee_receipt_file: "case side (CS-W2 submission; CS-W4)", filing_person_record: "case side (CS-W2 submission; CS-W4)", filing_record_correction: "case side (CS-W2 submission; CS-W4)",
};
const elsewhere = (t: string) => Object.hasOwn(FIRM_ID_ELSEWHERE, t);   // never a prototype name (break m1)
/** The tables with a firm column: firm_id, or the case side's firm_key (break M2). */
const firmIdTables = (db: string) => new Set(sql(db, `select distinct c.relname from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname in ('firm_id', 'firm_key') and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')`).split("\n").filter(Boolean));
/** In the walls' scope: a family table, or any table with a firm_id column, less the named exceptions. */
const walledScope = (db: string) => { const f = firmIdTables(db); return (t: string) => (FAMILIES.test(t) || f.has(t)) && !EXCEPTIONS.includes(t) && !elsewhere(t); };
/** The policy shapes that wall (break M2: a policy that only mentions the session's firm does not): all commands on the
 *  firm column (platform_firm: its id), or the platform templates' read of firm-less rows by a firm session. */
const WALLING: Record<string, readonly string[] | "any"> = {
  "* (firm_id = platform_session_firm()) | (firm_id = platform_session_firm())": "any",
  "* (id = platform_session_firm()) | (id = platform_session_firm())": ["platform_firm"],   // its id is the firm id
  "r ((firm_id IS NULL) AND (platform_session_firm() IS NOT NULL)) | -": ["msg_template", "msg_template_version"],   // platform-owned templates only (review r2)
};
const walls = (table: string, shape: string) => { const on = Object.hasOwn(WALLING, shape) ? WALLING[shape] : null; return on === "any" || (on ?? []).includes(table); };
/** What else could hold a firm's rows past the guard (break M1, M2): a view that is not security_invoker (it reads as its
 *  owner, past every policy), any materialized view, and any table or view outside the public schema. */
function sideDoors(db: string): string[] {
  return sql(db, `select n.nspname || '.' || c.relname || ' (' || case c.relkind when 'v' then 'view, not security_invoker' when 'm' then 'materialized view' else 'outside public' end || ')'
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public' and ((c.relkind = 'v' and not coalesce(c.reloptions::text, '') ~ 'security_invoker=(true|on)') or c.relkind = 'm'))
       or (c.relkind in ('r','p','v','m') and n.nspname not in ('public', 'pg_catalog', 'information_schema') and n.nspname !~ '^pg_')`).split("\n").filter(Boolean);
}

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (url: string, args: string[]) => execFileSync(join(BIN, "psql"), [url, "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user = "xr_studio") => psql(urlOf(db, user), ["-Atc", q]);
/** As the app's role, in one transaction with the given firm (or none). */
const asApp = (db: string, firm: string | null, q: string) => sql(db, `begin; ${firm ? `select set_config('app.firm_id', '${firm}', true);` : ""} ${q}; commit;`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const refused = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? (e as Error).message ?? e)); } };

/** The tables of the families with no forced firm policy, not on the exception list: the guard every later row runs. */
function unwalled(db: string, families = false): string[] {
  const rows = sql(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
    and (not c.relrowsecurity or not c.relforcerowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))
    order by 1`).split("\n").filter(Boolean);
  const own = sql(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
    and c.relname = any('{${OWN.join(",")}}') and (not c.relrowsecurity or not c.relforcerowsecurity or exists (select 1 from pg_policy p where p.polrelid = c.oid))`).split("\n").filter(Boolean);
  const scoped = families ? (t: string) => FAMILIES.test(t) && !EXCEPTIONS.includes(t) : walledScope(db);   // families: PF-12's own scope, measured right after its migration
  return [...rows.filter(scoped), ...own.map((t) => `${t} (own register: must be forced with no policy)`)];
}
/** The rest of the guard (breaker m5, M1): every policy a firm table gives the app's roles names the session's firm (a
 *  policy only for xr_case_lookup, CS-W1's, is its own), and every trigger function on a firm table runs as xr_wall_reader
 *  (SECURITY DEFINER, search_path pinned with pg_temp last), so its cross-table rule sees every firm's rows. */
function unguarded(db: string): string[] {
  const pol = sql(db, `select c.relname || ' policy ' || p.polname || chr(9) || p.polcmd::text || ' ' || coalesce(pg_get_expr(p.polqual, p.polrelid), '-') || ' | ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')
    from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace and p.polpermissive
      and (0 = any(p.polroles) or exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname in ('xr_app', 'xr_data')))`).split("\n").filter(Boolean)
    .filter((l) => !walls(l.split(" ")[0], l.split("\t")[1])).map((l) => l.split("\t")[0]);
  const trg = sql(db, `select distinct c.relname || ' trigger function ' || f.proname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc f on f.oid = t.tgfoid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
      and f.proname <> 'platform_firm_first' and (not f.prosecdef or pg_get_userbyid(f.proowner) <> 'xr_wall_reader' or not coalesce(f.proconfig::text, '') ~ 'search_path=pg_catalog, public, pg_temp')`).split("\n").filter(Boolean);
  const gate = sql(db, `select c.relname || ' has no first gate' from pg_class c where c.relnamespace = 'public'::regnamespace and c.relforcerowsecurity
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = '0_pf12_firm_first' and t.tgname = (select min(u.tgname) from pg_trigger u where u.tgrelid = c.oid and not u.tgisinternal))`).split("\n").filter(Boolean);
  const scoped = walledScope(db);   // review m1: the family tables on EXCEPTIONS stay checked here, as before PF-12b part 5
  return [...pol, ...trg, ...gate].filter((l) => { const t = l.split(" ")[0]; return FAMILIES.test(t) || scoped(t); });
}
const familyTables = (db: string) => sql(db, `select tablename from pg_tables where schemaname = 'public' order by 1`).split("\n").filter((t) => FAMILIES.test(t));
const count = (db: string, t: string) => Number(sql(db, `select count(*) from "${t}"`));

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO, BARE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
const clients: { $disconnect(): Promise<void> }[] = [];
const pools: pg.Pool[] = [];
try {
  // ------------------------------------------------------------------------------------------------- the migration
  const before = all.filter((d) => d < NEW), text = readFileSync(join(MIG, NEW, "migration.sql"), "utf8"), code = text.replace(/^\s*--.*$/gm, "");
  ok(`PF-12: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)}; P-348 (8), P-600 (4))`, all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  const altered = [...code.matchAll(/ALTER TABLE "\w+" ([^;]+);/g)].map((m) => m[1]);
  ok("PF-12 (brief): policies and roles only — no CREATE/DROP TABLE, no column, key or index change; every ALTER TABLE only enables or forces row-level security", altered.length > 0 && altered.every((a) => /^(ENABLE|FORCE) ROW LEVEL SECURITY$/.test(a)) && !/\b(CREATE|DROP)\s+(TABLE|INDEX|TYPE)\b|\bADD\s+COLUMN\b|^\s*(UPDATE|DELETE|INSERT|TRUNCATE)\b/im.test(code), altered.filter((a) => !/ROW LEVEL SECURITY/.test(a)));
  const fns = [...code.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].map((m) => m[1]);
  ok("PF-12 (rows rev 15.2): every function the migration creates carries the area prefix platform_", fns.length >= 1 && fns.every((f) => f.startsWith("platform_")), fns);
  ok("PF-12 (rev 16.34): xr_case_lookup is created only when missing (CS-W1 part 1 may have created it), and NOLOGIN", /\('xr_case_lookup', false, false\)/.test(code) && /format\('CREATE ROLE %I %s%s', want\.name, CASE WHEN want\.login THEN 'LOGIN' ELSE 'NOLOGIN' END/.test(code) && /WHEN duplicate_object THEN EXIT/.test(code)); // PF-8b F4: the RDS-safe form (only differing attributes altered; the end state checked, line below and the role checks)
  // Right after its own migration (rows rev 16.7): bare gets every migration before it, then it, then is measured.
  for (const d of before) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);
  const bareUnwalled = unwalled(BARE);
  ok("PF-12 fail: before the migration the firm tables have no wall (the guard lists them)", bareUnwalled.length >= 50 && bareUnwalled.includes("fo_lead") && bareUnwalled.includes("money_invoice"), bareUnwalled.length);
  psql(urlOf(BARE), ["-f", join(MIG, NEW, "migration.sql")]);
  const walled = familyTables(BARE).filter((t) => !EXCEPTIONS.includes(t));
  ok(`PF-12 pass: right after the migration every table of the families has its forced policy (${walled.length} tables; exceptions ${EXCEPTIONS.filter((t) => familyTables(BARE).includes(t)).join(", ")})`, unwalled(BARE, true).length === 0 && walled.length >= 60, unwalled(BARE, true));
  ok(`PF-12: the catalogues on the exception list stay outside the walls (no firm_id: ${CATALOGUES.join(", ")})`, sql(BARE, `select count(*) from pg_class where relname = any('{${CATALOGUES.join(",")}}') and not relrowsecurity`) === String(CATALOGUES.length));
  ok("PF-12 pass: a pending sign-up (no firm yet) is forced with no policy: xr_app reads none even naming no firm, the bypass role reads them", sql(BARE, `select relforcerowsecurity and not exists (select 1 from pg_policy where polrelid = 'platform_signup_pending'::regclass) from pg_class where relname = 'platform_signup_pending'`) === "t");

  for (const d of all) psql(urlOf(EMPTY), ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-12 pass: every migration applies in order to an empty database", sql(EMPTY, `select count(*) from pg_policy where polname = 'pf12_firm'`) !== "0");
  // The guard for every later row: the newest database (every migration) still has no unwalled firm table.
  ok("PF-12 guard pass: with every migration on main, no platform_*, fo_*, money_*, msg_*, auto_* or plat_complaint* table, and no other table with a firm_id column (PF-12b part 5, QA-703), is without its forced policy", unwalled(EMPTY).length === 0, unwalled(EMPTY));
  const fid = firmIdTables(EMPTY), elsewhereList = Object.keys(FIRM_ID_ELSEWHERE);
  const listHolds = () => elsewhereList.every((t) => fid.has(t) && !FAMILIES.test(t)) && sql(EMPTY, `select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname = any('{${elsewhereList.join(",")}}') and relforcerowsecurity`) === "0" && [...fid].filter((t) => !FAMILIES.test(t) && !EXCEPTIONS.includes(t) && !elsewhereList.includes(t)).every((t) => !unwalled(EMPTY).includes(t));
  ok("PF-12b5 guard: the firm tables kept outside the platform policy are exactly the named list, each still a firm table, none a family table, and none walled yet (a table walled later must leave the list; review m2)", listHolds(), { missing: elsewhereList.filter((t) => !fid.has(t)) });
  sql(EMPTY, "alter table case_stage enable row level security, force row level security");
  ok("PF-12b5 guard fail (review r1): a listed table that gets walled (case_stage forced here) fails the list check until it leaves the list", !listHolds());
  sql(EMPTY, "alter table case_stage no force row level security, disable row level security");
  ok("PF-12b5 guard pass (break M1, M2): no view reads past the walls (both views on main are security_invoker), no materialized view, nothing outside the public schema", sideDoors(EMPTY).length === 0, sideDoors(EMPTY));
  ok("PF-12b5 pass (QA-703): webhook_receipt has its forced firm policy (platform_session_firm()) and the first gate", sql(EMPTY, `select c.relrowsecurity and c.relforcerowsecurity and exists (select 1 from pg_policy p where p.polrelid = c.oid and pg_get_expr(p.polqual, p.polrelid) ~ 'platform_session_firm') and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = '0_pf12_firm_first') from pg_class c where c.relname = 'webhook_receipt'`) === "t");
  ok("PF-12 guard pass: every firm table's policy for the app names the session's firm, and every trigger function on a firm table runs as xr_wall_reader", unguarded(EMPTY).length === 0, unguarded(EMPTY));
  sql(EMPTY, `create policy pf12_probe_open on fo_lead for select using (true);
    create function fo_pf12_probe_fn() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger fo_pf12_probe_trg before insert on fo_note for each row execute function fo_pf12_probe_fn();`);
  const ung = unguarded(EMPTY);
  ok("PF-12 guard fail: an open policy added to a walled table, and a plain trigger function on a firm table, are each named", ung.some((l) => /fo_lead policy pf12_probe_open/.test(l)) && ung.some((l) => /fo_note trigger function fo_pf12_probe_fn/.test(l)), ung);
  sql(EMPTY, "drop policy pf12_probe_open on fo_lead; drop trigger fo_pf12_probe_trg on fo_note; drop function fo_pf12_probe_fn()");
  sql(EMPTY, `create function platform_pf12_probe_fn() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger platform_pf12_probe_trg before insert on platform_signup_pending for each row execute function platform_pf12_probe_fn();
    create policy pf12_probe_tpl on platform_staff for select using ((firm_id IS NULL) AND (platform_session_firm() IS NOT NULL));`);
  const ungX = unguarded(EMPTY);
  ok("PF-12b5 guard fail (review r1, r2): a plain trigger function on an excepted family table (platform_signup_pending), and the templates' firm-less read given to another table, are each named",
    ungX.some((l) => /^platform_signup_pending trigger function platform_pf12_probe_fn$/.test(l)) && ungX.some((l) => /^platform_staff policy pf12_probe_tpl$/.test(l)), ungX);
  sql(EMPTY, "drop trigger platform_pf12_probe_trg on platform_signup_pending; drop function platform_pf12_probe_fn(); drop policy pf12_probe_tpl on platform_staff");
  // ... and it fails for a table that forgot (the probes are dropped again).
  sql(EMPTY, `create table widget_pf12_probe (id uuid primary key, firm_id uuid); create table fo_pf12_probe (id uuid primary key, firm_id uuid not null); create table auto_pf12_probe (id uuid primary key, firm_id uuid not null); create table plat_complaint_pf12_probe (id uuid primary key, firm_id uuid not null);
    create table money_pf12_probe (id uuid primary key, firm_id uuid not null); alter table money_pf12_probe enable row level security; create policy p on money_pf12_probe using (firm_id = platform_session_firm());
    create policy pf12_probe_open on platform_signup_pending using (true);`);
  const probes = unwalled(EMPTY);
  ok("PF-12b5 guard fail (QA-703): a new table outside the families with a firm_id column and no policy (as webhook_receipt was) is named", probes.includes("widget_pf12_probe"), probes);
  sql(EMPTY, `create table gadget_pf12_probe (id uuid primary key, firm_key text); create view pf12_probe_view as select * from webhook_receipt; create materialized view pf12_probe_mat as select * from webhook_receipt;
    create schema pf12_probe_ns; create table pf12_probe_ns.t (id uuid primary key, firm_id uuid);
    alter table widget_pf12_probe enable row level security, force row level security; create policy p on widget_pf12_probe using (firm_id = platform_session_firm() or true);`);
  const doors = sideDoors(EMPTY), ung5 = unguarded(EMPTY);
  ok("PF-12b5 guard fail (break M1, M2): a firm_key table with no policy, a view that is not security_invoker, a materialized view, a table in another schema, and a policy that only mentions the session's firm are each named",
    unwalled(EMPTY).includes("gadget_pf12_probe") && doors.some((d) => d.startsWith("public.pf12_probe_view ")) && doors.some((d) => d.startsWith("public.pf12_probe_mat ")) && doors.some((d) => d.startsWith("pf12_probe_ns.t ")) && ung5.some((l) => /^widget_pf12_probe policy p$/.test(l)), { doors, ung5 });
  sql(EMPTY, "drop view pf12_probe_view; drop materialized view pf12_probe_mat; drop schema pf12_probe_ns cascade; drop table gadget_pf12_probe; drop policy p on widget_pf12_probe");
  ok("PF-12 guard fail: a new fo_, auto_ or plat_complaint table with no policy, a money_ table whose policy is not forced, and our own register given a policy, are each named", ["fo_pf12_probe", "auto_pf12_probe", "plat_complaint_pf12_probe", "money_pf12_probe"].every((t) => probes.includes(t)) && probes.some((p) => p.startsWith("platform_signup_pending (own register")), probes);
  // Default privileges: a later migration's table is open to the app's role (a grant) but walled once it has its policy.
  ok("PF-12: a later migration's table gets the app's table rights by default privileges (xr_app may read it, so the policy is what walls it)", asApp(EMPTY, null, "select count(*) from fo_pf12_probe") === "0");
  sql(EMPTY, "drop table widget_pf12_probe, fo_pf12_probe, auto_pf12_probe, plat_complaint_pf12_probe, money_pf12_probe; drop policy pf12_probe_open on platform_signup_pending");

  // ------------------------------------------------------------------------------------------------------ the roles
  const role = (r: string) => sql(EMPTY, `select rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolreplication from pg_roles where rolname = '${r}'`);
  ok("PF-12 pass: xr_app can log in and is not a superuser, has no BYPASSRLS, cannot create roles or databases", role("xr_app") === "f|f|t|f|f|f", role("xr_app"));
  ok("PF-12 fail: the migration role (xr_studio, the tables' owner) is the superuser that the app must not be", role("xr_studio").startsWith("t|"), role("xr_studio"));
  const owner = sql(EMPTY, `select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public'`);
  ok("PF-12: the migration role owns every table; xr_app owns none (nor any role it is a member of)", owner === "xr_studio" && sql(EMPTY, `select count(*) from pg_class where relnamespace = 'public'::regnamespace and pg_has_role('xr_app', relowner, 'MEMBER')`) === "0", owner);
  const appPool = new pg.Pool({ connectionString: appDatabaseUrl(urlOf(EMPTY), {}) }), ownerPool = new pg.Pool({ connectionString: urlOf(EMPTY) });
  pools.push(appPool, ownerPool);
  const viaPool = (p: pg.Pool) => (s: string) => p.query(s) as Promise<{ rows: Record<string, unknown>[] }>;
  const appProblems = await appRoleProblems(viaPool(appPool)), ownerProblems = await appRoleProblems(viaPool(ownerPool));
  ok("PF-12 start-up check pass: as xr_app nothing is wrong", appProblems.length === 0, appProblems);
  ok("PF-12 start-up check fail: as the owner it names the superuser and the owned tables", ownerProblems.some((p) => /superuser/.test(p)) && ownerProblems.some((p) => /owns/.test(p)), ownerProblems);
  // A plain (not superuser) role that owns one table, and one with BYPASSRLS: each refused by the same check.
  sql(EMPTY, `do $$ begin if not exists (select 1 from pg_roles where rolname = 'xr_pf12_probe_owner') then create role xr_pf12_probe_owner login; end if; end $$;
    create table pf12_probe_owned (id int); alter table pf12_probe_owned owner to xr_pf12_probe_owner;`);
  const probeOwnerPool = new pg.Pool({ connectionString: urlOf(EMPTY, "xr_pf12_probe_owner") }); pools.push(probeOwnerPool);
  const probeOwner = await appRoleProblems(viaPool(probeOwnerPool));
  ok("PF-12 start-up check fail: a plain role that owns one table is refused (not only a superuser)", probeOwner.length === 1 && /owns .*1 table/.test(probeOwner[0]), probeOwner);
  await probeOwnerPool.end(); pools.splice(pools.indexOf(probeOwnerPool), 1);
  sql(EMPTY, "drop table pf12_probe_owned; drop role xr_pf12_probe_owner");

  const asAppRaw = (q: string) => sql(EMPTY, q, "xr_app");
  ok("PF-12 (FO-13 break 4) fail: xr_app cannot set session_replication_role (triggers and keys stay on)", refused(() => asAppRaw("set session_replication_role = replica"), /permission denied/i));
  ok("PF-12 (FO-13 break 4) fail: xr_app cannot disable a trigger (owner only)", refused(() => asAppRaw(`alter table "fo_lead" disable trigger all`), /must be owner/i));
  ok("PF-12 fail: xr_app cannot create a table, so it can never own one", refused(() => asAppRaw("create table pf12_mine (id int)"), /permission denied/i));
  ok("PF-12 fail: xr_app cannot become the owner, the case lookup role or the wall reader (SET ROLE refused)", refused(() => asAppRaw("set role xr_studio"), /permission denied/i) && refused(() => asAppRaw("set role xr_case_lookup"), /permission denied/i) && refused(() => asAppRaw("set role xr_wall_reader"), /permission denied/i));
  ok("PF-12 fail (breaker m7): xr_app cannot setval a shared sequence (every firm's next write would fail); nextval still works", refused(() => asAppRaw("select setval('module_event_seq_seq', 1)"), /permission denied/i) && /^\d+$/.test(asAppRaw("select nextval('module_event_seq_seq')")));
  ok("PF-12: xr_wall_reader cannot log in; it owns the firm tables' trigger functions and the address lookup, no table", refused(() => sql(EMPTY, "select 1", "xr_wall_reader"), /not permitted to log in/i) && sql(EMPTY, `select (select count(*) from pg_class where relowner = r.oid) || '|' || (select count(*) > 60 from pg_proc where proowner = r.oid) from pg_roles r where rolname = 'xr_wall_reader'`) === "0|true");
  sql(EMPTY, "alter function platform_session_firm() owner to xr_staff_bypass");
  const viaBypassFn = await appRoleProblems(viaPool(appPool));
  sql(EMPTY, "alter function platform_session_firm() owner to xr_studio");
  ok("PF-12 start-up check fail (breaker m6): a function owned by a role xr_app may become (the bypass role) is named", viaBypassFn.some((p) => /function/.test(p)), viaBypassFn);
  ok("PF-12 fail: xr_app cannot turn row-level security off for itself (row_security = off is refused for a policied table)", refused(() => asAppRaw(`set row_security = off; select count(*) from "platform_staff"`), /row-level security/i));
  ok("PF-12 pass: xr_app may SET ROLE to the bypass role only (SET, not inherited: without it xr_app has no BYPASSRLS)", asAppRaw("set role xr_staff_bypass; select current_user") === "xr_staff_bypass" && sql(EMPTY, `select count(*) from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where u.rolname = 'xr_app' and r.rolname = 'xr_staff_bypass' and m.inherit_option = false and m.set_option = true`) === "1");
  const terse = sql(EMPTY, `select coalesce(string_agg(c, ','), '') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c where r.rolname = 'xr_app'`);
  ok("PF-12 (FO-13 break 11): xr_app logs terse errors, so a refused row's DETAIL never repeats its values in the log", /log_error_verbosity=terse/.test(terse) && asAppRaw("show log_error_verbosity") === "terse", terse);
  const lookup = sql(EMPTY, `select rolcanlogin, (select count(*) from pg_class where relowner = r.oid), (select count(*) from information_schema.role_table_grants where grantee = 'xr_case_lookup') from pg_roles r where rolname = 'xr_case_lookup'`);
  ok("PF-12 (rev 16.34): xr_case_lookup cannot log in, owns no table and holds no table grant", lookup === "f|0|0", lookup);
  ok("PF-12 (rev 16.34) fail: signing in as xr_case_lookup is refused", refused(() => sql(EMPTY, "select 1", "xr_case_lookup"), /not permitted to log in/i));
  // Idempotent: the roles part again (as when CS-W1 part 1 or another database on the cluster ran it first) changes nothing.
  const rolesPart = text.slice(text.indexOf("DO $$"), text.indexOf("GRANT USAGE ON SCHEMA"));
  psql(urlOf(EMPTY), ["-c", rolesPart]);
  const together = await Promise.all(Array.from({ length: 4 }, () => new Promise<number | null>((res) => spawn(join(BIN, "psql"), [urlOf(EMPTY), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", rolesPart], { stdio: "ignore" }).on("exit", res)))); ok("PF-12 pass (CI packs): four sessions run the roles part at the same moment, and each succeeds (no tuple concurrently updated)", together.every((c) => c === 0), together);
  ok("PF-12: the roles part runs again with every role already there, changing nothing", role("xr_app") === "f|f|t|f|f|f" && lookup === sql(EMPTY, `select rolcanlogin, (select count(*) from pg_class where relowner = r.oid), (select count(*) from information_schema.role_table_grants where grantee = 'xr_case_lookup') from pg_roles r where rolname = 'xr_case_lookup'`));

  // ----------------------------------------------------------------------------------- the walls on demo-shaped data
  for (const d of before) psql(urlOf(DEMO), ["-f", join(MIG, d, "migration.sql")]);
  const seedDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) }); clients.push(seedDb);
  await seedSampleFirms(seedDb);
  await seedSampleFirmsFrontOffice(seedDb);
  const tables = familyTables(DEMO), counts = Object.fromEntries(tables.map((t) => [t, count(DEMO, t)]));
  // PF-12's own migration first, checked alone: a later row may add rows of its own (FO-13i's key, review M2).
  psql(urlOf(DEMO), ["-f", join(MIG, NEW, "migration.sql")]);
  ok("PF-12 pass: the migration applies on the demo-data copy and changes no row (owner's counts the same on every family table)", tables.every((t) => count(DEMO, t) === counts[t]) && Object.values(counts).reduce((a, b) => a + b, 0) > 0, tables.filter((t) => count(DEMO, t) !== counts[t]));
  for (const d of all.filter((d) => d > NEW)) psql(urlOf(DEMO), ["-f", join(MIG, d, "migration.sql")]);
  const firms = sql(DEMO, "select id from platform_firm order by key").split("\n").filter(Boolean);
  const [A, B] = firms;
  // Rows for families the seed leaves empty: one per firm, written as the owner.
  sql(DEMO, `insert into msg_firm (firm_id) select id from platform_firm where id in ('${A}', '${B}') on conflict do nothing`);
  sql(DEMO, `insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) select f.id, d.key, '"Sample"', 'test', now() from platform_firm f, (select key from platform_setting_definition order by key limit 1) d where f.id in ('${A}', '${B}') on conflict do nothing`);
  sql(DEMO, `insert into money_payment_settings (firm_id, updated_at, updated_by) select id, now(), 'test' from platform_firm where id in ('${A}', '${B}') on conflict do nothing`);
  sql(DEMO, `insert into money_number_series (firm_id, kind, prefix) select id, 'INVOICE', 'INV-' from platform_firm where id in ('${A}', '${B}') on conflict do nothing`);
  const withRows = tables.filter((t) => !EXCEPTIONS.includes(t) && count(DEMO, t) > 0);
  const noFirm = withRows.filter((t) => asApp(DEMO, null, `select count(*) from "${t}"`) !== "0");
  ok(`PF-12 pass: a raw query with no app.firm_id reads nothing from any walled table that has rows (${withRows.length} tables)`, withRows.length >= 5 && noFirm.length === 0, noFirm);
  ok("PF-12 fail: the same tables do have rows (the owner reads them), and a catalogue outside the walls still reads with no firm", withRows.every((t) => count(DEMO, t) > 0) && Number(asApp(DEMO, null, `select count(*) from "platform_permission_key"`)) > 0);
  const own = (t: string, f: string) => Number(asApp(DEMO, f, `select count(*) from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} = '${f}'`));
  const theirs = (t: string, f: string, other: string) => asApp(DEMO, f, `select count(*) from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} = '${other}'`);
  // One table of each family that has rows for both firms (or the closest the Sample data gives).
  const family = (re: RegExp) => withRows.find((t) => re.test(t) && Number(sql(DEMO, `select count(distinct ${t === "platform_firm" ? "id" : "firm_id"}) from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} in ('${A}','${B}')`)) === 2);
  const picks = ["platform_staff", family(/^fo_/), family(/^money_/), family(/^msg_/), "platform_firm"].filter((t): t is string => !!t);
  for (const t of picks) {
    // The row's key: its id where it has one, else the firm and kind (money_number_series is keyed by firm and kind).
    const hasId = sql(DEMO, `select count(*) from information_schema.columns where table_name = '${t}' and column_name = 'id'`) === "1";
    const key = hasId ? `id = '${sql(DEMO, `select id from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} = '${B}' limit 1`)}'` : `firm_id = '${B}'`;
    const set = hasId ? "id = id" : "firm_id = firm_id";
    ok(`PF-12 pass: firm A's session reads its own ${t} rows`, own(t, A) > 0);
    ok(`PF-12 fail: firm A's session reading firm B's ${t} row by ${hasId ? "id" : "key"} gets nothing (and no B row by firm)`, asApp(DEMO, A, `select count(*) from "${t}" where ${key}`) === "0" && theirs(t, A, B) === "0");
    ok(`PF-12 fail: firm A's session cannot change or delete firm B's ${t} row (0 rows; still there for the owner)`, asApp(DEMO, A, `with u as (update "${t}" set ${set} where ${key} returning 1) select count(*) from u`) === "0" && asApp(DEMO, A, `with d as (delete from "${t}" where ${key} returning 1) select count(*) from d`) === "0" && Number(sql(DEMO, `select count(*) from "${t}" where ${key}`)) >= 1);
  }
  ok(`PF-12: one table of each family was found with both firms' rows (${picks.join(", ")})`, picks.length === 5, picks);
  const KEY = `'${sql(DEMO, "select key from platform_setting_definition order by key limit 1")}'`;
  ok("PF-12 fail: firm A's session cannot write a row naming firm B (WITH CHECK refuses it)", refused(() => asApp(DEMO, A, `insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) values ('${B}', ${KEY}, '1', 'test', now())`), /row-level security/i) && refused(() => asApp(DEMO, A, `update platform_firm_setting set firm_id = '${B}' where firm_id = '${A}'`), /row-level security/i));
  ok("PF-12 pass: firm A's session changes its own rows", Number(asApp(DEMO, A, `with u as (update platform_firm_setting set changed_by = changed_by where firm_id = '${A}' returning 1) select count(*) from u`)) > 0);
  ok("PF-12 fail: with no firm a write is refused", refused(() => asApp(DEMO, null, `insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) values ('${A}', ${KEY}, '1', 'test', now())`), /row-level security/i));
  ok("PF-12 fail: an app.firm_id that is not a uuid is an error, never a match", refused(() => sql(DEMO, `begin; select set_config('app.firm_id', 'x', true); select count(*) from platform_staff; commit;`, "xr_app"), /invalid input syntax for type uuid/i));
  // Platform-owned templates (firm_id null): firms read them; nobody but the bypass role writes them.
  sql(DEMO, `insert into msg_template (id, firm_id, owner, key, kind, channel, language, updated_at) values ('00000000-0000-4000-8000-00000000f012', null, 'PLATFORM', 'pf12.probe', 'probe', 'EMAIL', 'en', now())`);
  ok("PF-12 pass: a firm reads a platform-owned template (firm_id null)", asApp(DEMO, A, `select count(*) from msg_template where id = '00000000-0000-4000-8000-00000000f012'`) === "1");
  ok("PF-12 fail: with no firm the platform template reads nothing; a firm cannot change or add one", asApp(DEMO, null, `select count(*) from msg_template where id = '00000000-0000-4000-8000-00000000f012'`) === "0" && asApp(DEMO, A, `with u as (update msg_template set key = 'x' where id = '00000000-0000-4000-8000-00000000f012' returning 1) select count(*) from u`) === "0" && refused(() => asApp(DEMO, A, `insert into msg_template (id, firm_id, owner, key, kind, channel, language, updated_at) values (gen_random_uuid(), null, 'PLATFORM', 'pf12.probe3', 'probe', 'EMAIL', 'en', now())`), /row-level security/i));
  // Breaker M1: firm A links its row to firm B's template (the trigger could not see B's row; the key ignores the walls).
  sql(DEMO, `insert into msg_template (id, firm_id, owner, key, kind, channel, language, updated_at) values ('00000000-0000-4000-8000-0000000b0012', '${B}', 'FIRM', 'pf12.b', 'probe', 'EMAIL', 'en', now())`);
  const vcols = "id, firm_id, template_id, version, subject, body, published_by";
  const hasVcols = sql(DEMO, `select count(*) from information_schema.columns where table_name = 'msg_template_version' and column_name in ('version','subject','body','published_by')`) === "4";
  ok("PF-12 fail (breaker M1): firm A cannot add a template version on firm B's template (msg_template_version_in_firm sees B's row again)", hasVcols && refused(() => asApp(DEMO, A, `insert into msg_template_version (${vcols}) values (gen_random_uuid(), '${A}', '00000000-0000-4000-8000-0000000b0012', 1, 's', 'b', 'system:pf12-test')`), /is not its template's firm/i));
  ok("PF-12 pass: firm B adds a version on its own template", hasVcols && asApp(DEMO, B, `with i as (insert into msg_template_version (${vcols}) values ('00000000-0000-4000-8000-0000000b0013', '${B}', '00000000-0000-4000-8000-0000000b0012', 1, 's', 'b', 'system:pf12-test') returning 1) select count(*) from i`) === "1");
  // Breaker M2: firm B takes the address firm A holds for its redirect (the held-by-other check could not see A's history).
  sql(DEMO, `insert into platform_firm_web_address (firm_id, address, set_by, updated_at) values ('${A}', 'pf12-a', 'system:pf12-test', now()), ('${B}', 'pf12-b', 'system:pf12-test', now()) on conflict do nothing`);
  const aAddr = sql(DEMO, `select address from platform_firm_web_address where firm_id = '${A}'`), bAddr = sql(DEMO, `select address from platform_firm_web_address where firm_id = '${B}'`);
  // As the owner, firm A moves to a new address the way the app does (its redirect record first): its old one is held 90 days.
  sql(DEMO, `begin; insert into platform_firm_address_history (id, firm_id, old_address, new_address, until, reason, changed_by, changed_at) values (gen_random_uuid(), '${A}', '${aAddr}', 'pf12-a-new', now() + interval '2160 hours', 'pf12 test move', 'system:pf12-test', now());
    update platform_firm_web_address set address = 'pf12-a-new' where firm_id = '${A}'; commit;`);
  ok("PF-12 fail (breaker M2): firm B cannot take the address firm A holds for its redirect (platform_web_address_held_by_other sees A's row again)", !!aAddr && !!bAddr && refused(() => asApp(DEMO, B, `insert into platform_firm_address_history (id, firm_id, old_address, new_address, until, reason, changed_by, changed_at) values (gen_random_uuid(), '${B}', '${bAddr}', '${aAddr}', now() + interval '2160 hours', 'pf12 test move', 'system:pf12-test', now()); update platform_firm_web_address set address = '${aAddr}' where firm_id = '${B}'`), /held for another firm/i));
  // Breaker R2-1: a row naming firm B reached B-reading triggers before the wall's check; the gate refuses it first.
  const bPerson = sql(DEMO, `insert into fo_person (firm_id, created_by, updated_at) values ('${B}', 'staff:pf12', now()) returning id`).split("\n")[0];
  const bInv = sql(DEMO, `insert into money_invoice (firm_id, person_id, created_by, updated_at) values ('${B}', '${bPerson}', 'staff:pf12', now()) returning id`).split("\n")[0];
  const line = (f: string, cur: string) => `insert into money_invoice_line (firm_id, invoice_id, position, kind, description, unit_amount_minor, amount_minor, currency) values ('${f}', '${bInv}', 1, (enum_range(null::"MoneyLineKind"))[1], 'x', 1, 1, '${cur}')`;
  const otherCur = sql(DEMO, `select (array_remove(enum_range(null::"MoneyCurrency")::text[], (select currency::text from money_invoice where id = '${bInv}')))[1]`);
  ok("PF-12 fail (breaker R2-1): firm A's row naming firm B's invoice gets the wall's refusal only, never B's currency from its trigger (the bypass role still gets the trigger's)", refused(() => asApp(DEMO, A, line(B, otherCur)), /^(?![\s\S]*currency)[\s\S]*row-level security policy for table "money_invoice_line"/) && refused(() => sql(DEMO, `begin; set local role xr_staff_bypass; ${line(B, otherCur)}; commit;`, "xr_app"), /currency/i));
  ok("PF-12 fail (breaker R3-1): with no firm set, a row with no firm is refused by the gate before any other trigger", refused(() => asApp(DEMO, null, `insert into msg_template_version (id, firm_id, template_id, version, subject, body, published_by) values (gen_random_uuid(), null, '00000000-0000-4000-8000-0000000b0012', 2, 's', 'b', 'system:pf12-test')`), /^(?![\s\S]*template's firm)[\s\S]*row-level security policy for table "msg_template_version"/));
  ok("PF-12 pass: the address lookup tells a firm which addresses another firm has or holds, never a firm id, and not its own", asApp(DEMO, B, `select string_agg(a, ',' order by a) from platform_web_address_taken(array['${aAddr}', '${bAddr}', 'pf12-free'], now(), '${B}') a`) === aAddr && sql(DEMO, `select pg_get_function_result('platform_web_address_taken(text[], timestamptz, uuid)'::regprocedure)`) === "SETOF text");
  // PF-12b5 (QA-703): webhook receipts behind the wall. As the owner: one receipt per firm and one matched to no firm.
  sql(DEMO, `insert into webhook_receipt (id, firm_id, service, event_id) values (gen_random_uuid(), '${A}', 'stripe', 'evt_pf12b5_a'), (gen_random_uuid(), '${B}', 'stripe', 'evt_pf12b5_b'), (gen_random_uuid(), null, 'stripe', 'evt_pf12b5_none')`);
  ok("PF-12b5 pass: as firm A the app reads only firm A's receipt; with no firm it reads none (the unmatched one included); the bypass role reads all three",
    asApp(DEMO, A, "select string_agg(event_id, ',') from webhook_receipt where event_id like 'evt_pf12b5_%'") === "evt_pf12b5_a" && asApp(DEMO, null, "select count(*) from webhook_receipt") === "0"
      && sql(DEMO, `begin; set local role xr_staff_bypass; select count(*) from webhook_receipt where event_id like 'evt_pf12b5_%'; commit;`, "xr_app") === "3");
  ok("PF-12b5 fail: as firm A the app cannot write a receipt for firm B or for no firm, nor move one (the wall and its first gate)",
    refused(() => asApp(DEMO, A, `insert into webhook_receipt (id, firm_id, service, event_id) values (gen_random_uuid(), '${B}', 'stripe', 'evt_pf12b5_x')`), /row-level security/)
      && refused(() => asApp(DEMO, A, `insert into webhook_receipt (id, firm_id, service, event_id) values (gen_random_uuid(), null, 'stripe', 'evt_pf12b5_y')`), /row-level security/)
      && asApp(DEMO, A, `update webhook_receipt set outcome = 'x' where event_id = 'evt_pf12b5_b' returning 1`) === "");
  ok("PF-12b5 pass: the bypass role (the Stripe door's own use) still writes an unmatched receipt and records its outcome", sql(DEMO, `begin; set local role xr_staff_bypass; insert into webhook_receipt (id, firm_id, service, event_id) values (gen_random_uuid(), null, 'stripe', 'evt_pf12b5_z'); update webhook_receipt set handled_at = now(), outcome = 'no firm matched' where event_id = 'evt_pf12b5_z' returning outcome; commit;`, "xr_app") === "no firm matched");
  ok("PF-12 pass: the bypass role reads both firms' rows", Number(sql(DEMO, `begin; set local role xr_staff_bypass; select count(distinct firm_id) from platform_staff where firm_id in ('${A}','${B}'); commit;`, "xr_app")) === 2);

  // ------------------------------------------------------------------- the app's pool, the named list and the request
  ok("PF-12 pass: in a suite or tool process a query with no scope runs on the bypass (the process holds the owner's address anyway)", unscopedMode() === "direct");
  const directPool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DEMO), {}), max: 1 }); pools.push(directPool);
  ok("PF-12 pass: so a suite seeding through the app's client still reads every firm", Number((await (directPool as pg.Pool).query("select count(distinct firm_id) as n from platform_staff")).rows[0].n) >= 2);
  ok("PF-12 pass: in a suite or tool process a direct use runs on a call with no scope (a suite calling the service with its own client; PF-12b part 2: the demo inbox, the doors left the list)", Number((await asBypass("platform.demo.inbox", () => (directPool as pg.Pool).query("select count(distinct firm_id) as n from platform_staff"))).rows[0].n) >= 2);
  const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
  await new FirmWallsInterceptor({ $queryRawUnsafe: async (q: string) => (await appPool.query(q)).rows } as never).onModuleInit();
  ok("PF-12 pass: the API server's start-up (FirmWallsInterceptor, registered by api/src/features/platform-firm-walls.ts) walls every unscoped query from then on", unscopedMode() === "walled" && existsSync(join(STUDIO, "api", "src", "features", "platform-firm-walls.ts")));
  const { asJob } = await import("../api/src/platform/firm-scope.ts");
  const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DEMO), {}), max: 1, options: "-c TimeZone=UTC" }); pools.push(pool);
  const db = new PrismaClient({ adapter: new PrismaPg(pool) }); clients.push(db);
  const staffOf = () => db.platformStaff.findMany({ select: { firmId: true } });
  ok("PF-12 pass: the API's pool with no firm reads no staff", (await staffOf()).length === 0);
  const aRows = await withFirm(A, staffOf);
  ok("PF-12 pass: the API's pool as firm A reads only firm A's staff", aRows.length > 0 && aRows.every((r) => r.firmId === A), aRows.length);
  ok("PF-12 fail: the next query on the same connection with no firm reads nothing again (no firm leaks from one checkout to the next)", (await staffOf()).length === 0);
  const killed = await Promise.allSettled([pool.query("select pg_sleep(5)"), (async () => { await new Promise((r) => setTimeout(r, 300)); sql(DEMO, "select pg_terminate_backend(pid) from pg_stat_activity where usename = 'xr_app' and query = 'select pg_sleep(5)'"); })()]); ok("PF-12 fail (Devin review): a connection dropped mid-query fails that query only; the process and the pool carry on", killed[0].status === "rejected" && (await withFirm(A, staffOf)).length > 0);
  const bStaff = sql(DEMO, `select id from platform_staff where firm_id = '${B}' limit 1`), aStaff = sql(DEMO, `select id from platform_staff where firm_id = '${A}' limit 1`);
  ok("PF-12 fail: firm A's pool reads firm B's staff member by id as not found", (await withFirm(A, () => db.platformStaff.findUnique({ where: { id: bStaff } }))) === null);
  const inTx = await withFirm(A, () => db.$transaction(async (tx) => (await tx.platformStaff.findMany({ select: { firmId: true } })).map((r) => r.firmId)));
  ok("PF-12 pass: an interactive transaction runs as the firm that opened it", inTx.length > 0 && inTx.every((f) => f === A));
  // Many at once, two firms: each sees only its own (the pool sets the firm per checkout; four connections here).
  const pool4 = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DEMO), {}), max: 4, options: "-c TimeZone=UTC" }); pools.push(pool4);
  const db4 = new PrismaClient({ adapter: new PrismaPg(pool4) }); clients.push(db4);
  const mixed = await Promise.all(Array.from({ length: 40 }, (_, i) => { const f = i % 2 ? A : B; return withFirm(f, async () => ({ f, rows: await db4.platformStaff.findMany({ select: { firmId: true } }) })); }));
  ok("PF-12 pass: 40 queries at once from two firms each read only their own firm's rows", mixed.every((m) => m.rows.length > 0 && m.rows.every((r) => r.firmId === m.f)));
  const lookups = (c: PrismaClient) => Promise.all(Array.from({ length: 20 }, (_, i) => { const [f, id] = i % 2 ? [A, aStaff] : [B, bStaff]; return withFirm(f, () => c.platformStaff.findUnique({ where: { id } })); }));
  const merged = await lookups(db4);
  ok("PF-12 fail: a plain Prisma client merges 20 findUnique calls from two firms into one query, so one firm's staff read as not found", merged.some((u) => !u), merged.filter((u) => !u).length);
  oneQueryPerCaller(db4);
  const uniq = await lookups(db4);
  ok("PF-12 pass: with oneQueryPerCaller (core.ts Db) the 20 calls each find their own firm's staff member", uniq.every((u) => !!u), uniq.filter((u) => !u).length);
  const { Db } = await import("../api/src/core.ts");
  ok("PF-12 pass: the API's client (core.ts Db) sends each call outside a transaction on its own", ((new Db() as unknown as { _requestHandler: { dataloader: { options: { batchBy(r: object): unknown } } } })._requestHandler.dataloader.options.batchBy({ protocolQuery: { modelName: "PlatformStaff", action: "findUnique", query: { arguments: { where: { id: aStaff } }, selection: { $scalars: true } } } })) === undefined);

  const lines: string[] = [];
  const was = onBypassLine((use, route) => lines.push(`${use} ${route ?? "-"}`));
  ok("PF-12 fail: a bypass use that is not on the named list is refused before any query", await asBypass("platform.everything", staffOf).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 fail: a request's bypass use (sign-up) is refused outside a request in the API server (start-up, a job)", await asBypass("platform.firms.signup", staffOf).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 fail: a request's use is refused inside a job's scope (a job runs as its firm, never on a request's bypass)", await withFirm(A, () => asBypass("platform.demo.inbox", staffOf)).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 pass: a sweep job on the named list (job:messages.outbox_sweep) reads every firm's rows", new Set((await asJob("messages.outbox_sweep", staffOf)).map((r) => r.firmId)).size >= 2);
  ok("PF-12 fail: a job with no firm and no named use reads no firm's rows", (await asJob("platform.stuck_jobs", staffOf)).length === 0);
  ok("PF-12 fail (breaker m8): in the API server a direct use is refused on a call with no scope", await asBypass("platform.demo.inbox", staffOf).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 pass (breaker m3): a use also runs on HEAD and with a trailing slash (the router's own matching)", (await inRequest({ method: "HEAD", path: "/api/demo/platform-inbox/" }, () => asBypass("platform.demo.inbox", staffOf))).length >= 2);
  const caseRoute = { method: "GET", path: "/runtime/cases" }, staffRoute = { method: "POST", path: "/api/public/signup" };
  ok("PF-12 fail: the bypass role is refused on a route not on its list (a page outside /api/)", await inRequest(caseRoute, () => asBypass("platform.firms.signup", staffOf)).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 fail: the sign-up bypass is refused on a staff route, and the demo inbox's on the booking page (each use only on its own routes)", await inRequest({ method: "GET", path: "/api/front-office/leads" }, () => asBypass("platform.firms.signup", staffOf)).then(() => false, (e) => e instanceof BypassRefused) && await inRequest({ method: "GET", path: "/api/public/firms/sample-firm/book/free/slots" }, () => asBypass("platform.demo.inbox", staffOf)).then(() => false, (e) => e instanceof BypassRefused));
  const both = await inRequest(staffRoute, () => asBypass("platform.firms.signup", staffOf));
  ok("PF-12 pass: on a route on its list the bypass reads both firms", new Set(both.map((r) => r.firmId)).size >= 2);
  ok("PF-12 pass: every bypass use writes one line with the use and the route; a refused one writes none", lines.join("|") === "job:messages.outbox_sweep -|platform.demo.inbox GET /api/demo/platform-inbox|platform.firms.signup POST /api/public/signup", lines);
  onBypassLine(was);
  const req = { method: "GET", path: "/api/front-office/leads" };
  setRequestFirm(req, A.toUpperCase());
  const inReq = await inRequest(req, async () => ({ firm: currentFirm(), rows: await staffOf() }));
  ok("PF-12 pass: a handler runs as the firm the guard set (setRequestFirm, in lower case)", inReq.firm === A && inReq.rows.length > 0 && inReq.rows.every((r) => r.firmId === A));
  ok("PF-12 fail: a request whose guard set no firm reads nothing", (await inRequest({ method: "GET", path: "/api/front-office/leads" }, staffOf)).length === 0);
  const onA = { method: "GET", path: "/api/public/forms/x" }; setRequestFirm(onA, A);
  ok("PF-12 fail (review R2): on firm A's own address a door that resolves firm B answers not found", await inRequest(onA, async () => enterFirm(B)).then(() => false, (e) => (e as { getStatus?: () => number }).getStatus?.() === 404));
  ok("PF-12 fail: the guard cannot set a firm id that is not a uuid", refused(() => setRequestFirm({}, "sample-firm"), /not a firm id/));

  // ---------------------------------------------------------------------------- the real API: start-up refusal and pass
  const PORT = await new Promise<number>((res) => { const f = createServer().listen(0, "127.0.0.1", () => { const p = (f.address() as { port: number }).port; f.close(() => res(p)); }); }), BASE = `http://127.0.0.1:${PORT}`;   // a free port (review R2)
  // The real main.ts; `during` runs while it serves, then it is stopped.
  const start = (env: Record<string, string>, during?: () => Promise<void>) => new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, "api", "src", "main.ts")],
      { cwd: STUDIO, env: { ...process.env, PLATFORM_ENVIRONMENT: "local", DATABASE_URL: urlOf(EMPTY), STUDIO_PORT: String(PORT), STUDIO_VAR: join(STUDIO, "var", `pf12-check-${process.pid}`), ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", up = false;
    const done = (code: number | null) => { clearTimeout(t); resolve({ code, out }); };
    const t = setTimeout(() => { p.kill("SIGKILL"); done(-1); }, 180_000);
    const seen = (b: Buffer) => { out += b.toString(); if (!up && /Product Studio on http/.test(out)) { up = true; void (during?.() ?? Promise.resolve()).finally(() => p.kill("SIGTERM")); } };
    p.stdout.on("data", seen); p.stderr.on("data", seen); p.on("exit", (code) => done(code));
  });
  const asOwner = await start({ APP_DATABASE_URL: urlOf(EMPTY) });
  ok("PF-12 fail: the API refuses to start when it connects as the table owner (it names the reason)", !/Product Studio on http/.test(asOwner.out) && /PF-12: the API refuses to start/.test(asOwner.out) && asOwner.code !== 0, asOwner.out.slice(-400));
  // Review M3: the doors through the real walled server, as a person would, on the demo-data copy.
  const http = async (path: string, o: { host?: string; token?: string; body?: unknown } = {}) => {
    const r = await fetch(`${BASE}${path}`, { method: o.body ? "POST" : "GET", headers: { "content-type": "application/json", ...(o.host ? { host: o.host } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };
  // fetch drops a Host header, so a firm's own address is asked with node:http.
  const onHost = (path: string, host: string) => new Promise<{ status: number; body: any }>((res) => { request({ host: "127.0.0.1", port: PORT, path, headers: { host } }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { let b: unknown = null; try { b = JSON.parse(d); } catch { /* not json */ } res({ status: r.statusCode ?? 0, body: b }); }); }).on("error", () => res({ status: -1, body: null })).end(); });
  const seen: Record<string, unknown> = {};
  const asApp1 = await start({ DATABASE_URL: urlOf(DEMO), PLATFORM_IDENTITY: "local" }, async () => {
    seen.site = await onHost("/api/public/site", `pf12-b.localhost:${PORT}`);
    seen.noSite = await onHost("/api/public/site", `pf12-nobody.localhost:${PORT}`);
    const signIn = await http("/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } });
    seen.signIn = signIn.status;
    seen.own = await http(`/api/platform/staff/${aStaff}`, { token: signIn.body?.token });
    seen.other = await http(`/api/platform/staff/${bStaff}`, { token: signIn.body?.token });
    const page = await http("/api/public/firms/sample-solo/book"); seen.page = page.status; seen.pageBody = page.body;
  });
  ok("PF-12 pass: the API starts as xr_app (DATABASE_URL's user changed to xr_app)", /Product Studio on http/.test(asApp1.out) && !/refuses to start/.test(asApp1.out), asApp1.out.slice(-400));
  const site = seen.site as { status: number; body: any }, other = seen.other as { status: number }, mine = seen.own as { status: number };
  ok("PF-12 pass (review B1): a firm's own web address answers its public site through the walls; fail: an unknown address is 404", site?.status === 200 && site.body?.webAddress === "pf12-b" && (seen.noSite as { status: number })?.status === 404, seen);
  ok("PF-12 pass: a staff member signs in through the walled server and reads their own firm's staff member; fail: another firm's by id is 404", seen.signIn === 200 && mine?.status === 200 && other?.status === 404, seen);
  ok("PF-12 pass (review M2): the booking page list (FO-3pa) answers through its named use, with its firm's page", seen.page === 200 && JSON.stringify(seen.pageBody ?? "").includes("Sample"), seen);
} finally {
  for (const c of clients) await c.$disconnect().catch(() => undefined);
  for (const p of pools) await p.end().catch(() => undefined);
  for (const db of [EMPTY, DEMO, BARE]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]); } catch { /* prune-test-dbs.sh */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
