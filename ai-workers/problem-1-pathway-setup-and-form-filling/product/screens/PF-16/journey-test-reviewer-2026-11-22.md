# Journey test: PF-16 trial banner (reviewer, 22 Nov 2026)

PR #2935, head `05067ca66d335288dae123ee9433840b35b97c34`. Isolated copies `rev_pf16b` on :4433 and `rev_j90` on :4434, both with `PLATFORM_IDENTITY=local` and the fake BillingPort. Never :4400. Walked headless with Playwright, using only what a person sees; the stored trial state was set through the copy's database (the clock's stand-in).

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | The Owner of a new firm: "how long is my trial?" | Sign in → Home → Team | Neutral banner "Free trial: 14 days left (ends …)", "Add a card" | Held (B1; `b1-team-14-days-1440.png`) |
| J2 alternate | The Owner, 2.5 days left: "do I need to act?" | Home → Team → "Add a card" | Amber, "3 days left"; the link opens Plan and billing | Held (B2, j_90 W3) |
| J3 boundary | The Owner hands over to Plan and billing | Click "Add a card" | Plan and billing, banner still shown, the same count | Held (B2) |
| J4 empty | The Owner of a paying firm | Home, Team | No banner | Held for ACTIVE with no trial end (B3). ACTIVE with a kept trial end: the read gives `show:false` (probe P2), but no test covers it |
| J5 wrong role | A Case Officer opens Home, or calls the read by URL | Home, `GET /api/platform/billing/banner` | No banner, no request; 403 | Held (B4, `asked 0`) |
| J6 other role | An Admin | Home | Amber banner | Held (B4) |
| J7 error | The trial end has passed, Stripe's event not yet in | Plan and billing | "ended on <date>", no card ask (as `trialLine`) | **Failed:** the banner says "ends today (20 Nov 2026). Add a card before then…" on 22 Nov, and the page under it says "ended on 20 Nov 2026" (probe P1, `probe-past-end-1024.png`) |
| J8 error | A trial set to cancel in the portal | Any page | "set to cancel, no payment will be taken" | **Fails by code:** `banner.ts` never reads `cancelAtPeriodEnd`. Not walked in the browser (the fake was not set to cancel) |
| J9 recovery | The Owner returns from adding a card | Plan and billing | The banner drops its card ask with the page | Code: the banner is cached 60 s and not invalidated with the page (m2). Not walked (needs Stripe's return) |
| J10 sizes and keyboard | Keyboard only, 400/1024/1440, 200 % zoom | Tab from the page top | The link is reachable, no sideways scroll, axe clean | Held: axe 0 violations ×6; 512 px no scroll; the link is the 31st Tab stop, after the menu, with a visible ring |

## Replayed as automated checks
* The builder's `check_pf16_banner_browser.ts` ran twice: 21/21 both times, about 20 s each run, no page error, no Stripe request.
* qa's `j_90.ts` scored 29/32. All of W3 passed; W4 (private link) belongs to another part.

## Data underneath
* The read writes nothing: the check restores the subscription row, and the route has no write.
* Roles are enforced on the server: 403 with "Your roles do not include the permission this needs (agent/subscription:pay)."
* The query runs through `firmScope`.
* The days come from the stored `trial_ends_at` with the same `ceil` rule as Plan and billing. With 5 hours left the read gives `daysLeft 1`, so 0 only ever means the end has passed.

## Break it (15 min)
* By URL as a Case Officer: 403 (held).
* A firm not in a trial but with a kept trial end: `show:false` (held, untested).
* An end in the past: wrong words (**Major**, J7).
* Set to cancel: wrong words (**Major**, J8).
* No inputs, so long or non-English text, duplicates and two tabs do not apply: the route is read only.

## Score (journey-test §6)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J3: the days are shown on every page tried |
| Next step obvious | 1 | "Add a card" goes to Plan and billing (B2) |
| Plain words | ½ | Plain, but false for a passed end (J7) and a trial set to cancel (J8) |
| Feedback and state | ½ | Stale up to 60 s after a card is saved (m2) |
| Correct data | ½ | A past date called "today"; a payment promised that will not be taken |
| Error recovery | 1 | A failed read shows nothing and the page works; Stripe down gives no card claim |
| Accessibility and screen sizes | 1 | axe clean ×6, 512 px no scroll, `role=status`, keyboard reachable |
| Speed | 1 | One small read per person, cached 60 s; whole check about 20 s for about 20 page loads |
| Visual quality | ½ | On Home it sits under the demo "Release 1 screens" card and is wider than the column (`b2-home-3-days-amber-1440.png`) |
| Trust and sources | ½ | From the stored trial end, but it contradicts Plan and billing on the same page (J7) |
| **Total** | **7.5 / 10** | **Below the 8 pass line; no criterion at 0** |

## Fixes that raise the score (most valuable first)
1. Build the banner's words with `trialLine`'s rule: a passed end reads "ended on <date>" with no card ask, and a trial set to cancel says no payment will be taken. This raises plain words, correct data and trust: +1½.
2. Invalidate the banner's query when Plan and billing confirms a card: +½ feedback.
3. Mount the banner above the demo intro slot on Home: +½ visual.

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17/D20 stay with the founder).
* Stripe's real return from Checkout.
* A fake subscription set to cancel.

## Round 2 (head 4bbdc547f, :4435)
* J7 now holds: the banner says "Free trial: ended on 20 Nov 2026.", the same as Plan and billing, with no card ask (probe P1).
* J8 now holds: "set to cancel then, so no payment will be taken", checked on the read and on screen (B7).
* J4 is now covered with a kept trial end (B3).
* The held firm gets no banner.
* The check passed 29/29 twice. j_90 scored 29/32, with W3 5/5.
* **Score: 9 / 10, pass.** Plain words, correct data and trust each go up to 1. Feedback (60 s cache) and visual quality (width on Home) stay at ½.
