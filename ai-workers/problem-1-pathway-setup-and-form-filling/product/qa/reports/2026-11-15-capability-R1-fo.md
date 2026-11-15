# qa capability R1: Front office, Client money and case side, 15 Nov 2026

**Mode:** `/qa capability`, the R1 rows of `MVP-CHECKLIST.md` §A in Front office, Client money and the case side whose changes are on `main` (founder A68; P-592). Brief changed by Lead 51 at 09:1x IST: score the R1 rows of PR #1748 (ids `R1.<map row>`), no new section. **Tested on main 2b7fe0060** (tree `a96301aa`). Live AI off, US$0, no priced button (P-175). Verdicts: `2026-11-15-capability-R1-fo/verdicts.md` (a fresh Opus reader that ran nothing, P-303, P-432).

## 1. The counted run on GitHub's runners (P-339)
Merge-queue run **43656353002** ("Merge of #1753", head `180884d10`). Its tree `a96301aad597ab7b2e6af3d349d081ae4390a8d0` equals `git rev-parse origin/main^{tree}` for main 2b7fe0060. All 21 jobs succeeded. The packs, as each shard's summary table prints them:

| Pack | Job (shard) | On GitHub | qa's re-run (this container, real PostgreSQL 18) |
|---|---|---|---|
| `check_fo3_booking.ts` (FO-3) | 132636128211 (shard 6) | PASS, 105 passed, 0 failed | 105/105 · 105/105, exit 0 |
| `check_fo1b_booking_schema.ts` (FO-1b) | 132636128218 (shard 1) | PASS, 80 passed, 0 failed | 80/80 · 80/80, exit 0 |
| `check_fo1a_sales_schema.ts` (FO-1a) | 132636128216 (shard 8) | PASS, 124 passed, 0 failed | 124/124 · 124/124, exit 0 |
| `check_fo5_retainers.ts` (FO-5 part 1) | 132636128199 (shard 2) | PASS, 60 passed, 0 failed | 60/60 · 60/60, exit 0 |

Outputs: `2026-11-15-capability-R1-fo/check_*-mine-run{1,2}.txt`.

## 2. Gate A: not met (no screen); an API walk as supporting evidence (P-348 (3))
There is no booking page, staff booking screen or booking-settings screen on `main`. RULES.md and P-348 (3) say gate A is walked by screens only, so **no front-office row meets gate A** (fresh reader). As supporting evidence only, an API walk to the next step: `tests/qa/check_r1_fo3_tz_walk.ts` against a running isolated copy (`isolated.sh qa_fo3 4471`), twice, **19/19 both times** (`walk-api-run1.txt`, `walk-api-run2.txt`).
* **Setup is not through the product.** A person cannot yet create a firm (PF-5), staff (PF-4s), hours (FO-3a) or a booking type (FO-3a), and the shared demo has 0 firms. The walk therefore writes one firm, one host, the firm's hours (with the product's own `copyFirmHoursTo`) and one type with Prisma. Everything after that goes over HTTP.
* **Walk (Toronto leaves EST for EDT on 14 Mar 2027):**
  1. Slots in Asia/Dubai: Friday 12 Mar's first slot is 14:00Z (09:00 EST); Monday 15 Mar's is 13:00Z (09:00 EDT); nothing on the weekend. Labels read Fri 10:00 Toronto as "7:00 p.m. (Asia/Dubai)" and Mon 10:00 as "6:00 p.m.". With no zone given, the page answers in America/Toronto. An unknown zone gets 400.
  2. Book: 201. Stored 15:00 UTC, read zone-free with SQL. Booker zone kept, sequence 0. The same time booked again by someone else gets 409, so one booking only.
  3. **Next step (R1.42):** the self-service link opens the booking in the booker's zone. Its move list is in that zone. Moving across the change gives RESCHEDULED, 14:00Z, "6:00 p.m.", a new link and sequence 1 on the same booking id. The old link gets the identical not-found an unknown link gets. Cancel gives CANCELLED, and the freed time is offered again.
