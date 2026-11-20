# FO-3st1 part 1: review (independent, fresh context)

PR #2322 · head 7071b6f9137179d2a0d1a4dbbe690192a4828ecd · the row's diff is `claude/busy-babbage-bpqaoi-fo3a2b...HEAD`. Read: brief FO-3st1 (part 1), concept fo-3-booking r2 (§1, BR-13, BR-14, §4, §4c, §5, §6, §6b, Q4), `design/staff.html`, STANDARDS, EXPERIENCE, QUALITY. Ran the builder's check myself on isolated copies (:4551, :4553) and walked the screen on :4552 (journey test: `journey-test-reviewer-2026-11-19.md`). Paths below are under `prototype/studio/web/src/modules/front-office/booking/calendar/` unless they say otherwise.

**Verdict: Ship after fixes. Journey score 7/10** (below the pass of 8; no criterion at 0).

## Done-when lines (PR body)
J-S1 ✔ · J-S2 ✔ · J-S3 ✔ · J-S4 ✔ as worded (but see M1) · J-S9 ✔ · More → Reschedule sentence, Keep and Cancel booking, "Cancelled by Client F." ✔ · DW10 ✔ (axe, keyboard, 375/1024/1440, 60 bookings with no overlap) · DW11 ✔ (PF-1 28/28). The check passed 21/21 on three runs; one run of four stopped inside the Keep/Cancel step (m7).

## Deviations in the PR body
1. **`area` prop on `platform/frame.tsx`** (outside the touch list): **accepted**. It is additive (+9/−6), PF-6a's suite passes unchanged, and it was asked as a question. The tech lead decides where it lives.
2. **`bookingWrite` beside `staffApi`**: **accepted for now**. It is a small copy of the transport (new-booking.tsx:19-28). The follow-up is for `problemOf` to keep extension fields, so the copy can go.
3. **"Free times for <host>" in Move**: **not accepted as written.** The PR says a time not free for this host "comes back as Book anyway? with the reason". That is false. The server's `place()` (api/src/front-office/booking/service.ts:756-757) gives the move to any free host. I walked it: Client F's Mon 11:00 moved to 09:00 and was saved with host Client D (Billing and finance), with no warning or notice. See M2.
4. **Consult record and Next step in part 2**: **accepted** (the brief splits the parts).

## Findings
**Major**
* **M1 The pinned attendance question depends on the visible range (BR-14).** calendar-page.tsx:64 and :69 take `due` from the feed of the dates shown, which is the week or day ± 1 day. On **Next week** or a Day view, the viewer's due questions vanish. In the default week on a Monday, last Friday's unanswered meeting is never pinned. Walked: two items on this week, 0 on the next. *Fix:* read the pinned list independently of the view: FO-3sr's `GET /attendance-due`, as the concept §6 table names, or a separate feed call over the last 62 days. Add a pass/fail case: a meeting due last week stays pinned while this week is shown.
* **M2 Move changes the host silently, under a heading that names the host.** detail-panel.tsx:79-84 shows "Free times for <host>", fed by the type-wide preview, and sends no host. The server then re-hosts to whoever is free. *Fix:* raise the "Question for the tech lead" on the FO-3sa row now (a staff move keeps its host and warns, or accepts `hostStaffId`). Until it is answered, the dialog must not claim "for <host>", and after a move to another host the panel must say so ("Now hosted by Client D."). Correct deviation 3 in the PR body. Add a test.
* **M3 BR-13 zone not shown as changeable, and the person's zone not used. This deviation is not in the PR body.** new-booking.tsx:116 renders "Times for <person> in <zone>" with no "(change)". :101 always sends the office zone. Walked: Client B (Asia/Dubai) was stored with booker zone America/Toronto, so her emails would use Toronto times. *Fix:* add the "(change)" zone picker (concept §5 "Times for <person> in <zone> (change)"), pre-filled with the person's zone when known, else the office zone, and send it. The lead answer has no `person.timeZone`, so ask for it on the API row in a PR comment.
* **M4 "Today" is the UTC date, not the office zone's.** calendar-page.tsx:30 and :57. Walked with a shifted browser clock: at 21:00 Thu in Toronto, Day view shows Fri. At 22:00 Sun, the week shows next week. A Vancouver office would hit this from 16:00, in working hours. *Fix:* compute today as `dayOf(Date.now(), officeTimeZone)` once the zone is known. Add a test with a fixed clock.
* **M5 Loading is text, not skeletons** (EXPERIENCE §4 [M]; concept §4 "loading skeletons (… week, list)"; BIC-18 Partly, so Must under §6). calendar-page.tsx:108 shows "Loading bookings…", and the panel and free times do the same. *Fix:* use the house `Loading` (front-office/sales/loading.tsx), shaped like the week and the list.

