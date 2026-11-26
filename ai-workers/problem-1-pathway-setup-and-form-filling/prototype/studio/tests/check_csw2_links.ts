// CS-W2 part links (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 2; contract v0.1 §8 steps 2,
// 2a, conditions 1 and 3; P-575, P-588 (4), (5)): the platform firm on person_link, person_link_session and demo_message.
// Each named case has a pass and a fail.
//   1. a scratch database: every migration before 20261126091000_links__csw2_firm_id, two Sample firms, a case of each and
//      one of a key with no platform firm, each with a link (one superseded), a session and a demo message; then the
//      migration and every later one. DW2.1 (backfill), DW2.2 (fill), DW2.3 (the two keys and the supersededBy match),
//      DW2.4 (names, INVOKER, the follow; person_link_try untouched). A second scratch database: a link superseded by
//      another firm's link stops the migration with words (DW2.1 fail).
//   2. the isolated copy this suite runs on: W2, a link sent by staff, a resend (the first is superseded), the code sent and
//      verified (a session) through the API, unchanged; every row carries the case's firm.
// Releases Visitor visa on the copy when missing (tests/runtime/setup_visitor_visa.ts, then acceptance/lib/setup_vv_m3.ts).
// `migrate diff` empty is check_prisma_schema.ts's (M). No model call (US$0).
//   zsh studio/tools/isolated.sh rt_csw2l 4495 start && tsx studio/tests/check_csw2_links.ts 4495 xr_studio_rt_csw2l
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { call, needVisitorVisa, openCase, sql as copySql } from "../acceptance/lib/m3.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261126091000_links__csw2_firm_id";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", HOST = "127.0.0.1:54329", pg = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const h = (n: number) => String(n).padStart(64, "0");
const TABLES = ["person_link", "person_link_session", "demo_message"];
const [W, CMB, F1, F2, F3, PARTY] = [u(1), u(2), u(3), u(4), u(5), u(6)];

function scratch(name: string) {
  const DB = `xr_studio_csw2l_${name}_${process.pid}`, url = `postgresql://xr_studio@${HOST}/${DB}`;
  const psql = (args: string[], user = "xr_studio") => execFileSync(join(BIN, "psql"), [url.replace("xr_studio@", `${user}@`), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q: string, user?: string) => psql(["-Atc", q], user);
  const err = (q: string, user?: string) => { try { sql(q, user); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  const file = (f: string) => psql(["-f", f]);
  execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]);
  execFileSync(join(BIN, "createdb"), [...pg, DB]);
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const d of all.filter((x) => x < NEW)) file(join(MIG, d, "migration.sql"));
  return { sql, err, file, drop: () => execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]), rest: () => { for (const d of all.filter((x) => x > NEW)) file(join(MIG, d, "migration.sql")); } };
}

// Case n (1 sample-firm, 2 sample-solo, 3 a key with no platform firm): a link L (superseded by L'), a session, a message.
// A link with a superseded_by is dead (voided, superseded), as the app leaves it: one open link per person (person_link_one_open).
const link = (id: string, k: string, subj: string, hash: number, extra = "") => `insert into person_link (id, workspace_id, case_id, subject_id, address, address_masked, address_given_by, token_hash, sent_by, expires_at${extra ? ", superseded_by_id, voided_at, void_why" : ""}) values ('${id}', '${W}', '${k}', '${subj}', 'a${hash}@example.com', 'a…@example.com', 'user-O', '${h(hash)}', 'user-O', now() + interval '7 days'${extra ? `, '${extra}', now(), 'superseded'` : ""})`;
const caseRows = (n: number, key: string, firm: string | null) => {
  const [K, S, L, L2] = [u(10 + n), u(50 + n), u(20 + n), u(30 + n)];
  return `
    insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number, firm_id) values ('${K}', '${W}', '${CMB}', 'W2L-${n}', 'user-P', 'user-O', '${key}', 'C-2026-0000${n}', ${firm ? `'${firm}'` : "null"});
    insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${S}', '${W}', '${PARTY}', 'spouse_or_partner', 'Spouse ${n}');
    ${link(L2, K, S, 100 + n)};
    ${link(L, K, S, 200 + n, L2)};
    insert into person_link_session (id, link_id, token_hash, expires_at) values ('${u(40 + n)}', '${L2}', '${h(300 + n)}', now() + interval '8 hours');
    insert into demo_message (id, workspace_id, link_id, address, kind, subject, body, expires_at) values ('${u(60 + n)}', '${W}', '${L2}', 'a@example.com', 'link', 'Sample', 'Sample', now() + interval '7 days');`;
};
const seedBase = `set session_replication_role = replica;
  insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F1}', 'sample-firm', 'Sample Firm', 'CA', 'a@sample-firm.example.com', now()), ('${F2}', 'sample-solo', 'Sample Solo', 'CA', 'a@sample-solo.example.com', now());
  insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${CMB}', '${W}', '${W}', 'vv.single', 'Visitor visa', '[]', 't');
  insert into party (id, workspace_id) values ('${PARTY}', '${W}');`;

