# PF-F2 part 1 (R1.64, the tus upload rail; API only): review

**Reviewed head:** `ec7565e04b41ea79f0803bcd6fd85df3ef329b96` on `claude/quirky-mayer-g0iinz` (draft PR #3277), `git diff origin/main...HEAD` only: 10 code files, the gate page, the module card row. Reviewer did not build it. **Verdict: Rework (Block).**
Uncommitted edits to `rail.ts` by another session appeared in the shared working tree at 17:50, after every run below (17:44, 17:47). They are not reviewed here. The next round reviews whatever head is pushed.

**How checked:** I read the diff and `@tus/server` 2.4.7 (`server.js`, `BaseHandler`, `Post/Patch/Head/Get/OptionsHandler`), `srvx` 0.11.22 `NodeRequestURL`, `@tus/file-store` 2.1.2, `ports/files.ts`, `ports/legal-hold.ts`, `entitlements/storage.ts`, `deploy/cdk/lib/service.ts`, the PF-F2 and PF-F3 rows, and the CI check-runs on the head (REST). I ran `tests/check_pff2_uploads.ts`: **32 passed, 0 failed**. Then I ran the same harness again (Nest on an ephemeral 127.0.0.1 port, never :4400; scratch DB on :54329) with attack steps added in a git-ignored scratch file, since deleted. `graph.mjs --check`: G1 0, G2 0.
**Screen-only parts** (concept fit, keyboard / 1024 px / 200 % walk, D1-D20, BIC scorecard, journey-test UI scoring): not applicable, API-only row. **Journey score:** not applicable, API-only row, so no score. I walked the API journeys through the harness (create, cut, resume, finish, refusal, other firm, expiry, hold). The findings below are what that walk found.

## Blocker

**B1. Another firm can read and write an upload by putting its id in the query string.**
- **Cause:** `rail.ts:242-249` checks the id it takes from the path before `?`. `@tus/server` takes the id from the whole URL, query included. srvx's `req.url` is the full href, and `BaseHandler.getFileIdFromRequest` runs `/([^/]+)\/?$/` on it.
- **Reproduced:** firm B created upload `idB` and sent 1000 bytes. Firm A then sent `HEAD /api/platform/files/uploads/<A's own id>?/../<idB>`. It answered **200** with firm B's offset and full `Upload-Metadata` (B's firm id, staff id, personId, file name).
- **Reproduced:** firm A then sent `PATCH …/<A's own id>?x=/<idB>` with `Upload-Offset: 1000` and its own bytes. It answered **204** with an `Upload-File-Id`. Firm B's `plat_file` went from 0 rows to 1, firm B's FilesPort holds firm A's bytes, and B's door `onComplete` ran. The harness's own PF-12 check then failed (`wallB: 1`).
- **Rail checks bypassed the same way:** expiry (only the decoy id is checked) and the person wall.
- **Fix:** give tus only the id the rail checked (`getFileIdFromRequest: () => <the checked id from the AsyncLocalStorage>`). Also refuse any rail URL with a query string. Add DW4 cases `?x=/<id>` and `?/<id>` on HEAD and PATCH, for another firm and for another person.

## Major

**M1. Departure 1 rests on a false premise. Rejected as stated.**
- **What the code assumes:** the gate page (entry 20-22, "One thing to watch") and `rail.ts:183-184` say staging on `@tus/file-store` with tus's in-process lock is fine for "one API task".
- **What the deploy runs:** `MIN_TASKS = 2` (`deploy/cdk/lib/service.ts:13`). `SERVICE_TASK_CHOICES` is 0 or 2, "production always runs two tasks" (`:77`), and `service-checks.ts` `spreadFindings(min = 2)` enforces it. The load balancer has no stickiness.
- **Failure once CS-D1 registers a door:** the POST lands on task 1 and the next PATCH or HEAD on task 2. The rail's `getUpload` misses, so the answer is 404. tus-js-client then starts a new upload, so roughly every other request fails and files are re-sent.
- **Also broken:** the hourly sweep runs on one task and never sees the other task's disk. Staged bytes are also lost on every deploy (Fargate disk).
- **Fix:** bind `@tus/s3-store` on PF-F1's bucket with a PostgreSQL advisory-lock `Locker` (the gate page sizes it at about 40 lines). Or, with the Lead's recorded OK, make the rail fail closed when the staging store is not shared: `register` or `handle` refuses while `PLATFORM_FILES=s3`, or whenever more than one task can serve it. Either way, correct the gate page and the PR text.

