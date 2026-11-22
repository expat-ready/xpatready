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
