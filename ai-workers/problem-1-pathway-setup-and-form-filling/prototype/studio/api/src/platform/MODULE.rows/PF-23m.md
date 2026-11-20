Entry points: PF-23m: `dbRuleOf(e)` (`observability/redact.ts`: the constraint, trigger, policy or function a database error names, identifier-shaped only, never a value); log calls outside the platform go through `logPort.error(event, e, ids)` / `logPort.warn(event, ids)`, never an error's or a run's text (SA-11-37).
Tests: tests/check_pf23m_log_calls.ts, tests/journeys/j_13.ts
