# Review: QA-741 (Major) + QA-742 (Minor), R1.89 public pricing page: PR #2926

Reviewed head `6dc0f3c0da57107d3371a7dbe11fa06fccb33ebc` (branch `claude/compassionate-mayer-n5ro8z`), 22 Nov, by a session that did not build it. Reviewed as a fix to its own row (`qa/BUGS.md` on #2912), not as a screen. The diff is read from the merge-base. `origin/main..head` also shows main's newer work (`deploy-synth.yml`, `estate.test.ts`, `QA-645/review.md`) as reversed, but those files are not part of this PR.

**Verdict: Approve** (Ship). There are no Blockers and no Majors. There are four Minors, listed below; none of them blocks the merge.

## What the row asked, and what holds
- **QA-741:** a copy with no Stripe key now shows each plan's monthly and yearly price from `platform_plan` cents. On my isolated copy (:4434, `PLATFORM_IDENTITY=local`, no Stripe key, no AI key), `GET /api/public/plans` returned solo 4900/49000, team 9900/99000 and firm 19900/199000 CAD, with `pricesAvailable: true`. The page showed $49 / $99 / $199 per month and $490 / $990 / $1,990 per year, each with "+ applicable taxes", and no "Prices unavailable" notice. The lead ruling on #2912 holds: with no key, the plan table's cents are shown and Stripe price ids are never read. The test confirms this with zero calls to the billing port.
- **The path with a Stripe key is unchanged for priced plans.** With a key, a plan that has a price id shows Stripe's price (4900), not the table's (9900). Stripe is still asked only when there are ids to ask about.
- **Stripe unreachable while a key is set:** a plan with a price id shows no price, and a plan without one keeps the table's cents. The posted ruling covers only copies with no key. The builder's reading never puts a Sample number where Stripe holds the price, which keeps PF-5 BR-1's "never an invented one". I agree with it; the Lead may confirm.
- **Migration** `20261122030000_qa741_sample_plan_prices`:
  - It changes data only: one `UPDATE` with a `VALUES` list, and no change to tables, columns, constraints or policies.
  - It is idempotent: it only touches a plan where both cents are NULL, so it never overwrites a price someone has set.
  - The prices are labelled Sample in the migration, and the page lead already says "Plan names and prices are Sample".
  - Its timestamp orders after main's latest migration, `20261122020000_fo6_signing_tables`.
- **The other reader of the cents** is the pf15b booking trigger (`20261121130000_pf15b_plan_booking/migration.sql:85-87`), which uses them to decide whether a plan change is a raise. The seeded prices rise in the same order as the seats, so no booking decision changes. `check_pf15_booking` 42/0 (re-run by me).
- **QA-742:** a plan with 0 trial days has no trial line, and its button reads "Sign up". The page lead drops "Every plan starts with a free trial". Sign up no longer says "0 days free". All four were walked in the browser.
- Live AI stayed off and nothing called Stripe: the only host requested was `localhost:4434`. Port :4400 was never used.

## Checks re-run (exit codes)
- `check_pf5_signup_billing`: 106/0, exit 0.
- `check_pf5s1_signup_browser` on my isolated copy: 53/53, exit 0.
- `check_pf3_platform_schema`: 75/0.
- `check_pf15_booking`: 42/0.
- `graph.mjs --check`: exit 0 (G1 0, G2 0).
- `check_pf16_billing_rules` was not re-run by me; the builder reports 41/0.
- **Mutations**, run in a separate scratch copy and thrown away afterwards:
  - (a) Ignoring the no-key flag: the test fails ("no call to the billing port", asked=1).
  - (b) Falling back to cents when Stripe is down: the Stripe-unreachable test fails.
  - (c) Dropping the cents fallback: four tests fail.
  - (d) Removing `stripePrices: !!key` from `runtime-ports.ts`: **everything stays green.** This is Minor m2.

## qa's j_89 (from #2912) against this head: 11/14, the same as the builder's run
- W6 and W6b now pass.
- W3 fails twice: `["solo:49","team:99","firm:199"]`. Its allow-list holds only seats and trial days. The reviewer of #2912 had already noted that W3 "will need a price allowance once prices show".
- W7 fails: it requires the other plans to "stay Price not shown", which was true only before the seed.

These failures come from the tests' assumptions, not from defects in the product. The builder was right not to edit qa's file, which belongs to the open PR #2912, and to raise it with the Lead. For qa:
- W3 should also allow the plan's stored price (cents ÷ 100).
- W7 should judge only the stand-in card, or set the other plans' cents to NULL first.
- W6b no longer proves anything: the seed already puts 4900 on solo. It should store a value the seed does not use.

## Issues (ranked)
1. **m1 (Should): QA-742 is only partly fixed on Sign up.**
   - Problem: on Sign up for a 0-day plan, the heading still reads "Start your free trial" and the submit button still reads "Start free trial" (`web/src/modules/platform/signup/signup-page.tsx:113`, `:143`; the refusal messages at `:75` and `:90` also say "press Start free trial"). The row's Expected was "no 'free trial' button wording for that plan". The browser test only checks for the absence of "0 days free" (`tests/check_pf5s1_signup_browser.ts`, QA-742 fail line).
   - Evidence: my walk J6 (screenshot `j6-zero-day-signup-1440`).
   - Fix: take the heading and button text from `plan.trialDays > 0`, and assert that the page does not contain "free trial".
2. **m2 (Should): nothing tests the wiring.**
   - Problem: removing `stripePrices: !!key` (`api/src/platform/firms/runtime-ports.ts:31`) leaves every check green. Without the flag, a copy with no key goes back to asking the billing port for a plan's price id, and the plan shows no price.
   - Fix: assert that `runtimeSignUpPorts(<no key>).stripePrices === false`, or that a plan with a price id on a copy with no key shows the table's cents.
3. **m3 (Should): the notice contradicts the cards when Stripe is down.**
   - Problem: with a key set and Stripe unreachable, `pricesAvailable` is false, so the "Prices unavailable — We could not read the prices just now" notice shows. At the same time, plans with no price id show table prices (`pricing-page.tsx:38`). This only happens on a keyed server where some plans have price ids and others do not.
   - Fix: show the notice only when a plan with a price id has lost its price, or reword it to "Some prices could not be read".
4. **m4 (Should): the row's "Also seen" is neither fixed nor recorded.**
   - Problem: QA-742's row also notes that Back from Sign up switches Pricing from Yearly back to Monthly. My walk J7 confirms it still happens, and the PR does not mention it.
   - Fix: either carry the period in the URL, or say in the PR that it stays open for the Lead.

**Note for the Lead (not a finding for this fix):** the pf15b raise rule now compares Sample table cents. Once real Stripe prices exist, the table's cents must be kept in step with them, or this rule will be comparing Sample numbers. The trigger's comment "prices live in Stripe on main" is now out of date.

## Journey score (reviewer, `journey-test`): 9/10, pass (no criterion at 0)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: prices are shown, Yearly switches them, Start free trial opens Sign up with "Team (Sample), yearly" |
| Next step obvious | 1 | One filled button per page; the 0-day plan's button reads "Sign up" |
| Plain words | ½ | m1: a 0-day plan's Sign up page still says "Start your free trial" |
| Feedback and state | 1 | With no cents anywhere (J4), the notice shows plus "Price not shown" on 3 cards; with some plans unpriced (J6), no notice and a per-card "Price not shown" |
| Correct data | 1 | The page matches the API and the database; $49.99 is shown for 4999 cents; a very large value shows as $21,474,836.47 with no sideways scroll; an inactive plan is hidden; every change was put back |
| Error recovery | ½ | J5: a 500 from the API shows "Plans could not be loaded — The server could not answer."; m4: Back loses the Yearly choice |
| Accessibility and screen sizes | 1 | axe finds 0 issues at 1440, 1024, 400 and 720×450@2 (200 % zoom); no sideways scroll; keyboard: period, then each card's button, then Sign in |
| Speed | 1 | /pricing shows the plans in 281 ms |
| Visual quality | 1 | Screenshots `j3-1024` and `j6-zero-day-1440`; the cards line up and the theme matches the team's |
| Trust and sources | 1 | Plan names are marked "(Sample)"; the lead says the prices are Sample; the migration labels them Sample; nothing comes from AI |

Report: `screens/QA-741/journey-test-reviewer-2026-11-22.md`.

## What does not apply or was not checked
- **D1–D20 and BIC-01–20:** not applied. This is a fix row, and /pricing is a public page outside the case screens, so the BIC table is not in §6's scope.
- **Not tested:** a real Stripe test key (no network, by the rules), a real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
- **Screenshots:** the PF-5s screenshots were regenerated by the builder's run. I checked my own screenshots, not each binary diff.

Reviewer: Approve 6dc0f3c0da57107d3371a7dbe11fa06fccb33ebc
