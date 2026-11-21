# J-42 review: R1.42's journey (reschedule or cancel by link; attendance; consult record)

Reviewed: PR #2613 at exact head `a736537ffee8051adebdfd54d8456ef634b167dd` (branch claude/practical-pasteur-atmfyq), diff `git diff origin/main...HEAD`: `prototype/studio/tests/journeys/j_42.ts` (232 lines), 8 screenshots in `product/screens/J-42/screenshots/`, `product/screens/FO-3a/challenge-r1-42-outcome-route.md`. Reviewer: a fresh context that did not write the journey. I read the code, the two run logs (`/tmp/claude-0/j42.log`: 18/18; `/tmp/claude-0/j42b.log`: in progress, W1-W5 PASS so far), the app code the judges depend on, and AG-4-36..-39 and AG-4-49. I did not start a copy.

This is an evidence row, not a screen. The screen-review parts that apply to a built screen (concept fit, D1-D20, the BIC-01..20 table, retrofit mapping, graph) are **N/A**: the PR builds no screen and changes no product code. What I checked instead: the BACKLOG J-42 row's Done when, every judged line against its label, real-clock robustness, the "fails on the fake" claims, honesty about the gap, data hygiene and size. My journey score is in `journey-test-reviewer-2026-11-20.md`: **8/10, pass (no 0)**.

## What holds (with evidence)
* **Header line for walks.yml.** `j_42.ts:28` matches walk.mjs's `copyOf` pattern (`isolated.sh j42 4442 start --ttl 40 PLATFORM_IDENTITY=local &&`). It is not :4400. `--ttl 40` matches walk.mjs's 40-minute stop. Both runs take about 11-14 minutes.
* **Judges prove what their labels say (W1-W7).** W1 checks exactly two `fo_booking` rows at the chosen instants (`:137-139`). W2 checks `data-public-state="manage"`, A's own time in `[data-when]`, both buttons, then "Booking updated…" plus `RESCHEDULED` at the new instant in the database (`:148-160`). W3 and W6 check the bad-link state, BAD's exact words and zero buttons in `main` (`:171`, `:196`); BAD is AG-4-36 rule 9 word for word. W5 checks the limit sentence with the firm's phone and zero buttons (`:187-188`), which is AG-4-37 rule 5 with the type's 1 hour. W7 checks one click, then `COMPLETED` plus exactly one `booking.completed` audit line with the host's id and a time at or after the click (`:205-212`). Every judge is a conjunction that includes `data-public-state`. The page shows a skeleton with no `data-public-state` while it loads (`frame.tsx` Gate), so `open()` (`:105`) cannot read a loading page as a pass.
* **The slot loops are not silent.** Each loop reports the time it chose in the PASS label (`:139`, `:153`), and a miss fails or stops the walk (`:122`, `:140`, `:153`). Day and month changes near midnight or at month end are handled by name (`:117-119`). The names are the page's own: `dayWords` for the day buttons and `whenWords` for the slots (`type-page.tsx:136,149`). The month format matched in run 1.
* **Real clock.** The 5-minute ceiling (`:71`) is in UTC, and Toronto's offset is whole hours. B is booked 4-39 minutes ahead, always inside the 60-minute limit. A is booked 90-120 minutes ahead and moved 10-40 minutes later, so A stays outside the limit for W2 and W4. The token expires at `endsAt` (`tokens.ts:19`), not at the start, so W5 holds until B's end. The margin was 8.4 minutes in run 1 and 12.8 in run 2. The wait for W6 is `endsAt + 5 s` (`:191`). A run near midnight Toronto moves B and A to the next day, and the loop clicks that day.
* **"Fails on the fake" claims hold.** `fakeMail` (`ports/mail.ts`) writes no `msg_outbox` row, so DW1's `out.length >= 2 && every SENT/DELIVERED && providerId local:` fails on it (`:163-165`). `fakeAudit` (`ports/audit.ts:144`) writes no `audit_event` row, so DW2's `attLines.length === 1` and `recLines.length === 1` fail on it (`:210-224`). The running path really is `auditEvent` plus the app's MailPort plus `systemClock` (`booking/runtime-ports.ts`).
* **Hygiene.** Sample firm, Sample address, the fictional 555-01xx phone, "Ana/Ben Sample" (the same convention as j_37 and j_38). Tokens are masked in output (`hide`, `:66`) and the session token is never printed. No model call. 232 lines.

