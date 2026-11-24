# PF-4bc follow-up (#3479): journey test, reviewer role, 24 Nov 2026

Head e83c22ccdc0e7d38ef3f6441a3e7589139039144. **How I tested:** I started an isolated copy on :4436 (the runtime lane's ports) with PLATFORM_IDENTITY=local and the sample seed, and started it fresh for each run. I walked the journeys in headless Chromium with Playwright and ran them **twice**, with the same results both times. For journeys that have no page, I used the port. I held locks from psql to cause the contention. Then I read the database underneath. I stopped the copy and dropped its database afterwards.
Scripts: scratchpad `probe/journey.ts`, `probe/j5.ts`. Screenshots: scratchpad `shots/j2-busy-{400,1024,1440}.png`.

## Journeys (persona · goal · expected · what happened)
1. **Invitee, main path:** "join my firm".
   * Open the email link, press Continue. Expected: the hand-off.
   * Held. The page goes to `/sign-in/callback` in 69-88 ms, and 1 staff row is written.
2. **Invitee, the firm is busy (the change), keyboard only:** "join my firm".
   * Expected: the firm row is held for 4 s, Tab to Continue and press Enter, a "try again" answer with Continue still there, then a retry that works.
   * Held. After 1.80-1.81 s the page shows "Not done" with "Someone else in your firm is changing staff right now. Try again in a moment." The notice is `role="alert"`.
   * **Continue is still shown**, and the "This link cannot be used" notice does not appear.
   * After the hold ends, Enter goes to `/sign-in/callback` in 34-41 ms.
   * Data: 1 staff row, 1 accepted invitation, 1 accepted audit line, 1 joined event. Nothing was written by the refused try.
   * Focus does not stay on Continue after the refusal: the keyboard user Tabs back to it. This is outside the diff.
3. **Error state at different widths:**
   * axe (WCAG 2.2 A/AA) finds 0 violations.
   * 400, 1024 and 1440 px: no sideways scroll.
   * The only console line is the expected 503 resource line.
4. **Owner signs a person out everywhere while the firm is busy:**
   * Held. The answer is 503 `FIRM_BUSY` "Try again shortly" at 1521-1522 ms, and the retry answers 200.
   * The person panel shows the server's words (person-panel.tsx:16).
5. **A person signs themselves out while the firm is busy** (the unbounded path):
   * With a 3 s holder: 200 at 2.7 s, 1 revocation row, and the old token gets 401. Held.
   * With a 7 s holder: **500 (P2028) at 6.7 s, no revocation row, and the old token still gets 200 on `/me`**. The browser forgets the token anyway (frame.tsx:92). Not held: review m2.
6. **Invitee while any firm's module-event writer holds the global seq lock for 4 s** (through the port):
   * Result: **503 FIRM_BUSY at 1595 ms after the provider call**, with 0 staff rows. The local stand-in already holds the user.
   * The retry answers 200 with the hand-off and 1 staff row, so it recovers. The same case at round-3 code waited and committed (probe P1). Review m1.

Break-it was covered by the review's mutations and probes. They included lock timeouts from model queries and raw queries, commit-time locks (there are none on these tables), and the red run at e5e39f51.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2, 4 and 6 complete, the last three on retry; run twice |
| Next step obvious | 1 | The accept page keeps Continue under a 503 (journey 2), so r3-m1 is fixed |
| Plain words | ½ | The invitee is told "someone else in your firm is changing staff", but they are not in the firm yet, and in journey 6 nobody is changing staff (m3) |
| Feedback and state | ½ | A sign-out behind a holder of more than 5 s looks done but leaves the token live (journey 5, m2) |
| Correct data | ½ | Journeys 2 and 4 are exact. In journey 6 the provider changed while our records rolled back, until the retry (m1) |
| Error recovery | 1 | Every refusal rolls back, and a retry works (journeys 2, 4, 6) |
| Accessibility and screen sizes | 1 | axe 0; 400/1024/1440 px without sideways scroll; keyboard-only path completes (focus note above) |
| Speed | 1 | A refusal in 1.5-1.8 s; a success in under 100 ms |
| Visual quality | 1 | Team notice and button, nothing clipped (`shots/j2-busy-1024.png`) |
| Trust and sources | 1 | Limits and open questions are stated in the PR body. No AI output is involved |

**8.5/10, a pass, none at 0.** Fixes that would raise it, most valuable first:
1. In accept, lift the bound before `createUser` (m1). This raises correct data.
2. Give the unbounded sign-out a limit above FIRM_TX (m2). This raises feedback and state.
3. Use neutral busy words (m3). This raises plain words.

Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), a live Cognito pool, and a reset two-step through the page (it needs step-up; covered by the PR's race test).

## Round 2 (head b902813c001a0b5747564f0a2c2a80f85abe9e34)

**How I tested:** an isolated copy on :4437 (runtime lane) with PLATFORM_IDENTITY=local and the sample seed, started fresh for each run, then stopped and its database dropped. I re-ran round 1's journeys (scratchpad `r2/journey.ts`, `r2/j5.ts`) twice in headless Chromium, with the same results both times. Journey 5 adds a 16 s holder.

1. **Invitee, main path:** Continue goes to `/sign-in/callback` in 79-99 ms, 1 staff row. Held.
2. **Invitee, firm busy, keyboard only:**
   * Refused after 1.81-1.82 s. The notice is `role="alert"` and Continue stays.
   * axe 0; 400/1024 px with no sideways scroll.
   * The retry goes through in 36-46 ms, and the data is exact: 1 staff row, 1 accepted invitation, 1 audit line, 1 joined event.
   * **The words are unchanged:** "Someone else in your firm is changing staff right now". The invitee's new words never reach this case (review R2-m1). Focus still leaves Continue after the refusal (outside the diff).
3. **Error state:** the only console line is the expected 503.
4. **Owner signs a person out everywhere while busy:** 503 FIRM_BUSY at 1520 ms, and the retry gives 200. Held.
5. **Own sign-out while busy:**
   * 3 s holder: 200 at 2.7 s, then 401.
   * **7 s holder: 200 at 6.7 s, 1 revocation, then 401** (round 1: 500 with a live token).
   * 16 s holder: 500 at 15.7 s, 0 revocations, and the token still gets 200 (R2-m3; beyond any bounded holder).
6. **Invitee while the global `module_event_seq` lock is held 4 s:** **200 after 3716 ms**, 1 staff row (twice). Round 1 gave 503 after the provider call.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2, 4 and 6 complete; 6 now without a retry |
| Next step obvious | 1 | Continue stays under the 503 (journey 2) |
| Plain words | ½ | The invitee is still told "someone else in your firm" (journey 2, R2-m1) |
| Feedback and state | 1 | A 7 s holder now gives a real sign-out; only a holder of more than 15 s still shows done with a live token (R2-m3) |
| Correct data | 1 | Journey 6 commits once; no provider change without our records in any repro |
| Error recovery | 1 | Every refusal rolls back and a retry works |
| Accessibility and screen sizes | 1 | axe 0; 400/1024/1440 px; keyboard path completes |
| Speed | 1 | Refusals in 1.5-1.8 s; journey 6 waits only as long as the holder |
| Visual quality | 1 | Unchanged team notice (`r2/shots/j2-busy-1024.png`) |
| Trust and sources | 1 | No AI output; limits stated in the code header and PR |

**9.5/10, a pass, none at 0.** To raise it: pass the invitee's words through `lockFirm` (R2-m1). Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), a live Cognito pool.
