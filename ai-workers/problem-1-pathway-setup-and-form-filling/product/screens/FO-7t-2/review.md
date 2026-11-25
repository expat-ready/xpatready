# Review, round 1: FO-7t part 2, client money out of trust (API only, no screen)

Reviewed commit `50f169e36d92f1483517325312a001a15c16c82d` on `claude/brave-gauss-nmhcd5` (PR #3442). Scope: `git diff origin/main...50f169e36`, 7 files, +476 −1. Reviewed 24 Nov 2026 by the Opus 5.5 reviewer, who did not build it. Nothing in the repo was edited apart from this file. The probes and mutants ran on `git archive` copies in a scratch folder, never on :4400.

**Verdict: Ship after fixes (Changes).** There are 2 Major findings and no Blocker. The money core is right: available, the lock order, the rollback at issue, the audit lines and the events. Both Majors are about duplicates and proof, not about wrong arithmetic.

## What I ran (Postgres 127.0.0.1:54329, each check on its own scratch database)
* `check_fo7t_money_out.ts` at the commit: **35 passed, 0 failed**. `check_fo7t_trust.ts`: **62/0**. `check_fo7b_invoices.ts`: **108/0** (both unchanged).
* Red on main: the new check run against `origin/main` code gives **8 passed, 27 failed** ("Cannot POST …/trust/applications").
* I made four mutants of the commit, each removing one rule, and re-ran the check:
  * (A) the pick's C5 check removed (`service.ts:221`): **35/0, survives**.
  * (B) `trustShows` removed from `apply` and `refund`: 34/1, caught by DW1.
  * (C) the min with the party's whole balance removed (`money-out.ts:64`): **35/0, survives**.
  * (D) the future-date refund check (`money-out.ts:112`) and the pick reason's `textOk` (`service.ts:222`) removed: **35/0, survives**.
* Break probes, appended to a scratch copy of the check (results below).

## Hard rules
* Trust never negative (P-607): met. The route check runs under the lock and the database check still stands. The race test ends at 130.00. In my probe, an application and a refund sent at once on one party gave one 201 and one 409 "Only CAD 7.00 is available.".
* Out only to an issued invoice or as a refund (P-603): met. DRAFT is refused, and the trigger keeps its own guard.
* AuditPort in the same transaction: met. One line per change. `detail` holds ids and facts only. Names, reason and reference appear only in `after`, which `ports/audit.ts` allows.
* Walls and C5: met. 404 outside scope, and the scope is read before the transaction (`service.ts:213,235`). Interactive `$transaction(fn)` only (`service.ts:279`, `money.ts:200`).
* FO-7lk lock order: met.
  * The route takes the party locks, smaller id first (`money-out.ts:80`), then the invoice row `FOR UPDATE` (`:81`).
  * The issue path already holds the party lock and then the row (`money.ts:208-214`), and `applyTrust` re-takes the same advisory lock, which is re-entrant. The order is the same, so there is no deadlock.
* No migration, no `web/` change. "Unconfirmed: no counsel" is in `money-out.ts:14` and in the test header.
* Size: 477 changed lines, under 800.
* Every DW1, DW7, DW8, DW9, DW10 and DW18 case has a pass and a fail.

## Findings
**Major 1: applications and refunds are not idempotent** (STANDARDS §4 [M] "Idempotent creates"). `trust/service.ts:209-250`, `money-out.ts:91,116`.
* Probe: two identical refunds sent at once (same body, reference `DUP-1`) gave **two 201s and two `REFUND_TO_CLIENT` rows**. Two identical applications of 100 gave **two withdrawals**.
* Effect: a double click or a retry records client money leaving trust twice, silently. The ledger then understates what the client holds, or pays the invoice twice from trust, up to the amount due.
* The same module's other creates take a key and replay it: deposits (`service.ts:51`), offline payments (`money.ts:97`) and invoice refunds (`refunds.ts:45`).
* `money_trust_entry` has no key column (`client-money.prisma:508`), and a column needs a schema step outside this touch list.
* Fix, by one of:
  * (a) "Question for the tech lead" for an FO-7ts key step, with the Lead recording the deferral as an accepted gap. That closes this finding for this PR.
  * (b) A schema-free guard. For refunds, the duplicate-reference warning the deposit route already uses: same party, case, currency and reference → 409 until confirmed. For applications, a key replayed under the party lock.
* Fail test: two identical refunds via `Promise.all` → exactly one row (or a 200 replay). The same for applications.

**Major 2: the pick's C5 check has no test.** `service.ts:219-221`.
* Mutant A deletes the line and all 35 checks still pass.
* Without it, a person who sees the invoice's case could spend money from another case they cannot see, or read its balance through "Only CAD X is available.".
* This is a server authorisation rule (screen-review check 5; STANDARDS rule 10).
* Fail tests:
  * A staff member who sees CASE but not CASE2 picks `{ caseId: CASE2 }` on an invoice on CASE → 404, nothing written.
  * `{ caseId: null }` for a party they do not see → 404.
* The Owner's pick on CASE2 (already in the check) is the pass.

**Minor**
* m1 `money-out.ts:64`: the min with the party's whole balance (P-634) is untested (mutant C). Effect: only the wording, because the trigger refuses below zero anyway. Test: a shortfall on CASE2 (a returned deposit written by SQL), then apply on CASE → "Only CAD ‹whole› is available.".
* m2 `money-out.ts:112`, `service.ts:222`: the future-date and pick-reason rules are untested (mutant D). Effect: the trigger allows `current_date + 1`, so without the route check a refund dated tomorrow is saved. Test: `refundedOn` = tomorrow → 422. A pick reason of only a zero-width character → 422.
* m3 `money-out.ts:61-62`: "uncleared" counts only DEPOSIT rows on the case.
  * A pre-case cheque moved to the case (MOVE_TO_CASE) would not warn.
  * A returned cheque's correction keeps counting as uncleared, which gives a false warning.
  * No route writes moves or corrections yet, so this is latent. Note it for part 3 and FO-7mv.
* m4 `money-out.ts:74-81`: the invoice's party and case are read before the locks, and the `FOR UPDATE` re-read checks only `issued`.
  * Race: a draft is re-cased and issued between the two reads. The withdrawal then uses the stale case.
  * The trigger accepts that: same party, another case, no pick.
  * Fix: select `person_id, company_id, case_id` in the locked read and refuse if they changed.
* m5 `money.ts:72`: a refused tick at issue says only "Only CAD 0.00 is available." (probe: 409, invoice still a draft). The detail should say the invoice was not issued ("Nothing was issued or paid from trust"). The route's NOT_AVAILABLE also lacks the "Nothing was …" ending that DRAFT and OVER_DUE carry.
* m6: a refund dated before the money came in answers 409 MONEY_RULE in the database's words (probe), not a 422 on `refundedOn`. A self-pick answers 409 "nothing to pick: … own party's, on its own case". Both are field-level faults, so they should be field errors in plain words.
* m7 `service.ts:241`: a `payee` with only a `reason` is accepted and the reason dropped (probe: 201, payee_reason NULL). It should answer 422 "Name the other payee". The payee is also resolved firm-wide with no C5 check, so 404 versus 201 tells whether a person id exists.
* m8 `money-out.ts:125`: `balanceMinor` is the case's available after the refund, not the party's ledger balance. Rename it, or document it in the contract comment.

## Journey test (reviewer role; simulated through the routes, no screen)
Journeys: (1) Biller pays an issued invoice from the case's trust (main); (2) ticks "Pay from trust" at issue; (3) picks another case's money with a reason; (4) an uncleared cheque warns, then is confirmed; (5) refund holder refunds to the payer, then to another payee with a reason; (6) wrong role 403, wrong scope 404, wrong firm 404; (7) recovery: a refused tick rolls the issue back; (8) break: double submit, an application and a refund together, past and future dates, a self-pick.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | DW7/DW8/DW9 pass paths; Paid at issue in one transaction (same xmin) |
| Next step obvious | 1 | 409 codes with `acknowledge: "unclearedAcknowledged"`; `availableMinor` / `dueMinor` returned |
| Plain words | ½ | m5, m6: database words and a tick refusal that does not say the invoice stayed a draft |
| Feedback and state | 1 | 201 returns statusWord and dueMinor; invoice.paid once |
| Correct data | ½ | Major 1: a double submit writes two refunds or two applications |
| Error recovery | 1 | Issue rollback (no number, no audit line); every refusal writes nothing |
| Accessibility and sizes | ½ | No screen (N/A); field errors name the field |
| Speed | ½ | Not measured against §9 budgets; one locked read per call, no per-row queries |
| Visual quality | ½ | No screen (N/A) |
| Trust and sources | 1 | No AI; Sample amounts; legal points "Unconfirmed: no counsel" |

**7.5/10: below the pass bar of 8, with no criterion at 0.** Fixing Major 1 raises correct data to 1 (8/10). Fixing m5 and m6 raises plain words to 1 (8.5/10).

## D1–D20 (code-relevant; the screen dimensions N/A)
* D1 met: AG-6-68 r1-5, 7, 8 and AG-6-23 r1-4, 9 map to code and tests. r9 (To move) is part 3.
* D2 partly: race and never-negative held; duplicates not refused (Major 1).
* D5 partly: rollback good; double click not safe (Major 1).
* D11 partly (m5).
* D16 partly: Major 2, m1, m2.
* D18 met: audit and events.
* D8-D10, D12-D14: N/A (no screen). D17, D20: simulated only, they stay with the founder.
* BIC-01–20: N/A (no case-side screen).

## Not checked
The graph tool (`graph.mjs` writes GRAPH.md, outside my write scope); a live C5 probe with a partial-scope staff member (the seed has none, so Major 2 rests on the mutant); CI shards; timings.

Reviewer: Changes 50f169e36d92f1483517325312a001a15c16c82d

Verdict: Changes 7.5/10
