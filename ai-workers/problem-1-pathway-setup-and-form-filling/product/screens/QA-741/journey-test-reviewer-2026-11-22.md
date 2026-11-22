# Journey test (reviewer): R1.89 public pricing page after the QA-741/742 fix, 22 Nov

**Setup**
- Head: `6dc0f3c0da57107d3371a7dbe11fa06fccb33ebc`.
- Isolated copy `rv741` on :4434 (`PLATFORM_IDENTITY=local`, `PLATFORM_ENVIRONMENT=local`), with no Stripe key and no AI key. Live AI was off, nothing called Stripe, and the only host requested was `localhost:4434`. The copy was stopped afterwards.
- The walk was a headless Playwright script, deleted after the run. Its screenshots are in the reviewer's scratchpad and are not committed.

**Persona:** the owner of an immigration firm with no account yet. Goal in their words: "See what each plan costs and start a trial."

## Journeys
| # | Kind | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Main path | Open /pricing at 1440 px; read the cards; choose Yearly; press Start free trial on Team | Sample prices are shown, the yearly prices switch in, and Sign up opens with the plan and period | Held. $49 / $99 / $199 per month, CAD, "+ applicable taxes"; Yearly shows $490 / $990 / $1,990; Sign up opens with "Team (Sample), yearly". Load time 281 ms |
| J2 | Keyboard only | Tab through the page | The period choice, each card's button and Sign in are all reachable | Held. Order: period, the three buttons, Sign in |
| J3 | Screen sizes | 400, 1024, and 720×450 at device scale 2 (200 % zoom) | No sideways scroll; axe finds nothing | Held. axe finds 0 issues at every size; nothing scrolls sideways |
| J4 | Empty | Set every plan's cents to NULL | "Prices unavailable" notice and "Price not shown" on each card | Held. axe finds 0 issues |
| J5 | Error | The plans call answers 500 | The page shows the problem in plain words | Held. "Plans could not be loaded — The server could not answer." (the only console error is that 500) |
| J6 | Alternate (QA-742) | Team set to 0 trial days, then open Sign up for Team | No trial words anywhere | Pricing held: no trial line, button "Sign up", lead without "Every plan starts with a free trial". **Sign up did not hold:** heading "Start your free trial" and submit "Start free trial" (m1) |
| J7 | Recovery | Choose Yearly, open Sign up, press Back | Yearly is still chosen | **Not held:** Pricing returns to Monthly (QA-742's "Also seen"; m4) |
| B | Break it | Cents 4999; cents 2147483647; a plan switched off; partly priced plans | Correct amounts; inactive plans hidden; layout holds | Held. $49.99; $21,474,836.47 with no sideways scroll; the inactive plan is hidden; with some plans unpriced, each card says "Price not shown" and there is no page-wide notice |

**Data underneath:** after every journey, `platform_plan` was read back. The prices and trial days matched what was set, and everything was put back afterwards (`solo:4900:49000:14:true`, `team:9900:99000:14:true`, `firm:19900:199000:14:true`). The page only reads data, so there is no audit line to check.

**Automated replays:**
- `check_pf5s1_signup_browser` 53/53 (it includes the new QA-741/742 pass and fail pairs).
- qa's `j_89` from #2912: 11/14. W3 (×2) and W7 fail on their own assumption that cards show no price digits. The review explains why.

## Findings
- **m1 (Minor):** a 0-day plan's Sign up page still says "free trial" (`signup-page.tsx:113`, `:143`).
- **m4 (Minor):** Back from Sign up loses the Yearly choice.

The review also lists m2 (nothing tests the runtime wiring) and m3 (the notice wording when Stripe is unreachable). Neither can be walked in the browser on a copy with no key.

## Score
| Criterion | Score |
|---|---|
| Task completed | 1 |
| Next step obvious | 1 |
| Plain words | ½ (m1) |
| Feedback and state | 1 |
| Correct data | 1 |
| Error recovery | ½ (m4) |
| Accessibility and screen sizes | 1 |
| Speed | 1 |
| Visual quality | 1 |
| Trust and sources | 1 |

**9/10. Pass** (8 or more, and no criterion at 0).

To raise it:
1. Take Sign up's heading and button text from `trialDays` (m1).
2. Keep the period when the person comes back to Pricing (m4).

**Not tested:**
- a real screen reader
- a visible-browser walk by a person
- a real Stripe key
- an intended user's unaided walk (D17 and D20 stay with the founder)
