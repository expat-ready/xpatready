# FO-6 part 4c: breaker report (the stand-in signing page, the firm signer's link, QA-770's signing guard)

Branch `claude/busy-goldberg-jyerm9` at exact commit `cb742468e` (PR #3490, stacked on #3460 at `fcb8e3ad8`). Breaker: a fresh agent that did not build it. Scope: plan-4c rows 1-7, note rules 11-12, challenge-4c. FO-5d (the request still SENT/VIEWED after a withdraw, QA-770's main fix), FO-5s, FO-6v and part 5 are not findings.

**Run.** Isolated copy `brk4c` on :4491, `PLATFORM_IDENTITY=local`, local environment, no `STUDIO_PUBLIC_URL`. One restart was part of the test. The copy was stopped at the end. The baseline `check_fo6_door.ts 4491 xr_studio_brk4c` passed 42/42, and `check_fo6_fake_page.ts` passed 16/16. Live links were made through the API: sign in, prospect and conflict check by SQL, draft, Send, the link read from the demo inbox, the firm's code switched off by SQL (as in D). Then consent, `/session` and the stand-in URL, as in the test. About 30 retainers in all. The scripts are in the session scratchpad only.

**Across the whole run:** no 5xx (`api.log`: 0 lines with status 5xx). No nonce, door token or email in the logs (route templates only). The audit trail holds hashes only.

## Verdict: **Pass with Minors**: 0 Blockers, 0 Majors, 4 Minors

## Minor

**m1. A delivery the door refuses without a retry leaves the signer unable to sign for good. The page then shows the door's internal reason.**
* Repro (a3):
  1. Send a retainer; the client consents and opens `/session`; the copy gives a stand-in URL.
  2. From 127.0.0.1, send 125 × `POST /api/hooks/signing/fake {"x":1}`. Unauthenticated junk; the last ones get 429.
  3. Press Sign on the page.
* Actual:
  * The Sign answers 409 "The signature was not recorded (**TOO_MANY_REQUESTS**). Ask the firm to send it again." The request stays VIEWED|VIEWED.
  * From then on, the client's `GET …/session` answers 409 **LINK_ENDED** "This agreement can no longer be signed", even 61 s later after the limit window has passed. Meanwhile `GET /api/public/sign/:token` still says WAITING "…has sent you a retainer agreement to sign". The client is at a dead end.
  * The only way out is withdraw and send again.
* Expected: a refused delivery leaves the signer able to sign again. Plan row 2 (a)/(e) said the nonce is consumed only after a 2xx.
* Cause:
  * `sign` takes the nonce (`fake-page.ts:91`), then `act("signed")` marks the fake's signer signed before anything is delivered (`port.ts:193`).
  * `deliver` retries only a 409 NOT_YET, CHANGED or NOT_READY (`fake-page.ts:72`). A 429, a 5xx, a network error or a hung door (`fetch` has no timeout) is final.
  * After that, `embeddedLink` throws `SigningEnded("signed")`.
* Impact: the same failure follows any non-retried refusal, such as a 5xx on the `completed` call after the firm's `signed` applied. Severity is Minor because this is a local-only stand-in and the trigger needs 120 hook calls a minute from loopback, or an unusual error.
* Wording: the page also echoes raw reasons, such as "TOO_MANY_REQUESTS" and "the agreement is signed offline. Ask the firm to send it again" (`fake-page.ts:97`). And when `act` throws, the alert is answered with status 200 (`fake-page.ts:94`).

**m2. A wrong `consentTextVersion` gets 409 CONSENT_CHANGED after the retainer lookup. The plan's strict body says 422.**
* Repro: `POST …/firm-signing-link {consent:true, consentTextVersion:"v0"}`.
  * As the representative: **409** CONSENT_CHANGED.
  * As a case officer while everyone sees all prospects: 409 CONSENT_CHANGED, where 403 NOT_THE_REPRESENTATIVE would be expected.
  * As a case officer who cannot see the retainer: 404.
  * `" sign-electronically-v1 "` with spaces is trimmed and accepted (200).
* Expected (plan row 4 (2), challenge M1): `{ consent: true, consentTextVersion: "sign-electronically-v1" }` exactly, anything else 422 before any lookup.
* Where: the schema takes any text up to 40 characters (`routes.ts:13`). The version is compared only inside `firmSigningLink`, after `Retainers.read` (`firm-link.ts:26`).
* Impact: nothing leaks and nothing is written. The order simply differs from what was approved. Either pin the literal in the schema, or record the change to the plan.

**m3. The "start fails outside local" guard checks only the list it has just built.**
* `assertStandInPageAllowed(feature.controllers, env)` (`front-office-signing.ts:38`, `fake-page.ts:31`) sees only this feature's own array, which the same function built from the same `env`, so it can never fire.
* Other ways the controller could be registered would start without complaint: another feature file, `main.ts`, or a later refactor. `registerFeatures` (`features.ts`) merges every feature's controllers without checking.
* Rule 11's "a start that registers it there fails" is therefore narrower than it reads.
* The request-time check (`fake-page.ts:35-38`: local and the fake port, else 404) still holds, so Minor.
* Suggested fix: run the assertion once on the assembled module's `MODULE_METADATA.CONTROLLERS` after `registerFeatures`.

**m4. The fake's nonce map is never swept** (`port.ts:114`, `:156`).
* Every `GET …/session` and every firm-link call adds an entry.
* An entry goes only when its signer signs, its document is cancelled or declined, or that exact nonce is looked up after its 10 minutes. Challenge m1 asked for "Sweep expired nonces from the map".
* The firm-link route has no rate limit: 3 concurrent calls gave 3 live nonces, each valid. Impact: local only, unbounded but slow. Minor.

## What held (each tried on the copy unless marked)
* **Nonce, single use and race.**
  * Two concurrent Signs on one nonce, plus two on a second nonce of the same signer: [200, 404, 404, 404]. One `signed` receipt, one `signing.signed` audit line.
  * The firm signer, 3 concurrent Signs on 2 nonces: [200, 404, 404]. One evidence row, SIGNED|SIGNED.
  * Reusing a nonce after signing gives 404. A new `/session` after signing is refused.
* **Cross-signer, cross-document and malformed nonces.**
  * The client's nonce on the firm signer's path gives 404, for both GET and POST.
  * The signed client's nonce on the firm's link also gives 404.
  * All give 404: a trailing character, url-encoding, `..%2F`, a 5,000-character document, a Unicode document, PUT or DELETE, and a missing segment.
  * An unknown nonce gives a readable HTML 404 that does not echo the path.
  * A 100,000-character nonce gives 431. `%%%` gives 400.
* **Firm signer before the clients.** The firm link gives 409 CLIENTS_FIRST with no consent written. The door gives the firm signer's token no page (4b).
* **QA-770 guard.**
  * The client opened the page, then the retainer was withdrawn, then Sign: refused "the agreement is withdrawn", 0 signatures.
  * Client signed, then the firm link, then withdraw, then the firm Sign: refused, firm not signed, no evidence.
  * A new version after the page opened (PATCH): refused "a newer version was made".
  * Signed on paper after the page opened: refused "signed offline".
  * Withdraw and Sign fired together, 16 races, both orders and several delays: every result was consistent (WITHDRAWN with 0 signatures, or CLIENT_SIGNED with the withdraw 409). Never WITHDRAWN with a signature.
  * The firm link on withdrawn, edited or SIGNED retainers gives 409 NO_LIVE_REQUEST.
* **Firm-link permissions.**
  * Representative user-T on a prospect owned by user-R: user-T gets 200.
  * Owner user-R gets 403 NOT_THE_REPRESENTATIVE. The case officer gets 404 when everyone-sees-all is off and 403 when it is on.
  * Another firm gets 404. No token gets 401. A malformed id gets 404. A random id gets 404, or 422 when the body is also bad.
  * An extra field, `consent:false`, `consent:"true"`, a 41-character version, an array, `text/plain`, a 5,000-deep object, `__proto__` or `constructor` keys all give 422 or 400. A 2 MB body gives 413.
  * Changing the representative after Send is refused by the database trigger ("change only by an edit"), so it cannot happen.
* **Consent once.** 3 concurrent firm links gave 1 `signing.consent_recorded` line (actor `staff:<id>`) and one `consented_at`. After a restart, consent is recorded and then 409 LINK_LOST "Send it again". The client's `/session` gets 409 LINK_LOST. Nonces from before the restart give 404.
* **Page content and headers.**
  * The page shows only the title "Retainer agreement (version 1)" and "signing as the client" or "the firm". No name, no email, no firm name.
  * Headers: `no-store`, `no-referrer`. CSP `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'`.
  * A frame from another origin is blocked. No script, and no console errors apart from the expected 404s.
  * Escaping of a hostile title was confirmed by the unit test only, not on the copy.
* **Loopback and Host header.**
  * The delivery URL is fixed: `127.0.0.1:$STUDIO_PORT`, the same default as `main.ts:240`. Its headers and body are the fake's, never the request's.
  * A cross-origin form POST with extra fields signs only that nonce's signer and takes no fields.
  * `Host: evil.example` and `X-Forwarded-Host` do not move the link base: the URL stays `http://localhost:4491/…`.
* **Local only.**
  * Checked in-process: `local` registers the page; `" local"` (with a space) does not, which fails closed.
  * The unit test covers `signingFeatureFor("test"|"production")`, the start guard, and the request-time 404 outside local or with a non-fake port.
  * Not tried end to end: a test-environment copy cannot start on a lane. `settings.ts` refuses `PLATFORM_IDENTITY=local` and requires about 40 secrets. So "route 404 on a test copy" rests on the unit test and on m3's request-time check.
* **Browser.**
  * At 1024 px and at 200 % zoom: no horizontal overflow, the Sign button is visible.
  * Keyboard: the first Tab lands on Sign with a visible focus ring, Enter signs.
  * After Sign, reload and Back give the readable "used" 404 page.
  * `lang="en"`, one `h1`, a `main` landmark, a named button.

## Not findings (noted)
* In local, `useSigningPort(fakeSigning(...))` always replaces the port (`front-office-signing.ts:33`). Challenge m6 said "only if no other adapter has been set". No other adapter exists today; FO-6v should revisit this.
* The page offers Sign on a withdrawn retainer until Sign is refused. QA-770's source fix is FO-5d's.

## Round 2 (diff only: `cb742468e..18b64a0b7`, head `18b64a0b7`)

**Run.** Isolated copy `brk4c2` on :4491, set up as in round 1 and stopped at the end. `check_fo6_door.ts` passed 42/42 and `check_fo6_fake_page.ts` passed 18/18. No 5xx, and no raw nonce in the log.

**Verdict: Pass.** All 4 round-1 Minors are fixed. Part of m1 remains as **m5** below (Minor). No new Blocker or Major.

* **m1, fixed.**
  * Repro (`r2`): four retainers, each with the client's stand-in page open. 125 junk calls to `POST /api/hooks/signing/fake` from loopback, then Sign on each page.
  * Each Sign got 409 "The signature was not recorded yet. Wait a moment and try again." with a Try again button. No raw code is shown. Reopening the page (GET) shows Try again.
  * After waiting 62 s, Try again gave 200 "Signed". The request reads CLIENT_SIGNED, with 1 receipt and 1 `signing.signed` line.
  * The firm signer, flooded the same way before Sign: Try again after 62 s gave SIGNED|SIGNED and 1 evidence row.
  * **Try again abuse:**
    * Three concurrent Try agains gave [200, 404, 404]: one signature. One more Try again gave 404.
    * The pending nonce on another document and signer, on the same document with the firm signer, or on the same document with another client's signer id: 404 each.
    * The signer's other unused nonce while a delivery waited: 404.
    * Withdrawn while waiting, then Try again: 409 "This agreement can no longer be signed here. Ask the firm for the latest agreement.", VIEWED|WITHDRAWN, 0 signatures. A further Try again gave 404.
* **m2, fixed.** A wrong version gives 422 INVALID, before the lookup: a random id with a wrong version also gives 422. A padded version now gives 422 too.
* **m3, fixed.** Checked with a small Nest module holding only `FakeSigningPageController`. `local` starts. `test` and `production` are refused at `NestFactory.create` with "the stand-in signing page is registered with PLATFORM_ENVIRONMENT=…; it exists only in local".
* **m4, fixed** (read in the code): expired nonces are swept on every new link (`port.ts:156`).
* **The firm link's re-check under the lock** (read in the code): `firm-link.ts:37-39`. It is a 409 CHANGED inside the transaction, with no write. I could not race it on the copy.

### Minor (round 2)
**m5. Try again works only from the original tab, and only for 10 minutes. After that, the round-1 dead end returns.**
* Repro (`r3`): flood the door, Sign (Try again shown), wait 10 min 5 s, then Try again.
* Actual:
  * Try again gives 404 "…Open the signing link again to get a new one."
  * Opening the link again gives `/session` 409 **LINK_ENDED** "This agreement can no longer be signed". The door still says WAITING, and the request stays VIEWED|VIEWED.
  * While a delivery waits, the client's `/session`, and for the firm signer `firm-signing-link`, also answer LINK_ENDED. So a signer who closed the tab is stuck at once.
* Cause:
  * The fake has already marked the signer signed.
  * The undelivered calls live only in the page's `pending` map, keyed by that one nonce, for 10 minutes (`fake-page.ts:83-92`). `embeddedLink` throws `SigningEnded("signed")`.
* Impact: much narrower than round 1, and local only. Recovery is still withdraw and send again.
* Possible fixes:
  * When `embeddedLink` meets an undelivered signature, give a fresh link to the pending page.
  * Or keep pending calls until delivered rather than for 10 minutes.

**Note, not a finding:** `deliver` treats any `duplicate: true` answer as delivered, even an earlier stored refusal (`fake-page.ts:74`). A refusal is final and never kept for Try again, so this can only happen if the first answer was lost after the door committed. I did not reach it.