// ------------------------------------------------------------------------------------------ 1. the scratch database
const A = scratch("mig");
try {
  A.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + caseRows(3, "ghost-firm", null) + `
    insert into person_link_try (kind, address) values ('code_sent', 'a@example.com');`);
  const procs = () => A.sql(`select string_agg(p.proname, ',' order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`).split(",");
  const before = new Set(procs());
  A.file(join(MIG, NEW, "migration.sql"));
  const added = procs().filter((p) => !before.has(p));
  A.rest();

  // ---------------------------------------------------------------- DW2.1: the backfill
  const firmsOf = (t: string) => A.sql(`select count(*) filter (where firm_id = '${F1}') || '/' || count(*) filter (where firm_id = '${F2}') || '/' || count(*) filter (where firm_id is null) from ${t}`);
  const all = TABLES.map((t) => `${t}=${firmsOf(t)}`);
  ok("CS-W2 DW2.1 pass: after the migration every link (both of each case), session and demo message carries its case's firm",
    all[0] === "person_link=2/2/2" && all[1] === "person_link_session=1/1/1" && all[2] === "demo_message=1/1/1", all);
  ok("CS-W2 DW2.1 pass: each link's firm equals its case's, each session's and message's its link's",
    A.sql(`select (select count(*) from person_link l join runtime_case k on k.id = l.case_id where l.firm_id is distinct from k.firm_id)
      + (select count(*) from person_link_session s join person_link l on l.id = s.link_id where s.firm_id is distinct from l.firm_id)
      + (select count(*) from demo_message m join person_link l on l.id = m.link_id where m.firm_id is distinct from l.firm_id)`) === "0");
  ok("CS-W2 DW2.1 fail: a case whose key has no platform firm leaves its links empty, never another firm's", all.every((x) => /\/[12]$/.test(x)));
  ok("CS-W2 DW2.4 pass: person_link_try is untouched, a named exception (no firm column, its row kept)",
    A.sql(`select count(*) from information_schema.columns where table_name = 'person_link_try' and column_name = 'firm_id'`) === "0" && A.sql(`select count(*) from person_link_try`) === "1");

  // ---------------------------------------------------------------- DW2.2: the fill on insert
  const [K1, K2, S1, S2, L1, L2] = [u(11), u(12), u(51), u(52), u(31), u(32)];
  A.sql(`insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${u(56)}', '${W}', '${PARTY}', 'child', 'Adult child 1'), ('${u(57)}', '${W}', '${PARTY}', 'child', 'Adult child 2')`);
  const newLink = A.sql(`${link(u(70), K1, u(56), 400)} returning firm_id`);
  const newSession = A.sql(`insert into person_link_session (id, link_id, token_hash, expires_at) values ('${u(71)}', '${L1}', '${h(401)}', now() + interval '1 hour') returning firm_id`);
  const newMsg = A.sql(`insert into demo_message (id, workspace_id, link_id, address, kind, subject, body, expires_at) values ('${u(72)}', '${W}', '${L1}', 'a@example.com', 'code', 'S', 'B', now() + interval '1 hour') returning firm_id`);
  ok("CS-W2 DW2.2 pass: an insert with no firm gets its parent's firm (a link its case's; a session and a message their link's)",
    [newLink, newSession, newMsg].every((x) => x === F1), [newLink, newSession, newMsg]);
  const named = [
    A.err(`begin; insert into person_link (id, workspace_id, case_id, subject_id, address, address_masked, address_given_by, token_hash, sent_by, expires_at, firm_id) values ('${u(73)}', '${W}', '${K1}', '${u(57)}', 'b@example.com', 'b…', 'x', '${h(402)}', 'x', now(), '${F2}'); rollback;`),
    A.err(`begin; insert into person_link_session (id, link_id, token_hash, expires_at, firm_id) values ('${u(74)}', '${L1}', '${h(403)}', now(), '${F2}'); rollback;`),
    A.err(`begin; insert into demo_message (id, workspace_id, link_id, address, kind, subject, body, expires_at, firm_id) values ('${u(75)}', '${W}', '${L1}', 'a', 'code', 'S', 'B', now(), '${F2}'); rollback;`),
  ];
  ok("CS-W2 DW2.2 fail: an insert naming the other Sample firm is refused, in each of the three tables", named.every((e) => /case_firm_fill: a \w+ row's firm must be its \w+ row's firm/.test(e)), named.map((e) => e.slice(0, 120)));
  const asB = A.err(`begin; set local app.firm_id = '${F2}'; insert into person_link_session (id, link_id, token_hash, expires_at) values ('${u(76)}', '${L1}', '${h(404)}', now()); rollback;`);
  ok("CS-W2 DW2.2 fail: with app.firm_id set to firm B, a session under a firm A link is refused", /case_firm_fill/.test(asB), asB.slice(0, 160));
  ok("CS-W2 DW2.2 pass: with app.firm_id set to the link's firm the insert goes through with that firm",
    A.sql(`begin; set local app.firm_id = '${F1}'; insert into demo_message (id, workspace_id, link_id, address, kind, subject, body, expires_at) values ('${u(77)}', '${W}', '${L1}', 'a', 'code', 'S', 'B', now()) returning firm_id; rollback;`).includes(F1));

  // ---------------------------------------------------------------- DW2.3: the keys and the match, the fill set aside
  const keyCase = (t: string, fk: string, q: string) => {
    const e = A.err(`begin; alter table ${t} disable trigger case_links_firm_fill; ${q}; rollback;`);
    return [fk, new RegExp(`violates foreign key constraint "${fk}"`).test(e) ? "refused" : e.slice(0, 160)] as const;
  };
  const keys = [
    keyCase("person_link_session", "person_link_session_link_id_firm_id_fkey", `insert into person_link_session (id, link_id, token_hash, expires_at, firm_id) values ('${u(80)}', '${L2}', '${h(500)}', now(), '${F1}')`),
    keyCase("demo_message", "demo_message_link_id_firm_id_fkey", `insert into demo_message (id, workspace_id, link_id, address, kind, subject, body, expires_at, firm_id) values ('${u(81)}', '${W}', '${L2}', 'a', 'code', 'S', 'B', now(), '${F1}')`),
  ];
  ok("CS-W2 DW2.3 fail: through each composite key, a firm A session or message cannot name a firm B link (fill set aside)", keys.every(([, r]) => r === "refused"), keys);
  const moveSession = A.err(`update person_link_session set link_id = '${L2}' where id = '${u(41)}'`);
  ok("CS-W2 DW2.3 fail: moving a firm A session onto a firm B link is refused by its key (an update)", /person_link_session_link_id_firm_id_fkey/.test(moveSession), moveSession.slice(0, 200));
  ok("CS-W2 DW2.3 pass: a session moved onto another link of its own firm is allowed", A.err(`begin; update person_link_session set link_id = '${u(70)}' where id = '${u(41)}'; rollback;`) === "");
  const sup = [
    A.err(`update person_link set superseded_by_id = '${L2}' where id = '${u(70)}'`),
    A.err(`begin; ${link(u(82), K1, S1, 501, L2)}; rollback;`),
  ];
  ok("CS-W2 DW2.3 fail (supersededBy, held by a trigger, not a key): a link cannot be superseded by another firm's (another case's) link, on update or insert",
    sup.every((e) => /case_links_firm_match: a link can only be superseded by a link of its own case/.test(e)), sup.map((e) => e.slice(0, 120)));
  // Breaker M-1: while one side's firm is empty (the ghost case), a pair across cases is refused too, so the follow can
  // never store a cross-firm pair; and a link cannot move to another case while another link names it.
  const ghost = [
    A.err(`update person_link set superseded_by_id = '${u(33)}' where id = '${u(70)}'`),
    A.err(`update person_link set superseded_by_id = '${L1}' where id = '${u(33)}'`),
    A.err(`update person_link set case_id = '${K2}' where id = '${L1}'`),
  ];
  ok("CS-W2 DW2.3 fail (breaker M-1): a firm A link superseded by a firm-less case's link (and back) is refused, and a superseding link cannot move to another case",
    ghost.every((e) => /case_links_firm_match: a link can only be superseded by a link of its own case/.test(e)), ghost.map((e) => e.slice(0, 100)));
  ok("CS-W2 DW2.3 pass: a link superseded by a link of its own firm is allowed, and the SetNull on delete still works",
    A.err(`begin; update person_link set superseded_by_id = '${L1}' where id = '${u(70)}'; delete from person_link_session where link_id = '${L1}'; delete from demo_message where link_id = '${L1}'; delete from person_link where id = '${L1}'; select 1 / (count(*) filter (where superseded_by_id is null))::int from person_link where id in ('${u(21)}', '${u(70)}'); rollback;`) === "");
  // Breaker M1 on part filings: emptying firm_id would skip the keys (MATCH SIMPLE); the keep refuses it and any change.
  const kept = [
    A.err(`update person_link_session set firm_id = null, link_id = '${L2}' where id = '${u(41)}'`),
    A.err(`update demo_message set firm_id = null, link_id = '${L2}' where id = '${u(61)}'`),
    A.err(`update person_link set firm_id = null where id = '${L1}'`),
    A.err(`update person_link set firm_id = '${F2}' where id = '${L1}'`),
  ];
  ok("CS-W2 DW2.3 fail: a firm once set cannot be emptied (which would skip the keys and let a session move under firm B) nor changed, as owner and as xr_app",
    kept.every((e) => /case_links_firm_keep: a \w+ row keeps its firm/.test(e)) && /case_links_firm_keep/.test(A.err(`update person_link_session set firm_id = null, link_id = '${L2}' where id = '${u(41)}'`, "xr_app")), kept.map((e) => e.slice(0, 100)));

  // ---------------------------------------------------------------- DW2.4: names, rights, the follow
  ok("CS-W2 DW2.4 pass: the migration adds exactly four functions, all case_links_*", added.sort().join(",") === "case_links_firm_backfill,case_links_firm_follow,case_links_firm_keep,case_links_firm_match", added);
  const defs = A.sql(`select string_agg(proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ';'), ''), ' | ' order by proname) from pg_proc where proname like 'case_links_%'`);
  ok("CS-W2 DW2.4 fail: none is SECURITY DEFINER, each pins its search_path with pg_temp last", !defs.includes(":true:") && defs.split(" | ").every((d) => /search_path=pg_catalog, public, pg_temp$/.test(d)), defs);
  ok("CS-W2 DW2.4 fail: the backfill is not callable by PUBLIC", A.sql(`select has_function_privilege('public', 'case_links_firm_backfill()', 'EXECUTE')`) === "f");
  A.sql(`set session_replication_role = replica; insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F3}', 'ghost-firm', 'Ghost', 'CA', 'a@ghost.example.com', now())`);
  A.sql(`select case_firm_backfill()`);
  const after = TABLES.map((t) => `${t}=${A.sql(`select count(*) filter (where firm_id = '${F3}') || '/' || count(*) filter (where firm_id is null) from ${t}`)}`);
  ok("CS-W2 DW2.4 pass (the follow): when the ghost key's case gets its firm, its links, session and message follow", after.join(",") === "person_link=2/0,person_link_session=1/0,demo_message=1/0", after);
  ok("CS-W2 DW2.4 pass: a second backfill run changes nothing", A.sql(`select case_links_firm_backfill()`) === "0");
} finally { A.drop(); }

