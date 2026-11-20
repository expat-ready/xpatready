# R1.80: second fresh reader's verdict ("IRCC forms per applicant from one set of answers")

Reader: fresh Opus 5.5, high effort. I ran nothing: no app and no test. I read the files in this folder and the read-only git history (`git log` and `git diff` between 3ab13f559, 6f2caced0 and origin/main). Date: 19 Nov 2026.

**VERDICT: PARTIAL.** Two conditions block Works:
- (1) Gate A for C7.2 is not met: the walk viewed the finished results instead of doing C7.2's own step by screens.
- (2) The pack runs are on 3ab13f559. Main's head is now 6f2caced0, and the app code between the two changes the code path C7.2 runs (P-339).

QA-165 can still close: its evidence is met, and I agree with the first reader.

## 1. Does the walk meet gate A (P-348c) for C7.2 and R1.80?
**Data: finished story instead of the configured checkpoint. Acceptable.**
- P-322 decides the data a pack's verdict counts on. The packs ran on the checkpoint ("GATE_B_DATA: checkpoint", "on the checkpoint: exit 0" in all six logs).
- C7.2's own state is also on the checkpoint: Client A's IMM 5257 reads "Validated in Adobe on the Mac and read back equal" (walk, setup 1).
- The finished story was loaded through the product's own Demo screen, and it holds the checkpoint plus the family case taken further.
- There is precedent: C10.2's gate A walked "Load the finished story". C8.2's gate A used the pack's helpers as set-up, which was not under test.
- Not a gap.

**C7.2's own step was not walked by screens. Blocking.**
- C7.2's one action inside the app is to upload the validated copy back and have its barcodes read. The other half of that action is the refusal of a copy whose barcodes cannot be read.
- On this walk, the finished-story loader made the upload through the API (step 1 shows "validated copy of 19 Nov, 18:44": the moment the loader ran). The refusal was not walked at all (step 4: "by API only").
- What the screens show is the result: the chip "Validated copy read back", with "barcodes 5 of 5 read" only in its hover title (screenshot 01).
- That is viewing a result, not walking the capability by screens.
- The reason given was "the browser pane has no file picker". That is a gap in tools, and the founder's standing rule says missing tools are never a limit. File-upload tools are already listed in this environment (Playwright `browser_file_upload`, Chrome `file_upload`); if they cannot be used, qa proposes an install.
- C10.2 is not a precedent for this. There the capability itself is loading the story, so viewing the result is the walk.

**The next capability's first step was reached only as a finished record. Blocking (same walk).**
- The loader recorded the submission through the API. So the move from C7.2 to Ready to file to Record the submission was done by code, not by a person on screens.
- Ready to file (step 2) was seen after filing ("all 4 filings Submitted · Approved"). It shows the rule's words, but not the Paper line passing *because* its validated copy was read back.
- "Correct a number…" (screenshot 02) is a later C8.2 control. C8.2's first step is "Record the submission"; C8.2's own gate A opened that dialog on an unrecorded case.
- Either next step is acceptable:
  - C7.6, Ready to file: C7.8's gate A precedent counted "Ready to file lists it (C7.6's first step)".
  - C8.2, Record the submission.
- Either way, the walk must reach that step by screens from a state that is not yet filed.

**The walk is on 6f2caced0 and the packs are on 3ab13f559. Blocking, as P-339 rather than gate A.**
- The rule says the pack must be green "on main's head". It does not ask the walk and the runs to share a sha. Precedent accepts a moved head only when the app code is equal:
  - C7.1 and C7.8, 16 Nov: "App code on af7df6d62 is e593acccc's".
  - C8.2: "P-339 met by tree".
