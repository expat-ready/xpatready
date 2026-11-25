# PF-F2 part 1 (R1.64, the tus upload rail; API only): review

**Reviewed head (round 1):** `ec7565e04b41ea79f0803bcd6fd85df3ef329b96` on `claude/quirky-mayer-g0iinz` (draft PR #3277), `git diff origin/main...HEAD` only: 10 code files, the gate page, the module card row. Reviewer did not build it. **Verdict: Rework (Block).**
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

**Round 1 result (ec7565e): Block.** To fix: B1, M1, M2, M3, M4 (and m7's body line).
## Round 2: head `dc3301c778341d9504c14ecffa2ddd9fca38cef6`

**Scope:** `git diff ec7565e..dc3301c` only. **Run:** `check_pff2_uploads.ts` gives **40 passed, 0 failed**. I re-ran my round-1 attacks in a git-ignored scratch copy of the harness (since deleted).
**Attack results:** a 20 MB last chunk plus 40 racing empty PATCHes gave only `204`/`409`: one row, one `onComplete`, one file id, and the only error text is tus's "Upload-Offset conflict". `?/../<id>`, `%3F/<id>` and `/?x=/<id>` all answer 404. Another firm's HEAD on a finished upload answers 404. CI on dc3301c: `module-cards` passes; `pr-rules` is still red (m7, below).

**Round-1 findings:**
- **B1: closed.** tus now gets only the id the rail checked (`getFileIdFromRequest` from the AsyncLocalStorage), so the URL can no longer choose the id. Any `?` answers 404. DW4 has the two query forms. Either guard alone holds, so the test fails only if both are removed: acceptable defence in depth.
- **M1: closed. Departure 1 is now accepted.** The rail answers 503 in words when `PLATFORM_FILES=s3`. That is the deployment's own value, enforced by `service-checks.ts:368`, so the rail fails closed on the two-task stack. The gate page is corrected and `@tus/s3-store` is no longer installed (m6 closed). The test checks both the 503 and the feature's switch.
- **M2: closed.** Finish now runs once per upload: an in-process promise per id, then the existing `plat_file` by firm and key, then a re-read on P2002. `onResponseError` keeps tus's and the rail's refusals, maps `FileKeyTaken` to 409, gives PF-15's `HttpException` its status and detail (409, plan words), and answers anything else 500 in plain words with the cause logged. Tests cover a retry, a burst and a throwing `onComplete`.
- **M3 (and the breaker's F2): closed.** A finished upload's record stays until the 24 h cleanup, so HEAD reads offset = size and a retry gets the same `Upload-File-Id`. Creation-with-upload answers 201 with Location and `Upload-File-Id`. GET of a finished upload is still 404.
- **M4: closed.** `features/MODULE.rows/PF-F2.md`; `module-cards` is green.
- **m1: closed.** The insert uses `SCAN_PENDING` and matches only the trigger's words, so the test now fails without the rule.
- **Still open, listed in the PR:** m3, m4/F4, m5, F5. Accepted as Minors.
- **m7 is still open.** The PR body still has no `STANDARDS §1:` line, and pr-rules is red at 17:56:57Z. It must be green before the merge; it is not a code finding.

**New Minors (no Blocker or Major):**
- **n1. Wrong words for a finished upload after 24 h.** A HEAD or PATCH 24 h after creation answers 410 "it was not finished within 24 hours", even though the file was stored. **Fix:** for an upload at offset = size, say it was finished, or answer 404.
- **n2. Every empty PATCH at the end re-reads and re-checks the whole staged file** (up to 25 MB) before `#stored` finds the row. Only the uploader can do this, but it multiplies the cost of each request. **Fix:** check `#stored` (or a marker such as `xr_file` in the record) before reading the bytes.
- **n3. One stale sentence on the gate page.** "Data" still says the staging copy is removed after `FilesPort.put`; it now stays until the cleanup. Finished, unscanned bytes now sit in staging for 24 h. They are never served (GET 404), and their cost belongs to F5.

Reviewer: Approve dc3301c778341d9504c14ecffa2ddd9fca38cef6

**Verdict: Approve** (head `dc3301c778341d9504c14ecffa2ddd9fca38cef6`). No open Blocker or Major. Before the label: m7's body line, so `pr-rules` is green. The Minors (m3, m4, m5, F5, n1-n3) go in the PR's list.

## Round 3 (Lead 23: merge, types, re-stamp, size): head `eee137d1c6931c265dc6294705ec6e04d8fb5130`

**Scope:** `554f3123..eee137d1` only, covering Lead 23's four steps. I did not re-review code that earlier rounds approved, because the merge touched none of it.
**Runs on this head:**
- `check_pff2_uploads.ts`: **40 passed, 0 failed**. DW9 names `20261124032000_fo3c2_require_agreement` as the newest migration before this one.
- `run-suites.sh --only "check_pf8b_f4_migrations.ts check_pf12_walls.ts"`: 9/9 and 110/110.
- `typecheck.mjs` after `prisma generate`: **PASS, no new type errors (15 known, 0 fixed)**. api exited 2 on the 15 known errors, web exited 0.
- The size gate run locally (`pr-size.sh 941 0 no` with the live body): "recorded exception P-776", exit 0.
- `npm audit --omit=dev` on main's lockfile and on this branch's: 17 findings each (9 high, 8 moderate), none in a `@tus` package.

1. **Merge `9139f406` (parents `554f3123` and `a79e246c`): no conflict in the PR's own files.** `git diff 554f3123 9139f406` over the PR's file list (both migration paths) is empty. Since the last Approve, only three PR files changed, all in `d7d4a606` and `eee137d1`: the card row, the migration and the suite. Main's schema changes (`platform.prisma` back-relations, signing, register) do not touch `plat_file`, which has no foreign key, and `prisma migrate diff` is still empty (DW9).
2. **Types `d7d4a606`: correct.** The suite now has `app = nest` and `app` is typed `{ close(): Promise<void> } | null`, so `finally` keeps the type. Nothing used the removed `get<T>`, because typecheck passes.
3. **Re-stamp `eee137d1`: a pure rename.**
   - `git show -M` shows 95 % similarity. The only changes are a two-line "Stamp:" header and the folder name in the rollback comment. The DDL is byte-for-byte unchanged.
   - The card row `platform/MODULE.rows/PF-F2.md` and the suite's `NEW` follow the new name.
   - `git grep 20261124040000` finds only the history line in the migration's header (line 8).
   - Main's latest migration (fetched at `4ad7f0e2d`) is `20261124032000`. No other folder starts with `20261124060000`.
   - The stamps of the open migration PRs are 3276 → 050000, 3033 → 033000, 3174 → 070000, 3234 → 080000, 3235 → 085000, 3219 → 090000, 3418 → 100000 and 3411 → 120000, so 060000 is unique and after #3276.
4. **Size exception P-776: the body meets it except for one condition, which the PR discloses.**
   - The body has the line "Size exception: P-776" and states the split.
   - GitHub's count, which leaves out `product/screens` and `product/qa`, is 941 = code, tests, migration and records 772 + `package-lock.json` 169. That is under 800 without the lockfile.
   - The lockfile diff only adds lines (169 additions, 0 deletions), so nothing already on main is touched.
   - P-776's "`npm ci` and `npm audit` step in CI on that package" is only half met. CI runs `npm ci --no-audit` for the studio package (`cloud-setup.sh:29`), and the only `npm audit` in CI is in `deploy-synth.yml`, on the CDK package. The local before-and-after audit (which I reproduced) stands in for it, and the PR puts that to the Lead as a Question. This is the Lead's call (see r2).

**Findings (no Blocker, no Major):**
- **r1 (Minor). The size split in the body is two lines stale.** The body says 939 = 770 + 169, but the count on this head is 941 = 772 + 169: the re-stamp's two-line header was added after the count was taken. *Failure scenario:* a Lead checks the split against the gate's log, sees 941, and has to work out why it differs. The gate still passes, because the line names a valid size row. *Fix:* update the body to 941 = 772 + 169.
- **r2 (Minor, for the Lead). The audit-in-CI condition of P-776 is met locally, not in CI.** *Failure scenario:* a later lockfile change on the studio package brings a vulnerable transitive package, and no CI step notices, because the condition was met once by hand. *Fix:* the Lead decides on the PR's Question before the label. The PR's own recommendation (accept the local run; add a pipeline row for `npm audit --omit=dev --audit-level=high` on the studio package, ratcheted against main's 17) satisfies it. This is not a code fix in this PR.
- **r3 (Minor). The PR depends on merge order with #3276.** *Failure scenario:* if this PR merges before #3276, #3276's `20261124050000` lands earlier than a migration already on main. Its own "later than every one before it" test fails, and it needs another re-stamp. *Fix:* keep #3276 ahead in the queue, as the body states. Otherwise #3276 re-stamps after 060000.
- The lane note in the body is accurate and complete: a local database that applied the old stamp fails `migrate deploy` until it is rolled back and both `_prisma_migrations` rows are deleted. Main and the deployment never had the old stamp.

**Journey score:** not scored this round. Part 1 is API only, with no screen. The scripted API journeys DW0-DW9 are the evidence (40/40), and the browser journey is part 2's DW8 (#3303).
**Not checked:** CI on `eee137d1` itself (I read the PR, not its check runs). I did not walk the old-stamp lane recovery on a real dirty database.

Reviewer: Approve eee137d1c6931c265dc6294705ec6e04d8fb5130

**Verdict: Approve** (head `eee137d1c6931c265dc6294705ec6e04d8fb5130`). No open Blocker or Major. Before the label: the Lead answers r2's Question, and `pr-rules` turns green with the size line.

## Round 4 (Lead 24: rule line, merge of main)

Head reviewed: `7bb39be681ee540aa0f60739250539d50e47acb7`. The review was fresh and diff-only, covering just the two things Lead 24 asked for, measured from the last Approve on `de8976408cef25f0aa779681a1505d32678decc6`. I did not re-review code that earlier rounds approved.

**1. Merge of main (`b9795dade`).**
- The merge's parents are `de897640` and main's `bc91087d7`, which is `origin/main` at review time, so main is fully included. `git diff-tree --cc b9795dade` is empty: no hand-resolved conflicts.
- `git diff de897640..HEAD -- $(git diff --name-only origin/main...HEAD)` shows one change in the PR's 14 files: the single added line in item 2. The merge brought nothing else into the PR's own files.
- Migrations: `20261124060000_pff2_plat_file` sorts last. It comes after main's `20261124033000_fo7t1_evidence_key` (#3033) and `20261124050000_pf10a_import_tables` (#3276), and its stamp is unique (one match). DW9 confirms it: "newest before: 20261124050000_pf10a_import_tables". r3's merge-order risk is now gone, because #3276 is on main.
- `prisma migrate diff` from the fully migrated database to the schema, with main's new schema files in place, is empty (DW9 pass).

**2. Rule line in `prisma/schema/platform-files.prisma`.**
- The first line is now `// platform-files.prisma — the record of each finished upload (plat_file), written by the upload rail. Owner: Lead B (platform).` It matches `check_prisma_schema.ts:54`, `^// platform-files\.prisma — .+ Owner: .+\.\n`: right file name, an em dash, ` Owner: `, and the line ends in a full stop and a newline. Check F passes with 37 area files.
- The owner fits. `api/src/platform/MODULE.md` makes the owner area the platform module rows PF-* and names no lead ("Unconfirmed: no lane map in code"). Every sibling `platform-*.prisma` file says `Owner: Lead B (platform…)`, so this line follows the same pattern.

**Run:** `run-suites.sh --only "check_prisma_schema.ts check_pff2_uploads.ts"` on commit `7bb39be68`: check_prisma_schema.ts 8 passed, 0 failed; check_pff2_uploads.ts 40 passed, 0 failed. Postgres 18 on :54329, builder ports +14000, never :4400.

**Findings:** none. No Blocker, no Major, no new Minor. Earlier r1 (body size split) and r2 (P-776 audit in CI, the Lead's call) are not re-reviewed this round. r3 is closed by the merge.

**Journey score:** not scored this round, as in round 3. The change is API and schema only, with no screen.
**Not checked:** CI check runs on `7bb39be6` (only the local run above), and full run 45344518667 itself. I reproduced only its shard-4 cause (check F).

Reviewer: Approve 7bb39be681ee540aa0f60739250539d50e47acb7

**Verdict: Approve** (head `7bb39be681ee540aa0f60739250539d50e47acb7`). No open Blocker or Major.

## Round 5 (diff-only, a2acd4caa), 25 Nov 2026

Head reviewed: `a2acd4caa55d547f859059aa9a785af00e9aae9e` on `claude/quirky-mayer-g0iinz` (PR #3277), after `git fetch origin`. Local and `origin` both point at this head. This round reads only `git diff 7f59eb08 a2acd4caa`, measured from the last Approve on `7f59eb0884a435b8c1b6875e398fda2f6017b117`. It covers two commits. I did not re-review code that earlier rounds approved.

**1. Merge of main (`0f599be1c`).**
- The merge's parents are `7f59eb08` and `63f5cc913`, and `63f5cc913` is `origin/main` at review time, so main is fully included.
- `git show --remerge-diff 0f599be1c` and `git diff-tree --cc 0f599be1c` are both empty. Nobody resolved a conflict by hand.
- The PR's own content did not change. Its delta against main before the merge (`245e2ce8e..7f59eb08`) and after it (`63f5cc913..0f599be1c`) is the same patch, once index and hunk lines are ignored: 14 files, +1183, insertions only.
- Main and the PR overlap in two files, `package.json` and `package-lock.json`. Main added `pdfjs-dist` 6.5.438 and the `@napi-rs/canvas` packages; the PR added `@tus/server` 2.4.7 and `@tus/file-store` 2.1.2. The two edits auto-merged cleanly. I checked the lockfile: every package.json entry, both dependency kinds, matches the lock's root entry and has its own `node_modules/` entry at that version.
- Main's new migrations do not touch the rail:
  - `fo9b_review` grants and then revokes CREATE on public for `xr_wall_reader`.
  - `pf21d_switch` adds the switch tables, with no grant for `xr_data`.
  - `pf21d_erasure` adds columns and a trigger to `plat_data_request`.
  - `aud3_audit_log_keys` adds permission rows on PF-12's wall.
  - `fo6_signing_session` has no grant and no `plat_` reference.
  - None of them names `plat_file`, `plat_file_write` or `PlatFileScanState`, or changes `xr_data`'s rights on `plat_file`.
- Main's other changes also miss the rail. It changed no file under `platform/files/` and nothing in FilesPort. Its new feature files (`case-keep-period`, `client-money-reversals`, `front-office-merge`, `platform-erasure`) leave `platform-files.ts` alone, and `check_features_registry` is green with them.
- PF-21d's eraser runs on modules that register an eraser. It has no list of tables, so `plat_file` creates no gap that this PR has to close.

**2. Re-stamp (`a2acd4caa`).** The folder moves from `20261124060000_pff2_plat_file` to `20261125120000_pff2_plat_file` and git sees it as a rename (similarity 93 %). The SQL is unchanged: the only lines that differ are the `-- Stamp:` header comment (two lines) and the folder name in the `-- Rollback` comment. The test constant `NEW` in `check_pff2_uploads.ts:26` and the `Tables:` line in `platform/MODULE.rows/PF-F2.md` both name the new folder. At head, the old stamp appears only in the header's own "re-stamped from" note and in earlier records (this file, the break report).
- On ordering, main's newest migration is `20261124170000_aud3_audit_log_keys`, so the new stamp sorts after every migration on `origin/main`. DW9 also asserts that it sorts last and is unique.
- On uniqueness, I listed the migration folders of every remote branch, including the mergify queue. Three folders on other branches are stamped 20261125: `20261125050000_shared__pf11_firm_export` (runtime-pf11-export), `20261125090000_pf22a_custom_fields` (nice-turing-ue036e) and `20261125113000_aud1c_audit_chain` (runtime-aud1c-chain). Only this branch and the stacked #3640 branch (`runtime-pff2-head-finish`) contain `20261125120000_pff2_plat_file`. In #3640 the migration folder is identical to this head's.

**Run:** on `a2acd4caa` I ran `run-suites.sh --only "check_prisma_schema.ts check_pff2_uploads.ts check_pf8b_f4_migrations.ts check_pf12_walls.ts check_pf21b_holds.ts check_pf3_platform_schema.ts check_features_registry.ts"`, exit 0. The suites passed with 8, 40 (including DW9), 9/9, 110, 67, 75 and 27, the same counts as the builder's. Postgres 18 was on :54329, never :4400. The run left the working tree clean.

**Findings:** none. No Blocker, no Major, no new Minor. One note for whoever lands later: the three open branches named above have stamps earlier than this one. If this PR merges first, each of them needs a re-stamp past `20261125120000` under P-600. That work belongs to them, not to this PR.

**Journey score:** not scored this round, as in rounds 3 and 4. The change is API and schema only, with no screen.
**Not checked:** I did not look at CI check runs on `a2acd4caa`; the only run is my local one above. The carried Known gap (HEAD after a failed finish) is out of scope here, because stacked PR #3640 fixes it.

Verdict: Approve a2acd4caa55d547f859059aa9a785af00e9aae9e

**Verdict: Approve** (head `a2acd4caa55d547f859059aa9a785af00e9aae9e`). No open Blocker or Major.
