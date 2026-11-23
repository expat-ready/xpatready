# PF-12b4 break report (breaker, 21 Nov)

Branch `claude/runtime-pf12b4` at deb538909. I read the diff `1b5e6ac14..deb538909`: `messages.ts` sweep, MODULE.md, the suite. I also read `firm-scope.ts` (touchPlatform, touchEachFirm, asJob), `audit-event.ts`, `audit/context.ts`, `pgboss-jobs.ts` and `platform-jobs.ts`.

**How I tested**
- A scratch database on 127.0.0.1:54329 (`xr_studio_brk4_<pid>`) with all migrations and the Sample firms, driven through the walled pool (xr_app), as in tests/check_pf12b_bypass_audit.ts.
- `pm.sweep()` ran under `asJob("messages.outbox_sweep")` with a FakeClock and fakeJobs. fakeJobs gives the same answer as pg-boss for a used key: `queued: false`.
- Every platform enqueue was wrapped so that, at the moment of the enqueue, it counted the firm-null sweep lines already committed. The count used the owner's own connection, so it sees committed rows only.
- Refusals were real: a BEFORE INSERT trigger on audit_event, and a second variant as a deferred constraint trigger.
- Clean-up: the database is dropped and `git status` is clean. The attack script is not committed (scratchpad `brk4/attack.mts`). No server was started and port 4400 was not used.
- Suites on this commit: check_pf12b_bypass_audit 70/0 (`tsx --tsconfig api/tsconfig.json`), check_pf19p_platform_mail 68/0.

**Scope:** the sweep's firm-less read and its line (QA-697). Behaviour that the firm side of the sweep already had is mentioned only where it shows up again on the platform side.

## Findings

No Blocker. No Major.

### Minor
**m1. The line is written once per sweep that picks a due row, not once per sweep that queues one. So "a read that queues nothing writes no line" (messages.ts:314, and the brief's "when it will queue at least one platform send") is false.**
- `touchPlatform` runs when `pick.length` is non-zero (messages.ts:324), before any enqueue.
- The enqueue (messages.ts:329) is a no-op whenever this hour's key `msg.send:platform:<id>[:try:n]:sweep:<hour>` is already used. A row that is still QUEUED and due therefore writes a line on every sweep for the rest of the hour while queuing nothing.
- Repro (attack 1): one PLATFORM_ACCOUNT row, QUEUED, `updated_at` 1 h ago, no handler runs the job.

| Sweep | Queued | Lines added |
|---|---|---|
| 1a, 10:05 | 1 | 1 |
| 1b, same minute again (a pg-boss retry, or a second process) | 0 (`queued:false`) | 1 |
| 1c, 10:06 | 0 | 1 |
| 1d, ten more minutes | 0 | 10 |
| 1e, 11:00 | 1 | 1 |

  In total: 14 lines for 2 sends.
- Attack 2: four sweeps at once on 2 fresh rows gave results `[2,0,0,0]` and 4 lines.
- When this happens in the app:
  - the send queue runs behind by more than a minute: one worker per queue, `batchSize: 1` (pgboss-jobs.ts `#work`);
  - a send job is dead-lettered after 3 failures that count no try;
  - a firm's line keeps failing: the sweep throws and pg-boss retries the same minute's run 3 times, each retry writing another platform line. That is up to about 4 lines a minute for one stuck row.
- Direction: more lines, never fewer, so fail-closed holds. The cost is volume and a wrong comment. It is bounded at one line per sweep run, whatever the number of rows (attack 3: 120 due rows, 50 queued, 1 line, 606 ms).
- The firm side already behaves the same way (touchEachFirm runs before its enqueues).

**m2. Firm-less rows that are due by age but still in their back-off are read on the bypass with no line (attack 0b).**
- Setup: one row with `send failed: try 2 of 5`, last tried 3 min ago (its wait is 4 min).
- Result: the sweep reads it (`findMany`, messages.ts:317: id, state_reason, updated_at; no address) and writes `queued 0, lines 0`.
- This matches the documented rule (MODULE.md "when it queues one"; the firms' "a retry row still waiting is read but not acted on, and writes no line"). It is the only firm-less read on this use left without a line. It is listed because the brief asks for every such read. The tech lead may simply confirm it as accepted.

## What held (with evidence)
- **(1) No firm-less send is queued without a committed line.** Across attacks 1, 2 and 3, every `queued:true` platform enqueue saw at least one more committed firm-null line than before its sweep began. Count of enqueues without one: 0.
  - The read, the pick and the line share one interactive transaction. The enqueue runs only after it commits.
  - A commit that fails throws before any enqueue. In the deferred-trigger variant (4c) the platform send is not queued.
  - Concurrent sweeps each write their own line, in their own transaction. The `seen` set is keyed per transaction (firm-scope.ts:237).
  - Keys: a platform key carries `platform:` and an outbox uuid, so it can never equal a firm key `msg.send:<uuid>:sweep:<hour>`.
- **(2) A real database refusal** (BEFORE INSERT trigger raising on firm-less `platform.bypass`). Attack 4a:
  - BypassNotRecorded is thrown;
  - the platform row is not queued;
  - firm A's and firm B's rows are queued, each with its own line;
  - 0 firm-null lines are committed;
  - the logs are `audit_write_failed` (alert), `audit_write_error` and `messages_sweep_platform_skipped`.

  Attack 4b, where the trigger also refuses firm B's line:
  - only A is queued;
  - B is skipped and logged, and the platform is skipped and logged;
  - the sweep throws B's error first (messages.ts:330).
- **(3) Firm scope.**
  - A sweep run where the scope names firm A (5a) is refused by touchPlatform (firm-scope.ts:234). The result is BypassNotRecorded, the platform row is not queued, 0 null lines are written and 0 lines land on A's trail.
  - A sweep run as firm A with no bypass (5b) reads no firm-less row under RLS: 0 queued, 0 lines.
  - In the app the recurring sweep runs with job firm null (`platform-jobs.ts:69` asJob, observeJob `firmId: () => undefined`), so the line is accepted.
  - The line's shape: `firm_id NULL | system:job:messages.outbox_sweep | SYSTEM | job:<uuid> | {use, step: sweep.platform-rows, key: null, method: none, correlationId}`.
- **(4) Volume.**
  - An idle minute (0) writes 0 lines.
  - A new hour re-queues the row with one line (1e).
  - Per-minute repeats within an hour: see m1.
- **(5) Other reads on this use.**
  - The lost-row and QA-601 retry queries both filter `firm_id IS NOT NULL` (firm rows, lined by touchEachFirm for each firm acted on).
  - The enqueue goes to pg-boss's own pool, not to a walled table.
  - No other firm-less read is left on `job:messages.outbox_sweep` apart from m2.
- **Not findings (noted):**
  - **4c.** A refusal that fires only at COMMIT (a deferred constraint trigger) surfaces as a raw DriverAdapterError, not BypassNotRecorded. There is then no skip log and no `audit_write_failed` alert, and the raw error would mask a firm's BypassNotRecorded. Fail-closed still holds. No deferred constraint exists on audit_event today.
  - **6a.** `pm.sweep()` called with no use in a suite or tool process (unscoped = direct) queues the platform send with no line. In API mode (6b, `wallUnscopedQueries`) it reads nothing and queues nothing. No production caller exists outside the job handler.
