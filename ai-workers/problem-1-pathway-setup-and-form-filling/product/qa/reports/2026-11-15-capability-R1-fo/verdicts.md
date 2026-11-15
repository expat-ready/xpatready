Fresh reader (Opus), ran nothing, 15 Nov 2026, main 2b7fe0060

Read: the report, every file in this folder, `tests/qa/check_r1_fo3_tz_walk.ts`, `tests/qa/check_qa470_host_mail_zone.ts`, `service.ts:405-469`, `runtime-ports.ts`, `engine/runtime/stages.ts:1-12, 105-122`, `web/src/pages/history.tsx:25-38`, `api/src/case-feed.ts`, AG-04 v2.1 lines 410-414, RULES.md "When a capability counts as Works", P-348, P-405, and the Done when lines in `qa/CAPABILITIES.md` at #1748's head 42466b9ca. **CI:** `git cat-file -p 2b7fe0060` gives tree `a96301aad597…`, the same as the report's. I did not open run 43656353002 or its jobs. I took the four job ids and counts as qa transcribed them (fo3 105/105, fo1b 80/80, fo1a 124/124, fo5 60/60). The qa re-runs in this folder match those counts (run1 and run2).
**Gate A as written:** RULES.md and P-348 (3) say "by screens only". No booking, sales or retainer screen exists, so no FO row meets gate A as written. The API walk (19/19 twice) is supporting evidence, said plainly. It is not gate A met. Its set-up writes the firm, host and type straight to the database (walk:23-26). Those writes are preconditions owned by other rows (PF-5, PF-4s, FO-3a). They do not make the run Not tested: a pack exists and the server is real, so P-405 does not apply. But the walk proves nothing about how a person reaches the booking page.

**R1.38 Time zones from booking page to invite: Partial.** Done when: "shown in the client's zone, stored in UTC, appears in the staff zone and in the invite with the right offset across a daylight-saving change".
Evidence: pack lines 13-15 (DST both ways), 57 (DTSTART in UTC); walk lines 2-12, 16 (March 2027 change, SQL zone-free 15:00Z). Missing: the staff zone. There is no staff view. The only staff surface on main is the host's email, and it shows the booker's zone (`service.ts:426, 443`; check_qa470-mine.txt lines 2-3 FAIL). QA-470 therefore fails a Done-when clause directly, not only a later screen. Gate A: not met (no screen). By API, met for the booker side only. The invite is not observable.

**R1.40 Calendar invite files: Partial.** Done when: "Each booking and change sends an .ics with the same time; an update replaces the event (same UID); a cancel removes it".
Evidence: pack lines 57-60, 67, 70 (REQUEST, stable UID, SEQUENCE 0→2, CANCEL with the same UID); `service.ts:428-443` attaches the .ics to both mails; walk line 17 shows only the sequence column. Scope: building the .ics and handing it to MailPort is R1.40. Real delivery (delivery state, bounces, sender name) is map row 48's scope (PF-19b, PF-L), so the fake mail is not a missing R1.40 change. The row is still not Works: in the running app the MailPort is `fakeMail` (`runtime-ports.ts:5, 18`), and no walk can open the invite. Missing: an invite observed in the running app, through a fake-outbox read on isolated copies or through PF-4b. Gate A: not met. Nothing past the pack shows the .ics.

**R1.37 Public booking page; no double booking: Partial.** Done when: books "on the firm's page"; two at once give one booking and one refusal in words (DB rule, two connections); confirmation in the client's zone. Evidence: fo1b job 132636128218 80/80; fo3 pack lines 39-40 (20 parallel → 1), 56 (confirmation in the client's zone); walk line 13 (409). Missing: the page itself (FO-3w); booking types cannot be created (FO-3a). Gate A: not met; no page.

**R1.41 Staff hours and time off: Partial.** Done when: hours and time off set; no slot inside time off or outside hours; overlapping hours refused by DB. Evidence: fo3 pack lines 4, 12, 43-45; fo1b 80/80 (overlap). Missing: any route or screen to *set* hours or time off (FO-3a, FO-3st); today only a seed does it. Gate A: not met; no route, no screen.

**R1.42 Reschedule or cancel by link; outcomes; consult record: Partial.** Done when: link reschedules or cancels inside the notice rule (later refused in words); a used or expired link is refused; staff record the outcome and the note. Evidence: fo3 lines 64-75, 84; walk lines 14-19. Missing: an HTTP route for staff outcomes (the service only, line 84; FO-3w-staff named only); the note / consult record (FO-3a). Gate A: link half by API only; outcome half not reachable.