**M2. Finish is neither single-flight nor idempotent, and its errors leak internals.**
- **Cause:** tus releases its lock before `onUploadFinish` (`PatchHandler`). An empty `PATCH` with `Upload-Offset: <size>` therefore re-enters `finish` while the first one runs.
- **Reproduced (20 MB):** the final PATCH plus 40 empty PATCHes gave `204, 409, 500 ×39`. Each re-entry re-read 20 MB, called `FilesPort.put` again, and hit P2002. The 500 bodies are tus's `UNKNOWN_ERROR` plus `error.message`: Prisma's "Invalid `tx.platFile.create()` invocation in /home/user/…/rail.ts:126…", with the source lines.
- **Same path for any error raised in finish:** PF-15's storage limit (`planLimitReached`), `FileKeyTaken`, a door's `onComplete` throw. The status is 500, not theirs, and the raw text goes to the browser. That breaks the project rule in `main.ts` ProblemErrors: "never a database call, a stack or a server path in the browser".
- **Fix:**
  - Add an `onResponseError` that keeps `Refusal`s, maps `HttpException` and `FileKeyTaken` to their status and words, and logs everything else, answering 500 in plain words.
  - Make finish single-flight per upload id: an in-process map of promises, or tus's own locker taken inside `finish`.
  - Make finish idempotent: if `plat_file` for `(firm, key)` exists, return it.

**M3. A finished upload vanishes, so a lost answer or a creation-with-upload leads to a duplicate file.**
- **Cause:** `finish` removes the staging record (`rail.ts:300`).
- **(a) Lost final answer:** the final PATCH answered 204, and a HEAD right after answered **404**. This is the row's own scenario: a dropped connection on the final PATCH. tus-js-client retries with HEAD, gets 404, drops its stored URL and creates a new upload. The whole file is sent again: a second `plat_file` row, a second stored file, a second `onComplete`. That is "a repeated chunk is stored once" broken at file level.
- **(b) creation-with-upload** (advertised in `Tus-Extension`): POST with the whole body answered **404** "The file for this url was not found", with no Location and no `Upload-File-Id`, yet the row and the stored file exist. `PostHandler` calls `store.getUpload` for `Upload-Expires` after the finish removed it.
- **Fix:** keep a finished tombstone (the tus record at offset = size, plus `xr_file` = the plat_file id) until the sweep, 24 h later. HEAD and an empty PATCH then answer offset = size with `Upload-File-Id`, which also covers M2's idempotence. At least, remove staging only after the response is written. Add tests for HEAD after finish and for a one-POST upload.

**M4. CI is red on this head: `module-cards`.** `api/src/features/platform-files.ts` touches module `api-features`, but `features/MODULE.md` is not updated and the body has no `Card unchanged:` line (STANDARDS §7 [M], P-615 (3)). **Fix:** add the card line, or the reason in the body.

