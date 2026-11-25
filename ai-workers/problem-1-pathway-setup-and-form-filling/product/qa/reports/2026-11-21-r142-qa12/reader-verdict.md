# R1.42 reader verdict (fresh reader, P-339; ran nothing; main a66044692, 21 Nov)

S = `prototype/studio`. Read only: files, git, REST. No walk run by this reader.

## 1. Per clause
| Clause | How met | Evidence |
|---|---|---|
| Reschedule or cancel by single-use link, inside the notice rule | **Screens** | public manage page `web/src/modules/front-office/booking-public/manage-page.tsx`; API `api/src/front-office/booking/service.ts:306,330,339` (manageView, selfReschedule, selfCancel), limit `:853` (selfServiceOpen); j_42 W2, W4 (`tests/journeys/j_42.ts:146-188`) |
| Later refused in words | **Screens** | `manage-page.tsx:33` ("It is less than … before your meeting. Please reply … or call us on …"); API `service.ts:91` (tooLate, 409); j_42 W5 `:190-197` |
| Used or expired link refused | **Screens** | `manage-page.tsx:26` (BAD_LINK); `tokens.ts:4-5,19,38` (voided on change, expires at meeting end); `service.ts:85` (one not-found); j_42 W3, W6 `:170-205` |
| Staff record the outcome (attendance) | **Screens** | `calendar/detail-panel.tsx:17-29,81-83` (Attended / No-show); route `staff.controller.ts:39-40`, `service.ts:400`; j_42 W7 `:207-221` |
| Staff record the note (consult record) | **Route only** | `consult/controller.ts:24,27` (GET/PUT `:id/consult-record`, FO-3a part 2a #2102). No UI: in `web/src` only `contract.ts:14` (`hasConsultRecord` flag); `detail-panel.tsx:4-5` says "Part 2 adds the consult record and the next step". j_42 W8 saves by route `:223-238` |

## 2. Gate A by screens
The walk holds by screens W1-W7 (link reschedule, used, cancel, too late, expired, Attended on the booking detail). It stops at W8: the consult record has no panel, so j_42 prints `HELD J-42 W8 screen` and `HELD J-42 W9` (`j_42.ts:226-228`). **Row 53's first step (the consult record's next-step button, AG-4-50) is not reached.** Gate A: not met.
No j_42 walk has run on main. qa's local `j42_1.txt` (uncommitted) holds only the setup line: no result to read.

## 3. Parts merged (P-606)
Merged: FO-3 (link half), FO-3sr/FO-3w-staff (attendance route), FO-3a parts 2a (#2102, consult record API) and 2b (#2313, feed), FO-3st1 part 1 (#2322, calendar + detail + attendance), J-42's journey (#2613, merged 21 Nov 02:14 UTC, e34ef4e44, no `Completes: R1.42`, "Not complete … until FO-3st1's consult record part lands").
**Missing part: FO-3st1 part 2, the consult record panel and its next-step button.** No commit or open PR names it (REST, open PRs: none). FO-3st3 (types and Timings screens) also has no merge on main, and J-42 lists it as a part.
Shaped? Only partly: `MVP-CHECKLIST.md` lists "FO-3st1 parts 1-2" and the FO-3st1 row (`BACKLOG.md:987`) describes "then the consult record (AG-4-49), whose next step is a button (AG-4-50)" with Done when "A consult record cannot open before Attended". There is no part-2 row with its own Touch and Done when; #2613's question to the tech lead to shape it is still open. Its waits-on (FO-3a parts 2a, 2b) are merged, so it is unblocked.

## 4. QA-473 (FO-3 ports on fakeJobs)
**No longer true on main.** `runtime-ports.ts:1-4,17-21` leaves jobs out; the `Booking` provider takes PF-14's `PlatformJobs` (`public.controller.ts:12,19-27`); `service.ts:74-78` throws if no JobPort. `fakeJobs` has no hit under `api/src/front-office`. Arrival is also real (`PrismaArrival`, `runtime-ports.ts:6-8`), so the "no booker after restart" limit is gone too. QA-473 was closed 15 Nov (a77a0c832). No open BUGS.md row names R1.42. Records gap: QA-473 has no row in `BUGS-CLOSED.md`.

## 5. Verdict
**Partial, parts missing** (no Works verdict under P-606). Four clauses hold by screens; the consult record note is held by route only; gate A stops before row 53. To finish: shape and build FO-3st1 part 2 (panel + next-step button), switch j_42 W8 to the panel and drop the HELD lines, then a j_42 walk on main. Also check FO-3st3's status against J-42's part list.
Confidence: high (0.9). Caveat: this reader ran nothing; the screen clauses rest on code and j_42's checks, and j_42 has not run on main.
