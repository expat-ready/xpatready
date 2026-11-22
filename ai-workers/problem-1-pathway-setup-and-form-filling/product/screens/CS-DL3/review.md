# CS-DL3 part 2 review: "Government steps" on the case page (R1.74, QA-591)

Reviewer (fresh Opus 5.5, did not build), commit **324b8ca46**, branch claude/trusting-goldberg-k4xn9w, PR #2594. (PR head since then is 2f821887a, which adds only `break-report.md`; no app file changed.) Concept: "Part 2" of `design/build-lead-c-briefs/CS-DL3.md` on `origin/claude/build-lead-c-647b40`. Isolated copy rv_csdl3 on :4661 (AI_LIVE=off, PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on), stopped at the end. US$0, no model call.

**Verdict (skill scale): Ship.** No Must. The Shoulds below are fixed or listed in the PR. Journey score **8.5/10, pass** (`journey-test-reviewer-2026-11-20.md`).

## What I ran
* `check_csdl3_milestones_browser.ts`: 17/17, exit 0, **twice** (one copy, then a fresh copy). `tsc -p web` clean.
* `journeys/j_74.ts`: 18/18, exit 0, on a fresh copy. On a **reused** copy it fails W3/W4 at 15/17: their `told` counts every case's reminders, including an earlier run's open step. This is old behaviour; the judges in main's J-74 have the same problem with an earlier run's reopened case. See S6.
* My own Playwright walk (scratchpad, not kept): no sign-in, empty, keyboard open/Escape/focus return, empty submit, a server field error, no due date, overdue, Other without a note, a 100-character reference with a 2000-character Arabic/Hindi/Latin note, double click, two tabs cancelling the same step, Escape guard, a closed case, a case closed while the dialog is open. Widths 1440/1024/720 (200 %)/400, plus axe.

## Concept fit (Part 2 "Build" and "Done when")
| Element | Result |
|---|---|
| Each step's name, letter's date, due date with "in N days"/"overdue" in words, reference, who recorded it | Met (DW8; my walk: "Due Tue 10 Nov 2026 · overdue by 10 days" plus an "Overdue" pill; "no due date on the letter" when none) |
| Record a step: step, letter's date, due date, optional reference; one confirm with the exact words | Met. The words are a warn Notice above the single "Record the step" button, an in-page confirmation (EXPERIENCE §2.8). There is no second dialog. |
| Cancel asks for a reason; a cancelled step stays visible as cancelled | Met (DW9: struck through, a "Cancelled" pill, who, when and the reason; no reminders) |
| Keyboard only, axe clean, 1024 and 1440 px | Met (axe 0 on the section and both dialogs; no sideways scroll at 400–1440) |
| DW8/DW9/DW10, each a pass and a fail | Met. Removing the web's `mayEdit` check fails DW10 pass; removing the server key fails DW10 fail. DW8 fail still holds through the server's field error if the web check is dropped. |
| J-74 walk W5–W7, exits 0 twice | Met on fresh copies (see S6) |

## D1–D20
D1 4 every Part 2 item present · D2 5 a double click gives 1 row; a second tab's cancel gets 409 "already cancelled"; Read only gets 403 with no row · D3 4 shared contract types and limits, `staffApi`, team controls; two rules copied into the web (S4) · D4 N/A no question rules · D5 4 reload, double click and two tabs hold; a session ending mid-dialog loses the input (S2) · D6 4 recorded by/on and cancelled by/on/reason shown · D7 N/A no AI · D8 4 section sits under the case header and path · D9 4 one dialog, five fields · D10 4 plain, apart from "pack-defined in the source", "on the day" (S1) and the bidi message · D11 4 skeleton, toasts, closed/no-key reasons · D12 4 team look, as "Decision and closing" · D13 4 axe 0, keyboard, 200 %; focus is lost on a server refusal (break m1) · D14 4 same pattern as its sibling sections · D15 5 first view 710 ms, record to row shown about 0.9 s, one GET per section · D16 4 pass and fail per DW, run twice; graph gap (S5) · D17 simulated only · D18 4 "the due date is the one on IRCC's letter", Sample marked, reference and who shown · D19 not yet evidenced (part of the case flow) · D20 simulated only.

