# Journey test (reviewer), PF-4c part 1: the batch staff invite

Reviewer: Opus 5.5, fresh context. Commit `30bf02ccbcf3395160f417395761e40314f5208c`, 17 Nov 2026. US$0, live AI off.

Where it ran:
* My own copy `pf4crev` on **:4431** (runtime range; never :4400): the real `main.ts`, `PLATFORM_IDENTITY=local`, the Sample seed. It was stopped afterwards, and its database and files were removed.
* Probes on scratch databases, from the suite's harness. The probe file was deleted.

This row has no screen. Its "users" are:
* the inviter (Owner, or an Admin with `agent/staff:manage`), through the route that PF-6 part 2's Invite screen will call;
* a person without the key (the wrong role);
* the invitee, through the email.

So the browser, axe, width and keyboard steps do not apply. Each criterion below says so.

## Journeys
1. **Main path (Owner, 2 rows, one named, one in mixed case).** 201 in 57 ms, with 2 invitations, both `emailed:true` and PENDING, and `seatsLimit 5, seatsUsed 5`.
   * `Yan.Ro@Example.com` is stored as `yan.ro@example.com`.
   * The list read (`GET staff/invitations`) shows both.
   * The fake mail's greeting reads "Hello Ana Silva," (suite). **Held.**
2. **Double click: the same form sent again.** 422 `ROWS_FLAGGED`, with each row "This person already has a pending invitation: resend it instead."
   * Two identical forms sent at once give 1 invitation, not 2 (probe m). **Held.**
3. **Over the seats (20 rows, 0 seats left).** 409, "25 of 5 seats after these invites (plan Team (Sample)). Remove 20 people or upgrade your plan. Nothing was sent.", with `removeCount 20` and every row listed. Nothing was created. **Held.**
4. **A mixed form from an Admin.** Every bad row is flagged on its own row and nothing is sent (suite DW4):
   * an Owner row;
   * a role beyond the Admin's keys;
   * `not-an-email`;
   * an unknown role;
   * a name with a line break.
5. **Errors one at a time.** A staff email together with a bad role shows only `INVALID_ROLES`. `ALREADY_STAFF` appears on the next submit. **Partly held** (review finding 1).
6. **Blank name.** `"   "` is flagged `INVALID_NAME` and blocks the form. **Failed, Minor** (review finding 3).
7. **Wrong role.** Read-only gives 403 `MISSING_PERMISSION`. With no session: 401. **Held.**
8. **Recovery.**
   * A forced insert failure on row 3 leaves no invitation, audit line or email.
   * A failed send leaves that row `emailed:false` and pending, and the others go out (suite DW5). **Held.**
9. **Race.**
   * Two batches of 2 with 3 seats left: one 201, one 409.
   * A batch against a single invite: one goes through.
   * Without the firm lock both pass (mutation), so the lock is what holds. **Held.**
10. **Across the boundary (PF-4 and PF-4b unchanged).** 119/119 and 55/0 against :4431. **Held.**

## Data underneath
* Exactly 2 invitation rows and 2 `platform.invitation.created` lines after journey 1.
* The audit detail holds `{invitationId, roles, reason:null, batch:true}`: no email and no name.
* "Zed Quill" is found in no table: a sweep of every text and jsonb table on the copy.
* `api.log` has no email or name. The request lines hold firmId, route and status.

## Break it (15 minutes; the breaker's report covers more)
* These are flagged `INVALID_EMAIL`, so no duplicate slips through: a tab, U+200B, a leading space, full-width `a`, Kelvin `K`, and a local part of 300 characters.
* Non-object rows (`null`, `7`) are flagged on their own row.
* An expired, unrevoked invitation does not block a new one.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | journey 1 on the real `main.ts`, end to end |
| next step obvious | ½ | each answer names the fix ("resend it instead", "Remove 1 person or upgrade"), but a row's second problem shows only after the first is fixed (journey 5) |
| plain words | 1 | "Nothing was sent.", "Invite an Owner on their own: it needs a reason and Confirm it's you." |
| feedback and state | 1 | flags per row; `emailed` per row; the seat line in 201 and 409 |
| correct data | 1 | exact counts; lower case kept; the name nowhere; no token |
| error recovery | 1 | all or nothing on a failed insert; double submit safe; a failed mail stays pending |
| accessibility and screen sizes | 1 | N/A: no UI in this row |
| speed | 1 | 2 rows 51-57 ms; 20-row 409 in 56 ms; 20-row 201 inside the suite |
| visual quality | 1 | N/A for a screen; the email greeting is one plain line |
| trust and sources | 1 | the plan is shown as "Team (Sample)"; no AI; no immigration values |

**Score: 9.5 / 10. Pass** (8 or more, no 0). The most valuable fix is review finding 1, which raises "next step obvious".

## Could not test
* A real screen reader, and an intended user's unaided walk: D17 and D20 stay with the founder. There is no screen yet (PF-6 part 2).
* A real MailPort (SES).
* CI on this head.
