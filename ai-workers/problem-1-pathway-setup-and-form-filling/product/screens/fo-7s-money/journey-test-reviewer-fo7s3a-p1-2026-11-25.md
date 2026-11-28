# Journey test: FO-7s3a part 1 (Record payment with trust off, Money → Payments, payment detail), reviewer role, 25 Nov 2026

Commit `2e1085ca2dc03c8975b23ace39f8e87f588c64ec`. Isolated copy `rv7s3a` on :4761 (never :4400 or :4752), Sample firm, trust Unanswered and then No (nothing held), live AI off, US$0. Walked headless with Playwright at 1440 px, plus 1024 px and 200 % zoom, using only what a person sees. The data underneath was read with `psql` and the API. The walk script stayed in the session scratchpad and is not committed.

The builder's suite gave 34/34 on a fresh database. A second run on the same database gave **32/34**: the DW10 lines failed because the suite leaves sees-all off (review M4).

## Journeys (persona · goal · result)
1. **Main: a Billing person, "Client B's cheque for 1,000 arrived".** INV (CAD 2,655.50) → Record payment… (focus lands on Method) → Cheque, 1000 (read back "CAD 1,000.00"), reference 4471 → Record.
   * The panel reads "R-0012 recorded · Receipt emailed to Client B Sample" and "Part paid · Balance due CAD 1,655.50", with "Not yet cleared" for the cheque. Escape returns focus to Record payment….
   * The header reads Part paid, CAD 1,655.50.
   * Money → Payments shows the row with Cheque, Not yet cleared and Recorded. Its page shows every fact and links back to the invoice.
   * **Held.** The page title is "Product Studio" on every page (platform-wide).
2. **Alternate: the same cheque entered again.** The API's words appear: "A payment with reference 4471 is already recorded on this invoice. Record anyway?" Record anyway records R-0013, leaving CAD 655.50 due. **Held**, but focus sits on the dialog container (m4).
3. **Extra money, trust No, USD.** USD 2,855.50 on USD 2,655.50 due → "USD 200.00 extra" → Keep as credit → "USD 200.00 kept as credit for Client B Sample."
   * The invoice reads Paid, Record payment… is gone, and focus moves to the heading.
   * **Held.** The line "…once refunds are on this screen" promises a refund that the payment page does not have (m1).
4. **Empty and filters.**
   * The empty filtered list reads "No payments match these filters."
   * From after To reads "Choose a date on or after Received from." and sends no request.
   * **Held.**
5. **Bad input.**
   * Each of `abc`, `-5`, `10.555`, `1e3` and `0` is refused at the field in words, with nothing sent.
   * A 201-character reference gets the API's "At most 200 characters."
   * **Held.**
6. **Wrong role: a Case Officer.**
   * There is no Record payment… button.
   * A forced POST gets 403, with the API's words naming `agent/payment:record`.
   * `not-a-uuid` shows a plain "Payment not found".
   * With sees-all off (suite): no row, and "not found" with no amount.
   * **Held.**
7. **Recovery.**
   * Escape on a typed panel asks "Discard this payment?"; the footer Close does not ask (m2).
   * A reload mid-panel writes nothing (3 payments, 3 audit lines).
   * Two tabs paying the full balance give 2 payments with 2 keys; the second reads "CAD 2,655.50 extra · Paid twice?" with Keep as credit.
   * **Held.** The lost-answer case is wrong: breaker M1 on this commit, confirmed in `record-payment.tsx:53`.
8. **Across the boundary.** The payment's page links to its invoice ("For INV-…"). Its "Keep CAD 2,655.50 extra as credit" is offered from `allowedActions`. **Held.**
9. **Sizes.**
   * At 1024 px: no sideways scroll, and Cleared and Status stay visible.
   * At 200 % (720 CSS px): Date, Receipt, Amount and For are visible, with no sideways scroll.
   * axe finds 0 issues on the whole page with the panel open, at both sizes.
   * **Held.**

## Data underneath
* Each payment is stored once, with its amount and method as entered, `received_into` OPERATING, and `cleared` false for a cheque.
* Each payment has one receipt number and one `payment.recorded` audit line.
* Keep as credit wrote exactly the extra to `money_credit_entry`.
* Nothing changed on the invoice beyond its status and balance, and both are the API's figures.

## Break it
* **Reference `4471`+U+200F** was recorded with **no duplicate question** (R-0017, hex `34343731e2808f`), and it looks identical on screen (M3; the root is FO-7b's `money_text_ok`).
* **Arabic reference** `رقم ٤٤٧١`: recorded, no sideways scroll.
* **Two tabs:** see journey 7.
* **The suite's own re-run:** fails (M4).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W1 end to end: record, receipt, Part paid, then the row and its page |
| Next step obvious | 1 | one primary per state, Done, links to the invoice and the payment |
| Plain words | ½ | API words throughout; m1's build-state sentence |
| Feedback and state | ½ | a lost answer is shown as "Not recorded" (M1) |
| Correct data | ½ | the UTC default date is a day ahead in a Canadian evening (M2); an invisible-mark duplicate goes through silently (M3) |
| Error recovery | ½ | refusals keep the input; after M1 an edited retry is stuck on KEY_USED |
| Accessibility and sizes | 1 | axe 0 at 375, 1024, 1440 and 200 %; keyboard path in the suite; focus nit m4 |
| Speed | 1 | Record 231 ms, list 111 ms, invoice detail 365 ms |
| Visual quality | 1 | team frame and tokens (`j1-panel-filled-1440`, `j7-detail-extra-1440`) |
| Trust and sources | 1 | no AI; every figure the server's; no trust word with Unanswered or No, for the Owner or the Billing person, including titles and aria-labels |

**8 / 10: pass (8 or more and no 0).** The verdict is still Changes, because four Majors are open (see the review). Fixes that would raise the score, most valuable first:
1. Say "may have been recorded" and resend on the same key (M1).
2. Default to the person's local day (M2).
3. Clean the reference and fold look-alikes, in the screen and in FO-7b (M3).
4. Restore sees-all in the suite (M4).
5. Remove the refund-promise sentence (m1).

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* A headed, visible browser (headless in the cloud).
* The fixes at `0a11cc94e`.
* The trust-Yes states (part 2).
