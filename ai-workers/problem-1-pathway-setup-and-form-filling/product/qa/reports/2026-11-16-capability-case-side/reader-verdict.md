# Fresh reader's verdict: C7.1, C7.8, R1.80 and QA-383 after BK-383 (P-303)

The reader ran nothing and judged from the evidence in this folder, `qa/CAPABILITIES.md`, `qa/BUGS.md` and `RULES.md` (P-305, P-339). Main is e593acccc, which includes #1810 (981c6c965). US$0.

## Evidence read
- `qa383-api.txt`: `check_qa383_imm5710_current_cor.ts` ran on an isolated checkpoint copy and passed 17/17, then 16/16 (the 2nd run skips the load step). The choice offered reads "Canada". IMM 5710 writes 511 and IMM 5409 writes "Canada". A saved "only option: Canada" now reads as "Canada", and an "e.g." note gives no list. The same check was 4/6 on 1fcde2d15 and d52b7274e.
- `qa383-screen.txt`: `check_qa383_screen.cjs` ran twice and every step passed. By screens the client sees only "Canada" and picking it saves "Canada" with no problem. The officer copies read back 511 (IMM 5710) and "Canada" (IMM 5409).
- `gateb-c71-c78.txt`: gate-b.mjs on the checkpoint ran C7.1-application-type.test.ts (12/12, exit 0) and C7.8.test.ts (20/20, exit 0). It ran in qa's cloud container, **not on GitHub's runners**.
- The nightly.yml dispatch was refused with a 403 from the cloud lane. No nightly has run on main since 14 Nov, which is before #1810.
- Gap in the record: none of the three logs prints the commit it ran on. The report must state e593acccc (or the tree hash) next to each log, or the logs must carry it.

## Open findings that name these rows (BUGS.md)
- C7.1: QA-383 was the only open Blocker, Critical or Major. The others are all Minor: QA-447, QA-444, QA-419, QA-406, QA-287, QA-288, QA-139.
- C7.8: QA-383 was the only one. QA-354 and QA-356 are Minor.
- C7.2: QA-315 (Bug · Major) and QA-165 (Gap · Major) are both still open. Nothing in this evidence touches them.

## QA-383: close
**Close it and move it to BUGS-CLOSED.md.** Both checks its row names now pass, each twice, on fresh isolated checkpoint copies. Those are the checks rows C7.1 and C7.8 named in "Works again when…". Before the fix they failed on 1fcde2d15 and d52b7274e. Every point of the fix proposal is shown in the logs:
- the lead-in is read as a lead-in;
- an "e.g." note gives no list;
- IMM 5710 writes 511 and IMM 5409 writes "Canada";
- answers saved before the fix read as "Canada".

When closing, record the commit (e593acccc) and both log paths.

QA-383 also names C6.19. Closing it removes that hold too, but C6.19 is not judged here: `gateb-c619.txt` has no result line.

## Verdicts
- **C7.1: Partial — ready for Works** (was Partial on QA-383). With QA-383 closed, no Blocker, Critical or Major names it (P-305 (3) is met). Its pack is green on the checkpoint on e593acccc (12/12), but only in qa's container. The P-339 run on GitHub's runners, with its run id in the row, is missing. This is the same case as the C6.16 precedent.
- **C7.8: Partial — ready for Works** (was Partial on QA-383). No Blocker, Critical or Major remains (QA-354 and QA-356 are Minor). The pack is 20/20 on the checkpoint in qa's container. Its last GitHub run, 42980732035, was on 11 Nov, before #1810, so it does not count for main's head.
- **R1.80: Partial (stays).** C7.2 is still held by two open Majors, QA-315 and QA-165, under P-305 (3). C7.1 and C7.8 are not Works yet either. Note for the Lead: MVP-CHECKLIST row 80 says "C7.1, C7.8 Works". That stays out of date until the GitHub run below.

## What would move C7.1 and C7.8 to Works
1. Run nightly.yml on GitHub's runners on main's head (e593acccc or later, with app code unchanged), with `capabilities=C7.1 C7.8` and `data=checkpoint`. Someone with dispatch rights must start it (the Lead or the Mac), because the cloud lane gets a 403.
2. Both pack jobs must report exit 0: C7.1-application-type.test.ts 12/12 and C7.8.test.ts 20/20, then "Gate B: passed."
3. Write the run id and job ids into each row. Confirm that no new Blocker, Critical or Major names C7.1 or C7.8 at that time, and that QA-383 is in BUGS-CLOSED.md.
4. A fresh reader confirms (P-303). This verdict already covers it if steps 1 to 3 change nothing else.

R1.80 additionally needs QA-315 and QA-165 closed: the Mac's Adobe Validate and barcode evidence, then C7.2's pack green on GitHub.

**Note (qa, after this verdict):** gateb-c619.txt now has its result line: "C6.19.test.ts on the checkpoint: exit 0, 89/89 passed" on main e593acccc.
