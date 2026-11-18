# Journey test: PF-19r part 1, reviewer role, 18 Nov 2026

* Commit `74bd2a0474304c622a67cb6685e8969881eff1cf`. The app code is identical at head `cd7f41995`.
* Isolated copy `pf19r_rev` on :4438 (runtime ports, never :4400), with `PLATFORM_IDENTITY=local` and the Sample seed. It is stopped, and its database and files are removed.
* This is a runtime row with no UI change. The journeys are walked through the product's own API and the demo platform inbox, the stand-in for the person's mailbox. Then I read the outbox, the stored files and api.log.
* There is no Playwright, axe or width replay: no page changed. The automated replay is `tests/check_pf19r_senders.ts` (20 passed, 0 failed).

## Journeys (persona · goal · result)
1. **Main path.** The Owner (user-R) invites a new Case Officer, who opens the email.
   * 201 `emailed:true` in 77 ms.
   * The inbox has 1 email in the one layout: firm name on top, "Sent by Sample immigration firm.", the firm's sender name and Reply-To.
   * The link opens VALID ("Continue to set your password").
   * **Held:** yes.
2. **Alternate.** The Owner resets a colleague's two-step sign-in.
   * 200 `notified:true`.
   * The inbox has "Your two-step sign-in was reset" with the layout.
   * The outbox row is TRANSACTIONAL for the STAFF person, SENT.
   * **Held:** yes.
3. **Wrong role.** A Case Officer (user-O) tries the reset.
   * 403 MISSING_PERMISSION in words.
   * **Held:** yes.
4. **Error, gate.** A reset for a colleague whose address is suppressed (hard bounce).
   * 409 NOTICE_NOT_SENT: "...so their two-step sign-in was not reset. Check their email address."
   * No new audit line, no outbox row kept.
   * **Held.** The words are slightly off for a bounce (review m2).
5. **Error, gate.** An invitation to a suppressed address.
   * 201 `emailed:false`, PENDING.
   * The outbox row is `SUPPRESSED: HARD_BOUNCE`, and nothing is sent.
   * **Held:** yes.
6. **Recovery, double click.** The same invitation sent twice at once.
   * One 201 and one 409 "Already invited... resend".
   * One outbox row, SENT.
   * **Held:** yes.
7. **Limit.** A trial firm has sent 49 emails today, then runs a batch of 2 invites and a reset.
   * The 50th is SENT. The 51st is `QUEUED | daily limit`.
   * The batch answers both rows `emailed:true`.
   * The reset answers `notified:true` while its notice is `QUEUED | daily limit`.
   * **Not held** (review M2).
8. **Trust.** Where the invitation token is kept.
   * api.log: 0 hits for the token and 0 for `invitation#t`.
   * The token is **in clear** in `msg/<firm>/outbox/<id>.json` and still opens the invitation.
   * **Not held** against PF-4b's rule and Lead B's rev 16.64 ruling (review M1).
9. **Across the boundary.** The complaint reminder to the handler, then to the Owners and Admins, then to the firm's contact address.
   * Suite only: SERVICE with STAFF for each person, the TRANSACTIONAL fallback, and a rollback when nobody can be sent it.
   * Not walked live: the job runner's timing.

