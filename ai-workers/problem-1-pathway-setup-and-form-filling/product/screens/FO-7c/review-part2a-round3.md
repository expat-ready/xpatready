# FO-7c part 2a review, round 3 (reviewer, fresh context, diff only): the pay link and the client's pay door

**Verdict: Block** (Changes): no Blocker, **1 open Major (new: R3-M1)**. Not approved, so no `review: approved` label for this head.
* **Head reviewed:** `26583a0826b20ee0954d4b785fe9b5b49a8e9477` on `claude/eloquent-goodall-y7jjmw`. This is `df555de255920d72f909ad57cfa28061de17141d` plus one records commit. That commit changes only `shape-r1.57.md` (+7 lines of follow-ups; read, see Minor 6).
* **What I read:** only `git diff 72835e584 df555de25 -- prototype`: `pay.ts`, `rail.ts`, `stripe-rail.ts`, `routes.ts`, `check_fo7c_pay_link.ts`. I also read FO-7b's `money.ts` lock and write helpers, and the pool in `firm-scope.ts`, to check the lock questions.
* **Bar:** round 2's `review-part2a-round2.md` (R2-M1, Minors 1-6, nits) and `break-report-part2a-round2.md` (N1, n1-n4). The Lead's accepted residual is not raised again: a page paid in the seconds before an offline payment lands becomes part 2b's "extra", and a stored session id is a later row.
* **Run** (from `prototype/`, Postgres :54329, never :4400, no network, j_57 not run):
  * on an exact copy of the head's `studio/` (`git archive df555de25`) under the session scratchpad: `check_fo7c_pay_link.ts` **40/40**, `check_fo7c_card_payments.ts` **43/43**. This run is the one that counts;
  * in the repo's folder: also 40/40 and 43/43. But another session was editing the shared working tree during this review: uncommitted changes to `pay.ts` (an in-process `oneAtATime` queue) and `check_fo7c_pay_link.ts`, which look like a start on R3-M1. That run may not be of the head. **Those uncommitted edits are not reviewed here.**
* **Mutations and probes:** 24 mutations (25 runs), a door probe (`probe_r3.ts`, a fake rail with a delay and failure switch) and a Stripe-adapter probe (Stripe's own SDK on a stand-in `fetch`). All ran in scratch copies under the session scratchpad. I changed nothing in the repo's working tree; the only file I wrote is this review.

## Round 2 findings
| Finding | Fixed? | Does a test fail without the fix? |
|---|---|---|
| **R2-M1** (Major): the Stripe adapter's Checkout request is untested | **Fixed.** The new stand-in-`fetch` case (`check_fo7c_pay_link.ts:242-258`) records the request. It asserts the `Stripe-Account` header, the `Idempotency-Key` header, `unit_amount`, the lower-case currency, `expires_at`, `mode`, both metadata keys and no `application_fee`. | **Yes**, each mutation gives 1 FAIL: `expires_at` dropped; `stripeAccount` dropped; `idempotencyKey` dropped; `unit_amount + 1`; `payment_intent_data.metadata` dropped. |
| **Break N1** (Major): a new page in every 10-minute slot, and two live pages | **Fixed in code** (`pay.ts:164`; fake `rail.ts:101-105`; Stripe `stripe-rail.ts:66-73`). | **Yes**, 1 FAIL each: the expire call removed; the fake's expire made a no-op; the fake ignoring `open`; the wrong invoice id passed; on the adapter, `status=open` dropped, the metadata filter dropped, or `stripeAccount` dropped on expire. **But** passing the wrong `keepId` passes both suites (Minor 7). |
| Break n1: a chunked body gets past the 415 | **Fixed** (`routes.ts:43-44`), with a chunked case. | **Yes:** 3 FAIL. |
| Break n2 / Minor 2: Stripe down gives a 500, and refusals are logged at info with no cause | **Fixed on `createHostedPayment` only.** Every `StripeError` becomes `RailRefused("stripe <type>/<code> (<status>)")`, logged at **warn** with that reason (`stripe-rail.ts:59`, `pay.ts:168`). The probe confirms: 401 → `StripeAuthenticationError (401)`, 500 → `StripeAPIError (500)`, 429 → `StripeRateLimitError (429)`, a network failure → `StripeConnectionError`. The reason never contains the key; it is built from type, code and status only, never from Stripe's message. **Not held** when the list or expire call fails, or when Stripe is slow (R3-M1, Minor 8). | **Partly.** Narrowing the mapping back: 1 FAIL. Logging at `info`, or dropping `reason`: **both pass**. There is still no Stripe request id in the log line. |
| Break n3 / Minor 1: no clock margin on the 30-minute floor | **Fixed in code:** `MIN_LIFE_MS` is 31 min (`pay.ts:41`). | **Mostly no.** The test floor is 30.5 min on the real clock (`check_fo7c_pay_link.ts:183`). Mutating back to 30 min passed this run. It fails only when the click falls in a slot's last 30 s, about 5% of runs. Pin the clock at a slot's end to make it certain. |
| Break n4: the fake never expires a page | **Fixed** (`rail.ts:122-124`). | **Yes:** ignoring `expiresAt` gives 1 FAIL. |
| Minor 3: `RailRefused` → the offline answer is untested | **Fixed** (`check_fo7c_pay_link.ts:146-148`, charges off at the rail). | **Yes:** limiting the catch to `RailAccountGone` gives 1 FAIL. |
| Minor 4: the one-read fix (amount due and payment count read together) is untested | **Carried; the mechanism changed.** The repeatable-read snapshot is now a row lock (`pay.ts:155`). | **No.** Removing `for update` passes 40/40. Taking the amount from `open`'s earlier unlocked read also passes. This is still the Lead's call. |
| Minor 5: the limiter's hard cap has no test | **Not addressed** (informational, as in round 2). | n/a |
| Minor 6: follow-ups live only in the PR comment | **Fixed in the records commit.** `shape-r1.57.md` now lists five follow-ups: the stored session id row, "extra" in 2b, `no-referrer` (FO-7s2 part 2), the deposit refusal with #3654, and part 5's sandbox check. They are not in the BACKLOG rows, but they are in the repository. | n/a |
| Nit: a chunked non-JSON body | Fixed (n1). | yes |
| Nit: the same-slot DW11 check runs on the real clock | **Not addressed** (`check_fo7c_pay_link.ts:152-155`). It fails about 1 run in 60,000. | n/a |

## The checks asked for
* **Same-slot clicks still give the same page (DW11).** They do. Probe P6: two POSTs in one slot → `cs_fake_10` both times. The expire call keeps the page it was just given (`keepId`).
* **Deadlock with FO-7b's lock order** (the party's trust lock, then the invoice row: `money.ts:206-213`). **None is possible.** The session takes only the invoice row and then no other lock; its other queries are plain reads. `makeLink` takes the same single row lock. So no cycle can form.
  * However, FO-7b waits for that row **while holding the party's trust lock**. Its other money writes for the same party (other invoices, trust moves) therefore queue behind the client's Stripe calls too. This is from reading the code; I did not measure it.
