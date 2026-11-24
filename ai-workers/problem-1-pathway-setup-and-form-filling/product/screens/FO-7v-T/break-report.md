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

## Round 2 (head `6c98404ed`, diff `9b0ac177b..6c98404ed`)

Same setup: a scratch database per run on 127.0.0.1:54329, Nest on port 0 (never :4400), and every database dropped. The script is `…/scratchpad/brk/attack-r2.mts`: round 1's script plus 13 new checks. It ran 7 times (`r2run1.log`-`r2run7.log`). The first run's two failures were mistakes in the script, since fixed. Runs 2-7 sent 596 requests each, 380 of them to part T's routes, and got **0 answers of 500 or above**. The builder's check gives **27/27**.

**Verdict: pass. 0 Blocker, 0 Major, 1 Minor (latent).** Round 1's Major 1, Major 2, Minor 1 and Minor 2 are closed.

**Minor 1 (new, latent): the list's `seen` test is three-valued, and `bool_and` skips NULL** (`reverse.ts:139`, `:144`).
* An entry with no case, whose party is not in `seen.parties`, gives `NULL = any(cases) or false`, which is NULL, not false. `bool_and` ignores it, so the party still counts as seen whole.
* Repro (R2-2h): call `Reversals` directly with scope `{cases:[XJ], parties:[]}`. Client PJ has 50.00 on XJ, plus 10.00 deposited with no case and refunded. PJ's row is returned at −50.00, yet the preview rule `visible()` calls that no-case deposit unseen.
* This is not reachable through the app:
  * The real adapter always lists a seen case's linked party (port rule 2, `visibility-adapter.ts:39`).
  * Deposits refuse another client's case (`trust/service.ts:270`).
  * A case's link only goes from none to set (`clients.ts:65`).
* The list should fail closed on its own and not rest on the port. Fail test: the scope above gives no row for PJ.

### Rechecked (attack: result)
* **Major 1, typed reasons (R2-1a), all 422 naming `reason`, nothing written:** 23 reasons in all.
  * Round 1's six: U+200B U+200B, U+202E + text, "a" U+0085 "b", two U+0301, U+3164, "ok \ud800 x".
  * 17 more: a lone low surrogate, a lone high surrogate at the end, U+2060, tag characters, U+FE0F, a skin-tone modifier, U+2800, U+180E, U+034F U+034F, U+061C, U+00AD, U+3000, U+2066…U+2069, U+009B, U+200B with `RECORDED_BY_MISTAKE`, U+202E with `WRONG_CLIENT`, and " U+200B ".
  * **No alarm:** a counting AlertPort recorded 0 raises, there were 0 `audit_write_failed`/`alert` log lines, and 0 such audit rows.
  * **Visible text still 201 (R2-1b):** Arabic with U+200F, French with a soft hyphen, Hebrew with U+200E, a U+200B inside text, a ZWJ family emoji, 200 CJK characters, Hindi, Thai, and a leading BOM.
* **Major 2, `GET /trust/shortfall` timing:** 200 every time, median of 5 calls, Owner's list unless stated. The rows returned equal the number of parties below zero in every run.

  | Entries | Parties | Below zero | Owner | Officer | `?currency=CAD` |
  |---|---|---|---|---|---|
  | 20,215 | 251 | 23 | 71 ms | 72 ms | 73 ms |
  | 20,975 | 631 | 403 | 132 ms | 80 ms | 126 ms |
  | 200,215 | 2,051 | 23 | 585 ms | 565 ms | 578 ms |
  | 200,975 | 2,431 | 403 | 668 ms | 609 ms | 668 ms |

  * Heavier shapes, not in round 1:
    * Every one of 2,431 parties a prospect in the Owner's scope: 1,093 ms.
    * 20,431 parties × 10 entries, at 200,975 entries: 1,377 ms (officer 552 ms).
  * Round 1's own fail test (200k entries, 50 parties below zero, under 1 s) passes. The heavier shapes are still well under the 5 s transaction.
  * At 200k entries, preview is 14-69 ms and reverse 24-81 ms. The balance lookup now matches on `person_id` / `company_id` (`reverse.ts:74`), which closes round 1's Minor 2.
* **C5 on the list, user-O through the real adapter:**
  * **R2-2a:** client PF has case X (the officer's) and case Y (hidden). Reversals and deposits alternate X/Y across 14 looks, each without a currency, with `CAD` and with `USD`. user-O never gets PF's row, and the Owner's row always equals the ledger.
  * **A6a/A6b/A6e** (round 1's Minor 1 shape): PE never shows to user-O, whichever case has the latest reversal.
  * **R2-2b:** PG holds the officer's case plus no-case money. user-O gets the row at −50.00. One later deposit (not a reversal) on a hidden case removes it. The Owner sees −49.00.
  * **R2-2h0:** with the officer's case plus no-case money only, the row shows, and the preview of the no-case deposit gives 200.
* **Two currencies (R2-2c):** CAD on the officer's case and USD on a hidden case.
  * user-O gets the CAD row only, in all three queries.
  * The Owner gets both. `?currency=` filters each and returns only that currency.
* **Companies (R2-2d, R2-2e):**
  * With CAD and USD on the officer's case, user-O gets both rows: `companyId` set, `personId` null, the operating name.
  * A deposit on the company's hidden case removes only the CAD row.
  * The officer's preview gives 409 `ALREADY_REVERSED`, not 404.
  * No row carries both ids.
* **Below zero with no reversal (R2-2f):** a `WRONG_ACCOUNT` correction after a full refund is refused by the database ("Only CAD 0.00 is available…"), so this case is unreachable.
* **The officer who sees nothing (R2-2g):**
  * Scope `{}` gives an empty list, with and without `?currency=USD`.
  * Parties only, no cases, gives none of the case-held rows.
  * user-T's real list gives 200.
* **Same result as the view (R2-2i):** the Owner's list equals `money_trust_shortfall` for firm A (party, currency, balance, latest reversal): 8/8, no extras and none missing.
* **Races, no regression in 7 runs:**
  * A1 and A1b held.
  * A2: 105 rounds, 315 racing requests. Reverse won 33, application 36, refund 36. 0 out-flows below zero, 0 deadlocks, 0 balance drift, 0 seq gaps.
  * A2b, A3a-e, A4a-e, A5a-e (user-T 403/403/200), A6c-d and A9a-c held.
* **Not findings, as in round 1:** A8b's form-urlencoded body gives 201. A8c's script check counts the accepted Arabic and French reasons as failures, but its six invisible reasons now give 422.
