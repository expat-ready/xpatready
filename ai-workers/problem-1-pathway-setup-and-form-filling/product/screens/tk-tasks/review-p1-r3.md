# Review round 3: R1.75 part p1 (PF-29a, PF-29b), PR #3635, commit 97ffacfe05b0ca177a24a42ac5b3793a85d62929

Reviewer: a fresh session that did not build this part or review rounds 1 and 2. Scope: only `git diff a1433d0..97ffacf` (tasks `service.ts`, `routes.ts`, `features/platform-tasks.ts`, `platform-tasks.prisma`, the migration comment, `tests/check_tk1_tasks.ts`, and the `shape-r175.md` p2 row). I checked it against `review-p1-r2.md` and the PR comment "Reviewer: Block a1433d0…". The tech lead allowed this round ("Lead allows round 3: diff-only a1433d0..97ffacf") and said the PR is at its 800-line limit. So every new finding below that is not a Blocker is **carried to part 2**. Journey score: **N/A** (no screen). The :4400 demo was not used. Only the local PostgreSQL cluster on 127.0.0.1:54329 was started.

**Verdict: Block.** No Blocker. Round 2's Major 1 is **not fixed**: the required suite still fails on about 1 run in 8, now on the audit count. M2 and M3 are fixed, and each has a test that fails when its fix is removed. The fix for M1 is one changed test line, with no lines added.

## What I ran (at 97ffacf)
* `check_tk1_tasks.ts`, 16 runs on the branch: **42/42 in 14, 41/42 in 2.** Both failures are TK5 "the Owner reassigns…", with `[422,200,200]`. A third failure of the same line came in 10 runs of a scratch extract.
* `check_pf12_walls.ts`: **110/110.**
* `migration-slots.py check origin/main..97ffacf`: **PASS** (1 new migration). `module-cards.py tree`: **PASS**.
* Mutation runs, each in a scratch extract of 97ffacf. Removing each fix, does a test fail?

| Mutation | Result |
|---|---|
| M3: `service.ts:146` read rule changed to `(this.mine(s,row) \|\| host)` | **Fails** `[200,200]`, as it should |
| M2: `canonicalZone` set back to the Intl list only | **Fails** (Kolkata/Kyiv line), as it should |
| M2: no `dbKnows` on a named zone (`:161`) | **Fails** (US/Pacific-New gives 500, not 422), as it should |
| M2: a bad named zone falls through to the host's or office's zone | **Fails** (201, not 422), as it should |
| M1: the Take race forced so the Case Officer wins (sequential takes) | **Fails every time** `[422,200,200]`. The test is wrong, not the code. |
| No `dbKnows` on the host's or row's zone (`:162`) | Still green (Minor 4) |
| The office fallback's `refused()` set back to `"UTC"` (`:163`) | Still green. The branch cannot be reached: `zoneFor` already parses with `TIME_ZONE.schema` (`settings/offices/clock.ts:26-29`). Accepted. |

* I probed zones on the extract: the firm zone, named spellings, and edits. I also probed 5, 10, 20 and 40 concurrent edits at 97ffacf and at a1433d0 (New Major N1).

## Round-2 findings: are they fixed?
| Finding | State at 97ffacf |
|---|---|
| M1 (TK5 flaky) | **Not fixed** (see below). |
| M2 (ICU spellings; firm zone silently UTC) | **Fixed.** `canonicalZone` uses the firm setting's own rule (`TIME_ZONE.schema`), so `Asia/Kolkata`, `Europe/Kyiv`, `Asia/Ho_Chi_Minh` and `Etc/GMT+5` are kept as named. Probe of r2's own scenario (firm zone `Asia/Kolkata`, Owner in no office, firm host, 17:30) gives **201 `Asia/Kolkata`, `12:00Z`**. A named zone that fails gives 422 on `due.zone`. A host's bad zone falls back to the person's zone. The tests fail without the fix. The firm-zone path has no test of its own (Minor 4). |
| M3 (view.all untested) | **Fixed.** Through the routes, Billing with view.own only reads its own task (200) and gets 404 on a colleague's task on a lead it can see. The mutation fails. Removing `BILLING_FINANCE`'s `view.all` affects the scratch database only, and it is the suite's last step. |
| Minor 4 (migration comment) | **Fixed** (`migration.sql:64`). |
| Minor 5 (p2 carry recorded) | **Fixed.** The `shape-r175.md` p2 row names `Idempotency-Key` and the order of the list routes. |
| Minors 1-3 | The PR comment says "listed for p2 or kept". They are not in the p2 row (Minor 6). |

## Major (open, blocking)
**M1 (round 2) is still open. TK5 still fails when the Case Officer wins the Take race.** See `tests/check_tk1_tasks.ts:153, 160, 162`.
* The version fix at `:160` is right: `unassign` now gets 200.
* The check at `:162` still requires **two** `plat.task.assign` audit lines.
* When the Case Officer wins, the Owner's "assign to the Case Officer" is a no-op. It writes no audit (`service.ts:214`, `:280`), so only `unassign` audits. The count is 1 and the line fails with `[422,200,200]`.
* Forcing that branch fails every time. It failed in 2 of 16 branch runs here.
* The required suite still flakes and ejects merge-queue batches, so main's CI is wrong. This is a round-2 Major, not a new finding, so it blocks.
* Fix, one changed line: `.length === (winner === OFF ? 1 : 2)`. I confirmed it in the extract: with the officer forced to win, the suite gives 42/42. Another fix: assign to the race's loser.

