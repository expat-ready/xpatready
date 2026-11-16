# FO-7s0 · Getting paid: operating details, trust details, tax registration, Prices include tax, card payments status (group (g))

Index and shared rules: `concept.md`. Board: `design/settings.html`. Builds: FO-7s1 part 3 (operating block, tax), FO-7s3a part 2 (trust details block, the trust question's place here), FO-7s2 part 1 (Card payments, "Invoice payments go to"). Tax readings **Unconfirmed: no accountant**; no rate list and **no rate editing** anywhere (AG-6-4 §3, §13; Lead 61's final answer on #1878: the requirement stands).

## 1. Job, persona, journey
* **Job:** the Owner (or an Admin for tax and terms) sets once how the firm gets paid, so every invoice, request and pay page prints the right details and tax (AG-6-71, AG-6-4 r5-r6, AG-6-46 r1, AG-16-14..18).
* **Personas:** Owner (every section, Card payments, "Invoice payments go to", the trust answer); Admin (`agent/billing-config:tax`, `agent/billing-config:terms`); everyone else with `agent/invoice:list` sees the values read-only with "Only the Owner or an Admin can change these."
* **Journey:** Money → Getting paid → fill the operating details → Save → the "Email waits" notice on a waiting invoice clears and its email goes (FO-7b).

## 2. Layout (`/money/settings/getting-paid`; one page, sections not tabs; each section edits in place and saves on its own)
1. **Client money** — the Owner's question S1-S2 (`concept-trust.md` §3) with the answer and "Last changed 19 Oct by Client C". Owner only; others see nothing here in U and N0, and "Client money is held in trust" read-only in Y and N$ (a trust word, allowed there).
2. **Operating payment details** (AG-6-71 r1): free text (bank details, payee), "Interac e-Transfer email" (optional). Hint: "Printed on invoices, invoice emails, statements and the invoice pay page." Empty → a Finding "Invoice emails wait until you add these details." (Guard 1).
3. **Trust payment details** (Y only; AG-6-71 r2): free text + "Interac e-Transfer email". Hint: "Printed on trust requests." Same e-Transfer email in both → hint "Both blocks use the same e-Transfer email." (§12, allowed).
4. **Tax** (AG-6-4 r5; FO-7ts): switch **Registered for tax** (off by default); on → **Tax number** (required; on save without it the database's refusal in words: "Add your tax number to register for tax."). Read-only line: "Tax comes from ExpatReady's provincial rates (Sample until cited): HST 13% in Ontario." No rate list, no rate field. The QST number is hidden (P-568 (1): no Quebec in R1).
5. **Terms**: "Due in 14 days" (number of days, `agent/billing-config:terms`; AG-6-46 r1); currency default CAD · USD.
6. **Card payments** (FO-7s2 part 1): everyone sees one line "Card payments: on" / "Card payments: off"; the Owner (holding `agent/payment-rail:connect`, shown by the key from `/api/platform/me`, never by role name) sees the status and its one next step:
   | Status (code never shown) | Words | Next step |
   |---|---|---|
   | `NOT_CONNECTED` | "Not connected" — "Clients can pay invoices by card into your own Stripe account." | [Connect with Stripe] |
   | `PENDING` | "Pending — Stripe is checking your details." | [Continue set-up] |
   | `ACTIVE` (charges enabled) | "Active — clients can pay invoices by card." | — |
   | `RESTRICTED`, charges on | "Needs attention — Stripe asks for more details. Payments still work." | [Open Stripe] |
   | `RESTRICTED`, charges off / `DISCONNECTED` | "Payment account disconnected — Reconnect" (AG-6-49 r1(e)); "Clients see your payment details instead of a card form." | [Reconnect] |
   Connect asks for step-up first: the API's 401 `STEP_UP_REQUIRED` hands off to PF-6's "Confirm it's you: sign in again, then try once more." Non-Owner opening the address: "Only the Owner manages card payments" (the API's 403). No key, secret or Stripe id ever shows (AG-16-18).
7. **Advanced** (collapsed): "Prices include tax" (`agent/billing-config:tax`; AG-6-4 r6, FO-7g part 2) · **"Invoice payments go to: Operating account · Trust first"** (Owner only, **Y only**, "Last changed 3 Jun by Client C"; AG-6-69 r3; with trust off it does not exist).
Each section: Edit → fields → [Cancel] [Save <section>] (one primary), "Saved" / "Couldn't save — Retry"; a stale save → "Someone else changed these settings. Reload". Every change is audited (old, new, who).

## 3. Business rules (pass and fail)
* **BR-G1 email waits, not an error** (AG-6-71 r3): pass, empty operating block → the Finding here and "Email waits" on the invoice; fail, issuing is blocked. [FO-7s1 DW5]
* **BR-G2 registered needs a number** (FO-7ts CHECK): pass, switch on + number saves; fail, switch on with no number shows the refusal on the field. [FO-7s1 DW8]
* **BR-G3 no rate editing** (AG-6-4 §13): pass, the Tax section has no rate input; fail, any input that takes a rate. [DOM check]
* **BR-G4 trust details only when trust shows** (AG-6-59 r5, AG-6-71 r2): pass, Y shows section 3; fail, U shows it. [FO-7s0 DW1, S19]
* **BR-G5 card status by key** (AG-16-14): pass, a non-Owner sees "Card payments: on" and no button; fail, a Connect button without the key. [FO-7s2 DW1]
* **BR-G6 Trust first only for the Owner with Yes** (AG-6-69 r3): pass, Owner in Y sees it; fail, the scan finds "Trust first" in U, N0 or for a non-Owner. [FO-7s2 DW9]

## 4. Contract (route under `/api/front-office/money/`)
| Element | Route | Key | Row | Refusal shown |
|---|---|---|---|---|
| Read the settings (blocks, tax, terms, card line) | **FO-7q addition (G16):** `GET settings/getting-paid` (no brief names the read) | `agent/invoice:list` | FO-7q | — |
| Operating details block (write) | **question Q-C11** (no brief builds it; recommended FO-7g part 2 or a row Build Lead C names) | `agent/billing-config:terms` | — | — |
| Trust details block (write) | **question Q-C11** (recommended FO-7t part 1) | `agent/billing-config:terms` | — | — |
| Registered for tax, tax number, Prices include tax (write) | **question Q-C11** (recommended FO-7g part 2; `agent/billing-config:tax`) | `agent/billing-config:tax` | FO-7g | "Add your tax number to register for tax." |
| Due in N days, default currency (write) | **question Q-C11** | `agent/billing-config:terms` | — | — |
| Trust answer | `GET`/`PUT trust/answer` | Owner (service) | FO-7t | 403 in words |
| Card payments status, Connect | `GET payment-account`; `POST payment-account/onboarding` | `agent/payment-rail:connect` (step-up) | FO-7c | 401 `STEP_UP_REQUIRED` → "Confirm it's you"; 403 "Only the Owner manages card payments" |
| Card payments line for others | `cardPayments` flag (FO-7q detail and the settings read, G16) | `agent/invoice:list` | FO-7q | — |
| Invoice payments go to | FO-7b's setting route (amendment 2; path read on `main`, FO-7s2 gap 4) | Owner (service) | FO-7b | — |

## 5. Walk (1440 px)
**W-G1 set up getting paid.** 1 Sign in as the Owner → Money → Getting paid. 2 Client money (U) → the question; answer No → "Last changed 16 Nov by Client C"; no trust details section. 3 Operating payment details → Edit → bank details + e-Transfer billing@maple.example → Save → "Saved". 4 Tax → Registered for tax on, number empty → Save → "Add your tax number to register for tax." → type 123456789 RT0001 (Sample) → Saved. 5 Card payments → Connect with Stripe → "Confirm it's you" (step-up) → fake onboarding → "Pending" → recorded `account.updated` → "Active". 6 Next step: Money → Invoices → the waiting invoice no longer shows "Email waits" (`concept-invoices.md` W-I1 step 8).