* **The invite (.ics) cannot be seen in the running app.** The app's MailPort is PF-0p's `fakeMail`, kept in memory, so nothing leaves the machine until PF-4b / PF-19b (`api/src/front-office/booking/runtime-ports.ts`). The invite's content is proved by the pack only: METHOD:REQUEST, a stable UID, SEQUENCE:0 and then 2, DTSTART in UTC, CRLF lines, folding at 75 octets, escaping, METHOD:CANCEL with the same UID, no typed answer inside (`check_fo3_booking-mine-run1.txt` lines 56-60, 67, 70).
* **Not walked:** headed browser, 400/1024/1440 px, keyboard and axe. There is no screen. Staff create, reschedule, cancel, attendance and list are services only: no HTTP route on `main`, although PF-4 merged (FO-3w-staff is named only, BACKLOG rev 16).

## 3. Rows (Done when = #1748's "what qa tests" line; what is merged; what is missing)
* **R1.38 Time zones from booking page to invite** (FO-3 is the whole row on the checklist). The slot shown in the client's zone, stored in UTC, correct across DST both ways (pack: DST pass/fail at 1 Nov 2026 and 8 Mar 2026; walk: March 2027); the invite in UTC. **QA-470 (UX · Minor):** the host's email gives the booker's zone. **Missing:** a staff view in the office zone, which waits on the staff screens (FO-3st).
* **R1.40 Calendar invite files** (FO-3 only). Each booking and change gets an .ics with one UID; an update raises SEQUENCE; a cancel sends METHOD:CANCEL. Proved in the pack on fakes; the walk shows the sequence source rising. **Not delivered** in the running app (fake mail; sending is map row 48, PF-19b, PF-4b).
* **R1.37 Public booking page; no double booking.** Merged: FO-1b (exclusion constraint), FO-3 (API; 20 parallel requests give one booking in the pack; 409 in the walk). **Missing:** the booking page itself (FO-3w) and booking types (FO-3a).
* **R1.41 Staff hours and time off.** Merged: FO-1b tables and the firm-hours seed; FO-3 honours hours, time off and closed days (pack). **Missing:** any route or screen to set them (FO-3a, FO-3st).
* **R1.42 Reschedule or cancel by link; outcomes; consult record.** Merged: self-service reschedule and cancel by link (pack and walk), the notice limit (pack line 74), staff services. **Missing:** staff routes (FO-3w-staff, named only), the outcome screen, and the consult record (FO-3a).
* **R1.27 Every lead carries a source.** Merged: FO-1a. `fo_lead.door` and `fo_lead.source` are NOT NULL (`fo-columns-demo-readonly.txt`, read-only on the demo); attribution is write-once (pack). The pack has no fail test for a lead without a source, so qa added `tests/qa/check_r127_lead_source.ts`: a firm seeded by the product's own `seedFirmFrontOffice`; a lead with door and source is saved; no source, a NULL source or no door is refused by the database (not-null); 5/5, twice (`check_r127-mine-run{1,2}.txt`). **Missing:** FO-2 (the doors that make leads) and filtering lists by source (FO-4).
* **R1.29 One person record; duplicate warning; safe merge.** Merged: FO-1a's `fo_person`; a repeat enquiry makes a second lead on the same person (pack). **Missing:** the duplicate warning and merge (FO-9a, FO-9b, FO-9s).
* **R1.53 Retainer with the regulator's 26 items; versioned until sent.** Merged: FO-5 part 1 tables. Versions are immutable, a new file makes a new version, the merge snapshot is kept, SENT is checked at commit (pack). **Missing:** the routes (FO-5 part 2, #1777, queued), the 26-item checklist (FO-5b) and the screens (FO-5s).
* **R1.104 Consultation agreement signed before the first consult.** Merged: FO-5 part 1's template kind `CONSULTATION`, and an agreement without a prospect is accepted (pack). **Missing:** FO-3c (send for signing, the "not signed yet" state and the reminder), FO-5 part 2 and FO-5s.
* **R1.74 Government deadlines that remind; working days with holidays** (case side; checklist "built (map)"). Built: a stage's deadline worked out on read, `add_days` calendar days, Sample (`engine/runtime/stages.ts:4-5, 113-116`: "Sample, never a reminder … No filing item, no reminder, no Needs you"), under C6.17 (Works). **Not built:** reminders, working days, holidays. Only PF-21's complaints have business days (`api/src/platform/complaints/business-days.ts`). No BACKLOG row. **QA-471 (Gap · Major).**
* **R1.76 Notes; one timeline per record** (case side; checklist "built (map)"). Built: one workspace-wide **Activity** page ("every create, change … in this demo workspace", `web/src/pages/history.tsx:27-36`), filtered per firm by `api/src/case-feed.ts`, plus FO-1a's `fo_note` table (add-only, no route). **Not built:** a note on a case or person, and a timeline per record. No BACKLOG row. **QA-472 (Gap · Major).**
* **Row 77 → C8.2** (Partial, QA-397 Major open), for "submission number and UCI" only. "Decision, close, reopen" is in no C row and not on `main`: there is no case decision, close or reopen state or route (`prisma/schema/cases.prisma`; `api/src/case-work.ts` has only "ready_to_file_reopened"). **QA-474 (Gap · Major).** **Row 80 → C7.1** (Works), **C7.8** (Works), **C7.2** (Partial), which covers its words; the row takes Partial from C7.2. No R1 rows: mapped, not duplicated (Lead 51).

