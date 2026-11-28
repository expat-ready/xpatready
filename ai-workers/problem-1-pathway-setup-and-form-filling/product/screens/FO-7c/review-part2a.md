# FO-7c part 2a review (reviewer, fresh context): the pay link and the client's pay door

**Verdict: Changes** (Ship after fixes). There is no Blocker and there are 5 open Majors. In this check's Approve/Block terms the PR is not approved, so no `review: approved` label for this head.
* **Head reviewed:** `d4b1185d79dcdd50513301bc65a6f93d5107487d` on `claude/eloquent-goodall-y7jjmw`, `git diff origin/main...d4b1185d7` (base 63f5cc913). The branch has since moved on to `db0ac6085` ("break M1-M2, m1-m3 fixed"). That head is **not** reviewed here, and the next round reads only the diff from d4b1185d7.
* **Bar:** brief `design/briefs/FO-7c.md` part 2 (DW4, DW5, DW8, DW11); `shape-r1.57.md`; Lead 4's approval on #3633 (payAllowed for PF-27, FO-7s2 elsewhere, no migration); AG-6-14 r2-3; AG-6-49 r1; AG-16-17; P-567 (3). The pattern copied is `front-office/signing/door.ts` and `door.controller.ts`.
* **Run** (from `prototype/`, Postgres :54329, isolated copies on runtime ports :4436 and :4437, never :4400):

| Suite | Result |
|---|---|
| `check_fo7c_pay_link.ts` | 26/26 |
| `check_fo7c_card_payments.ts` | **42/43, setup FAIL** (Major 5) |
| `check_forms_qa53.ts` 4436 | 49/49 |
| `check_pf12_walls` | 110/110 |
| `check_pf12b_doors` | 33/33 |
| `check_fo7b_c5_scope` | 37/37 |
| `check_fo7b_invoices` | 108/108 |
| `check_bypass_uses` | 52/52 |
| `check_b164` | 67/67 |
| `j_57.ts rv57j 4437` | 9/22, the same as the PR's run; every failing label names its part |
| `graph.mjs --check` | G1/G2/G4/G5 = 0 |

  13 mutations were run in a scratch worktree, which has since been removed. They are listed under Major 3.

## What holds (checked)
* **Token:** firm-first, with 32 random bytes (256 bits) (`pay.ts:77`). Only its SHA-256 is stored: the DB row equals `sha256(token)`, checked on the copy. The lookup is `{firmId, hash}` inside `withFirm(firm from token)` (`pay.ts:97-108`), with no bypass, as in `door.ts:56-60`. A forged firm prefix changes the hash and gets the one 404.
* **One not-found:** I tried an unknown firm, an upper-case prefix, a 5,000-character token, `%C3%A9`, a one-character change, a replaced link and a settled link, on GET and POST. All gave the same 404 `LINK_NOT_WORKING`, with `no-store` / `no-referrer` on every answer.
* **C5 scope:** `invoiceInScope` runs before the `FOR UPDATE` and the write (`pay.ts:79-86`). Removing it fails DW4.
* **Lock refusal:** comes after the 404 and uses neutral words. Removing any of the three `payAllowed` checks fails a test.
* **Audit:** one line inside the transaction, with the staff actor, the amount and a `replaced` flag. The token is not in it.
* **The GET writes nothing:** no audit line, no payment, no rail call (DW11). Its only side effect is the in-memory limiter.
* **No secrets:** none in code, answers or logs. The request log records the route pattern, not the path (`hook.ts:30-35`).
* **Money goes only to the firm's own account:** the account is read by `firmScope(firm)` and must be `ACTIVE` with charges enabled; otherwise no card is offered (no fallback, AG-16-17). Nothing writes trust.
* **qa53 lists:** `PUBLIC_WRITES` is still in code-point order ("messages" < "pay" < "sign-fake") and `REVIEWED` is compared sorted. Suite 49/49.
* **Deposit invoice:** no predicate exists on main. This is said in the PR, as the brief allows.

## Majors (must fix)
1. **A new link means a 500 at "Pay" for 24 h on Stripe.** The idempotency key `fo7c-pay-<id>-<due>-<payments>` (`pay.ts:149`) does not cover every parameter that is sent: `successUrl`/`cancelUrl` hold the token (`pay.ts:146`), and the description holds the firm name. Stripe refuses a key that is reused with other parameters (`idempotency_error`), and `pay.ts:152` re-throws it, so the client gets a 500.
   *Scenario:* link T1, Pay (session made); staff press "Copy pay link" again, which has to mint T2 because only the hash is stored; the client opens T2 and presses Pay → 500.
   The fake's `once()` (`rail.ts:82`) ignores the parameters, so no test can catch this.
   *Fix:* key over every parameter sent (or keep the URLs and the description out of what can vary), and make the fake refuse a key reused with other parameters, as Stripe does.
