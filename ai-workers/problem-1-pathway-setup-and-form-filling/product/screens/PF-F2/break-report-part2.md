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

## Round 2: head `2261b901e9731e989dc5c2fb0837797ce827f7d7`

Scope: only `git diff 3ff40ec..2261b90`, which is `resumable-upload.ts`, the client's own retry loop. Same harness: Nest on :4582, the TCP proxy on :4583, Chromium. The bundle was a pinned copy of the lib from `git show 2261b90:…`, because a builder was editing this working tree during the run. Since then the branch has moved to `f08d0cb`, which this round did not test. The scratch files and databases are deleted. No repo file changed except this one.

### Retried
- **B1: fixed.** When the finish fails once with 500, the requests are `PATCH(final)>500`, then `HEAD>200:size`, then the empty `PATCH@size>204` with the id. The page shows done with that id, there is 1 row, and the door's `onComplete` ran twice (the first run rolled back). A finish 409 is final in its detail words ("…no room left… Nothing was stored."), with no second request and 0 rows.
- **M1: fixed.** After a lost final answer, the HEAD is followed by the empty PATCH, and the page shows done with the stored row's id. There is 1 row.
- **M2: fixed.** A 25 s cut that `page.route` aborts (`onLine` true): the page says "Upload paused: reconnecting" throughout. HEADs repeat every 10 s, and the upload resumes from offset 1048576 when the path is back. The sha256 matches.
- **M3: fixed.** Retries spent offline, then the first HEAD after "online" fails: the next try comes 10 s later, the upload resumes and completes, and the sha256 matches.
- **M4: fixed.** An expired token during the cut ends in "Your session has ended. Sign in again, then try the upload again." After signing in again, `retry()` sends `HEAD>200:1048576` then `PATCH@1048576`. There is no new POST, the upload completes, there is 1 row and the sha256 matches. A 502 HTML page for 12 s is never shown, and the upload completes afterwards.
- **m1: fixed.** `abort()` in the "online" wait gives "Upload stopped.", and `done` rejects. No request goes out in the 12 s after going back online.
- **m2: fixed for duplicates, words open (n3).** The case that made two files (lost final answer, then the 24 h expiry) now ends after `HEAD>410`, with no POST and 1 row.
- **m4: fixed.** Through the frozen proxy with `stallMs` 4000, the request is cut at about 4 s and the page says paused. The HEADs repeat and are cut in turn, then the upload completes when the path is back. The sha256 matches.

