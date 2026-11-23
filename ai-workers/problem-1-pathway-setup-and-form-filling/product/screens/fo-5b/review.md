# FO-5b review: retainer checklist from the Code's s. 24(3) (API only)

Reviewer: independent (P-303), Opus 5.5, did not build it. PR #2720, branch `claude/dreamy-knuth-wk15l8`, **commit 3060c388dba4e1164c4a52c8f10ccdbcf94a3876**, read 21 Nov 2026. Reviewer only (no breaker, no schema). Diff: 8 files, +644 / -8 (652 lines, under P-610's 800); every file is on the row's or brief's touch list or named in the PR (docx-worker.ts, one line, PR deviation list).

**Verdict: Ship.** No Blocker or Major. 6 Minors, none needs a fix before merge (they can be fixed in this PR or by FO-5s). Journey score 8/10, pass (journey-test-reviewer-2026-11-21.md).

## 1. The Code's text, checked against the official page (AGENTS rule 4, P-170)
* Fetched https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/FullText.html on 21 Nov 2026 (HTTP 200, 99 007 bytes). The page says **"current to 2026-10-29"**. The file says the same. The row and P-567 (2) say 2026-10-19; the PR names the difference. The page wins.
* s. 24(3) lead-in on the page: "The service agreement must include the following information:". **26 paragraphs, (a) to (z)**, no subparagraphs. The file has 26 entries, a-z, each section `24(3)(x)`.
* **All 26 paragraphs compared by script** (HTML of the `(3)` block split on `class="Paragraph"`, tags stripped, entities decoded, whitespace normalised) with `items[].text`: **0 differences**. Read by eye as well: (d) "a statement that the licensee endeavours to provide quality immigration or citizenship consulting services and to adequately supervise any person who assists in the provision of those services;", (h) "estimated time frames for the delivery of the services;", (r) "the licensee’s complaint-handling procedure;", plus (a), (b), (i), (o). All match word for word, curly apostrophe included.
* `legalReading: "Unconfirmed: no counsel"` is at the top level and in both answers. Every `howWeCheck` starts with "Ours:".

## 2. Correctness (code read plus probes)
* **Marker mapping is honest.** (a) and (b) have no placeholders in `marks` and say which parts have none (licensee address, phone, email; client home and business addresses), so only the marker marks them. (i) is marked by `fees` or `fees.total` and says it does not read hourly rate, hours or pro bono. (o) is marked by `conflict.disclosure` (FO-13c). DW2 shows no other placeholder marks an item.
* **`code.marked` in merge values does not break anything that iterates them.** Render (`service.ts` renderVersion) passes it as data, and no template can name it (not in KNOWN, so 422; probed live). completeness's `missing` only reads the template's placeholders. Signed offline copies `{...src.mergeValues}`, so the copy keeps the source's list. prospect-won reads only `representative.staff_id`. FO-6 `signing/` does not read merge values. DB: `merge_values_check` (an object, at most 64 KB; adds about 130 bytes) and the "a version never changes" trigger hold it (DW5 and DW6 fail cases). Suites FO-5 (248), FO-13c (46), FO-2w (19) and PF-6b (33) pass on this commit.
* **docx-worker one-line change:** `{#code.s24_3_k}` / `{^…}` adds `code.s24_3_k-as-a-section` (unknown), so upload is refused 422. Mutation: removing the clause makes DW3's section case FAIL.
* **`send` untouched** (no diff in send). Live: a draft with 25 of 26 marked sent 200 SENT. The only refusals stay AG-5-9's two plus the existing FO-13c conflict gate.
* **Tenancy:** `templateChecklist` filters by `firmId` and checks the UUID. Firm B gets 404, a malformed id 404, a retainer's id used as a template id 404, no sign-in 401 (live). Mutation: dropping `firmId` makes DW8 FAIL.
* **Permission key:** `agent/retainer:list`, the same key as `GET retainer-templates`. It is in PF-4's catalogue (PF-6b uncatalogued check passes).
* **CONSULTATION:** draft `codeChecklist` is `null` for CONSULTATION. The template endpoint still answers for a CONSULTATION template (Minor m3).
* **Old versions without the key:** `lettersOf` gives null. The draft falls back to `markedLetters(placeholdersMadeFrom(...))` (the stored template file of that version) and `versions[].codeMarked` is null. Correct by reading, but no test covers it (m5).
* **Versions kept until sent / sent unchanged:** live, the template went to v2 with 26 of 26 while the drafted, then sent, agreement stayed 25 of 26 with the same sha256. DB `merge_values->'code.marked'` lists 25 letters without k.
* Mutation: removing the `code.marked` snapshot makes only DW5 FAIL. DW6 still passes through the fallback (m4).

