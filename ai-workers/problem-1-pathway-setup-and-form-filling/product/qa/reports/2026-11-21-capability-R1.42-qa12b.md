# qa 12 — R1.42 Reschedule or cancel by link; outcomes; consult record: Works on main bfd1b2de1, 21 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), asked by the tech lead (Lead 15): re-score R1.42 once #2750 (FO-3st3b, Timings), #2782 (FO-3st3 suite fix) and #2818 (unhold `check_fo3st3_types_browser.ts`) are on main. Live AI off, US$0. Isolated copies only, never :4400.

The Done when: "The client's single-use link reschedules or cancels inside the firm's notice rule (later refused in words); used or expired link refused; staff record the outcome and the note".

## Verdict
**Works (P-339).**
* **Pack on main's head:** walks.yml run 44910722219 on bfd1b2de1, `j_42` 33/33.
* **Independent re-run:** `j_42` on a fresh copy of bfd1b2de1, 33/33. Walks run 44899086096 on fdb3ba39e is also 33/33.
* **Suites:** all 11 R1.42 suites green on a fresh copy of bfd1b2de1.
* **Gate A:** by screens to row 53's first step.
* **Readers:** two fresh Opus readers, Works about 85% each, on a condition now met.
* **Open:** QA-697 (Minor).

## Parts (P-606): all merged
The parts J-42 lists:
* FO-3sr, FO-3a parts 2a and 2b: on main before the first score.
* FO-3st1 (calendar and booking detail; part 2, the consult record panel and its next-step button): #2717.
* FO-3st3, booking types: #2718. Timings: #2750.
* The types suite fix: #2782. Its unhold: #2818.

