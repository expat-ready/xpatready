Entry points: `touchedEach` (case-clients/live.ts, PF-12b: the prospect-won catch-up writes one `platform.bypass` line per firm with a prospect tried in a run, before its clients are made; a failed prospect backs off from one poll to at most an hour, with no line while it waits), `BACKOFF_MAX_MS`, `WonBackoff`
Tests: `tests/check_pf12b_bypass_audit.ts`
