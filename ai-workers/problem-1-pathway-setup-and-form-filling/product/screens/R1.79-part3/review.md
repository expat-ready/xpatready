# R1.79 part 3 (PF-R2cm): review, round 1

PR #3812 (draft) · branch `claude/runtime-pfr2cm` · head `801724efd603ce791a996ab6ad8b4e55e76e2d4b`. The reviewer did not build it. API only, no screen.

**Verdict: Rework → Block.** Three Majors are open. Each fix stays inside `metrics.ts` and its test; nothing needs a redesign. Journey score **7.9/10, fail** (correct data scores 0): `journey-test-reviewer-2026-11-26.md`.

## What I ran (all on the exact commit, extracted with `git archive` into the scratchpad; the shared working tree carries a builder's uncommitted edits)
* **The PR's test:** 34 passed, 0 failed (on the repo files and on the extract). `check_pfr1_reports.ts`: 72 passed. `tsc`: no error in the new files. `graph.mjs`: G1 0, G2 0, G4 0, G5 0; nothing named for this row.
* **The live door:** I started the commit's API on :4437 (runtime range), with its own database, which I dropped afterwards.
  * Owner: all 7 figures come back OK in 45 ms. `billing-finance` shows 5/5 widgets as registered.
  * Case Officer with a forged `scope:"financial"`: `WITHHELD`.
  * `from: 2026-13-01`: 422, with the field named.
* **Repro scripts and mutations:** run on the extract only. The scratch databases were dropped.

## Issues (ranked)
**M1, Major, Must: a payment back-dated to the 1st counts in the month before (AG-14-13 "by period"; the row says "collected counts payment dates").**
* `invoices/money.ts:123` stores a `receivedOn` that is not today as `${receivedOn}T00:00:00Z`. `metrics.ts:105` then cuts the period on that timestamp in the firm's zone (America/Toronto by default). 00:00 UTC is 19:00 or 20:00 on the day before in Toronto, so every back-dated payment moves one day earlier.
* **Live:** I recorded a payment with `POST …/invoices/:id/payments {receivedOn:"2026-11-01"}`. The answer said `receivedOn 2026-11-01`, receipt R-0001. Fees collected for October shows **CAD 400.00**; November shows `[]`. Scratch repro: 1 Dec goes into November.
* The test's payments are all at 15:00Z, so it cannot see this. Mutation (e), the firm's zone replaced by UTC, also passes 34/34: the firm's zone is never tested (CS-R1 added a Kolkata line for the same gap).
* **Fix:** cut a payment by its received-on day as the app records it and shows it (`dayOf`, `reads/payments.ts`), not by the timestamp in the firm's zone. Add a back-dated payment on the 1st, and a zone line.

**M2, Major, Must: overdue by client names clients the viewer cannot open in client money (AG-14-19, §3.6: "List rows and drill-through never show, count or link to a record the viewer could not open from its own module"; ports/metrics.ts `MetricReadContext`: "the read counts only records the viewer may open … break M1").**
* `frameOf`/`who` (`metrics.ts:71-86`) never read `ctx.keys`. Client money's own rule (C5, `PgMoneyVisibility`; "no role sees money firm-wide by its role") is not applied. The statement and summary in FO-7r do apply it.
* **Repro:** an invoice with no case for a person. A staff member holding the seeded **BILLING_FINANCE** keys has money visibility `{"cases":[],"parties":[]}`, yet `overdue_by_client` answers `{"client":"Hidden Client","overdue":"600.00",…}`. The same happens with `view-financial` alone, and for a firm that makes Billing case-`view.own`.
* CS-R1 bounds every number by the viewer's own keys (`case-reports.ts:4-6, 50-52`).
* **Fix:** bound the rows by the caller's `PgMoneyVisibility` scope (`scopeSql`), as FO-7r does, and add a pass/fail line.
* Whether the tiles (totals) should be bounded the same way, or are firm-wide by `view-financial` (AG-14 §2, §3.6 "firm-wide financial reports"), is **Q6 for the tech lead**.

