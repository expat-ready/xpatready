# FO-7c part 2a break report, round 4 (final; pay link and the client's pay door)

PR expat-ready/xpatready#3633 · branch `claude/eloquent-goodall-y7jjmw` · head **80a6ab20696c22e47f21362d0548451d273d846d** · 25 Nov.
The brief named a437170dd. The coordinator moved the head during the pass to 80a6ab206 (a437170dd plus one commit). That commit puts a fixed `kind` in the two warn lines (`RailRefused.kind`) and adds the pay link's empty body to the PF-28 allow-list as a by-design exception (22 → 23). Every run below is on 80a6ab206; the working tree had it before the harness ran, which the `kind` field in the log lines shows.
Diff-only pass on `git diff 26583a082 80a6ab206 -- prototype/studio`: pay.ts (snapshot, `oneAtATime`, a failed expire still answers, the description), rail.ts, stripe-rail.ts, check_fo7c_pay_link.ts and the PF-28 allow-list. j_57.ts is removed.
Method: round 3's harness, reused as scratch `attack4.ts`. It runs on a scratch database with every migration, the app's `Db` (PF-12 pool, 10 connections) and Nest on an ephemeral port (never :4400). It uses `fakeCardRail` and `StripeCardRail.fromKey("<a made-up test-mode key, redacted>", null, fetchFn)` with the real SDK settings (10 s timeout, 2 retries). The mocked `fetch` keeps sessions (create with idempotency, list with paging, expire). Each Stripe endpoint can be slowed, fail or hang, and a hang can be limited to one invoice. Firm B gets a card account too, so its clicks also pass through the queue. `pg_stat_activity` and a `for update … lock_timeout 200ms` probe are sampled during clicks. No network, US$0.
The PR's `check_fo7c_pay_link.ts` passes 45/45 on 80a6ab206. `check_pf28_inputs.ts` was not run: it needs the full sweep, and the allow-list line was only read. Nothing in the repo was edited.

## Verdict: **Approve** (no Blocker, no Major; 3 Minor)

## Round-3 findings
* **M1 held.** A staff offline payment (FO-7b `record`) was started 300 ms after a client's click (1.5 s after it for a hang). It was recorded both on the same invoice and on firm B's invoice:

  | Stripe during the click | Client's answer | Staff, same invoice | Staff, firm B |
  |---|---|---|---|
  | create 7 s | 200 at 7.0 s | ok, 61 ms | ok, 61 ms |
  | list 7 s | 200 at 7.0 s | ok, 43 ms | ok, 36 ms |
  | expire 7 s | 200 at 7.0 s | ok, 76 ms | ok, 55 ms |
  | create hangs | **409 CARD_NOT_OFFERED with the offline details at 31.0 s** | ok, 51 ms | ok, 45 ms |
  | list hangs | 200 (the page) at 31.0 s | ok, 49 ms | ok, 53 ms |
  | expire hangs | 200 (the page) at 31.0 s | ok, 52 ms | ok, 48 ms |

  * Each staff payment saved exactly 1 payment row.
  * During every click the invoice's row lock was `free`. `pg_stat_activity` showed only `idle:3`/`idle:4`: no `active` and no `idle in transaction`. So no lock and no connection is held across Stripe.
  * A hang now ends in the offline answer (create) or the page (list or expire), never a 500. Each logs one warn line (`kind: "stripe StripeConnectionError"` / `"StripeConnectionError"`).
  * Pool: 12 parallel clicks on one link with create at 6 s. Three got 200 at 6.4, 12.7 and 19.0 s, nine got 429 at 0.1 s, and there was one page. Meanwhile firm B's staff payment took 66 ms, its make-link 27 ms, its public GET 12 ms and its own click 6.3 s (its own create). The database showed `idle:11`.
  * 12 clicks on 12 links: all 200 at 6.0-6.1 s. A staff payment took 25 ms and a GET 10 ms.
* **m1 held for the 500** and is now by design for the two open pages. A Stripe error on list or expire no longer stops the new page being answered. This held for list 500/401/429/connection failure and expire 500/401: 200 each time, with one `card_pay_expire_failed` warn line. The old and new pages are both open (2) until the next click (back to 1) or the old page's expiry. See n-a.
* **m2 held.** The firm was renamed and renamed back within one slot. On Stripe: cs_6, cs_6, cs_6, one open page, and the client's page takes the card. On the fake rail: cs_fake_5 three times, and it takes the card. No payment can be deleted (no `moneyPayment.delete/update` anywhere), so the payment count in the key never goes back.
* **N1 held.**
  * Fake rail: cs_2, cs_2, cs_3. The old page is refused as "expired", and the new one takes 100000.
  * Stripe adapter: cs_1, cs_1, cs_2, with only cs_2 open.
  * Two tabs either side of a slot boundary: one open page.
  * Three tabs (create 800 ms, the 2nd and 3rd clicked 100 ms into the next slot): cs_36, cs_37, cs_37. Only cs_37 is open, and cs_36 refuses the card.
  * Four tabs at once: three got the same page and one got 429, with one page open.
  * Paging: 5 others at page size 2 → 5 list calls. 1,000 others → 11 calls in 2.8 s. Another invoice's pages are never touched.
