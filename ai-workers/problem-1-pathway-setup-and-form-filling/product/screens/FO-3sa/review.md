# Review: FO-3sa, staff booking at any time (API only)

Reviewer (Opus 5.5, did not build it), 15 Nov. Commit reviewed: `8fe4756467c201847e9b25d9073d3f4e32e831dc` (PR #1828, stacked on #1811). Diff reviewed: `2a3589aeb..8fe475646` only. Brief: `6774aee3d:…/lead-b-briefs/FO-3sa.md`; AG-4-63 (trace tool, `--brief FO-3st1`); concept `c28fcc0b7` §3 BR-13, §6.

**Verdict: Block** (Request changes): two Major findings, M1 and M2. Fixing both is a small change inside `service.ts` plus two tests.

## Suites run (scratch databases on 127.0.0.1:54329, never :4400; live AI off, US$0)
* `tests/check_fo3sa_any_time.ts`: 23 passed, 0 failed
* `tests/check_fo3_booking.ts`: 133 passed, 0 failed
* `tests/check_fo3sr_routes.ts`: 29 passed, 0 failed
* Reviewer probes (in the scratchpad, not committed, same harness): the results are quoted in the findings below.

## DW1-DW8 ticks (code and test)
| Case | Pass | Fail | Notes |
|---|---|---|---|
| DW1 closed day | yes, Book anyway → 201, audit `warnings:["CLOSED_DAY"]`, summary "with warnings: closed day" | yes, 409 `WARNINGS` [CLOSED_DAY], 0 rows | service.ts:648 |
| DW2 overlap | yes, both rows; second has `overlapConfirmedByUserId` = Case Officer, audit shows it | yes, 409 "Overlaps Lee Sample 13:00–13:30" with bookingId; a raw unconfirmed overlap is still refused by the DB | M1: the confirmer can be recorded for an overlap they never saw |
| DW3 outside hours | yes, Sunday → "Outside Sample owner's hours", hostStaffId returned | yes, a free in-hours time saves at once with no warning | M2: an in-hours time off the slot grid is refused with no Book anyway |
| DW4 Cancel | yes, `bookAnyway` false or missing → 409, no row, no audit, no event | yes, the same body with true saves | |
| DW5 public page | yes, free times still offered | yes, none of the booked-anyway times or closed and Sunday times offered | the public path cannot set the confirmer (below) |
| DW6 host | yes, chosen active host taken; the pick rule skips a deactivated host | yes, deactivated → 400 "hostStaffId: choose an active host" (with Book anyway too); a non-host → 400 | service.ts:296-301, 630-631 |
| DW7 reschedule | yes, Book anyway moves it, same host, audit reason; two overlaps listed; confirmer set; cleared on a move back to free time | yes, 409 with the booking unchanged; a past time → 400 | |
| DW8 permissions | yes, the four roles with the keys book anyway | yes, BILLING_FINANCE and READ_ONLY → 403 on create and reschedule; firm B host or type → 404, B's id not named | probe: firm B reschedules A's booking → 404 "No such booking."; random host uuid → 404 |

## Findings
**M1 Major (double-booking under race, false audit): `bookAnyway` is a blanket yes, not tied to the warnings shown.** service.ts:633-635, 802. `place()` works the warnings out again in the second request and saves whatever it finds, including an OVERLAP that the 409 never listed. It then records the caller as the confirmer.
* *Stale:* the Case Officer gets 409 [OUTSIDE_HOURS] for Sun 1 Nov 11:00. The Owner then books the same host at 11:00 with Book anyway. The Case Officer clicks Book anyway and gets 201. The host is now double-booked, and the audit reads "with warnings: outside Sample owner's hours, overlaps Lee Sample 11:00–11:30" with `overlapConfirmedByUserId` = the Case Officer, for a clash that person was never shown (probe P2).
* *Concurrent:* two Book-anyway writers on Sun 14:00 both get 201. One row is unconfirmed, the other is "confirmed" by a Case Manager who saw no overlap (probe P3).

AG-4-63 §10 says "Person decides: whether to book despite each warning", and rule 4 makes the confirmer an audited fact. The host locks put the writers in a line correctly. The gap is the meaning of the confirmation, not the lock. **Fix:** when `bookAnyway` is true, refuse with a fresh 409 if a recomputed warning was not in the shown set. The smallest way is for the body to echo the shown overlap `bookingId`s, or a digest of the 409's warnings, and for the server to compare them. Add a test for the stale case and the concurrent case. The brief's contract is a boolean, so this change is to the body's shape: note it in the PR for Lead B.

**M2 Major (Rule 7 "warn, never block" broken): an in-hours time off the slot grid cannot be booked at all.** service.ts:633. Example: a 30-minute type, Tue 27 Oct 10:15, the host free and in hours. `slotsFor` does not offer it (the grid is 10:00 and 10:30), and `warningsFor` finds no reason, so `NoSlot` gives 409 `SLOT_TAKEN` "That time is not available any more". That happens with `bookAnyway: true` too (probe P1). AG-4-63 rule 2 says "Pick another time allows any time", and the message is untrue. **Fix:** with no warnings and no free slot, save the requested time for the chosen host (no warning needed). Keep `NoSlot` only for a real refusal. Add a DW3-style pass and fail test.

**m1 Minor: a confirmed row keeps its exemption after the booking it overlapped goes away.** In probe P10, booking e1 was cancelled and c1 stayed confirmed, so the DB then accepted a raw unconfirmed row over c1. The application check under the host locks (READ COMMITTED, read after the lock) still stops every API writer, and the migration comment says so. The database's last word (BR-3) is now gone for every confirmed row for good. Write this down in the PR as accepted, or clear the flag on a cancel or move of the other booking.

**m2 Minor: another person's name is written into this booking's audit.** service.ts:661, 805 (`warningLabels`, and the summary "overlaps Lee Sample 11:00–11:30"). AG-4-63 field 9 needs the reasons, and its example audit is "booked with warnings: closed day, overlap". Keep the codes and the overlapping `bookingId`s in `detail`, and leave names out of audit text. Otherwise erasing the other person leaves their name behind.

**m3 Minor: the OVERLAP label names a person regardless of AG-4-67.** service.ts:660-661. A Case Officer limited to their own records learns the name on a colleague's lead. AG-4-67 is FO-3sr's and FO-3a part 2's, so record it as a known gap: fall back to "another booking" once the record rule exists.

**m4 Minor (concept vs brief, not the builder's fault): concept §6 lists `source` and `createdByUserId` under FO-3sa, and AG-4-63 §7 and §9 need them.** The brief leaves them out, and this diff does not build them. Lead B should place them on a row, because FO-3st1 needs `createdByUserId` for AG-02's first response.

## Declared deviations, judged
1. **Migration outside the touch list: accepted.** DW2 ("keeps both bookings") is impossible under FO-1b's exclusion, and AG-4-63 rule 4 names this exact design (O4). It keeps data: a nullable column is added and the constraint is swapped with the same columns. The down steps are written. The stamp 20261115160000 is later than the newest migration on `main` (20261115013000). There is no foreign key to `platform_staff` (fine, staff rows are never deleted). It still needs Lead B's answer on the PR before merge.
2. **INSIDE_NOTICE and BEYOND_WINDOW: accepted.** AG-4-63 rule 3 and BR-13 list "inside notice". Without BEYOND_WINDOW a far time would fall into M2's dead end. Time off as OUTSIDE_HOURS fits rule 3's single reason "outside the host's hours or in time off", and the label tells them apart. Lead B should add the codes to the brief.
3. **A past start refused even with Book anyway: accepted.** Booking a meeting that has already started is not "any time … for a meeting", and FO-3sr's suites still pass. It is checked before the transaction (service.ts:303, 318), and the window for a race there is harmless.
4. **staff.controller.ts unchanged: accepted.** Lines 21 and 24 pass the body through, and the strict zod bodies refuse unknown keys (probe: `hostStaffId` on reschedule → 400; `bookAnyway: "true"` → 400).

## Checked and holding
* **Lock order.** Staff writers take only host locks (sorted, de-duplicated, `lockHosts`). Public writers take the firm lock and then the host locks, and nobody takes the firm lock after a host lock, so there is no deadlock cycle. `place()` also locks the booking's current host. Default READ COMMITTED means the read after the lock sees committed rows, so a public writer queued behind a confirmed row sees it as busy and is refused (DW5, and the reasoning above).
* **The public door can never set the confirmer.** `confirmer()` returns null unless `any` is set, and only `staffCreate` and `staffReschedule` pass it. `PublicBookingBody` is strict, and the token move passes no `any`.
* **Firm scoping.** Every new query is firm-scoped: the host lookup, `place`'s active set, `warningsFor` (host, windows, time off, settings, the raw clash query with `firm_id`, `contactOf` with the firm). Hosts of another firm get 404 and are never named.
* **Mutation check.** DW2 fails if the confirmer is dropped (r2 check) or if the migration is reverted (Book anyway → 23P01, retries, then 409). DW4 fails if `bookAnyway` is ignored. DW6 fails if the active filter is removed.

## Scorecard and D1-D20
This row has no screen, so the BIC-01 to BIC-20 and D1-D20 screen dimensions are N/A; the screen is FO-3st1's. Code dimensions: correctness (M2), concurrency (M1), authorisation (holds), migration (holds), and the journey score below.

**Journey score (reviewer, the one score for this check): 7/10, below the pass mark.** Full table in `journey-test-reviewer-2026-11-15.md`. The low criteria are task completed, correct data, and trust (M1, M2).

## Could not check
No browser walk, because the row is API only. Axe, widths and keyboard belong to FO-3st1. The `graph.mjs` output (GRAPH.md) has no front-office booking routes, so P-86 does not apply to this row. The public-door race was argued from the locks and the isolation level, not driven over HTTP: the public form needs its stamp and consent set-up, which the probe did not build.
