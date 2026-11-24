# M1 (no query after a checkout's transaction end): break report, 24 Nov

Head 1167bcd46 (PR #3467, stacked on #3441 648adace4; own diff `648adace4..1167bcd46`). This is a fresh adversarial pass by a breaker who did not build the fix. pg 8.22.0, pg-pool 3.14.0, Prisma and adapter-pg 7.8.0.

**Setup.** Scratch databases are named `xr_studio_m1brk_*`. They are an RLS-forced `note` table (one secret per firm, as xr_app) plus Prisma's model tables without the foreign key (as in the PR's test), and `xr_studio_m1brk_full` (all 163 migrations) for the M2 re-runs. "Base" means the same scripts run on a `git archive 648adace4` copy.

**Scripts.** All in `/tmp/claude-0/-home-user-xpatready/7029c33d-8336-515e-8076-68f159ec99da/scratchpad/m1brk/`: hw.ts is the harness; then b1_parse, b2_halfwrite, b3_drain (`MODE=`), b4_busy, spot.ts, upsert-full.mts, mut.py, and m2/ and p1/ (earlier sets, re-pointed). Run them from studio/ with `NODE_PATH=$PWD/node_modules npx tsx --tsconfig api/tsconfig.json <script>` (`ST=<tree>` for base). No network, US$0.

## Findings (no Blocker, no Major)

**m1 (Minor, a regression): a double release while busy now crashes the process later, where it used to throw at once.**
- **Where:** `firm-scope.ts` `closeOnOpenTransaction`. The wrapper returns `undefined` and parks two separate drain listeners.
- **What happens:** at `drain` the second `judge()` calls pg-pool's release-once. That throws "Release called on client which has already been released" inside pg's `readyForQuery` handler, as an `uncaughtException`.
- **Same for `release()` then `release(err)`:** the throw comes from the `end` listener after the destroy.
- **Repro:** `MODE=double` and `MODE=thenerr` b3_drain.ts. Head: CRASH. Base: the second call throws to the caller, and the process lives.
- **App path:** none found. Prisma's PgTransaction commit/rollback release once, as do `WalledPool.query` and connect's catch.
- **Fix:** keep a `released` flag in the wrapper, and make a second call throw synchronously, as pg-pool does.

**m2 (Minor): `endsTransaction` is regex replacements run in sequence, not a scanner, so it misreads some texts.**
- **False "end" (the rest of the transaction is refused, fails closed):** `select E'it\'s; commit'`; `/* don't */ select 'a; commit'`; nested `/* /* */ commit */`; `do $é$ … end $é$`. H9 shows it through Prisma: the transaction fails and the next caller is clean.
- **Missed end (a later statement autocommits):** `select E'\''; commit; select 'x'`; `select '$$'; commit; select '$$'`; `select "a'b"; commit; …`; `-- don't` or `/* it's */` before `; commit`; `PREPARE TRANSACTION`.
- **H10:** `$executeRawUnsafe("select 1 -- don't\n; commit; select 'x'")` and then an insert. The insert is stored although the transaction threw.
- **Not reached today:** Prisma's own COMMIT and ROLLBACK are literal. App raw SQL holds only savepoint rollbacks (4 sites, all read right), and no E'' strings or `$$`.
- **Repro:** b1_parse.ts (10 of 36 disagree with PostgreSQL), and b2 H9 and H10.
- **Fix:** one left-to-right scan that handles `'…'` with `''`, `E'…'` with backslashes, `"…"`, `$tag$` (any identifier characters), nested `/* */` and `--`. Also add `prepare transaction` to the ends.

**m3 (Minor): unclosed `/*` takes quadratic time.**
- **Measure:** `endsTransaction("select " + "/* ".repeat(20000))` takes 527 ms for 60 KB, and the check runs on every query text. A 309 KB Prisma-style insert takes 1.6 ms.
- **Reach:** user input cannot reach query text through Prisma parameters.
- **Fix:** the m2 scanner, which is linear.

**m4 (Minor, the same on base): the refusal is a plain `Error`, so busyWords' worded 503 (C9.5) and person-link's P2028 mapping miss it.**
- **What happens:** when the timeout fires in a multi-statement operation (split upsert, nested create), the caller gets a 500 with "M1: a query after this connection's COMMIT…". Single-statement operations still get the 503.
- **Repro:** b4_busy.ts, 2 held and 2 broke. Base breaks the same 2, with "Connection terminated".
- **Fix:** give the refusal a recognisable marker (for example `code: "P2028"`, or "Transaction already closed" in the text), or match it in `busyWords` and `person-link.ts:67`.

