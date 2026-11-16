# FO-7mv review: the "To move" list in the database (PR #1924)

**Reviewed:** commit `194128ddb7d2de31acd30e5d23b62abe46953c14`, branch `claude/stoic-ptolemy-jdoyw9`. Diff `origin/main...194128ddb` touches the studio code in 4 files (+714/−5). It also carries one records commit, `7ffb776cf` (`screens/FO-7b/challenge.md`, +15), so the total is 729 changed lines, under 800. Line numbers below refer to `prisma/migrations/20261116030000_fo7mv_move_list/migration.sql` and `tests/check_fo7mv_move_list.ts` at that commit. Source of truth: `design/briefs/FO-7mv.md`. Background: FO-7a break report B-18 and B-19. Opus 5.5, high effort.

**The head moved during the review.** It is now `d24724c21`, which changes the test file only (+8/−2, Lead B rev 16.51: a refused correction or return leaves no row and no ledger effect). I read that diff and ran it: 36/36. It raises no finding. This verdict names `194128ddb`, as asked.

**Journey score: N/A.** The row is database only: no screen and no route, and the caller ruled out an app walk. So the journey-test report is not written, as in FO-7a's review. In its place I ran database-level journeys and break-it probes (below) on my own scratch databases (`xr_studio_rev_*` on :54329, all dropped afterwards). I did not use :4400 or `xr_studio`/`xr_studio_demo`. Cost: US$0.

## What I ran
* `npx tsx tests/check_fo7mv_move_list.ts`: **35/35, exit 0** at `194128ddb`. I ran it from a `git archive` copy of that commit, using `xr_studio_rev_` names; the 36/36 above is on the moved head.
* `npx tsx tests/check_fo7a_money_schema.ts`: **123/123, exit 0**. "21 functions named money_" still holds.
* `tests/check_prisma_schema.ts` (scratch copy): **8/8**. Only the 5 known differences.
* **Mutation runs.** I took each rule out of a copy of the migration and re-ran the suite (table below).
* **SQL and two-connection repros** on `xr_studio_rev_mv`, which had all migrations applied (table below).
* **Not checked:** CI on this commit (every `ci` job shows *skipped*, `pr-rules` *failure*, because the PR is a draft); the demo reset and the checkpoint load (they need the shared database).

## The brief, point by point
| Check | Result | Evidence |
|---|---|---|
| Rule 1 cap (B-18) | holds | `:229-240`, which counts lines net of undone batches and subtracts the returns. Mutation M1 (returns left out) → DW1 other-order, DW2 RC and DW9 fail. |
| Rule 2 no return of moved money | holds | `:275-285`, an AFTER trigger. M2 → DW1 ×2 and DW6 fail. Repro R9: move then return in one transaction → 23514 with "undo that move batch first". |
| Rule 3 correction kinds (B-19) | holds | `:207-210`; a deposit correction must carry a kind (`:269-274`). M6 → DW3, DW4 and DW6 fail. M7 → the B-19 kind test fails. |
| Rule 4 never below zero | holds | Moves write no ledger entry, so FO-7a's balance check is untouched. DW6 checks, every step for 240 steps, that the ledger never goes below zero and that **ledger + list = the bank's trust account**. |
| Rule 5 currency, direction, firm, party | holds | Batch: `:194-196`; source: `:214-216`; party and invoice: `:217-223`; firm: composite foreign keys `:97-103`. **The source-currency check has no test (m1).** |
| Locking, READ COMMITTED | holds | The party lock (`:225`) is FO-7a's key byte for byte (`fo7a …:1116`). After it, every mutable read takes a fresh snapshot. DW2 RC passes. |
| Locking, REPEATABLE READ | holds | Both a move (`:226-228`) and a return (`:276`) touch the invoice row. M3 or M4 (one touch removed) → DW2 RR move/return fails, so each touch is load-bearing. |
| Deadlock order | party lock, then invoice row | Same order as FO-7a's `money_issued_invoice`. Opposite-order multi-party batches deadlock (R7: 40P01, the cap holds); the PR notes this for FO-7t. |
| Error codes | as FO-7a | 23514 rule; 42501 insert-only; 23505 or 40001 stale writer; 23503 not visible. |
| P-603 mapping, with fail test | met | TRUST_APPLIED needs a WITHDRAWAL_TO_INVOICE; WRONG_ACCOUNT needs a WRONG_ACCOUNT correction of a deposit. The wrong pairings are refused (`test:182-186`). |
| P-607 (1) | met for this row | No path lowers the ledger. The operating → trust shortfall line is FO-7v's (see m7). |
| DW1-DW10, a pass and a fail each | met | All named, all green. DW3 and DW4 are fail-only; DW5 and the B-19 kind test are their pass side. |
| DW10 rev 16.7 | met | Measured right after its own migration (`test:103-107`), then the later migrations are applied. `migrate diff` is empty on a database with rows and on an empty one. 5 new functions, all `money_`. The guard refuses a pre-existing deposit correction with words (`test:98-102`). |
| Touch list, size | met, two notes | The FO-7a test edits are flagged as a "Question for the tech lead" in the PR. The records commit is disclosed (m8). 729 lines, under 800. |
| Unconfirmed: no counsel; no personal names | met | Migration `:3`, test `:2`; only roles appear in the diff. |

