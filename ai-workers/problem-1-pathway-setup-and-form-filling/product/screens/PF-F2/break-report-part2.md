# PF-F2 part 2: break report (browser client that resumes an upload, R1.64)

Head `3ff40ec988d803654faf148cc5ee2d14ee2445c1` on `claude/runtime-pff2-client`. Scope: `studio/web/src/lib/resumable-upload.ts` (tus-js-client 4.3.1) against part 1's rail, claims (a) to (f) from the hand-over.
Method: the harness from `studio/tests/check_pff2_resume_browser.ts`, copied into a scratch file under `studio/var/`. It used a scratch DB on :54329, Nest on :4580, a TCP proxy on :4581, the real lib bundled by esbuild, and Chromium through Playwright. Cuts came from CDP offline emulation, `page.route` aborts, `route.fetch()` followed by an abort (an answer lost after the server acted), and a frozen proxy (a silent stall). The token clock was moved with `PlatformClock.now`. The test door's `onComplete` could be made to fail once or to refuse with 409. The scratch file, folders and databases are deleted. No repo file changed except this one.

## Findings

### B1. Blocker: a failed or refused finish is shown as done, with nothing stored (claim b)
- **Repro:** a 600 KB PDF in 256 KB chunks. The door's `onComplete` throws once (a DB blip, so the rail answers 500), or throws `HttpException({detail}, 409)`. 409 is the status the rail gives PF-15's plan limit and `FileKeyTaken` (`rail.ts:107-110`).
- **Observed (both):** the requests were `PATCH@524288>500` (or `>409`), then `HEAD>200 Upload-Offset: 614387 = size`. The page went "Upload paused: reconnecting", "Resumed, 100%", "100%" with phase `done`, and `done` resolved with `""`. `plat_file` has **0 rows**. For the 409, the server's words ("…no room left… Nothing was stored.") were never shown.
- **Cause:** tus-js-client retries (409 is in `retryable`, `resumable-upload.ts:42`). Its HEAD reads offset = length, and it calls `onSuccess` with the HEAD response (`tus-js-client/lib/upload.js:722-727`). The rail keeps the staged bytes when finish fails (part 1, F4), and a HEAD never carries `Upload-File-Id`. `onSuccess` accepts a missing id (`resumable-upload.ts:66-67`: `?? ""`).
- **Expected:** done only with a stored file's id. Otherwise the refusal is final, in the server's words.
- **Fix:** in `onSuccess`, if `Upload-File-Id` is missing, send one empty `PATCH` at `Upload-Offset: <size>`. Rail rule 4 answers 204 with the same file's id, or the refusal or 500. Report that answer, never "done" without an id. Also stop treating 409 on the **final** PATCH as retryable. Add a DW test for finish 500 and finish 409.

### M1. Major: a lost final answer is shown as done with no file id (claims b, e)
- **Repro:** same file. The final PATCH is forwarded (`route.fetch()`), so the server stores the file, then the answer is dropped (`route.abort("connectionreset")`).
- **Observed:** `PATCH@524288>FAILED(ERR_CONNECTION_RESET)`, then `HEAD>200:614387`. The page shows `done` and "100%", but `fileId` is absent and `done` resolves `""`. The server has 1 row (`a9e1944a…`). So there is no second file (held), but the caller cannot attach the file it stored.
- **Expected:** done with id `a9e1944a…`.
- **Fix:** the same as B1. The empty PATCH returns the stored id (part 1, round 2 checked this: 204, same id).

### M2. Major: a long cut that the browser does not see as offline ends the upload for good (claim a)
- **Repro:** a 3 MB PDF at 1 MB/s, default delays. At 25%, every upload request is aborted for 25 s. `navigator.onLine` stays `true`, as on wifi with no upstream, a VPN drop, or the server restarting.
- **Observed:** after 19.3 s the words are "The upload could not be finished.", phase `failed`, and `done` rejects. Requests: HEADs at +0, +1, +3, +5 and +10 s, then nothing. When the path came back, nothing resumed. 1 MB stays staged and abandoned, and the lib keeps no URL, so the user starts again from 0.
- **Expected:** "Upload paused: reconnecting" until the server answers, then resume from its offset.
- **Fix:** for status 0 (and 5xx), keep retrying at the last delay (for example every 10 s) until `abort()`, whatever `navigator.onLine` says. Use "online" only to retry at once. Test it with `page.route` aborts, not only CDP offline.

