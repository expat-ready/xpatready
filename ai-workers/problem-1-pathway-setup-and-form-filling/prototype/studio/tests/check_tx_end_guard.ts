// M1 (P1-pool round-1 break; Lead 24 ruling on #3428, Lead 25 on #3441): a Prisma interactive transaction's timeout can
// fire while one operation that sends two statements is running; the engine's ROLLBACK queues behind the running
// statement, the operation's next statement is sent after it and runs on its own (autocommit), and stays, while the
// caller is told the transaction failed. Fix: a checkout of the app's WalledPool (firm-scope.ts) that has sent COMMIT or
// ROLLBACK (not ROLLBACK TO SAVEPOINT) refuses every later query before it is sent; a plain string, a config object and a
// prepared statement (also when reused by name only) all count; a checkout's state is new at each connect. Also in this
// row, on the P1 pool guard: idle needs pg's readyForQuery (Lead B 6: after an error pg clears the statement before the
// server's ready message), a release with a statement in flight waits for it to finish before judging (P1 break m6),
// and each guard's in-flight check is pinned on its own (P1 review m7). Each a pass and a fail; one scratch database,
// as xr_app through row-level security; no browser, no server, no model call (US$0).
//   tsx studio/tests/check_tx_end_guard.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_txend_scratch_${process.pid}`, OWNER = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, APP = `postgresql://xr_app@127.0.0.1:54329/${DB}`;
const A = "11111111-1111-4111-8111-111111111111", B = "33333333-3333-4333-8333-333333333333";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const psql = (q: string) => execFileSync(join(BIN, "psql"), [OWNER, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
// The tables of the Prisma model platSystemRole with nested permissions, WITHOUT the real foreign key (with it the late
// insert fails on the key and nothing stays: the shape that is exposed is a later statement that does not need the first).
psql(`create table plat_system_role(code text primary key, display_name text not null);
  create table plat_system_role_permission(role_code text not null, permission_key text not null, primary key (role_code, permission_key));
  create function slow() returns trigger language plpgsql as $$ begin perform pg_sleep(0.6); return new; end $$;
  create trigger slow before insert on plat_system_role for each row execute function slow();
  create table note(firm_id uuid not null, body text not null);
  alter table note enable row level security; alter table note force row level security;
  create policy wall on note using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid);
  grant usage on schema public to xr_app, xr_staff_bypass;
  grant select, insert, update, delete on plat_system_role, plat_system_role_permission, note to xr_app, xr_staff_bypass;`);

const fs = await import("../api/src/platform/firm-scope.ts");
const { JsonLog, useLog } = await import("../api/src/platform/observability/log.ts");
const lines: string[] = []; useLog(new JsonLog((line) => { lines.push(line); }));
const fired = (use: string) => lines.filter((l) => l.includes('"platform_pool_open_transaction"') && l.includes(`"${use}"`)).length;
const pool = new fs.WalledPool({ connectionString: APP, max: 1 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });
fs.oneQueryPerCaller(db);
type Row = Record<string, unknown>;
const q = async (c: { query: (t: string) => Promise<{ rows: Row[] }> }) => (await c.query("select pg_backend_pid() p, current_setting('app.firm_id', true) f, (select xact_start is not null and xact_start < query_start from pg_stat_activity where pid = pg_backend_pid()) intx")).rows[0];
const refusedAfterEnd = (e: unknown) => e instanceof Error && /after (its|this connection's) (COMMIT|ROLLBACK|end)/i.test(e.message);
const count = (t: string, w = "true") => Number(psql(`select count(*) from ${t} where ${w}`));
try {
  // (1) M1 itself: the timeout fires while the nested create's first insert runs; nothing of it may stay.
  const r1 = await fs.withFirm(A, () => db.$transaction(async (t) => {
    await (t as unknown as { platSystemRole: { create: (a: unknown) => Promise<unknown> } }).platSystemRole.create({ data: { code: "r1", displayName: "role", permissions: { create: [{ permissionKey: "p1" }] } } });
  }, { timeout: 300 })).then(() => "committed", (e: Error) => e.message.split("\n").pop()!);
  await sleep(900);
  ok("M1 fail: a transaction timeout during a two-statement write keeps none of it (the caller is told it failed, and neither row stays)", r1 !== "committed" && count("plat_system_role") === 0 && count("plat_system_role_permission") === 0, { r1, parent: count("plat_system_role"), child: count("plat_system_role_permission") });
  await sleep(300);
  const after1 = await fs.withFirm(B, () => pool.connect()); const r1b = await q(after1); after1.release();
  ok("M1 pass: the next caller then gets a clean connection in its own firm, outside any transaction", r1b.f === B && r1b.intx === false, r1b);

  // (2) the guard on its own, every form of a transaction end; the later query is refused and never reaches the server.
  const forms: [string, (c: { query: (...a: unknown[]) => Promise<unknown> }) => Promise<unknown>][] = [
    ["a plain string COMMIT", (c) => c.query("COMMIT")],
    ["a config object ROLLBACK", (c) => c.query({ text: "rollback", values: [] })],
    ["a prepared statement ROLLBACK", (c) => c.query({ name: "pf_m1_rb", text: "ROLLBACK", values: [] })],
    ["the same prepared statement reused by name only", (c) => c.query({ name: "pf_m1_rb", values: [] } as never)],
    ["END", (c) => c.query("end")],
    ["ABORT", (c) => c.query("  abort  ")],
    ["a multi-statement text ending in commit", (c) => c.query("select 1; commit")],
  ];
  for (const [what, end] of forms) {
    const c = await fs.withFirm(A, () => pool.connect());
    await c.query("begin");
    await end(c as never).catch(() => undefined);
    const later = await c.query(`insert into note values ('${A}', 'after-end')`).then(() => "ran", (e: Error) => e);
    c.release();
    ok(`M1 fail (guard): after ${what}, a later query on that checkout is refused before it is sent`, refusedAfterEnd(later) && count("note", "body = 'after-end'") === 0, { later: later instanceof Error ? later.message : later, stored: count("note", "body = 'after-end'") });
  }
  // Not an end of the transaction: a savepoint's rollback or release, a DO block's END, a string that says commit.
  const keep = await fs.withFirm(A, () => pool.connect());
  await keep.query("begin"); await keep.query("savepoint s1"); await keep.query("rollback to savepoint s1"); await keep.query("release savepoint s1");
  await keep.query("do $$ begin perform 1; end $$"); await keep.query("select 'commit; end' as words");
  const still = await keep.query(`insert into note values ('${A}', 'still-inside')`).then(() => "ran", (e: Error) => e.message);
  await keep.query("rollback"); keep.release();
  ok("M1 pass (guard): ROLLBACK TO SAVEPOINT, RELEASE SAVEPOINT, a DO block's END and a quoted 'commit' do not end the checkout", still === "ran", still);
  // A checkout's state is new at each connect: the same pooled connection works again after its COMMIT.
  const c1 = await fs.withFirm(A, () => pool.connect()); const p1 = (await q(c1)).p; await c1.query("begin"); await c1.query("commit"); c1.release();
  const c2 = await fs.withFirm(A, () => pool.connect()); const r2 = await q(c2).catch((e: Error) => ({ error: e.message }) as Row); c2.release();
  ok("M1 pass (guard): the state is new at each checkout: the same connection, checked out again after its COMMIT, answers", !("error" in r2) && r2.p === p1, { p1, r2 });

  // (3) Lead B 6: after an error pg clears the statement before the server's ready message; a caller that releases in its
  // error handler, with firm B already waiting, must not hand B the failed transaction.
  const c3 = await fs.withFirm(A, () => pool.connect()); const p3 = (await q(c3)).p;
  const waiting3 = fs.withFirm(B, () => pool.connect()).catch((e: Error) => e);
  await sleep(50);
  // The server's ready message in a later network packet (here: this one client's handler delayed 20 ms), so the release
  // and firm B's checkout both happen while pg still holds the status from before the failed text.
  const con3 = (c3 as unknown as { connection: { listeners: (e: string) => ((m: unknown) => void)[]; removeAllListeners: (e: string) => void; on: (e: string, f: (m: unknown) => void) => void } }).connection;
  const ready3 = con3.listeners("readyForQuery"); con3.removeAllListeners("readyForQuery");
  con3.on("readyForQuery", (m) => setTimeout(() => ready3.forEach((l) => l(m)), 20));
  // The callback form: pg calls it inside its error handling, before the server's ready message is read.
  await new Promise<void>((done) => (c3 as unknown as { query: (t: string, cb: (e: Error | null) => void) => void }).query("begin; select 1/0", () => { c3.release(); done(); }));
  const c3b = await waiting3; const r3 = c3b instanceof Error ? { error: c3b.message } as Row : await q(c3b).catch((e: Error) => ({ error: e.message }) as Row);
  if (!(c3b instanceof Error)) c3b.release();
  ok("P1 fail (Lead B 6, readyForQuery): a client released in its error handler with a failed transaction never reaches firm B", !("error" in r3) && r3.f === B && r3.intx === false, { p3, r3 });

  // (4) P1 break m6: a raw caller that releases while its insert is still running is told the truth: success and stored.
  const c4 = await fs.withFirm(A, () => pool.connect());
  const sent = c4.query(`insert into note select '${A}', 'in-flight' from pg_sleep(0.3)`).then(() => "ok", (e: Error) => e.message);
  c4.release();
  const told = await sent; await sleep(200);
  ok("P1 fail (m6): a client released with an autocommit insert still running: the caller is told it succeeded, and the row is stored", told === "ok" && count("note", "body = 'in-flight'") === 1, { told, stored: count("note", "body = 'in-flight'") });

  // (5) P1 review m7: each guard's in-flight check on its own.
  const before5 = fired("destroyed");
  const c5 = await fs.withFirm(A, () => pool.connect()); const p5 = (await q(c5)).p;
  const begun5 = c5.query("begin").catch(() => undefined); c5.release(); await begun5;   // nobody waiting: the release decides
  await sleep(100);
  const c5b = await fs.withFirm(B, () => pool.connect()); const r5 = await q(c5b); c5b.release();
  ok("P1 fail (m7, release guard): a client released with its BEGIN unanswered and nobody waiting is destroyed at release", fired("destroyed") === before5 + 1 && r5.p !== p5 && r5.intx === false && r5.f === B, { destroyed: fired("destroyed") - before5, p5, r5 });
  const before6 = fired("destroyed-at-checkout");
  const c6 = await fs.withFirm(A, () => pool.connect()); const p6 = (await q(c6)).p; c6.release();
  const begun6 = c6.query("begin").catch(() => undefined);   // a misuse after release: BEGIN sent on a pooled client
  const c6b = await fs.withFirm(B, () => pool.connect()); await begun6; const r6 = await q(c6b); c6b.release();
  ok("P1 fail (m7, checkout guard): a pooled client with a statement in flight at checkout is destroyed, never handed out", fired("destroyed-at-checkout") === before6 + 1 && r6.p !== p6 && r6.intx === false && r6.f === B, { atCheckout: fired("destroyed-at-checkout") - before6, p6, r6 });
  ok("P1 pass (wording): the guard's error and event say busy or inside a transaction, not only a transaction", lines.some((l) => /busy or inside a transaction/.test(l)) || fs.notIdleWords === "a pooled connection came back busy or inside a transaction: destroyed, not reused", fs.notIdleWords);
  // (5b) Breaker m2, m3: endsTransaction reads the text in one pass as PostgreSQL does (each row checked against what the
  // server does with that text); an unclosed comment takes linear time.
  const table: [string, boolean][] = [
    ["select E'it\\'s'; commit", true], ["select E'\\''; commit", true], ["select '$$'; commit", true], ["select 1 as \"a'b\"; commit", true],
    ["select 1 -- it's\n; commit", true], ["select 'it''s'; end", true], ["prepare transaction 'm1'", true], ["  ROLLBACK WORK", true], ["commit transaction", true],
    ["select 1 /* a /* nested */ commit */", false], ["do $fn$ begin perform 1; end $fn$", false], ["select $1::text, $2", false], ["rollback to savepoint s", false],
    ["release savepoint s", false], ["commit prepared 'x'", false], ["select 1 /* unclosed ; commit", false], ["select $é$ ; commit $é$", false], ["select \"end\" from t", false],
  ];
  const wrong = table.filter(([sql, want]) => fs.endsTransaction(sql) !== want).map(([sql, want]) => ({ sql, want }));
  ok("M1 pass (breaker m2): endsTransaction agrees with PostgreSQL on every row of the table (quotes, E'' escapes, nested comments, dollar tags, PREPARE TRANSACTION)", wrong.length === 0, wrong);
  const t0 = Date.now(); fs.endsTransaction(`select 1 /* ${"x".repeat(60_000)}`);
  ok("M1 pass (breaker m3): an unclosed comment of 60 KB is read in under 50 ms", Date.now() - t0 < 50, Date.now() - t0);
  // (5c) Breaker m5: a client whose backend ends while its release waits for a statement is destroyed, never kept.
  const c5e = await fs.withFirm(A, () => pool.connect()); const p5e = (await q(c5e)).p;
  const long5e = c5e.query("select pg_sleep(5)").catch(() => undefined);
  c5e.release();
  psql(`select pg_terminate_backend(${p5e})`); await long5e; await sleep(200);
  const c5f = await fs.withFirm(B, () => pool.connect()); const r5f = await q(c5f); c5f.release();
  ok("P1 fail (breaker m5): a backend ended while its release waits is destroyed; the next caller gets a new connection in its own firm", r5f.p !== p5e && r5f.f === B && r5f.intx === false, { p5e, r5f });
  // (6) Review m1: a second release while the first waits for its statement throws to that caller (as pg-pool's own does)
  // and never inside pg's socket handler, which would end the process.
  const c7 = await fs.withFirm(A, () => pool.connect());
  const slow7 = c7.query("select pg_sleep(0.2)").catch(() => undefined);
  c7.release(); let twice: unknown = null; try { c7.release(); } catch (e) { twice = e; }
  await slow7; await sleep(100);
  const c7b = await fs.withFirm(A, () => pool.connect()); const r7 = await q(c7b); c7b.release();
  ok("P1 fail (review m1): a second release while the first settles throws to its caller, and the pool keeps serving", twice instanceof Error && /already been released/.test((twice as Error).message) && r7.f === A, { twice: String(twice), r7 });
} finally {
  await db.$disconnect().catch(() => {});
  // Review m3: a client never released would hold pool.end() for ever; a limit makes that a failure, not a hang.
  const ended = await Promise.race([pool.end().then(() => true, () => true), sleep(15_000).then(() => false)]);
  if (!ended) ok("the pool ends within 15 s (every client was released)", false);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}

// (7) Lead 25: one real split upsert from the app, `tx.govFormDef.upsert` with `update: {}` (finder.ts:713, sources.ts:892),
// on a scratch database with every migration. Prisma runs it as SELECT → INSERT → SELECT; another connection holds the
// table locked 0.6 s, so the first SELECT is still waiting when the transaction's 300 ms timeout fires. Without the guard
// the INSERT went out after the ROLLBACK and committed alone; with it nothing is stored.
{
  const MIG = join(import.meta.dirname, "..", "prisma", "migrations"), DB2 = `xr_studio_txend_full_${process.pid}`;
  const OWNER2 = `postgresql://xr_studio@127.0.0.1:54329/${DB2}`, APP2 = `postgresql://xr_app@127.0.0.1:54329/${DB2}`;
  const { readdirSync } = await import("node:fs");
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB2]); execFileSync(join(BIN, "createdb"), [...PG, DB2]);
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [OWNER2, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  const psql2 = (sql: string) => execFileSync(join(BIN, "psql"), [OWNER2, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", sql], { encoding: "utf8" }).trim();
  const ws = psql2("insert into workspace (id, key, label) values (gen_random_uuid(), 'm1-split', 'M1 split upsert') returning id");
  const pool2 = new fs.WalledPool({ connectionString: APP2, max: 2 }), db2 = new PrismaClient({ adapter: new PrismaPg(pool2) });
  fs.oneQueryPerCaller(db2);
  const { Client } = (await import("pg")).default;
  const holder = new Client({ connectionString: OWNER2 }); await holder.connect();
  try {
    await holder.query("begin"); await holder.query("lock table gov_form_def in access exclusive mode");
    const released = sleep(600).then(() => holder.query("commit"));
    const r8 = await db2.$transaction(async (tx) => {
      await tx.govFormDef.upsert({ where: { workspaceId_formKey: { workspaceId: ws, formKey: "IMM-M1" } }, update: {}, create: { workspaceId: ws, formKey: "IMM-M1", displayName: "M1 split", formKind: "data_form" } });
    }, { timeout: 300 }).then(() => "committed", (e: Error) => e.message.split("\n").pop()!);
    await released; await sleep(500);
    const stored = Number(psql2(`select count(*) from gov_form_def where form_key = 'IMM-M1'`));
    ok("M1 fail (Lead 25, a real split upsert): tx.govFormDef.upsert with update {} whose SELECT outlasts the timeout stores nothing (the caller is told it failed)", r8 !== "committed" && stored === 0, { r8, stored });
  } finally {
    await holder.end().catch(() => {}); await db2.$disconnect().catch(() => {});
    await Promise.race([pool2.end().catch(() => {}), sleep(15_000)]);
    try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB2]); } catch { /* prune-test-dbs.sh */ }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
