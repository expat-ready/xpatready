# Journey test: PF-5s S8 invited sign-up, reviewer, 23 Nov 2026

Commit `65e4e1fa39bc666f0a71e89f42f4ab366c3ccf77` (PR #3202). Isolated copy :4613 (`rev_pf5si`, `PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`, fake BillingPort, live AI off, US$0, no Stripe call). Walked headless in Playwright through the screens only: click, type, read. Our staff's links were made through the API, because their console is Not built (concept §2). Scripts and screenshots are in the reviewer's scratch folder, not committed. The builder's replay is `tests/check_pf5s_invited_browser.ts` (32/32 twice) and `j_90.ts` W4 (4/4).

## Journeys (persona: the invited firm's future Owner, unless named)
1. **Main path:** "Our account manager sent me a link; I want my firm set up." Open link → the email and plan are fixed → password, firm name, tick → double-click Start free trial → Check your email → the email's Confirm → firm key.
   * **Held:** the token leaves the address on load. One pending sign-up despite the double click. Focus goes to "Check your email". One firm in TRIAL, monthly, on the link's plan. 3 terms rows. Audit "Firm created by invited sign-up, from a private link". The link is marked used with its firm.
2. **Error on the form:** blank tick and a short password → refused on the fields and in the summary, nothing sent (IV2). Server refusals (12 spaces, firm name "A") → "Not only spaces." and "2 to 120 characters." on the fields, focus on the summary, input kept (1024 px).
3. **Long and non-English text:** a firm name of "Cabinet d'immigration Ünïcödé 移民事务所 x…" is cut at 120 by the input and stored exactly.
4. **Recovery (reload):** typed firm name, then reload → "This sign-up link doesn't work / Open the link from your invitation again". Typed values are lost, and the heading calls a working link dead.
5. **Two tabs on one link:** both send → 2 pending, 1 live → both emails' Confirm → **one firm**.
6. **The link's email already has a firm:** the form opens. Not submitted; G7 says the answer is the same Check your email.
7. **Link states:** used, expired, malformed (two shapes), no token, and a second link in the same tab → the one dead page with "reply to the invitation email" and "Already set up? Sign in" (→ `/account`, the staff sign-in). Plan withdrawn → "This link's plan is not offered … Ask us for a new link": a dead end that §7b M4's Change would avoid.
8. **Wrong role:** making a link with no token → 401; with a firm Owner's token → 403, nothing stored (j_90 W4).
9. **Too many tries:** the 11th send from one IP in 10 minutes → "Not sent: Too many tries from here. Wait a minute, then open the link again." Reopening would lose the typed input; pressing the button again later is the real fix.
10. **Sizes and keyboard:**
    * 375 px: keyboard only, Enter refuses, Space ticks, Enter sends (IV5).
    * 200 % zoom (640 CSS px): no sideways scroll, axe empty.
    * Tab order: password → firm name → tick → three terms links → Start free trial → Sign in.

## Data underneath
Each record exists once. The values are exactly what was typed. Opening the link stores nothing (IV1 fail line). An expired link writes no pending row (IV4). The firm's audit lines are present. Making a link is refused on the server for anyone who is not our staff.

## Break-it findings
* **Major:** concept §7b M4. There is no Change on the plan line, so a withdrawn plan leaves the person stuck. The deviation's reading of SA-4-4 does not hold: SA-2-22 v2.24 says "The sign-up page offers only Active, Public plans". See `review-invited.md`, Major 1.
* **Minor:** the reload heading (journey 4).
* **Minor:** the 429 wording (journey 9).
* **Minor:** summary items do not name or link their field.
* **Minor:** the primary button is 40 px at 375 (needs 44, P-795).
* **Minor:** PLAN_GONE, 429, server 422 and Resend have no test.
* None found: duplicates, a race between two tabs, the token or password leaking, a malformed token reaching the database.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1, end to end by screens: one firm in Trial. |
| Next step obvious | 1 | One primary action. Check your email says what to do, with a Resend timer. |
| Plain words | ½ | Concept copy is exact. The reload page and the 429 text mislead (journeys 4 and 9). |
| Feedback and state | 1 | Loading, busy, refused, sent, dead, plan withdrawn, 429 and load error are all drawn. |
| Correct data | 1 | Journeys 1, 3 and 5. The DB reads above. |
| Error recovery | ½ | Field errors keep input. A reload loses input. A withdrawn plan is a dead end without M4. |
| Accessibility and screen sizes | ½ | axe clean at 1280, 1024, 375 and 200 %. Keyboard path works. Summary not linked. 40 px primary at 375. |
| Speed | 1 | Send → Check your email in 113–126 ms. One GET per view. |
| Visual quality | 1 | Calm card, team tokens, one filled button, no overflow (screenshots at 1440, 1024, 375). |
| Trust and sources | 1 | "Set by your invitation", "for this email only", Sample marked, terms versions shown. |
| **Total** | **8.5 / 10** | **Pass (≥ 8, no 0).** |

**To raise it:**
1. Build M4's Change (or get the Lead's written ruling) → error recovery.
2. Fix the reload and 429 wording → plain words.
3. Link the summary items and make the primary button 44 px at 375 → accessibility.

## Not tested
* A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder).
* Resend after 60 s (blocked by the per-IP limit on the copy).
* A headed browser pane (headless Playwright only).