## Minor
- **m1. One DW9 test cannot fail.** The test "refuses a new row that does not start SCANNING" (`check_pff2_uploads.ts:716-717`) inserts `CLEAN` with `scanned_at` NULL. With the trigger rule removed, `plat_file_scanned_check` still refuses it, and the regex accepts `violates`. So it does not prove the rule (STANDARDS §7 [M]). **Fix:** insert `CLEAN` with `scanned_at = now()`, and match only `starts SCANNING`.
- **m2. The DW0 GET half cannot fail either.** `GetHandler` serves only `offset === size`, so a half-finished GET is 404 without the rail's rule. The real exposure is the window between the last byte and finish, when the bytes are complete and unchecked, and M3's tombstone would widen it. **Fix:** test GET on a complete, not-yet-finished upload (for example while a slow `onComplete` runs), and correct departure 4's wording.
- **m3. OPTIONS advertises extensions the rail refuses.** `Tus-Extension` lists `termination` and `creation-defer-length`, but the rail answers DELETE with 404 and Upload-Defer-Length with 400. tus-js-client's `abort(true)` would fail on the DELETE. **Fix:** set the store's `extensions` to what the rail serves.
- **m4. A failed finish can leave a stored file with no row.** `FilesPort.put` runs before the transaction (`rail.ts:292-299`). If the transaction or `onComplete` throws and nobody retries, the bytes stay: no `plat_file` row, never scanned by PF-F3, counted against plan storage. `ports/files.ts:51-52` names PF-F2 as the cleanup of such bytes. **Fix:** in the sweep, for an expired staged upload at offset = size, ask holds, then delete its FilesPort key if no row names it. Or make finish's retry path (M3) the recovery.
- **m5. The sweep does not take tus's lock.** If an upload expires during an in-flight PATCH, the sweep can remove it under the write, and the finish then fails (500 today). **Fix:** take `tus.options.locker.newLock(id)` in `sweep`.
- **m6. `@tus/s3-store` 2.1.0 is installed but not bound**, along with `multistream`, its only user: a dependency with no code. **Fix:** add it in the PR that binds it (M1), or keep it with the Lead's explicit OK on the gate page.
- **m7. CI `pr-rules` is red.** The body lacks the `STANDARDS §1: <gap, options, why>` line its guard needs. The "Completes: R1.64" warning is right to leave unanswered: part 1 does not complete R1.64.

## Departures judged
1. Accepted only with M1 fixed. As written (one task), rejected: Major.
2. **Accepted.** PF-F3's row (2) scans every `SCANNING` row, and `plat_file_scan_state_created_at_idx` serves it.
3. **Accepted.** No door is registered, so every POST answers 404 until CS-D1.
4. **Accepted**, with m2 (wording) and m3 (OPTIONS advertisement).
5. **Accepted.** `xr_born` on the rail's clock, tested by DW5. tus's own machine-clock check stays as a backstop.
6. **Accepted.** Same as `plat_legal_hold`. PF-12's wall (forced RLS, policy, `0_pf12_firm_first`) is present.

## What held
- **Path variants:** unknown, upper-case, `%2F`, `//<id>`, `<id>//` and a missing session (401) are refused correctly.
- **Metadata and doors:** `xr_*` metadata from a client gets 400. Another door, or `authorize` returning null, gets 404 with nothing staged.
- **PF-F4:** checked at creation (413/415) and on the bytes, with nothing stored on a refusal.
- **Chunks:** a repeated chunk gets 409.
- **Legal holds:** the cleanup asks `PgLegalHolds.isHeld` inside the firm's transaction (READ COMMITTED, the default; rule 3's shared lock held until the staging copy is gone), and keeps and lists a held upload.
- **Migration:** additive (one enum, one table, nothing dropped; the base's upload tables never existed on main), rollback recorded. The trigger function is owned by `xr_wall_reader` inside PF-8b F4's CREATE grant. Column-level UPDATE covers only the scan columns, and `xr_data` has no DELETE. `prisma migrate diff` is empty.
- **Tests that do fail without their code:** DW3, DW4 (path), DW5, DW6, DW7 and the `xr_*` refusal.

## Not checked
I did not run the deployed two-task stack. I did not run a real tus-js-client (part 2's DW8), so M3's client behaviour is read from tus-js-client 4.x's resume logic, not run. Scorecards are pending (the gate page's own open question).

Reviewer: Block ec7565e04b41ea79f0803bcd6fd85df3ef329b96

**Verdict: Block**. To fix before Approve:
1. B1: give tus only the checked id, refuse query strings, and add tests.
2. M1: shared staging with a shared lock, or a recorded fail-closed rule. Correct the gate page.
3. M2: `onResponseError` in plain words, plus single-flight, idempotent finish.
4. M3: a finished tombstone (or staging removed after the answer), plus tests for HEAD after finish and a one-POST upload.
5. M4: the module card (and m7's body line) so CI is green.
