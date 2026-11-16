# FO-7s0 · Invoices: the Money area, the builder, the issue dialog, the invoice detail and corrections (groups (a), (b), (i))

Index and shared rules: `concept.md`. Board: `design/invoices.html` (Sample data, team tokens). Builds: FO-7s1 (list, builder, issue, detail), FO-7s4 (corrections), FO-7m part 3 (Monthly check menu entry; screen in `concept-trust.md` (h)). Every figure is **Sample**; tax readings are **Unconfirmed: no accountant**; legal readings **Unconfirmed: no counsel**.

## 1. Job, persona, journey
* **Job:** a Billing person (or the Owner) bills a won client for work done, issues the invoice with the right number, tax and due date, and fixes a mistake later without editing what was issued (AG-6-1 r1-r8, AG-6-48, AG-6-75, AG-6-76).
* **Personas:** Billing person (`BILLING_FINANCE`, holds `agent/invoice:*`, `agent/payment:record`, `agent/refund:create`); Owner; Case Officer (sees only invoices on cases and people they can already see, C5, fail closed: FO-7q).
* **Journey (P-352):** Money → Invoices → New invoice → pick Client B → Start from retainer → add a Government fee line → Issue → invoice detail (Open, `INV-0003`, due in 14 days) → Record payment (`concept-payments.md`).

## 2. The Money area (a): one menu group, shown only to staff with `agent/invoice:list`
Pattern: **Library list** (EXPERIENCE §3) per page: search + at most two filters + chips; 44 px rows; identifier first, status near the end, actions last (TEAM-PATTERNS). Breadcrumb in the header: `Money › Invoices`.

| Menu item (exact words) | Web path (Sample, PF-1 seam, `web/src/modules/client-money/routes.tsx`) | Shown when |
|---|---|---|
| Invoices | `/money/invoices` | `agent/invoice:list` |
| Payments | `/money/payments` | `agent/payment:record` or `agent/invoice:show` |
| Trust | `/money/trust` | trust-on states only (concept.md §3 rule T) |
| To move | `/money/to-move` | trust-on states and `agent/payment:record` |
| Monthly check | `/money/monthly-check` | trust-on states and `agent/payment:record` |
| Exports | `/money/exports` | `agent/billing:export` (AG-6-31 §8) |
| Getting paid | `/money/settings/getting-paid` | every staff member with `agent/invoice:list` (values read-only without the keys, `concept-settings.md`) |

