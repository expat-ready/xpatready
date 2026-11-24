# PF-19e: break report (sealed TRANSACTIONAL bodies; the platform's own mail off the daily cap, 5 an hour per address)

**Commit broken:** `570c344b483ace08ee761d08c704a53d2c367de3` (branch `claude/runtime-pf19e-sealed`). Breaker, fresh context, 24 Nov.
**Copy:** never :4400. Probe scripts in `/tmp/claude-0/pf19e-break/` (outside the repository), built on `tests/check_pf19e_sealed_bodies.ts`'s harness: scratch database on 127.0.0.1:54329 (dropped afterwards), an in-process Nest app with the app's own `MAIL_PORT` and `MESSAGES_MAIL` providers, MessagePort on fakeJobs, AES-GCM box on a test ring, local email adapter. US$0, no model call. Paths below are under `prototype/studio/`.
**Scope (P-26):** the brief's "What to build" items 1-4 and the 18 Nov amendment. The row has no screen, so the keyboard, 1024 px, 200 % zoom, reload/back and 100-program budget attacks do not apply.
**Suites at this commit (all exit 0):** pf19e 24/0, pf19r_senders 27/0, pf19r_every_sender 21/0, pf4b_session_reads 55/0, pf19a 94/0, pf19b_sending 42/0, pf19b_mail 29/0, pf19p 68/0, pf6m_money_line 12/0. The working tree is clean afterwards, with no .png rewritten.

## Breaks

**B1 Major: over the hourly limit, an invitation answers 200/201 `emailed: false` instead of 429. On Resend, the person's last working link is revoked and no new link is emailed.**
Steps: invite `a.limit@example.com`, then `POST /api/platform/staff/invitations/<id>/resend` 5 times within an hour.
Expected (item 3): the 6th account email to one address gets "429 with a plain sentence", and nothing changes (as the reset does).
Actual: `[201 emailed:true, 200 ×4 emailed:true, 200 emailed:false]`. The outbox holds 5 SENT rows. The newest link that was emailed now opens as `{"state":"NOT_VALID","words":"This invitation is no longer valid."}`. One invitation is open, and its token was never sent to anyone.
The panel then says "…the email could not be sent. Try Resend again." (`web/src/modules/platform/staff/person-panel.tsx:109`). Each further press within the hour revokes again and sends nothing.
Cause: `MessageLimited` is swallowed by `catch { return { emailed: false }; }` (`api/src/platform/identity/service.ts:403`), and `resend` revokes the old link before it emails (`:492`). The same happens on a new invite and on each batch row: no 429, no sentence.

**B2 Major: an invitation to a suppressed staff address answers 201 `emailed: false`, not 409, and writes no audit line about the failed send (item 4, "invitation or two-step reset").**
Steps: add `msg_suppression` (firm A, EMAIL, `b.suppressed@example.com`, HARD_BOUNCE), then `POST /api/platform/staff/invitations {email, roles:["CASE_OFFICER"]}`.
Expected: 409 "We couldn't send email to <address>. Ask your firm's Owner or Admin to check it.", plus an audit line.
Actual: `201 {"status":"PENDING","emailed":false}`. Audit counts change only by `platform.invitation.created +1`. A retry through the batch gets `ALREADY_INVITED` ("resend it instead"), so it loops into B1's Resend.
`identity/service.ts` is on the touch list for exactly this, but the diff does not change it, and DW4 tests only the reset.

**m1 Minor: the reset's 409 does not use the brief's sentence.** `session/service.ts:225` answers "Update this person's email address first; we can't send them the reset notice (…), so their two-step sign-in was not reset." (`NOTICE_NOT_SENT`, the PF-19r text). The brief asks for "We couldn't send email to <address>. Ask your firm's Owner or Admin to check it." The audit line and the "never 500" part hold.

