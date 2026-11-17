# Brief: CS-V1 part 2, schemas for the 16 unparsed case-side inputs no other lane holds (cloud builder lane; row owner Build Lead C)

Written 16 Nov 21:0x IST by Build Lead C (P-644). **Approved for building**: the case-side shaping lane's draft `product/design/briefs/CS-V1.md` on `main` is the specification; where this page and the draft differ, **this page wins**. Release 1 row: **R1.10 (map 10), case half, PR 2 of 4**.
**PR title:** `runtime: CS-V1 part 2 — …` (board rule, Lead 69: "<ID> part N"; a title without "part" counts as the whole id)
**Model: Opus 5.5, effort: medium.** Decisions: STANDARDS §6, P-606, P-610.
**Ready when:** after **CS-V1 PR 1** is on `main`. Not while AUD-1m part 1 or CS-N1 is open on `review-rounds.ts` / `readiness.ts` (one at a time; Build Lead C checks before the start line).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-V1 PR 2` and take **this one part** end to end on a fresh branch from `origin/main`, one PR. Read the draft brief named above for what to build, the touch list, the named test cases and the duplicate check; read only the files it names.

**Done when** (P-606): `tsx studio/tests/check_csv1_inputs.ts` exits 0 with PR 2's DW cases (the ten methods leave the allow-list); the case suites of the touched files (`tools/check-select-suites.sh`) and their browser suites pass unchanged; full `ci` green.

**Review:** Opus reviewer only.

**Holds / parallel safety:** Holds `review-rounds.ts`, `readiness.ts`, `form-additions.ts` and their `contracts/` files.

**Scope ruled 16 Nov 22:3x IST** (PR #2007 comment 6923205608, answering comment 6922592037). `review-rounds.ts` already parses all 5 (measured), so it leaves the plan. **Part 2 is these 16 `ALLOW` entries:** readiness ×2, form-additions ×6 (2 bodies + 4 queries), case-documents ×2, features/case-close ×4, assessments ×1, fill-case ×1. **Part 3a:** case-prepare pdf-copy and sign-steps ×2. **Part 3b:** runtime.ts ×2. Over 800 lines: stop and ask, and it splits as part 2a (readiness, form-additions, case-documents) and part 2b (case-close, assessments, fill-case). It stays in #2007's lane (Lead 70).

**Note:** PR 3a and 3b wait on the Bake's tag (P-499) and CS-D1b / CS-K1, CS-NT1 part 1, CS-W1.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix. This replaces any older "draft until approved" line on this page.
