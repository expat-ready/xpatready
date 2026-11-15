---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/front-office/**"
---
# Module card: api-front-office (P-615)
The firm's front office: public booking and retainer agreements, with their files. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `booking/` the booking service, its public door, slots, calendar files (`ics.ts`) and self-service tokens; `retainers/` retainer and consultation agreements from templates (`docx.ts`, `placeholders.ts`); `files.ts` the real FilesPort with short-lived checked download links; `*-seed.ts` Sample seeds.
**Owner area.** front-office module rows FO-* (Unconfirmed: no lane map in code).
**Entry points.** `/api/front-office`: `GET retainer-templates`, `POST retainer-templates/:id/versions`, `POST prospects/:id/retainers`, `POST retainers/:id/send`, `POST retainers/:id/signed-offline`, `POST retainers/:id/download-link`, `GET files/:token`; the booking page's public controller.

**Invariants (set by).**
- Every public read is marked open on the read guard (OpenRead, P-348 (4)); the door's own protections live in the service.
- A self-service token is `<selector>.<verifier>`: looked up by id, verifier checked (FO-3, BR-10).
- Rate limits are rolling windows per key, sized for about 100 firms in one process (P-562).
- Every file belongs to one firm and lives under the firm's own folder (FO-5, contracts §0.3).
- Platform rules apply: `firmScope` on every table, platform guard on every staff route (P-559).

**Tables.** foBooking, foBookingToken, foAvailability, foConsultationType, foProspect, foRetainer, foRetainerTemplate, foRetainerVersion, foSalesSetup, foStage, foWebForm, platformFirm, platformStaff, moduleEvent.
**Tests.** `tests/check_fo3_booking.ts`, `tests/check_fo5_retainers.ts`, `tests/check_fo1a_sales_schema.ts`, `tests/check_fo1b_booking_schema.ts`, `tests/check_fo13_compliance_schema.ts`.

**Do not.**
- Serve a file without a checked short-lived link, or from another firm's folder.
- Open a staff route without the platform guard.
- Store a token's verifier unhashed (it is kept as a SHA-256, `hashVerifier` in tokens.ts).
