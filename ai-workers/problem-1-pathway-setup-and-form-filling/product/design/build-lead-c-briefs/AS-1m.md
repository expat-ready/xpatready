# Brief: AS-1m, the eligibility rules move to engine/eligibility/ and EligibilityPort opens (cloud builder lane; row owner Build Lead C)

Written 16 Nov 23:4x IST by Build Lead C. Row: `product/BACKLOG.md` **AS-1m** (line 1144), read with its full text; this page adds only the start conditions and the standard rules. Release 1 row: **R1.106** (map 106, pathway assessment AS-1): parts AS-1m, AS-1g, AS-1s, AS-1c and CS-106c parts 1-2 (FO-15a, FO-15b and FO-15s are Lead B's). Configurator group, which has 0 rows waiting for qa.
**PR title:** `runtime: AS-1m — the eligibility rules move to engine/eligibility/; EligibilityPort with its fake`
**Model: Opus 5.5, effort: medium** (a move with one new port; no schema, no new door). Decisions: P-588, P-584 (7), P-577, P-499, contract v0.1 §2.6 and §3.2.
**Ready when:** **#2007 (CS-V1 part 1) and CS-V1 part 2 are merged.** The row says "not at the same time as any row touching `engine/render.ts` or `api/src/assessments.ts`", and CS-V1 part 2 adds one schema to `assessments.ts` (ruled on #2007, comment 6923205608). Check open PRs for `engine/render.ts` at the start.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AS-1m` and build this one row end to end, on a fresh branch from `origin/main`, as one PR (~400 lines; a move counts once). Build what the BACKLOG row's bullets say: the move unchanged, `condition.ts` and `gates.ts` extracted with re-exports, the one-release re-export, the zod-only port, its fake and the adapter.

**Done when** (P-606): `tsx studio/tests/check_as1m_eligibility_move.ts` passes with every line of the row's test list, each a pass and a fail:
* C6.9's suites are unchanged.
* The demo reset and the checkpoint load are unchanged.
* The import-walk fail case.
* Spouse keys appear only when a gate reads them.
* An unknown release is a typed not-found.
* The port imports only zod.
* One contract test runs against both the fake and the adapter.

Also `node tools/check-port-contracts.mjs` exits 0, module cards pass and full `ci` is green.

**Review:** Opus reviewer only (breaker no, as the row says). The reviewer checks that the move is byte-for-byte (`git diff -M`).

**Holds / parallel safety:** `engine/eligibility/*` (new), `engine/render.ts` and `engine/eligibility-gates.ts` (re-exports only), `engine/runtime/eligibility.ts`, new `ports/eligibility.port.ts` and its fake. AS-1s waits on this row; CS-106c part 1 reads its port.

**Duplicate check:** the row's, re-run on today's `main` (`engine/eligibility/` must still not exist). Add one `Duplicate check:` line to the PR.

**CI rule (Lead 71):** draft until the reviewer approves the head, then ready once.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
