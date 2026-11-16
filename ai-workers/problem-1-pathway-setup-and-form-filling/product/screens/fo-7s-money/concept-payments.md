# FO-7s0 — payments: Record payment, payments list and detail, Send statement, Exports (groups c, j)

Part of the money concept; index in `concept.md`. Figures **Sample**; legal readings **Unconfirmed: no counsel**. Board: `design/payments.html`. Builds: FO-7s3a part 1 (c), FO-7s5 (j). Strings per trust state: `design/state-strings.html`.

## (c) Record payment (right panel, `agent/payment:record`)
Opened from an invoice ("Record payment…"), a payment list, or a case/client Money view (AG-6-19 r2; no document → AG-6-72's "the case / the client" target).
* **Fields:** Method (words, never "Card": **Bank transfer · Wire · Cheque · Cash · e-Transfer · Card terminal · Other**), Amount (the document's currency, shown beside the field), Date (today), Reference, Paid by (the Bill to by default; a party or a typed name), Note (optional).
* **Received into** — **only while the answer is Yes** (AG-6-69; never Unanswered, never No — FO-7s3a): **Operating · Trust**, preset by AG-6-69 r1 (invoice → Operating, or Trust under "Trust first"; trust request → Trust). Changing it from where the money belongs shows "This adds a To move line: move CAD 1,130.00 from operating to trust for Client B" (r2). Whether FO-7b's route accepts a staff-chosen account is **Question 2** (a write no brief names); until answered the field is read-only text "Received into: Operating".
* **Cleared**: a cheque records "Not yet cleared" (AG-6-63); the tick waits on a route (gap G7).
* **One idempotency key per opening** of the panel; **Record** disables on the first click (AG-6-19 r3).
* **Duplicate reference** → inline "A payment with reference 4471 is already recorded on this invoice. Record anyway?" with **Record anyway** (same key, confirm flag).
* **More than due** is never refused (FO-7b): "CAD 200.00 extra" then, Yes → "goes to Client B's trust balance"; Unanswered / No → **Refund · Keep as credit** (AG-6-21).
* **Success:** "R-0012 recorded · Receipt emailed to Client B"; invoice status recomputed (Part paid / Paid).
* **Refusals in the API's words** on the panel (e.g. a cancelled invoice: record on the case instead, AG-6-19 edge).

**Payments list** (`/money/payments`): filters Method, Date (from–to); columns Date, Receipt, Paid by, Method, Amount, For (invoice / trust request / case), Received into (Yes only), Cleared, Status (Recorded, Reversed, Refunded, Part refunded). Per-currency amounts, no total row. Empty: "No payments yet. Payments appear here when you record one or a client pays by card."
**Payment detail** (`/money/payments/:id`): the fields above, receipt number, refunds, reversal; actions from `allowedActions`: **Refund…**, **Reverse entry…** (never on Card), Resend receipt (gap G3, absent until its route exists).

## (j) Send statement and Exports
**Send statement** (right panel from a person's, company's or case's Money view; `agent/invoice:issue`; view `agent/invoice:show`): Period **Everything** (default) or from–to; To: the Bill to party, read-only, no Cc (AG-6-41); the fixed wording "Your statement" read-only (FO-7r, `samples/fo7r-statement-wording.txt`); a preview only when its route exists (gap G11). Trust shows → the statement carries trust movements and "Held in trust for your work permit: CAD 1,500.00" (AG-6-28 r3); trust off → no trust line. **No schedule, repeat or "send monthly" control** (AG-6-28 §13). Success: "Statement sent to Client B".
**Exports** (`/money/exports`, menu only with `agent/billing:export`): period from–to; files as checkboxes **Invoices · Payments · Refunds · Credit notes · Write-offs · Trust ledger** (Trust ledger only while trust shows; Monthly check joins when FO-7m part 2 adds it); one primary **Start export**. States: "Still preparing" → each file with **Download** and "Link expires 17 Nov 2026, 23:10" (24 h, Sample); empty period → the file downloads with headers and the page says "No records in this period"; expired → "This link has expired. Start the export again."; no key → "You do not have access to exports" (403). Amounts in their own currency; no total across currencies.

## Walk — replay at 1440 px (continues `concept-invoices.md` walk step 6)
1. INV-0003 (CAD 2,655.50, Open) → **Record payment…** → Cheque, CAD 1,000.00, ref 4471 → **Record** → "R-0012 recorded · Receipt emailed to Client B"; invoice "Part paid · Balance due CAD 1,655.50"; payment row "Not yet cleared".
2. **Record payment…** again, CAD 1,000.00, ref 4471 → the duplicate warning → **Record anyway** → second payment recorded; balance due CAD 655.50.
3. A third payment CAD 1,855.50 on CAD 655.50 due (Sample) → "CAD 1,200.00 extra" → trust Unanswered: **Refund · Keep as credit** → Keep as credit.
4. Client B → Money → **Send statement** → Everything → **Send** → "Statement sent to Client B".
5. Money → Exports → November 2026 → Payments → **Start export** → "Still preparing" → **Download**; next capability's first step: Getting paid (`concept-settings.md` walk step 1).
