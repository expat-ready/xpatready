# Break report: FO-7q, the money reads (PR #3001, head 1693e1149)

Commit broken: `1693e1149a2c73255689a549ef58610f023189a8` (branch `claude/modest-heisenberg-7933f2`). API only, no screen.
Spec: `design/briefs/FO-7q.md`. Not findings (tech lead): OVERDUE proven by time, not plan; the page-1 seq scan until #2368; the `/detail` path; `agent/invoice:show` for payments; DW8; C5 failing closed in the app.
How I tested: I wrote a scratch script (not committed) with the setup of `tests/check_fo7q_reads.ts`: every migration, a Nest app with PF-4's guard, PF-12's walls and FO-7b's routes, and two sample firms. Database `xr_studio_fo7q_break_<pid>` at :54329, dropped afterwards.
I sent HTTP calls to the shipped app (fail closed) and called `InvoiceReads`/`PaymentReads` directly with scope `"ALL"` inside `withFirm`. About 90 attacks. Paths below are under `prototype/studio/api/src/client-money/`.

## Findings

**B1, Major: a status filter takes 1.0-1.6 s on 10,000 invoices. The OVERDUE timing case passes only because its seed has nothing overdue.**
What I did: 10,000 issued invoices in firm A (each with one line, `issued_at` spread over 300 days, due 2026-01-05, half paid in full), plus 10,000 in firm B. Then `analyze`, and each list timed 3 times.
Expected: AG-6-30's 300 ms. The test asserts `status=OVERDUE` < 300 ms as its DW1 proof (Lead 4, answer 1).
Actual (ms): `status=OVERDUE` 1554/1464/1405 · its page 2 by cursor 568/680/570 · `overdue=true` 1413/1142/1106 · `status=PAID` 1110/1101/1140 · `status=OPEN` with 1 match 1231/987/1083 · `status=REFUNDED` with 1 match 1114/1259/1247 · all 8 codes 1330/1151/1033.
Without a status filter, page 1 takes 32-39 ms, a party filter 24-40 ms, and the payments list 24-38 ms.
Why: with a status filter, `cut` is empty, so both halves are read in full (`reads/invoices.ts:110`). FACTS_LATERAL then runs its function calls on every row before the outer `where`, `order` and `limit` (`:118-122`). The only narrowing is `issued_at is not null`, plus `due_date < today` for Overdue (`:105`). Every non-Draft word except Overdue therefore reads every issued invoice.
The test's bulk seed is due 2026-12-31, so the Overdue narrowing drops all 10,000 rows, and its 300 ms proof never computes facts for one of them (`tests/check_fo7q_reads.ts:192,199,208`). The settled ruling accepts a time as proof. This time is measured on a fixture that skips the work.

**B2, Major: a calendar-invalid date gives a 500 in the shipped app. AG-6-37 r3 asks for "rejected early with a clear message".**
What I did, over HTTP as the Owner (fail-closed scope):
- list: `issuedFrom=2026-02-30`, `issuedFrom=2026-13-01`, `issuedTo=0000-01-01`
- payments: `from=2026-02-30`, `to=2026-13-01`
- a hand-edited cursor: `{"d":0,"t":"2026-02-30T00:00:00.000000",…}`, `t:"2026-99-99T99:99:99.000000"`, or `{"d":1,"t":"0000-01-01T…"}` on the list, and `t:"2026-02-30…"` on payments
Expected: 400 BAD_QUERY in words, as for `issuedFrom > issuedTo` or a bad cursor shape.
Actual: **500 "Internal server error"** in all 9 cases. A direct call throws Prisma `22008 date/time field value out of range`. No SQL text reaches the body.
Where: `reads/invoices.ts:24,40` and `reads/payments.ts:16,19` check the shape only. PostgreSQL casts the value at `invoices.ts:101-102,110` and `payments.ts:33-35`. `ports/client-money.ts:84` already has a `day` schema that refuses non-existent dates.

**B3, Major: with trust off (No, nothing held), trust money shows as an untagged payment on an invoice still owing.**
What I did: trust Yes, then 7.00 received into TRUST on Open invoice INV-0016 (with its DEPOSIT entry), then sent back to the client as REFUND_TO_CLIENT. Balance 0, To move empty. Then trust answered No.
Expected (AG-6-59 r5; brief: "no invoice or payment read carries a trust field"): no trust money in the reads. At least, no payment row that reads as money paid on the invoice.
Actual: `/detail` of INV-0016 says `statusWord: "Open", paidMinor: 0, dueMinor: 700`, and lists `payments: [{method:"BANK_TRANSFER", amountMinor:700, refunds:[], refundedMinor:0, cleared:true}]`. The same row is in `GET …/payments` and `…/payments/:id`.
`receivedInto` is stripped, so nothing marks this as trust. The client's money appears paid in, never returned, and not counted. A no-invoice deposit is hidden in the same state, which is correct (`payments.ts:38`).
Where: `reads/payments.ts:37-38,50` hide the field but not the row when `received_into = 'TRUST'` and trust does not show.

