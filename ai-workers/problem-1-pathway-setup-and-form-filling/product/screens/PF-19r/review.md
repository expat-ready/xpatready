# Review: PF-19r part 1, staff and system mail through MessagePort (runtime row, no UI)

**Verdict: Approve** for `07f5e8ba0bcab86834eb45f61bad3204c74ec458` (Round 3, at the end; in the skill's words: Ship). Round 2 approved `b471711f`.
* Round 1 verdict, for `74bd2a0474304c622a67cb6685e8969881eff1cf`: Block (Ship after fixes). Diff `origin/main...74bd2a04`, on `claude/runtime-pf19r-senders`.
* Reviewer: Opus, fresh context, did not build it. 18 Nov 2026.
* Brief: PF-19r (Build Lead C, approved), Part 1, DW1-DW6, touch list, rulings.
* Journey score: Round 1 **7/10** (fail); Round 2 **9/10** (pass). See `journey-test-reviewer-2026-11-18.md`.

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

## Round 2: b471711f4e8c3f1786aaeb81ce61578cf2aa1da1 (diff only: `git diff 74bd2a04 b471711f`)
**Verdict: Approve.** No Blocker or Major is open.
* **What I ran:**
  * `check_pf19r_senders.ts` at b471711f: **24 passed, 0 failed**.
  * `check_pf21w_routes.ts`: **83 passed, 0 failed** on its own scratch database.
  * A fresh isolated copy `pf19r_rev2` on :4438, where I walked J4 and J7 again (journey report, Round 2). It is stopped and dropped.
* **M1: closed as a review finding. The ruling stays open, and it is the tech lead's.**
  * `challenge.md` (committed) sets out both rulings, three options and a recommendation. The question goes in the PR as "Question for the tech lead".
  * The `emailInvitation` comment (`identity/service.ts:321-324`) now says the truth: the token is in the rendered outbox file, unsealed.
  * The approved brief orders this binding (Part 1, DW1). Following it with the conflict disclosed meets "never deviate silently".
  * **Note for the coordinator:** an Approve merges the PR by itself, before the answer. If the tech lead wants choice 2 or 3 first, hold the label. Choice 3 is a one-line revert of `platform-staff-read.ts:18`.
  * **Small correction to `challenge.md`:** PF-19e has no BACKLOG row, but its brief exists at `lead-b-front-office:…/design/lead-b-briefs/PF-19e.md`. The lead can schedule it as written.
* **M2: fixed.**
  * `Messages.capHolds` (`send/messages.ts:90-101`) adds today's sent count to the firm's QUEUED rows up to and including this one, and compares that with `DAILY_CAP`.
  * Invitations answer `emailHeld: "daily limit"`, and the batch answer adds `heldRows`. Live: row 1 SENT, row 2 `QUEUED | daily limit`, `heldRows [2]`.
  * A reset whose notice would be held gets 409 NOTICE_HELD_DAILY_LIMIT in words, with no audit line, no outbox row and no reset (live).
  * A held code email answers `sent:false` with a reason.
* **M3: fixed.** `pf21w` now imports after its `DATABASE_URL` line (83 passed, 0 failed). My Round 1 "actor_id" stop came from that order: that run used this container's own `xr_studio_demo` database (never the Mac's :4400), and it may have left rows there.
* **m1 fixed:** `recipients` counts only the tier reached.
* **m2 fixed:** the words name an address that does not take email (live J4).
* **m3 fixed:**
  * `mailReady` (`session/service.ts:186`) commits `msg_firm` before `inFirm` takes the firm lock.
  * The new DW3 case runs a reset as firm B's first message, at the same moment as another firm-B email: both 200, no wait.
  * I checked the ordering against a complaint run that inserts `msg_firm` at the same time: no cycle, because `mailReady` commits before the lock.