- In this folder's git refs, origin/main is 6f2caced0 (#2214, AUD-1m part 1). Its diff from 3ab13f559 changes 13 studio files and rewrites `Audit.log` in `api/src/core.ts`: every line now goes through AuditPort, with a `caseIdOf` query.
- `Audit.log` is called on C7.2's path: `fill-case.ts:408` when a copy is generated, and `:557` when the validated upload door reads a copy back. It is also on C7.8's path: `form-additions.ts:243`.
- The app code is therefore not equal. The runs on 3ab13f559 no longer prove main's head. Some reassurance: on 6f2caced0 the loader's generation, validated upload (barcodes 5 of 5) and filing record all succeeded on screen. That is reassurance only: a walk is not a pack run.
- Repeating the runs on the walk's sha is what P-339 requires anyway, because 6f2caced0 is main's head.

## 2. Verdict: PARTIAL
Everything else is met:
- C7.1 12/12, C7.8 20/20 and C7.2 11/11, in two independent runs on GitHub-hosted runners (ubuntu-26), on the checkpoint, at 3ab13f559e9f.
- The Adobe evidence (result.json) holds:
  - Validate passed on the first press.
  - 5/5 barcodes, 186/186 positions agree, 0 unexplained.
  - 75/75 values read back equal.
  - The certification is intact.
  - The upload door returned 201 and current.
- No open Major or Critical names C7.1, C7.2, C7.8 or R1.80 once QA-165 closes. QA-514 and QA-515 are Minor and name C9.2 and authoring.
- I checked the first reader's reasoning on Part 2, the equivalence from 4aa912c92 to 3ab13f559, and QA-165, and I agree with it.

## Gaps
1. **Blocking for Works: gate A for C7.2 by screens.** One walk on an isolated copy of main's head, Case officer, 1024 px, US$0. The case is set up to the Paper IMM 5257 awaiting its validated copy; pack helpers are allowed as set-up, as for C8.2. Then:
   - (a) upload the generated, unvalidated copy and see it refused on screen with the Validate words;
   - (b) upload the Mac's validated file and see "Validated copy read back", 5 of 5 barcodes;
   - (c) Ready to file passes that Paper line;
   - (d) open Record the submission (C8.2's first step), or name C7.6 as the next step at (c).
2. **Blocking for Works: P-339 on main's head.** A nightly.yml dispatch on 6f2caced0, or main's head when scored, with `capabilities="C7.1 C7.2 C7.8"` and data=checkpoint, plus qa's independent re-run (P-290). US$0. If the gate A walk runs on that same head, the two line up.
3. **Follow-up, Minor (UX):** the barcode result appears on screen only as the chip's hover title, not as visible words on the line. Log it as a new Minor.
4. **Follow-up, Minor (existing QA-386, re-seen on 6f2caced0):** a recorded Paper filing still reads "Print and sign in pen · In progress" (screenshot 01). Also, step "3. Signed in pen: done" is cut off in screenshot 01: the claim rests on the walk text alone.
5. **Follow-up, Minor (pack debt, carried over from the first reader):** C7.2 Part 2 checks only the evidence file's shape, and an older file passes it equally. It should require a run date and a commit no older than the last change to the fill or barcode code.
6. **Follow-up, Minor (carried over):** the proof covers one form for one applicant (Paper IMM 5257, Child 18 or over). P-726, the founder's spot-check of one form, is not in this folder. qa confirms it against DECISIONS.md.

## Runs and jobs relied on (GitHub-hosted, ubuntu-26, checked out at 3ab13f559e9f, GATE_B_DATA=checkpoint, "Gate B: passed")
- Run 44525657410 (the tech lead):
  - job 135565477115: C7.1, 12/12
  - job 135565477234: C7.8, 20/20
  - job 135565477260: C7.2, 11/11
- Run 44525774127 (qa's re-run):
  - job 135565881318: C7.1, 12/12
  - job 135565881182: C7.8, 20/20
  - job 135565881082: C7.2, 11/11
- Evidence: result.json. Validated on 4aa912c92; copy sha256 ca33c678…, validated sha256 d0a2e944….
- Walk: r180-walk.md and screenshots 01 and 02, isolated copy of 6f2caced0.
- Diff: 3ab13f559..6f2caced0, studio, read with git.
