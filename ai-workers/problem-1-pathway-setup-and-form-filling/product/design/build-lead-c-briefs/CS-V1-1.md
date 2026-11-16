# Brief: CS-V1-1, PR 1 of CS-V1: the input check over every case-side route (the finder and the allow-list) (cloud builder lane; row owner Build Lead C)

Written 16 Nov 21:0x IST by Build Lead C (P-644). **Approved for building**: the case-side shaping lane's draft `product/design/briefs/CS-V1.md` on `main` is the specification; where this page and the draft differ, **this page wins**. Release 1 row: **R1.10 (map 10), case half, PR 1 of 4 (PF-28 is Lead B's half)**.
**PR title:** `runtime: CS-V1 part 1 — …` (board rule, Lead 69: "<ID> part N"; a title without "part" counts as the whole id)
**Model: Opus 5.5, effort: medium (tests only; no schema, money or screen).** Decisions: STANDARDS §6, P-606, P-610, P-526.
**Ready when:** **now**. Build **PR 1** of the draft only (~350 lines): new `tests/lib/routes.ts` and `tests/check_csv1_inputs.ts`, the allow-list of today's unparsed methods (which only shrinks).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-V1 PR 1` and take **this one part** end to end on a fresh branch from `origin/main`, one PR. Read the draft brief named above for what to build, the touch list, the named test cases and the duplicate check; read only the files it names.

**Done when** (P-606): `tsx studio/tests/check_csv1_inputs.ts` exits 0 with DW1-DW3 each passing and failing as named; `check_forms_qa53.ts` passes unchanged; full `ci` green.

**Review:** Opus reviewer only (breaker no, as the row says); the reviewer plants an unparsed route, a NUL-byte id and a 5 MB string.

**Holds / parallel safety:** New test files only; no overlap with any open lane.

**Note:** When PR 1 merges, every new case route must parse (CS-K1, CS-NT1, CS-T1 already do). PR 2 (`review-rounds.ts`, `readiness.ts`, `form-additions.ts`) is this lane's next brief: `build-lead-c-briefs/CS-V1-2.md`.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
