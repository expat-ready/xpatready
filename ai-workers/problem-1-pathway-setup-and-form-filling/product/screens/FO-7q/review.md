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
