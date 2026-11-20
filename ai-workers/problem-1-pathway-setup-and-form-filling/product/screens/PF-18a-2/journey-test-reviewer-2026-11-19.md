# Journey test (reviewer): PF-18a part 2, My account → Notifications API (19 Nov 2026)

Commit `4130eb109`. This row has no screen (PF-18s builds it), so the journeys were walked over HTTP the way the screen will call them. I used an isolated copy on runtime port **:4433** (`tools/isolated.sh pf18anrev 4433`, `PLATFORM_IDENTITY=local`, Sample firms), never :4400. Scripts and output are kept outside the repo; the database was read after each journey.

## Journeys (persona · goal · result)
1. **Main path.** The Owner (sample-firm) wants to see their notification settings. GET returns 200 in 37 ms with 8 groups in §3.3 order, each with In-app and Email on and `saved:false`, plus `security {label "Security emails (new sign-in, password change)", email:true, switchable:false}`. Held.
2. **Alternate.** The Owner wants email off for Mentions. PUT one group returns 200 with MENTIONS `inApp:true, email:false, saved:true`. A reload (GET) shows the same. The database has one row (`MENTIONS t/f`). Held.
3. **Wrong role.** A Case Officer wants to mute Team watch. Their GET shows 6 groups (no Team watch, no Firm and connections; Payments is shown because the role holds `agent/invoice:list`). PUT TEAM_WATCH returns 400 with "This group cannot reach you, so it has no switches." and nothing is written. Held.
4. **Recovery: double click.** Two identical PUTs at once both return 200, and there is one row. Held.
5. **Error: someone else's id.** A body with `staffId` returns 400 (strict body). With no token, the answer is 401 "Sign in again". Held.
6. **Error: bad input.** `inApp:"yes"`, a `SECURITY` switch, an empty body, `null`, an array, a lower-case group, a 100 000-character group name and 9 entries each return 400 with RFC 9457 problems and field paths. Held.
7. **Firm boundary.** sample-solo's Owner saves MENTIONS off. sample-firm's rows are unchanged. Held.
8. **Deactivated mid-session.** The Owner deactivates the officer (with a reason). The officer's next GET and PUT return 401. Held.
9. **Two tabs (break).** Tab 1 reads; tab 2 turns MENTIONS off; tab 1 saves all its groups back. The answer is 200 and MENTIONS is on again, silently. **Minor**: STANDARDS §4 optimistic concurrency (review.md Minor 5).
10. **Across the boundary.** `NotificationPrefsPort.allows` agrees with what the person saved: the suite's contract runs on the real adapter and the fake, 6/6 each. PF-18n is the consumer and is not built yet.

## Data underneath
Rows after the walk: Owner `MENTIONS t/f`; officer `NEEDS_YOU t/f` (from J4, one row); solo Owner `MENTIONS f/f`. Nothing else was written. There is no audit line: right for a self-scoped personal choice (AG-16 §10). Roles are enforced on the server: the guard's key check, then the reach check in `service.ts`.

## Break-it findings
* Minor: stale second-tab save (J9).
* No 500s seen.
* The lock that queues two saves is needed only when the two saves list groups in different orders. The suite does not test that order (review.md Minor 2).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 |
| Next step obvious | 1 | the PUT answers the full view with `saved` and the defaults |
| Plain words | ½ | detail lines are plain; `issues` carry zod text ("Invalid input: expected boolean, received string") |
| Feedback and state | 1 | `saved` flag; defaults returned beside the current value |
| Correct data | 1 | one row per person and group; firm B untouched (J4, J7) |
| Error recovery | ½ | a stale tab overwrites silently (J9) |
| Accessibility and screen sizes | N/A | no screen (PF-18s) |
| Speed | 1 | GET 10-17 ms over 10 runs; PUT 26-44 ms (§9 budget < 1 s) |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | §3.3 cited with snapshot and date in `samples/notification-groups.json`; security emails labelled; no AI |

**7 of 8 applicable, which scales to 8.5/10. Pass (8 or more, no 0).** To raise it:
1. Field messages in plain words rather than zod text.
2. A version (409 on a stale save), or a recorded reason for not having one.

Not tested: a real screen reader, the 400 / 1024 / 1440 px widths and axe (no screen in this row), an intended user's unaided walk (D17 and D20 stay with the founder), and live email sending (PF-18n).
