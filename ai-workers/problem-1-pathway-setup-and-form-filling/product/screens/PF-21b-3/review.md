# PF-21b part 3 review: the register of privacy requests made to ExpatReady (reviewer, 23 Nov 2026)

Reviewed head **1b9733fd136dd842d024b92698db334aca9faf1d** (branch `claude/runtime-pf21b-requests`, PR #3189), `git diff origin/main...1b9733fd` (7 files, +795). Spec: `lead-b-briefs/PF-21b.md` "Part 2" (DW3, DW5, DW6), split by `track-b/PF-21b-2.md` (part 3), BACKLOG PF-21b, SA-11 §3.8 / SA-11-27 / SA-11-40 / §10 line 778. Compared with the merged holds part (`register/holds/`, `20261122180000_pf21b_legal_holds`), PF-4s's guard and `staff.ts` `change()`, and `observability/alerts.ts`.

**Left out (screen-only):** concept fit, keyboard/1024 px/200 % walk, PRODUCT §3-§4 words, D1-D20, BIC table, retrofit mapping. This row has no screen (PF-21rs). I checked the schema, migration, definers, permission gating, the daily check, input validation, the tests' pass/fail power and the CI guards that read this diff instead.

**Runs (this container, Postgres 18 on :54329; :4400 never used):**
- `check_pf21b_requests.ts`: 27 passed, 0 failed (exit 0).
- Passed unchanged (exit 0): `check_pf12_walls` 110/110, `check_pf21b_holds` 67/67, `check_pf4s_system_signin` 102/102, `check_features_registry` 27/27, `check_pf8b_f4_migrations` 9/9, `check_aud_values` 14/14, `check_pf21_complaints` 108/108, `check_pf6b_permission_rules` 33/33. `graph.mjs --check`: G1 0, G2 0.
- **Red because of this commit:** `product/tools/typecheck.mjs` (CI job `types`): 15 new errors, all in `requests/service.ts` (B1). CI `module-cards` failed on this head (M1).
- I also read the breaker's `break-report.md` (same head) and re-checked its M1 against the code. My findings carry its numbers where they overlap.

## Findings

### Blocker
**B1. The CI type check fails: 15 new TS18048 errors in `api/src/platform/register/requests/service.ts` (lines 101-104, 117-118, 122, 131-132).** `const fields = (e: z.ZodError): never => problem(...)` (:63) is an arrow function assigned to a `const` with no type annotation. TypeScript does not narrow on a call to such a function, so `p.data`, `b` and `q.data` stay `possibly undefined` after `if (!p.success) fields(p.error)`. tsx does not type-check, so the suite passes, but `typecheck.mjs` exits 1 ("15 new type error(s) (not in typecheck-known.txt)"). Fix (0 extra lines): `function fields(e: z.ZodError): never { return problem(...); }`, as `holds/service.ts:62` does.

### Major
**M1. `module-cards` is red.** `module-cards.py pr` prints: "module api-features: 1 file(s) changed (…features/platform-register-requests.ts), card …/api/src/features/MODULE.md not [changed]. FAIL update the card(s) in this PR, or put `Card unchanged: <reason>` in the PR body (P-615 (3))". Fix: a `Card unchanged: …` line in the PR body (no code lines), or the card's own line.

**M2 (breaker M1, confirmed). A request logged past or near its target answers 500 after it was saved, so a retry saves it again, and the register can never delete the copy.** `log()` commits the request, its RECEIVED step and the ALLOWED line in `change()`, then calls `await this.checkOne(id)` (service.ts:106) outside it. If the alert cannot be raised (overdue path: `alerts.raise` throws; near path: the deliberate throw at :171), the error reaches the caller as 500. The breaker reproduced 2 rows after one retry and 3 rows from three parallel posts. Fix (same line): `await this.checkOne(id).catch((e) => logPort.error("data_request_check_failed", e, { requestId: id }));`. The daily check retries it.

**M3. The daily check swallows every failure without a trace.** `sweep()` does `catch { out.failed++; }` (:150), and the job handler discards the returned counts (`features/platform-register-requests.ts:15`). A request whose overdue alert cannot be raised, or a database error in `plat_data_request_mark`, therefore leaves no log line and no failed job, every day. NFR5-14 exists for exactly this alert. Compare `billing/exit-notices.ts:119`, which logs each failure. The near path's `raiseSafely` logs `alert_not_raised`; the overdue path and database errors log nothing. Fix (same line): `catch (e) { out.failed++; logPort.error("data_request_check_failed", e, { requestId: r.id }); }`.

### Minor
- **m1. The actions taken can be overwritten with no record.** `plat_data_request_move` sets `actions_taken = coalesce(p_actions, r.actions_taken)` (migration.sql:164), and the trigger allows it on any open request. The step row has no actions column, and the audit line's target is only `{requestId, to}`. So a HELD move with "deleted X" followed by COMPLETED with "deleted Y" loses "deleted X", in a register described as insert-only. Fix: write `p_actions` into the step's `note` when it is given, or refuse a change of a set value.
- **m2 (breaker m7). The SA-11-40 link is not checked.** `firmId`/`subject.id` only need to be uuid-shaped. The suite's own "request with a firm's person (SA-11-40)" uses a random `uuid()` as the person (test:163), so it asserts a link that does not exist. The holds part checks that its firm exists (`plat_legal_hold_placed`). Fix in `plat_data_request_log`: `fo_person` with `id = p_person AND firm_id = p_firm`, else a field error. If the line budget forbids it, record it for PF-21d (the erasure job), which acts on this link.
- **m3 (breaker m1).** `xr_data` keeps SELECT/INSERT/UPDATE on both tables (only DELETE/TRUNCATE are revoked, :106). Through `xr_staff_bypass` a forged `NEAR_DATE_ALERTED` step suppresses the alert. The header's "reached only through the definers" is true only without the bypass role. This is the same model as holds (graded Minor there). `REVOKE SELECT, INSERT, UPDATE … FROM xr_data` closes it.
- **m4 (breaker m5).** `today()` is the UTC day while the job runs on Toronto time. After about 19:00 Toronto, "tomorrow" passes the future-date check, and `completedOn` records tomorrow, so an on-time completion can read as late.
- **m5 (breaker m2).** The due read is capped at 501 rows, ordered `received_on DESC`, so with many near-alerted open requests the oldest overdue one is skipped silently. Order the due read by `target_date ASC`.
- **m6. Test gaps.** No case fails if the ALLOWED line is moved outside the change's transaction (for example, make `identity.audit` throw and check that nothing was logged). The near path's "an alert not raised undoes the mark" (:171) is untested: `flaky` takes the overdue path. "Each a REFUSED line" uses `>=`.
- **m7. Requirement vs brief, a question only.** SA-11 v2.16 persona table (line 243) says "The Auditor reads these read-only". The seed and DW3 refuse the Auditor on GET (Sample: Platform Owner only, per the brief). Note it for Lead B and PF-21rs. This is not a change for this PR.
- **m8 (wording).** The `move` comment (service.ts:110) says Overdue by hand → 409, but it is 422 (zod). `tx as never` (:86) is an unneeded cast (Tx has `platSystemAudit`). A `NOTE` step with a null note passes the event check.

## What held
- The migration matches the holds pattern line for line where it should: forced RLS with no policy on both tables; five definers owned by xr_wall_reader with search_path pinned, EXECUTE revoked from PUBLIC and granted to xr_data; the CREATE grant/revoke around the hand-over (PF-8b F4); the seed in its own DO block in F7's shape. The Platform Owner holds `dsr-manage` only, labelled Sample. Right after itself on empty and demo copies, the shape is the same; `migrate diff` is empty.
- The database rules: DELETE/TRUNCATE are refused even for the owner; steps are insert-only; facts are fixed; COMPLETED is final; `completed_on` ⇔ COMPLETED; there is one mark of each kind (a partial unique index); a row is logged PENDING only. The move and mark definers take `FOR UPDATE`, so parallel moves and sweeps serialise (the breaker saw exactly one alert each over four parallel sweeps).
- Gating: the guard first (a firm token gets FIRM_SESSION_REFUSED; Support, Admin and Auditor get 403), then `allowed()` in the service, then the definers refuse inside a firm's session. The change routes are `@SystemChange`; the ALLOWED line is written with `tx`, inside the change. A refusal writes one REFUSED line after the rollback, as in PF-4s `staff.ts`.
- The once-only alert: the mark and the alert are in one transaction, so a throw undoes the mark. A request past its target is not also raised as near-date. The 5-day lead is PF-23's `CLOCK_LEAD_MS` through `clocksNear`, with no second constant. The alert detail holds ids only.
- The tests pass and fail for DW3, DW5 and DW6 as listed in the PR body. Without the unique index or the status recheck, the "not twice on a second run" lines would fail.

## Journey score (reviewer; `journey-test-reviewer-2026-11-23.md`)
**7.5/10 (6 of 8 applicable), not a pass.** The low criteria are feedback and state, correct data and error recovery (M2, m1, m2). None is at 0.

## To fix before Approve
1. B1: `fields` as a function declaration; `typecheck.mjs` exit 0.
2. M1: `Card unchanged: <reason>` in the PR body (or the card line); `module-cards` green.
3. M2: `log()` answers 201 even when the immediate check fails, and logs it.
4. M3: `sweep()` logs each failure.
The Minors are at the builder's discretion within the 800-line budget. m1 and m2 matter most.

Verdict: Block 1b9733fd136dd842d024b92698db334aca9faf1d

## Round 2 (23 Nov 2026): head 0cda0efbf27edd1f545f039b021f53fea45ca3a5, diff only
Read only `git diff 1b9733fd1..0cda0efbf -- …/prototype/studio`: 5 files, +20/−17, covering 3 commits (efbc8e4dd, 9a4bdd6b4, 0cda0efbf). The studio diff against main is now 798 lines, under 800. The records commit 0e8a6610 on top touches only `product/screens/PF-21b-3/` (checked with `git diff --stat`).

**Runs** (a detached worktree at 0cda0efbf, Postgres on :54329, :4400 never used):
- `check_pf21b_requests.ts` 27/27, `check_pf12_walls.ts` 110/110, `check_pf4s_system_signin.ts` 102/102 (with its one new seed entry), `check_pf8b_f4_migrations.ts` 9/9. All exit 0.
- `typecheck.mjs`: the 15 errors in `requests/service.ts` are gone. Two errors remain, in `../p2/runner.ts` (`@anthropic-ai/sdk` not found). They come from my worktree's package links, not from this diff: the main checkout at round 1 did not show them, and p2 is untouched.
- `module-cards.py pr` with the current PR body: PASS (`Card unchanged: api-features …`). On GitHub, `module-cards` is green on 0e8a6610.

**Round 1 items:**
- **B1 fixed.** `fields` is now a `function … : never` (service.ts:64), and the type narrowing holds.
- **M1 fixed.** The PR body has the `Card unchanged:` line.
- **M2 fixed.** `log()` runs `checkOne(id).catch(() => undefined)` (:107), so a saved request answers 201. The `flaky` case now logs a request 31 days late while alerts are down: it gets 201 PENDING, one row, no error, and the next run marks it with one alert. That case would fail if the catch were removed.
- **M3 fixed.** `sweep()` logs each failure (`logPort.error("data_request_check_failed", e, {})`, :151). The job handler throws when `failed > 0`, so PF-14's job line records a failed run. The marks make a retried run harmless.
- **Breaker m1 / my m3 fixed.** `REVOKE ALL ON plat_data_request, plat_data_request_event FROM xr_data`. The definers keep their access: per the PF-12 walls migration, xr_wall_reader holds the owner's rights by membership on a superuser cluster, and by its own grants and default privileges on a non-superuser one (RDS), not through xr_data. The suite and `check_pf8b_f4_migrations` pass. The test now proves xr_app with no firm, xr_app in a firm session, and xr_app as `xr_staff_bypass` all get "permission denied".
- **m5 fixed.** The due read is ordered by `target_date` first only when `p_due_by` is set. The console list stays newest first.
- **m4 fixed.** `today()` is now Toronto's day (`toLocaleDateString("en-CA", { timeZone: DATA_REQUEST_ZONE })`). It drives the future-date check, `completedOn` and the overdue test. `dueAt` stays end of the target day in UTC; that is harmless, at most a few hours earlier on the near-date alert.
- **Breaker m3.** The check's transaction now has `timeout: 60_000`.
- **m8.** The `move` comment is corrected, and the `tx as never` cast is gone.
- **Left as questions in the PR body (acceptable, Minor):** m1 (actions text overwritten), m2 (firm and person link unchecked; recommended for PF-21d, whose eraser acts on it), m7 (Auditor read), break m4 (some invisible characters), break m6 (Overdue → Held → In progress).

**New, Minor (no change required):**
- **r2-m1.** `log()`'s catch writes nothing. The request reads PENDING past its target until 07:20 the next day, when the daily check retries and now logs any failure. A `logPort.warn` there would say so at once.
- **r2-m2.** `sweep()`'s log line carries `{}`. Adding `{ entityKey: r.id }` (an id only) would name the request that failed.
- **r2-m3.** A slow alert can now hold the row lock for up to 60 s. A staff move on that request runs in Prisma's default 5 s transaction and would time out (500, with a REFUSED line) rather than wait. This happens only with a slow AlertPort, since LogAlerts writes synchronously.

Journey score (round 1: 7.5/10): J7, retry after a 500, now holds. Feedback and state, and error recovery, rise to 1. Correct data stays at ½ (m1, m2). **Round 2: 7 of 8 applicable, 8.75/10, a pass.**

No open Blocker or Major.

Verdict: Approve 0cda0efbf27edd1f545f039b021f53fea45ca3a5
