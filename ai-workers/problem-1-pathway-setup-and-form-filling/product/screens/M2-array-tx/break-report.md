# M2 (array batches through the app's client): break report, 24 Nov

Head 4461c363b (PR #3441, stacked on #3428 d33cb8de8). This is a fresh adversarial pass by a breaker who did not build the fix.

**Setup.** One scratch database, `xr_studio_m2brk_full`, was built from every migration (97 policies). It held 60 firms in `platform_firm` and an RLS-forced note table (one secret row per firm, policy `firm_id = platform_session_firm()`). The scratch database is dropped now.

**Client under test.** The client is the app's own `core.ts` `Db` (WalledPool + `oneQueryPerCaller`), run with `wallUnscopedQueries()` as the API server does.

**A pre-M2 baseline.** The same client was built with only the old `batchBy` part, labelled "base" below.

**Scripts.** All in `/tmp/claude-0/-home-user-xpatready/7029c33d-8336-515e-8076-68f159ec99da/scratchpad/m2brk/` (h.ts, a1–a6.ts). Run them from studio/ with `NODE_PATH=$PWD/node_modules npx tsx --tsconfig api/tsconfig.json <script>`. No network, no model call.

## Findings

**B1: Blocker. The override drops `this`, so every nested `tx.$transaction(fn)` becomes a separate top-level transaction on another connection.**
- **Where:** `api/src/platform/firm-scope.ts:544-547`, which uses `c.$transaction.bind(client)` with an arrow function.
- **Why it breaks:** in Prisma 7.8 an interactive-transaction client keeps `$transaction`. Its deny list is only `$connect, $disconnect, $on, $use, $extends`, and nested calls become savepoints (`_transactionWithCallback` reads `this[scope]` to see that it is nested). The wrapper always calls the base client, so `Ql(this)` sees "top-level".
- **Repro a2.ts** (`MODE=base` vs `MODE=m2`), base / head:
  - Nested call on the outer's backend pid: yes / **no** (28491 vs 28492).
  - Inner write rolled back when the outer fails: yes / **no, 1 row survives**.
  - Inner sees the outer's uncommitted row: 1 / **0**.
- **App paths that rely on nesting.** Each of these calls `"$transaction" in db ? db.$transaction(run) : run(db)`. That check is true for a tx client in Prisma 7.8, so with a tx they now open a second, independent transaction:
  - `settings.ts:188` writeSetting. It is called with `tx` by profile/service.ts:172 (several settings in one save), branding.ts:132, timings.ts:153, images.ts:56/65, demo-reset.ts:35 and keep-period/service.ts:45.
  - `library-changes.ts:148` decideChange. review-proposals.ts:168 calls it in a loop and promises "Nothing was approved … Every item of this decision still waits". Items decided before a failing one now stay decided.
  - `arrival-port.ts:100` (from :61 inside the booking-arrival tx) and `booking-seed.ts:50`.
- **Repro a3.ts:** the real `writeSetting(tx, …)` inside a caller's transaction, through `Db`.
  - **(b2) Outer fails after writeSetting:**
    - base: the value is rolled back.
    - head: the value **stays committed** (`kept: 1`) and its audit line is written.
  - **(b1) On a database with no `platform-audit` workspace yet:**
    - The outer's `platformAuditWorkspaceId(tx)` inserts the workspace (uncommitted).
    - The now-separate inner transaction's audit write waits on that unique key, while the outer waits on the inner.
    - base: 126 ms. head: **hangs until the outer's timeout (15,077 ms), then errors**. With the default 5 s timeout, the first demo reset or first settings save on a fresh database would fail this way.
- **Repro a4.ts:** a burst of 40 rounds × (60 firms + 2 bypass + 1 unscoped). One kind in six opens a nested transaction.
  - base: 0 errors in 4/4 runs.
  - head: **266 and 252 "Unable to start a transaction in the given time"** in 2 of 4 runs. Each nested call now holds a second pooled connection while its outer holds one (pool starvation).
- **Fix** (checked in a2.ts `MODE=fix`: same pid, rollback, visibility and extension all green):
  `const real = c.$transaction; c.$transaction = function (this: unknown, arg, opts) { return typeof arg !== "function" ? Promise.reject(new Error("M2: …")) : real.call(this, arg, opts); };`
  In words: keep the unbound method and call it with the receiver. Add a suite case to check_no_array_tx: nested `tx.$transaction` runs on the outer's pid and an inner write rolls back with the outer, plus writeSetting(tx) inside a failing outer leaves nothing.

**m1: Minor. The refusal tests `Array.isArray`, but Prisma only needs `.map` and `.length`.**
- **Repro a1.ts a1/a1b:** `$transaction({ length: 1, map: f => [f(p, 0)] } as never)`.
  - From firm B in the same tick as firm A, it **ran as firm A and read A's secret**.
  - In the same tick as a bypass use, it **ran as `xr_staff_bypass` and read all 60 firms**.
- **Reach:** only through a cast (Prisma's types demand an array), and no such code is in api/src.
- **Related:** an iterator (`arr.values()`, a generator) has `.map` in Node 22. Prisma's `Bl()` then waits on `length === undefined` and the promise **never settles** (a3, "HUNG"). Nothing in it runs, but the request hangs.
- **Fix:** refuse anything that is not a function (`typeof arg !== "function"`), as in B1's fix.

**m2: Minor. On a `$extends` client, the interactive transaction loses the extension.** The wrapper is inherited and bound to the base client. Repro a1.ts a4b: the query hook fires on a plain call, but not inside `ext.$transaction(fn)`. api/src has no `$extends`, so it cannot be reached today. B1's fix fixes it too (a2 `MODE=fix`).

**m3: Minor (note). The source check reads line by line.** A call written as `$transaction(` with `[` or `xs.map(` on the next line is not flagged (check_no_array_tx.ts:76-77). The run-time refusal still catches it, so this is only an early-warning gap. Fix: match on the whole file with `\s*` spanning newlines.

## What held
- **Array refusal.** A real array, `Proxy(array)`, an Array subclass, a frozen array, an extended client's array, and `tx.$transaction([...])` inside an interactive transaction are all refused before anything runs (a1 a0/a2/a4a/a5d). A Set fails with a TypeError and writes nothing (a3).
- **Burst on the head, 40 × 60 firms + bypass + unscoped.** About 15,000 checks across 6 runs on base and head, with **zero wrong-firm or wrong-role reads** (RLS-counted). The mix:
  - plain `$queryRaw`/`$executeRaw` outside transactions;
  - same-tick `findUnique` of own firm and another firm (own found, other null: merging stays off);
  - interactive transactions with `Promise.all` batches inside;
  - bypass interactive and plain calls;
  - unscoped calls (they read 0).
- **Interactive starts in one tick, pool of 1 and 2 (a6).** Six firms, a bypass use, an unscoped caller, and `asBypass` inside `withFirm(A)` each ran as their opener (90/90 per pool size). This held even though every start but one waited in pg-pool's queue and was handed a client released by another caller: WalledPool reads the scope at `connect()`, before awaiting. Prisma 7.8's start path (`TransactionManager.#r` → `adapter.startTransaction()` → `pool.connect()`) runs in the caller's async context.
- **Other clients.** No other PrismaClient sits over a WalledPool in api/src. The seven others (firms.ts:46, firm-created.ts:146, prospect-won.ts:230, firm-seed.ts:228, booking-seed.ts:119, sample-seed.ts:43, seed-sample-firms.ts:166) are start-up or CLI owner-role clients over a plain PrismaPg.
- **The four conversions behave as before (a5).**
  - case-prepare's shape (`$transaction(tx => Promise.all(read(tx)), { isolationLevel: "RepeatableRead" })`): three reads on one pid and one snapshot, with a concurrent committed insert seen by none. The read-committed control does see it.
  - The loop of writes used by edition-published, structure and studio, failing at the third write, leaves nothing.
  - Timeouts are as before: edition-published sets 30 s; structure and studio keep the defaults, as the array form did.
- **The PR's own suite.** `tests/check_no_array_tx.ts` passes 13/0 on the head.

Verdict: Block 4461c363b118b14f33444068b1ed8ddeeead5f43

## Round 2, 24 Nov: head 078ebab5d

**Scope.** The diff `4461c363b..078ebab5d` outside screens/. The wrapper (`firm-scope.ts:547-552`) now keeps its receiver (`transaction.call(this, …)`) and refuses any argument that is not a function. The source check now reads whole files.

**Setup.** As in round 1, but on new scratch databases, all dropped now:
- `xr_studio_m2brk2_full`: every migration (97 policies), 60 firms, and the RLS-forced `m2_note` table.
- `xr_studio_m2brk2_fresh`: the same, with no `platform-audit` workspace.

**Scripts.** Round-1 h.ts and a1–a6.ts are unchanged. New: r2.ts (`MODE=base|m2`) and r2b.ts, in the same scratch folder.

### Round-1 attacks re-run on the head
- **B1 is fixed (a1 a5/a5b/a5c, a2 `MODE=m2`).** Head now matches base on all of these:
  - a nested `tx.$transaction(fn)` runs on the outer's pid;
  - the inner write is rolled back with the outer;
  - the inner call sees the outer's uncommitted row (1);
  - an inner update of a row the outer locked returns in 5 ms.
- **Real `writeSetting(tx)` (a3):**
  - On the fresh database (b1), the outer creates the audit workspace and writeSetting(tx) completes in 153 ms (round 1: hung 15,077 ms).
  - When the outer fails afterwards (b2), the setting is not kept (`kept: 0`) and no audit line is added.
- **60-firm burst (a4, 4 runs × 40 rounds × 63 callers, one kind in six nested):** 2,520 checks per run, with **0 wrong-firm or wrong-role reads and 0 errors**. Round 1 had 266 and 252 "Unable to start a transaction" errors, so the pool starvation is gone.
- **m1 is fixed (a1 a1/a1b/a2/a3).** Each of these is now refused with the M2 message before anything runs:
  - an array-like `{length, map}` from firm B in the same tick as firm A, and in the same tick as a bypass use (round 1: it read A's rows, or all 60 firms);
  - a Proxy around an array, an Array subclass, a frozen array, a Set;
  - a generator, which no longer hangs.
- **m2 is fixed (a1 a4a/a4b).** The `$extends` client refuses arrays, and its query hook now fires inside `ext.$transaction(fn)`.
- **m3 is fixed.** A call broken over lines is caught by the new probe.
- **Unchanged and held:** the four converted call shapes (a5 c1/c2), and a6 (one-tick starts over pools of 1 and 2: 90/90 each).

### New attacks on the receiver-keeping shape (r2.ts, `MODE=base` and `MODE=m2` give identical results)
- **Three-level nesting.** One pid at every level and the firm is kept (r1a). The error matrix behaves exactly like savepoints (r1b):
  - L3 fails and L2 catches it: L1 and L2 are kept, L3 is gone.
  - L3 fails and L1 catches it: only L1 is kept.
  - L3 fails and nobody catches it: nothing is kept.
  - L2 fails and L1 catches it: only L1 is kept.
  - L1 fails: nothing is kept.
  - No failure: all five rows are kept.
  - This matches review-proposals.ts:168 (decideChange(tx) in a loop, then `fail(...)`), whose promise is "Every item of this decision still waits".
- **Concurrent nested savepoints in one transaction (r2a, r2b).** Prisma refuses the second concurrent one with "Concurrent nested transactions are not supported", on base and head alike. In 10 rounds × 60 firms, each running three parallel nested calls with one failing, there were 0 wrong-firm reads and no row under another firm's id. No refused or failed call left a row behind. All four nesting helpers (settings.ts:188, library-changes.ts:148, arrival-port.ts:100, booking-seed.ts:50) are called one at a time (`for … await`), so the app never runs nested calls concurrently.
- **Nesting from inside scopes.** Each case matches base:
  - r3a: `asBypass(() => tx.$transaction(fn))` inside firm A's transaction stays firm A, as `xr_app`, seeing only A's rows. The scope is not widened.
  - r3c: `withFirm(A, () => tx.$transaction(fn))` inside an unscoped transaction stays unscoped and reads 0 rows.
  - r3d: a root `db.$transaction` under `withFirm(B)` inside A's transaction gets its own connection, in firm B.
  - r3b: `withFirm(B, () => tx.$transaction(fn))` inside a bypass transaction runs on the bypass connection. This is the same for any query on that tx and the same as before M2, so it is not caused by this diff.
- **Receivers.** None of these runs outside the caller's transaction or scope. Every case matches base, except that only the head refuses the Proxy array:
  - r4b: `Object.create(db)` and `new Proxy(db, {})` run in the caller's firm, and a Proxy receiver's array is refused.
  - r4c: a closed transaction client (after commit, and after rollback) used from firm B is refused ("Concurrent nested transactions are not supported") and writes nothing.
  - r4d: `.call(tx)` nests, while `.call(db)` opens its own transaction, as a root call does.
  - r4e: an `$extends` client nested three levels keeps one pid and its hook fires.
  - r4f: an extended client's transaction client refuses arrays.
  - r4g: an inner call with `isolationLevel` runs on the outer's pid.
  - r4h: when the outer times out in the middle of a nested call, no nested row is kept.
  - r4a: a detached call (`const t = db.$transaction; t(fn)`) throws "Cannot read properties of undefined (reading '_engineConfig')", as plain Prisma does (round 1's `bind` let it work). Nothing in api/src, ports/ or engine/ detaches, `.call`s, `.apply`s or destructures `$transaction` (grep). This is not a finding.
- **Suite and types.**
  - `tests/check_no_array_tx.ts` passes 14/0 on the head.
  - With round 1's `bind` wrapper put back in a scratch copy, it fails the two B1 cases (12/2), so B1 is pinned.
  - `tsc` shows no error in api/src or the changed files.

### Findings
**m5: Minor. The suite does not pin m1.**
- **Repro:** in a scratch copy, change the guard back to `Array.isArray(arg)`. `check_no_array_tx.ts` still passes 14/0.
- **Why it matters:** the array-like, iterator and Set cases (the `typeof arg !== "function"` change) can regress without the suite noticing.
- **Fix:** add one case to check_no_array_tx: `$transaction({ length: 1, map } as never)` and `$transaction(arr.values() as never)` are refused and nothing in them runs.

No Blockers. No Majors.

Verdict: Approve 078ebab5dad1c6c939e0a7340e6e8121ba491175
