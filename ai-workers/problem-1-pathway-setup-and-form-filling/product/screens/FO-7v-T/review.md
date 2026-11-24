# FO-7v part T review: reversing a trust deposit recorded by hand, and the shortfall list (PR #3552)

**Commit reviewed:** `9b0ac177b537c2155b63d548b8f079de5f760027` (branch `claude/runtime-fo7v-trust`). Reviewer: Opus 5.5, high effort, fresh context (money). The part is API only, with no migration and no screen. Unconfirmed: no counsel.
**Read:** the PR body; P-603, P-634 (1), P-653 (2), P-694; AG-6-75 (rules 1-7, §8-§10); the diff; the latest `money_trust_entry_write` (fo7ts_part3), `money_trust_lock` (fo7lk), `money_trust_shortfall` (fo7a2); and, for patterns, `trust/service.ts`, `trust/money-out.ts`, `trust/reads.ts` and `visibility-adapter.ts`.
**Ports:** only the check's own Nest app on port 0 and PostgreSQL on :54329. :4400 was never used. No model call, no Stripe call, US$0.

## Verdict: Changes (Ship after fixes)
This is not an Approve, so the PR gets no `review: approved` label. Two Majors are open, both C5. The plan, the hash, the lock, the transaction and the event are sound.

## What I ran
* `check_fo7v_reversals.ts`: **19/0**, twice (in the repo, and again as the base of my probe copy). `graph.mjs --check`: exit 0. `tsc`: no error in the new files.
* **Probes**, appended to a copy of the check in the scratchpad (repo untouched): R1 an unseen officer; R2 six concurrent reverses; R3 a reverse racing a deposit; R4 cash with "Returned"; R5 field and query errors; R6 an officer on one case of a two-case client; R7 a retry; R8 the audit row.
* **Mutants:** 9, on a copy of `reverse.ts` (table below).

## Majors
**M1. C5 is checked after the refusals, so an unseen payment answers 409 with its state instead of 404.**
* `planReversal` refuses first (`reverse.ts:52-63`): `USE_A_REFUND`, `NOT_YET`, `ALREADY_REVERSED` and `NOTHING_LEFT`. `seenOrNotFound` runs only after it returns (`:94`, `:105`).
* Probe R1: officer user-O sees no case and no client. Card payment: `409 USE_A_REFUND` (preview and reverse); operating payment: `409 NOT_YET`; reversed deposit: `409 ALREADY_REVERSED`.
* So a payment the caller may not see is shown to exist, along with its method (card), where it was received (operating) and whether it is reversed. This breaks C5 "404 before anything else". FO-7t keeps that rule deliberately: `service.ts:124-132`, "an unseen request is 404 before the cancelled check".
* The PR's C5 test (DW11) uses only a plain trust deposit, so it misses this.
* **Fix:** first read the payment's visibility key (the deposit entry's case or party; for an operating or card payment, its invoice's), apply `seenOrNotFound`, then the refusals. Add fail tests: an unseen officer gets 404 on a card payment, an operating payment and a reversed deposit, for preview and reverse.

**M2. The shortfall list shows an officer the party-wide figure, including money on cases they cannot see, and gates the row on the latest reversal alone.**
* `shortfall()` (`reverse.ts:127-140`) returns the view's `balance_minor` for the whole party and currency. It shows the row when the *latest* reversal's case is seen.
* Probe R6, Client e with two cases, user-O on E1's team only. On E2 (unseen): a 200.00 cheque, refunded, then reversed as Returned. On E1: a 100.00 deposit, then reversed. user-O's `/trust/shortfall` row: `balanceMinor −20000`, `caseId E1`, `reasonCode RECORDED_BY_MISTAKE`; user-O's own `/trust/balances` for that client: E1 `0`, total `0`.
* So the row leaks E2's −200.00 and wrongly puts the red on E1 and its "Recorded by mistake". The view's latest-reversal column is FO-7a2's; gating the row on that column and showing the whole party's balance are this PR's.
* This is the same class as FO-7t part 1 round 13 M1, which was fixed: the ledger's running balance is the caller's visible sum (`reads.ts:27`, `seen(scope, "e")`).
* AG-6-75 r4 also puts the red on the case's balance. The PR's Question 2 asks the Lead to accept this; I recommend not accepting it.
* **Fix (either):** (a) compute the figure over the caller's seen entries, as `reads.ts` does, and list a row only when that figure is below zero; or (b) list a row only to a caller who sees every entry of that party and currency. Either way, add a test of R6's shape; it also catches mutant M19.

## Minors
* **m1. Rules with no test that bites** (mutants that stay 19/0): the party lock removed (M2); the plan not rebuilt under the lock (M15); `trustShows` removed from the preview (M10); the `MONEY_RULE` mapping removed (M12: a database refusal would then be a 500, and no test reaches one through the route); the shortfall's case rule widened to "party seen" (M19); audit or event outside the transaction (M17, M18: hard to catch, noted only). The code is right in each case: R2 gives one 201 and five `ALREADY_REVERSED` (+1 correction, +1 audit, +1 event), and R3 answers `CHANGED`. **Fix:** add a concurrent-reverse test and a preview-versus-deposit race test, plus one database refusal through the route asserting 409 `MONEY_RULE`.
* **m2. Branches that cannot be reached, or are untested.** The `CARD_TERMINAL` branch (`:65`, `:107-108`) cannot be reached: since `20261118200100_fo7ts_card_terminal_trust`, a card-terminal payment is never in trust, and `DEPOSIT_METHODS` excludes it. Its words ("Use a refund: … reversed only as Recorded by mistake") mix two answers. Drop the branch, or comment that it is defence only. `NOTHING_LEFT` has no test. Cash with "Returned" has no test; R4 shows it holds: `NOT_RETURNED`, and `reasonsAllowed` has no `RETURNED`.
* **m3. Note, no fix needed now.** The hash is an unkeyed sha256 of values a caller can read: ids, seq, balance. It works as a freshness token (AG-6-75 §10), not as proof that a preview was made. That is acceptable while the screen (FO-7s3) is the one way in.