* **n2, n3, n4 held** (unchanged code). n3: the expiry is exact (the new 45/45 test). n4: the fake refuses a card 1 s past expiry and takes one 1 ms before it.

## `oneAtATime` (pay.ts:47-55)
* A throwing fn (async, or a sync `throw`) rejects to that caller only. The next call on the key runs at once (0 ms), and the queue's tail never keeps the rejection.
* A fn that never settles blocks its key: calls 2-3 wait, and the 4th and 5th get `429 TOO_MANY_REQUESTS`. Another key runs at once. After release, all three finish, and three new calls are accepted again (no counter leak from the 429s).
* On Stripe the block is bounded by the SDK (10 s × 3). One invoice's create hung, with 5 clicks 200 ms apart: 409 offline at 31.0, 62.0 and 93.1 s, and the 4th and 5th got 429 at once. See n-b.
* During that block another invoice of the same firm got its page in 17 ms. After the hang the next click got 200 in 22 ms.
* Memory: 200,000 distinct invoice ids run and settled left +80 KB of heap after GC, so the map empties. 10,000 never-settling ids hold 13 MB, but only a fn that never settles keeps an entry, and on Stripe none does.
* Firm context (PF-12 walls) carries through the queue: every queued click succeeded under its own firm.

## Minor
**n-a. When Stripe's expire fails, two pages for one invoice can both take a card, and now the client has both URLs.** Steps:
1. Tab 1 clicks and gets page A, then stays on Stripe's page.
2. In a later slot, tab 2 clicks while list or expire fails (or hangs). It gets page B with a 200 (pay.ts:183-185).
3. Both are `open`, and A stays open until its own expiry (≤ 41 min). Measured: `expire_hang` → 2 open.

In round 3 the client got a 500 for B, so they held only A. Now they hold both. A second card payment would be money past what is due (FO-7b's "extra", part 2b), so this is the accepted trade-off in a new place, and it needs Stripe to fail part-way. The tests' wording "one page at most takes a card" holds only while expire works.

**n-b. Clicks queued behind a hanging Stripe each wait out their own SDK budget: the 3rd answers at 93 s.** Steps: Stripe hangs on one invoice's create; the client clicks 3 times within a second. The answers come at 31, 62 and 93 s. Every answer is bounded and correct (offline details). But a waiter does not know the click ahead of it has just failed, and no server or proxy timeout (none set in main.ts; a proxy's is often 60 s) would end it sooner. A waiter could take the first click's outcome, or be refused, instead of calling Stripe again.
Also, the code comment and the test say "at most 3 waiting", but the count includes the click that is running: one runs, two wait, and the 4th gets 429 (pay.ts:50, :154; check_fo7c "at most 3 waiting").

**n-c. (head update) Text from Stripe's `code` field can reach a log line through `kind`. It is filtered and cut, not fixed.** stripe-rail.ts:59 builds `kind` from `e.type` (the SDK's class name), `e.statusCode` (a number) and `e.code`, which comes from the response body. It keeps `[\w ./()-]` and cuts at 80 characters. Steps (scratch `kind4.ts`, mocked fetch):
* A 400 with `code: "Invalid API Key provided: <a made-up test-mode key, redacted> client@example.org"` logs `"kind":"stripe StripeInvalidRequestError/Invalid API Key provided <a made-up test-mode key, redacted>"`. The redactor leaves the key-shaped text in place.
* A hostile `type` (`<script>…`, a card number) did not get through: the SDK replaces it with its class name.
* A `code` of 300 characters is cut to 80.
* `message` and `decline_code` never appear.
* The expire path logs only the class name (`StripeAuthenticationError`, `StripeAPIError`, `StripeConnectionError`), so no processor text gets through there.

Real Stripe codes are fixed words (`card_declined`, `rate_limit`), so this needs a misbehaving upstream. A `^[a-z_]{1,40}$` test on `code` (else "other") would make `kind` fully fixed.

## What held
* No `sk_test`, `notreal` or Stripe message in any log line across all runs: 10 warn lines for list/expire/create failures, each `kind` a class name or `stripe <Type>[/<code>] (<status>)`.
* A page being paid while a later click expires it: Stripe refuses that expire and it is swallowed. The page stays `complete` and the new page is answered (unchanged accepted residual).
* Description `Invoice <number>` only (PR test exact). No deadlock and no `idle in transaction` in any run. 0 CARD payments and 0 trust entries from part 2a.
* PF-28 exception line: the pay-link route takes no field (the full amount due), so "missing" → 404 with a random id is by design. The ceiling rose 22 → 23 with a reason.
