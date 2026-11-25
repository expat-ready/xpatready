# FO-3c break report: consultation agreement (API only)

PR #2922, head `be10e6d24ee1efbc06a0fa8e4a8d59dfa86a3000`. Breaker, 22 Nov 2026. Scope: BACKLOG row FO-3c. I attacked the service directly with throwaway scripts that copy the row test's set-up: a scratch database with every migration, PF-3's Sample firms, the real LocalFiles store and docx render, and the fake signing, clock, jobs, mail and audit. Every scratch database was dropped afterwards. The row test `tests/check_fo3c_consultation_agreement.ts` passes 18/18 on this head.

Not exercised: the suite and my scripts connect as `xr_studio`, a superuser with BYPASSRLS. That means PF-12's walls (FORCE RLS on the fo_signing_* tables) are never in play here. `open()` uses `withFirm`, so it should be fine under the walls, but no test proves it.

## Breaks

**1. A firm signer who declines after the client has signed gets an unhandled 500. The webhook can never be applied. (Major)**
- Steps: the client consents and signs (CLIENT_SIGNED). Then `signing.act(firm signer, "declined")` → `svc.signingEvent(call)`. Then the provider retries the same call.
- Expected: the decline is applied (the request and the agreement become DECLINED) or refused with a reason, and an audit line is written either way.
- Actual: both calls throw `DriverAdapterError: fo_retainer: status cannot move from CLIENT_SIGNED to DECLINED`, which is a 500 for FO-6's webhook route. The transaction rolls back, receipt included, so every provider retry fails the same way.
  - Our records stay at `CLIENT_SIGNED/CLIENT_SIGNED` while the provider's envelope is declined.
  - "Needs you" keeps showing `yourTurn: true`, and the 24 h reminder still says "it now needs your signature".
  - `hostLink` can then only 500, because the fake's `embeddedLink` throws `SigningEnded` on an envelope that is no longer live.
- Cause: `service.ts:339-343` moves `fo_retainer` to DECLINED. FO-5's `fo_retainer_write` trigger (migration `20261114210000_fo5_retainer_tables`, the `allowed` CASE) only allows SIGNED, WITHDRAWN or SIGNED_OFFLINE after CLIENT_SIGNED. FO-6's request trigger does allow DECLINED from any live state, so the two tables disagree, and the service only hits the conflict on this path. No test covers a firm-side decline.

**2. The client's public door, and the host's link, throw an unhandled 500 when the provider has already ended that signer's part. (Major)**
- Steps: the client consents. They sign at the provider (`signing.act(client, "signed")`) and the webhook has not been applied yet. They reload our page: `svc.open(token, {consent: true})`, then `svc.open(token)`.
- Expected: the one not-found, or a "signed / processing" answer. Never a 500.
- Actual: both calls throw `SigningEnded: signing document is signed`, an unhandled 500. `service.ts:283` calls `embeddedLink` without catching. The same happens in `hostLink` (`service.ts:302`) after the firm signs at the provider and before the webhook (`SigningEnded: signing document is completed`).
- Why it matters: this is the moment a client most often reloads, because the embedded page hands back to ours after signing and webhooks lag.
- It becomes permanent in two cases:
  - A client "signed" event refused as `NO_CONSENT` leaves the client's link answering 500 for good (scripts 6d and 6e).
  - Break 3 leaves the host's link answering 500 for good.

**3. A seal that fails is never retried, and the agreement stays "not signed yet" for good. (Minor)**
- Steps: the provider's "completed" event arrives first (NOTED; `seal` returns false because the firm has not signed yet). Then the firm's "signed" event arrives while `fetchFiles` fails once (a provider 503). Then the provider retries.
- Expected: the seal is retried later, by a job or a later call.
- Actual:
  - The first call commits the firm's signature, then throws a 500 from `seal()`. The retry answers `REPEAT`.
  - No evidence is stored. The status stays CLIENT_SIGNED with both signers signed.
  - `hostLink` answers 500 (`SigningEnded completed`), "needs you" keeps `yourTurn: true`, and the reminder still asks for the firm's signature.
  - `catchUp` does not reseal.
- Location: `service.ts:357`, and the `seal` call at 363-366, which has no job behind it.

**4. Two `hostLink` calls at the same time (a double-click) throw a 500. (Minor)**
- Steps: the client has signed. Call `Promise.allSettled` with three `svc.hostLink(R, id, {consent: true})` while the clock ticks.
- Expected: every call gets the link, or a later call gets a 409.
- Actual: one call succeeds. The other two throw `fo_signer: viewed and consent are written once`, an unhandled 500.
- Cause: `service.ts:297-301` reads `me.consentedAt` outside the transaction and takes no row lock and does no re-read. `open()` already does both (line 269).

