# FO-7s0 · The client's pay page: invoice summary, card payment, the plan schedule, autopay consent and Stop, the account-down state (group (d))

Index and shared rules: `concept.md`. Board: `design/pay-page.html` (375 px first, then 1440). Builds: FO-7s2 part 2 (pay page, return page, account down), FO-7s4p (plan schedule, consent, Stop). Card only on invoices for services given or disbursements made, only into operating, **never on a trust request or a deposit invoice** (P-567 (3)); plans and autopay on earned fees only, consent recorded (P-578, a recorded departure from AG-6-14 r2 and AG-6-49 r1(c)). The consent wording is **Unconfirmed: no counsel**; every figure, limit and delay is **Sample**.

## 1. Job, persona, journey
* **Job:** the client opens the link in the invoice email on a phone, sees what they owe and to whom, and pays the full amount due by card on the firm's own Stripe account — or, when card is not offered, sees exactly how to pay offline (AG-6-14 r1-r6, AG-6-49).
* **Persona:** the client (no login; the link's token shows one invoice only). Plain words, grade 6-8, sentences under 20 words (BIC-20); at most five inputs per page (BIC-19: here zero or one, the consent box).
* **Journey:** invoice email → pay page → Stripe's hosted page → return page "being confirmed" → receipt email; the staff side sees Paid only after the webhook.

## 2. Layout (`/money/pay/:token`, its own frame, no Studio shell; the firm's brand from PF-13 or a plain fallback: firm name in text)
* Header: firm name (logo when PF-13 gives one). Card: "Invoice INV-0003 from Maple Immigration (Sample)" · "Issued 16 Nov · Due 30 Nov" · lines summary (description and amount per line, tax line) · **Amount due: CAD 2,655.50**. One primary button: **Pay CAD 2,655.50 by card**. Under it, muted: "You'll pay on Stripe's secure page. Card details never reach Maple Immigration or ExpatReady." [Download invoice PDF].
* **No amount field, no saved-card choice, no part payment** (AG-6-14 r2; FO-7s2 DW3). A part payment is only a plan's instalment (§4).
* The GET creates nothing (link previews and scanners fetch it, FO-7c); the button calls `POST …/session`.
* 375 px is first-class: one column, 44 × 44 px targets, the button full width; 1440 centres a 560 px card.

## 3. States (each drawn on the board)
| State | What the client sees |
|---|---|
| Card offered (account Active, charges enabled) | §2 |
| **Account down** (not Active, or charges disabled; AG-6-49 r1(a)) | "Online payment is temporarily unavailable." then the **operating details block** as the firm wrote it, and the Interac line "Interac message: INV-0003 [Copy]" when the block's e-Transfer email is filled (AG-6-71 r5). **No card form, no card button** (r1; FO-7s2 DW5). |
| Account down, no details (r1(b)) | "Please contact Maple Immigration, 416-555-0100 (Sample), billing@maple.example to arrange payment." |
| Payments switched off for the firm (PF-27 `firmAllows` false) | PF-27's neutral words, no word "lock" |
| Paid | "This invoice is paid. Thank you." + receipt PDF link |
| Bad, ended, unknown or another firm's token | one and the same: "This payment link is no longer valid. Please contact Maple Immigration for a new one." (FO-7c: one not-found) |
| Return page (`/money/pay/:token/done`) | "Payment received — your receipt is on its way." and "INV-0003 is being confirmed." until the webhook; a reload calls only the GET and creates no second payment (AG-6-14 r5; FO-7s2 DW4) |
| Loading | skeleton card, `sr-only` "Loading your invoice" |
| Nothing due yet on a plan | "Your next payment of CAD 400.00 is due 15 Jan. There is nothing to pay today." and no button (FO-7p) |
| A deposit invoice or a trust request | never reaches this page: no pay link exists (FO-7c refuses it; FO-7s2 DW6) |

## 4. Payment plan schedule and autopay (FO-7s4p; only for an invoice whose plan exists)
* Schedule table: # · Due date · Amount · State (**Paid · Due · Overdue · Upcoming**, FO-7p's derivation, shape + text). Line above: "Your plan: 3 payments of CAD 400.00 for INV-0011 (CAD 1,200.00)". The button pays **the amount due today**: "Pay CAD 400.00 by card (payment 2 of 3)"; a future instalment is never offered early.
* **Autopay consent box**, unticked by default, beside its wording (draft below), with "Wording version 1" in muted text; ticking it means the hosted payment saves the card for this plan only. Unticked → no card is saved (FO-7s4 DW7: the Stripe fake receives no set-up call).
* With autopay on: "Autopay is on: we'll charge your saved card on each due date." [Stop autopay] (the client by token; staff by `POST plans/:id/autopay/stop`). After Stop: "Autopay is off. Pay each instalment from the link we email you."
* **Draft wording for FO-7p's text sources** (`samples/fo7p-autopay-consent-v1.txt`, `samples/fo7p-plan-wording.txt`; Sample, **Unconfirmed: no counsel**): consent — "I allow Maple Immigration to charge this card for the remaining payments of this plan on their due dates: CAD 400.00 on 15 Jan and CAD 400.00 on 15 Feb. I can stop this at any time on this page or by asking Maple Immigration." Plan line — "Pay INV-0011 in 3 payments. Each payment link is emailed on its due date."
* Staff side of the plan (invoice detail → Payment plan, right panel): instalment rows (date, amount), "Difference: CAD 30.00 left to place" until the sum is exact, Save disabled until then, at most 12 (Sample, the 13th row cannot be added); not offered on a deposit invoice or trust request, with the reason in words: "Payment plans are only for invoices for work already done." Refusal "Instalments add up to CAD 1,100.00; the invoice has CAD 1,130.00 open" (FO-7p, Sample).

## 5. Business rules (pass and fail)
* **BR-D1 full amount only** (AG-6-14 r2): pass, no amount input exists; fail, an input lets the client change it. [FO-7s2 DW3]
* **BR-D2 paid by the webhook** (r5): pass, the return page says "being confirmed" and the invoice stays Open until the webhook; fail, the redirect marks Paid. [DW4]
* **BR-D3 no card when down** (AG-6-49 r1): pass, Restricted → offline details, no card button; fail, a card form renders. [DW5]
* **BR-D4 never on trust** (P-567 (3)): pass, a deposit invoice and a trust request have no pay link; fail, a card form on a trust request. [DW6; FO-7s2 fail line]
* **BR-D5 one invoice per token** (FO-7c): pass, the token shows INV-0003 only; fail, an altered token shows another invoice or a different error. [DW7]
* **BR-D6 consent before saving a card** (P-578): pass, unticked → no set-up call; fail, a card saved without the box. [FO-7s4 DW7]
* **BR-D7 instalments sum exactly** (FO-7p): pass, 3 × 400.00 = 1,200.00 saves; fail, 1,100.00 on 1,130.00 open disables Save and shows the difference. [FO-7s4 DW6]

## 6. Contract
| Element | Route | Key | Row | Refusal shown |
|---|---|---|---|---|
| Pay page read | `GET /api/public/pay/:token` (no login; summary, amount due, card offered or offline details or contact line) | none (token) | FO-7c | one not-found for every bad token |
| Pay button | `POST /api/public/pay/:token/session` (full amount due, or the plan's due part) | none (token) | FO-7c, FO-7p | account down → offline details, no card |
| Return page | the same GET; never a write | none | FO-7c | — |
| Invoice PDF on the pay page | **FO-7q addition (G15):** a token-scoped PDF read on the public door | none (token) | FO-7q | — |
| Plan schedule on the pay page | the pay GET's plan part (FO-7p "the instalment's due part … when a plan is active") | none (token) | FO-7p | — |
| Autopay consent, Stop (client) | FO-7p part 3 (consent with the hosted payment; Stop by token — path not in FO-7p's brief: **question Q-C10**) | none (token) | FO-7p | — |
| Plan create, read, cancel, staff Stop | `POST /api/front-office/money/invoices/:id/plan`, `GET …/invoices/:id/plan`, `POST …/plans/:id/cancel`, `POST …/plans/:id/autopay/stop` | `agent/invoice:issue` | FO-7p | 400 "Instalments add up to …"; deposit invoice refused |
| Firm brand | PF-13 (optional; plain fallback) | — | PF-13 | — |

## 7. Walks (375 px, then 1440 px)
**W-D1 pay by card.** 1 Open the INV-0003 email link → pay page, "Amount due: CAD 2,655.50", one button. 2 Pay CAD 2,655.50 by card → Stripe's test page (FO-7c's fake). 3 Pay → return page "Payment received — your receipt is on its way.", "INV-0003 is being confirmed." 4 Reload → the same page, still one payment. 5 (Staff) the recorded webhook → INV-0003 Paid in the invoice list. 6 Next step: the receipt email (FO-7c, outside the screens).
**W-D2 account down.** 1 Set the fake account to Restricted with charges disabled. 2 Open the link → "Online payment is temporarily unavailable." + the operating details + "Interac message: INV-0003 [Copy]"; no card button. 3 Empty the operating block → the contact line. 4 Next step: staff record the e-Transfer (`concept-payments.md` W-P1 step 3).
**W-D3 plan with autopay.** 1 Staff: INV-0011 (CAD 1,200.00) → Payment plan → three rows of 400.00 → Save. 2 Client opens the link → schedule, "Pay CAD 400.00 by card (payment 1 of 3)", consent box unticked. 3 Tick consent → pay → schedule shows payment 1 Paid, "Autopay is on". 4 Stop autopay → "Autopay is off." 5 Next step: on 15 Jan the job emails payment 2's link (FO-7p).
