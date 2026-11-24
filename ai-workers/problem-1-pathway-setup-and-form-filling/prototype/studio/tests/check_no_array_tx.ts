// M2 (P1-pool round-2 break; Lead 24, 24 Nov, on #3428): Prisma's array batch, `$transaction([...])`, sent from two firms
// in the same tick runs as the first caller. Prisma dispatches every batch queued in one tick from one process.nextTick
// set up by the first request, and oneQueryPerCaller (firm-scope.ts) keeps Prisma's batching for transactions, so the
// second firm's batch checks out the pool in the first caller's scope. Ruling: no array batches through the app's client.
// The client built as core.ts's Db builds it (WalledPool, oneQueryPerCaller) refuses `$transaction([...])` at run time,
// and a source check fails a new one in api/src. Each case a pass and a fail, through row-level security as xr_app:
// firm against firm, bypass against firm, one batch after another firm's or a bypass job's interactive query in the
// same tick (Lead B 6), the refusal itself (nothing of a refused batch runs), interactive transactions
// still run in their own firms, and the source check. One scratch database; no browser, no server, no model call (US$0).
//   tsx studio/tests/check_no_array_tx.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, "..");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_noarraytx_scratch_${process.pid}`, OWNER = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, APP = `postgresql://xr_app@127.0.0.1:54329/${DB}`;
const A = "11111111-1111-4111-8111-111111111111", B = "33333333-3333-4333-8333-333333333333";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const psql = (q: string) => execFileSync(join(BIN, "psql"), [OWNER, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
psql(`create table note(firm_id uuid not null, body text not null);
  alter table note enable row level security; alter table note force row level security;
  create policy wall on note using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid);
  grant usage on schema public to xr_app, xr_staff_bypass; grant select, insert on note to xr_app, xr_staff_bypass;
  insert into note values ('${A}', 'A-secret'), ('${B}', 'B-secret');`);

const fs = await import("../api/src/platform/firm-scope.ts");
const pool = new fs.WalledPool({ connectionString: APP, max: 4 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });
fs.oneQueryPerCaller(db);   // as core.ts's Db does in its constructor
type Who = { f: string; u: string; seen: string };
const sel = "select current_setting('app.firm_id', true) f, current_user::text u, coalesce(string_agg(body, ',' order by body), '') seen from note";
const batch = () => db.$transaction([db.$queryRawUnsafe<Who[]>(sel)]).then((r) => r[0][0], (e: Error) => e);
const refused = (x: unknown) => x instanceof Error && /array|batch/i.test(x.message) && /\$transaction|transaction/i.test(x.message);
try {
  // (1) firm against firm, same tick.
  const [a1, b1] = await Promise.all([fs.withFirm(A, batch), fs.withFirm(B, batch)]);
  ok("M2 fail (firm against firm): firm B's array batch never runs as firm A (refused, or runs as B and reads only B's rows)", refused(b1) || ((b1 as Who).f === B && (b1 as Who).seen === "B-secret"), { a1: a1 instanceof Error ? a1.message : a1, b1: b1 instanceof Error ? b1.message : b1 });
  // (2) bypass against firm, same tick (this process's unscoped default is the bypass role).
  const [x2, b2] = await Promise.all([batch(), fs.withFirm(B, batch)]);
  ok("M2 fail (bypass against firm): firm B's array batch never runs as the bypass role and never reads firm A's rows", refused(b2) || ((b2 as Who).u === "xr_app" && (b2 as Who).seen === "B-secret"), { x2: x2 instanceof Error ? x2.message : x2, b2: b2 instanceof Error ? b2.message : b2 });
  // (1b), (2b) Lead B 6: one array batch is enough when another caller's interactive-transaction query comes first in the
  // same tick: firm A's (1b), or a bypass job's (2b; this process's unscoped default is the bypass role).
  const afterInteractive = (opener: (f: () => Promise<unknown>) => Promise<unknown>) => opener(() => db.$transaction(async (t) => {
    const [mine, theirs] = await Promise.all([t.$queryRawUnsafe<Who[]>(sel).then((r) => r[0]), fs.withFirm(B, batch)]);
    return { mine, theirs };
  })).then((r) => r as { mine: Who; theirs: Who | Error }, (e: Error) => ({ mine: null, theirs: e }));
  const r1b = await afterInteractive((f) => fs.withFirm(A, f));
  ok("M2 fail (firm A's interactive query first): firm B's one array batch in the same tick never runs as firm A", refused(r1b.theirs) || ((r1b.theirs as Who).f === B && (r1b.theirs as Who).seen === "B-secret"), { mine: r1b.mine, theirs: r1b.theirs instanceof Error ? r1b.theirs.message : r1b.theirs });
  ok("M2 pass (firm A's interactive query first): firm A's own query in its transaction runs as firm A", r1b.mine?.f === A && r1b.mine?.seen === "A-secret", r1b.mine);
  const r2b = await afterInteractive((f) => f());
  ok("M2 fail (a bypass interactive query first): firm B's one array batch in the same tick never runs as the bypass role", refused(r2b.theirs) || ((r2b.theirs as Who).u === "xr_app" && (r2b.theirs as Who).seen === "B-secret"), { mine: r2b.mine, theirs: r2b.theirs instanceof Error ? r2b.theirs.message : r2b.theirs });
  ok("M2 pass (a bypass interactive query first): the bypass job's own query runs as the bypass role", r2b.mine?.u === "xr_staff_bypass", r2b.mine);
  // (3) the refusal: the array form is refused before anything in it runs.
  const before = psql("select count(*) from note");
  const r3 = await fs.withFirm(A, () => db.$transaction([db.$executeRawUnsafe(`insert into note values ('${A}', 'A-batched')`)])).then(() => "ran", (e: Error) => e);
  ok("M2 fail (refusal): `$transaction([...])` through the app's client is refused, saying why, and nothing in it runs", refused(r3) && psql("select count(*) from note") === before, { r3: r3 instanceof Error ? r3.message : r3, before, after: psql("select count(*) from note") });
  // (4) interactive transactions from two firms at once still run, each in its own firm.
  const inter = (firm: string) => fs.withFirm(firm, () => db.$transaction(async (t) => (await t.$queryRawUnsafe<Who[]>(sel))[0]));
  const [a4, b4] = await Promise.all([inter(A), inter(B)]);
  ok("M2 pass: interactive transactions from two firms in the same tick each run in their own firm as xr_app", a4.f === A && a4.seen.split(",").includes("A-secret") && !a4.seen.includes("B-") && b4.f === B && b4.seen === "B-secret" && a4.u === "xr_app", { a4, b4 });
} finally {
  await db.$disconnect().catch(() => {}); await pool.end().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}

// (5) the source check: no array batch in api/src (a literal array, or `.map(...)` / a variable handed to $transaction).
const files: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p); } };
walk(join(STUDIO, "api", "src"));
const ARRAY_TX = /\.\s*\$transaction\(\s*(\[|[\w.$]+\s*\.\s*map\s*\(|\.\.\.)/;
const hits = files.flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => ARRAY_TX.test(l) && !/^\s*(\/\/|\*)/.test(l) ? `${f.slice(STUDIO.length + 1)}:${i + 1}` : "").filter(Boolean));
ok("M2 fail (source check): no `$transaction([...])` or `$transaction(xs.map(...))` in api/src", hits.length === 0, hits);
ok("M2 pass (source check): the check reads real code (it finds the interactive form in api/src)", files.some((f) => /\$transaction\(\s*async/.test(readFileSync(f, "utf8"))));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
