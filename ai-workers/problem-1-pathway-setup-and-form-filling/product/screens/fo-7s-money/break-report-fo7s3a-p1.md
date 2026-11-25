# Break report: FO-7s3a part 1 (Record payment, Payments, payment detail; trust off)

PR #3658 at `2e1085ca2dc03c8975b23ace39f8e87f588c64ec`. Isolated copy `br7s3a` on :4762 (`AI_LIVE=off PLATFORM_IDENTITY=local`), set-up copied from `studio/tests/check_fo7s3a_payments_trust_browser.ts` (Billing person user-T, Owner user-R, Case Officer user-O, Client B/H/J prospects, 12 CAD invoices + 1 USD, Sample). Playwright Chromium 1440 px unless stated. Scope: the concept's (c) and the brief's rules. Paid by and Note are left out as a declared contract gap: not counted. Screenshots: `/tmp/claude-0/-home-user-xpatready/87b73580-f3bf-5d4b-89e9-35d9fed55e0c/scratchpad/br/shots/` (scratch, not committed).

**Verdict: Changes.** 3 Major, 7 Minor, no Blocker.

## Major

**M1. The panel says "Not recorded" when the payment was recorded.** `record-payment.tsx:53`
- Did: opened the panel on INV-0002 and entered Cash 50.00. Record. The POST reached the API, which committed; the answer was then cut (Playwright `route.fetch()` then `abort("connectionreset")`).
- Expected: an unknown outcome is not called a refusal. The panel says it may have been recorded, reads the invoice again, and offers to check or retry on the same key.
- Actual: a red "Not recorded · Not recorded. Please try again." The database has the payment (count 2 → 3, +CAD 50.00). This branch does not invalidate the cache, so the header balance stays stale. The person was told nothing was saved, so they may close (no question asked, see m1) or reload and record it again under a new key: a real second payment. If they correct the amount first (55.00), the API answers KEY_USED, "This idempotency key already recorded a different payment. Nothing was saved.", and the panel is stuck.

**M2. "Date received" defaults to the UTC day, so a Canadian evening payment is dated tomorrow.** `record-payment.tsx:19`, `:23`, `:105` (`todayUtc()` as default and as `max`)
- Did: Billing person, browser time zone America/Vancouver, local time Tue 24 Nov 2026 22:51 (server UTC 25 Nov 05:51). Opened Record payment on INV-0006.
- Expected: today's date where the person is (the concept says "Date (today)"). The API accepts any day up to its UTC today, so the local day (24 Nov) is valid; typed in by hand, it is stored as 24 Nov.
- Actual: the default is `2026-11-25`, and `max` is also 2026-11-25. When recorded, the payment detail and the receipt say "received 25 Nov 2026", a day that has not yet come for the client. This hits every payment after 16:00 in Vancouver and after 19:00 in Toronto. Screenshot `a7-vancouver-evening.png`.

**M3. An invisible character in the reference bypasses the "Record anyway?" question, so a duplicate is recorded silently.** The screen sends the reference as typed (`record-payment.tsx:43`, trimmed only). The cause is outside this diff: the duplicate check in FO-7b (`api/src/client-money/invoices/money.ts:110-114`) compares raw `lower()` strings, and `money_text_ok` accepts U+200F and U+00AD when the text has visible characters.
- Did: recorded Cheque 10.00 with reference `Ab-4471` on INV-0003. Then, in new openings, recorded `Ab-4471` + U+200F (right-to-left mark), and `Ab` U+00AD `-4471` (soft hyphen).
- Expected: the duplicate warning in the API's words, and nothing recorded until confirmed. Or the API's "no hidden or direction-changing characters" refusal, which the reference rule promises.
- Actual: both were recorded straight away (R-0007, R-0008), with no question. In the list and on the detail page they look the same as the first payment's reference. Stored hex: `…34343731e2808f` and `4162c2ad2d…`. By contrast, U+202E (right-to-left override) is refused in the API's words on the field (this held).