**Minor**
* m1 The Person hint says "Search by name, email or phone", but new-booking.tsx:98 matches name and lead number only. Searching by email gives "No person found". *Fix:* match the words to what it does, or search through an API that covers email and phone.
* m2 The host choice is shown only to people with FO-4's `agent/prospect:assign` (new-booking.tsx:90 reads `leads/assignees`). The server lets anyone with `agent/booking:create` choose a host, so the browser is deriving a permission by proxy (STANDARDS §7). *Fix:* take the type's hosts from a booking answer, or ask the API row.
* m3 Focus falls to `<body>` after the panel, New booking or Move closes (detail-panel.tsx:40 passes no `returnFocus`). WCAG 2.4.3. *Fix:* return focus to the block, row or button that opened it.
* m4 No saved confirmation after Book, Move or Cancel (BIC-18). *Fix:* a toast through the frame's Toaster ("Booked: <when>, <host>").
* m5 The zone line has no tooltip (concept §4c BIC-14; calendar-page.tsx:86). The chip and Mine/Team tooltips are `title`s that keyboard focus cannot reach (BIC-14 Partly).
* m6 At 1440 px three blocks in a cell all read "Clie…" (`fo3st1-team-week-60-1440.png`), and List squeezes Host and Way to meet into wrapped two-word cells. *Fix:* given names only in a shared cell, or the list's widths set per column.
* m7 The check is flaky: 1 of 4 runs stopped in the Keep/Cancel step (tests/check_fo3st1_calendar_browser.ts:200-208). *Fix:* wait for the panel's More after each dialog closes. Each run also rewrites the committed screenshots.
* m8 Free times shows only the first 12 slots (new-booking.tsx:67), about the next two days, although the copy says "No free times in the next 14 days". *Fix:* group by day with a "More times" control, or a day picker.

## D1–D20 (independent reviewer, browser and script)
D1 3: BR-14 pinned scope and BR-13 zone gaps (M1, M3) · D2 3: silent re-host, booker zone (M2, M3); double-click books once · D3 4: reuses FO-4 leads, PF-6 frame, FO-3a feed · D4 N/A · D5 4: state kept in the address; reload, double click and two tabs hold · D6 4: attendance and "booked anyway" audited · D7 N/A (no AI) · D8 4: "Bookings › Calendar"; no link into Bookings from other areas yet (no cross-area menu exists in the app; not this row) · D9 3: M1, m8 · D10 3: m1, M2's heading · D11 3: M5, m4 · D12 3: m6 · D13 4: axe clean, keyboard path, 200 %; m3 · D14 4: house tokens and components · D15 5: 781 ms, one request per view · D16 4: 21 named cases with pass and fail; m7; no tests for M1–M4 · D17 simulated only · D18 4: "Outside <host>'s hours" and "Cancelled by <who>" from the audit · D19 Not yet evidenced (part 2 closes the loop) · D20 simulated only.

## BIC scorecard (concept §4c)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 | N/A | Part 1 has no entry from a lead; the record carries to the retainer in part 2 |
| BIC-02 | Met | New booking asks no phone; way to meet only |
| BIC-03, 05-10, 12, 15-17 | N/A | No facts, documents, applications or tasks |
| BIC-04 | N/A | No optional inputs in part 1 |
| BIC-11 | Met | One primary per area: New booking, Book, Move, Book anyway; Attended and No-show equal (`fo3st1-new-booking-book-anyway-1440.png`) |
| BIC-13 | Partly | A server refusal shows in the dialog's notice and input is kept; no field-level message for a refused date or time |
| BIC-14 | Partly | "+n more", chips, Mine/Team and the pinned item have tooltips; the zone line has none; `title` is hover-only (m5) |
| BIC-18 | Partly | The empty state teaches and read-only says why; loading is text (M5); no saved confirmation (m4) |
| BIC-19 | Met | One heading and one primary per panel at 1440 and 1024 (`fo3st1-team-week-1024.png`); no internal ids |
| BIC-20 | Partly | Keyboard-complete, 200 % with no sideways scroll; focus lost on close (m3) |