## BIC-01–BIC-20 (evidence: `screenshots/csdl3-2-cancelled-and-again-1440.png`, `-1024.png`, `csdl3-3-read-only.png`, plus the walk steps above)
| BIC | Score | Evidence |
|---|---|---|
| 01–03, 05–10, 12, 15–17 | N/A | no person facts, AI values, roles, tasks, filing or review on this section |
| 04 | Met | "(optional)" in words; an impossible date or a due date before the letter is refused at the field |
| 11 | Met | Section buttons are secondary/ghost; the one primary per dialog is named "Record the step" / "Cancel the step" |
| 13 | Partly (Should) | Inline errors keep what was typed and focus the first field, but there is no summary at the top; the bidi refusal reads "Plain text, at most 100 characters." |
| 14 | Partly (Should) | "Overdue" and "Sample" carry only a `title` (hover, not keyboard focus); "Cancelled" has no tooltip. EXPERIENCE §2.10 is met on hover. |
| 18 | Met | Empty state says what goes here and offers "Record a step…"; skeleton; toasts; read-only and closed say why |
| 19 | Partly (Should) | One heading and no primary per panel, but four sizes (16/14/13/12) including off-scale 13 px, the case page's convention in 30 files and not new here |
| 20 | Met | Keyboard walk, h2 then h3 in order, 200 % (720 px) with no sideways scroll |

## [M] lines (STANDARDS, EXPERIENCE) in this change's scope
Met: server authorisation (403 and 404 from part 1, DW10), idempotent create (one key per opening), conflict shown (409 in words, list refreshed), Problem Details field errors mapped to fields (my bidi test: the error sits on the Reference field and it is focused), no per-row request, axe on every state, keyboard path, 1024 px and 200 %, status by text as well as colour, Sample labelled, no IDs or hashes on the main path, edits in a dialog with the page kept, comments say why, module card row added.
Partly: STANDARDS §7 "no duplicated logic between web and API" (S4); EXPERIENCE §5 plain words (S1). Not applicable: migrations, AI, engine, uploads.

## Issues, ranked (no Must)
* **S1 Should: wrong words.** `milestones.tsx:27-28`: offset 0 is labelled "(on the day)" even when it was counted back. Due Sun 20 Dec 2026 lists "Fri 18 Dec 2026 (on the day)" (browser check run, J-74 W6). Fix: say "last working day" when the reminder day is not the due day. Also `:71`: "(pack-defined in the source)" is jargon on the main path; drop it or move it into the Sample tooltip.
* **S2 Should: a session ending mid-dialog loses the input.** `milestones.tsx:115`: on 401 the dialog closes, what was typed is lost, and nothing says nothing was recorded (break m2). "Decision and closing" keeps the draft (`case-decision.tsx:101-106`). Fix: keep the draft and show the "sign-in ended, nothing recorded" line, as that section does.
* **S3 Should: reminders look armed when they are not.** `milestones.tsx:58, :95`: "Reminders planned: …" carries no Stand-in chip, but the running app arms nothing until PF-18n binds the port (`features/case-deadlines.ts:24`; qa R1.74 says "the running app reminds nobody"). STAND-INS.md's on-screen rule asks for a "Stand-in" chip with a tooltip. Fix: add the chip (SI-17 or a new row) saying no one is told yet. This does not ask for PF-18n's work.
* **S4 Should: two business rules copied into the web.** `milestones.tsx:139-143` copies two rules from `contracts/milestones.ts:55-58` ("due ≥ letter", "Other needs a note"), with the same strings. Fix: `RecordMilestoneBody.safeParse` and map issues by path. This follows the existing `case-decision.tsx:214` pattern, so it is not blocking.
* **S5 Should: graph gap.** `qa/graph.json` G3 lists `POST /runtime/cases/:id/milestones/:mid/cancel` as reached by no test, because the scanner misses the two-parameter template path. DW9 and J-74 W7 do reach it. Fix: an explicit API call in the check, or a graph rule.
* **S6 Should (test only, old behaviour).** `j_74.ts:116-129`: W3/W4 count `told` across all cases, so J-74 passes only on a fresh copy. Fix: filter `told` by this case's stage and milestone ids.
* **Minor:** refusal focus lost (break m1, `:109` while `busy` disables the button); Back skips the discard guard (`:163`, `:187`; m4); no `max` on Letter's date (m5); `maxLength` and the counter count UTF-16 units (m6); "Recorded … on" uses the browser's zone, not the firm's (`:24`); no build-notes or retrofit mapping recorded for the screen (the brief cites Doc 3 lines 3337/3141/3398 only).

