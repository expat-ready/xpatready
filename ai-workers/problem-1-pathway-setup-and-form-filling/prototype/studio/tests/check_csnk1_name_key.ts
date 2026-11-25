// CS-NK1 (brief product/design/build-lead-c-briefs/CS-NK1.md; break report F2 of #2017; BR-6): the database key that
// reserves a shared-field name (canonical_field_name_key, kept by the trigger canonical_field_name_reserve) equals
// contracts/programs.ts normalizeLabel for every script, so canonical_field_name_unique refuses exactly what the app
// refuses. A pass and a fail per "Done when" line:
//   DW1  equality: the key equals normalizeLabel on the brief's corpus and on every assigned code point in six settings
//        (alone, between letters, before and after a capital sigma, after "ΑΣ", between "Α" and "Σ"); the 25 Oct key differs on Café and Ñ.
//   DW2  the race: 20 times, two renames at the same moment to "Café-crème …" and "Café crème …" in one group answer one
//        200 and one 409 "already"; on the 25 Oct key (database "bare"), the same two writes at the same moment both land.
//   DW3  never stricter: names the app tells apart (one combining mark, a final sigma, ß and ss, İ and i) are all accepted;
//        the database refuses a pair only when normalizeLabel makes them equal.
//   DW4  backfill: rows written under the 25 Oct key get normalizeLabel's key, or '' for a listed legacy duplicate (a
//        NOTICE names it); run once more, the backfill changes nothing.
// Scratch databases: "bare" (every migration before this row's, rows written there under the 25 Oct key, then this row's
// migration) and "full" (every migration). Both are dropped at the end. No browser, no model call (US$0); names Sample.
//   zsh studio/tools/isolated.sh runtime_csnk1 4637 start && tsx studio/tests/check_csnk1_name_key.ts 4637 xr_studio_runtime_csnk1
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { normalizeLabel } from "../contracts/programs.ts";
import { seedField } from "./seed_library.cjs";

const PORT = Number(process.argv[2] ?? 4637), APIDB = process.argv[3] ?? "xr_studio_runtime_csnk1";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261119144500_csnk1_field_name_key", OLD = "20261025100000_field_name_unique";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const bin = (n: string) => (BIN ? join(BIN, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const BARE = `xr_studio_csnk1_bare_${process.pid}`, FULL = `xr_studio_csnk1_full_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const psql = (db: string, args: string[]) => execFileSync(bin("psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string) => psql(db, ["-Atc", q]);
const apiSql = (q: string) => sql(APIDB, q);
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

// The brief's corpus (DW1): ASCII with punctuation and spacing, accented Latin, ß, a Turkish dotted İ, full width (NFKC),
// Hindi and Thai with combining marks, Arabic, CJK, emoji, a zero-width joiner and a right-to-left mark. All Sample.
const CORPUS = ["Given name", "given-name", "  Given   NAME!! ", "Given_name (2)", "Café-crème name", "Café crème name", "CAFÉ CRÈME NAME",
  "ÑOMBRE", "ñombre", "Straße", "STRASSE", "İstanbul", "istanbul", "ＧＩＶＥＮ　ＮＡＭＥ", "किसान", "कसान", "किसान नाम", "ชื่อ", "ชอ", "ชื่อเล่น",
  "الاسم الأول", "الاسم", "名前", "名 前", "姓名（中文）", "Name 😀", "😀", "a‍b", "ab", "‏name", "name‎", "ΟΔΟΣ", "οδοσ", "ΣΑΣ-Α", "'Σ' name", ".Σ. name", "Σ name", "ΑΣ.Β", "Α.Σ", "ΣΣ", "é", "é", "ﬁle", "Ⅻ", "x²"];

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const left = spawnSync(bin("psql"), [...PG, "-d", "postgres", "-Atc", "select datname from pg_database where datname like 'xr\\_studio\\_csnk1\\_%'"], { encoding: "utf8" }).stdout ?? "";
for (const db of left.split("\n").filter(Boolean)) { const pid = Number(db.split("_").pop()); if (pid && !alive(pid)) spawnSync(bin("dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" }); }
const cleanup = () => { for (const db of [BARE, FULL]) spawnSync(bin("dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" }); };
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { cleanup(); process.exit(1); });

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
const text = readFileSync(join(MIG, NEW, "migration.sql"), "utf8");
const backfill = text.slice(text.indexOf("-- backfill:begin"), text.indexOf("-- backfill:end"));
const oldFn = readFileSync(join(MIG, OLD, "migration.sql"), "utf8").match(/CREATE FUNCTION canonical_field_name_key\(label TEXT\)[\s\S]*?LANGUAGE sql IMMUTABLE;/)?.[0] ?? "";

