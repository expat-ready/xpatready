# PF-19r part 1: break report (staff and system mail through MessagePort)

Breaker, 18 Nov. Branch `claude/runtime-pf19r-senders` at `74bd2a047`. No screen: attacked through the API and the code.
Paths are under `prototype/studio/`. The harness is a scratch file outside the repository, modelled on
`tests/check_pf19r_senders.ts`: a Nest app with the app's own `MAIL_PORT` (useExisting `MESSAGES_MAIL`) and
`MESSAGES_MAIL` providers, MessagePort on fakeJobs, the local email adapter, and a scratch database on 127.0.0.1:54329
(dropped afterwards). It never used port 4400. The PR's own suite passes (20/0). US$0, no model call.

## Breaks

**M1 Major: the trial cap holds the two-step reset notice, but the reset goes ahead and the answer says `notified: true`.**
Steps: trial firm (`platform_firm.status = 'TRIAL'`), `msg_send_counter.sent = 50` for today, then an Owner calls
`POST /api/platform/staff/<T>/reset-two-step`. Expected (brief, Part 1: "the two-step reset rolls back" when refused; the code
comment says the notice comes first): either the notice goes out, or the reset is refused. Actual: 200
`{"twoStep":{"method":null},"notified":true}`. The provider is reset, and the notice row is `QUEUED` with reason
`daily limit`, so it waits for the hourly sweep on the next day. For up to a day, the person gets no out-of-band warning
that their second step was removed. Cause: `send/messages.ts:122` applies the cap at delivery, after the caller's commit,
and `session/service.ts:198-205` treats QUEUED as notified. TRANSACTIONAL security mail counts against the cap like any
other mail.

**M2 Major: an invitation or batch held by the cap answers `emailed: true`. DW5 as briefed ("an invitation batch that hits
it reports the held rows") is not met.** Steps: trial firm, counter at 49, `POST /api/platform/staff/invitations/batch` with 2
rows. Actual: 201, both rows `emailed: true`. In the outbox, row 1 is SENT and row 2 is QUEUED `daily limit`. A single invite at 50
also answers `emailed: true` while QUEUED `daily limit`. The answer has no `held` field. The PR's test reverses the brief
on purpose and asserts it: `tests/check_pf19r_senders.ts:219` ("counts it as queued, not as not sent"). No challenge or
question records this deviation (`screens/PF-19r/` did not exist). The inviter sees "sent" for a link that may arrive a day
later, inside its 72-hour life.

**m1 Minor: deadlock on a firm's first-ever message.** Steps: a firm with no `msg_firm` row. Request A is a reset: `inFirm`
takes `platform_firm ... FOR UPDATE` (`session/service.ts:45`). A second sender B, such as `MessagesMail.send` for an
invitation, booking or code email, inserts `msg_firm` (`consent/messages-firm.ts:10`). Its foreign-key check waits for
A's row lock. A then reaches `ensureMessagesFirm` (`send/messages.ts:57`) and waits for B's uncommitted `msg_firm` row.
Postgres then raises `40P01 deadlock detected`. The harness slowed A by 0.8 s after its lock with a scratch-database
trigger, and the deadlock happened 3 of 3 times. Unslowed, it happened 1 of 25 times. In every run B was the victim (A had
waited less), so the reset succeeded and the other email failed after a 1 s stall: an invitation answers `emailed: false`,
and a job's mail is retried. This is rare (once per firm, and only while a reset is in flight), but it is the lock concern
`sendIn`'s comment says it avoids: the self-wait is gone, the cross-wait is not.

**m2 Minor: a double-pressed reset sends two notices.** Two `reset-two-step` calls for the same person at once both
answer 200 (the firm lock takes them one after the other). Result: 2 audit lines, 2 outbox rows and 2 "Your two-step
sign-in was reset" emails. The notice has no idempotency key (`session/service.ts:198`), so each call gets its own random
`mail:<uuid>` key.

**m3 Minor: the complaint reminder never reaches anyone when the handler's address is suppressed.** Steps: an active
handler whose address has a HARD_BOUNCE suppression, and a complaint past its acknowledgement date. Running
`runAckReminder` 4 times (pg-boss `retryLimit` 3, so 4 attempts) gives `MessageRefused: not sent: SUPPRESSED: HARD_BOUNCE`
each time, no REMINDER_SENT event and no outbox row, then the job dead-letters. The reminder does not fall back to the
Owners and Admins, or to the firm's contact address, as it does when the handler is inactive (`complaints.ts:454`
rethrows a permanent refusal for a retry that cannot succeed). "Not recorded as sent" holds, but nobody is reminded.

