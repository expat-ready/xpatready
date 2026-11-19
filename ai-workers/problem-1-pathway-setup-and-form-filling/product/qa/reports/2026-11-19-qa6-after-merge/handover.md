# qa 6 hand-over — 19 Nov 2026 ~18:5x IST (context limit, P-565)

**Lead:** Lead 94 (local_8d88d9c8-bb18-4895-af87-797aa32c61bf). Rows: R1.80 (now qa 6's again), R1.77, R1.74, R1.8. Prep and every earlier finding: `prep.md` here.

## R1.80 — Partial, two blocks left (fresh reader 2: `r180-reader-2.md`)
* Records PR **#2283** (head 7157e8d, Reviewer: Approve 7157e8d, non-draft): R1.80 Partial; QA-165 closed; QA-514 and QA-515 (Minor retry flakes). Needs the Lead's `review: approved` label.
* Evidence branch **`claude/qa-6-r180-walk`** (7a323c15e, stacked on #2283): the first walk (`r180-walk.md`, 2 screenshots). Reader 2 judged it not enough: it only viewed what the finished-story loader did.
* **Block 1: P-339 on main's head.** #2214 (AUD-1m part 1) changed `Audit.log`, which C7.2 calls. Runs dispatched on main **4a4b6bc00**: pack run **44532804494**, independent re-run **44532809449** (`capabilities="C7.1 C7.2 C7.8"`, data=checkpoint). Read the "packs (C7.x)" job logs for "N/N passed". If main moves again before scoring, check the app diff for fill/audit code.
* **Block 2: gate A by screens for C7.2, doing the step.** As Case officer at 1024 px on an isolated copy of main's head:
  (a) a case whose Paper IMM 5257 waits for its validated copy (pack helpers allowed as set-up; e.g. on the configured checkpoint, file one person's IMM 5257 on Paper with a reason, C11.6, and generate a copy);
  (b) upload the unvalidated generated copy: refused on screen with the Validate words;
  (c) upload a validated file: "Validated copy read back", 5 of 5 barcodes;
  (d) Ready to file passes that Paper line (C7.6 counts as the next step), or open Record the submission (C8.2).
  * Tools that work here: **Playwright MCP** (`browser_file_upload` works; browser_navigate to localhost:4473 succeeded). The browser pane has no file picker.
  * Validated PDFs: `<the main copy on the Mac>/.tools/solution-1-prototype/validated-imm5257/` (paper-1f7fed6b-validated.pdf, paper-9c00dbfc-validated.pdf; the checkpoint's sample loader reads this folder). The fresh Adobe run's PDF and screenshots are in the private notes `side-session-notes/local_28bf6046…/r180-adobe-2026-11-19/` (never commit PDFs).
  * Isolated copy recipe (sandbox): export `/tmp/claude-501/m` (refreshed to main 6f2caced0 at 18:15 IST; refresh with `git archive origin/main ai-workers/problem-1-pathway-setup-and-form-filling packages | tar -x`, keep the links). `studio/node_modules` is a local folder of per-package links into `lucid-bardeen-f90377`'s node_modules, plus local copies of `.prisma` and `@prisma/client` (writable). **Run `./node_modules/.bin/prisma generate` after every refresh** (the launcher skips it when the copied client looks newer; a stale client broke checkpoint row 12 on :4472). Start: `cd …/studio && zsh $TMPDIR/qa/isolated-m.sh <name> <port> start --ttl 60`. Demo loads need the Configuration author, and RESET on a non-empty copy. Copies :4472 and :4473 end at their TTL (~19:3x–19:4x IST).
* After both blocks pass: a fresh reader (high effort), then a records commit stacked on #2283 that moves C7.2 and R1.80 to Works and folds in reviewer 1's three Minor notes (closing time: the commit was ~18:2x IST, not 18:4x; "nightly workflow dispatched by Lead 94"; add the one-form spot-check clause, P-726, to the row) plus reader 2's follow-ups (chip-only barcode words, UX Minor; QA-386 seen again; pack Part 2 debt).

## R1.77, R1.74, R1.8
* **R1.77:** #2169 merged 15:19 IST. J-77 is **#2263** (batch #2278 with #2262 at ~18:0x). When it merges, ask the Lead for walks.yml `j_77` on main twice, then a fresh reader.
* **R1.74:** #2000 (CS-DL1 part 1) still queued; its batches failed on others' suites (`prep.md`). CS-DL1b and J-74 not up yet. QA-471 holds it.
* **R1.8:** #2214 (AUD-1m part 1) merged 18:15 IST. AUD-1m 2a, 2b and J-8 not up yet.

## QA numbers
QA-514, QA-515 used (#2283). Next free: **QA-516** (scan BUGS.md and BUGS-CLOSED.md on every non-mergify remote branch first).

## Watchers
This session's background watchers die with it; a new session starts its own (loop in this session: poll `/pulls/<n>` merged_at every 5 min).
