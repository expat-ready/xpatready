# Brief: AUD-4s part 1, the firm's activity log page: concept with a best-in-class section (records only) (cloud builder lane; row owner Build Lead C)

Written 16 Nov 22:0x IST by Build Lead C. **Approved for building**: the draft `product/design/briefs/AUD-4s.md` on `main` ("Part 1 (AUD-4s-1)") is the specification. Release 1 row: **R1.88** (map 88), parts AUD-4, AUD-4s parts 1-2. **Approver of the concept: Build Lead C** (P-223 (4): there is no board; the approval comes after an independent challenger).
**PR title:** `screens: AUD-4s part 1 — the activity log concept (records)`
**Model: Opus 5.5, effort: medium** for the drafter. The fresh challenger runs at high. Decisions: P-223 (4), P-392, P-352, SA-11-14 (the wording "Your activity log is kept for 7 years for security."), P-473.
**Ready when:** **now.** It reads only the requirement text and AUD-4's brief, and changes no code.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens AUD-4s part 1` and take this one records PR end to end, following the `screen-concept` skill: draft, then a fresh challenge by a new agent that did not draft it, then approval. Read the draft brief for the screen's job, its filters, export and integrity line, and its states.

**Done when** (P-606): `screens/AUD-4s/concept.md` has `challenge.md` beside it with every Blocker and Major fixed. Its best-in-class section names at least three products' audit-log screens and what is taken from each (P-392). The acceptance walk is written as replayable steps for part 2's `check_aud4s_activity_log_browser.ts`. `bash product/tools/brief-check.sh` passes on the PR body. Build Lead C then writes the approval line.

**Review:** Opus reviewer only (records). The challenger attacks from the skill's sides: a person seeing another firm's lines, a filter that hides lines, the export of 2,000 lines, words that promise a legal duty, and keyboard-only use.

**Holds / parallel safety:** `product/screens/AUD-4s/` only. Runs beside every lane.

**Note:** part 2 (the page) waits on AUD-4, AUD-1c part 2 and this concept.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix. This replaces any older "draft until approved" line on this page.
