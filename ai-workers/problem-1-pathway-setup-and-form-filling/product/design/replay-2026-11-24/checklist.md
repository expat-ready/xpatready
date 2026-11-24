1. Requirement, clause by clause: for each clause in `requirement.md`, name the code that makes it true, or say it is missing.
2. Every door: when the change sets or tightens a rule, find the other routes, jobs and callers that should obey it.
3. Permissions: each route has its own server-side check; read rights never allow a change.
4. Firm wall: no read or write crosses firms; any use of elevated access is recorded as required.
5. State: every exit (cancel, withdraw, expire, retry, fail) ends what it started, here and in linked records.
6. Input: refuse out-of-range, expired, damaged or oddly written values before anything is stored.
7. Failure: a thrown provider error, a retry and a crash midway each reach a correct final state.
8. Frozen means frozen: a case or released item reads its pinned version, not live configuration.
9. Real wiring: the running app uses the real adapter, not a fake or test double.
10. Money, dates, time zones, rounding and concurrency (stale saves, double submits).
11. Data: migrations keep existing rows; constraints match the rules in code.
12. Tests: would the rule's test fail if the rule were removed?
