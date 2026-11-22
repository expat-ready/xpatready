# PF-5 part 3 (R1.19): independent review (reviewer), 21 Nov 2026, round 1

Branch `claude/dazzling-bardeen-ihtzy6`, head `99663a52ce06a09db854cab6b4d6e9a6af2141bf`. Diff `origin/main...HEAD`: 6 files, +63/-6. The row is the tech lead's ruling on #2857 (comment 7067556246, read through `gh api`): a money fact must be state, not a log line, so `billing_period` (MONTHLY | YEARLY) is set at sign-up and used at Checkout. This PR is API-only and has no screen, so the BIC scorecard and D1-D20 are N/A.

## Checks I ran
* I read the ruling, the diff, `signup.ts` (verify door, `startTrial`), `seed-sample-firms.ts`, `firm-scope.ts` (where the walls are set), `ports/billing.ts` `PORTAL_FEATURES`, `plan-booking.ts`, `webhook.ts`, the PF-12 walls migration, main's `tools/rds-shape-check.sh`, and P-600/P-601 in `DECISIONS.md`.
* I searched for every price picker and every creator of `platform_subscription`: `stripeYearlyPrice`, `stripeMonthlyPrice`, `startTrialCheckout`, `platformSubscription.create|upsert|createMany`, `insert into platform_subscription` across `api/`, `web/`, `ports/`, `prisma/`, `tools/`.
* Suites on the head (in `/home/user/pf28`, `run-suites.sh --only`): pf5 102/102, pf12_walls 100/100, pf3_platform_schema 75/75.
* **Mutations.** I ran these in a scratch copy made with `git archive` of the head, not the worktree, using the pf5 suite (baseline 102/102 there):

| Mutation | Result |
|---|---|
| Store always MONTHLY | 2 FAIL (Yearly stores YEARLY; never swap) |
| Price map swapped in `startTrial` | 3 FAIL (the earlier monthly Checkout line, the Yearly line, never swap) |
| Stored period swapped (Checkout follows the stored value) | 4 FAIL (Monthly stores MONTHLY, the Yearly line, never swap, the monthly Checkout line) |
| Checkout ignores the stored period (always MONTHLY) | 2 FAIL |
| Backfill `UPDATE` removed | 1 FAIL |
| **Backfill without `detail->>'period' = 'YEARLY'`** | **0 FAIL (survives, see m1)** |

* **Merge simulation.** In the scratch copy I laid main's 6 changed files over the head, including `20261121230000_pf8b_f4_reader_create`. I re-stamped P3 to `20261122000000` and updated the test's constant. Result: pf5 102/102, pf12_walls 100/100, pf8b_f4_migrations 9/9. `git merge-tree` merges the head and main cleanly.

