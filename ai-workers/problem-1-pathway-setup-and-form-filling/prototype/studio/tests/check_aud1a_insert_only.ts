// AUD-1a (map row 8, R1.8 part 1; SA-11-1, SA-11-2, SA-11-3, AG-13-41, SA-11 BR-3; P-571 (1)): the one audit trail is the
// audit module's own (prisma/schema/audit.prisma) and insert-only at the database. DW1-DW6, a pass and a fail each.
// Part A, scratch databases: "bare" gets every migration before AUD-1a's, then demo-shaped lines (each actor word on main,
// platform-audit lines with and without a uuid firmId, case lines), then AUD-1a's migration and any later one, measured
// right after its own migration (rows rev 16.7); "empty" gets every migration; "forced" gets those before AUD-1a's and a
// line with an actor word the mapping does not know. Part B, the isolated copy: the real demo reset (POST /demo/reset),
// its orphan sweep, two simultaneous form-role proposals. No browser, no model call (US$0). Scratch databases dropped.
//   zsh studio/tools/isolated.sh runtime_aud1a 4606 start && tsx studio/tests/check_aud1a_insert_only.ts 4606 xr_studio_runtime_aud1a
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Audit } from "../api/src/core.ts";

const PORT = Number(process.argv[2] ?? 4606), COPY = process.argv[3] ?? "xr_studio_runtime_aud1a";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261117124500_aud1a_audit_insert_only";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const BARE = `xr_studio_aud1a_bare_${process.pid}`, EMPTY = `xr_studio_aud1a_empty_${process.pid}`, FORCED = `xr_studio_aud1a_forced_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `aud1a-check-${process.pid}`);
const UUID = "00000000-0000-4000-8000-0000000a1a01", FIRM_REAL = "00000000-0000-4000-8000-0000000a1af1";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (url: string, args: string[]) => execFileSync(join(BIN, "psql"), [url, "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user = "xr_studio") => psql(urlOf(db, user), ["-Atc", q]);
const err = (fn: () => unknown) => { try { fn(); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? (e as Error).message ?? e); } };
/** Refused with the given words (and the statement left nothing behind: the caller counts). */
const refused = (fn: () => unknown, re: RegExp) => re.test(err(fn));
const NEVER = /audit lines are never changed or deleted|permission denied for table audit_event/;
const n = (db: string, q: string) => Number(sql(db, q));
/** One transaction, optionally with the reset setting on; the statement's output lines. */
const tx = (db: string, q: string, reset: boolean, user = "xr_studio") => sql(db, `begin; ${reset ? "select set_config('app.audit_sample_reset', 'on', true);" : ""} ${q}; commit;`, user);
const line = (ws: string, actor: string, extra: Record<string, string> = {}) => {
  const row: Record<string, string> = { id: `'${randomUUID()}'`, workspace_id: `'${ws}'`, actor: `'${actor}'`, action: "'check'", entity: "'aud1a'", summary: "'Sample line'", ...extra };
  return `insert into audit_event (${Object.keys(row).join(", ")}) values (${Object.values(row).join(", ")})`;
};
function auditDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /audit_event|AuditActorType/.test(l));
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
const before = all.filter((d) => d < NEW), after = all.filter((d) => d > NEW);
for (const db of [BARE, EMPTY, FORCED]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
const clients: PrismaClient[] = [];
let restoreIndex = "";   // DW4's dropped index, put back in finally if the step stops midway (review m3)
try {
  // ------------------------------------------------------------------------------------------- DW6: the migration
  const code = readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  ok(`AUD-1a DW6 pass: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)}; P-348 (8))`, all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  const named = [...code.matchAll(/CREATE (?:OR REPLACE )?(?:FUNCTION|TRIGGER) "?(\w+)"?/g)].map((m) => m[1]);
  ok("AUD-1a DW6 pass: every function and trigger it creates is aud_event_* (four functions and four triggers, the workspace guard included)", named.length >= 8 && named.every((f) => f.startsWith("aud_event_")), named);
  ok("AUD-1a DW6 pass: additive only — nothing dropped, no foreign key, no DELETE or UPDATE outside the back-fill", !/\bDROP\b|REFERENCES|FOREIGN KEY/i.test(code) && [...code.matchAll(/^\s*(UPDATE|DELETE)\b[^;]*/gim)].every((m) => /^UPDATE "audit_event"/.test(m[0].trim())));

  for (const d of before) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);
  const W_DEMO = randomUUID(), W_PLAT = randomUUID(), W_OTHER = randomUUID(), CASE = randomUUID();
  sql(BARE, `insert into workspace (id, key, label) values ('${W_DEMO}', 'demo', 'Demo'), ('${W_PLAT}', 'platform-audit', 'Platform audit lines'), ('${W_OTHER}', 'firm', 'Another workspace')`);
  sql(BARE, `set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number) values ('${CASE}', '${W_DEMO}', '${randomUUID()}', 'user-P', 'user-O', 'sample-firm', 'C-2026-00001')`);
  // Each actor word measured on main (the demo copy: user-A, -B, -C, -O, -P, -R; the code: staff:, person:, system,
  // system:, seed:, rules, user-T, -S, -Q).
  const WORDS: [string, string][] = [["user-A", "FIRM_STAFF"], ["user-B", "FIRM_STAFF"], ["user-C", "FIRM_STAFF"], ["user-O", "FIRM_STAFF"], ["user-R", "FIRM_STAFF"], ["user-T", "FIRM_STAFF"], ["user-S", "FIRM_STAFF"],
    [`staff:${UUID}`, "FIRM_STAFF"], ["user-P", "CLIENT"], ["user-Q", "CLIENT"], [`person:${UUID}`, "CLIENT"], ["system", "SYSTEM"], ["system:sign-up", "SYSTEM"], ["rules", "SYSTEM"], ["seed:pf3", "SEED"]];
  for (const [w] of WORDS) sql(BARE, line(W_DEMO, w));
  sql(BARE, line(W_PLAT, `staff:${UUID}`, { detail: `'{"firmId": "${FIRM_REAL.toUpperCase()}"}'` }));
  sql(BARE, line(W_PLAT, "system:check", { detail: `'{"firmId": "not-a-uuid"}'` }));
  sql(BARE, line(W_DEMO, "user-O", { entity: "'case'", entity_key: `'${CASE}'` }));
  sql(BARE, line(W_DEMO, "user-O", { entity: "'case'", entity_key: "'case 1234abcd'" }));
  ok("AUD-1a DW6 fail: before its migration the trail has no actor_type column and no trigger", n(BARE, "select count(*) from information_schema.columns where table_name = 'audit_event' and column_name = 'actor_type'") === 0 && n(BARE, "select count(*) from pg_trigger where tgrelid = 'audit_event'::regclass and not tgisinternal and tgname like 'aud_event_%'") === 0);
  const countBefore = n(BARE, "select count(*) from audit_event");
  psql(urlOf(BARE), ["-f", join(MIG, NEW, "migration.sql")]);
  // Measured right after its own migration (rows rev 16.7), before any later one.
  ok(`AUD-1a DW5 pass: every line has an actor_type, each word as ruled (${WORDS.length} words), and the back-fill removed nothing`,
    n(BARE, "select count(*) from audit_event where actor_type is null") === 0 && n(BARE, "select count(*) from audit_event") === countBefore
    && WORDS.every(([w, t]) => sql(BARE, `select string_agg(distinct actor_type::text, ',') from audit_event where actor = '${w}'`) === t),
    WORDS.map(([w, t]) => [w, t, sql(BARE, `select string_agg(distinct actor_type::text, ',') from audit_event where actor = '${w}'`)]));
  ok("AUD-1a DW5 pass: a platform-audit line with a uuid detail.firmId has firm_id equal to it (lower case); a line with another value keeps firm_id null (1 such line here)",
    sql(BARE, `select firm_id from audit_event where workspace_id = '${W_PLAT}' and detail->>'firmId' = '${FIRM_REAL.toUpperCase()}'`) === FIRM_REAL
    && sql(BARE, `select count(*) from audit_event where workspace_id = '${W_PLAT}' and firm_id is null`) === "1" && n(BARE, `select count(*) from audit_event where workspace_id = '${W_DEMO}' and firm_id is not null`) === 0);
  ok("AUD-1a DW5 pass: a case line whose key is an existing case gets case_id; a line naming the case only in words stays null",
    sql(BARE, `select case_id from audit_event where entity = 'case' and entity_key = '${CASE}'`) === CASE && sql(BARE, `select count(*) from audit_event where entity = 'case' and entity_key = 'case 1234abcd' and case_id is null`) === "1");
  for (const d of after) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);

  // A line written by Audit.log after the migration (the writers pass no actor_type): the trigger fills it.
  const pc = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(BARE, "xr_app"), options: "-c TimeZone=UTC" }) }); clients.push(pc);
  const audit = new Audit(pc as never);
  await audit.log(W_DEMO, "user-O", "check", "aud1a", "after-1", "Sample line by the case officer");
  await audit.log(W_DEMO, "system", "check", "aud1a", "after-2", "Sample line by the system");
  await audit.log(W_DEMO, "rules", "check", "aud1a", "after-3", "Sample line by the rules");
  await audit.log(W_DEMO, `person:${UUID}`, "check", "aud1a", "after-4", "Sample line by a person on their link");
  ok("AUD-1a DW5 pass: Audit.log after the migration (as xr_app, no actor_type passed) gets it from the trigger: user-O FIRM_STAFF, system SYSTEM, rules SYSTEM, person:<id> CLIENT",
    sql(BARE, "select string_agg(entity_key || '=' || actor_type, ',' order by entity_key) from audit_event where entity_key like 'after-%'") === "after-1=FIRM_STAFF,after-2=SYSTEM,after-3=SYSTEM,after-4=CLIENT");
  const lines0 = n(BARE, "select count(*) from audit_event");
  let unknownErr = "";
  try { await audit.log(W_DEMO, "alice", "check", "aud1a", "after-5", "Sample line with an unknown word"); } catch (e) { unknownErr = String((e as Error).message); }
  ok("AUD-1a DW5 fail: after the migration an insert with an actor word the mapping does not know is refused, naming the word, and leaves nothing",
    /actor word 'alice' has no actor type/.test(unknownErr) && n(BARE, "select count(*) from audit_event") === lines0 && refused(() => sql(BARE, line(W_DEMO, "test")), /actor word 'test' has no actor type/), unknownErr.slice(0, 300));

  ok("AUD-1a DW5 fail (breaker): a blank or spaced id after a prefix is no known word ('staff: ', 'staff:', 'person: x')", ["staff: ", "staff:", "person: x", "system:\nx"].every((w) => refused(() => sql(BARE, line(W_DEMO, w.replaceAll("\n", "' || chr(10) || '"))), /has no actor type/)) && n(BARE, "select count(*) from audit_event") === lines0);
  ok("AUD-1a DW5 fail (breaker): a writer that passes an actor_type other than its word's is refused (user-P as SYSTEM); passing the word's own type goes in",
    refused(() => sql(BARE, line(W_DEMO, "user-P", { actor_type: "'SYSTEM'" })), /is CLIENT, not SYSTEM/) && (() => { sql(BARE, line(W_DEMO, "user-P", { actor_type: "'CLIENT'" })); return n(BARE, "select count(*) from audit_event") === lines0 + 1; })());
  // The forced fixture: an actor word the mapping does not know makes the migration fail, naming it; nothing is changed.
  for (const d of before) psql(urlOf(FORCED), ["-f", join(MIG, d, "migration.sql")]);
  sql(FORCED, `insert into workspace (id, key, label) values ('${W_DEMO}', 'demo', 'Demo')`);
  sql(FORCED, line(W_DEMO, "user-A")); sql(FORCED, line(W_DEMO, "staff")); sql(FORCED, line(W_DEMO, "User-A"));
  const forcedErr = err(() => psql(urlOf(FORCED), ["-1", "-f", join(MIG, NEW, "migration.sql")]));
  ok("AUD-1a DW5 fail: an actor word the mapping does not know makes the migration fail, the unknown words listed ('User-A', 'staff'), nothing applied",
    /2 audit actor word\(s\) have no actor type: /.test(forcedErr) && /'User-A'/.test(forcedErr) && /'staff'/.test(forcedErr) && n(FORCED, "select count(*) from information_schema.columns where table_name = 'audit_event' and column_name = 'actor_type'") === 0, forcedErr.slice(0, 300));

  // migrate diff: empty for the trail on the empty and the demo-data copies.
  for (const d of all) psql(urlOf(EMPTY), ["-f", join(MIG, d, "migration.sql")]);
  ok("AUD-1a DW6 pass: migrate diff names nothing of the trail on the empty copy and on the demo-data copy (actor_type NOT NULL with no database default, as dbgenerated() says)", auditDiff(EMPTY).length === 0 && auditDiff(BARE).length === 0, [...auditDiff(EMPTY), ...auditDiff(BARE)]);
  ok("AUD-1a DW6 fail: the schema without the migration differs (diff names the trail's new columns)", auditDiff(FORCED).some((l) => /actor_type|AuditActorType/.test(l)));

  // ------------------------------------------------------------------------------------------- DW1: no UPDATE, no TRUNCATE
  const demoLine = sql(BARE, `select id from audit_event where workspace_id = '${W_DEMO}' limit 1`), platLine = sql(BARE, `select id from audit_event where workspace_id = '${W_PLAT}' and firm_id is not null`);
  const snap = () => sql(BARE, "select md5(string_agg(to_jsonb(e)::text, '|' order by id)) from audit_event e");
  const s0 = snap();
  const updates = [demoLine, platLine].flatMap((id) => [false, true].flatMap((reset) => ["xr_studio", "xr_app"].map((user) => refused(() => tx(BARE, `update audit_event set summary = 'changed' where id = '${id}'`, reset, user), NEVER))));
  ok("AUD-1a DW1 fail: an UPDATE of a demo line and of a platform-audit line is refused, with and without the reset setting, as the owner and as the app's connection (8 tries)", updates.length === 8 && updates.every(Boolean) && snap() === s0, updates);
  ok("AUD-1a DW1 fail: an UPDATE as the app's connection is refused by the grant (SA-11-3: no UPDATE right), the owner's by the trigger in plain words",
    /permission denied for table audit_event/.test(err(() => tx(BARE, `update audit_event set summary = 'x' where id = '${demoLine}'`, false, "xr_app"))) && /audit lines are never changed or deleted \(UPDATE refused\)/.test(err(() => tx(BARE, `update audit_event set summary = 'x' where id = '${demoLine}'`, false))));
  ok("AUD-1a DW1 fail: a TRUNCATE is refused, as the owner (trigger) and as the app (no grant), even with the setting on", refused(() => tx(BARE, "truncate audit_event", true), /TRUNCATE refused/) && refused(() => tx(BARE, "truncate audit_event", true, "xr_app"), /permission denied|TRUNCATE refused/) && snap() === s0);
  ok("AUD-1a DW1 pass: an INSERT still goes through (as the app's connection)", (() => { tx(BARE, line(W_DEMO, "user-A"), false, "xr_app"); return n(BARE, "select count(*) from audit_event") === lines0 + 2; })());

  // ------------------------------------------------------------------------------------------- DW2: DELETE only as the reset
  const rows = () => n(BARE, "select count(*) from audit_event");
  const r0 = rows();
  ok("AUD-1a DW2 fail: a DELETE of a firm's platform-audit line is refused even with the setting on (owner and app)", refused(() => tx(BARE, `delete from audit_event where id = '${platLine}'`, true), NEVER) && refused(() => tx(BARE, `delete from audit_event where id = '${platLine}'`, true, "xr_app"), NEVER) && rows() === r0);
  ok("AUD-1a DW2 fail: a DELETE of every platform-audit line with the setting on is refused, the null-firm line too (all or nothing)", refused(() => tx(BARE, `delete from audit_event where workspace_id = '${W_PLAT}'`, true), NEVER) && rows() === r0);
  ok("AUD-1a DW2 fail: a DELETE of a demo line without the setting is refused (app's connection)", refused(() => tx(BARE, `delete from audit_event where id = '${demoLine}'`, false, "xr_app"), NEVER) && rows() === r0);
  ok("AUD-1a DW2 fail: the setting set in an earlier transaction does not carry over (set_config local): the next DELETE is refused", (() => { tx(BARE, "select 1", true, "xr_app"); return refused(() => tx(BARE, `delete from audit_event where id = '${demoLine}'`, false, "xr_app"), NEVER); })());
  sql(BARE, line(W_OTHER, "user-A"));
  ok("AUD-1a DW2 fail (breaker): with the setting on, a line of another existing workspace (not the demo) is refused", refused(() => tx(BARE, `delete from audit_event where workspace_id = '${W_OTHER}'`, true, "xr_app"), NEVER));
  sql(BARE, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${FIRM_REAL}', 'real-firm', 'Sample real firm', 'CA', 'real@example.com', now()) on conflict do nothing`);
  const realFirmDemo = randomUUID(); sql(BARE, line(W_DEMO, "user-O", { id: `'${realFirmDemo}'`, firm_id: `'${FIRM_REAL}'` }));
  ok("AUD-1a DW2 fail (breaker): with the setting on, a demo-workspace line carrying a firm that is not a Sample firm is refused", refused(() => tx(BARE, `delete from audit_event where id = '${realFirmDemo}'`, true, "xr_app"), NEVER));
  const sampleFirm = sql(BARE, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), 'sample-firm', 'Sample firm', 'CA', 'sample@example.com', now()) on conflict (key) do update set key = excluded.key returning id`);
  const sampleDemo = randomUUID(); sql(BARE, line(W_DEMO, "user-O", { id: `'${sampleDemo}'`, firm_id: `'${sampleFirm}'` }));
  const r1 = rows();
  tx(BARE, `delete from audit_event where id in ('${demoLine}', '${sampleDemo}')`, true, "xr_app");
  ok("AUD-1a DW2 pass: with the setting on in the same transaction, a demo line (firm null) and a demo line of a Sample firm go (app's connection)", rows() === r1 - 2 && n(BARE, `select count(*) from audit_event where id in ('${demoLine}', '${sampleDemo}')`) === 0);
  ok("AUD-1a DW2 fail: the platform-audit firm line is still there after all of it", n(BARE, `select count(*) from audit_event where id = '${platLine}'`) === 1);

  // ------------------------------------------------------------------------------------------- DW7: the workspace rows the rule reads
  // Lead 78's ruling on Devin's finding (comment 6946256175): no role deletes the platform-audit row, changes its id, or
  // moves the key demo or platform-audit onto or off a workspace, so a platform line never looks like a demo or orphan line.
  const wsKeys = () => sql(BARE, "select string_agg(key || '=' || id, ',' order by key) from workspace");
  const k0 = wsKeys(), GUARD = /is never deleted|never takes or gives up the key|keeps its id/;
  const guarded = [
    ["delete the platform-audit row (app)", () => tx(BARE, "delete from workspace where key = 'platform-audit'", true, "xr_app")],
    ["delete the platform-audit row (owner)", () => tx(BARE, "delete from workspace where key = 'platform-audit'", true)],
    ["rename platform-audit (app)", () => tx(BARE, "update workspace set key = 'pa-moved' where key = 'platform-audit'", false, "xr_app")],
    ["rename demo away (app)", () => tx(BARE, "update workspace set key = 'demo-x' where key = 'demo'", false, "xr_app")],
    ["rename demo away (owner)", () => tx(BARE, "update workspace set key = 'demo-x' where key = 'demo'", false)],
    ["rename another workspace to platform-audit (owner)", () => tx(BARE, "update workspace set key = 'platform-audit' where key = 'firm'", false)],
    ["swap demo and platform-audit in one statement (owner)", () => tx(BARE, "update workspace set key = case key when 'demo' then 'platform-audit' else 'demo' end where key in ('demo', 'platform-audit')", false)],
    ["change the platform-audit row's id (owner)", () => tx(BARE, `update workspace set id = '${randomUUID()}' where key = 'platform-audit'`, false)],
    ["delete another firm's workspace row (app; review round 3 M4)", () => tx(BARE, "delete from workspace where key = 'firm'", true, "xr_app")],
    ["change another workspace's id (app; review round 3 M4)", () => tx(BARE, `update workspace set id = '${randomUUID()}' where key = 'firm'`, true, "xr_app")],
  ] as const;
  const notRefused = guarded.filter(([, f]) => !refused(f, GUARD)).map(([n]) => n);
  ok(`AUD-1a DW7 fail: every move of the rows the rule reads is refused, as the app's connection and as the owner (${guarded.length} tries); nothing changed`, notRefused.length === 0 && wsKeys() === k0, notRefused);
  // With the demo row moved away, another workspace renamed to demo would make its null-firm lines deletable: refused too.
  sql(BARE, "insert into workspace (id, key, label) values (gen_random_uuid(), 'aud1a-plain', 'A plain workspace')");
  ok("AUD-1a DW7 fail: the app's connection cannot switch the guard off (no session_replication_role for xr_app, PF-12), so the owner-only test setup is no way round it", refused(() => tx(BARE, "set session_replication_role = replica; update workspace set key = 'demo-x' where key = 'demo'", false, "xr_app"), /permission denied|session_replication_role/) && n(BARE, "select count(*) from workspace where key = 'demo'") === 1);
  ok("AUD-1a DW7 fail: no workspace takes the key demo (renaming a plain workspace to demo is refused, the app's connection)", refused(() => tx(BARE, "update workspace set key = 'demo' where key = 'aud1a-plain'", false, "xr_app"), GUARD));
  tx(BARE, "update workspace set label = 'Renamed label' where key in ('demo', 'platform-audit')", false, "xr_app");
  tx(BARE, "update workspace set key = 'aud1a-plain-2' where key = 'aud1a-plain'", false, "xr_app");
  ok("AUD-1a DW7 fail (review round 3 M4): a plain workspace is never deleted either, even with the setting on (the app's connection)", refused(() => tx(BARE, "delete from workspace where key = 'aud1a-plain-2'", true, "xr_app"), GUARD));
  ok("AUD-1a DW7 pass: a label changes on the guarded rows, and a plain workspace is renamed (the app's connection)",
    n(BARE, "select count(*) from workspace where key in ('demo', 'platform-audit') and label = 'Renamed label'") === 2 && n(BARE, "select count(*) from workspace where key = 'aud1a-plain-2'") === 1);

  // ------------------------------------------------------------------------------------------- Part B: the isolated copy
  const call = async (method: string, path: string, body?: unknown, actor = "user-A") => {
    const r = await fetch(`http://localhost:${PORT}/api${path}`, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const L = await call("POST", "/demo/load", {});
  if (L.status >= 300) { ok("AUD-1a setup: the sample loads on the copy", false, L.body); throw new Error("setup"); }
  const P_WS = sql(COPY, `insert into workspace (id, key, label) values (gen_random_uuid(), 'platform-audit', 'Platform audit lines (firm staff, roles, settings; never reset)') on conflict (key) do update set label = excluded.label returning id`);
  sql(COPY, line(P_WS, `staff:${UUID}`, { firm_id: `'${FIRM_REAL}'` })); sql(COPY, line(P_WS, "system:check"));
  const platBefore = n(COPY, `select count(*) from audit_event where workspace_id = '${P_WS}'`), demoWs = sql(COPY, "select id from workspace where key = 'demo'");
  const demoBefore = n(COPY, `select count(*) from audit_event where workspace_id = '${demoWs}'`);
  // P-571 (1) protects the lines that exist: each is still there after the reset, by id. The reset itself is a bypass use
  // (PF-12b): it adds one platform.bypass line per Sample firm it touches, and nothing else, to the platform-audit lines.
  const platIds = sql(COPY, `select coalesce(string_agg(id::text, ','), '') from audit_event where workspace_id = '${P_WS}'`);
  const sampleFirms = n(COPY, "select count(*) from platform_firm");
  // DW3b's ghost: a line under a workspace id that no longer exists, and one of an existing non-demo workspace.
  const ghost = randomUUID(), other = sql(COPY, `insert into workspace (id, key, label) values (gen_random_uuid(), 'aud1a-other', 'Another workspace') returning id`);
  sql(COPY, line(ghost, "user-A")); sql(COPY, line(other, "user-A"));
  ok("AUD-1a DW3b fail: the ghost line cannot be deleted without the reset setting (as the app)", refused(() => tx(COPY, `delete from audit_event where workspace_id = '${ghost}'`, false, "xr_app"), NEVER) && n(COPY, `select count(*) from audit_event where workspace_id = '${ghost}'`) === 1);
  const R = await call("POST", "/demo/reset", { confirm: "RESET" });
  const newWs = sql(COPY, "select id from workspace where key = 'demo'");
  const platKept = n(COPY, `select count(*) from audit_event where workspace_id = '${P_WS}' and id::text = any(string_to_array('${platIds}', ','))`);
  ok(`AUD-1a DW3 pass: the demo reset empties the demo workspace's lines (${demoBefore} before) and leaves every platform-audit line that was there (${platBefore} before, each still there by id; P-571 (1))`,
    R.status < 300 && demoBefore > 0 && n(COPY, `select count(*) from audit_event where workspace_id = '${demoWs}'`) === 0 && platBefore > 0 && platKept === platBefore, { kept: platKept, before: platBefore, body: R.body });
  const platAdded = sql(COPY, `select coalesce(string_agg(k || '=' || c, ',' order by k), '') from (select action || '/' || coalesce(detail->>'use', '') || '/' || coalesce(detail->>'firmId', '') as k, count(*) as c from audit_event where workspace_id = '${P_WS}' and not (id::text = any(string_to_array('${platIds}', ','))) group by 1) x`);
  const addedLines = platAdded.split(",").filter(Boolean).map((x) => x.split("="));
  ok("AUD-1a DW3 pass (PF-12b): the reset adds only its own platform.bypass lines to the platform-audit lines: two for each Sample firm it touches (its settings reset and its Sample seed, each in that firm's own transaction), nothing else",
    sampleFirms > 0 && addedLines.length === sampleFirms && addedLines.every(([k, c]) => /^platform\.bypass\/platform\.demo\.reset\/[0-9a-f-]{36}$/.test(k) && c === "2"), platAdded);
  ok("AUD-1a DW3 pass: after the reset the new demo workspace has only the reset's own line", n(COPY, `select count(*) from audit_event where workspace_id = '${newWs}'`) === 1 && sql(COPY, `select action || ':' || actor_type from audit_event where workspace_id = '${newWs}'`) === "reset:FIRM_STAFF");
  // Review M1: a firm's platform line (the firm in detail.firmId only, as the adapter writes it until AUD-1b) under a
  // workspace row that is deleted first still cannot be deleted, even with the setting on.
  const gonePlat = randomUUID();
  sql(COPY, line(gonePlat, `staff:${UUID}`, { detail: `'{"firmId": "${FIRM_REAL}"}'` }));
  ok("AUD-1a DW3b fail (review M1): a firm's line whose workspace row is gone (firm only in detail.firmId) is refused even with the setting on", refused(() => tx(COPY, `delete from audit_event where workspace_id = '${gonePlat}'`, true, "xr_app"), NEVER) && n(COPY, `select count(*) from audit_event where workspace_id = '${gonePlat}'`) === 1);
  ok("AUD-1a DW3b pass: the next reset's orphan sweep removes the ghost line; a line of an existing non-demo workspace is never removed",
    n(COPY, `select count(*) from audit_event where workspace_id = '${ghost}'`) === 0 && n(COPY, `select count(*) from audit_event where workspace_id = '${other}'`) === 1);

  // DW2b (Build Lead A, comment 6925011408; Build Lead C, 6925061060): app.audit_sample_reset opens only the demo
  // workspace's lines. On the running copy, as the app's connection, in one transaction with the setting on each time.
  const newDemo = sql(COPY, "select id from workspace where key = 'demo'"), demoOwn = randomUUID(), platReal = randomUUID(), platDetail = randomUUID();
  sql(COPY, line(newDemo, "user-A", { id: `'${demoOwn}'` }));
  sql(COPY, line(P_WS, `staff:${UUID}`, { id: `'${platReal}'`, firm_id: `'${FIRM_REAL}'` }));
  sql(COPY, line(P_WS, "system:check", { id: `'${platDetail}'`, detail: `'{"firmId": "${FIRM_REAL}"}'` }));
  ok("AUD-1a DW2b fail: with the setting on, a platform audit line is refused (a real firm's firm_id; a firm only in detail.firmId), as the app's connection",
    refused(() => tx(COPY, `delete from audit_event where id = '${platReal}'`, true, "xr_app"), NEVER) && refused(() => tx(COPY, `delete from audit_event where id = '${platDetail}'`, true, "xr_app"), NEVER)
    && n(COPY, `select count(*) from audit_event where id in ('${platReal}', '${platDetail}')`) === 2);
  tx(COPY, `delete from audit_event where id = '${demoOwn}'`, true, "xr_app");
  ok("AUD-1a DW2b pass: with the setting on, a demo-workspace line deletes (as the app's connection)", n(COPY, `select count(*) from audit_event where id = '${demoOwn}'`) === 0);

  // DW4: two simultaneous form-role proposals. The race is made certain by a test trigger on the copy: as the later
  // proposal is written, an earlier one (and its line) is put in first, as a second person's at the same moment would be.
  // The database's own guard (library_change_one_open, one open change per form) already refuses the second writer, so
  // the code's withdraw branch runs only without it: the copy drops that index for this step and puts it back after.
  const L2 = await call("POST", "/demo/load", {});
  const ONE_OPEN = sql(COPY, "select indexdef from pg_indexes where indexname = 'library_change_one_open'");
  sql(COPY, "drop index library_change_one_open"); restoreIndex = ONE_OPEN;
  const form = sql(COPY, "select form_key from gov_form_def where form_kind = 'data_form' and form_role is null and retired_at is null order by form_key limit 1");
  sql(COPY, `create function aud1a_check_race() returns trigger language plpgsql as $$ begin
      if NEW.kind = 'form_role' and NEW.key = '${form}' and NEW.proposed_by = 'user-A' then
        insert into library_change (id, workspace_id, kind, key, label, action, reason, matches, status, proposed_by, proposed_at)
          values (gen_random_uuid(), NEW.workspace_id, 'form_role', NEW.key, 'the other proposal', 'SET_ROLE', 'Sample: the other person', '{}', 'WAITING', 'user-C', now() - interval '1 second');
        insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary) values (gen_random_uuid(), NEW.workspace_id, 'user-C', 'proposed', 'form', NEW.key, 'the other proposal');
      end if; return NEW; end $$;
    create trigger aud1a_check_race after insert on library_change for each row execute function aud1a_check_race();`);
  const lines = () => sql(COPY, `select coalesce(string_agg(actor || ':' || action, ',' order by at, actor), '') from audit_event where entity = 'form' and entity_key = '${form}'`);
  const P = await call("POST", `/library/forms/${encodeURIComponent(form)}/role`, { role: "family_information", reason: "Sample: two people at once" });
  sql(COPY, "drop trigger aud1a_check_race on library_change; drop function aud1a_check_race()");
  sql(COPY, `update library_change set status = 'RETURNED' where key = '${form}' and proposed_by = 'user-C'; ${ONE_OPEN}`); restoreIndex = "";
  const after4 = lines();
  ok(`AUD-1a DW4 pass: the later of two simultaneous proposals is refused (409), its change row goes, and its audit line stays with one reversing "withdrawn" line (AG-13-41); ${form}`,
    L2.status < 300 && P.status === 409 && n(COPY, `select count(*) from library_change where key = '${form}' and proposed_by = 'user-A'`) === 0
    && after4.split(",").filter((x) => x === "user-A:proposed").length === 1 && after4.split(",").filter((x) => x === "user-A:withdrawn").length === 1 && after4.includes("user-C:proposed"), { status: P.status, lines: after4 });
  ok("AUD-1a DW4 pass: the reversing line names the withdrawn change and says why in words", (() => { const w = sql(COPY, `select summary || '|' || (detail->>'change' is not null) from audit_event where entity = 'form' and entity_key = '${form}' and action = 'withdrawn'`); return /withdrew .* at once: another change to this form already waits\|true$/.test(w); })());
  ok("AUD-1a DW4 fail: no audit line disappears — deleting the earlier proposal's line (as main's code did) is refused", refused(() => tx(COPY, `delete from audit_event where entity = 'form' and entity_key = '${form}' and action = 'proposed'`, false, "xr_app"), NEVER) && lines() === after4);
} catch (e) {
  if (String((e as Error).message) !== "setup") ok("AUD-1a: the check ran to the end", false, String((e as Error).stack ?? e).slice(0, 600));
} finally {
  if (restoreIndex) { try { sql(COPY, `drop trigger if exists aud1a_check_race on library_change; drop function if exists aud1a_check_race(); update library_change set status = 'RETURNED' where proposed_by = 'user-C' and label = 'the other proposal'; ${restoreIndex}`); } catch { /* the copy is dropped at its stop */ } }
  for (const c of clients) await c.$disconnect();
  for (const db of [BARE, EMPTY, FORCED]) execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
