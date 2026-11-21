# J-38 W6 review: the staff-zone step for R1.38 (PR #2326)

Reviewer (did not build it), 19 Nov 2026. Head `4c953751b` (branch `claude/busy-babbage-bpqaoi-j38`); the code diff is `claude/busy-babbage-bpqaoi-fo3st1...3bb02230c`: `tests/journeys/j_38.ts` (+29 −2), `qa/built/J-38.md`, two W6 screenshots. The later commit `4c953751b` adds only FO-3vr's and FO-3a2b's review and break reports (6 record files, +678, no code), so this verdict covers it too. Stacked on FO-3st1 part 1 (#2322), whose screen W6 walks. This is a test-only J-row, so it is judged as a journey test (BACKLOG J-38, R1.38, concept `fo-3-booking` §4 and §5, skill `journey-test`), not with D1–D20 or the BIC table. Isolated copies on :4448 and :4438, never :4400. US$0, no model call.

**Verdict: Approve** (no open Blocker or Major). Four Minor items below; none blocks the merge.

## What I ran
| Run | Result |
|---|---|
| The brief's line: `isolated.sh j38r 4448 start --ttl 30 PLATFORM_IDENTITY=local && … tsx … j_38.ts j38r 4448` | **27/27**, exit 0. Moment walked 2026-11-23T15:00Z = 10:00 Toronto (EST) = 19:00 Dubai. W6: `zoneSaid` "Your meetings and the team's. Times in America/Toronto (office).", `inTen` 1; detail "Mon 23 November 10:00–10:30 America/Toronto · 19:00 for Ana Sample (Asia/Dubai)" |
| **Mutant (scratch copy of j_38.ts, nothing in the worktree changed):** the staff browser context gets an init script that drops `timeZone: "America/Toronto"` from every `Intl.DateTimeFormat`, so the screen formats office times in the browser's zone (Europe/London), as a screen that used the browser's zone would | **24/27**: W6 calendar line FAIL (`inTen: 0`, the block sits in the 15:00 row), W6 detail line FAIL ("15:00–15:30 America/Toronto"), W6 no-London line FAIL. W1–W5, DW1 and both W6 axe lines PASS. W6 fails on a browser-zone screen. |
| `node studio/tests/journeys/walk.mjs studio/tests/journeys/j_38.ts <scratchpad>/walk38` (port 4438 free first) | Header line read: "copy j38 on :4438 start --ttl 30 PLATFORM_IDENTITY=local: exit 0". First try crashed before any step: Playwright wants ffmpeg-1013, this machine has 1011 (environment, not the PR). With a scratch `PLAYWRIGHT_BROWSERS_PATH` of symlinks (nothing installed): **27 PASS, 0 FAIL, exit 0**, 2 traces, 42 step screenshots, 7 journey shots, 0 video (the same ffmpeg mismatch) |

The runs rewrote the tracked J-38 screenshots. I restored them from a copy taken first, and `git status` is clean apart from this file.

## The four questions
1. **Does W6 prove R1.38's missing part, and would it fail on a browser-zone screen?** Yes. qa's "Missing: FO-3st1 (no screen shows the staff zone)" is now covered by screens. The host's browser is in a third zone (Europe/London), not the booker's (Dubai) and not the office's (Toronto). The grid check reads the block from `[data-cell="<Toronto day>T10"]`, and the detail check needs "10:00–10:30 America/Toronto". The mutant above shows both fail when office times are drawn in the browser's zone. The zone line is checked as well (`[data-zone-line]` includes America/Toronto), so the line that names the zone is in the walk too.
2. **Does the walk still end at row 42's first step?** Yes. W6 sits after W3 and before W4 (`j_38.ts:167-190`), in its own browser context, which closes before W4. W4 still uses the booker's page `p`. The last line is still W5 "offers Reschedule: row 42's first step" (`:223`), and it passed in every run.
3. **Does the header line work with walk.mjs?** Yes. `copyOf()` (`walk.mjs:23-27`) matches `start --ttl 30 PLATFORM_IDENTITY=local &&` and passes `PLATFORM_IDENTITY=local` to `isolated.sh start`, which takes `KEY=VALUE` (`isolated.sh:5,20`). The walk log above shows it.
4. **PR body claims:** every one checked holds. 4 files +33 −3 ✓; London browser and the 10:00 row ✓ (mutant); the detail string ✓ (the run reads it with the weekday and date in front, as concept §5 has it); no "Europe/London" or 15:00 ✓ (but see m2); axe with tags 2a, 2aa, 21a, 21aa and 22aa and no impact filter ✓ (`:91`); W1–W5 and DW1 unchanged ✓ (the diff only inserts W6, the role grant and the header token); ends at W5 ✓; the role is a seeded Case Officer ✓ (`:83`), whose week shows Mine and Team; `qa/built/J-38.md` W6 line added and "Not here yet" removed ✓. The body's "27/27 (twice)" I matched three times on clean runs.

## Findings (all Minor)
- **m1. Sign-in and navigation skip the product's own steps** (`j_38.ts:170-174`). The host's session comes from `POST /api/platform/session/local` and is put into `sessionStorage`. The page is then opened by a deep link (`?view=week&whose=mine&date=…`) rather than through the sign-in card ("Sign in to your firm", which J-6 uses at `j_6.ts:89`) and the Bookings menu, Week and Mine. The step being tested (the zone on the screen) is still done by screens, and j_30 and j_109 do the same, so this is Minor, not P-33 scaffolding. The PR body's "opens Bookings › Calendar (Week, Mine)" describes where the page ends up, not clicks a person made. Fix, if wanted: sign in through the card as J-6 does, then click Week and Mine.
- **m2. The no-London check works out the wrong hour in the weeks when only one country has changed its clocks** (`:187-188`). `season === "EST" ? utcHour : utcHour + 1` assumes London and Toronto change on the same dates. From the 2nd Sunday of March to the last Sunday of March, and from the last Sunday of October to the 1st Sunday of November, London is UTC+0 while Toronto is on EDT, so London's time is 14:00 and the line looks for 15:00. The two positive W6 lines still catch a browser-zone screen in those weeks, so nothing false gets through. Fix: work out London's hour with `Intl` for `start` (the way `torontoClock` is used at `:106`).
- **m3. W6 shows the staff zone on one side of a daylight-saving change only** (whichever season the run falls in). R1.38 says "appears in the staff zone … with the right offset across a daylight-saving change". The booker's side across Toronto's change is shown by qa's `check_r138_r140_booking_page_walk.ts`, and the host's side only in mails (`check_r140_staff_move_invite.ts`). No screen yet shows the host's calendar across the change, and `check_fo3st1_calendar_browser.ts` has no DST case. The code reads the zone through `Intl` (`calendar/contract.ts:44-54`), and the mutant shows the walk depends on it, so the risk is low. Whether "Completes: R1.38" holds without a run across the change is for qa to rate. A dated run (as the earlier J-38 review did for W1–W5 with a scratch copy) would settle it.
- **m4. A refused sign-in fails late and gives no reason** (`:170-171`). `signIn.json()` is read before `signIn.ok` is checked. On a copy without `PLATFORM_IDENTITY=local`, the token is `undefined` and the walk throws after the 30 s `[data-grid]` timeout, with no "start the copy with PLATFORM_IDENTITY=local" message (J-6, J-30 and J-109 print one and stop). W4 and W5 then never run. Fix: check `signIn.ok` first and stop with that message.

Notes for FO-3st1 (#2322's own review, not findings here). The zone line reads "Times in America/Toronto (office)". In concept §4 and §5, `<office>` is data (the office's name), but the screen shows the literal word "office". The detail panel shows When and Who only; §4 also lists Attendance, Consult record and Next step, presumably in a later FO-3st1 part.

## Journey score (reviewer, the one score for this check): **9 / 10, pass**
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | The host finds the booking at 10:00 in the office zone, and its detail matches both mails and the invite (27/27, three runs) |
| Next step obvious | 1 | The block opens the detail; More holds Reschedule and Cancel booking (W6-2 screenshot); the walk ends at row 42's first step |
| Plain words | 1 | The §5 strings "Times in … ", "<day> 10:00–10:30 America/Toronto · 19:00 for Ana Sample (Asia/Dubai)". "(office)" is noted for FO-3st1 |
| Feedback and state | 1 | Scheduled chip, Week and Mine shown as selected, week range shown (W6-1 and W6-2) |
| Correct data | 1 | One booking at 15:00Z with the booker's zone kept (W1); the screen, both mails and the .ics give the same instant; the mutant proves the check bites |
| Error recovery | ½ | No error path in W6; a refused sign-in ends in a timeout (m4) |
| Accessibility and screen sizes | ½ | axe clean on the week and the detail at 1440 px; no 400 or 1024 px pass and no keyboard pass in W6 |
| Speed | 1 | Whole walk 34 s with recording; no wait over the timeouts |
| Visual quality | 1 | Screenshots clean; the long block label is cut with "…" and the full text is in its title |
| Trust and sources | 1 | Every time names its zone; setup labelled Sample and "not through the product" |

Not tested: a walk in a visible browser (HEADED=1 is qa's gate A), a real screen reader, a run on a date across the change (m3), and an intended user's unaided walk (D17 and D20 stay with the founder). Journey report: `screens/J-38/journey-test-reviewer-w6-2026-11-19.md`.

First review's verdict, at 4c953751b625561c3d9dc466053a63207fb25f69: Approve.

## Re-review, head 138885b92 (19 Nov 2026)
The new head changes `tests/journeys/j_38.ts` (+5 −2) and commits this file and the journey report. I read `git diff 4c953751b..138885b92 -- '*.ts'`.
- **m2 fixed** (`j_38.ts:189-192`). London's hour now comes from `Intl` (Europe/London) for the moment walked, not from the season. I checked the formula in Node: 15 for 2026-11-23T15:00Z, **14 for 2027-03-15T14:00Z** (Toronto is on EDT and London still on GMT, the case m2 named), 15 for 2027-04-15T14:00Z, and 14 for 2026-10-26T14:00Z. The failing line now prints `londonHour` as well.
- **m4 fixed** (`:171`). A refused sign-in now throws straight away, before the response is read. On a copy started **without** `PLATFORM_IDENTITY=local` (:4448), the walk stopped after 16 s with "W6: the host's sign-in was refused (403): start the copy with PLATFORM_IDENTITY=local, as the header's line does", exit 1. It no longer waits 30 s for the grid with no reason given.
- **Run** on a fresh copy with the header's flags (`j38r` on :4448): **27/27**, exit 0. W6 reads `londonHour: 15`, the 10:00 row and "Mon 23 November 10:00–10:30 America/Toronto · 19:00 for Ana Sample (Asia/Dubai)", and W5 is still the last step. The rest of the diff touches no W6 line the mutant relied on, so that earlier result still holds.
- **m1 and m3 left, as the builder says.** m1 (sign-in by API) is Minor and is J-30's and J-109's practice too. m3 (no run of the staff screen across a daylight-saving change) goes to the tech lead as the question of whether this PR's "Completes: R1.38" holds. Neither blocks.
- The tracked screenshots my runs rewrote are restored, and `git status` was clean before this section was added.

Journey score unchanged at **9 / 10, pass**. Error recovery stays at ½: the refused sign-in now explains itself, but W6 still has no error path a person would walk.

Reviewer: Approve 138885b92629084f38faa6568730f8ffc6ec1e6e
