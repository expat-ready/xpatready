# FO-7q journey test: reviewer, 22 Nov 2026 (head 1693e1149)

This row is API-only, so there are no pages to walk in a browser. I walked each journey as the screen would call it: HTTP calls through PF-4's guard, plus direct service calls with a test scope (the app's C5 scope is fail closed, ruling 3). I used a probe copy of `tests/check_fo7q_reads.ts` in the scratchpad, on a scratch database (every migration, the sample firms, 10,000 invoices in each of two firms), on a random local port, never :4400. Nothing in the repo was changed.

## Journeys (persona · goal · result)
1. **Billing person · "show me the newest invoices".**
   - Page 1 holds 50 rows, newest issued first, then drafts. It took 47-72 ms on 10,000 invoices.
   - `after` gave the next page. Over three pages of 200 there were no repeats and no skips, even with a new invoice issued between calls. **Held.**
2. **Billing person · "only the overdue ones".**
   - `status=OVERDUE` answered correctly. It took 13-21 ms, but only because no bulk invoice is past due.
   - With the bulk invoices past due (what the real clock gives from 1 Jan 2027) it took **1139-1497 ms**.
   - `status=OPEN`, `PAID` and `PART_PAID` took **1.7-2.2 s**. **Slow** (review M1).
3. **Billing person · "invoices for this client and this case"** (party, case and issued from/to filters): correct rows, and the date filters never return a draft. **Held.**
4. **Owner · "open one invoice and see what I can do".**
   - `…/:id/detail` gives lines, payments with receipts and refunds, credit notes, write-off and status.
   - Open gives RECORD_PAYMENT, SEND, CREDIT_NOTE, DOWNLOAD_PDF.
   - A Case Officer gets no RECORD_PAYMENT.
   - A Refunded invoice offers only the PDF, although FO-7b accepts a credit note on it (201) (review m2).
5. **Bad input (error).**
   - These are rejected with 400 in words: page size 500, status FOO, an unknown field, a cursor that is not ours, and partyKind without partyId.
   - These give **500**: `issuedFrom=2026-02-31`, `2026-13-45`, `0000-01-01`, payments `from=2026-02-30`, and a forged cursor time (review M2).
6. **Wrong firm.** Firm B asking for firm A's invoice or payment gets 404, the same answer as an unknown id. A's party filter and A's cursor give B nothing of A's. **Held.**
7. **Wrong scope (C5).**
   - In the app, the list is empty and detail and payment are 404 for every role (fail closed).
   - A one-case scope sees only that case's invoices. A party scope sees only that party's invoices with no case. **Held.**
8. **Trust off and on.**
   - With trust unanswered or No with nothing held, a key scan finds no trust field.
   - With trust Yes, `trustPaidMinor` and `receivedInto` appear.
   - Trust No with money held was not exercised by any test (review m4).
9. **Two currencies.** Each row carries its own currency, and no answer has a total field. **Held.**
10. **Recovery (repeat and reload).** Reads are idempotent, and a repeated cursor gives the same page under RepeatableRead. **Held.**

## Data underneath
For every invoice in the status table, the SQL status equals FO-7b's `invoiceStatus`, and each status filter returns exactly its own word. Reads write nothing and leave no audit line, as the brief says.

## Break-it
- Bad dates and forged cursor times give 500 (**Major**, review M2).
- Status filters that defeat the early limit take 1.1-2.2 s (**Major**, review M1).
- A status value that is not a status gives 400 (held).
- A cursor from firm B gives nothing of A's (held).
- `overdue=false` is silently ignored (Minor).

## Score (each 0, ½ or 1; accessibility and visual quality N/A, no screen)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Every read answers through a test scope. In the app every list is empty (ruled fail closed). A refunded invoice cannot be credited from `allowedActions`. |
| Next step obvious | ½ | `allowedActions` follows the routes, except on Refunded (m2) and on trust-paid credit (m3). |
| Plain words | ½ | The 400s are worded; bad dates give a bare "Internal server error". |
| Feedback and state | 1 | `next` is null at the end; `pageSize` is echoed; the status word is on every row. |
| Correct data | 1 | The SQL status matches `invoiceStatus`; no paging repeats or skips; currencies kept apart. |
| Error recovery | ½ | Bad date or cursor gives 500 (M2). |
| Speed | ½ | Page 1 under 100 ms; status filters 1.1-2.2 s on 10,000 invoices (M1). |
| Trust and sources | 1 | Trust fields are gated by AG-6-59 r5; values derived, not stored. |
| Accessibility and screen sizes | N/A | No screen. |
| Visual quality | N/A | No screen. |

**Score: 5.5 out of 8 that apply, which scales to 6.9 / 10. Fail (pass needs 8, no 0).** Fixes that would raise the score, most valuable first:
1. M1: early-stopping filtered query plus a realistic seed. Raises speed.
2. M2: real-date and cursor validation. Raises error recovery and plain words.
3. m2 and m3: Refunded actions and the trust-paid credit amount. Raise next step and task completed.

## Could not test
There is no browser, screen reader or intended-user walk, since this row has no screen. D17 and D20 stay with the founder. The page-1 plan with #2368's index was not tested.
