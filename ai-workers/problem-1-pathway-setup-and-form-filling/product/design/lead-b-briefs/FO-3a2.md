# Brief: FO-3a part 2, the consult record, its read port and the staff read feed (map row 42; rows 37, 39) (cloud builder lane; row owner Lead B)

Written 16 Nov 07:2x IST by Lead B (6), rev 16.43, for P-626 (finish the Partial capabilities first). Row: BACKLOG **FO-3a**, whose "part 2" (the consult record and the calendar feed, AG-4-49, -67) the shaping lane left unbriefed for want of a read port (`FO-3a.md`, line 3). Concept: `screens/fo-3-booking/concept.md` r2 (FO-3sc, #1819), BR-14, BR-15, BR-16, §6 and its answers Q3 and Q4. **Model: Opus 5.5, effort: high** (schema, a shared port and a permission read; reviewer and breaker at high, P-605).

**Two PRs, one after the other in this lane or in two lanes:**
* **2a, the consult record and its read port.** Starts when FO-3a part 1a is on `main`. It may run **beside 1b** (see "Parallel safety").
* **2b, the staff read feed.** Starts when **FO-3vr** is on `main` (2b calls its filter) and 2a is on `main`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3a part 2a` (or `part 2b`) and take **one part** end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the requirement text the trace tool prints for **AG-4-39** (rules 1-7), **AG-4-49** (rules 1-9, §7 Data, §8 Access, §11 Tests, §12 edge cases), **AG-4-50** (rules 1-5, §10) and, for 2b, **AG-4-67** (rules 1-5, its tests): `python3 product/tools/trace-requirements.py --brief FO-3a`;
* the concept's BR-14, BR-15, BR-16, §6 (the table, "Who sees what", FO-3st1's journeys J-S1 to J-S9) and §7 Q3, Q4;
* on `main`: `prisma/schema/front-office-booking.prisma` (`FoBooking`, attendance columns), `api/src/front-office/booking/service.ts` (read only: the attendance write and `staffBooking`), `booking/staff.controller.ts` (the FO-3sr route pattern), FO-3a 1a's `booking/settings/` (the area folder pattern), `api/src/platform/identity/keys.ts`, `ports/README` or any two files in `prototype/studio/ports/` (the zod-only port pattern with the fake in the same file), and for 2b FO-3vr's filter in `service.ts`.

## Part 2a: the consult record (AG-4-49, -50) and `ConsultRecordPort`

* **Table** `fo_consult_record` in a **new area schema file `prisma/schema/front-office-consult.prisma`** (P-600): `id`, `firmId`, `bookingId` (unique: one record per booking), `timeSpentMinutes` (pre-filled with the booked length, 1-1,440), `notes` (up to 10,000 characters), `recommended` (a list of item names from the booking's "Interested in", plus added ones; each 1-120 characters, at most 20), `quotedFeeMinor` (integer minor units, optional), `quotedFeeCurrency` (`CAD | USD`, required when a fee is given, AG-4-49 rule 6), `createdBy`, `updatedBy`, timestamps. The only edit to `front-office-booking.prisma` is `FoBooking`'s one back-relation line. One migration folder, its stamp later than the newest on `main` when it merges.
* **Routes** in new `api/src/front-office/booking/consult/*.ts`, under `api/front-office/bookings/:id/consult-record`:
  - `GET` answers the record or 404. Allowed for the booking's host, or with `agent/booking:edit`.
  - `PUT` creates or replaces it. Same rule: the host, or `agent/booking:edit` (concept "Who sees what"; AG-4-49 §8).
  - **It opens only after Attended** (rule 1): a booking whose attendance is not `COMPLETED` → 409 "Record attendance as Attended first." (concept §5's or AG-04's words win where they have one); a cancelled booking → 409.
  - Attendance changed later to No-show: the record stays, and its answer carries `attendanceChanged: "NO_SHOW"` (BR-15; AG-4-49 §12). Nothing is deleted.
  - Each save writes an audit line through `AuditPort.record(tx, …)` with before and after (rule 9).
* **`ConsultRecordPort`** in new `prototype/studio/ports/consult-record.ts` (zod only, the fake in the same file; a shared contract, so the release Lead reads it, P-423):
  - `read(tx, firmId, recordId) → { recordId, bookingId, partyRef: { kind: "lead" | "prospect" | "client", id }, recommended: string[], quotedFee: { amountMinor, currency } | null } | null`.
  - FO-5's retainer draft calls it (Q3); this part provides the adapter in `booking/consult/port.ts` and a contract case. **No FO-5 file changes here**: FO-5's pre-fill is row **FO-5cr** (rev 16.43).
* **Next step (AG-4-50):** the record's answer carries `nextSteps`, the list of buttons the screen shows, worked out by the server (STANDARDS §7):
  - lead → `ENGAGE_AND_PREPARE_RETAINER`, `CLOSE_LEAD`;
  - prospect → `PREPARE_RETAINER`;
  - case → none of the retainer steps.
  - A retainer step is left out without `agent/retainer:draft`, and `CLOSE_LEAD` without `agent/prospect:lose`.
  - **Nothing is sent from the record** (AG-4-50 rule 3): no mail, no event but the audit line.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line), in `tests/check_fo3a2_consult_record.ts`, a pass and a fail each:
* `FO-3a2 DW1` (rule 1): Attended → `PUT` saves with time spent defaulting to the booked length; not answered, No-show or cancelled → 409, nothing saved.
* `FO-3a2 DW2` (rule 6): a fee of 15000 CAD saves; a fee without a currency → 400 "Choose a currency for the quoted fee." on `quotedFeeCurrency`; EUR → 400.
* `FO-3a2 DW3` (§8): the host saves; a Case Officer with `agent/booking:edit` saves; Billing and finance who is not the host → 403; firm B never reads firm A's record (404).
* `FO-3a2 DW4` (§12): attendance changed to No-show after a save → the record stays and answers `attendanceChanged: "NO_SHOW"`.
* `FO-3a2 DW5` (AG-4-50): `nextSteps` for a lead, a prospect and a case as listed; a person without `agent/retainer:draft` gets no retainer step. No mail is queued and no `msg_outbox` row is written by a save.
* `FO-3a2 DW6`: `ConsultRecordPort`'s contract case passes on the fake and on the adapter; `read` for another firm's id → `null`.
* `FO-3a2 DW7`: every save has an audit line with before and after. The migration test in a parallel world passes, and FO-3, FO-3sr, FO-3sa, FO-3pa and FO-3a 1a's suites pass unchanged.

**Touch list (2a):** new `prisma/schema/front-office-consult.prisma` + one migration folder; `front-office-booking.prisma` (the one back-relation line); new `api/src/front-office/booking/consult/*.ts`; new `prototype/studio/ports/consult-record.ts`; `api/src/features/front-office-booking-settings.ts` (one registration line) or a new `front-office-booking-consult.ts`; `tests/check_fo3a2_consult_record.ts`; `api/src/front-office/MODULE.md` (tables, entry points, tests line).

## Part 2b: the staff read feed (AG-4-67; concept §6 "Calendar, list, detail")

* `GET api/front-office/bookings/feed?from&to&view=mine|team` (at most 62 days; `view=team` needs `agent/booking:list`; `mine` needs no key) and `GET api/front-office/bookings/feed/:id` (one booking: its host, or the record rule, Q4).
* Each item carries everything the calendar shows, so the browser reads nothing else: start and end (UTC), the office zone (the firm's zone until PF-18a, concept §6b), the person's name and email, the type name, the host's name, what it hangs on (`{ kind, id, name }` for a lead or a prospect), `outsideHours` (FO-3sa's recorded warning), attendance, whether a consult record exists, and `canAnswerAttendance`, `canEdit` (worked out by the server).
* **Visibility is FO-3vr's filter, called, never written again** (FO-3vr brief, "FO-3a part 2's staff read feed must call this row's filter"). If the filter needs a new export, stop and ask.
* New file `api/src/front-office/booking/feed.ts` plus its route lines in `staff.controller.ts`, declared **before** `/:id`.

**Done when**, in `tests/check_fo3a2_feed.ts`, a pass and a fail each:
* `FO-3a2 DW8` (AG-4-67 test 1): a Case Officer with "own only" sees a booking on a colleague's lead only when hosting it; with "all", every booking.
* `FO-3a2 DW9` (Q4): Billing and finance (no list key) gets 403 on `view=team`, its own hosted bookings on `view=mine`, and its own booking by `feed/:id`; another host's booking by id → 404.
* `FO-3a2 DW10`: 60 bookings in one week come back in one answer with every field listed; a range over 62 days → 400; `feed` is not taken by the `/:id` route.
* `FO-3a2 DW11` (AG-4-67 edge case): host changed → the old host no longer sees it unless the record rule allows. FO-3vr's and FO-3sr's suites pass unchanged.

**Touch list (2b):** new `api/src/front-office/booking/feed.ts`; `booking/staff.controller.ts` (the two route lines); `tests/check_fo3a2_feed.ts`; `api/src/front-office/MODULE.md` (entry points, tests line).

**Duplicate check (P-526):** BACKLOG (FO-3a; FO-3st1 is the screen; FO-3vr is the filter; FO-5cr the pre-fill), open PRs (`consult`, `feed`), `main` (`git grep -i 'consult' api/src`), BUGS; one `Duplicate check:` line per part.

**Parallel safety:**
* **2a beside 1b (Lead B's structure ruling, rev 16.43):** the consult record lives in its own area file, so 2a's only line in `front-office-booking.prisma` is `FoBooking`'s back-relation. Whichever of 2a and 1b merges second merges `main` in and re-stamps its migration later than the other's (P-270 on that conflict; rows rev 15.2). No other file is shared.
* 2b edits `staff.controller.ts` only by adding route lines; it starts after FO-3vr, which edits `service.ts`, so they never run at once.

**P-610:** each part under 800 changed lines, tests included (estimates: 2a ~650, 2b ~400).

**Reviewer and breaker** (P-278: schema, permissions, personal data). The breaker tries a consult record on a cancelled booking, a fee of `-1` or `1e12`, another firm's booking id, and the feed with a 63-day range and with `view=team` and no key.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** as in `FO-3a.md`'s last paragraph (P-559; one row, one session, one PR; Opus reviewer, P-303; re-review reads only the diff, P-277; label only after `Reviewer: Approve <sha>` and green CI, P-277, P-385; merge `main` only on a conflict, P-270; the red-part suites before asking for the label; live AI off, US$0, P-175; push after every step, P-557; questions as a PR comment headed "Question for the tech lead"; report to the current Lead for the queue and to Lead B for the row; ports zod only in `prototype/studio/ports/`; `EVENT.*` names; area-prefixed database functions; P-556).
---
