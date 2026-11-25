# CS-NK1 review: the shared-field name key in the database equals normalizeLabel (bug row, runtime, schema)

Reviewer: fresh Opus 5.5 reviewer (did not build it), 17 Nov 2026. Commit reviewed: `91f92691ad1d854b4afeadafa11be4e682a70b13` on `claude/runtime-csnk1`
(the branch tip is `origin/main` a5428877f plus this one commit; `main` has no newer migration).
**Note:** while this review ran, the builder pushed `d0b8c9308` ("Final_Sigma written out, backfill reads the label the trigger
reserved"). This review is for 91f92691ad only. Re-review only the new commits (P-277), checking them against issue 1 below. Brief:
`claude/build-lead-c-647b40:…/design/build-lead-c-briefs/CS-NK1.md`. Journey test: `journey-test-reviewer-2026-11-17.md` (9/10).

## What I ran (ports 4638-4639 only, PostgreSQL 18.3, Node 24.21, Unicode 17 / ICU 78.3)
* `tests/check_csnk1_name_key.ts 4638 xr_studio_runtime_csnk1r` on a fresh isolated copy: **16 passed, 0 failed** (21 s).
* Fresh copies: `check_prisma_schema.ts` 8/0, `check_cssd1_no_drift.ts` 17/0, `check_forms_c36_rule_facts.ts` 42/0, `check_gcore_b2_door.ts` no FAIL line.
  `check_forms_b86_door.ts`, `check_forms_x5_library.ts` (74/4) and `check_b104_checkpoint.ts` fail on "IMM 0008 is not in the library". The
  cause is this cloud copy: `tools/read_form_identity.py` exits with `ModuleNotFoundError: No module named 'pypdf'`, and the API log has no
  unique-key error. Same family as the known c119 failure. CI is the judge for these and for checkpoint load.
* My own probes, read-only except on my isolated copy (scripts in the session scratchpad, not committed):
  every assigned code point in three more contexts; the 25 Oct key put back on the copy for the API race; the migration applied again on live rows.

## Checked and holding
* **Touch list:** two files, a new migration folder and the new test. The trigger `canonical_field_name_reserve`, `library.prisma` and the writers are untouched.
  The function keeps its name and signature (`CREATE OR REPLACE`). It gains STRICT and PARALLEL SAFE, which change nothing because the trigger passes `COALESCE(label,'')`.
* **Key steps match normalizeLabel's order:** NFKC, then lower case, then ignorables removed, then `[^L N M]` removed. `pg_unicode_fast` does the full mapping (İ → i̇).
  On the brief's corpus (Café, Ñ, ß, İ, full width, Hindi, Thai, Arabic, CJK, emoji, ZWJ, RLM) the two keys are equal. Alone and between letters,
  every one of 159,865 assigned code points is equal (I re-ran this, and also `ss` and `e·s`). Marks are proven: `किसान` is not `कसान`, and `é name` is not `e name`.
* **The stored key, not an expression index:** a later PostgreSQL Unicode upgrade can only make the keys stale, never corrupt the index, and the DW1 scan in CI shows it.
* **Backfill:** it reads the newest version that is not SUPERSEDED and not merged, which is the label the trigger wrote. On the demo data, 164 of 164 name rows equal
  normalizeLabel of that label, with no empty keys and no non-ASCII labels, so the PR body's NOTICE list from the demo is empty.
  The two-step update is correct under the partial index: rows that change are set to `''` first, then given their key, and the collision step leaves at most one non-empty key per (workspace, group).
  Collisions: the smallest field key keeps the name, the others get `''` and are listed by NOTICE. I applied the migration again on my copy after 20 old-key races: it listed the 20
  `rv_b*` rows, kept `rv_a*`, and deleted or renamed nothing. Running it again changes nothing (DW4 in the test, confirmed).
* **Rollback note:** recreate the 25 Oct function, then run the backfill block again. This is sound because the block works with whichever key function is installed.
* **DW2 is a real test:** with the 25 Oct key put back on my copy, the suite's API race (two PATCH `/name` at once, Café-crème and Café crème) let **both land 20 of 20**.
  With this row's key, one 200 and one 409 "already a field's name in this group" every time (suite and browser).
* **Every DW line has a pass and a fail case** (DW1 old key differs on Café and Ñ; DW2 old key both land; DW3 `कि-सान!` refused; DW4 stale keys before).
* **Migration safety:** one transaction (CREATE OR REPLACE, temp table, DO block). It needs PostgreSQL 18, because `pg_unicode_fast` does not exist in 17, despite the brief's wording "PG17+".
  The Mac (`start.sh`) and CI both pin 18.

## Issues (ranked)
1. **Major — the key is not equal to normalizeLabel when a capital Σ follows only case-ignorable characters at the start of a name, and the test cannot see it.**
   PostgreSQL 18's final-sigma check treats a string start reached through case-ignorable characters as "preceded by a cased letter".
   JavaScript, and the Unicode Final_Sigma rule, do not. For the name `'Σ x`, the database gives `ςx` and the app gives `σx`. **2,526** assigned code points differ in the context `<c>Σ x`,
   ASCII `' . : ^` among them. This is not the Unicode 16/17 gap: on ASCII it never closes. Both directions break the brief:
   *stricter:* in the browser, a field renamed `ς 1tdf`, then another renamed `'Σ 1tdf`. The preview says "Checks passed" and Rename is enabled. The save is refused
   with 409 `"'Σ 1tdf" is already a field's name in this group`, though no field has that name (journey J5, both runs; API probe: `ς 1` 200, then `'Σ 1` 409).
   *laxer:* `'Σ x` and `'σ x` are one name to the app (`σx`) but two keys in the database, so a race lets both in, which is the defect this row fixes.
   The DW1 scan wraps each code point only alone, as `A<c>b`, and as `ΑΣ<c> x`. It never puts the code point *before* Σ, so its stated residual of 54 is wrong.
   Before Σ there are also 98 Unicode-17 cases in `Α<c>Σ x` (new case-ignorable marks U+1ACF–U+1AEB and others), and one canonical-order case (`e U+1AEB U+0301`).
   **Fix (stays option A):** put a non-cased, non-case-ignorable character in front before lowering, e.g. `lower(' ' || normalize(…, NFKC) COLLATE pg_unicode_fast)`. The
   `[^L N M]` step then removes it. I checked it on every code point: `<c>Σ x` drops from 2,526 to 54, `'Σ'` gives `σ`, and alone, `A<c>b`, `ΑΣ<c> x` and `ΑΣ<c>` are unchanged.
   Add `<c>Σ x`, `Α<c>Σ x` and `e<c>U+0301` to the DW1 scan, add `'Σ 1` / `ς 1` to the DW3 pairs, and list the true remaining residual.
   With the fix, all of it involves characters new in Unicode 17 (Sept 2025) that PostgreSQL 18 does not know yet.
2. **Minor — the migration comment claims more than holds.** It says the key equals normalizeLabel "on every code point" "as the browser does" and does not name the residual. The Lead reads the
   migration before the label (P-600 (5)). State the Unicode-17 residual and the start-of-string Σ handling there and in the PR, as a stated (not silent) gap
   against "every input" (P-188).
3. **Minor — the brief's line that `pg_unicode_fast` exists on "PG17+" is wrong (it is new in 18).** Say in the PR that the migration requires PostgreSQL 18, which the Mac and CI pin.

**(A) or (B):** (A) is acceptable once issue 1 is fixed. The corpus gate in the brief passes. The remaining gap is limited to characters added in Unicode 17, and the exhaustive scan in CI flags any drift when Node or PostgreSQL upgrades.
(B) would touch every writer of `canonical_field` and is not needed for that. If the Lead wants exact equality for every input regardless of Unicode version, only (B) gives it. That is the Lead's decision; I do not ask for it.

## D1–D20 (schema row; 1–5, N/A where nothing on screen changed)
D1 3: BR-6 key matches on the corpus and nearly all code points, but not "every input" (issue 1) · D2 3: the race is closed for Café/Ñ (20/20); a narrow refuse-what-the-app-allows hole remains (issue 1) ·
D4 N/A · D5 4: migration atomic, idempotent, rollback written · D6 N/A (audit lines unchanged; only successful renames logged, checked) · D7 N/A · D8–D12 N/A (no UI change; refusal words checked in the journey) ·
D13 N/A (unchanged; axe clean on the rename dialog at 1024 px) · D14 N/A · D15 4: 480k keys in seconds; no per-row request · D16 3: a pass and a fail per DW, but the DW1 scan misses the before-Σ contexts · D3, D17–D20 N/A (D17/D20 simulated only).
BIC-01–BIC-20 (`EXPERIENCE.md` §6): N/A. This is not a case-side screen.

## Not checked
The breaker's runs (50 parallel renames across scripts, a rename back and forth in one transaction) belong to the breaker (P-278). The 400 px width and 200 % zoom were not run, because there is no UI change.
I did not run `graph.mjs`: it rewrites `qa/GRAPH.md`, which I may not write. The full `ci`, the demo checkpoint load, and the three suites blocked by `pypdf` were not run here.
The PR body (Duplicate check line, NOTICE list) does not exist yet.

Verdict: Changes needed
1. Major: start-of-string final-sigma mismatch (2,526 code points, ASCII included). The database both refuses names the app allows and lets app-equal names in. The DW1 scan misses the before-Σ contexts and its 54 residual is wrong. Fix with a leading space before lower(), widen the scan, list the true residual.
2. Minor: the migration comment and PR must state the remaining Unicode-17 residual instead of "equal on every code point".
3. Minor: say in the PR that `pg_unicode_fast` needs PostgreSQL 18 (the brief says PG17+).

## Round 2: d5b3ee9d3705beeff5cb93d143b3d2fba9e14eab (only the new commits d0b8c9308 and d5b3ee9d3, P-277)
Read: `git diff 91f92691ad..d5b3ee9d37` (the migration, the test, and records). Ran on a fresh `runtime_csnk1r` (:4638), PostgreSQL 18.3, Node 24.21.
* **Suite: 16 passed, 0 failed.** DW1 now scans 159,865 code points in six settings with no exception list.
* **Issue 1 (Major) is fixed.** Every Σ is now lowered by Final_Sigma, written out as a lookbehind and lookahead over Node-generated Cased and Case_Ignorable ranges, before `lower()`, so PostgreSQL's own sigma rule never runs.
  * Nine contexts beyond the suite's six, each over every assigned code point, give 0 differences: `<c><c>`, `e<c>`, `ΑΣ<c>` at the end, `Σ<c>a`, `a'<c>Σ`, `ΑΣ'<c>`, `<c>ΣΣ<c>`, `Α<c>Σ<c>Β`.
    The one exception is `<c>U+0301` at U+1AEB, which is the named F2 residual.
  * API, both directions: `ς 1` 200, then `'Σ 1` **200** (was 409), then `'σ 1` 409 "already", because it equals `'Σ 1` under normalizeLabel.
  * Cost: 5,000 apostrophes then Σ, 5,000 Σ, and 2,000 `'Σ` each take about 23 ms per call including the psql start, so the lookbehind does not blow up.
* **F2 residual accepted as stated.** It covers 34 Unicode-17 marks that PostgreSQL 18's NFKC does not reorder. PostgreSQL's normalization equates only strings that Unicode 17 also equates, so this can make the database looser (open to a race) but never stricter. It is now named in the migration comment with its code points.
* **Minors 2 and 3 are fixed:** the comment names the residual and says PostgreSQL 18 is required.
* **F4 backfill:** it picks the version whose label gives the stored key under either rule, newest first. DW4 covers a retired older version that the trigger wrote last.
  On my copy, 167 of 167 rows equal normalizeLabel with no empty keys, and running the migration again changed nothing (same hash, no NOTICE).
* The breaker's F3 (on main) and F5 are outside this row's touch list, so recording them as PR follow-ups is right. The PR's NOTICE list from the demo is empty.
* **Not run here:** full `ci`, the checkpoint load and the three `pypdf`-blocked suites (see above). The builder reports gcore_b2_door, cssd1_no_drift and prisma_schema green.

Verdict: Approve d5b3ee9d3705beeff5cb93d143b3d2fba9e14eab

## Round 3: be057af25bc82ff5028628a20d608dad3a5e12c2 (only the fix commit be057af for the two Devin findings, P-277)
Read: `git diff d5b3ee9d37..be057af25` (the backfill block, DW4 in the test, records). Ran on a fresh `runtime_csnk1v` (:4641), PostgreSQL 18.3, Node 24.21.
* **Suite: 18 passed, 0 failed** (28 s). It has the two new DW4 checks, and the NOTICE lists `n4`, `rb`, `yz` on both runs.
* **Lock order matches the trigger.** `canonical_field_name` has one writer, the AFTER trigger on `canonical_field` (`library.prisma:73`; no direct write in `api/src`, `tools` or seeds).
  So any session that writes the name table already holds ROW EXCLUSIVE on `canonical_field`, and it takes that lock first. The block takes the same order.
  Once it has SHARE ROW EXCLUSIVE on `canonical_field`, nothing that writes can hold `canonical_field_name`, so the second LOCK is granted at once. VACUUM can delay it, but it is no cycle.
  Earlier statements in the migration take no table lock: CREATE OR REPLACE FUNCTION only, and callers never lock functions. Reads (ACCESS SHARE) and FK key-share (ROW SHARE) do not conflict with the backfill's lock.
* **No deadlock, shown through Prisma, not only psql.** On a probe database I deployed every migration with `prisma migrate deploy`, put the 25 Oct key back, wrote rows under it and deleted the CS-NK1 row from `_prisma_migrations`.
  I then opened an API-like write transaction and ran `prisma migrate deploy` again. I ran two variants: the first write skips the trigger (a `meaning` update), or the first write fires it (a label update). In both, a later label update in the same transaction then fired the trigger.
  `pg_locks` showed the deploy waiting (`ShareRowExclusiveLock` not granted, the whole migration file as one query, so one implicit transaction). The writer's second update was granted and committed, and the deploy then applied (`finished_at` set).
  The writer's row ended on the new key (`nuevonombreñ`, `ersteü`), and the Café pair gave `cafécrèmez` and `''`.
* **The race fix closes Devin finding 1.** In READ COMMITTED, each statement in the DO block takes a new snapshot after the LOCK. A writer that was running commits first and is seen; a writer that arrives later waits.
  I also checked a writer whose trigger plan was already warm on the 25 Oct function. It waited on a psql-held migration and, after commit, reserved `späterö`, the new key. So the waiting rename is planned again against the new function, and no stale key lands.
  The lock has no `lock_timeout`, so a long open write transaction on `canonical_field` holds the deploy, and field writes queue behind it. API transactions are short, so this is a note, not a finding.
* **Prisma runs the DO block** (`LOCK` and `CREATE TEMP TABLE … ON COMMIT DROP` inside it). The isolated copy's deploy and my two probe deploys applied it. LOCK inside PL/pgSQL needs no explicit BEGIN, so the test's psql run and Prisma's implicit transaction both work.
* **Fix 2 is right and needed.** Mutation check on the `ya`/`yz` case: after this migration, the d5b3ee9 backfill run a second time moves `yz` from `''` to `differenty`. That breaks "run once more, changes nothing", and the new DW4 check fails on exactly this (`before !== after`).
  On the brief: a row that was `''` on 25 Oct now stays `''` even if its newest label no longer collides. That still meets DW4 as written, because it is a legacy duplicate and the NOTICE lists it (`own <> ''`). No rule that re-derives `''` rows from the newest label can be idempotent here.
  On the impact: no `''` rows exist in the demo data (204 and 167 names on the two copies), and the trigger re-keys such a row on its next write. The PR body says "A row already `''` stays `''` on a later run". It could add "including a 25 Oct duplicate on the first run" (wording only).
* **The NOTICE is correct, but `prisma migrate deploy` does not print it.** I checked this with a real collision on a Prisma deploy: `yz` became `''`, exit 0, no NOTICE in the output.
  The durable list is the `SELECT … WHERE name_key = ''` line in the migration. The breaker's F5 follow-up already covers showing it to a person. The brief's "lists those rows in a NOTICE" is met.
* **The new DW4 checks prove the behaviour.** Removing the two LOCK lines lets the rename land within the 500 ms window (`waited` false, FAIL). Removing the `CASE` fails the second-run check, as shown above.
  Minor test note: the "reads are not held off" check would hang, not fail, if a lock that blocks reads came in (it has no timeout). It is not blocking.
* **CI on be057af:** `module-cards` is red because of `api/src/front-office/MODULE.md`, which has 42 lines on `origin/main`. This PR does not touch it, so it is not this diff's fault. The rest is green, skipped or neutral.
* **Journey score: 9/10, carried from round 1** (`journey-test-reviewer-2026-11-17.md`). This diff changes no screen, API or trigger code. The one effect a user can see, a rename during a deploy, I walked at the data level above: it waits, then lands with its own name.
* **Not run here:** full `ci`, the checkpoint load, and the `pypdf`-blocked suites (as in rounds 1 and 2).

Verdict: Approve be057af25bc82ff5028628a20d608dad3a5e12c2
