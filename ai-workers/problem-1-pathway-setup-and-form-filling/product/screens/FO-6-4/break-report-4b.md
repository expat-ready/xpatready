# FO-6 part 4b: breaker report (the client's public signing door)

Branch `claude/runtime-fo6-door-4b` at exact commit `2ba80d7c4`, draft PR #3460. Breaker: a fresh agent that did not build it. Scope: note rules 2-10 and 13 (4b). Rules 11-12 (4c), FO-5d, FO-5s and part 5 are not findings.

**Run.** Isolated copy `brk4b`, `PLATFORM_IDENTITY=local`, fake adapter. **Port note:** I started on :4437 as told. Partway through, another session started its own copy (`rv4b`) on :4437. `isolated.sh` stops whatever listens on the port, so it killed my server, and my next calls reached the other copy's database (every link answered 404). Those results were thrown away. I re-ran everything on **:4447** (fresh database, 16 live links made through the API: sign in, template, prospect and conflict check by SQL, draft, Send, link read from the demo inbox) and stopped the copy at the end. Scratch scripts are in the session scratchpad only. No 5xx in the whole run (`var/isolated-logs/brk4b-api.log`: 0 lines with status 5xx).

## Findings

### Major
**M1. On a shared address, one caller can block every client's link for a minute, again and again.** Repro: from one address (127.0.0.1), 310 `GET /api/public/sign/<firm hex>.<random 43>` calls, each with a different unknown token. The 404s became 429 once the per-address ceiling (300 a minute) was reached. After that, an untouched live link from the same address got **429**, and so did a call carrying `X-Forwarded-For: 9.9.9.9`. The same link from a second address (curl `--interface 127.0.0.2`) got 200.
- Why it matters: the API sets no trust-proxy. Behind the demo's Vite proxy (`web/vite.config` proxies `/api` to the API) or any load balancer, every client shares one `req.ip`. Then the per-address ceiling `over(\`a|${ip}\`, …)` (`door.controller.ts:29`) works as a single global limit for every link.
- The note's question 9 says "only the per-token limit protects a link". That is wrong: the ceiling actively lets one anonymous caller block all clients, which breaks rule 10's "one caller cannot block other clients' links".
- Suggested fix: until trust-proxy lands, count toward the per-address ceiling only the calls that end in the not-found 404 (misses and enumeration). Never refuse a well-formed token that resolves to a live signer because of the address key. Or drop the ceiling and keep only the per-(address, token) limit. Add a test: flood with misses, then check that a live link from the same address still answers 200.

### Minor
**m1. A session started while the code was off survives switching the code back on.** Repro: set `front_office.signing_email_code=false`. A fresh browser Y sends `POST …/consent` and gets a cookie. Set the setting back to `true`. Y's `GET …/session` still gives **200** with the embedded link, and its `POST …/consent` gives 200. Expected (question 8, and the comment in `email-code.ts`: "a change applies at once to links already sent"): once the code is on again, a session that no code ever opened is refused. Today it lasts up to 30 minutes.
- Cause: `liveSession` (`door.ts:83-86`) checks only the cookie's hash and expiry, not how the session started.
- Fix: with the code on, also require `code_verified_at` to be set and no older than the session's start (`session_expires_at - 30 min`). Or record the session's origin when it starts.

**m2. Anyone holding a forwarded link can keep the real client locked out.** Repro: on a link where no code was ever asked, 6 × `POST …/code/verify {"code":"123456"}` gave 422 CODE_EXPIRED ×5, then **423**. After that, `POST …/code` also gives 423 for 15 minutes, and the 6 calls can be repeated (the limit is 30 a minute per address and token).
- A double submit also counts. 25 parallel verifies with the right code gave one 200 (one cookie, one `session_started` line), and the other 24 were counted as "expired", so the link locked after a success. A client who taps twice gets one wrong try counted.
- Cause: `door-code.ts:65,72` counts a check when no live code exists. These are FO-3c's values, so this is accepted design. I list it so it is a conscious choice.
- Fix if wanted: do not count a check when no unspent code exists. Answer 422 "Ask for a code first" instead.

**m3. The words of the code-off refusal do not match.** `GET …/session` with no session while the code is off answers title "Enter the code first" with detail "Agree to sign electronically first." (`door.ts:168`). Fix: give it a code-off title, for example "Agree first".