**B4, Minor: `CREDIT_NOTE` and `creditableMinor` are offered on an invoice paid from trust, and FO-7b refuses every credit note there.**
What I did: trust Yes, 10.00 deposited and applied to INV-0015 (Paid, `trustPaidMinor: 1000`).
Actual: `allowedActions: ["CREDIT_NOTE","DOWNLOAD_PDF"]` and `creditableMinor: 1000`. FO-7b's route answers 409 TRUST_PAID to `full: true` and also to `amountMinor: 1`. After trust goes to No and the move is recorded, the action is still offered.
Where: `reads/invoices.ts:136` uses `openMinor`. The route caps at `openMinor - trustPaidMinor` (`invoices/money.ts:145`).

**B5, Minor: the Refunded invoice's `creditableMinor` disagrees with its actions.**
A Refunded invoice answers `creditableMinor: 1000` and `allowedActions: ["DOWNLOAD_PDF"]`. FO-7b's credit route would accept a credit there (`money.ts:141-142`). The figure and the list disagree. `reads/actions.ts:23`, `invoices.ts:136`.

**B6, Minor: the payments inside `/detail` carry the internal sort key `t`.**
For example `"t":"2026-11-22T10:12:03.502187"`. `strip` runs on the payments routes but not on the detail. The answer is wider than its own `InvoiceDetail.payments: PaymentRow[]` type. `reads/invoices.ts:140`.

**B7, Minor: `EDIT` is offered to someone holding `agent/invoice:edit` without `agent/invoice:create`, and the edit route refuses them.**
`allowedActions` for keys `[:edit, :show]` on someone else's draft is `["EDIT"]`. `POST …/:id/lines` is guarded by `agent/invoice:create` (`invoices/routes.ts:21`), so the call gets a 403.
No PF-3 default role has :edit without :create, so this is latent. It still breaks the table's own rule, "offered only when … the caller holds its key". `reads/actions.ts:18`.

**B8, Minor: `overdue=false` is accepted and ignored.** It returns the same 10 of 10 rows as no filter, including the Overdue one. `reads/invoices.ts:45,94`.

**B9, Minor: the payment answers use two time formats.**
Refund `createdAt` is `2026-11-22T10:12:02.037262+00:00` (from `json_build_object`, depends on the session zone). Credit note and write-off `createdAt` are `…T10:12:01.434Z`. `reads/payments.ts:44`. Also, `trustRequestId=` is refused with a 400 although the brief lists it. The PR does not say so.

## What held
- **pageSize:** `0`, `201`, `50abc`, `1e3`, `-1`, `%2050` and an empty value each get a 400 in words. `pageSize=1&pageSize=2` gets a 400 (an Express array fails zod). `000050` → 50.
- **Duplicate params:** `status`, `issuedFrom`, `after` each give a 400. `status[]=` and `status[a]=` give a 400.
- **status values:** `open`, `OPEN,`, an empty value, 9 items, `__proto__` and `OPEN'--` each give a 400. `OPEN,OPEN` gives 1 row, no duplicates.
- **SQL injection:** every value goes in as a bound parameter. Codes are whitelisted; uuid and date shapes are checked by regex. Injection strings in `partyId`, `caseId`, `status`, `after` each get a 400.
- **Narrowing (SQL word = JS `invoiceStatus` on every row, and paid, due and total agree):** Refunded on an overdue invoice, Credited on an overdue one, Written off on an overdue one, Paid on an overdue one, part paid and overdue, part paid due 2027, part refunded, USD, due today (Open, not Overdue). Each of the 8 codes returns exactly its word's set. `overdue=true&status=PAID` returns nothing.
  "Paid with no due date" cannot exist: the DB refuses an issued invoice without a due date (`money_invoice_issue_check`).
- **Cursors:** I walked page sizes 1, 2 and 3 over 20 rows. That included 5 drafts sharing one `created_at`, 5 issued invoices sharing one `issued_at`, and the issued-to-draft seam, plus `status=OVERDUE`, `DRAFT`, `DRAFT,OVERDUE` and the party filter. Order was identical to one 200-row page, with no repeat or skip.
  Firm B's draft id in a cursor used in A only positions the page; B's row never appears. A's cursor in B gives 0 of A's rows. A future `t` returns from the top, `d:2` gets a 400, and a 20 kB cursor gets a 431 from Node.
- **Walls:** B gets a 404 on A's invoice detail and on A's payment. B's payments with A's `invoiceId` gives 0. A payment in A on B's invoice and a USD refund on a CAD payment are refused by the DB.
- **Trust:**
  - Unanswered: no trust key in any answer.
  - No with a To move line open: trust shows (rule 6). After the move is recorded: `receivedInto`, `trustRequestId` and `trustPaidMinor` are gone, and the no-invoice deposit gives a 404.
  - Yes: `receivedInto: "TRUST"` shows.
