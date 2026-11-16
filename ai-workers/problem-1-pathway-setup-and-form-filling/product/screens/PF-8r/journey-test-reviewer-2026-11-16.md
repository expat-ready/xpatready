# PF-8r journey test: reviewer, 16 Nov 2026 (commit f90bf637)

Tooling row, no screen. The "user" is the person running the drill. The persona is the release holder, or the engineer working for them, at a shell (RUNBOOK-restore.md §1). The "screen" is the drill's printed lines and its evidence file. I ran everything on a worktree pinned to f90bf637, on ports 4436-4439 (runtime lane). Not :4400.

## Journeys (main path first)
1. **Main path.** The release holder wants proof that last night's database can be restored. They run `restore-drill.sh --evidence …` and expect every check to PASS, a time, and a file.
   * **Held.** 7 PASS lines plus the SKIP for the audit chain, worded as the brief asks; 36 s; the evidence file holds the sha, checks and counts.
2. **Error: corrupted copy.** The question: "would we notice a damaged restore?" Run with `--corrupt platform_firm`.
   * **Held.** `FAIL rows platform_firm: count 2 in the source, 0 in the restored copy`, 71 of 72 tables the same, exit 1.
   * A second FAIL (`app and smoke`: sign-in 401) follows from the deleted firms. That is honest, but the reader must work out that it is a consequence of the first.
3. **Error: schema behind.** Run with `--extra-migration`.
   * **Held.** `FAIL migrate status: … not applied: 29991231000000_pf8r_drill_never_applied`, and nothing else fails.
4. **Wrong target** (the restore pointed at the live database). I ran a copy of the script with the restored copy set to the source.
   * **Held.** `FAIL restore: the target is not a fresh, separate cluster (system ids differ: no; tables before restore: 179)`; it stops before any write.
5. **Bad input.** I passed `--corrupt 'x;drop_table'`, `Platform_firm`, `1abc` and an unknown flag.
   * **Held.** Each is refused with words, exit 2, before docker starts. With no value after `--corrupt` or `--evidence`, the exit is 1 with bash's own message (trivial).
6. **Recovery: re-run after a crashed run.**
   * **Partly.** The cleanup trap removed every compose project each time. But the test then read the previous run's evidence file, and one DW1 check passed on stale data (review m1).
7. **Data check: is it safe to attach the evidence to a ticket?**
   * **Held.** 6 files, 0 emails or Sample names; ids appear only as SHA-256 hashes.
8. **Hand-over to CI** (the step across the boundary).
   * **Not held at f90bf637.** `run-suites.sh` now selects the suite for PR and nightly parts that have no image (review B1), and the nightly job is only proposed (M1).

## Data underneath
For each table in both copies: the count, plus the hash of the sorted primary keys. In the pass run that was 72 tables and 1,600 rows, all matching. The source is never written after its counts are read: the app is stopped before the dump, and the corruption touches only the restored copy.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | ½ | the local drill is complete (J1); "every night" is not in this commit (J8) |
| next step obvious | 1 | each FAIL says what it saw and the fix (e.g. the image line gives the build command) |
| plain words | 1 | PASS/FAIL/SKIP + plain sentences; main's own drift named in words |
| feedback and state | 1 | one line per step, restore time printed, `evidence: <path>` |
| correct data | 1 | counts and hashes equal in J1; the right single table named in J2 |
| error recovery | ½ | trap cleanup is reliable; stale evidence read after a crash (J6) |
| accessibility and screen sizes | 1 | plain text log, no colour-only signal; no UI (N/A beyond that) |
| speed | 1 | 36–42 s per drill against the 300 s Sample bound (local; GitHub runner not measured) |
| visual quality | 1 | aligned, greppable lines; the nightly summary picks them up (N/A beyond the log) |
| trust and sources | 1 | NFR5-04 and P-586 quoted; Sample bound and cloud "not run yet" labelled |

**9/10, no 0: pass.** Raising the two ½ scores, most valuable first:
1. Land the proposed SKIP line and nightly job (B1, M1).
2. Delete the old evidence file before each drill in the test (m1).

Not tested: a real bash 3.2 or macOS shell, GitHub's runner, a screen reader (no UI), and an unaided walk by the release holder (D17/D20 stay with the founder).