### M3. Major: after the "online" wait, one failed request is final (claim a, flapping)
- **Repro:** retries spent offline, either `retryDelays: null` or the default delays plus a 22 s cut. Then online, with the first request after "online" failing once (`connectionreset`, as Chromium's `ERR_NETWORK_CHANGED` does when "online" fires before the route is ready).
- **Observed (both runs):** `HEAD>FAILED`, then right away "The upload could not be finished." and the upload is failed. There was no second try.
- **Cause:** `upload.start()` (`resumable-upload.ts:74`) keeps tus's `_retryAttempt` at its maximum. tus only resets it when the offset grows (`upload.js:501-504`).
- **Fix:** reset the retry budget on each resume after "online", or do the fix in M2, which removes the dependence. Add a test with the first HEAD after "online" failing.

### M4. Major: failure words are the raw response body: JSON for an expired token, HTML from a proxy (claims b, f)
- **Repro (f):** at 25%, go offline. Move the clock forward 3601 s (`LOCAL_TTL_SECONDS` = 3600) and go back online. Also: a token that has expired before the start. **Repro (proxy):** every request gets 502 `text/html`.
- **Observed:** the page says `{"type":"https://expatready.local/problems/token-expired","title":"Sign in again","status":401,"detail":"Your session has ended. Sign in again.","code":"TOKEN_EXPIRED"}`, or `<html><head><title>502 Bad Gateway</title>…`. For the expired token, tus got `HEAD>401`, dropped the upload URL, and sent `POST>401` (`upload.js:679-697`). So after signing in again the 1 MB already sent cannot be resumed. There was one try and no loop (held). When the app gave a fresh token before reconnecting, the upload resumed and completed (held).
- **Expected:** plain words, "Your session has ended. Sign in again.", and the upload kept so it can resume after sign-in.
- **Fix:** read `detail` from `application/problem+json`. Use the body only when it is `text/plain`; otherwise use the generic words. On 401 or 403, stop without letting tus create a new upload, keep `upload.url`, and give the caller a way to resume with the new token.

### m1. Minor: `abort()` leaves `done` pending forever and the words stuck (claim d)
- **Repro:** abort while waiting for "online" (`retryDelays: null`) and during a retry delay. Then go online and wait 4 s or 20 s.
- **Observed:** no request after `abort()` (held). But `done` never settles, the last state stays "Upload paused: reconnecting", and the "online" listener stays registered.
- **Fix:** reject `done` (for example "Upload stopped."), tell a final state, and `removeEventListener` on abort.

### m2. Minor: a HEAD 404 or 410 makes a new upload in silence; after a lost final answer, that means two stored files (claim e)
- **Repro:** lose the final answer as in M1, then move the rail's clock past 24 h and give a fresh token before the retry.
- **Observed:** `HEAD>410`, then `POST>201` and the whole file again from `PATCH@0`. There are **2 `plat_file` rows** for one upload, and `EXPIRED_WORDS` is never shown. It needs a 24 h gap, hence Minor.
- **Fix:** once an upload URL is known, refuse tus's own re-creation: block a POST in `onBeforeRequest` with a flagged error that `onShouldRetry` does not retry. Show the server's 404 or 410 words.

### m3. Minor: the same file started twice is stored twice (claim e)
- **Repro:** `resumableUpload(file, …)` called twice at once. **Observed:** two ids and 2 rows. **Fix:** keep the running handles in a `WeakMap<File, handle>` and return the running one. The screen should also disable its start button.

### m4. Minor: a silent stall shows "33%" with no pause words and no timeout (claim c)
- **Repro:** through the :4581 proxy, freeze both directions for 40 s (no packets, no reset). **Observed:** the words stay "33%" (phase `uploading`) for 40 s, and the upload continues when the path comes back. tus 4 has no request timeout. **Fix:** a watchdog. If there is no progress or answer for 15 s, `abort()` and `start()` through the retry path (show paused).

## What held
- **(a)** A mid-file CDP cut of 25 s with the default delays: the upload waited past every delay, resumed with `HEAD>200:1048576` then `PATCH@1048576`, and completed with the original's sha256. Starting while offline: three POST failures, then `POST>201` and completion, 1 row. Flapping (30 offline and online toggles, 400-900 ms each): completed, sha256 correct, a single `PATCH@0`, 1 row. A refreshed token during the cut resumed and completed.
- **(b)** A 401 is tried once, never in a loop. A refusal at creation is final (suite DW8c re-checked by hand).
- **(c)** The words go "Upload paused: reconnecting", then "Resumed, N%" up to 100%, on every cut that the browser reports.
- **(d)** No request goes out after `abort()`, either in the "online" wait or in a retry delay.
- **(e)** A lost final answer leaves 1 row; a lost creation answer leaves 1 row. Note, not a finding: that lost creation answer leaves an orphan staged upload until the 24 h sweep, which adds to part 1's F5.
- I could not land a CDP cut inside the final PATCH (on localhost it is buffered). The route-based lost final answer (M1) covers that case.

Verdict: Block
