# Brief: AS-2e, provincial selection in the engine: EOI ranking, province-connection gates, an occupation list (cloud builder lane; row owner Build Lead C)

Written 17 Nov 00:0x IST by Build Lead C. Row: `product/BACKLOG.md` **AS-2e** (line 1149) with its Amendment 6, read in full. Release 1 row: **R1.107** (map 107).
**PR title:** `migration — runtime: AS-2e — provincial selection: EOI ranking, province gates, occupation lists`
**Model: Opus 5.5, effort: high** (rules plus one enum value and one table on the configurator's grid file). Decisions: P-577, P-236, P-650 (2), BR-6.
**Ready when:** **AS-1s and AS-1g are merged**, and the Lead names this lane holder of the configurator's schema baton (`library-score-grids.prisma`). Never at the same time as AS-1c (both touch grid data) or CS-NK1.
**The streams don't matter here.** This row is engine work on Sample fixtures. The founder's card naming the five streams (P-607 (9)) gates AS-2d1 and AS-2d2, not this row.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AS-2e` and build this one row end to end, on a fresh branch from `origin/main`, as one PR (~300 lines). Build only what the row says AS-1s's grids lack:
* the `EOI_RANKING` selection model (a total, no pass mark, no band; P-236);
* province-connection gates in the existing condition language;
* an occupation list as a released reference list.

**Step 0** (from the row): if AS-1s already expresses a stream, this row shrinks to that stream's tests. Say so in the PR.

**Done when** (P-606): `tsx studio/tests/check_as2e_provincial_engine.ts` passes every line of the row's test list, each with a pass and a fail:
* an EOI total with no gap to pass;
* **added (streams proposal): a stream with gates and no grid** (Alberta's Opportunity Stream) gives eligible, possibly or not with reasons, and **no score line**;
* a failed province gate gives NOT, with the gate named;
* an occupation on or off the list;
* release 1's list is kept;
* byte-equal output.

The migration test measures right after its own migration (Amendment 6). AS-1s's and AS-1g's suites pass unchanged. Full `ci` green.

**Review:** Opus reviewer only (breaker no, as the row says). The Lead reads the migration before the label (P-423).

**Holds / parallel safety:** `engine/eligibility/scores.ts` (one selection model) and `library-score-grids.prisma` (one enum value, one list table) with one migration.

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
