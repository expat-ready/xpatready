# Review: FO-7c part 1, the firm's payment account on a fake rail (PR #2938)

Reviewer: Opus 5.5, high effort, a fresh context that did not build it. **Commit reviewed: `786d1a32376a15ce57893b7eae42264fa09b35e5`** (branch `claude/dazzling-thompson-1ndong`; diff `origin/main...786d1a323`, 16 files, +660/-2).
The bar: brief `track-b/FO-7c-1.md`, `FO-7c.md` part 1 (rulings, DW1, DW2, DW3, DW4's wall part, DW10), the tech lead's four rulings on the PR (one migration, one `main.ts` line, step 0 open and fixtures built from `stripe` 23.1.0 types, Owner-only GET), `AGENTS.md`, `WAY-OF-WORKING.md`.
**There is no screen in this part.** No browser journey and no screenshots. D1–D20 and the BIC table: N/A. **Journey score: no screen in this part.**

## What I ran (all from `prototype/`, never :4400)
* `check_fo7c_card_payments.ts`: **exit 0, 34 passed**.
* Unchanged suites, all exit 0: `check_fo7a_money_schema` 122, `check_pf12_walls` 110, `check_pf5_signup_billing` 102, `check_fo7b_invoices` 44, `check_pf24_secrets` 84, `check_pf24w_environment` 28.
* CI type check (`tools/typecheck.mjs`): no new errors (15 known).
* A scratch copy of the commit (`git archive`), started on :4432 against its own database, which is now dropped. Unsigned `POST /api/hooks/stripe-connect` → 503 `PAYMENT_ACCOUNT_NOT_SET_UP`, which names the settings and never their values. Both staff routes with no session → 401.
* `check_forms_qa53.ts` and `check_pf28_inputs.ts` against that copy. See Major 1 and 2.
* 15 mutations in the scratch copy, the working tree untouched:
  * Caught: verification removed; Owner filter removed; dedupe removed; `withFirm` removed; step-up removed; account made again on every call; the unknown account's id logged; GET key set to `agent/firm-settings:view`.
  * Survived: see Minor 1, 2 and 3.
* CI on this head: only the draft jobs ran. `pr-rules` and `module-cards` are red (Minor 7); `ci`, `types`, `regression` and `shard` were skipped, so the full check has not run.

## What held (checked against the code)
* **Signature first.** `account.ts:93-102`: nothing is read or stored before `verifyEvent`. The fake checks the HMAC as Stripe's library does, in constant time with a 300 s tolerance (`rail.ts:103-109`). The fake's header passes the Stripe adapter, so the door's real path is the one tested. Unsigned, forged (the platform secret) and 6-minute-old events → 400, nothing stored.
* **Stored once.** The receipt (`stripe-connect`, event id) goes in with `skipDuplicates`, under a per-firm advisory lock, in the same transaction as the change, the audit line and the home item (`account.ts:110-117`).
  * A failure rolls the receipt back too, so Stripe's retry runs the event again.
  * A concurrent duplicate waits on the lock and the unique index.
  * Events that arrive out of order settle on what Stripe says now, because the account is read inside the lock.
  * A late event for a disconnected or replaced account changes nothing (`stateFrom` guard; lookup by the current `stripe_account_id`).
* **The firm, under the walls.** `money_firm_of_stripe_account` is shaped exactly like `platform_firm_of_key`: definer, owner `xr_wall_reader`, `search_path` pinned with `pg_temp` last, PUBLIC revoked, EXECUTE for `xr_app` and `xr_staff_bypass`. It is additive with a rollback. `stripe_account_id` is unique (`client-money.prisma:225`). The firm comes only from the account id, never from the event body. No bypass use; `Db` runs as `xr_app` (`core.ts:39`).
* **No secret.** Secrets are read through PF-24's `Secret`, revealed only to the adapter. The webhook secret is in no log, column or answer: `safeError` logs no message text (`log.ts:95`). DW10 scans every answer, log line, email and column, and its own check catches a planted value. GET answers only the status, the two switches and the alert.
* **Lifecycle (AG-16-15/-16).**
  * PENDING moves to ACTIVE only on the rail's own read with charges on.
  * RESTRICTED with charges on = Degraded: no email.
  * RESTRICTED with charges off after charges were on = Failed: a break.
  * `account.application.deauthorized` = DISCONNECTED: a break.
  * Per break: one email per Owner (Owner only, keyed by event id) and one item (`FIRM_AND_CONNECTIONS`); no "fixed" email. An email that cannot be sent never holds back the status, and is logged by event id.
* **Step-up and key.** `requireStepUp` comes before any write, giving 401 `STEP_UP_REQUIRED`. Both routes use `agent/payment-rail:connect`. The firm is the session's.
* **Records.** No personal names. Fixtures say "NOT recorded from Stripe", with the type files and date (ruling 3); the ids are Sample. The email words and the `/settings/payments` path are marked Sample. Audit actors are `staff:<id>`, `system:stripe-connect` and `seed:FO-7c-1`. No legal claim is made, so no "Unconfirmed: no counsel" line is due.

## Findings

### Blocker
None.

### Major
1. **PF-28's input sweep fails on the new door.** `check_pf28_inputs.ts` (a) FAIL `["client-money/card/routes.ts POST /api/hooks/stripe-connect body"]`.
   * Cause: the raw body (`routes.ts:185`) reaches no zod parse the static follower can see. The suite's `HOOK` set (line 68) exempts only PF-5's door: "any other webhook route is judged like every door (review r15-1)".
   * `ci` will be red. The fix is outside the touch list: `HOOK` plus an HTTP check like DW6's, or an allow-list line.
   * Ask the tech lead on the PR.
2. **QA-65 fails on the new public write.** `check_forms_qa53.ts` FAIL "QA-65: every other write names its person" `["client-money/card/routes.ts: /api/hooks/stripe-connect"]`.
   * Cause: the door is not in `PUBLIC_DOOR_WRITES` (line 68), which lists PF-5's `/api/hooks/stripe`.
   * The suite also asks each listed door: empty body → 400 or 503, never 2xx. This door answers 503 when not set up, else 400.
   * The fix is outside the touch list. Ask the tech lead.
   * (The run's other two FAILs, the demo load giving 500, come from my scratch copy, not this diff.)

### Minor
1. **The "same break" rule for Failed then Disconnected is untested.** The code is right: `account.ts:133` sends one email (AG-16-16 rule 3: "Never repeat the email for the same break"). The mutation `broke = isBroken(next)` survives. Fix: in DW2, deauthorize while the account is Failed, then assert no second email.
2. **The Owner-only key is proven only against a Case Officer, who holds no money key.** Changing either route's key to `agent/payment:record` (held by OWNER, ADMIN and BILLING_FINANCE, pf3 migration lines 875-877) survives. Fix: grant ADMIN or BILLING_FINANCE to a test person and expect 403 on both routes.
3. **"Connected only once charges are enabled" is never tested against a payouts-on, charges-off read.** The mutation `chargesEnabled || payoutsEnabled` (`account.ts:49`) survives. Fix: one more `stateFrom` case.
4. **The alert words clear when the Owner merely starts onboarding again.** A re-onboard sets PENDING (`account.ts:72-74`), and `view` then shows no alert (`account.ts:89`; the test asserts this at line 168). The account cannot take cards until the hosted sign-up is finished. AG-16-16's states are "Disconnected → Connected; alert cleared on reconnect".
   * Money is safe: card payment needs ACTIVE.
   * Ruling 4 covers "a reconnect clears"; the tech lead should confirm that starting the hosted sign-up counts as reconnecting.
5. **"Signature first, before anything is read" is pinned only for writes.** Nothing proves that `firmOfAccount` is not called on a bad signature. The code is correct. Fix: count lookup calls in DW3.
6. **The rail is not yet fit for part 2.**
   * `RailEvent` (`rail.ts:20`) carries only id, type and account. A `payment_intent.succeeded` handler needs the intent id from the event (AG-6-14: "processed once per event id and intent id"), so the interface must widen in part 2.
   * The fake's `listSucceededIntents` filters by paid time (`rail.ts:98`). The Stripe adapter filters by creation time (`stripe-rail.ts:175`). That gap matters for DW7.
7. **PR body and records.**
   * `pr-rules` fails: "MISSING: no 'Done when'".
   * `module-cards` fails: the api-core, api-features and api-platform cards are unchanged and the body gives no `Card unchanged: <reason>` line.
   * The body still says "No migration yet (question 2 asks for one small function)", but the migration is in.

## Open items (not findings; ruled or outside part 1)
* Step 0 is unread (ruling 3). The Stripe adapter's calls are unproven:
  * `country: "CA"` is fixed in the code.
  * No `capabilities` are requested.
  * Treating `StripePermissionError` / `account_invalid` as "gone" is unconfirmed.
  * The real `account` field on `account.application.deauthorized` is unconfirmed.
  * All of this waits on the founder's test-mode check (R1.57).
* `PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET` is not in `deploy/cdk/lib/service.ts:37` or `RUNBOOK-secrets.md`; both are outside the touch list. A deployed server answers 503 until it is added, which is safe. It is needed before the Works proof.
* `NotificationPort` has no clear yet, so the home item stays (ruling 4; contract gap 5).
* Not checked: a real Stripe call; the whole CI matrix; the graph tool (it writes into the tree, and there is no screen).

**Verdict: Changes.** Fix Major 1 and 2 (each needs the tech lead's OK, because the fix is in a test file outside the touch list), and fix the PR body (Minor 7). Minors 1-3 and 5 are cheap test additions; I recommend them in the same round.

Reviewer: Changes 786d1a32376a15ce57893b7eae42264fa09b35e5
