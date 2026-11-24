# Break report: FO-7v part T, reversing a trust deposit recorded by hand, and the shortfall list (API only)

Commit `9b0ac177b` (PR #3552, `claude/runtime-fo7v-trust`), 24 Nov 2026. The breaker (Opus 5.5) did not build this and edited no code. The harness is the setup of `tests/check_fo7v_reversals.ts`: a scratch database per run on 127.0.0.1:54329, Nest in-process on port 0 (never :4400), local sign-in, no network, US$0, amounts Sample. Every database was dropped. The builder's check gives **19/19** at this head. The script is `…/scratchpad/brk/attack.mts`, run 9 times (logs `run1.log`-`run9.log`). In the full-size run: 354 requests, of which 217 were to part T's routes. The 500s were 6 on reverse and 5 on shortfall.

**Verdict: fail. 0 Blocker, 2 Major, 2 Minor.**

## Findings

**Major 1: a typed reason can answer 500, and one of them raises a false audit alarm.** The route checks the reason only with zod (`reverse.ts:36`): trimmed, 1-200, no C0, DEL, U+2028 or U+2029. It never calls `money_text_ok`, as FO-7t's routes do (`trust/service.ts:304`). The database's `money_trust_entry_reason_check` (FO-7a migration, line 636) then refuses the row. `write()` (`reverse.ts:145-150`) maps only messages shaped `money_x: …`, so the error passes through. `main.ts`'s `ProblemErrors` (lines 220-232) has no rule for a check violation or for invalid JSON, so the app answers 500 "Server error" too, not only the harness.
* Repro (A8c): `OTHER` with each reason below, on a fresh preview. The result was **500** for:
  * U+200B U+200B
  * U+202E + "Sample reason"
  * "a" U+0085 "b"
  * two U+0301 (combining marks only)
  * U+3164
  * "ok \ud800 x"
* U+00A0 alone and U+FEFF alone gave 422. Arabic with U+200F, and French with a soft hyphen, gave 201.
* The lone surrogate gets past the trust row, but the audit line's `after.reason` (`reverse.ts:118`) is refused as invalid JSON (P2007). `writeAuditWithAlarm` then writes `audit_write_failed` (BR-5), the `AuditWriteFailures` metric and an `alert` line. Anyone holding `agent/payment:record` can raise that alarm whenever they like.
* Nothing was written in any of these cases (corrections, audits and events unchanged).
* Fail test: `OTHER` with reason `"​"`, `"‮X"` or `"a\u0085b"` gives 422 naming `reason`. `"x\ud800"` gives 422, and no `audit_write_failed` line is written.

**Major 2: `GET /trust/shortfall` grows with (rows below zero × the whole entry table), and at size it answers 500.** The route (`reverse.ts:130-139`) reads `money_trust_shortfall` (FO-7a2 migration, lines 283-289). Per row, that view's subquery finds the latest reversal with `person_id IS NOT DISTINCT FROM …`, which no index serves: the EXPLAIN shows `Seq Scan on money_trust_entry r … loops=N`. On top of that, `DISTINCT ON` reads every entry of the firm. All of this runs inside Prisma's default 5 s interactive transaction.
* Measured (A10b), median of 5:

  | Entries | Parties below zero | Time | Answer |
  |---|---|---|---|
  | 20,141 | 22 | 300 ms | 200 |
  | 200,141 | 22 | 2.6 s | 200 |
  | 200,901 | 402 | 36-42 s | **500**, 5 of 5 ("A commit cannot be executed on an expired transaction … 5000 ms") |

* Preview stayed at 35-45 ms and reverse at 56-69 ms at 200k entries.
* The root cause is FO-7a2's view, but part T's route is the first to serve it. If the Lead applies STANDARDS §9's "scale work is the team's", this drops to Minor. The 500 is part T's either way.
* Fail test: 200k entries and 50 parties below zero. Expect 200 in under 1 s.

**Minor 1: whether an officer sees a client on the shortfall list depends on which reversal came last.** The list filters on the case of the party's *latest* reversal (`reverse.ts:138`).
* Setup: user-O owns case X of client PE. PE also has case Y, which user-O cannot see.
* A6a: the reversal on Y takes PE to −60.00. PE is not on user-O's list (it is on the Owner's).
* A6b: a later reversal on X gives user-O PE's row at −100.00, which includes Y's −60.00.
* A6e: one more reversal on Y removes PE from user-O's list again, although PE is still below zero and X's money is part of that.
* No name or id from Y leaks. Only the party-wide balance shows, which P-634 (1) intends. The rule should be decided once, either "any reversal on a case the caller sees" or "the party is the caller's".

**Minor 2: the plan's balance lookup cannot use an index.** `reverse.ts:61` matches `coalesce(e.person_id, e.company_id) = party`, while the unique indexes are on `(firm_id, person_id, currency, seq)` and `(firm_id, company_id, …)`. The result is a Parallel Seq Scan over the firm's ledger: 17 ms at 200k entries. It runs twice per reverse, and the second time under the party's lock. It is cheap now, but it grows linearly and serialises that client's trust writes.

