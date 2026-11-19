# FO-7lk review: one lock order for "Move back to trust" (independent, money, P-608)

Reviewed: branch `claude/trusting-fermat-ejsqdh`, head **9f30e673**, diff `8a34b34e5..9f30e673` (5 files). Brief: `a7014c0bb:product/design/build-lead-c-briefs/FO-7lk.md`. Reviewer: Opus, fresh context, did not build it. Database-only row (no screen), so this review is of the code against the brief, not a UI.

## What I ran (PostgreSQL 18.3 at 127.0.0.1:54329, cloud)
* `check_fo7lk_lock_order.ts` **15/0**, twice (shared tree, and a clean `git archive 9f30e673` export). Both times the rollback text (#1991's) gave 0 deadlocks in 40 runs and the planted wrong order gave 20 of 20 (B then A).
* `check_fo7a2_ledger_rules.ts` 35/0 · `check_fo7a_money_schema.ts` 122/0 · `check_fo7mv_move_list.ts` 45/0 · `check_fo7ts_money_settings.ts` **44/0 on the clean export**. In the shared tree DW10 failed once, because another session switched that tree to `claude/trusting-fermat-ejsqdh-fo7ts2` mid-review and left uncommitted `client-money.prisma` and `20261118190000_fo7ts_ledgers/` changes there. That failure comes from the other session's files, not from this commit.
* `check_prisma_schema.ts` 8/0. `prisma migrate deploy` on an empty database applies every migration, including FO-7lk with `rollback.sql` in its folder.
* My own checks in scratch databases (pre-FO-7lk, all migrations, all migrations + rollback; dropped afterwards):
  * I compared every public function's `pg_proc` attributes (prosecdef, owner, proconfig, volatility, strictness, parallel, cost, ACL, language), plus md5 of `prosrc` and of `pg_get_functiondef`.
  * I diffed each changed function's source before and after.
  * I checked the key with 2,000 random firm/party pairs times both currencies.
  * I probed which locks a refused move-back holds.
  * I ran mixed credit-note kinds in one session.

## The checks asked for
* **The helper's key is byte-identical: holds.** `money_trust_lock(f uuid, party uuid, cur "MoneyCurrency")` (migration.sql:13) concatenates the same values as the inline text, typed the same way (uuid and enum output). `hashtextextended` of the helper's expression equals the `::text` form for all 2,000×2 values. The test's try-lock case (test:80-83) shows another connection can't take the inline key while the helper holds it. A null party still takes no lock (strict `pg_advisory_xact_lock`), as before.
* **Every live call site moved: holds.** After the migration only `money_trust_lock` contains `'money_trust:'`. Before it there were 4 functions; FO-7mv's older copy of `money_move_line_write` was already replaced by FO-7a2. `pg_advisory` now appears only in unrelated functions (`case_party_index_refresh`, `fo_stage_fixed`, `module_event_next_seq`, `platform_web_address_lock`).
* **The copied bodies change only the lock line: holds.** The `prosrc` diff is exactly one line in each of `money_issued_invoice`, `money_trust_entry_write`, `money_move_line_write` and `money_move_batch_owed_back`. `money_credit_note_write` gains only the 7-line block at migration.sql:168-174.
* **PF-12 settings restored: holds.** The four trigger functions are back to SECURITY DEFINER, owner `xr_wall_reader`, search_path `pg_catalog, public, pg_temp` (DO block at migration.sql:348).
  * `money_issued_invoice` keeps its caller's rights, owner and empty proconfig.
  * Every other attribute, ACL included, is identical before and after.
  * The helper matches FO-7a2's helpers (`money_trust_paid`, `money_owed_back`): owner xr_studio, invoker rights, search_path pinned.
* **The new lock comes before any invoice read and changes no money outcome: holds.** The block is the first statement after the argument checks, ahead of `money_issued_invoice`. The trigger order on `money_credit_note` puts only `0_pf12_firm_first` before it, and that trigger reads no money row.
  * A valid move-back names a withdrawal to this invoice. FO-7a2's check makes that withdrawal the invoice's party and currency (fo7a2 migration.sql:92), so the key is the one `money_issued_invoice` already takes. The only difference is that it is taken one plain SELECT earlier.
  * Errors and messages are unchanged.
  * In one session, TO_TRUST / REFUND / TO_TRUST / plain / TO_TRUST give the same balances before and after FO-7lk (95000/90000/95000/90000/95000). Reusing the `w` record with two shapes causes no plan error.
* **The rollback restores the text exactly: holds.** All 389 functions are identical to the pre-FO-7lk database on every attribute and on the md5 of `pg_get_functiondef`, and the helper is gone. The DO block fails loudly if a lock line is missing (rollback.sql:25).

## The builder's challenge (build-notes.md): it holds
Before FO-7lk, "Move back to trust" already took the party lock before touching the invoice row:
* `money_issued_invoice` reads party and currency with a plain SELECT (no row lock).
* It then takes the party's advisory lock (FO-7a migration.sql:862, B-14), and only after that runs `UPDATE money_invoice`.
* The FK check (KEY SHARE) and `money_credit_note_owed_back` run AFTER the row is written, so the lock is already held. KEY SHARE also doesn't conflict with the withdrawal's NO KEY UPDATE.

So the deadlock Lead 73 described can't happen on #1991's text, and the measurement agrees: 0 in 40 runs, against 20 in 20 for a planted invoice-row-first writer.

For the same reason the brief's "Neither" (refund and plain credit notes take *no* party lock) is false on `main` too. Testing "the same advisory locks as before FO-7lk" (test:195) is the right reading of "no new waits".

What FO-7lk adds is the single key and the explicit order. It closes no live deadlock. The tech lead should acknowledge that, and the PR body has to state the 0-in-40 count, as the brief requires.

## Findings
1. **Minor: a refused move-back now takes another party's lock first.** migration.sql:172-173 locks the party of whatever entry `overpaid_entry_id` names before checking that it is a withdrawal to *this* invoice (that check is at :182-185).
   * Measured: a credit note on party P's invoice naming party X's withdrawal holds **X's lock while it waits for P's**. On the rollback text it holds nothing.
   * That is a new X-then-P lock order. A concurrent valid transaction holding P and wanting X can get 40P01 against a request that would only have been refused. Examples are a multi-party trust-to-operating batch, or `money_move_batch_owed_back`'s loop in uuid order.
   * Money stays right and the window is narrow: the request is invalid, and the screen offers only the invoice's own withdrawals. It is still the error class this row exists to remove.
   * Fix: read `e.kind, e.invoice_id` in the same SELECT and lock only when `kind = 'WITHDRAWAL_TO_INVOICE' AND invoice_id = NEW.invoice_id`.
   * The test's text check (test:54-55) strips the block by its comment and `END IF`, so the fix keeps it passing.
2. **Nit: a "fail" line passes whatever it measures.** test:167 is labelled "FO-7lk fail (planted, the rollback applied)" but passes whatever the deadlock count is. Its title says "recorded, not counted as proof", which is honest. Still, a reader counting "fail" lines could take it for a planted-fail proof. Suggest renaming it "FO-7lk note" or printing it as a line that isn't a check.
3. **Nit: nothing behavioural proves the new order.** Removing the new block fails test:50 (the changed-function list), and moving it after `money_issued_invoice` fails test:57 (the regex lookahead). The concurrency harness can't tell the difference, because the old text was already safe. That is acceptable given the challenge, but say it in the PR body.
4. **Nit: the helper's signature differs from the brief's.** It takes `cur "MoneyCurrency"`, where the brief says `currency text`. Using the enum is the better choice: with text, every call site would need `::text`, which widens the diff. build-notes.md doesn't mention the change; one line there would close it.

**Flakiness (CI): low.**
* The barrier polls `pg_stat_activity` for a Lock wait, 500×5 ms (test:123).
* The planted 20/20 depends on first-in, first-out grants on one exclusive advisory lock after the gate commits. That is deterministic: the first writer waiting, B, is granted first.
* The A-then-B / B-then-A outcomes in "t" are accepted either way.
* Runtime is about 39 s. The four scratch databases are dropped with `--force` in `finally`. The `/opt/homebrew` path is the one 159 suites already use (cloud-setup links it).

**Holds respected:** only the migration, `rollback.sql`, the test, one MODULE.md line (with the brief's exact words) and build-notes. No table, schema or screen change. Audit actors are `user-O` and `user-R`. No live calls, US$0.

**Could not check:**
* PF-12's 5 API-start cases on my clean export: tsx module resolution through symlinked node_modules failed. The 95 database-level PF-12 checks pass. The builder reports 100/0.
* The re-stamp after #2106 merges (P-600) is still to come.

**Journey test: not scored.** There is no screen and no user journey (database-only row by the brief), so the journey-test criteria (UI words, accessibility, screen sizes) have nothing to score. Its "break it" pass ran at the database level instead: concurrency both orders, wrong-party entry, mixed kinds in one session, rollback. Findings 1-4 are the result.

Reviewer: Approve 9f30e673

---

# Round 2 (diff-only, 9f30e673 → 19d39511d)

# FO-7lk review, round 2 (diff-only, P-277): one lock order for "Move back to trust"

Reviewed: branch `claude/trusting-fermat-ejsqdh`, from my Approve head **9f30e673** to the new head **19d39511d**. I read only FO-7lk's own files. Reviewer: Opus, did not build it. Database-only row (no screen).

## Scope confirmed
* `git diff 1ed3d3af 19d39511d --stat`: 7 files, all FO-7lk's: `migration.sql`, `rollback.sql` (both in `20261118210000_fo7lk_trust_lock/`), `check_fo7lk_lock_order.ts`, `MODULE.md` (+1, the invariant line), `build-notes.md`, `review.md`, `break-report.md`. Nothing else differs from #2106's head.
* From 9f30e673 the FO-7lk diff is 4 files (+53/−12). `MODULE.md` did not change after round 1. Commits: cd4d06d0c (fixes), 2cd4d9cd1 (test reads text after its own migration), 19d39511d (merge 1ed3d3af and re-stamp).
* #2106's two earlier migrations (`20261118200000`, `20261118200100`) redefine `money_trust_answer_move`, `money_trust_on`, `money_trust_request_write` and `money_invoice_write`. None of these is one of FO-7lk's five functions, and neither migration holds `money_trust:` or `pg_advisory`. So FO-7lk's copied bodies revert nothing of #2106's. The test's "each of the five is FO-7a's or FO-7a2's text exactly" check passes against the pre-FO-7lk database, which includes #2106.

## Claimed changes: each one checked
* **Round-1 Minor / B-1: fixed.** The early `SELECT … INTO w` (migration.sql:174-175) now adds `e.kind = 'WITHDRAWAL_TO_INVOICE' AND e.invoice_id = NEW.invoice_id`.
  * That is the same condition as the refusal at :187, so an entry the checks refuse takes no lock.
  * An entry that passes is the invoice's own party and currency (FO-7a2's rule), so the key is the one `money_issued_invoice` takes next. Valid move-backs keep their behaviour.
  * The firm filter is unchanged.
* **New regression check: it works.** On 19d39511d it passes (`held 0`, refused 23514 in the ledger's words).
  * I put 9f30e673's `migration.sql` text into the re-stamped folder and re-ran it. Exactly that check failed, 15/1: `{"held":1,"out":"23514 money_credit_note: a refund or move-back choice names a trust application to this invoice"}`.
* **Helper `CREATE OR REPLACE`: done** (:13). The rollback still drops it.
* **The #1991 line is renamed a note: done** (test:170). Its title now says it checks only that the harness ran.
* **The test reads function text right after its own migration: done** (test:45-50). `t`, `back` and `plant` take only FO-7lk, `back` then takes the rollback, the text is read, and only after that do `t` and `plant` take later migrations (`> NEW`). Today there are none.
* **Re-stamp 20261118180000 → 20261118210000: done.** The folder was renamed (similarity 97%/99%). The rollback's usage comment and the test's `NEW` were updated. The stamp check reports the newest before it as `20261118200100_fo7ts_card_terminal_trust`.
* **Build notes:** they record the fixes, the currency-type note (round-1 Nit 4), the order-proof note (Nit 3) and the merge. The counts match my runs.

## What I ran
Detached worktree at 19d39511d, PostgreSQL 18.3 at 127.0.0.1:54329.
* `check_fo7lk_lock_order.ts` **16/0**. #1991's text: 0 deadlocks in 40 runs. Planted order: 20 of 20 (B then A).
* The same check with 9f30e673's migration text: **15/1**, only the B-1 check failing (above).
* `check_fo7a2_ledger_rules.ts` **35/0** · `check_fo7ts_money_settings.ts` **47/0** · `check_prisma_schema.ts` **8/0**.
* I removed the worktree, and my scratch databases were dropped. The `xr_studio_fo7lk_break2_*` databases still present are another session's (the breaker's), not mine.

## Findings
1. **Nit: the B-1 check doesn't assert that it reached the wait.** test:217 polls up to 400×5 ms for `wait_event_type = 'Lock'` and then counts held advisory locks. It doesn't check that the wait was reached. If the credit note ever finished or failed before waiting, `held` would be counted on an idle connection: 0, a pass that proves nothing.
   * On the current text it does wait (in `money_issued_invoice`, on the gate's P lock), and it fails on 9f30e673, so the check tells the two apart today.
   * Suggest recording the wait state and adding `waited === "Lock"` to the assertion.

No Blocker, Major or Minor. Round 1's Minor and the breaker's B-1 are closed, and so are Nits 2, 3 and 4.

**Journey test: not scored.** As in round 1, there is no screen and no user journey (database-only by the brief), so the journey-test criteria have nothing to score.

**Verdict: Approve** (no open Blocker or Major). Only the Nit above is open, and it is optional.

Reviewer: Approve 19d39511d

---

# Round 3 (diff-only, 19d39511d → c5d1bccd)

# FO-7lk review, round 3 (diff-only, P-277): one lock order for "Move back to trust"

Reviewed: branch `claude/trusting-fermat-ejsqdh`, from my Approve head **19d39511d** to the new head **c5d1bccd39d42e252d4c1c5282eb26803e81b6a7**. I read only the change since round 2. Reviewer: Opus, did not build it. Database-only row (no screen).

## Scope confirmed
* `git diff --stat 19d39511d c5d1bccd`: 5 files, +124/−8. Commits: ae7cc15f1 (#2106's F3 head), 5ca28ade0 (merge of it), 845582733 (the Nit), c5d1bccd3 (round-2 reports).
* **#2106's ae7cc15f arrived unchanged.** `git diff ae7cc15f c5d1bccd -- …/20261118200000_fo7ts_money_settings/migration.sql …/check_fo7ts_money_settings.ts` is empty (0 bytes). ae7cc15f touches only those two files (+22/−6), the same as in this diff.
* **Round-2 Nit: done** in `tests/check_fo7lk_lock_order.ts` (+3/−2, test:218-223). The poll loop now keeps the last `wait_event_type` in `waited` (`?? ""` when there is no row). The B-1 assertion is now `waited === "Lock" && held === 0 && /names a trust application to this invoice/`, and `waited` is in the failure detail. Nothing else in the test changed.
* **Records:** the round-2 review (ending `Reviewer: Approve 19d39511d`) is appended to `screens/FO-7lk/review.md` (+46), and the breaker's round 2 (ending `Breaker: pass 19d39511d`) is appended to `break-report.md` (+53). Both are append-only below a `---` rule, and the round-1 text is untouched.
* Nothing else is in the diff. FO-7lk's migration, rollback, MODULE.md and build notes are unchanged since 19d39511d.

## What I ran
Detached worktree at c5d1bccd, with node_modules symlinked to the main checkout's. PostgreSQL at 127.0.0.1:54329.
* `check_fo7lk_lock_order.ts` passes **16/0**. The B-1 line passes. #1991's text gives 0 deadlocks in 40 runs. The planted order gives 20/20 (B then A).
* **Control:** I put 9f30e673's FO-7lk `migration.sql` text into `20261118210000_fo7lk_trust_lock/` and ran the check again. It gives **15/1**. Only the B-1 check fails, with `{"waited":"Lock","held":1,"out":"23514 money_credit_note: a refund or move-back choice names a trust application to this invoice"}`. The new `waited` guard is satisfied there, and the check fails on `held`. So the check still tells the two texts apart, and it now proves the wait was reached.
* Afterwards I restored the file and removed the worktree. No `xr_studio_fo7lk_*` databases are left, and the main checkout is clean.

## Findings
None. No Blocker, Major, Minor or Nit is open. The round-2 Nit is closed.

**Journey test: not scored.** As in rounds 1 and 2, there is no screen and no user journey (database-only by the brief), so the journey-test criteria have nothing to score.

**Verdict: Approve** (no open Blocker or Major).

Reviewer: Approve c5d1bccd39d42e252d4c1c5282eb26803e81b6a7
