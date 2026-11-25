# Review, round 2 (last): FO-7t part 2, client money out of trust (API only, no screen)

Reviewed head `c28b95329223049ee5aa1e88c03834a97b27bfca` on `claude/brave-gauss-nmhcd5` (PR #3442), 24 Nov 2026, by the Opus 5.5 reviewer, who did not build it. c28b953 is a pure merge of main: it touches none of part 2's files (`git diff f7fd4d91b c28b953` on `client-money/`, `ports/` and the check is empty). Part 2 diff: `git diff 3af5fc4b0 f7fd4d91b -- ':!**/screens/**'`, 7 files, +543 −4 (547 changed lines, under 800). Nothing in the repo was edited apart from this file. Mutants and probes ran on `git archive` copies in a scratch folder. Every check used its own scratch database on 127.0.0.1:54329. Nothing ran on :4400.

**Verdict: Ship (Approve).** No Blocker and no Major is open. Both round 1 Majors are fixed, each with a fail test that a mutant proves. The idempotency deferral is acceptable (see the section on it below). The rest are Minors.

## What I ran
* At the head: `check_fo7t_money_out.ts` **45/0**. `check_fo7t_trust.ts` **62/0**. `check_fo7b_invoices.ts` **108/0**. `check_fo7lk_lock_order.ts` **16/0**. `check_fo7a_money_schema.ts` **122/0**. `check_pf12_walls.ts` **110/0** (run in the checkout on a free port; in the archive copy, 5 server-start cases fail for an environmental reason).
* Red on main: the head's check run against `origin/main` (fa337044c) gives **8 passed, 37 failed**, as the PR says.
* Mutants, one rule removed each:

| Mutant | Result |
|---|---|
| Refund duplicate guard off (`money-out.ts:141`) | **caught** 43/2 |
| Application duplicate guard off (`:103`) | **caught** 43/2 |
| Refund's party lock removed (`:129`) | **caught**: the race writes two rows |
| Case-level "before the money" date (`:136`) | **caught** |
| Future date (`:128`) | **caught** |
| TRUST_OFF in `applyTrust` (`:89`) | **caught** |
| Payee is the payer, with a reason (`service.ts:244`) | **caught** |
| The pick's case-side C5 (`service.ts:221`, the `seen.cases` half) | **caught** (round 1 mutant A now dies) |
| The pick's no-case C5 half (`service.ts:221`, `seen.parties`) | survives |
| Min with the whole balance (`money-out.ts:69`, round 1 m1) | survives |
| `refKey` in the refund guard replaced by a plain `=` (`:140`) | survives |
| CHANGED re-read check (`:92`, round 1 m4) | survives |
| Application window 2 minutes → 100 years, or the payer dropped from the guard (`:102`) | survives |

* Probes: P1 two refunds at once, both with `duplicateReferenceAcknowledged: true` → **201, 201** (two more uncorrectable refunds). P2 reference `"ＥT-555 "` (full-width E, trailing space), no confirm → 409 DUPLICATE_REFERENCE (normalisation works at runtime). P4 the on-team officer picks `{caseId: null}` (PA's money before a case, PA visible through CASE) → 409 NOT_AVAILABLE, correct. P5 the officer picks an unseen PD before a case → 404.

## Round 1 findings
| Finding | State |
|---|---|
| M1 not idempotent (review and break) | **Fixed by a guard, the key deferred.** Under the payer's lock: the same normalised reference for this client → 409 DUPLICATE_REFERENCE "Record anyway?". The same amount, payer and invoice within 2 minutes → 409 DUPLICATE "Pay it again?". The `Promise.all` double clicks are tested both ways, and the mutants die. |
| M2 the pick's C5 untested | **Fixed** for a picked case (`check:274-281`, mutant caught). The `{caseId: null}` half asked for in round 1 is not tested (see m3 below). Its only effect is an existence oracle, because the database refuses a payer from another case before a case (`migration.sql:255`). |
| m1 min with the whole balance | Open, untested (m4 below). |
| m2 future date, pick reason | Fixed and tested. |
| m3 uncleared counts only DEPOSIT | Deferred to part 3 and FO-7mv (latent, no move route yet). Accepted. |
| m4 stale case before the locks | Fixed: `money-out.ts:86-92` re-reads party and case under `FOR UPDATE` and refuses CHANGED. Untested (racy to provoke). Accepted. |
| m5 tick refusal wording | Fixed for TRUST_OFF, DRAFT, CHANGED, NOT_AVAILABLE and OVER_DUE. UNCLEARED at issue is left (m5 below). |
| m6 database words | The date half is fixed: 422 `refundedOn`, per case (break m2). The self-pick still answers 409 MONEY_RULE in the database's words (m6 below). |
| m7 payee reason dropped | Fixed, 422 (`service.ts:242-246`). The firm-wide payee lookup oracle is open (m6 below). |
| m8 `balanceMinor` | Documented (`money-out.ts:151`). |
| Break m3 the tick with trust off | Fixed: 409 TRUST_OFF, "The invoice was not issued.", tested. |

## The idempotency deferral (asked): acceptable for Approve
STANDARDS §4 [M] "Idempotent creates" is **partly met**. Round 1 named a schema-free guard as an accepted fix (option b), and a true key needs a column, which means a migration under the Lead's stamp.
* What the guards close: the realistic failure, a double click or a quick retry on the main action. Both are proven by tests and mutants.
* What remains: (a) a retry after a lost response gets "Pay it again?" or "Record anyway?" instead of a 200 replay; (b) P1: a double click on the **confirm** writes two refunds, which P-603 can never correct; (c) a second, intended application of the same amount within 2 minutes is asked about.
* (b) needs a reused reference and then a double-click on the confirm, so it is narrow. Trust never goes negative.
* Condition, a record and not code: the PR body has no "Question for the tech lead" today. Before the label, the builder adds it: the key column (FO-7ts step), with residual (b) named.

## Findings open at this head (all Minor; none blocks)
* m1 (process) The PR body lacks the tech lead question above, and says "the minors were fixed … with fail tests", while m4 (round 1 m1), the null-case pick and the self-pick words are not tested or not fixed. Correct the line.
* m2 `money-out.ts:139-141`: an acknowledged refund is not de-duplicated (P1). The key closes it, so it goes into the question.
* m3 `service.ts:221`: the `seen.parties` half of the pick's C5 has no fail test (mutant survives). A test: an invoice before a case, and a pick `{personId: <unseen>}` → 404.
* m4 `money-out.ts:69`: the P-634 min is untested (round 1 m1). The effect is wording only, because the trigger still refuses below zero.
* m5 `money-out.ts:106`: UNCLEARED at issue does not say "The invoice was not issued." (every other refusal at issue does).
* m6 Field words and oracles: a self-pick answers 409 MONEY_RULE "nothing to pick …" in the database's words; the payee is resolved firm-wide (`service.ts:243`), so an unseen person's id is accepted (201) while an unknown id gives 404.
* m7 Guards the check does not pin (mutants survive): `refKey` normalisation in the refund guard (`:140`; the test sends `" et-555 "` only with the confirm; P2 shows it works), and the 2-minute window and payer term (`:102`).

## Journey test (reviewer role; through the routes, no screen; no separate report, by this round's one-file scope)
Journeys: (1) the Biller pays an issued invoice from the case's trust; (2) ticks "Pay from trust" at issue; (3) picks another case's money with a reason; (4) an uncleared cheque warns, then is confirmed; (5) refunds to the payer, then to another payee with a reason; (6) wrong role 403, wrong scope 404, wrong firm 404; (7) recovery: a refused tick rolls the issue back; (8) break: a double click on each action and on the confirm, a reused reference in another spelling, past and future dates.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | DW7/8/9 pass paths; issue and pay in one transaction |
| Next step obvious | 1 | 409 with `acknowledge` naming the confirm field; `availableMinor` and `dueMinor` returned |
| Plain words | 1 | Dates 422 `refundedOn`; at issue "The invoice was not issued."; m5 and m6 are small |
| Feedback and state | 1 | 201 returns `statusWord` and `dueMinor`; `invoice.paid` once |
| Correct data | 1 | A double click writes one row (tested); residual m2 deferred with the key |
| Error recovery | 1 | Every refusal writes nothing; the issue rolls back |
| Accessibility and sizes | ½ | No screen (N/A); field errors name the field |
| Speed | ½ | Not measured against §9; one locked read set per call |
| Visual quality | ½ | No screen (N/A) |
| Trust and sources | 1 | No AI; Sample amounts; "Unconfirmed: no counsel" |

**8.5/10, a pass (8+, no 0).**

## D1–D20 and BIC
* D1 met (AG-6-68 r1-5, 7, 8 and AG-6-23 r1-4, 9 mapped; r9 is part 3). D2 met (never negative; duplicates guarded, key deferred). D5 met (rollback; double click handled). D11 met (m5 small). D16 partly (m3, m4, m7). D18 met (one audit line per change, in the transaction; the events).
* D8-D10, D12-D14 N/A (no screen). D17 and D20 simulated only. BIC-01–20 N/A (no case-side screen).

Hard rules, all met: P-607 (route check under the lock, plus the trigger); P-603 (DRAFT refused; refunds only); AuditPort in the transaction; walls and C5 404, scope read before `$transaction(fn)`; FO-7lk order (party locks smallest first, then the invoice `FOR UPDATE`); no migration, no `web/`; "Unconfirmed: no counsel" present; 547 lines; a pass and a fail per DW case; red on main.

## Not checked
`graph.mjs` (it writes GRAPH.md, outside my write scope); CI shards; timings; a real retry after a lost response (inferred from the code: 409, not a replay).

Reviewer: Approve c28b95329223049ee5aa1e88c03834a97b27bfca

Verdict: Approve 8.5/10