## Design choices (a)-(f)
* **(a) A new AFTER trigger instead of editing `money_trust_entry_write`: accept.** No FO-7a function is replaced, which suits P-600 parallel safety and keeps the 21-function check. FO-7a's refusals still come first. Being AFTER and not deferred, it sees rows written earlier in the same statement. Repros R3 and R4 (a return and a move in one data-modifying CTE, in either order) → both refused. The deviation from the brief is stated in the migration header and the PR body.
* **(b) Party lock, then touch the invoice: accept.** Mutations prove each touch is needed at RR. Repros R6: undo ‖ re-move gives RC OK/OK with 100.00 net, and RR one refused. A stale reader of an undo is only stricter.
* **(c) Unique `move_ordinal`: accept.** Ordinals stay dense among committed lines (count + 1, taken under the lock), so a stale writer always collides. For TRUST_APPLIED it backs up the touch. For WRONG_ACCOUNT it is the **only** guard at RR. Repro R1, two WRONG_ACCOUNT moves of one 150.00 correction at once: RC → 23514, RR → 23505, SERIALIZABLE → 40001; 150.00 moved each time. But no test covers it (m2).
* **(d) CARD_FEE_ON_TRUST and OPERATING_TO_TRUST refused: accept.** Neither has a source entry yet (P-567; FO-7c; FO-7v). Both refusals are tested (`test:185-186`) and both are recorded as contract gaps.
* **(e) View columns cast to integer: accept.** Each sum is bounded: returns ≤ the withdrawal, moved ≤ the cap, and every amount is an integer below 2^31. FO-7a's "every *_minor column is integer" check also reads views, so the cast is required.
* **(f) An empty batch is refused at commit: accept.** Undo batches are exempt. Repro R8b (the only line rolled back to a savepoint) → refused at commit.

## FO-7a test edits (`check_fo7a_money_schema.ts:117, :125, :402-403, :494`): they keep FO-7a's intent; recommend accept
The brief's "passes unchanged" could not hold: the brief itself makes `correction_kind` required on deposit corrections. The edits:
1. Count FO-7a's own ten `*_minor` columns. "Every money_ amount is integer" still runs over all `money_` columns.
2. Name FO-7a's own date column (`due_date`) rather than assume FO-7a is the newest migration. That is rev 16.7's rule.
3. Give the deposit-correction cap test a kind (`BOUNCED`). Its assertions are unchanged.
Edit 2 drops the "every instant is timestamptz" check for later money tables. See m5.

## Findings
**Blockers:** none. **Majors:** none.

