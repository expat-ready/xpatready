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

## Round 2: head f824febdd2f079fbef32cc7115a670d31f128bae
Same reviewer, 24 Nov. Scope: `git diff 1167bcd46..f824febdd -- ':!*/product/screens/*'` only (4 files). My probes ran in a scratchpad worktree, and the scratch databases were on :54329 (PostgreSQL 18.3). The isolated copy ran on runtime port :4433, never :4400. The worktree is removed and the main checkout is clean.

**Verdict: Approve** (Ship). Every round-1 Minor that was fixed holds when probed, and the Lead 25 test is a real red/green. No app SQL is misread. **Journey score: 9.5/10, pass** (`journey-test-reviewer-2026-11-24.md`, Round 2).

| Check | Result |
|---|---|
| `check_tx_end_guard.ts` / `check_pool_tx_return.ts` / `check_no_array_tx.ts` | **21/0** (10.7 s), **16/0**, **14/0** |
| `tools/upsert-native.mts` | **23 lines, exit 0** (17 NATIVE, 6 SPLIT). With an `.upsert(` planted in `core.ts`: `LIST out of date … ["core.ts:192"]`, **exit 1** |
| Split upsert (block 7) with **648adace4's `firm-scope.ts`** swapped in | **red twice**: `{"r8":"Connection terminated","stored":1}`. With only the refusal disabled at head: red, `stored: 1`. At head: **green 6 times out of 6** (lock 600 ms vs timeout 300 ms; no flake seen) |
| The 19 rows of the table, each sent to PostgreSQL inside `BEGIN; select txid_current()`, then the transaction state read after 30 ms and `txid_current_if_assigned()` checked | **19/19 expected values right**. All 9 "true" rows leave the session idle with xid null (`prepare transaction` errors "prepared transactions are disabled" and still ends it). The 10 "false" rows stay in the transaction (still `T` with the xid) or in a failed one (`E`) |
| 25 extra strings on the same server | 19 agree, including: `U&'\0027; commit'`, `"x""; commit"`, `a$b$; commit`, `/*/*/ commit */ */; commit`, `2*/*x*/3; commit`, `x''`, `b''`, `n''`, `$q$…$q$ \|\| $$…$$`, `'a'\n'b'; commit`, `rollback transaction to s`, and `case … end` and `with end_rows` mid-statement. 6 differ, in 4 forms (r2-m1) |
| Scanner mutations | removing the E'' branch, PREPARE TRANSACTION or named dollar tags fails the table. Removing nesting (`depth++`) **stays 21/21** (r2-m2). Removing the savepoint exclusion now **fails in 19 s** ("the pool ends within 15 s"), where round 1 hung |
| App SQL (TypeScript AST of `api/src`, `engine`, `ports`: 757 files, 51,342 literals, 73 with a transaction word) | **10 hits, none SQL** (`"end"`, `"abort"`, `END:VEVENT`, "End must be after start."): the same as round 1. No `BEGIN ATOMIC`, `AND CHAIN` or `CREATE RULE` in `api/src`, `engine`, `ports`, `tools` or the migrations |
| `released` flag (pg-pool 3.14.0, pg 8.22.0, adapter-pg 7.8.0, read) | pg-pool resets `client.release` at every acquire (`index.js:342`). Its own releases (verify, timedOut) happen before `WalledPool.connect` wraps it. `Pool.query` is fully overridden. adapter-pg releases once, in `commit()`, `rollback()` or `startTransaction`'s catch. Probed: 30 `WalledPool.query` calls (10 in parallel), pool 1/1 idle; a failing query drops its client; `connect(cb)` `done()` twice, `release(); release(err)` and a busy `release(err); release()` each **throw to the caller synchronously**; no uncaught exception; the pool keeps serving the right firm |
| Submittable (`new pg.Query`) after COMMIT | the `error` listener gets the M1 error and the Submittable is returned, as pg does. With a callback, the callback gets it (r2-m3) |
| Isolated copy :4433, this head | `check_c41_section_order` **32/32**, `check_bk17_keep_recorded` **25/25**, `check_w1_structure` **81/81 three times** on fresh copies (it needs an empty workspace: run after the others on the same copy, it fails 8). The copy's api.log has no M1 refusal, no `platform_pool_release_failed` and no `platform_pool_open_transaction` |
| CodeQL on this head | **success** (Analyze javascript-typescript). The escape `/[.*+?^${}()\|[\]\\]/g → "\\$&"` covers every RegExp metacharacter, backslash included. `-` and `/` need no escape outside a class or a literal. The input is already `[A-Za-z_$][\w$]*` |
| `tsc -p api/tsconfig.json --noEmit` / `check_pf23m_log_calls` | 15 errors, none in this diff's files (as round 1) / 15/0 |

### Blockers
None.
### Majors
None. No legitimate app query can be refused: the only false ends are four syntaxes the app never sends, and a false end fails closed (the transaction fails, and nothing is half-written).
### Minors
- **r2-m1 (Should). The comment says "as PostgreSQL reads them", but four forms differ on 18.3** (`firm-scope.ts:508-519`, `:539`). Round-1 m4 is half done: PREPARE TRANSACTION is added, but AND CHAIN is neither excluded nor named. False ends: `create function … begin atomic select 1; end` (real PG 14+ syntax: the `;` inside the body splits and `end` reads as an end); `commit and chain` and `rollback and chain` (the refusal's "outside the transaction" is wrong there); `E'a'` newline `'\'; commit'` (a continued E'' string keeps backslash escapes). Missed end: `select 1 as é$x$; commit` (a non-ASCII identifier character before `$` is read as a dollar tag; the same holds for `éE'…'`). Tags over 62 characters and astral-plane tag characters are not read as tags either. Fix: name these in the doc comment (and the MODULE row), or exclude `and\s+chain` and skip `begin atomic … end`.
- **r2-m2 (Should). Nesting is not pinned.** `select 1 /* a /* nested */ commit */` is false with or without `depth++`. Add `["select 1 /* a /* b */ ; commit */", false]`: PostgreSQL keeps the transaction (psql probe, xid still set), and with nesting removed the scanner says true (probed).
- **r2-m3 (Could).** A refused query with a callback returns `undefined`, even when the config is a Submittable that pg would return (`firm-scope.ts:554`). The callback still gets the error, and nothing in the app passes one.
- **r2-m4 (Could).** The upsert drift check is keyed on `file:line` (`tools/upsert-native.mts:75`). Any edit above an upsert fails the tool (closed, but noisy), and `.upsert (` or `["upsert"](` is not seen.
- **Carried, Could:** round-1 m7 (typed variable and `as` cast in the source check) and m8 (the use-after-release window unnamed) are unchanged and not in the PR's "Not done" list. They are fine as they are, but should be listed there.

### Not checked
The 10 s cap path (`destroyed-unsettled`) in a test (the PR lists it as not done; probed in round 1). A real split network packet. Prisma versions other than 7.8.0. CI's full run: only the guard jobs and CodeQL ran on this draft head. Four `xr_studio_txend_scratch_*` databases (pids 8104, 8156, 21440, 22433) are on :54329 and are not mine: they are left for `prune-test-dbs.sh`.

Verdict: Approve f824febdd2f079fbef32cc7115a670d31f128bae
