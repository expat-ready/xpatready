Entry points: `ProspectWonPoll` (case-clients/live.ts: the `prospect.won` poll at start and every `PROSPECT_WON_POLL_MS`, bypass use `cases.prospect-won.catch-up`), the job `case_clients.link` (case-clients/client-link.ts, one per firm, once), `clients.ts linkClient` (FoPersonPort, in the caller's transaction)
Tests: `tests/journeys/j_72.ts`