**Minors** (test strength and forward notes; none breaks a rule):
* **m1. Rule 5's source-currency check is untested.** Mutation M11 (`:214` → `IF false`) still gives 35/35. DW8 only crosses a line with its batch. Fix: a USD withdrawal moved as a CAD line in a CAD batch → refused.
* **m2. No parallel WRONG_ACCOUNT case.** DW2 races TRUST_APPLIED only, where the invoice touch already catches a stale writer. For a WRONG_ACCOUNT source the ordinal is the one guard at RR, and no test exercises it. Fix: add repro R1 to DW2 (two 150.00 moves of one WRONG_ACCOUNT correction at RC and at RR).
* **m3. The deferred `money_move_line_not_undone` (`:248-255`) is untested.** Mutation M16 (trigger not created) still gives 35/35: `test:206` is caught by the BEFORE check at `:191`, which uses the same words. It is live: in repro R10, a line, its batch's undo and then commit in one transaction is refused only by it. Fix: test "line, then undo, then commit", or give the two checks different words.
* **m4. DW6's generator does not notice mutation M1 (rule 1 without "less returns").** DW1, DW2 and DW9 do catch it. Optional fix: sometimes move a returned withdrawal at the model's cap + 1.
* **m5. The move tables' instants are not asserted timestamptz.** After FO-7a edit 2, FO-7mv's own column check (`test:115-117`) covers `*_minor` and `date`, but not "no timestamp without time zone". The columns are correct today (`:51`, `:70`). Fix: one more clause in that check.
* **m6. Corrections are found by `corrects_entry_id` with no index.** Neither FO-7a nor this migration adds one. EXPLAIN of `money_to_move` shows a firm-wide scan plus a filter for each withdrawal, so reading the list grows with the square of a firm's trust entries. The triggers (`:232`, `:280`) do the same scan. Fix: `@@index([firmId, correctsEntryId])` in this migration; the touch list allows it.
* **m7. A forward note for FO-7v (record it, no change here).** BACKLOG FO-7v (`BACKLOG.md:742`) reverses an applied and already-moved deposit as follows: "one CORRECTION per withdrawal … then … one OPERATING_TO_TRUST to-move line". Rule 2 (`:281`) refuses that return unless the move is undone, and `:211-213` refuses every operating → trust line. An undo would wrongly say that no money moved. So FO-7v must amend `money_trust_entry_moves` and `money_move_line_write`. FO-7v's brief should say so; today the PR names only "the shortfall".
* **m8. Records commit `7ffb776cf` (FO-7b challenge) is outside the touch list.** It is disclosed in the PR body and harmless. No action.

**Observation (not a finding).** Mutation M17, which removes the party lock at `:225`, still gives 35/35. The invoice touch (TRUST_APPLIED) and the ordinal (WRONG_ACCOUNT) already serialise writers, so the lock's remaining jobs are the deadlock order and the brief's "takes the party trust lock". Keep it.

## Database journeys (in place of the UI journey test)
These are the firm's bookkeeper journeys, as FO-7t will drive them through these tables. All held, and every refusal is a 23514 that says what to do:
* record "I moved these";
* move a withdrawal that was partly returned;
* return money after a move: "undo that move batch first";
* undo, then return;
* move a WRONG_ACCOUNT correction, at most its amount;
* try a BOUNCED or ENTRY_ERROR move;
* two people at once (RC, RR, SERIALIZABLE);
* an empty batch;
* a second undo;
* undo an undo;
* a CAD/USD mix;
* another firm's entry: 23503.

Verdict: Approve 194128ddb7d2de31acd30e5d23b62abe46953c14

## Re-review (diff only, `194128ddb..2abc41df3`; P-277)
**Reviewed:** commit `2abc41df32e8df1d80d02126db850fe29b4fe3e7`. I read only `git diff 194128ddb 2abc41df3 -- …/studio`, which covers the migration, `client-money.prisma` and the test file. The only other change is the records (this review and `break-report.md`). Line numbers below refer to `migration.sql` at `2abc41df3`.
* **Scratch databases:** `xr_studio_rev_*` on :54329, all dropped afterwards. I did not use :4400 or the shared databases. Cost: US$0.
* **Suites:** `check_fo7mv_move_list.ts` **47/47** (run from a `git archive` copy of `2abc41df3`). `check_fo7a_money_schema.ts` **123/123** (run in the working tree, whose HEAD is `2abc41df3`).
* **Size:** the studio diff from `origin/main` is +775/−5, under 800.

### What the fixes close
| Item | Result | Evidence |
|---|---|---|
| d24724c21 (rev 16.51) | closed | A refused correction or return leaves no row and no ledger effect, with a pass and a fail. |
| B-4 credit note or write-off | closed | `:220-231` caps a move at the invoice total less credit notes, the write-off and the invoice's live moves. The view takes the same cap with `least()` (`:320-330`). A credit note goes through `money_issued_invoice`, which takes the party lock and then touches the invoice, as the move does, so the cap holds at READ COMMITTED and REPEATABLE READ. A move first, then a credit note, is not a trust breach: the ledger and the bank still agree, and the firm owes the client from operating. |
| B-6 the guard | closed | `LOCK … SHARE ROW EXCLUSIVE` (`:25`) waits for a write still in flight. Under Prisma the whole file is one implicit transaction. |
| B-7 / my m6 | closed | `@@index([firmId, correctsEntryId])`; `migrate diff` stays empty (DW10). |
| B-9 | closed | `money_move_batch_date_check` (`:95`), tested. |
| My m1, m2, m3 | closed | Tests for a USD line on a CAD entry, the WRONG_ACCOUNT race at RC and RR, and "line, undo, commit". |
| B-1 exact repro | closed | Refused with the cheque's words. The move commits once the cheque is cleared. |
| B-2 | **not closed** | Major 1 below. |

