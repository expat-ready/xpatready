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

## Round 2 (diff-only, 3f88a5d…)
**Verdict: Approve. Head `3f88a5d304c8172d572a49cc940c60630883526d`.** No open Blocker or Major. I reviewed only `git diff 432fba20..3f88a5d3 -- prototype`. The check gave **39 passed, 0 failed**. I re-ran my round-1 probe on the new head.
* **M1 fixed.** The `ca` CTE (statement.ts) splits the OR join into two hashable joins, and `is distinct from` keeps money_invoice_credit's "either matches" count. Probe timings:

  | Client | Before (round 1) | Now (statement / summary) |
  |---|---|---|
  | 10,000 invoices, 1,000 applied credits, 1,000 withdrawals | about 3,043 ms | 113 / 97 ms |
  | 20,000 invoices, 5,000 applied credits, 5,000 withdrawals | the read timed out | 289 / 284 ms |

  The check's S8 (with other clients' noise) gave 189 ms, or 216 ms through the route.
* **M2 fixed.** S9 writes these facts with triggers on: the OVERPAID_TO_TRUST correction, OVERPAID_REFUND, kept-as-credit (through FO-7b's real `extra` route), and credit APPLIED and REVERSED. Its closing equals invoiceFacts Σ(due − extra) and its owed equals the list's due. The S1 fail line now changes another client's data; the S8 fail line checks the default page size.
* **Breaker M1 (kept credit counted twice) holds.** With KEPT_AS_CREDIT, closing = Σ(due − extra) = owed − waiting. This relies on the database rule `money_credit_kept_holds` (kept is never more than what was paid over). My probe: closing 170.00 = Σ(due − extra) 170.00 = owed 170.00, waiting 0.
* **m1 and m2 fixed.** Probe:
  * the same-day cheque now follows its invoice;
  * credit applied to a draft now counts from 1 Mar (its issue date), so February closes at 170.00.
* **m5 fixed.** "Refunded" is defined in summary.ts's header.

**Accepted as stated limits (not findings):** m3 (trust lines cut by time but ordered by seq), m4 (the "Held in trust" figure goes to part 2 from `summary.cases`), and the breaker's m2.

**New Minor, for the part 4 screen's words:** the summary's `paidMinor` is now money received. It excludes credit applied, while the invoice list's `paidMinor` (facts.ts) includes it, so the two "Paid" figures differ by `creditAppliedMinor` (probe: 1,000.00 against 1,080.00). Label them apart.

**Still open from round 1, Minor:** summary.ts's credit read scans the firm's `money_credit_entry` by party with no party index; at today's sizes the reads are within budget.

**Observation, not a finding:** `set local work_mem = '32MB'` holds for the read's transaction only.

Reviewer: Approve 3f88a5d304c8172d572a49cc940c60630883526d

## Round 3 (diff-only, ea64749…)
**Verdict: Block. Head `ea647490a0ff15528fb03bfb1933b50c2850affa`.** One Major, a regression from this round; its fix is deleting one condition, then re-review. I reviewed only `git diff 3f88a5d3..ea647490 -- prototype`. The check gave **41 passed, 0 failed**.

**The running balance against the old window (the coordinator's question): equal, except in m3's case.** My probe compared every page line with the old `sum(amount) over (partition by acct, currency order by k, o, r, id, inv)` computed over all lines.
* **Normal ledger:** one client with CAD and USD lines, INVOICES and TRUST; 5 periods (none, from only, to only, from to, one day) × 5 page sizes (1, 2, 3, 7, 200), walking every cursor. **1,210 of 1,210 lines are equal.**
* **Why:** an INVOICES line's sort time `k` is the same expression as its period time `at`, so a period is one unbroken run of lines in sort order. `st` (the sum before the page's first line of its group) plus the page's own running sum is then exactly the old figure.
* **Minor R3-2 (m3, wider than before):** TRUST lines sort by seq but are cut by `created_at`. When those orders disagree across a period edge, a line outside the period that sits between page lines is left out of the page's running sum (statement.ts readSql `pg`/`st`/`p`). The figure now depends on page size: 1 Mar only, pageSize 3, the expected balance is 182.00 but the read gives 179.00 (missing the inverted entry's 3.00); pageSize 1 is right. The old window was wrong only at the opening. Rare (concurrent writes across 00:00 UTC). **Fix:** take the page's running sum over every `run` line of the group from `g1` to the page's last key, whatever its period, then keep the `pg` lines. Or state the limit.

