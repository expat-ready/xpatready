# Review: P1 pool fix (PR #3428), head a4365b0ac50c5b1a6f13c99b30fb84d5cc11443f

Fresh reviewer, 24 Nov. I read the diff (`git diff origin/main...a4365b0ac`), pg 8.22.0 `lib/client.js`, pg-pool 3.14.0 `index.js`, @prisma/adapter-pg 7.8.0 `dist/index.mjs`, and Prisma's `transaction-manager.ts` (from `@prisma/client/runtime/client.js.map`). Everything ran on scratch databases on :54329. I used no port and did not touch the :4400 demo.

**Verdict: Ship after fixes.** The logic is correct and closes all three P1 effects. One CI-breaking type error has to be fixed before the PR can be marked ready.

## What I ran
| Check | Result |
|---|---|
| `npx tsx --tsconfig api/tsconfig.json tests/check_pool_tx_return.ts` on the branch | **11 passed, 0 failed** |
| The same with origin/main's `firm-scope.ts` swapped in (restored afterwards; `git status` clean) | **2 passed, 9 failed, exit 1**: the lost write (0 rows), B ran as A, B ran as `xr_staff_bypass`, and all three guard cases |
| Release guard disabled alone (`if (false)` at :479) | 10/1: only "release guard" fails |
| Checkout guard disabled alone (`if (true) return c` at :494) | 10/1: only "checkout guard" fails |
| `tests/check_pf12_walls.ts` on the branch | 110 passed, 0 failed. `platform_pool_open_transaction` fired 0 times, so no legitimate path trips the guard |
| `node product/tools/typecheck.mjs --project api=…` (CI job "types") | **FAIL: 2 new type errors** (B1) |
| Scratch probe `race.mts`: BEGIN still in flight at release and at checkout | The guard misses it (m1) |

