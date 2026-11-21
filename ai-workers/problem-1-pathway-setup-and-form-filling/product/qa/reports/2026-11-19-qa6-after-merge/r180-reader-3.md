# R1.80: third fresh reader's verdict ("IRCC forms per applicant from one set of answers")

**VERDICT: WORKS**

Works on C7.1, C7.2 and C7.8, provided the two conditions below hold when qa writes the row. Reader: fresh Opus 5.5, independent; it did none of this work. I ran nothing (no app, no test). I read the files in this folder, the rules, the decision rows, the C7.2 pack, the Validate helper, the upload door, and the read-only git history. Date: 19 Nov 2026.

## Reasons
**1. Gate A as reader 2 defined it: met in substance (P-348c, P-322).**
- *Data:* the configured checkpoint was loaded by screens (Demo › Load the configured checkpoint). No finished-story loader was used, and no step was uploaded or filed by code. The persona was the Case officer at 1024 px, on an isolated copy whose app code equals main 4a4b6bc00.
- *C7.2's own step, done by screens:* the copy was generated with the button and downloaded with the line's Download. The file was then sent through the line's own "Read back the validated copy" control (`walk.cjs` `setInputFiles` on the labelled input). That control posts to the same door as the API (`web/src/runtime/forms.tsx:109` → `POST form-copies/:id/validated`, `fill-case.ts:608`).
- *Refusal seen on screen:* screenshot 03 shows the words from `fill-case.ts:511`, "This is the copy the product made, unchanged: it was not validated… press Validate…". The line stays "Not validated yet".
- *Validated read-back seen:* screenshot 04 shows the "Validated copy read back" chip, "Read back again", and the toast. The 5 of 5 barcodes appear only in the chip's title and in the audit line quoted by the walk (QA-516).
- *Not yet filed, and the next capability's first step:* the case had not been filed. Ready to file (C7.6's first step; precedent: C7.8's gate A) is reached after a reload. On the walk's account, Client A's block is gone and Send for review is enabled. Screenshot 05 does **not** show this (see 5a). That claim rests on qa's walk text. It is backed independently by the CI screen check `tests/check_bk19_validate_browser.ts:110`, "Ready to file no longer names a missing validated copy (the next step, C7.6, opens)", which runs the same door with the same kind of synthetic file.
- Reader 2's 1(c) asked for a *Paper* line. The walked line is IMM 5257 as a PDF upload. I accept that: the rule covers every barcode form, whatever its channel (P-171: "always Validate barcode forms"; the Ready to file rule: "a barcode form without its validated copy read back… blocks").

**2. The synthetic validated file does not block Works.**
- Adobe's Validate is the form's own script in Acrobat, outside the app (P-442, P-533: "never lower; Validate is the form's own script"). The bar is unchanged, because the Adobe half is proven by C7.2 Part 2's `result.json`:
  - Validate passed on the first press;
  - 5/5 barcodes, 186/186 positions, 75/75 values read back;
  - the certification is intact;
  - and the *same door* read the real Adobe file back (201, current).
- Gate A tests the app's screens, and the app's own step is the door.
- Precedent: BK-19's screen check uses `simulate_validate.py … barcodes` for exactly this purpose ("SYNTHETIC: BK-20 proves Adobe's"). Reader 1 and `r180.md` both said the gate A walk needs "no new Adobe run".
- One limit, stated plainly: a synthetic file's barcodes are written from the copy's own data, so "5 of 5 matching" in step 4 proves only that the door decodes and compares. It does not prove Adobe's barcodes. Part 2 proves those.
- Reader 2's 1(b) asked for "the Mac's validated file". That file cannot reach a cloud copy (QA-285), and it would go out of date after any change to a fact (P-171 (1)). Real file through the door (API) plus the screen control with a synthetic file (walk) together cover the claim.

