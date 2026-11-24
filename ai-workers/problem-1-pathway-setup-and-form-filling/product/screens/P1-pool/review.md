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

# Round 2, head df7e5d15d89c4a13f9545140311f31e2c0ed2759

Fresh reviewer, 24 Nov. I read `git diff a4365b0ac..df7e5d15d` (code only), pg 8.22.0 `client.js` and `query.js`, pg-pool 3.14.0 `index.js` and adapter-pg 7.8.0 `PgTransaction`/`startTransaction`. Everything ran on scratch databases on :54329. I used no port and did not touch :4400. Each mutation was made in place and then restored from a copy (same sha1 a3166ec2; `git status` clean at the end).

## What I ran
| Check | Result |
|---|---|
| `check_pool_tx_return.ts`, 3 runs | **16 passed, 0 failed, exit 0** each time (the exact `=== 1` / `=== 2` event counts did not flake) |
| The same with origin/main a26e80b6a's `firm-scope.ts` | 2 passed, 14 failed, exit 1 (matches the PR comment) |
| `typecheck.mjs` (it needed 11 GB of heap; at 6 GB tsc ran out of memory before checking any file) | **PASS: no new type errors (15 known, 0 fixed)**. B1 is fixed |
| `check_pf12_walls` / `pf4b_session_reads` / `pf11c_close` | 110/0, 55/0, 47/0. `platform_pool_open_transaction` fired 0 times in all three |
| `pf4r_lockout_race` | Not run: it needs a running isolated copy (`isolated.sh pf4r 4421`) |

## Each round-1 item, and whether its test fails without its fix (mutations)
| Item | Fixed? | Mutation, then result |
|---|---|---|
| B1 | Yes. A local `PgState` type at all three sites | typecheck PASS (above) |
| m1 | Yes, in both guards (`idleNow`: 'I', no active query, empty queue) | `idleNow` back to status only: **15/1**, only "review m1" fails (r8 is the same pid with intx true). **But** only the release half back to status only: 16/0. Only the checkout half back to status only: 16/0. See m7 |
| m2 | Yes. The guard's own `warn` line is counted after set-up, case 3 and the checkout case | Release guard off: 13/3 (both "destroyed" counts and "release guard" fail). Checkout guard off: 13/3 |
| m3 | Yes, `logPort.warn` at both sites | Back to `info`: 13/3 (the three m2 counts fail, because `fired` requires `"warn"`) |
| m4 | Yes. `notIdleError()` builds a fresh error at every release and throw | Code read. It cannot be tested from outside, and that is fine |
| m5 | Yes | `idle(1)` changed to `idle(2)`: 15/1, only "review m5" fails ("handed out"). Checkout guard off: it fails too |
| m6 | In part. The 07:16 PR comment gives 2/14 and 16/0 and the wider suites | The PR **body** still says "2 passed, 7 failed" and "11 passed" and "results in the next comment" |

