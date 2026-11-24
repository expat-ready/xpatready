Entry points: P1 (PF-4bc round-3 break, Lead 23 24 Nov): `WalledPool` (`firm-scope.ts`) destroys any pooled client that is not idle (pg `getTransactionStatus()` not 'I'), when it is released and when it is checked out, and clears its firm tag; the module refuses to load if pg stops reporting the state.
Tests: tests/check_pool_tx_return.ts
