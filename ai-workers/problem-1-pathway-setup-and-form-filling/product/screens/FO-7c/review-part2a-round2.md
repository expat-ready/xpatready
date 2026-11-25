# FO-7c part 2a review, round 2 (reviewer, fresh context, diff only): the pay link and the client's pay door

**Verdict: Changes** (Ship after fixes). No Blocker, 1 open Major (new: R2-M1). Not approved, so no `review: approved` label for this head.
* **Head reviewed:** `72835e584b07d9b5ab842d373db5f178b563be6f` on `claude/eloquent-goodall-y7jjmw`. I read only `git diff d4b1185d79dcdd50513301bc65a6f93d5107487d 72835e584 -- prototype`: `pay.ts`, `rail.ts`, `stripe-rail.ts`, `routes.ts`, the two suites and `j_57.ts`.
* **Bar:** round 1's `review-part2a.md` (M1-M5) and `break-report-part2a.md` (M1-M2, m1-m4); the builder's comment on #3633 (25 Nov 05:53); brief DW5, DW8, DW11; AG-6-14 r2; AG-16-17; AG-6-49 r1.
* **Run** (from `prototype/`, Postgres :54329, never :4400, no network): `check_fo7c_pay_link.ts` **34/34**, `check_fo7c_card_payments.ts` **43/43**. I did not run j_57 (it would overwrite the committed screenshots).
* **Mutations:** 27 mutations in a scratch copy of `studio/` under the session scratchpad. The repo was not touched. Results are given under each finding.

## Round 1 findings
| Finding | Fixed? | Does a test fail without the fix? |
|---|---|---|
| Review M1 / break M1: the key is reused under a new link or a renamed firm | **Fixed.** `pay.ts:158-161`: the key is `fo7c-pay-<id>-<payments>-<sha256(every parameter sent)[:40]>`. | **Yes.** With the old key shape, 2 tests FAIL (new link, renamed firm). Hash without the URLs: 1 FAIL. Hash without the description: 1 FAIL. The fake now refuses a reused key with other parameters, as Stripe does (`rail.ts:94-96`). |
| Review M2 / break M2: an old page stays payable for 24 h; two reads | **Fixed in `pay.ts`; not tested on Stripe (R2-M1).** `expiresAtSec` gives 30-40 min (`pay.ts:41,157-159`). The due amount and the payment count are read in one repeatable-read transaction (`pay.ts:150-153`). | **Partly.** Removing `expiresAtSec`: 1 FAIL. A 24 h life: 1 FAIL. But removing `expires_at` from the **Stripe adapter** (`stripe-rail.ts:50`) passes 34/34 and 43/43. A 29-minute life also passes (Minor 1). Removing the repeatable read, or taking the amount from the earlier read (`_v`): both pass. The race cannot be tested without a planted interleave (Minor 4). |
| Review M3: what the rail is asked to charge | **Fixed** on the fake. Amount, currency, account and metadata are asserted, with a USD case (`check_fo7c_pay_link.ts:153-155,165-169`). | **Yes.** `totalMinor`: 1 FAIL. `due + 1`: 4 FAIL. Currency fixed to CAD: 1 FAIL. `metadata: {}`: 2 FAIL. The Stripe adapter's own translation is still untested (R2-M1). |
| Review M4 / break m1: Stripe's refusals give a 500 | **Fixed.** `stripe-rail.ts:53-59`: `StripePermissionError` or `account_invalid` → `RailAccountGone`; InvalidRequest, Idempotency and Card errors → `RailRefused`; everything else is rethrown. | **Yes.** Removing the mapping: 1 FAIL. Permission → refused: 1 FAIL. InvalidRequest left unmapped: 1 FAIL. The test runs Stripe's own SDK against a stand-in `fetch`. |
| Review M5: part 1's suite is red | **Fixed.** `check_fo7c_card_payments.ts:108` now expects 4 controllers; the suite is 43/43. The PR comment is corrected. | Yes, by construction. |
| Break m2: limiter memory | **Fixed.** A hard cap is applied oldest-first (`routes.ts:62-63`). | **No.** Removing the cap passes 34/34 (Minor 5). |
| Break m3 / review minor: a non-JSON body | **Fixed.** `notJson` gives 415 on both writes (`routes.ts:41-45,53,95`). | **Yes.** Removed from the door: 1 FAIL. Removed from `pay-link`: 2 FAIL. |
| Review minor: j_57 "W6 fail" passes with no card tried | **Fixed.** The check is now gated on `declined` (`j_57.ts:174`). | Code read only; j_57 not run. |
| Review minors: `no-referrer` on FO-7s2 part 2's page; the deposit refusal with FO-7w1 (#3654) | **Carried.** Both are noted only in the PR comment and in round 1's review. No BACKLOG, STATE or brief line exists at this head (Minor 6). | n/a |
| Review minor: j_57 shots w1, w3 and w9 are byte-identical | **Not addressed.** The diff touches no screenshot and the builder does not claim it. Carried. | n/a |
| Break m4: the suite never runs the real C5 wiring | Not claimed; FO-7b's party rule. Carried as round 1 had it. | n/a |

