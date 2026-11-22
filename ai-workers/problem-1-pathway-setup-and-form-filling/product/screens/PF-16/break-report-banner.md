# PF-16 trial banner: break report (PR #2935, head 05067ca66)

Breaker, 22 Nov 2026 (cloud). Scope: `GET /api/platform/billing/banner` (`api/src/platform/billing/banner.ts`, `api/src/features/platform-billing-banner.ts`) and `web/src/modules/platform/trial-banner.tsx` mounted in `web/src/modules/platform/frame.tsx:99` (paths under `prototype/studio/`). Plan changes, Start now and billing emails are not in this part and were not checked.

Set-up: isolated copy `brk_pf16b` with `PLATFORM_IDENTITY=local`, fake BillingPort, US$0, no Stripe, live AI off. Started on :4434. Part way through, another lane's copy (`rev_j90`) took :4434 and stopped my server, so I moved to `restart` on :4457 with the same database and re-ran every result below there. Stopped at the end (database dropped). Staff for each of the six roles were seeded in `sample-firm` (as in `tests/check_pf16_banner_browser.ts`). The trial was set over psql. Pages were checked with Playwright (Chromium) and axe (WCAG 2.2 A/AA).

## Blockers
None.

## Majors
**M1. A trial whose end has passed reads "ends today" with an old date and asks for a card "before then".** It contradicts Plan and billing on the same page.
* Repro: `update platform_subscription set status='TRIAL', trial_ends_at=now()-interval '5 days'` for sample-firm. Sign in as the Owner and open `/settings/billing`.
* Expected: the same rule Plan and billing already applies after its R2-m1 fix (`web/src/modules/platform/saas/billing-contract.ts:48-49`): once the end has passed, say "ended on …" and never word it as if it were still ahead. At most, say nothing.
* Actual: the API gives `{"show":true,"daysLeft":0,"trialEndsAt":"2026-11-17…","tone":"amber"}`. The banner says **"Free trial: ends today (17 Nov 2026). Add a card before then to keep access."** On the same page, Plan and billing says **"Free trial: ended on 17 Nov 2026."**
* Cause: `banner.ts:22` clamps a past end to 0, and `trial-banner.tsx:23` turns `daysLeft === 0` into "ends today". The answer has no "past" flag, and the banner does not compare `trialEndsAt` with now.
* Reachable whenever Stripe's trial-end event is late or lost. On the fake BillingPort (local copy, demo) no event ever comes, so the wrong text stays indefinitely.
* Not covered by the check: its "fail" pair for a passed end only tests `bannerDaysLeft` (it returns 0) and never the words.

## Minors
**m1. "0 on the last day" is not what the code does.** The PR body and `banner.ts:7,21` both say it. With `ceil`, a trial with 3 hours left reads 1, and 0 only comes once the end has passed. Results on 22 Nov:
* UTC or Toronto, end in 3 h: "Free trial: 1 day left (ends 22 Nov 2026)".
* Toronto, end in 26 h: "2 days left (ends 23 Nov 2026)".
* So the "ends today" wording never shows on the real last day; it only shows after the end (see M1).
* The design (`plan.md` §3) said days are counted "in the firm's time zone (Toronto by default)". The build counts 24-hour blocks from the server clock but prints the date in the browser's zone. Plan and billing shares this rule, so a fix belongs to both, or the comment and PR text should be corrected.

