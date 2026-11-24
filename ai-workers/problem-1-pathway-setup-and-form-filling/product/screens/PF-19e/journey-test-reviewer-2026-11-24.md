# Journey test: PF-19e (reviewer role), 24 Nov 2026

**Commit:** `570c344b483ace08ee761d08c704a53d2c367de3`.

**Copy:**
* An isolated copy `review_pf19e` on :4431 (runtime ports; :4400 never used), started with `PLATFORM_IDENTITY=local` and the Sample seed.
* Headless Chromium 1243 through Playwright, with axe-core (WCAG 2.2 A/AA tags), plus psql and API reads.
* The script lived in the session scratchpad, outside the repository. It ran twice, and both runs finished by 06:02 UTC.
* The copy is now stopped and its database dropped.

**Scope:**
* This row has no screen of its own, so the journeys cross the screens it feeds: Team, the invite panel, the demo inbox (API only; the web `/inbox` page does not list platform mail), the invitee page and the Activity log.
* The two-step reset has no button in the web app, so it was driven through its API route.

## Journeys (persona, goal, result)
1. **Owner: "invite a new case officer and check the email carries the link"** (main path, keyboard sign-in). Held.
   * The local stand-in sign-in reached Team in 578-776 ms. "Invite people", email, "Send invitation" gave the toast "1 invitation sent." in 134-250 ms.
   * The outbox row is TRANSACTIONAL with key `system:mail:…`, and it reached DELIVERED.
   * The stored file is `{"sealed":"msg-sealed-1",…}`, 4,165 bytes, with no `invitation#t=` text and no address.
   * The demo inbox shows the link. Opening it shows "Join your firm on Expat Ready" (the step across the screen boundary).
2. **Owner at the trial cap: "invite someone after the firm sent its 50 today"** (alternate path). Held: "1 invitation sent.", the row DELIVERED, and the day's counter still at 50.
3. **Owner: "invite someone whose address bounced"** (error path). Partly held.
   * The toast says "1 invitation made; 1 could not be emailed. Use Resend under Invited.", with no 5xx.
   * But the answer is 201, not the brief's 409.
   * The only audit line, `platform.invitation.created`, says "an invitation was sent" (review M2).
4. **Owner: "reset a colleague's two-step when their address bounced"** (error path, API). Held in run 1.
   * Answer: 409 `NOTICE_NOT_SENT`: "Update this person's email address first; … their two-step sign-in was not reset."
   * One `platform.staff.notice_not_sent` audit line with ids only. The Activity log shows it as "the two-step reset notice could not be emailed (the address does not take email); nothing was reset" (screenshot `j4-activity-log-1440.png`).
   * In run 2, the same address was already at its hourly limit, so the answer was 429 instead of 409: the limit is checked before the gate (review m3).
5. **Owner: double click (two resets at once).** 200 and 200. Both are real resets, there is no 500, and each sent its notice.
6. **Reset storm** (break). Held.
   * Statuses: 200, 200, 200, then 429, 429, 429. Five rows this hour, matching the Sample limit of 5.
   * 429 `EMAIL_HOURLY_LIMIT`: "We send at most 5 account emails an hour to one address, so the notice to this person could not go now and their two-step sign-in was not reset. Try again in an hour."
7. **Wrong role** (Case officer resets someone). 403 `MISSING_PERMISSION`.
8. **Break: read the outbox file through any route.** Held.
   * `/api/files/msg/<firm>/outbox/<id>.json`, `/api/platform/messages/<id>`, `…/body` and a support attachment route all answer 404.
   * No audit row and no api.log line holds `invitation#t=`.

## Replayed checks
* axe: 0 violations on Team, the invite panel and the Activity log.
* Sideways scroll: none at 400, 1024 and 1440 px (Team), nor at 1024 px (Activity log).
* Console: one 401, from the page loading before sign-in, which is expected. No page errors.
* Both runs gave the same results, apart from the hourly limit carrying over in run 2 (expected).

## Data underneath
* One outbox row per invitation, and the hash is of the sealed file (suite DW1).
* Platform-own rows do not raise the day's counter.
* The reset rolled back on 409 and 429: no `two_step_reset` line, and the provider was not reset (suite DW3/DW4).

## Findings (details and file:line in review.md)
* **Major:** over the hourly limit, an invitation or a Resend answers `emailed:false`, not 429. A Resend has already revoked the old link (review M1; confirmed in `identity/service.ts:403` and `:485-499` at this commit; the break report has the live run).
* **Major:** a suppressed invitation answers 201 with a "sent" audit line (review M2, J3).
* **Minor:** on an address both at the limit and suppressed, the 429 comes before the 409 (J4, run 2).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 end to end, including the invitee page |
| Next step obvious | ½ | When the limit holds an invitation, "Use Resend under Invited" leads to a loop that cannot work (M1) |
| Plain words | 1 | The 409 and 429 sentences (J4, J6) |
| Feedback and state | 1 | Toasts. DELIVERED and SENT states. Activity log line |
| Correct data | 1 | Sealed file, hash, counter at 50, no token in logs or audit |
| Error recovery | ½ | Resend revokes the link and sends nothing over the limit. 429 shown before 409 |
| Accessibility and screen sizes | 1 | axe 0. Three widths with no sideways scroll. Keyboard sign-in |
| Speed | 1 | Under 1 s sign-in. Under 0.3 s send |
| Visual quality | 1 | Pages unchanged, team look |
| Trust and sources | ½ | The invitation audit summary says "sent" when it was not emailed (M2) |

**8.5/10: pass** (8 or more, no 0).

**Fixes that would raise the score:**
1. A 429 with a sentence, and no revoke, on an invitation or Resend over the limit.
2. A truthful audit line, and the brief's 409, for a suppressed invitation.

**Could not test:** a visible headed browser, 200% zoom, a real screen reader, and D17/D20 (an intended user's unaided walk stays with the founder).
