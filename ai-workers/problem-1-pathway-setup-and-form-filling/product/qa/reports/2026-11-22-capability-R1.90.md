# qa capability R1.90 — self-serve sign-up, email check, trial with no card, private links, trial banners

22 Nov ~11:4x IST · main 01841047d · isolated copy :4470 (`PLATFORM_IDENTITY=local`, fake BillingPort, no Stripe key) · live AI off · US$0 · Opus 5.5.

**Verdict: Partial.** Journey `prototype/studio/tests/journeys/j_90.ts`: 27/32, twice, same lines; exit 1. Journey score not awarded: two of the row's four clauses are not built (P-606).

## Journeys (persona: a firm's Owner signing up; our staff for the private link)
| # | Journey | Result |
|---|---|---|
| W1 | Pricing → Start free trial → Sign up → Check your email → the link → Confirm my email; no card on the way | PASS (10 lines). Empty form refused on each field in words. Opening the link makes nothing; Confirm makes one firm, one TRIAL subscription, trial end = +14 days. No request to stripe.com |
| W2 | The link refused in words: wrong code, used link, expired link | PASS (4 lines). "That code is not the one we sent."; "This link cannot be used. This link has expired or was already used." with Send a new link and Sign in; no second firm, no firm from the expired link |
| W3 | The trial counts days | Plan and billing: PASS (3 lines): "Free trial: 14 days left (ends 6 Dec 2026)", then "3 days left" when the stored end is 2.5 days ahead. **Trial banner: FAIL (2 lines)**: no banner on Home or Team; `GET /api/platform/billing/banner` → 404 "Cannot GET" |
| W4 | A private plan link works once | **FAIL (3 lines)**: `POST /api/platform/signup-links` → 404 "Cannot POST"; `GET /api/public/signup/:token` → 404 "Cannot GET"; the table `platform_signup_link` exists with 0 rows; no screen |
| W5 | Ends at R1.91's first step | PASS: the Owner's "Manage plan and billing" is offered |
| W6 | 400, 1024, 1440 px and axe WCAG 2.2 A/AA on Pricing, Sign up, Plan and billing | PASS (9 lines) |

## Parts missing (for a builder)
* **PF-16: the trial banner** — `GET /api/platform/billing/banner` (days left, card on file, amber in the last 3 days; Owner and Admin) and the banner on every signed-in page. Proof needs **no outside key**: it reads our own subscription record.
* **PF-5: the invited sign-up** — `POST /api/platform/signup-links`, `GET|POST /api/public/signup/:token` (the table and its single-use trigger are on main). **PF-5s: the invited sign-up screen.** Proof needs **no outside key**.
* Not in this row's done-when and not walked: PF-16's billing emails (R1.91's clause).

## Notes
* Pricing on a copy without Stripe shows "Prices unavailable … Price not shown" for every plan. Honest words; real prices need Stripe's price ids (the founder's account), not this row.
* The expired link is made as PF-5's own check makes it: a pending sign-up dated 25 hours ago. The database refuses moving a live sign-up's expiry.
* Not tested: a real screen reader; an intended user's unaided walk (D17, D20); the shared demo (:4400 is not reachable from this cloud copy).
* Screenshots: `product/screens/J-90/screenshots/`.