**3. P-339 on main's head: met (relying on qa's reading).**
- `git log -1 origin/main` = 4a4b6bc00 (#2282, 18:50 IST, CI-only).
- Studio is unchanged from 6f2caced0 to 4a4b6bc00, so the runs include #2214's `Audit.log` rewrite.
- `git diff 4a4b6bc00 HEAD -- …/prototype` is empty.
- Pack run 44532804494 and re-run 44532809449 report C7.1 12/12, C7.2 11/11 and C7.8 20/20, checked out at 4a4b6bc00c51 on the checkpoint, "Gate B: passed". **I could not open these runs; I relied on the log lines qa quotes in `r180-walk-2.md`.**

**4. Open bugs.** No open Blocker, Critical or Major in `qa/BUGS.md` names C7.1, C7.2, C7.8 or R1.80. I checked every open Major and Critical row. QA-165 is closed. QA-516, QA-447 and QA-76 are Minor or UX and do not hold Works (P-305).

## Conditions (both must hold when qa writes the row)
- **C1 (P-339):** main's head is still 4a4b6bc00, or its studio tree is equal. I did not fetch. If app code has merged since, read the diff for fill, barcode, audit and readiness code, and re-dispatch if any of it changed.
- **C2 (the evidence record):** the records commit adds the walk's own output for steps 0 and 5. That is `walk.cjs`'s stdout, the "S1 ready:" and "S5 ready after reload:" lines, or a screenshot of Client A's own Ready to file panel. It also commits the QA-516 row, which today exists only in the uncommitted working tree (AGENTS rule 10). If the log or a re-run (US$0) shows Client A still blocked, this verdict reverts to PARTIAL.

## Follow-ups (Minor, not holds)
5a. **The screenshots do not match their names.**
- 01 ("one block") and 05 ("client-a-no-block") show the same region: Partner (Sample)'s lines, then "Visitor visa: Child (Sample)". Neither shows Client A's block, or its absence.
- `walk.cjs` writes eight `.png` files with other names, but five `.jpg` files were committed.
- Name the evidence after what it shows.

5b. **Gate A was walked by a local script, not by walks.yml (P-700; qa skill "Recorded walk").** R1.80 has no `tests/journeys/j_80.ts`, so the "no recording" fallback applies. The walk was also headless and once only, at 1024 px only (skill §2). Turn `walk.cjs` into j_80 so it replays on GitHub. Cite a green BK-19 screen-check run on main's head.

5c. **UX (new; EXPERIENCE "one state per thing"):** after the read-back (screenshot 04), the line reads "Validated copy read back". The copy's own "Validated copy uploaded back" step stays greyed with a lock, under "Not yet: 10 facts to answer…". qa should say whether that is intended, then log it or explain it. If the officer answers those facts, the validated copy goes out of date (P-171 (1)) and Validate is needed again.

5d. `evidence/c7-2-adobe-validate/result.json` cites P-726 for the one-form spot-check; the right rows are P-533 and P-542 (2). Under P-542 (2) the founder's spot-check never holds the proof, but it is due within 48 h of the 19 Nov ~11:29 IST run. qa confirms that it happened.

5e. `handover.md` holds a local home-folder path that contains a personal name (AGENTS rule 5). Replace it with a path that names no one.

5f. Still carried: reader 2's follow-ups 4–6 (QA-386 seen again; the pack's Part 2 checks only the evidence file's shape; the proof covers one form for one applicant).

## What I relied on
- Files:
  - in this folder: `r180-walk-2.md`, 5 screenshots and `walk.cjs`; `r180-walk.md` and screenshot 01; `r180.md`, `r180-reader.md`, `r180-reader-2.md` and `handover.md`;
  - the rules: CAPABILITIES rows C7.2 and R1.80 and the R1 header; RULES.md P-339 and P-348c; `rules/works.md`; the qa skill §2, §4 and Gate A;
  - decision rows P-171, P-322, P-339, P-348, P-442, P-533, P-542, P-700, P-726, P-728, P-732 and P-733 (P-46 has no row of its own in DECISIONS.md);
  - the code: `acceptance/C7.2.test.ts`, `tests/runtime/validated.ts`, `tools/simulate_validate.py`, `api/src/sample-validated.ts`, `fill-case.ts:511` and `:608`, `web/src/runtime/forms.tsx:109`, `tests/check_bk19_validate_browser.ts`, and the `result.json` fields.
- Git: `git log origin/main` (head 4a4b6bc00); `git diff 4a4b6bc00 HEAD -- prototype` (empty); `git diff 6f2caced0 4a4b6bc00 -- studio` (empty); `git show --stat c150286da`.
- Not opened: runs 44532804494 and 44532809449 (the quoted log lines are qa's reading); the Adobe screenshots in the Mac's private notes; the BK-19 check's CI run.
