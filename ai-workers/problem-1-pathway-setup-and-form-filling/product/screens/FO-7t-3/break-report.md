# Break report, round 1: FO-7t part 3, To move, I moved these, Undo, the 25-day item (API only)

Breaker: fail 357825109

Commit `357825109` on `claude/zealous-keller-h3v4f4`. I checked part 3 only (`git diff 2b950dec5..357825109`) against brief `design/briefs/FO-7t.md` part 3 and its breaker line (line 100). I did not build this and changed no code. The harness is a copy of the setup in `tests/check_fo7t_to_move.ts`, in the session scratchpad as `break.mts`. Each run used its own scratch database on 127.0.0.1:54329, with the Nest app in-process, local sign-in (user-R, T, O, S), and the fake clock, jobs and notifications. Each database was dropped at the end. Nothing ran on :4400, there were no network calls, and it cost US$0. Amounts are Sample.

## Findings

**Major 1: a transfer date before 2000-01-01 gives 500 on both writes.**
* Repro (as user-R): `POST /trust/to-move/batches {currency:"CAD", direction:"TRUST_TO_OPERATING", transferDate:"1999-12-31" | "1900-01-01" | "0001-01-01" | "0000-01-01", lines:[{sourceEntryId:<open withdrawal>, amountMinor:1}]}` returns **500** with an empty body.
* Same for `POST …/batches/:id/undo {reason:"…", transferDate:"1900-01-01"}`, and for `"0000-01-01"`: **500**.
* Expected: 422 on `transferDate`, the same as for `"2026-02-30"`, which gives 422 "That date does not exist."
* Cause:
  * The route's `day` schema (`trust/to-move.ts:35-36`) has no lower bound, and the undo check (`:120`) only refuses future dates.
  * The database's `money_move_batch_date_check` (`transfer_date BETWEEN '2000-01-01' AND '2999-12-31'`, `migrations/20261116030000_fo7mv_move_list/migration.sql:111`) then refuses the row with "new row … violates check constraint".
  * That message does not match `/money_[a-z_]+: /` or the two key patterns in `write()` (`:146-149`), so the raw error is rethrown and becomes a 500.
* Nothing is written; the transaction rolls back. But STANDARDS needs a field error, not a 500, and the same `write()` path turns any other plain constraint or type error into a 500 too.

**Major 2: the 25-day item never fires again for a line that was moved and then undone.**
* Repro (fake clock): in firm B, apply trust to one invoice, which gives one To move line L. Then:
  1. Set the clock +26 days. The sweep queues `trust-to-move:<B>:<L>`, and user-S is told once.
  2. user-S moves L in full (201), then undoes the batch the next day: "the bank sent it back" (201). L is open again at 30.00.
  3. Advance the clock 10 more days, with the daily sweep running each day, plus one sweep run by hand.
* Observed: user-S has been told **1** time in total. Firm B has only the one job (`…:<L>`, done).
* Expected: L waits again past 25 days, so a second item. By the file's own rule ("once that line has moved, a line still waiting (or one that waits later) is told once more", "Duplicate beats a miss", AG16-60), this is a miss.
* Cause: the key is the firm plus the oldest line (`trust/to-move-reminder.ts:227-234`), and JobPort keys never queue twice "even after its job ran" (`ports/jobs.ts:13-14, 81`). After the undo, L is the oldest line again with the same key, so it stays silent for as long as L waits.
* Same gap without an undo: if the waiting job runs after L moved (it returns 0, `:245-246`) and L later comes back by undo, the key is already used and nobody is told.

**Minor 1: a line moving operating to trust is "over 25 days" the moment it appears.**
* Repro: take a withdrawal 30 days old and move it in full. Write a credit note today with `OVERPAID_TO_TRUST` 40.00, at the database, because no route writes this choice yet.
* `GET /trust/to-move` then shows the new `OPERATING_TO_TRUST` line with `sourceDate` 30 days ago and `over25Days: true`. The next sweep would also notify for it straight away.
* Cause: the list (`to-move.ts:69-70`) and the sweep (`to-move-reminder.ts:227-228`) read `money_to_move.created_at`, which for this branch of the view is the **withdrawal's** time (`migrations/20261116133000_fo7a2_ledger_rules/migration.sql`, the third UNION). The brief's ruling only covers the withdrawal and the `WRONG_ACCOUNT` correction. The source date for a move-back line is unruled: a question for the tech lead, not a silent choice.

