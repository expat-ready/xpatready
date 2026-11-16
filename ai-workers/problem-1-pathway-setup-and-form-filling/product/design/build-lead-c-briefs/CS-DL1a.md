# Brief: CS-DL1a, part 1 of CS-DL1: the one open-day function and the deadline view (cloud builder lane; row owner Build Lead C)

Written 16 Nov 21:0x IST by Build Lead C (P-644). **Approved for building**: the case-side shaping lane's draft `product/design/briefs/CS-DL1.md` on `main` is the specification; where this page and the draft differ, **this page wins**. Release 1 row: **R1.74 (map 74), part 1 of 2**.
**Model: Opus 5.5, effort: high (deadlines a client can lose a case on).** Decisions: AG-7-94, AG-7-96 r2/r5, AG-7-99, P-412 F13 (b), P-607; Lead 61's rulings on #1867 (comment 6900282370); Lead B's OK for `platform/calendar/` (comment 6900265123, rev 16.31).
**Ready when:** **now**: PF-21v #1848 merged 15 Nov 20:27 IST. Build **Part 1 (CS-DL1a)** of the draft only (~350 lines).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-DL1 part 1` and take **this one part** end to end on a fresh branch from `origin/main`, one PR. Read the draft brief named above for what to build, the touch list, the named test cases and the duplicate check; read only the files it names.

**Done when** (P-606): `tsx studio/tests/check_csdl1_deadlines.ts` exits 0 with DW1-DW6 each passing and failing as named; `check_pf21_complaints.ts` and the PF-21w/PF-21v suites pass **unchanged** (the move proof); C6.17 suites, demo reset, checkpoint load, module cards pass; full `ci` green.

**Review:** Opus reviewer **and breaker** (deadlines; P-278): DW6 with bad dates, DW2 on runs of closed days.

**Holds / parallel safety:** Touches Lead B's `leads.ts` and `open-minutes.ts` at the import line only; tell any FO lane holding them (merge `main` on a conflict).

**Note:** Part 2 (CS-DL1b) is the next brief for this lane: `build-lead-c-briefs/CS-DL1b.md`.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
