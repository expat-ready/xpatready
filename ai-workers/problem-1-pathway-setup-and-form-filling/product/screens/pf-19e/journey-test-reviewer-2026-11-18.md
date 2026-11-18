# PF-19e journey test: reviewer, 18 Nov 2026

Head `86e306399`. I ran an isolated copy (`isolated.sh pf19erev 4431 … PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, runtime ports, never :4400) and stopped it afterwards (database and files dropped). The persona is the firm's Owner (`user-R`) in the Sample firm. This row adds no screen, so the journeys are mostly API journeys plus a browser walk of the existing Invite panel. Scratch scripts are in the session scratchpad only.

## Journeys
1. **Main: the Owner invites a new person.** 201 with `emailed:true` in 78 ms.
   * The outbox row is SENT, TRANSACTIONAL, with a `system:` key.
   * The stored file is `{"sealed":"msgseal1",…}` with no `invitation#t=`.
   * The demo inbox shows the subject and the link.
   * `api.log` holds no `#t=`.
2. **Alternate: the Owner resets a person's two-step sign-in six times in an hour.** 200 ×5, then 429 "Too many account emails went to this address in the last hour. Try again in an hour." The sixth attempt writes no row.
3. **Error: reset for a suppressed address.** 409 "We couldn't send email to user-o@…. Ask your firm's Owner or Admin to check it."
   * One audit line, `platform.staff.email_suppressed`, with ids only and no address.
   * Nothing was reset, and the address stays suppressed.
4. **Error: the single invite, then resend, to a suppressed address.** Both answer 409 with the sentence, and each writes an audit line.
   * The invitation is committed anyway: retrying the invite gives "Already invited: resend it instead".
   * On the 5-seat Sample plan, a later 2-row batch was refused with "7 of 5 seats".
5. **Batch with one unsendable row.** 201; each row carries its `emailed` flag.
6. **Browser, 1024 and 1440 px: invite a suppressed address in the Invite panel.**
   * The sentence shows under the email field. There is no sideways scroll and no page error (only the 409 resource line).
   * The Team seat line went from 7 to 8 seats and the person is listed under Invited, but the panel still shows the row and "Send invitation", as if nothing had been made.
7. **Break: concurrent resets in one firm** (the brief's "reset storm"), on the app's own `Db` pool:
   * 12 at once: 3×500;
   * 30 at once: 25×500 (P2028).
   * With PF-4b's in-memory mail, the same 30 all answer 200 in 323 ms.
8. **Break: a firm's own message with a `system:` key.** Refused. A sealed body moved to another firm's message ends FAILED "body could not be opened"; another firm's key or another key ring cannot open it.
9. **Regression suites, all green:** PF-19e 28/0, PF-19b 42/0, PF-19b2 44/0, PF-19b-mail 29/0, PF-19p 68/0, PF-19a 94/0, PF-6m 12/0, PF-4b 55/0, PF-4c 24/0, PF-12 100/0.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-5: every path does what the brief says |
| Next step obvious | ½ | Journey 6: after the 409 the panel invites a resend, which only gives "Already invited"; it never says the invitation was kept |
| Plain words | 1 | Both sentences are plain and name the address |
| Feedback and state | ½ | Journey 6: a 409 that still made an invitation and took a seat |
| Correct data | 1 | One row each, sealed bytes hashed, audit lines with ids only, suppression kept |
| Error recovery | ½ | Journey 7: concurrent resets give 500s and stall the shared pool |
| Accessibility and screen sizes | ½ | 1024 and 1440 px checked with no sideways scroll; axe and keyboard-only were not run (no web change) |
| Speed | 1 | Invite 78 ms; a single reset is tens of ms |
| Visual quality | 1 | The error sits inline under the field, in the team look (screenshot at 1024 px) |
| Trust and sources | 1 | The limit of 5 an hour is labelled Sample in code; no AI involved |

**Score: 8/10. Pass** (8 or more, no criterion at 0), but review M1 blocks the row.

Fixes that would raise the low scores, most valuable first:
* No second connection inside the reset's firm lock (review M1).
* Make the invite's 409 either make nothing, or say that the invitation was kept (m1).

## Not tested
* A real SES send.
* A real screen reader.
* An intended user's own unaided walk (D17 and D20 stay with the founder).
* A retired key version end to end.
