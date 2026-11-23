# PF-21c: journey test, reviewer (23 Nov 2026)

Head **06bc784e1f2ba49eb5645f1df1247852e2a3a5dc**. This row has no screen (PF-21rs builds the console pages), so I walked the journeys on the API, the way a console page will call it.
- **Copy:** an isolated copy `rv21c` on **:4432** (a runtime port; never :4400), with `PLATFORM_SYSTEM_IDENTITY=local PLATFORM_IDENTITY=local`. It was stopped afterwards and its database dropped.
- **People** (Sample): a Platform Owner, an Auditor and a Platform Admin as `plat_system_staff` rows. I added an ACTIVE Admin and a SUSPENDED Admin to the Sample firm. Sample solo's Owner and the Sample firm's user-R already existed.
- **Replay:** the row's suite `tests/check_pf21c_breaches.ts` (38/38, run twice) is the automated version of these journeys.
- **Scripts:** `walk.sh`, `probe.sh` and `race.mjs`, kept in my scratchpad and not committed.

## Journeys (persona · goal · result)
1. **Main path.** Platform Owner: "Log the incident and tell the two firms."
   - Record → 201 RECORDED. Decide NOTIFY_FIRMS, with why → 200; who and when are filled in.
   - Notify the Sample firm → 201: two recipients (its Owner and its active Admin). The suspended Admin and the case officer get nothing.
   - Notify Sample solo → 201: its Owner.
   - The outbox holds exactly those three addresses.
   - **Held.**
2. **Double click.** The same notice again → 409 "This firm was already sent this breach's notice; nothing was sent again." No new outbox row. **Held.**
3. **Auditor.** "Show me the register."
   - The breach reads 200, with events RECORDED, CHANGED, NOTICE_SENT ×2 and both notices.
   - The Auditor's PATCH → 403 naming `system/breach:manage`.
   - A Platform Admin's read → 403 (SA7-D74 (b)).
   - A firm token → 403 `FIRM_SESSION_REFUSED`.
   - **Held.**
4. **Errors.** Each answer names the field, and nothing was written:

   | Input | Answer |
   |---|---|
   | Date without a time zone | 422 `discoveredAt` |
   | Blank description | 422 "This is required." |
   | The same firm named twice | 422 "Name each firm once." |
   | Non-uuid id | 404 |
   | Empty PATCH | 422 "Change at least one field." |
   | Bad firm id | 422 |
   | `limit=0` | 422 |
   | Wrong types, an array body, an unknown field, a status of DRAFT, UNDECIDED with a reason, a future alert, a bidi mark | 422 |
   | Unparseable JSON | 400 |
   | 1 MB body | 413 |

   Row counts were the same before and after. **Held.**
5. **Non-English text.** A French, Chinese and Arabic description is stored exactly as sent; scope shows UNDER_INVESTIGATION when no firm is named. A 4,001-character description → 422. **Held.**
6. **From an alert, across the boundary to the notice.**
   - From an `audit_chain_break` alert → 201 DRAFT, with the alert kept and its firm named. Nothing was sent.
   - Confirm and decide in one PATCH → 200. Notify → 201.
   - **Partly:** the email the firm got says "What happened: Draft from a audit_chain_break alert … Confirm or correct this record before it is recorded; nothing has been sent." (review m2).
7. **The firm's trail.** Each notified firm has one line: "ExpatReady sent its Security incident notice about a security incident discovered on 2026-11-23 to this firm's Owner and Admins (n). The firm decides …". PF-4s's guard lines: 18 ALLOWED and 2 REFUSED, each with its reason. **Held**, but the action has no registered words (review m5), and the date is UTC ISO (m4).

## Data underneath
- **Breaches:** each is one row, with the values exactly as sent and the database's own times.
- **Notices:** each is one row per breach and firm. It records the recipients as staff ids, roles and outbox ids (never an address), the template version and `sent_by`.
- **Events:** insert-only, with before and after.
- **Roles:** enforced by the guard, then the service, then the database (refused inside a firm's session).

## Break-it (15 min)
- **Change racing a send** (review **M1**, Major). With an in-flight PATCH to `affected_firms: []` and NO_NOTICE, a send in the firm's transaction still commits. The record ends with NO_NOTICE, no firms and one notice, and the email is queued. The reverse order is safe (409).
- **Two sends at once** → 201 + 409, one email. Safe.
- **A firm's own session** can call `plat_breach_notice_record` and record a notice with no email, given one of our staff ids (review m3).
- **Unknown firm, unknown breach, uppercase firm id** → 422, 404 and 409 respectively. No 500 seen.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J6: record, decide, notify, read, all end to end as the Platform Owner and the Auditor |
| Next step obvious | ½ | Each 409 says what to do ("Record the decision to notify firms, with why…"); there is no screen yet, and nothing lists the firms still to notify |
| Plain words | ½ | Field errors are plain; the email carries the draft's internal text (m2) and an ISO UTC date (m4); the firm log shows a raw action code (m5) |
| Feedback and state | 1 | Status codes match what happened; each recipient's outbox state is returned; `changed` is flagged |
| Correct data | ½ | Rows are exact; the change-vs-send race leaves a contradictory record (M1) |
| Error recovery | 1 | A double click is safe; every refusal wrote nothing (row counts checked) |
| Accessibility and screen sizes | N/A | No screen in this row |
| Speed | 1 | 7-107 ms per call; a notice to two people took 107 ms |
| Visual quality | N/A | No screen in this row |
| Trust and sources | 1 | The template is labelled "Sample wording (Unconfirmed: no counsel)"; the firm's line names ExpatReady; the alert origin is kept on the record |

**6.5 of 8 applicable = 8.1/10. Pass (8 or more, no criterion at 0).**

Fixes that would raise the low criteria, most valuable first:
1. M1: `FOR SHARE` on the breach row in the notice path.
2. m2: no generated draft text in a confirmed breach.
3. m4 and m5: a local, worded date in the email, and registered action words.

**Could not test:**
- A real screen reader, the screen widths and zoom (no screen).
- The SES send (the worker was only queued).
- An intended user's unaided walk (D17/D20 stay with the founder).
