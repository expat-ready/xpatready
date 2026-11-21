VERDICT: PARTIAL

R1.40 "Calendar invite files", main c66a41c96 (studio tree 1b360046e; the rec checkout's studio tree is the same 1b360046e).
Fresh reader, ran nothing (P-303). Done when: each booking and change sends an .ics with the same time; an update replaces
the event (same UID); a cancel removes it.

## (1) Done-when clauses against the journey walked by screens (J-38, walk-steps-pack.txt = rerun, 22/22 each)
a. Booking sends an .ics with the same time: MET.
   - pack:16-18 "PASS J-38 W4: the .ics from the booker's mail / the host's mail / "Add to calendar" on the confirmation is
     one calendar event starting at 2026-11-23T15:00:00.000Z (UTC) for 30 minutes, a REQUEST with the booking's UID"
   - pack:19 "PASS J-38 W4: the booker's mailed invite is the invite "Add to calendar" gives (the writing stamp aside)"
   - pack:11 DW1: real outbox path, SENT by the local adapter, read from the demo inbox (not the fake).
   - Real assertion: j_38.ts:60-71 parses RFC 5545 (unfolds, one VCALENDAR/VEVENT, METHOD, UID, DTSTART/DTEND only in
     UTC form); j_38.ts:174-178 asserts text/calendar, 1 event, start === booked instant, end +30 min, METHOD REQUEST,
     UID === `${booking.id}@booking.expatready.com`; expected time worked out with plain UTC sums, not product code.
     Re-run shows a different UID (2386cdd0... vs 594ff2c4...) with the same checks: real data, not a canned value.
b. A change sends an .ics with the (new) time: NOT IN J-38.
c. An update replaces the event (same UID, SEQUENCE rising): NOT IN J-38. readInvite (j_38.ts:66-70) does not even read
   SEQUENCE; there is no reschedule step.
d. A cancel removes it (METHOD:CANCEL, same UID): NOT IN J-38. No cancel step; the walk ends at W5 (pack:23, j_38.ts:194)
   only checking that the manage page offers "Reschedule" (row 42's first step).
   The header itself scopes J-38 to booking + time zones (j_38.ts:7-12).

Where b-d ARE shown, and why it does not count here:
   - Underneath only, in CI: tests/check_fo3_booking.ts:254 (SEQUENCE:0, REQUEST, UID), :284 ("the update keeps the UID
     and carries SEQUENCE:2"), :291 ("METHOD:CANCEL with the same UID"); ci-suites.txt:10 job 135744274422 133/0 in run
     44575502680 (tree 1b360046e = main's). API level with in-process mail, not by screens.
   - By screens but without reading any .ics: check_fo3w_manage_browser.ts:147,156,169 (reschedule, sequence 1/2, cancel);
     ci-suites.txt:5 50/50. No .ics/UID/METHOD assertion in that file.
   - By screens with the invites: tests/qa/check_r138_r140_booking_page_walk.ts:112-142 (one UID, SEQUENCE 0<1<2,
     REQUEST, REQUEST, CANCEL, moved DTSTART), but its 35/35 was on older main f7dde02c8, run locally; no run on
     c66a41c96 and no GitHub runner run in this pack. walks.yml only walks tests/journeys/j_*.ts (walks.yml:5-8,31), so
     this qa check cannot be the GitHub walk as written.

## (2) P-339
- J-38 on main's head on GitHub's runners: pack run 44600075318 job 135829147812, independent re-run 44600084855 job
  135829118189 (batch-checks.txt:3), both 22/22, outputs differ only in run data. Green, but it covers clause (a) only.
- Front-office suites: run 44575502680 (batch #2344, head 6f1ef9c36), studio tree 1b360046e = main's
  (batch-checks.txt:1), all 15 suite lines PASS 0 failed. main's own head batch 44594750686 ran fast+types only
  (records change); accepted as tree-equal.
- Run ids and trees are taken from the pack as reported; this reader did not open GitHub (no network).
- So: P-339 is met for the booking invite, not for the update and cancel invites by screens.

## (3) P-305 open findings
- Only QA-475 names R1.40: Minor (jobs queued after commit, failures only logged). Does not hold it. No open Major or
  Critical in bugs-open.md.

## (4) Earlier "Missing" items
- J-38: now exists and is green twice on GitHub on main c66a41c96, but it does not walk the change or cancel, so it does
  not by itself close the row's Done when.
- A GitHub run on main's tree: now met (44575502680 tree-equal; 44600075318 / 44600084855 on c66a41c96).

## What would make it WORKS
- Extend J-38 (or add a journey under tests/journeys/) past W5: Reschedule on the manage page, then Cancel booking;
  read the demo inbox and assert per invite: same UID, SEQUENCE strictly rising, METHOD REQUEST, REQUEST, CANCEL, the
  moved DTSTART equal to the new instant in UTC (+30 min DTEND). Walk it with walks.yml on main's head, plus a re-run.
  The assertions already exist in tests/qa/check_r138_r140_booking_page_walk.ts:112-142 to copy.
- Nothing else holds it (no Major/Critical; Gate A booking path walked to row 42's first step).
