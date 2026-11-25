# Journey test: FO-7s1 part 1 (Money → Invoices, invoice detail, credit note), reviewer role, 23 Nov 2026

Head `01dbfa799a3a27fb7693080596153b4511126604`. Isolated copy `fo7s1rev` on :4752 (never :4400), Sample firms, trust Unanswered, live AI off, US$0. Walked headless with Playwright, using only what a person sees. The data underneath was read through the API and `psql`. The walk script stayed in the session scratchpad and is not committed. The builder's suite ran twice: 27/27 both times.

## Journeys (persona · goal · result)
1. **Main: the Owner (Representative), "see what is owed and credit CAD 100 of goodwill".** Home → Money? → Invoices → Status Open → open the CAD invoice → read lines and tax → Use a credit note → Part, 100.00, reason → issue. **Held.** The credit note lands once, the balance becomes the API's CAD 1,285.00, and there is a toast. **Wrong turn:** Home has no link to Money (0 links name Money or Invoices), so I had to type `/money/invoices`.
2. **Alternate: cancel a whole USD invoice.** Cancel the invoice (all that is left), reason "Opened by mistake". **Held.** The status becomes Credited, the actions become `[DOWNLOAD_PDF]`, the History line reads "CN-0003: invoice cancelled — Opened by mistake", and the page says "Issued invoices can't be edited."
3. **Empty: the solo firm's Owner (no invoices).** **Held:** "No invoices yet. An invoice starts from a signed retainer or a typed line." There is no first action yet (New invoice is PR 2).
4. **Error: bad input in the panel.** An empty or "abc" amount is refused at the field: "An amount in CAD, for example 100.00." An empty reason comes back from the API as "The reason is needed." at the top and "This is required." at the field. A reason with a direction-changing character gets the API's sentence at the field. Nothing is written in any of these cases (0 notes). **Held**, with weak words for the empty reason.
5. **Wrong role.** A Case Officer sees no "Use a credit note", and their POST to the credit route gives 403. Read only sees "You don't have access to invoices." and no Money menu (suite). **Held.**
6. **Recovery.** A double click on "Issue credit note" gives one note and one audit line. Back keeps `?status=OPEN`. A reload mid-panel discards the open panel with nothing written. **Held.**
7. **Across the boundary: the PDF.** Download PDF saves `INV-0001.pdf` (starts `%PDF-`). The next step, New invoice, is PR 2. **Held.**
8. **Scale: 57 invoices.** The first page shows 50 rows; Show more brings the 7 others with 0 duplicates. **Held**, but focus falls to `<body>` when the button goes. At this size every Bill to cell reads "A person" and every draft link reads "Draft", so rows are told apart only by number and amount.
9. **Zoom and sizes.** At 1024 px with 200 % zoom (512 CSS px) there is no sideways scroll, the Money menu becomes a row, and axe finds 0. At 375 px the lines table clips Tax ("CAD 13…", "Governn…"), and the primary button is 36 px tall.
10. **Two tabs cancel the same invoice at once.** One note is written; the second tab shows "Nothing is left to credit on INV-0004. Nothing was saved." on its panel. **Held.**

## Data underneath
* Figures on screen equal the API's: `dueMinor` 128500 → 127500 after a CAD 10.00 note.
* `money_credit_note` grows by exactly one per issue, and each note has one `audit_event` line.
* No figure on the list sums CAD and USD (DW7), and the list has no total row.
* No trust field or word while trust is Unanswered.

## Break it (15 min)
* **Long mixed text** in the reason (German, Chinese, French; 190 characters) wraps on the detail and in History at 375 px, with no sideways scroll.
* **A hidden RTL character** is refused by the API in words.
* **A malformed id** in the address (`/money/invoices/not-a-uuid`) shows the plain "Invoice not found", never "CAD 0".
* **Two tabs:** see journey 10.

No Blocker or Major found.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | crediting and cancelling work end to end; finding a client's invoice by name is impossible ("A person"), and Money is reached only by typing the address |
| Next step obvious | ½ | the detail has one clear primary; the empty state has no first action (PR 2); no entry from Home |
| Plain words | 1 | plain throughout; one weak field error ("This is required.") |
| Feedback and state | 1 | skeleton, toast, balance refreshed, refusals on the panel, not-found page |
| Correct data | 1 | API figures; one note per double click and per two-tab race; audit line each; no cross-currency sum |
| Error recovery | 1 | input kept, API words on the panel, nothing written on refusal |
| Accessibility and sizes | ½ | axe 0 at all widths and at 200 %; full keyboard path; but focus is lost after Show more, the target is 36 px at 375, and Tax is clipped at 375 |
| Speed | 1 | list API 15-32 ms; first view 206 ms |
| Visual quality | 1 | team frame and tokens; clean detail (`build/fo7s1-detail-1440.png`) |
| Trust and sources | 1 | no AI; every figure the server's; the government-fee line says why it carries no tax |

**8.5 / 10, pass (8 or more and no 0).** What would raise the score, most valuable first:
1. Party and case names from FO-7q (the PR's question).
2. A Money link on Home.
3. A focus target after Show more, and 44 px primaries at 375.
4. Tax stacked or flagged as scrollable at 375.
5. The reason checked in the panel.

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The trust-Yes state.
* A headed, visible browser (the cloud run was headless).