/** Keys of many labels in one query, in order. */
async function keys(c: pg.Client, fn: string, labels: string[]) {
  const { rows } = await c.query(`select ${fn}(x) k from unnest($1::text[]) with ordinality t(x, i) order by i`, [labels]);
  return rows.map((r) => r.k as string);
}
const field = (ws: string, key: string, label: string) => `insert into canonical_field (id, workspace_id, canonical_field_key, version, status, meaning, value_type, data_type, scope, subject_kind, origin, label, group_key, updated_by) values (gen_random_uuid(), ${ws}, ${q(key)}, 1, 'DRAFT', 'CS-NK1 test field (Sample)', 'text', 'STRING', 'CLIENT_LEVEL', 'PERSON', 'HUMAN', ${q(label)}, 'person', 'user-A')`;
const WS = "(select id from workspace where key = 'csnk1')";
/** Two writes at the same moment on two connections: each inserts, both commit; returns which committed. */
async function together(db: string, a: [string, string], b: [string, string]) {
  const [x, y] = [new pg.Client({ connectionString: urlOf(db) }), new pg.Client({ connectionString: urlOf(db) })];
  await x.connect(); await y.connect();
  try {
    await x.query("begin"); await y.query("begin");
    await x.query(field(WS, ...a));
    const second = y.query(field(WS, ...b)).then(() => y.query("commit")).then(() => "ok", async (e) => { await y.query("rollback"); return String(e.message); });
    await new Promise((r) => setTimeout(r, 300));
    await x.query("commit");
    return ["ok", await second];
  } finally { await x.end(); await y.end(); }
}
type Res = { status: number; body: { detail?: string; applied?: boolean } };
const rename = async (key: string, name: string): Promise<Res> => {
  const r = await fetch(`http://localhost:${PORT}/api/library/fields/${key}/name`, { method: "PATCH", headers: { "x-actor": "user-A", "content-type": "application/json" }, body: JSON.stringify({ name }) });
  const t = await r.text(); let j: Res["body"] = {}; try { j = JSON.parse(t); } catch { j = { detail: t }; }
  return { status: r.status, body: j };
};

