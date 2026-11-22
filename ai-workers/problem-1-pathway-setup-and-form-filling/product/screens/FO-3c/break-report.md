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
