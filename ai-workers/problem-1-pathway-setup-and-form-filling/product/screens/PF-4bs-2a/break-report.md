# PF-4bs part 2a: break report, round 1 (#3815 at 6ab56db7c)

The breaker (Opus), 26 Nov 2026. Scope: concept r3 §2 (doors 1-3) and §6 item 2a, meaning the two doors, the sealed attempt, the limits, the audit lines, the definer lookup and the 503 gates. Not in scope: the Cognito adapter (2b), the web page (3), step-up and the refresh cookie.
How I tested:
* Harness: the PR's own approach (`tsx --tsconfig api/tsconfig.json`, a scratch database on :54329, a test clock, the PR's app wiring), plus scratch scripts.
* An isolated copy, `brk3815` on :4733 with `PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, for the real `main.ts` filter, body parser and logger.
* Both are stopped or dropped; nothing was committed. The PR's suite: 27 passed, 0 failed.

## Majors

**M1. Timing tells a staff email from an unknown one.** `session/sign-in.ts:145-148`, `:136`
* Cause: an unknown email costs one query (`platform_staff_of_email`). A known email with a wrong password costs:
  * the firm lookup;
  * a `findFirst` read as the firm;
  * a `refusedLine` transaction (an audit insert).
* Repro: in the harness, advance the clock 15 min before each call so no limit applies. Then send 60 × `POST /api/platform/session/sign-in {email:"nobodyN.x@example.com", password:"wrong-pass"}`, alternated with 60 × the same call for the seeded staff emails.
* Result: median **2.2 ms unknown against 7.9 ms known**. The fastest known call (5.9 ms) is slower than the median unknown one.
* Impact: concept §2 door 1 requires one answer for a wrong password and for an unknown person. The status and words are the same, but any staff email at any firm can be confirmed in a few calls.
* No check covers timing. DW1 compares status and words only.

**M2. The per-address limit is not per address: `X-Forwarded-For` is ignored, and a burst passes it.** `session/routes.ts:13`, `sign-in.ts:142`
* Cause 1: `ipOf` reads `r.ip`, and `trust proxy` is not set anywhere in `api/src` (grep). So the key is the socket address.
* The concept asks for something else (§2 door 1): "per IP (from `X-Forwarded-For` with the load balancer as the one trusted hop)".
* Repro on :4733:
  1. Send 25 × `POST …/sign-in {email:"nN@example.com", password:"x"}`, each with a different `X-Forwarded-For: 203.0.113.N`.
  2. Then sign in as `representative@sample-firm.example.com` with the Sample password and `X-Forwarded-For: 198.51.100.9`.
  3. Result: **429 TOO_MANY_TRIES**.
* Every client behind one hop shares one bucket. Behind the load balancer, that is everyone: one person with 25 bad tries every 15 minutes blocks sign-in for every staff member of every firm.
* Cause 2: the count is checked before the awaited lookup (`:142`, `:145`) and added after it (`:148`), so parallel calls all pass the check.
* Repro: `Promise.all` of 200 unknown-email tries from one address. Result: **101 answered 401 before any 429** (the limit is 25).

**M3. The authenticator code can be guessed without limit: the 5-per-attempt limit resets with each new password post.** `sign-in.ts:141-151`, `:163-172`
* Cause: a correct password counts against no limit. The code door has no per-person or per-address count. Each new attempt brings 5 fresh guesses.
* Repro (harness, one window, one address): loop 40 × (sign-in with the right password, then 5 wrong codes on that attempt).
* Result:
  * 40 × 200 on the password door;
  * 160 × `CODE_REFUSED` and 40 × `ATTEMPT_EXPIRED`;
  * **200 wrong codes and no 429**;
  * the right code on the next attempt still answers 200.
* Impact: at ±1 step, each guess hits with about 3 in 10⁶, so about 230k guesses give an even chance. The concept says brute-force defence is ours (§2: "Essentials has no threat protection").
* On the stand-in, every staff member's password is the Sample one, so the code is the only real gate.

**M4. Anyone can keep a named staff member out indefinitely, from anywhere.** `sign-in.ts:146`
* Cause: after 5 wrong passwords for an email, even the right password gets the same 401. The count does not depend on who sent the tries.
* Repro:
  1. Send 5 × `{email: victim, password: "guessN"}`, each with a different `X-Forwarded-For`.
  2. The victim then signs in with the right password from another address: 401 `SIGN_IN_REFUSED`.
  3. Ten minutes later: still 401.
* Keeping it up costs one request each time an old entry ages out (5 per 15 min). The victim sees "That email and password don't match." and cannot tell they are being blocked.
* This follows the concept's own words ("same 401"), but the concept presents the per-email limit as a defence against lockout (m3), and this is a lockout at our own door. The fix may need a concept change, for example a key per email and address plus a higher per-email ceiling. That is the tech lead's call.

## Minors
* **m1. The stand-in's set-up step is decided by "never signed in", not by "authenticator not set up".** `sign-in.ts:134`, `:73`
  * An invitee's callback (`session/service.ts:173`) and the old local door both set `last_sign_in_at`. After either one, the new door answers `step:"code"` and never shows the key, so that person can never finish a sign-in here.
  * Repro: `POST /session/local` as user-R, then `POST /sign-in` for R. Result: `200 {step:"code"}`, with no key.
  * The same cause means an Owner's "reset two-step" changes nothing at this door.
* **m2. The 5-per-attempt code limit only holds because the stand-in answers within a microtask.** `sign-in.ts:163-172`
  * The count is read before `await this.port.code` and written after it.
  * Repro: wrap the port in a 50 ms delay, then send 50 parallel wrong codes on one attempt. Result: the provider is asked all 50 times (4 `CODE_REFUSED`, 46 `ATTEMPT_EXPIRED`). A right code in that burst would have returned a token.
  * This matters for 2b's slower provider. On the local port, the limit held: 4 refused, then the attempt ended.
* **m3. Refusal lines can be flooded.** `sign-in.ts:146`, `:148`
  * Every refused try for a known person writes `platform.staff.sign_in_refused`, including during the per-email block. The only bound is the per-address limit, which M2 defeats.
  * The parallel bursts above wrote 73 lines for one person.
* **m4. A used attempt opens again on a second task.** The nonce memory is per task.
  * Repro: two door instances on one key ring. Sign in on A (200), then replay the same attempt on B with the next step's code: **200**, a second token.
  * This is moot on Cognito (Cognito's Session is single-use) and on a single local task. It is also lost on a restart when a key ring is set.
* **m5. The `Tries` cap evicts the oldest key first, which may be a key that is blocked now.** `sign-in.ts:90`
  * `Map.set` on an existing key keeps its original position, so a key's place never moves when it is counted again.
  * Once more than 50,000 keys fail, a blocked email can be released. This is not practical while the per-address limit holds, but M2 weakens it.

## What held
* **Same answer:** a wrong password, an unknown email, an email two rows share, a closed firm's person and an empty password all get the same 401 with the same words. The per-email block behaves the same for unknown emails. `STAFF_NOT_ACTIVE` is shown only after the right password.
* **The sealed attempt:**
  * These all answer 401 `SIGN_IN_REFUSED`, never a 500: a changed attempt; a made-up one; another purpose (`set-password-code`); `""`; `sb1.v0…`; `sb1.v999999…`; a lone surrogate; NUL.
  * Over 2000 characters, or a wrong type: 422.
  * An attempt over 15 minutes old: `ATTEMPT_EXPIRED`.
  * The attempt shows no id or session in clear.
* **Codes:**
  * A used code is refused, on the same attempt and on a new one.
  * Two parallel posts on one attempt, each with a valid code: one 200, one 401.
  * Full-width digits, a trailing newline, a leading space and a number type are each refused.
* **Status between the two steps:** a person deactivated between steps gets `STAFF_NOT_ACTIVE`; a firm closed between steps gets `FIRM_CLOSED`; a closed firm's password gets the same 401.
* **The older session ends** at the new door's sign-in (the PR's DW2, re-run).
* **The definer function:**
  * Its ACL is exactly `xr_wall_reader`, `xr_app` and `xr_staff_bypass`, not PUBLIC.
  * Its `search_path` is pinned. A `pg_temp.platform_staff` shadow made as `xr_app` is not read: the answer is null.
  * It matches the exact case, and every writer stores emails in lower case (`emailOf`, the seed). The door lowercases, so `UPPER@…` signs in.
* **Malformed bodies on the real app (:4733):**
  * Broken JSON: 400 `BODY_NOT_JSON`, without the text.
  * A latin1 charset: 415.
  * 300 KB: 413.
  * A non-object body: 422.
  * Wrong types, a password over 1000 characters, an extra field or a `__proto__` key: 422, naming the field, never the value.
  * An email with NUL, a lone surrogate or over its length: 422 `EMAIL_INVALID`.
* **The password appears nowhere:** not in any answer body, not in `api.log` (count 0 after every body above), not in the harness's printed output, not in `audit_event`.
* **Headers and 503 gates:** `Cache-Control: no-store` is on both doors; `NotSetUpSignIn` and a missing key ring both answer 503 before the body is read (DW6, re-run).
* **Memory:** the nonce maps are swept at expiry, and the `Tries` arrays stay at or under their limit.
* **Not a finding (same as the old local door):** a person in a `SECURITY_LOCK` firm still gets a token (200), as `/session/local` gives one today.

Verdict: Changes
