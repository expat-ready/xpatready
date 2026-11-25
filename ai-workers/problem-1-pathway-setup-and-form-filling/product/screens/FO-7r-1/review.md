# Review: FO-7r part 1 (R1.111): a client's money summary and statement (API only)

Independent reviewer (fresh context, did not build it), 25 Nov 2026. **Head `432fba2023523f8952f0aa7c85684ebd5e252426`**, branch `claude/sweet-mccarthy-irx5y6`, PR #3634. I read the approved shape `screens/fo-7s-money/build/r1-111-shape.md` (part 1), AG-6-28 and AG-6-30, and checked against `reads/status-sql.ts` FACTS_LATERAL, `invoices/facts.ts`, `reads/visibility.ts`, `trust/reads.ts` and the database functions `money_invoice_total`, `money_trust_paid` and `money_invoice_credit`. No :4400. Code untouched. Journey report: `journey-test-reviewer-2026-11-25.md`.

## Verdict: Block. Two Majors to fix, then re-review (Ship after fixes: each fix is local; no rework). Journey 8/10

**Suite:** `check_fo7r_statement.ts` gave **29 passed, 0 failed**, the builder's count.
**Reviewer probe** (scratch database, every migration, facts written as SQL; dropped after): one client with every fact kind the check does not seed:
* a same-day cheque;
* a trust withdrawal, then its CORRECTION;
* an OVERPAID_REFUND credit note;
* credit APPLIED, then REVERSED, then APPLIED again;
* a payment paid over and kept as credit.

Results: the closing INVOICES balance was **CAD 20.00, equal to Σ(total − credited − written off − paid) from invoiceFacts** (PR-1 due 170.00, PR-2 −150.00). The summary's owed was **170.00, equal to the invoice list's Σ due**; credit 70.00; trust 400.00, equal to the trust ledger's own balance. For 11–13 Feb, opening 550.00 plus that period's lines gives the closing 100.00.

## What holds (checked, with evidence)
* **Signs, fact by fact, match FACTS_LATERAL term for term.** Total: the same line sum as `money_invoice_total`. Payment: −, OPERATING only. Refund: + (joined through the payment, as FACTS is). Withdrawal: as stored (negative). CORRECTION of a withdrawal: + (as `money_trust_paid` subtracts it). OVERPAID_REFUND: +overpaid. APPLIED: as stored (negative); its reversal: +. Credit note and write-off: −. No fact is counted twice: money received into trust counts only as PAID_FROM_TRUST, and the TRUST account is separate and never added in.
* **Currencies are never summed.** The window is partitioned by (account, currency). `add()` throws on a currency mismatch (summary.ts:23).
* **Firm walls.** Every branch filters `firm_id`; `partyFor` reads in the session's firm. Another firm's id, an unknown id and a bad kind each give the same 404 (S6).
* **C5.** `inv` uses `scopeSql`; trust and credit rows use `seenSql`, which matches trust/reads.ts's `seen`. The party must be in the scope's party half. An empty scope gives 404.
* **Paging.** The keyset `(acct, currency, k, o, id, inv)` is unique and its row comparison matches the ORDER BY. A forged cursor gives 422; it never widens the firm. Pages of 2 walk exactly the same lines as one page of 200 (S7).
* **Period.** The running balance is windowed over every line before the period filter. Opening is the sum before `from`; closing is the sum before `to` + 1 day.
* **Reads only.** One RepeatableRead transaction. `unbilled: null` (Lead 4).

## Findings
**Major 1. A statement or summary of a client with many invoices slows by the number of credit entries in the whole firm, and fails past 5 s**
* **Where:** statement.ts:69 and :72, `join inv i on (i.id = e.invoice_id or i.id = p.invoice_id)`.
* **Why:** the OR join cannot hash. My EXPLAIN shows a **nested loop of every invoice of the client × every credit entry of the firm**: 2,030,000 rows for 10,000 invoices × 203 entries, taking 490 ms of a 688 ms statement.
* **Measured:**

  | Client | Credit entries in the firm | Statement | Summary |
  |---|---|---|---|
  | 10,000 invoices | about 1,200 | 3,043 ms | 1,339 ms |
  | 10,000 invoices | 0 own, 1,200 other clients' | 2,855 ms | — |
  | 20,000 invoices | 5,000 (plus 5,000 withdrawals) | over 5 s: Prisma "expired transaction", an error answer | — |

  The 300 ms budget is AG-6-30 and STANDARDS §9. In the second row the client has no credit of their own: the cost comes from other clients' rows.
* **Why the check missed it:** S8 passes only because its firm holds 2 credit entries.
* **Fix:** split each branch into two equi-joins, `e.invoice_id = i.id` and `p.invoice_id = i.id`, keeping FACTS' "either matches" meaning. Alternatively, a lateral per invoice on `(firm_id, invoice_id)` / `(firm_id, payment_id)`. Then seed S8 with a few thousand credit entries on other clients.
* **Also, Minor:** `money_credit_entry` has no index on the party, so summary.ts:61 scans the whole firm's credit entries.

