# Brief: AS-1s, the scoring rules: totals and per-factor lines from a release's grids (cloud builder lane; row owner Build Lead C)

Written 16 Nov 23:5x IST by Build Lead C. Row: `product/BACKLOG.md` **AS-1s** (line 1146), read in full; this page adds the start conditions and the standard rules. Release 1 row: **R1.106**.
**PR title:** `runtime: AS-1s — scores and per-factor lines from a release's grids`
**Model: Opus 5.5, effort: high** (pure rules; the reviewer works at high, P-605 (2)). Decisions: P-577, P-236 (no band for a ranking), BR-6, BR-7, BR-8, AG-3-39.
**Ready when:** **AS-1m and AS-1g are merged.**

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AS-1s` and build this one row end to end, on a fresh branch from `origin/main`, as one PR (~500 lines). Build exactly what the row's bullets say, in `engine/eligibility/scores.ts`, wired into `assess()` with one call. **Sample fixture grids only:** the cited Express Entry numbers belong to AS-1c, not here.

**Done when** (P-606): `tsx studio/tests/check_as1s_scores.ts` passes each line of the row's test list with a pass and a fail. The expected totals are worked out by hand and written in the test:
* a full profile gives the exact total and lines;
* a missing language score makes that line "missing", the outcome POSSIBLY, and the fact is named;
* a failed gate with a high score gives NOT, with the gate named;
* the spouse's language counts only when "with spouse" is true;
* the same input twice gives byte-equal output;
* the FSW gap to the pass mark is never negative;
* a release 2 grid change leaves release 1 unchanged.

AS-1m's and C6.9's suites pass unchanged. Full `ci` green.

**Review:** Opus reviewer at high (breaker no, as the row says). The reviewer recomputes two profiles by hand.

**Holds / parallel safety:** `engine/eligibility/scores.ts` (new), one call in `assess.ts`. Nothing else.

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
