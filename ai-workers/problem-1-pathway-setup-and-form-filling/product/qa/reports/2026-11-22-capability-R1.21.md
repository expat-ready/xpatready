# qa capability R1.21 — our own invoices with sales tax

22 Nov ~11:5x IST · main 01841047d · isolated copy :4470 (`PLATFORM_IDENTITY=local`, fake BillingPort, no Stripe key) · live AI off · US$0 · Opus 5.5.

**Verdict: Partial (was Not built).** Journey `prototype/studio/tests/journeys/j_21.ts`: 14/17, twice, same lines; exit 1. Journey score not awarded: the row's own clause (an invoice with its tax) cannot be reached (P-606).

## Journeys (persona: a firm's Owner)
| # | Journey | Result |
|---|---|---|
| W1 | Sign in → Plan and billing from the menu | PASS (2 lines): "Prices are in CAD, plus applicable taxes (Sample)"; "Not added yet. Needed before your first invoice: we use it to work out tax."; "No invoices yet." |
| W2 | The address the tax is worked out from | PASS (6 lines): Add a card with no address opens the address first (no Stripe page); an empty address and a wrong postal code refused on their fields; an Ontario address (accents, non-English) stored as typed, shown, "Business address saved."; one audit line `platform.firm.address_changed` naming ON |
| W3 | An invoice is listed, opens, and carries the province's tax | **FAIL (3 lines)**: "No invoices yet."; 0 rows; `GET /api/platform/billing/invoices` → 200 with 0 invoices; the firm's subscription has no Stripe customer |
| W4 | The invoices read with no session | PASS: 401 |
| W5 | Ends at R1.22's first step | PASS: the Owner's "Manage plan and billing" is offered |
| W6 | Plan and billing at 400, 1024, 1440 px, axe WCAG 2.2 A/AA | PASS (3 lines) |

## Why W3 cannot pass today
1. **No invoice can exist on a copy without Stripe.** A local sign-up stores no Stripe customer (`stripe_customer_id` empty), and the invoices read answers an empty list without one. The fake BillingPort keeps invoices only in a test process's memory (`ports/billing.ts`, `invoiceList`); nothing seeds it on a running copy. `check_pf5s2_billing_browser.ts` shows rows by rewriting the answer in the browser, which is the builder's check, not a walk.
2. **The invoice has no tax on it in our code.** `BillingInvoice` (port), the invoices read and the list carry id, number, status, amount due, currency, date and Stripe's hosted link; no tax amount, no province. The tax would be seen only on Stripe's own hosted invoice.
3. **PF-5's tax go-live gate** ("no paying invoice while tax is not configured") is not on main: no code names it. Built instead: Stripe Tax on at Checkout, the address before any card, and a draft invoice held while its tax needs the address.

## Parts missing (for a builder)
* **PF-5 + PF-5s: the tax amount on the invoice** (port shape, `GET /api/platform/billing/invoices`, a Tax column or line in the list). Buildable and testable on the fake.
* **PF-5: the tax go-live gate.** Buildable and testable on the fake.
* **The proof.** The done-when says "from the billing provider's test mode": **a Stripe test key is truly needed** (test mode, Stripe Tax switched on with an Ontario registration, a test clock or a trial ended by API; US$0, no priced call), because Stripe Tax works the tax out and the fake cannot. Without a key, only a stand-in invoice can be shown; that needs a way to seed the fake on a running copy and the Lead's re-wording of the done-when.

## Question for the tech lead
Is a Stripe test key (the founder's account, test mode, Stripe Tax on) coming for R1.21 before 07:00 IST 23 Nov, or should the done-when be re-worded to a stand-in invoice with a Sample tax amount (labelled Sample; tax readings "Unconfirmed: no counsel")?

## Notes
* Minor (UX, not logged as a row; the Lead numbers it if wanted): an empty Province says "This is not one of the allowed choices." and an empty Postal code says "This is not in the expected format."; "This is required." would match the other fields.
* Not tested: a real screen reader; an intended user's unaided walk (D17, D20); the shared demo (:4400 is not reachable from this cloud copy); Stripe's hosted invoice page.
* Screenshots: `product/screens/J-21/screenshots/`.