### Findings
**Major 1. B-2 is still open in the breaker's own repro: an uncleared cheque labelled WRONG_ACCOUNT still moves out of trust.**
* Repro on `xr_studio_rev_mv2` (all migrations at `2abc41df3`):
  1. `dep(:P, 50000, 'E_TRANSFER')`
  2. `dep(:P, 30000, 'CHEQUE')` → `:C` (`cleared = false`)
  3. `corr(:P, :C, 30000, 'WRONG_ACCOUNT')` → `:X`
* Results: `money_to_move` shows 30000 for `:X`, and `move([:X],[30000])` → **OK**. The bounce `corr(:P, :C, 30000, 'BOUNCED')` is then refused (23514, "30000 deposited, 30000 corrected before"), so it can never be recorded. The ledger still says 500.00 is held.
* If the cheque bounces, the bank holds 200.00 for this client, so 300.00 comes out of other clients' money.
* Why: the new check (`:247`) is `held + to_move − line ≥ uncleared`, here 500 + 300 − 300 = 500 ≥ 300. It never asks whether *this* line's own deposit has cleared, and the WRONG_ACCOUNT kind check (`:185`) does not ask either.
* The new test (`check_fo7mv_move_list.ts`, "break B-2") uses a party whose only money is the cheque (held 0). That is why it passes.

**Major 2. B-1 in a new order: open WRONG_ACCOUNT money counts as cover for a trust application.**
* `to_move` (`:238-243`) adds open WRONG_ACCOUNT amounts. That is operating's money: it can never come back to the ledger, so it cannot absorb a bounce.
* Repro:
  1. `dep(:P, 11000, 'E_TRANSFER')` → `:E`
  2. `dep(:P, 10000, 'CHEQUE')` (uncleared)
  3. `corr(:P, :E, 6000, 'WRONG_ACCOUNT')` → `:X`
  4. `inv(:P, 10000)` → `:I`; `wd(:P, :I, 10000)` → `:W` (held is now 50.00)
  5. `move([:W],[10000])` → **OK**, because 50 + (60 + 100) − 100 = 110 ≥ 100.
* After that, a return of `:W` is refused ("undo that move batch first"), so a bounce of the 100.00 cheque can never be recorded (held 50.00 < 100.00).
* If the cheque bounces, this client's real money in the bank is 110 − 100 = 10.00, against a ledger of 50.00. Other clients' money covers the 40.00 gap.
* Suggested fix (the builder chooses the form):
  * refuse a WRONG_ACCOUNT line, and keep it off the list, while its deposit's payment is uncleared (the breaker's B-2 "Should");
  * count only the TRUST_APPLIED amounts still open as cover, net of the line: held + open TRUST_APPLIED − line ≥ uncleared;
  * net the uncleared amount of all of that cheque's corrections.
* Add both repros above as fail tests.

**Minor m9. The list still shows money that rests on an uncleared cheque.**
* On the B-1 repro, `money_to_move` gives `open_minor = 10000` while the move is refused.
* The list is the bookkeeper's instruction for the bank transfer (ExpatReady moves no money), so the transfer can happen at the bank and then fail to record.
* The breaker asked for it to be "kept off the list"; this could reasonably be graded Major. Fix: apply the same cover rule in the view, or flag those rows, and test the list before and after the cheque clears.

**Minor m10. The firm-wide settings touch rewrites a field that is shown.**
* `:236` sets `money_payment_settings.updated_at = now()` on every move, so the settings' "last updated" time changes while `updated_by` still names the last person who edited the settings.
* FO-7a touches the same row with `SET updated_at = updated_at` (`fo7a …:743`). That still locks the row and still gives 40001 at RR, without changing the value. Use the same form here.
* Side effect, accepted: all of a firm's moves now go one at a time (at RR the later one gets 40001). Batches are rare, so this is fine.

