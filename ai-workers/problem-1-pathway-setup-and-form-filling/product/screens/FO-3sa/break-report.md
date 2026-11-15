# FO-3sa break report: staff book at any time (API only)

Commit tested: `8fe4756467c201847e9b25d9073d3f4e32e831dc` (branch `claude/inspiring-gauss-hv4aey`). The shared copy had moved on to
HEAD `b04fcbe98` (tests only) **plus uncommitted edits to `service.ts` (`acceptedWarnings`)**, so the attacks ran on an exact `git archive`
of 8fe475646 in the scratchpad, never on :4400. Harness: the one in `tests/check_fo3sa_any_time.ts` (scratch DB on 127.0.0.1:54329, all
migrations, Nest app with PF-4's guard, fake clock 26 Oct 2026 08:00 Toronto, fakes). Live AI off, US$0. Scratch DBs dropped. Scripts:
`/tmp/claude-0/-home-user-xpatready/ac2b3873-40d3-5a53-b734-5537d408a4df/scratchpad/break_fo3sa.mts`, `.../scratchpad/break2.mts`.
Line numbers are `api/src/front-office/booking/service.ts` at 8fe475646 unless stated.

## Findings

**F1 Major: a free time inside the host's hours that is not on the slot grid can never be booked, even with Book anyway.**
Did: CASE_OFFICER `POST /api/front-office/bookings` type "any" (30 min, owner Mon-Fri 09-17, free) at Tue 27 Oct 10:15 and 10:07,
with and without `bookAnyway: true`; reschedule to 11:10 with `bookAnyway`; DST: host with Sunday 00:00-04:00 hours, gap 0, at
`2026-11-01T06:00Z` and `06:30Z` (01:00 and 01:30 EST, the second pass of the repeated hour), `bookAnyway: true`.
Expected: AG-4-63 rule 2 ("'Pick another time' allows any time"): saved, or a warning then saved.
Actual: every one gets `409 SLOT_TAKEN "That time is not available any more"` with public slots, `bookAnyway` or not. `place()`
finds no free slot (not on the grid / second DST pass is never offered) and `warningsFor` finds no reason, so `:633`
`if (!warnings.length) throw new NoSlot()`. Staff cannot book 10:15, 10:07, or 01:00-02:00 EST on 1 Nov at all, and the answer is wrong.

**F2 Major: `bookAnyway: true` confirms warnings the staff member never saw, including an overlap (silent double booking).**
Did: CASE_OFFICER asks for Sun 1 Nov 14:00 → 409 listing only `OUTSIDE_HOURS`. OWNER then books 14:00 anyway. CASE_OFFICER sends
the same body with `bookAnyway: true`.
Expected: a fresh 409 that now lists the overlap ("Person decides: whether to book despite each warning", AG-4-63 §10; rule 3).
Actual: 201, and the row has `overlap_confirmed_by_user_id` = CASE_OFFICER for an overlap they were never shown. The 201 body says
nothing about it. A first call with `bookAnyway: true` (CASE_MANAGER, same time) is also saved over two bookings with no warning
ever shown. Cause: `:634` `if (!any.bookAnyway) throw needsConfirm(...)` is one blanket flag, not tied to the warnings listed.
(The uncommitted `acceptedWarnings` in the shared copy looks like a fix for this; it is not in 8fe475646.)

**F3 Major: Book anyway answers 500 and saves nothing when the warning text is long or looks like an email.**
Did (each is an overlap on a host's booking, then CASE_OFFICER `bookAnyway: true`):
(a) overlapped person named `"A"*100 "B"*100` (inside the public `Name` rule, max 100 each) → **500**, ZodError
`detail.warningLabels[0]` "expected string to have <=200 characters";
(b) given name `pat@mail.example` (`Name` allows `@`) → **500** (AuditDetail's "no email address" refinement);
(c) 40+40-character names: 5 confirmed overlaps saved, the 6th → **500**, ZodError `summary` "<=600 characters"; with
"Lee Sample" the 18th booking at one time → 500.
Expected: saved, with an audit line that fits the port. Actual: rolled back, `500 Internal server error`, no problem body.
Cause: labels with names go into the audit summary (`:803` `withWarnings`) and detail (`:805` `warningLabels`), against the limits
in `ports/audit.ts:16-22,40` (string 200, no email shape, summary 600).

**F4 Major: client and host names are written into the audit detail.**
Did: confirmed overlap (A19). Audit detail: `"warningLabels":["Overlaps Lee Sample 10:00–10:30"]`; summary
"…with warnings: overlaps Lee Sample 10:00–10:30." "Outside Sample owner's hours" puts the host's display name there too.
Expected: `ports/audit.ts:17-18` "Ids and facts only, never personal data (no names…)"; AG-4-63 §9 example "booked with warnings:
closed day, overlap". The codes and `bookingId` already carry the reasons. Actual: names in an audit trail that AUD-1 makes
insert-only. `service.ts:661, 803, 805`.

**F5 Minor: a confirmed row stays outside the no-overlap rule after its overlap is gone, and the column takes any uuid.**
Did: D (OWNER) Mon 9 Nov 10:00, C over it with Book anyway (confirmed), D moved to 14:00. C still has
`overlap_confirmed_by_user_id` set. A raw `fo_booking` insert at 10:10-10:40 for the same host (unconfirmed, overlapping C) is
**accepted** by the database. A raw insert over D with `overlap_confirmed_by_user_id = 00000000-0000-4000-8000-000000000000`
(no such staff) is accepted too. The app's locked check still stops API writes (held below); the database backstop for C is
gone for good, and the column cannot tell a real confirmation from any uuid (no FK or firm check). `migration.sql:8-11`.

**F6 Minor: field error on a field that was not sent.** Create on a type with no hosts, or with its only host deactivated, without
`hostStaffId` → 400 `"hostStaffId: choose an active host"`. Reschedule of a booking whose host is deactivated (type has no other
host) → the same, though the reschedule body refuses `hostStaffId`. The client cannot act on it. `:631`.

**F7 Minor: overlap labels that do not explain the clash.** (a) Gap only: booking 15:00-15:30 (type gap after 10, the default),
staff at 15:30 → "Overlaps Lee Sample 15:00–15:30", times that do not meet the request; the cause is the gap. (b) Across the 1 Nov
fall-back, a booking 05:30-06:00Z shows as "01:30–01:00", with no offset. `:658-661`.

## What held

- Body shape: `bookAnyway: "true"` → 400; an extra `overlapConfirmedByUserId` → 400 (strict body); `hostStaffId` on reschedule → 400;
  `bookAnyway` on the self-service reschedule → 400; a `hostStaffId` that is not a uuid → 400.
- Hosts: SUSPENDED and DEACTIVATED `hostStaffId` → 400 "hostStaffId: choose an active host"; not a host of the type → 400; firm B's
  host, type, person or booking id → 404, nothing named.
- Roles: no token → 401; BILLING_FINANCE and READ_ONLY → 403 (DW8); a role revoked after sign-in → 403 on the next call.
- Concurrency: 8 parallel Book-anyway posts at one free time → all 201, exactly 1 unconfirmed row and 7 confirmed. 6 rounds of
  public booking racing staff Book anyway at the same free time → each round one unconfirmed and one confirmed row; the public one
  never got a confirmer. Across the run: 0 pairs of unconfirmed active rows of one host that overlap.
- Public page: never offers the closed-day, Sunday or overlapped times; a forced public post onto a confirmed overlap loses (DW9).
- Reschedule: a confirmed booking moved with Book anyway to an outside-hours time clears the column; moved to a free time clears
  it (DW7); self-service reschedule of a confirmed booking → 200 and the column cleared.
- Warnings: crossing midnight into a closed day (Tue 23:45) → CLOSED_DAY + OUTSIDE_HOURS; ending past the window (16:45) →
  OUTSIDE_HOURS; time off → "In Sample owner's time off"; now+1 min → INSIDE_NOTICE; 2099 → BEYOND_WINDOW then saved; 2100 → 400;
  the past → 400 even with Book anyway. Persian name with ZWNJ shows correctly in the label.
- Without Book anyway nothing is saved: no row, no audit line, no outbox event (DW4). The outbox payload carries no warning or
  confirmer fields.
