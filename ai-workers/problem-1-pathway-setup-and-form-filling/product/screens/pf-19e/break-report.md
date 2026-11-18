# PF-19e break report (sealed transactional bodies; staff and system mail on the one send path)

Breaker, 18 Nov, head `86e306399` (`git diff 2aa433a4e..86e306399`). Isolated copy `brk19e` on :4436 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), stopped after the run; log kept at `studio/var/isolated-logs/brk19e-api.log`. In-process attacks ran from a throwaway script under `/tmp/claude-0/` against the copy's database, with test key rings. `tests/check_pf19e_sealed_bodies.ts`: 28 passed, 0 failed. No code changed, nothing committed.

## Findings

**M1 (Major): a reset storm answers 500 and stalls the whole app's database pool.** This breaks DW4's "never 500".
* Steps: as the Owner, send 20 parallel `POST /api/platform/staff/<user-o id>/reset-two-step`. Then send 12 parallel resets to a staff address that is suppressed.
* What happened: 5 × 200, 5 × 429, **10 × 500** (`P2028`, the transaction could not start in time; log at `service.ts:189`). Against the suppressed address: 9 × 409 and **3 × 500**. During the storm, another firm's plain `GET /api/platform/staff` took 3.9 s instead of milliseconds. The control held: 20 parallel `sign-out-everywhere` calls on the same firm (same `inFirm` row lock, no mail) gave 20 × 200, and 8 parallel resets also held.
* Cause: `resetTwoStepOnce` holds a pool connection and the firm's row lock in `inFirm`. Inside that, `this.mail.send` (`identity/session/service.ts:208`) opens a **second** transaction on another connection (`messages/send/mail.ts:70`). Once about a pool's worth of resets wait on the row lock, the reset holding the lock cannot get its second connection. Everything waits until maxWait runs out. Before PF-19e, LocalMail was in memory, so no second connection was needed. This can happen across firms too, because the pool is shared.
* What should happen: the limit holds and every request answers 200, 409 or 429, never 500. The limit itself held: exactly 5 rows were written per address.

**M2 (Major): the demo inbox hands anyone a working staff invitation, with no sign-in.**
* Steps: the Owner invites `new1@…`. A caller with no token sends `GET /api/demo/platform-inbox?address=new1@sample-firm.example.com`. The body holds `/invitation#t=<token>`. `POST /api/public/invitations/<token>/accept` → 200 with a `set-password` hand-off code, and `POST /api/platform/session/callback {code}` → a bearer token for a CASE_OFFICER of sample-firm.
* Before PF-19e, invitation tokens lived only in LocalMail's memory (`identity/session/mail.ts`) and no route read them. The switch puts them in a mailbox that the demo workspace serves to anyone (`messages/demo-inbox.ts:58`; only client personas get 403). Another firm's Owner, or no session at all, reads them the same way.
* Severity rests on the demo workspace being reachable by people other than the founder. DW1 asks for the inbox to show the link, but not for it to show the link to an anonymous caller.
* What should happen: staff and system mail in the demo inbox needs a staff session of that firm (or the inbox needs a demo gate), or tokens are masked there.

**M3 (Major): a resend refused with 429 still kills the link that works.**
* Steps: invite `new2@…`, then resend 5 times. The 5th resend → 429 "Too many account emails … Try again in an hour."
* What happened: the 429 resend had already committed a replacement (`bf8c8693…`, PENDING, never emailed) and revoked `0ed949c9…`, the last link that was emailed. So all 5 links the person received are REVOKED, and the only pending invitation was never mailed. The limit is checked only after the commit (`identity/service.ts:439`, `emailInvitation` after `inFirm`).
* What should happen: a refused send changes nothing (check the hourly limit before replacing), or the answer says the old link no longer works.

**m1 (Minor): a 409 on a single invite still leaves a pending invitation that takes a seat.**
* Steps: invite a suppressed address → 409 "We couldn't send email to …". Send the same invite again → 409 "Already invited: resend it instead". Resend → 409 again.
* The screenshot `screens/pf-6-staff/screenshots/pf19e-1440-invite-suppressed.png` reads as if nothing was made. The Owner has to find the invitation under Invited and revoke it.
* What should happen: the sentence (or the screen) says the invitation is kept as pending.