## Blockers
None.

## Majors
**M1. W8 and the walk's end are scaffolding, yet the machine verdict reads as a clean full walk (P-33; BACKLOG J-42 Done when: "ending at the next capability's first step").**
* The consult record has no screen on main (`detail-panel.tsx:4`, "Part 2 adds the consult record…"). W8 saves it with `fetch` PUT using the host's token (`j_42.ts:219`).
* The step that reports this is a `console.log` beginning `GAP ` (`:217`). walk.mjs counts only lines beginning `PASS `, `FAIL ` or `HELD ` (`walk.mjs:74-78`). The recorded walk's `walk.json` and README will therefore say "18 PASS, 0 FAIL, 0 HELD", and so did `summary()` ("18/18 passed", exit 0).
* The judged line's label, "W8 pass / DW2: the host records the outcome and a note" (`:222`), reads as a person's act. The row's last step, the next-step button (AG-4-50, the walk to row 53), is not reached at all, and no line says so.
* The PR body repeats W8 as done, with no mention of the gap.
* The header (`:14-17`) is honest, but nobody reading the verdict sees it.

Fix:
1. At `:217`, print `HELD  J-42 W8 screen: no consult record on the booking detail (FO-3st1 part 2 not on main); saved through its route with the host's session` (when `!hasScreen`). walk.mjs then counts it.
2. Add a second `HELD  J-42 W9: the next step button (AG-4-50, row 53's first step) cannot be reached: no consult record screen`.
3. Relabel `:222` "J-42 W8 (route, no screen yet) / DW2: the consult record saved by the host's session is stored…".
4. In the PR body, state that J-42's row stays open, waiting on FO-3st1's consult-record part, and that this PR does not meet the row's "ending at the next capability's first step".
5. Correct the records note (see m1).

No new scope: this asks only that the existing gap be reported where the verdict is read.

## Minors
* **m1.** `FO-3a/challenge-r1-42-outcome-route.md:16`: "J-42 walk (attendance → consult record through FO-3st1's screen, #2322)". #2322 (FO-3st1 part 1) has no consult record screen. Fix: say that the consult record step waits for FO-3st1's part 2.
* **m2.** `j_42.ts:216`: `/consult record|time spent|notes/i` over the whole panel text. Any "notes" elsewhere on the detail would turn the gap line into "shows" without the screen existing. Fix: test a specific heading (`getByRole("heading", { name: /consult record/i })`) or a data attribute once part 2 names one.
* **m3.** `j_42.ts:226-227`: the EUR refusal checks only `status === 400`. A 400 for another reason (for example a bad `version`) would pass. Fix: also require `eur.body.issues` to include an entry starting `quotedFeeCurrency`.
* **m4.** `j_42.ts:174-179`: W4 does not show that cancel voids the live link (AG-4-36 rule 3, "Voided on cancel") or that the cancel mail went out (rule 8). Fix: open `linkIn(aMails2[1])` after the cancel and expect the bad-link state, and expect a third outbox row for A that is SENT or DELIVERED.
* **m5.** `j_42.ts:154`: `W2-choose-new-time-1440.png` is written but not committed (the commit has 8 shots, the code writes 9). Fix: commit it with the second run's set.
* **m6.** `j_42.ts:95-99`: no `pageerror` or console-error capture (j_41 has one, `j_41.ts:76`), and no axe check on W1 (booked) or W4 (cancelled) (journey-test §3). Fix: collect page errors and judge them empty at the end, and add `axe` after `:136` and `:177`.
* **m7.** `j_42.ts:26`: "About 18 minutes". Both runs took about 11-14. Fix: "about 12-15 minutes (most of it the wait for B's end)".

