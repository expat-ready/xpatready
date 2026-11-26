Entry points: M2 (Lead 24, 24 Nov): `oneQueryPerCaller` (`firm-scope.ts`) also refuses `$transaction([...])` on the client before anything in it runs (an array batch is sent in another caller's firm); interactive transactions are kept.
Tests: tests/check_no_array_tx.ts (also the source check for api/src)