## Minor
- **m1. The footer Close discards typed data without asking.** `record-payment.tsx:72` calls `onOpenChange(false)` directly, which skips `confirmClose`. Escape and X ask "Discard this payment?" and keep the panel open when the person says no (held); the footer Close closes and clears with no question. Close also stays enabled while Record is busy: closing during a slow POST (2.5 s delay) still recorded CAD 13.00 with no word on the page.
- **m2. Amounts above the API's limit are shown as valid, and the field's refusal is the screen's words.** The parser accepts 9 whole digits (`invoices/contract.ts:98`); the API maximum is 21,474,836.47. Typing `21,474,836.48` shows "Recorded as CAD 21,474,836.48". Record then gives the banner "The amount (in cents) is at most 2147483647." (unformatted), and the field says "Enter an amount in CAD, for example 100.00." (`record-payment.tsx:50`). The field message contradicts the hint and replaces the API's words.
- **m3. A replay silently drops edits.** After M1, retrying with the same amount but a new reference `NEWREF` shows "R-0005 recorded", but the stored reference is null. `replayed` is parsed but never shown (`record-payment.tsx:44-45`).
- **m4. Focus after a question or refusal falls to the dialog container.** Record is disabled while busy, so focus leaves it. The first Tab goes to the X, and "Record anyway" is not focused (`record-payment.tsx:41`, `:48`). The text is announced (role status/alert), so this is only a keyboard-path cost.
- **m5. A right-to-left reference is reordered inside the API's sentence.** Reference `مرجع-٤٤٧١ 7788` shows as "reference 7788 ٤٤٧١-مرجع is already recorded…", with no bidi isolation where the words are rendered (`record-payment.tsx:96`). Screenshot `k-ask-rtl.png`.
- **m6. A full-width look-alike skips the duplicate check.** `Ａｂ-4471` was recorded with no question (no NFKC folding). This is the same root as M3, but the characters are visible.
- **m7. Browser Back with typed data in the panel leaves the page without asking.** Escape and X ask first (held).

## What held
- **Idempotency:**
  - Double-clicking Record, plus Enter, made one payment.
  - Double-clicking "Record anyway" made one payment.
  - A new opening made a new payment.
  - Two tabs on INV-0001, both submitting CAD 2,655.50 at once: two payments. The second one reads "CAD 2,655.50 extra · Paid twice?" with Keep as credit, and a double-click on Keep made one credit entry of CAD 2,655.50.
- **Duplicate reference:**
  - `ab-4471` and `  Ab-4471  ` both ask in the API's words.
  - Close at the question recorded nothing.
  - "Record anyway" records.
- **Money over the balance is never refused:**
  - CAD 21,474,836.47 on CAD 2,655.50 due was recorded in full, showing "CAD 21,472,180.97 extra" and Keep as credit.
  - An invoice paid in another session while the panel was open: CAD 100.00 recorded, "extra · Paid twice?", Keep as credit worked.
  - A USD invoice: the amounts read USD 3,000.00 and "USD 344.50 extra".
- **Refusals in the API's words on the panel:**
  - Cancelled invoice: "INV-0009 is cancelled: … Record the money on the client instead. Nothing was saved." Nothing was recorded, and the panel stayed open after the button left the page.
  - A future date, 1999, an empty date, a 201-character reference, and U+202E were each refused in words.
  - Odd amounts were refused before sending: `0`, `-5`, `1,00`, `100.`, `.50`, `1.005`, `1e3`, Arabic-Indic and full-width digits, `1 000`.
- **Session ends mid-panel:** a second sign-in elsewhere made Record answer 401. The page showed "Signed in elsewhere", and nothing was recorded. After signing in again the panel was closed and no record was made.
- **Settling from the panel:** the panel stays with its answer, and the header reads CAD 0.00 with no Record button. Done or Escape moves focus to the heading. After success, focus goes to the answer.
- **No trust words while trust is not Yes:** with trust Unanswered and with No, there is no trust word and no "Received into" in the panel, its answer, the list or the detail. The list has no "Received into" column.
- **Methods and currencies:**
  - The panel lists the seven methods and no "Card". The list filter's "Card" is for reading webhook payments only.
  - Each amount shows its own currency (CAD and USD both in the list), and there is no total row.
- **C5 (who may see a payment):** with "everyone sees all" off:
  - The Case Officer sees no row for Client J's payment, and its address is the plain "Payment not found" with no amount.
  - An all-zero UUID, `not-a-uuid`, a traversal string and `%00` each show the same plain "not found".
  - Another firm's staff, and the Billing person once Client H left their view, get the same.
- **Wrong role:**
  - The Case Officer has no Record payment button.
  - The Case Officer's POST to `…/payments` and to `…/payments/:id/extra` both answer 403.
- **Payment detail:**
  - "Keep CAD 88.76 extra as credit" works, a double-click made one entry, and the button then leaves.
  - A 200-character reference wraps with no sideways scroll.
- **Payments list:**
  - Show more by keyboard (50 → 58 rows) moves focus to the first new row.
  - The filters are kept in the address. From after To shows a message in words; a bad `from` gets the API's words.
- **Layout and keyboard:**
  - 1024 px, 200 % zoom (720 CSS px) and 375 px: no sideways scroll, Record stays in view, and axe finds 0 serious issues on the panel, list and detail.
  - Keyboard only: open, method by type-ahead, amount, reference, then Enter to record.
