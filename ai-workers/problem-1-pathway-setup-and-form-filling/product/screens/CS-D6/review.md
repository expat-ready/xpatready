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