2. **A hosted page handed out earlier can charge more than is due.** `stripe-rail.ts:46-49` sets no `expires_at` (Stripe's default is 24 h), and nothing expires an open session when the amount changes or the link is replaced. In addition, the due amount (read in `open`, `pay.ts:103`) and the payment count (`pay.ts:145`) are not one snapshot.
   *Scenario:* due 1,000 → session S1; staff record 400 offline; the next session S2 is for 600 under a new key (the suite's own DW5 step, `check_fo7c_pay_link.ts:150-152`); S1 is still payable → 1,000 + 600 on a 1,000 invoice. The same happens after a full credit or a replaced link.
   *Fix:* a short `expires_at` (Stripe's minimum is 30 min); read the amount and the count in one snapshot; record for part 2b that card money above the due amount is extra, never lost.
3. **Nothing tests what the rail is asked to charge (AG-6-14 r2).** The DW11 and DW5 checks (`check_fo7c_pay_link.ts:148-152`) assert only the key and the GET's `dueMinor`, while the test's name says "the session is for exactly the 600.00".
   *Mutations that still pass 26/26:* `amountMinor: v.totalMinor`, `v.dueMinor + 1`, `currency: "CAD"`, `metadata: {}`.
   *Fix:* assert the rail's recorded `amountMinor`, `currency`, `account` and `metadata.firm_id`/`invoice_id` for s1 (100000) and s3 (60000), plus one USD invoice.
   The other 9 mutations were each caught by a test: C5, settled-link, 3 x lock, ACTIVE, key-without-count, audit, Referrer-Policy.
4. **On the real rail, "account down" gives a 500, not the offline details (AG-6-49 r1).** `pay.ts:152` catches only `RailRefused`/`RailAccountGone`, but `StripeCardRail.createHostedPayment` (`stripe-rail.ts:44-52`) maps no error, unlike `readAccount` (`:36-38`).
   *Probe* (offline, with `fromKey(..., fetchFn)`): a 403 `account_invalid` throws `StripePermissionError`, and a 400 "cannot make charges" throws `StripeInvalidRequestError`. Neither is a Rail error.
   *Scenario:* the deauthorize or charges-off event is late or missed, so the row still says ACTIVE; the client presses Pay and gets a 500. The DW8 "never a 500" check (`check_fo7c_pay_link.ts:141`) proves this only on the fake, and the PR body's "never a 500" is not true on Stripe.
   *Fix:* map these errors in the adapter and test it with a `fetchFn` stub.
5. **Part 1's suite is red on this head.** `check_fo7c_card_payments.ts:108` asserts `feature.controllers.length === 2`, and this PR makes it 4 (`features/client-money-card.ts:39`) → `FAIL setup`, 42/43. `select-suites.mjs` selects this suite for the diff, so CI is red. The PR body says "43 passed, 0 failed … unchanged".
   *Fix:* update the setup check to name the four controllers, and correct the body.

## Minors (should)
* `routes.ts:82` — the public `POST …/session` takes any content type and ignores the body (`text/plain` was accepted on the copy). The signing door answers 415 to a body that is not JSON (`door.controller.ts:58-64`), which is its guard against a cross-site form POST. Copy that.
* `pay.ts:146` — the bearer token goes to Stripe inside `success_url`/`cancel_url`, so it is stored in the firm's Stripe dashboard. Today `/money/pay/<token>` serves the staff shell's "Page not found" with no referrer meta. Part 4 (FO-7s2) must set `no-referrer` on that page.
* `pay.ts:53-58` — FO-7w1 (#3654, open) adds `money_invoice.deposit`. Whichever PR merges second must add the refusal (brief DW5) and its test. Add one follow-up line now so it is not missed.
* `j_57.ts:174` — "W6 fail: the declined card leaves the invoice unpaid" passes with no card attempted: the pass means nothing. Gate it on W6's decline having happened.
* `product/screens/J-57/screenshots/w1`, `w3` and `w9` are byte-identical (70090 B): the staff app's "Page not found", labelled as three different steps. Name them as missing-part shots.
* The breaker's reports of an uncapped limiter memory and a `text/plain` body taken by the staff route: I did not re-verify them, and both are addressed on db0ac6085.

## D1-D20 (API-only part; scored 1-5)
* **D1 4:** DW4/5/8/11 are present, apart from Majors 1-4.
* **D2 3:** the lock is serialised and replacement is audited; a stale session can overcharge (Major 2).
* **D5 3:** a replaced link → 500 (Major 1).
* **D6 4:** audit line present.
* **D10 4:** plain refusal words; "lock" appears nowhere.
* **D11 3:** codes are clear; the real rail gives 500s.
* **D15 5:** GET 10-20 ms, POST 8 ms.
* **D16 2:** the money rule has no failing test (Major 3) and part 1's suite is red (Major 5).
* **D18 4:** Sample is marked; "Unconfirmed: no counsel" is in the code.
* **D19 2:** the link opens a missing page until FO-7s2 part 2.
* **N/A here:** D3, D4, D7, D8, D9, D12, D13 and D14 (no screen in this part).
* **Simulated only:** D17 and D20.

**BIC-01 to BIC-20:** N/A. There is no case-side screen in this part (FO-7s2 builds them, by Lead 4's decision 4).
**Journey score (reviewer, the one score for this check): 6.5/10, fail**, in `journey-test-reviewer-2026-11-25.md`.

**Not checked:** a real Stripe test-mode call (part 5); a screen reader; the breaker's non-deterministic two-tab race (I saw the code path, not the race).

Reviewer: Changes d4b1185d79dcdd50513301bc65a6f93d5107487d