## The checks asked for
* **DW11 (same click while nothing changed → same page):** holds within one 10-minute slot. A probe made 4 POSTs in a row (no body, `""`, an empty form, a chunked body). They gave 1 key and 1 URL (`cs_fake_7`).
  * Across a slot boundary, the key changes because `expiresAtSec` is part of it. Two clicks with nothing changed can then give two live pages. This is part of the residual below.
  * Nit: the suite's DW11 check uses the real clock (`check_fo7c_pay_link.ts:58`). If s1 and s2 fall on either side of a 10-minute boundary, the check fails (about 1 run in 60,000). Pin the clock.
* **Is the 30-40 minute expiry valid for Stripe?** Inside 30 min to 24 h, yes, with no margin at the low end (Minor 1).
* **Does the repeatable-read snapshot run as the firm?** Yes. It is opened inside `open`'s `withFirm(firm from token)` scope. The pool sets `app.firm_id` and the role at checkout, before `BEGIN` (`firm-scope.ts` ~L586-591). This is the same pattern as `invoices/drafts.ts:186`. There is no bypass.
* **Does the fake's new refusal break part 1?** No. Part 1 is 43/43, and no other suite calls `createHostedPayment`.
* **Can the error mapping hide a real outage?**
  * Real outages are rethrown and become a loud 500: network, 5xx `StripeAPIError`, 401 authentication, 429 rate limit.
  * Mapped refusals are logged, but only as `info` with the invoice id. The error's type, code and request id are not in the line (Minor 2).
* **Does the 415 rule refuse an empty browser POST?** No. A probe sent `fetch(url, {method:"POST"})`, `body: ""` (text/plain, length 0) and an empty urlencoded form. Each got 200, so the client's Pay works. (Mutating the rule to "always JSON" also passes the suite, because every `call()` sends `application/json`. Add one no-header POST check if this case matters.)

## New findings
**R2-M1 (Major): the Stripe adapter's Checkout request is untested, so the M2 fix on the only rail that moves money has no failing test.**
* *What passes both suites (34/34, 43/43) after each of these edits to `stripe-rail.ts:46-52`:*
  * `expires_at` dropped: break M2 returns, a 24 h page;
  * `idempotencyKey` dropped: DW11 and break M1 fail on Stripe;
  * `stripeAccount` dropped: a charge on the **platform's** account, against AG-16-17;
  * `unit_amount: i.amountMinor + 1`: AG-6-14 r2.
* The last three lines are older than this diff. `expires_at` is this round's fix. Round 1's M3 has the same root ("what the rail is asked"), and the fix only reached the fake.
* *Scenario:* a refactor drops line 50. CI stays green, and every Stripe page lives 24 h again.
* *Fix:* the stand-in `fetch` is already in the suite (`stripeSays`, `check_fo7c_pay_link.ts:192-195`). Add one success case that records the request and asserts:
  * the `Stripe-Account` header is the firm's `acct_…`;
  * the `Idempotency-Key` header is the key sent;
  * the form body has `expires_at`, `line_items[0][price_data][unit_amount]`, the lower-case `currency` and the metadata.

**Minor 1: no clock margin on the 30-minute floor.**
* At the end of each slot, the page's life (`slot + 40 min − now`, `pay.ts:157-159`) falls to 30:00.0x. Stripe measures from its own creation time, after network latency and any clock skew. A request sent in the slot's last ~1 s can be refused as under 30 min, and then shows the offline answer.
* The test's floor is 29 min (`check_fo7c_pay_link.ts:180`), so a life Stripe would refuse passes. A 29-minute mutation gave 34/34.
* *Fix:* `MIN_LIFE_MS` = 31 min (31-41 min), and assert ≥ 30 min plus the margin with the clock pinned at a slot's end.

