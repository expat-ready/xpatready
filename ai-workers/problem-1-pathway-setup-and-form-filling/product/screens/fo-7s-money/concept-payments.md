# FO-7s0 · Payments: Record payment, the payment detail, Send statement and Exports (groups (c), (j))

Index and shared rules: `concept.md`. Board: `design/payments.html`. Builds: FO-7s3a part 1 (Record payment, payment detail), FO-7s3a part 2 (the trust-on parts of the dialog), FO-7s5 (Send statement, Exports). Every figure is **Sample**.

## 1. Job, persona, journey
* **Job:** record a cheque, transfer, e-Transfer, cash or card-terminal payment in seconds against the right document, once, and hand the bookkeeper the period's files (AG-6-19 r1-r6, AG-6-28 r3, AG-6-31).
* **Personas:** Billing person (`agent/payment:record`, `agent/invoice:issue`, `agent/billing:export`); Case Manager (no export key: no Exports item); Case Officer (C5 only).
* **Journey:** invoice detail → Record payment → payment detail with its receipt → the invoice shows Part paid or Paid → (month end) Money → Exports.

## 2. Record payment (c): right panel from an invoice, a trust request, a case or a client (AG-6-19 r2)
* **Target** line at the top, read-only: "For INV-0003 · Client B · CAD 1,655.50 due". From a case or client with no document: "For Client B's work permit case, no invoice" (AG-6-72).
* **Fields, in order** (staff page: "(optional)" marks the optional ones, BIC-04): Method (select, words: Bank transfer · Wire · Cheque · Cash · e-Transfer · Card terminal · Other; **never "Card"**, FO-7ts methods step) · Amount (the document's currency shown as a fixed prefix "CAD"; a payment in another currency is entered in the document currency with a note, AG-6-19 r6) · Date (today, firm zone) · Reference · Paid by (the Bill to, changeable to another party or a typed name, AG-6-72) · Note (optional).
* **Received into** — shown **only in trust-on states**, read-only, as the route decides it: "Received into: Operating" or "Received into: Trust (Trust first)" (AG-6-69 r1, r5). Whether staff may change it in R1 is Build Lead C's open question (FO-7s3a part 2); this concept draws it read-only, the recommended answer (Q-C5). Trust off: the line does not exist in the DOM (DW1).
* **Cheque:** a "Cleared" tick (off by default) only when FO-7b's cleared route is on `main`; otherwise the detail says "Not yet cleared" read-only (AG-6-63 r7; gap G7).
* **Extra money** is never refused (AG-6-21 r2-r3, §13): CAD 1,855.50 on CAD 1,655.50 due → inline Finding "CAD 200.00 extra" + trust Yes: "The extra CAD 200.00 goes into Client B's trust balance." · trust off: choice "Refund · Keep as credit" (Refund opens FO-7s4's refund once on `main`, else Keep as credit only).
* **Duplicate reference** warns where it happens: "A payment with reference 4471 is already recorded on this invoice. Record anyway?" [Record anyway] (AG-6-19 r4) — the resubmit carries the confirm flag on the same key.
* **One idempotency key per opening** of the panel, made when it opens and sent with every submit of that opening (AG-6-19 r3); the primary button disables while sending. A double click gives one payment.
* Primary: **Record CAD 1,000.00 cheque** (verb + object, BIC-11). Success: toast "Payment recorded · receipt R-0004 emailed to Client B" and the invoice shows Part paid with "CAD 655.50 due".
* Over-balance and cancelled-invoice cases: a cancelled invoice is refused — "This invoice is cancelled. Record the payment on the case instead." [Record on the case] (AG-6-19 §12).

## 3. Payment detail (Side panel, `/money/payments/:id`)
Header: receipt number + method + "CAD 1,000.00" + chip **Recorded** / **Reversed** / **Refunded** / **Part refunded**. Sections: Payment (method, amount, date, reference, paid by, recorded by and when, "on behalf of the client" line for staff entry, AG-6-43) · Applied to (INV-0003, linked) · Received into (trust-on only) · Receipt (R-0004, PDF, [Resend receipt] only when its route is on `main`, gap G6) · Cleared (cheque) · Refunds (each with "Refund requested" until Stripe's event for a card refund) · History. Actions from `allowedActions`: Refund (`agent/refund:create`) · Reverse entry (`agent/payment:record`, never on a card payment) — panels in `concept-invoices.md` §7.

## 4. Payments list (`/money/payments`)
Columns: Receipt · Date · Paid by · For (INV-…, DR-… in trust-on states only) · Method · Amount · Status. Filters: method and date range; "Show more" by cursor. Stats per currency: "Recorded this month: CAD 42,000.00 · USD 3,500.00" (AG-6-27 r3) — two figures, never one. Empty: "No payments yet. Payments you record, and card payments clients make, appear here."

## 5. Send statement (j): right panel from the Money tab of a person, company or case (FO-7s5)
* Period: From · To, default **Everything** (AG-6-28 r3). Recipient: the Bill to, read-only, no Cc (AG-6-41). Wording: the fixed "Your statement" text, read-only (`samples/fo7r-statement-wording.txt`, until the template library holds it).
* **Preview** (left of the panel, PDF view): every figure per currency; a USD case and a CAD case give two columns, no sum (AG-6-28 §11 failure). Trust-on states add the trust movements and the plain line "Held in trust for your work permit: CAD 1,500.00" (AG-6-28 r3, AG-6-60 r10); trust off and nothing held: no trust word anywhere in the preview.
* Primary: **Send statement to Client B**. Success: "Statement sent to Client B". **No schedule, repeat or "send monthly" control** (AG-6-28 §13; FO-7s5 DW2).

## 6. Exports (j): `/money/exports`, only with `agent/billing:export`
* Pick a period (From · To) and files: Invoices · Payments · Refunds · Credit notes · Write-offs · **Trust ledger** (the last only in trust-on states, AG-6-59 r5; with trust off and nothing held the API answers 400, FO-7r DW9). Primary: **Start export**.
* State per export: "Still preparing" → ready with one download link per file, "Link expires 17 Nov, 16:05" (24 hours, Sample; FO-5's links); a header-only file says "No records in this period". Never "Failed" (not knowable, FO-7r gap 4): a stuck job keeps "Still preparing" and the hint "This can take a few minutes. You can leave this page."
* Expired link: "This link has expired. Start the export again." No key: no menu item; a typed address shows "You do not have access to exports" (the API's 403), never a blank page.
* Amounts in their own currency in every file; no conversion (AG-6-31 r3).

## 7. Business rules (pass and fail)
* **BR-P1 one payment per opening** (AG-6-19 r3): pass, a double click on Record gives one payment; fail, two rows appear. [FO-7s3a DW4]
* **BR-P2 duplicate reference warns** (r4): pass, reference 4471 twice → warning, then records on Record anyway; fail, it records silently or refuses outright. [DW5]
* **BR-P3 no card by hand** (FO-7ts; P-567 (3)): pass, the method list has seven entries without "Card"; fail, "Card" appears. [DW11]
* **BR-P4 Received into only when trust shows** (AG-6-69, AG-6-59 r5): pass, Yes → the line shows; fail, Unanswered → the text scan finds "Received into". [DW1; FO-7s0 DW1]
* **BR-P5 extra money never refused** (AG-6-21): pass, CAD 1,855.50 on CAD 1,655.50 → "CAD 200.00 extra"; fail, a refusal. [DW3]
* **BR-P6 statement by a person, per currency** (AG-6-28): pass, two currency columns; fail, a schedule control or a summed figure. [FO-7s5 DW1-DW2]
* **BR-P7 exports by key** (AG-6-31 §8): pass, the Billing person sees Exports; fail, the Case Manager sees it. [FO-7s5 DW4]
* **BR-P8 empty period** (AG-6-31 §12): pass, header-only files with "No records in this period"; fail, no file or an error.

## 8. Contract (route under `/api/front-office/money/`)
| Element | Route | Key | Row | Refusal shown |
|---|---|---|---|---|
| Record payment (invoice, case, client) | FO-7b's offline payment route (action named in FO-7b; path read on `main`), idempotency key, confirm flag | `agent/payment:record` | FO-7b | duplicate-reference warning; cancelled invoice refused |
| Record payment on a trust request | `POST trust/deposits` (FO-7t; `CARD` refused) | `agent/payment:record` | FO-7t | "Add your trust payment details" (request side) |
| Methods list | FO-7ts methods step (the enum on `main`, offered by the offline payment route) | `agent/payment:record` | FO-7ts | — |
| Keep as credit | FO-7b's overpayment correction writing FO-7ts `KEPT` | `agent/payment:record` | FO-7b, FO-7ts | — |
| Payments list, detail | `GET payments?invoiceId=&trustRequestId=&method=&from=&to=&pageSize=&after=`; `GET payments/:id` | `agent/payment:record` or `agent/invoice:show` | FO-7q | 404 "not found" (C5) |
| Resend receipt | **question Q-C6** `POST payments/:id/receipt/resend` (a write no brief builds; FO-7s3a proposes FO-7b) | `agent/payment:record` | — | — |
| Cleared tick | **question Q-C7** (FO-7b's cleared route if built) | `agent/payment:record` | FO-7b | — |
| Pending card refund ("Refund requested") | **FO-7q addition (G8):** pending refund in `GET payments/:id` | `agent/payment:record` | FO-7q | — |
| Send statement | `POST parties/:kind/:id/statements`, `POST cases/:id/statements` `{ from?, to? }` | `agent/invoice:issue` | FO-7r | 403 shown in words |
| Statement preview | **FO-7q addition (G10):** `POST parties/:kind/:id/statements/preview`, `POST cases/:id/statements/preview` (a read: renders, sends nothing) | `agent/invoice:show` | FO-7q | — |
| Start export, state, download | `POST exports` `{ from, to, kinds }`; `GET exports/:id`; `GET exports/:id/:kind.csv` | `agent/billing:export` | FO-7r | 400 trust ledger with trust off; "This link has expired. Start the export again." |
| Past exports list; rows per file | **FO-7q additions (G11):** `GET exports?pageSize=&after=`; `rowCount` per kind | `agent/billing:export` | FO-7q | — |

## 9. Walks (1440 px)
**W-P1 record a cheque (trust off).** 1 Sign in as the Billing person. 2 Money → Invoices → INV-0003 (Open, CAD 2,655.50) → detail. 3 Record payment → panel "For INV-0003 · Client B · CAD 2,655.50 due"; no "Received into" line. 4 Method Cheque, amount 1,000.00, reference 4471 → Record CAD 1,000.00 cheque → toast with R-0004; the detail shows Part paid, "CAD 1,655.50 due". 5 Record payment again, reference 4471 → the duplicate warning → Cancel. 6 Open R-0004 → payment detail, "Not yet cleared". 7 Next step: Money → Payments → R-0004 in the list.
**W-P2 statement and exports.** 1 Open Client B (Money tab, `concept-trust.md` (e)). 2 Send statement → panel, period Everything, preview with CAD only. 3 Send statement to Client B → "Statement sent to Client B". 4 Money → Exports → period 1-30 Nov, tick Payments (and Trust ledger, trust-on) → Start export → "Still preparing" → ready → download Payments.csv. 5 Next step: the bookkeeper opens the file (outside the product).