## Could not check
* I did not run the journey or walk it in a visible browser. The second run was still in progress when I wrote this, and the caller said not to start another copy.
* I did not run graph.mjs: it writes `qa/GRAPH.md`, and this review may write only its own two files.
* Widths 400 and 1024 px, keyboard-only use and a screen reader are not covered by this journey.
* D17 and D20 stay with the founder.

Verdict: Changes requested

---

## Re-review 1: head `0e122afd521b177a3c30902e2c0334f9ea877546` (P-277: read only `git diff a736537ff..0e122afd5`)

The diff since my review: `j_42.ts` (+23/-10); the records note (one line); this review and the journey-test file committed (e4dabdf); 6 screenshots refreshed, and `W2-choose-new-time` added. Commits after e4dabdf are screenshots only. Run on e4dabdf (isolated :4444): `/tmp/claude-0/j42c.log`, 22/22 PASS, two `HELD` lines, exit 0. I read the log; I did not run the journey.

**M1, fixed.**
* `j_42.ts:226-228` now prints `HELD  J-42 W8 screen: …` (when no panel) and `HELD  J-42 W9: …`. Both lines start with `HELD `, so walk.mjs counts them (`walk.mjs:74-78`); the log shows both.
* W8's two judged labels say "route, no screen yet" and "route" (`:233`, `:238`).
* The header (`:13-18`) says R1.42 is not complete until FO-3st1's consult record part lands.
* The PR body now marks W8 as **route, no screen yet**, does not carry `Completes: R1.42`, says the J-42 row stays open, and asks the tech lead to shape the panel.
* W9 is printed even when a panel is found, which is right: the next-step button is still not walked, and the NOTE line says to switch W8 over and drop the HELD lines.

**Minors.**
* m1, fixed: records note line 16.
* m2, fixed: `:225` now checks the panel text for "consult record" or "time spent", or a "Save record" button. It no longer matches any "notes".
* m3, fixed: `:238` also requires `issues` to name `quotedFeeCurrency`.
* m4, fixed: `:183-188`. After the cancel, the new email's link opens to bad-link with BAD's words, and a third mail whose subject contains "cancel" arrives. The log shows "Your Free consultation is cancelled". The move issues one token (`service.ts:579`) and returns it to the page and the mail, so "the link that cancelled" is accurate.
* m5, fixed: `W2-choose-new-time-1440.png` is committed.
* m6, fixed: `pageerror` is collected on every page (`:100`) and judged at the end (`:239`); axe now also runs on W1 (`:139`) and W4 (`:183`). Both are clean in the log.
* m7, fixed: the header now says 11 to 14 minutes.

**New, Minor (not blocking).**
* **m8.** `j_42.ts:184`: the new email's link is never shown to work before the cancel. If that mail carried a broken link, W4's "refused after the cancel" would still pass. Fix (optional): open `linkIn(aMails2[1])` before `:177` and expect `manage`.

**Not this diff's.** `run-suites.sh --changed` fails on `check_journey_recording.ts` (6 fixture-walk lines). The builder reports the same 6 failing on a clean origin/main worktree in this container (`/tmp/claude-0/jr-main.log` vs `/tmp/claude-0/jr.log`). This PR does not touch walk.mjs, record.ts or the fixtures, so it is not a finding here. GitHub CI decides.

**Journey score:** unchanged at **8/10, pass (no 0)**. "Task completed" stays ½ until W8 and W9 are walked on a screen; the gap is now reported where the verdict is read.

No open Blocker or Major.

Verdict: Approve 0e122afd521b177a3c30902e2c0334f9ea877546
