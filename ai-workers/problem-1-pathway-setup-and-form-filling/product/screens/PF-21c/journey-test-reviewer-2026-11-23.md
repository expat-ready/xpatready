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

## Round 2 (head cc7e9a4be2d24bd140e977afde0e6d606c9bfc3f)

**Setup:** isolated copy `rv21c` on :4621 (never :4400), local identities, stopped afterwards. Sample people: 2 Platform Owners and an Auditor as `plat_system_staff`. Script `walk.mjs` (scratchpad, not committed). Replay: suite 46/46.

**Journeys:**
1. **Record with an Idempotency-Key.** 201. A double submit with the same key → 200, same id, no `repeated` field. **Held.**
2. **Errors on the key.**
   - No key → 400 `IDEMPOTENCY_KEY_MISSING`.
   - A key with a space → 400 `IDEMPOTENCY_KEY_INVALID`.
   - The same key with another body → 422 `IDEMPOTENCY_KEY_REUSED`; the same key from another Owner → 422.
   - The Auditor creating → 403 naming `system/breach:manage`.
   - **Held.**
3. **From an alert.**
   - Draft → 201. Its words carry no entity or key; it asks for "the description firms will read". The same alert again → 200, same id.
   - Confirming without a description → 422 on `description`. With a description and a decision → 200. Notify → 201.
   - The email quotes the staff's own words. **Held.**
4. **All addresses suppressed.** 409 `NOT_DELIVERABLE` "…nothing was sent or recorded": 0 outbox rows, 0 notices. After the suppression is lifted → 201 QUEUED. **Held.**
5. **A second Owner after the notice.** The same decision → 200, decider unchanged. A new reason → 409 `DECISION_KEPT`. **Held.**
6. **Text that shows nothing.** Zero-width only → 422; a lone surrogate → 422. Hangul filler U+3164 only → **201** (review n2, Minor).

**Data:**
- Each repeat left one row.
- Firm trail lines read "…discovered 2026-11-23 03:18 UTC…".
- Outbox keys follow `breach-notice:<breach>:<staff>`.
- No event carries `request_key`.
- Calls took 6-78 ms.

| Criterion | R1 | R2 | Evidence |
|---|---|---|---|
| Task completed | 1 | 1 | J1, J3, J4 end to end |
| Next step obvious | ½ | ½ | Refusals say what to do; still no list of firms left to notify (no screen) |
| Plain words | ½ | ½ | Draft text and date fixed; the firm log still shows the raw action code (m5) |
| Feedback and state | 1 | 1 | 201 vs 200 on a repeat; codes match what happened |
| Correct data | ½ | 1 | Race fixed (M1); no notice recorded for an all-suppressed firm |
| Error recovery | 1 | 1 | Double submit safe; NOT_DELIVERABLE can be sent again |
| Accessibility, sizes / Visual | N/A | N/A | No screen |
| Speed | 1 | 1 | 6-78 ms |
| Trust and sources | 1 | 1 | Sample/Unconfirmed labels kept |

**Score: 7 of 8 applicable = 8.8/10. Pass.** Could not test: SES, a screen reader, an intended user's walk (D17/D20).
