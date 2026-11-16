# FO-7a2 review: the trust ledger's reversal and credit-note rules (PR #1991)

**Commit reviewed:** `371cbbd6bae4cb0499210b34d39419ca10c6e2db` (branch `claude/runtime-fo7a2`, base `main` f255a85e8; `main` has not moved since). Reviewer: Opus 5.5, high effort, fresh context (P-303). Database only: no route, no screen.
**Read:** the brief (`lead-b-briefs/FO-7a2.md` on `lead-b-front-office`), the three PR comments (Lead 69's widening and its conditions, Lead B's two lines), `screens/FO-7a2/design.md`, AG-6-21/48/60/63/68/73/75, the diff, and FO-7a's and FO-7mv's migrations. Unconfirmed: no counsel.

## Suites run on this head (PostgreSQL 18, :54329)
`check_fo7a2_ledger_rules` 27/0 · `check_fo7a_money_schema` 123/0 · `check_fo7mv_move_list` 45/0 · `check_prisma_schema` 8/0 · `check_pf12_walls` 95/5: the 5 are the API-start checks (tsx `ERR_MODULE_NOT_FOUND` through the symlinked node_modules, a worktree issue); every database check passes. Probes ran in the scratch database `xr_studio_rev_fo7a2` (dropped), as `xr_studio` and as `xr_app` through the walls; one mutation run used a scratch copy of the tests and migrations.

## Brief checks
| Check | Result |
|---|---|
| DW1 (B-10) pass/fail | Met. −300.00, the shortfall row names the reversal, a 1.00 refund is refused with "Only CAD 0.00 is available", and money in while below zero is recorded. |
| DW2 | Met. 100.01 is refused naming 100.00; 100.00 is accepted; WRONG_ACCOUNT is not a reversal. |
| DW3 (B-17) | Met. E_TRANSFER and CASH are refused; CARD never reaches trust; a cheque is accepted; the tick after Returned is refused. |
| DW4 | Met. Without a RETURN the note is refused naming 282.50; with a RETURN, trust goes up by 282.50 and the line falls by it; the write-off is refused. |
| DW5 (2c) | Met as tested, but see B1 and M2. Move back gives +50.00 to trust and an O2T line of 50.00, and ledger + list = bank holds. Refund records the choice. No choice is refused; KEEP is not an enum value. |
| DW6 (B-3) | Met. |
| DW7 | Partly. The stamp is later and unique, `money_` names hold, and FO-7a's suite passes. "Changed tests" is missing from the PR body (M3). See m1. |
| Ledger identity through 2c | Holds in every sequence I tried: move back, partial O2T, undo of T2O or O2T after Move back, return after undo (e.g. 1000 + 120 − 50 = 1070). It does not hold for the client once Refund is followed by undo and a return (B1). |
| Below zero only for the four reversal kinds | Met. The CHECK and the trigger both use RETURNED, RECORDED_BY_MISTAKE, WRONG_CLIENT and OTHER (AG-6-75 rule 2 "or typed"). Refund, application and WRONG_ACCOUNT stop at the balance. |
| Locking RC/RR | A reversal racing a refund: at RC the refund waits and is refused with "Only CAD 200.00"; at RR it gets 23505. Credit note vs move or return: party lock, then invoice row (`money_issued_invoice`), so no lock-order inversion. B-17 at RR: see m3. |
| PF-12 on functions; security_invoker views | Every trigger function is DEFINER, owned by xr_wall_reader, with search_path pinned. Both views use security_invoker. The three non-trigger helpers are also DEFINER and leak across firms (M1). |
| Lead 69 / Lead B on O2T | Met. The line must name a credit-note withdrawal and is capped at O (no note: "0 CAD owed back"). An O2T WRONG_ACCOUNT line is refused, and another firm's withdrawal is "not visible". |
| Size, words | 666 + 9 = 675 changed lines (< 800). "Unconfirmed: no counsel" in the migration, test and design. No personal names. |