## What holds (evidence)
* **Set at sign-up from the Pricing choice.** The chain is `pricing-page.tsx:50` `?period=` → `signup-page.tsx:27` → zod `period: z.enum(["MONTHLY","YEARLY"])` (`signup.ts:58`) → pending row → `signup.ts:228` `billingPeriod: pending.period`. The column is shown nowhere new.
* **Checkout uses the stored value.** `signup.ts:233` passes `made.sub.billingPeriod` (the row Prisma returned) and `signup.ts:239` picks the price. `startTrialCheckout` has one caller and there is no other price picker. The portal has `subscription_update: { enabled: false }` and plan booking makes no Stripe price choice, so nothing can drift from the stored period.
* **Other creators.** Only the sign-up and the Sample seed create subscriptions. The seed gets the database default MONTHLY, which is right for Sample firms that never chose a period. No migration inserts subscriptions.
* **Backfill.** It only reads `audit_event`, which is append-only and is never written here. The join on `entity_key = s.id::text` matches one subscription by its UUID, and a duplicate line could only set the same value again. Lines without `detail.period` (made before PF-5) keep MONTHLY. RLS cannot hide rows from it: the migrating user must have BYPASSRLS (PF-12 stops otherwise; main's `rds-shape-check.sh` asserts it on the RDS shape), so the `UPDATE ... FROM` sees every row.
* **NOT NULL DEFAULT 'MONTHLY'** matches `@default(MONTHLY)`. After the migration `migrate diff` names no `billing_period` line. The rollback drops the column, and the period stays in each audit line.
* **P-600 (a)-(c).** One own slot line (`platform.prisma:198`), an own folder, additive, no function or policy. The test is measured right after its own migration: the "differs before" check at test:138 and the "empty after" check at test:146. Part 1's measure excludes the new column (test:110).
* **Raw seed insert (`seed-sample-firms.ts:76`).** It is safe under the walls. The walls are set per connection in the pg pool (`firm-scope.ts:340`, `app.firm_id` and `role`), and `tx.$executeRaw` runs on the same transaction connection, so the same policy, WITH CHECK and PF-12 triggers apply as for `tx.platformSubscription.create`. It is a parameterised tagged template, so there is no injection. `created_at` and `billing_period` come from the database defaults.
* **Raw insert or a test-side fix.** A test-side fix is worse. `check_pf12_walls` must seed Sample firms before PF-12 to prove the walls on existing rows, and it has only today's Prisma client. The seed already carries the same kind of shim for older schemas (the `to_regclass('platform_terms_version')` check at :57). I accept the product-side fix.
* **Zod.** No route file is touched. The sign-up body's period field was already a zod enum, and "WEEKLY" is refused at the field with nothing stored (test:255).
* **"A swapped period fails" is really tested** by the Monthly and Yearly lines together: test:247, test:252 and the earlier monthly-Checkout line. A swapped mapping or a swapped store fails 3 or 4 lines. The line at test:253 restates those facts and catches nothing on its own (n1).

## Findings
### Blocker
None.

### Major
* **M1. The stamp is no longer later than main's newest migration (P-600 (d)).** Main now holds `20261121230000_pf8b_f4_reader_create` (#2850, `0f260fae3`). P3's `20261121190000_pf5p3_billing_period` would sort before it, and the branch is behind main. P-600 (d) says "the later PR re-stamping and re-running CI when an earlier one merges".
  * **Fix:** merge main, then rename the folder to a stamp later than `20261121230000` and change `P3` at `tests/check_pf5_signup_billing.ts:49`.
  * **Mechanical:** in my merge simulation with `20261122000000`, pf5, walls and pf8b_f4 all pass.
  * The Lead reads the migration diff before the label (P-600 (e)).

### Minor
* **m1. The backfill test does not guard the period condition** (`migration.sql:16`, `tests/check_pf5_signup_billing.ts:141-147`). The fixture has a Yearly sign-up line and a subscription with no line at all. A backfill that set YEARLY on every subscription with a creation line, Monthly sign-ups included, still passes (mutation above). That would wrongly bill monthly customers yearly. The code is correct today, but on a money fact its test should fail when the rule is removed.
  * **Fix:** add a third subscription with a `platform.subscription.created` line whose `detail.period` is `MONTHLY`, and assert it stays MONTHLY.
  * Since M1 reopens the migration folder anyway, do this in the same round.
* **m2. The stamp check at test:137 cannot fail.** "Later than every one before it" holds by construction, and nothing compares the stamp with main's newest migration, so it passed while M1 was true. PF-12's check has the same form. Either name it for what it proves (own, unique) or leave the order to the Lead's read under P-600 (e).

### Nit
* **n1.** test:253 ("never swap") is the AND of facts already asserted at test:247 and test:252 and the earlier monthly-Checkout line. It never fails alone. It does no harm.
* **n2.** The backfill could also require `a.firm_id = s.firm_id`, as defence in depth. It changes nothing today, because the subscription id is a UUID.

### Observation (not a finding, no new scope)
The "Sign in to finish starting your free trial" recovery (`signup.ts:234`, `account.ts:97,104`) has no resume route on this head, and `startTrial` is still its only caller. When that route is built it must take the price from `platform_subscription.billing_period`. The column now makes that possible.

## Journey note (no screen)
Journey: a firm owner on Pricing picks Team, Yearly, signs up, confirms the email, and is sent to the trial Checkout. I did not walk it here: the running app has no email path to verify (journey report of 15 Nov, J1). In the harness, through the real `FirmSignUp` with fake billing and identity, the subscription stores YEARLY and the Checkout gets `price_teamYearly` (test:252). The default sign-up stores MONTHLY and gets `price_teamMonthly`. A forged "WEEKLY" is refused at the field with nothing stored.

**Journey score: 8/10, unchanged** from `journey-test-reviewer-2026-11-15.md` (a pass, no criterion at 0). "Correct data" stays 1 and now covers the period as state. No page, words or flow changed, so the other criteria keep their evidence. I wrote no new journey-test report.

Not checked: a live Stripe test-mode Checkout (CI has no network; fakes only); the full suite set (a wider run is in progress on the worktree).

Verdict: Changes requested

## Round 2 (diff only, P-277), head `ced0787e8a0183aec841d814069f7de82a4b255c`
Reviewed `git diff 99663a52c ced0787e8`, the builder's commits `0fdcd9a84` (the breaker's m1 and m2) and `ced0787e8` (this review's M1 and m1).
* **The merge of main is clean.** `git show --remerge-diff 85097b8dc` shows no hand edits. The head contains `origin/main` (`1ea5ac772`), and main's newest migration is still `20261121230000_pf8b_f4_reader_create`.
* **The PR's own diff against main is the same 6 studio files** (+70/-6).

| Item | Status | Evidence |
|---|---|---|
| **M1** stamp after main's newest (P-600 (d)) | **Closed** | The folder is now `20261122000000_pf5p3_billing_period`, after `20261121230000`. `migration.sql` was renamed at 100% similarity, so its content is unchanged. `P3` (test:49) and the rollback's row name follow the new stamp. |
| **m1** backfill period condition guarded | **Closed** | The fixture now has a Monthly sign-up's own line (`period: MONTHLY`, test:142-143), asserted MONTHLY (test:149-150). I ran the mutant myself: without `detail->>'period' = 'YEARLY'`, 101/102 fail. |
| **n2 / breaker m2** firm condition | **Closed** | `migration.sql:16` adds `a.firm_id = s.firm_id`. Another firm's YEARLY line names the plain subscription, which stays MONTHLY. My mutant without the condition: 101/102 fail. |
| **Breaker m1** rollback | **Fine** | The rollback drops the column, then deletes its own `_prisma_migrations` row by the new name, and says to run it only with the code from before PF-5 part 3. 7 other rollbacks in the folder do the same. |
| **m2** stamp check cannot fail | **Accepted as is** | It has the same form as PF-12's check. P-600 (e)'s read by the Lead covers the order, so no change is needed. |
| **n1** test:253 restates other checks | **Accepted as is** | It does no harm. |

**Checks run at `ced0787e8` (in `/home/user/pf28`):**
* check_pf5_signup_billing 102/102 and check_pf8b_f4_migrations 9/9.
* Two backfill mutants in a scratch copy (`git archive` of the head, since deleted): both were caught.
* I did not run walls, pf3, pf12b or pf15 again. The builder reports them green at this head, and my round 1 merge simulation already ran walls on this exact stamp.

**New findings:** none. **Open Blocker or Major:** none.

**Journey score:** 8/10, unchanged (no screen, no change to the flow).

Verdict: Approve ced0787e8a0183aec841d814069f7de82a4b255c