**Minor 2: the offline fallback does not record why.** `pay.ts:165` logs `card_pay_refused_by_rail` at `info` with only `invoiceId`. `RailRefused` drops Stripe's message (`stripe-rail.ts:57`). So three different causes look like scattered offline answers, and nothing in the log tells them apart:
  * a platform-wide fault, such as a restricted platform key (403 for every firm);
  * our own parameter bug, such as a bad `expires_at` (InvalidRequest);
  * Stripe's minimum-amount refusal.

  *Fix:* log at `warn` with the error type, code, HTTP status and Stripe request id (no key, no token). Say `gone` or `refused`.

**Minor 3: `pay.ts` turning `RailRefused` into the offline answer has no test.** Limiting the catch to `RailAccountGone` (`pay.ts:164`) passes 34/34, because the adapter half is tested apart from the door half. *Fix:* a fake switch, as `refuseRefunds` does for refunds, plus one door check: 409 `CARD_NOT_OFFERED` with the offline details.

**Minor 4: the one-snapshot fix is unproven by a test.** Removing `RepeatableRead`, or using `_v.dueMinor` with `snap.payments`, both pass. The code is right as read. Accept it or plant the interleave; it is the Lead's call.

**Minor 5:** the limiter's hard cap has no test.
* It evicts by insertion order, and `hits.set` on an existing key keeps its place. An address flooding more than 50,000 junk tokens in a minute therefore evicts its own `m|<ip>` counter and gets 300 more misses.
* This has no practical effect against a 256-bit token. It is recorded only so the cap is not read as a hard miss budget.

**Minor 6:** two follow-ups live only in the PR comment: `no-referrer` on FO-7s2 part 2's page, and the deposit refusal with #3654. Put one line in the FO-7s2 and FO-7w1 rows (or STATE) so they survive the PR (AGENTS rule 10).

**Nit:** a chunked non-JSON body (no `content-length`) passes `notJson` (probe: 200). This is harmless here (the body is ignored, and staff auth is a bearer token), but the comment says every other type is refused.

## The named residual (for the Lead)
The builder's case: a page handed out before the amount changed stays payable for at most 40 min, and money above the due amount becomes FO-7b's "extra" in part 2b.
* The residual is a little wider than that. Two Pay clicks in different 10-minute slots, with nothing changed, give two live full-amount pages. On the round-1 head (one key for 24 h) that case gave the same page.
* **I agree it is a Minor** while the following hold:
  * it is bounded (≤ 40 min, and each payment needs a deliberate card entry);
  * no money is lost (part 2b records the excess as extra, never as fees earned, and it is refundable; legal reading Unconfirmed: no counsel);
  * the full fix (a stored session id plus Stripe's expire call on a new link, a payment or a slot change) needs a migration, which Lead 4 ruled out for this part.
* Two conditions should be written into part 2b's row before Stripe test mode (part 5) goes live:
  * DW: "card money above the amount due is recorded as extra, with a test";
  * the Lead's choice on the expire call.

## Scores (this diff)
* **D1 4, D2 4** (the stale page is bounded at 40 min), **D5 4, D11 4** (no 500 on Stripe's refusals), **D16 3** (R2-M1, Minors 1, 3 and 5). D15 is 5, as before.
* The rest are as in round 1. BIC-01 to BIC-20 are N/A (no screen in this part).

**Journey score (reviewer, the one score for this check): 7.5/10, fail (below 8, no 0).** It is re-scored on this diff from round 1's `journey-test-reviewer-2026-11-25.md`. j_57 was not re-walked, by instruction, and there is no page of this part to walk. Each change is backed by the probes and suites above:
* Feedback and state ½ → 1: no 500 on Stripe's refusals.
* Error recovery ½ → 1: a new link now works.
* Correct data stays ½: the stale page is bounded but the adapter is untested (R2-M1).
* The others are unchanged: task ½, next step ½, accessibility ½, visual ½ all wait on FO-7s2 part 2. Plain words 1, speed 1, trust 1.

**Not checked:** a real Stripe test-mode call (part 5); Stripe's exact tolerance at 30:00 (no network); the two-tab race under real interleaving; j_57.

Reviewer: Changes 72835e584b07d9b5ab842d373db5f178b563be6f
