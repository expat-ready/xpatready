# R1.91 part 1: break report, round 2 (PR #3636, head 805a01724d0fdf39cc72964ade9e3bc9a9f2bd88)

Breaker, money. Diff checked: `git diff e134f6ecd 805a01724` only. No network to Stripe.
- Round 1 probes: `scratchpad/break1.mts`, re-run.
- Round 2 probes: `scratchpad/break2.mts <probe>`. They run on the PR's own recorded fake, copied from `check_pf16_stripe_setup.ts:30-104`. The fake keeps archived lookup keys, replays an idempotency key, refuses the same key with other parameters, and pages with `has_more`. One probe uses a real `fetch` against a local server that never answers.
- The PR's check: 60 passed, 0 failed; the live line was SKIPPED by name.

## Round 1 breaks: re-run

| # | Probe result at 805a01724 | Status |
|---|---|---|
| M1 `stop()` re-arms | 1 list at stop, 1 list 1.5 s later; `timer` null; `start()` after stop: no list (`stripe-relay.ts:93`, `:101-108`) | Fixed |
| M2 hanging webhook | (a) a fetch that honours the abort: the pass ends at about 2 × the limit, error "no answer within 300 ms"; (c) real `fetch` on a server that never answers: 808 ms, both attempts failed and the relay went on; (b) `waitFor(1000)` threw at 1003 ms, `stop(800)` returned at 804 ms (`:73-78`, `:105`, `:119`, `:126-130`) | Fixed |
| M3 archived price | within 24 h and after: conflict "archived (…)", nothing written (`stripe-setup.ts:55`, `:86`) | Fixed |
| m1 second product | year-only plan: no product made, month price on `prod_orig` (`:100`) | Fixed |
| m2 orphan product | product found by `metadata.xr_plan` and reused (`:101-102`) | Fixed (see n1) |
| m3 lax conflict check | every-3-months, metered, inclusive or unspecified tax, another plan's or no `xr_plan`, one-time and null amount: all conflicts; an identical price: none (`:53-67`) | Fixed |
| m4 portal drift | plan switching on → conflict, platform_plan not written; pagination via `for await` (`stripe.ts:25`); an inactive replay → "deactivated" | Fixed (see n2, n3) |
| m5 retry forever | a 503 every time: 5 POSTs in 50 polls, then `gaveUp`; failures capped at 100 (300 events gave 100) | Fixed (see n6) |
| m6 relay arguments | `--since` before the URL, a missing or non-numeric value, two URLs, `ftp://`, `--since=` all refused (`stripe-relay.ts:140-154`) | Fixed |
| m7 mistyped flag | `--dryrun`, `-n`, `--dry-run=1`, `""`, `--` refused; `--dry-run` twice is fine (`stripe-setup.ts:147-150`) | Fixed |
| m8 database or key | `PLATFORM_ENVIRONMENT=production` refused (`:159`); key source printed (`:161`); a period the table no longer prices is nulled (`:126-129`) | Fixed |
| m9 event types | comment corrected (`stripe-relay.ts:18-19`); `only` keeps a run to its own events (probe: only `evt_mine` sent) | Fixed |
| m10 tests | lines added for M1-M3, m1, m2, m4-m8 (`check_pf16_stripe_setup.ts`) | Fixed |

## New breaks in the round 2 code

**n1 Minor: an archived product made under 24 h ago gets the prices.** (`stripe-setup.ts:102`, `:108`, `:115`)
Repro (`break2.mts m2`): make `xr-product-team-v1`, archive it, then run.
Expected: a conflict, or a new active product.
Actual: the product list asks for active products only, so the archived product is missed. `products.create` replays the archived product under its idempotency key. Both prices are made on `prod_rec0001` (`active: false`) and reported as made. `priceProblems` does not read the product. Unconfirmed: whether Stripe refuses a price, or Checkout, on an archived product. After 24 h a new product is made, which is correct.

