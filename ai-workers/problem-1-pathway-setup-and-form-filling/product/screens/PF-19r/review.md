# Review: PF-19r part 1, staff and system mail through MessagePort (runtime row, no UI)

**Verdict: Block** (in the screen-review skill's words: Ship after fixes)
* Commit reviewed: `74bd2a0474304c622a67cb6685e8969881eff1cf` on `claude/runtime-pf19r-senders`, diff `origin/main...74bd2a04`.
* Reviewer: Opus, fresh context, did not build it. 18 Nov 2026.
* Brief: PF-19r (Build Lead C, approved), Part 1, DW1-DW6, touch list, rulings.
* Journey score: **7/10, below the pass**. See `journey-test-reviewer-2026-11-18.md`.

## What I ran
* `tests/check_pf19r_senders.ts` at the reviewed app code: **20 passed, 0 failed**, 6.5 s.
* An isolated copy `pf19r_rev` on :4438 (runtime ports), with `PLATFORM_IDENTITY=local` and the Sample seed. I walked 8 API journeys there and read the outbox, the stored files and api.log with psql and grep. The copy is stopped and its database dropped.
* `api/`, `ports/`, `prisma/` and `web/` at the branch head `cd7f41995` match 74bd2a04. Only two suites differ (see M3).

## What holds (checked)
* **The gate on every path:**
  * Invitation: a suppressed address gets a SUPPRESSED row, `emailed:false`, and the invitation stays pending (live J5).
  * Two-step reset: 409 NOTICE_NOT_SENT, everything rolled back, no audit line, the provider not reset (live J4).
  * Code email (`handleCustomEmail` over the app's MailPort): refused, and the refusal does not quote the code (suite).
  * Complaint reminder: a suppressed handler means no REMINDER_SENT and the run rolls back (suite).
  * The firm-contact fallback is TRANSACTIONAL, so it is still checked against the suppression list.
* **No email after a rollback, and none lost after a commit:**
  * The reset notice and the reminder are written in the caller's transaction and dispatched only after the commit (`session/service.ts:196-208`, `complaints.ts:417,447`).
  * Invitations are still sent after their own commit (`identity/service.ts:354,387,423`).
* **No lock wait:**
  * `MessagesMail.send` opens its own transaction. On a firm's first message it inserts `msg_firm`, whose foreign key to `platform_firm` (`pf19a` migration:247) takes FOR KEY SHARE. That waits on `inFirm`'s `FOR UPDATE` (`identity/service.ts:169`).
  * So `sendIn` and `mailIn` are needed. The change is justified even though `send/mail.ts` is not in the touch list (see m5).
  * Invitations are sent after `inFirm` commits, so they cannot wait on that lock.
* **SERVICE email always has its person:**
  * The handler and each Owner or Admin are sent the reminder as STAFF.
  * `MessagesMail` refuses a SERVICE email with no person (DW4 fail).
* **No token or code in logs:** api.log of the copy after all the journeys has 0 hits for the invitation token and 0 for `invitation#t`. Refusal texts carry only `SUPPRESSED: <reason>`.
* **Suites that build their own MailPort are unaffected:** `check_pf4b`, `pf4c`, `pf5t`, `pf6m`, `pf6m2`, `pf6r` and `pf21` give their own LocalMail or fakeMail, and `mailIn` falls back to `send`. No suite reads LocalMail's inbox from the app's binding. `tests/qa/check_r16_money_keys_by_invitation.ts:31` seeds a token hash and does not read the inbox.
* **DW1, DW2, DW3, DW4 and DW6 pass, each with its fail.** The layout is live: firm name on top, "Sent by Sample immigration firm.", the firm's sender name and its Reply-To.

## Findings
**M1 (Major): invitation tokens and sign-in codes are now stored unsealed at rest. This reverses Lead B's standing ruling, and the PR does not say so.**
* **Where:** `features/platform-staff-read.ts:18` (`MAIL_PORT` → `MESSAGES_MAIL`), `tests/check_pf19b2_ses.ts:334-339`, `identity/service.ts:319-320`.
* **What I found live:** after one invite, `var/isolated-pf19r_rev/front-office-files/<firm>/msg/<firm>/outbox/<id>.json` held the plain token. The token still opened the invitation (`GET /api/public/invitations/<t>` → VALID). The suite shows the same for the code `731942` (DW3 sender 3).
* **Why this needs a ruling:**
  * PF-19b2 review M1 was closed only by Lead B's ruling of rev 16.64 (`screens/PF-19b2/review.md:152`). That ruling moved this exact switch to PF-19e, together with sealed TRANSACTIONAL bodies, an exemption from the daily cap for account mail, and a 409 with an audit line. The PF-19e brief is on `lead-b-front-office`, and PF-19e is not on `main`.
  * The brief line quoted in `check_pf19b2_ses.ts:334` is from Part 2. It is about case-side links "as demo_message does today", not about staff invitation tokens.
  * The PF-4b comment at `identity/service.ts:319-320` ("never stored or logged") is now false.
* **Failure scenario:** in production the file is in S3 with no removal. Anyone who can read the outbox store can accept any pending invitation for 72 hours. Cognito reset codes sit at rest beside them.
* **Fix:**
  1. Post a "Question for the tech lead" on the PR that names Lead B's rev 16.64 ruling and PF-19e: does PF-19r's switch go ahead before sealing? Is the daily cap applied (PF-19r DW5) or are these emails exempt (PF-19e)?
  2. Record the answer.
  3. Correct the comment at `identity/service.ts:319-320`. My judgement: the brief orders the binding (Part 1, DW1), but it does not rule on keeping tokens unsealed, and AGENTS rule 2 sends conflicting rulings to a person.

**M2 (Major): DW5's second half is not met. The answer says "emailed" or "notified" while the email is held.**
* **Where:**
  * `tests/check_pf19r_senders.ts:217-219` asserts that the batch's answer does *not* report the held row ("counts it as queued, not as not sent").
  * The brief's DW5 says "an invitation batch that hits it reports the held rows".
  * `identity/service.ts:387` and `session/service.ts:205` answer `emailed:true` and `notified:true`.
* **What I found live (J7):** a trial firm with 49 emails sent today runs a batch of 2. The answer was `[(a, True), (b, True)]`, and b's outbox row was `QUEUED|daily limit`. A two-step reset then answered `notified:true` while its notice was `QUEUED|daily limit`.
* **Failure scenario:** an Owner resets a colleague's two-step sign-in late on a busy trial day. The screen says the person was told, but the security notice is held until the next day.
* **Fix:** do one of these, and name it in the PR:
  * Report the held rows as DW5 says. For example, a row flag when the firm's count for today (`msg_send_counter` plus QUEUED rows) is at `DAILY_CAP`.
  * Or get Build Lead C to amend DW5 (this ties to M1's cap question).
  * Do not keep a test that asserts the opposite of the Done-when line without that ruling.

**M3 (Major at this commit): two complaint suites cannot start.**
* **Where:** `features/platform-complaints.ts:40` now injects `MESSAGES_MAIL`. `tests/check_pf21w_routes.ts` (on the brief's "pass unchanged" list) and `tests/check_pf21v_views.ts` build their app from `feature.providers` without it.
* **What I found:** main's `pf21w` against this code exits 1 silently at app start (Nest's `abortOnError` with `logger:false`).
* **Already addressed after this commit:** the builder's `cd7f41995` adds the provider to both suites. The diff is correct, but in `pf21w` it puts two `await import` lines inside the header comment block (cosmetic).
* **Fix:**
  * Re-review head `cd7f41995`.
  * The PR names both suite lines, as the brief asks.
  * Paste their result lines. My run of `pf21w` at `cd7f41995` stopped on `Unique constraint failed on (actor_id)` at line 85. I could not tell whether my environment caused it.

**Minor**
* **m1** `complaints.ts:435,438`: the REMINDER_SENT event and the audit line record `recipients: to.length`, and say "sent to the firm's Owners and Admins", even when the gate skipped one of them. **Fix:** count only the recipients the email was written for.
* **m2** `session/service.ts:201`: the 409 says "Check their email address." A suppressed address can be typed correctly (a bounce or a complaint). Part 2's words fit better: "this address does not take email from the firm".
* **m3** `send/mail.ts:72`: `mailIn` tests `instanceof MessagesMail`. A wrapped or decorated MessagesMail would quietly fall back to `send()` under the firm lock, which is the wait this change removes. No test resets as a firm's first message: DW3 runs after DW1 has made `msg_firm`. **Fix:** add a test where the reset is the firm's first message.
* **m4** Sender 3: `handleCustomEmail` still has no caller in `api/src`. Only the suite gives it the app's MailPort. **Fix:** write "Not verified: deployed wiring" in the PR.
* **m5** Outside the touch list: `send/mail.ts` (`sendIn`, `mailIn`) and `tests/check_pf19b2_ses.ts`. The first is justified (see "No lock wait" above). Both must be named in the PR body (never deviate silently).
* **m6** The firm-contact fallback sends as TRANSACTIONAL with no person. This is reasonable and still gated. Keep the question for the tech lead on the PR.

## D1-D20 (runtime row: only the dimensions this row touches; the rest N/A, no UI)
D1 requirement fit 3/5: DW5 is half met (M2) and M1 conflicts with a ruling. · D2 data integrity 4/5: one outbox row per idempotency key, rollbacks are clean, event counts are off (m1). · D5 stability and recovery 4/5: a refused reset rolls back, a reminder retries, a double invite gets 409. · D11 feedback and state 2/5: "emailed" and "notified" are shown while held (M2). · D15 speed 5/5: an invite answers in 77 ms. · D16 testability 3/5: every DW has a pass and a fail, but DW5's test asserts the opposite of the brief, two suites break at this commit (M3), and the first-message lock case is not tested (m3). · D18 provenance 4/5: the layout's "Sent by" line and the firm's sender name. · D17 and D20 are simulated only. · D3, D4, D6-D10, D12-D14 and D19 are N/A (no screen, form or rule content changed).

## BIC-01..20
N/A: a staff and system runtime row with no case-side screen (`EXPERIENCE.md` §6 scope).

## Graph (P-86)
`graph.mjs`: G1 0, G4 0, G5 0. No page or route was added or removed by this diff.

## Not checked
* A live complaint reminder through the app's job runner (pg-boss timing). It is covered by the suite only.
* Cognito and SES on a real account.
* A real screen reader, and the browser panels (no UI change in this diff).
* The other suites, which the builder runs.
