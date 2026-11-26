# PF-F2 part 1b: review and break (reviewer, 25 Nov)

**PR #3640** (R1.64 PF-F2 part 1b, stacked on #3277). Head reviewed: `5455a704dc5c039c6a4de43a516b3bf9fd709291`. Base: `claude/quirky-mayer-g0iinz` at `a2acd4caa`.
**Diff read:** `git diff a2acd4caa 5455a704d`. It touches `files/uploads/rail.ts` (+15/-1), `tests/check_pff2_uploads.ts` (+17/-1) and `platform/MODULE.rows/PF-F2.md` (+1).
**Scope:** the fix for #3277's Known gap (m4). A HEAD of an upload whose bytes are all in (offset = size) runs `finish()` first. On failure it answers the failure's status; on success it sets `Upload-File-Id`. `#finishOnce` now looks up `plat_file` by key before it reads the bytes again. API only, no screen: screen-review's concept, BIC and width checks are N/A here, and so are D17 and D20.

## Runs on this head
- `tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pff2_uploads.ts` (from `prototype/`, Postgres on 127.0.0.1:54329, an ephemeral port, never :4400): **43 passed, 0 failed**.
- **The new tests fail without the fix:** with `rail.ts` reset to `a2acd4caa`, the 3 part-1b checks fail (`[200,""]`, `[200,null,null,0]`, `[204,…]`) and the rest pass (40/3). Each test fails when its rule is removed.
- **Breaker scratch:** a copy of the suite plus breaks B1-B8. It ran untracked in `studio/tests/`, was deleted afterwards and is not committed. B6 and B7 only log what they found. The other checks: **50 passed, 0 failed** on this head, apart from what B3b shows below.

## What held (breaks tried)
- **B1, other firm or person:** the 404 check (`rail.ts:96-97`) runs before the HEAD finish (`:102`). I set up an upload whose last PATCH answered 500, then healed the door, so any finish would have succeeded. Firm B's staff, another person of firm A, and `?x` all got 404, and no `plat_file` row appeared. The owner's next HEAD finished the upload.
- **B2, expired:** 410 (`:98`) runs before the finish. A complete but unfinished upload past 24 h answers 410, and no row is written.
- **B3, HEAD racing the last PATCH while the door works:** 5 rounds of a 600 kB last chunk against 8 staggered HEADs. Each round gave one row and one `onComplete`, no 500, and every `Upload-File-Id` was the same. `#finishing` dedupes: tus unlocks before `onUploadFinish` (`@tus/server` `PatchHandler.js:77-90`), so a HEAD that sees offset = size shares the PATCH's promise. The early `#stored` covers a finish that already settled.
- **B4, refused kind finished at HEAD:** I wrote the bytes through `rail.store.write` and skipped tus's hook, to simulate a crash between the write and the finish. The first HEAD answers 415 with no body and the staging copy is removed. The second HEAD answers 404 ("Not found"). Nothing is stored. That 404 makes sense: the upload no longer exists.
- **B5 and B5b, simulated crash:** 10 HEADs at once all answer 200 with one file id, giving one row and one `onComplete`. A mix of HEADs and empty PATCHes also gives one row, one `onComplete` and no 500.
- **B8, the header survives tus:** a HEAD answers 200 with `Upload-File-Id` beside tus's `Upload-Offset`, `Upload-Length` and `Cache-Control: no-store`. The `setHeader` before `tus.handle` is merged into tus's response.
- **Part 2's client when HEAD answers 500** (branch `claude/runtime-pff2-client`, `web/src/lib/resumable-upload.ts`, read against tus-js-client 4.3.1, `lib.esm/upload.js:605-660`). It resumes with `uploadUrl` and no `endpoint`, so tus-js-client raises an error and never starts a new upload. `lost(500)` → `tryAgain` → the `RETRY_DELAYS` list, then "The upload could not be finished.", with the URL kept for `retry()`. Once the door works, the HEAD's `lastResponse` carries `Upload-File-Id`, so `onSuccess` finishes without a confirming PATCH. This is correct.

## Findings

