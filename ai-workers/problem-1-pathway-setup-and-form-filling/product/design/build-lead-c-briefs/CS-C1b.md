# Brief: CS-C1b, the active-case count and the plan-limit check at opening (cloud builder lane; row owner Build Lead C)

Written 16 Nov 21:0x IST by Build Lead C (P-644). **Approved for building**: the case-side shaping lane's draft `product/design/briefs/CS-C1b.md` on `main` is the specification; where this page and the draft differ, **this page wins**. Release 1 row: **R1.77 (map 77); its last checklist part (CS-C1a #1818 merged 15 Nov)**.
**PR title:** `runtime: CS-C1b — …` (board rule, Lead 69: "<ID> part N"; a title without "part" counts as the whole id)
**Model: Opus 5.5, effort: high (permissions, plan limits, a hook in `runtime.ts`).** Decisions: P-606, P-607, P-610, P-526b, P-576, P-278; contract §6-§7 (case side).
**Ready when:** **now**: CS-C1a #1818 is on `main` (15 Nov 21:33 IST). PF-15 is not on `main` and has no open PR (read 21:0x IST): create `ports/entitlement.ts` with PF-15's exact name and signature and the allow-all fake, exactly as the draft says; build no plan table.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-C1b` and take **this one part** end to end on a fresh branch from `origin/main`, one PR. Read the draft brief named above for what to build, the touch list, the named test cases and the duplicate check; read only the files it names.

**Done when** (P-606): `tsx studio/tests/check_csc1_count.ts` exits 0 with DW9-DW14 each passing and failing as named; `node tools/check-port-contracts.mjs` exits 0; `check_csc1_close.ts`, `check_a24_case_number_api.ts`, the C6.11 and C6.17 suites, the demo reset and the checkpoint load pass unchanged; module cards pass; full `ci` green.

**Review:** Opus reviewer **and breaker** (permissions, plan limits; P-278): DW11 under 10 parallel openings, DW12 through the API. Build Lead C reads the `runtime.ts` hook before telling the Lead it may be labelled (P-423).

**Holds / parallel safety:** This lane **holds `api/src/runtime.ts` `createCase`** until merged; CS-K1 and CS-NT1 part 1 wait for it (P-526b, P-576).

**Note:** R1.77 also carries QA-397 (C8.2, Major, open): not this part; Build Lead C shapes it separately.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix. This replaces any older "draft until approved" line on this page.
