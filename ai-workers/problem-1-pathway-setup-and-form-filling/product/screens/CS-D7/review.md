# CS-D7c + CS-D7 review: document flags (R1.70, PR #3180, head 157dfdb6d)

The reviewer is a fresh context that did not build this. Scope:
- **Diff:** `origin/main...157dfdb6d`, 34 files, +948.
- **Concept:** the two BACKLOG rows (S3: document flags) and R1.70's Done-when. The rows have no concept.md.
- **Copy:** isolated `rev_csd7` on :4481. Live AI off, US$0.
- **Journey report:** `journey-test-reviewer-2026-11-23.md`, score **7/10 (fail)**.

**Verdict (skill scale):** Ship after fixes. There are 3 Major findings, no Blocker and 6 Minor ones.

## What I ran
- **Suites on :4481:** check_csd5c_type_defaults 24/24, check_csd5_flags 28/28, check_csd5_flags_browser 30/30. **Probe walk** from the scratchpad (two browser contexts, roles, hostile text, old release, replacement file).
- **Typecheck:** `tsc -p api` has no error in the changed files; `tsc -p web` is clean. **Graph:** neither new route in G3, neither feature file in G6. **CI:** on the PR (a draft), `pr-rules` is **red**.

## Findings
**M1 (Major, concurrency / D2, D5): the flags dialog silently overwrites a colleague's change.**
- `web/src/pages/case/document-flags/panel.tsx:25` renders `<Form>` without a key. Its inputs are `useState` from the first view it saw (`:33-38`), the version comes from the latest view (`:47`), and every field is sent (`:47-48`).
- **Scenario 1:** officer B sets the expiry to 2031-05-05. Officer A's save gets 409 "read them again", but A's inputs still show 2026-11-22. A presses Save, and the database ends at `2026-11-22|REQUIRED|v4`. The audit says "expiry date … 2031-05-05 → 2026-11-22".
- **Scenario 2:** A reopens the dialog on the same page (cached query) and changes only the language. The audit also writes "notarisation Required → not set", which A never touched.
- **Fix:**
  - Key the form on `v.flags.version`, or wait for fresh data before showing it.
  - Send only the fields the person changed.
  - Add a two-context browser check that fails today.

**M2 (Major, merge gate): `pr-rules` refuses the head.** The log says "REFUSED: 963 changed lines, over 800 (P-610 (1))".
- This is the builder's "one PR for both rows" deviation. The rows' own size is CS-D7c 1 PR and CS-D7 2 PRs.
- **Fix:** split along the rows (CS-D7c; CS-D7 API; CS-D7 panel), or add a "Size exception: P-NNN" that the Lead names.

**M3 (Major, concept gap / D1, D19): readiness does not read the flags.**
- CS-D7 (4) says: "Readiness (C7.6) reads the warning as an item, not a stop".
- **Scenario:** a passport expired yesterday and a Needed Spanish translation. The case's readiness ("1 block and 12 open warnings") and `GET …/prepare` name neither, and the person still reads "1 of 2 received". A case officer can therefore reach Ready to file with a mandatory translation outstanding.
- The computed translation line also has no action: no upload, no request.
- The builder flags this in the PR as a follow-up, but no follow-up row exists in BACKLOG.
- **Fix:** build (4): readiness lists the warnings and the Needed translations as warning items. Otherwise the Lead records the follow-up row and accepts the gap on the PR; that closes M3.

**Minor (Should, fix or a follow-up row):**
- **m1:** two contradicting translation items. The release's "Certified translation of documents not in English or French" and "Translator's affidavit" still say "check it by hand for now" under the new "Needed" line, although the language is now known.
- **m2:** a replacement file starts with no flags (`language` null), so the Needed translation line silently disappears. The row says the language is "picked by staff at upload".
- **m3:** `max_age_days` is measured from the upload date (`case-document-flags.ts:60`). This is time held on the case, not the document's age: a 2-year-old certificate uploaded today never warns. The wording is honest. Accept, with an issue-date follow-up row.
- **m4:** the API sends a staff "Required" back to the type's default on a language change (`case-document-flags.ts:134`). The panel always sends `translation`, so from the screen that rule never fires. Only the API path is tested.
- **m5:** `prisma/schema/evidence.prisma` (CS-D7 comment) names `api/src/case-documents/flags.ts`, which does not exist.
- **m6:** test usage lines use ports 4461-4463 and 4470 (the qa range). The runtime lane's ports are 4430-4439 (WAY-OF-WORKING, Roles).

