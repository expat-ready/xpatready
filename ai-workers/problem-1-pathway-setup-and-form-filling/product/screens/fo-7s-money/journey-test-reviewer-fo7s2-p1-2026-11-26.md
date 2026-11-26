# Journey test: FO-7s2 part 1 (Money → Getting paid → Card payments), reviewer role, 26 Nov 2026

**Commit:** `5c61983b6dfbdcbaf3094c7c2649126f0b514f0f`.

**Copy:** my own short-lived copy `rvfo7s2` on :4763. Fresh database, Sample firm, `PLATFORM_IDENTITY=local`, no Stripe key, live AI off, US$0. I stopped it afterwards. I did not walk on the builder's :4762 because a parallel session was signing in as the same Owner there. I never used :4400.

**How I walked:** headless Playwright with only what a person sees, at 1440 px, plus 1024 px and 200 % zoom (720 CSS px at DPR 2). The account states were set in the database, because Stripe's events set them. The data underneath was read with `psql` and the API. The walk script stayed in the session scratchpad and is not committed.

The builder's suite gave **35/35 twice** on :4762.

## Journeys (persona · goal · result)
1. **Main: the Owner, "let clients pay by card".**
   * From Money › Invoices, the menu item "Getting paid" leads to "Clients can't pay by card yet." and **Connect with Stripe**.
   * On this copy, Connect says "Card payments are not set up on this server yet. Nothing was changed." The database holds no account row and 0 audit lines.
   * With the onboarding answers stubbed (the suite's S4), Connect → "Confirm it's you" → Sign in again (a real local sign-in) → the resend → Stripe's hosted page (fake).
   * **Held.** The dialog says both "then try once more" and "the change is sent once more for you" (m1).
2. **Keyboard only, the same goal.**
   * 11 Tabs reach Connect, and Enter shows the refusal as an alert.
   * Focus then sits on `body`. After Escape or Cancel in the dialog it also lands on `body`, not on Connect (m2).
   * **Held, with m2.**
3. **Each status, the Owner.**
   * NOT_CONNECTED, PENDING, ACTIVE, RESTRICTED with charges on, RESTRICTED with charges off, and DISCONNECTED each read the concept's words with one next step, and no codes show.
   * PENDING after a break (stubbed read) shows the red "Payment account disconnected" notice above "Stripe is checking your details." with Continue set-up.
   * **Held.**
4. **Back from Stripe.**
   * `?account=return` reads "Back from Stripe… this page shows the result when Stripe tells us."
   * After the account went Active and I reloaded, that line was still there above "Clients can pay invoices by card". The page never re-reads by itself (m3).
   * `?account=refresh` offers Continue set-up.
   * **Partly held.**
5. **Wrong role: the Case Manager (user-T) and the Case Officer (user-O).**
   * Each sees "Only the Owner manages card payments." and no button.
   * A forced POST to onboarding gets 403 with words naming the key.
   * The concept's "Card payments: on / off" line is missing, because no read answers it (Question 1, m5).
   * **Held for the server; the read-only status is open.**
6. **Error: the status read fails (stubbed 500).** The page shows "Could not load card payments / Internal Server Error", with no fix and no retry (m4). **Not held.**
7. **Recovery: double click and reload.**
   * A double click on Connect sent 1 POST.
   * A reload in every state shows the same status.
   * The resend after the sign-in again happens once (S4: 2 calls in total).
   * **Held.**
8. **Fresh firm, honestly.** The Sample seed has no `money_payment_settings` row. With a Stripe key, Connect would answer "Set up payments first…", and this page cannot save payment details yet (gap G1, m7). **Recorded as a dependency.**

## Break it
* **Foreign address:** an onboarding answer naming `https://evil.example/steal` is not followed, and the page says nothing was changed (suite S4).
* **Unknown parameter:** `?account=anything` shows no line.
* **Two Owner tabs:** a sign-in again in one ends the other session ("You signed in on another device"). This is PF-4's one-session rule, not this PR's.
* **No Blocker or Major found.**

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | the Owner reaches Stripe's hosted page after the step-up (journey 1, with stubbed onboarding answers); the honest 503 on a server with no key |
| Next step obvious | 1 | one named button per state, none when Active |
| Plain words | ½ | the dialog contradicts itself (m1); "Internal Server Error" (m4) |
| Feedback and state | ½ | busy state and break alert are good; the back-from-Stripe line goes stale (m3) |
| Correct data | 1 | nothing is written on refusal; server 403 for non-Owners; 1 POST on a double click |
| Error recovery | ½ | refusals are in words; a failed status read has no retry (m4) |
| Accessibility and screen sizes | ½ | axe 0 at 375, 1024, 1440 px and 200 %, no sideways scroll; focus is lost twice (m2) |
| Speed | 1 | status words about 20 ms after navigation, on one GET |
| Visual quality | 1 | team card, one h1 and one h2 (`fo7s2-card-*-1440.png`, `rv-zoom200`) |
| Trust and sources | 1 | codes never show; only Stripe addresses are followed; "Money goes to your own Stripe account"; no AI |

**Total: 8/10. Pass** (8 or more, and no criterion at 0).

**Fixes that raise the low scores, most valuable first:**
1. m2: return focus to Connect.
2. m4: plain words plus Try again.
3. m3: clear `?account=` once shown, and say "Reload to see the result".
4. m1: one sentence in the dialog that matches the automatic resend.

## Could not test
* Real Stripe onboarding (no test key).
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
