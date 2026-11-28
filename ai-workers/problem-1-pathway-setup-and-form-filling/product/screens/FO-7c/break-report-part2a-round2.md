# FO-7c part 2a break report, round 2 (pay link and the client's pay door)

PR expat-ready/xpatready#3633 · branch `claude/eloquent-goodall-y7jjmw` · head **72835e584b07d9b5ab842d373db5f178b563be6f** · 25 Nov.
Diff-only pass on `git diff d4b1185d7 72835e584 -- prototype/studio` (pay.ts, rail.ts, stripe-rail.ts, routes.ts, tests).
Method: round 1's scratch harness re-run unchanged in substance, plus new cases (scratch `attack2.ts`). It uses a scratch database with every migration, Nest on an ephemeral port (never :4400), PF-4's guard and PF-12's walls. It runs on `fakeCardRail` and on `StripeCardRail.fromKey("sk_test_notreal", null, fetchFn)` with a mocked `fetch`. The mock now replays a saved answer for a repeated key, refuses a reused key that comes with other parameters (400 `idempotency_error`), answers 409 to a second in-flight request with the same key, and checks `expires_at` against Stripe's documented 30 min to 24 h from creation. A controllable clock is shared by CardPay and the mock. No network, US$0. The PR's own `check_fo7c_pay_link.ts` passes 34/34 here. Nothing in the repo was edited.

## Verdict: **Changes** (no Blocker, 1 Major, 4 Minor)

## Round-1 findings
* **M1 held.** Fake rail: a new link's session uses a new key and a new page, and its success and cancel URLs hold the new token. Stripe adapter: the session after a new link → 200 (cs_test_2, new key). A firm renamed between two clicks → 200 with a new page, where round 1 gave 400 `idempotency_error` → 500.
* **M2 partly held. The window is now 30 to 40 min, not 24 h. That is what round 1 asked for at minimum.** Every page carries `expiresAtSec`. Measured life on our clock was 30.017 to 39.983 min. On the mock, Stripe saw `expires_at − created` = 1800 to 2400 s. Two-tab race: the repeatable-read snapshot holds. Inside the transaction `current_setting('transaction_isolation')` = `repeatable read`. In a forced interleave, an offline 250.00 was committed between the due read and the count. The session was made for 100000 under count 0, consistent with the snapshot, never the full amount under count 1. 180 race sessions: 179 × 100000/count0 and 1 × 75000/count1. **0 × 100000/count1** (round 1 saw it once in 4). What remains: a page handed out before a change still takes a card until it expires. On the fake, case 4b still charged 100000 + 60000. The PR accepts this as part 2b's "extra". No session is expired when a new link is made or the invoice is settled.
* **m1 held for the errors it named.** On the mocked adapter, 403 (access revoked), `account_invalid` and "cannot currently make live charges" each → 409 CARD_NOT_OFFERED with the offline details. See n2 for the errors it does not map.
* **m2 held.** Memory is bounded. 50,100 junk keys in 18 s from one address added 5.4 MB of heap, and the map stays at MAX_KEYS (routes.ts:63). See the limiter note under "What held".
* **m3 not held for a chunked body.** See n1.

## Major

**N1 (new, caused by the fix). For an invoice that has not changed, the client now gets a new card page in every 10-minute slot. Two open pages are both payable: one invoice took 2,000.00 of card money for 1,000.00 billed.**
Why: the slot is part of the hashed parameters through `expiresAtSec` (pay.ts:157, 159, 161). So two clicks in different 10-minute slots get different idempotency keys, and two Checkout sessions for the full amount due are created. Before this head, an unchanged invoice kept one key for the whole of Stripe's 24 h key life, so it had one session, and a session can complete only once.
Steps (fake rail, ACTIVE account, 1,000.00 invoice, link T):
1. `POST /api/public/pay/T/session` at slot + 0:01 → cs_A.
2. Again at slot + 9:59 → cs_A (same page, as designed).
3. Again at the next slot + 0:01 → **cs_B**, a new page for 100000.
4. `rail.succeed` on cs_A and cs_B → charged **200000**.
The Stripe adapter behaves the same: the same slot replays the same page, and the next slot makes a new key and a new session (`R2-S2`). On real Stripe, cs_A stays open up to 40 min after cs_B is made.
Ordinary ways to hit this:
* the email link opened on a phone and on a laptop more than about 10 min apart;
* two tabs that fall either side of a slot boundary;
* a client who backs out and clicks Pay again later while the first Stripe page is still open in another tab.
This contradicts the PR's own claim in pay.ts:144 ("the same click while nothing changed is the same page"). The PR's suite does not catch it: its two clicks fall in the same slot.
Should: an invoice that has not changed must never have two open full-amount pages. For example, keep the open session per link and reuse it while it has life left, or expire the earlier one through the rail before making the next. Either way, a test should click across a slot boundary. The legal reading of over-collected card money is Unconfirmed: no counsel.

## Minor