## What held (attack: result)
* **A1, ten reverses of one deposit at once on the same fresh hash:** 1 × 201 and 9 × 409 `ALREADY_REVERSED`. Corrections, audits and events went 0/0/0 to 1/1/1. Balance 0.
* **A1b, two deposits of one party reversed at once, each on its own preview:** `[201, 409 CHANGED]`.
* **A2, reverse ∥ Pay from trust ∥ refund on one party holding 300.00:** 5 runs × 15 rounds, 225 racing requests.
  * Exactly one of the three won in every round: reverse 23, application 30, refund 22.
  * 0 non-reversal entries below zero, 0 deadlocks, 0 500s.
  * Every balance equals the sum of its entries, and seq has no gaps.
* **A2b, client at −300.00 after a reversal, then 50.00 deposited:** a 1.00 refund and a 1.00 Pay from trust both gave 409 "Only CAD 0.00 is available.". Balance −250.00.
* **A3, preview hash replays:**
  * A forged hash gives 409 `CHANGED`.
  * In-and-out activity that leaves the balance where it was gives `CHANGED` (seq is in the hash), and nothing is written.
  * A USD deposit between preview and reverse leaves the CAD plan valid: 201.
  * Payment 1's hash used on payment 2 gives `CHANGED`.
  * The hash in upper case gives 422.
* **A4, WRONG_ACCOUNT correction through SQL:**
  * −100.00 on a 300.00 cheque: the preview offers 200.00 (200.00 to 0.00), the reverse gives 201, and the corrections total −300.00.
  * A further WRONG_ACCOUNT on that deposit is refused by the database.
  * A deposit corrected in full gives 409 `NOTHING_LEFT` on both preview and reverse.
  * A WRONG_ACCOUNT written after the preview gives `CHANGED`.
* **A5, walls:**
  * user-O (owns case X): X's deposit gives 200, case Y's gives 404, the client's no-case deposit gives 200.
  * user-O reversing Y's deposit with the Owner's valid hash gives 404, nothing written.
  * Firm A against firm B's payment, with firm B's real hash, gives 404 on both routes.
  * user-T (Case Manager): 403 `MISSING_PERMISSION` on preview and reverse, 200 on shortfall (holds `invoice:show`).
  * A bad token or no token gives 401 on all three routes.
* **A6c-d, shortfall list:**
  * Firm B's list holds no firm A row.
  * `?currency=EUR`, `?currency=cad`, a repeated currency, `?currency[x]=`, and an unknown key each give 422.
  * `?currency=USD` gives only USD rows.
* **A7, payments part T does not reverse:**
  * An operating cheque gives 409 `NOT_YET`.
  * A card payment gives `USE_A_REFUND` on both preview and reverse.
  * A card-terminal payment in operating gives `NOT_YET`. Card-terminal into trust is refused by `money_payment_card_not_trust`, so the `CARD_TERMINAL` branches (`reverse.ts:67`, `:109`) are unreachable. Recorded, not a finding.
  * A trust payment carrying a Stripe id is refused at insert (`money_payment_intent_check`).
  * RETURNED on cash gives `NOT_RETURNED`, and the reasons offered omit RETURNED.
* **A8a, odd ids:** a non-uuid, the nil uuid, `%00`, a suffix, SQL text, 5,000 characters, a traversal, `%0A` and an emoji each gave 404. The upper-case form of a real id gives 200.
* **A8b, hostile bodies:**
  * null, a string, a number and broken JSON gave 400.
  * An array, an empty body, `__proto__`, an extra field, wrong types, 201 characters, a tab, NUL, a newline, U+2028, spaces only, a 33-hex hash and a lower-case code each gave 422.
  * 1 MB gave 413. A `text/plain` body gave 422.
  * A form-urlencoded body gave 201. The parser is app-wide and the guard accepts a Bearer token only (`guard.ts:106`), so there is no CSRF path. Not a finding.
* **A8d, long and non-English reasons:** 200 ASCII characters, Chinese, Arabic, Hindi, French accents, SQL-like text, HTML and 100 emoji each gave 201, stored verbatim. 101 emoji gave 422: zod counts UTF-16 units, the stricter side, so it never produces a 500.
* **A9, refusals leave nothing behind:**
  * Five refusals (RETURNED on e-Transfer, OTHER untyped, bad hash, other firm, unseen case) gave 4xx. Corrections, audits and events stayed unchanged at 26/26/26.
  * The next accepted reverse wrote exactly one audit line and one `payment.reversed` event. The payload holds ids, the code, the amount and the currency only.
  * Firm B with trust answer NO and a balance still held: shortfall gives 200.
* **A10a, 402 parties below zero on a small ledger:** the list answers 200 with all 402 in 197-258 ms.
* **Retry after a lost response:** gives 409 `ALREADY_REVERSED` "Nothing was changed". DW8's design; no second correction.
