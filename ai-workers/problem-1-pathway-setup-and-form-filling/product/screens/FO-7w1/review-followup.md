# FO-7w1 follow-up review: PR #3737 at c21b5cb38 (independent reviewer)

**Scope:** `git diff origin/main...c21b5cb38` only: 7 files, +106/-9. Code changes are in `drafts.ts`, the check, the port's comment, the port contract and the module row. The diff also appends round 3's sections to `review.md` and the journey report. It fixes round 2's Minors r1–r5, round 3's r6 and the nits. API only, no screen. I did not build it.

**Verdict: Approve.** No Blocker or Major. One Minor (f1) and two Nits are below. **Journey 8.5/10, pass** (appended to `journey-test-reviewer-2026-11-25.md`): Correct data goes back to 1 now that labels are copied as signed.

## What I ran (from `prototype/`; never :4400)
* The check in the checkout: **43/43**, run 5 times (two idle runs, then three with 8 CPU-bound loops on 4 cores, load 7.4). Also 43/43 in a scratch copy.
* Mutants of `drafts.ts`, each in a scratch copy (results below).
* `money_text_ok`, from the fo7a migration (lines 446–528), on a scratch database with collation C. I tested `'a' || chr(cp) || 'a'` for every code point from U+0001 to U+10FFFF except surrogates. It refuses exactly U+0001–U+001F, U+007F–U+009F, U+2028, U+2029, U+202A–U+202E and U+2066–U+2069.
* Neighbouring money suites: `check_fo7b_invoices` 108/108, `check_fo7g3_bill_to` 30/30, `check_fo7g_tax_defaults` 78/78, `check_fo7b_refunds` 29/29. `check-port-contracts.mjs`: 0 problems. `typecheck.mjs`: 0 new errors (15 known). `module-cards.py tree`: PASS. `graph.mjs --check`: G1 0, G2 0.
* j_56 on an isolated copy at **:4434** (runtime band): 17/18, as on main. W1 passes. W9's pay link belongs to FO-7c and FO-7s2. The copy is stopped. The two W9 screenshots that the run overwrote are restored, so the tree is clean.
* CI on c21b5cb38: the PR is a draft, so only the guard jobs ran (guard, pr-rules and read-gate: success). `ci`, `fast` and `types` are skipped until the PR is marked ready.

## Each change
* **r1: correct and exact.** The space class is `[\u0000-\u001f\u007f-\u009f  ]` and the drop class is `[‪-‮⁦-⁩]` (`drafts.ts:243`). Together they are exactly the set `money_text_ok` refuses, as measured above. `[[:cntrl:]]` under a libc UTF-8 locale also covers C1 and U+2028/9, so the classes still cover the refused set on a database whose collation is not C.
  * Probes: a ZWNJ, emoji ZWJs and a soft hyphen are kept, and so are LRM, RLM, ZWSP, WJ and BOM inside the label. U+2067 and U+2069 are dropped ("Fee ⁧Sample⁩ x" becomes "Fee Sample x").
  * The comment at `:240-242` now states this correctly.
* **r2: correct.** NEL inside a label becomes a space, and leading C1 characters are trimmed. The 422 detail now quotes the cleaned label, so a raw control character is never quoted in it.
* **r3:** (a) The "names its row" case is new. It passes on main, as the PR says, and it fails when the message drops `row.position` (mutant `rowpos`). (b) The m8 case is new; see the race section below. (c) is still open: f1.
* **r4: accurate for every case it can be returned in:** all rows billed, only open-amount rows, no rows, and only a deposit. See Nit n2.
* **r5: accurate.** The module row and the `retainerRows` comment list 409 `NOTHING_TO_BILL` and the total's 422 at `feeRowIds`, which matches `:86` and `:246`.
* **r6: accurate.** `ports/retainer-fees.ts:36-37` now names the id in any letter case, the current version's rows in position order, and a firm id that is not one reading null without throwing. Each matches the adapter (the `UUID` guard, `toLowerCase`, `orderBy position`) and the contract's header. All 5 contract cases pass.
* **Nits: done.** The removed row-order `expect` was redundant: `same()` compares JSON against the ordered `expected`. Firm B goes back to exactly the line-84 ON address (`:120`). The double negative at `:126` is fixed.