## 3. Suites (from studio/, `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/<file>`, detached worktree at 3060c388)
| Suite | Result | Exit |
|---|---|---|
| check_fo5b_retainer_checklist.ts run 1 | 25 passed, 0 failed | 0 |
| check_fo5b_retainer_checklist.ts run 2 | 25 passed, 0 failed (same lines) | 0 |
| check_fo5_retainers.ts | 248 passed, 0 failed | 0 |
| check_fo5f2_template_safety.ts | 72 passed, 0 failed | 0 |
| check_fo13c_conflict.ts | 46 passed, 0 failed | 0 |
| check_fo2w_won_event.ts | 19 passed, 0 failed | 0 |
| check_pf6b_permission_rules.ts | 33 passed, 0 failed | 0 |
| check_fo8_prospect_won.ts | not run: needs the CI checkpoint loaded ("configured checkpoint did not load 500"), an environment issue, not this diff | 2 |

## 4. D1-D20 (API only: screen dimensions wait for FO-5s)
D1 4/5: every brief item is built. `?version=` was dropped and declared (m1) · D2 5: write-once list, DB trigger, no new write path · D3 5: one data file, markers derived from it · D4 N/A · D5 5: reads idempotent; three concurrent reads agree; double upload gives 201 + 409 NAME_TAKEN · D6 5: currentTo and readOn per item · D7 N/A (no AI) · D8-D9 N/A (no screen; the link is m1) · D10 4: our words are plain, and 0 of 55 of our strings say required, must or correct; the section refusal is technical (m6) · D11 4: `blocksSend:false`, present or missing per item · D12-D14 N/A · D15 5: checklist 12-19 ms, draft 94 ms, upload 303 ms · D16 4: each rule has a pass and a fail, two are weak (m2, m4) · D17 simulated only · D18 5: section, URL, current-to and legal reading on every answer · D19 N/A (FO-5s and J-53 close it) · D20 simulated only.
BIC-01-20 (EXPERIENCE §6): N/A, no case-side screen.
Graph (P-86): `GET /front-office/retainer-templates/:id/checklist` has `testedBy: []` and the suite names no capability. The same is true of every FO-5 retainer route (the module's suites call the service directly), so it is a Minor (m2), not new.

## 5. Issues (all Minor; Should, not Must)
* **m1** `code-checklist.ts:57` / `service.ts:454`: the draft's `link` opens the template's newest version. After the template changes, the link shows "26 of 26" while the agreement's own line says 25 (seen live). The draft's own `items[]` are right. Fix: add the retainer's `templateVersion` to `codeChecklist`. The template answer already carries `version`, so FO-5s can compare the two and say "the template has changed since". Or add `?version=` when a row asks for it (PR deviation 2).
* **m2** `tests/check_fo5b_retainer_checklist.ts:176`: DW8 checks only the declared key (metadata). There is no behavioural 403 for a person without `agent/retainer:list`, which the brief's DW6 lists. Fix: one in-process guard call with a context lacking the key, expecting 403.
* **m3** `service.ts:305`: the template checklist answers for a CONSULTATION template ("1 of 26 items marked"), while the draft returns null for CONSULTATION. Fix: return `codeChecklist`-style `null` / `appliesTo: "RETAINER"` for CONSULTATION, or document that FO-5s hides it by `kind`.
* **m4** `tests/check_fo5b_retainer_checklist.ts:159`: DW6 (sent unchanged) still passes with the snapshot removed (the fallback re-reads the old template file). Fix: also assert `after.versions[0].codeMarked` equals the 1-letter list.
* **m5** No test for a version made before FO-5b (no `code.marked`): fallback list and `codeMarked: null`. Fix: one case that strips the key in `mergeValues`, the way check_fo5_retainers.ts:883 does.
* **m6** `tests/check_fo5b_retainer_checklist.ts:76` "DW1 fail" (paraphrase) compares with a hard-coded string, so it cannot fail. `:138` is labelled "fail" but checks a pass case. The section-marker refusal says "{code.s24_3_k-as-a-section} is not a placeholder we know." (the existing FO-13c wording pattern). Fix: make the paraphrase case run `fileProblems` on a copy with (k) altered against `AS_READ`, relabel :138, and optionally give `-as-a-section` names a plain message.

## 6. Not checked
A visible-browser walk (no screen until FO-5s). Screen-reader, 1024 px and 200 % zoom (N/A). D17 and D20 with an intended user. check_fo8_prospect_won.ts (environment). The PR body's "Checks and results" section was still being filled by the builder.

**Verdict: Approve** (3060c388dba4e1164c4a52c8f10ccdbcf94a3876). No open Blocker or Major.

## Re-review (P-277: the new diff only), 21 Nov 2026
Head **576ba4ec69e70371371c2f43e9851d7d910d74fb**. Code diff `3060c388..9ee8ef9c`: 3 files, +37 / -7 (code-checklist.ts, service.ts, the suite). 576ba4ec only adds this review and the journey report (checked: `git diff --stat 9ee8ef9c..576ba4ec` lists those 2 files only).
* **m1 fixed.** `draftChecklist` gains `templateVersion` (`r.templateVersion`), `templateCurrentVersion` (the firm-scoped template row's `version`) and `templateChanged`. Edit writes `templateVersion` on each new version (`service.ts:512`), so the flag follows edits. DW6 asserts 1 / 2 / true.
* **m2 fixed.** The suite now calls PF-4's real `PlatformGuard` on `RetainersController.checklist`: 403 without `agent/retainer:list`, 200 with it.
* **m3 fixed.** The template answer gains `appliesTo: "RETAINER"`. `applies` is `kind === "RETAINER"` (false for CONSULTATION). Tested both ways.
* **m4 fixed.** DW6 asserts `versions[0].codeMarked` is `["i"]` and `templateChanged`.
* **m5 fixed.** A version with no `code.marked` uses the fallback (25, k missing) with `codeMarked: null`. Tested.
* **m6 fixed** (except the wording). DW1's fail case runs the as-read comparison on a paraphrased copy. The :138 case is relabelled "pass". The section-refusal wording is kept as FO-13c's existing pattern, which is accepted (Minor, no change needed).
* No new issue found. `send` is still untouched, and no new route or write was added.
* Suite at 9ee8ef9c (same code as 576ba4ec), detached worktree: `check_fo5b_retainer_checklist.ts` gave **28 passed, 0 failed, exit 0**. FO-5 and the other suites were not re-run, at the coordinator's request.

**Verdict: Approve** (576ba4ec69e70371371c2f43e9851d7d910d74fb). No open Blocker or Major.

## Re-review (B164 guard), 21 Nov 2026
Head **7cedfd22d75440ecb8b7385306754cc7d644b93d**. Diff `5a501182..7cedfd22`: 1 commit, 1 file (`tests/check_b164_no_engine_keys.ts`), +5 / -1. This is the fix Lead B proposed (comment 7058446213) and the tech lead approved (7058483696). Nothing else changed.
* `"code"` is added to `NOT_KEYS`, with the exact comment `// code.*: the Code of conduct's clause markers and merge value (FO-5b), never a combination`. No marker was renamed, and nothing was added to `ALLOW`.
* Two planted self-tests were added. In the first, `code.marked` and `code.s24_3_k` are not keys. In the second, `ee.fsw` placed next to `code.marked` is still caught.
* **Risk of hiding a real combination: none found.** The guard reads 78 known keys from programs.json, wave1.json, routes.json and fee-table.json `combinations`. Their heads are corporate, family_sponsorship, fs, individual, lm, lmia, pnp, provincial_nominees, retail, sp, study, study_permits, study_then_work, sv, visitors, vv, work, work_permits and wp. None is `code`, and no key starts with `cod`. `keyLike()` returns true for a known key or a known head before it checks `NOT_KEYS`, so a key like that would still be caught. The exemption covers only unknown two-to-five-letter strings headed exactly `code`. No IRCC program is abbreviated "code".
* **Run** (studio, `tsx --tsconfig api/tsconfig.json tests/check_b164_no_engine_keys.ts`): last line **`67 passed, 0 failed`**, **exit 0**.
* **Mutation:** I ran a scratch, untracked copy of the suite without `"code"` in `NOT_KEYS`. Result: exit 1, `64 passed, 3 failed`. The engine scan fails with batch #2735's hit (`code-checklist.ts:26 code.marked`, then `docx-worker.ts`), and both planted tests fail. So the guard change is what makes the suite pass, and the self-tests pin it. The copy was deleted, and the working tree has no tracked changes.
* Note, no change needed: under the mutation, the second planted test fails because it counts 2 hits, not because `ee.fsw` stops being caught. The existing case at line 11 (`ee.fsw` on its own) still checks that the new-program catch works.

**Verdict: Approve** (7cedfd22d75440ecb8b7385306754cc7d644b93d). No open Blocker or Major.