**n1. A chunked body gets past the 415 on both writes (round-1 m3 not held).**
Why: `notJson` reads only `Content-Length` (routes.ts:43-44). A body sent with `Transfer-Encoding: chunked` has no length, so it counts as 0 and passes.
Results on `POST …/pay-link` (raw `node:http`):
* text/plain `{"amountMinor":5}` chunked → **200, new link made** (the earlier link stops working).
* application/octet-stream chunked → **200, new link made**.
* a chunked body with no content type → **200, new link made**.
* the same text/plain body with a Content-Length → 415 (fixed).
Session door: text/plain chunked → **200, session made**, and form-urlencoded chunked → 200. Nothing is charged, as in round 1.
Should: also treat a `transfer-encoding` header as a body (type-is's `hasBody` does this), and add a chunked case to the test.

**n2. Stripe being down still gives a 500 at Pay, not the offline details.**
On the mocked adapter, these are rethrown by stripe-rail.ts:58: a 429 rate limit, a 5xx (after the SDK's 2 retries), a 401 (the platform key revoked or rotated), and a network failure. In the app, ProblemErrors turns them into 500 "Something went wrong on the server" (main.ts:231-232), where the client should see CARD_DOWN, "Online payment is temporarily unavailable", plus how to pay offline.
In the harness, Nest's own filter even passed Stripe's 401 words to the public client ("Invalid API Key provided: sk_test_****"). The app's filter does not, but the suite has no case for this.
The reverse also happens: every `StripeInvalidRequestError` becomes "card not offered". That includes our own malformed request, for example an `expires_at` Stripe refuses. It is logged only at info as `card_pay_refused_by_rail {invoiceId}`, with no Stripe code (pay.ts:165), so a broken integration would look like "card down" and leave nothing at warn or error.

**n3. The expiry margin at the end of a slot is under one second.**
`expiresAtSec` = end of the next slot + 30 min, floored to the second (pay.ts:157-159). A click in the last second of a slot gives exactly 1800 s after Stripe's creation second (`R2-S3`: 1800 at 30 ms, 200 ms and 1 s before the end). Stripe's documented least is 30 min after creation. Two things push the request past that:
* Stripe's clock being 1 s or more past our slot end at creation (latency plus clock skew);
* a stripe-node retry (maxNetworkRetries 2, timeout 10 s) of a request sent near the end of a slot.
Either gives `expires_at` under 30 min, which Stripe refuses as invalid_request_error. The adapter maps that to RailRefused, so the client is shown "pay offline" for an account that works. A click in the next second works. This was not confirmed against live Stripe (no network). Should: a margin of a minute or more, e.g. 31 min.

**n4. The fake rail never expires a page, so the M2 fix cannot be shown on it.**
`fake.succeed` on a page an hour past its `expiresAtSec` → `succeeded` (`R2-S1b`). The PR's suite checks only that the value sent is 29-41 min. Part 2b's late-payment and "extra" cases will be written against this fake.

## What held
* Same slot, same page: on the fake and on the Stripe adapter (Stripe replayed the saved answer). Two tabs at once with the same key on the adapter: the mock answered 409 to the second, the SDK retried it, and both tabs got the same URL (3 Stripe calls).
* The key is 88 characters (under 200, and under Stripe's 255). It covers the account, amount, currency, description, metadata, URLs and expiry. The fake refuses a reused key that comes with other parameters, as Stripe does.
* Body on the session door: JSON `{"amountMinor":1}` → 200. The page charges 100000 (the amount due): the body is ignored and the amount never comes from the client. Empty POST with `application/json` and Content-Length 0 → 200 on both routes. `Application/JSON` → accepted. JSON in UTF-16 → 400. A form body sent as JSON → 400. text/plain or form with a Content-Length → 415 on both routes.
* Limiter cap: memory stays bounded. Flooding 50,100 junk keys from one address does reset that address's 30/min counter on a link: GET and POST answered 200 again within the minute (`R2-13d`). The cost is about 1,670 junk requests per extra call. The flood also clears and refills its own miss budget. This is the designed trade-off between a cap and an LRU, not a finding.
* Round-1 "held" cases re-run, same results:
  * tampered tokens → the one 404, and 431 for a 20,000-character token;
  * reuse after credit, write-off, payment in full or a newer link → 404;
  * walls: firm B → 404, trust request → 404, draft → DRAFT, locked → NOT_AVAILABLE with no "lock" wording;
  * every non-ACTIVE account state → 409 with 0 rail calls;
  * metadata is `firm_id` and `invoice_id` only, on the firm's own account;
  * no verifier or hash in audit lines, logs or answers (95 links);
  * 0 CARD payments and 0 trust entries;
  * miss budget: 300, then 429.
* GET writes nothing: the code is unchanged in this diff, and the 0 audit lines and 0 rail calls held. The xid counter could not be used this time: other databases on the shared cluster moved it by about 3,000 in 8 s while this run was idle.
* Round-1 m4 (Owner 404 under the real C5 scope) is unchanged. It is not in this diff.