## What I could not check
A real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); notifications reaching a person (PF-18n is not on main); the full `ci` run.

**Verdict: Approve.** No open Blocker or Major. Shoulds S1–S6 and the Minors are fixed or listed in the PR.

## Re-review, diff only: 324b8ca46 → 6ec560048 (P-277)
I read only `git diff 324b8ca46 6ec5600485 -- …/prototype/studio` (`milestones.tsx`, `check_csdl3_milestones_browser.ts`, `j_74.ts`). Ran on a fresh copy rv_csdl3 at :4661, stopped afterwards: `tsc -p web` clean; browser check **20/20**, exit 0; then J-74 on the **same, already used copy**, **17/17**, exit 0. The one line fewer than before is the demo-load setup line, skipped because the copy was already loaded.
| Finding | Now |
|---|---|
| S1 / m3 | Fixed. Offset 0 reads "on the day" only when it falls on the due date, else "the last working day before" (`milestones.tsx:28`). The browser run shows "Fri 18 Dec 2026 (the last working day before)" for Sun 20 Dec. The header wording is updated and "(pack-defined in the source)" is removed. |
| S2 / m2 | Fixed. The section keeps the draft. A 401 on send, or the token disappearing while a dialog is open, shows "… was not sent: nothing was recorded"; signing in again reopens the dialog with what was typed, plus a "Signed in again" notice. DW11 pass and fail; removing the restore fails DW11 pass. |
| S3 | Met in words. The footer says "none is sent to anyone until the firm's notifications are connected." That answers the trust point. The chip goes to the tech lead as the builder said. |
| S4 | Fixed. The dialogs run `RecordMilestoneBody` / `CancelMilestoneBody.safeParse`. Only the two empty-choice messages are the web's own. |
| S6 | Fixed. W3/W4 judge `toldHere()` (this case's stage ids). Held on a used copy, as above. |
| m1 | Fixed. A focus effect runs once `busy` is false and aims at `[data-gov-refusal]`. DW11 shows the focus on "This step is already cancelled." |
| m4, m6 | Fixed. Back asks before discarding; `maxLength` is gone; counters count characters. |
| m5, m7, S5, BIC-13, BIC-14, browser time zone | Not done, to go to the tech lead as listed. None is Blocker or Major. |

**New, Minor (no fix needed to merge):**
* `milestones.tsx:69-74`: the restore effect reopens the dialog without checking that the person who signed in has `agent/case:edit`, or that the case is still open. A Read only person who signs in after a lost record gets the dialog back, then a 403 or 409 in words on send. The server decides and nothing is written. Also, the draft is offered to whoever signs in next in that tab, the same as "Decision and closing" does. Fix later: reopen only when `mayEdit`.
* `milestones.tsx:67`: `lose` calls `setLost` inside a `setAct` updater, a side effect in an updater. It is harmless here because a second run sets the same value.

**Verdict: Approve 6ec5600485fe9bbb67c521bba550b2ced9c91700.** No open Blocker or Major.
