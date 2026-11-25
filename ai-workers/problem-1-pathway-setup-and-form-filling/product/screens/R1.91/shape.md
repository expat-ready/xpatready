# R1.91 — shape (P-526), for the tech lead's approval

Item: R1.91 "Plans, change, cancel, invoices, card update, yearly plans, refunds, billing emails" (Platform). Runtime lane, cloud builder, 25 Nov IST. Written from `origin/main` 63f5cc913.

**Done when (qa/CAPABILITIES R1.91):** on our own screens an Owner changes plan (proration shown first), goes yearly, updates the card (test mode), cancels, sees invoices; each change sends its email; a non-Owner refused. Plus (the brief): `walks.yml` journey j_91 exits 0 on main against Stripe test mode.

Duplicate check: searched BACKLOG*.md (PF-5, PF-5s, PF-16, R1.91), the open PRs (all 32 open, records PRs included: none names R1.91, PF-5, PF-5s, PF-16, FO-7c or R1.57), `main`'s code (`change-plan`, `PlanChange`, `billing/portal`, `stripe-setup`, `relay`, `card_expir`, `plan_changed` mail) and qa/BUGS.md; none.

## 1. What is already on main (no rebuild)

| Part of the Done when | On main | Missing |
|---|---|---|
| Change plan, proration shown first, yearly | API: PF-16 part 1a `POST /api/platform/billing/change-plan/preview`, `change-plan`, `withdraw` (Owner only; trial, raise, month → year at once; lower and year → month booked at renewal after `checkDowngrade`); `PlanChangePort` + its Stripe adapter | **the screen** (Plan and billing has no Change plan); Stripe test-mode prices (monthly and yearly) the plans point at |
| Card update | `POST billing/checkout` (setup-mode Checkout), `checkout.session.completed` → `useCardAndResume`; "Update card" on Plan and billing (PF-5s S2) | proof against Stripe test mode |
| Cancel | `POST billing/portal` (Customer Portal: cancel at period end on, plan switching off: `PORTAL_FEATURES`); `customer.subscription.updated` read back | the portal configuration created in the test account; the cancel shown back on our page after the event; proof in test mode |
| Invoices | `GET billing/invoices` + the Invoices table (hosted links) | proof in test mode |
| Each change sends its email | nothing (PF-16 part 2) | **billing emails**: plan changed, lower plan booked, yearly → monthly booked, card updated, cancellation confirmed (and withdrawn), card expiring 30 days ahead; SA-4-53's two recipient sets; once each |
| Non-Owner refused | API 403 (PF-16 part 1a: `agent/subscription:upgrade`/`:downgrade`; portal `:cancel` Owner only) | the screen hides the controls, the API refusal walked |
| j_91 on Stripe test mode | walks run on the fake BillingPort, no Stripe key, no webhook path | the key in the walk job, a webhook path on a GitHub runner, the journey |

## 2. Parts (one PR each, each under 800 lines)