**Notes, not findings:**
* B-3 (a refund names no deposit) correctly goes to a ruling.
* B-5 deadlocks and B-8 (wrong words, safe) stay notes for FO-7t.
* m4, m5 and m7 from my first pass are unchanged and still Minor.

**To fix before Approve:**
* **Major 1:** a WRONG_ACCOUNT line on a deposit whose payment is uncleared must be refused (and kept off the list) until it clears. Test it with the breaker's B-2 repro: a 500.00 e-transfer beside the cheque.
* **Major 2:** open WRONG_ACCOUNT amounts must not count as cover for an uncleared cheque. Test it with the 110/100/60/100 repro above.
* **m9 and m10:** fix in the same commit if cheap.

Verdict: Block

## Re-review 2 (diff only, `2abc41df3..9e2230aed`; P-277)
**Reviewed:** commit `9e2230aede9875383362925d1ab6069a5f92506a`. I read only `git diff 2abc41df3 9e2230aed -- …/studio`. It contains `a45f7d1e3` (my two Majors) and `9e2230aed` (the shrink under Lead 65's P-638).
* **Scope I applied:** the rulings on #1924 (Lead B rev 16.52, Lead 64, P-638). They move the cleared-money cover check and the invoice cap after credit notes to FO-7a2. B-1, B-4, B-10 and B-13 reproducing here is expected, and I do not count it.
* **Scratch databases:** `xr_studio_rev_*` on :54329, all dropped afterwards. I did not use :4400 or the shared databases. Cost: US$0.
* **Line numbers** refer to `migration.sql` at `9e2230aed`.

**Suites:**
* `check_fo7mv_move_list.ts` **43/43**, from a `git archive` copy of `9e2230aed`;
* `check_fo7a_money_schema.ts` **123/123**, in the working tree with HEAD at `9e2230aed`;
* `check_prisma_schema.ts` **8/8**;
* studio diff from `origin/main`: +736/−5, under 800.

### What I checked
| Check | Result | Evidence |
|---|---|---|
| No dead code after the shrink | met | `money_move_line_write` declares only `b s party earlier moved returned cap`, and all are used. No `due`, `held`, `to_move` or `uncleared` is left, no settings touch and no `least()`. The view is back to `m` with `open_minor = eligible − returned − moved`. The only remaining text about cover or credit notes is the test comment naming FO-7a2 (`test:243`). `migrate diff` is empty. |
| The wrong-account clearing rule | holds | Line `:190-192` uses `deposit_cleared IS NOT TRUE`; the view uses `EXISTS … p.cleared` (`:288-290`). Repro on the breaker's B-2, which was my re-review Major 1 (e-transfer 500.00, an uncleared 300.00 cheque corrected WRONG_ACCOUNT): listed 0, move 23514 "not yet cleared". After "Cleared": listed 300.00, the move commits. An un-clear is refused (42501), so `cleared` only ever goes from false to true. A stale snapshot is therefore only stricter at REPEATABLE READ. Tests (`test:244-251`) cover both the P7 case and the P8 case with cleared money beside the cheque. |
| B-18 | holds | Unchanged code. In repro, after move 100 of 100: a return gives 23514, a second withdrawal gives 23514, and a second move gives 23514. DW1, DW2 (RC and RR) and DW6 pass. |
| B-19 with the new kinds | holds | Repro: RETURNED, RECORDED_BY_MISTAKE, WRONG_CLIENT and OTHER corrections are each listed 0, and their move is refused (`:185-188`). DW3, DW4 and DW6 use the new names. |
| My re-review Majors | Major 1 closed; Major 2 moot | Major 2 (cover counting wrong-account money) belonged to the cover check, which P-638 moves to FO-7a2. My m9 (the list shows money resting on a cheque) also goes to FO-7a2 under the same ruling, and m10 is gone with the settings touch. |
| Renamed kinds | accept | P-638 is the ruling. The guard and the "says why" messages list all five kinds, and `client-money.prisma` explains each one. |

### Findings
**Blockers:** none. **Majors:** none.

**Minor m11. The harness change does not close B-16 on the real deploy path, and I correct my re-review wording.**
* The test now applies each migration with `psql -1`. The app applies them with `prisma migrate deploy` (`studio/start.sh:13`).
* I checked that path on a scratch database. A migration of `CREATE TABLE t1; SELECT 1/0;` failed, and `t1` was still there afterwards. So Prisma does **not** run a migration file as one transaction, and my re-review line "Under Prisma the whole file is one implicit transaction" was wrong.
* Under Prisma, the guard's `LOCK` (`:25`) ends with its DO block. A deposit correction queued behind the following `ALTER` can therefore land with no kind, which is B-16.
* The risk is nil today: no route writes trust entries yet, and the migration runs once. A cheap fix that works under any runner is the breaker's: run the guard after `CREATE TRIGGER money_trust_entry_moves`, so a new kindless deposit correction is refused by the trigger and the guard counts only what came before.

**Minor m12. Wording.**
* The refusal at `:191` ends "(re-review Major 1)", which is a process note inside the words a person will read. Drop it.
* The FO-7a helper writes reason "Cheque bounced" with kind `RECORDED_BY_MISTAKE` (`check_fo7a_money_schema.ts:494`). Per the new enum comment, a bounced cheque is `RETURNED`. The assertions do not change either way.

**Unchanged from earlier passes:** m4, m5 and m7 are still Minor and still not blocking. B-3, B-5, B-8, B-14 and B-17 stay questions or notes, or go to FO-7a2.

Verdict: Approve 9e2230aede9875383362925d1ab6069a5f92506a

## Re-review 3 (diff only, `9e2230aed..4847bfca8`; P-277)
**Reviewed:** commit `4847bfca86f558d8ec9d3b31a14d5098e472344b`. I read only `git diff 9e2230aed 4847bfca8 -- …/studio` and ran everything from a `git archive` copy of that commit.
* **Not reviewed:** while I worked, the shared working tree gained uncommitted edits to `migration.sql`, the test and `break-report.md`. They are someone else's work.
* **Scratch databases:** `xr_studio_rev_*` on :54329, all dropped afterwards. I did not use :4400 or the shared databases. Cost: US$0.
* **Line numbers** refer to `migration.sql` at `4847bfca8`.

**Suites:**
* `check_fo7mv_move_list.ts` **44/44** on seeds 7301, 11, 222 and 4242;
* `check_fo7a_money_schema.ts` **123/123**;
* `check_prisma_schema.ts` **8/8**;
* studio diff from `origin/main`: +763/−5, under 800.

| Item | Result | Evidence |
|---|---|---|
| B-20 (serial) | closed | `:178` treats a deposit with a RETURNED correction as not cleared, and the view does the same (`:297`). Repro: e-transfer 500.00; cheque 300.00; WRONG_ACCOUNT −100.00; RETURNED −200.00; then the cheque is ticked cleared. Result: listed 0, move 23514 "not cleared, or was returned". The new fail test is the same case. |
| B-21 (stale tick) | closed | The payment row is share-locked (`:194`). Repro: a REPEATABLE READ snapshot is taken, then the cheque is ticked cleared, then a move runs: **40001** (retryable), no longer 23514. |
| m11 | closed | The guard runs first (`:19-30`) and again last (`:311-321`), after `money_trust_entry_moves` exists, counting only corrections with no kind. So a correction written while the file runs is refused by the trigger or counted by the last guard, under `-1` and statement by statement alike. |
| m12 | closed | The words carry no process note. FO-7a's helper now gives "Recorded twice" for RECORDED_BY_MISTAKE on an e-transfer deposit, which is consistent. |
| DW6 model | accept | Wrong-account money of a returned deposit is frozen, and the equation is now ledger + list + frozen = bank. "Agrees with the model at every step" holds on four seeds. |
| B-18, B-19, the clearing rule | hold | Code unchanged apart from the RETURNED condition. DW1, DW2, DW3, DW4, DW5 and DW6 pass, and so do the P7, P8 and P9 clearing cases. |

### Findings
**Blockers:** none. **Majors:** none.

**Minor m13. A RETURNED racing a move is not serialised, but it reduces to an order the rulings accept. Record it for FO-7a2 and FO-7v.**
* Where: the RETURNED check (`:178`) runs before the party lock (`:213`). The payment share-lock does not conflict with a RETURNED correction, which writes no payment row.
* Repro at RC and at RR: the cheque is cleared. T2 writes a RETURNED −200.00 and holds it open. T1 moves the WRONG_ACCOUNT 100.00. T2 commits. Result: **both commit**.
* Why it is not a Major here: the same end state is reachable serially. Tick, then move, then a RETURNED of the cheque: all three commit. That is a reversal after money left trust, which P-607 (1) and the P-638 rulings send to FO-7a2 and FO-7v (the shortfall line), like B-10 and B-13.
* Suggested fix (cheap; optional here): take the party lock before reading the source's clearing state. That is also the brief's "the party trust lock …, first". It closes the RC race. RR still needs FO-7a2's ledger rule.
* FO-7a2 and FO-7v should list "RETURNED after a wrong-account move" among the shortfall cases.

**Minor m14. If the last guard fires on a statement-by-statement runner (Prisma), the migration is already half applied.**
* Its words say "then run the migration again", but after a failed `prisma migrate deploy` a rerun stops at `CREATE TYPE`. The migration first has to be resolved (`prisma migrate resolve`) and undone by the header's rollback steps.
* It is practically unreachable: no route writes trust entries yet. Fix: add "after undoing it (header) and `prisma migrate resolve`" to the last guard's words (`:319`).

**Unchanged:** m4, m5 and m7 are still Minor. B-3 is still with the tech lead, as the breaker notes.

Verdict: Approve 4847bfca86f558d8ec9d3b31a14d5098e472344b

## Re-review 4 (diff only, `4847bfca8..5ab4043aa`; P-277)
**Reviewed:** commit `5ab4043aa21a53fa7af89d3c2168a4bfc0382b0f`. I read only `git diff 4847bfca8 5ab4043aa -- …/studio`: the migration (+14/−11) and the test (+9/−1). I ran everything from a `git archive` copy of that commit. FO-7a's suite ran in the working tree, which was clean at `5ab4043aa`.
* **Scratch databases:** `xr_studio_rev_*` on :54329, all dropped afterwards. I did not use :4400 or the shared databases. Cost: US$0.
* **Line numbers** refer to `migration.sql` at `5ab4043aa`.

**Suites:**
* `check_fo7mv_move_list.ts` **45/45** on seeds 7301, 11 and 222. The new race test was stable all three times.
* `check_fo7a_money_schema.ts` **123/123**.
* `check_prisma_schema.ts` **8/8**.
* Studio diff from `origin/main`: +774/−5, under 800.

| Item | Result | Evidence |
|---|---|---|
| m13 / B-22 at READ COMMITTED | closed | The party lock (`:184`) is now taken right after the source entry is read: before every check, before the "arrived" read and before the invoice touch (`:218`). "Arrived" is re-read after the lock with the payment row `FOR SHARE` (`:196-201`). My m13 repro run three times (cheque cleared; T2's RETURNED −200.00 held open; T1 moves the WRONG_ACCOUNT 100.00; T2 commits): **move 23514**, RETURNED committed. The new test is the same case. |
| Lock order | unchanged, no new cycle | Party lock, then invoice row (trust application) or payment row FOR SHARE (wrong account). A "Cleared" tick updates only the payment row and takes no party lock. A RETURNED takes the party lock and touches no payment row. So neither can wait on the other in a cycle. Before the lock, the function reads only insert-only rows: the batch, which is its own transaction's, and the source entry. |
| B-20, B-21, B-18, B-19 | hold | B-20 serial: listed 0, refused. B-21: stale RR after a tick → 40001. DW1, DW2 (RC and RR), DW3-DW6 and the P7, P8, P9 and P12 clearing cases all pass. |
| m14 | closed | Both guards now say the rows "cannot be given one: ask the tech lead (restore without them, or a reviewed one-off)". That routes the half-applied case to the tech lead rather than telling the operator to re-run. |
| Dead code | none | `deposit_cleared` is gone. `arrived` and `deposit_payment_id` are used. `party` is set once, before the lock. |

### Findings
**Blockers:** none. **Majors:** none. **New Minors:** none.

**At REPEATABLE READ (noted, out of scope here).** The same race still commits both writes: a RETURNED commit after the snapshot is invisible to the move, and it touches no row the move locks. That is reproduced three times. The end state equals the serial order "tick, move, then RETURNED", which commits too. Per P-638 both belong to FO-7a2 as reversal-after-move shortfall cases. The coordinator will say so in the PR.

**Unchanged:** m4, m5 and m7 are still Minor. B-3 is still with the tech lead.

Verdict: Approve 5ab4043aa21a53fa7af89d3c2168a4bfc0382b0f
