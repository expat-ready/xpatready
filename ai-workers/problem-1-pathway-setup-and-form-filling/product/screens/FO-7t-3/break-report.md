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