A menu item the viewer cannot use is **absent**, never disabled (BIC-02's spirit; AG-6-59 r5 for trust). The Owner, while the trust answer is Unanswered, sees the trust question inline at the top of the Money area (`concept-trust.md` (f)).

## 3. Invoice list (FO-7s1 part 1)
* Columns: Number (`INV-0003`, or "Draft" in muted text) · Bill to · Case · Issued · Due · Total (`CAD 2,655.50`) · Balance due · Status chip · ⋯. Every amount carries its currency code; **no total row** (AG-6-25 r3; FO-7r "no total row"). Above the table, inline stats **per currency**: "Open: CAD 4,120.00 · USD 900.00" — two figures, never one (DW4).
* Filters: status (one select, FO-7b's words) and Bill to; secondary (case, issued from/to, Overdue only) collapse; filter state in the URL; "Show more" by cursor (50 per page, FO-7q).
* Status words (FO-7b's one derivation; chip = shape + text, never colour alone): **Draft · Open · Part paid · Paid · Overdue · Cancelled · Refunded · Written off**. FO-7b's `Credited` (fully credited, AG-6-1 r7 `CANCELLED`) shows as **Cancelled** (AG-6-48 r2: "The invoice keeps its number and shows 'Cancelled'"); a part credit note leaves Open or Part paid. Tooltip on each chip: "Open: issued, nothing paid yet" · "Part paid: CAD 1,655.50 still due" · "Overdue: due 24 Dec, CAD 1,655.50 still due" · "Written off: the balance was settled by a write-off on 3 Dec" · "Cancelled: fully credited by CN-0001; the number is kept".
* Empty (nothing yet): "No invoices yet. Invoices you create for won clients appear here." [New invoice]. Empty (nothing matches): "No invoices match these filters." [Clear filters]. Loading: 6 skeleton rows + `sr-only` "Loading invoices". Error: `ErrorState` "Invoices could not load. Retry" with a real Retry. 403: `NoAccessState`.

## 4. Invoice builder (FO-7s1 part 2): a page, not a dialog (many lines; Workspace pattern: lines left, live totals right)
* **Bill to** (party search): type ahead over **won people and companies only** (AG-6-1 r1: "There is no invoice on a prospect"); a prospect never appears (the read filters it; FO-7b refuses it too). Empty search: "No won client matches 'Pine'. Prospects are billed by a trust request once trust is on, or after they sign." — the second half only in trust-on states; trust off: "No won client matches 'Pine'." Route: **FO-7q addition** (§9, gap G2).
* **Case** (optional): the Bill to's cases; the invoice takes the case's currency (AG-6-46 r3), shown read-only "CAD (the case's currency)"; with no case, the firm default with a select CAD · USD before issue.
* **Start from retainer** (AG-6-42): fills the signed retainer's fee rows as Fee lines. Unsigned (neither signed nor signed offline) → warning panel, not a block: "Client B's retainer isn't signed. Invoice anyway?" [Invoice anyway] [Cancel] (AG-6-42 r1, FO-7b's 409 words); after Invoice anyway, lines are typed (r5) and the choice is recorded (r3). No retainer → the action is absent with the hint "No retainer for Client B: type the lines."
* **Lines**: kind select **Fee · Disbursement · Government fee**; description, quantity, unit price, tax. Fee and Disbursement show a **Taxable / Not taxable** control (default Taxable, AG-6-4 r3; FO-7g: never a typed rate). **Government fee shows no tax control at all** (not a disabled one), with one muted line: "Government fees are never taxed." (AG-6-4 r3; P-607 (7): the line is typed in R1, no "Add from the case's fee").
* **Totals panel** (right, sticky): Subtotal · Tax (named per FO-7g's default, e.g. "HST 13% · Sample", with a tooltip "From the firm's province, Ontario (Bill to has no address yet)") · Total · "Will be INV-0008" (AG-6-1 r8 preview; FO-7b names the number only at issue). Not registered for tax → no tax line and the note "Not registered for tax: no tax is added (Getting paid)" (AG-6-4 r5). Bill to outside Canada → hint "Client is outside Canada — check whether tax applies" (r4, never a block; waits on FO-7g part 3).
* **Pay from trust box** (trust-on states only, FO-7s3b): "Pay CAD 960.50 from trust at issue" with available shown, pre-ticked at the lower of available and total (AG-6-68 r2; Lead B's answer 3 in FO-7s3b's brief withdrew the off-by-default reading the BACKLOG row still states; noted for Build Lead C, §10 Q-C1).
* Save: autosave of the draft with "Saved" / "Saving…" / "Couldn't save — Retry" (BIC-18); optimistic version: a stale save shows "Someone else changed this draft. Reload" (STANDARDS §4).
* One primary button per panel: **Issue invoice** (never "Submit").

## 5. Issue dialog (right panel; it collects a value)
* Fields: Invoice date (today, firm zone) · **Due date** "Due in 14 days (30 Nov)" from Getting paid's `due_in_days`, with "Due on receipt" as one click (AG-6-46 r1); a past date → hint "This date has passed; the invoice shows overdue." (§12).
* Trust-on states with available money: tick **"Pay CAD 960.50 from trust now"**, ticked by default (AG-6-68 r2, FO-7t: applied in the same transaction right after the number).
* Operating details block empty → the invoice issues and the panel says **"Email waits: add your payment details"** with a link to Getting paid (AG-6-71 r3, Guard 1) — an info Finding, never an error.
* Primary: **Issue INV-0008 and email Client B** (or "Issue INV-0008" when the email waits). The button disables on click; one issue per opening (the API refuses a second); the number shown afterwards is the database's (AG-6-44).
* After: toast "INV-0008 issued" and the detail opens.

## 6. Invoice detail (Side panel 560 px from the list; full page at `/money/invoices/:id`)
Pinned header: number + status chip + Bill to + "Owes CAD 1,655.50 · 12 days overdue" (per currency). Sections (not tabs): **Summary** (total, paid, paid from trust (trust-on only), credited, written off, balance due, due date with "Change due date" for `agent/invoice:issue`, AG-6-46 r2) · **Lines** (with tax per line) · **Payments** (receipt numbers, links to payment detail) · **History** (issued, payments, credit notes, refunds, write-off, by whom and when) · **PDF** link.
* **Actions only from `allowedActions`** (FO-7q `reads/actions.ts`; an action appears only when its route is on `main`): on a draft Edit · Issue · Delete draft; issued: Record payment · Pay from trust (trust-on) · Copy pay link · Send pay link (FO-7s2; never on a deposit invoice) · Payment plan (FO-7s4p) · Credit note · Cancel invoice · Write off · Refund (on a payment) · Send statement lives on the Money tab. One primary per panel: the status's next step (Open → Record payment).
* An edit attempt on an issued invoice is not offered; the Lines section says "Issued invoices can't be edited — use a credit note." with [Use a credit note] (AG-6-1 r6).

## 7. Corrections (i): one right panel per action, each a preview then Confirm (FO-7s4 part 1)
| Action | Fields | Refusal / result words (API's) | Never |
|---|---|---|---|
| Credit note | Amount (≤ remaining total, shown), optional line, Reason (required) | "Already settled by write-off" (409); after: "CN-0001 issued · balance falls by CAD 282.50" | on a draft |
| Cancel invoice | Reason | "INV-0007 is cancelled and keeps its number. A corrected invoice takes the next number." | — |
| Refund (on a payment) | Amount (≤ refundable, shown), Reason, recipient = the payer read-only (or with a reason, if FO-7b takes it, gap G9) | card: "Refund requested" until Stripe's event, then "Refunded"; 409 "Record an offline refund instead" opens the offline form prefilled | shown without `agent/refund:create` |
| Write off | Reason only; the amount is the remaining balance: "Write off CAD 25.00 (the remaining balance)" | "Only an issued invoice with a balance can be written off." | on a draft; an amount field |
| Reverse entry (on a recorded payment) | Reason: Recorded by mistake · Wrong client · Returned · Other (typed) | the preview list, then Confirm; "Changed since the preview" (409) → reload the preview; card: not offered, the panel says "Use a refund" | on a card payment; a negative balance |

**Reverse-entry preview** (FO-7v's `planReversal`, shown exactly, item by item): "Reversing R-0007 (CAD 1,500.00, Returned) will: put INV-0005 back to CAD 1,186.50 due · undo CAD 960.50 paid from trust to INV-0002 · remove 1 open To move line". After money already moved: the preview ends with **"CAD 1,500.00 must move from operating to trust: reversal of R-0007 · the Owner is told once"** and the trust balance line reads **"Trust after: CAD 0.00"** — never a negative figure (P-607 (1), departing from AG-6-75 r4 and AG-6-60 r7's red "−CAD 1,500"; DW7). Trust-off firms see only the invoice lines of the preview.

## 8. Business rules (each: one pass test, one fail test; the builder's check names in brackets)
* **BR-I1 won only** (AG-6-1 r1): pass, Client B (won) is found; fail, a prospect typed by name is not found and FO-7b refuses it if forced. [FO-7s1 DW4]
* **BR-I2 government fee untaxed** (AG-6-4 r3; P-607 (7)): pass, CAD 255 government + CAD 1,000 fee (Ontario, Sample 13 %) → tax CAD 130.00 only on the fee; fail, any tax control rendered on the government line fails the DOM check. [FO-7s1 DW1]
* **BR-I3 number at issue, once** (AG-6-1 r5, AG-6-44): pass, a draft shows "Will be INV-0008" and no number; fail, a double click on Issue gives one number. [DW2]
* **BR-I4 frozen** (AG-6-1 r6): pass, issued detail offers Use a credit note; fail, an Edit action on an issued invoice fails the action scan. [DW3]
* **BR-I5 email waits** (AG-6-71 r3): pass, empty operating block → issued + "Email waits: add your payment details"; fail, an error or a blocked issue. [DW5]
* **BR-I6 actions from `allowedActions` only** (FO-7q): pass, Record payment shows for `agent/payment:record`; fail, it shows without the key. [DW6]
* **BR-I7 per currency** (AG-6-25): pass, a CAD and a USD invoice give "CAD … · USD …"; fail, any single sum. [DW7; FO-7s0 DW4]
* **BR-I8 corrections never edit** (AG-6-48, AG-6-76, AG-6-75): pass, each panel writes a new record and shows its number; fail, write-off on a draft is not offered; reverse on a card payment is not offered.
* **BR-I9 never negative** (P-607 (1)): pass, the moved-money preview shows the operating → trust line and "Trust after: CAD 0.00"; fail, any "−CAD" figure on the page. [FO-7s0 DW7]

## 9. Contract (one line per element; route under `/api/front-office/money/`; refusal words shown as the API gives them)
| Element | Route | Key | Row | Refusal shown |
|---|---|---|---|---|
| Invoice list, filters, stats per currency | `GET invoices?status=&partyKind=&partyId=&caseId=&issuedFrom=&issuedTo=&overdue=&pageSize=&after=` | `agent/invoice:list` | FO-7q | page size > 200 → 400 plain message |
| Invoice detail, `allowedActions` | `GET invoices/:id` | `agent/invoice:show` | FO-7q | 404 = "not found" page (C5, never an amount) |
| Bill to search (won only) | **FO-7q addition (G2):** `GET bill-to?q=` (won people and companies, C5) | `agent/invoice:create` | FO-7q | — |
| Start from retainer: the party's signed retainer | **FO-7q addition (G3):** `GET parties/:kind/:id/retainers` (signed state and fee rows) | `agent/invoice:create` | FO-7q | — |
| Create, edit, delete a draft; Invoice anyway | FO-7b's draft routes (actions named in FO-7b; the path is read on `main`); body flag `unsignedRetainerAcknowledged` | `agent/invoice:create`, `:edit`, `:void` | FO-7b | 409 "Client B's retainer isn't signed. Invoice anyway?" |
| Tax default and line control | `GET tax-default?partyKind=&partyId=` → `{ taxName, ratePpm, source, outsideCanada, registered }` | `agent/invoice:create` | FO-7g | typed rate → refused |
| Issue (number, due date, Pay from trust tick) | FO-7b's issue route (path on `main`); tick calls `applyTrust` in the same transaction | `agent/invoice:issue` | FO-7b, FO-7t | "Only CAD 169.50 is available." |
| Change due date | FO-7b's issue key route (AG-6-46 r2; path on `main`; **question Q-C2** if FO-7b has none) | `agent/invoice:issue` | FO-7b | — |
| Pay from trust (issued) | `POST trust/applications` `{ invoiceId, amountMinor, otherFundsPick? }`; available: **FO-7q addition** `GET invoices/:id/trust-available` | `agent/invoice:issue` | FO-7t, FO-7q | "Only CAD X is available." |
| Copy / Send pay link | `POST invoices/:id/pay-link`; send: **question Q-C3** `POST invoices/:id/pay-link/send` (a write no brief builds) | `agent/payment:online` | FO-7c, FO-7s2 | deposit invoice → not offered |
| Credit note, Cancel invoice | FO-7b's credit-note route (path on `main`); email: **question Q-C4** (a send no brief builds) | `agent/invoice:void` | FO-7b | 409 "Already settled by write-off" |
| Refund offline / card | FO-7b's refund route; `POST payments/:id/card-refund` | `agent/refund:create` | FO-7b, FO-7c | 409 "Record an offline refund instead" |
| Write off | `POST invoices/:id/write-off` `{ reason }` | `agent/invoice:void` | FO-7r | "Only an issued invoice with a balance can be written off." |
| Reverse entry | `GET payments/:id/reverse-preview`; `POST payments/:id/reverse` `{ reasonCode, reason?, previewHash }` | `agent/payment:record` | FO-7v | 409 "Use a refund"; 409 "Changed since the preview" |
| Payment plan (link from detail) | FO-7p `POST invoices/:id/plan` (screen `concept-pay-page.md`) | `agent/invoice:issue` | FO-7p | 400 "Instalments add up to …" |

## 10. Walks (P-352, replayable by qa, P-592; 1440 px; Sample data seeded as in FO-7s1 W1)
**W-I1 bill from a retainer.** 1 Sign in as the Billing person → home. 2 Money → Invoices → list (empty state or rows). 3 New invoice → builder, Bill to empty. 4 Type "Client B" → one won result; pick → Case "Work permit" and "CAD (the case's currency)". 5 Start from retainer → two Fee lines from the signed retainer. 6 Add line → Government fee, CAD 255.00 → no tax control, "Government fees are never taxed.", tax total unchanged. 7 Issue invoice → issue panel, "Due in 14 days (30 Nov)". 8 Issue INV-0003 and email Client B → detail, status Open, number `INV-0003`, due 30 Nov. 9 Next capability's first step: Record payment → the Record payment panel (`concept-payments.md` W-P1 step 3).
**W-I2 correct and settle.** 1 Open INV-0003 (Open) → detail. 2 Credit note → panel; CAD 282.50, reason "Goodwill" → "CN-0001 issued · balance falls by CAD 282.50". 3 Open INV-0009 (CAD 25.00 due) → Write off → "Write off CAD 25.00 (the remaining balance)", reason "Wire fee" → status Written off. 4 Open payment R-0007 (cheque) → Reverse entry → reason Returned → preview lists INV-0005 back to CAD 1,186.50 due → Confirm → payment shows Reversed. 5 Next step: Money → To move (trust-on) shows the operating → trust line if money had moved (`concept-trust.md` W-T2).
