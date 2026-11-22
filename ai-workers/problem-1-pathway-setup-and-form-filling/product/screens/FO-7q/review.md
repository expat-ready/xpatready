# FO-7q review: money reads paged on the server (PR #3001, head 1693e1149)

The reviewer is a fresh context that did not build this. Scope is FO-7q's own diff `dc7209770..1693e1149` (9 files, +585). I also read FO-7b part 1b's `invoices/facts.ts` and `ports/client-money.ts invoiceStatus` to check the SQL twin against them. The contract is brief `design/briefs/FO-7q.md` plus BACKLOG row FO-7q. I took the tech lead's rulings 1-4 on #3001 as settled. DW8 is out of scope.

**Verdict:** Ship after fixes. There are 2 Major findings and 6 Minor ones. No Blocker.

## What I ran
- The suite (`tsx --tsconfig api/tsconfig.json tests/check_fo7q_reads.ts`) gave **30 passed, 1 failed, exit 1** in 36 s. The one failure is the expected DW1 page-1 plan check (seq scan of `money_invoice`, waiting on #2368's index, ruling 1). Times: page 1 in 72 ms, status=OVERDUE in 21 ms.
- I ran a probe copy of the suite from the scratchpad. It adds the extra calls below and changes nothing in the repo. Its scratch database is dropped at the end.
- `node product/tools/graph.mjs --check` exits 0. It finds no hard gap and no FO-7q gap.

## Findings

**M1 (Major): status filters take 1.1-2.2 s on 10,000 invoices, and the passing OVERDUE timing case only passes because of its seed.**
- Where: `tests/check_fo7q_reads.ts:192` and `:208`; `api/src/client-money/reads/invoices.ts:110` and `:122`.
- The cause in the seed: all 20,000 bulk invoices get `due_date = '2026-12-31'`, and the list uses the real clock (`systemClock`). Every bulk row is therefore removed by the Overdue precondition (`due_date < today`), so FACTS_LATERAL runs for about one row. The 21 ms says nothing about filtering 10,000 invoices.
- Probe, same seed:
  - `status=OPEN` 1881 ms; `OPEN&pageSize=200` 1987 ms.
  - `PAID` 1725 ms.
  - `PART_PAID` 2158 ms.
- Probe after setting the bulk due date to 2026-01-31, which is what the real clock produces on and after **1 Jan 2027**:
  - `status=OVERDUE` 1497 ms and 1139 ms.
  - `overdue=true` 1447 ms.
- So DW1's asserted case (ruling 1: OVERDUE under 300 ms) **fails with realistic data and will turn red on its own in 40 days**. The PR's "OVERDUE 13 ms" overstates the result.
- The cause in the code: with a status filter, `cut` drops the inner limit. The outer sort is then on computed text (`x.d, x.t desc, x.id`), so Postgres must work out the facts and status of **every** candidate row before it can sort and take 51.
- Fix, both needed:
  - (a) Make the DW1 seed realistic: a fixed clock, and a mix of past-due paid and unpaid rows. Assert the status filter's time on it.
  - (b) Let the filtered query stop early. Order each half on the real columns (`issued_at desc, id` / `created_at desc, id`), and filter the status inside that ordered, limited scan, so the planner can stream from #2368's index and stop at `pageSize+1` matches. If a rare word (for example Written off) still cannot meet 300 ms, ask the tech lead (the brief says "if the plan still needs another index, stop and ask"). Do not leave a test that is green only because of its seed.

**M2 (Major): bad input gives a 500, not a 400 (AG-6-37 r3, "rejected early with a clear message").**
- Where: `invoices.ts:45` and `:101`; `payments.ts:18-19` and `:33`.
- The day regex accepts dates that do not exist. Postgres then throws 22008 during `::date` / `::timestamp`, and the request ends as a 500.
- Probe results (all `500 Internal server error`):
  - `GET …/invoices?issuedFrom=2026-02-31`
  - `issuedFrom=2026-13-45`
  - `issuedTo=0000-01-01`
  - `GET …/payments?from=2026-02-30`
  - a cursor with `t: "2026-99-99T99:99:99.000000"`, on both lists
- Fix: validate real dates with the `day` refine that `ports/client-money.ts:84` already has (it is not exported; reuse it or copy its rule). Check the cursor stamp the same way (parse it and compare it round-trip). Add these inputs to the DW2 400 list.

**m1 (Minor): `trustRequestId` is missing from the payments filter, and the PR does not say so.**
- Where: `payments.ts:18`.
- The brief names `GET /payments?invoiceId=&trustRequestId=&method=&from=&to=`. Probe: `?trustRequestId=…` gets 400 "Some filters are not understood".
- Fix: either add the filter (answered only while trust shows, otherwise 400 or empty, AG-6-59 r5), or name the narrowing in the PR. "Never deviate silently" applies.

**m2 (Minor): the actions table hides actions on a Refunded invoice that FO-7b's routes accept.**
- Where: `actions.ts:11` and `:23`.
- Probe: Refunded gives `allowedActions` = `["DOWNLOAD_PDF"]` with `creditableMinor` 1000. FO-7b's `POST …/credit-notes` on that same invoice answered **201**.
- Screens show only `allowedActions` (FO-7s1), so a refunded invoice that still owes its total cannot be cancelled or credited from the screen.
- Fix: make Refunded follow the routes (credit note, and record payment and send if intended), and update the DW4 case at `check_fo7q_reads.ts:39` ("Refunded offer … nothing but the PDF").

**m3 (Minor): `creditableMinor` ignores money paid from trust.**
- Where: `invoices.ts:136`.
- FO-7b refuses with TRUST_PAID when the amount is more than open minus trustPaid (`money.ts:145`). With open equal to trustPaid, CREDIT_NOTE is still offered and the route refuses every amount.
- Fix: use `openMinor - trustPaidMinor`.

**m4 (Minor): DW3 never exercises two SQL columns or the "trust No with money held" branch.**
- The fixtures have no trust-paid invoice, no credit APPLIED or KEPT, no part credit and no part write-off. The `trust` and `applied` columns of `FACTS_LATERAL` are always 0, so a typo in them would pass.
- `trustShows`'s held branch (AG-6-59 r6) is never true in any test, because the trust No case at `:150` holds nothing.
- Fix: add one fixture each for trust paid and credit applied, and one held-money case under trust No.

**m5 (Minor): some fail cases test the checker, not the code.**
- Where: `:209` and `:164`.
- `!(301 < 300)` is a constant. DW6 fail plants a key into a test object.
- These are acceptable as checker self-tests, but DW1's time has no real fail case. That will matter once M1(a) lands.

**m6 (Minor): `overdue=false` is accepted and ignored.**
- Where: `invoices.ts:94`.
- It answers every status, Overdue included.
- Fix: either define it (exclude Overdue) or accept only `true`.

## Checked and holding
- **SQL status vs `invoiceStatus`:** the rules are in the same order: Draft, Written off (count > 0), Credited (credited > 0 and credited >= total), Refunded (refunded > 0 and paid <= 0), Paid (total-credited-written-paid <= 0), Overdue (`today > due_date`), Part paid, Open. The facts columns are identical to `facts.ts` column for column, including the trust column less the overpaid refund, the applied credit sign, and `received_into='OPERATING'`. DUE_SQL matches `dueMinor`.
- **Precondition narrowing never drops a matching row:** Draft is `issued_at is null`; Overdue is issued with `due_date < today`, the same as `today > due_date` with due not null; every other word is issued.
- **Keyset cursor:** the timestamps are `timestamptz`. `to_char(... at time zone 'UTC', …US)` and `::timestamp at time zone 'UTC'` round-trip at microsecond precision. Text `t` sorts like the time. Text uuid sorts like uuid under this database's collation (C), and under en_US too, because hyphens sit at fixed positions and 0-9 sort before a-f. The halves switch correctly on `d`.
- **Paging probes:** DW2 passes 600 rows with ties on `issued_at` (the bulk shares one `now()`), so the inner uuid order and the outer text order agree. My probe also paged `status=OVERDUE` across 3×200 rows: 600 rows, 0 repeats.
- **Firm walls:** `firm_id` comes first on every query, including the facts subqueries, receipts, refunds, payments with no invoice, and `trustShows`. A cursor carries no firm. DW7 passes.
- **C5 fails closed** in the feature (`failClosed`). Payments are scoped through their invoice. A payment with no invoice shows only with scope ALL while trust shows.
- **Trust fields:** `receivedInto`, `trustRequestId` and `trustPaidMinor` are present only while `trustShows`. Trust deposits are excluded while trust is off.
- **Currencies:** no response sums amounts across currencies; each amount carries its currency. The one sum, `refundedMinor`, is over one payment's refunds, all in that payment's currency.
- **`allowedActions` keys vs the brief:**
  - edit and issue: `:edit` / `:issue`. EDIT is also offered to the draft's creator holding `:create`, which is FO-7b's addLine rule.
  - credit note: `:void`.
  - record payment: `payment:record`.
  - SEND and PDF: `:issue` / `:show`, matching FO-7b's routes on the branch.
  - Refund, write-off, Pay from trust and pay link are rightly absent (their routes are not on main).
- **Requests:** none per row. The payments refunds come in one `json_agg`.

## Screen-review sections not applicable (API row, no screen)
These are N/A: concept elements, keyboard, 1024 px, 200 % zoom, menu words, D1-D20 screen scores and the BIC-01-20 scorecard. D17 and D20 are not walked by an intended user. Retrofit mapping: none (new files only).

## Journey test (reviewer role): 6.9 / 10, fail (pass needs 8)
The details are in `journey-test-reviewer-2026-11-22.md`. The score is 5.5 out of the 8 criteria that apply here; accessibility and visual quality are N/A because there is no screen. M1 lowers speed and M2 lowers error recovery and plain words. Fixing M1 and M2 brings it to about 8.1.

## Could not check
- The page-1 plan with #2368's index (not on this branch).
- FO-7b, PF-12 and full CI suites: not re-run, because FO-7q changes no file they cover.
- Behaviour under a non-C collation on another machine (reasoned above, not run).

Verdict: Changes on 1693e1149

## Round 2: diff-only re-review of 77713d8e8 (P-277; `git diff 1693e1149..77713d8e8`, studio paths)

**Verdict: Ship.** M1 and M2 are fixed, and so are m1, m2, m3 and m6. No Blocker and no Major is open.

**Suite as committed:** 35 passed, 2 failed, exit 1. Both failures are DW1 cases waiting on #2368's index `(firm_id, issued_at DESC, id)`:
- the page-1 plan check, which is ruling 1's known failure;
- OVERDUE taking 759 ms. The status filter now relies on the index to stop early, so without it the filter reads every candidate row.

**Probe with that index added in a scratch database:** 37 passed, 0 failed. Times on the fixed day 1 Mar 2027:
- `OVERDUE` 31-38 ms, `OPEN` 41-45 ms, page 1 20-44 ms, `OPEN&pageSize=200` 121 ms.
- The plan for OVERDUE reads `money_invoice_firm_id_issued_at_id_idx`, with no seq scan.

**Fixes checked**
- **M1, fixed.**
  - Each half now filters on the status inside its own `order by … limit pageSize+1` (`invoices.ts` `half()`), so with the index it stops after a page of matches.
  - The seed spreads due dates over 120 days, and the case reads on a `FakeClock` set to 2027-03-01: about half the rows are overdue and half open, so the assertion does real work. It also asserts `n === 50`.
  - Paging under a filter, with the index, gives the right counts:
    - `OVERDUE`: 4×200 = 800 rows, 0 repeats, 0 wrong words.
    - `OPEN`: 4×200 = 800 rows, 0 repeats, 0 wrong words.
  - The cursor and both sort orders are unchanged from round 1, where they held.
- **M2, fixed.** `common.ts` `Day` and `Stamp` now refuse dates and times that do not exist. The suite's 400 list includes them, on both lists.
  - My probe: `issuedFrom=2026-02-29` and `1999-12-31` give 400; `2028-02-29` gives 200.
- **m1, fixed.** The `trustRequestId` filter is added. With trust off it answers an empty page (only operating payments on an invoice are read).
- **m2, fixed.** CREDIT_NOTE is now offered on any issued invoice except a written-off one, while something is creditable. That includes Refunded, as FO-7b's credit route allows. Both the pass and the fail case are present.
- **m3, fixed.** `creditableMinor = open − trustPaid`, and 0 when Written off. The detail test shows 1,000 − 600 = 400.
- **m6, fixed.** `overdue` accepts only `true`; `false` is 400.
- **Breaker B3, B6 and B7: correct.**
  - B3: trust-received payments are not answered while trust does not show.
  - B6: no `t` in the detail payments; refund `createdAt` is an ISO string.
  - B7: EDIT needs `:create`, as the line route does.

**Still open (Minor, do not block)**
- **R2-m1: rare status words still read every candidate row, 1.2-1.7 s with the index.** Probe on 10,000 rows: `PAID` 1412 ms, `PART_PAID` 1624 ms, `CREDITED` 1460 ms, `REFUNDED` 1409 ms, `WRITTEN_OFF` 1239 ms.
  - Raising this rather than fixing it here is right. The brief says "if the plan still needs another index, stop and ask". Stored facts or an index are schema, outside this row's touch list. DW1 gates only OVERDUE (ruling 1).
  - Condition: the question must be posted on #3001 as "Question for the tech lead", quoting these times, before the label is applied.
  - Note: in a real firm, Paid is the common word and would stop early. The words that stay rare (Part paid, Credited, Written off) are the slow case.
- **m4, partly fixed.** The trust-paid fixture now exercises the trust column. Still not covered: a credit-applied fixture (the `applied` column) and trust No with money held (`trustShows`' true branch).
- **m5, accepted as is.** The two constant fail cases test the checker. DW1's real failure is caught by the plan case and now by the 300 ms / `n === 50` assertion.

**Journey score, round 2 (reviewer): 8.75 / 10 (7 out of the 8 criteria that apply), pass.**
- Next step, plain words and error recovery go to 1.
- Task completed stays at ½: in the app every list is empty, because C5 fails closed (ruled).
- Speed stays at ½: the rare words in R2-m1, and every filtered read is 0.7-1.5 s until #2368.

**Merge note:** CI cannot be green until #2368 merges, which is already the Ready-when. Both failing cases pass with that index.

Verdict: Approve on 77713d8e8

## Round 3: diff-only re-review of 2b1b85a40 (P-277; `git diff 77713d8e8 2b1b85a40 --` reads/, check_fo7q_reads.ts)

**Verdict: Ship.** No Blocker and no Major. Since 77713d8e8 the branch merged main (60f6d32ce: #2953, #3036 FO-7b 1c refunds, #3048 FO-7g 1w). `git diff origin/main...2b1b85a40` holds only FO-7q's 13 files.

**The status twin still holds on main.**
- `invoices/facts.ts` is unchanged from 77713d8e8 to 2b1b85a40, and is identical on the current `origin/main` tip.
- `ports/client-money.ts` gained only additive code from FO-7b 1c (the refund event, RefundIn, ExtraChoiceIn and the two views). `invoiceStatus`, `InvoiceFacts` and `StatusWord` did not change.
- The database functions that FACTS_LATERAL reads (`money_invoice_total`, `money_trust_paid`, `money_invoice_credit`) are the same calls `facts.ts` makes, so a migration change reaches both alike.
- So `status-sql.ts` still mirrors `invoiceStatus` rule for rule and column for column.

**Suites I ran myself:**
- `check_fo7q_reads`: 35 passed, 2 failed. The same two DW1 cases wait on #2368, as in round 2 (OVERDUE 379 ms without the index).
- `check_fo7b_refunds`: 29 passed, 0 failed.
- I did not re-run `check_fo7b_invoices` (108/0), `check_pf12_walls` (110/0), `check_pf28_inputs` (48/48) or tsc. They are the builder's figures.

**The changes**
1. **PF-28's one rule for field errors: correct.**
   - `parseInput` and `badField` now give 422 `INVALID` with `fields` naming the field:
     - `pageSize`, `status`, `after`, `issuedTo` or `to` (for an inverted range), `partyId` (for a half pair);
     - any unknown field, through the strict schema.
   - The test's check is real: it requires 422, `code: "INVALID"` and a `fields` object naming `pageSize`, `colour`, `status` and `from`. The 400 answers of round 2 would fail it.
   - This replaces the brief's "500 gives 400". PF-28 is the platform's rule on `main` and `check_pf28_inputs` enforces it. It must be named in the PR as a deviation from the brief (the builder says it will be).
   - Cosmetic, from the platform helpers and not FO-7q's text: on a GET, parseInput's detail ends "Nothing was saved.", and the two helpers use different titles ("Check the details" vs "Some details need fixing").
2. **The overdue fixture now sends `?dueDate=`.** This follows #3016's move of issue's due date to the query, and the setup case still checks `dueDate === "2026-01-05"`.

**The REFUND and EXTRA_CHOICE follow-up: acceptable, not needed in this PR.**
- The brief says an action appears only when its route is on `main` (a ceiling, not a duty), and that a later row adds its line to `reads/actions.ts`.
- Both routes (`POST …/payments/:paymentId/refunds` with `agent/refund:create`, and `…/extra` with `agent/payment:record`) act on a **payment**, not on the invoice that `allowedActions` describes.
- Offering them correctly needs FO-7b's private `leftToRefund` and waiting logic. Copying that logic here would put the same rule in two places (P-526).
- Nothing offered today is wrong: this is an omission, and no screen consumes it yet (FO-7s3a is not built).
- **Condition (R3-c1):** the PR names it as a follow-up with its row (export the two predicates from `refunds.ts`, then one line each in `actions.ts` or in a per-payment actions field), before the label.

**Still standing from round 2:** R2-m1 (rare status words 1.2-1.7 s with the index). It is now posted on #3001 as "Question for the tech lead", so that condition is met. m4 (partly fixed) and m5 (accepted) remain Minor. The journey score is unchanged: **8.75 / 10, pass.**

Verdict: Approve on 2b1b85a40

## Round 4: diff-only re-review of 343542fa2 (P-277; `git diff 85d577218 343542fa2`: reads/invoices.ts, reads/status-sql.ts)

**Verdict: Ship.** No Blocker and no Major.

**Why it changed:** run 45070511287 on main with #2368 failed DW1: OVERDUE took 696 ms because of a sort plan.

**The fix:**
- `list` reads each half (issued, then drafts) in candidate chunks: 200, doubling up to 2,000.
- Query A (`candidates`) reads only ids and sort keys, in the half's index order, under every where and scope condition.
- Query B (`statuses`) works out the facts and status of exactly those ids. It reads them by `unnest(...) with ordinality` joined on (firm_id, id), keeps the asked words, and orders by the ordinality.
- `FACTS_LATERAL` gets `offset 0`, so each row's facts are computed once.

**What I checked**

**Logic (by reading):**
- The cursor between calls is the last returned row (a match). Within a call, `from` is the last *candidate*, so non-matches already read are never read again in that call. The next call restarts after the last match, so matches past the page come back on the next page, never skipped.
- A chunk's matches are all pushed before the page is cut. A chunk ending mid-page continues from its last candidate. `cands.length < chunk` ends the half.
- A cursor in the drafts skips the issued half (`half.d < after.d`). A cursor in the issued half reads the drafts from their start.
- Query A compares ids as uuids (`i.id > from.id::uuid`) and orders by `i.id` as uuid. B keeps A's order through the ordinality. The old outer text sort is gone, so round 1's collation question no longer applies.
- The where and scope conditions sit in A only. B reads within the caller's firm (`i.firm_id = firmId`) and only ids that A returned.
- One interactive RepeatableRead transaction keeps A and B on one snapshot.
- `status-sql.ts`'s CASE and the facts columns are unchanged; only `offset 0` was added.

**Probe** (the suite plus a walk oracle, run once without #2368's index and once with it). The oracle walks the unfiltered list at pageSize 200 to the end, then checks each filtered walk against it.
- **Unfiltered walk:** 10,014 rows in 51 calls, in exactly the order of `order by (issued_at is null), coalesce(issued_at, created_at) desc, id`, with every row unique. It crosses the issued-to-drafts seam.
- **Filtered walks**, each equal *in order* to the oracle's subsequence of its words:

| Filter | Page size | Rows | Calls |
|---|---|---|---|
| `OVERDUE` | 200 | 4,943 | 25 |
| `OPEN,DRAFT` (crosses the seam with a filter) | 173 | 5,067 | 30 |
| `PAID,CREDITED,WRITTEN_OFF` | 2 | 3 | – |
| `REFUNDED` | 1 | 1 | – |
| `PART_PAID` | 50 | 0 | – |
| `DRAFT` (the cursor is in the drafts on every call) | 1 | 4 | – |

- **Times, fixed day 1 Mar 2027:**

| Read | Without the index | With the index |
|---|---|---|
| OVERDUE | 29-35 ms | 21-23 ms |
| OPEN | 31 ms | 19-27 ms |
| page 1 | 16-57 ms | 7-15 ms |
| OPEN with pageSize=200 | 74 ms | 55 ms |
| rare words (PAID, PART_PAID, CREDITED, REFUNDED, WRITTEN_OFF) | 0.79-0.85 s | 0.70-0.73 s |

  Rare words were 1.2-1.7 s in round 2.
- **Suite:** 36 passed, 1 failed without the index (only the page-1 plan case, which waits on #2368). With the index: 37 passed, 0 failed.

**Minor**
- **R4-n1: DW1's plan check now EXPLAINs only query A**, the first issued-half candidate read, which is the one that touches the 10,000 rows. Query B's plan is not asserted. B is a by-id join on the unique `(firm_id, id)` for at most 2,000 ids, so the risk is low. A one-line EXPLAIN of B with no seq scan of `money_invoice` would close it.
- **R2-m1 remains the tech lead's open question** (rare words 0.7-0.85 s; the breaker's firm-like OVERDUE seed of mostly paid past-due invoices is the same question). m4 and m5 are unchanged. The journey score is unchanged: **8.75 / 10, pass**.

Verdict: Approve on 343542fa2