## The runs
| Run | Where | Result |
|---|---|---|
| Walk: walks.yml `j_42` (dispatched by the Lead) | GitHub, [run 44899086096](https://github.com/expat-ready/xpatready/actions/runs/44899086096) on fdb3ba39e, job 136831103939 | **33 PASS, 0 FAIL, no HELD**, W0 to W9 (`2026-11-21-r142-qa12b/walk_j42_job136831103939.txt`) |
| Pack: every R1.42 suite (merge batch, main 55a9aba2f + #2619) | GitHub, ci [run 44898035790](https://github.com/expat-ready/xpatready/actions/runs/44898035790), shards | fo3_booking 133 · fo3w_manage 50/50 · fo3w_booking 67/67 · fo3a2_consult_record 39 · fo3st1_consult 21/21 · fo3st1_calendar 27/27 · fo3a_hours_timings 46 · fo3a_booking_types 48 · fo3st3_timings 52/52 · fo3sr_routes 29: all PASS |
| Independent re-run: walks.yml `j_42` on main's head (dispatched by the Lead) | GitHub, [run 44910722219](https://github.com/expat-ready/xpatready/actions/runs/44910722219) on bfd1b2de1, job 136865914912 | **33 PASS, 0 FAIL, no HELD** (`2026-11-21-r142-qa12b/walk_j42_job136865914912.txt`) |
| Targeted nightly re-test `R1.47 R1.42 R1.4 R1.53` (dispatched by the Lead) | GitHub, [run 44912302675](https://github.com/expat-ready/xpatready/actions/runs/44912302675) on bfd1b2de1 | **ran nothing**: its plan job refuses R1 ids (`not a capability id: "R1.4" (want e.g. C11.10)`) |
| The 11 R1.42 suites, fresh copy of main bfd1b2de1 | here (`2026-11-21-r142-qa12b/suites_bfd1b2de1.txt`) | all PASS: fo3_booking 133 · fo3w_manage 50/50 · fo3w_booking 67/67 · fo3a2_consult_record 39 · fo3st1_consult 21/21 · fo3st1_calendar 27/27 · fo3a_hours_timings 46 · fo3a_booking_types 48 · fo3st3_timings 52/52 · fo3st3_types 57/57 · fo3sr_routes 29 |
| `tests/journeys/j_42.ts`, fresh copy of main bfd1b2de1 | here (`2026-11-21-r142-qa12b/j42_2_bfd1b2de1.txt`) | **33/33**, no HELD |
| `tests/journeys/j_42.ts`, fresh copy of main 55a9aba2f | here (`2026-11-21-r142-qa12b/j42_1.txt`) | **33/33**, no HELD |

**The shas:**
* fdb3ba39e→55a9aba2f changes only `tests/check_fo3st3_types_browser.ts` and review notes.
* 55a9aba2f→bfd1b2de1 changes 32 app files. None is in booking. The second reader found two that touch the path indirectly: firm emails now read the firm's logo, and the prospect page W9 lands on shows the retainer card. Both pass in the local walk on bfd1b2de1.
* #2818 changes only `product/tools/run-suites.sh`.
* The merge-batch ci run above is evidence about a merge commit, not main's head. The pack on main's head is the nightly row.

**The batch run's one red is not R1.42's.**
* **What fails:** shard 22, `check_pf28_inputs.ts`.
* **Where it comes from:** #2619 (PF-28 part 1, R1.10). The suite is not on main.
* **Why it fails:** its sweep meets the Timings routes #2727 added (`timings.controller.ts`: PUT `/booking-timings`, PATCH `/booking-types/:id/timings`). They do not reach a zod parse, and they answer 400, not 422, to an unknown field or a wrong type.
* **Whose it is:** #2619's to fix, by moving the two routes onto the input rule or onto its allow-list. R1.42's Done when does not cover how input errors are coded.

## Each Done-when clause (j_42; the fresh reader read the code)
* **Reschedule by the link:** W2, by screens (`j_42.ts:196-212`).
* **Cancel by the link:** W4, by screens (`:226-231`).
* **Inside the firm's notice rule, later refused in words:** W5. B's link inside the 1-hour limit shows "It is less than 1 hour before your meeting. Please reply to this email or call us…" and no Reschedule or Cancel (`:240-246`).
  * The server refuses as well: 409 `SELF_SERVICE_CLOSED` for a cancel and a reschedule inside the limit (`check_fo3_booking.ts:311`).
  * The 1-hour limit is the type's own override, set by screens in W0 on FO-3st3b's Advanced → Timings.
* **Used link refused:** W3 and W4 (`:220-223`, `:233-237`). One link reschedules, and the same link is then refused.
* **Expired link refused:** W6, after a real wait for B's meeting to end. There is no fake clock.
* **Staff record the outcome:** W7, Attended, on the booking detail, by screens, with one audit line.
  * No-show is covered by API: `check_fo3a2_consult_record.ts` DW1 and DW4. A No-show booking refuses a record with 409, and a later No-show keeps the record with no next step.
* **And the note:** W8, the consult record panel, by screens (`:273-298`).

**Server side (the reader):**
* tokens are stored hashed and refused once voided or past the meeting's end (`tokens.ts:31-39`);
* a database trigger voids every live token on any change to the booking;
* every change re-checks the token and the time limit while the booking row is locked (`service.ts:836-862`).

## Gate A: met
* **Start:** Settings → Booking types and the type's Timings (W0, by screens), then the public booking (W1).
* **End:** W9. "Engage and prepare retainer" opens the Engage panel and creates the prospect: row 53's first step (`:303-317`).
* **SQL left in the setup:** the firm, staff, hours, the firm's settings and the 5-minute slot interval. All are declared, and none is a step of R1.42.
  * Host hours could now be set on My account → Availability (FO-3st2). That is outside R1.42 and is noted in QA-697.

## The fresh readers (Opus, ran nothing)
* **First reader, main 55a9aba2f** (`2026-11-21-r142-qa12b/reader-verdict.md`): Works, about 85%, on condition of a second green run on main's head.
* **Second reader, main bfd1b2de1** (`reader-verdict-bfd1b2de1.md`, written before it read the first): Works, about 85%, on condition that run 44910722219 is green. Its Minors: W4's label, the undeclared API sign-in, a stale W9 note, the no-currency refusal checked in the browser only. All are folded into QA-697.

**The first reader's findings:**
* Four Minors, no Blocker, Critical or Major.
  * Two are covered by the packs: the No-show outcome (fo3a2 DW1, DW4) and the server refusal inside the limit (fo3_booking:311).
  * The rest is folded into QA-697.

## Findings
* **QA-697, new** · Bug · Minor · test honesty (J-42). The walk:
  * walks Attended only, with No-show on API only;
  * says host hours "cannot be set through the product yet" (`j_42.ts:29`), though FO-3st2's Availability screen exists;
  * sets the type's notice override, not the firm-wide default, and does not say so in its header.

  **Fix:** a No-show branch by screens, the comment corrected (or the hours set on the screen), and one header line. It does not hold Works.
* **Other open rows naming R1.42:** none.

## Not tested
* Coverage (c8).
* 200% zoom.
* The shared demo (:4400): this cloud copy has none.

## Questions for the tech lead
1. **Reviewer please:** start the independent reviewer on the records PR.
2. **Nightly:** `nightly.yml` and `comment-run.yml` take C-ids only. An R1 row's packs cannot be re-tested there until the plan accepts `R1.n`. Is that a tooling row for you?
3. **QA-697's number** is self-assigned. Open PRs use numbers up to QA-696.