**R1.27 Every lead carries a source: Partial.** Done when: a source on every lead; a lead without one refused by the DB (fail case); lists filter by source. Evidence: fo1a job 132636128216 124/124; `fo-columns-demo-readonly.txt` lines 1, 3 (NOT NULL). The fail case is not a test: the pack has none, and the column listing is a read, not a check. Missing: that fail test, FO-2 (no lead can be made), filtering by source (FO-4). Gate A: not met.

**R1.29 One person record; duplicate warning; safe merge: Not built** (FO-1a's `fo_person` table is merged). None of the Done-when clauses exists: no warning, no merge, no undo (FO-9a, FO-9b, FO-9s). Gate A: nothing to walk.

**R1.53 Retainer with the regulator's 26 items; versioned until sent: Partial.** Evidence: fo5 job 132636128199 60/60 (versions immutable, SENT checked at commit). Missing: the 26-item checklist (FO-5b), routes (FO-5 part 2, #1777 queued), screens (FO-5s). Unconfirmed: no counsel. Gate A: not met; tables only.

**R1.104 Consultation agreement signed before the first consult: Not built** (FO-5 part 1's template kind `CONSULTATION` is merged; column listing line 4). Nothing of "cannot start until signed / reminder / signed copy on the person" exists (FO-3c, FO-5 part 2, FO-5s). Gate A: nothing to walk.

**R1.74 Government deadlines that remind; working days with holidays: Partial**, kept so by QA-471 Major. There is no Done when line (the case-side row has "no qa capability row"); judged on the row's words. Built: a deadline worked out on read in calendar days, Sample (`stages.ts:4-5, 113-116`, "No filing item, no reminder, no Needs you"). Not built: reminders, working days, holidays. Business days exist only for PF-21 complaints. Gate A: the deadline is seen under C6.17; nothing reminds.

**R1.76 Notes; one timeline per record: Not built** (merged: the workspace-wide Activity page, `history.tsx:31` "in this demo workspace", firm-filtered by `case-feed.ts`; the `fo_note` table, with no route). No note can be written on a case or person, and no record has its own timeline. The report lists only built parts. QA-472 stands. Gate A: nothing to walk.

**Rows 77 and 80: no duplicate.** No R1.77 or R1.80 exists; both point at existing C rows. Row 80 → C7.1 (Works), C7.8 (Works), C7.2 (Partial) covers its words, so the row takes Partial from C7.2. Row 77 → C8.2 covers "submission number and UCI" only. "Decision, close, reopen" is in no C row (BK-17, B5-filings), so the mapping is incomplete but not a duplicate. Row 77 stays Partial at most.

## Findings
* **QA-470 UX · Minor: agree, with a note.** The host's text gives the right instant, labelled with its zone. The attached .ics is in UTC (`service.ts:443`), so the host's calendar shows office time. No wrong time is given. It does fail R1.38's "staff zone" clause, and AG-04 rule 9 (line 414) is explicit. Raise it to Major only if the founder counts the host's email as a "staff view".
* **QA-471 Gap · Major: agree.** A rule the checklist marks "Merged / built (map)" is absent and has no BACKLOG row. A missed government deadline loses the client's application.
* **QA-472 Gap · Major: agree.** Notes and per-record timelines are basic case and CRM behaviour. The checklist claims they are built; they are not.
* **QA-473 Gap · Minor: agree on severity; change the row.** The PF-14 adapter is on main (`api/src/platform/jobs/pgboss-jobs.ts`), but `runtime-ports.ts:3-4, 18` still uses fakeJobs. Reminders are in neither R1.37's nor R1.40's Done when. The attendance question lost on a restart feeds R1.42's "staff record the outcome". Map it to R1.42.

## What the qa lane got wrong or overstated
1. §2 calls the API walk "Gate A". RULES.md and P-348 (3) say by screens only. It should read "gate A not met; API walk as evidence".
2. R1.38: QA-470 fails a Done-when clause. It is not only a UX note beside a missing staff screen.
3. QA-473 is mapped to R1.37/R1.40; it belongs to R1.42.
4. Row 77 → C8.2 is presented as a full mapping. C8.2 lacks "decision, close, reopen".
5. R1.27's NOT NULL is evidenced by a read-only column listing, not a pack fail test. The report says so, but should not count it as proven.
6. "All 21 jobs succeeded" and the four job counts are not verified here (transcription accepted; tree equality verified locally).