## Correctness notes (verified, no finding)
- **pg `_txStatus`.** It is set only in `_handleReadyForQuery` (client.js:385). It is null until the first ReadyForQuery, and pg-pool only hands out clients that have connected, so a fresh client reads 'I'. While a query is running it keeps the previous ReadyForQuery's value. So 'I' means "idle as of the last answer", not "nothing sent".
- **Wrapping `release` per checkout composes with pg-pool.** `_acquireClient` sets a fresh `_releaseOnce` on every checkout (index.js:342), and the wrapper captures that one. A double release still throws, because the second call reaches the same release-once. `release(true)` and the adapter's `conn.release(error)` are passed through as an error, so the client is destroyed. The checkout guard calls pg-pool's own release before the wrapper is installed, which is correct.
- **Callers.** The `query()` override, adapter-pg (`PgTransaction.commit/rollback` and `startTransaction`'s catch call `this.client.release`, a property lookup, so they hit the wrapper) and the callback form of `connect` (`done` → `c.release(r)`) all go through it.
- **Prisma paths.** A late start reaches `tx.rollback()` only after BEGIN has been answered (transaction-manager.ts:179), so the status is 'T' and the guard catches it. A failed ROLLBACK goes through `finally rollback()` with 'T' or 'E': destroyed. A failed COMMIT leaves the server at 'I'.
- **Retry.** `idle(1)` checks out at most twice, then throws. It is bounded; the recursion depth is 2.
- **Deliberate release inside a transaction.** None. All 8 advisory locks in `api/src` are `pg_advisory_xact_lock` inside `$transaction`. There is no LISTEN, COPY, cursor, session lock or raw BEGIN on the pool. Savepoint rollbacks happen inside transactions.
- **Startup check.** It runs at module load (firm-scope.ts:473). If a future pg kept the method but stopped updating the status (null), checkouts would be destroyed and then fail: that fails closed, as an outage rather than a leak.

## Blockers
- **B1: the PR's own code fails CI's type check.** `firm-scope.ts:479` and `:494` give `TS2339: Property 'getTransactionStatus' does not exist on type 'Client'`. @types/pg 8.20 does not declare the method, and neither error is in `typecheck-known.txt`. `typecheck.mjs` exits 1 ("2 new type error(s)"). The "types" job was skipped only because the PR is a draft, so it goes red when the PR is marked ready, and the PR cannot merge. **Fix:** add one narrow local type and use it at all three sites (:473, :479, :494), for example `type TxStatus = { getTransactionStatus(): "I" | "T" | "E" | null }` and `const txStatus = (c: object) => (c as unknown as TxStatus).getTransactionStatus();`. Then rerun `typecheck.mjs`.

## Majors
None in this diff. Not this PR's to fix: the breaker's M1 (`break-report.md`) is real and also on main. When a transaction's `timeout` fires during a multi-statement plan, the plan's next statement is sent after the ROLLBACK, on a released client that reads 'I'. That needs its own row, as the breaker says.

## Minors
- **m1: the checkout guard misses a BEGIN that is still in flight.** At `firm-scope.ts:494` (and :479) only the status is read. I reproduced it twice in `race.mts`. A client is released idle, `c.query("begin")` is sent without waiting, then firm B checks out. The status reads 'I' at B's checkout, and B's `set_config` and insert run inside that transaction ("INSERT 1" answered). At B's release the status is 'T', so the client is destroyed and **B's write is lost** (0 rows; the same through `pool.query`). The firm wall holds: B ran as B. It is reachable only by misusing a released client, and no `api/src` code does that. But it falls short of the PR body's claim that the checkout guard catches "a client used after its own release". **Fix:** treat a busy client as not idle in both guards, with `getTransactionStatus() === "I" && c.readyForQuery === true && c._queryQueue.length === 0`. Add those fields to the load-time check, and add a test case with the BEGIN not awaited (copy test :93 without the `await`).
- **m2: the effect cases do not prove the guard fired.** At `tests/check_pool_tx_return.ts:42` and `:67`, set-up only asserts that the late transaction gave up. If a Prisma change stopped the late BEGIN, cases (1) to (3) would still pass on the branch while exercising nothing. They are red on main today, so they are not vacuous now. **Fix:** after set-up, assert one `platform_pool_open_transaction`/`destroyed` event (capture it with `useLog`), or count pool `remove` events, so the case fails if the leak path stops being exercised.
- **m3: the log level is too low for an incident event.** At `firm-scope.ts:479` and `:496`, `logPort.info` goes to stdout. Each event means a start passed `maxWait` (a full pool) or a client was misused. **Fix:** `logPort.warn` (stderr), as Lead B's comment also says.
- **m4: one shared error object.** At `firm-scope.ts:472` and `:497`, `NOT_IDLE` is created once at load. Its stack points to module load, and it is thrown as is to the caller whose checkout failed. **Fix:** create a new `Error` at each throw or release, keeping the same message.
- **m5: the exhaustion branch has no test.** The second destroy then throw at `firm-scope.ts:497` is never run. **Fix:** add a case with max: 2 and two misused clients, asserting that the checkout rejects and the pool is left empty.
- **m6: the PR body's main count is stale.** It says "2 passed, 7 failed" on origin/main; the current test gives 2 passed, 9 failed. The "wider suites: results in the next comment" comment has not been posted. **Fix:** update the body and post the suite results.

## Not applicable or not checked
- **Journey test (reviewer role): N/A, no score.** The change has no screen, route, words or demo step ("nothing visible"), so there is no persona journey to walk. No journey report was written; the evidence is the runs above.
- **D1 to D20 and BIC-01 to BIC-20:** N/A (platform runtime, no UI). `MODULE.rows/P1-pool.md` follows the row format (Entry points / Tests).
- **Not run:** the other wider suites (`pf4_identity`, `pf4b_session_reads`, `pf11c_close`, `pf4r_lockout_race`) and the full CI.

Reviewer: Changes a4365b0ac50c5b1a6f13c99b30fb84d5cc11443f

Verdict: Changes a4365b0ac50c5b1a6f13c99b30fb84d5cc11443f
