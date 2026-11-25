# Journey test, reviewer: CS-DL3 part 2 "Government steps" (R1.74, QA-591), 20 Nov 2026

Reviewer role, the one journey score for this check. Commit 324b8ca46. Isolated copy rv_csdl3 on :4661 (AI_LIVE=off, PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on), Chromium headless. US$0. Review: `review.md`.

## Journeys (written from the brief's Part 2 before the walk)
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Representative: "IRCC sent a biometrics letter today, due in 30 days. I want it on the case with its reminders." | Case page › Record a step… › Biometrics, letter today, due +30, reference › Record the step | Row shows name, dates, "in 30 days", reference, who, reminder days; one DB row | Held (keyboard only, browser check DW8 twice; J-74 W5/W6) |
| J2 alternate | Same: "I typed the wrong due date." | Cancel… › reason › Cancel the step › Record again with the right date | Both rows shown, the first cancelled with its reason; jobs cancelled and re-armed | Held (DW9; J-74 W7: 3 cancelled, 3 armed) |
| J3 empty | First visit to a case | Open the case | "No government step recorded yet." plus the Record button | Held |
| J4 error | Bad input | Submit empty; due before letter; Other without a note; bidi character in the reference | Refused at the field, focused, typed values kept, nothing written | Held. The bidi message is misleading ("at most 100 characters") |
| J5 overdue / no date | A letter from 60 days ago, due 10 days ago; a letter with no due date | Record both | "overdue by 10 days" plus an Overdue pill, "No reminder still to come"; "no due date on the letter" | Held |
| J6 wrong role | Read only staff; another firm | Open the case; POST through the API | Steps shown, no buttons, the reason in words; API 403, no row | Held (DW10; break report: another firm gets 404) |
| J7 recovery | Double click; two tabs cancel the same step; Escape with typed text | As named | 1 row; the second tab shows "already cancelled" and the list refreshes; Escape asks before discarding | Held. Back discards without asking (Minor) |
| J8 closed case | The case is withdrawn (also while the dialog is open) | Withdraw, reload; record in an open dialog | No buttons, "The case is closed: reopen it…"; 409 shown in words | Held |
| J9 no sign-in | Staff not signed in as firm staff | Open the case, follow the link | One line pointing to "Decision and closing"; the link scrolls there and focuses its heading | Held |
| J10 boundary | From the step to its reminders, and from sign-in (Decision and closing) to this section | J1 then the reminder list; J9 then sign in | Reminder days listed are the armed jobs (J-74 W6); the section loads once signed in | Held. Nothing marks the reminders as a stand-in, though the running app arms none (S3) |

## Automated replay
`check_csdl3_milestones_browser.ts` 17/17 twice. `j_74.ts` 18/18 on a fresh copy; 15/17 on a reused copy, because W3/W4 count other cases' reminders (old behaviour, S6). axe WCAG 2.2 A/AA: 0 on the section (empty, 1, 2 and 3 rows) and both dialogs. Widths 400/720 (1440 at 200 %)/1024/1440: no sideways scroll. Keyboard: Tab and Enter reach every control; focus opens on Step; it returns to "Record a step…" after a record and to the heading after a cancel. Console errors: only the expected 400 and 409 resource lines; no page error. Timings: first view 710 ms; record to row shown about 0.9 s.

## Data underneath
One `case_milestone` row per record, `due_on` exactly as typed, the cancelled row kept with `cancelled_at` and its reason, no update of a due date (DW8/DW9 SQL). A double click and a second-tab cancel wrote nothing extra. Read only got 403 and no row. Audit and outbox lines are part 1 (check_csdl3_milestones DW7), not re-run here.

## Break-it (15 min; the breaker's report covers more)
Long and non-English text: a 100-character unbroken reference and a 2000-character Arabic/Hindi/Latin note wrap at 400 px. Duplicates and race: held. Wrong role by URL: held. Reload mid-action: the dialog closes and nothing is written. Findings: S1 wording ("on the day" on a moved day), S2 (a 401 loses typed input silently), S3 (no Stand-in chip on the reminders), plus Minors. No Blocker or Major.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 by keyboard; DB checked |
| Next step obvious | 1 | Empty state plus the "Record a step…" button; the no-sign-in line links to the sign-in |
| Plain words | ½ | "(pack-defined in the source)", "(on the day)" for a counted-back day, the bidi message |
| Feedback and state | 1 | Skeleton, toasts, Cancelled/Overdue in words, closed and no-key reasons |
| Correct data | 1 | Exact values, both lines kept, one row per record |
| Error recovery | ½ | Field errors keep input; but a 401 mid-dialog loses input silently, Back discards without asking, refusal focus lost |
| Accessibility and screen sizes | 1 | axe 0, keyboard, 400–1440, 200 % |
| Speed | 1 | 710 ms first view, about 0.9 s to save |
| Visual quality | 1 | `screenshots/csdl3-2-cancelled-and-again-1440.png`, `-1024.png` |
| Trust and sources | ½ | Sample marked; "the due date is the one on IRCC's letter"; but the reminders read as planned with no stand-in mark |

**Total 8.5/10, no criterion at 0: pass.** To raise it, most valuable first: (1) a Stand-in chip on the reminders (trust); (2) keep the draft and say "nothing recorded" when the session ends (recovery); (3) "last working day" wording and dropping the jargon (words).

Could not test: a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); reminders reaching a person (PF-18n is not on main).
