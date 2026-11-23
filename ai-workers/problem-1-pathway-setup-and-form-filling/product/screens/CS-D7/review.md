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

## Round 3 (diff-only, on the split heads: #3256 `b41fe99098337d25daef71c071761281b0ad4ab5`, #3180 `366d3ed3bea87675911b1e9b6c62624023fadddd`)
Fresh reviewer, 23 Nov 2026. Scope (the tech lead): the round-2 fixes `2cd403ffd..eab779b`, and the split. The minors listed as follow-up rows in the PR body are out of scope; none of them is Major.
**Copy:** isolated `rev3_csd7` on :4437 (never :4400), stopped afterwards. Live AI off, US$0. **Suites on :4437 (head 366d3ed3b):** check_csd5_flags 38/38, check_csd5c_type_defaults 24/24, check_csd5_flags_browser 33/33 (this is J-70; run from a scratch copy so the committed screenshots were not overwritten), check_c76_readiness 91/91, check_readiness_pass_codes 4/4. **Typecheck:** `tsc -p api` on the head and on a standalone `git archive b41fe9909` tree: the same 15 errors, all in unrelated old tests, and none in a changed file. `tsc -p web` is clean on both. **Schema:** on fresh databases, `prisma migrate deploy` then `prisma migrate diff --from-config-datasource --to-schema prisma/schema` gives "No difference detected" for #3256 alone (it stops at 140000) and for #3180 (140000, then 150000).

**Round-2 items:**
- **N1 / R2-M1, fixed and tested both ways.** `flagWarnings` (`api/src/case-document-flags.ts:46-52`) keys each warning by the file and the value it depends on: `expired|<doc>|<date>`, `no_expiry|<doc>` and `age|<doc>|<max_age_days>`. `engine/runtime/readiness.ts:256` passes `part: w.key`. The check "review N1 pass" (`tests/check_csd5_flags.ts:113-120`) passes the age line, moves `uploaded_at` back a day and expects it still passed. With the old `part: w` the words change ("401 days"), so the check fails.
- **R2-m1, fixed. The race itself has no test.** `updateMany` at `:168` now has `current: true`, and `:169` re-reads the row to answer `not_current`. Live probe: psql `begin; update … current=false; pg_sleep(3); commit` running alongside `POST flags {language:"ru"}` gives 409 `not_current` after 2.3 s, with the language and `flags_version` unchanged and no audit line. Run alongside a concurrent version bump instead, it gives 409 `flags_changed`. But "break m8 fail" (`:155`) is answered by the pre-check at `:147`, so no check fails if `current: true` is removed from `:168` (R3-m1).
- **n2 / R2-m2, fixed in the words.** Playwright at 1024 px: open Document flags…, upload a newer file, type an expiry, Save. The `role=alert` says "…Nothing was changed. Close this and open the newer file's flags." Axe finds 0 serious issues, there is no sideways scroll and no page error. Save stays offered and gives the same words again (R3-m2).
- **R2-m4, fixed and tested both ways.** `api/src/case-checklist.ts:208` empties `flag_warnings` on a not-applicable or waived line, which matches `flagWarningsOf`. The setup check (`:158`) sees the warning, and the fail check (`:160`) sees `[]` once the line is not applicable. That check fails without the fix.

**The split: nothing lost, nothing duplicated.**
- (a) The literal `git diff eab779b 366d3ed3b` also shows main's own commits (#3256's base is a newer main), so I compared each branch with its own base: `8f487df4b..eab779b` against `origin/main(7bd590d6f)..366d3ed3b`. The same 30 files, every blob identical. The only difference is the two migration folders, renamed 100000 → 140000 (csd7c) and 110000 → 150000 (flags), with identical contents (blobs `53f5c12…` and `eb2b5b3…`). Main touched none of these files in between.
- (b) #3256 (`origin/main...b41fe9909`, 15 files, 708 lines) is CS-D7c only. No file references `case-document-flags`, `flags_version`, `document_flag`, `flag_warnings` or the `case_document` flag columns. Its migration touches only `document_type`, and it typechecks and migrates on its own (above).
- (c) #3180 (`b41fe9909...366d3ed3b`, 15 files, 710 lines) is CS-D7 only. It depends on #3256's `SnapTypeDefaults` and the governed-change route (the right direction). `Completes: R1.70` is on #3180 only.
- (d) Order: main's newest migration is `20261123030000`, followed by `20261123140000_csd7c_type_defaults` and then `20261123150000_csd7_document_flags`. The `readiness_pass_known_code_check` list in 150000 is c78's list (still the newest on main) plus `document_flag`.
- Note: #3180's head moved to `94a80e401` after the commit I reviewed. That commit only adds the breaker's Round 3 section to `break-report.md` (+17 lines, no code).

**New findings (all Minor, Should; none blocks):**
- **R3-m1 (Minor): no test for the R2-m1 race.** Fix: in `check_csd5_flags.ts`, start `psql -c "begin; update case_document set current=false where id=…; select pg_sleep(2); commit"` in the background. After about 0.5 s, `POST flags {version, language:"ru"}`. Expect 409 `not_current`, the language unchanged and no new audit line. This check fails if `current: true` is removed.
- **R3-m2 (nit/Minor): the stale dialog keeps a live Save** (`web/src/pages/case/document-flags/panel.tsx:58,90`). The words say "Close this", but the buttons are still "Cancel" and "Save flags", and every Save repeats the 409. No browser check covers these words. Fix: on `not_current`, keep a `stale` flag, hide Save and rename Cancel to "Close". Add the case to `check_csd5_flags_browser.ts`.
- **R3-m3 (Minor; = breaker R3-m1): a translation pass outlives a change of language or of the staff flag.** The key is `translation|<doc>` only (`api/src/case-document-flags.ts:98`). A reason given for Portuguese then covers German. Fix: `translation|${d.id}|${d.language}|${flags.translation_from}`, plus a check that a language change reopens the line.
- **R3-m4 (Minor; = breaker R3-m2): the language carry-over can drop a save made at the same moment.** `api/src/case-checklist.ts:356` reads `was.language` with a plain read before the supersede at `:357`. A flags save in between gets 200 on a file that is replaced a moment later, and the new file keeps the old language. Fix: supersede first and take the language from that row (`UPDATE … RETURNING language`), or `SELECT … FOR UPDATE` before the read.

**Journey (reviewer role, round 3 delta):** the age pass now holds across days (API check and probe). The stale-file dialog gives correct words at 1024 px. Correct data goes ½ → 1, and the other criteria are unchanged from round 2. Score **8.5 / 10 (pass, no 0)**. Next step obvious stays ½ (F3, and the live Save in R3-m2). The journey-test file is unchanged.
**D/BIC changes:** D2 4, D5 4 (N1 and R2-m1 fixed). The rest are unchanged.
**Not checked:** GitHub CI `types`/`fast`/`regression` on either head (skipped on the PR events; my local typecheck stands in for them); the graph (P-86) was not re-run for a diff-only round; a real screen reader; D17/D20.

**#3256:** Verdict: Approve (no Blocker or Major).
Reviewer: Approve b41fe99098337d25daef71c071761281b0ad4ab5

**#3180:** Verdict: Approve (no Blocker or Major). R3-m1 to R3-m4 go in as follow-up rows, or are fixed in place.
Reviewer: Approve 366d3ed3bea87675911b1e9b6c62624023fadddd
