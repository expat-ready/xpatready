# FO-7s0 — the client's public pay page, plan schedule and autopay (group d)

Part of the money concept; index in `concept.md`. Figures **Sample**; the consent wording and card-on-file readings **Unconfirmed: no counsel**. Board: `design/pay-page.html`. Builds: FO-7s2 part 2 (page, return, account down), FO-7s4 part 2 = FO-7s4p (plan schedule, autopay).

**Who and where:** the client, on a phone first (375 px is first-class), no login, from the link in the invoice email. Web paths `/money/pay/:token` and `/money/pay/:token/done` (FO-7s2; Lead B confirms the address FO-7c's link points to, FO-7s2 gap 2). Own plain frame, like the booking pages: the firm's name and logo from PF-13, else the firm's name in text; no ExpatReady staff menu. One page, one primary button (BIC-11, BIC-19: at most five inputs — here none).

## States (FO-7c `GET /api/public/pay/:token`, creates nothing)
| State | What the client sees |
|---|---|
| **Account Active**, no plan | "Maple Immigration · Invoice INV-0003 · Due 30 Nov 2026", the lines summary, **Amount due CAD 2,655.50**, one button **Pay CAD 2,655.50 by card** → `POST …/session` → Stripe's hosted page. **No amount field, no part payment, no saved card** (AG-6-14 r2, §13). PDF link. |
| **Account down** (Restricted with charges off, Disconnected, Not connected) | **No card form and no card button.** "Online payment is temporarily unavailable" and the firm's operating details block with "Interac message: INV-0003 [Copy]" when an e-Transfer email is set (AG-6-49 r1a, AG-6-71 r5). No details filled → "Please contact Maple Immigration, +1 416 555 0100, billing@maple.example to arrange payment" (r1b). |
| **Paid / being confirmed** | Return page `/done`: "Payment received — your receipt is on its way"; the invoice reads "being confirmed" until the webhook makes it Paid (AG-6-17: paid by the webhook, not the redirect); never a second session. |
| **Bad, used or ended link** | "This payment link is no longer valid. Please contact Maple Immigration for a new one." (one not-found for unknown, voided and settled; FO-7c) |
| **Firm locked** (PF-27) | PF-27's neutral words; never the word "lock". |
| **Loading** | skeleton of the summary card; the button appears only once the state is known (never a card button that then vanishes). |

**Never on this page:** a trust request, a deposit invoice, or any trust word (card never into trust, P-567 (3)); a pay link is refused for them (FO-7c, trust request id → 404). The page shows one invoice only: the token never reveals another invoice of the same client.

## Plan schedule and autopay (FO-7p; FO-7s4p)
Shown only when the invoice has an active plan (P-578: on an issued invoice for services given; never a deposit, a trust request or trust money).
* **Schedule** under the summary: each instalment's date, amount and status in words **Paid · Due · Overdue · Upcoming** (FO-7p, derived); "Next payment: CAD 400.00 on 1 Dec 2026".
* **The amount offered** = what is due today: the instalments due on or before today less what is paid, never more than the balance (FO-7p ruling 8). This is the **only** part payment the page ever offers — FO-7p's recorded departure from AG-6-14 r2. Nothing due yet → "Nothing is due today. Your next payment is CAD 400.00 on 1 Dec 2026." and **no button**.
* **Autopay consent box**, **unticked by default**, above the pay button: the versioned text from `samples/fo7p-autopay-consent-v1.txt` shown in full with its version ("Wording v1"). Draft for FO-7p's text source (Sample, **Unconfirmed: no counsel**): "Save my card and pay each instalment on its date. Maple Immigration will charge this card for the amounts and dates above, up to CAD 1,200.00 in total. You can stop this at any time on this page or by asking Maple Immigration." Ticked → the card is saved on Stripe's page (FO-7p consent row); unticked → nothing is saved.
* **Stop autopay** (secondary, visible while autopay is on) → confirm "Stop paying instalments automatically? You will get a pay link for each instalment instead." → "Autopay stopped on 16 Nov 2026". Staff see the same Stop on the invoice detail (`agent/invoice:issue`).
* **Account down** with a plan: no charge, no box, the offline details (FO-7p DW11).

**Staff side of a plan** (invoice detail, FO-7s4p, `agent/invoice:issue`): **Payment plan…** panel with instalment rows (date, amount), a running line "Instalments add up to CAD 1,100.00; the invoice has CAD 1,130.00 open" and **Save** disabled until exact, at most 12 rows (Sample), no past date; on a deposit invoice or trust request the action is absent and the detail says "Payment plans are for invoices for work already done" (P-578). Cancel plan… needs a reason; paid instalments stay.

## Walk — replay at 375 px then 1440 px
1. Open INV-0003's link → summary, **Pay CAD 2,655.50 by card** (no amount field) → Stripe test page (FO-7c fake) → return page "Payment received — your receipt is on its way"; invoice "being confirmed" → after the fake webhook, Paid.
2. Staff disconnect the account (fake) → reopen the link → "Online payment is temporarily unavailable" + operating details, no card button.
3. Staff: INV-0011 CAD 1,200.00 → **Payment plan…** → 3 × CAD 400.00 → Save. Client opens the link → schedule, "Amount due today CAD 400.00", consent box unticked → tick → pay → "Paid" on the first row.
4. **Stop autopay** → "Autopay stopped on …". Next capability's first step: Record payment for an offline instalment (`concept-payments.md` walk step 1).