## New findings, carried to part 2 (the PR is at 800 lines; none is a Blocker)
**N1 (Major, carried; fix it before p4's screens or p2's bulk call edit). An edit that sets a due date takes a second pool connection inside its transaction. At pool-size concurrency every such edit stalls for 5 s and returns 500.** See `service.ts:158, 160-163` (called from `edit` at `:202`, inside `change()`'s `$transaction` at `:276`).
* `dbKnows` and the office fallback (`this.deps.offices`) query on `this.deps.db`, not on `tx`.
* Each waiting transaction holds one connection and needs another. Once the pool (9 here, 4 CPUs) is full, they deadlock until Prisma's 5 s transaction timeout fires.
* Measured at 97ffacf, concurrent `PATCH` calls on distinct tasks:

| Concurrent edits | Title only | Due with a named zone | Due with no zone |
|---|---|---|---|
| 5 | 200 | 200 | 200 |
| 10 | 200 | 200 | **10 × 500** |
| 20 | 200 | **19 × 500, 5.1 s** | 20 × 500 |
| 40 | 200 | **38 × 500, 5.2 s** | 40 × 500 |

* At a1433d0 the no-zone column was already 500 from 10 concurrent edits (the office read). This diff adds `dbKnows` and extends the stall to every named zone.
* Using the root client is deliberate: a failing query on `tx` would abort the transaction.
* Fix: resolve the zone before the transaction, as `create` does at `:184`. A row's own `dueZone` already passed the CHECK at `migration.sql:55`, so it needs no `dbKnows`. Or run the probe on `tx` inside a savepoint.
* Test: N+1 concurrent due edits all give 200.

**N2 (Minor, carried). A firm zone that the runtime knows but PostgreSQL does not now gives a 500 where it used to give UTC.** See `service.ts:163`.
* The office fallback is not checked with `dbKnows`. `TIME_ZONE.schema` accepts `US/Pacific-New` (probe: true, Node 22.23 / ICU 78.3), and I found no PostgreSQL guard on the firm-setting write. Only `settings/offices/service.ts:71` has one.
* Probe: firm zone `US/Pacific-New`, Owner in no office, firm task with a due date → **500 Internal server error** (the `plat_task_due_check` violation). At a1433d0 the same case gave a silent UTC.
* Fix: `dbKnows` on the fallback too, with the 422 already written there. The root cause is the firm setting, which is outside this PR. Name it to the platform settings owner.

**N3 (Minor, carried). Comments: one states a removed fact, one is a leftover.**
* `service.ts:159` still says "…else my office's, else the firm's, else UTC". There is no UTC fallback any more, and a named zone that fails is a 422. A later reader would expect UTC.
* `platform-tasks.prisma:8` is an orphan: "/// (`staff:<id>`, `system:<door>`), as the audit lines carry." repeats the end of line 7.
* Facts dropped by the trims, all still true elsewhere:
  * The prisma doc no longer says "COMPLETED needs who and when" or lists the context types. Both are in `migration.sql:49, 60`.
  * `routes.ts` dropped the BR-8 list. `service.ts:3-5` carries it.
  * `features/platform-tasks.ts` dropped "the firm host is built in". `hosts.ts:26` carries it.
* Beyond these, the trims lost nothing a later reader needs. The migration name in `platform-tasks.prisma:2` is now correct. Not in the diff: `check_tk1_tasks.ts:2` still names the old `20261125100000_pf29a_plat_task`.

**N4 (Minor, carried). The zone rule is uneven, and it swallows errors.**
* **Case rule.**
  * `"utc"` was accepted at a1433d0 (`ZONES.set("utc","UTC")`) and is now 422.
  * `"asia/calcutta"` is accepted as `Asia/Calcutta`, but `"asia/kolkata"` is 422. Lower case works only for ICU's spellings.
* **Aliases are stored as given:** `Asia/Calcutta`, `Canada/Eastern`, `US/Eastern`. The instants are right, but p2's "my office zone" windows should not compare zone names as text.
* **Errors swallowed:** `dbKnows` (`:158`) catches every error. A pool timeout or a lost connection becomes 422 "A time zone from the list", not a 5xx.
* **Untested:** `dbKnows` on the host's or row's zone (`:162`; mutation green) and the firm-zone fallback (r2 asked for "Asia/Kolkata … as the firm zone"). The code is right (probe above), but neither path has a test.

**Minor 6 (records, P-557).** Round 2's Minors 1-3 are "listed for p2 or kept" only in a PR comment:
* the audit-before test shows only in a race;
* an edit deep in a long description leaves no trace;
* subdivision flags and emoji-only titles are refused.

Name them, with N1-N4, in the `shape-r175.md` p2 row or the p2 PR body. That is a records change outside this PR's code, so it does not touch the 800 lines.

## Could not check
The full CI run on GitHub. The pool size on the deployed demo: the stall starts at that pool's size.

## List to fix in this PR
1. M1: `tests/check_tk1_tasks.ts:162`, the audit count when the Case Officer wins the race (one changed line).

Carry to part 2: N1 (Major, before any screen or bulk path calls edit), N2, N3, N4, Minor 6.

Reviewer: Block 97ffacfe05b0ca177a24a42ac5b3793a85d62929
