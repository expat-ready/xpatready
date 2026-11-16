# Brief: CS-W3 part 0, the walls spike on the case-side tables (records only, no product code) (cloud builder lane; row owner Build Lead C)

Written 16 Nov 22:1x IST by Build Lead C. **Approved for building**: the draft `product/design/briefs/CS-W3.md` on `main` ("Part 0, the spike") is the specification. Release 1 row: **R1.3** (map 3, walls on the case-side tables). PF-12 #1910 is on `main`. CS-W2 waits on this spike's report.
**PR title:** `records: CS-W3 part 0 — the case-side walls spike (contract §8)`
**Model: Opus 5.5, effort: medium** (a measured spike on a scratch copy). Decisions: P-575, P-584, contract §8, Lead B's ruling on #1872 (the `xr_case_lookup` NOLOGIN role).
**Ready when:** **now.** It is a records PR, so the case side's WIP limit does not stop it. It changes no product code and no schema on `main`. Everything runs on a scratch copy of the demo data.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-W3 part 0` and take the spike end to end, as one records PR. Read the draft for what to measure: the walls applied to every case-side table with `firm_id` on a scratch copy, each area's journey under the app role, the files that still query with no firm, and the `Db`-subclass problem.

**Done when** (P-606): the report at `product/design/cs-w3-spike-2026-11-16.md` lists, for each case-side area, the unscoped files found, with the commands and their output pasted. It also gives the census allow-list that part 1 starts from, and a measured answer to contract §8's question. The script is committed under `product/tools/`, so part 1 can rerun it. `bash product/tools/brief-check.sh` passes on the PR body.

**Review:** Opus reviewer only (records).

**Holds / parallel safety:** records only. Runs beside every lane. Never point it at the shared demo database: use a scratch copy.

**Note:** the report decides CS-W3 parts 1-4 and unblocks CS-W2.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
