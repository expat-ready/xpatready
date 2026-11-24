# Review: M1 no query after a checkout's COMMIT or ROLLBACK (PR #3467), head 1167bcd46410285f81940e51643c806695978c19

Fresh reviewer, 24 Nov. Scope: `git diff 648adace4..1167bcd46` only (14 files). I read pg 8.22.0 `lib/client.js` (`_handleReadyForQuery`, `_handleErrorMessage`, `_pulseQueryQueue`, `query`, `end`), pg-pool 3.14.0 `release`/`_release`, @prisma/adapter-pg 7.8.0 (`performIO`, `PgTransaction`, `startTransaction`) and Prisma 7.8's transaction manager (`#d`: on timeout it awaits ROLLBACK, then `rollback()` → `release()`). Scratch databases were on :54329; the one isolated copy ran on runtime port :4431. I did not use :4400. My probes ran in scratchpad worktrees, and the main checkout is clean.

**Verdict: Approve** (screen-review: Ship). The guard closes M1 for every path that reaches the pool: Prisma's timeout, a callback that throws while `Promise.all` siblings are still sending, and the three `update: {}` upserts inside transactions. No app query is refused by mistake. All items below are Minor. **Journey score: 9/10, pass** (`journey-test-reviewer-2026-11-24.md`; UI criteria n/a).

