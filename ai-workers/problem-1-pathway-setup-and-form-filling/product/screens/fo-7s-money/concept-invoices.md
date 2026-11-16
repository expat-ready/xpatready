# FO-7s0 — invoices: the Money area, the builder, issue, detail and corrections (groups a, b, i)

Part of the money concept; index, rules and checks in `concept.md`. Every figure is **Sample**; every legal reading **Unconfirmed: no counsel**. Board: `design/invoices.html`. Builds: FO-7s1 (a, b), FO-7s4 part 1 (i). Strings per trust state: `design/state-strings.html`.

## (a) The Money area
**Pattern:** Catalogue-style list pages inside one area frame (EXPERIENCE §3; TEAM-PATTERNS "List"), the front office's `Frame` with its own menu, as `sales-frame.tsx` does. Module `web/src/modules/client-money/`, web paths under `/money/*` (FO-7s1's Sample paths, kept).

| Menu item | Path | Shows when (trust state, key) | Row |
|---|---|---|---|
| Invoices | `/money/invoices` | always; `agent/invoice:list` | FO-7s1 |
| Payments | `/money/payments` | always; `agent/payment:record` or `agent/invoice:show` | FO-7s3a |
| Trust | `/money/trust` | trust shows (Yes, or No with money held); `agent/invoice:show` | FO-7s3a/b |
| To move | `/money/to-move` | trust shows; `agent/payment:record` | FO-7s3b |
| Monthly check | `/money/monthly-check` | trust shows; `agent/payment:record` | FO-7m part 3 |
| Exports | `/money/exports` | `agent/billing:export` only | FO-7s5 |
| Getting paid | `/money/settings/getting-paid` | every staff member (read); edits by key | FO-7s1 part 3 |

"Trust shows" = answer Yes, or No with money held or To move not empty (AG-6-59 r6). Card payments is a **section of Getting paid**, not a menu item (FO-7s2 asked; one settings page, AG-6-82). A menu item with no key is absent, never disabled (BIC-02 in spirit). Owner with the answer Unanswered: one inline line at the top of the Money area (group f, `concept-trust.md`).