## Code checks
Every read comes from the FO-3a feed, and permissions come from `canAnswerAttendance`, `canEdit` and `attendanceDue` (STANDARDS §7). No `x-actor` and no simulated-person control. One feed request per view and no per-row requests. Server authorisation holds: team feed 403 without the list key, 404 outside the record rule. No schema, migration or API change. Removing the "+n more" cut or using `canAnswerAttendance` for pinning fails J-S2 / J-S4. Graph: G1 0, G4 0. The tool lists no front-office pages, so its G3 lines for `bookings/feed`, `attendance` and `reschedule` are a tool limit: the check visits them in the browser. Card: `MODULE.rows/FO-3st1.md` added.

## Not checked
A real screen reader; an intended user's unaided walk (D17, D20); DST-day rendering (the breaker's list); part 2 (J-S5..J-S8).

Reviewer: Changes requested

## Re-review (19 Nov 2026, head 6ae4077f05cf7a5b816dd0281fc6b5e1b2a0c4f8; diff 7071b6f91..6ae4077f0 only)
I read the code diff and break-report.md's Majors. `check_fo3st1_calendar_browser.ts` passed **27/27** on a fresh copy (:4552). I then walked the fixes on that copy (reviewer scratchpad `rr-walk*.mjs`, `rr-focus.mjs`) and restored the screenshots the run rewrote.
* **M1 / break M2 (pinned): fixed.** calendar-page.tsx:53-54,65 pins from the viewer's own feed over a fixed 60-day window. Walked as Client C: 3 pinned this week and 3 still pinned two weeks on. The new case covers a meeting from 9 days ago.
* **M2 (Move re-hosts): fixed on the screen.** detail-panel.tsx:235 now reads "Free times for <type>. If <host> is not free then, another of its hosts may take it." After a host change, :201 says "The host changed: …" (check case, test :224). The keep-the-host rule is asked on the PR ("Question for the tech lead", 16:50Z), as it should be.
* **M3 / break M6 (zone): fixed.** new-booking.tsx:337,374-377 adds "(change)", a zone select and both zones on "Chosen:". Walked: Asia/Dubai 21:00 is stored with booker zone Asia/Dubai, and the saved line shows "Booked Client B Sample for …". The person's own zone is asked of the API row.
* **M4 / break M9 (today): fixed.** calendar-page.tsx:40 uses `dayOf(now, office zone)`; the case runs at 21:30 Toronto.
* **M5 (skeletons): fixed** in the calendar and the panel (`Loading`). "Loading free times…" is still text; that is minor.
* **Breaker M1 (bad address): fixed.** `realDate` handles it: 2027-13-45, 2027-02-30 and hour=foo fall back to this week, and `?view=day&hour=x` shows the day. `?date=0000-01-01` still shows "Wed 1 Dec – Wed 1 Dec" and "Could not load the bookings." This is not a blank page; minor.
* **Breaker M3, M4, M5, M7, M8: fixed.**
  * M3: the hint is honest.
  * M4: a hidden person is unchosen (:348).
  * M5: a Case Officer sees "Client C (you)" and the type's hosts.
  * M7: host names are remembered across weeks.
  * M8: blocks are stacked, so names read at 1024 (`rr-week-1024.png`, no sideways scroll).
* **My minors:**
  * Fixed: m1, m4 (saved lines), m6 (blocks), m7 (3 green runs), m8 (day select, then that day's times).
  * m3 is fixed for the panel (focus returns to the block or row; walked for week and list). Closing **New booking** still drops focus to the page body; minor.
  * Still open as minors, as the builder lists: m2 and m5 (tooltips), the DST note, and a link into Bookings from other areas.

**Size:** 854 changed lines against P-610's 800. That is the tech lead's call on the PR and is not a code finding.

**Journey score now 9/10.**
* 1 each: task, next step, words, feedback, data, recovery, speed, trust.
* ½ accessibility: New booking's focus on close; `title` tooltips are hover-only.
* ½ visual: List's Host and Way to meet columns are still cramped.

**Open:** no Blocker and no Major. Minors to fix later or list with a follow-up:
* New booking focus on close (new-booking.tsx:357, add `returnFocus` to the New booking button);
* the `?date=0000-01-01` range label;
* "Loading free times…" as a skeleton;
* m2, m5 and the DST note.

Reviewer: Approve 6ae4077f05cf7a5b816dd0281fc6b5e1b2a0c4f8
