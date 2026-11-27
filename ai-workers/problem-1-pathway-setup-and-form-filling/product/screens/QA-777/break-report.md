# QA-777 break report: FO-3c's consultation-agreement door bound to one browser

PR #3498, head 75747bc2f, stacked on #3460 (fcb8e3ad8). Change read: `git diff fcb8e3ad8...75747bc2f`. Breaker run, 24 Nov.
Scope (P-26): only what QA-777 changes on `POST /api/public/consultation-agreements/open`: the code bound to one browser,
consent only after the code, and too-soon answering codeNeeded. There is no client page for this door on main, so the
1024 px, zoom and keyboard checks do not apply. Upload, hierarchy and budget attacks do not apply to this item either.

How it was run (US$0, every value Sample):
* Service level: a throw-away suite on `tests/check_fo3c_consultation_agreement.ts`'s set-up (cases X1–X10), scratch
  database, deleted after. That suite itself at head: **46 passed, 0 failed**.
* HTTP: isolated copy `brk7` on :4477 (`PLATFORM_IDENTITY=local`), stopped after. `tests/qa/check_qa777_consult_door_not_bound.ts`
  (copied from origin/main, then deleted): **5/5 passed**. curl probes used the replay's link and codes from the demo inbox.
* Paths are relative to `prototype/studio/api/src/front-office/booking/consultation-agreement/`.

## Findings

**B1 — Major. Anyone holding the link can lock the client out, silently and repeatedly, with made-up codes; no code is
ever emailed.**
* Did: on a fresh agreement where no code was ever asked, browser B posted `{token, code:"000000"}` seven times; then the
  client posted `{token, consent:true}`.
* Expected: a check with no live code is refused and not counted. That is the rule in FO-6 4a's shared
  `signing/door-code.ts` `checkCode` (4b breaker m2: a link holder cannot lock the client out without asking for a code,
  which emails the client). FO-3c is meant to move onto that file.
* Actual: B got `[422,422,422,422,422,423,423]`; the row shows `code_failures=6`, `locked_until=+15 min`, **0 code
  emails**. The client then gets **423 CODE_LOCKED**. After the lock ends, six more made-up codes lock it again
  (`[422,422,422,422,422,423]`, still 0 emails).
* Cause: line 433 now sends a bare `code` to `code()` with no consent and no code ever sent; line 489 counts a wrong code
  even when no live code exists; line 492 then answers EXPIRED. Before this PR the same needed `consent:true`, which left a
  trace; the counting itself is FO-3c's older `code()`.

**B2 — Minor. A provider error on the code-typing request uses up the code and loses the session; the retry then says a
code was emailed when none was.**
* Did: `{consent:true}`, then `{consent:true, code}` while the fake provider's `embeddedLink` threw "provider 503", then
  retried.
* Expected: a retry in the same browser goes on, or a fresh code arrives.
* Actual:
  * The first call returns 500. The row already holds the consent, `code_verified_at` and a live session (line 484,
    lines 440–447), but no Set-Cookie went out: the controller sets it only on success (controller.ts:104).
  * Retry without a cookie: 200 `codeNeeded:true, codeSentTo:"the email address…"`, but **no email is sent** (line 473
    now answers an implicit too-soon as "SENT").
  * Same code: 422 CODE_EXPIRED ("Ask for a new one"). `resend:true`: 429 CODE_TOO_SOON. Stuck for up to a minute.
* Before this PR, a retry within 30 minutes just worked. The same false "codeSentTo" appears in the normal case: code typed
  in browser A within a minute of its send, then the link opened on a phone within that minute.

**B3 — Minor. A decline landing while the code is checked gives a raw 500, not words.**
* Did: the client's decline at the provider, applied with `signingEvent`, (a) just before `code()` and (b) between the
  code check and the consent write.
* Expected: 404 or 409 in words. FO-6 4b's `locked()` re-checks the end under the row lock (4b review m3).
* Actual: both answer **500 "fo_signature_request: a DECLINED request is final"** (the database trigger). Neither the code
  transaction nor the new consent transaction (lines 440–447) re-checks status, `signedAt` or `declinedAt` after the lock.
  Case (a) is older; case (b) is a window this PR opened.

**B4 — Minor. One cookie per browser for every consultation agreement.**
* The cookie is set on `Path=/api/public/consultation-agreements/open` (controller.ts:21, 104; seen at HTTP:
  `Set-Cookie: xr_sign=…; Path=/api/public/consultation-agreements/open; Max-Age=1800; HttpOnly; SameSite=Strict`).
* The token travels in the body, so all agreements share one cookie name and path. A code typed for a second agreement
  (two bookings, a shared family computer) overwrites the first one's cookie (RFC 6265 §5.3); the first link asks for a
  code again. 4b's door scopes its cookie to `/api/public/sign/<token>`. Found by reading; not run.

**B5 — Minor, older behaviour kept. A link holder can make the client receive about one code email a minute, no cap.**
* Did: for 30 minutes after the client's right code, browser B posted `{}`, `{resend:true}` and `{consent:true}` every
  61 s from rotating addresses.
* Actual: **29 code emails** to the client, two 429s; each new code replaces the one the client may be typing.
* The rate is R2-2's from before this PR. The change: during the client's 30 minutes, B's visits used to get the link and
  send nothing; now they send codes.

## What held
* **Binding.** No cookie, a made-up 43-character cookie, another signer's live cookie, the stored sha256 as a cookie, the
  cookie of a session the client replaced in browser C, and a cookie 31 minutes old: all 200 codeNeeded, no link (X5,
  HTTP). The live cookie's holder gets the link with no code.
* **Consent only after the code.** A forwarded link with `consent:true` leaves `consented_at` empty (suite QA-777 (2),
  replay (2)). B's consent racing A's code records nothing for B (X4).
* **Concurrent right codes.** Four at once: exactly one 200 with a session, three 422, one consent audit line (X3).
* **Ended requests.** Declined, then the live cookie: 404 (X5c). Ended, signed and declined: the one not-found (line 409).
* **The provider's "signed".** No code and no consent: NO_CONSENT. Code but no consent: NO_CONSENT. Consent written by
  hand without a code: NO_CODE (suite M3). Nothing applied in any of them (X8).
* **Lock with cookie games.** During the lock, no cookie or a forged one: 423, no link. A live session is not affected by
  the lock (line 431 is checked before `code()`).
* **Cross-firm.** Firm B's id with firm A's secret: 404 (X10).
* **Leaks.** The body never carries `session` (HTTP keys: agreementId, codeNeeded, consentText, consentTextVersion,
  consented, link). Set-Cookie only on a right code. Every answer `Cache-Control: no-store`. Audit lines carry no token,
  code or URL (X9).
* **Too-soon.** An implicit visit within a minute: 200 codeNeeded, no email. An explicit `resend`: 429 (HTTP).
* **Cookie parsing.** Two or more `xr_sign` cookies, two Cookie headers, and 300 forged plus the real one all find the
  real one. A 44-character value, a quoted value or `XR_SIGN` is ignored. A 20 KB Cookie header gets Node's 431.
* **4b's door cookie.** Sent by hand to this door it is accepted (same columns, same code proof; X5b); a browser never
  sends it here, the paths differ. A code-off 4b session fails line 405's pairing (by reading).

Not a finding (P-26): 4b's `GET /api/public/sign/<consultation token>/session` accepted this door's cookie and answered
409 LINK_LOST; that is 4b's door and adapter, not QA-777. No screenshots changed.
