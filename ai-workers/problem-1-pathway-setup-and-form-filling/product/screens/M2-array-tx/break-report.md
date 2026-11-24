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
