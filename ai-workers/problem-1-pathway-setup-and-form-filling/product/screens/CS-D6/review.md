# CS-D6 part 1 (R1.69): review — "File details…", fingerprint, "Check the file is unchanged", "Read by"

PR #3203, head `bb13effa0c89df612b53dd8f5f81a46e4e0ec90a` (branch `claude/trusting-keller-t74sqh`), diff `origin/main..bb13effa0` (11 files, +467). Concept = brief `design/briefs/CS-D6.md` part 1 + BACKLOG row CS-D6 (there is no `screens/CS-D6/concept.md`). Reviewer: Opus, fresh context, US$0, live AI off, ports 4498 (`rv_csd6`) and 4492 (`rv_j69`) only.

**Round 1 verdict: Ship after fixes.** `Reviewer: Changes bb13effa0c89df612b53dd8f5f81a46e4e0ec90a`. (Round 2 at the end: **Ship**.) Three Majors, all small. Journey score **8.5/10** (pass), report `journey-test-reviewer-2026-11-23.md`.

## What I ran
* `check_csd6_reads_keep.ts` on rv_csd6:4498: **18/18**. The "previewed" case is skipped because #3188 is not merged (the test prints a NOTE).
* `j_69.ts` on rv_j69:4492: **16/16, twice** (35 s cold, 9 s warm).
* `check_case_feed.ts` (the brief's "Done when" says it passes unchanged): **41/42, FAIL** at this head (M2).
* CI check-runs on the head: **`module-cards` failure** (M3). `ci` was skipped (it runs before the label/queue).
* My own walk: a Playwright script in the scratchpad that uploads, then works the dialog by keyboard. It covered the officer at 1024 px, the Owner at 1440 px, 200 % zoom (720 css px), 400 px, check errors (network down and 404), 55 openings paged, and axe on each state.
* Probes with curl: forged `x-actor`, mixed headers, cursors, ids, and the AG-9-53 case scope. For the scope probe I removed `view.all` from CASE_MANAGER **in my isolated DB only**, then restored it.

## The four deliberate deviations, judged
1. **"read by AI / by rules" line deferred:** acceptable. Lead 1 ruled on the PR (23 Nov) to ship without it, add it with DW1 in a follow-up after #3188, and carry no `Completes:`. R1.69 stays open until then.
2. **`api/src/case-document-reads.ts` instead of `api/src/documents/reads.ts`:** acceptable. There is no `api/src/documents/` on main, and #3188 puts its siblings (`case-documents-preview.ts`) at the same level.
3. **No `(entity, entity_key, at)` index:** acceptable for now. STANDARDS §9 leaves scale to the team, and AUD-1a owns the table. `EXPLAIN` on my copy shows a seq scan filtered by workspace and key. That costs nothing at Sample size but grows with the whole trail, so it must stay a recorded contract gap (m6).
4. **Firm-scoped reach, not per case:** **not acceptable** (M1). The premise "like the other guarded case routes" is out of date. `api/src/case-access.ts` (CS-S1 part 2, tech lead ruling on #2879) is "the one rule for which cases a staff member may see… later rows import it and nobody re-derives it". `party-search.ts` and `client-money/visibility-adapter.ts` already use it. The brief asks for "the case reached for the staff person, AG-9-53", and its breaker list names "the panel for a document of a case the person cannot see".

## Issues (ranked)
**M1 (Must): AG-9-53, a document on a case the person cannot see is reachable.** In `api/src/case-document-reads.ts:53`, `reach()` filters only by `firmKey`. **Fail scenario (run live on 4498):** I removed `agent/case:view.all` from Case manager, leaving `view.own`. `user-T` is not the file owner and not on the team of C-2026-00001. They then got `POST …/check-unchanged` **200** with `sha256`, which wrote an audit line (4 → 5). With the key, `GET …/reads` also answered **200** with the file name, fingerprint and readers' names. Expected: 404 "No such document." Today every seeded role holds `view.all`, so this is latent, but it is the server-authorisation [M] line (STANDARDS §7). **Fix:** `const s = await caseScope(db, { firmId: ctx.firmId, staffId: ctx.staffId, keys: ctx.keys })` and `where: { id: p.caseId, ...caseScopeWhere(s) }`. Add DW2/DW3 fail cases: a `view.own`-only person off the case gets 404 on both routes and no line is written.

**M2 (Must): the check's audit line names no case. `check_case_feed.ts` fails, and the line gets no `case_id` and never reaches the case's activity.** At `case-document-reads.ts:91-92` the entity is passed as the variable `ENTITY`, and the sweep reports `case-document-reads.ts:91 (entity ENTITY is dynamic…)`. The summary also ends "on case C-2026-00001" (the case number), not `case <first 8 of id>` as the download's "viewed" line does. `caseIdOf` (`core.ts:154`) and `caseOf` (`case-feed.ts:59`) only find the 8-hex marker. **Fail scenario:** on my copy, all 11 "checked unchanged" and "found changed" lines have `case_id` NULL, while all 167 "viewed" lines have it set. `firmMayRead` returns false for them, so a "found changed" integrity flag (AG-9-31) shows only in the Read-by list and never in the case's history. **Fix:** pass the literal `"case document"` and write `… on case ${c.id.slice(0, 8)}` (the case number may stay as extra words after it). Then re-run `check_case_feed.ts` and assert `case_id` in DW3.

**M3 (Must): CI `module-cards` is red on the head.** The log says "module api-features: … `features/case-document-reads.ts` …, card `api/src/features/MODULE.md` not [updated]". The brief's "Done when" says the module-card check passes. **Fix:** add `api/src/features/MODULE.rows/CS-D6.md` (#3188 did the same for CS-D5), or put a `Card unchanged:` reason in the PR body.

**m1 (Should): two rules have no failing test.** If the `(at = cursor.at AND id < cursor.id)` tie-break (`:70`) or the `OR firmId null | own firm` filter (`:69`) is removed, the suite stays green. All 51 lines have distinct `at` values, and no other firm's line exists on the document. Add two lines with an equal `at` straddling the page edge, and one line tagged with the other firm's id. The "missing file" branch (`:88`) is untested too.

**m2 (Should): the cursor truncates `at` to milliseconds** (`:35-41`), while `audit_event.at` is `timestamptz` (µs). Every line Prisma writes is whole-ms (I checked all 628 on my copy), but a writer using the DB default (15 setup rows are µs) would have lines skipped at a page edge. Carry µs, or page by the last id with a server-side lookup.

**m3 (Should): `j_69.ts:103` calls `.focus()` on the ⋯ button before asserting that focus returned there**, so the assertion is tautological. My walk confirms focus does return after Escape.

**m4 (Should): the Copy button** (`document-reads.tsx:29,37`) gives no message when the clipboard is refused, and "Copied" never resets.

**m5 (Should): status in comments ([M] §5).** `case-document-reads.ts:11-12` says "after CS-D5 part 1, #3188, … merges". That is a plan and will go stale; put it in the PR body.

**m6 (Should): record the index gap.** Add contract gap 2, `(entity, entity_key, at)` for AUD-1a, to the PR body; today it is only in a comment. Also fill in "Checks and results: to come".

**m7 (Should): reuse.** `checkUnchanged` re-hashes with its own `readFileSync` (`:87-88`) instead of sharing `case-documents.ts` `bytesOf` (#3188's file). The web also redeclares the response types (`document-reads.tsx:14-16`) rather than using a shared contract ([M] §5 contract first). Fold both into the #3188 follow-up.

## [M] lines (relevant ones)
* **Server authorisation, deny by default: not met** (M1). Keys checked: 403 for officer and manager on the list. A forged `x-actor` without a bearer gets 401, and officer bearer plus Owner `x-actor` gets 403.
* **Cursor pagination: met**, with m1/m2 caveats.
* **RFC 9457 errors: met.** 404 "No such document.", 400 with `fields.before`.
* **Read paths indexed: partly** (deviation 3, m6). No N+1: names come from one query per page.
* **Rule test fails when rule removed: partly** (m1, M1).
* **axe on every state: met.** I ran officer 1024, error, Owner list 1440, plus j_69 changed and list: 0 violations.
* **Module card: not met** (M3).
* **Comments say why: partly** (m5).
* **§9 budgets: met.** Dialog 60-84 ms, check 38-77 ms, list 93 ms.
* **§3.10 every business rule has a pass and a fail: partly** (M1, m1).

## D1-D20 (1-5)
D1 3: AG-9-32/31 met; AG-9-53 per case missing; AI/rules reads deferred by ruling. · D2 3: check lines without `case_id` (M2). · D3 3: re-derives case reach and hashing (M1, m7). · D4 N/A. · D5 4: busy-disabled button; each check is its own event; reload and reopen are fine. · D6 4: who and when on every line, actor names from the staff record. · D7 N/A: no AI in this part. · D8 4: the dialog title names the line and person. · D9 4: ⋯ → File details… → Check; the list refreshes after a check. · D10 4: "Opened the file", "Checked: changed", the fingerprint explained in one line. · D11 4: busy, result, danger notice and alert words. · D12 4: team Button, Notice, Skeleton. · D13 4: keyboard path, focus into the dialog and back, 400/720/1024 px with no sideways scroll. · D14 4: same dialog pattern as History and Providers. · D15 5: numbers above. · D16 3: M2 red suite, m1 gaps, M1 untested. · D17 simulated only. · D18 4: each line says who and when; the fingerprint origin is explained. · D19 3: part 1 of 3; the AI/rules line is a follow-up. · D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 to 10, 12, 15, 16, 17 | N/A | no questions, forms, filing or review on this dialog |
| BIC-11 one primary action | Met | Copy and Check are both outline/secondary; no "Submit" (`r2-owner-1440.png`) |
| BIC-13 errors say what and how | Met | "Could not reach the server. Please try again.", "No such document.", "The stored file is missing. Ask the client to upload it again." |
| BIC-14 tooltips | Met | the only icon button is the dialog's close (labelled; axe 0) |
| BIC-18 states drawn | Partly | Skeleton on load, error Notice, result shown. Empty "Nobody has opened this file yet." does not say what will appear (Should) |
| BIC-19 low load | Met | one heading per section, 2 type sizes, red only for "The file has changed" (`w2-owner-read-by-1440.png`) |
| BIC-20 accessible | Met | keyboard ⋯ → File details… → sign-in → Check; 720 px (200 %) doc 720 = viewport; 400 px fits; axe 0 |

Screenshots: the builder's `screens/J-69/screenshots/w1…w3` (1440 and 390). My 1024 / 1440 / 720 / 400 shots are in the session scratchpad only, because I may write only this file and the journey report.

## Graph (P-86)
`graph.mjs`: both new routes show `testedBy: []`, and `features/case-document-reads.ts` is listed under G6. Both are tool blind spots, not findings. The graph does not read `staffApi` or `${BASE}${path}` calls (main's own `documents/:id/file` is listed the same way). Feature files load dynamically (the routes answer, 18/18). Every element serves this part's capability.

## Could not check
A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder). "previewed" lines (#3188 not merged). The full `ci` run (skipped on this head). Mutation runs (I may not edit code; m1 is reasoned from the code and the data).

## Round 2: head `05a75191ef8e72d808ca3062974cf94af013cb28` (diff `bb13effa0..05a75191e`)
**Re-run by me:** `check_csd6_reads_keep.ts` (rv_csd6:4498) **22/22**; `check_case_feed.ts` **42/42**; `j_69.ts` (rv_j69:4492) **17/17 twice**; my walk again gives axe 0 on officer 1024, error and Owner list 1440, with no sideways scroll at 720/400 px. CI on the head: `module-cards` and `pr-rules` success.

**Round 1 findings:**
* **M1 fixed.** `reach()` ANDs `caseScopeWhere(caseScope(…))` with the firm (`case-document-reads.ts:55-56`). The new DW2 fail case (a `view.own`-only person off the case gets 404 on both routes, no line written) passes; the role rows are restored after the run (checked).
* **M2 fixed.** Literal `"case document"` entity, summary `on case <8 hex>`. Check lines with `case_id` on my copy: 3/3 (round 1: 0/11).
* **M3 fixed.** `api/src/features/MODULE.rows/CS-D6.md`; `module-cards` green.
* **m1 fixed.** The other-firm line test fails without the `firm_id` filter. The 52-lines-in-one-microsecond test (50 + 50 + 3, each line once) fails if the keyset drops `id`. A missing-file case is added.
* **m2 fixed.** The cursor is the last line's id, validated as a line of this list (else 400); the keyset `(at, id) < (select at, id …)` runs in SQL at µs.
* **m3 fixed.** `j_69.ts:103` waits for focus instead of setting it. My walk: focus on Check after the inline sign-in and after a check, on the first new line after the last "Show older", on ⋯ after Escape.
* **m4 fixed.** "Copied" resets after 4 s; a refusal says how to copy by hand.
* **m5 fixed.** The comment is reworded.
* **m6 fixed.** The PR body lists contract gap 1 (the index, AUD-1a's) and the checks and results.
* **m7 accepted as left.** The check must record "found changed" where `bytesOf` answers 409, and the streamed hash avoids holding a large file. The web-side types stay a follow-up with #3188.

**Breaker fixes in this diff** (streamed hash with unreadable = changed, `aria-busy` instead of `disabled`, session-end notice, focus): no Blocker or Major. Two nits, not blocking:
* n1: `document-reads.tsx` `check()` sets busy and clears the error before its `if (busy) return` guard. Harmless; reorder.
* n2: an unreadable file that exists (a directory, no permission) gets the audit words "cannot be read" but the screen words "The stored file is missing." Wording only.

**Journey score, round 2: 9/10** (correct data rises to 1).

`Reviewer: Approve 05a75191ef8e72d808ca3062974cf94af013cb28`

Verdict: Approve

## Round 3: head `6a86d2f90e0963339e0667e8b6eba98b51d6c210` (diff `git show 6a86d2f90` only; `f0bd37b9f` is a merge of main and was not reviewed)
**Re-run by me:** `check-select-suites.sh` **83 passed, 0 failed**. `check_csd6_reads_keep.ts` (rv3_csd6:4498) **23/23**. `j_69.ts` (rv3_j69:4492) **18/18**. At 390 px it measured dialog 16–374, dialog scroll 356 = client 356, fingerprint right edge 349, page scroll 390. The case page's `table.w-full.text-sm` reaches 496 px behind the dialog but does not scroll the page. My runs overwrote the screenshots; I restored them with `git checkout`. The committed `w3-owner-read-by-390.png` shows the fingerprint wrapped inside the dialog and nothing cut off.

**Fix 1: stored file named, not listed. Correct and honest.**
* Cause confirmed. On a throwaway worktree at `f0bd37b9f`, `acceptance/C5.1.test.ts` chooses **40** suites. At `6a86d2f90` it chooses **13**. The only change between the two is that `readdirSync` is gone from the two files that also name `acceptance/lib/…`.
* The new path `workspaces/<STUDIO_WORKSPACE_KEY or "demo">/<path>` resolves the key the same way as `core.ts:27`. The documents are stored under `VAR(WORKSPACE_KEY)` (`case-documents.ts:55`), so the path is the one the server writes to. Neither the isolated runner nor CI sets the key, so both use `demo`. My run found the file at `…/isolated-rv3_csd6/workspaces/demo/people/…/documents/<id>.pdf`.
* A wrong key cannot pass quietly:
  * In the suite, the `setup: the stored file is found` line goes red, and so does the "after the stored bytes are altered" line.
  * If `file2` is not found, it is not deleted, so the check answers unchanged and the "stored file that is gone" line goes red.
  * In J-69, the line `W2 setup: the stored file is found on this copy` goes red.
* No assertion was weakened.

**Fix 2: J-69 W3 at 390 px. Stricter than before, with one gap (m1).**
* The old line was `dialog scrollWidth ≤ clientWidth + 1 && page scrollWidth ≤ 391`. It is now two lines:
  * The dialog line checks that the dialog sits inside the screen (new), that the dialog has no sideways scroll (as before), and that the fingerprint's right edge is inside the dialog. The old wording claimed the fingerprint wraps but never checked it.
  * The page line checks that the page has no sideways scroll (as before).
* Both lines print the widths and the five elements that reach furthest past the screen's right edge, so a CI red names its cause.
* The retry loop does not hide a real fault. It re-measures every 200 ms, for 5 s at most, only until all four checks hold, then asserts the last measurement. A dialog that is too wide stays too wide and fails. Only a mid-resize layout gets waited out, which is the CI race this commit targets.
* The fix may not turn CI green. If the CI red was the page line, caused by the case-page table rather than this dialog, the page line will still fail on CI, now with a message that names the table. The commit message claims only the measuring and the split, so this is honest. If it happens, it is a case-page item, not this row's.

**Findings:**
* **m1 (Minor, not blocking): the 390 px claim is measured against `innerWidth`, but the width itself is never asserted.** The `waitForFunction(() => innerWidth === 390)` swallows its timeout (`.catch(() => undefined)`). The old line had a fixed `≤ 391`; every check is now relative. If the resize ever did not apply, both lines would pass at the old width. `setViewportSize` awaits the resize, so the risk is low. Fix: add `fit.widths.viewport === 390` to the dialog line, or let the wait fail.
* n3 (nit): the rule that resolves the workspace key now exists in four places (`core.ts`, `prospect-won.ts` and these two tests). It would be better as one shared test helper later. No change needed in this PR.

The screenshot changes in this commit come from re-running the journey (times and line order in "Read by"). They show no change to the layout.

**Journey score, round 3: 9/10** (unchanged; this diff changes no screen).

`Reviewer: Approve 6a86d2f90e0963339e0667e8b6eba98b51d6c210`

Verdict: Approve

## Round 4 (conflict files): head `b4bcfcb169f5eef517cbf6b7607666efadbf21ae` (merge of origin/main `09b3893df` into the approved `c24d31d82`)

Scope: only the add/add conflict in `tests/journeys/j_69.ts` and how it was resolved. Main's own changes were not reviewed.

**What I ran**
* `git diff origin/main HEAD -- tests/journeys/j_69.ts`: empty. origin/main is still `09b3893df`, and HEAD contains it.
* `git diff --name-status HEAD^2 HEAD`: against main, this merge adds only this row's files. Nothing under `screens/J-69/` differs from main.
* `git diff c24d31d82:tests/journeys/j_69.ts HEAD:tests/check_csd6_reads_browser.ts`, full paths. Read line by line.
* `run-suites.sh --only "check_csd6_reads_browser.ts check_csd6_reads_keep.ts"`: both **PASS**. The browser suite gave 18/18 in 27 s and the keep suite 23/23 in 22 s. The runner chose copies named `runtime_*` on ports +14000, never :4400.
* `check-select-suites.sh`: **83 passed, 0 failed**.
* `module-cards.py tree`: **PASS** (15 cards, tree checked).
* `select-suites.mjs`, fed `web/src/runtime/document-reads.tsx`: selects `check_csd6_reads_browser.ts`.
* `select-suites.mjs`, fed `api/src/features/case-document-reads.ts`: selects both CS-D6 suites.
* My run rewrote the three PNGs in `screens/CS-D6/screenshots/`, which shows the new path is the one in use. I restored them with `git checkout -- …/product/screens/`, and `git status` is clean.

**Judgement**
* **Keeping qa's `j_69.ts`: right.**
  * Its header says it is qa's journey for the whole capability R1.69 (W1-W6: read lines, Read by, fingerprint, changed file, keep period, weekly reminder). qa wrote it before the last part merges.
  * The builder's part 1 walk proves only part 1. Two files with one name could not both be kept. The capability journey owns the J-69 name and its screenshot folder, so the part walk moving under the row's own name (`check_csd6_*`, `screens/CS-D6/`) is the right split.
  * Taking main's file unchanged means qa's later runs are not disturbed.
* **No assertion lost or weakened.**
  * Both files have 18 `ok(` lines, and the runner reported 18/18.
  * Every predicate, threshold, timeout, selector and retry loop is identical, including round 3's 390 px measuring and the named stored-file lookup.
  * The diff changes only these things:
    * the header;
    * import depth (`../../acceptance` → `../acceptance`);
    * the arguments, now `<port> <database>` (default 4492 / `xr_studio_csd6_browser`);
    * the screenshot folder, now `screens/CS-D6/screenshots/`;
    * the PDF caption;
    * labels, from "J-69 …" to "CS-D6 …".
  * `NAME` now comes from the database name. `isolated.sh` names the database `xr_studio_<name>` and the files `var/isolated-<name>`, so `storedFile()` still resolves. The "W2 setup: the stored file is found" line passed in the runner, with a prefixed copy name.
* **Runner and usage line: standard.**
  * The usage line now has the `isolated.sh <name> <port> start && tsx studio/tests/<file> <port> <db>` form that `run-suites.sh` parses.
  * It drops `--ttl 40`, the `trap … stop` and `--tsconfig`. All three are supplied by the runner, which adds `--tsconfig` in `$TSX` and manages the copy's lifecycle. Same form as the sibling `check_csd6_reads_keep.ts`.
* **Card rows:** both `MODULE.cases.rows/CS-D6.md` and `runtime/MODULE.rows/CS-D6.md` now name `tests/check_csd6_reads_browser.ts`, and `module-cards.py tree` passes.
* **Screenshots:**
  * The three part 1 shots moved from `J-69/` to `CS-D6/`. `J-69/` now holds only main's (qa's) shots, so no orphans are left.
  * The moved PNGs differ in bytes from `c24d31d82`'s because they were re-run, with new times in "Read by".
  * The 390 px shot shows the same layout: the dialog fits, the fingerprint wraps, and "The file has changed" notice and the Read by list are both there.

**Findings**
* n4 (nit, no change): two dated records still name the old file or path, and records keep their facts (P-188):
  * `break-report.md:27` cites `j_69.ts:110`.
  * `journey-test-reviewer-2026-11-23.md` cites `j_69.ts` and `J-69/screenshots/w2-…`, which now sits at `CS-D6/screenshots/w2-…`.

  A reader following those links should look in `check_csd6_reads_browser.ts` and `CS-D6/screenshots/`.
* m1 from round 3 (390 px width not asserted) moved with the file unchanged. It was neither fixed nor made worse, and it remains Minor and not blocking.

No Blocker, no Major.

**Journey score, round 4: 9/10** (unchanged; the resolution changes no screen).

`Reviewer: Approve b4bcfcb169f5eef517cbf6b7607666efadbf21ae`

Verdict: Approve

## Round 5 (batch faults): head `ec210cac8d71ab09bf588411815ab3f41415877d` (diff `git show ec210cac8` only; `c44524dfb` is a merge of origin/main and was not reviewed)

The tech lead allowed this round for two faults only (Lead 11, PR comment 7110124442, batch 45230123108). Last approved head: `46fa17409`.

**What I ran**
* `run-suites.sh --only "check_csv1_inputs.ts check_csw3_firm_scope.ts check_csd6_reads_keep.ts"` at `ec210cac8`. Ports were +14000; :4400 was not used.
  * `check_csd6_reads_keep.ts`: PASS, 23/23.
  * `check_csv1_inputs.ts`: PASS, 100 passed, 0 failed.
  * `check_csw3_firm_scope.ts`: PASS, 48/48.
* I called the real `ReadsCursor` export directly through tsx with the studio tsconfig, using 13 inputs. Results below.
* `tsc -p api/tsconfig.json --noEmit`: no error in `case-document-reads.ts`. The only errors are older ones in unrelated `tests/` files.
* Screenshots: the runs overwrote none, and the working tree stayed clean. I looked at the re-run `w2-owner-read-by-1440.png`: same layout, with the "The file has changed" notice and three "Read by" lines. Only the times changed.

**Fault 1: is the `before` parse correct and complete? Yes.**
* The schema is `ReadsCursor = z.union([z.undefined(), z.literal(""), z.string().max(36).regex(UUID)])`, and `list()` calls `safeParse(before)`. A failure goes to the same `badCursor()`, so the 400 response has the same words as before: "Check the details" / "The page cursor is not one this list gave." / `fields.before`.
* Inputs I tried:

  | Input | Result |
  |---|---|
  | `undefined`, `""` | accepted, no cursor |
  | a UUID, the same UUID upper-cased | accepted, then lower-cased by `cur` |
  | 37 characters, 10,000 characters, `" "`, `"yesterday"`, UUID + `"\n"` | refused (no `m` flag, so `$` does not match before the newline) |
  | `null`, a number, an array (`?before=a&before=b`), an object | refused |

* Type narrowing: `q.data` is `string | undefined`, so `q.data ? q.data.toLowerCase() : null` is sound. It also stops the old `typeof before === "string"` check from being repeated. `UUID` has no `g` flag, so `.regex()` keeps no `lastIndex` state between calls.
* Behaviour is unchanged from the old hand-written check. The order is also unchanged: `reach()` runs first, so 404 still wins over 400 and a bad cursor reveals nothing about a document the caller cannot reach.
* `max(36)` adds nothing beyond the anchored regex, but it is harmless and documents the intent.

**Fault 2: is the firm-scope claim true? Yes. Is the census row's reason accurate? Yes.**
* What `reach()` does, line by line:
  * l.55: the id must be a UUID, else 404.
  * l.56: `caseDocument.findUnique` by id. Not firm-scoped.
  * l.57: `caseParticipant.findFirst` by `subjectId`. Not firm-scoped, but `CaseParticipant.subjectId` is `@unique` (`prisma/schema/cases.prisma`), so a subject belongs to exactly one case. `findFirst` cannot pick another firm's case for a subject that sits in two cases.
  * l.58: `caseScope` with the session's `firmId`. It returns no scope unless the staff member belongs to that firm.
  * l.59: `case.findFirst` with `AND: [{ id, firmKey: ctx.firmKey }, caseScopeWhere(scope)]`. `caseScopeWhere` always sets `firmId: s.firmId` (`case-access.ts:35-39`). So the case lookup is filtered by both firm key and firm id, plus the person's view rule.
  * l.61-62: the platform firm behind `c.firmKey` must be `ctx.firmId`, else 404.
* **Do the lookups by id that come before the firm check leak anything? No.**
  * They return nothing to the caller and write nothing: no audit line, and `checkUnchanged` hashes and logs only after `reach()` succeeds.
  * Every miss (bad id, unknown document, no participant, another firm's case, out of view, wrong platform firm) ends in the same `gone()` 404 with the same words.
  * DW2 l.86 asserts that firm B's 404 matches an unknown id's 404 word for word. DW3 l.119 asserts firm B's check is 404 and writes no line.
  * The only difference is timing: an unknown id costs one query and a known one about four. Ids are random v4 UUIDs, so they cannot be enumerated. This was true in every earlier round and is not new here.
* **The census row's reason** (`check_csw3_firm_scope.ts`) is "staff routes take their firm from PF-4's session; the document's case is read firm-first … else 404; firm B's refusal is in check_csd6_reads_keep.ts DW2 and DW3". Every part checks out:
  * `features/case-document-reads.ts` uses `staffOf(r)` behind `@PermissionKeys` and never reads `x-actor`.
  * The reason says the document's *case* is read firm-first, which is exact. It does not claim the document lookup itself is firm-first.
  * The cited tests exist and pass.
  * The lead's "with a firm-B refusal test" is met by those existing tests, so no new test was needed.
* **Count 51 is right.** At `ec210cac8`, origin/main (`5c9b15ed4`) has not touched the census since `343981ef3`, so main is still at 50 and has no #3180 row. If #3180 lands first, the count must be taken from it, as the lead said.

**Findings**
* n5 (nit, no change needed for merge): the census comment still says "plus seven merged on main after the spike", but it now names nine files (five + party-search, case-notes, visibility-adapter, case-document-reads). It was already off by one since CS-MV1. Only the comment is affected; the assertion (`ALLOW.length === 51`) is what counts.
* n6 (nit): no route-level test sends `before=""`, an over-long cursor, or a repeated `before`. Only `"yesterday"` is tested (DW2 l.87). I checked those inputs on the real schema above, and `check_csv1_inputs` now sees the zod parse, so this is optional.

No Blocker, no Major. Both batch faults are fixed within the lead's limit, with no new scope.

**Journey score, round 5: 9/10** (unchanged; this commit changes no screen).

`Reviewer: Approve ec210cac8d71ab09bf588411815ab3f41415877d`

Verdict: Approve
