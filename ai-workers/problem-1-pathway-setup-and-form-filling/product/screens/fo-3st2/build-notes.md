# FO-3st2 build notes (draft PR body until the PR opens; overlap rule, base #2103)

Branch `claude/screens-fo3st2`, built on `claude/runtime-fo3a1b` (#2103, FO-3a part 1b-i) at d9273db70, as the overlap rule says (lead-b-briefs/overlap-starts-2026-11-18.md on `lead-b-front-office`). The PR opens only after #2103 is on main and main is merged in.

**Duplicate check:** searched BACKLOG (FO-3st2; FO-3a 1b is its API; FO-3st3 is types and timings), open PRs (none on `booking/availability/`), main (no availability screen), qa/BUGS.md; none.

## Done when → test (tests/check_fo3st2_availability_browser.ts)
* `FO-3st2 J-A1 pass/fail` (rule 1): one set "Normal hours", Default, Mon-Fri 09:00-17:00, "Times in America/Toronto"; no Delete set; the server refuses deleting it ("You cannot delete your default set.").
* `FO-3st2 J-A2 pass/fail` (rules 1a, 1b): "Evening calls" Tue/Thu 18:00-20:00 saved changes nothing until made default; then the public slots (FO-3's slots route) of a type naming no set are Tue 18:00-19:30 only.
* `FO-3st2 J-A3 pass/fail` (rule 2): 14:00-13:00 → "End must be after start." on that window, nothing saved; overlapping windows → "These hours overlap." on the later one, nothing saved.
* `FO-3st2 J-A4 pass/fail` (rule 8): an Admin picks Client F under "Viewing", enters whole-day time off on the Monday → saved midnight to midnight Toronto; her public booking at 10:00 that day unchanged (staff booking route); To before From refused on the field; a Case Manager sees no picker, `?staff=` shows their own, the server answers 403. Deactivated colleagues are not offered.
* `FO-3st2 J-A5 pass/fail` (rule 4): "Mars/Olympus" refused on the zone field; Asia/Kolkata → "Times in Asia/Kolkata"; saving shows "Existing bookings are not moved."; Delete set confirm, Keep, Delete.
* `FO-3st2 DW6`: no-hours text and "No time off planned."; loading skeletons; keyboard only (Tab to Add hours, Enter, Tab to Save hours, focus kept); axe no serious/critical at 375, 1024, 1440; no sideways scroll.

Dates: the Monday at least a week ahead (the requirement's "Mon 26 Oct" is in the past and the running app uses the real clock).

## Found while building
* The browser's zone lookup turns "Asia/Kolkata" into "Asia/Calcutta"; the screen now sends the zone as typed and the server checks it.
* The shared Button is disabled while busy, which dropped keyboard focus after "Save hours"; the screen puts focus back after each answer.

## Checks (18 Nov, on ea002db43)
* `check_fo3st2_availability_browser.ts` 42/42, exit 0 (isolated copy, PLATFORM_IDENTITY=local).
* `run-suites.sh --changed` selected ALL (no route map for the new files), so per the skill the touched files' suites ran: `check_pf1_module_routes.ts` 28/28, `check_pf6a_frame_browser.ts` 52/52, `check_fo3w_booking_browser.ts` 67/67, all exit 0.
* `graph.mjs --check` exit 0; `count-any` 417 = base 417.
* Size: ~620 changed lines (under 800).
* Card unchanged: web/src/MODULE.md (no entry point, invariant or test list change: a module page through routes.tsx and one ACCOUNT_SECTIONS entry).
