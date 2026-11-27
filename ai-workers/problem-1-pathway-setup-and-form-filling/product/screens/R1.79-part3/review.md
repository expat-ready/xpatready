# R1.79 part 3 (PF-R2cm): review

PR #3812 · branch `claude/runtime-pfr2cm`. The reviewer did not build it. API only, no screen.

## Round 2: diff `801724e..f72f041` (head `f72f041c75edd5b3d3ffce821e9c111446897ae4`)

**Verdict: Ship → Approve.** No Blocker or Major is open. Round 1's four Majors are fixed, and each fix has a test line that fails when the fix is removed. Journey score **9.3/10, pass**: `journey-test-reviewer-2026-11-26-r2.md`.

### What I ran (on the exact head: the working tree was clean at f72f041, plus a `git archive` extract for mutations)
* **Tests:**
  * `check_pfr2cm_metrics.ts`: 45 passed, 0 failed.
  * `check_pfr1_reports.ts`: 72 passed.
  * `check_csw3_firm_scope.ts`: the census passes with 57 files, and the planted-file fail line passes.
  * `tsc`: no error in the changed files.
* **Round 1's repro, run again on f72f041:**
  * The payment recorded for 1 Dec now counts in December (CAD 400.00); November is empty.
  * For a holder of the seeded BILLING_FINANCE keys, and for a holder of `view-financial` alone, the hidden client is now `"1 client you cannot open"`, CAD 600.00. No name is shown, and the rows still add up.
* **My mutations (scratch copy only, restored after each):**

| Mutation | Result |
|---|---|
| paidDay reads the firm's day for a 00:00 UTC payment | 43/45 (both M1 lines fail) |
| The firm's zone replaced by UTC | 43/45 (the Toronto pair fails) |
| C5 bound off (`seenOf` always true) | 42/45 (M2 lines fail) |
| Hidden-clients row dropped | 42/45 |
| `received_into = 'OPERATING'` dropped | 43/45 (M3 lines fail) |
| MOVE_TO_CASE dropped from trust received | 43/45 (break M1 lines fail) |
| Refunds out of trust not subtracted | 42/45 |
| A deposit takes its entry's day, not its payment's day | **45/45 (survives: n1)** |

The builder's own mutations, which I did not re-run: the issue-day clamp, the credit-note trust refund and the withdrawal correction each fail 1-3 lines.

### Round 1 issues
| # | Status | Evidence |
|---|---|---|
| M1 period | **Fixed** | Periods now compare firm days. A payment stored at exactly 00:00 UTC takes that UTC date, which is the day the app shows (`paidDay`, `metrics.ts`). A Toronto-zone pair is in the solo firm (DW2) |
| M2 C5 rows | **Fixed** | `overdue_by_client` names only clients that pass `PgMoneyVisibility` (`seenOf` is scopeSql's rule). The rest is one row per currency. The cap counts the hidden rows (at most 200 in all) |
| M3 headline test | **Fixed** | A payment into trust on the invoice, written as money.ts writes it (payment, deposit and withdrawal), is counted once (DW3 fail line) |
| M4 trust under a person filter | **Fixed** | MOVE_TO_CASE is counted: it nets to zero firm-wide, and under a person filter only its + half on that person's case is in |
| n1 (round 1) untested branches | **Fixed** | December fixtures; each branch's removal fails a line |
| n2 extra paid beyond the bill | **Fixed** | Stated in the code. The figure's own words (`source`) still do not say it (see n4) |
| n3 credit REFUNDED | Open, accepted | No writer on main; noted as a known limit in the PR |
| n4, n5 (breaker m1-m3) | **Fixed** | Ranking within each currency; reversals grouped once (DW8 now has 15,000 credit applications and passes); "1 more client" |

### New issues (all Minor; none blocks)
* **n1, Minor, Should: "a deposit takes its payment's day" (`trustSql`, the `coalesce(paidDay(p.received_at), …)` term) is untested.** Replacing it with the entry's own day still passes 45/45. The rule matters for a payment into trust recorded for an earlier date (`money.ts:123`).
  * Fix: one line with a deposit of a back-dated trust payment on the 1st.
* **n2, Minor, Should: one client can be both named and counted in "N clients you cannot open".** This happens for a party with an invoice on a case the viewer can open and another on a case they cannot (`count(distinct …)` sits inside the hidden group). The figures are right; only the count's word "clients" can overstate.
  * Fix: say "N invoices' clients", or leave it as a known limit.
* **n3, Note, no action:** `paidDay` treats a payment recorded "today" at exactly 00:00:00.000000 UTC as a back-dated one. That is one microsecond a day, and in Toronto that day is the same either way.
* **n4, Minor, Could:** the Fees collected `source` text does not yet say that money paid beyond the bill counts until it is refunded. The code comment says so. The PR says "the words now say": they do for the code, not for the card line PF-R3 will show.

### Still for the tech lead (not blocking)
* **Q6:** the tile totals (fees billed and collected, trust, overdue, ageing, tax) stay firm-wide under `view-financial` (AG-14 §2, §3.6 "firm-wide financial reports"). Only the named rows are C5-bounded.
* **Q1-Q5:** as in round 1 (keep the port's rule; billed party; Sample tax choice; no "Disputed"; by service later).
* Also outside the row's list (P-26, not a finding): AG-14-36's "Written off" figure.

### D1-D20 (round 2; screen dimensions go to PF-R3)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | US-14's money cases, the periods, and AG-14-19 rows all hold; Q6 is open |
| D2 | 4 | Reads only |
| D3 | 4 | Uses FO-7r's terms, caseScope, PgMoneyVisibility and the cited tax table |
| D4 | 4 | Parity with DUE_SQL holds; trust no longer goes negative under a person filter |
| D5 | 4 | A failing read is UNAVAILABLE; there is a timeout |
| D6, D7, D8-D14 | N/A | No content, no AI, no screen |
| D15 | 4 | DW8 passes with 15,000 credit applications |
| D16 | 4 | Every rule removal I tried fails a line, except n1 |
| D17, D20 | simulated only | |
| D18 | 4 | Source words per figure; Sample tax choice; "Unconfirmed: no accountant" |
| D19 | 4 | Feeds the Owner and Billing / Finance dashboards with correct figures |

**BIC-01 to BIC-20:** N/A (not a case-side screen).

**What I could not check:**
* CI: the draft runs only the guard.
* A screen: PF-R3.
* The live :4437 server was not restarted for round 2. Round 1 showed the door's wiring live, and round 2 does not change the registration.

**Verdict: Approve.** n1, n2 and n4 can go in a later push or PF-R3.

Reviewer: Approve f72f041c75edd5b3d3ffce821e9c111446897ae4

## Round 1 (head `801724e`), summary
Verdict: Block. M1 (back-dated payments in the wrong period, shown live on :4437), M2 (`overdue_by_client` named clients outside C5), M3 (the headline trust test did not bite), M4 (the breaker's M1, trust negative under a person filter); minors n1-n5. Journey score 7.9/10 (fail). The full text is in git history: `git show f72f041:ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/R1.79-part3/review.md`.