## What I ran
| Check | Result |
|---|---|
| `tests/check_tx_end_guard.ts` at head | **16 passed, 0 failed** (4.4 s) |
| The same test at b96e20819 (#3441's code plus this test; the test file is identical at both commits) | **5 passed, 11 failed**. M1 `{"r1":"Connection terminated","parent":0,"child":1}`; all 7 guard forms "ran" (stored 1→7); Lead B 6 "current transaction is aborted"; m6 "Connection terminated", 0 rows; wording |
| `check_pool_tx_return.ts` / `check_no_array_tx.ts` | **16/0** and **14/0** |
| `tools/upsert-native.mts` | **23 lines: 17 NATIVE, 6 SPLIT** (every SPLIT is `update {}`). SITES equals `grep -rn '\.upsert(' api/src` at head, line for line (23). Tx and root placement of the 6 split upserts checked in the code: matches the PR table |
| Mutations (scratch worktree) | readyForQuery check removed → only the Lead B 6 case fails (15/1). Prepared-name memory removed → the name-only case fails (and 3 later cases cascade on the shared count). Drain wait removed → only m6 fails (15/1). Savepoint exclusion removed, or per-checkout reset removed → **the test hangs** instead of failing (m3) |
| `endsTransaction` on 37 edge strings | correct for upper/lower case, `WORK`/`TRANSACTION`, leading `--` and `/* */` comments, `select 1; commit`, savepoint forms (`ROLLBACK [WORK|TRANSACTION] TO`), `COMMIT/ROLLBACK PREPARED`, DO and `$fn$` bodies with `END IF`, quoted `'commit; end'`, `"end"`, `case … end`, `select commit from t`, `$1` placeholders. Wrong on 4 strings no app code sends (m4) |
| Every string or template literal containing commit/rollback/end/abort in `api/src`, `engine`, `ports` (TypeScript scanner, 66 candidates) | **no SQL false positive**. The 10 hits are event names and words (`"end"`, `"abort"`, `END:VEVENT`, `"End must be after start."`) |
| Raw pool users | Only adapter-pg (one `release` per checkout) and `WalledPool.query` reach `WalledPool`; there is no `pool.connect()` caller in `api/src`. pg-boss has its own pool; `tools/demo-dump.mjs` has its own `Client`. The only raw transaction words in app SQL are `rollback to savepoint` (3 sites), which the guard does not count |
| Probes on the drain wait | release while the statement runs, then `pool.end()` → resolves when the statement ends (1.5 s). A 12 s statement → caller "Connection terminated" at 10.02 s, `destroyed-unsettled`, pool empty. Backend killed during the wait → error, pool empty, no hang. A BEGIN sent after release during the wait → destroyed, never handed out |
| Call sites of (f), isolated copy :4431 (head) and :4432 (648adace4) | `check_c41_section_order` **32/32**; `check_bk17_keep_recorded` **25/25**; `check_w1_structure` **81/81** twice at head, once of them under load next to the base copy (base 81/81 twice). The first head run, under heavy load (my `tsc` and another session's mutation runs), failed 4 (a rename "not in the Structure", M5, C11.10 B1, a TypeError on `delete`). Not reproduced, and its log was overwritten |
| Type check `tsc -p api/tsconfig.json --noEmit` | 15 errors, **none in a file of this diff** (all in other tests, e.g. `check_vv_checklist.ts`, `check_x2b_bulk_apply.ts`) |

## Answers to "check hard"
- **False positives:** none in app code (scan above). DO blocks, dollar-quoted function bodies (`END IF`), string literals and identifiers are stripped or never start a statement. `COMMIT AND CHAIN` counts as an end (conservative, m4).
- **False negatives:** `ROLLBACK WORK`, `COMMIT TRANSACTION`, any case, leading comments: all caught. `PREPARE TRANSACTION` is missed (m4).
- **pg signatures:** string+values, config, config.callback and a trailing callback all work (refusal reaches the callback on nextTick, probed). adapter-pg's `query({text, values, rowMode, types, name: undefined}, values)` is read by `cfg.text`. A Submittable is not handled (m2).
- **Once per client, state per checkout:** `GUARDED` wraps once; `ENDED` resets in `connect()` before `set_config`; `END_NAMES` correctly survives (prepared statements live on the connection).
- **Drain wait:** no lost client (drain, `end` and the 10 s timer each settle once; pool.end() waits at most 10 s). The wrapper cannot double-release by itself, but a caller's second release is no longer thrown at the call site; it is thrown later from pg's handler (m1).
- **20 ms deferral:** fair. In pg 8.22 `_handleErrorMessage` clears `_activeQuery` and calls the callback before ReadyForQuery. Without the delay, the checkout's own idle test (Lead B 5) would see 'E' within the same socket read and hide the bug, so the delay is what a ReadyForQuery arriving in a later read does.
- **upsert-native list:** trustworthy at this head (complete, counts reproduced). Each site is modelled by shape (empty vs non-empty `update`, an auto-picked field), not run as written. No site has nested writes or `include`. `put` in form-library/lines-bulk is a full row, so it is never empty. Drift risk: m6.
- **Reuse after COMMIT/ROLLBACK:** none in `api/src`, `engine`, `ports` or in-app tools. Prisma releases right after COMMIT/ROLLBACK.

## Blockers
None.

## Majors
None.

## Minors
- **m1 (Should). A caller's second release during the drain wait crashes the process** (`api/src/platform/firm-scope.ts:492-500`). The busy branch returns without marking the checkout released. A second `release()` sets up a second wait, and `release(); release(err)` releases at once and leaves the listeners in place. When `drain` or `end` fires, pg-pool's "Release called on client which has already been released" is thrown inside pg's socket handler. Probed: `UNCAUGHT` both ways, and `api/src` has no `uncaughtException` handler. Before this PR the same misuse threw synchronously to the caller. No app path reaches it today (adapter-pg and `WalledPool.query` release once). Fix: a `released` flag per checkout, set on the first call (a later call throws synchronously as pg-pool does). Also wrap the deferred `release(...)` calls in try/catch with a warn line.
- **m2 (Should). A refused Submittable gets a rejected Promise** (`firm-scope.ts:525-529`). pg returns the Submittable itself; the wrapper returns `Promise.reject`, which nobody holds, so Node 22 reports an unhandled rejection (probed) and exits by default. There is no pg-cursor or pg-query-stream in the app. Fix: when `typeof cfg.submit === "function"`, call `cfg.handleError(err)` on nextTick and return `cfg`.
- **m3 (Should). Two guard mutations hang the test instead of failing it** (`tests/check_tx_end_guard.ts:70-84`, `:126-128`). Removing the savepoint exclusion, or the reset at checkout, makes an un-caught refused query escape while a checkout is held. `pool.end()` in `finally` then waits forever (I stopped it at 40 s and 60 s). Fix: `.catch` and release in the keep and forms cases, or race `pool.end()` against a short timer. The 10 s timer and `end` paths have no case; my probes show they work. Optional: make `RELEASE_SETTLE_MS` injectable and pin `destroyed-unsettled`.
- **m4 (Should). State the parser's limits in the doc comment** (`firm-scope.ts:505-514`). `PREPARE TRANSACTION` ends the transaction but is not counted. `COMMIT/ROLLBACK AND CHAIN` are counted, so a later query in the chained transaction is refused, and the refusal text "it would run outside the transaction" is then wrong. `E'it\'s; commit'`, nested `/* /* */ */` and `'$$'` inside a string are mis-read. None is sent by Prisma or the app (scan above). Either add `prepare\s+transaction` to the regex and exclude `and chain`, or name these in the comment and the MODULE row.
- **m5 (Should). CodeQL is red on this head**: 2 "high, incomplete string escaping" at `tests/check_no_array_tx.ts:118` (`arg.replace(/\$/g, "\\$")` in `new RegExp`). The input is already limited to `[A-Za-z_$][\w$]*`, so it is not exploitable, but the check blocks the merge. Fix: use a full escape, `arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`.
- **m6 (Should). `upsert-native.mts` can drift** (`tools/upsert-native.mts:21-45`). SITES is written by hand. Lead 25 keeps it to check a Prisma upgrade, but a new `.upsert(` would be silently missing. Fix: compare SITES' `file:line` set with a scan of `api/src` and exit 1 on any difference.
- **m7 (Could). The source check misses two forms**: a typed variable, `const ops: P[] = xs.map(...)`, and a cast, `$transaction(xs.map(...) as never)` (`tests/check_no_array_tx.ts:116-118`; both probed false). The run-time refusal still stops both. Fix: allow `(:[^=]+)?` before `=`, and allow a trailing `as …`.
- **m8 (Could). Per-checkout reset leaves the use-after-release window unnamed** (`firm-scope.ts:517`). The guard is keyed on the client object. A holder that sends after the client went to the next caller is not refused. Prisma does not reach this: its next statement goes out in microtasks before the ROLLBACK's answer, and later calls hit "Transaction already closed". Fix: say so in the limits line.

## Open from the Lead (not a finding against this head)
Lead 25's comment (09:05, after this head): "one test through a real split upsert (one of the three) if it can be held open cheaply; if not, say so". That is still to do.

## Not checked
A real split packet on a network (modelled by the 20 ms deferral). Why the single loaded w1 run failed (watch it in CI). Prisma versions other than 7.8.0. CI's full run: only CodeQL had finished, and the other jobs were skipped on this draft head.

Verdict: Approve 1167bcd46410285f81940e51643c806695978c19
