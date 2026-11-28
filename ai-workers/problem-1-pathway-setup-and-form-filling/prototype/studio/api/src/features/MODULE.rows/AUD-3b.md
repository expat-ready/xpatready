Entry points: AUD-3b part 1 (R1.87): `platform-support-session.ts` registers SupportSessionController (`POST /api/system/firms/:id/support-sessions`), SupportSessions, and SupportSessionCalls as an APP_INTERCEPTOR (loads after `audit-access.ts`, so it runs inside AUD-3's SystemAccessLines).
Tests: tests/check_aud3b_support_session.ts