## Blocker
**B1. A credit note can exceed the invoice and the client is paid twice (Refund to the client, then undo, then a return).** Reproduced as `xr_studio`, all writes allowed by the database:
1. Invoice 100.00 is paid from trust and moved; a full CN-0002 for 100.00 is issued with `OVERPAID_REFUND` 100.00.
2. The move batch is undone.
3. 100.00 is returned to trust from the withdrawal. It is accepted, and the client's trust is 100.00 while the 100.00 refund from operating is still recorded.
4. A second CN-0003 for 100.00 is accepted. Credited in all: **200.00 on a 100.00 invoice**, against AG-6-48 rule 1 and FO-7a's "never more than its total".

Causes: `money_trust_entry_moves` (migration.sql:356) subtracts only `OVERPAID_TO_TRUST` from moved money, so once an undo takes moved below what the choices cover, refund-chosen money becomes returnable; and `money_credit_note_write` (165–166, 182) lets `trust` go below zero (0 − 100 = −100), which widens `open − trust` beyond `open`.

**Fix:** in the return rule use `greatest(moved, money_owed_back(f, w, false)) − money_owed_back(f, w, true)`, and floor `trust` at 0 in the credit-note and write-off checks. Add a DW5 fail for this sequence.

## Majors
**M1. PF-12's walls are bypassed through the new helpers.** `money_trust_paid`, `money_moved_live` and `money_owed_back` (22–33, made DEFINER at 398) run as the BYPASSRLS reader. They take the firm id as an argument and EXECUTE is PUBLIC (`proacl` null). As `xr_app` with `app.firm_id` = firm A, `money_trust_paid(firmB, invB)` returned 42000 and `money_moved_live(firmB, wB, …)` returned 30000, while a direct read of firm B's trust entries gave 0 rows.

PF-12 makes only trigger functions DEFINER. Its one definer lookup is REVOKEd from PUBLIC and takes no firm id. FO-7a's helpers (`money_issued_invoice`, `money_invoice_total`) stay INVOKER, so they run as the reader inside triggers and with the caller's rights inside `money_to_move`.

**Fix:** drop the three helpers from the `$readers$` list (or REVOKE EXECUTE FROM PUBLIC), and change DW7's assertion (test:54–55) to match.

**M2. `overpaid_minor` is not bound to the credit note.** A **10.00** credit note with `OVERPAID_TO_TRUST` 200.00 was accepted:
* +200.00 went to trust and an O2T line of 200.00 was listed;
* the invoice now has 190.00 due and 0 paid from trust.

That is a return of moved money without undoing the move, which FO-7mv refuses. `OVERPAID_REFUND` behaves the same way, so the client is refunded 200.00 and still owes 190.00.

AG-6-48 rule 4 and P-634 apply the choice only to the credited part. The check at 177 caps it only by what moved. A related gap: `money_write_off_write` (202) does not subtract refund choices, while the credit note does (165), so the two disagree.

**Fix:** require `overpaid_minor` = the part that needs freeing, `NEW.amount_minor − (open_amount − trust)`, or at least `≤ NEW.amount_minor`. Make the write-off use the same `trust`. Add a fail test.

**M3. The PR body is stale.**
It still reads "Draft: plan only, one question open", has no Done-when list for the reviewer to tick (P-606), and has no "Changed tests" section, which DW7 requires. The five changed tests to name are below. Lead 69's "migration ready to read" comment (P-423) is also not posted yet.

## Changed tests: does each keep its intent?
* FO-7a `_minor` count 10 → 11 (the new `overpaid_minor`): **keeps it**.
* FO-7a "21 functions": FO-7a's own functions re-created by FO-7a2 are removed from `later`: **keeps it**.
* FO-7mv B-19, RETURNED → RECORDED_BY_MISTAKE (D0 is an e-Transfer, so Returned is now refused): **keeps it**.
* FO-7mv B-20: the tick is now refused, and "not listed, does not move" is still asserted: **keeps it**. Mutation check: with the RETURNED half of the wrong-account guard removed, B-22's RC test fails (44/45), so the guard is still covered.
* FO-7mv DW6: `low < 0` was dropped: **weakens it**. See m2.