const B = scratch("bad");
try {
  B.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + `
    update person_link set superseded_by_id = '${u(32)}' where id = '${u(21)}';`);
  let stop = "";
  try { B.file(join(MIG, NEW, "migration.sql")); } catch (e) { stop = String((e as { stderr?: string }).stderr ?? e); }
  ok("CS-W2 DW2.1 fail: a sample-firm link superseded by a sample-solo link stops the migration, naming the link", /CS-W2 links stopped: .*person_link 00000000-0000-4000-8000-000000000021 \(superseded by a link of another case\)/.test(stop), stop.slice(0, 300));
} finally { B.drop(); }

// A session whose link is missing (a forced restore) stops the migration with words (brief DW2.1).
const C = scratch("orphan");
try {
  C.sql(seedBase + caseRows(1, "sample-firm", F1) + `
    insert into person_link_session (id, link_id, token_hash, expires_at) values ('${u(48)}', '${u(99)}', '${h(900)}', now());`);
  let stop = "";
  try { C.file(join(MIG, NEW, "migration.sql")); } catch (e) { stop = String((e as { stderr?: string }).stderr ?? e); }
  ok("CS-W2 DW2.1 fail: a session whose link is missing stops the migration, naming the row", /CS-W2 links stopped: .*person_link_session 00000000-0000-4000-8000-000000000048 \(no such link\)/.test(stop), stop.slice(0, 300));
} finally { C.drop(); }