**m2 (Minor): over the limit, a suppressed address answers 429, not 409.**
* Steps: a staff member who has had 5 resets this hour gets suppressed, then is reset again.
* What happened: 429 "Try again in an hour". An hour later the answer is 409. The count (`messages/send/messages.ts:106`) runs before the suppression check.
* What should happen: 409 first, since retrying will never help.

**m3 (Minor): the "per-address" limit is per firm and address.**
* Steps: 6 system sends to one address from sample-firm, then 6 from sample-solo.
* What happened: ok ×5, then LIMIT, for each firm, so 10 an hour reach that address. The lock and count are keyed by firm (`messages.ts:101`).
* The brief asks for "a platform per-address limit". This needs either a ruling that per firm is meant, or a count across all firms.

**m4 (Minor): sealed bodies are left out of the key-rotation runbook.**
* Steps: a body sealed with ring {v1}, delivered by a worker holding {v1,v2} with v2 current → sent. Delivered by a worker holding {v2} only → `FAILED "body could not be opened"`. That is correct and needs no 500 and no log. The demo inbox silently leaves the message out.
* Gap: outbox bodies are not a `SealedValueStore`. So `enqueueReencrypt` never reseals them, and `versionCounts` never counts them. RUNBOOK-secrets step 4, which promises nothing is left on v1, does not see them. At step 5, a row still QUEUED (held by the daily cap until the next day, or a platform retry) fails silently.
* What should happen: the runbook names the outbox, or waits for it to drain.

**m5 (Minor): the worker still accepts a plain body on a TRANSACTIONAL row.**
* Steps: replace a sealed file with plain rendered JSON (text changed to "ATTACKER TEXT") and set `rendered_hash` to match → `deliver` = `sent`.
* Cause: the fallback for bodies stored before PF-19e (`body-seal.ts:60`; `messages.ts:194` checks only that the class matches). This needs both file and database write access, so it is defence in depth only.
* What should happen: a TRANSACTIONAL row created after PF-19e refuses a plain body.

## What held
* **Outbox file never readable in clear:** an invitation's stored file holds no `invitation#t=`, subject or address. All 56 stored files in the copy were grepped: none hold `invitation#t=`. Its hash is the hash of the sealed bytes.
* **No file route reaches the outbox:** the retainer download route signs server-made keys, and LocalFiles refuses any path outside the firm's folder.
* **Message kinds keep their own sealing:** marketing bodies stay plain.
* **Other keys cannot open a body:** another firm's space, another key ring, or another outbox id is refused (`SecretRefused`).
* **Moved or truncated parts:** parts swapped, dropped, duplicated, empty, or not an array → refused. A truncated file with its hash fixed, or bytes cut off → `FAILED`, no 500, nothing logged.
* **Claiming the exemption:** `system:` → refused by `Messages.send`. `System:`, ` system:`, `SYSTEM:`, a zero-width variant and a Cyrillic `ѕ` are each stored but **not** exempt: a `System:` row at the cap went through the counter (1000→1001). `sendSystem` refuses SERVICE. Firm traffic reaches `send` only as `mail:`-prefixed keys (booking).
* **Cap with a mix of kinds:** system mail at the cap → sent, counter unchanged. A firm's TRANSACTIONAL mail at the cap is held (DW3).
* **Limit under concurrency:** exactly 5 rows per address in the 20-way and 8-way storms. Case variants of one address count together. 15 parallel resends of one invitation → 1 × 200, 14 × 409 `INVITATION_CLOSED`, no 500.
* **Suppression:** 409 with the exact sentence, one audit line per attempt with no address in it, nothing reset, and the address stays suppressed.
* **Logs:** no invitation token (8 collected), hand-off code or `#t=` appears in any of the 480 lines of `api.log`.
* **Awkward bodies:** a lone surrogate (JSON escapes it), a 100,000-character body (multi-part) and a body of `é` and emoji across a part boundary all seal and open intact.
* **Out of scope:** no web code changed in this row, so keyboard, 1024 px and 200 % checks were not run. The reset action has no screen.