**m2. "Every staff page" is overclaimed.** The PR's demo text says "Every staff page (Home, Team, Plan and billing, Bookings…)", and the row (BACKLOG PF-16) says "on every page".
* Signed in as the Owner with 10 days left, the banner shows on `/home`, `/platform/team`, `/settings/billing` and `/front-office/bookings`.
* It does **not** show on `/front-office/leads` or `/front-office/prospects`: those use `SalesFrame` (`web/src/modules/front-office/sales/sales-frame.tsx:56`), which shows the same signed-in person. `/cases` and `/clients` (the Studio's simulated-person frame) do not show it either.
* Either mount it in `SalesFrame` or say "PF-6's frame only" in the PR and on the demo.

**m3. The comment says a held firm answers `show:false`, but the code never checks the firm.** `banner.ts:9` says "a held firm is not in a trial".
* Repro: firm `PAYMENT_HOLD` with the subscription row still `TRIAL`, 10 days left. Other routes answer 402. The banner answers `{"show":true,"daysLeft":10,"tone":"neutral"}`, so the hold notice and "10 days left" would show together.
* The webhook moves both rows together (`webhook.ts:44`), so this needs out-of-step data. It is low risk, but either read `platform_firm.status` or correct the comment.

**m4. The banner keeps old data for up to 60 s inside a tab.** `trial-banner.tsx:29` sets `staleTime: 60_000` and nothing invalidates `["pf","billing-banner",…]`.
* Repro: Owner on Home ("10 days left"). Set the subscription to `ACTIVE` over psql. Move to Team inside the app within 60 s: still "Free trial: 10 days left … Add a card". A full reload clears it.
* This matters once PF-17's "extend a trial" or PF-16's "Start now" exist. For now the return from Stripe is a full page load, which clears it.

**m5. One Stripe read per page load for every Owner and Admin of a firm that has a Stripe subscription.** `banner.ts:32` calls `subscriptions.retrieve` uncached (60 s per tab only). That is harmless at Sample volume, but it is a per-page live Stripe call. Consider reusing the webhook's stored state or caching per firm.

**m6. On Plan and billing, "Add a card" links to the page it is on.** `trial-banner.tsx:35` links to `/settings/billing` while you are on `/settings/billing`. Pressing Enter does nothing visible: no scroll and no focus move. The page already has its own "Add a card" button.

## What held
* **Roles:** Owner and Admin get 200. Case Manager, Case Officer, Billing / Finance and Read-only get 403 `MISSING_PERMISSION`, also through `/banner/`, `/Banner`, `?x=1` and HEAD.
  * An Admin whose grant ends mid-session gets 403 on the next call, and 200 again once re-granted.
  * A suspended Admin gets 401 `staff-not-active`.
* **Other firm:** the sample-solo Owner reads only sample-solo's trial (2 days, amber) while sample-firm has 10 days. `?firmId=`, `x-firm-id` and `x-firm-key` from the other firm are ignored.
* **Tokens:**
  * no token: 401 `NOT_SIGNED_IN`
  * a forged token: 401 `TOKEN_REFUSED`
  * an `x-actor` persona with no bearer: 401
  * a signed-out session: 401 `SESSION_REVOKED`
  * an earlier session replaced by a newer sign-in: 401
  * An expired token cannot be minted from outside (random HMAC key). Expiry is the shared guard's check (`identity/local.ts:38`).
* **Terms:** with a newly published terms version, the read answers 428 `TERMS_PENDING`, and the frame does not mount the banner while terms are pending (`frame.tsx:99`).
* **Hold:** `@HoldOpen` holds. A held firm gets 200 on the banner while Team gets 402.
* **Trial edge cases:**
  * no trial end gives `show:false`
  * ACTIVE gives `show:false`
  * exactly 72 h left gives 3, amber
  * 72 h + 1 s gives 4, neutral
* **Several subscriptions:** a newer ENDED row next to an older TRIAL row picks the TRIAL row, the same as Plan and billing. A second live row is refused by `platform_subscription_one_live`.
* **BillingPort failing:** an unknown `stripe_subscription_id` (the fake throws) gives `cardOnFile:null`, 200, and no card sentence or link.
* **Writes nothing:** 50 sequential and 40 concurrent reads (20 at a time) all returned 200. `module_event`, the subscription's and the firm's `updated_at` were unchanged. Latency p50 9 ms, p95 12 ms. POST gives 404.
* **Person switch in the same tab:** Case Officer → sign out → Owner → sign out → sample-solo Owner.
  * The Case Officer had no banner and no request.
  * The Owner had the firm's 10 days.
  * After sign-out there was no banner.
  * The solo Owner had solo's 2 days, not a stale firm-A banner, because the query is keyed by token.
* **400, 1024, 1440 and 200 % zoom (720 px at 2×), amber and passed-end states:**
  * The banner shows at every width and nothing scrolls sideways.
  * **axe: 0 violations** at every width.
  * Keyboard: "Add a card" is reachable by Tab in DOM order (after the demo intro links), shows a 3 px focus ring, and Enter opens Plan and billing.
  * `role="status"` comes from `Notice`.
  * At 400 px on Home the banner sits under the DEMO-LINK intro, below the first screen. That intro is not this PR's.
* **No Stripe request from the browser**, and no page error.

Screenshots (breaker's scratch, not committed): `past-trial-billing-1440.png` (M1), `leads-no-banner-1440.png` (m2), and the `a11y-*` set.

Verdict: Changes