**Major 2. Three of the ten line kinds, and the shape's overpay proof, have no test: removing or flipping them still gives 29/29**
* **The untested kinds:**
  * The fixtures hold no CORRECTION of a withdrawal, no REVERSED credit and no credit note with `overpaid_choice`. So PAID_FROM_TRUST_CORRECTED (statement.ts:64), RETURNED_FROM_TRUST (:66) and CREDIT_APPLIED_REVERSED (:70) each pass with the branch deleted or its sign flipped.
  * The same goes for the summary's trust clamp (summary.ts:50).
* **The overpay proof:** the shape promises "seeded mixes: … overpay kept as credit" and "closing balance = owed − overpaid-and-kept". Instead:
  * The S4 "fail" (test:163) asserts `closing === owed + 0`, which is a pass case.
  * The KEPT fixture (test:126) is a state the database refuses: 120.00 kept from a payment on an invoice that is not paid over, written with triggers off.
* **Fake fail lines:**
  * S8 fail (test:226) is `!(301 < 300)`, which is always true.
  * S1 fail (test:146) mutates the test's own helper, not the code.
* **Status of the figures:** my probe shows the three branches are right today. This is a missing guard on money code, not a wrong figure.
* **Fix:** seed each of the three facts through their routes, or with SQL that keeps triggers on. Assert closing = FACTS and owed = list due. Add a real overpay-kept fixture (closing = owed − kept). Make the S8 and S1 fail lines exercise the code.

**Minor 1. A same-day cheque sorts before its invoice**
* **Where:** statement.ts:58 and :80 order by `received_at`. A payment recorded with its real past date is stored at 00:00Z (invoices/money.ts:122).
* **Scenario:** invoice issued 10 Feb 14:00, cheque received the same day. The statement reads PAYMENT −300.00 (balance −450.00), then INVOICE +1,000.00. The client would see that sequence once part 2 sends it.
* **Fix:** sort INVOICES lines by day, then with the invoice first.

**Minor 2. Credit applied to a draft counts in a period before the invoice exists**
* **Scenario (probe):** credit applied 20 Feb to a draft, issued 1 Mar as PR-3. The February statement closes at **−30.00** with a CREDIT_APPLIED line naming PR-3. Without it, February closes at +20.00.
* **Fix:** date each fact at `greatest(fact time, i.issued_at)` for the period cut and the sort.

**Minor 3. TRUST lines are cut by time but run by sequence**
* **Where:** TRUST lines run by `seq` (statement.ts:40, :47) but the period cuts them by `created_at` (:100).
* **Scenario:** a withdrawal whose transaction started before midnight takes a later seq than one that started after midnight. Opening plus the first line then differs from that line's balance (closing stays right). Rare.
* **Fix:** cut by seq, or state the limit.

**Minor 4. No per-case trust words in the statement read**
* The shape's part 1 statement includes "Held in trust for <case>: CAD x", but `Statement` (statement.ts:35) has no per-case trust figure.
* The summary's `cases[].trustMinor` and `caseLabel` carry the data.
* **Fix:** say in MODULE.rows that part 2 composes it from the summary, or add it.

**Minor 5. "Refunded" is not defined**
* "Refunded" counts payment refunds only (summary.ts:49). Trust REFUND_TO_CLIENT and credit REFUNDED are not in it.
* **Fix:** state the definition in the contract or doc comment.

## D1–D20 (API only; screen dimensions N/A)
D1 Requirement fit 4: AG-6-28 r1 figures per case and client, per currency; r3's period and trust data; r2 owed · D2 Data integrity 5: reads only, one snapshot · D3 Reuse 4: FACTS terms, `scopeSql`, cursors, `trustShows` reused; the facts are re-expressed as lines, not copied · D4 N/A · D5 Stability 3: a timeout fails the read (Major 1) · D6 N/A (no write, no audit by design) · D7 N/A (no AI) · D8–D14 N/A (no screen) · D15 Speed 2: over budget at scale (Major 1) · D16 Testability 2: Major 2 · D17 simulated only · D18 Provenance 4: each line names its kind, reference and invoice · D19 not yet: parts 2–4 · D20 simulated only.

**BIC-01–20:** N/A (no case-side screen).

**Graph:** the two routes show `testedBy: []`, because the check calls them through a template helper the graph does not resolve. Sibling money routes show the same. This is a tool limit, not a finding.

**Could not check:** a real Postgres plan at production size (my sizes are synthetic); the per-tenant RLS plan as `xr_app` beyond what the check runs; parts 2–4.

Reviewer: Block 432fba2023523f8952f0aa7c85684ebd5e252426
