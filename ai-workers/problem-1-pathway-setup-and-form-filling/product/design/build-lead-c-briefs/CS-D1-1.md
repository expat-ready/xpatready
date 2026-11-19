# Brief: CS-D1 part 1, case documents stored per firm through FilesPort (cloud builder lane; row owner Build Lead C)

Written 19 Nov 20:3x IST by Build Lead C (3), from `CS-D1-shaping.md` (next to this file) and the draft `product/design/briefs/CS-D1.md` on `main`, which is the specification; **this page wins** where they differ. Release 1 row **R1.65** ("Private storage in Canada: firm-prefixed keys, versions, encryption", `qa/CAPABILITIES.md` line 222, Not built). Part 1 of 2; CS-D1 part 2 (client-link uploads, scan wait) follows in the same lane.

**PR title:** `migration — runtime: CS-D1 part 1 — case documents carry their firm and are stored through FilesPort under the firm's prefix`
**Model:** Opus 5.5, effort high (schema, a backfill on every case document, a file move, another firm's keys).

**Ready when:**
* **#2253 (CS-D1t) is on `main`.** This part changes the same two upload doors (`case-documents.ts` `upload()`, `case-checklist.ts` `upload()`) and builds on its `checkFile` call. Branch after it merges.
* **Schema slot:** `prisma/schema/evidence.prisma` (`CaseDocument` only). No open PR touches `evidence.prisma` (checked 19 Nov 20:3x IST). Stamp the migration later than every one on `main` at the time you open the PR, and unique (P-600).

**What to build:** the draft's **part 1**: the "Schema", "two upload paths", "two readers" and "move tool" bullets, with test cases DW1-DW6. Plus, carried from #2253's reviews (shaping file, "Carried into CS-D1 part 1"):
* a `flags` column on `CaseDocument` holding PF-F4's "contains scripts" mark;
* both doors at PF-F4's 25 MB document limit (`check_c64_storage_api.ts`'s 20 MB lines change as the draft lists, and only those);
* a per-case cap on the PDF reader pool (as `ACTIVE_PER_CASE` in `fill-case.ts`), so one case's slow uploads cannot make another person's PDF answer 503;
* the checklist-line door checks the line takes uploads before it reads the PDF;
* the built note's "cut short, even by 10 bytes" wording corrected for the ~1 KB window after an earlier end marker in an updated PDF.

**Not in this part:** client-link uploads (DW7), waiting for a clean scan (DW8), and the officer's acceptance; they are CS-D1 part 2. The upload doors registering with `UploadDoorPort` and reads through PF-F3's gate wait on Lead B's PF-F2 and PF-F3. `path` stays as the fallback until the move tool reports 0 missing.

**Named test cases** (P-606): the draft's CS-D1 DW1-DW6, in `tests/check_csd1_files_port.ts`, a pass and a fail each. Add:
* **DW-F (flags):** a PDF with a script is stored with the flag set and shown to staff in words; a plain PDF has none.
* **DW-P (reader cap):** with case A's reader slots full, case B's PDF still answers 200; case A's next one gets the 503 in today's words.
* **DW-L (line state):** an upload on a line that takes none is refused before the PDF is read (a spy shows the reader was not called).

**Done when:** `tsx studio/tests/check_csd1_files_port.ts` exits 0 with every DW line passing and failing as named. `check_csd1t_*` and `tests/journeys/j_67.ts` (from #2253), `check_c64_storage_api.ts` (with only the listed changes), `check_c617_stages_browser`, the case suites, demo reset and checkpoint load all pass. The move tool, run on a copy of the demo data, prints its counts with 0 missing, and the PR pastes them. Full `ci` is green.

**Review:** Opus reviewer **and breaker** (another firm's key, the backfill, the move). The Lead reads the migration before the label (P-423, P-600).

**Duplicate check:** `git grep -nE "storage_key|case-documents/" origin/main -- prototype/studio/api prototype/studio/prisma prototype/studio/tools` shows no FilesPort use on the case side (checked 19 Nov 20:3x IST); open PRs: #2253 only, as above. Put the re-run in the PR.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head, as a line of its own, **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label after a failed merge batch, name the failing suites and show them covered (P-731 (2)). **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files this page and the draft name and the code you change (P-556).

**PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix.
