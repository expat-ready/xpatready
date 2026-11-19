# Review: CS-NT1 part 1 (CS-NT1a): plain notes on a case (R1.76, map row 76, case half)

**Commit reviewed:** `e8cc6fbfbd2407c4ae0678d9dcbbbd4e1c5b2585` on `claude/hopeful-planck-csbott` (4 commits over `origin/main`, 11 files, +722/−2). Reviewer: a fresh Opus 5.5 that did not build it, acting as reviewer and breaker (P-278). Spec, in priority order: `build-lead-c-briefs/CS-NT1-1.md` → `design/briefs/CS-NT1.md` "Part 1" → AG-13-20/-21/-23/-24, BR-4, §10 → STANDARDS §3-§7. API and schema only (the panel is part 4), so the screen checks (BIC table, keyboard, 1024 px, axe) are N/A.

## What I ran (on this commit, Linux cloud copy, PG 18 on :54329, live AI off, US$0)
* `tsx tests/check_csnt1_notes.ts`: **46 passed, 0 failed** (11 s). `check_case_feed.ts` 42/42, `check_csc1_close.ts` 55/55, `check_prisma_schema.ts` 8/8.
* `product/tools/typecheck.mjs` (CI's step, 8 GB heap): **no new type errors** (15 known). `module-cards.py tree` PASS. `module-cards.py pr` (diff from origin/main, empty body): **FAIL on api-features** (see m5).
* Isolated server `rv_csnt1` on :4681 (`PLATFORM_IDENTITY=local`, sample seed). The builder's walk ran with 30/30 OK: checkpoint load, open a case, add, pin, mark client-visible, client read (user-P) shows only it, officer read has no `notes`, user-Q 404, edit seen by client, back to INTERNAL hides it, history 4 versions, firm B 404 on 4 routes, Reset-to-six removes notes, full Reset, checkpoint reloads. My own break pass (`scratchpad/rv/break.mjs`) is in the journey report. Server stopped; its api.log holds no note text.

## Spec fit (brief + draft part 1)
Schema, area file and rule line, one migration with a unique stamp (later than `20261119051500`) and `case_note_*` functions, insert-only triggers (UPDATE/DELETE/TRUNCATE), DB-clock `created_at`, firm checked by trigger, the 6 routes behind PF-4's guard with `@PermissionKeys`, 404 for another firm (also firm A's note through firm B's own case, and a sibling case of the same firm), author/Owner/Admin edit (403 `NOT_NOTE_AUTHOR`), client read through one hook filtered in SQL, `case note` in `CASE_ENTITIES`, audit lines with before/after version ids and no text, DW1-DW7 each pass and fail: **all present and working.**

**The builder's choices, judged:**
* *No FK; trigger takes `FOR KEY SHARE` + firm check + AFTER DELETE cascade.* **Agree.** It is the lock an FK check takes, the delete-waits race is covered, the cascade fires on `case.deleteMany` (reset verified live) and on cascaded workspace deletes, and it keeps `cases.prisma` free for CS-K1 as the brief asks. Gap: a `TRUNCATE runtime_case` would leave orphans (no code path does it today; `demo.ts` sweepOrphans also cleans by workspace). Acceptable.
* *Pin/visibility need only case:edit; text edits need author/OWNER/ADMIN.* **Agree** (brief, AG-13-24).
* *`agent/note:share-with-client` for writing CLIENT_VISIBLE and for taking it back.* **Agree with the key** (AG-13 §10 row: "Mark a note client-visible (separate from creating an internal note)"; PF-3 already seeds it on all four case:edit roles, so nothing changes for seeded users). But it has no test (M2), and the text-edit path leaves a hole in it (m1).
* *Version named on every change → 409 `NOTE_CHANGED`; optional idempotencyKey; advisory lock.* **Agree.** Verified: stale → 409 with current note; pin vs visibility race on one version → one 200, one 409; 10 concurrent adds with one key → 10× 201, 1 row; key reused with other text → 409.
* *Audit lines carry version ids, never text.* **Agree** (brief); verified in `audit_event`.
* *`api/tsconfig.json` + `src/case-notes/**/*.ts`.* **Agree**, needed; say it in the PR body as outside the touch list.

## Findings

**Blocker:** none.

**M1 (Major) — the notes read paths are not indexed (STANDARDS §5 [M] "Read paths indexed").** `prisma/schema/case-notes.prisma:34` / `migration.sql:77` index `(firm_id, case_id, note_key, version)`, but `clientNotesOf` (`service.ts:72`) and `current()` (`service.ts:101`) filter on `case_id` only. Evidence (`enable_seqscan=off`, live DB): `Bitmap Index Scan on case_note_firm_id_case_id_note_key_version_idx (rows=190, all of them)` with `Filter: (case_id = …)`: no Index Cond, a full read. `clientNotesOf` runs on every client `GET cases/:id` and so inside every client view and answer save (`runtime.ts:562/570` embed `get`). **Fix:** make the index `@@index([caseId, noteKey, version])` (or add `firm_id` to both WHEREs: `current` has `c.firmId`). The migration is not merged yet, so it is a one-line change now and a new migration later.

**M2 (Major) — the share-key rule has no test (STANDARDS §3.10 and §7 [M]).** `needShare` (`service.ts:168`, `:222`, `:230`) is never false in the suite: every seeded role with `agent/case:edit` also holds the share key, and the only "share" fail case (`check_csnt1_notes.ts:249-250`, Billing) is refused by the guard's `agent/case:edit` (MISSING_PERMISSION from PF-4), not by `needShare`. So removing both `needShare` calls would leave every check green (found by reading the test and the seeded keys; I did not edit code to prove it). **Fix:** in the scratch DB, give one staff member a role without the key (e.g. delete `('CASE_OFFICER','agent/note:share-with-client')` from `platform_role_permission` for a second firm-A officer's role, or a custom grant); assert 403 `MISSING_PERMISSION` and no row on a CLIENT_VISIBLE add and on `PUT …/visibility`, and 201 for the INTERNAL add.