## Mutants (scratch; red = the check catches it)
| Mutant | Result |
|---|---|
| `drafts.ts` from origin/main | 41/43: r1 and r2 red, as the builder says |
| P2002 409 without `feeRowIds` | 42/43: m8 red, as the builder says |
| P2002 not mapped (500) | 42/43: m8 red |
| C1 left out of the space class | 42/43: r2 red |
| ZWNJ and ZWJ dropped again | 42/43: r1 red |
| Soft hyphen dropped again | 42/43: r1 red |
| Round 2's wide drop class restored | 42/43: r1 red |
| No direction-mark drop | 42/43: break-m2 red |
| "Names its row" message without the position | 42/43: r3(a) red |
| U+2028/9 left out of the space class | 43/43, survives. Unreachable: `fo_retainer_fee_row_label_check` refuses them in a label |
| No per-row MINOR_MAX check (`:224-225`) | **43/43, survives** (f1) |

## The m8 race is not flaky
* **How it works:** the outside writer inserts the line in an open transaction, signals, and holds for 1.5 s. The start takes the advisory lock, which the outside writer does not hold. Under READ COMMITTED it does not see the uncommitted row, so its insert waits on the unique index and gets P2002 when the outside transaction commits. It cannot pass any other way: an unnamed start never reaches the pre-check's `ROW_ON_INVOICE` (`:228`).
* **Timing margin:** with timing added in a scratch copy, the start took 1523–1532 ms, so it waited on the index each time. With the hold cut to 200 ms and 50 ms the case still passes. At 10 ms it fails, loudly, with `NOTHING_TO_BILL`. So the start reaches its billed read in roughly 10–50 ms, and 1.5 s is a margin of 30× or more.
* **Runs:** with the 1.5 s hold, 20 passes and no failure: 5 in the checkout (3 of them under load) and 15 in scratch copies (the unrelated mutants, the timing runs and the probe runs). If the timing ever slipped, the case would go red. It cannot go falsely green.
* `count(*) = 1` afterwards confirms the row is on one line only.

## No regression in money behaviour
* Amounts, tax, the total check, the lock and the deposit flag are unchanged. Only the label text and the 409's words changed.
* The 4 neighbouring suites and j_56 W1–W8 pass.
* Every label that main copied without refusing is still accepted. Labels holding C1 characters, which main refused, now pass. The only change in output is that the invisible characters `money_text_ok` accepts are now kept.

## Issues
**Minor (Should):**
* **f1. Round 2's r3(c) is still open, and the PR does not say so.**
  * The per-row MINOR_MAX check (`drafts.ts:224-225`) can be removed with the check still 43/43, so `tests/check_fo7w1_retainer_invoice.ts:124-125`, "a fee row above what one line holds", passes on the total check instead.
  * Behaviour is safe: any such row also fails the total check, even at 0 % tax.
  * The PR body's r3 bullet lists only (a) and (b).
  * **Fix**, one of:
    * assert the per-row words in that case (`fields.feeRowIds` contains "more than one line can hold");
    * remove the per-row check as redundant;
    * state in the PR that (c) is left as it is, and why.

**Nits (optional):**
* **n1.** Only U+202E is tested in the drop class. A mutant that drops only U+202A–U+202E would pass the check. My probe shows that U+2066–U+2069 are handled. One isolate in the break-m2 label would cover it.
* **n2.** The `NOTHING_TO_BILL` words for a retainer with only a deposit (`:86`) say "it has no fee with an amount left to bill", which is true only once the parenthetical has been read. There are also nested parentheses. A possible rewording: "Nothing to bill from this retainer without naming rows: no fee with an amount is left (a fee already on an invoice or with no amount is left out; a deposit, "On signing", is billed only when named). Nothing was saved."
* A direction mark between two controls leaves two spaces ("Fee\u0085‮\u0085Sample" becomes "Fee  Sample"). This is cosmetic, it passes `money_text_ok`, and no fix is needed.

**Dimension changes from round 2:** D2 Data integrity stays at 5 (labels are now exact). D16 Testability stays at 4: the check catches 9 of the 10 reachable mutants, and the one survivor is f1. The U+2028/9 survivor is unreachable, so it does not count. All other dimensions are as before. BIC: N/A (no screen).

**Could not check:**
* the full CI on this head (it is a draft: `ci`, `fast` and `types` are skipped);
* a database with a non-C collation (the classes are a superset there, by reading);
* a screen, a screen reader and an intended user's walk (D17 and D20 stay with the founder).

Verdict: Approve

Reviewer: Approve c21b5cb383e7b0cecea973622c5dd9f56e0841c8
