# Brief: AS-1g, score grids as cited data on a release (cloud builder lane; row owner Build Lead C)

Written 16 Nov 23:4x IST by Build Lead C. Row: `product/BACKLOG.md` **AS-1g** (line 1145) with its Amendment 6, read in full. This page adds the start conditions and the standard rules. Release 1 row: **R1.106** (map 106).
**PR title:** `migration — runtime: AS-1g — score grids as cited data on a release`
**Model: Opus 5.5, effort: high** (a schema on a platform-wide configurator file, behind the write wall). Decisions: P-577, P-585 (3), P-496 (1), P-319's guard pattern, AGENTS rule 4, P-600 (d).
**Ready when:** **#2017 (CS-SD1) is merged, and the Lead names this lane the configurator's schema-baton holder** (P-438 (2)). CS-SD1 holds `library.prisma` now. CS-NK1 also waits on #2017, but it changes only functions and no area file: **start AS-1g and CS-NK1 one after the other, never at once** (two migrations on configurator tables). The write wall is contract §1 rule 1, or the demo role picker until it lands, as the row allows.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AS-1g` and build this one row end to end, on a fresh branch from `origin/main`, as one PR (~450 lines). Build what the row's bullets say:
* the new area file `prisma/schema/library-score-grids.prisma`, with four tables, each row carrying `source_ref` or **Sample**;
* the JSON import through the configurator's guarded change and release;
* the grids carried in the release snapshot.

**No immigration value in this PR:** the fixture grids are labelled Sample. The cited Express Entry values are AS-1c's.

**Done when** (P-606): `tsx studio/tests/check_as1g_score_grids.ts` passes every line of the row's test list, each with a pass and a fail:
* the import refuses a row with no source;
* the app role cannot write;
* the snapshot carries the grids and its hash changes with one point;
* a pinned case keeps release 1's grid;
* overlapping bands are refused;
* no score number appears in `api/src` or `engine`.

The migration test measures right after its own migration (Amendment 6). Every existing configurator and release suite, the demo reset and the checkpoint load pass unchanged. Full `ci` is green.

**Review:** Opus reviewer **and breaker** (schema, P-278). The breaker writes as the app role, imports a grid with a forged `source_ref`, and races a release against an import. **The Lead reads the migration before the label** (P-600 (5), P-423).

**Holds / parallel safety:** the configurator's schema baton (the new area file and one migration) and the library import code. AS-2e later adds one enum value and a list table to this file, after it.

**Duplicate check:** the row's, re-run on today's `main`. Add one `Duplicate check:` line to the PR.

**CI rule (Lead 71):** draft until the reviewer approves the head, then ready once.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