## The new questions asked
- **Does reading `_getActiveQuery()` / `_queryQueue` misfire on a legitimate release? No.** pg clears `_activeQuery` before it calls the query's callback, both at ReadyForQuery (client.js:383-388) and on an ErrorResponse (client.js:432). So any release made in or after a callback sees nothing in flight. That covers adapter-pg (`commit`/`rollback`/`startTransaction`'s catch release only after an awaited statement), `WalledPool.query()` (releases after `await c.query`), and the callback form `connect(cb)`/`done()`. pg-pool's own releases (a timed-out pending item, maxLifetime, `verify`, a connect-hook error) call pg-pool's raw release-once, never the wrapper: the wrapper is installed only in `WalledPool.connect`'s `.then`, and pg-pool replaces `client.release` at every `_acquireClient` (index.js:342), so wrappers do not stack. `api/src` has no direct `pool.connect()`/`release()` and sets no `query_timeout`. I checked this with a scratch probe of 10 release paths (`scratchpad/probe/misfire.ts`). There were 0 guard events for: `pool.query` ok, a caught error outside a transaction then a plain release, an error inside a transaction then ROLLBACK then release, concurrent queries then release, and callback connect plus `done()`. Two paths destroy, and both are correct or fail closed (n2).
- **Load-time check.** It covers `getTransactionStatus` and `_getActiveQuery` on the prototype. `_queryQueue` is an instance field, so the check cannot see it. If it were renamed, `idleNow` would always be false: every checkout would be destroyed twice and then refused. That fails closed, but as an outage found at the first checkout rather than at load (n1).
- **`useLog` capture.** It is sound. `logPort` reads the module's `current` on every call, so the `JsonLog` sink set before the pool is built gets every line. `"destroyed"` with its quotes does not match `"destroyed-at-checkout"`. The `"warn"` filter makes the counts check m3 as well. The logger is not restored, which is harmless in a one-shot process. Every other log line is swallowed too, so a failing run prints no pool or log errors (a nit only).
- **The restructured m1 case** (firm B already waiting, then `c7.query("begin")` and `c7.release()` in the same tick). It is deterministic: the BEGIN is submitted at once, so `_activeQuery` is set when `release()` runs. The client is destroyed and its BEGIN fails with "Connection terminated" (caught). pg-pool's `_remove` then pulses the queue and opens a new client for B. The assertion (another pid, firm B, not in a transaction) is right. It does not prove which guard caught it, though (m7).

## Blockers
None. B1 is fixed.

## Majors
None. The breaker's M1 is ruled its own row (Lead 24) and is not judged here. Lead B's `readyForQuery === true` Minor is routed to the M1 row by the Lead, so I do not raise it again.

## Minors (none blocks)
- **m6 (still open in part): the PR body's counts are stale.** Fix: set the body's checks to 2/14 on main and 16/0 here, and point to the 07:16 comment for the wider suites.
- **m7: each guard's in-flight half has no test of its own.** The m1 case is caught by either half, so taking the in-flight check out of the release guard alone, or out of the checkout guard alone, still passes 16/0. The comment at the test's m1 case says "the release guard also needs nothing in flight", but nothing pins that. Fix: add round 1's original scenario for the checkout half (release idle with no waiter, then `c.query("begin")` not awaited, then a checkout must get another pid outside a transaction). For the release half, assert `fired("destroyed")` went up by one in the existing m1 case, because with only the release half gone the event comes from `destroyed-at-checkout` instead.

## Notes (no change asked)
- **n1:** the load-time check could also test `Array.isArray(new pg.Client()._queryQueue)` (a client that is never connected costs nothing), so that a pg rename stops the load instead of refusing every checkout.
- **n2: destroys that fail closed, and the event's wording.** (a) A deferred-constraint COMMIT failure, caught and then released plainly, was destroyed with a `destroyed` warn in 1 of 2 runs. At release the state was 'T', with no active query and `readyForQuery` false: the ErrorResponse had been handled and the ReadyForQuery had not yet arrived. Round 1's status-only check had the same lag. Deferrable constraints do exist (`fo9b_person_merge`, `fo5_retainer_tables`, `r1d_none_apply`), so a COMMIT that fails this way can log a false alarm and close one connection. Nothing leaks. (b) A bind error in `toPostgres`, released plainly: pg has sent Close+Sync and not yet had its answer (`_activeQuery` is still set), so destroying it is right. Either way the event name and the error text say "inside a transaction", while the client may only be busy. Consider "not idle".

## Not applicable
Journey test (reviewer role): **N/A, no score.** There is no screen, route, words or demo step, so there is no persona journey and no journey report was written. The same goes for D1-D20 and BIC-01 to BIC-20.

Reviewer: Approve df7e5d15d89c4a13f9545140311f31e2c0ed2759

Verdict: Approve df7e5d15d89c4a13f9545140311f31e2c0ed2759
