# R1.91 part 1: break report (PR #3636, head e134f6ecdcdd5cc6c5d7bc4f19d295fcc4157cbd)

Breaker, money. Scope: `api/src/platform/billing/stripe-setup.ts`, `ensurePortalConfiguration` in `stripe.ts`, `tests/journeys/stripe-relay.ts`, `tests/check_pf16_stripe_setup.ts`. No screen. No network to Stripe. Every probe ran on a recorded fake (the PR's pattern, which replays an idempotency key's first answer the way Stripe does for 24 h) in a throwaway script outside the repo (`scratchpad/break1.mts <probe>`). The PR's own check: 32 passed, 0 failed, live line SKIPPED by name.

## Breaks

**M1 Major: `stop()` does not stop. The relay keeps polling after `stop()` resolves.** (`stripe-relay.ts:67`, `:73-77`)
Repro (`stoprace`): `start()` with `intervalMs: 200` and a webhook that answers in 300 ms. Call `stop()` 50 ms in, while the first pass is still running.
Expected: no list call after `stop()` resolves.
Actual: 1 `/v1/events` list at stop, 8 more in the next 1.5 s, and `timer` is set again. The cause: `stop()` clears the timer of the tick that already fired. That tick is still awaiting `poll()`, and once the pass ends it runs `this.timer = setTimeout(tick, …)`.
Effect: a journey that calls `stop()` (j_91, R1.57) keeps POSTing to a copy that is shutting down, and the event loop never empties, so the process does not exit by itself. The CLI hides this only because it calls `process.exit(0)` (`:105`).

**M2 Major: a webhook that never answers hangs the relay for good, `waitFor` never times out, and `stop()` never returns.** (`stripe-relay.ts:57`, `:41`, `:80-88`, `:76`)
Repro (`hang`): `fetchFn` returns a promise that never settles. Call `waitFor("customer.subscription.deleted", …, 1000)` and `stop()`.
Expected: `waitFor` throws "no … event delivered within 1000 ms" at about 1 s.
Actual: after 8 s neither has settled. The POST has no timeout. `poll()` hands every caller the same stuck `running` promise. `waitFor` checks its deadline only between polls, so the "fails loudly on time-out" contract (`:79`) is broken. On SIGTERM, `end` awaits `stop()`, which hangs, and the signal handler has replaced the default exit. A walk job then runs until the runner's time-out.

**M3 Major: an archived price under a plan's lookup key is not treated as a conflict. Within 24 h its id is written to platform_plan as "made".** (`stripe-setup.ts:49`, `:72-76`, `:105`)
Repro (`archived`): run 1 makes team month and year. Archive team-month (`active=false`). Run `applyToPlans` again.
Expected: either a conflict ("a price already there under that key …", header `:6-7`) with nothing written, or a new active price.
Actual: the list asks for `active: true` only, so the archived price is "not found". `prices.create` reuses the idempotency key `xr-price-xr-plan-team-month-v1`, and Stripe replays the first answer: the archived price. The script prints `(made)`, reports `conflicts: []`, and writes `stripeMonthlyPrice = <archived id>`. Signup then drops it (`signup.ts:139` keeps only active prices), so the plan shows no monthly price, and plan-change gives `PLAN_NOT_PURCHASABLE`.
After 24 h the same state fails mid-run with Stripe's "lookup key already used" 400. One product has already been made by then, and every re-run fails the same way. That Stripe enforces lookup-key uniqueness across archived prices is unconfirmed against test mode, but the PR's own fake models it that way (`check_pf16_stripe_setup.ts:56`).

**m1 Minor: a plan whose year price exists but whose month price does not gets a second product.** (`stripe-setup.ts:64-71`)
Repro (`halfplan`): seed only `xr-plan-team-year-v1`, on `prod_orig`.
Actual: a new `prod_1` is made for the month price. The year price stays on `prod_orig`, so one plan has two products. The cause: products are filled in from found prices in `want` order, and month comes before year.

**m2 Minor: products are never looked up.** (`stripe-setup.ts:69`)
After a crash between product create and price create, a re-run more than 24 h later (when the idempotency key has expired) makes another product, and the first is orphaned. No `products.search` on `metadata['xr_plan']` exists. Re-runs within 24 h are fine.

**m3 Minor: the conflict check reads amount, currency and interval only.** (`stripe-setup.ts:55`)
Repro (`lax`): a found price with `interval_count: 3`, `usage_type: metered`, `tax_behavior: inclusive`, on another plan's product.
Actual: `conflicts: []`, and its id is accepted. The header promises tax-exclusive prices (`:5`), but a dashboard-made, tax-inclusive price under the key passes silently.