**R1.91-1 (runtime, money) — Stripe test-mode set-up and the event relay.** ~350 lines.
* `api/src/platform/billing/stripe-setup.ts` (the set-up script PF-16 names): idempotent by `lookup_key`; creates the Sample plans' products and monthly and yearly CAD prices, writes their ids to `platform_plan.stripe_monthly_price_id` / `stripe_yearly_price_id` of the copy it runs on; creates (or finds by metadata) the Customer Portal configuration from `PORTAL_FEATURES` (card, invoices, cancel at period end; plan switching off; no refund on cancel, SA-4-49); prints Smart Retries (within 14 days) as a dashboard checklist line (no API exists; said in the PR). Refuses a live key (`settings.ts` already refuses `sk_live_` outside production; the script refuses it everywhere).
* `tests/journeys/stripe-relay.ts`: a webhook path for a copy Stripe cannot reach (a GitHub runner, a cloud lane): polls `GET /v1/events` (created ≥ the walk's start, types `customer.subscription.*`, `invoice.*`, `checkout.session.completed`), signs each event's own JSON with the copy's webhook secret (a random `whsec_` made per run) and POSTs it to `/api/hooks/stripe`. The events and their data are Stripe's; only the transport is ours. **Shared with R1.57's builder** (Connect events with the connect secret: the same file, a `--connect` option they add).
* Contract test: `ports/contracts/billing-port.contract.ts` and the plan-change contract run against Stripe test mode when `PLATFORM_STRIPE_SECRET_KEY` is a test key (skipped by name, never silently, otherwise), the fake always.
* Touch: the two new files, `tests/check_pf16_stripe_setup.ts`, the contract files' runner line. No migration.

**R1.91-2 (screens, money) — Change plan on Plan and billing.** ~550 lines.
* A Change plan panel on our page (PF-16: off the portal): the public plans × month / year (SA-4-28: Active Public plans), the preview first (POST preview: amount now, proration, when it applies, "no refund" for a lower move, SA-4-49), Confirm, the result line (applied now / booked for <date> with Withdraw), the conflict list from `checkDowngrade` in words (SA-3-58). Owner only: Admin and others see the plan, no Change plan (the API 403 stays the guard). Hold: the panel says "pay first" (409 `BILLING_NOT_ACTIVE`).
* The cancel shown back: "Cancels on <date>" from `cancelAtPeriodEnd` (already in `GET billing`).
* **Concept first:** a concept addendum `screens/PF-5s/concept-change-plan.md` (P-223 (4): an independent challenger, then the tech lead's approval) as the PR's first commit; no build before the approval.
* Touch: new `web/src/modules/platform/saas/plan-change-*.tsx`, `billing-contract.ts` (additive), `billing-page.tsx` (mount the panel), `tests/check_pf16_plan_change_browser.ts`.

**R1.91-3 (runtime, money) — billing emails (PF-16 part 2).** ~600 lines.
* Fixed ExpatReady templates in code (English, versioned): plan changed, lower plan booked, yearly → monthly booked (SA-4-91), booking withdrawn, card updated, cancellation confirmed, cancellation withdrawn, card expiring (SA-4-55).
* Recipients (SA-4-53): documents to the billing email; every other notice to the billing email, the Owner and the Admins. Sent through `MailPort` once per event (one key per recipient, as exit-notices does).
* Triggers: `EVENT.PLAN_CHANGED` and the booking (PF-16 part 1a); the webhook's `customer.subscription.updated` (cancel at period end false → true and back); `checkout.session.completed` in setup mode (card updated); a PF-14 job reading the card's expiry, 30 days ahead, once per card.
* Touch: new `api/src/platform/billing/emails/*.ts`, `api/src/features/platform-billing-rules.ts` (register), one line in `webhook.ts` (emit), `tests/check_pf16_billing_emails.ts`. If over 800 lines: 3a (templates, recipients, event mails) and 3b (the card-expiring job).

**R1.91-4 (runtime) — j_91 on Stripe test mode.** ~350 lines. Carries `Completes: R1.91`.
* `tests/journeys/j_91.ts`: an Owner on a copy with the test key: sign-up → trial → Update card (Stripe's hosted setup Checkout, test card 4242) → Change plan to a higher plan (preview shown, then the prorated invoice in Invoices) → go yearly (fresh year) → a lower move booked, refused first with a conflict → Manage plan and billing → cancel in the hosted portal → "Cancels on <date>" on our page; each step's email in the copy's outbox, once, to the right set; an Admin: no Change plan, the API 403; Stripe objects read back (subscription price and interval, invoice amounts). Fails on the fake by design (no key: stops at step 1 in words).
* `walks.yml` (journey j_91 only): the test key from a GitHub Actions secret, a per-run `whsec_`, the relay started beside the copy. A workflow change: **the tech lead's file** (see Q3).

Order: 1 → 2 and 3 in parallel (different files) → 4. Each part: reviewer (fresh Opus on the exact head) + breaker (money), diff-only re-review, the Lead reads the money diff (P-423), label after Approve.

## 3. Out of scope (said, not dropped)
* **Refunds** (in the item's name, not in its Done when): staff-side (`system/billing:refund`, SA-4-62) on the staff console, which is not built (R1.93). Our side asserts SA-4-49: no refund on cancel or downgrade. Recommendation: refunds move to R1.93's console row.
* "Start my subscription now" and the trial switch screen (PF-16 trial controls): not in R1.91's Done when; the API for the trial switch exists. Recommendation: a follow-up row, not this item.
* Firms charging clients (R1.57, FO-7c): theirs. Shared: one Stripe SDK, the relay (part 1), the setup script's guard; no second adapter for our billing.

## 4. Questions for the tech lead (each with my recommendation)
1. **Approve the shape** (4 parts, order above). Recommendation: yes.
2. **Stripe access for this session:** the session's network refuses `api.stripe.com` (proxy 403), and the session's AWS keys cannot read `xr/staging/PLATFORM_STRIPE_SECRET_KEY` (UnrecognizedClientException). Recommendation: I propose a personal cloud environment with `api.stripe.com`, `checkout.stripe.com`, `billing.stripe.com`, `docs.stripe.com` and ask for the key through the secure credential form (the proxy injects it; the key never enters a file or the chat). The founder approves both prompts.
3. **The key on GitHub's runners:** j_91 needs the test key as an Actions secret (name: `PLATFORM_STRIPE_TEST_SECRET_KEY`, the value of the AWS secret). A browser step: the Lead (P-824). Recommendation: yes; part 4 reads it only in the j_91 walk job, never on a fork's PR.
4. **Webhook secret:** none needed from the Stripe dashboard: the relay signs Stripe's own events with a per-run secret, so no endpoint is registered in the sandbox. Recommendation: yes (no webhook endpoint until a hosted staging needs one).
5. **Branches:** this session may push only to `claude/gracious-newton-qgyuc7`. Part 1 goes there; parts 2-4 need their own branches. Recommendation: allow `claude/runtime-r191-<part>` branches for parts 2-4, or the parts go one after another on this branch after each merge.
