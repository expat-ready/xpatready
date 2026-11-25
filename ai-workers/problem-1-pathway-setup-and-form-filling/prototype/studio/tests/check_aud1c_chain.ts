// AUD-1c part 1 (map row 97, R1.97; SA-11-4, AG-13-42, NFR5-08; P-570 (1), P-571 (1)): a hash chain on the one audit
// trail. DW1-DW5, a pass and a fail each. Part A, scratch databases: "bare" gets every migration before AUD-1c's, then
// lines on every kind of chain (demo, a gone workspace, firms, platform), then AUD-1c's migration and any later one,
// measured right after its own (rows rev 16.7); "empty" gets every migration; "before" only those before AUD-1c's.
// Part B, the isolated copy: the real demo reset (POST /demo/reset). No browser, no model call (US$0). Scratch
// databases dropped at the end.
//   zsh studio/tools/isolated.sh runtime_aud1c 4607 start && tsx studio/tests/check_aud1c_chain.ts 4607 xr_studio_runtime_aud1c
import pg from "pg";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonical, entryHash, VECTOR, ZERO_HASH, type CanonicalLine } from "../api/src/platform/audit/canonical.ts";

const PORT = Number(process.argv[2] ?? 4607), COPY = process.argv[3] ?? "xr_studio_runtime_aud1c";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261125113000_aud1c_audit_chain";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const BARE = `xr_studio_aud1c_bare_${process.pid}`, EMPTY = `xr_studio_aud1c_empty_${process.pid}`, BEFORE = `xr_studio_aud1c_before_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `aud1c-check-${process.pid}`);
const F1 = "00000000-0000-4000-8000-0000000a1cf1", F2 = "00000000-0000-4000-8000-0000000a1cf2", F3 = "00000000-0000-4000-8000-0000000a1cf3";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 500)}` : ""}`); };
const psql = (url: string, args: string[]) => execFileSync(join(BIN, "psql"), [url, "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user = "xr_studio") => psql(urlOf(db, user), ["-Atc", q]);
const n = (db: string, q: string) => Number(sql(db, q));
const err = (fn: () => unknown) => { try { fn(); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? (e as Error).message ?? e); } };
const NEVER = /audit lines are never changed or deleted|permission denied for table audit_event/;
const line = (ws: string, actor: string, extra: Record<string, string> = {}) => {
  const row: Record<string, string> = { id: `'${randomUUID()}'`, workspace_id: `'${ws}'`, actor: `'${actor}'`, action: "'check'", entity: "'aud1c'", summary: "'Sample line'", ...extra };
  return `insert into audit_event (${Object.keys(row).join(", ")}) values (${Object.values(row).join(", ")})`;
};

/** A chain's lines as text, in seq order, exactly as part 2's checker will read them (never through a JS Date). */
const LINE_SQL = `select chain_key, seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, workspace_id::text ws,
  firm_id::text firm, case_id::text cas, combination_id::text combo, actor, actor_type::text atype, action, entity, entity_key, summary, correlation_id,
  support_session_id::text sup, detail::text detail, prev_hash, entry_hash from audit_event`;
type Row = { chain_key: string; seq: string; id: string; at: string; ws: string; firm: string | null; cas: string | null; combo: string | null; actor: string; atype: string; action: string; entity: string;
  entity_key: string | null; summary: string; correlation_id: string | null; sup: string | null; detail: string | null; prev_hash: Buffer; entry_hash: Buffer };
const asLine = (r: Row): CanonicalLine => ({ chainKey: r.chain_key, seq: r.seq, id: r.id, at: r.at, workspaceId: r.ws, firmId: r.firm, caseId: r.cas, combinationId: r.combo, actor: r.actor,
  actorType: r.atype, action: r.action, entity: r.entity, entityKey: r.entity_key, summary: r.summary, correlationId: r.correlation_id, supportSessionId: r.sup, detail: r.detail });
const clients: pg.Client[] = [];
/** One client runs one query at a time (pg): map in order. */
const inOrder = async <T, R>(xs: T[], f: (x: T) => Promise<R>) => { const out: R[] = []; for (const x of xs) out.push(await f(x)); return out; };
async function client(db: string, user = "xr_studio") { const c = new pg.Client({ connectionString: urlOf(db, user) }); await c.connect(); clients.push(c); return c; }
/** Recompute a chain with canonical.ts: seq 1..n with no gap, each prev_hash the previous entry_hash, each entry_hash its own. */
async function verify(c: pg.Client, key: string) {
  const rows = (await c.query<Row>(`${LINE_SQL} where chain_key = $1 order by audit_event.seq`, [key])).rows;
  let prev: Buffer = ZERO_HASH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.seq !== String(i + 1)) return { n: rows.length, ok: false, at: i + 1, why: `seq ${r.seq} where ${i + 1} was due` };
    if (!r.prev_hash.equals(prev)) return { n: rows.length, ok: false, at: i + 1, why: "prev_hash is not the previous entry_hash" };
    if (!entryHash(prev, asLine(r)).equals(r.entry_hash)) return { n: rows.length, ok: false, at: i + 1, why: "entry_hash does not match the line" };
    prev = r.entry_hash;
  }
  return { n: rows.length, ok: true, at: 0, why: "" };
}
const chains = async (c: pg.Client) => (await c.query<{ k: string }>("select distinct chain_key k from audit_event order by 1")).rows.map((r) => r.k);
/** Every line of every chain but the sample ones: (chain, seq, entry hash), to compare before and after a reset. */
const nonSample = async (c: pg.Client) => new Map((await c.query<{ k: string; s: string; h: string }>("select chain_key k, seq::text s, encode(entry_hash, 'hex') h from audit_event where chain_key not like 'sample:%'")).rows.map((r) => [`${r.k}#${r.s}`, r.h]));
function auditDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script", "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /audit_event|aud_chain|AuditChainStatus|chain_key|entry_hash|prev_hash|"seq"/.test(l));
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
const before = all.filter((d) => d < NEW), after = all.filter((d) => d > NEW);
for (const db of [BARE, EMPTY, BEFORE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
try {
  // ------------------------------------------------------------------------------------------- DW5: the migration
  const code = readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  ok(`AUD-1c DW5 pass: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)}; P-348 (8))`, all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  const named = [...code.matchAll(/CREATE (?:OR REPLACE )?(?:FUNCTION|TRIGGER) "?(\w+)"?/g)].map((m) => m[1]);
  ok("AUD-1c DW5 pass: every function and trigger it creates is aud_event_* or aud_chain_*; no extension (sha256 is built in), nothing dropped, no foreign key",
    named.length >= 7 && named.every((f) => /^aud_(event|chain)_/.test(f)) && !/CREATE EXTENSION|pgcrypto|\bDROP\b|REFERENCES|FOREIGN KEY/i.test(code), named);
  const off = code.indexOf('DISABLE TRIGGER "aud_event_no_change"'), on = code.indexOf('ENABLE TRIGGER "aud_event_no_change"');
  ok("AUD-1c DW3 pass: the migration switches aud_event_no_change off for its back-fill only, and on again right after it", off > 0 && on > off && (code.slice(off, on).match(/^\s*UPDATE /gm) ?? []).length === 2 && !/DISABLE TRIGGER/.test(code.slice(on)));

  for (const d of before) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);
  const W_DEMO = randomUUID(), W_PLAT = randomUUID(), W_FIRM = randomUUID(), W_CONF = randomUUID(), W_GONE = randomUUID();
  sql(BARE, `insert into workspace (id, key, label) values ('${W_DEMO}', 'demo', 'Demo'), ('${W_PLAT}', 'platform-audit', 'Platform audit lines'), ('${W_FIRM}', 'aud1c-firm', 'A firm workspace'), ('${W_CONF}', 'aud1c-conf', 'A configuration workspace')`);
  // Lines before the migration: demo (one carrying a Sample firm id), a gone workspace, two firms through the
  // platform-audit workspace (firm in detail, as the adapter writes it) and a firm workspace, configuration lines
  // (no firm: platform). Some at the same instant (ordered by id then), some with microseconds.
  const pre: string[] = [];
  for (let i = 0; i < 6; i++) pre.push(line(W_DEMO, "user-A", { at: `'2026-11-10 10:00:0${i}.12345${i}+00'`, detail: `'{"n": ${i}.0, "zz": [1e2]}'` }));
  const SAMPLE_FIRM = sql(BARE, `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), 'sample-firm', 'Sample firm', 'CA', 'sample@example.com', now()) on conflict (key) do update set key = excluded.key returning id`);
  pre.push(line(W_DEMO, "user-O", { firm_id: `'${SAMPLE_FIRM}'`, at: "'2026-11-10 10:00:03+00'" }));
  pre.push(line(W_GONE, "user-A", { at: "'2026-11-10 09:00:00+00'" }));
  pre.push(line(W_GONE, "staff:aud1c", { firm_id: `'${F1}'`, at: "'2026-11-09 06:00:00+00'" }));   // review m2: a real firm's line under a gone workspace stays on its firm's chain
  // Platform-audit lines: two with the firm column (as AUD-1b will write them), two with the firm in detail only (as the
  // adapter writes them on main: AUD-1a's back-fill filled firm_id once, so these stay on the platform chain until AUD-1b).
  for (let i = 0; i < 4; i++) pre.push(line(W_PLAT, "system:check", { at: "'2026-11-11 08:00:00+00'", detail: `'{"firmId": "${i % 2 ? F1 : F2}", "i": ${i}}'`, ...(i < 2 ? { firm_id: `'${i % 2 ? F1 : F2}'` } : {}) }));
  for (let i = 0; i < 3; i++) pre.push(line(W_FIRM, "staff:aud1c", { firm_id: `'${F1}'`, at: `'2026-11-09 07:00:0${i}+00'` }));
  for (let i = 0; i < 3; i++) pre.push(line(W_CONF, "user-B", { at: `'2026-11-12 12:00:0${i}+00'`, summary: `'Sample: Éé 申请 ${i}'` }));
  for (const q of pre) sql(BARE, q);
  ok("AUD-1c DW3 fail: before its migration the trail has no seq or hash column and no chain trigger",
    n(BARE, "select count(*) from information_schema.columns where table_name = 'audit_event' and column_name in ('seq', 'prev_hash', 'entry_hash', 'chain_key')") === 0 && n(BARE, "select count(*) from pg_trigger where tgname = 'aud_event_zchain'") === 0);
  const countBefore = n(BARE, "select count(*) from audit_event");
  psql(urlOf(BARE), ["-f", join(MIG, NEW, "migration.sql")]);
  // Measured right after its own migration (rows rev 16.7), before any later one.
  const bare = await client(BARE);
  const keys0 = await chains(bare), checks0 = await inOrder(keys0, (async (k) => [k, await verify(bare, k)] as const));
  ok(`AUD-1c DW3 pass: after the migration every existing line (${countBefore}) is chained and every chain verifies with canonical.ts (${keys0.length} chains)`,
    n(BARE, "select count(*) from audit_event where seq is null or entry_hash is null") === 0 && n(BARE, "select count(*) from audit_event") === countBefore && checks0.every(([, v]) => v.ok), checks0);
  ok("AUD-1c DW3 pass: the chains follow the rule — demo lines (a Sample firm's too) and a gone workspace's null-firm line on sample:<workspace>, a real firm's line under a gone workspace on its firm, firm lines on their firm, the rest (a firm only in detail too) on platform",
    JSON.stringify(keys0) === JSON.stringify([F1, F2, "platform", `sample:${W_DEMO}`, `sample:${W_GONE}`].sort())
    && n(BARE, `select count(*) from audit_event where chain_key = 'sample:${W_DEMO}'`) === 7 && n(BARE, `select count(*) from audit_event where chain_key = '${F1}'`) === 5 && n(BARE, "select count(*) from audit_event where chain_key = 'platform'") === 5, keys0);
  ok("AUD-1c DW3 pass: the back-fill went oldest first (at, then id) in each chain",
    n(BARE, `select count(*) from (select seq, row_number() over (partition by chain_key order by at, id) rn from audit_event) x where seq <> rn`) === 0);
  ok("AUD-1c DW3 pass: aud_event_no_change is enabled again after the migration; an UPDATE is still refused (owner and app)",
    sql(BARE, "select tgenabled from pg_trigger where tgname = 'aud_event_no_change'") === "O" && NEVER.test(err(() => sql(BARE, "update audit_event set summary = 'x' where actor = 'user-A'"))) && NEVER.test(err(() => sql(BARE, "update audit_event set seq = seq where actor = 'user-A'", "xr_app"))));
  ok("AUD-1c DW3 pass: aud_event_zchain fires after aud_event_fill (BEFORE INSERT triggers fire in name order)",
    sql(BARE, "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'audit_event'::regclass and not tgisinternal and tgtype & 2 = 2 and tgtype & 4 = 4") === "aud_event_fill,aud_event_zchain");
  for (const d of after) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);

  // A line with no actor_type (filled by aud_event_fill) and one with microseconds in at, as the app.
  const noType = randomUUID(), micro = randomUUID();
  sql(BARE, line(W_FIRM, "staff:aud1c", { id: `'${noType}'`, firm_id: `'${F1}'` }), "xr_app");
  sql(BARE, line(W_FIRM, "system:check", { id: `'${micro}'`, firm_id: `'${F1}'`, at: "'2026-11-18 10:00:00.123456+00'" }), "xr_app");
  const v1 = await verify(bare, F1);
  ok("AUD-1c DW3 pass: a line written with no actor_type and one with microseconds in at both verify (the hash covers the filled type and the full microseconds)",
    v1.ok && v1.n === 7 && sql(BARE, `select actor_type from audit_event where id = '${noType}'`) === "FIRM_STAFF" && sql(BARE, `select to_char(at at time zone 'UTC', 'US') from audit_event where id = '${micro}'`) === "123456", v1);
  const rowNoType = (await bare.query<Row>(`${LINE_SQL} where id = $1`, [noType])).rows[0];
  ok("AUD-1c DW3 fail: the same line hashed with no actor_type (as a hash taken before aud_event_fill would be) does not match",
    !entryHash(rowNoType.prev_hash, { ...asLine(rowNoType), actorType: null as unknown as string }).equals(rowNoType.entry_hash) && entryHash(rowNoType.prev_hash, asLine(rowNoType)).equals(rowNoType.entry_hash));
  ok("AUD-1c DW3 fail (breaker minor 4): a line at infinity or before year 1 is refused (the canonical at has no era)",
    ["'infinity'", "'-infinity'", "'2026-01-01 00:00:00+00 BC'"].every((at) => /aud_event_at_finite/.test(err(() => sql(BARE, line(W_FIRM, "system:check", { at }), "xr_app")))));
  const rowMicro = (await bare.query<Row>(`${LINE_SQL} where id = $1`, [micro])).rows[0];
  ok("AUD-1c DW3 fail: the microsecond line hashed with at cut to milliseconds (a JS Date) does not match", !entryHash(rowMicro.prev_hash, { ...asLine(rowMicro), at: "2026-11-18T10:00:00.123Z" }).equals(rowMicro.entry_hash) && entryHash(rowMicro.prev_hash, asLine(rowMicro)).equals(rowMicro.entry_hash));

  // ------------------------------------------------------------------------------------------- DW2: one canonical form
  // A scratch-session helper: the line's row from its fields, detail set as jsonb (so JSON null stays JSON null).
  await bare.query(`create function pg_temp.aud1c_canon(j jsonb, d jsonb, has_detail boolean) returns text language plpgsql as $f$
    declare r audit_event := jsonb_populate_record(null::audit_event, j); begin if has_detail then r.detail := d; end if; return aud_event_canonical(r); end $f$`);
  const sqlCanon = async (l: CanonicalLine) => {
    const fields = `{"chain_key": ${JSON.stringify(l.chainKey)}, "seq": ${l.seq}, "id": ${JSON.stringify(l.id)}, "at": ${JSON.stringify(l.at)}, "workspace_id": ${JSON.stringify(l.workspaceId)}, "firm_id": ${JSON.stringify(l.firmId)},
      "case_id": ${JSON.stringify(l.caseId)}, "combination_id": ${JSON.stringify(l.combinationId)}, "actor": ${JSON.stringify(l.actor)}, "actor_type": ${JSON.stringify(l.actorType)}, "action": ${JSON.stringify(l.action)},
      "entity": ${JSON.stringify(l.entity)}, "entity_key": ${JSON.stringify(l.entityKey)}, "summary": ${JSON.stringify(l.summary)}, "correlation_id": ${JSON.stringify(l.correlationId)},
      "support_session_id": ${JSON.stringify(l.supportSessionId)}}`;
    const r = (await bare.query<{ c: string; h: Buffer }>(`select c, sha256('\\x${ZERO_HASH.toString("hex")}'::bytea || convert_to(c, 'UTF8')) h from (select pg_temp.aud1c_canon($1::jsonb, $2::jsonb, $3) c) x`, [fields, l.detail, l.detail !== null])).rows[0];
    return r;
  };
  const vec = await inOrder(VECTOR, (async (v) => { const s = await sqlCanon(v.line); return { name: v.name, same: s.c === canonical(v.line), hash: s.h.equals(entryHash(ZERO_HASH, v.line)), sql: s.c, ts: canonical(v.line) }; }));
  ok(`AUD-1c DW2 pass: the TypeScript and SQL canonical forms agree, text and hash, on the shared vector (${VECTOR.length} lines: keys of different lengths, nested objects, 1.0, 1e2, a non-Latin string, nulls)`,
    vec.every((v) => v.same && v.hash), vec.filter((v) => !v.same || !v.hash));
  const oneByte = { ...VECTOR[1].line, detail: VECTOR[1].line.detail!.replace('"zz": 1', '"zz": 2') };
  const s1 = await sqlCanon(VECTOR[1].line), s2 = await sqlCanon(oneByte);
  ok("AUD-1c DW2 fail: a line that differs by one byte in detail gives a different hash, in TypeScript and in SQL", !entryHash(ZERO_HASH, oneByte).equals(entryHash(ZERO_HASH, VECTOR[1].line)) && !s1.h.equals(s2.h));
  ok("AUD-1c DW2 fail: two lines whose fields would run together without the length prefix differ (summary 'ab' + entity_key 'c' vs 'a' + 'bc')",
    canonical({ ...VECTOR[0].line, entityKey: "c", summary: "ab" }) !== canonical({ ...VECTOR[0].line, entityKey: "bc", summary: "a" }) && canonical({ ...VECTOR[0].line, entityKey: null }) !== canonical({ ...VECTOR[0].line, entityKey: "" }));

  // ------------------------------------------------------------------------------------------- DW1: concurrent writers
  const writers = async (plan: { firm: string; lines: number }[]) => Promise.all(plan.map(async (p) => {
    const c = new pg.Client({ connectionString: urlOf(BARE, "xr_app") }); await c.connect();
    try { for (let i = 0; i < p.lines; i++) await c.query("insert into audit_event (id, workspace_id, firm_id, actor, action, entity, summary) values ($1, $2, $3, 'staff:aud1c', 'check', 'aud1c', 'Sample concurrent line')", [randomUUID(), W_FIRM, p.firm]); }
    finally { await c.end(); }
  }));
  const f1Before = n(BARE, `select count(*) from audit_event where chain_key = '${F1}'`);
  await writers(Array.from({ length: 20 }, () => ({ firm: F1, lines: 50 })));
  const vf1 = await verify(bare, F1);
  ok(`AUD-1c DW1 pass: 1,000 lines from 20 concurrent writers on one firm give seq ${f1Before + 1}..${f1Before + 1000} with no gap and a valid chain (as the app's connection)`,
    vf1.ok && vf1.n === f1Before + 1000 && n(BARE, `select max(seq) from audit_event where chain_key = '${F1}'`) === f1Before + 1000, vf1);
  const f2Before = n(BARE, `select count(*) from audit_event where chain_key = '${F2}'`);
  await writers(Array.from({ length: 20 }, (_x, i) => ({ firm: i % 2 ? F2 : F3, lines: 25 })));
  const vf2 = await verify(bare, F2), vf3 = await verify(bare, F3);
  ok("AUD-1c DW1 pass: two firms written at once each have their own gap-free sequence (250 lines each, 10 writers each)", vf2.ok && vf3.ok && vf2.n === f2Before + 250 && vf3.n === 250, [vf2, vf3]);
  // The fail: a gap or a forged seq is seen. As the owner with triggers off (a tamper no role of the app can do).
  const victim = sql(BARE, `select id from audit_event where chain_key = '${F3}' and seq = 100`);
  sql(BARE, `begin; set local session_replication_role = replica; update audit_event set seq = 100000 where id = '${victim}'; commit`);
  const vGap = await verify(bare, F3);
  sql(BARE, `begin; set local session_replication_role = replica; update audit_event set seq = 100 where id = '${victim}'; commit`);
  ok("AUD-1c DW1 fail: a line moved out of its place (seq forged as the owner, triggers off) leaves a gap the recomputation names at that seq; put back, it verifies", !vGap.ok && vGap.at === 100 && (await verify(bare, F3)).ok, vGap);
  ok("AUD-1c DW1 fail: the app cannot forge a seq or a hash afterwards (no UPDATE right, PF-12; the trigger refuses the owner)", NEVER.test(err(() => sql(BARE, `update audit_event set seq = 1 where id = '${victim}'`, "xr_app"))) && NEVER.test(err(() => sql(BARE, `update audit_event set entry_hash = prev_hash where id = '${victim}'`))));

  const random = (await bare.query<Row & { c: string }>(`${LINE_SQL.replace("from audit_event", ", aud_event_canonical(e) c from audit_event e")} order by random() limit 100`)).rows;
  ok(`AUD-1c DW2 pass: on ${random.length} lines read back from the database, canonical.ts gives the database's canonical text and its stored entry_hash`,
    random.length === 100 && random.every((r) => canonical(asLine(r)) === r.c && entryHash(r.prev_hash, asLine(r)).equals(r.entry_hash)));
  // ------------------------------------------------------------------------------------------- DW4: writers, and the reset
  const forged = randomUUID();
  sql(BARE, `insert into audit_event (id, workspace_id, firm_id, actor, action, entity, summary, chain_key, seq, prev_hash, entry_hash) values ('${forged}', '${W_FIRM}', '${F2}', 'staff:aud1c', 'check', 'aud1c', 'Sample forged', 'platform', 1, '\\x${"ab".repeat(32)}', '\\x${"cd".repeat(32)}')`, "xr_app");
  ok("AUD-1c DW4 pass: a writer that passes its own chain_key, seq and hashes has them replaced (its firm's chain, the next seq, the real link)",
    sql(BARE, `select chain_key || '|' || seq from audit_event where id = '${forged}'`) === `${F2}|${f2Before + 251}` && (await verify(bare, F2)).ok && n(BARE, "select count(*) from audit_event where chain_key = 'platform' and seq = 1") === 1);
  const firmsBefore = await nonSample(bare);
  const demoN = n(BARE, `select count(*) from audit_event where chain_key = 'sample:${W_DEMO}'`);
  ok("AUD-1c DW4 fail: a firm chain's line cannot be deleted, even with the reset setting on (AUD-1a), so a firm chain is never cut", NEVER.test(err(() => sql(BARE, `begin; select set_config('app.audit_sample_reset', 'on', true); delete from audit_event where chain_key = '${F1}' and seq = 3; commit`, "xr_app"))));
  // The demo reset's delete (Demo.wipe's, with the setting): the demo chain is emptied while its workspace exists.
  sql(BARE, `begin; select set_config('app.audit_sample_reset', 'on', true); delete from audit_event where workspace_id = '${W_DEMO}'; commit`, "xr_app");
  const restarted = sql(BARE, `select string_agg(action || '|' || actor || '|' || seq || '|' || (prev_hash = '\\x${ZERO_HASH.toString("hex")}'::bytea), ',') from audit_event where chain_key = 'sample:${W_DEMO}'`);
  ok(`AUD-1c DW4 pass: the reset's delete (${demoN} demo lines) restarts the sample chain with one chain.restarted line (actor system, seq 1, linked to zero) and it verifies`,
    demoN === 7 && restarted === "chain.restarted|system|1|true" && (await verify(bare, `sample:${W_DEMO}`)).ok, restarted);
  // Breaker Major 1: a demo write in flight while the reset deletes. The writer holds the demo chain's lock; the reset's
  // delete waits for it at the restart, then removes the line that committed meanwhile, and the chain restarts clean.
  for (let i = 0; i < 4; i++) sql(BARE, line(W_DEMO, "user-A"), "xr_app");
  const writer = await client(BARE, "xr_app"), resetter = await client(BARE, "xr_app");
  await writer.query("begin");
  await writer.query("insert into audit_event (id, workspace_id, actor, action, entity, summary) values ($1, $2, 'user-A', 'check', 'aud1c', 'Sample line in flight')", [randomUUID(), W_DEMO]);
  const t0 = Date.now();
  const resetting = resetter.query(`begin; select set_config('app.audit_sample_reset', 'on', true); delete from audit_event where workspace_id = '${W_DEMO}'; commit`);
  await new Promise((r) => setTimeout(r, 400));
  await writer.query("commit");
  await resetting;
  const raced = sql(BARE, `select string_agg(seq || ':' || action, ',' order by seq) from audit_event where chain_key = 'sample:${W_DEMO}'`);
  ok(`AUD-1c DW4 pass (breaker Major 1): a reset racing a demo write waits for it (${Date.now() - t0} ms), removes the line that committed meanwhile, and the chain restarts with one line that verifies`,
    raced === "1:chain.restarted" && (await verify(bare, `sample:${W_DEMO}`)).ok && Date.now() - t0 >= 400, raced);
  for (let i = 0; i < 3; i++) sql(BARE, line(W_DEMO, "user-A"), "xr_app");
  sql(BARE, `begin; select set_config('app.audit_sample_reset', 'on', true); delete from audit_event where chain_key = 'sample:${W_DEMO}' and seq = 3; commit`, "xr_app");
  ok("AUD-1c DW4 fail: deleting one line that is not a chain's start (lines 1..M) is no reset: nothing else is removed and no restart line is written",
    sql(BARE, `select string_agg(seq || ':' || action, ',' order by seq) from audit_event where chain_key = 'sample:${W_DEMO}'`) === "1:chain.restarted,2:check,4:check");
  const firmsAfter = await nonSample(bare);
  ok("AUD-1c DW4 pass: every firm chain and the platform chain are unchanged by it (every line's seq and hash the same, no line added) and still verify",
    firmsAfter.size === firmsBefore.size && [...firmsBefore].every(([k, h]) => firmsAfter.get(k) === h) && (await inOrder([F1, F2, F3, "platform"], (k) => verify(bare, k))).every((v) => v.ok));
  sql(BARE, `begin; select set_config('app.audit_sample_reset', 'on', true); delete from audit_event where chain_key = 'sample:${W_GONE}'; commit`, "xr_app");
  ok("AUD-1c DW4 fail: emptying the chain of a workspace that no longer exists writes no restart line (the chain simply ends; nothing is left behind for the orphan sweep)", n(BARE, `select count(*) from audit_event where chain_key = 'sample:${W_GONE}'`) === 0 && n(BARE, `select count(*) from audit_event where workspace_id = '${W_GONE}' and chain_key = '${F1}'`) === 1);

  // migrate diff: empty for the trail on the empty and the demo-data copies.
  for (const d of all) psql(urlOf(EMPTY), ["-f", join(MIG, d, "migration.sql")]);
  for (const d of before) psql(urlOf(BEFORE), ["-f", join(MIG, d, "migration.sql")]);
  ok("AUD-1c DW5 pass: migrate diff names nothing of the trail or the checker's table on the empty copy and on the demo-data copy (the chain columns @ignore, dbgenerated)", auditDiff(EMPTY).length === 0 && auditDiff(BARE).length === 0, [...auditDiff(EMPTY), ...auditDiff(BARE)]);
  ok("AUD-1c DW5 fail: the schema without the migration differs (diff names the chain columns and aud_chain_check)", (() => { const d = auditDiff(BEFORE); return d.some((l) => /chain_key/.test(l)) && d.some((l) => /aud_chain_check/.test(l)); })());

  // ------------------------------------------------------------------------------------------- Part B: the isolated copy
  const call = async (method: string, path: string, body?: unknown, actor = "user-A") => {
    const r = await fetch(`http://localhost:${PORT}/api${path}`, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const L = await call("POST", "/demo/load", {});
  if (L.status >= 300) { ok("AUD-1c setup: the sample loads on the copy", false, L.body); throw new Error("setup"); }
  const copy = await client(COPY);
  const P_WS = sql(COPY, `insert into workspace (id, key, label) values (gen_random_uuid(), 'platform-audit', 'Platform audit lines (firm staff, roles, settings; never reset)') on conflict (key) do update set label = excluded.label returning id`);
  for (let i = 0; i < 3; i++) { sql(COPY, line(P_WS, "staff:aud1c", { firm_id: `'${F1}'` }), "xr_app"); sql(COPY, line(P_WS, "system:check"), "xr_app"); }
  const demoWs = sql(COPY, "select id from workspace where key = 'demo'");
  const keep = await nonSample(copy), demoLines = n(COPY, `select count(*) from audit_event where chain_key = 'sample:${demoWs}'`);
  const vDemo = await verify(copy, `sample:${demoWs}`);
  const R = await call("POST", "/demo/reset", { confirm: "RESET" });
  const newWs = sql(COPY, "select id from workspace where key = 'demo'");
  const keptAfter = await nonSample(copy), chainsAfter = await chains(copy), vAll = await inOrder(chainsAfter, (async (k) => [k, await verify(copy, k)] as const));
  ok(`AUD-1c DW4 pass (the real reset): the loaded demo's chain (${demoLines} lines) verified before; after POST /demo/reset every firm chain and the platform chain keep each line as it was (${keep.size} lines) and every chain verifies`,
    R.status < 300 && vDemo.ok && demoLines > 50 && [...keep].every(([k, h]) => keptAfter.get(k) === h) && vAll.every(([, v]) => v.ok), { status: R.status, vDemo, bad: vAll.filter(([, v]) => !v.ok) });
  ok("AUD-1c DW4 pass (the real reset): the old demo chain is gone with its workspace (its restart line swept as an orphan), and the new demo workspace's chain starts at seq 1 with the reset's own line",
    n(COPY, `select count(*) from audit_event where chain_key = 'sample:${demoWs}'`) === 0 && newWs !== demoWs && sql(COPY, `select string_agg(seq || ':' || action, ',' order by seq) from audit_event where chain_key = 'sample:${newWs}'`) === "1:reset");
  ok("AUD-1c DW4 fail (the real reset): the platform chain's lines written before it were not cut (the newest of them is still there, at its seq, with its hash)", [...keep.keys()].filter((k) => k.startsWith("platform#")).length >= 3 && [...keep.keys()].every((k) => keptAfter.has(k)));
} catch (e) {
  if (String((e as Error).message) !== "setup") ok("AUD-1c: the check ran to the end", false, String((e as Error).stack ?? e).slice(0, 600));
} finally {
  for (const c of clients) await c.end().catch(() => undefined);
  for (const db of [BARE, EMPTY, BEFORE]) execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