## Rule by rule
| Rule | Pass test | Fail test | Holds |
|---|---|---|---|
| P-694: always accepted, may go below zero; on the shortfall list; invoices stay paid | DW P-694 ×3 | the list is empty before; any other way out is refused | yes, but see M2 |
| P-603: one deposit, capped at it | DW2+3: one CORRECTION, −300.00, naming it | DW8 twice; mutant M20 (cap +1) is red | yes; R2 under race |
| P-634 (1): no "Returned" on e-Transfer, card or cash | — | e-Transfer → `NOT_RETURNED`; cash untested (m2) | yes, at the route and the database |
| AG-6-75 r1: card → "Use a refund" | — | DW1 | yes, but see M1 |
| AG-6-75 §10: preview before commit; changed → 409 | DW3 | stale → `CHANGED`; mutant M16 is red | yes; R3 |
| C5 404 before any lock (all 3 routes) | — | DW11 for plain deposits only | **M1, M2** |
| Audit and event in the transaction, payload ids only | DW11+12 | strict payload refuses email or reason | yes (R8: reason code, before/after, hash, planned balance) |
| Errors never 500 | DW2 422 | R5: EUR/unknown/repeated query → 422; bad id → 404; array body → 422; tab → 422; extra key → 422; text body → 400 (Nest, as elsewhere) | yes; `MONEY_RULE` untested (m1) |

**Hash completeness.** The hash covers payment, deposit entry, what is left, the party's last seq, and the balance. Any ledger entry of that party and currency moves the seq, including a correction of this deposit. Method, case, party and reference cannot change. So the hash changes whenever anything the plan depends on changes.
**Locking.** The order is the party lock, then the re-plan, then the insert, whose trigger takes the same re-entrant lock. A correction of a deposit takes no invoice lock, so there is no inversion against FO-7ts's order. C5 and `scopeOf` are read before the transaction (r9-M1 shape) and before the lock.

## Mutants (on a copy; each against the PR's check)
| Mutant | Result |
|---|---|
| M16: hash without seq and balance | red, 5/2 |
| M20: correction 1 cent over | red (the check crashes on the 409) |
| M2: no party lock · M15: no re-plan · M10: no `trustShows` · M12: no `MONEY_RULE` · M17: event outside the transaction · M18: audit outside the transaction · M19: wider shortfall C5 | **19/0 (survive)** |

## Journey test (reviewer role; API only, simulated through the routes, no browser)
**Journeys walked:** 1. The Owner deposits by e-Transfer and by cheque, refunds 500.00, previews the cheque's reversal (−200.00, "below zero"), reverses it as Returned, and the shortfall list names Client c at −200.00. Held. 2. A deposit that paid an invoice is reversed as Wrong client. The invoice stays Paid and the client is at −400.00. Held. 3. Errors: no reason or OTHER untyped → 422; "Returned" on an e-Transfer → `NOT_RETURNED`; stale preview → `CHANGED`, fresh preview → 201. Held. 4. Double click, as six at once: one 201. Held. 5. Wrong role or firm: firm B → 404; no session → 401; unseen officer → 404 on a deposit, but 409 on card, operating or reversed payments (M1). 6. An officer on one case reads the shortfall list: the figure is party-wide (M2).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1 end to end; 19/0 twice |
| Next step obvious | 1 | "Use a refund", "Look at the preview again", the reasons allowed are returned with `NOT_RETURNED` |
| Plain words | 1 | The preview's sentence; "Nothing was changed." on every refusal |
| Feedback and state | 1 | `status: "Reversed"`, balance and shortfall after; the preview's `shortfallMinor` and red sentence |
| Correct data | ½ | M1 (state of unseen payments) and M2 (unseen case money in the figure) |
| Error recovery | 1 | `CHANGED` → re-preview works; a retry answers `ALREADY_REVERSED` truthfully (R7) |
| Accessibility and screen sizes | ½ | No screen (N/A); 422s name the field |
| Speed | 1 | One query per read, no per-row requests; the whole check runs in seconds |
| Visual quality | ½ | No screen (N/A) |
| Trust and sources | 1 | "Unconfirmed: no counsel", amounts Sample, the departure from AG-6-75 r3 recorded |

**8.5/10. Passes the bar of 8, with no criterion at 0.** Fixing M1 and M2 raises correct data to 1.

## D1-D20 and BIC
Not applicable: there is no screen. The code dimensions are covered above. D17 and D20 stay with the founder.

## Could not check
A screen (FO-7s3a/b); an intended user's walk; a database refusal reaching `write()` in a live race. The route pre-empts every refusal I tried.

Reviewer: Changes 9b0ac177b537c2155b63d548b8f079de5f760027