**Minor 2: the dates on moves and undos can be impossible.**
* A batch dated `2000-01-01` for a withdrawal made today gives **201**.
* Its undo dated `2000-01-01`, before the batch's own transfer, also gives **201**.
* Neither the route nor the database compares `transferDate` with the source entry's date or with the undone batch's date (`to-move.ts:87, 120, 131`). The ledger then shows money moved, or sent back, before it existed.

**Minor 3: "today" is the UTC day.**
* `dayOf(clock.now())` (`invoices/facts.ts:14`, used at `to-move.ts:87, 120`) is UTC.
* From about 19:00 to 24:00 Toronto time, tomorrow's local date counts as "today" and is accepted. Trust refunds have the same one-day leeway at the database (`current_date + 1`), so this matches. Noted only.

## What held (observed in runs)
* **Concurrency, with no 40P01, no 500 and no over-move:**
  * 15 rounds of three simultaneous undos of one batch: 15 succeeded (201) and 30 were refused (409 "already undone").
  * 15 rounds of a batch racing an undo on the same line: only 201 and 409.
  * 10 rounds of a full move racing a full return of the same withdrawal: one side refused each time.
  * 10 rounds of a two-line batch against two applications and a trust refund on the same party: 40 of 40 succeeded (201), and the balance never went below 0.
  * 40 rounds of five-way races: two batches (P1/P2/Q pick lines, in reversed orders) against picks by P1 and P2 and Q's own application: 200 of 200 succeeded (201).
  * 20 rounds of an undo of a three-party batch against two picks: 60 of 60 succeeded (201).
  * Afterwards, no withdrawal has moved more than withdrawn, less returned, plus owed back.