## Break it (15 min)
* **Suppressed invite, reset and code email:** each refused. A refused reset rolls back.
* **The 51st send of the day:** held correctly, but reported as sent (M2).
* **Double invite:** one invitation, one email.
* **Wrong role by URL:** 403.
* **Lock:** the reset as a firm's first message is protected by `sendIn` (read from the code and the migration). No test covers it (m3).
* **Token in a log or refusal text:** none.
* **Token at rest:** yes (M1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 complete end to end. The link opens VALID. |
| Next step obvious | ½ | J7: "emailed" and "notified" tell the Owner nothing more is needed while the email is held. |
| Plain words | ½ | J4's "Check their email address" does not fit a bounced address. The other answers are plain. |
| Feedback and state | ½ | J7: held rows are reported as sent (DW5 not met). |
| Correct data | ½ | Outbox rows are correct (J1-J6). The reminder's `recipients` count includes skipped recipients (m1). The token is kept at rest (J8). |
| Error recovery | 1 | J4 rolls back fully. In J5 the invitation stays pending and can be resent. The reminder retries. |
| Accessibility and screen sizes | ½ | No UI changed and none was walked. The email keeps the one layout. Not tested with a screen reader. |
| Speed | 1 | Invite in 77 ms. The suite runs in 6.5 s. |
| Visual quality | 1 | The one layout on every email walked (J1, J2). |
| Trust and sources | ½ | The "Sent by" line and the firm's sender name are right. Tokens and codes are unsealed at rest (J8). |

**Score: 7/10. Fail** (pass is 8 or more; no criterion at 0).

## Fixes that raise the score, most valuable first
1. Report held emails as held, or get DW5 amended (M2). This raises next step and feedback.
2. Get the ruling on unsealed tokens and the cap, against Lead B's PF-19e ruling, and correct `identity/service.ts:319-320` (M1). This raises trust and correct data.
3. Use refusal words that fit a suppressed address (m2), and record only the recipients actually emailed (m1).

## Not tested
* A real mailbox, Cognito or SES.
* The complaint reminder through the live job runner.
* An intended user's unaided walk: D17 and D20 stay with the founder.

## Round 2: b471711f4e8c3f1786aaeb81ce61578cf2aa1da1
Fresh isolated copy `pf19r_rev2` on :4438, with `PLATFORM_IDENTITY=local` and the Sample seed. It is stopped and dropped. The suite gave 24 passed, 0 failed.
* **J4 again (suppressed reset):** 409 NOTICE_NOT_SENT, "...their address does not take email from the firm, for example after a bounce..." No reset. **Held.**
* **J7 again (trial firm at 49):**
  * The batch of 2 answers row 1 `emailed:true`, and row 2 `emailHeld:"daily limit"` with `heldRows [2]`. The outbox matches: row 1 SENT, row 2 `QUEUED | daily limit`.
  * The reset at the cap gives 409 NOTICE_HELD_DAILY_LIMIT, "...was not reset. Try again tomorrow." No audit line, no outbox row.
  * **Held.**
  * A first try right after the copy started reported both rows held, because the earlier notice was still QUEUED. The prediction is pessimistic, not wrong (review r2-m1).
* **J8 again (tokens):** 0 token hits in api.log. The token is still unsealed in the outbox file; the tech lead rules on that (`challenge.md`).

| Criterion | R1 | R2 | Evidence (R2) |
|---|---|---|---|
| Task completed | 1 | 1 | J1 and J2 unchanged (suite DW1, DW3). |
| Next step obvious | ½ | 1 | Held rows are named, and the reset says "Try again tomorrow". |
| Plain words | ½ | 1 | J4's words fit a bounce. |
| Feedback and state | ½ | 1 | `emailHeld`, `heldRows`, NOTICE_HELD_DAILY_LIMIT, `sent:false`. |
| Correct data | ½ | 1 | `recipients` counts only who is reached. Outbox and answers agree (J7). |
| Error recovery | 1 | 1 | A held reset changes nothing and can be done again. The reminder falls back by tier. |
| Accessibility and screen sizes | ½ | ½ | No UI changed and none was walked. |
| Speed | 1 | 1 | Unchanged. |
| Visual quality | 1 | 1 | Unchanged. |
| Trust and sources | ½ | ½ | Tokens and codes are still unsealed at rest until the ruling (disclosed). |

**Round 2 score: 9/10. Pass** (8 or more, no criterion at 0). To raise it: seal transactional bodies (PF-19e, or whichever choice the tech lead rules), and walk the screens once they show `emailHeld`.