**Major R3-1: reversed credit is now quadratic, and the read fails at scale (statement.ts, the CREDIT_APPLIED_REVERSED and KEPT_AS_CREDIT_REVERSED branches)**
* **Cause:** round 3 added `and r.reverses_entry_id = any((select ca_ids.a from ca_ids)::uuid[])` beside the join's `reverses_entry_id = e.id`. EXPLAIN ANALYZE shows both as Index Cond on `money_credit_entry_firm_id_reverses_entry_id_idx`, so every probe also handles the client's whole array of credit ids: **1.035 ms × 5,000 loops = 5.2 s**.
* **Measured** (statement page 1, readSql alone):

  | Client | As built | Without that condition (same totals) |
  |---|---|---|
  | 10,000 invoices, 2,000 applied credits | 817 ms | 108 ms |
  | 20,000 invoices, 5,000 applied credits, 5,000 withdrawals | 5,405 ms; through the service both the statement and the summary pass Prisma's 5 s limit and fail | 269 ms |

  Round 2 at 20,000 / 5,000 / 5,000: 289 ms. At 10,000 / 1,000 / 1,000 it is 269 ms against round 2's 113 ms.
* **Why the check missed it:** S8 seeds only 100 applied credits.
* **Fix:** delete that condition (and `ca_ids`); the join already drives the index. Seed S8 with a few thousand of the client's own applied credits.

**Minor R3-3:** the comment on summary.ts's credit read says it reads `money_credit_entry_party_seq`. That index is partial (`WHERE case_id IS NULL`), so Postgres can use it only when the scope holds no cases; my EXPLAIN shows the index used then and a firm scan otherwise. The app's PgMoneyVisibility lists cases, and "ALL" adds no condition, so both still scan the firm. Within budget today (S8: summary 206 ms). Correct the comment.

**Held:**
* the `ids` / `= any(...)` reads of the other fact tables;
* the round-2 figures: closing 170.00 = Σ(due − extra) = owed;
* `r` in the key and the cursor (S1's three pre-issue payments keep the order received);
* the top-N page.

Reviewer: Block ea647490a0ff15528fb03bfb1933b50c2850affa

## Round 4 (diff-only, 0561097…)
**Verdict: Approve. Head `0561097c276f7747bc0f7af580972ab10db64c18`.** No open Blocker or Major. I reviewed only `git diff ea647490..0561097c -- prototype`. The check gave **45 passed, 0 failed** (the machine was loaded, load average about 2.8).
* **R3-2 fixed: `sp` equals the old running sum on every page.**
  * **By construction:** a page line's balance is `st.s` (the group's lines before the page's first line) plus a running sum over every `run` line of the group from `g1` to `g9`, whatever its period. That is the old window over all lines, with no reliance on the period being an unbroken run.
  * **By probe** (every page line against the old window computed over all lines; CAD and USD, INVOICES and TRUST; 5 periods × page sizes 1, 2, 3, 7, 200, every cursor walked):
    * normal ledger: **1,210 of 1,210 equal**;
    * with the trust seq/time inversion across 1 Mar: **1,250 of 1,250 equal** (round 3: 6 off).
  * The check's new S5 lines (pages of 1 and 3) agree.
* **R3-1 fixed.** The array condition and `ca_ids` are gone.

  | Client | Round 3 (statement / summary) | Now, medians of 3 on the loaded machine |
  |---|---|---|
  | 10,000 invoices, 2,000 applied credits | 817 ms (readSql) | 126 / 128 ms |
  | 20,000 invoices, 5,000 applied credits, 5,000 withdrawals | failed at the 5 s limit | 304 / 348 ms (round 2: 289 ms) |

  The check's S8 gives 95 ms / 110 ms (3,333 invoices, each with credit applied and reversed) and 255 ms / 215 ms (53,000 other invoices in the firm).
* **R3-3 fixed.** The comment now says the partial index serves only scopes without cases.
* **`summarySql`** is a move of the round-3 text. My round-2 figures still hold: closing 170.00 = Σ(due − extra) = owed.

**Minor R4-1 (new, from the breaker's R3-m1 fix): a forged cursor with an impossible fact time gives a database error, not a 422**
* **Where:** `FactTime` (statement.ts:42) is a regex only. A cursor whose `r` is `2026-99-99T99:99:99.000000` or `0000-01-01T00:00:00.000000` reaches `::timestamp`, and Postgres raises 22008 ("date/time field value out of range"). Nothing maps 22008 in `api/src`, so the answer is a 500.
* **The rule it breaks:** `cursorOf`'s "anything else is 422 naming after", and the "never a database 500" rule in reads/common.ts.
* **Still works:** a real 1999 time walks fine.
* **Fix:** refine `FactTime` with a real-date round trip (any year 0001–9999), as `Stamp` does without the 2000–2999 range.

**Still open, Minor (stated limit):** the "Held in trust" sentence goes to part 2 (round-1 m4). Round-1 m3 is now fixed by R3-2.

Reviewer: Approve 0561097c276f7747bc0f7af580972ab10db64c18