## 4. Findings (open; `qa/BUGS.md`)
* **QA-470 · UX · Minor · R1.38.** The host's booking email states the booker's zone: "Consultation is booked: Tuesday, November 17, 2026 at 7:00 p.m. (Asia/Dubai)". AG-04 v2.1 Part B rule 9: "Staff views show the host's office time, labelled when it differs from the viewer's … (AG01-24)". `service.ts:426, 442-443` use `b.bookerTimeZone` for the host's mail. Check `tests/qa/check_qa470_host_mail_zone.ts`: 1 pass and 2 fails today (`check_qa470-mine.txt`). Lane: runtime.
* **QA-471 · Gap · Major · R1.74.** Reminders and working days with holidays for government deadlines are not built and have no BACKLOG row. The checklist marks row 74 "Merged / built (map)". Lane: the Lead (shape a row).
* **QA-472 · Gap · Major · R1.76.** Notes on a case or person, and a timeline per record, are not built and have no BACKLOG row. The checklist marks row 76 "Merged / built (map)". Lane: the Lead (shape a row).
* **QA-473 · Gap · Minor · R1.42** (the fresh reader moved it from R1.37/R1.40: the attendance question feeds "staff record the outcome"). FO-3's running ports still use `fakeJobs` ("until PF-14's pg-boss adapter"), although PF-14 (#1757) is on `main`, so the 24 h and 1 h reminders and the attendance question are lost on a restart. Minor while mail is a fake as well. Lane: runtime.

* **QA-474 · Gap · Major · row 77 (C8.2's mapping).** A case's decision, close and reopen are not built and are in no C row. The checklist marks row 77 "Merged". Lane: the Lead (shape a row).

## 5. Verdicts (fresh Opus reader that ran nothing; `verdicts.md`)
**0 Works · 7 Partial · 4 Not built.** Partial: R1.38 (the "staff zone" clause fails: QA-470), R1.40 (the .ics is right in the pack, but no walk can see it: fake mail), R1.37, R1.41, R1.42, R1.27, R1.53, and R1.74 (held by QA-471 Major). Not built (a merged part named): R1.29 (`fo_person`), R1.104 (template kind `CONSULTATION`), R1.76 (workspace Activity page, `fo_note` table). The reader accepted qa's transcription of the four CI job counts and verified the tree locally. The four shard summary lines are quoted in `ci-run-43656353002.txt`.

## 6. Could not test
The invite as received, and any mail (fake mail). Any screen. A walk on the shared demo (:4400): this container's demo has 0 firms, and booking needs one. Coverage (c8) was not run: these are API rows with their own packs.

## 7. Questions for the Lead (PR comment on #1748, 15 Nov; the bridge to Lead 51 refused this cloud session)
1. R1.74 and R1.76 have no row in #1748. Add exactly those two?
2. Lead 45's answers 3 and 5 on #1748 were never applied on its head.
3. The checklist's rows 74, 76 and 77 say "Merged" (74 and 76: "built (map)"); on `main` only the parts above are built (QA-471, QA-472, QA-474).
4. Gate A for API-only rows: RULES.md says by screens only, while the brief said "otherwise by API". The reader held to RULES. Should an API-only row (such as R1.40's invite) ever reach Works before its screen exists, for example with a dev-only fake-outbox read on isolated copies?

## 8. Suggestions
* *Needed for the proof · Capability:* wire FO-3's staff routes now that PF-4 is on `main` (FO-3w-staff). Rows 41 and 42 cannot be walked without them.
* *Later · Scaffolding:* a dev-only read of the fake outbox on isolated copies, so a walk can open the invite and the self-service mail.
