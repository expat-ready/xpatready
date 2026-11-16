# Review: CS-C1b, the active-case count and the plan-limit check at opening (PR #2002, map row 77)

Independent Opus reviewer (P-303), 16 Nov. Commit reviewed: **41afe036439c29e0cff652cb84609a55b7d8b926**. The PR head is now 9cb96c6e1; it differs only in `product/qa/built/CS-C1.md`, so no studio code changed. The row is API-only with no screen, so it is reviewed against the brief that wins (`design/build-lead-c-briefs/CS-C1b.md` on `claude/build-lead-c-647b40`), the spec it approves (`design/briefs/CS-C1b.md` on main), the code and `STANDARDS.md`. The D1-D20 scores, the BIC table and the browser journey score do not apply (no screen). **Journey score: N/A** (API-only). Instead I walked the API journeys below on an isolated copy and checked the data underneath.

## What I ran (isolated copy `csc1b_rev`, port 4591, stopped afterwards)
* `tsx studio/tests/check_csc1_count.ts 4591 xr_studio_csc1b_rev`: **36/36 passed**, exit 0, 2 min 31 s.
* `node studio/tools/check-port-contracts.mjs`: exit 0. CaseCountPort ×2. EntitlementPort has no real adapter yet, so it needs no contract.
* **Spot-check that the test fails when the rule is removed** (STANDARDS §7). In a scratch mirror of `api/` I commented out the `pg_advisory_xact_lock` line. Result: **30/36**. Two parallel openings both got 201 (C-2026-00006, -00007), and the ten-at-once case and the no-gap case went red. The lock is what protects the limit, and the test proves it.
* Scratch API journeys (in-process app on the copy's database, the same harness as the check):
  * **(a)** two openings in parallel with the same `idempotencyKey`, at N−1 active with limit N;
  * **(b)** the same pair under allow-all, as a control;
  * **(c)** a sequential retry;
  * **(d)** which clock writes `module_event.occurred_at`;
  * **(e)** `EXPLAIN` of the count read.

  Results are under the findings.

## Findings

### Blocker
None.

### Major
**M1. At the limit boundary, an idempotent retry gets 409 `PLAN_LIMIT_REACHED`, "Nothing was created", although its case exists (STANDARDS §4 [M] "Idempotent creates").** `api/src/runtime.ts:263` checks the idempotency key only before the transaction. The hook at `:302-306` then refuses before the unique-violation path at `:333-334` (the only place a concurrent same-key create is answered with its case) can run.
* **Failure, reproduced.** Limit N=2, 1 active. Two `POST /api/runtime/cases` with the same key in parallel:
  * one answers `201 created:true` (case 1b5a1205…);
  * the other answers `409 PLAN_LIMIT_REACHED` "…so this case was not opened. Nothing was created.";
  * one case row has that key.
* **Control (b):** the same pair under allow-all answers `201 created:true` and `201 created:false` with the same id. So the default binding is unaffected and the change shows only once a limit is bound (PF-15, or the test port).
* **Why it matters:** a retry after a lost answer (the UI, or the programmatic callers CS-98b and FO-8) is told its case was refused. An officer may then close or withdraw another case to "free a slot". A job may record the lead as refused while the case exists.
* **Fix (inside the touch list):** in the hook, after the lock and before the count, when `b.idempotencyKey` is given, look it up with `tx` (`workspaceId`, `firmKey`, `idempotencyKey`). If it is found, leave the transaction and answer through `replay()`, which keeps the fingerprint check. Add a DW11 line: two parallel same-key openings at N−1 both answer the same case id (fail before the fix, pass after).

### Minor
* **m1. The reopen boundary compares two clocks** (`api/src/case-count.ts:34`):
  * `case_decision.recorded_at` is set by the insert trigger to `now()`, the database's transaction start (migration `20261115160000_csc1a_case_decision:101`);
  * `module_event.occurred_at` is Prisma's `@default(now())`, which the writer fills. Probe (d): tx start 16:28:15.316, occurred_at 16:28:16.819, the app's time at insert.

  **Failure:** a decision whose transaction began before the reopen inserted its event, and that waited on the case row's `FOR UPDATE` (`case-close.ts` `locked()`), gets `recorded_at < occurred_at`. The count then ignores it, and the case stays active although every filing has a decision after the reopen. Clock skew between the API host and the database host has the same effect for any decision within the skew. The window is narrow. **Fix:** compare on one clock, or record the limit in the module card's invariant.
* **m2. The count rescans the whole outbox, per case, while holding the firm's lock** (`api/src/case-count.ts:34`). `EXPLAIN` (e) shows `Seq Scan on module_event e … Filter: type = 'case.reopened' AND subject_id = c.id::text` as an InitPlan inside the per-case SubPlan. `module_event` holds every firm's events (its only index is `(firm_id, seq)`) and grows without bound, so every opening reads O(open cases × outbox rows) under `case-open:<firm>`. STANDARDS §5 [M] "Read paths indexed". **Fix (no migration allowed here):** compute each case's last reopen once, in a CTE over `module_event` filtered by type and the firm's open case ids, and join it. Or ask for an index `(subject_id, type)` in the schema owner's row.
* **m3. A test can fail spuriously: it sorts numbers as text** (`tests/check_csc1_count.ts:202`). `.sort()` compares strings. If the checkpoint leaves 9 individual cases active, N=10 and `[9,10,10].sort().join()` gives `"10,10,9"`, which is not `"9,10,10"`, so the check fails although the code is right. It passes today only because N=11 (12 and 13 on my reruns). **Fix:** `.sort((a, b) => a - b)`.
* **m4. Three assertions are weaker than their names say:**
  * `tests/check_csc1_count.ts:131` `b1.corporate !== b0.corporate + 3` holds for almost any bug. The first half carries the check, so the second half is dead weight.
  * `tests/check_csc1_count.ts:224` compares the first `sample-solo` call's `used` with itself (always true). It should compare with `B.activeCounts()` read before the opening.
  * Contract case 4 (`ports/contracts/case-count-port.contract.ts:61`) also passes for an adapter that ignores `tx`, because nothing is pending. The rule is still covered end to end: `createCase` builds `PgCaseCount(tx, …)`, and the lock mutation above goes red.

## The builder's five choices
1. **`check(firm, metric, used?)`: agree.** PF-15's row has the adapter read usage "through the case side's case-count read port". But P-588 (3) needs the count read inside the opening transaction, which the two-argument signature cannot see. An optional third argument keeps PF-15's two-argument call valid. Raised in the PR body for the Lead to confirm (not silent).
2. **Firm key rather than platform firm id: agree.** `platform_firm.key` is `@unique` and never changes (`platform.prisma:54-59`: "cases carry it; triggers"). `platform_firm` is under FORCE RLS (PF-12 migration :97-99), and the route has no staff session. The count, the lock and the case-number counter use the same key, so the identity is 1:1 and the lock is just as strict.
3. **"Active": agree.** CS-C1a only closes a case once every active filing has a decision (`case-close.ts` close: `NOT_DECIDED`), or by withdrawal. So "status OPEN" equals the spec's "not closed WITHDRAWN and not every filing decided" for closed cases. Ignoring decisions recorded before the last reopen gives "a reopened case counts again" (SA-3-47). Counting a case with 0 filings matches "counts from creation". Decisions on inactive filings are rightly ignored, and a correction is a new DECISION row that counts. One clock caveat: m1.
4. **Stubbing `Programs.startableMissing`: agree.** The copy's own server opens on the same combination as the setup line, and the stub does not touch the hook.
5. **Copying the group SQL: agree, within the touch list.** `program_def (workspace_id, program_node_key)` is unique (init migration :508), so the chain is linear. `order by depth` with the guard of 32 picks the nearest PATHWAY, the same node `case-close.ts`'s `limit 1` returns. Making `case-close.ts` call `groupOfCombination` is for a later row; it is not this one's.

## Other checks that held
* **The hook's position:** the first statements inside the transaction, before `party.create` and `runtime_next_case_number`.
  * A refusal rolls back; the counter and party rows are unchanged (DW11 lines).
  * The HttpException passes the `unique(e)` catch unchanged.
  * A sequential retry still replays before the transaction (c: `201 created:false`).
* **The lock under READ COMMITTED:** the lock is the transaction's first statement. Every later statement takes a new snapshot that includes the previous holder's commit, which becomes visible before the lock is released. Proven by 10 parallel → 1 × 201 and 9 × 409, and by the mutation.
* **The rest:**
  * Default binding: allow-all, so responses are as today (control b).
  * Global state: no module-level state. The binding is a per-instance field on the singleton Runtime with a `useEntitlements` setter, process configuration and not request state.
  * Ports import only `zod` and their own folder.
  * RFC 9457 body (type, title, status, detail, plus code, metric, limit, used); PF-15's code `PLAN_LIMIT_REACHED`.
  * Touch list respected (7 files); 435 changed lines, under 800.
  * Module card updated with the invariant.
  * The PR body states the "Stream changed" note and the `case.opened` contract gap.

## Not checked
* The full CI. On 41afe0364, `guard` and `pr-rules` were cancelled (superseded) and `ci` was skipped.
* The other suites named in Done-when (A24, C6.11, the demo reset, C10.1). I did not rerun them.
* `graph.mjs`, because it writes `qa/GRAPH.md`, which is outside this review's single file.
* Reopening above the limit, which SA-3-62 allows; it is not in this row's scope.

Round 1 result on 41afe0364: Changes requested (M1). Round 2 follows.

## Re-review on c224b4f6e (P-277: only `git diff 41afe0364..c224b4f6e`)

The new diff touches `api/src/runtime.ts` (+4), `api/src/case-count.ts` and `tests/check_csc1_count.ts`; 9cb96c6e1 between them only adds `product/qa/built/CS-C1.md`. The PR is now 474 changed lines in `prototype/`, still on the touch list.

**What I ran.** On copy `csc1b_rev`, port 4591 (stopped afterwards):
* `check_csc1_count.ts`: **40/40 passed**, twice on the same copy.
* `check-port-contracts.mjs`: exit 0.
* **Spot-check that the new test fails when the fix is removed:** in a scratch mirror of `api/` I disabled the new in-transaction key check (`runtime.ts:305`). Result: **39/40**. The DW11 (review M1) line went red with `[201 created] [409 PLAN_LIMIT_REACHED]`, which is exactly the round-1 failure. The new line discriminates.

**Round-1 findings**
* **M1: fixed.**
  * `runtime.ts:305` now looks up the same key's case after the lock and before the count, so the plan limit can no longer answer a retry. `:335` answers it through `replay()`, which keeps the fingerprint check: the same key with a different request is still 409.
  * In READ COMMITTED, the waiting twin's lookup sees its twin's committed case.
  * New DW11 lines: both twins get 201 with the same id (one created, one replayed), and one row carries the key; when the firm is full, the same key still replays while a new opening is 409.
* **m2: fixed enough for this row.** The last reopen is now read once per count (the `reopened` CTE), not once per case. The outbox is still read once per opening, filtered by type: an index needs a migration, which is off this touch list. The builder measured 53 ms with 300k extra rows; I did not re-measure.
* **m3: fixed** (numeric sort).
* **m4: fixed for DW10 and DW12.**
  * DW10 now has two discriminating checks: corporate does not add to individual, and individual or family does not add to corporate.
  * DW12 compares firm B's `used` with its count read before the opening.
  * The contract's fourth case is left as a stated limit. It is covered end to end by DW11 and the lock mutation from round 1.
* **m1 (two clocks): open as Minor, accepted as a known limit.** It is raised in the PR. Closing it needs an ordering column on CS-C1a's `case_decision`, which is outside this touch list. The window is narrow and it is not a Blocker.

**New code (the breaker's M3: the CURRENT stage's filings only), `case-count.ts`.**
* The `filings` CTE joins `case_stage` on `state = 'CURRENT'`. `filing.stage_id` is NOT NULL and was backfilled to the CURRENT stage (C6.17 migration `20261109130000:90,95`), so no older filing drops out of the count.
* A decided case whose next stage has started counts again until that stage's filings have decisions. That is consistent with SA-3-47. The new DW9 pass and fail lines hold.
* CS-C1a's close still checks every active filing, on any stage. That rule is unchanged and stricter, so the two do not conflict.

**Notes (not findings).**
* If `replay()` returned null after `REPLAYED`, `runtime.ts:335` would fall through with `id = "replayed"`. This cannot happen: the key's case was read as committed and cases are never deleted. A `fail(...)` there would make it explicit.

**Not checked:** full CI on c224b4f6e, and the other Done-when suites (A24, C6.11, C6.17, the demo reset, C10.1). Under P-385, CI must be green on this sha before the label.

Round 2 result on c224b4f6e: Approve. Round 3 follows.

## Round 3 on c8b53e584 (P-277: only `git diff c224b4f6e..c8b53e584 -- '*.ts'`)

**The change.** One change, in `api/src/case-count.ts` (the breaker's m4). A new `per_case` CTE groups the current stage's active filings once per case, with `count(*) filter (where not exists <a DECISION after the last reopen>)` as `undecided`. `active` is then `p.case_id is null or p.undecided > 0`.
* This is the same rule as before. Cases with no current-stage filing (`p.case_id is null`) still count. A case with any undecided filing counts. A case whose filings all have a decision after the last reopen does not.
* The reopen boundary, the firm filter and the group read are unchanged. The other commits in the range are only review and break reports.

**What I ran.** On copy `csc1b_rev`, port 4591 (stopped afterwards):
* `check_csc1_count.ts`: **40/40 passed**.
* `check-port-contracts.mjs`: 0 problems.

The DW9 lines would go red if `undecided` or the `is null` branch were wrong: one of two filings decided, all decided, a reopen, and the next stage with no filing.

**The first-plan case: it does not block this row. Recorded as a Minor known limit.** The builder measured 27 s for the first count right after a bulk insert of 6000 cases, before autoanalyze, and 180 ms after ANALYZE.
* **Where it cannot happen.** Openings through `createCase` add one case at a time. Autoanalyze runs after 50 + 10 % changed rows, so normal use never meets a table with stale statistics. The Sample data (checkpoint, demo reset) is tens of cases, and the 40/40 run starts on a fresh copy straight after the checkpoint load.
* **Where it can happen.** A future bulk import of a firm's cases, followed at once by an opening. That opening would wait on `case-open:<firm>`, and so would every other opening of that firm. Prisma's 15 s transaction timeout would then answer 500 (P2028), not a wrong count. Nothing is written, so no data is harmed.
* **Who owns the fix.** The row that adds the bulk loader: run `ANALYZE` on `runtime_case`, `filing`, `case_stage` and `case_decision` after its insert. That row is not built yet, and it is not this touch list.

Record it in the PR as a known limit beside m1 (two clocks).

Verdict: Approve c8b53e584b071edc820da33dcdb0e76d3090cde9