* **Does the row lock across the Stripe calls hold an offline payment too long?** **Yes** (R3-M1).
* **A page created but the transaction rolled back.** This happens when the rail takes more than 30 s (probe P3): the page is made at the rail, the commit fails, and the client gets a **500**. No data is lost, because the transaction writes nothing. A retry in the same slot gets the same page back.
* **What if `expireOtherHostedPayments` fails after the page was made?** Probe P2: **500**, and the page is not answered. The new page stays open at the rail, and the earlier page is **still payable**. On the Stripe adapter, a failing list or expire throws a raw `StripeAPIError`, `StripeAuthenticationError` or `StripeRateLimitError` (adapter probe S2, S3). `pay.ts:167` rethrows it. No money is at risk; this is the n2 outcome again on the second call (Minor 8).
* **Stripe's list paging and the 25 h window.** Both are right. The SDK pages automatically: the probe saw a second `GET … starting_after=cs_2`, and both pages' matches were expired, each call with `Stripe-Account`. A page lives at most 24 h, so a 25 h `created[gte]` window covers every open page. An expire refused as already complete (400) or missing (404) is skipped. Removing the `created` filter passes, which is harmless.
* **Does mapping every StripeError to "card not offered" hide an outage?** No, as far as this part can show.
  * The client sees `CARD_DOWN` ("Online payment is temporarily unavailable") with the offline details. That is the right answer for the client.
  * Each click writes a warn line with the error class, code and status, and never the key.
  * The gaps: no request id, no test of the log level or reason (both mutations pass), and two outage shapes still end as a 500 (R3-M1, Minor 8).

## New findings
**R3-M1 (Major): the public pay door now holds a pooled database connection and the invoice's row lock across all its Stripe calls. A slow Stripe therefore fails staff payments, stalls every firm's API, and turns the "Stripe down → offline" fix back into a 500.**
* **Where:** `pay.ts:154-171`. One transaction (`timeout: 30_000`) holds `select … for update` on the invoice while it runs these calls in sequence:
  * `createHostedPayment`;
  * the list call, once per page of 100;
  * one `expire` per match.
* **Worst case:** each Stripe call can take up to 3 × 10 s plus backoff (`stripe-rail.ts:17`: `timeout: 10_000, maxNetworkRetries: 2`).
* **Before this head:** the Stripe call ran outside any transaction, so it held no connection and no lock.
* **Scenarios** (probe on the fake rail with a delay; numbers measured):
  1. **Staff's offline payment fails.** A client clicks Pay while a staff member records an e-transfer on the same invoice.
     * With a 3 s rail, the payment waits 2.6 s and then saves.
     * With a 7 s rail, FO-7b's write fails after 6.6 s with Prisma `P2028` (transaction closed). FO-7b's `write` (`money.ts:198-199`) uses Prisma's default 5 s timeout, and `P2028` is rethrown, so staff get a 500 and nothing is saved.
     * The lock taken to make "an offline payment wait" makes the offline payment fail.
  2. **Every firm's API stalls.** 12 POSTs on one link, all within the per-address limit of 30 a minute, with a 2 s rail:
     * `pg_stat_activity` shows `active ×9; idle in transaction ×1`. That is all 10 connections of the API's shared pool: `walledPool` sets no `max`, so the pool keeps pg's default of 10.
     * One POST got a 500 after 2.1 s, because no connection was free.
     * Firm B's unrelated public GET took **3.4 s to 5.5 s** over two runs, against milliseconds normally.
     * The queued clicks finished one after another over 24 s.
     * The trigger is one client link (its own, or a forwarded email) plus a few addresses, or ordinary Stripe slowness during a busy hour. It needs no attacker.
  3. **"Stripe down → offline" (n2) is lost in the usual outage shape.** When the rail answers only after more than 30 s (Stripe timing out on every attempt), the transaction has expired before the catch's offline answer can be returned. The commit fails and the client gets **500**, not the offline details (probe P7: a refusal after 31 s → 500; P3: a success after 31 s → 500 with the page made).