**M3, Major, Must: the row's first "Done when" test ("a trust deposit never counts as fees collected") does not catch the rule being removed.**
* I deleted `and p.received_into = 'OPERATING'` (`metrics.ts:105`): still 34/34.
* The fixture's deposit is a payment with no invoice (`test:90-92`), and `ON_INVOICE` drops that whatever the rule says.
* In the real flow, a payment into trust on an invoice (`money.ts:123-128`) is a `money_payment` row with `invoice_id`, plus a DEPOSIT and a WITHDRAWAL_TO_INVOICE. Without the filter, that money would be counted twice.
* **Fix:** add a fixture written as money.ts writes it, and assert it is counted once (the withdrawal only).

**M4, Major, Must (the breaker's M1, confirmed by reading the code): with a person filter, trust received leaves out money moved onto the case and can go negative.**
* `trustSql` (`metrics.ts:112-116`) never counts MOVE_TO_CASE, and `who("e")` filters by `e.case_id`.
* Repro (break-report.md): `{"CAD":"-300.00"}` for user-O. DW6 never tests trust under a person filter.

**Minor, Should:**
* **n1: four other rules pass with their test removed (each mutation still 34/34).** Add a line for each:
  * (b) the RETURNED_FROM_TRUST branch;
  * (c) a correction of a withdrawal;
  * (d) refunds out of trust (MS-D24);
  * (f) the "counts from the issue" clamp.
* **n2: extra paid beyond the bill counts in Fees collected on the payment day,** whether it is kept as credit or still waiting for a choice. The figure's words do not say so. Either take KEPT off and count APPLIED, or state it in the words.
* **n3: credit `REFUNDED` exists in the schema, but no code writes it on main.** When that writer comes, collected would never take it off. Note it in the module row.
* **n4 (the breaker's m1, m3; confirmed by reading):** overdue by client ranks CAD against USD before the 200-row cut (`:188`), and the "1 more clients" plural (`:193`).
* **n5 (the breaker's m2; not re-measured):** the overdue figures go over 200 ms at about 22,000 credit applications in one firm. DW8's bulk has none.

## The PR's questions (my view)
1. Keep the port's rule. The seeds give Owner and Admin `view-financial`, so the effect is the same. Correct the row's wording.
2. The billed party: agree.
3. Issue date, credit notes not taken off: agree as the Sample choice, stated in the words.
4. "Disputed": agree, not on main.
5. By service/program/office and trended: a later row.

Also outside the row's list (P-26, so not a finding): AG-14-36's "Written off" figure.

## D1-D20 (API row; the screen dimensions go to PF-R3)
| D | Score | Evidence |
|---|---|---|
| D1 | 3 | US-14's three money cases hold. M1 (period) and M2 (AG-14-19) do not |
| D2 | 4 | Reads only; nothing is written |
| D3 | 3 | Reuses FO-7r's terms, caseScope and the cited tax table; skips PgMoneyVisibility (M2) |
| D4 | 3 | Ageing parity with DUE_SQL holds. Trust under a person filter goes negative (M4) |
| D5 | 4 | A failing read is UNAVAILABLE, there is a timeout, and the registration test catches a duplicate |
| D6, D7 | N/A | No content, no AI |
| D8-D14 | N/A | No screen (PF-R3) |
| D15 | 4 | 45 ms live, and DW8 passes; n5 |
| D16 | 2 | Six rule removals survive, including the row's headline rule (M3, n1, M1(e)) |
| D17, D20 | simulated only | No intended user walked it |
| D18 | 4 | Each figure gives its source in words; the tax choice is marked Sample and "Unconfirmed: no accountant" |
| D19 | 3 | Feeds the Owner and Billing dashboards (keys registered); the figures are not yet right |

**BIC-01 to BIC-20:** N/A (not a case-side screen).

## What I could not check
* A Billing / Finance user on a screen: there is no screen until PF-R3.
* CI: on the draft, only the guard runs.
* The breaker's timing (n5): not re-measured.

**To fix before Approve:** M1, M2 (the rows; plus Q6's answer for the totals), M3, M4, each with a pass/fail line that fails when its rule is removed.

**Verdict: Block** (M1, M2, M3, M4).

Reviewer: Block 801724efd603ce791a996ab6ad8b4e55e76e2d4b