- **Currencies:** no total, sum or all field. The page keys are exactly `items`, `next`, `pageSize`. Each amount has its own currency.
- **allowedActions:** with only `:show`, an Open invoice offers `DOWNLOAD_PDF` only. Credited and Written off offer `DOWNLOAD_PDF` only (no CREDIT_NOTE). A draft offers EDIT and ISSUE only.
- **Payments list timing:** 10,000+ rows, page 1 or 200 rows in 24-38 ms.

Verdict: Changes on 1693e1149

## Round 2 (diff only, P-277): 1693e1149..77713d8e8

Commit `77713d8e87c7875b308c5a4c36f796b42c89b3b5`. Same scratch script plus new cases; `xr_studio_fo7q_break_<pid>` dropped after each run. Fixture: 10,000 issued invoices in A (all due 2026-01-05, 5,000 paid) and 10,000 in B. Each timing 3 times: no index, then with `(firm_id, issued_at desc, id)` added in my scratch database only, then with 10,000 drafts added to A.

**Fixed and held:**
- **B2:** all 9 round-1 cases now 400 BAD_QUERY. So do `issuedFrom=1999-12-31` or `2026-02-29`, `from=1999-01-01`, cursor times `T24:00:00` or `T23:59:60`, and cursor years 0000, 1999, 9999. `2028-02-29` and `T23:59:59.999999` are accepted.
- **B3:** with trust No and nothing held, the refunded deposit is gone from INV-0016's `/detail` (`payments: []`, Open, due 700), the list and `…/payments/:id` (404). The no-invoice deposit 404s; `trustRequestId=` gives 0 rows.
  Consequence of rule 5, not a finding: the invoice paid from trust shows `paidMinor: 1000` with `payments: []`.
- **B4:** trust-paid INV-0015 has `creditableMinor: 0` and offers only `DOWNLOAD_PDF`, matching FO-7b's TRUST_PAID refusal.
- **B5:** Refunded offers `CREDIT_NOTE` (1000 creditable); Credited and Written off still only the PDF. **B6:** no `t` in the detail. **B7:** `[:edit, :show]` gives `[]`.
- **B8:** `overdue=false` gets a 400. **B9:** refund `createdAt` is `…T10:23:10.923Z`, as credit notes; a valid `trustRequestId` gets 200, a bad one 400.

**The new half/union query (regressions looked for, none found):**
- Small fixture, page sizes 1-4: same order as one 200-row page, no repeat or skip. Filters: `{}`, `OVERDUE`, `DRAFT`, `DRAFT,OVERDUE`, `PAID,DRAFT`, `DRAFT,OPEN,PART_PAID`, `WRITTEN_OFF,DRAFT,REFUNDED`, `overdue=true`, and `OVERDUE,DRAFT` with a party filter; with 5 drafts on one `created_at`, 5 issued on one `issued_at`, and the issued/draft seam.
- Big fixture at page size 200, checked against `(d, t desc, id)` and a direct count through `statusSql`: `OVERDUE,DRAFT` 76 pages, 15,012 rows; no filter 101 pages, 20,022 rows; `PAID,DRAFT` 76 pages, 15,008 rows. All in order, none repeated or skipped, each equal to the count.
- The SQL word equals FO-7b's on every fixture row; each of the 8 codes returns exactly its set. Walls and cursors from another firm hold as in round 1.

**B1: partly fixed. The rest is for the tech lead's open question (same cause), not a new finding.**
- With the index (ms): page 1 23-27 · `PAID` 33-49 · `DRAFT` 10-14. After 10,000 drafts: page 1 39-47, `DRAFT` 32-41, `PAID,DRAFT` 44-100.
- Still slow: **`status=OVERDUE` 510-805 ms** for a full page of 50 (page 2: 529-759). EXPLAIN ANALYZE: index scan, "Rows Removed by Filter: 5000", 417 ms before the first row.
  Cause: all 10,000 share one `issued_at` (the database stamps it), so the 5,000 paid ones come first in index order; each passes `due_date < today` and has its facts computed.
  A real firm looks like this: most past-due invoices are paid and newer than the unpaid overdue ones. With #2368's index the test's OVERDUE case passes on its own interleaved seed, not on this one. Without the index: `OVERDUE` 1017-1419, `PAID` 1530-1614, `OPEN` (2 matches) 1076-1452, `REFUNDED` (1 match) 961-1287.
  Fixing it needs an index this row may not add, or a different design. Please add "OVERDUE with many paid past-due invoices ahead of it" to the rare-word question.
No new Blocker, Major or Minor in the diff.

Verdict: Approve on 77713d8e8
