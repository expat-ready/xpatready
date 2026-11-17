# Brief: CS-NT1-1, part 1 of CS-NT1: plain notes on a case, add-only, internal or client-visible (cloud builder lane; row owner Build Lead C)

Written 16 Nov 21:0x IST by Build Lead C (P-644). **Approved for building**: the case-side shaping lane's draft `product/design/briefs/CS-NT1.md` on `main` is the specification; where this page and the draft differ, **this page wins**. Release 1 row: **R1.76 (map 76), case half, part 1 of 4 (FO-2's lead notes are Lead B's)**.
**PR title:** `migration — runtime: CS-NT1 part 1 — …` (board rule, Lead 69: "<ID> part N"; a title without "part" counts as the whole id)
**Model: Opus 5.5, effort: high (personal data, portal visibility).** Decisions: Lead 61's sequencing on #1867 (comment 6900282370: plain notes first, rich text and delete next, all inside Release 1); P-600; P-526b.
**Ready when:** after **CS-C1b** is off review on `api/src/runtime.ts` (merged, or told), because part 1 adds one read hook there. CS-C1a #1818 is on `main`. New area file `prisma/schema/case-notes.prisma` + one migration (unique stamp).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-NT1 part 1` and take **this one part** end to end on a fresh branch from `origin/main`, one PR. Read the draft brief named above for what to build, the touch list, the named test cases and the duplicate check; read only the files it names.

**Done when** (P-606): `tsx studio/tests/check_csnt1_notes.ts` exits 0 with part 1's DW cases each passing and failing as named; `check_case_feed.ts`, `check_csc1_close.ts`, the case suites, demo reset and checkpoint load pass unchanged; module cards pass; full `ci` green.

**Review:** Opus reviewer **and breaker** (personal data, portal visibility): DW3-DW5 through the API. Build Lead C reads the migration before the label (P-600).

**Holds / parallel safety:** A back-relation line on `Case` in `cases.prisma` only if Prisma needs it: ask Build Lead C first (CS-K1 holds `cases.prisma` next).

**Note:** Parts 2-4 follow in series.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix. This replaces any older "draft until approved" line on this page.
