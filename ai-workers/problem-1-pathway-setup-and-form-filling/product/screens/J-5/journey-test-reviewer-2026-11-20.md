# J-5 journey test, reviewer role, 20 Nov 2026 (PR #2627 at 032102334e97855232f3a41cf32cfa3657b3861f)

This is the one journey score for this check. The copies were isolated (`PLATFORM_IDENTITY=local`, ports 4415, 4447, 4448
and 4449; never :4400). Sample rows only, US$0, no model call. The scripted walk is `tests/journeys/j_5.ts`. My own walk
was a scratch Playwright script that was not committed.

## Journeys (persona · goal · expected)
1. **Owner, main path:** "bring a new Case Officer in". Sign in → Team → Invite → the invitee accepts from the email →
   signed in. **Held** (j_5 W1; 3 runs plus a visible-browser run).
2. **Case Officer, alternate:** "I signed in on my laptop too". The first tab says "Signed in elsewhere", and "Sign in again
   here" opens the card with focus on it. **Held** (W2 step 1; my walk at 400 px and after a reload).
3. **Owner, recovery:** "end their sessions". Person panel → Sign out everywhere → their next click shows the sign-in card,
   and they can sign in again. **Held, but no reason is shown** (W2 steps 2-4; finding F1).
4. **Owner, leaver:** "they left today". Deactivate with a reason → their next request is refused → their sign-in is
   refused in words. **Held** (W3, DW1). The tab shows a blank card (F1). The refused sign-in at 1440, 1024 and 400 px has
   no sideways scroll and axe finds 0.
5. **Owner, reversal:** reactivate → they are back as Case Officer → the Person panel's roles (R1.6's first step).
   **Held** (W4).
6. **Error, no second step:** the stand-in door without `secondStep` → 401 in words, no token; with it, a token for this
   person. **Held** (DW2). This is the stand-in only. Cognito's wrong or expired code, lock-out and passkey are not
   testable here (shape L2/L3, part 3).
7. **Wrong role by URL:** a Case Officer opens `/platform/team` → "Not available" on screen, and the API answers 403.
   **Held** (my walk). The words show a permission key (F2).
8. **Break-it:** double-click Accept → one staff row. The used link opened again → "This invitation is no longer
   valid." The dead token on `/platform/me/account`, `/me/terms` and `/front-office/leads` → 401 each. An unknown email →
   "No staff member signs in with that firm key and work email." **Held.**

## Data underneath
One invitation `{CASE_OFFICER}`; one staff row (after a double click too). The deactivation writes one audit line, by the
Owner, ACTIVE → DEACTIVATED, and one revocation row. Reactivation keeps the roles. Every refusal comes from the server
(401/403). Clean-up deactivates the walk person and gives the lent seats back, checked over two runs on one kept copy.

## Findings
* **F1 Minor (raise to screens, on main):** after Sign out everywhere or Deactivate, the tab shows a blank sign-in card
  with no reason (`web/src/modules/platform/session.ts:82`, `frame.tsx:98`; screenshot `W3-deactivated-next-click-1440.png`).
  This is against EXPERIENCE §2.7 [M]. R1.5's L4 is still met.
* **F2 Minor (on main):** the wrong-role refusal shows "(agent/staff:manage)" (`api/src/platform/identity/guard.ts:112`),
  against EXPERIENCE §5 [M].
* The test's own Minors (`finally` order, a swallowed click, loose counts, the shape's DW2 text) are in `review.md`.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 27/27 on a fresh copy, twice on a kept copy, once in a visible browser |
| Next step obvious | ½ | blank card after the session ends (F1); Signed in elsewhere is clear |
| Plain words | ½ | permission key in the refusal (F2); the other refusals read plainly |
| Feedback and state | ½ | the session-end reason is lost on screen (F1); the refused sign-in is in words |
| Correct data | 1 | one row each; audit before and after; revocation; roles kept |
| Error recovery | 1 | sign in again, reactivate, the reused link refused, focus moves to the card |
| Accessibility and screen sizes | 1 | axe 0 on 5 states; 1440, 1024 and 400 px with no sideways scroll; keyboard sign-in |
| Speed | 1 | the whole walk takes 10 s; no step waited over 1 s |
| Visual quality | 1 | team look; screenshots clean at 1440 and 400 px |
| Trust and sources | 1 | no AI; the stand-in card says what it is |
| **Total** | **8/10** | **Pass** (8 or more, no 0) |

To raise it: F1 (the reason on the card after a session ends) lifts "next step" and "feedback"; F2 lifts "plain words".

## Could not test
A real screen reader; 200 % zoom; Cognito's own pages (L2, L3); an intended user's unaided walk (D17/D20 stay with the
founder); `walk.mjs` recording (no ffmpeg in this container).