* **Should:** no database transaction or row lock stays open across a call to the processor.
  * One way within this part: read the amount due and the payment count in a short snapshot (round 2's repeatable read) and end it. Then `createHostedPayment`, then `expireOtherHostedPayments`, with no transaction open.
  * Two concurrent clicks then still leave at most one live page. A's list runs after A's create, so if A's list misses B's page, B's create came after A's list, and B's list then sees and expires A's page. This assumes Stripe's list shows a session just created; that is unconfirmed without network.
  * An offline payment landing between the read and the create is the Lead's accepted residual.
  * Add a check with a slow rail (more than 5 s): FO-7b's payment on the same invoice still saves, and a refusal after 30 s still gives the offline answer.

**Minor 7: the N1 test never checks that the page handed out can still take a card.**
* **Mutation:** `expireOtherHostedPayments(account, v.id, "none")`. Every page, the one just answered included, is expired, so no client can ever pay by card. It passes **40/40 and 43/43**.
* **Why:** the check at `check_fo7c_pay_link.ts:184-188` asserts only that `p2 !== p1`, that the old page does not pay, and that the call was made.
* **The test is also weaker than it reads.** Its `p1` is a same-slot replay of the page from `sNew` (line 176): the rename-back makes the parameters equal again. The `sRen` click had already expired that page (probe P5), so `!paysOld` holds before the slot-change click runs.
* **Fix:** assert that `rail0.succeed(acct, p2, now)` succeeds, and take `p1` from a fresh, untouched page.

**Minor 8: the expire call's own failures are a 500.**
* **What happens:** a failure in `expireOtherHostedPayments` throws a raw `StripeError`, which `pay.ts:167` rethrows. This covers a 5xx, 429, 401 or network error on the list or expire, and a revoked account (`StripePermissionError` on the list). The client then gets a 500 after the page was made (probe P2), not the page and not the offline details.
* **Fix:** map the list and expire errors as `createHostedPayment` does. Then choose the answer: the offline answer (safe: no page handed out), or the page (an earlier page may stay open for up to 41 min, the accepted residual class). Log it at warn either way.

**Minor 9: a same-slot replay can hand out a page the rail already expired.**
* **What happens:** inside one slot, if the parameters return to an earlier set, the idempotency key replays the earlier page. Stripe replays the saved answer for 24 h, so the client is sent to an expired page. The page made in between has also been expired, so no live page is left until the next slot (≤10 min).
  * Causes: a firm renamed and renamed back; a partial credit undone with the payment count unchanged.
* **Probe P5:** `a` = `cs_fake_8`, `b` = `cs_fake_9`, then `c` = `cs_fake_8`; neither `c` nor `b` can be paid.
* **Why it is only a Minor:** no money is at risk and the trigger is rare. The later stored-session-id row closes it. Note it there.

## Scores (this diff)
* **D1 4, D2 4, D5 4.**
* **D11 3:** R3-M1, plus the 500s in P2, P3 and P7.
* **D16 4:** R2-M1 is closed, and most fixes are now pinned by mutation; open are Minor 7 and the untested lock and log.
* **D15 5**, as before. The rest are as in round 1. BIC-01 to BIC-20 are N/A (no screen in this part).

**Journey score (reviewer, the one score for this check): 7.0/10, fail (below 8, no 0).** Re-scored on this diff from round 2's 7.5. j_57 was not re-walked, by instruction, and there is no page of this part to walk. Each change is backed by the probes above:
* Correct data ½ → 1: the adapter's request is asserted, and one live page per invoice.
* Speed 1 → ½: a slow Stripe fails a staff payment and stalls other firms (R3-M1).
* Feedback and state 1 → ½: a 500 when the expire call fails or the rail takes more than 30 s.
* Unchanged: error recovery 1, plain words 1, trust 1.
* Unchanged and waiting on FO-7s2 part 2: task ½, next step ½, accessibility ½, visual ½.

**To fix before Approve:** R3-M1. Minors 7 and 8 are cheap to fix in the same change; Minor 9 can go in the later stored-session-id row.

**Not checked:** a real Stripe test-mode call (part 5); whether Stripe's list shows a just-created session at once; the FO-7b queue on the party's trust lock (code read only); j_57.

Reviewer: Block 26583a0826b20ee0954d4b785fe9b5b49a8e9477