**m4 Minor (latent): a slow provider causes a reset with no notice and no audit line.** Steps: an IdentityAdminPort whose
`resetTwoStep` takes 5.5 s, longer than Prisma's default 5 s interactive transaction (no `transactionOptions` in
`core.ts`). Actual: 500. The provider is reset, the transaction is rolled back, and so there is no outbox row and no audit
line (`session/service.ts:204` runs after the notice is written, inside the transaction). Before PF-19r the in-memory
notice was already out at this point. This is latent because `CognitoIdentityAdmin` refuses every call today. The
missing audit line comes from earlier code, not from this row.

**m5 Minor: a sign-in code held by the cap is reported `sent: true`.** `handleCustomEmail`
(`session/email-sender.ts:40`) at the trial cap with the app's MailPort answers `{"sent":true}`, and the code email is
QUEUED `daily limit`, useless by the time it goes out. It is Minor only because sender 3 has no deployed caller (brief).

## Attempts that held

* **Suppressed invitation, address case variants.** `CASE.GONE@EXAMPLE.COM` and `Case.Gone@example.com` gave 201
  `emailed: false`, nothing in the inbox, and the invitation stayed pending. A leading space and a trailing dot gave 400
  `EMAIL_INVALID`. A mixed-case suppression row is refused by `msg_suppression_address_check`, and a mixed-case staff
  email by `platform_staff_email_lower`.
* **Suppressed reset notice.** 409 `NOTICE_NOT_SENT` in words that do not quote the address. The provider was not reset
  (still TOTP), there was no audit line and no outbox row.
* **Wrong firm and wrong role.** Firm B's Owner resetting firm A's staff got 404, with no outbox row. A Case Officer
  resetting got 403 `MISSING_PERMISSION`. Firm B's invitation went out from "Sample solo practice", with its outbox row
  under firm B and no firm A name in the HTML. A reminder job with firm B's id and firm A's complaint was `skipped`.
* **Reminder run twice.** Run one after the other: `sent`, then `skipped`. Run three at once: one `sent` and two
  `skipped`. Either way there was 1 outbox row and 1 REMINDER_SENT event (complaint row lock plus idempotency key).
* **Two resets of two different people at once.** Both 200, no lock error.
* **Reset as the firm's first message (alone).** 200, and `msg_firm` was created inside the reset's transaction, with no
  self-wait.
* **Provider reset failing after the notice is written.** 500, with no outbox row, no audit line and no send job queued.
  A rolled-back reset sends nothing.
* **Tokens and codes.** All 7 known secrets were scanned for: every invitation token read from the inbox, a planted
  43-character token, and the codes 731942 and 918273. None appeared in the captured stdout and stderr, `audit_event`
  (summary and detail), `module_event` payloads, `msg_outbox.state_reason` or `idempotency_key`, `msg_event.detail`, or the
  job payloads. A forced dispatch failure logs only `messages: dispatch of <outbox id> failed (Error)`. The refusal texts
  are `not sent: SUPPRESSED: HARD_BOUNCE` and `NOTICE_NOT_SENT`.

Not attacked: part 2 senders (5-7), screen checks (no screen), and real SES or Cognito (not on main).