**m2 Minor: the limit counts per firm and address, not per address on the platform.** `send/messages.ts:128` filters on `"firm_id" = firmId`. Steps: 5 code emails to `victim@example.com` through firm A (the 6th is refused), then 5 more through firm B: `[true,true,true,true,true]`. The total is 10 an hour, and 5 × N with N firms. Item 3 says "a platform per-address limit".

**m3 Minor: codes, resets, invitations and the account-takeover notice share one bucket.** An unauthenticated caller can therefore silence the security notice and block an Owner's reset.
- Steps: 5 `CustomEmailSender_ForgotPassword` events for one address (anyone who knows the email can trigger them), then `CustomEmailSender_AccountTakeOverNotification`. Result: `{"sent":false,"reason":"at most 5 account emails an hour go to one address"}`.
- Mixed storm (12 concurrent resets of user T, plus 12 concurrent sign-in codes to T's address in mixed case), 3 runs: each time the codes took all 5 places, and all 12 resets answered 429 `EMAIL_HOURLY_LIMIT`.

**m4 Minor: a retired key version fails a queued body as "content changed", with no alert, and the rotation runbook never counts message bodies.**
Steps:
1. A receipt is held at the trial cap (QUEUED `daily limit`), sealed with v1.
2. The server's ring becomes `{2}` (runbook step 5). The firm goes ACTIVE, then `deliver`.
Result: `["failed","FAILED","content changed"]`, one FAILED `msg_event {"reason":"content changed"}`, no alert, no log line. With the ring `{1,2}`, the same send succeeds.
Causes:
- `opened()` (`send/messages.ts:87`) turns `KEY_RETIRED` into the tamper reason.
- Outbox bodies are not a `SealedValueStore`, so `enqueueReencrypt` and `versionCounts` (`deploy/RUNBOOK-secrets.md` step 4, "rules out" values left on v1) never see them.
- The demo inbox drops those SENT bodies without a word (`demo-inbox.ts:46`): 0 messages under the `{2}` ring.

**m5 Minor: rows written before the deploy fail.**
- A TRANSACTIONAL row that is still QUEUED and was stored plain before PF-19e (for example PF-19r's invitations held `daily limit`) is FAILED "content changed" at its next sweep. `openStored` refuses any plain transactional body (`sealed-body.ts:56`). The suite's own DW1 fail shows the result (`check_pf19e_sealed_bodies.ts:145`).
- On the long-lived demo database, every transactional message sent earlier disappears from `GET /api/demo/platform-inbox` (`demo-inbox.ts:46`, `catch { continue; }`).
- No migration or fallback exists, and none is mentioned.

**m6 Minor: the exemption keys on `templateKey` starting `identity.` (`send/mail.ts:81`), not on the system actor.** Other TRANSACTIONAL mail the platform itself sends is still held at the cap.
Steps: a trial firm at 50, then `MessagesMail.send` with `platform.storage_over_team` and with `platform.billing.deletion_warning` (TRANSACTIONAL, no person, as `billing/exit-notices.ts:74-77` sends to the billing address). Both answer `held: true` and stay QUEUED `daily limit`.
Also built this way: `support.ticket_raised` to our own support inbox (`support/support.ts:179`) and the complaint reminder's last resort (`complaints/complaints.ts:504`).
Item 3 exempts "TRANSACTIONAL messages sent by the platform (the system actor), not by staff to a client", and the amendment says "Only marketing and service mail is held at the cap". The row owner should say which reading holds.

**m7 Minor: the amendment's "a test per sender checks that its stored outbox file holds no link, token or code text" is only partly met.** DW1 checks the invitation and DW2 a PF-19p code. No test checks the files of the two-step reset notice, the provider's code emails or the complaint reminder's last resort. My probe found them sealed: a grep of the file store for the code `828282`, "two-step sign-in was reset" and `C-4242` found nothing. Only the regression guard is missing.

**m8 Minor: on a non-local copy, the demo inbox is an unauthenticated opener of every sealed body.** This happens when `STUDIO_WORKSPACE_KEY` is unset (default `demo`, `api/src/core.ts:27,29`) and `PLATFORM_SES_REGION` is unset (optional, `config/settings.ts:50`, which falls back to the local adapter at `send/channels.ts:20`).
On such a copy (PLATFORM_ENVIRONMENT=test or staging, key ring set), `GET /api/demo/platform-inbox?address=` (`@OpenRead`) opens every invitation link, code and reset notice by address.
The gate is the workspace name, never the environment. This is from reading the code; I did not deploy such a copy. It matters for the amendment's gate ("before any copy with real people").

**m9 Minor (what the brief asks, noted for the row owner): invitations off the cap reopen the trial firm's bulk-mail limit.** Steps: trial firm at 50, then 60 × (invite `spam<i>@example.org`, revoke). Result: 60 of 60 SENT, counter still 50. The subject carries the firm's own `operatingName`. Only the per-address limit applies, and it does not stop distinct addresses.

## What held
- **Sealing on disk.** No `invitation#t=`, code, address or words were found in any TRANSACTIONAL file (invitation, reset notice, sign-in code, complaint reminder, receipt, PF-19p under the platform owner). Marketing is stored plain as before. `rendered_hash` is the hash of the sealed bytes.
- **Tampering, with the hash recomputed each time.** Each of these ended FAILED "content changed" and sent nothing: a body moved to another row, the parts of a 6-part body swapped, the last part dropped, firm A's file put on firm B's row. After a swap between two SENT rows, the demo inbox showed only the true one.
- **Size and text.** Bodies over 8192 characters: 9000 emoji at 4 start offsets, 3000 ZWJ families, Hindi, Arabic, the 100 000-unit maximum (26 parts, 538 KB), a lone surrogate, NUL. No part ended on a high surrogate, each part was at most 8000 units, and every one was sent and read back byte-identical.
- **Forging the system mark.** These are refused or ignored: `system:true` on MARKETING or SERVICE (MessageRefused), `system:false` (ZodError), a caller key starting `system:` (refused), an extra `system` field on MailPort (strict schema), `identity.*` with class SERVICE (not system), MailPort key `system:abc` (stored `mail:system:abc`, capped). `System:x` in upper case is stored and treated as a normal capped message. No route passes caller input to `MessageSend`.
- **Limit races.** 25 concurrent codes to one address in four spellings (case, spacing) gave exactly 5 rows and 20 plain refusals. 8 concurrent resets gave 5 × 200 and 3 × 429. Three mixed storms gave 5 rows each, with no 500 and no deadlock.
- **Cap mix.** At 50, codes, resets, invitations and a system row whose dispatch was lost (sent by the sweep) all went out, and the counter stayed 50. Receipts and SERVICE mail were held, and MARKETING was suppressed. A held receipt was sent after the firm went ACTIVE.
- **No leaks.** Across all runs, no log line, `audit_event` summary or detail, `msg_outbox.state_reason` or idempotency key, or `msg_event.detail` held a body, token or code. `notice_not_sent` holds ids only. `GET /api/platform/messages` never reads the file. The download routes sign server-made keys only.
- **The switch.** `MAIL_PORT` is `useExisting: MESSAGES_MAIL` (`features/platform-staff-read.ts:18`, from PF-19r).

Breaker: Changes 570c344b483ace08ee761d08c704a53d2c367de3

## Round 2 (`633b89afb2f5bfb9979d5f2e1742431070e0d638`, re-tried only what changed since `570c344b4`)

Same harness, run from detached worktrees in `/tmp/claude-0/pf19e-break/` (scratch databases dropped). m2-m6 and m9 now go to the tech lead as questions, so they are not re-reported.
**Fixed and held**
- **B1:** invite plus 5 resends → `201, 200 ×4, 429 EMAIL_HOURLY_LIMIT` "We send at most 5 account emails an hour to one address, so this invitation was not sent. Try again in an hour." The outbox holds 5 rows, one invitation is open, and its token is one of the 5 emailed; that link answers `VALID`. A new invite to an address already holding 5 code emails → 429, and no invitation is kept.
- **B2:** invite to `B.Suppressed@Example.com` → 409 `INVITATION_NOT_SENT` "We couldn't send email to b.suppressed@example.com. Ask your firm's Owner or Admin to check it." One `platform.invitation.not_sent` line is written, with no invitation and no outbox row kept. A Resend after the address became suppressed → the same 409, and the old link stays open.
- **Storms:** 10 concurrent resends of one id → 1 × 200, 9 × 409 `INVITATION_CLOSED`, one open invitation, and its link was emailed. In a mixed storm (8 resends, 8 code emails to the same address in another case, 8 invites to other addresses), the address got exactly 5 rows. There was no 500 and no deadlock.
- **Resend racing accept** (6 runs at 0-15 ms offsets, twice): either accept 200 and resend 409 `INVITATION_CLOSED`, with no open invitation, or resend 200 and accept 410, with one open invitation and 2 emails. A person was never both joined and holding a live link.
- **Unchanged from round 1:** tampering, the cap mix and the leak scan. The new "did not open" log line holds ids and the refusal code only (`TAMPERED_OR_OTHER_OWNER`), never a body.

**R2-1 Major: a regression, invitations to addresses the form accepts now answer a bare 500 (item 4: "never answers 500").**
- Steps: `POST /api/platform/staff/invitations` with `josé@example.com`, `a@exämple.com`, `a@b.c`, `a..b@example.com`, `a.@example.com` or `.a@example.com`.
- At 570c344b4 (same probe, own worktree), each answered 201 `emailed:false`, with the invitation kept. At 633b89afb each answers 500 with an empty detail, and nothing is kept.
- Cause: `emailOf` (`identity/service.ts:62-68`) accepts them, but `MessagesMail.write` runs `MailMessage.parse` (`send/mail.ts:62`, `to: z.email()`, ASCII only) and throws a ZodError. `invitationIn` rethrows anything that is not MessageLimited or MessageRefused (`identity/service.ts:418-419`). Resend goes through the same path.
- `a@b-.example` correctly gets the 409 sentence, because MessagesMail turns its refusal into a MessageRefused.

**R2-2 Major: CI suite red.** `tests/check_pf19r_every_sender.ts` S1 fails: `"platform/identity/service.ts: 1 mailIn call(s), the table says 0: classify the change"` (20/1; it was 21/0 at 570c344b4).

**R2-3 Minor: the batch path still swallows both refusals.**
- `inviteBatch` still emails through `emailInvitation` after the commit, with a catch-all (`identity/service.ts:402`, `:485`).
- Rows `[c.gone (suppressed), c.full (5 codes this hour)]` → 200, both `emailed:false`. There is no 409 or 429 sentence, no `invitation.not_sent` line, and both invitations stay pending with tokens nobody received. The answer gives no flag saying why.
- Only the API uses this path (the web's invite panel calls the single route per row), and a later Resend of such a row answers the right 409 or 429.

**Suites at 633b89afb:**
- Pass: pf19e 27/0, pf19r_senders 28/0, pf4b_session_reads 55/0, pf4c_batch_invite 24/0, pf4c1b_batch 19/0, pf6m2_invite_recheck 19/0, pf15_limits 69/0, pf19b_sending 42/0, pf19b_mail 29/0, pf19p 68/0, pf6m_money_line 12/0.
- Fail: pf19r_every_sender 20/1 (R2-2).
- Not run (each needs an isolated server copy): pf4_identity part B (111/112, its :4541 copy was not started), pf4dn_invite_name, pf28_inputs (b).

Breaker: Changes 633b89afb2f5bfb9979d5f2e1742431070e0d638
