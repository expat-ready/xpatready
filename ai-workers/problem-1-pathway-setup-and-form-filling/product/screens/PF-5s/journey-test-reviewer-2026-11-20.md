# Journey test: PF-5s part 1, the public sign-up pages (reviewer, 20 Nov 2026)

PR #2608, commit `fd662e5ba8c9c96d2a4f85e21d9383108e007d50`. I did not build it. I used my own isolated copies on :4596 (database `xr_studio_rev_pf5s1`, `PLATFORM_IDENTITY=local`, started fresh for each run and stopped afterwards), never :4400. Headless Chromium with Playwright, acting only through what a person sees, then reading the database. My walk scripts and screenshots are in the session scratchpad and are not committed. The steps below are the evidence, together with the builder's committed screenshots in `screens/PF-5s/screenshots/`.

## Journeys (persona: the firm's Owner, a new customer)
1. **Main path:** Pricing → Yearly → Firm's "Start free trial" → Sign up (Firm (Sample), yearly carried) → press Start free trial with the tick **unticked** → tick → Check your email → the link from the demo inbox → Confirm my email (double-clicked) → the firm key → Sign in.
2. **Alternate:** Change the plan in place (covered by the builder's DW1; walked again by eye).
3. **Empty and bad input:** an empty submit, then a bad email and a short password; a one-letter firm name that only the door refuses.
4. **Door refusal while the page is open:** a new Terms of Service version is published after the page loads, then Start free trial is pressed with the tick ticked.
5. **Door refusal after a server restart:** the form stamp is no longer the server's (`RELOAD`).
6. **Error, link:** a wrong code (×6), a too-short code, the used link opened again, the page with no link.
7. **Recovery:** reload on Check your email; reload on Confirm; Back after signing in; a double click on Start free trial.
8. **Long and non-English text:** a 118-character French/Chinese/Arabic firm name; an 80-character email at 1024 px.
9. **Accessibility and sizes:** keyboard Tab order on Sign up and Pricing; axe on every state; 375, 1024, and 1440 px at 200 % zoom (720 CSS px at 2×).
10. **Across the boundary:** after Confirm, sign in with the firm key and land in the account, with no second terms prompt.

## What held (all steps observed)
* **The tech lead's acceptance point holds.** With the tick unticked, Start free trial shows "Please accept the terms to continue." on the tick and in the summary at the top, and focus moves to the summary. After 4 s there were 0 sign-up POSTs, 0 pending rows, 0 firms and 0 emails. Once ticked, it goes to Check your email, and the pending row holds plan `firm`, period YEARLY, 3 term ids and the firm name exactly as typed.
* **The door's refusal when a version changes while the page is open holds.** It took 1 POST and stored nothing. The summary reads "The terms have changed since this page opened. Read the current versions and tick again.", the tick shows the door's words and is cleared, the new ToS version replaces the old one in the list, and every answer (including the password) is kept. Pressing Start free trial again unticked is refused on screen with 0 POSTs. Ticked, it finishes, and the stored acceptances are **the new ToS version** plus the current privacy and data-processing versions.
* After a restart the page says "The form was refreshed. Please tick the terms again…" and clears the tick. Ticked again, the sign-up is stored and the email arrives.
* Confirm: a double click sent 1 verify POST and made 1 firm (PROVISIONING, CA), 1 Owner, 3 acceptances and a TRIAL subscription on Firm, yearly. The audit has firm.created, owner_created, money_keys_granted, terms.accepted and subscription.created. The token is taken out of the address at once.
* A double click on Start free trial sent 1 POST. The long multilingual name was stored exactly. The long email wraps on Check your email with no sideways scroll.
* Wrong code: the door's words appear on the field (aria-invalid) and no firm is made. A short code gets "Type the 6 digits from the email." Used link: "This link has expired or was already used." with "Send a new link" and "Already confirmed? Sign in". No link: "Open the link from your email again."
* axe found no violations at all (not just no serious or critical ones) on the error states at 375, 720@2×, 1024 and 1440, on Pricing, and on the version-refused state. There is no sideways scroll on any page at any width. The keyboard order is Pricing link → email → password → firm name → Change → tick → the 3 document links → Start free trial → Sign in, with a visible ring on each.
* Times: Pricing ready in 123 ms, Sign up in 325 ms. Start free trial → Check your email is held up to 3.3 s by design (PF-5's minimum fill time).
* My own re-runs on fresh copies, at this commit: `check_pf5s1_signup_browser.ts` **48/48**, `j_100.ts` **27/27**.

## Findings (none Blocker or Major)
| # | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | Minor | The three document links open `/legal/terms` etc. (PF-5t's Sample seed URLs). No such page exists, so the new tab lands in the internal Product Studio with its demo chrome, and the person cannot read what they agree to. This predates the PR (it is PF-5t's data) | journey 1, clicking "Terms of Service"; seed `prisma/migrations/20261115180000_pf5_signup_terms/migration.sql:140` |
| F2 | Minor | On the demo, Pricing shows "Price not shown" on every card with no explanation, because the plans have no price ids and so `pricesAvailable` is true. The "Prices unavailable" notice appears only when Stripe throws | `pricing-page.tsx:90,98`; builder `pricing-375.png` |
| F3 | Minor | After 5 wrong codes the link closes with "This link has expired or was already used." That is wrong for this case; concept §7b m5 asks for a "too many tries" state. The door returns one 404 for every case, so the screen cannot tell them apart | journey 6 |
| F4 | Minor | After ticking, the tick's error stays until the next submit. On the `RELOAD` refusal, the words appear only in the summary, not on the tick | journey 1, journey 5 |
| F5 | Minor | Reloading Check your email returns to an empty form (the email is lost too). The password must stay in memory only; the email need not | journey 7 |

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1 and 10: Pricing to a signed-in Owner |
| Next step obvious | 1 | one filled button on each card or form; Check your email says to open the link; Confirmed shows the key and Sign in |
| Plain words | ½ | the words are clear and come from concept §5, but F3 is inaccurate, F2 is unexplained, and the door's "2 to 120 characters." has no subject |
| Feedback and state | 1 | busy buttons, a focused summary, the resend countdown; F4 is minor |
| Correct data | 1 | one firm, one Owner, three acceptances of the exact versions shown, audit lines, plan and period as picked |
| Error recovery | 1 | a version change re-reads and keeps the answers; restart; a wrong code is fixable on the field; F5 is minor |
| Accessibility and screen sizes | 1 | axe clean, keyboard path, 375/1024/200 % with no sideways scroll |
| Speed | 1 | 123 ms and 325 ms first views; the hold is the door's rule |
| Visual quality | 1 | calm public frame, team controls, one primary (`s2-terms-refused-1440.png`, `s1-pricing-1440.png`) |
| Trust and sources | ½ | Sample marked on names, prices and trial, and the versions are named; but the document links do not open the documents (F1) |
| **Total** | **9 / 10** | **Pass** (8 or more, no 0) |

Fixes that would raise the low criteria, most valuable first: F1 (a Sample document page for the seeded terms URLs, owner PF-5t), then F3 and F2's wording.

## Not tested
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). Real Cognito and Stripe (local stand-in and fake BillingPort only). The 2-hour form-stamp expiry (simulated by a restart). Rate-limit wording in a browser (429; read in code only, `api.ts:26`, `signup-page.tsx:75`).