## Minors
* **m1.** DW7 applies the later migrations (test:50) before measuring (51–57), but rows rev 16.7 says to measure right after its own migration. Also:
  * the DW7 "fail" is a text match on PRE's constraint, not a refused reversal;
  * the migrated copy holds no money rows.
* **m2.** FO-7mv DW6 (check_fo7mv_move_list.ts:331) no longer checks the balance, yet its label (334) still says "the balance never goes below zero". **Fix:** assert that every row below zero is a reversal or money in (as FO-7a2 test:175 does), and fix the label.
* **m3.** B-17 at RR: a tick whose snapshot predates a committed Returned succeeds, and I reproduced it (final state: cleared and returned). The state equals tick-then-Returned (allowed); design.md notes it. **Fix:** in the Returned path, take `FOR SHARE` on the payment row so RR fails to serialise and RC waits.
* **m4.** Lead B's "a line that names no credit note is refused" is shown only by FO-7mv test:186. Its regex `/moves from trust to operating/` passes because the new message happens to contain that text. **Fix:** add an explicit FO-7a2 case, plus the O2T WRONG_ACCOUNT refusal.
* **m5.** money_move_line_write:334: once money is owed back, the parts in "0 CAD to move: 20000 less 12000 returned, 20000 moved" do not add up, because the cap includes O.

## Screen-review items
D1–D20 and BIC-01–BIC-20: N/A (no screen, route or case-side page); the code dimension (correctness, concurrency, server rules) is the findings above. Graph (P-86): not run, because `graph.mjs` rewrites `qa/GRAPH.md` (outside what I may write) and this row has no page or route. Retrofit mapping: N/A.

## Journey test (reviewer, database journeys; no browser possible)
Journeys, through the walls as the API's role: (1) Biller records a bounced cheque after the money moved (DW1); (2) Biller credits an invoice paid from trust, not yet moved (DW4); (3) Biller credits after the money moved, Move back then Refund (DW5); (4) a second firm tries the move-back line on firm A's withdrawal: refused; (5) a reversal and a refund at once (RC and RR); (6) break it: B1, M1, M2.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | DW1–DW6 work as the brief names them |
| Next step obvious | 1 | Refusals name the step: "return … first", "choose Refund … or Move back", "undo that move batch first" |
| Plain words | ½ | Database words: `OVERPAID_REFUND`, minor units ("20000 CAD"), m5 |
| Feedback and state | 1 | The shortfall view names the reversal; the O2T line shows in `money_to_move` |
| Correct data | 0 | B1 (200.00 credited on 100.00), M2 (a 10.00 note moves 200.00), M1 (cross-firm read) |
| Error recovery | 1 | A refusal rolls back its statement; races end in a refusal, 23505 or a wait, never a wrong row |
| Accessibility and sizes · speed · visual | N/A | No screen (the suite runs in 7.5 s) |
| Trust and sources | 1 | AG rules and B-numbers cited; "Unconfirmed: no counsel" |

**Score: 5.5 of 7 applicable (7.9/10 scaled). Fail:** a 0 on correct data, and below 8. Raise it by fixing B1, then M2, then M1. Not tested: a real user, a screen reader and the routes' 409 mapping, all of which are FO-7b's and FO-7t's.

## To fix before Approve
1. **B1:** the return rule counts refund choices (`greatest(moved, owed_all) − owed_to_trust`), and `trust` is floored at 0 in the credit-note and write-off checks. Add a test.
2. **M1:** the three helpers stop being DEFINER (or lose PUBLIC EXECUTE). Update the DW7 assertion.
3. **M2:** `overpaid_minor` is bound to the credited part, and the write-off uses the same `trust`. Add a test.
4. **M3:** the PR body gets the Done-when list and "Changed tests" (the five above).
5. Minors m1–m5, recommended in the same push.

Verdict: Block