### New findings
**R2-B1. Blocker: any lasting 5xx after the HEAD becomes a retry loop with no wait (about 50 requests a second, forever), and the words never say paused.**
- **Repro 1:** the door's `onComplete` always throws, so finish answers 500. **Observed:** in 10 s there were 419 requests (`HEAD>200:614387`, then `PATCH@614387>500`, repeated with 0 ms between) and **209 finish runs**. Each run reads the whole staged file, runs PF-F4 and `FilesPort.put`, and opens a transaction. The words stay "100%" (phase `uploading`). It never reports done (held).
- **Repro 2:** every PATCH answers 503 and HEAD is fine, at 25%. **Observed:** 496 requests in 8 s, and the words stay "25%". When the 503s stop, it completes.
- **Cause:** `onProgress` sets `failures = 0` (`resumable-upload.ts:125`). tus-js-client calls it before every PATCH (`upload.js:853`) and on a HEAD at offset = length (`upload.js:725`), so every attempt that passes its HEAD retries after `delays[0]` = 0. Also, `lost()` shows paused only when there was no answer at all (`:95`).
- **Expected:** the delays (0, 1, 3, 5, 10 s, then 10 s forever) and "Upload paused: reconnecting" while the server keeps failing.
- **Fix:** restart the delays only when the server's confirmed offset grows (`onChunkComplete`, or the HEAD's offset compared with the offset before the attempt), never in `onProgress`. Show paused for every try-again status. Add a fail test: PATCH 503 for 8 s gives at most 6 requests.
- (`f08d0cb`'s message says it does this. Not tested here.)

**R2-m1. Minor: `confirm()` has no stall watchdog and no abort signal.**
- **Stall repro:** finish fails once, then the confirm's empty PATCH is never answered (`stallMs` 2000). **Observed:** after 12 s the page still says "100%", phase `uploading`, and never moves on.
- **Abort repro:** call `abort()` while the confirm is in flight. **Observed:** the page says "Upload stopped." and `done` rejects, but the PATCH still goes out (`route.continue()` succeeded), the file is stored (1 row), and the page never learns its id.
- **Fix:** give `confirm()`'s `fetch` an `AbortController`. `watch()` should cut it, and `abort()` should cancel it.

**R2-m2. Minor: `retry()` called while a retry is still running returns the first, already-rejected `done`.**
- **Repro:** after a 401, call `retry()` twice in a row. **Observed:** the second call rejects at once with the old words "Your session has ended…". Meanwhile the first retry completes the upload (1 row, the same id). A caller showing the latest answer would show a failure for an upload that succeeded.
- **Fix:** keep the running retry's promise and return it.
- `retry()` after done sent a HEAD and the empty PATCH again, got the same id, and stored no second row. That is harmless, so it is not a finding.

**R2-m3. Minor: a 410 on resume is said in generic words, and can hide a stored file.**
- A HEAD answer has no body, so `refusalWords(410, "", …)` falls back to "The upload could not be finished.". That holds for a plain expiry mid-file, and also after a lost final answer where the file **was stored** (1 row). In that second case the page says it failed.
- **Fix:** give 410 its own words, as 404 has: "This upload expired… Start it again.". For a 410 after the last byte was sent, first try the empty PATCH (a stored file still answers with its id) before saying it expired.

### New attacks that held
- **A stall cut racing a late answer:** the final PATCH is stored, its answer held 4 s, `stallMs` 1500. The request is cut, the HEAD and empty PATCH give the same id, and the late answer arrives and is ignored. 1 row, 1 `onComplete`.
- **A finish slower than `stallMs`:** finish took 3.5 s, `stallMs` 1500. The request is cut, the empty PATCH waits for the running finish, and gets the same id. 1 row, 1 `onComplete`.
- `retry()` while the first try is running starts nothing new.
- The 410 from expiry on resume never starts a new upload.

Verdict: Block

## Round 3: head `61f5503630d2c935d9a033c225c3104c2b56984f`

Scope: only `git diff 2261b90..61f5503` (`resumable-upload.ts`). I tested the head's own `web/src/lib` with the same harness: Nest on :4582, an HTTP proxy on :4583 that can read a body and then answer 503, hang, or cut a PATCH after 16 KB, and Chromium at 1 MB/s. `8ba3bf5`, which landed during the run, changes records only. The scratch file and databases are deleted. No repo file changed except this one.

### Retried
- **Repro 1 (the finish always fails, 500):** requests go out at gaps of 0, 1.0, 3.0, 5.0 and 10.0 s, then the page shows the server's words ("…what you sent so far is kept."). There are 14 requests and 6 finish runs, and it never reports done. `retry()` while the server is still down runs the same list again (19.3 s, 6 finish runs), then the words. **Held.**
- **Repro 2a (503 on every PATCH, fulfilled by Playwright):** gaps of 0, 1, 3, 5 and 10 s, then "Busy" after 19.4 s, 15 requests. **Held.**
- **Repro 2b (the same 503, from a proxy that reads the whole body first):** **not fixed**, see R3-B1.
- **R2-m2:** fixed in the code (`retry()` returns `latest`). **R2-m3:** a body-less 410 now says "This upload expired: …".

### New findings
**R3-B1. Blocker: a server that reads the chunk and then answers 5xx still gets an endless retry with no wait, and the page shows progress, not paused.**
- **Repro:** at 20%, the proxy reads every PATCH body and answers `503 text/plain "Busy"`, as nginx or an ALB does in front of a failing upstream. HEAD passes through.
- **Observed:** 99 requests in 15 s, repeating PATCH@786432>503 then HEAD>200:786432. The server's offset never moves. The gaps are about 275 ms (the time to send 256 KB at 1 MB/s) and 22 ms (the HEAD); there is no retry delay at all. The words stay "28%", with no paused, no failure and no end.
- **Same result in two other runs:**
  - The proxy cuts each PATCH after 16 KB and answers 500: 133 requests in 20 s, offset stuck at 524288, words "60%".
  - Stall cuts (`stallMs` 1500) followed by the same body-read 503s: the same loop, words "Resumed, 28%".
- **Cost:** each try re-sends the whole chunk (1 MB by default), on a phone's data too, until the person closes the page.
- **Cause:** `if (base < 0) base = sent; else if (sent > base) failures = 0` (`resumable-upload.ts:137`). `sent` comes from the XHR upload progress (`upload.js:799`), so it counts bytes sent, not bytes the server accepted. The rule's own comment says the reset should follow the server's offset. Repro 2a passes only because Playwright's fulfil sends no upload progress.
- **Fix:** reset `failures` only in `onChunkComplete(_, bytesAccepted)` (`upload.js:567`), which fires after the server confirms an offset, or when a HEAD's offset is above the previous attempt's. Add a test with a real body-reading 503 (not `route.fulfill`): at most 6 requests, then the words.

**R3-M1. Major: in browsers within the build target, a confirm never runs, so the page waits forever while the file is stored.**
- **Background:** `confirm()` calls `AbortSignal.any` (`:115`). Vite 8.1's default target is `chrome111, edge111, firefox114, safari16.4, ios16.4` (`vite.config.ts` sets no target). `AbortSignal.any` only exists from Chrome 116, Firefox 124 and Safari 17.4.
- **Repro:** an init script deletes `AbortSignal.any`, then the final answer is lost.
- **Observed:** `HEAD>200:size` every 1, 3, 5 and 10 s, and no PATCH is ever sent: the TypeError is caught as "no answer". The words stay "Upload paused: reconnecting" past 30 s, and nothing settles. The file is stored (1 row) and never reported.
- **Fix:** build the signal by hand (one `AbortController`, aborted by `confirming` and by a `setTimeout(stallMs)`). Do not treat a thrown non-network error as "no answer".

**R3-m1. Minor: a file that changes or disappears during the upload is retried forever as "paused".**
- **Repro:** pick a real file from disk and rewrite it at 25%.
- **Observed:** `PATCH@1048576>FAILED(net::ERR_UPLOAD_FILE_CHANGED)` every 10 s for 40 s or more, with the words "Upload paused: reconnecting". The new branch "The file could not be read. Choose it again." never runs, because tus sets `originalRequest` for these errors.
- **Fix:** read the chunk before sending (`file.slice(...).arrayBuffer()`, so a read error rejects with no request), or treat repeated failures that happen before any byte is sent at the same offset, with the server answering HEAD, as "could not be read".

**R3-m2. Minor: `abort()` after the confirm has reached the server stores a file the page never claims.**
- **Repro:** finish fails once. Then the confirm goes out, its finish takes 3.5 s, and `abort()` is called at 1.2 s.
- **Observed:** "Upload stopped.", but 1 row is stored. The rail has no handle to it, and starting again makes a second file.
- **Expected:** once the confirm is on the wire, `abort()` waits for its answer and reports the file, or the words say the file may already be stored.
- An abort before the confirm reaches the server held: the request is aborted (`ERR_ABORTED`) and 0 rows are stored.

**R3-m3 (R2-m3, second half, still open). Minor: a 410 after a lost final answer tells the person to start again although the file is stored.**
- **Observed:** "This upload expired: … Start it again." with 1 row stored. Following the words makes a second file.
- **Fix:** as in round 2, try the empty PATCH first when every byte was sent.

### Held
- An answered 5xx (as in repros 1 and 2a) ends in the server's words after the delay list, and the upload is kept. `retry()` while the server is still down repeats the list once, then the words, with no loop.
- `abort()` before the confirm reaches the server: aborted, nothing stored.
- `retry()` returns the running promise.

Verdict: Block

## Round 4: head `24a72150ec7bd312c222e7c64408bca9472d6bc6`

Scope (Lead 13): R3-B1, R3-M1 and R3-m1 only, `git diff 864009b..24a7215` (`resumable-upload.ts`, the suite). I tested the head's own `web/src/lib` with the round-3 harness: Nest on :4584, the HTTP proxy on :4585, and Chromium at 1 MB/s. `867579c`, which landed during the run, changes records only. The scratch file and databases are deleted. No repo file changed except this one.

### Retried
- **R3-B1: fixed.** I counted requests and the gaps between them after each switch:
  - **Body-reading proxy 503 on every PATCH:** 11 requests in 21 s. Gaps were 0.28 s (sending the chunk), then 1.28, 3.28, 5.28 and 10.28 s, each followed by a HEAD about 0.02 s later. Then "Busy", with the upload kept. Round 3 had 99 requests in 15 s.
  - **Trickle (16 KB forwarded, then cut and 500):** the same: 11 requests, delays of 1, 3, 5 and 10 s, then "Proxy cut". The server's offset stayed at 786432 throughout.
  - **Always-failing finish (repro 1):** 14 requests, gaps of 0, 1, 3, 5 and 10 s, 6 finish runs, then the server's words. It never reports done.
- **R3-M1: fixed.** With `AbortSignal.any` and `AbortSignal.timeout` deleted and the final answer lost: `HEAD>200:size`, then the empty `PATCH>204` with the id. The page shows done with the stored row's id, and there is 1 row.
- **R3-m1: fixed.**
  - A picked disk file rewritten at 25% gives `PATCH>FAILED(ERR_UPLOAD_FILE_CHANGED)`, then within 0.3 s "The file could not be read. Choose it again.". There is no retry loop and 0 rows.
  - The same file **deleted** at 25% gives `ERR_FILE_NOT_FOUND`, then the same words within 0.3 s.

### New attacks
- **Server accepting one chunk between body-read 503s (every second PATCH):**
  - Each accepted chunk restarts the delays, so after each 503 the next HEAD goes out at once (gaps of about 0.27 s and 0.02 s).
  - The loop is bounded by the file: every two PATCHes advance one chunk. The upload completed in 5.6 s with 28 requests, 1 row and the correct sha256.
  - This is real progress, not a loop.
- **A real cut on a healthy disk file:**
  - CDP offline for 25 s: the page says "Upload paused: reconnecting" throughout, and the read probe never misreports the file. HEADs come at 5, 10, 20 s and so on, the upload resumes at 1048576, and it completes with the correct sha256.
  - A 12 s proxy hang with stall cuts at 1.5 s gives the same result: paused, completes, sha256 correct.
- **Stall cuts, then answered errors:**
  - After a 20 s hang (stall cuts every 1.5 s), the first body-read 503 is final at once ("Busy", 2 requests). The no-answer failures have already used up the delay list that answered errors also count against.
  - The upload is kept for `retry()` and nothing loops, so this is a Minor follow-up (R4-n1), not a block. To fix it, count answered errors separately, or reset the count after a HEAD that is answered.

### Still open, follow-ups by the Lead's ruling
- R3-m2 (an abort after the confirm reached the server leaves a file nobody claims).
- R3-m3 (a 410 after a lost final answer says "Start it again" although the file is stored).
- m3 (two calls on one file store it twice).
- R4-n1 above.

Verdict: Approve
