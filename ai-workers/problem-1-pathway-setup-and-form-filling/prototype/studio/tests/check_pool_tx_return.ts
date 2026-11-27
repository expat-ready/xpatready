// P1 of PF-4bc's round-3 break (Lead 23, 24 Nov, on #3217): a pooled connection that comes back to the app's WalledPool
// (api/src/platform/firm-scope.ts) with a transaction still open. Prisma 7.8's adapter-pg starts a transaction by sending
// BEGIN on a checked-out client; when the engine has already given up on that start (maxWait), it drops the transaction
// with PgTransaction.rollback(), which only releases the client and never sends ROLLBACK (adapter-pg 7.8.0 dist/index.mjs,
// `rollback() { this.cleanup?.(); this.client.release(); }`). The pool then hands that open transaction to the next caller.
// Each effect, a pass and a fail: (1) a write that answered success is lost (it sat in the stale transaction, invisible to
// others, until a later refused change rolled it back); (2) firm B's next query runs as firm A (the rollback undid B's
// set_config while the pool's tag still said B); (3) after a leaked bypass-role use, firm B's next query runs as the
// bypass role (Lead B 5). Plus: a client released inside a transaction leaves the pool, a client
// released idle is kept, and a failed transaction ('E') leaves too. One scratch database, a pool of one connection, no
// RLS needed (app.firm_id is read back directly). No browser, no server, no model call (US$0).
//   tsx studio/tests/check_pool_tx_return.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pooltx_scratch_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const A = "11111111-1111-4111-8111-111111111111", B = "33333333-3333-4333-8333-333333333333";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Prisma 7.10 (ship-security deps, #3904) no longer sends the late BEGIN after maxWait, so the timing below may leave no
// leak to catch. When it does not leak, the same leak is made by hand, the way adapter-pg's PgTransaction.rollback() makes
// it (unchanged in 7.10.1: release() alone, no ROLLBACK): a checkout, BEGIN, release. The guard is then tested either way.
const leakByHand = async (p: { connect: () => Promise<{ query: (t: string) => Promise<unknown>; release: () => void }> }, firm?: string) => {
  const c = firm ? await withFirm(firm, () => p.connect()) : await p.connect(); await c.query("begin"); c.release(); await sleep(300);
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const { WalledPool, withFirm } = await import("../api/src/platform/firm-scope.ts");
const { JsonLog, useLog } = await import("../api/src/platform/observability/log.ts");
const lines: string[] = []; useLog(new JsonLog((line) => { lines.push(line); }));   // review m2: the guard's own event, counted
const fired = (use: string) => lines.filter((l) => l.includes('"platform_pool_open_transaction"') && l.includes(`"${use}"`) && l.includes('"warn"')).length;
const pool = new WalledPool({ connectionString: URL, max: 1 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });
const watch = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) });   // another connection: what others see
try {
  await watch.$executeRawUnsafe("create table note(who text)");
  // Inside an open transaction the transaction started before this statement (xact_start < query_start).
  const firmNow = () => db.$queryRawUnsafe<{ f: string; intx: boolean }[]>("select current_setting('app.firm_id', true) f, (select xact_start is not null and xact_start < query_start from pg_stat_activity where pid = pg_backend_pid()) intx").then((r) => r[0]);
  const seen = () => watch.$queryRawUnsafe<{ n: number }[]>("select count(*)::int n from note").then((r) => r[0].n);

  // Firm A holds the only connection 3 s; a second transaction in firm A gives up after maxWait (1 s). Its start is sent
  // late (BEGIN), on the connection the first one returns, and dropped by release alone.
  const long = withFirm(A, () => db.$transaction(async (t) => { await t.$queryRawUnsafe("select 1"); await sleep(3_000); }, { timeout: 10_000 }));
  await sleep(100);
  const gaveUp = await withFirm(A, () => db.$transaction(async (t) => { await t.$queryRawUnsafe("select 1"); }, { maxWait: 1_000, timeout: 5_000 })).then(() => "ran", (e: Error) => e.message);
  await long; await sleep(300);
  const prismaLeaked = fired("destroyed") === 1;
  if (!prismaLeaked) await leakByHand(pool, A);
  console.log(`note: the leak came from ${prismaLeaked ? "Prisma's late BEGIN (maxWait)" : "a hand-made checkout, BEGIN, release (this Prisma sends no late BEGIN)"}`);
  ok("set-up: the second transaction gave up waiting for the connection (Prisma's maxWait)", gaveUp !== "ran" && /transaction|timeout|wait/i.test(gaveUp), gaveUp);
  ok("pass (review m2): the guard fired on that leak (one warn line, \"destroyed\"), so the cases below test the guard, not luck", fired("destroyed") === 1, { destroyed: fired("destroyed") });

  // (1) firm B writes on the next checkout; a later change in firm B is refused and rolls back.
  const b1 = await withFirm(B, firmNow);
  ok("P1 fail: firm B's next query is not inside a transaction left open by someone else", b1.intx === false, b1);
  await withFirm(B, () => db.$executeRawUnsafe("insert into note values ('firm B: a write that answered success')"));
  const visible = await seen();
  ok("P1 fail (1): a write that answered success is seen by every other connection at once (committed)", visible === 1, { visible });
  await withFirm(B, () => db.$transaction(async (t) => { await t.$queryRawUnsafe("select 1"); throw new Error("a refused change"); })).catch(() => undefined);
  const kept = await seen();
  ok("P1 fail (1): a later refused change does not take firm B's earlier write with it (it stays: 1 row)", kept === 1, { kept });

  // (2) firm B's next query runs in firm B.
  const b2 = await withFirm(B, firmNow);
  ok("P1 fail (2): firm B's next query runs as firm B (app.firm_id), never as firm A", b2.f === B, { asked: B, ranAs: b2.f });

  // (3) Lead B 5: the same leak from a bypass-role use. The late transaction's checkout ran unscoped (this process's
  // "direct" default: the bypass role, set on the session before its BEGIN); after firm B's checkout inside that open
  // transaction and a refused change, the rollback restores the bypass role while the tag still says firm B.
  {
    const pool2 = new WalledPool({ connectionString: URL, max: 1 }), db2 = new PrismaClient({ adapter: new PrismaPg(pool2) });
    try {
      const who = () => db2.$queryRawUnsafe<{ f: string; r: string; u: string }[]>("select current_setting('app.firm_id', true) f, current_setting('role') r, current_user::text u").then((r) => r[0]);
      const hold = withFirm(A, () => db2.$transaction(async (t) => { await t.$queryRawUnsafe("select 1"); await sleep(3_000); }, { timeout: 10_000 }));
      await sleep(100);
      const late = await db2.$transaction(async (t) => { await t.$queryRawUnsafe("select 1"); }, { maxWait: 1_000, timeout: 5_000 }).then(() => "ran", (e: Error) => e.message);
      await hold; await sleep(300);
      if (fired("destroyed") === 1) await leakByHand(pool2);   // unscoped checkout: the bypass-role default, as the late transaction's
      await withFirm(B, who);
      await withFirm(B, () => db2.$transaction(async (t) => { await t.$queryRawUnsafe("select 1"); throw new Error("a refused change"); })).catch(() => undefined);
      const b = await withFirm(B, who);
      ok("pass (review m2): the guard fired on the bypass-role leak too", fired("destroyed") === 2, { destroyed: fired("destroyed") });
      ok("P1 fail (3): after a leaked bypass-role use, firm B's next query runs as firm B with no role, never as the bypass role", late !== "ran" && b.f === B && b.r !== "xr_staff_bypass" && b.u !== "xr_staff_bypass", { late, b });
    } finally { await db2.$disconnect().catch(() => {}); await pool2.end().catch(() => {}); }
  }

  // The pool's own rule, on its clients directly: idle back → kept; inside a transaction or a failed one → removed.
  const q = async (c: { query: (t: string) => Promise<{ rows: Record<string, unknown>[] }> }) => (await c.query("select pg_backend_pid() p, current_setting('app.firm_id', true) f, (select xact_start is not null and xact_start < query_start from pg_stat_activity where pid = pg_backend_pid()) intx")).rows[0];
  const c1 = await withFirm(A, () => pool.connect()); const r1 = await q(c1); c1.release();
  const c2 = await withFirm(A, () => pool.connect()); const r2 = await q(c2);
  ok("pass: a client released idle stays in the pool (the same connection is handed out again)", r1.p === r2.p, { r1, r2 });
  await c2.query("begin"); c2.release();
  ok("fail (release guard): a client released inside a transaction leaves the pool at once, never kept idle for the next caller", pool.totalCount === 0 && pool.idleCount === 0, { total: pool.totalCount, idle: pool.idleCount });
  const c3 = await withFirm(A, () => pool.connect()); const r3 = await q(c3).catch((e: Error) => ({ error: e.message }) as Record<string, unknown>);
  ok("fail: a client released inside a transaction leaves the pool (a new connection, no open transaction, its firm set again)", r3.p !== r2.p && r3.intx === false && r3.f === A, { r2: r2.p, r3 });
  // M1: no query after a checkout's ROLLBACK, so the failed-transaction case takes its own checkout.
  await c3.query("rollback").catch(() => undefined); c3.release();
  const c3e = await withFirm(A, () => pool.connect()); await c3e.query("begin"); await c3e.query("select 1/0").catch(() => undefined); c3e.release();
  const c4 = await withFirm(B, () => pool.connect()).catch((e: Error) => e);   // main: the checkout itself fails (set_config in an aborted transaction)
  const r4 = c4 instanceof Error ? { error: c4.message } as Record<string, unknown> : await q(c4).catch((e: Error) => ({ error: e.message }) as Record<string, unknown>);
  if (!(c4 instanceof Error)) { await c4.query("rollback").catch(() => undefined); c4.release(); }
  ok("fail: a client released in a failed transaction ('E') leaves the pool too, and the next checkout runs in its own firm", !("error" in r4) && r4.p !== r3.p && r4.f === B && r4.intx === false, { r3: r3.p, r4 });
  // The checkout guard alone (Lead B 5): a client used after its release (BEGIN sent on a handle already back in the
  // pool, idle when it was released) is caught at the next checkout: destroyed, and another connection handed out.
  const c5 = await withFirm(A, () => pool.connect()); const r5 = await q(c5); c5.release();
  await c5.query("begin");   // a misuse after release: the pooled client is now inside a transaction
  const c6 = await withFirm(B, () => pool.connect()).catch((e: Error) => e);
  const r6 = c6 instanceof Error ? { error: c6.message } as Record<string, unknown> : await q(c6).catch((e: Error) => ({ error: e.message }) as Record<string, unknown>);
  if (!(c6 instanceof Error)) c6.release();
  ok("fail (checkout guard): a pooled client found inside a transaction at checkout is destroyed and another handed out, in its own firm, outside any transaction", !("error" in r6) && r6.p !== r5.p && r6.f === B && r6.intx === false, { r5: r5.p, r6 });
  ok("pass (review m2): the checkout guard's case fired its own event", fired("destroyed-at-checkout") >= 1, { atCheckout: fired("destroyed-at-checkout") });

  // Review m1: a BEGIN sent and not yet answered reads 'I' (pg updates the state only on the server's answer); the
  // release guard also needs nothing in flight. The released client must not be handed to firm B inside that BEGIN.
  // Firm B is already waiting for the pool's one connection, so pg-pool hands it over the moment it is released.
  const c7 = await withFirm(A, () => pool.connect()); const r7 = await q(c7);
  const waiting = withFirm(B, () => pool.connect()).catch((e: Error) => e);
  await sleep(50);
  const begun = c7.query("begin").catch(() => undefined); c7.release();   // destroyed with it in flight: "Connection terminated"
  const c8 = await waiting; await begun;
  const r8 = c8 instanceof Error ? { error: c8.message } as Record<string, unknown> : await q(c8).catch((e: Error) => ({ error: e.message }) as Record<string, unknown>);
  if (!(c8 instanceof Error)) c8.release();
  ok("fail (review m1): a client released with its BEGIN still unanswered is destroyed; firm B gets a fresh connection outside any transaction", !("error" in r8) && r8.p !== r7.p && r8.f === B && r8.intx === false, { r7: r7.p, r8 });

  // Review m5: every pooled client dirty → after one retry the checkout fails (fail closed), and the pool recovers after.
  const pool3 = new WalledPool({ connectionString: URL, max: 2 });
  try {
    const [d1, d2] = [await withFirm(A, () => pool3.connect()), await withFirm(A, () => pool3.connect())];
    d1.release(); d2.release(); await d1.query("begin"); await d2.query("begin");   // both misused after release
    const both = await withFirm(B, () => pool3.connect()).then((c) => { c.release(); return "handed out"; }, (e: Error) => e.message);
    const next = await withFirm(B, () => pool3.connect()); const rn = await q(next); next.release();
    ok("fail (review m5): with every pooled client inside a transaction the checkout fails after one retry, never hands one out; the next checkout opens a clean one", /inside a transaction/.test(both) && rn.f === B && rn.intx === false, { both, rn });
  } finally { await pool3.end().catch(() => {}); }
} finally {
  await db.$disconnect().catch(() => {}); await watch.$disconnect().catch(() => {}); await pool.end().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
