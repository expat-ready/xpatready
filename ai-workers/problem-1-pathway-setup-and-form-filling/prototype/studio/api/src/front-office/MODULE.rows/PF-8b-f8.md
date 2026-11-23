Entry points: PF-8b F8: `seedSampleFirmsFrontOffice` and `seedCreatedFirms` (`firm-seed.ts`) seed each firm in transactions written as that firm (`firmInTransaction`), so `firm-seed.ts` runs as the database's owner without superuser or BYPASSRLS (Amazon RDS); `seedFirmFrontOffice` and `ensureBookingWording` are unchanged and keep their caller's firm.
Tests: tests/check_pf8b_f8_seeds_nobypass.ts