**m1 (Minor) — the text edit of a CLIENT_VISIBLE note skips the share key.** `editText` (`service.ts:204-210`) lets an author without `agent/note:share-with-client` rewrite what the client reads (found by reading the code; live, an edit of a client-visible note reaches the client read at once, shown by an Owner, who does hold the key). No seeded user is affected (m-level). **Fix:** call `needShare` in `editText` when `n.visibility === "CLIENT_VISIBLE"`, or write down why not in the PR body.
**m2 (Minor) — a non-author's stale edit is answered 409 with the current note before the 403.** `service.ts:192` checks the version before `make()` runs the author check (`:207`). Live: Case Manager, version 1 of a v2 note → 409 `NOTE_CHANGED`. Nothing leaks (`agent/case:show` lists it anyway), but the person retries and only then gets 403. **Fix:** check the author first for text edits.
**m3 (Minor) — the request schemas live in `service.ts:42-51`, not `contracts/runtime.ts`** (STANDARDS §6 [M] contract first; `case-close.ts:18-19` moved its schemas there in CS-V1 part 2). The part 4 panel will need them. `contracts/` is outside the touch list: ask in the PR, or name it for part 4.
**m4 (Minor) — the client read is proved by a regex over `runtime.ts`** (`check_csnt1_notes.ts:244-247`) plus a direct `clientNotesOf` call; the real `GET /api/runtime/cases/:id` as user-P is only in the builder's scratchpad walk, not in the repo. **Fix:** move that walk's three client-read steps into a suite the Lead can rerun, or attach its output to the PR.
**m5 (Minor, PR body) — `module-cards.py pr` fails on api-features** (`api/src/features/case-notes.ts` changed, `features/MODULE.md` not). **Fix:** `Card unchanged: api-features — one feature file registering CaseNotes, as case-close.ts` in the PR body. The PR body also needs: AG-13-24 text-not-copied note, `Duplicate check:` line, tsconfig line outside the touch list, no back-relation needed on `cases.prisma`.
**m6 (Minor) — the list is unpaged** (`service.ts:134-139`; STANDARDS §6 cursor pagination). Part 3's keyset timeline covers the long view; fine for part 1 if the PR says so.

