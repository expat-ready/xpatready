# Majors retest, 16 Nov 2026 (qa): QA-445, QA-446, QA-421, QA-427, QA-439

**Asked by:** the tech lead (Lead 64). A bug-fix lane says #1671, #1678, #1644, #1652 and #1643 (merged 12-13 Nov) fix these five Majors.
**Tested on:** origin/main `74b0a25fb` (some runs on `daa6211c9`: the same app plus this round's qa files). Each fix's first parent was also tested, on a scratch worktree.
**How:** one replayable check per bug in `prototype/studio/tests/qa/`. Each reads the row's Expected as a person sees it, with a data check underneath.
* Each check ran on its own isolated copy (ports 4470-4475), started and stopped in the same command. Live AI was off; US$0.
* Twice at 1024 px, once each at 400 and 1440 px.
* Lines word for word: `evidence.md`. Screenshots: `shots/main/`, `shots/before-fix/`.
* The checks were written and run by a qa agent on Opus. The verdicts are the qa lane's, from that evidence.

## Verdicts
| Bug | Fix | Verdict | Check | On main | Before the fix |
|---|---|---|---|---|---|
| QA-445 | #1671 | **Closed** | check_qa445_save_and_continue.cjs (extended) | 9/9 × 4 runs | FAIL at 494b45060 (3 FAIL) |
| QA-446 | #1678 | **Closed** | check_qa446_confirm_rule.cjs | 25/25 × 4 runs | FAIL at fc31b1e95 (14 FAIL) |
| QA-421 | #1644 | **Closed** | check_qa421_release_submit_first.cjs | 12/12 × 4 runs | FAIL at 5dc5e8e1c (6 FAIL) |
| QA-427 | #1652 | **Open, narrowed** to "nothing after submission" (not reachable on screen here) | check_qa427_client_card.cjs | 12/12 × 4 runs | FAIL at 5dc5e8e1c (2 FAIL, then STOP) |
| QA-439 | #1643 | **Reopened** to the bug-fix lane, partial | check_qa439_deciders_first.cjs | 9 PASS, 9 FAIL × 4 runs, the same each time | 13 FAIL at 3316ae6c0 |

## QA-445 (C6.2): Closed
**Steps:**
1. The configured checkpoint. The officer opens the case and adds the spouse and the child with the case page's Add buttons.
2. "Hand to Client A (simulated)", then Start; part 1 is filled on screen.
3. "Save and continue" on each of the next 10 parts, in both families. Before each press, that part's required single answers go through the client's route.

**Seen:** every press opened the part the client's own view names as next not done. Twice, at 400, 1024 and 1440 px.

**Before the fix (494b45060):** "✓ Saved", still "Part 1 of 56 · Details of visit to Canada". The Study permit also stayed on its part 1.

## QA-446 (C6.3, C8.3): Closed
**Steps:**
1. A family case on each pathway (Client A, spouse 38, child 10), with the firm's representative. Client A types everything, dates of birth first.
2. The case page is read on screen.
3. Confirm section on a "0 to confirm" section of the principal.
4. Confirm section on every tab with something to confirm.
5. Round 1 is sent, and the representative's review is read on screen.

**Seen:**
* The principal's and the child's tabs show nothing to confirm; the spouse's does. Household = tabs = API.
* At 0 the button is explained by its message: "…nothing to confirm. Its answers are declared by who gave them (no officer confirmation needed) or confirmed already." It confirms 0, and the answers stay Declared.
* Then the household reads 0 to confirm.
* Checklist: "… declared by Client A · 0 to confirm" for the principal and the child. The spouse's "N confirmed by Case officer (Sample) · 0 to confirm" equals what the officer confirmed (68 and 78).

**Before the fix (fc31b1e95):** "Values confirmed: none yet", "1 fact, by Case officer", "54 facts".

## QA-421 (C5.1): Closed
**Steps:**
1. The configured checkpoint. The load's pending LMIA change is submitted first (P-598).
2. As the author: Visitor visa › Documents › Add a document ("Marriage certificate copy", spouse) › Save to draft.
3. The banner "Review and release (77)".

**Seen:**
* "Next: submit Visitors › Visitor visa for review". The one filled button is "Submit Visitor visa for review →", and there is no "Hand to the Approver". The row reads "Not submitted for review".
* The button opens the combination's own tab. After Submit for review, the hand-off returns. GET /draft agrees.

**Before the fix:** "Hand to the Approver →", and no Submit.

## QA-427 (C6.1): Open, narrowed to one point
**Steps:** the finished story; the thin case; a new family case taken through Client A answering everything, the officer confirming on screen, and the filings sent and approved (API); then the story's recorded case.

**Seen:**
* The thin case: "Next: Client B answers…".
* Client A done: "Client A has answered every part … Next: confirm the answers (91 to confirm…)".
* Confirmed: "Next: prepare the forms and send them for review".
* In review: no "Next:" and no hand-off.
* Approved: "Next: Ready to file, then Record the submission".
* Recorded with 3 of 4 filings submitted: the case's step.

**Before the fix:** client done still read "Next: Client A answers on their phone… Hand to Client A".

**Why it stays open:** the row's Expected ends "and nothing after submission". No case here has every filing submitted: the finished story leaves one filing for paper, and Ready to file needs the validated-PDF path. Only #1652's unit check (`tests/check_qa427_client_card.ts`) covers that state. qa does not close on a point it has not seen (Question 1).

## QA-439 (C6.2, C4.9): Reopened, partial
**Holds:**
* The spouse's list and the Visitor visa child's list start with Personal details.
* The toddler (born 2024, Single, typed on screen) loses Military service, Government positions and Other documentary evidence.
* Purpose comes before its "other" question.
* Custodianship goes once its gate is answered.

**Fails, in all 4 runs:**
1. **Personal details is not first for everyone.** Client A's list starts "National identity document, Signature, Personal details" (Visitor visa) and "National identity document, US PR card, Personal details" (Study permit). The Study permit child's list starts "Details of intended study in Canada".
2. **The toddler keeps "Statutory declaration of common-law union",** on screen and in the client's view.
3. **Gates come after their details:**
   * "The type of IRCC document" comes before "Whether the case is a request to change…".
   * "Details of who pays expenses when not self or parents" comes before "Who will pay the expenses in Canada".
   * "Date the person married…" comes before "Current marital status" (also QA-447 W4).
4. **Custodianship comes first.** Study permit, Client A alone: "Custodianship declaration" is part 5, and Client A's Personal details (which holds its gate) is part 9. The gate is the "17 years of age or less" question, not the date of birth.

Points 3 and 4 match #1643's own review M2.

## Limits
1. **QA-427:** "nothing after submission" was not seen on screen (above).
2. **QA-445:** only the first 11 parts of each family; the fix's own every-part check was not re-run.
3. **Setup through the API:** the client's answers (through the client's own route), review rounds and approvals, and the P-598 pre-submit.
4. **Headless only:** no headed walk, no axe check, no 200% zoom.
5. **QA-421 and QA-427 before-fix runs:** both used 5dc5e8e1c, which is before both fixes.
6. **Worktrees:** the sandbox refused the shared database path through a symlink, so each scratch worktree's `isolated.sh` was edited locally. The edit was never committed, and the worktrees are removed.

## Questions for the tech lead
1. **QA-427:** close it on #1652's unit check, or keep it open until a screen walk reaches a case with every filing submitted?
2. **QA-439 point 1:** should "Personal details first" be read literally, or does #1643's rule (a part comes first only where it decides another) meet it? If the latter, the reopen rests on points 2-4.
3. **QA-427 in-review wording:** the card still reads "Client A answers on their phone, for everyone travelling. Round 1 is with the representative of record now." It has no "Next:" and no button. Is that worth a Minor?
