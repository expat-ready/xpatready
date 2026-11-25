# FO-7c part 2a break report, round 3 (pay link and the client's pay door)

PR expat-ready/xpatready#3633 · branch `claude/eloquent-goodall-y7jjmw` · head **26583a0826b20ee0954d4b785fe9b5b49a8e9477** · 25 Nov.
The head is df555de25 plus one records commit (`shape-r1.57.md`), so the code is the same. The SHA 0cd5b7d1d… named earlier does not exist in the repository.
Diff-only pass on `git diff 72835e584 df555de25 -- prototype/studio` (pay.ts, rail.ts, routes.ts, stripe-rail.ts, tests).
Method: round 2's harness was rebuilt as scratch `attack3.ts`. It uses a scratch database with every migration, the app's `Db` (PF-12 walled pool, pg's default of 10 connections) and Nest on an ephemeral port (never :4400). It runs on `fakeCardRail` and on `StripeCardRail.fromKey("sk_test_notreal", null, fetchFn)` with the real SDK settings (10 s timeout, 2 retries). The mocked `fetch` now keeps sessions: create (with the idempotency rules), list (status filter, `has_more` paging), and expire (refused unless open). Each endpoint can fail (500, 401, 429, connection, hang) or be slowed. A controllable clock is shared by CardPay and the mock. No network, US$0. The PR's `check_fo7c_pay_link.ts` passes 40/40 here. Nothing in the repo was edited.

## Verdict: **Changes** (no Blocker, 1 Major, 2 Minor)

## Round-2 findings
* **N1 held.**
  * Fake rail: clicks at slot + 0:01, + 9:59 and next slot + 0:01 → cs_2, cs_2, cs_3. cs_2 then refuses a card ("expired"); cs_3 takes 100000. Total 100000.
  * Stripe adapter: cs_1, cs_1, cs_2. Only cs_2 is open, and cs_1 is `expired` and refuses payment.
  * Two tabs either side of a slot boundary at the same moment (create 800 ms, the second click 100 ms into the first): the lock orders them, and the second reads the clock under the lock. Tab 1 got cs_3, which is now expired; tab 2 got cs_4. One open page.
  * Four tabs at once in one slot → one page, one open.
  * Paging: with a page size of 2 and 5 other open sessions, 5 list calls found and expired the old page. 250 others → 3 list calls; 1,000 others → 11 calls, 2.8 s at 250 ms a call. Another invoice's pages are never touched.
* **n1 held.** On both writes: text/plain, octet-stream and no-type chunked → 415, no link made and no page. `TRANSFER-ENCODING: Chunked` in upper case → 415. `Transfer-Encoding: identity`, and TE together with CL, → 400 from Node.
  * Empty bodies: JSON chunked and empty, `{}` chunked, Content-Length 0 with or without a type, and a body-less POST → 200. JSON with a field → 422; non-JSON text → 400.
  * Only an empty chunked body with no type → 415. No browser sends that.
* **n2 held for the create call.** Create answering 500, 401, 429 or a connection failure → 409 CARD_NOT_OFFERED with the offline details. Each is logged at warn, e.g. `card_pay_refused_by_rail … "reason":"stripe StripeRateLimitError/rate_limit (429)"` and `"stripe StripeAuthenticationError (401)"`. No `sk_test` and no key in any warn line. It is **not held for list or expire, or for a hang**: see M1 and m1.
* **n3 held.** `expires_at − created` = 1860 s at 200 ms, 1 s and 2 s before the slot end, including 1.5 s latency. That is a 60 s margin over Stripe's least.
* **n4 held.** The fake refuses a card 1 s past `expiresAtSec` and takes one 1 ms before it. It also refuses a page that has been expired.

## Major

**M1 (new, caused by the fix). The Stripe calls now run inside the database transaction that holds the invoice's row lock. That is one pooled connection plus the lock, for up to 30 s per click (pay.ts:154-171).** Before this head, Stripe was called after the snapshot transaction had ended. Now create, every list page and every expire (stripe-rail.ts:68-70) run under the `for update` (pay.ts:155) with `timeout: 30_000`. A waiting click also holds a connection. Measured:
1. **A staff offline payment on the same invoice fails** (FO-7b `record`, Prisma's default 5 s transaction, money.ts:198-199). It was started 300 ms after a client's click:
   * Stripe at 2 s → staff waits 1.8 s, then OK;
   * Stripe at 4.5 s → staff waits 4.3 s, then OK;
   * Stripe at 7 s on create, list or expire → staff fails at 6.7 s with **P2028**. No payment is saved, and the app answers a 500.
   * Stripe hanging → staff blocked for **28 s**, then the same error. It holds the party's trust lock all that time (`money_trust_lock`, taken first).
2. **One link holder can take the whole API's pool, every firm's.** 12 parallel POSTs to one link's `/session` are under the 30/min limiter. Stripe was at ordinary latency (create 500 ms, list 300 ms). The clicks queue on the row lock, each holding a connection: they answered at 1.0 s, 1.8 s … 10.0 s. Meanwhile **firm B's staff offline payment failed at 2.0 s with "Unable to start a transaction in the given time"**, and firm B's make-link took 2.2 s.
   With Stripe slow (6 s), 12 clicks on 12 links: two waited 12.1 s, a public GET took 5.6 s, a staff make-link took 5.6 s, and a staff payment failed at 2.0 s.
3. **Stripe hanging now gives the client a 500 after 31 s, not the offline details.** The SDK makes 3 attempts of 10 s each: creates at 0, 10.5 and 21 s. The code reaches `RailRefused` → offline and logs `card_pay_refused_by_rail … StripeConnectionError` at warn. But the transaction had already closed at 30 s, so the client gets "Internal server error" and the warn line describes an answer the client never got. A hang on the list call: 31 s → 500, with the new page made and not shown. The row lock was held at 20 s and freed at the timeout.
Should: no network call while the invoice's row lock and a pooled connection are held. The one-open-page rule still needs a test that clicks across a slot boundary. Two more tests are needed: a staff payment during a slow click, and parallel clicks while another firm writes.

## Minor

**m1. A list or expire failure is a 500, and two pages stay open (n2's goal not met there).** `expireOtherHostedPayments` rethrows any Stripe error that is not `StripeInvalidRequestError` (stripe-rail.ts:70), and `session` rethrows anything that is not a Rail error. Results:
* list 500 / 401 / 429 / connection and expire 500 / 401 → the main.ts filter's 500 (`console.error(e)`, main.ts:231). No warn line with type and code. The harness's plain Nest filter even echoed Stripe's status and words: 401 "Invalid API Key provided: sk_test_****real".
* After each failure, the old page and the new one are both open (2 open). The next click in the same slot replays the new page and expires the old one (back to 1).
* The client holds only the old page's URL, so no double payment was reachable. A key without list rights would make every click a 500.

**m2. A firm renamed and renamed back within a slot gets an expired page, and no page is open.** Steps: click → cs_A; rename the firm; click → cs_B (cs_A expired); rename back; click → the first key replays **cs_A, already expired**, and cs_B is expired as "the other". On Stripe: 0 open pages, and the client's page refuses the card. The fake rail does the same (cs_5, cs_6, cs_5, both refused). This lasts until the next 10-minute slot. Any change and change back of a hashed parameter does the same.

## What held
* Expiry while a client is paying: the page completes as the second click's expire lands. Stripe refuses the expire, which is swallowed. The new page is answered, and the old page keeps its payment (`complete`). The door still shows 1,000.00 due, because card payments are recorded in part 2b. That is the accepted residual, not raised again.
* Lock order: the door takes only the invoice row, and FO-7b takes trust then invoice. No deadlock in any run, and no `platform_pool_open_transaction` after the timeouts.
* Same slot, same page on both rails. The idempotency key and its metadata are unchanged from round 2. 0 CARD payments and 0 trust entries.
