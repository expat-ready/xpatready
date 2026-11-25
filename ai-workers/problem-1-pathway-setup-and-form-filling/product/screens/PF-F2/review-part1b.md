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
