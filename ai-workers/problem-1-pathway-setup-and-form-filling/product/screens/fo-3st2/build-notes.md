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

## Round 1: reviewer (Changes requested, journey 8/10) and breaker (0 Blockers, 4 Majors), on ea002db43
Fixed, each with a fail test in the suite (now 53/53):
* **Unsaved hours lost** (reviewer M2, breaker M1): Make default, choosing another set, Add a set, another colleague under Viewing, and a reload now ask "Discard your unsaved changes?" (the house Dialog guard's words); dismissed, the edit stays. Tests `break M1 fail/pass`.
* **Keyboard focus dropped** (reviewer M1, breaker M3): after Add a set and Delete → the set's title; Add time off → From; Save time off, Cancel, Remove → "Add time off"; Remove hours → that day's "Add hours". Tests `break M3`.
* **A refused time-off Remove showed nothing** (reviewer m1, breaker M2): "Not removed" with the server's message, and the list refreshes. Test `break M2 fail`.
* A set-wide error ("At most 42 windows in one set.") shows in the notice; a set deleted in another tab offers Reload, which says it drops the edits here; "Change zone" has "Keep <zone>"; "Whole day" resets when the form reopens; Asia/Kolkata and other current spellings are in the zone suggestions; the Admin's browser runs in Asia/Dubai in J-A4, so time off read in the browser's zone would fail (review m4).

Not changed here (with reason):
* **Duplicate set names accepted** (breaker M4): FO-3a part 1b's API (availability.ts), not this row's touch list. Question for the tech lead / Lead B: unique name per person (case- and space-insensitive) in FO-3a, or accepted?
* **A deactivated colleague opened by `?staff=<id>` can be edited** (breaker m11, reviewer context): the picker does not offer them; the server's `target()` accepts any staff of the firm. FO-3a question, same as above.
* A window ending 24:00 shows a blank end (the browser's time field stops at 23:59); a part-day start inside the spring-forward hour is moved by an hour; past time off is saved but not listed (the server lists only future rows); no error summary over the hours (BIC-13); a dozen helper strings are not in concept §5 (hints, "Not saved", "Not removed", "Keep <zone>"). Minors, listed for the reviewer's re-review.
* Graph G3 shows the availability routes as not linked to the page (paths built at run time): a tooling gap, not this row's.

## Round 2 (diff-only re-review, 18 Nov): Reviewer: Approve 5da71ac089209c53e2a6adfba83e7f11211de828
Journey 9.5/10. New Minors left for later (listed so nothing is silent): n1 leaving by the Profile link or the breadcrumb with unsaved hours does not ask; n2 after a refused Remove focus falls to the page; n3 the unsaved/focus flags are module-level (one editor per page today).

## Next step (overlap rule)
Waiting for #2103 (FO-3a 1b-i) to merge. Then: `git merge --no-edit origin/main` once, re-run the FO-3st2 suite and the touched suites, a diff-only re-review on the new head, PR opened non-draft with `Reviewer: Approve <head>` in a comment; no label by this lane. No migration in this row (no stamp needed). Question for the tech lead to post on the PR: duplicate set names and editing a deactivated colleague by URL (FO-3a's API).

## Base moved (18 Nov 19:2x UTC): #2103's new tip 3e0bc800d merged in (it merged main and restamped its migration to 20261118143000; it is now labelled)
Clean merge; this row's diff against the base is unchanged (only its own files). Re-run on fresh copies of the merged branch: FO-3st2 53/53, check_pf1_module_routes 28/28, check_pf6a_frame_browser 52/52 (the menu now also has Terms), check_fo3w_booking_browser 67/67; all exit 0.

## Base moved again (18 Nov 21:5x UTC): #2103's tip 0f634c6cc (it merged main again; it left the queue) merged in
Clean merge; no staff-frame, session or booking-settings file changed in it. Re-run on fresh copies: FO-3st2 53/53, check_pf1_module_routes 28/28, check_pf6a_frame_browser 52/52, check_fo3w_booking_browser 67/67; all exit 0.

## Base moved a third time (18 Nov 23:5x UTC): #2103's tip c1607c3a6 merged in (migration restamped to 20261118220000; a type's read names each host's set; main's PF-6 part 2b)
One conflict, the one-line clash the brief foresaw in `account-sections.ts` (PF-6 part 2b's "Licence" beside "Availability"): both kept, order Profile · Licence · Availability · Team · Licences · Security · Terms; nothing else changed. Re-run on fresh copies: FO-3st2 53/53, check_pf1_module_routes 28/28, check_pf6a_frame_browser 52/52, check_fo3w_booking_browser 67/67, check_pf6_staff_browser 90/90 (added: the staff frame changed); all exit 0.

## Base moved a fourth time (19 Nov 03:3x UTC): #2103's tip c72bca8cd merged in (it merged main; migration restamped to 20261119031000)
Clean merge; none of the staff frame, session, menu, routes, booking settings, slots or guard files changed in it. Re-run on fresh copies: FO-3st2 53/53, check_pf1_module_routes 28/28, check_pf6a_frame_browser 52/52, check_fo3w_booking_browser 67/67, check_pf6_staff_browser 90/90; all exit 0.