**Invoice list** (`/money/invoices`): search by number or party; two primary filters **Status** (Draft, Open, Part paid, Paid, Overdue, Credited, Refunded, Written off — FO-7b's derived words) and **Issued** (from–to); secondary under "More filters": party, case, Overdue only. Filters in the URL. Columns: Number (or "Draft"), Bill to, Case, Issued, Due, Total, Balance due, Status chip (shape + word). Amounts each in their own currency; **no total row** (AG-6-27). One primary action: **New invoice**. Paging from FO-7q (50, "Show more", keyset).
* Empty: "No invoices yet. An invoice starts from a signed retainer or a typed line." + **New invoice**. Nothing matches: "No invoices match these filters." + "Clear filters".
* Loading: skeleton rows, never "No invoices" first. Refused (403): "You don't have access to invoices." Not visible (C5): the plain not-found page, never "CAD 0".

## (b) Builder, issue dialog, invoice detail
**Builder** (`/money/invoices/new`, Workspace pattern: lines left, live summary right).
1. **Bill to**: one search box over **won** people and companies only (AG-6-1 r1); a prospect never appears; under it "Only clients appear here. A prospect is asked for a deposit, not invoiced." (trust-off wording; never names trust). Optional case (the party's cases).
2. **Start from retainer** (shown when the party has a signed retainer): fills the fee rows; with an unsigned retainer the dialog "<Party>'s retainer isn't signed. Invoice anyway?" [Invoice anyway] [Cancel] (FO-7b 409; AG-6-42). A deposit row (`ON_SIGNING`) is never added as a card-payable line: trust on → "This row is a deposit: request it from trust instead" with a link to New trust request; trust off → billed after the work like any row.
3. **Lines**: kind picker **Fee · Disbursement · Government fee** (`FEE`, `DISBURSEMENT`, `GOVERNMENT_FEE`); description, quantity, unit price; tax per line = FO-7g's default, a switch **Taxable** on Fee and Disbursement lines; a Government fee line shows **no tax control** and the hint "Government fees are never taxed" (AG-6-4 r3, P-607 (7): typed in R1, no "Add from the case's fee").
4. **Summary** (right): Subtotal, tax per tax name, Total, in the invoice currency (case currency, else firm default CAD/USD, AG-6-46 r3); "Will be numbered when you issue it". Trust shows and the payer has money: **Pay from trust** box, see `concept-trust.md` (e).
5. One primary **Issue invoice…**; secondary **Save draft**, **Delete draft** (`agent/invoice:void`, confirm).

**Issue dialog** (right panel; TEAM-PATTERNS "Overlays"): invoice date (today), **Due in 14 days** (firm's `due_in_days`) with "Due on receipt" one click; a past date → hint "This date has passed; the invoice shows overdue." (AG-6-46 edge). Trust shows: the "Pay CAD X from trust now" tick (e). Operating details empty → the notice **"Email waits: add your payment details"** with a link to Getting paid; the invoice still issues (AG-6-71 r3, FO-7b). **Issue** is disabled on the first click (one number); success: "INV-0008 issued · due 30 Nov 2026".

**Invoice detail** (`/money/invoices/:id`, one page with sections Overview · Lines · Payments and credits · History, no tabs: EXPERIENCE §2.2). Header: number, Bill to, case, status chip, Balance due. Actions **only from `allowedActions`** (FO-7q), one primary per status (BIC-11):

| Status | Primary | Others (each only when listed) |
|---|---|---|
| Draft | Issue invoice… | Edit, Delete draft |
| Open / Overdue / Part paid | Record payment… | Pay from trust…, Copy pay link, Payment plan…, Credit note…, Write off…, Change due date |
| Paid | — | Credit note… (up to the paid amount), Refund… (on a payment row) |
| Credited / Refunded / Written off | — | none but the PDF |

An edit attempt on an issued invoice shows "Issued invoices can't be edited — use a credit note." with **Use a credit note**. Trust shows: "Paid from trust: CAD 960.50 · Balance due: CAD 0.00" (AG-6-68 r10); trust off: no trust field at all (FO-7q).

## (i) Correction dialogs (FO-7s4 part 1)
Each is a right panel with a **reason** (required), a preview line of what changes, and Confirm; refusals show the API's words on the panel.
* **Credit note…** (`agent/invoice:void`): Part (amount ≤ remaining, optional line) or **Cancel invoice** (whole remaining). Preview "Balance due falls from CAD 2,825.00 to CAD 2,542.50". On a trust-paid invoice still waiting to move: "CAD 282.50 returns to Client B's trust balance" (AG-6-48 r4, FO-7b amendment); already moved: the choice **Refund to the client · Move back to trust** (rows rev 16.53, P-634: credited trust money never stays in operating). Trust off and paid: **Refund · Keep as credit**. After a write-off: "Already settled by write-off" (FO-7r 409).
* **Refund…** on a payment (`agent/refund:create`): amount up to the refundable figure, method, date, reference, to the payer (read-only until a recipient input exists, gap). Card: "Refund requested" until Stripe's event, then "Refunded"; Stripe refuses → "Record an offline refund instead" opens the offline form filled in (FO-7c part 3).
* **Write off…** (`agent/invoice:void`): no amount field: "Write off CAD 25.00 (the remaining balance)"; reason (e.g. "Wire fee"); hidden on a draft; refusal "Only an issued invoice with a balance can be written off." (FO-7r).
* **Reverse entry…** on a hand-recorded payment (`agent/payment:record`): reason **Recorded by mistake · Wrong client · Returned · Other (typed)**; the **preview is FO-7v's answer word for word**: each invoice back to due ("INV-0005 goes back to CAD 1,186.50 due"), each trust withdrawal undone, and a shortfall as **"CAD 1,500.00 must move from operating to trust: reversal of R-0007"** with "Trust balance after: CAD 0.00" — **never a negative balance** (P-607 (1), FO-7v; departs from AG-6-60 r7 / AG-6-75 r4's red "−CAD 1,500"). Never offered on a card payment ("Use a refund"); stale preview → "Changed since the preview" and the preview reloads.

## Walk (P-352, P-592) — replay at 1440 px, Sample firm Maple, trust Unanswered then Yes
1. Money → Invoices → empty list shows "No invoices yet…" → **New invoice**.
2. Bill to: type "Cli" → Client B appears; a prospect "Client P" does not.
3. **Start from retainer** → one Fee line "Work permit — LMIA-based" CAD 1,000.00; add a Government fee line CAD 255.00 → no tax control, "Government fees are never taxed"; summary HST 13% (Sample) CAD 130.00, Total CAD 1,385.00.
4. **Issue invoice…** → dialog shows Due 30 Nov 2026 and, with operating details empty, "Email waits: add your payment details" → **Issue** → detail page "INV-0008 · Open · Balance due CAD 1,385.00".
5. Try editing a line → "Issued invoices can't be edited — use a credit note." → **Credit note…** → Part CAD 100.00, reason "Goodwill" → "CN-0001 issued", balance CAD 1,285.00.
6. Next capability's first step: **Record payment…** (`concept-payments.md` walk step 1).