* **m4 and m5:** to be named in the PR body. They are not in the commit, so I cannot check them here.
* **Breaker m3, the reminder fallback:** now handler, then Owners and Admins, then the firm's contact, picked from `msg_suppression`. The order is still event, audit, then mail. A refused send still rolls back. Tested pass and fail.

**New Minor (none blocks)**
* **r2-m1** `send/messages.ts:90-101`: `capHolds` is a prediction.
  * It counts every QUEUED row of the firm, including rows the worker has not reached yet. My first Round 2 walk, seconds after the copy started, saw both rows reported held while the J4 notice was still QUEUED.
  * A row that later ends SUPPRESSED or FAILED makes it pessimistic: a reset can be refused "try again tomorrow" when there was room.
  * Sends committed between the prediction and the worker make it optimistic: `notified:true` while the notice is held (a narrow race).
  * Both are acceptable for a prediction the worker overrides. Worth one line in the PR.
* **r2-m2** `complaints.ts:441-447`: the tier choice reads `msg_suppression` directly instead of asking `ConsentPort.allows`. It matches `decide()` today (`ports/consent.ts`: for SERVICE and TRANSACTIONAL email only suppression refuses). If the gate gains a rule later, such a recipient would roll the run back on every try with no fallback, though it would still never be sent to. **Fix (later):** ask `consent.allows(tx, …)` per recipient.
* **r2-m3** `email-sender.ts:41-43`: a held code email still goes out the next day, when its code has likely expired. It is reported `sent:false`, which is right. Information only.
* **Accepted and listed in the PR (breaker):** m2, two resets pressed at once give two notices, both real resets with their audit lines. m4, latent, a provider slower than 5 s.
* **No screen in this row:** the invite panel's toast does not show `emailHeld` or `heldRows` yet. That is for the screens lane, not a finding here.

## Round 3: 07f5e8ba0bcab86834eb45f61bad3204c74ec458 (the merge 0c960a480 and commit 07f5e8ba only)
**Verdict: Approve.** No Blocker or Major is open.
* **Lead B's answer** (PR comment 6987664663 on #2157): keep the binding; PF-19e seals later, with demo and test copies only until then. That settles the M1 ruling.
* **Merge 0c960a480:** correct.
  * The merge differs from `origin/main` (its second parent) in exactly the PR's own 18 files. Nothing else from `main` was changed or lost.
  * `MODULE.md` keeps main's PF-18b blocks: Purpose `support/`, the support entry points, the tables, and `check_pf18b_support.ts`.
  * It re-applies only this PR's two additions: the `MESSAGES_MAIL` sentence and `tests/check_pf19r_senders.ts`.
* **`session/service.ts:203`:** the NOTICE_NOT_SENT words now say how to clear it ("Update this person's email address first; …"), as Lead B asked. The DW3 fail case asserts the new opening.
* **`features/platform-support.ts`:** `MAIL_PORT` is now required, with no `fakeMail()` fallback, and the comment is corrected. This is right.
  * The app always binds `MAIL_PORT`.
  * The only suite that builds this feature is `check_pf18b_support.ts`, and it provides `MAIL_PORT`.
  * DW6 needs the change.
  * The ticket email (`support/support.ts:161-166`) is sent after its transaction commits, so there is no lock wait. It carries ids and the page only, never the body. A failure still answers `emailed:false`.
* **What I ran:** `check_pf19r_senders.ts` **24 passed, 0 failed**; `check_pf18b_support.ts` **41 passed, 0 failed**.

**New Minor (does not block)**
* **r3-m1** `support/support.ts:160-166`: the ticket notice to our own support inbox now goes as the firm, with the firm's sender name and layout, and counts against that firm's daily cap. When the cap holds it, the answer still says `emailed:true`: support's own code does not read `held` (`heldOf`). The ticket itself is saved, and the console shows it. **Fix (later, PF-18b's owner):** report `held`, or send the notice as the platform's own mail (PF-19p's platform account messages).