**m4. A text/plain cross-site POST sends a code.** `POST …/code` with `content-type: text/plain` answers 200 and mails a code. Such a request needs no preflight, so any site can trigger one email per minute per link. This is spam only: no session results, and consent cannot be reached, because the cookie is SameSite=Strict and the consent body is strict. Fix if wanted: accept only `application/json` on the door's POSTs.

## What held (tried, refused correctly)
- **No code, forwarded link, forged cookie:** consent and session without a code gave 401; a fresh browser gave 401; a forged 43-character cookie gave 401. Nothing was recorded.
- **Cookie:** `HttpOnly; SameSite=Strict; Max-Age=1800; Path=/api/public/sign/<token>` exactly. Only its sha256 is stored. The token is checked against its shape before it goes into Set-Cookie (no header injection).
- **Fixation and replay:**
  - A new verify (after 61 s) gave a new cookie, and the old cookie then got 401.
  - Sending old and new cookies together worked only through the new one.
  - Link A's cookie on link B gave 401.
  - After `session_expires_at` passed, the cookie got 401.
  - Replaying a spent code gave 422.
- **Lock and races:**
  - The 6th wrong code gave 423. The right code while locked gave 423, and a code ask while locked gave 423.
  - 25 parallel right verifies gave exactly one 200 and one session.
  - 25 parallel wrong verifies ended with the counter at 6 and the link locked (the counter did not lose any try).
  - 10 parallel `resend:true` asks gave one 200, nine 429, and one email.
- **Oracle:** unknown, other firm's, the firm signer's own, a firm id that does not exist, all zeros, malformed, upper-case hex, trailing character, 5000 characters: one byte-identical 404 on all five routes, with `no-store` and `no-referrer`. Medians: about 1 ms for a malformed token, 2.4-3.9 ms for a well-formed one, live or unknown (accepted, rule 10). A `%2E`-encoded dot reaches the same token and the same limiter key, so it bypasses nothing.
- **Personal data:** the live state, every refusal and every ended state carry only the firm's name. Scanned for the person's name, email, `@` and uuids: none found.
- **Ended requests:**
  - States tested: UPDATED, WITHDRAWN, SIGNED_OFFLINE (reads SIGNED), DECLINED, CLIENT_SIGNED (reads SIGNED), EXPIRED, and SENT past its expiry.
  - Each answered its state with 200. code, verify, consent and session each gave 409, even when a cookie that was live before the end was sent. No cookie was set.
- **Code off:**
  - Code and verify gave 409 CODE_OFF.
  - Consent starts the session. A second browser's consent replaces the first browser's.
  - 8 parallel code-off consents gave exactly one live session and one consent line.
  - On → off in the middle of a flow: the client's earlier session was replaced (the stated bearer rule).
- **Written once:** 10 parallel consents gave one `consent_recorded` line. 12 parallel sessions gave one `viewed` line, with SENT → VIEWED on both the request and the retainer. The GET state writes nothing. A session before consent gave 409.
- **Bodies:**
  - Unknown field, wrong types, `__proto__`, `constructor`, an array, form-encoded, a 10 000-character code, a 100 000-character version, Arabic-Indic digits, a NUL character, `agree:"true"`: each gave 422, with the field named.
  - `null`, a JSON string or broken JSON gave 400. 2 MB gave 413.
  - A wrong `consentTextVersion` gave 409.
  - 300 cookies, or junk cookies, gave 401. None of these gave a 500.
- **Logs and audit:**
  - The API log holds route patterns only. Grepped the whole log for all 16 tokens' secrets, for `/sign/<token>` and for codes: 0 matches.
  - 73 door audit lines: no 43-character token and no 6-digit code.

Verdict: Changes

## Round 2: diff only, on `c234bda62`

**Run.** Fresh isolated copy `brk4b2` on :4448 (10 live links made through the API), stopped afterwards. I ran every test between 10:45 and 10:55 UTC against the committed `c234bda62`. At 10:56 an uncommitted edit to `door.ts` appeared in this shared checkout; it is not mine (see r2-m1). No 5xx; no token or code in the API log.

