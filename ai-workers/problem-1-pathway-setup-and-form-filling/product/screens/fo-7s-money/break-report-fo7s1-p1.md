# Break report: FO-7s1 part 1 (Money area, `/money/invoices`, `/money/invoices/:id`)

Head `01dbfa799` (branch `claude/screens-fo7s1-invoices`, draft PR #3305). Isolated copy `fo7s1brk` on :4753 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end. US$0. Data seeded as `tests/check_fo7s1_invoices_browser.ts` seeds it, plus: 60 paging invoices, a USD 20,000,000.00 invoice, a paid one, a part-paid one, a written-off one (row inserted directly; FO-7r has no route on main), an overdue one, one with long non-English lines, one in firm `sample-solo`, and one whose party is the subject of no prospect (outside C5 for everyone). Scope: concept-invoices (a) and (b) as the PR builds them. The builder, issue, preview and money-back choices are left out (PR 2 and FO-7s4).

## Findings

**B1 (Blocker). A decimal comma is read as a thousands separator, so the credit note is 100 times too big and can't be undone.** `centsOf` strips every comma and space before parsing (`web/src/modules/client-money/invoices/contract.ts:88`).
- Steps: Owner opens INV-0007 (Part paid, balance due CAD 1,000.00). **Use a credit note** → Part → amount `5,50`, reason "Goodwill five fifty" → **Issue credit note**.
- Expected: CAD 5.50, or a refusal of the format.
- Actual: CN-0008 is issued for `amountMinor: 55000` (CAD 550.00), and the balance falls from CAD 1,000.00 to CAD 450.00 (API detail read before and after).
- Same root cause: `1,0,0` is taken as CAD 100.00. `1 000,50` (the fr-CA way, UXL-14) would read as CAD 100,050.00, which the API refuses only when it is over the creditable amount.
- Nothing shows the parsed amount before Confirm, and credit notes are insert-only. This is the one piece of client-money arithmetic in the browser, and it is wrong for an ordinary Canadian input.

**M1 (Major; API on main, FO-7b, not this PR's code). FO-7b's routes, which this screen calls, ignore C5.**
- Steps: an invoice for a party that is no prospect's subject (INV-0072).
- `GET …/:id/detail` → 404, which is correct. But:
  - `GET …/:id/pdf` → 200 `application/pdf`, for both the Owner and the Case Officer;
  - `GET …/:id` → 200 with the full InvoiceView;
  - `POST …/:id/credit-notes` `{amountMinor:100}` → 201 (a credit note was issued on an invoice the caller cannot see).
- Expected: the same plain 404 as the detail.
- Cause: `money.ts:136` (credit) and `money.ts:161` (pdf) lock and read by firm only (`lock` at :192, `facts`); `drafts.ts:170` (read) is the same.
- The screen hides these routes behind the detail's 404, so only a direct call reaches them. The rule "a plain not-found outside C5" still fails on the routes the page uses. It needs a follow-up row for FO-7b or FO-7q.

**m1 (Minor). An old API refusal stays on screen after a browser-side error.** `credit-note-panel.tsx:25` sets the field error and returns without clearing `problem`.
- Steps: submit with an empty reason (the panel shows "The reason is needed."), then type a reason and amount `.5` and submit.
- Actual: the panel still says "Not issued: The reason is needed." although a reason is filled. The real problem, the amount, is only on the field.

**m2 (Minor). A refusal does not refresh the page or the panel.** The `catch` at `credit-note-panel.tsx:32` does not invalidate the detail query.
- (a) Tab A opens the panel ("Up to CAD 1,285.00"). Tab B cancels the invoice. Tab A submits CAD 10. The API's words show ("Nothing is left to credit on INV-0001. Nothing was saved."), but the panel still says "Up to CAD 1,285.00". After Close, the page still shows Open and **Use a credit note**.
- (b) user-T as Billing and finance opens the panel and is then made Read only. Submitting shows "Your roles do not include the permission this needs (agent/invoice:void)." (the API's words: held). The button stays on the page for a person who no longer holds the key.

**m3 (Minor; keyboard, WCAG 2.4.3). Focus falls to `<body>` when the control that had it goes away.**
- A full credit removes CREDIT_NOTE, so `returnFocus` (`detail.tsx:116`) is null. Focus after closing: `BODY`.
- **Show more** on the last page unmounts itself (`list.tsx:67`). Focus: `BODY`.
- A failed **Download PDF** disables the button while busy (`detail.tsx:69`). Focus after the error: `BODY`.

**m4 (Minor; BIC-13). The field errors under "Amount (CAD)" are the API's per-field words, in cents.**
- `0` → "This is too small: at least 1."
- `999999999` → "This is too large: at most 2147483647."
- The banner says "The amount (in cents) …".
- An empty reason gives "This is required." on its own under Reason, which BIC-13 forbids.
- These are the API's words as the rule asks, but they read as dollars in a dollars field.

**m5 (Minor). The Issued filter's refusal shows code names and blanks the list.**
- Steps: choose Issued from 2026-12-01 and Issued to 2026-01-01 with the date inputs, or open `?issuedFrom=garbage`.
- Actual: the table is replaced by "issuedFrom is after issuedTo." or "One field needs a change: issuedFrom: A date as YYYY-MM-DD …" (`list.tsx:39`, `:45`). Clear filters does stay offered.

**m6 (Minor; BIC-14). Status chip hints are only `title` on a span that can't take focus** (`list.tsx:63`, `detail.tsx:63`; the shared `Pill`). They never open from the keyboard. The PR says "chips with tooltips".

**m7 (Minor; wording). On a Paid invoice the panel says "A credit note lowers what INV-0006 asks for" and offers "Cancel the invoice (all that is left)"** while Balance due is CAD 0.00. "All that is left" here means the whole CAD 1,385.00 paid. After a CAD 100.00 part credit, the page shows Paid and "Received beyond the total CAD 100.00", with no hint of what happens next. The next step itself is FO-7s4's and is not a finding.

**m8 (Minor; code read, not reproduced). Credit-note and write-off dates are the UTC day** (`detail.tsx:37`, `createdAt.slice(0,10)`), so an evening credit in Toronto would be dated the next day. The reason box's `maxLength={200}` counts UTF-16 units while the API counts code points: 200 emoji pass the API (201), but the box stops at 100.

## What held
- **Actions only from `allowedActions`:**
  - Owner, Open: CREDIT_NOTE and PDF are shown. RECORD_PAYMENT and SEND are listed but have no button in this part.
  - Case Officer: PDF only.
  - Written off: PDF only, and "Issued invoices can't be edited." without the credit wording.
  - Draft: no credit note.
- **Credit route refusals**, each with the API's words:
  - amounts 0, −5, 100.5, "100", 99,999,999,999, and full plus amount → 422;
  - over the creditable amount → 409 "Only CAD 1,385.00 is left…";
  - an empty, blank, bidi-only or zero-width reason, or 201 characters → 422;
  - Case Officer → 403; a draft → 409 DRAFT; written off → "Already settled by write-off."; firm B → 404; an extra `firmId` field → 422.
- **Concurrency:** four parallel CAD 1,000.00 credits give one 201 and three OVER_CREDIT. Two parallel full credits give one note and one NOTHING_LEFT. A double-click on **Issue credit note** gives exactly one CN, and focus returns to the opener.
- **Plain not-found** for firm B's invoice, an unknown UUID, the one outside C5, and `abc <script>`: "Invoice not found", no figures, never "CAD 0".
- **Currencies:** every list figure carries one currency, and there is no total row. USD 20,000,000.00 is formatted correctly. The non-English line text (Greek, Chinese, Arabic) wraps with no sideways scroll.
- **Government fee line** shows "Government fees are never taxed", and the total is the API's. **No trust word** appears while trust is Unanswered: `trustPaidMinor` is only sent when trust shows (`reads/invoices.ts:150`).
- **Paging:** 50 rows, then **Show more** → 72, no duplicates, and the button goes at the end. Filters live in the address. `?status=BOGUS`, `?overdue=1` and `?after=xyz` are dropped safely. `status=PAID&overdue=true` gives "No invoices match these filters."
- **Widths:** at 375, 1024, 720 (1440 px at 200 %) and 512 (1024 px at 200 %) there is no sideways scroll, and balance, status and the panel's Save stay visible. The small Money menu shows below 768 px. axe finds 0 serious with the panel open at every width.
- **Keyboard:** Tab reaches **Use a credit note**, Enter opens the panel on its first field, and an invalid amount keeps focus on the field with `aria-invalid`. Escape with typed text asks "Discard this credit note?".
- **Reload with the panel open** posts nothing.
- **PDF:** a 500 shows "Something went wrong on our side. Please try again." A network failure shows "Could not download the PDF." A good download is saved as `INV-0007.pdf` and clears the error.

**Verdict: not ready to merge.** B1 must be fixed: refuse or correctly read a decimal comma, and test `5,50`, `1,0,0` and `1 000,50`. M1 goes to FO-7b or FO-7q as its own row. The Minors can be fixed in this PR or recorded.
