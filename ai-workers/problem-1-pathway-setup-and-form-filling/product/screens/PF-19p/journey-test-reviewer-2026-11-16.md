# PF-19p journey test (reviewer role), 16 Nov 2026

Commit `a1b2794e828960f0961edeedd39d28f8c51024ef` (PR #1961). This is a backend row: the brief builds a schema, two ports, the send path and the demo inbox's listing, and there is no screen. The PR says "nothing to click yet": the first caller, the sign-up email, is PF-5v part 2.

The journeys were therefore walked where a person (or the next row's code) meets the row:
* the demo inbox endpoint, on an isolated copy on :4431 (runtime ports, WAY-OF-WORKING);
* the real `MessagesMail`, `Messages` and `PlatformInbox` on scratch databases.

No browser walk was possible: there are no pages. Measured on clean worktrees of the commit, because the shared checkout was being edited by another agent.

## Journeys
1. **Main.** Persona: a person signing up (before any firm exists). Goal: "I get the email with my code." Steps: `MESSAGES_MAIL.send({ platformAccount: true, to, subject, text, class: TRANSACTIONAL, idempotencyKey })`, then open the demo inbox for the address. Expected: one email from "ExpatReady <no-reply@expatready.com>", with no firm's name and no "reply to reach them". **Held** (DW1; the address in mixed case is normalised).
2. **Retry or double click.** The same key is sent again. Expected: the same email, not a second one. **Held** (DW1). Also 12 concurrent sends give 1 row, and REPEATABLE READ answers `MessageRepeated` (probe).
3. **Alternate.** A firm's email reuses the same key. Expected: its own email. **Held.**
4. **Error, bad input.** Both `firmId` and `platformAccount`, neither, marketing, service, a person, an attachment, WhatsApp, a template. Expected: refused and nothing stored. **Held.** The refusal is a raw ZodError from `MailMessage.parse`, not plain words. That is acceptable for a port (callers map it), but a note for PF-5v.
5. **Error, provider failure.** The email adapter throws. Expected: the failure is recorded, tried again with backoff, and ends FAILED with a reason, and someone is told. **Failed.** The row stays QUEUED with no reason, `dispatch` swallows the error, 0 log lines, and the sweep calls the provider every minute forever (review M2).
6. **Recovery after a crash.** The row is written and the process dies before dispatch. Expected: sent once after `SWEEP_AFTER_MS`, and not before. **Held** (DW1 sweep case).
7. **Content changed.** The stored hash no longer matches. Expected: FAILED "content changed", and nothing sent. **Held.**
8. **Wrong role.**
   - A firm's worker is handed a platform id: skipped. **Held.**
   - A client persona opens the demo inbox: 403 with plain words. **Held** (:4431).
   - A firm role behind a PF-12-shaped wall reads 0 platform rows. **Held** (probe policy). Writes are unproven (review m3).
9. **Bad address in the inbox.** `?address=not-an-email` gives 400 "Enter an email address like name@example.com." **Held.**
10. **Across the boundary (to PF-5v and the sign-up door).** The send runs inline in the caller's request (review M1). With #1956's SES adapter the sign-up answer would wait on SES for up to 20 s, and an SES failure would be invisible (M2). **Not met** against STANDARDS:28.

## Data underneath
* One row per key, `audience` PLATFORM_ACCOUNT, `firm_id` NULL, TRANSACTIONAL, no consent and no subject. SENT with a `local:` provider id.
* The rendered file is in the platform file space only, not in firm A's.
* No `msg_firm` row is made, there is no `msg_event`, and there is no job.
* The CHECK refuses the wrong shapes on raw insert and on update (23514), and a duplicate platform key (23505).

## Break it (15 minutes)
* 51 failing addresses and one row left by a crash: the row left by the crash is starved (as in the breaker's F1).
* Three `dispatch` calls, two sweeps and one `deliver` at once: one provider call.
* A raw `consent_id` or `template_version_id` on a platform row: refused, but untested (review m2).

## Score (0, ½ or 1; criteria that need a screen are N/A, and the score is scaled from the 7 that apply)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2, 6: stored, sent once, shown by address |
| Next step obvious | N/A | no screen |
| Plain words | ½ | inbox 400 and 403 are plain; a port refusal is a raw ZodError (journey 4) |
| Feedback and state | ½ | a failed send has no reason, no log and no FAILED state (journey 5) |
| Correct data | 1 | one row per key under a race; exact columns; CHECK and index hold |
| Error recovery | ½ | a crash is recovered (6); a failing provider loops forever and starves the sweep (5) |
| Accessibility and screen sizes | N/A | no screen |
| Speed | ½ | inbox 10-13 ms; but delivery runs inside the caller's request (journey 10) |
| Visual quality | N/A | no screen; the email layout was checked only in text (header "ExpatReady", no reply line) |
| Trust and sources | 1 | the From address is labelled Sample; no AI involved |

**5 / 7 applicable → 7 / 10. No 0, but below the pass mark of 8.** Fixes that would raise it, most valuable first:
1. Retry with backoff, end FAILED with a reason, and log ids only (M2): raises feedback and error recovery.
2. Deliver through the worker, or under a ruled exception (M1): raises speed.

## Not tested
* A browser or screen reader (no pages).
* Real SES.
* PF-12's roles on this commit (the breaker ran that check).
* An intended user's unaided walk (D17 and D20 stay with the founder).
