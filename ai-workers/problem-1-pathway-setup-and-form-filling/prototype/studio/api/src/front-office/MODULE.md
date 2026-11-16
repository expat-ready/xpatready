---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/front-office/**"
---
# Module card: api-front-office (P-615)
The firm's front office: public booking and retainer agreements, with their files. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `sales/` leads (FO-2): the one arrival path, the public web-form door, the lead inbox and its changes, the open-hours wait (`open-minutes.ts`); `booking/` the booking service, its public door, slots, calendar files (`ics.ts`) and self-service tokens; `retainers/` retainer and consultation agreements from templates (`docx.ts`, `placeholders.ts`); `files.ts` the real FilesPort with short-lived checked download links; `*-seed.ts` Sample seeds.
**Owner area.** front-office module rows FO-* (Unconfirmed: no lane map in code).
**Entry points.** `/api/public/forms/:token` (open read) and `POST …/submissions` (the public door, FO-2); `/api/front-office`: `GET leads?view=unassigned|mine|all|closed`, `GET leads/assignees`, `GET leads/:id` (key show), `POST leads` (create), `POST leads/:id/take|close|reopen` (edit), `POST leads/:id/assign` (assign); `GET retainer-templates`, `POST retainer-templates/:id/versions`, `POST prospects/:id/retainers`, `POST retainers/:id/send`, `POST retainers/:id/signed-offline`, `POST retainers/:id/download-link`, `GET files/:token`; the booking page's public controller; the staff booking routes (`booking/staff.controller.ts`, FO-3sr) `POST bookings`, `POST bookings/:id/reschedule`, `POST bookings/:id/cancel` (keys create, edit), `GET bookings`, `GET bookings/attendance-due` (key list), `GET bookings/:id`, `POST bookings/:id/attendance` (any staff: the host's own, the service checks the rest and answers 404). FO-3sa: create and reschedule take any time; a time with warnings answers 409 `WARNINGS` and saves nothing until the body carries `bookAnyway: true` and `acceptedWarnings` (the codes shown); create takes `hostStaffId` (an active host of the type).

**Invariants (set by).**
- Every public read is marked open on the read guard (OpenRead, P-348 (4)); the door's own protections live in the service.
- A self-service token is `<selector>.<verifier>`: looked up by id, verifier checked (FO-3, BR-10).
- A web-form post makes nothing on a refusal; its answer never says whether the person is known; a stamp not ours asks for a reload (FO-2, AG-2-49).
- A lead change is seen again under the row's lock; one audit line (entity named literally), the outbox row last (FO-2).
- Rate limits are rolling windows per key, sized for about 100 firms in one process (P-562).
- Every file belongs to one firm and lives under the firm's own folder (FO-5, contracts §0.3).
- Platform rules apply: `firmScope` on every table, platform guard on every staff route (P-559).
- The database walls these tables (PF-12): a public door finds its firm through its named bypass use (`fo.sales.web-form`, `fo.booking.public-page`, `fo.booking.self-service`), then runs as that firm (`enterFirm`).
- The database's no-overlap rule skips only a booking a staff member confirmed with Book anyway over an overlap (`overlapConfirmedByUserId`, FO-3sa, AG-4-63 rule 4); the public door never sets it, every writer checks overlaps under the host locks, and a move clears it unless the move is itself confirmed.

**Tables.** foLead, foPerson, foArrivalReceipt, foLeadAttribution, foNote, foReason, foService, msgConsent (through ConsentPort), foBooking, foBookingToken, foAvailability, foConsultationType, foProspect, foRetainer, foRetainerTemplate, foRetainerVersion, foSalesSetup, foStage, foWebForm, platformFirm, platformStaff, moduleEvent.
**Tests.** `tests/check_fo2_leads_prospects.ts`, `tests/check_fo3_booking.ts`, `tests/check_fo3sr_routes.ts`, `tests/check_fo3sa_any_time.ts`, `tests/check_fo5_retainers.ts`, `tests/check_fo1a_sales_schema.ts`, `tests/check_fo1b_booking_schema.ts`, `tests/check_fo13_compliance_schema.ts`.

**Do not.**
- Serve a file without a checked short-lived link, or from another firm's folder.
- Open a staff route without the platform guard.
- Store a token's verifier unhashed (it is kept as a SHA-256, `hashVerifier` in tokens.ts).