**n2 Minor: `portalProblems` does not check `customer_update`.** (`stripe-setup.ts:70-77`)
`PORTAL_FEATURES` sets it off (`ports/billing.ts:132`), and the check asserts it at creation.
Repro (`m4`): a tagged configuration with `customer_update` on (`address`, `tax_id`) gives `[]`. In the portal the customer's address sets Stripe Tax's GST/HST/QST location, so drift there changes the tax charged without a conflict.

**n3 Minor: the dry run never reads the portal configuration.** (`stripe-setup.ts:93-95`)
Repro (`m4`): a drifted configuration under a dry run gives `portal: {id:null, problems:[]}`. The read-only run, which an operator uses to check an account, cannot show portal drift. Reading a configuration makes nothing.

**n4 Minor: a failed write leaves platform_plan partly written, and the CLI says it was not written.** (`stripe-setup.ts:142`, `:177`)
Repro (`cols`): the second of three updates throws "Connection terminated unexpectedly". `firm` is already updated. The CLI line says "stripe set-up: failed — Connection terminated unexpectedly. platform_plan not written; …". The updates are not in one transaction. A re-run repairs the table, but the line states something false.

**n5 Minor: `stop()`'s "one last pass" can be an old pass.** (`stripe-relay.ts:105`, `:54`)
Repro (`M1`, second half): `poll()` starts listing, an event is made, then `stop()` is called. `stop()` joins the in-flight pass, which listed before the event, so only `evt_1` is delivered and `evt_late` is never sent. The doc comment `:99-100` promises "an event made just before the stop is still delivered".

**n6 Minor: give-up is fast, and `waitFor` does not see it.** (`stripe-relay.ts:81`, `:112-121`)
With the defaults (5 attempts, 2 s apart), an event is given up after about 10 s of 5xx answers or time-outs, for example while the copy restarts. Stripe keeps retrying for 3 days. `waitFor` does not read `gaveUp`.
Repro (`m5`): it waits the full 1500 ms, then says "no invoice.paid event delivered", although the event exists and was given up. A journey then fails late, with a message that does not name the cause.

**n7 Minor: the live line makes the account's canonical prices from the test's own `PLANS`.** (`check_pf16_stripe_setup.ts:327`)
That line now runs `setUpStripe` for real (it makes objects, as its header `:8-9` says) from the hard-coded `PLANS`, not from platform_plan. Whichever runs first, CI or the script, fixes the price under each `-v1` lookup key. Today `PLANS` equals the QA-741 migration. If the Sample cents change in a migration without changing `PLANS`, a CI run can lock the old amount, and the script then reports a conflict.

## What held
- `cliArgs` and `relayArgs`: every bad form was refused (table above). A leading-zero `--since` is read as a number. `--since 99999999999` is accepted (a far future, harmless).
- `priceProblems`: every charge-relevant field (m3). A made price is read back, and another key or other terms stop the run (`:115-116`). The idempotency key now carries the amount (`:114`).
- Product reuse picks only `metadata.xr_plan`, never a name. A product made for another plan is never taken.
- `priceColumns`: each period's id, and null for an unpriced period (`cols`: team month null, year kept).
- The plain error line: the last line of a Prisma or Stripe message; no stack. Stripe masks keys in its own messages.
- Relay states: stopped is final. Starting three times runs one loop. A throwing `only` rejects that pass, and `start()` logs it and goes on. The POST timer is cleared on every path.
- `within` never keeps the process alive.
- With a custom `fetchFn` that ignores the abort signal, the pass stays stuck, but `waitFor` and `stop` stay bounded. Real `fetch` honours the abort.

Note for the coordinator: during this round the shared tree showed an edit that was not mine, an uncommitted deletion of the `tax_behavior` line in `stripe-setup.ts:64` (most likely another agent's mutation run). That edit was later undone and `stripe-relay.ts` was then edited the same way. I did not revert either. My m3 probe ran while the line was still present (the tax conflicts were reported). The verdict is on the committed head.

Verdict: Approve 805a01724d0fdf39cc72964ade9e3bc9a9f2bd88