try {
  ok("setup: the 25 Oct key and this row's backfill block are found in their migrations", oldFn.length > 0 && backfill.length > 200);
  for (const db of [BARE, FULL]) { spawnSync(bin("dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" }); execFileSync(bin("createdb"), [...PG, db]); }
  for (const d of all.filter((d) => d < NEW)) psql(BARE, ["-f", join(MIG, d, "migration.sql")]);
  for (const d of all) psql(FULL, ["-f", join(MIG, d, "migration.sql")]);
  // Lead 96, 19 Nov: was "the newest on the branch", which failed as soon as any later migration landed (P-600 gives
  // every later row a later stamp); the folder only has to exist, and FULL above applies every folder in order.
  ok("setup: this row's migration is on the branch", all.includes(NEW), all.slice(-2));
  for (const db of [BARE, FULL]) sql(db, `insert into workspace (id, key, label) values (gen_random_uuid(), 'csnk1', 'CS-NK1 check (Sample)')`);
  const full = new pg.Client({ connectionString: urlOf(FULL) }), bare = new pg.Client({ connectionString: urlOf(BARE) });
  await full.connect(); await bare.connect();

  // ─────────── DW1: equality
  const want = CORPUS.map(normalizeLabel), got = await keys(full, "canonical_field_name_key", CORPUS);
  const diffs = CORPUS.map((l, i) => [l, got[i], want[i]]).filter(([, g, w]) => g !== w);
  ok("CS-NK1 DW1 pass: on the brief's corpus (ASCII, Café, Ñ, ß, İ, full width, Hindi, Thai, Arabic, CJK, emoji, ZWJ, RLM) the database key equals normalizeLabel", diffs.length === 0, diffs);
  // Every assigned code point (no surrogates, private use or unassigned) in six settings; the capital sigma ones prove
  // the written-out Final_Sigma rule (break report F1: PostgreSQL's own rule differs after punctuation).
  const cps: number[] = []; for (let cp = 1; cp <= 0x10ffff; cp++) if (!/^[\p{Cn}\p{Co}\p{Cs}]$/u.test(String.fromCodePoint(cp))) cps.push(cp);
  const wraps: [string, (s: string) => string][] = [["alone", (s) => s], ["between letters", (s) => `A${s}b`], ["before Σ", (s) => `${s}Σ x`], ["after Σ", (s) => `Σ${s}`], ["after ΑΣ", (s) => `ΑΣ${s} x`], ["between Α and Σ", (s) => `Α${s}Σ x`]];
  const bad: string[] = [];
  for (const [how, w] of wraps) for (let i = 0; i < cps.length; i += 40000) {
    const xs = cps.slice(i, i + 40000).map((cp) => w(String.fromCodePoint(cp))), ks = await keys(full, "canonical_field_name_key", xs);
    ks.forEach((k, j) => { const cp = cps[i + j]; if (k !== normalizeLabel(xs[j])) bad.push(`${how} U+${cp.toString(16).toUpperCase()}: ${k} vs ${normalizeLabel(xs[j])}`); });
  }
  ok(`CS-NK1 DW1 pass: on all ${cps.length} assigned code points, in six settings (alone, between letters, before and after Σ, after ΑΣ, between Α and Σ), the key equals normalizeLabel`, bad.length === 0, bad.slice(0, 20));
  await full.query(oldFn.replace("canonical_field_name_key", "csnk1_old_key"));
  // Punctuation and spaces in each, so the 25 Oct key's difference shows under any database collation (its lower() is
  // the database's: C leaves Ñ upper case, a UTF-8 libc collation, as CI's, lowers it).
  const old = await keys(full, "csnk1_old_key", ["Café-crème name", "Café crème name", "ÑOMBRE de-pila", "ñombre de pila"]);
  ok("CS-NK1 DW1 fail: the 25 Oct key differs from normalizeLabel on the Café and Ñ cases (why it is replaced)", old[0] !== normalizeLabel("Café-crème name") && old[0] !== old[1] && old[2] !== normalizeLabel("ÑOMBRE de-pila") && old[2] !== old[3], old);

  // ─────────── DW3: never stricter (the database refuses a pair only when the app makes them equal)
  const PAIRS: [string, string][] = [["किसान", "कसान"], ["é name", "e name"], ["ΟΔΟΣ", "οδοσ"], ["Straße", "Strasse"], ["İstanbul", "Istanbul"], ["ชื่อ", "ชอ"], ["名前", "名"], ["Ⅻ", "XII x"], ["'Σ' x", "ς x"], ["ΑΣ𖺠", "Ας𖺠"]];
  const pk = await keys(full, "canonical_field_name_key", PAIRS.flat());
  const stricter = PAIRS.filter(([a, b], i) => normalizeLabel(a) !== normalizeLabel(b) && pk[2 * i] === pk[2 * i + 1]);
  ok("CS-NK1 DW3 pass: names the app tells apart (one combining mark, a final sigma, ß and ss, İ and I, Thai marks) get different database keys", stricter.length === 0, stricter);
  const accepted = PAIRS.map(([a, b], i) => { sql(FULL, `${field(WS, `person.csnk1_p${i}a`, a)}; ${field(WS, `person.csnk1_p${i}b`, b)}`); return i; }).length;
  ok("CS-NK1 DW3 pass: all 20 of those names are accepted in one group (none refused by canonical_field_name_unique)", accepted === PAIRS.length && sql(FULL, `select count(*) from canonical_field_name where canonical_field_key like 'person.csnk1_p%' and name_key <> ''`) === String(2 * PAIRS.length));
  const refusedBy = (q: string) => { try { sql(FULL, q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  const dupe = refusedBy(field(WS, "person.csnk1_dupe", "कि-सान!"));
  ok("CS-NK1 DW3 fail: \"कि-सान!\", equal to \"किसान\" under normalizeLabel, is refused by canonical_field_name_unique (the guard still holds)", /canonical_field_name_unique/.test(dupe), dupe);

  // ─────────── DW2: the race (database level on both keys, then 20 times through the API)
  const oldRace = await together(BARE, ["person.csnk1_ra", "Café-crème name"], ["person.csnk1_rb", "Café crème name"]);
  ok("CS-NK1 DW2 fail: on the 25 Oct key, two writes at the same moment to \"Café-crème name\" and \"Café crème name\" both land (the defect)", oldRace.join() === "ok,ok" && sql(BARE, `select count(*) from canonical_field where canonical_field_key in ('person.csnk1_ra','person.csnk1_rb')`) === "2", oldRace);
  const newRace = await together(FULL, ["person.csnk1_ra", "Café-crème name"], ["person.csnk1_rb", "Café crème name"]);
  ok("CS-NK1 DW2 pass: on the new key, the same two writes at the same moment: one lands, the other is refused by canonical_field_name_unique", newRace[0] === "ok" && /canonical_field_name_unique/.test(newRace[1]), newRace);
  const loaded = await fetch(`http://localhost:${PORT}/api/demo/load`, { method: "POST", headers: { "x-actor": "user-A" } });
  ok("CS-NK1 DW2 setup: the sample inputs load on the isolated copy", loaded.status === 201, loaded.status);
  const u = Date.now().toString(36), runs: string[] = [];
  for (let n = 0; n < 20; n++) {
    const a = seedField(apiSql, { key: `person.csnk1_a${n}_${u}`, meaning: "CS-NK1 test field (Sample)", review: false }), b = seedField(apiSql, { key: `person.csnk1_b${n}_${u}`, meaning: "CS-NK1 test field (Sample)", review: false });
    const [x, y] = await Promise.all([rename(a, `Café-crème name ${n} ${u}`), rename(b, `Café crème name ${n} ${u}`)]);
    const held = apiSql(`select count(*) from canonical_field_name where canonical_field_key in (${q(a)}, ${q(b)}) and name_key = ${q(normalizeLabel(`Café crème name ${n} ${u}`))}`);
    const r409 = [x, y].find((r) => r.status === 409);
    if ([x.status, y.status].sort().join() !== "200,409" || !/already/.test(r409?.body.detail ?? "") || held !== "1") runs.push(JSON.stringify({ n, x, y, held }));
  }
  ok("CS-NK1 DW2 pass: 20 times, two renames at the same moment to \"Café-crème name …\" and \"Café crème name …\": one 200, one 409 \"already\", one field holds the name", runs.length === 0, runs);

  // ─────────── DW4: the backfill (rows written under the 25 Oct key in "bare", then this row's migration)
  sql(BARE, `${field(WS, "person.csnk1_n1", "ÑOMBRE de pila")}; ${field(WS, "person.csnk1_n2", "Given name")}; ${field(WS, "person.csnk1_n3", "Café-crème x")}; ${field(WS, "person.csnk1_n4", "Café crème x")}; ${field(WS, "person.csnk1_n5", "किसान")}`);
  // Break report F4: an older version retired after a newer draft, so the trigger wrote the older label last; a second
  // field then takes the newer draft's name, which the 25 Oct key allowed. Neither is a legacy duplicate after the backfill.
  sql(BARE, `${field(WS, "person.csnk1_r1", "Ålder x").replace("'DRAFT'", "'PUBLISHED'")}; ${field(WS, "person.csnk1_r1", "Ärende x").replace(", 1, 'DRAFT'", ", 2, 'DRAFT'")};
    update canonical_field set status = 'RETIRED' where canonical_field_key = 'person.csnk1_r1' and version = 1; ${field(WS, "person.csnk1_r2", "ärende x")}`);
  // Devin review on #2101: a collision loser whose reservation came from an older version stays a listed duplicate on a
  // second run (it is never handed its newest version's name).
  sql(BARE, `${field(WS, "person.csnk1_ya", "Café crème y")}; ${field(WS, "person.csnk1_yz", "Café-crème y").replace("'DRAFT'", "'PUBLISHED'")}; ${field(WS, "person.csnk1_yz", "Different y").replace(", 1, 'DRAFT'", ", 2, 'DRAFT'")};
    update canonical_field set status = 'RETIRED' where canonical_field_key = 'person.csnk1_yz' and version = 1`);
  const stale = sql(BARE, `select count(*) from canonical_field_name n join canonical_field c using (workspace_id, canonical_field_key) where c.canonical_field_key like 'person.csnk1_%' and n.name_key <> lower(regexp_replace(c.label, '[^A-Za-z0-9]+', '', 'g'))`);
  ok("CS-NK1 DW4 fail: before this row's migration, the stored keys of the non-ASCII names differ from normalizeLabel", Number(stale) >= 4, stale);
  const first = spawnSync(bin("psql"), [urlOf(BARE), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, NEW, "migration.sql")], { encoding: "utf8" });
  const firstListed = first.stderr.match(/CS-NK1 legacy duplicate name[^\n]*/g) ?? [];
  ok("CS-NK1 DW4 pass: the migration applies on rows written under the 25 Oct key, and its NOTICE lists the three legacy duplicates", first.status === 0 && firstListed.length === 3 && firstListed.every((l) => /person\.csnk1_(rb|n4|yz)/.test(l)), { status: first.status, err: first.stderr.slice(-400) });
  for (const l of firstListed) console.log(`      ${l.replace(/^.*?CS-NK1/, "CS-NK1")}`);
  const rows = sql(BARE, `select c.canonical_field_key || '|' || c.label || '|' || n.name_key from canonical_field_name n join canonical_field c using (workspace_id, canonical_field_key) where c.canonical_field_key like 'person.csnk1_%' order by 1`).split("\n").map((l) => l.split("|"));
  const legacy = new Set(["person.csnk1_rb", "person.csnk1_n4", "person.csnk1_yz"]), reservedAs: Record<string, string> = { "person.csnk1_r1": "Ålder x" };
  const wrong = rows.filter(([k, label, key]) => key !== (legacy.has(k) ? "" : normalizeLabel(reservedAs[k] ?? label)));
  ok("CS-NK1 DW4 pass: after the migration every row's key is normalizeLabel of its label, or '' for the three legacy duplicates (the race pair, Café-crème x, Café-crème y from an older version); the F4 field keeps the label it was reserved with", rows.filter((r) => r[0] === "person.csnk1_r1").every((r) => r[2] === normalizeLabel("Ålder x")) && new Set(rows.map((r) => r[0])).size === 11 && wrong.length === 0, { rows, wrong });
  const before = sql(BARE, `select string_agg(canonical_field_key || '=' || name_key, ',' order by canonical_field_key) from canonical_field_name`);
  const again = spawnSync(bin("psql"), [urlOf(BARE), "-X", "-v", "ON_ERROR_STOP=1", "-c", `begin; ${backfill.replace(/^\s*--.*$/gm, "")} commit;`], { encoding: "utf8" });
  const after = sql(BARE, `select string_agg(canonical_field_key || '=' || name_key, ',' order by canonical_field_key) from canonical_field_name`);
  const listed = (again.stderr.match(/CS-NK1 legacy duplicate name[^\n]*/g) ?? []);
  ok("CS-NK1 DW4 pass: run once more, the backfill changes nothing and its NOTICE lists the same three legacy duplicates", again.status === 0 && before === after && listed.length === 3 && listed.every((l) => /person\.csnk1_(rb|n4|yz)/.test(l)), { status: again.status, err: again.stderr.slice(-400), listed });
  // Devin review on #2101: the backfill holds field writes off until it commits, so a rename from an API still running
  // during the migration waits and then reserves its own new name (never a stale snapshot's).
  const [m, w] = [new pg.Client({ connectionString: urlOf(BARE) }), new pg.Client({ connectionString: urlOf(BARE) })];
  await m.connect(); await w.connect();
  await m.query(`begin; ${backfill.replace(/^\s*--.*$/gm, "")}`);
  let landed = false;
  const write = w.query(`update canonical_field set label = 'Nuevo nombre ñ' where canonical_field_key = 'person.csnk1_n1'`).then(() => { landed = true; });
  await new Promise((r) => setTimeout(r, 500));
  const waited = !landed;
  await m.query("commit"); await write;
  const nk = sql(BARE, `select name_key from canonical_field_name where canonical_field_key = 'person.csnk1_n1'`);
  ok("CS-NK1 DW4 pass: a rename during the backfill waits for it, then reserves its new name under the new key", waited && landed && nk === normalizeLabel("Nuevo nombre ñ"), { waited, landed, nk });
  ok("CS-NK1 DW4 pass: the backfill's lock does not stop reads (a read on canonical_field is not held off)", (await m.query(`begin; ${backfill.replace(/^\s*--.*$/gm, "")}`).then(async () => { const r = await w.query("select count(*) from canonical_field"); await m.query("rollback"); return Number(r.rows[0].count) > 0; })));
  await m.end(); await w.end();
  await full.end(); await bare.end();
} catch (err) {
  ok("the CS-NK1 check ran", false, (err as Error).message);
} finally {
  cleanup();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
