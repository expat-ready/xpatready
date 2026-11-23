# qa 12 — R1.42 Reschedule or cancel by link; outcomes; consult record: Partial (parts missing) on main a66044692, 21 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), asked by the tech lead (Lead 11): "/qa capability R1.42 (staff outcome route + consult record; build merged on main)". Live AI off, US$0. Isolated copies only, never :4400.

## Verdict
**Partial, parts missing. No verdict (P-606).** The fresh Opus reader agrees, with 0.9 confidence. The missing parts:
* **FO-3st1 part 2:** the consult record panel on the booking detail, and its next-step button (row 53's first step).
  * The FO-3st1 row (`BACKLOG.md:987`) names them, and MVP-CHECKLIST lists "FO-3st1 parts 1-2".
  * There is no separate part-2 row, and no PR.
  * #2613 (J-42) asks the tech lead to shape it and carries no `Completes: R1.42`.
* **FO-3st3:** the booking types and Timings screens. J-42 lists it among its parts, but it is not merged, and `web/src` has no `booking/settings/`. The tech lead should settle whether R1.42 needs it.

"Build merged on main" is true for the API: the consult record routes come from FO-3a part 2a (#2102) and the feed from part 2b (#2313). It is not true for the screens.

## The runs (main a66044692)
| Run | Where | Result |
|---|---|---|
| walks.yml `j_42`, twice | asked of the Lead on #2613 (03:2x UTC) | **not dispatched**; no `j_42` walk has run on main |
| `tests/journeys/j_42.ts`, fresh copy, on the real clock | here (`2026-11-21-r142-qa12/j42_1.txt`) | 22/22, with **2 HELD**: "W8 screen" and "W9" |

## Each Done-when clause
| Clause | How | Evidence |
|---|---|---|
| The single-use link reschedules or cancels inside the firm's notice rule | by screens | j_42 W2 ("Booking updated"), W4 ("Your booking is cancelled."); the public `manage-page.tsx`; `booking/service.ts:306,330,339`, the limit at `:853` |
| Later refused in words | by screens | W5: "It is less than 1 hour before your meeting. …", with no buttons (`manage-page.tsx:33`) |
| Used or expired link refused | by screens | W3 (used), W6 (expired at the meeting's end): "This link is no longer valid. …" (`tokens.ts`) |
| Staff record the outcome (attendance) | by screens | W7: Attended on the staff booking detail, so the booking is COMPLETED, with one audit line (`calendar/detail-panel.tsx:17-29`) |
| Staff record the note (the consult record) | **route only** | W8: saved through `consult/controller.ts:24,27` with the host's session; stored with who and when, plus one audit line. `web/src` has no consult record UI (`detail-panel.tsx:4-5`: "Part 2 adds the consult record and the next step") |

* **DW1:** the manage link is sent by the real sending path; outbox rows are read back from the demo inbox.
* **DW2:** the attendance answer and the consult record are database rows with audit lines.

**Gate A by screens: not met.** The walk holds by screens from W1 to W7. It stops at W8 (the consult record by route) and never reaches row 53's first step (W9, HELD).

## Findings
* **No new bug rows.** The gap is a missing part (P-606), already named on #2613.
* **QA-473** (FO-3 ports on fakeJobs) is no longer true. FO-3 takes PF-14's `PlatformJobs` (`public.controller.ts`), `service.ts:74-78` throws without a JobPort, and no `fakeJobs` is left under `api/src/front-office`. It was already closed on 15 Nov (`history/qa-bugs-closed-2026-11-15-r1-rescore.md`); the R1.42 row now says so.

## Not tested
* The second local run: j_42 takes about 12 minutes on the real clock, so one run here.
* GitHub walks (not dispatched).
* Coverage (c8).
* 200% zoom.
* The shared demo (:4400).

## Questions for the tech lead
1. **Please shape FO-3st1 part 2:** the consult record panel after Attended, plus the next-step buttons. Then j_42 W8 switches to the panel and its HELD lines go.
2. **Does R1.42 need FO-3st3** (booking types and Timings screens), which J-42 lists among its parts?
3. **Please dispatch `j_42` twice on main,** so the built half has its GitHub runs:
   `gh workflow run walks.yml --ref main -f journeys="j_42"`
