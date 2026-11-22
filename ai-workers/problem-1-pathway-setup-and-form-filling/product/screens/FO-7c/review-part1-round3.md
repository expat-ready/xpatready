# FO-7c part 1, review round 3 (reviewer, diff only)

* **Commit reviewed:** `0c16c91dd07deabdcfc7cd0242c29f94953ace63` on `claude/dazzling-thompson-1ndong`.
* **Scope:** only `git diff 2766ef4f0..0c16c91dd -- '*.ts'`. That is 4 files: `card/account.ts`, `card/rail.ts`, `card/stripe-rail.ts` and `tests/check_fo7c_card_payments.ts`. A diff-only round is allowed by standing permission A277, because round 2 (Approve from the reviewer and from the breaker) left only Minors. Nothing outside the diff was judged again.
* **Suite:** `studio/tests/check_fo7c_card_payments.ts`, run from `prototype/` against PostgreSQL on 127.0.0.1:54329 in its own scratch database. **Exit 0, 43 passed, 0 failed.** No server was started, and :4400 was not used.
* **Journey test:** N/A. This row is API only and has no screen, and the round is diff only, so there is no journey score for it.
* **Mutations:** run in a scratch copy (`$SCRATCH/proto/studio`). No repository file was edited.

## Round 2 findings

| Round 2 finding | Status | Evidence |
|---|---|---|
| Reviewer Minor 1 / breaker n1: a second break email while the alert still shows | **Resolved** | `account.ts:104-109`: `alertOn` is now the one rule. `view` uses it (`:99`), and so does `apply`, for "is this a new break?" (`:160`: `isBroken(next) && !(await this.alertOn(tx, firmId, prev))`). New case `check_fo7c_card_payments.ts:201-205`: firm B is re-onboarded after a disconnect and the half-made account is deauthorized. The result is DISCONNECTED, the `payment_account.broke` count stays at 1, and no item or mail-failure line is added for `evt_fo7c_b3`. Mutation (put back `!isBroken(prev)`): the new case **fails** (`broke: 2`). |
| Reviewer Minor 2 / breaker n2: the fake reads the header unlike Stripe, and a non-ASCII `v1` gives a 500 | **Resolved** | Both rails now call Stripe 23.1.0's own `webhooks.signature.verifyHeader`: the fake at `rail.ts:105`, the adapter at `stripe-rail.ts:73`. Any throw becomes `RailSignatureError`, so the RangeError path is gone. The fake's `sign` uses `generateTestHeaderString` (`rail.ts:113`). Test `:53-58` runs 9 odd headers, including two `v1` values, `t=…0`, a future `t`, a repeated `t`, a leading space and `é`×64. The two rails give the same answers, every answer is "read" or "refused", and `é`×64 is refused. |
| Reviewer Minor 3: wording in the tests | **Resolved** (the part in scope) | `check_fo7c_card_payments.ts:91`: the comment pasted twice is now one comment. `check_pf28_inputs.ts:67` is left alone on purpose: Lead B allowed exactly one line in that suite. Accepted, and not reopened. |
| Breaker n3: a warn line on every unsigned request when no key is set | **Resolved** | `account.ts:57,62`: `saidNotReady` logs once and the 503 is still thrown every time. Test `:213` now requires exactly **one** `payment_account_not_set_up` line after two refused calls (`onboard` and `receive`). The field belongs to the instance. The feature's factory builds one `PaymentAccounts` per process, so "once per process" holds as built. |

## The checks you asked for

### n1: the read inside the transaction, and the lock order
* **The read is correct.** `alertOn(tx, …)` runs inside `handle`'s transaction, after `pg_advisory_xact_lock(money_payment_account:<firm>)` (`:132`).
  * `onboard` takes the same lock (`:73`). It writes the PENDING row and its `onboarding_started` audit line (with `detail.afterBreak`) in one transaction (`:81-85`).
  * So the audit line that `apply` reads is always committed together with the row state in `prev`.
  * The query only runs when `isBroken(next)` is true and `prev` is PENDING (the `&&` short-circuit, then `:106`). That is rare, and it adds nothing to the normal path.
* **The lock order is safe.** The new step is a plain MVCC `SELECT` on `audit_event`, made while the per-firm lock is already held. It takes no row lock and no advisory lock, so no new lock is added and none is reordered. The sequence is still: mail check before the lock, then the lock, the receipt, the row, the audit write, and the notification.
* **A genuinely new break is not missed.**
  * A PENDING row with `afterBreak: true` can only come from `onboard` on a DISCONNECTED row (`:77`, `:84`).
  * `stateFrom` never moves a row *to* PENDING (`:50-53`).
  * `onboard` on any other row that holds an account returns early and writes no audit line (`:77`).
  * So "PENDING and afterBreak" always means that the firm has not reconnected since that break.
