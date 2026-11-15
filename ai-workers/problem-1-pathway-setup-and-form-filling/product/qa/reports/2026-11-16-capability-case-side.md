# qa capability case side, 16 Nov 2026 (00:2x to 01:0x IST)

**Run:** `/qa capability case side group` (P-613 (4)), cloud qa lane, main **e593acccc**. US$0, live AI off, no priced button. Isolated copies only (:4471, :4472, :4473, :4475); the shared demo was not touched.
**Verdict by a fresh reader on Opus that ran nothing (P-303):** `2026-11-16-capability-case-side/reader-verdict.md`.

## 1. Map row 80, re-scored after BK-383 #1810 (merged 981c6c965, 15 Nov 20:59 IST; re-scored within 4 h, P-613 (4))

| Row | Was | Now | Why |
|---|---|---|---|
| C7.1 | Partial (QA-383) | **Partial — ready for Works** | QA-383 closed; pack 12/12 on the checkpoint; only the GitHub-runner run is missing (P-339) |
| C7.8 | Partial (QA-383) | **Partial — ready for Works** | QA-383 closed; pack 20/20 on the checkpoint; only the GitHub-runner run is missing (P-339) |
| R1.80 | Partial | **Partial (stays)** | C7.2 is still held by QA-315 and QA-165 (Majors), and C7.1 and C7.8 are not Works yet |
| C6.19 | Partial (QA-383) | see § 3 | QA-383 named it too |

**QA-383 (Critical) is closed** (row in `BUGS-CLOSED.md`). Evidence, all on isolated copies with the configured checkpoint:
* `tests/qa/check_qa383_imm5710_current_cor.ts`: **17/17, then 16/16** (the second run skips the load step). It was 4/6 on 1fcde2d15 and d52b7274e. It shows that:
  * the one choice reads "Canada", and "Canada" saves with no problem;
  * IMM 5710's copy writes 511 and IMM 5409's writes "Canada", both read back from the PDFs;
  * an answer saved before the fix as "only option: Canada" now reads as "Canada", and its copies write 511 and "Canada";
  * a free-text answer starting "Only choice:" is kept word for word;
  * an "e.g." note gives no option list, and the fill writes no example's code. Log: `…/qa383-api.log`.
* `tests/qa/check_qa383_screen.cjs`: **9/9 twice** (it failed before). The client reaches the question by screens, sees one choice, "Canada", picks it, and no problem is shown. The officer's copies then write 511 and "Canada". Log: `…/qa383-screen.log`.
* Packs, run by gate-b.mjs with `GATE_B_DATA=checkpoint` on fresh copies:
  * "C7.1-application-type.test.ts on the checkpoint: exit 0, 12/12 passed";
  * "C7.8.test.ts on the checkpoint: exit 0, 20/20 passed";
  * "Gate B: passed". Log: `…/gateb-c71-c78.log`.
* **Not Works yet (P-339):** no run on GitHub's runners on main's head. qa's dispatch of `nightly.yml` (`capabilities=C7.1 C7.8`, `data=checkpoint`) was refused with 403 "Resource not accessible by integration", as on 9 to 11 Nov. The last nightly is from 14 Nov, before #1810, and C7.8's own run 42980732035 is from 11 Nov.

## 2. The case-side rows that are merging (scored on a signal, P-606)

| Map row | Parts | State at 00:5x IST | Verdict |
|---|---|---|---|
| 77 case decision, withdrawal, close, reopen | CS-C1a #1818, CS-C1b | #1818 open (labelled `review: approved`, mergeable state blocked); CS-C1b not started | **Parts missing: CS-C1a, CS-C1b** (the PR says so too, P-606 (2)) |
| 109 Complaints record | PF-21w #1823 (merged fc6f21752), PF-21s, J-109 | PF-21s stage 1 in progress; J-109 after it | **Parts missing: PF-21s, J-109** |
| PF-21v | not found on main or in BACKLOG | — | Question 2 below |

## 3. C6.19
QA-383 also held C6.19 (P-305 (3)). Its pack ran on the checkpoint in qa's container: see `…/gateb-c619.log` and the C6.19 row. A GitHub-runner run is needed for Works there too.

## Limits
* The by-screens walk is the scripted client journey only: one headless browser at its default width. I did not replay it at 400, 1024 or 1440 px, and did not use a headed pane.
* No coverage run and no graph refresh: this was a re-test of a single fix.
* I did not walk the main path read-only on :4400.

## Bugs
0 new · QA-383 (Critical) closed.

## Questions for the tech lead
1. Please dispatch `nightly.yml` on main with `capabilities=C6.19 C7.1 C7.8` and `data=checkpoint`. The cloud qa lane gets 403. If C7.1 12/12 and C7.8 20/20 come back green, both rows move to Works with that run id (the reader's step 4 is covered).
2. "PF-21v" is named in the brief, but I find no row by that name in BACKLOG or on main. Which part is it?
3. MVP-CHECKLIST row 80 still says "C7.1, C7.8 Works", which is out of date (reported 15 Nov too).

## Suggestions
* *Later · Scaffolding:* give the cloud qa lane `actions: write`, so P-339 runs do not wait for the Lead.
