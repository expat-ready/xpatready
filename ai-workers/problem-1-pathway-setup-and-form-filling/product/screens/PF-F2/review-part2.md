# PF-F2 part 2 (R1.64, the browser client that resumes an upload; no product screen): review

**Reviewed head:** `3ff40ec988d803654faf148cc5ee2d14ee2445c1` on `claude/runtime-pff2-client` (draft PR #3303, stacked on #3277). Only `git diff origin/claude/quirky-mayer-g0iinz..HEAD` was reviewed: `web/src/lib/resumable-upload.ts`, `tests/check_pff2_resume_browser.ts`, `package.json` and the lockfile (tus-js-client 4.3.1), gate page entry 23, and `web/src/MODULE.rows/PF-F2.md`. I did not build it. **Verdict: Block.**

**How I checked it.** I read the diff and the tus-js-client 4.3.1 source (`lib/upload.js`: `start`, `abort`, `_emitError`, `shouldRetry`/`defaultOnShouldRetry`, `_resumeUpload`, `_addChunkToRequest`, `_handleUploadResponse`). I read the server it talks to (`api/src/platform/files/uploads/rail.ts`, rules 1-5) and part 1's lost-answer test (`check_pff2_uploads.ts:139-144`). I read the PF-F2 row, STANDARDS §1 and P-587.
- **The suite:** `tests/check_pff2_resume_browser.ts` passed 14, failed 0 (Postgres 18 on :54329, `/opt/pw-browsers/chromium`, about 34 s).
- **Web typecheck:** `tsc -p web/tsconfig.json --noEmit` is clean.
- **Probes:** I ran a harness built from the suite's own setup (same app, same door, same esbuild bundle of the real lib), in the ignored `studio/var/`, deleted afterwards. Its results are quoted below.
- **Ports:** the suite and my probe copied its `nest.listen(0)`, so both used a random local port. Nothing used :4400.

**Not applicable (no product screen):** concept fit, D1-D20, the BIC scorecard and the journey score. CS-D1 will be the first page to use the client.

## Blocker

**B1. When the server fails to finish the upload, the client reports success, with no file id.** It also resolves with an empty id after a lost final answer.
- **Cause.** If the last PATCH gets no usable answer, tus-js-client retries with `start()`, which sends a HEAD. The rail's HEAD answers 200 with `Upload-Offset` equal to the length. This holds even when `finish` never stored the file, because the staging copy stays (rail rule 4 keeps it, and a `files.put` or DB error does not remove it). In that case tus-js-client calls `_emitSuccess(HEAD response)` (`upload.js` `_resumeUpload`, "offset === length"). The HEAD answer carries no `Upload-File-Id` (only `onUploadFinish` sets it, on a PATCH). So `resumable-upload.ts` `onSuccess` reads `getHeader("Upload-File-Id") ?? ""`, reports `done` and resolves `""`.
- **Reproduced (G), finish fails once:** I made `FilesPort.put` throw once, which gives a 500 on the last PATCH. Requests: `PATCH:786432>500 | HEAD:->200:1048563`. Words: `"100%", "Upload paused: reconnecting", "Resumed, 100%", "100%"`. Result: `settled: true, result: ""`. **plat_file rows added: 0.** A person is told their passport is uploaded when nothing is stored.
- **The same path catches every refusal at finish that leaves the staging copy:** the rail's 409 "This file is already stored.", PF-15's plan-limit 409, and any 5xx.
- **Reproduced (A), lost final answer:** the server answered `204` with `Upload-File-Id: c88450ee-…`, and Playwright then reset the connection. Requests: `FAILED PATCH:786432 | HEAD:->200:1048563`. Result: `result: ""`. The file is stored, but the page never learns its id. The module card's own contract ("resolves with the stored file's id") is broken.
- **Fix.** In `onSuccess`, when `Upload-File-Id` is missing, send the empty PATCH at `Upload-Offset = size` that part 1 built for this case. Its test DW1 "a retry (an empty PATCH at the end) answers 204 with the same Upload-File-Id" covers it, and it re-runs `finish` if the first run failed. Send it with the bearer token from `o.token()`, and resolve with the id it returns. If it is still missing, or the answer is an error, go to the failure path with the server's words. Never resolve `""`.
- **Tests to add (each fails today):** (a) lost answer to the last PATCH: `result` equals the server's id; (b) finish fails once: the second attempt stores the file and resolves its id; (c) finish refuses (409): it ends `failed` with the server's words and nothing stored.

## Major

**M1. Once its retries ran out while offline, the client has none left after "online". One failed request after reconnecting ends the upload for good.**
- **Cause.** `onError` waits for `online` and calls `upload.start()` on the same `Upload`. tus-js-client's `_retryAttempt` is still at `retryDelays.length`. It resets only once a chunk lands (`_offset > _offsetBeforeRetry`). So if the first HEAD after `online` fails while `navigator.onLine` is true, `shouldRetry` returns false at once. Your `onError` then sees "online" and fails for good.
- **Why it matters.** This is common on mobile: `online` fires when the radio attaches, before routing or DNS work. That is the row's own user, "a person on a weak connection (mobile, abroad)". With the default delays it takes more than 19 s offline.
- **Reproduced (C).** Setup: `retryDelays [0, 200]`, cut at 25 %, wait 2.5 s, then the first request after `online` is aborted once. The page ends `failed: "The upload could not be finished."`. Requests: `FAILED PATCH:1572864 | FAILED HEAD ×3`. The control run (C-control: same steps, nothing aborted) completes.
- **Test gap.** The suite's third run uses `retryDelays: null`, which never retries at all, so it cannot see this.
- **Fix.** When `online` arrives, start a fresh `Upload` with `uploadUrl: upload.url` and the same options. It begins with a new retry counter and resumes by HEAD. The alternative is to keep the client's own back-off loop while the error is retryable. Add a test where retries run out offline and the first request after `online` fails: the file still completes.

**M2. A refused token on resume shows the raw JSON problem body as the page's words.**
- **Cause.** `onError` shows `originalResponse.getBody()` whole. The rail's own refusals are `text/plain`, but PF-4's guard answers 401 (and other guard and Nest errors) as `application/problem+json`.
- **Reproduced (E).** The token was replaced while cut. Requests: `HEAD:->401 | POST:->401`. The page words were `{"type":"https://expatready.local/problems/token-refused","title":"Sign in again","status":401,"detail":"This sign-in token is not one this server issued. Sign in again.","code":"TOKEN_REFUSED"}`. That breaks the plain-words bar and choice (4), "the server's own words".
- **Fix.** When the body is problem JSON (by content type, or it parses with a `detail`), use `detail`, falling back to `title`. Add a test: a refused token on resume shows "… Sign in again." and no `{`.
- **Positive control (E2):** a refreshed token from the getter is used on resume, and the upload completes.

**M3. Gate entry 23 does not show P-587's six checks.**
- **Missing checks.** P-587 (3) says "each §1 gate note shows the six checks". The entry records licence, releases and the npm maintainer count. It does not record the project's own tests and CI, nor a security policy.
- **What I found.** `tus/tus-js-client/.github/workflows/ci.yml` exists, with Puppeteer and Node 20-26 suites. No `SECURITY.md` answered at the repo root, at `.github/`, or at the org's `tus/.github` (404, 23 Nov).
- **Upkeep and maintainers, not said plainly.** P-587 asks for "a release in the last 6 months" and "more than one maintainer". The stable line's last release is 4.3.1, about 22 months ago; only 5.0 pre-releases are inside 6 months. Of the 2 npm maintainers, one is `tus-bot`.
- **Fix.** Add the six checks as a list, each with met / not met / not verified and its evidence: tests/CI met (`ci.yml`); security policy not found; 6-month release not met on 4.x (pre-releases only); one human maintainer on npm; Scorecard is the Lead's. The Lead then decides knowingly. No code change.

## Minor

**n1. `abort()` leaves `done` pending forever.**
- **Reproduced (D).** Abort while waiting for `online`: no request goes out after `online`, which is right. But `settled: false` 3 s later and never after: tus-js-client suppresses errors once aborted.
- **Failure scenario.** CS-D1 awaits `done` in a cancel flow and hangs.
- **Fix.** `abort` rejects `done` with an "aborted" error, or resolves it to a defined value, and removes the `online` listener.

**n2. A 4xx on resume silently starts the file again under "Resumed, N%".**
- **Reproduced (F).** Upload expired while cut: `HEAD:->410 | POST:->201 | PATCH:0>204`. The words go from "30%" to "Resumed, 0…100%". The rail's "This upload expired … Start it again." is never shown.
- **Same path elsewhere.** A lost answer to a refused finish (staging removed, HEAD 404) re-sends the whole file before it shows the refusal again.
- **Fix.** Keep the restart, but when `onUploadUrlAvailable` fires with a new URL after a resume, go back to `uploading` (plain "N%"), not `resumed`.

**n3. "Upload paused: reconnecting" is shown for server errors (5xx, 409, 423) while the connection is fine.**
- **Failure scenario.** The rail-off 503 shows "reconnecting" for about 19 s and then its words.
- **Fix.** Tell `paused` only for status 0 (no answer). Keep a server error on the plain "N%" while it retries.

**n4. The suite does not prove the cut hits an in-flight PATCH.**
- **It does in practice.** My probe (B) logged `FAILED PATCH:1572864 (net::ERR_INTERNET_DISCONNECTED)` at the cut: Chromium's offline emulation fails throttled requests that are in flight. With 1 MB/s throttling and 256 KB chunks it nearly always lands mid-PATCH.
- **But nothing asserts it.** The suite only checks HEAD, then a PATCH at an offset above 0, and that check also passes if the cut falls between chunks.
- **Fix.** Record `requestfailed` and assert that a PATCH failed at the cut.

**n5. The gate entry has two "Reconsider when" lines that say different things.**
- **Where.** One is inside the "Installed in part 2" bullet, one at the entry level.
- **Fix.** Merge them into one.

## Judged as fine
- **Choice 1:** retry by status even offline. Correct against `defaultOnShouldRetry`'s `isOnline()`. There is no double start: `onError` runs only once tus has stopped retrying, and the listener is `once` and checks `stopped`. The flaw is M1.
- **Choice 2:** `storeFingerprintForResuming: false`. A reload starts the file again, and the staging copy is swept after 24 h by part 1. Acceptable.
- **Choice 3:** a test page served from the same origin, bundled by esbuild from the real lib with the `browser` field. A sound stand-in until CS-D1.
- **Choice 4:** plain "N%". Fine. Failure words need M2's fix.
- **`onProgress` before the first PATCH:** "0%", and after a HEAD "Resumed, N%" at the server's offset. Correct.
- **409 on a PATCH at a wrong offset:** retried through HEAD. Correct.
- **Each suite test fails without its code.** DW8d is a pure word check. If the paused words or the online wait were removed, the suite would time out into its catch and count a fail. DW8c fails if 4xx were retried (it checks `patches === 1`). "Never from 0" counts finished PATCHes at offset 0.
- **Lockfile:** checked entry by entry against the base.
  - **New packages:** exactly 15, all from `registry.npmjs.org` with integrity, and the installed versions match.
  - **Changed entries:** 4 lose `devOptional` (`graceful-fs`, `proper-lockfile`, `proper-lockfile/node_modules/signal-exit`, `retry`).
  - **Registry facts:** licence fields agree; `combine-errors` `License.md` says MIT. The registry confirms 56 releases, 4.3.1 on 16 Jan 2025, and pre2/pre3 in the last 365 days.
  - **Not checked:** GitHub's advisory database and the Scorecard were not reachable here; they are the Lead's.

**Verdict: Block.** Fix before Approve: B1, M1, M2, M3, each with the named tests. The Minors are the builder's call.