// ------------------------------------------------------------------------------------------ 2. W2 on the copy (API)
if (!copySql(`select 1 from combination c join config_release r on r.combination_id = c.id where c.combination_key = 'vv.single' limit 1`)) {
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), ts = ["--tsconfig", join(STUDIO, "api", "tsconfig.json")], args = [process.argv[2] ?? "4440", process.argv[3] ?? "xr_studio_accept"];
  // Their own checks may report a known failure (exit 1); the release they make is what this suite needs, checked below.
  for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"]) spawnSync(tsx, [...ts, join(STUDIO, f), ...args], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 });
}
const vv = needVisitorVisa();
const c = await openCase(vv);
const spouse = c.subjects["Sample Spouse A"];
const mail = `csw2l-${Date.now().toString(36)}@example.com`;
const s1 = await call("POST", `/runtime/cases/${c.id}/people/${spouse}/link`, { address: mail }, c.officer);
const s2 = await call("POST", `/runtime/cases/${c.id}/people/${spouse}/link`, { address: mail }, c.officer);
const tokenOf = () => /\/link#t=([A-Za-z0-9_-]{43})/.exec(copySql(`select body from demo_message m join person_link l on l.id = m.link_id where l.case_id = '${c.id}' and m.kind = 'link' and l.voided_at is null order by m.created_at desc limit 1`) ?? "")?.[1] ?? "";
const token = tokenOf();
// Demo messages go when used (a code) or when their link dies or is accepted (C6.16), so they are read right after the sends.
const msgs = copySql(`select count(*) || ':' || count(*) filter (where m.firm_id is distinct from k.firm_id) from demo_message m join person_link l on l.id = m.link_id join runtime_case k on k.id = l.case_id where l.case_id = '${c.id}'`);
const opened = await call("POST", "/link/open", { token }, null);
const sent = await call("POST", "/link/code/send", { token }, null);
const code = /\b(\d{3} ?\d{3})\b/.exec(copySql(`select body from demo_message m join person_link l on l.id = m.link_id where l.case_id = '${c.id}' and m.kind = 'code' order by m.created_at desc limit 1`) ?? "")?.[1] ?? "";
const verified = await call("POST", "/link/code", { token, code }, null);
const firm = copySql(`select firm_id from runtime_case where id = '${c.id}'`);
const counts = copySql(`select (select count(*) || ':' || count(*) filter (where firm_id is distinct from '${firm}') from person_link where case_id = '${c.id}')
  || ',' || (select count(*) || ':' || count(*) filter (where s.firm_id is distinct from '${firm}') from person_link_session s join person_link l on l.id = s.link_id where l.case_id = '${c.id}')
  || ',' || '${msgs}'`);
ok("CS-W2 W2 pass: a link sent and resent by staff, opened, its code sent and verified through the API (unchanged): every link, session and demo message carries the case's firm",
  s1.status < 300 && s2.status < 300 && opened.status === 200 && sent.status === 200 && verified.status === 200 && !!firm && /^[2-9]\d*:0,[1-9]\d*:0,[1-9]\d*:0$/.test(counts ?? ""),
  [s1.status, s2.status, opened.status, sent.status, verified.status, verified.body?.detail, counts]);
ok("CS-W2 W2 fail: no link row on the copy is of a firm other than its case's", copySql(`select count(*) from person_link l join runtime_case k on k.id = l.case_id where l.firm_id is distinct from k.firm_id and k.firm_id is not null`) === "0");
process.exit(summary() ? 1 : 0);