**5. A cancelled booking's agreement stays live. (Minor)**
- Steps: send, then set the booking to CANCELLED. Also tried: cancel the booking while `send` is between its status read (line 122) and its commit.
- Expected: the row's "needs you" item lasts only while the agreement is unsigned *for a meeting*. A cancel committed before the send commits should send nothing.
- Actual:
  - The client's link still opens and returns a signing link.
  - `needsYou` keeps the item for good (`service.ts:241-243` ignores the booking's status).
  - In the race, the agreement and the client's email are sent for a booking that is already CANCELLED (script C). The status check is not repeated under the advisory lock (lines 156-159).

**6. The catch-up is starved by bookings that can never be sent, across firms. (Minor; the catch-up is not wired yet)**
- Steps: 210 future bookings whose person has no email, all starting before one sendable booking. Run `catchUp` twice.
- Expected: the sendable booking gets its agreement.
- Actual: `{sent: 0}` both times, and the sendable booking never gets one.
- Cause: the cross-firm read (`service.ts:81-87`, `limit 200`, ordered by start time) keeps returning the same NO_CLIENT_EMAIL, NO_LICENSED and NO_BOOKING rows. One firm with no licensed person, or with clients who have no email, can starve every other firm's catch-up.

**7. The agreement reads skip FO-3vr's record visibility. (Minor)**
- Location: `read`, `forBooking` and `forPerson` (`service.ts:224-239`) check only the firm and the `agent/booking:list` key.
- The module card's invariant: a booking follows its record's visibility or its host's, else the one not-found (`staffBooking` → `seesBooking`).
- Effect: a staff member with the list key and everyone-sees-all off, holding a booking or person id they cannot see, still gets the agreement's status, the person id, the signatory's name and the sealed sha256.

**8. Orphan agreement files. (Minor)**
- `send` stores the filled `.docx` (`service.ts:149`) before the transaction.
- Three parallel sends left 2 files that no record names. Every rolled-back send (DW8's forced audit failure, break-1-style trigger refusals) also leaves its file under `retainers/<id>/`.

**9. Misleading answer on a reschedule. (Minor)**
- A `booking.rescheduled` event for a booking with no agreement answers `{sent: false, reason: "ALREADY_SENT"}` with no `agreementId` (`service.ts:75`). Nothing was ever sent. The catch-up covers the missed send, so only the reason is wrong.

## What held
- **Client link:** each of these gets the one 404: malformed, a 1 MB token, an upper-case prefix, a non-string or object token, a trailing newline, a hex prefix that is not a firm, and firm B's id with firm A's real secret (the whole token's sha256 is stored, `service.ts:147,265`). So does a replay after signing or after a decline. `consent: "true"` (a string) records no consent and returns no link.
- **Webhooks:**
  - An unverified body, or a bad signature header, answers `UNVERIFIED` and writes nothing.
  - The same event again answers `REPEAT`. The firm signing before the client is refused (`CLIENT_SIGNS_FIRST`, with an audit line). A "signed" with no recorded consent is refused (`NO_CONSENT`).
  - Firm A's event passed under firm B answers `NOT_OURS`. RETAINER-kind requests are filtered out. A declined request refuses any later event (`NO_CHANGE`).
  - The provider's "sent" or other event is noted.
- **Concurrency:**
  - Three parallel `send` calls give one agreement, one email and one sent event; the two extra envelopes are cancelled (advisory lock plus re-read).
  - Two parallel seals racing the firm's "signed" and "completed" events give one evidence row, one `consultation_agreement.signed` event and one copy email.
- **Host link:**
  - A non-signatory gets 403, another firm 404, before the client signs 409 `CLIENT_SIGNS_FIRST`, after SIGNED 409 `NOT_OPEN`.
  - After the firm's "viewed" event it still works.
- **Reminder:** after a reschedule (repeated twice), only the new time gets a reminder. A cancelled booking gets none, and neither does a signed one.
- **Send refusals:**
  - A person with no email answers `NO_CLIENT_EMAIL`. A non-uuid booking answers `NO_BOOKING`.
  - A deactivated host → the firm's representative of record, with the note.
  - A template switched off before the send answers `NO_TEMPLATE`, with the booking settings' warning.
  - A template switched off *during* a send hits the FO-5 trigger: the send throws, the envelope is cancelled and nothing is kept. The subscriber retries and then gets `NO_TEMPLATE`.
- **Personal data and order of writes:**
  - No client email or name appears in any audit detail.
  - `module_event` payloads carry only ids, the version and the sha256.
  - The audit line comes before the outbox row in `send` and `seal` (DW9). Every applied, refused or noted event writes exactly one audit line, in its transaction.

Verdict: Changes be10e6d24ee1efbc06a0fa8e4a8d59dfa86a3000

## Round 2: what changed since be10e6d24 (head e6365237a4a3f647ad14eae2c90b77940539a4f9)

I ran `git diff be10e6d24..e6365237a` and attacked only that diff, on a detached worktree with fresh scratch databases (all dropped afterwards). The row test passes 34/34.

Round 1 re-checked and fixed:
- M1: a firm decline after the client signed now gives DECLINED on the request and WITHDRAWN on the agreement, with no 500.
- M2: the door and the host link answer 409 `SIGNING_ENDED`, not a 500.
- m3: a repeated event now reseals.
- m4: three parallel host links all answer, with one consent line.
- m5: after a cancel, the client's link is the one 404 and the "needs you" item is gone.
- m9: a reschedule with no agreement answers `NO_AGREEMENT`.

**R2-1. One code check opens the signing link for good, for anyone holding the token. (Major)**
- Steps: consent, then the emailed code; the link is answered. Three days later, from another IP, call `open(token, {})` with no consent and no code.
- Expected (P-564: the client "types a single-use code … before signing"; FO-6's door rule: "a forwarded link in a fresh browser needs the code", with the check bound to a 30-minute browser session): a later or forwarded opening needs a fresh code.
- Actual: the provider's signing link is answered straight away (`codeNeeded: false`, no new code email).
- Cause: `code_verified_at` is permanent, and `service.ts:338` skips the code whenever it is set.
- Effect: from the first check until signing (up to 14 days), whoever holds the forwarded email signs as the client. The record still shows "the client's one-time code was right", so the identity evidence becomes false.

**R2-2. Resending is limited only per IP. (Minor)**
- Steps: 150 calls with `resend: true` from 5 IPs inside 10 minutes.
- Actual: 151 code emails and 151 audit lines, no 429.
- Cause: there is no cap per signer (`service.ts:359`), and the limit is per address (`ip.slice(0,64)`), so a single IPv6 /64 gets past it. It needs the link's token, so only the client or whoever they forwarded the email to can do this.

**R2-3. The limiter's map has no upper bound, and every call scans it once it passes 10 000 entries. (Minor)**
- Steps: 60 000 distinct addresses (`2001:db8::<n>`) in one window, no token needed.
- Actual: the map holds 61 000 entries. The 10 000-entry prune (`service.ts:69`) deletes nothing because every entry is inside the window, so each call scans the whole map. That took 2.2 ms per call at 61k entries, the heap stood at 143 MB, and both grow linearly.
- This is the same design as the booking and web-form doors (`booking/service.ts:914`, threshold 50 000), but here it kicks in five times sooner.

**R2-4. The catch-up is still starved. (Minor; the catch-up is not wired yet)**
- Steps for sends: firm B has 205 future bookings, the person has an email, but there is no licensed person (the host is deactivated, so the answer is `NO_LICENSED`). Firm A has one later booking.
- Actual: two runs give `{sent: 0}`, and firm A never gets its agreement (`service.ts:102`). The email filter fixed only the no-email case of round 1's m6.
- Steps for reseals: 200 requests SIGNED within the last 7 days, then one stuck seal sent later.
- Actual: the reseal query (`service.ts:111`, `order by q.sent_at limit 200`, which re-reads every SIGNED row from the last 7 days) never reaches the stuck seal. It was resealed only once the clock moved 8 days on. The provider's repeat still reseals it, so this is only the fallback.

Round 2 held:
- **Brute force:** 8 wrong codes from 8 IPs give five 422s, then 423 (the lock is per signer, so changing IP does not help). A resend while locked is 423. The right code 1 ms before the unlock is 423; at the unlock, the old code has expired (422).
- **After an unlock:** the try count restarts, and 6 more wrong codes lock it again.
- **Races:** two right codes plus a wrong one sent together give one "right" audit line and no 500.
- **Another signer's code** is refused with 422 `CODE_WRONG`.
- **Codes and resends** after the client signed, or after a booking cancel, get the one 404.
- **Stored state:** only the code's sha256 is stored, and audit detail holds ids only.
- **Events:** `NO_CODE` refuses an unchecked client "signed" event.
- **Firm decline after the client signed:** gives WITHDRAWN with its reason. The item goes, the read says "not signed yet", and no second agreement is sent.

Verdict: Changes e6365237a4a3f647ad14eae2c90b77940539a4f9

## Round 3: `git diff e6365237a..0ccbd59c9 -- '*.ts'` (head 0ccbd59c98ac08a96b09ff245c14a090697822c7)

Tested on a detached worktree with my own scratch databases, all dropped afterwards. The row test passes 37/37.

Round 2 fixes confirmed:
- **R2-1:** the link now needs a new code after 30 minutes. At 29 minutes a call from another IP with the token alone still gets the link; at 30 minutes it gets `codeNeeded`. A used code is spent, and a replaced code is wrong (422).
- **R2-2:** a second code within a minute is 429 `CODE_TOO_SOON`. 600 resends at one per second from 50 IPs sent only 10 codes in 10 minutes.
- **R2-3:** 60 000 addresses leave the map at 50 000 entries. The next 1 000 calls took 17 ms in total, and one address is still limited (its 31st call is 429).
- **R2-4:** stuck seals are now retried first.

**R3-1. The R2-1 fix wipes the code check from a client who has already signed at the provider, so their signature is refused for good. (Major)**
- Steps:
  1. The client consents and enters the code.
  2. Five minutes later they sign at the provider. Our webhook is late (the provider retries, or our route is down).
  3. 30 minutes after the code check, the client opens the emailed link again ("did it work?") with `open(token, {consent: true})`.
  4. The provider's "signed" event then arrives, and the provider retries it.
- Expected: the signature is applied (CLIENT_SIGNED). The code was checked before the client signed.
- Actual:
  - Step 3 answers `codeNeeded` and emails a new code. It also sets `code_verified_at` back to NULL (`service.ts:377`, `codeVerifiedAt: null`).
  - The event is then refused as `NO_CODE` (`service.ts:477`), and the retry is a `REPEAT`.
  - Our record stays at `VIEWED/VIEWED` with the client unsigned, while the provider holds the client's signature.
  - Entering the new code answers 409 `SIGNING_ENDED`, and the host link answers 409 `CLIENT_SIGNS_FIRST`.
  - Nothing moves it again, so the agreement can never be completed.
- Nothing hostile is needed: a late webhook and a second click on our own email link are enough.

**R3-2. The catch-up can still be starved. (Minor; not wired yet)**
- The new filter (`service.ts:110`) asks only for *some* active person with a licence record. `signatory()` (`service.ts:148`) also needs the duty keys of the representative of record when the host has no licence record.
- Steps: firm A has 205 future bookings hosted by user-O, who holds no licence record. The two licensed people's role grants are ended. Firm B has one later booking.
- Actual: the send answers `NO_LICENSED`, the catch-up gives `{sent: 0}`, and firm B's booking never gets its agreement.

Verdict: Changes 0ccbd59c98ac08a96b09ff245c14a090697822c7

## Round 4: `git diff 0ccbd59c9..8a09b9609 -- '*.ts'` (head 8a09b9609ae6fcc25883a338a1668fcaa0035c30)

Tested on a detached worktree with my own scratch databases, all dropped afterwards. The row test passes 40/40.

What held:
- **R3-1, the late signature:** the client checks a code, signs at the provider 5 minutes later, and reopens the link 30 minutes after the check (a new code is asked for and emailed). The late "signed" event is then applied (CLIENT_SIGNED), and the host gets the "needs you" item.
- **Old code replays:**
  - The checked code after the 30-minute session is refused: 422 `CODE_EXPIRED` (it is spent).
  - The same code while a newer code is pending is refused: 422 `CODE_WRONG`.
  - The token alone while a code is pending gets `codeNeeded` and no link.
  - The new code replayed inside its session returns the session's link and changes nothing. Replayed after the session it is refused: 422 `CODE_EXPIRED`.
- **Same instant:** a code sent and checked at the same clock instant (the fake clock was frozen) works once. A code counts as unspent only if it was sent *after* the last check (strictly), so it is spent from that moment.
- **R3-2 filter:**
  - A licensed host who has been deactivated, in a firm whose representative of record holds the keys: the booking is picked up and sent, and the representative signs (the same answer as `signatory()`).
  - Once that representative's grants end, the firm's booking is no longer picked up (`send` answers `NO_LICENSED`), even with 205 such bookings ahead. Firm B's later booking is sent.
- **Declined:** a request that has ended DECLINED still refuses any later event (`NO_CHANGE`). This path is unchanged since round 1.

Not new in this diff (behaviour since round 1):
- A provider "signed" event for the client after the booking was cancelled is still applied (CLIENT_SIGNED). The host can still get the signing link.
- The "needs you" item does not show, and the client's link answers 404.
- The client's link could only have been opened before the cancel. I record this only so it is not mistaken for a regression.

No Blocker or Major in this round's diff.

Verdict: Approve 8a09b9609ae6fcc25883a338a1668fcaa0035c30

## Part 2, round 1 (f40ebc7e3)

Scope: `git diff origin/main...f40ebc7e3`. Tested in three ways. A scratch suite at the services, on its own database (dropped afterwards). An isolated copy `brk3c2` on :4415 (`PLATFORM_IDENTITY=local`, stopped afterwards), driven by HTTP and Playwright at 1440 px. The row test passes 17/17.

**P2-1. When the firm's signatory is not the host, they cannot sign while "Everyone sees all" is off. (Major)**
- Steps:
  1. Firm A turns `platform.everyone_sees_all` off.
  2. The host, user-O (a Case Officer with no licence record), books Kim. Kim's lead is owned by user-O.
  3. The agreement goes out with the representative of record, user-R (Owner, licensed), as the firm's signer. The client signs (CLIENT_SIGNED).
- Expected: user-R signs. FO-5's BR-3 says "The representative always may read it".
- Actual:
  - `needsYou(R)` lists the agreement with `yourTurn: true`.
  - `hostLink(R)` answers 404 NOT_FOUND, and so does `read(R)`.
  - FO-5's `GET retainers/:id` answers 200 for the same person, and its `download-link` gives the .docx.
  - The agreement can never reach SIGNED, so the booking's Attended and consult record are held for good.
- Where:
  - `mine()` now requires the booking's visibility (`consultation-agreement/service.ts:294-296`).
  - `hostLink` goes through it (`service.ts:457`).
  - The representative is not exempted, unlike the host in `staffBooking`.

**P2-2. A declined agreement holds the consultation for good, and the screen's words are wrong for it. (Major)**
- Steps: the client declines (status DECLINED). The meeting starts and the host presses Attended.
- Expected: some way to start the consultation, or words that say what to do.
- Actual:
  - Attended answers 409 AGREEMENT_NOT_SIGNED.
  - `send()` answers ALREADY_SENT, so no new agreement can be sent.
  - FO-5's signed-offline answers 409 "A declined agreement cannot be recorded as signed" (`retainers/service.ts:42,644`).
  - With "Everyone sees all" off, signed-offline answers 404 even for the Owner. The booking has no prospect, so FO-5's `visible(change)` refuses.
  - The same applies to WITHDRAWN: the firm's signer declines after the client signed.
  - The panel still says "The client signs from the link in their email, then … signs; or record it as signed offline" (`agreement.tsx:31`), and the 409 says the same (`gate.ts:156`). Neither is possible.
  - The only ways out are switching the type's agreement off for every booking (see P2-4), or cancelling and rebooking.
- Where: `gate.ts:160-168` holds on any status that is not signed, ended ones included.

**P2-3. The poller writes a `platform.bypass` line to a firm's trail every catch-up with nothing to do, and retries a failing send with no backoff. (Major)**
- Steps: firm A has one agreement SIGNED within the last 7 days, and nothing else is pending. 46 `tick()`s on a fresh `AgreementPoll` run 4 catch-ups.
- Actual, idle firm:
  - Firm A gets 4 bypass lines, one per catch-up. At the default 2 s × 15 that is one every 30 s: about 2,880 lines a day for 7 days after every signature.
  - The cause: the "signed copy re-queue" branch runs through `each()`, and so through `touchFirms`, for every SIGNED request of the last 7 days (`service.ts:137,142`; `live.ts:48`).
  - The copy job's key makes the queueing a no-op, but the audit line is written each time.
- Steps, failing send: in firm B, the provider refuses a booking's send.
- Actual, failing send: 46 runs made 3 provider calls and wrote 3 bypass lines to firm B. That is one try and one line every 30 s until the meeting, plus a log line each time.
- Expected: a line only when a firm's rows are actually handled. This is CS-K1's break M1 of 20 Nov: `case-clients/live.ts` `touchedEach` added a doubling backoff (at most about 33 lines a day). `consultation-agreement/live.ts` has none.

**P2-4. Switching a type off after its agreement was sent lifts the hold. Switching it back on blocks the consult record of a booking already Attended. (Minor)**
- Steps:
  1. The agreement is sent (SENT, unsigned).
  2. An Admin PATCHes `requireAgreement: false`. Attended answers 200.
  3. The Admin PATCHes `requireAgreement: true`. The consult record answers 409 AGREEMENT_NOT_SIGNED.
- Expected: the rule is fixed when the agreement is sent, or the switch says it applies to bookings already sent.
- Where: the gate reads the type's switch at the moment of the check (`gate.ts:165`).
- Mitigation: needs the type-edit key (a Case Officer gets 403) and is audited.
- Also seen: the 24-hour reminder is still sent for a type that is switched off (`runReminder` never asks `needsAgreement`).

**P2-5. Once a type's choice is stored, the API cannot return it to the purpose default. (Minor)**
- `requireAgreement: null` answers 422 on both PATCH and POST (`settings/types.ts:93`: `z.boolean()`).
- A type saved once keeps `true` even if its purpose is later changed to FOLLOW_UP.
- On screen, the checkbox writes a stored value on its first click (`types-page.tsx:201`), with no "use the default" choice.
- The hint "What a booker may do from the link in their email." now sits under the agreement checkbox, which is not something a booker does.

**P2-6. The signed-copy link is not a usable link, and a paper copy is never offered. (Minor)**
- The `<a href>` points at the token URL (`agreement.tsx:83`). Middle-click or "open in new tab" answers 401 `not-signed-in` JSON, because the token is sent only by the click handler.
- Each signed row POSTs a new download link on render, and again on window focus (staleTime 60 s), before anyone clicks.
- A SIGNED_OFFLINE agreement shows "Agreement signed" with no copy: `signedCopy` is null and `signed-copy/download-link` answers 409 NO_SIGNED_COPY. R1.104 asks for "the signed copy is on the person"; for a paper signature it is only on FO-5's page.
- The lead page lists each agreement as "status · Sent <date>" with no booking, type or meeting date. Three rows for one person cannot be told apart (screenshot at 1440 px; nothing clipped or overflowing).

What held:
- **Reads by booking, id, person and link:**
  - The host gets 200.
  - A same-firm Case Officer who does not see the booking gets 404. The Owner with "Everyone sees all" off gets 404.
  - Billing (no list key) gets 404 by booking and 403 by id, by person and on the link route. Firm B's Owner gets 404 everywhere.
  - Malformed ids answer 404.
- **The download link:**
  - The host's link downloads (200, `application/pdf`, `attachment`, `no-store`, `nosniff`).
  - The same link used by a colleague, by firm B or with one character changed answers 404. Used by Billing it answers 403.
  - The same link at FO-5's `/files/:token` answers 404.
  - An unsigned agreement's link answers 409 NO_SIGNED_COPY.
  - A viewer who sees the booking only through "Everyone sees all" loses both the key (404) and the download once the setting goes off.
  - Keyboard Enter on the link downloads the file.
- **The hold:**
  - Two Attended requests at once both answer 409, and the booking stays SCHEDULED.
  - No-show answers 200; Attended after it answers 409.
  - Over HTTP, Attended answers 409 AGREEMENT_NOT_SIGNED and the panel shows the server's words.
  - SIGNED_OFFLINE opens the gate. A follow-up type is never held.
- **The poller:**
  - It sent the live booking's agreement within seconds on the running copy.
  - A firm-B outbox event naming a firm-A booking sends nothing in either firm.
  - A restart replays a day of events with no second agreement.
  - The advisory lock still guards a raced send.
- **The types API:** `requireAgreement` set to `"false"`, `0`, `"yes"`, `[]` or `{}` answers 422. A Case Officer's PATCH answers 403.
- **Not a finding:** a first run of the copy answered 500 on by-booking (`PrismaClientValidationError`). Another session regenerated the shared Prisma client while the copy was starting (`node_modules/.prisma/client/index.js` stamped 05:24:04). After a restart every call answered as above.

Verdict: Changes f40ebc7e38e0e3d774538626afa28203e29649a1

## Part 2, round 2 (f89c066a6; head e8511e156)

Scope: `git diff f40ebc7e3..f89c066a6`. e8511e156 only re-adds the four J-104 screenshots, and d560df8e0 is test-only, so no code changed after f89c066a6. Tested with a scratch suite at the services, on its own database (dropped afterwards). The poller ran on simulated time: 2 s per run, as the default. No isolated copy this round.

**P2R2-1. The hold can be lifted while the agreement can still be signed, and nothing replaces it. (Major)**
- Steps:
  1. "Everyone sees all" is on (the default). Lee's booking has ended and its agreement is SENT. Attended answers 409.
  2. The Owner calls FO-5's `withdraw` on the agreement (`retainers/:id/withdraw`, reason "skip it"). It answers 200 and the agreement becomes WITHDRAWN.
  3. Attended answers 200 (COMPLETED), and the consult record answers 200.
- The client can do the same from their emailed link: they decline, and then Attended and the consult record both answer 200. The screen reads "Agreement ended unsigned".
- In both cases `send()` refuses a new agreement: ALREADY_SENT before the booking is attended, NOT_SCHEDULED after.
- From the code, not run: FO-5's `edit` of a SENT agreement on a booking with a prospect sets it to DRAFT (`retainers/service.ts:546`). DRAFT is not in LIVE either. The panel then says "declined, withdrawn or has expired".
- Expected (R1.104, "cannot start until signed"): either an ended agreement still holds and can be sent again, or this lift is the Lead's explicit ruling. Today one FO-5 click, or a client's decline, means the consultation goes ahead with no agreement.
- Where: `gate.ts:42` (only LIVE holds). The code calls this "Question for the Lead", and it is still open.

**P2R2-2. The backoff can outlast the meeting, so the agreement is never sent and nothing holds. (Minor)**
- Steps:
  1. Firm B's provider refuses every send for 70 minutes.
  2. A booking starts 100 minutes from now.
  3. The provider comes back at 70 minutes.
- Actual:
  - During the outage there were 8 tries and 8 bypass lines. The wait doubled as designed.
  - The next try was due about an hour after the provider came back, which is after the meeting. The catch-up only looks at future meetings, so the booking never got an agreement.
  - A booking with no agreement is not held, so its consultation can start unsigned.
- Expected: the wait never runs past the time left before the meeting.
- Where: `live.ts:52-57`, together with `service.ts:122`'s `starts_at > now`.

**P2R2-3. A send that fails without throwing still writes a bypass line on every catch-up. (Minor)**
- Steps: firm B has an active CONSULTATION template, but its file is missing from the store. A booking is 5 days ahead.
- Actual: `send()` answers `NO_TEMPLATE` with no error (`service.ts:210`). Only errors start the backoff, so 30 minutes gave 60 bypass lines: one every catch-up, about 2,880 a day until the meeting.
- Needs a broken store. The other reasons that return without an error are excluded by the catch-up's filter; for example, an empty email is refused by `fo_person_email_check`.

What held:
- **P2-1, the signer's exception:**
  - The signer of record reads the agreement, gets the signing link and signs (SIGNED), and gets the signed copy's key.
  - A colleague in the same firm who is not the signer and does not see the booking gets 404 on read, signing link and copy key, before and after signing.
  - Firm B's Owner gets 404.
  - The exception covers only the agreement itself, by id. By-booking stays 404 for the signer and the person's list leaves it out, so nothing wider opens.
- **P2-3, the idle flood:** 10 minutes idle, with signed copies from the last 7 days, wrote 0 bypass lines in either firm. Re-queued copies are skipped before the firm is touched.
- **The backoff itself:** a failing row writes one line per try, at 30 s, 60 s, 120 s and so on, up to an hour (8 in 70 minutes).
- **P2-4:** the reminder skips a type that has been switched off (code read).
- **P2-5:** PATCH `requireAgreement: null` answers 200, stores NULL, and reads back as `requireAgreement: true, requireAgreementSet: false` (the default). The hint is back under the booker choices.
- **P2-6:** each lead row names its meeting (`meetingAt`, read only for agreements the viewer can already see). The new-tab 401 and the paper-signed copy are the declared gaps.

Verdict: Changes e8511e15673206e0c9b46a2a6028f78b50f375e4

## Part 2, round 3 (9f2754207)

Scope: `git diff d47aca316..9f2754207`, under the Lead's ruling of 23 Nov: every unsigned agreement holds, and an ended one is replaced while the meeting is ahead. Tested with a scratch suite at the services, built on the row suite's set-up, on its own database (dropped afterwards). "Everyone sees all" was on, so FO-5's actions could run. The row suite passes 36/36, and `check_pf19r_every_sender` passes 21/21. No isolated copy this round.

**P2R3-1. The hold reads only the newest agreement, so a signed older one never lifts it, and the catch-up then never replaces an ended newest one. (Major)**
- Steps, case 1 (e-signed):
  1. A CASE_REVIEW booking with a prospect is sent its agreement (A1).
  2. FO-5's `edit` adds a fee, which puts A1 back to DRAFT. The next catch-up sends a fresh agreement (A2): a second "Please sign" email.
  3. FO-5's `send` of the edited draft answers 200. Now both A1 and A2 are SENT.
  4. The client signs A1 from the link in the first email, then the firm signs. A1 is SIGNED, with its sealed copy stored.
- Actual, case 1: `agreementHold` still holds on A2 (SENT). By-booking shows A2: "Agreement not signed yet". Attended and the consult record stay refused although a fully signed agreement exists.
- Steps, case 2 (paper):
  1. After the same edit (A1 DRAFT) and the fresh A2, FO-5's `signedOffline` on A1 answers 200 (SIGNED_OFFLINE). The hold stays on A2.
  2. The firm withdraws A2, since the paper one is the one that counts. The statuses are SIGNED_OFFLINE, then WITHDRAWN. The hold stays, now on A2 WITHDRAWN.
  3. `catchUp` sends nothing: its filter sees a non-ended agreement, A1.
- Actual, case 2: the booking is held while the meeting is still ahead. The panel promises "a new agreement is emailed to the client", and none is sent. Only a reschedule frees it, because `onBookingEvent` and `send()` read the newest agreement (WITHDRAWN) and do send.
- The same split applies when the client declines A2 but signs A1.
- Expected: the hold, `send()` and the catch-up ask one question. Under the ruling that question is "is any agreement of this booking signed?" A signed agreement lifts the hold, and an ended newest one is replaced only when nothing is signed or waiting.
- Where:
  - `gate.ts:44-48`: the newest agreement only (`order by r.created_at desc … limit 1`, then `!isSigned`).
  - `service.ts:140-142`: the catch-up's "no non-ended agreement" filter.
  - `service.ts:172,201,236`: `ofBooking` reads the newest agreement.

**P2R3-2. Nothing limits or stops the fresh agreements. (Minor)**
- Steps: the client declines 4 times, with a catch-up after each decline.
- Actual:
  - The client gets 5 "Please sign your consultation agreement" emails, each within about 30 s of a decline. There is no count, no wait and no staff control.
  - A firm that withdraws an agreement on purpose (for example, the client asked not to be emailed) has the next catch-up email a fresh one. The only stop is switching the type's agreement off, which applies to every booking of that type.
- This follows the ruling. Recorded so the Lead can confirm that an unlimited re-send after each "no" is intended.

**P2R3-3. After an FO-5 withdraw or edit, the first email's link still opens next to the fresh one. (Minor; the root is outside the diff)**
- Steps:
  1. FO-5 `withdraw` answers 200. The signing request stays SENT.
  2. The catch-up sends A2.
- Actual:
  - The old token's `open` answers 200 and offers consent.
  - Signing through it ends in a webhook 500: `fo_retainer: a WITHDRAWN retainer does not change`.
  - After `edit`, the old link likewise stays open. In P2R3-1 case 1 it signed version 1's file while version 2 was the one "sent".
- Why it matters now: FO-5 never ends FO-3c's request, so the diff's fresh send leaves the client with two working-looking links in two emails.

**P2R3-4. The panel tells staff to reschedule, or promises a new agreement, on a cancelled or completed booking. (Minor)**
- Steps: a booking's agreement is declined, then the booking is cancelled (`staffCancel` 200). By-booking still answers DECLINED with `required`.
- Actual: `agreement.tsx` shows "The consultation still cannot start: while the meeting is ahead, a new agreement is emailed to the client. If the meeting time has passed, reschedule it…". `staffReschedule` answers 409 "This booking is no longer active", and the catch-up skips cancelled bookings.
- `agreementNextStep` handles only NO_SHOW (`agreement-words.ts:6`). CANCELLED and COMPLETED get the reschedule advice too.

What held:
- **Concurrency:** after a decline, two `send()`s, a `catchUp`, a reschedule event and a third `send()` run at once. Exactly one fresh agreement is made (DECLINED, then SENT) and the client gets 2 emails in all. The others answer ALREADY_SENT: the advisory lock and the in-lock `isEnded` re-check hold.
- **Re-sends:** a re-sent ended agreement goes out once. A waiting fresh one is never duplicated by a repeated `send()` or catch-up (row suite B2, B6).
- **P2R2-1:**
  - A declined agreement and a withdrawn one both hold.
  - A past meeting gets no fresh agreement until it is rescheduled.
  - The reschedule sends one for the new time.
  - The fresh agreement's signature lifts the hold.
- **P2R2-2:** the wait is `min(doubled wait, max(30 s, half the time left))`. It stays bounded near the meeting: about 7 extra tries in the last hour, and the floor of one catch-up means a meeting under 30 s away may be missed. Row suite B5 passes.
- **P2R2-3:** NO_TEMPLATE backs off with no bypass line while held back, and recovers once the file is back (B8).
- **r2-1 and r2-2:** the reminder skips a type that is switched off (B9). On No-show, the panel says to make a new booking (B7).
- **Permissions:** the controller and the read rules are not in the diff. `forBooking` now reads the newest agreement, the same one the hold reads.

Verdict: Changes 9f2754207cdd532db0094c26e69e1a6e478821b1

## Part 2, round 3 re-check (8927036b4)

Scope: `git diff 9f2754207..8927036b4`. Tested with a scratch suite at the services, built on the row suite's set-up, on its own database (dropped afterwards). "Everyone sees all" was on, so FO-5's actions could run. The row suite passes 45/45.

**P2R3-1: fixed.**
- Case 1, re-run:
  1. FO-5's `edit` puts A1 back to DRAFT, and the catch-up sends A2.
  2. FO-5's `send` of A1 answers 200, and the client and the firm sign A1. The statuses are SIGNED, then SENT.
  3. The hold is lifted. By-booking shows A1 "Agreement signed", and a further catch-up sends 0.
- Case 2, re-run:
  1. `signedOffline` on A1 answers 200, and the hold lifts at once.
  2. The firm withdraws A2. The hold stays lifted, and the catch-up sends 0.
  3. A reschedule event answers ALREADY_SENT, pointing at A1. The panel shows A1 SIGNED_OFFLINE, "Agreement signed".
- The hold, `send()`, the reschedule event and the catch-up now agree:
  - The client declines A2 while the re-sent A1 is still waiting (SENT, then DECLINED). No third agreement is sent: the catch-up sends 0, `send()` answers ALREADY_SENT pointing at A1, and the hold is on A1.
  - A1 and A2 are both signed. The hold is lifted, the panel shows the newer signed one, and the lead page lists both.

**P2R3R-1. When an older agreement is client-signed and a newer one is only sent, the panel shows the newer one and hides that the firm's signature is due. (Minor)**
- Steps: as case 1, but only the client signs A1 (CLIENT_SIGNED). A2 is SENT.
- Actual:
  - `DECIDING_ORDER` puts the waiting agreements newest first, so the hold and by-booking name A2.
  - The panel reads "Agreement not signed yet" with no "The client signed …: the firm signs next." line.
  - The signature that would lift the hold, the firm's on A1, appears only in that signer's "Needs you".
- Where: `gate.ts:30`. All waiting statuses rank the same, so CLIENT_SIGNED does not come before SENT or VIEWED.

**P2R3R-2. Once one agreement is signed, the other that is still open keeps asking for signatures. (Minor)**
- Steps: as case 1 (A1 SIGNED, A2 SENT).
- Actual:
  - A2 stays in the signer's "Needs you" (`service.ts:366`).
  - At 23 hours before the meeting, the firm's signer gets the reminder "Agreement not signed yet: … tomorrow" for A2 (`service.ts:275` reads only A2's own status).
  - The client's A2 link stays open. In the double-sign case above, the client signed A2 as well.
- The hold is right. The noise is in the reminder, "Needs you" and the client's link.

**P2R3R-3. On an Attended booking the waiting text still tells the client to sign from the link. (Minor)**
- Steps: an Attended booking whose consult record is held, with a waiting agreement (only reachable by switching the type back on, as in P2-4).
- Actual: the panel reads "The client signs from the link in their email, then … signs. This booking is already marked Attended, so it cannot be rescheduled…" (`agreement.tsx:46`). The client's link answers 404 once the booking is not active (`openAs` `bookingActive`).
- The server's refusal, `HOLD_WORDS_INACTIVE`, says it correctly.

What held:
- **P2R3-4:** a cancelled booking's panel says "nothing more is sent for it". The promise of a new agreement now shows only for Scheduled or Rescheduled bookings (`sendsFresh`).
- **m3-1:** the 409's wording follows the booking's status.
- **m3-2:** the cap is read again at each check (row suite B12).
- **m3-3:** only NO_TEMPLATE, NO_LICENSED and NO_CLIENT_EMAIL back off. The catch-up's filter matches `send()`'s reasons, so no other reason repeats every catch-up.
- **`DECIDING_ORDER`:** built only from constants, through `Prisma.raw`.
- **Permissions:** unchanged.

Verdict: Approve 8927036b47dc0ed68e25d61b89c8297ac4abf514
