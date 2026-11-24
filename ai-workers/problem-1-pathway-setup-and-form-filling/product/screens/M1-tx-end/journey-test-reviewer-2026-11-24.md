# Journey test (reviewer): M1 no query after a checkout's COMMIT or ROLLBACK (PR #3467), head 1167bcd46410285f81940e51643c806695978c19, 24 Nov

The diff has no screen, route or wording a person sees. It changes what the app's pool does with every connection, so the journeys are the paths that go through it. I ran them as scratch-database probes on :54329 and as API suites on an isolated copy (:4431 head, :4432 base 648adace4; never :4400), and I checked the rows underneath. I walked no browser. Accessibility, screen sizes and visual quality do not apply.

## Journeys
| # | Persona and goal | Steps | Expected | Head |
|---|---|---|---|---|
| J1 | Platform admin: create a role with its permissions; the transaction times out mid-write | `check_tx_end_guard` (1): nested create, 300 ms timeout, slow parent insert | Caller told it failed; no parent, no child | Told it failed; parent 0, child 0. Base: **child 1 kept** |
| J2 | The next firm's request, right after J1 | checkout as firm B | Clean connection in firm B, no transaction | firm B, `intx` false |
| J3 | Raw caller sends COMMIT/ROLLBACK/END/ABORT in 7 forms, then writes | guard cases (2) | Write refused before it is sent, 0 rows | 7/7 refused, 0 rows. Base: 7 rows stored |
| J4 | Author's transaction uses savepoints (signing, prospects, duplicates merge use `rollback to savepoint`) | savepoint, rollback to, release, DO block, quoted 'commit' | Still inside; the write runs | runs |
| J5 | Firm A's statement fails while firm B waits for the only connection | (3), ReadyForQuery delayed 20 ms | B never gets A's failed transaction | B clean. Base: "current transaction is aborted" |
| J6 | Raw caller releases while its insert still runs | (4) | Told success, row stored | ok, 1 row. Base: "Connection terminated", 0 rows |
| J7 | Author reorders sections / names; case officer prepares a case (the four calls given explicit limits) | `check_c41_section_order`, `check_w1_structure`, `check_bk17_keep_recorded` | All pass | 32/32, 81/81 (twice; one earlier loaded run failed 4, not reproduced), 25/25 |
| J8 | Shutdown while a release waits | `pool.end()` during a 1.5 s statement | ends when the statement ends | 1.5 s |
| J9 | A statement that never finishes | release during `pg_sleep(12)` | destroyed at 10 s, warn line | 10.02 s, `destroyed-unsettled` |

## Break it (15 minutes)
- Double release during the wait: **process-level uncaught exception** (review m1). Release, then release(err): the same.
- A Submittable refused after COMMIT: **unhandled rejection** (m2).
- Backend killed during the wait: an error, the pool empties, no hang.
- BEGIN sent after release during the wait: destroyed, never handed out.
- 37 edge SQL strings: 4 mis-read, none of them sent by the app (m4). A scan of all app literals found no SQL false positive.
- Mutations: two of them hang the test instead of failing it (m3).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J3, J5, J6 red at b96e20819 (5/11), green at head (16/0) |
| Next step obvious | 1 | The refusal says why: "a query after this connection's COMMIT or ROLLBACK is refused: it would run outside the transaction" |
| Plain words | ½ | "busy or inside a transaction" is fixed. The texts still lead with internal codes (`M1:`, `P1:`), and the refusal text is wrong for `AND CHAIN` (m4) |
| Feedback and state | 1 | warn lines `destroyed`, `destroyed-at-checkout`, `destroyed-unsettled` |
| Correct data | 1 | row counts checked under every journey; no half write |
| Error recovery | ½ | two misuse paths now crash the process (m1, m2) |
| Accessibility and screen sizes | n/a, counted 1 | no UI in the diff |
| Speed | 1 | guard suite 4.4 s; the wait is capped at 10 s; regex cost is linear on Prisma's SQL |
| Visual quality | n/a, counted 1 | no UI |
| Trust and sources | n/a, counted 1 | no AI and no source claims; the upsert list is reproduced from Prisma's own logged SQL |

**Score: 9/10 (pass: 8 or more, no 0).** Fixes that would raise it: m1 and m2 (error recovery), then the wording in m4.

Not tested: a real split network packet; a screen reader and an intended user's walk (D17 and D20 stay with the founder; no UI here).