* **Walkthrough: Connected, Failed, re-onboard, connects, breaks again.**
  * The Failed path does **not** re-onboard. On RESTRICTED with charges off, `onboard` returns the same account and a fresh link (`:77`), and writes no new account and no audit line.
  * When charges come back on, `stateFrom` gives ACTIVE or RESTRICTED with charges on. `alertOn` is then false, because the state is not broken and not PENDING. The alert clears.
  * A later charges-off has `prev` ACTIVE. `alertOn(prev)` is false, so `broke` is true: a new break, with a new email.
* **Walkthrough: Disconnected, re-onboard, the new account connects, breaks again.** This is what the suite already covers at `:227-237`: Connected, the alert clears, then charges go off and a new break is written and dispatched once per Owner.
  * Mutation (delete `:106`, so `alertOn` answers `afterBreak` for any status): 4 cases **fail**. They are "alert clears" (`:230`), the two m1 outbox cases (`:234`, `:237`) and the Failed-then-Disconnected case (`:239`).
  * So a rule that missed a real new break would be caught.

### n2: the signature first, and the null assertion
* **Nothing is read or stored before the signature.** `receive` (`account.ts:112-121`) makes three calls before verification: `ready()`, then turning the Buffer into a string, then `verifyEvent`.
  * Inside `verifyEvent`, both rails call `verifyHeader` first. `parseEventDetails` only decodes the payload and the header, and computes an HMAC over the bytes.
  * Only then do they call `JSON.parse` and `EventEnvelope.parse` (`rail.ts:106`, `stripe-rail.ts:74`).
  * No lookup, no receipt and no log line comes before the signature. The round-2 `lookups` counter case still passes.
* **A non-JSON body with a valid signature** throws `SyntaxError` on both rails (scratch probe: `non-JSON signed: SyntaxError`). `receive:119` maps that to **400 `NOT_AN_EVENT`**. Before this change, the adapter's `constructEvent` parsed inside the try, which gave 400 `SIGNATURE`. Both rails now answer the same.
* **`signature!` is safe on 23.1.0.**
  * The type says `signature: WebhookSignatureObject | null` (`node_modules/stripe/cjs/Webhooks.d.ts:39`).
  * At run time, `createWebhooks` always builds the `signature` object (`cjs/Webhooks.js:67`). It is attached both as the static `Stripe.webhooks` (`stripe.core.js:133`) and on each instance (`:206`, the same object).
  * If a future version ever left it null, the `TypeError` would land in the same `catch` and become `RailSignatureError`. The door would fail closed with 400 on every event, and `:59` ("the fake signs as Stripe's library checks") would turn red. It would never fail open.
* For the record, Stripe's own tolerance applies to age only: a future `t` with a valid MAC is accepted (`Webhooks.js:193-194`). Both rails now behave this way, which is what Stripe does in production. A forged header still needs the secret. This is not a finding.

## New findings

### Blocker
None.

### Major
None.

### Minor
None.

### Nit
1. **The fake rail's `now` option now drives only signing, not checking** (`rail.ts:77-78`, `:105`, `:113`).
   * `verifyHeader` is called without its `receivedAt` argument, so it checks the age against `Date.now()`. `sign` still stamps `opts.now()`.
   * Scratch probe: `fakeCardRail({ now: () => <1 h ago> })` refuses its own `sign(body)` header. With `now` set 1 h ahead, the header is read. In round 2 both cases were read, because both sides used `now()`.
   * No caller passes `now` today (`features/client-money-card.ts:29` and the two in the suite). So there is no effect now. A part-2 or part-3 test with a moved clock would trip on it.
   * Fix: pass `now().getTime()` as the sixth argument, `verifyHeader(rawBody, signature ?? "", signing, undefined, undefined, now().getTime())`. Or drop `now` from the check's doc. This is optional.

## Not checked
* Anything outside the four `.ts` files in the diff (by scope, A277).
* A real Stripe call (step 0 is still with the founder, R1.57).
* The full CI matrix.

**Verdict: Approve.** No open Blocker or Major at `0c16c91dd07deabdcfc7cd0242c29f94953ace63`. All round-2 Minors are resolved, and the one new Nit is optional.

Reviewer: Approve 0c16c91dd07deabdcfc7cd0242c29f94953ace63
