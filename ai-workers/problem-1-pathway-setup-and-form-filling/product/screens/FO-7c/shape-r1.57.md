# R1.57 shape: card payment of invoiced fees into the firm's operating account (P-526)

Runtime lane, 25 Nov IST, from main 63f5cc913. **Draft until the tech lead approves.** Specification: `design/briefs/FO-7c.md` (parts 2-3) and `design/briefs/track-b/FO-7c-1.md` (part 1, merged #2938). Concept for the client's pages: `screens/fo-7s-money/concept-pay-page.md` (FO-7s2 part 2) and `concept-settings.md` (FO-7s2 part 1).

**R1.57 done when (CAPABILITIES):** "A client pays by card through the firm's own account in test mode; the money is booked to operating, never trust (P-567); a failed card leaves the invoice unpaid with the reason."

## What is on main
* FO-7c part 1 (#2938): `card/rail.ts` (`CardRail`, 8 calls; part 1 uses 4), `card/stripe-rail.ts`, `card/account.ts` (onboarding, status, `POST /api/hooks/stripe-connect` for account events), `money_firm_of_stripe_account`, the break alert.
* FO-7ts: `pay_link_token_hash` on `money_invoice` (hash only, unique per firm). FO-7b part 1b: `InvoiceMoney.record` (staff path only), receipts, `payment.succeeded`.
* Not on main: PF-27 `firmAllows` (only `platform_firm.status = SECURITY_LOCK` exists); `payment.failed`; any web page under `client-money/pay/`; `tests/journeys/j_57.ts`.

## Parts (series; one PR each, under 800 changed lines with tests)
| # | Part | What a person can then do | Touches | Tests (pass and fail each) | Size |
|---|---|---|---|---|---|
| 0 | **J-57 journey first** (P-606) | nothing new: the walk exists and fails only on the parts not merged, each failing label naming its part | `tests/journeys/j_57.ts`, `product/screens/J-57/` | j_57 W1-W9 below | ~250 |
| 1 | **FO-7c part 2a: the pay link and the public pay answer** | staff make a no-login pay link for an issued invoice with a balance; the client opens it and gets the full amount due and either a card button or the firm's offline details (AG-6-49) | `card/pay-link.ts`, `card/public-pay.ts`, `card/routes.ts`, `card/stripe-rail.ts` (hosted Checkout on the connected account, direct charge), `features/client-money-card.ts`, `MODULE.rows/FO-7c-2a.md`, `tests/check_fo7c_card_payments.ts`, `tests/fixtures/fo7c-stripe/` | DW4 (pay-link walls), DW5, DW8, DW11 | ~650 |
| 2 | **FO-7c part 2b: paid by Stripe's event, a failed card with its reason, the poll** | a paid card is one `money_payment` `CARD` into `OPERATING` with its receipt, by the event and never by the redirect; a declined card leaves the invoice unpaid and the reason shows; a missed event is picked up by the hourly poll | `card/payments.ts`, `card/poll.ts`, `card/account.ts` (route the payment events), `card/stripe-rail.ts` (read intent, list), `ports/client-money.ts` (`payment.failed`, one line), one additive entry on `invoices/money.ts` (Q2), tests and recorded events | DW3 (payment events), DW4 (metadata firm ≠ account firm), DW6, DW7, DW10 | ~700 |
| 3 | **FO-7s2 part 1: Getting paid › Card payments** (screens) | the Owner connects with Stripe (step-up) and sees the status words and the break alert; other roles see status only | `web/src/modules/client-money/settings/card-payments/*`, `tests/check_fo7s2_card_browser.ts` | concept-settings.md's states | ~450 |
| 4 | **FO-7s2 part 2: the client's pay page and return page; "Copy pay link"** (screens) | the client pays from a phone; the return page says "being confirmed" until the event; account down shows the offline details; staff copy the link from the invoice | `web/src/modules/client-money/pay/*`, `…/invoices/pay-link.tsx`, browser test | concept-pay-page.md's states | ~600 |
| 5 | **Test-mode proof** (`Completes: R1.57`) | j_57 exits 0 on main against Stripe test mode | the walk's Stripe wiring (Q5), `qa/built/R1.57.md` | j_57 on walks.yml | ~100 |

**Not in R1.57:** FO-7c part 3 (card refunds, DW9) is not in R1.57's done-when; it follows this chain on the same lane unless the tech lead says otherwise. R1.61's join (J-61) and R1.56's "R1.57's first step" (j_56 W9) use parts 1 and 4.

## Journey j_57 (`tests/journeys/j_57.ts`, by screens at 1440 px; Sample firm, US$0, Stripe test mode only)
* W1 the Owner opens Getting paid › Card payments: the firm's test connected account reads **Active**; a non-Owner sees status and no Connect button (403 on the API).
* W2 an issued invoice for services given (R1.56's steps, seeded) offers "Copy pay link"; a deposit invoice and a trust request offer none.
* W3 the client opens the link with no login: firm, invoice number, lines, **Amount due**, one "Pay … by card" button, no amount field.
* W4 Pay → Stripe's hosted page (test mode) on the firm's account; test card 4242 4242 4242 4242 pays.
* W5 the return page says "being confirmed"; once the event (or the poll) lands, the invoice is Paid; one `money_payment` with method `CARD`, `received_into = OPERATING`; no `money_trust_entry`; one receipt.
* W6 a second invoice, test card 4000 0000 0000 0002 (declined): the invoice stays unpaid, its balance unchanged, and the pay page and the invoice show the reason ("Your card was declined.").
* W7 account down (the Sample second firm, not connected): the pay page shows the operating details block and no card button.
* W8 walls: firm B's staff asking for firm A's pay link → 404; an unknown or settled link → the same not-found page.
* W9 ends at R1.58's first step: the payment appears in Money › Payments as operating.

## Questions for the tech lead (each with a recommendation)
1. **PF-27 `firmAllows` is not on main** (part 2's "ready when"). **Recommend:** part 2a refuses a pay link and a session for a firm whose `platform_firm.status` is `SECURITY_LOCK` with PF-27's neutral words, through one local function `payAllowed(firmId)` in `card/`, replaced by `firmAllows(firmId, 'pay')` in PF-27's own PR. Otherwise R1.57 waits on PF-27.
2. **FO-7b's recorder is staff-only** (`InvoiceMoney.record(ctx: StaffContext, …)`, C5 scope, its own transaction), and the brief says "called, not edited; stop and ask". A card payment has no staff and must run in the event's transaction. **Recommend:** one additive method on `invoices/money.ts`, `recordCard(tx, firmId, invoiceId, { intentId, amountMinor, currency })`, sharing `record`'s body (lock order, receipt figures, audit, `payment.succeeded`), actor `system:stripe-connect`, `OPERATING` only. The release Lead reads it (P-423).
3. **Where the failed card's reason lives** (R1.57's "with the reason"): no column holds it. **Recommend, no migration:** `payment.failed` event plus one audit line per failed intent (Stripe's `last_payment_error.message`, a decline code, never card data); the pay answer and the invoice read the latest one. If you want a column, part 2b is a migration PR instead.
4. **FO-7s2 parts 1 and 2 are screens.** **Recommend:** the screens lane builds them after part 2a merges (the API they call); I keep parts 0-2 and 5. Say if you want me to take them too.
5. **"j_57 exits 0 on main against Stripe test mode" on walks.yml:** GitHub's runners have no Stripe key and no public address for Stripe's events. **Recommend:** (a) a repository secret `STRIPE_TEST_SECRET_KEY` (the test key from `xr/staging/PLATFORM_STRIPE_SECRET_KEY`), passed only to j_57's walk job, refused unless it starts `sk_test_`/`rk_test_`; (b) one test connected account onboarded once in the "New business" sandbox (the Lead opens the Stripe page, P-824), its `acct_…` id as a repository variable; (c) on the runner the payment is recorded by the poll (no webhook needed), and the webhook path is proven once on staging with the connect webhook secret (the question for that secret comes with part 2b). CI's suites stay on the fake rail and recorded events, no network (brief rule).
6. **Branch per part:** this session's branch is `claude/eloquent-goodall-y7jjmw` (part 0 + 2a here); later parts need their own branches `claude/runtime-fo7c-<part>`. OK?

Duplicate check: searched BACKLOG*.md (FO-7c, FO-7s2, J-61, PF-27), open PRs (all 28 open: "FO-7c", "Stripe", "pay link", "R1.57"; #3177 is J-61's challenge and says part 2 is not built), main's `api/src` (`client-money/card/` part 1 only; no `pay/` web module; no `j_57.ts`) and `qa/BUGS.md`; none.