### Re-attacks
- **M1, fixed.** 310 distinct random tokens from one address: the 404s turned into 429 after the ceiling, and a malformed token then also got 429. A live link from the same address then got **200**, and its `code` and `verify` got 200 and 200. A second flood of 40 000 misses: a live link still got 200.
- **m1, fixed except a 1-second window (r2-m1).** Sequence: code off, browser Y consents and gets a session, code back on. Y's session and consent then get 401. A client's code-started session survives off and then on: 200, 200. With a 2 s gap between the client's verify and an attacker's code-off consent, the attacker's session got 401 after the code went back on.
- **m2, fixed.**
  - 8 verifies with no code asked: 422 each, `code_failures` stays 0, no lock.
  - 10 parallel replays of a spent code: 422, nothing counted.
  - With a live code, 6 wrong tries still give 423, and the right code while locked still gives 423.
- **m3, fixed.** With the code off, the 401 now reads "Agree first" / "Agree to sign electronically first."
- **m4, fixed.**
  - No body, `text/plain`, form-encoded and `application/jsonx` each give 415.
  - `application/json; charset=utf-8`, `Application/JSON` and an empty JSON body each give 200.
  - The API sets no CORS, so a cross-site JSON POST is blocked by the preflight.
  - A malformed token still gives 404 before 415. An unknown well-formed token and a live one both give 415, so this tells nothing about the token.
- **New re-check after the row lock.** Withdrawing the request while 6 consents run gave 409 on all 6; no 500.
- **The 404 wrapper.** An unknown token on all five routes, a malformed token and another firm's token all give the 404 byte-identical to the reference. `counted` only maps `LINK_NOT_WORKING` and always rethrows.
- **Getting round the per-token limit.** Hammering a live token gave 429 within the 30. Variants of the token (`%2E`, `%32`, a trailing `/`, `?x=1`, `#a`) all reach the same key and get 429. Misses cannot be avoided to buy more calls on a live token.

### Round 2 findings
**r2-m1 (Minor). The m1 fix still lets a code-off session through if it starts within 1 s of a right code.** `liveSession` accepts `|code_verified_at - session start| < 1000 ms` (`door.ts:89` at `c234bda62`).
- `checkCode` and `startSession` each call `now()`, hence the tolerance. But a code-off consent that starts within 1 s of the client's verify also passes.
- Repro: client verifies; the setting goes off; the attacker consents within about 300 ms; the setting goes back on. The attacker's session got **200**.
- Real exposure is tiny: the firm must switch the code off within that second.
- Fix: one moment for the check and the session, and test for exact equality. The uncommitted working-tree edit seen at 10:56 does exactly that (`now` passed to `startSession`, compared with `===`). I did not test it: commit it and re-run the `m1` line.

**r2-m2 (Minor, information only). Past the miss ceiling, each guess still costs a lookup.**
- `missed` answers 429 only after `open()` has looked the token up. A flood of distinct tokens still sends every guess to Postgres: about 920 a second from one caller, against about 1 900 a second for one token, which `limit` refuses before any lookup.
- After the ceiling an unknown token gets 429 while a live one gets 200, so the ceiling no longer slows guessing. This does not matter with 256-bit tokens.
- Server memory rose 444 MB → 1.16 GB on the first 40k flood and only +80 MB on the second. It levels off; it is not a leak.
- Accept, or say so in the note's rule 10.

Verdict (round 2, `c234bda62`): Approve. Only Minors are left; r2-m1's fix is already sitting uncommitted in the checkout.

## Round 3: diff only, `b268982ea..fcb8e3ad8`
Fresh copy `brk4b3` on :4449 (8 links), stopped afterwards. No 5xx. **r2-m1 fixed.**
- The r2-m1 reproduction, 3 times: a right code, the code switched off, an attacker consent 43-75 ms after the session the code started (going by the stored `code_verified_at`), the code back on. The attacker's session got **401** and its consent got **401**. At `c234bda62` the same steps gave 200.
- **No false 401s from the exact comparison.** Right code, then consent, then session: 200 / 200 / 200, with `code_verified_at` exactly equal to the session start, on 2 links. A code-started session across code off and then on: 200 and 200. A code-off consent session works (200). The state shows `codeRequired:false` while off.
- **The GETs answer as before.** Live state 200 WAITING. The unknown-token 404 still carries `no-store` and `no-referrer`. Session without a cookie: 401. The moved `@OpenRead` marks changed only their text.

Verdict (round 3, `fcb8e3ad8`): Approve.