* **Input:**
  * amount 0, -5, 1.5, "100" and 2^31 give 422. 2^31-1 gives 409 with the database's words.
  * A missing or non-existent date gives 422. Unknown keys, `__proto__`, an array body, a bad direction, a bad id, a repeated `?currency` or a stray query key give 422.
  * An upper-case id is accepted. A reason of 201 characters or containing U+2028 gives 422. A `null` body gives 400 (Nest's parser).
* **Duplicate `sourceEntryId` lines:** two lines summing to no more than the open amount give 201 with two lines and the right amount left open. Over it gives 409, and nothing is written.
* **Wrong sources:** a DEPOSIT, REFUND_TO_CLIENT, MOVE_TO_CASE, RECORDED_BY_MISTAKE correction or a withdrawal's return each give 409 with the database's words. Another firm's entry gives 404. No batch is written in any of these cases.
* **OPERATING_TO_TRUST:** with nothing owed it gives 409. Over the owed 40.00 gives 409. Exactly 40.00 gives 201.
* **Undo:**
  * An undo blocked by a move-back choice gives 409 with the database's words, not "already undone".
  * Firm B undoing firm A's batch gives 404.
  * user-O (the C5-blind Case Officer) given `agent/payment:record` gets 404 for a batch with lines it cannot see, for an undo batch, and for an unknown id. None of these leaks that the batch exists.
* **Reminder:**
  * A clock jump back 40 days: nobody is told. Jumping forward 26 days tells each holder once. More sweeps do not tell them again. No job failed.
  * By reading: lines in two currencies share one key per firm, the oldest of all, so the firm gets one item.
* **Payload and audit:**
  * `trust.moved` carries `amountMinor, batchId, currency, undoesBatchId` only.
  * The audit holds ids and amounts in cents. The undo reason is kept in the audit only, and no name appears anywhere.
* **Load:** the list answered in 82 ms for 186 lines.

## Round 2 (diff-only: `357825109..48899e198`, run at merge head 2bc1a384d, which changes nothing under client-money or ports)

Breaker: pass 2bc1a384d44d58ec4441c42048836e831c18c383

Script `break2.mts` in the session scratchpad, on its own scratch database (dropped). Neither Major remains.
* **M1 fixed.** A batch dated 1999-12-31, 1900-01-01, 0001-01-01 or 0000-01-01 gives 422 "on or after 2000-01-01". An undo dated 1999-12-31 or 0000-01-01 also gives 422. No 500 anywhere.
* **The date edges hold:** batch dated 2000-01-01 with the source on 2000-01-01 → 201; source the next day (the one day of slack) → 201; source two days later → 422; source today with the date yesterday → 201, the day before → 422. Undo before the batch's own date → 422; on the same day → 201.
* **M2 fixed.** Five quiet days plus five extra sweeps queued no new job (key `…:0` only). Moving the line in full and then undoing it queued and ran `…:1`; a partial move ran `…:2`; three quiet days after that queued nothing. The fake notification port re-marks the one record unread rather than adding a second, so I counted job runs.
* **m1 fixed.** By reading: the list's `over` flag, the sweep and the job's re-check now count TRUST_TO_OPERATING lines only.
* **Lock order:** 30 rounds of three-party batches against picks (uuid order) gave 150 of 150 successes (201), with no 40P01 and no 500.

**Minor R2-1: with several lines, the "never dated before its money left trust" check only looks at the oldest line.** `to-move.ts:97-98` uses `min(created_at)`. Repro: one line from a withdrawal dated 2000-01-03 plus one from a withdrawal made today, in a batch dated 2000-01-02 → **201**. Expected: 422, because today's withdrawal could not have been moved in 2000. Using `max(created_at)` would check every line.

**Minor R2-2: a line that leaves the list without a new move line comes back without a new reminder.** The key counts move lines only (`to-move-reminder.ts:57-58`). Repro (firm B, line L past 25 days):
1. A partial move of 10.00 queues and runs key `L:2`.
2. The remaining 20.00 goes back to trust by a correction naming the withdrawal. L leaves the list.
3. The partial batch is undone. L is back with 10.00 open and still 2 move lines.
4. Two days and a sweep later: no new job; key `L:2` was already used.

This edge needs both a return and an undo. Noted for the record; it does not block.

## Round 4 (the uncleared question only: `80185f1ae..5445767089`)

Breaker: pass 5445767089cdc95f8db99220515a41bb4da65239

Script `break4.mts` in the session scratchpad, on its own scratch database (dropped). Cheques are uncleared deposits. Each scenario has its own client and case. No 500 anywhere.

**What held:**
* All money cleared: a batch or a refund passes with no question (201). A blind `unclearedAcknowledged: true` is recorded as `false` in both audits. The value `"yes"` gives 422.
* Mixed money (600 cleared, 400 cheque, 1000 applied):
  * 600 split over two lines and two withdrawals passes without the question.
  * The next 0.01, in another batch, gives 409 UNCLEARED.
  * The same 0.01 acknowledged gives 201 with `true` in the audit: a warning, never a block.
* Two cases in one batch: 900 cleared on case X plus 10 from a cheque on case Y gives 409. The groups are not pooled.
* A pick line paid from the payer's cheque, beside the invoice party's cleared line, gives 409. The cleared line alone gives 201.
* WRONG_ACCOUNT lines pass without the question: a cleared one beside a 1000 cheque, and one from a cleared cheque.
* OPERATING_TO_TRUST is not asked, by design.
* Clearing the cheque in between removes the question.
* **Races:**
  * Two 500 batches at once on 600 cleared: one passes (201), one gets UNCLEARED. Over 8 more rounds with a refund added, every round was the same.
  * 8 rounds of refund 500 against move 500 at once, on 1000 cleared plus a 1000 cheque: both pass (201), and the next 0.01 refund always asks. In total, never more than the cleared money left without the question.

**Minor R4-1: a bounced cheque still counts as uncleared, so the question appears when all remaining money is cleared.**
* Repro 1: 1000 cleared plus a 1000 cheque. Pay from trust 1000, which takes the cleared money first. The cheque is RETURNED, and the balance is 0.
* Moving the withdrawal then gives 409 "CAD 1,000.00 of this is from a cheque not yet cleared".
* Repro 2: 1000 cleared plus a 500 cheque that is RETURNED. A refund of 1000 gives 409 "CAD 500.00 … not yet cleared".
* Cause: the `uncleared` sums in `to-move.ts` (askUncleared) and `money-out.ts` (held, about line 68) count `DEPOSIT and not p.cleared` without leaving out deposits that have a RETURNED correction. The RETURNED row already took the money off the ledger, so it is counted twice.
* It only warns and never blocks, but the words are wrong.

**Minor R4-2 (latent): uncleared money moved onto a case is never asked about.**
* Repro: a pre-case cheque of 400, moved to a case by a `MOVE_TO_CASE` pair written at the database.
* Pay from trust of 400 with no acknowledgement gives 201. The move of 400 gives 201, recorded `false`. The cheque is still uncleared.
* Cause: both sums count only uncleared `DEPOSIT` rows on the same case, and moved money arrives on the case as `MOVE_TO_CASE`. A refund on that case would pass the same way.
* No route writes `MOVE_TO_CASE` today, so this is not reachable through the API yet. It becomes a Major when a move-to-case route lands. The same gap is in part 2's `held`.

## Round 5 (merge of main, 2ea622a7e)

Breaker: pass 2ea622a7e (a clean merge of origin/main onto 3ed855a66; the later 3e7781bfe adds review.md only). Diff only: `git diff 3ed855a66 2ea622a7e`, 170 files.

**What main changed on a money path:**
* `api/src/client-money/port.ts` `hasMoney` and `ports/client-money.ts` (FO-9b part 2): two more reads, for a tax treatment and a trust payee. Read-only; part 3 does not call it.
* Migration `20261124070000_fo9b_review`: the new `fo_dup_review` table with its PF-12 wall, plus a unique index on `fo_dup_merge`. It touches no `money_*` table, wall or trigger, and not `money_trust_lock`.
* `api/src/platform/firm-scope.ts` (M1-tx-end and P1): `WalledPool` now refuses any query after a checkout's COMMIT or ROLLBACK (`refuseAfterEnd`). It also lets a connection released with a statement in flight finish, then judges it. `Db` (`core.ts:39`) is built on this pool, so every part 3 transaction and every `money_trust_lock` call goes through it.
* New client-money web screens for invoices (FO-7s1, read-only UI). `ports/metrics.ts` narrows `scope`. Neither is on part 3's path. No other file under `client-money/trust/`, no lock function and none of part 3's ports changed.

**Suites (fresh scratch databases, dropped):**
* `check_fo7t_to_move.ts`: 43 passed, 0 failed, exit 0. This includes the 100 rounds of the lock race (200 of 200 answered 201, no 40P01, no 500) and the uncleared cases.
* `check_fo7t_money_out.ts`: 51 passed, 0 failed, exit 0.
* `check_fo7mv_move_list.ts`: 45 passed, 0 failed, exit 0.

**Targeted attack on the new pool guard** (script `r5/attack5.mts` in the session scratchpad, not committed; own scratch database, dropped). A second session held `money_trust_lock(A, PA, CAD)` for longer than Prisma's 5 s transaction timeout. Meanwhile three "I moved these" requests (two people) and then two undos waited on that lock, so Prisma's ROLLBACK was queued behind the lock wait. That is the case the M1 guard exists for.
* Holding 7 s and 12 s: 0 batches, 0 lines, 0 `trust_money.moved` audits, 0 `trust.moved` events, and the open amount was unchanged. Nothing ran on its own after the rollback.
* The next plain move gave 201: the pool was not poisoned.
* Undo with a 7 s hold: 0 undo batches and 0 audits, and the open amount was unchanged.
* Moved plus open still equals the withdrawal (100000).
* 6 of 9 checks pass, exit 1. The 3 failures are all the minor below.

**Minor R5-1 (already there before the merge, not caused by it): a write that waits on the trust lock past Prisma's 5 s timeout answers 500.**
* Every waiting request answered **500** "Internal server error": 3 of 3 batches at 7 s, 3 of 3 at 12 s, and 2 of 2 undos.
* `to-move.ts:177` `write()` rethrows Prisma's expired-transaction error because it matches none of its patterns.
* Same attack on 3ed855a66 in a temporary worktree (no `refuseAfterEnd`): the same 500s and the same zero rows. The merge did not cause it.
* Expected: a 409 saying someone else is saving money for this client and to try again, with nothing saved.
* It only happens when a lock is held for more than 5 s. Money is never wrong.

**Verdict: pass.** Main's merged code keeps every part 3 money guarantee. The three suites pass: 139 of 139, all exit 0. The new tx-end guard holds under a lock wait past the timeout: nothing is half-written, audits and events match wins, the moved amount stays within the withdrawal, and the pool recovers. R5-1 is a Minor that was already there before the merge.
