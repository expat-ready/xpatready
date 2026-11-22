# PF-5 part 3 (R1.19): break report, round 1

Breaker (adversarial, Opus). Head `99663a52c`, branch `claude/dazzling-bardeen-ihtzy6`. Scope: the diff
`origin/main...HEAD` (billing_period column and backfill, sign-up stores it and the trial Checkout's price follows it,
the seed's raw insert). Running copy `brkp3` on :4593 (`PLATFORM_IDENTITY=local`, fake billing, started and stopped in one
command), two scratch databases (`xr_studio_brkp3m` for the backfill by `psql`, `xr_studio_brkp3d` by `prisma migrate
deploy`; both dropped), and a harness driving `FirmSignUp` with `fakeBilling` prices (team monthly + yearly, solo monthly
only) and the real audit adapter. Live AI off, US$0, no Stripe call. Scripts: `/tmp/claude-0/brkp3/` (probe.sh, setup.sql, h.mts).

## Findings

### m1 (Minor): the rollback leaves the migration's `_prisma_migrations` row, so "rollback, then migrate again" never re-adds the column
- Repro: fresh DB, `prisma migrate deploy`; `psql -1 -f .../20261121190000_pf5p3_billing_period/rollback.sql`; `prisma migrate deploy` again.
- Expected: the second deploy re-applies the migration (column back, backfill re-run), as the other recent rollbacks
  allow (6 of the 9 `rollback.sql` files end with `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '…'`, e.g.
  `20261121110000_fo3a1e_firm_timings/rollback.sql`).
- Actual: "No pending migrations to apply."; `billing_period` is missing, the row `20261121190000_pf5p3_billing_period` is
  still in `_prisma_migrations`. This PR's Prisma client then selects a column that is not there on every
  `platformSubscription` read or write (sign-up verify, webhook, billing account, plan booking). The file also does not
  say to roll the code back first, nor give the `psql -1` line the other rollbacks give.
  `prisma/migrations/20261121190000_pf5p3_billing_period/rollback.sql:2`.
- Run by hand (`psql` with no `_prisma_migrations` bookkeeping), rollback then migration gives the same result as the first run (held).

### m2 (Minor): the backfill matches the audit line to the subscription by id only, not by firm
- Repro (`xr_studio_brkp3m`, all migrations before P3, then P3 by `psql`): firm "attacker" writes a
  `platform.subscription.created` line, `firm_id` = its own, `entity_key` = firm "victim"'s subscription id,
  `detail.period = "YEARLY"`; also a line with `firm_id` NULL naming a third firm's subscription.
- Expected: only a line in the subscription's own firm (`a.firm_id = s.firm_id`) sets its period.
- Actual: victim → YEARLY, the firm-less line → YEARLY. `migration.sql:10-16` (no `a."firm_id" = s."firm_id"`).
- Impact is low: the only writer of that action is `firms/signup.ts:229`, which always names its own firm's new
  subscription, and `audit_event` is append-only; but a migration that writes one firm's row from another firm's line
  is the cross-firm pattern the walls exist to stop, and the fix is one predicate. Not a Major because no current code
  path can produce such a line.

### m3 (Minor, adjacent; not caused by this diff): a Yearly firm's booked plan change still falls on a monthly cycle
- Repro (`xr_studio_brkp3d`): a Team Yearly sign-up (stored YEARLY), set ACTIVE, trial ended 10 days ago, no Stripe
  period end; book a move to Solo (`platform_subscription_change` insert).
- Expected: with the period now stored, the renewal anchor follows it (a year), or the rule says why it does not.
- Actual: `effective_at` = trial end + 1 month (in 20 days). `platform_subscription_change_book()` in
  `20261121130000_pf15b_plan_booking/migration.sql:16-18, 97-103` still says "platform_subscription keeps no billing
  period on main, so … monthly"; that is no longer true after this PR. Only when Stripe's own period end is missing or
  past (with one, Stripe's end is used). A date, not a price; listed so the stale rule is not forgotten (follow-up, not this item).

## What held
- **Odd periods at `POST /api/public/signup` (running copy):** `"yearly"`, `"Yearly"`, `null`, `5`, `["YEARLY"]`,
  `"YEARLY "`, `{"$ne":"MONTHLY"}`, `"YEARLY\u0000"` → each 400 `CHECK_FIELDS` `period: check this answer` in ≤ 20 ms,
  no validator text; a 1 MB period → 413 `BODY_TOO_LARGE`, nothing saved; 0 pending rows from all of them (`signup.ts:58` `z.enum`).
- **Period changed between sign-up and verify:** an `UPDATE` of the pending row's period is refused by
  `platform_signup_pending_rules` ("a sign-up changes only once"); signing up again with Monthly ends the Yearly link
  (old link → 404) and the firm made from the new link stores MONTHLY.
- **Price follows the stored period:** Team Yearly → YEARLY, Checkout `price_ty`; Team Monthly and Team with no period →
  MONTHLY, `price_tm`; Solo Monthly → `price_sm`. Solo (no yearly price) with Yearly → firm made, YEARLY stored,
  `checkoutUrl: null`, "Sign in to finish starting your free trial.", no Checkout at all (no invented or monthly price).
  No Yearly firm got a monthly price on any path in the diff; the webhook (`billing/webhook.ts`) never writes the period.
- **Backfill edge cases:** lower-case `"yearly"` and `"YEARLY "` keep MONTHLY (only the sign-up's exact enum word
  counts, and the sign-up only writes that); two creation lines (MONTHLY and YEARLY) → YEARLY, no error; an upper-cased
  `entity_key` does not match; `updated_at` is not touched; running the migration twice fails loudly on `ADD COLUMN`.
- **Seed's raw insert and the walls:** under `asBypass("platform.demo.reset")` on the API's `WalledPool` (xr_app → the
  bypass role) a new Sample firm gets one ACTIVE, MONTHLY subscription on its own firm id; the same raw `INSERT` in firm
  A's scope naming firm B → 42501 (the forced policy holds, raw SQL does not bypass it); the seed with no scope in the
  walled API writes nothing (42501 on `platform_firm`); firm A's scope updating firm B's period → 0 rows.
- **Fresh copy and demo reset:** the copy migrated and started cleanly, start-up seed made `sample-firm` and
  `sample-solo` ACTIVE MONTHLY, no error in `api.log`; `POST /api/demo/reset` (author) → 201 and both Sample
  subscriptions are still there, MONTHLY; a non-author → 403.
- **Audit:** every `platform.subscription.created` line carries `period` in detail and in the after-values
  (`period_after`); 0 audit lines matching password, the test password, `secret`, `sk_`, `whsec`, `token=` or `"code"`.

Round 1: no Blocker or Major at 99663a52c (three Minors: m1 rollback bookkeeping, m2 backfill not firm-matched, m3 adjacent stale monthly rule).