## D1-D20 (API part; 1-5)
D1 Requirement fit 4 (all part-1 rules mapped; share-key rule untested) · D2 Data integrity 5 (insert-only, firm/workspace/author/version checks in the DB, races and duplicates refused) · D3 Reuse 4 (INVISIBLE/LONE, Audit, case-feed reused; schemas not in contracts) · D4 Rule integrity N/A · D5 Stability 5 (double add with key, race, reset, reload of checkpoint) · D6 Governance 5 (every version kept, audit per change) · D7 AI trust N/A · D8-D13 N/A (no screen; part 4) · D14 Team look N/A · D15 Speed 4 (all calls ≤ 50 ms; M1 unindexed read) · D16 Testability 3 (46 checks; one rule has no failing test, M2) · D17 simulated only · D18 Provenance 4 (author, last changed by, versions) · D19 N/A until part 4 · D20 simulated only.

**BIC-01-20 (EXPERIENCE §6):** N/A, no screen in this part (part 4 brings the panel and its concept).
**Journey score (reviewer, API-level): 8.5 / 10, pass** (`journey-test-reviewer-2026-11-19.md`).

## Not checked
Browser, keyboard, axe, 1024 px / 200 % (no screen). `graph.mjs` (it rewrites `qa/GRAPH.md`; I may write only this folder). Full `ci`, the case suites beyond the three named, and a rerun on `main` merged in. The Build Lead's migration read (P-600) is theirs.

Verdict: Changes requested

To fix before Approve: M1 (index the `case_id` read path), M2 (a pass and a fail test for `agent/note:share-with-client`). The Minors may go in the same commit or be answered in the PR body.

## Re-review: head `cb6cc6bb45e2d9c29430468c30c870d4871f688e` (new code commit only)
I read only `git diff e8cc6fbf..cb6cc6bb -- prototype/studio` (service.ts, case-notes.prisma, the migration, check_csnt1_notes.ts; the commit before it is records only). Reran on this head: `check_csnt1_notes.ts` **56/56**, `check_case_feed` 42/42, `check_csc1_close` 55/55, `check_prisma_schema` 8/8, `typecheck.mjs` no new errors (15 known), `module-cards tree` PASS.
* **M1 closed.** The index is `(case_id, note_key, version)` in both `case-notes.prisma:34` and `migration.sql` (the migration is unmerged, so editing it in place is fine; DW7's `migrate diff` still names nothing). Both case-only reads now start on the index's first column. The new check asserts the index definition.
* **M2 closed.** New DW5 fail/pass pair (`check_csnt1_notes.ts` "review M2, m1"). CASE_OFFICER loses the share key in the scratch DB and officer two signs in again. Then: a CLIENT_VISIBLE add, a visibility change both ways and a text edit of a client-visible note each give 403 `MISSING_PERMISSION` with no row written. An INTERNAL add gives 201 and an internal edit 200. The key is restored afterwards. With `needShare` a no-op, the four 403s would become 2xx and the check fails, so the rule's test now fails when the rule is removed. That is from reading the test; I did not mutate the code myself.
* **m1 closed:** `editText` calls `needShare` when the current version is CLIENT_VISIBLE.
* **m2 closed:** the new `may(n)` callback runs before the version check, so a stale non-author gets 403 with no `current` in the body (tested).
* **Break m1:** keys are lowercased before the lock, the history and the audit. The three-letter-case race test gives one 200 and two 409s.
* **Break m2:** P2003, or the trigger's "no case", maps to 404 inside `run()`. The add's P2002 handler still only takes P2002. Tested with a psql delete racing an add, and no orphan is left.
* **Break m3:** the API's set (INVISIBLE ∪ HIDDEN ∪ LONE) covers the database's new `case_note_text_check` set, NUL aside (PostgreSQL cannot store it), so the database CHECK cannot 500 on API input. I checked this character by character. LOOKS_BLANK is API-only (stricter than the database), and ZWJ emoji and CRLF are kept (tested).
* **m3, m5, m6** are answered in the PR body and **m4** (the walk output) goes there too, as the coordinator states. I did not see the PR body. The Lead checks those lines with the label.

No new findings.

Verdict: Approve cb6cc6bb45e2d9c29430468c30c870d4871f688e
