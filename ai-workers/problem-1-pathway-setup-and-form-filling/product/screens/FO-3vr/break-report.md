# FO-3vr break report: booking visibility (runtime, no screen)

PR #2308, branch `claude/busy-babbage-bpqaoi`, head `74c6936e6`. Breaker run 19 Nov 2026, Opus 5.5, effort high.
**Method.** I took a `git archive` of `74c6936e6` into the session scratchpad. The shared checkout was not stable: while I worked, another session swapped `service.ts` back to main's copy for a short time. I ran the PR's own check from that copy (BIN pointed at `/usr/local/bin`), then a scratch suite, `break_fo3vr.ts`, modelled on it: its own scratch database on 127.0.0.1:54329, PF-0p fakes, Sample rows, US$0, and the database dropped at the end. The suite is not in the repo.
No screen, so the screen items (keyboard, 1024 px, 200 % zoom, uploads, long or non-English text, reload or back) do not apply. Concept scope: AG-4-67 rules 1-5 as briefed (`product/design/lead-b-briefs/FO-3vr.md`). Case links (AG-7-90) and AG-2-64 2d-e are "not built".

## Findings

**F1 (Minor): attendance-due gives a 500 once a viewer who does not see everything can see about 32,700 unanswered bookings.**
`seenWhere` sends every visible id back as `id: { in: [...] }` (`service.ts:459`). `attendanceDue` has no lower time bound. Attendance is never answered automatically, so unanswered bookings pile up for good (`service.ts:416-417`).
Repro: firm A has 32,766 bookings that are due and unanswered, on a person with no lead (not linked yet). Call `attendanceDue` as an `agent/prospect:assign` holder (seesUnassigned, not seesAll).
Expected: the list. Actual: Prisma says "The query parameter limit supported by your database is exceeded", so the route answers 500. At 32,000 rows it still works, but takes 925 ms against 444 ms for a view.all holder. On main the same call never failed (the filter was a column filter).
The 92-day staff list is exposed in theory too, but it would need about 32k bookings in 92 days.

**F2 (Minor, a gap in the spec more than in the code): a booking on a person whose prospect has no owner, with the prospect not named on the booking, is hidden from Unassigned viewers.**
`seenWhere`'s person branch (`service.ts:454`) and `seesBooking` (`service.ts:478-481`) count a prospect of the person only when the viewer owns it. The not-linked branch (`:455-457`) is shut once any prospect exists. So an ownerless prospect makes the booking visible to nobody except its host and seesAll viewers.
Yet AG-2-64 rule 3 says "A prospect with no active owner is visible to `view.all` holders and `assign` holders", and §10 says "ownerless items are visible to everyone who can assign them".
Repro: a CORPORATE prospect with no owner. Its primary contact Y is a company contact with no lead. Insert a booking on person Y with `prospect_id` null.
Results: the assigner gets the booking in no list and 404 by id. A booking naming the prospect is seen (200). Turn everyone-sees-all off and the OWNER (view.all and assign) also gets 404 for the booking on Y, while getting 200 for the one naming the prospect.
This happens for real: `arrival-port.ts:153-158` (`moveToConsult`) leaves `prospectId` empty when the person is the primary contact of 0 or 2+ prospects in an ACTIVE stage. A prospect in NURTURE, WON or LOST, or two open prospects, produces exactly this booking.
The code follows the brief's rules 4-5 literally, so this goes to Lead B as a rule question, not as a bug in the build.
Related, same root: Engage makes a corporate prospect from L's lead and later swaps the primary contact to someone else. The prospect's owner then does not see bookings on L (404), because L is no longer "of" the prospect by `primary_contact_person_id`/`subject_person_id`. That matches the person rule in `compliance/identity/service.ts:121`.

**F3 (Minor): time-of-check to time-of-use on reschedule, cancel and attendance.**
`staffBooking` checks visibility outside the write transaction (`service.ts:378`, `:385`, `:394`). `move`, `cancelBooking` and the attendance transaction lock the booking but do not check visibility again.
Repro: a wrapped client moves the lead to a colleague right after `seesBooking`'s last read. The own-only officer's `staffCancel` then answers 200, and the booking is CANCELLED by someone who no longer sees it.
The window is milliseconds. Under AG-2-64 rule 7 ("on the next read") this is arguably fine. It is listed so the reviewer can decide.

**F4 (Minor): the PR's own check is flaky (CI can go red with no code change).**
`tests/check_fo3vr_visibility.ts:122` picks the prospect stage with `select id from fo_stage where … pipeline = 'INDIVIDUAL' limit 1`: no `kind = 'ACTIVE'` filter and no `ORDER BY`. The seeded INDIVIDUAL stages include LOST, NURTURE and WON.
In 2 of 8 local runs the LOST stage came back, and the insert failed: "fo_prospect_rules: a lost prospect needs a reason". The result was `FAIL FO-3vr DW4 setup`, and all DW4 cases were skipped (`:127`).

## Attempts that held (expected = actual)
1. **Booking id from another lead.** The own-only Case Officer opens a booking on a colleague's lead by id: 404. The same id in UPPER CASE: 404. A booking on their own lead, hosted by the colleague, in UPPER CASE: 200. `x`, a trailing space, `{uuid}` and `' OR 1=1 --`: 404, never a 500.
2. **`staff=` naming another host.** `staff=<colleague>` returns only the colleague-hosted booking on the officer's own lead. The colleague's booking on their own lead is not returned. Upper case gives the same answer. Firm B's staff id gives an empty list, also for a view.all holder. Garbage and an array give 400 (the module's 4xx), not a 500. Without the list key, the service ignores `staff=` and returns only the caller's own hosted bookings.
3. **Attendance (NO_SHOW, plus COMPLETED with an upper-case id), reschedule (bookAnyway) and cancel on an invisible booking.** 404 each. Nothing written: the row's status, time, sequence, updated_at and host are unchanged; `module_event` 0, `fo_booking_token` 0, and the fake audit is unchanged. A bad body gives 400 for an invisible id and for a missing id alike, so there is no existence oracle.
4. **Lead moved between list and open (AG-2-64 rule 7).** The booking was in the list. After the lead moved to the colleague: 404 by id, gone from the list, attendance 404. After it moved back: visible on the next read.
5. **Inactive owners.** The lead owner is deactivated: the assigner sees the booking (list and 200), the own-only officer gets 404. A person with a leaver's lead and an active colleague's lead: the assigner sees it (one lead counts as Unassigned). The PR's DW4 covers a deactivated prospect owner.
6. **Subject person different from primary contact.** Impossible for INDIVIDUAL prospects (`fo_prospect_subject_check` refuses it). With a CORPORATE prospect owned by the officer, bookings on the primary contact and bookings naming the prospect are both seen.
7. **List and by-id agree.** I compared the list with by-id for every booking in range, for the own-only officer, the assigner, the colleague, and the OWNER with everyone-sees-all off: 0 mismatches.
8. **A lead in another firm.** A firm-B lead on a firm-A person is refused by the database (`fo_lead_firm_id_person_id_fkey`). A raw firm-A booking naming a firm-B person: own-only 404, assigner 200 (seen as not linked, and firm A has no lead). Firm walls hold (DW6).
9. **Huge window.** Exactly 92 days: 200. 92 days + 1 ms: 400. Reversed: 400. Before 2000: 400. A 92-day list over 2,203 bookings for the assigner: 68-91 ms.
10. **The PR's suite.** 17/17 on the archived head, except the F4 flake.

Not tested: walls under the `xr_app` role (both suites run as the table owner) and a live HTTP guard (the service is called directly; DW6 reads the route metadata).
