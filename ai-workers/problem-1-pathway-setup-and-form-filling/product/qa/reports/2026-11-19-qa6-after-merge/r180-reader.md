# R1.80 — fresh reader verdict ("IRCC forms per applicant from one set of answers")

Reader: fresh Opus, high effort, ran nothing (no app, no test; read files and the read-only git history only). Date: 19 Nov 2026. Main: 3ab13f559 (PR #2235 merged 18:05 IST).

**VERDICT: PARTIAL.** Every pack is green on main's head on GitHub's runners on the checkpoint, twice. QA-165's evidence is met, and qa should close it. One Works condition is still missing: gate A by screens for C7.2 (P-348c, P-434b). R1.80 has no journey test, and nothing on record walks a validated copy by screens to the next capability's first step.

## Per part
**C7.1 (Works, stays).** C7.1-application-type.test.ts on the checkpoint, exit 0, 12/12, in both runs (jobs 135565477115 and 135565881318). Both runs fetched 3ab13f559e9f; "Gate B: passed". No open Blocker, Critical or Major names C7.1. Only Minor or UX rows: QA-447, QA-444, QA-419, QA-406, QA-287, QA-288, QA-139.

**C7.8 (Works, stays).** C7.8.test.ts on the checkpoint, exit 0, 20/20, in both runs (jobs 135565477234 and 135565881182) on 3ab13f559. Only Minors are open: QA-354, QA-356. Its 11 Nov gate A by screens reached Ready to file. There a barcode form "waits for Adobe Validate, the Mac's step", so that walk stops before the validated copy.

**C7.2 (packs and evidence meet the bar; gate A missing).** C7.2.test.ts on the checkpoint, exit 0, 11/11, in both runs (jobs 135565477260 and 135565881082), "run 2" seconds each time.
- Part 1 (5 steps, real API calls on a fresh case): the copy is generated and downloads. A simulated "validated" copy with no barcode page gets `barcodes.checked=true`, `expected=5`, `matched=false`, words naming Validate, and is not current. A later fact change marks the copy out of date. This proves the app's door decodes barcodes and refuses an unreadable copy. It never puts a real validated copy through on CI.
- Part 2 (6 steps) only reads `studio/evidence/c7-2-adobe-validate/result.json` and checks its fields: form, source, combination, sha256 shapes, "Validation completed successfully", reader version 10 or higher, 5/5 decoded, slots_agree = slots_total and 0 unexplained, certification intact, values unchanged, validated sha256 not equal to the copy's, 2 or more screenshots. The 2-second run time agrees: Part 2 opens no PDF and decodes nothing.
- Part 2 cannot tell the new run from the old one. The 13 Nov BK-20 file already passed all six steps (git diff 4aa912c92..3ab13f559 of result.json), which is why the rehearsal on 4aa912c92 was also 11/11. The CI green therefore proves only that the record has the right shape. The proof that the barcodes match the facts is the Mac run itself, which P-442 makes the only place Validate can prove anything.
- Is that enough for "barcodes match the facts"? Yes, for the Paper IMM 5257:
  - Validate passed on the first press on a copy Studio generated (finished story, Paper line, Child 18 or over, Sample).
  - 5/5 barcodes decoded, 186/186 positions agree, 0 unexplained.
  - 75/75 written values read back equal.
  - IRCC's certification was intact after save.
  - The app's own upload door decoded the validated file a second time and gave the same 186/186 ("All 5 barcodes read…", 201, current). That is a check made by code, separate from the person's reading.
  - Both checksums are named. The file in this folder is byte-equal to main 3ab13f559's copy (cmp).

**Does a validation on 4aa912c92 still count on 3ab13f559? Yes.** In `git diff --name-only 4aa912c92 3ab13f559` under studio/, nothing changed in engine/, tools/, the forms or fill code, case-prepare.ts or acceptance/. What did change:
- front-office booking and sales code, and platform code (complaints, entitlements, idempotency, keep-period);
- ports;
- four migrations, none for forms;
- case-close.ts (a new read-only decisions view, CS-C1s), plus its contract and screen.

None of these touches how a form is filled or how a validated copy is read. "before_this_run" also records that the 13 Nov validated file's facts and values hashes still equal the copy, so the fill output has been stable since 13 Nov.

**Gate A (owed; blocks Works).** P-348c: "qa walks the capability by screens to the next one's first step." The Mac run does not meet it:
- (a) A build lead ran it, not qa.
- (b) Its steps happen in Adobe, outside the app.
- (c) The return through the upload door is recorded as HTTP 201 with the API's words. No screen is named, and there is no walk on to the next capability.

Precedent: R1.63, R1.73 and R1.82 take Works from C rows that each passed their own gates. API-only gate A was accepted only where no screen exists (R1.2, R1.9). C7.2 has screens: Prepare application, Ready to file, Record submission. P-606 applies too: no verdict while a part is missing. **Result: PARTIAL, not a follow-up.**

**Open bugs.** I checked every open row naming C7.1, C7.2, C7.8 or R1.80. QA-165 (Gap, Major, C7.2) is the only Major or Critical. Every other row is Minor or UX and does not hold Works (P-305). CI did not make this check for me: every gate B line reads "claims Works for none (no bug check)".

**QA-165: close (qa's act, P-314).** Its stated closing condition is met: "it closes with C7.2's Adobe evidence step". qa also asked for a fresh run after 17 Nov, and the run is dated 19 Nov. A copy Studio generated passed Validate on the first press. That also settles the earlier doubt about the Taiwan PIN and Israel passport boxes: the form's own script accepted the copy. Barcodes match position by position. The fill code is unchanged up to main's head. Record the close in BUGS-CLOSED.md with run 44525774127 and this file.

## Gaps
1. **Blocking for Works: C7.2 gate A by screens.** qa walks by screens at 1024 px on an isolated copy of main 3ab13f559 loaded with the checkpoint, where the loader already re-sends the validated Paper IMM 5257:
   - case › Prepare application;
   - the Paper IMM 5257 shows the validated copy as current, with the barcode words;
   - Ready to file passes that line;
   - an unvalidated upload is refused on screen with the Validate words;
   - open Record submission, the first step of C8.2.

   It needs no new Adobe run and costs US$0. If it passes and QA-165 is closed, C7.2 and R1.80 can be scored Works on these same runs. Re-dispatch only if app code changes first.
2. Follow-up, Minor (pack debt): C7.2 Part 2 checks only the evidence file's shape. An older file passes it equally (the 13 Nov file did). Suggested change: require a date for the run, and fail when the evidence's app commit is older than the last change to the fill or barcode code.
3. Follow-up, Minor: the proof covers one form for one applicant (Paper IMM 5257, Child 18 or over). R1.80's words say "each applicant's forms". result.json cites a founder rule that one form is spot-checked (P-726). That rule is not in this reader's folder, so qa should confirm it against DECISIONS.md. The screenshots are in the shared private notes on the Mac and were not seen by this reader. A spot-check by qa is optional.

## Runs and jobs relied on (all on GitHub-hosted Ubuntu runners, checked out at 3ab13f559e9f, GATE_B_DATA=checkpoint)
- Run 44525657410 (the tech lead's dispatch): job 135565477115 C7.1 12/12; job 135565477234 C7.8 20/20; job 135565477260 C7.2 11/11.
- Run 44525774127 (qa's independent re-run): job 135565881318 C7.1 12/12; job 135565881182 C7.8 20/20; job 135565881082 C7.2 11/11.
- Evidence: result.json on main 3ab13f559 (PR #2235). Validated on main 4aa912c92 at about 11:29 IST; copy sha256 ca33c678…; validated sha256 d0a2e944….
- Not relied on: nightly 44471642021, job 135382343344, on 4aa912c92 (log not in this folder; context only).
