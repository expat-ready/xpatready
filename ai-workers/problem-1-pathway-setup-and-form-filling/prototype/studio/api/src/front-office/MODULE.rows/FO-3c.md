Entry points: `booking/consultation-agreement/` (FO-3c): `GET consultation-agreements/template-check`, `GET …/needs-you`, `GET …/by-booking/:bookingId`, `GET …/by-person/:personId`, `GET …/:id`, `POST …/:id/host-link`; public `POST /api/public/consultation-agreements/open`; `onBookingEvent`, `catchUp`, `signingEvent` (service calls, no route)
Tables: foRetainer, foRetainerVersion, foRetainerTemplate, foSignatureRequest, foSigner, foSigningEvidence, foSigningHookReceipt, foBooking, foPerson, moduleEvent
Tests: tests/check_fo3c_consultation_agreement.ts