**M1 (Major): the check runs outside tus's lock, so a HEAD that races the last chunk still reads "complete" with no file, which is the gap this PR closes.**
- **Where:** `rail.ts:96` and `:102` decide on their own `getUpload`, read outside tus's lock. A HEAD that arrives while the last chunk is still being written sees offset < size and skips the finish. Then `tus.handle` HEAD takes the lock (`HeadHandler.js:12-18`) after the PATCH has released it, which happens before `onUploadFinish`. It reads offset = size and answers 200 "complete" with no `Upload-File-Id`, while the finish is still running or failing.
- **Evidence (B3b):** 8 rounds, each a 2 MB last chunk, the door failing (`P_FAILS`) and 12 staggered HEADs. The PATCH answered 500 every time, and **89 of 96 HEADs answered 200 with `Upload-Offset` = size and no file id**. The MODULE row and the comment at `:99-101` say "never 200 'complete' with no file", and this is the same outcome.
- **When it happens:** for a plain tus client, for example a second tab resuming the same upload by fingerprint (tus-js-client's default) or a client that timed out behind a buffering proxy, the upload is silently lost. Part 2's own client is safe, because it confirms with an empty PATCH when no id comes back.
- **Fix:** decide inside tus's locked read. Do the finish in the datastore's `getUpload` while a HEAD's `tus.handle` runs: put `res` in the `#ctx` store for HEAD only, and keep it out of the rail's own pre-check, so the 404 and 410 checks still run first. Then set the header, or throw `#words(e) ?? e`. Remove the pre-check block.
- **Fix tested:** I tried this sketch here (about 5 lines) and reverted it. **B3b gave 0 leaks** (every HEAD 500, or 200 at a partial offset), all 50 checks passed (the builder's 3 part-1b checks included), and B6 was fixed too. Add B3b, or a deterministic version of it, as a test that fails without the fix.

**m1 (Minor): a repeat finish returns the client's raw name.** `rail.ts:168` returns `meta.filename` from the early `#stored`, where the first finish returned `checked.name`. In B7 (a PNG declared as `../../scan.pdf`), the first finish gave `"scan.png"` and the repeat gave `"../../scan.pdf"`. Nothing reads `.name` on the already-stored path today: `onUploadFinish` and the HEAD use `.id` only, and `onComplete` does not run again. But `UploadedFile.name` now holds the cleaned name or the raw client name depending on timing. **Fix:** rebuild it with `correctedName(meta.filename, <kind of r.mediaType>)` (`file-type.ts:193`), or leave `name` out of the repeat result.

**n1 (Nit): a HEAD without `Tus-Resumable` runs the finish, then answers 412 with `Upload-File-Id`.** This is B6: the pre-check runs before tus validates the headers. M1's fix removes it, because tus checks the headers before the HEAD handler runs.

**n2 (Note, for part 2 #3303, not this diff): a HEAD refusal carries no words, and part 2 treats the rail's 409s as conflicts to retry.**
- HEAD responses have no body. So a 413 or 415 that first surfaces at a HEAD (only after a crash) shows part 2's generic "The upload could not be finished." instead of PF-F4's words.
- Part 2's `tryAgain` retries any 409 that is not JSON. Its comment says "our refusals are problem+json", but the rail answers in text/plain, on HEAD and on PATCH. So `FileKeyTaken` and PF-15's plan-limit 409 are retried as tus offset conflicts before the generic words appear.
- I am raising it here because the HEAD now surfaces finish failures. It belongs on part 2.

**Note: tus-js-client with its defaults** (`endpoint` set) starts a new upload when a HEAD answers 5xx (`upload.js:627-635`). Each new upload stages another full copy until the default retries run out. The sweep removes these copies after 24 h. This is the protocol's own behaviour, and it is far better than a false "complete".

## Standards (code, §5 of the check)
- **Server authorisation:** unchanged and in front of the new path (B1).
- **Duplicates under race:** held for the door's side effects (B3, B5, B5b), but not for the answer's truth (M1).
- **No migration.**
- **Plain words:** no internals in any answer (the F3 check still passes).
- **The card row** states the rule. It is correct apart from M1's "never".

## Journey score (reviewer; API only)
Full report: `screens/PF-F2/journey-test-reviewer-2026-11-25-part1b.md`. **6.5 of 8 applicable criteria = 8.1/10 scaled.** Accessibility and visual quality are N/A: there is no screen, and part 2's DW8 owns the browser. No criterion is at 0. It passes the bar, but M1 is open.

## Could not check
- CI on `5455a704d`. I read no check runs.
- tus-js-client against the live rail in a browser (part 2's DW8). Part 2's handling of HEAD 500 was checked by reading the code, not by running it.
- A real buffering proxy, and two processes.

Reviewer: Changes 5455a704dc5c039c6a4de43a516b3bf9fd709291

**To fix:**
1. M1, with a test that fails without the fix.
2. Optional: m1 and n1.
3. Raise n2 on #3303.

Verdict: Changes 5455a704dc5c039c6a4de43a516b3bf9fd709291

## Round 2 (c04861ed)

**Head reviewed:** `c04861ed9d21301cbb1eedb2eb81922b06e10557`. Diff only: `git diff 5455a704d c04861ed9`.
- **Code:** `rail.ts` (+27/−18) and `check_pff2_uploads.ts` (+25).
- **Records:** this file and the journey-test report, which the builder committed as I wrote them in round 1, unchanged.

**Runs:**
- **Suite:** `check_pff2_uploads.ts` on this head: **46 passed, 0 failed**.
- **The new checks fail without the fix:** with `rail.ts` reset to `5455a704d`, exactly the 3 new checks fail, and the other 43 pass:
  - the M1 race: `{"leaks":45,"heads":48,"patch500":4}`;
  - the m1 name: `["../../scan.pdf","../../scan.pdf"]`;
  - the n1 412 case.
- **Breaker scratch:** my B1–B8 plus B3b, re-applied to this head's suite. **53 passed, 0 failed.** The scratch was untracked, deleted afterwards and not committed.
  - **B3b:** 0 leaks; every racing HEAD answered 500 (or 200 at a partial offset).
  - **B6:** 412, no `Upload-File-Id`, no row.
  - **B7:** `"scan.png"` on both the first and the repeat finish.
  - **B1, B2, B4, B5 and B5b:** still hold.
- **Typecheck:** `typecheck.mjs` exits 1 on 8 errors. All of them are in `../p2/*` and `../contracts/portal-capture.ts`: `ajv` and `@anthropic-ai/sdk` are not installed in this worktree (only `studio/node_modules` is symlinked). There are none in `rail.ts` or the suite. This is an environment gap, not a finding.

**M1: closed.**
- **Where the finish now runs:** inside `store.getUpload`, which tus's `HeadHandler` calls under its lock (`HeadHandler.js:12-18`). A PATCH releases the lock before `onUploadFinish`, and its `finish()` registers in `#finishing` at once. So a HEAD that was waiting for the lock either shares that promise or finds the stored row; it can no longer read "complete" before the finish has settled.
- **Who sets `headRes`:** only `handle()`, only for HEAD with an id and `Tus-Resumable`, and only around `tus.handle`. The rail's own pre-check read carries no `headRes`, so the 404 (`:110`) and 410 (`:111`) checks still run before any finish (B1, B2).
- **A wrong `Tus-Resumable` value:** tus answers 400 in its header check (`HeaderValidator.js:69`) before the handler runs, so nothing is finished.
- **Failures:** they throw `#words(e) ?? e`. Because the error carries a status, tus's `onError` answers with it: 500 for the door, 415 for refused bytes (B4), with no body on HEAD.

**m1: closed.**
- **What changed:** `#stored` now builds the name with `correctedName(clientName, kind)`, where the kind is looked up in `KINDS` by the stored media type, for all three callers.
- **Why it matches the first finish:** `checkFile` sets its `name` with the same `correctedName(file.name, i.kind)` (`file-type.ts:240`), and the media types in `KINDS` are unique. The fallback `clientName ?? "document"` is reached only for a media type outside `KINDS`, which the database row cannot have from this rail.

**n1: closed.** A HEAD without `Tus-Resumable` is tus's 412 and finishes nothing. The test proves this; the next proper HEAD then finishes the upload.

**New finding:**
- **r2-n1 (Note, no action):** the HEAD's finish now holds tus's per-upload lock while it runs. A PATCH or HEAD for the same upload arriving meanwhile asks for the lock: `MemoryLocker` calls the HEAD's `context.cancel()` (a delayed abort that the HEAD handler never checks) and waits. A finish longer than tus's 30 s lock timeout would turn the waiter into tus's lock-timeout 500, which part 2 retries. Finishes take milliseconds here, and only the uploader can reach this.

**Still open from round 1:** n2 belongs to part 2 (#3303). The tus-js-client note stands as written.

**Journey score, round 2:** J7 now holds (B3b: 0 of 96 leaks).
- "Feedback and state" goes from ½ to 1, and "error recovery" goes from ½ to 1.
- "Next step obvious" stays ½ (n2, part 2).
- Total: **7.5 of 8 applicable = 9.4/10 (scaled)**, with no criterion at 0. Accessibility and visual quality remain N/A.

**Could not check:** CI on `c04861ed9`. The browser walk stays with part 2's DW8.

Reviewer: Approve c04861ed9d21301cbb1eedb2eb81922b06e10557

Verdict: Approve c04861ed9d21301cbb1eedb2eb81922b06e10557

## Round 3 (diff-only, the main merge a54244d0)

**Scope (Lead allowed round 3, 26 Nov, P-277):** only the merge `a54244d03fd8d36a5e2ef3c8fab70565fdbdcaa6`. Its parents are `38ddab45` (part 1c) and `4c21eb97` (main after #3277). The code at `38ddab45` was approved by #3698's round-2 reviewer and breaker: `CS-D1u/review.md` on `claude/runtime-csd1u-staff-door`, "#3640, commit 38ddab45 … Approve", and the PR comment of 25 Nov 09:32 UTC. Until now this file's last verdict was on `c04861ed`; this round records the link. Reviewer: a fresh session that did not build it.

**No hand resolution:**
- `git show --remerge-diff a54244d03` and `git diff-tree --cc a54244d03` both print only the commit id: there are no conflict hunks and no edited lines.
- `a54244d03` merges cleanly with today's `origin/main` (`354161db`, 81 commits later): `git merge-tree` reports no conflict.

**The PR's diff is unchanged by the merge:**
- I compared `git diff e94227bf 38ddab45` (the merge base before) with `git diff 4c21eb97 a54244d03`. The studio part is byte-identical (287 lines each, `index` lines included), and so is the whole diff.
- It covers six files: `rail.ts`, `doors.ts`, `check_pff2_uploads.ts`, `platform/MODULE.rows/PF-F2.md`, `review-part1b.md` and `journey-test-reviewer-2026-11-25-part1b.md`.
- `rail.ts`, `doors.ts` and the suite are also identical to #3698's head `0338bd41`, so the approved read still applies.

**Nothing main brought conflicts with the rail's behaviour.** I checked `e94227bf..4c21eb97`, 156 studio files:
- **The rail's dependencies:** no change to `platform/files/**` (this includes `file-type.ts` and `uploads/routes.ts`), `ports/files.ts`, `ports/jobs.ts`, `ports/legal-hold.ts`, `firm-scope.ts`, `identity/keys.ts`, `observability/log.ts`, `features/platform-files.ts`, `platform/jobs/**` or `package.json`. The same holds from `4c21eb97` to today's main.
- **Doors and FilesPort:** nothing new imports `files/uploads` or calls `UploadDoors.register`. The one new FilesPort mention is a schema comment (filed messages keep FilesPort keys).
- **Jobs:** one new job, `front-office-auto-merge.ts`, is registered on `PlatformJobs`. It has its own queue, and `platform.files.upload_cleanup` is still defined only in `rail.ts:43`.
- **HEAD:** the new HEAD refusals are route-local, in `audit/access/search.ts:91` (`SEARCH_HEAD_REFUSED`) and `@Head("cases/:id/prepare")`. There is no global middleware, so tus HEAD on `/api/platform/files/uploads` is untouched.
- **Validation:** `http/input.ts` only adds `plainIssue`. `case-checklist.ts` adds one line, and the case doors' `checkedCaseFile` (CS-D1t) is off the rail.
- **Erasure:** PF-21d's erasure-mark changes do not touch `plat_file` or `plat_upload`.

**Runs at a54244d03** (Postgres 127.0.0.1:54329; never :4400):

| Run | Result |
|---|---|
| `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pff2_uploads.ts` | **52 passed, 0 failed**, exit 0 |
| `module-cards.py tree` (run from the repo root; from the product folder it cannot find `./.claude/rules/modules`) | PASS, 15 cards, exit 0 |
| `typecheck.mjs` (8 GB heap; plain `tsc` ran out of memory) | exit 1 on 12 errors, none in `files/uploads/**` or the suite. 8 are round 2's missing `ajv`/`@anthropic-ai/sdk`. 4 are in `client-money/invoices/*`: the symlinked `node_modules` holds a Prisma client generated before main's `sourceFeeRowId`/`deposit` fields. This is an environment gap, not a finding. |

**Findings:** none new; r2-n1 still stands as a Note.
- **r3-n1 (Note, records):** the Approve on `38ddab45` was written only in #3698's records. If #3698 merges after this PR, `main` briefly lacks the round that read part 1c. This section now names it, so no action is needed.

**Journey score:** 9.4/10 (scaled), carried, because no behaviour changed. The suite (DW0 to DW9) passes 52/52 at this head. See the round 3 note in `journey-test-reviewer-2026-11-25-part1b.md`.

**Could not check:** CI on `a54244d0` (GraphQL is closed to this session); the graph tool (diff-only round, no screen); the browser walk (part 2's DW8).

Reviewer: Approve a54244d03fd8d36a5e2ef3c8fab70565fdbdcaa6

Verdict: Approve a54244d03fd8d36a5e2ef3c8fab70565fdbdcaa6