**m4 Minor: the portal configuration is found by tag, never checked.** (`stripe.ts:24-28`)
Repro (`portal`): a tagged configuration with plan switching on and cancel immediately.
Actual: it is returned as `{created:false}` with no warning. Plan switching in the portal would bypass `checkDowngrade` (PF-16: plan changes are made off the portal).
In the same function: a tagged configuration that has been deactivated is skipped (`active: true`), and the constant idempotency key `pf5-portal-v1` replays that inactive configuration within 24 h. The list is not paginated past 100. The find logic itself was already on main; the script now presents it as "set-up".

**m5 Minor: the relay retries an event it can never deliver forever.** (`stripe-relay.ts:53-60`)
Repro (`badforever`): the route answers 400.
Actual: 50 polls make 50 POSTs, and `failures` holds 50 entries. Neither has a cap. Stripe stops after 3 days; the relay never stops and never warns.

**m6 Minor: relay CLI arguments.** (`stripe-relay.ts:100-101`)
- `tsx stripe-relay.ts --since 1764000000 http://…` takes `1764000000` as the webhook URL, so every POST fails.
- `--since` given last, or `--since abc`, gives `NaN`, so Stripe refuses every list (only "poll failed" is logged).
- `--since` is read against the local clock with a 60 s margin, so a skewed runner loses events.

**m7 Minor: unrecognised script arguments are ignored.** (`stripe-setup.ts:110`)
`--dry-run=1`, `--dryrun` or `-n` are silently treated as a full run: it makes Stripe objects and writes platform_plan.

**m8 Minor: the script never checks which database it writes to, or which key it chose.** (`stripe-setup.ts:111`, `:114`)
- With `PLATFORM_ENVIRONMENT=production` and a production `DATABASE_URL`, it writes test-mode price ids into production platform_plan, which would break live checkout.
- `STRIPE_TEST_SECRET_KEY` silently wins over the app's `PLATFORM_STRIPE_SECRET_KEY`. If the two name different test accounts, the copy gets price ids its app cannot see. Neither the account id nor the key's source is printed.
- An id is never cleared when a plan's cents are later set to null or 0, so signup keeps selling Stripe's old price (`signup.ts:141`).

**m9 Minor: the relay sends fewer event types than the comment claims.** (`stripe-relay.ts:17-22`)
The comment says the list is "what our billing webhook handles (webhook.ts reads these prefixes)". But `webhook.ts:87` handles every `customer.subscription.*`, `invoice.*` and `checkout.session.*` event, while the relay sends only 11 types. Not relayed: `invoice.marked_uncollectible`, `invoice.payment_action_required`, `customer.subscription.pending_update_applied/expired`, `trial_will_end`, `checkout.session.expired`. Low effect today, because the route re-reads the current subscription.
Also, each poll re-lists every event in the shared test account since the start, other runs' events included. This is O(n) per 2 s, and each foreign event writes a `billing.no-firm-matched` line.

**m10 Minor (tests): `check_pf16_stripe_setup.ts` has no line for any of M1-M3 or m1.** It has no `stop()` test, no hanging webhook, no archived price and no half-made plan. Its fake never returns `has_more` or an idempotency-parameter mismatch.

## What held
- Key guard (`keyProblem`, `:29-34`). Each was refused or safe: a leading space, `"sk_live_…\n"`, `SK_LIVE_`, `sk_org_live_`, a test key with a trailing space or newline (refused, which is the safe side), and an underscore inside the key. `rk_test_` is accepted. A live key in the CLI exits 2 before any call or database read. The relay refuses a live key, no key, and a non-`whsec_` secret.
- More than 10 plans: 12 plans give lookups of 10 + 10 + 4 keys, and a re-run makes nothing.
- Amounts 0, negative, fractional or null give no price.
- Lookup keys cannot collide, because the code is unique and the interval is the suffix.
- Odd characters in a plan code are not reachable: codes come only from migrations, and no API creates plans.
- A conflict or a dry run writes neither Stripe nor platform_plan, and a crash mid-run writes no platform_plan.
- Overlapping polls share one pass. A 2xx marks an event delivered, and a non-2xx is retried.
- No event is lost: each poll re-lists from a fixed `created >= since`, the library paginates past 100, and the start second is inclusive.
- A wrong signing secret is refused by `readEvent`.
- An event sent twice across relay restarts is de-duplicated by the route's receipt.
- Ordering within one second is arbitrary, but the route re-reads Stripe's current subscription.
- The portal hand-off and the script share one configuration.

Verdict: Changes e134f6ecdcdd5cc6c5d7bc4f19d295fcc4157cbd