**m5 (Minor): test gaps.** Mutation testing (mut.py) on check_tx_end_guard and check_pool_tx_return:
- **Caught:** 8 of 9 mutants (no ENDED set, no readyForQuery, no drain wait, no per-checkout reset, no prepared names, no savepoint exclusion, no quote stripping, judge always keeps).
- **Survived:** removing the drain wait's `end` listener. Head handles it (b3 `MODE=kill` held), but no test pins it.
- **Also untested:** the 10 s cap path, and double release (m1).
- **Fix:** add a terminate-backend-while-settling case, a cap case (a fake timer or a lowered cap) and a double-release case.

**m6 (Minor, the same as before but now delayed): the cap destroys the socket, not the statement.**
- **What happens:** after the 10 s cap, or after `pool.end()`, a 30 s `pg_sleep` backend is still active in pg_stat_activity, while `pool.totalCount` no longer counts it.
- **Effect on writes:** an autocommit write that outlives the cap is reported failed, though it commits.
- **Reach:** raw callers only (Prisma never enters the wait, see below).
- **Fix:** at the cap, `pg_cancel_backend` from a fresh connection, or document it as a stated limit.

**Note: `COMMIT AND CHAIN` counts as an end.** Later queries in the chained transaction are refused. This fails closed and is not used anywhere.

## What held

**Half a write kept through a timeout:** none kept on head, and the caller is told it failed.
- **Cases (b2):** H1 nested create, first insert in a lock wait (not a trigger); H2 split upsert (`update: {}`), SELECT in a lock wait; H3 split upsert, slow INSERT; H3b native upsert; H4 create with nested `createMany`; H5 nested savepoint transaction, outer timeout during the inner nested create (outer raw insert, parent and child all gone); H6 first operation fine, timeout in the second; H7 an 11 s lock wait.
- **On base:** H1, H2, H4, H5 and H6 keep rows (for example `c:2`, `n:1`), so the attacks are live and the fix is what stops them.

**After each attack** the next caller (firm B) gets its own firm as xr_app, outside any transaction, and reads only B's row. H5b: a legitimate inner savepoint rollback, followed by an outer commit, works.

**No false refusals in legitimate work (H8, b1):** `select 'x' as "end", 1 as commit`; a DO body's END; a single-quoted function body; a comment with an apostrophe; `rollback to` / `rollback work to` / `rollback transaction to` savepoints; `release savepoint`; `commit prepared`; `$outer$ … $inner$ … $inner$ … $outer$`.

**The drain wait (b3):**
- **pool.end():** resolves within the 10 s cap with a 30 s statement in flight, with no deadlock.
- **Max 1, B waiting behind A's busy release inside a transaction:** B gets a fresh client in its own firm.
- **Backend terminated while settling:** the slot is freed and the next caller is clean.
- **Raw burst** (30 releases mid-statement, max 5): finishes in 324 ms, with slots equal to backends.

**Prisma burst with timeouts.** The run: 40 transactions from firms A and B, timeout 150 ms, a 0.6 s first insert, max 5.
- Nothing was kept.
- `pool.totalCount` 5 equals 5 xr_app backends, with 0 idle in transaction.
- **0 releases entered the drain wait:** Prisma awaits its ROLLBACK before `release()`, so Prisma never waits 10 s.
- Afterwards each firm reads only its own rows.

**Earlier sets re-run on head:**
- **P1 (p1/a1–a5):** 25 held. The 3 that "broke" are the same documented items as before: a transaction keeps its opener, all-dirty fails after one retry, and the pre-existing is_local=false matter.
- **M2 (m2/a1, a3–a6, r2):** identical to base on the same fixture. The only differences are fixture artefacts, the same on both.
- **The PR's tests:** check_tx_end_guard (16 of 16), check_pool_tx_return (16 of 16) and check_no_array_tx (14 of 14) all pass.

**tools/upsert-native.mts: 17 native and 6 split is right.**
- **Re-run:** run on a scratch copy, it gives the same 23 lines.
- **Complete:** grep finds exactly 23 `.upsert(` sites in api/src.
- **Full shapes:** the real full-row `put` of lines-bulk.ts:391 and :392, and lifecycle.ts:450's full `data` (upsert-full.mts), stay NATIVE.
- **Real calls, SQL captured at pg (spot.ts):** `Workspace.id()` (core.ts:133) runs SELECT → INSERT → SELECT (split); `Studio.setPreferences` (studio.ts:154) runs one `INSERT … ON CONFLICT ("actor","key") DO UPDATE` (native).
- **Minor:** the site list is kept by hand as file:line. Nothing fails when a new upsert is added. Fix: compare against a grep count and exit non-zero on a mismatch.

Verdict: Approve 1167bcd46410285f81940e51643c806695978c19
