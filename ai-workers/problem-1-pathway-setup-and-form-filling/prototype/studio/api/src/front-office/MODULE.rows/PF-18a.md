Entry points: `BookingPorts.offices` (PF-18a DW6: OfficeClockPort, platform's `OFFICE_CLOCK` in the running app, injected by `api/src/features/front-office-booking.ts`): `hostZone(db, firmId, staffId, offices)` gives a host's booking mails in the host's office zone, the firm's zone when the host has no office or no port is given.
Tests: tests/check_pf18a_notifications.ts