## Judging the flagged deviations
- **New module files, outside the Touch lists (`document-type-defaults.ts`, `case-document-flags.ts`):** accept. `api/tsconfig.json` `include` has no `src/case-documents/**` (checked), and the C6.14 pattern is reused faithfully.
- **Translation line worked out on read, not stored:** acceptable for R1.70's Done-when, because no duplicate is possible. M3 covers its readiness and action gaps.
- **Readiness not built:** that is M3.
- **Max age from upload:** m3.
- **One PR:** that is M2.
- **Waits-on** (Bake tag P-499, the configurator owner's OK, CS-D1): for the Lead, not a review finding.

## Rules checked (all met on 157dfdb)
- **AGENTS rule 4:** no immigration value is added. The fixtures say "Test words". An uncited value is refused at proposal (400 `DEFAULTS_UNCITED`), and `document_type_defaults_cited_check` refuses any non-draft version that carries one (tested both ways).
- **Second person:** a self-approve is 403. At approval a new DRAFT is made through `revise`, and the published row stays the same (tested). Withdrawal works under an advisory lock and checks the version.
- **Release pinning:** a type with no defaults gives a byte-identical snapshot. A case on release 1 reads no defaults. The expert's release line names the defaults with `needs_sme`.
- **Audit:** one line per flag changed. A refused or unchanged save writes none.
- **Route permission and firm isolation:** the `case` duty, `Runtime.reach(…, "officer")` by firm, and the same 404 for an unknown document or another firm's. Client 403, author 403, the other firm's staff 404, nobody 401.
- **Server concurrency:** the version is compared, then `updateMany … where flagsVersion` runs in a transaction. The SQL checks keep Provided with its detail.
- **No request per row:** flags and translations are worked out in memory in `stored()`.

## D1–D20 (1–5)
| D | Score | Evidence |
|---|---|---|
| D1 | 3 | R1.70's Done-when is met on the checklist; row (4) is unbuilt (M3) |
| D2 | 2 | The server is sound; the UI loses updates (M1) |
| D3 | 4 | Reuses the governed-change pattern, revise, Pill, FoldOut, Dialog |
| D4 | 4 | The rule resolves both ways; release pinning holds |
| D5 | 2 | A double click sends one request, but the 409 retry and the reopen overwrite (M1) |
| D6 | 4 | Citation, second person, SQL check, audit per flag |
| D7 | N/A | No AI |
| D8 | 4 | The dialog title names the document and the person |
| D9 | 3 | The translation line has no action |
| D10 | 3 | Plain words; m1's contradiction |
| D11 | 3 | "Now:" lines and warnings; stale inputs after a 409 |
| D12 | 4 | Builder's screenshots CSD7-01..04 |
| D13 | 4 | axe 0 serious; keyboard; 1024 px and 200 % with no sideways scroll |
| D14 | 4 | Team components and tokens |
| D15 | 4 | No request per row; not timed against §9 |
| D16 | 3 | Every Done-when bullet has a pass and a fail; the UI's concurrency is untested |
| D17 | 3 | Simulated only |
| D18 | 4 | Origin per flag and the type's quote and source |
| D19 | 3 | Configure → release → case → checklist works; readiness does not |
| D20 | 3 | Simulated only |

## BIC (EXPERIENCE §6)
- **Met:** BIC-03 (a language change re-derives the line), BIC-04, BIC-11, BIC-17 (no self-approve), BIC-19, BIC-20.
- **Partly:** BIC-13 (the error sits at the dialog's foot, not on the detail field), BIC-14 (the Needed/Provided pill has no tooltip), BIC-18 (the stale form after a 409, M1).
- **N/A:** BIC-01, 02, 05–10, 12, 15, 16.

## Not checked
A real screen reader; the intended user's unaided walk; the full CI set (the PR is a draft); the working-tree edits another session started after my runs (05:37 UTC): this review is for 157dfdb only.

**To fix before Approve:** M1, M2, M3 (M3 closes either by building (4) or by a Lead-accepted follow-up row).

Reviewer: Changes 157dfdb6d9d56506adf19d57bacdd4d11091b3f3

Verdict: Block

## Round 2 (head 2cd403ffdf43f56b4d964e24407d413218db4fc3; diff `157dfdb6d..2cd403ffd`)
**Copy:** isolated `rev_csd7` on :4437, stopped afterwards. Live AI off, US$0. **Suites on :4437:** check_csd5_flags 35/35, check_csd5_flags_browser 33/33. **Typecheck:** `tsc -p api` no error in the changed files; `tsc -p web` clean. **Probes:** a pass-persistence script (API + SQL) and a 1024 px browser walk of the readiness item (scratchpad, not committed). **Journey:** round 2 in `journey-test-reviewer-2026-11-23.md`, score **8/10 (pass)**.

**Round-1 findings re-checked:**
- **M1, fixed.** `panel.tsx` keys `<Form>` on `flags.version` and keeps the error in the dialog, so a 409 refetch re-seeds the inputs. `save` sends only the fields that differ from the view it was seeded with. A reopen from the cache can no longer write back a field the person did not touch. The browser check fails if either fix is removed: the "form now shows their expiry" check and the notarisation-only check.
- **M2, still open.** On this head `pr-rules` is red: "REFUSED: 1059 changed lines, over 800 (P-610 (1))". The PR body has no "Size exception: P-NNN".
- **M3, fixed (one new defect, N1).** `flagWarningsOf` feeds each current file's warnings, and a translation still needed, into `DocumentItem.flag_warnings`. Readiness turns them into `document_flag` warnings, never blocks, and skips lines that are not applicable or waived. The migration's code list matches c78's list plus `document_flag` (checked against `20261109120000`), so the severity check still holds. In the browser at 1024 px the item shows under "The case team" with "Pass with a reason…". The pass was stored and showed as "1 passed with a reason".
- **m2, fixed.** A replacement file keeps the language (tested). **m5, fixed:** the path in `evidence.prisma`. **m6, fixed:** ports 4434-4436 (runtime lane). **m4, resolved as a side effect:** the panel now sends only what changed, so the "language → English/French drops a staff Required" rule now runs from the screen too.
- **m1 and m3 are not addressed, and there is no follow-up row** (BACKLOG has only rows 1217-1218). Both stay Should.

**New findings:**
- **N1 (Major, D2/D5): a passed age warning reopens every day.** The pass key is `item|part`, and `part` is the whole warning text (`engine/runtime/readiness.ts:256`). The age warning's text holds the day count: "Uploaded ${age} days ago…" (`api/src/case-document-flags.ts:60`).
  - Probe: the document is 400 days old and gets a pass with a reason. The warning then sits under `passed` and is gone from `warns`. After moving `uploaded_at` back one day, the same warning is open again ("Uploaded 401 days ago…") and the pass covers nothing. A filing marked Ready to file falls back the next morning, and every re-pass adds another history row.
  - Fix: give each flag warning a stable key separate from its words. For example, `flagsOf` returns `{ key, words }`, with keys `expired|<expires_on>`, `no_expiry`, `age|<uploaded day>|<max_age_days>` and `translation|<document id>`. Pass the key as `part` and the words as `words`. Add a check: pass the age warning, move the date one day, and it stays passed.
- **n1 (Minor, Should), the audit wording question:** "not set → Required" (`case-document-flags.ts:156,167`). Changing the test to match the stored value is honest, because the old expectation described something the code never did. But the wording should change:
  - The same dialog calls the empty choice "From the document type" and shows "Now: Not required (from the document type)".
  - The history then says "not set", which hides what was in force. Someone reading "notarisation: not set → Required" cannot tell that the earlier value was Not required. Someone reading "Required → not set" cannot tell what it became.
  - Fix: keep `changed` comparing stored values, but word a null translation or notarisation in the summary as the effective value, e.g. "from the document type (Not required) → Required". Use `flagsOf(d, t.defaults, today)` before and after. Update the browser assertion.
- **n2 (Minor, Should): a 409 `not_current` in the panel gives false advice** (`web/src/pages/case/document-flags/panel.tsx:56`). Every 409 adds "The form now shows the flags as they are: make your change again". After another person uploads a newer file, the dialog stays bound to the old document id, so every retry is refused again. Fix: on `code === "not_current"`, show the server's words only and close the dialog after `done()` (or turn Save off), so the person reopens it from the new file.
- **n3 (Minor, Should): the PR body is out of date.** It still says "CS-D7 (4) … is not in this PR" and gives 28/28 and 30/30. Fix: update the readiness bullet, the counts (35/35, 33/33) and the migration note (the readiness_pass check is widened).

**D changes since round 1:** D1 4 (row (4) built), D2 3 (no lost updates; N1), D5 3 (409 recovery sound; N1), D11 4, D16 4 (the concurrency checks fail without the fix), D19 4 (checklist → readiness works). The rest are unchanged.
**BIC changes:** BIC-18 Met (the form re-seeds after a 409). The rest are unchanged.

**To fix before Approve:** N1, and M2 (a split, or a Size exception that the Lead names). n1, n2, n3, m1 and m3 are Should: fix them or record follow-up rows.

Reviewer: Changes 2cd403ffdf43f56b4d964e24407d413218db4fc3

Verdict: Block
