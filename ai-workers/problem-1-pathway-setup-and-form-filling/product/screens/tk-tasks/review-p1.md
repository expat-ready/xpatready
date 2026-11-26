# Review: R1.75 part p1 (PF-29a, PF-29b), PR #3635, commit 54394f8464c8d50f289ef547e7ce5ad505c8a7fb

Reviewer: a fresh session that did not build this part. Scope: API and schema only (no screen), checked against STANDARDS.md, WAY-OF-WORKING "Every PR", shape-r175.md row p1 (approved by Lead 4 on the PR, 25 Nov), concept r2.1 BR-3, BR-5, BR-8, BR-10, BR-19, and BACKLOG PF-29a and PF-29b. The :4400 demo was not used.

**Verdict: Block.** One Blocker at this commit (required suites are red). Later commits on the branch fix it, but they are not part of this review. Three Majors are still open at the branch head. The list to fix is at the end.

## What I ran
* At 54394f8 (an extract in the scratchpad, using the studio's own node_modules): `tsx tests/check_tk1_tasks.ts` gave **30 passed, 0 failed**.
* At 54394f8: `check_pf12_walls.ts` guard line **FAIL** `["plat_task trigger function plat_task_assignee_in_firm","plat_task trigger function plat_task_write"]`. Its other 4 failures come from running the extract outside the repo (server spawn, ERR_MODULE_NOT_FOUND), not from the code.
* At 54394f8: `migration-slots.py check origin/main..54394f8` gave **FAIL**, "20261125100000_pf29a_plat_task: its name carries no area".
* `count-any.mjs --against origin/main`: 416 → 416, no rise. `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.
* Mutation spot-check (STANDARDS §7 [M] "A rule's test fails when the rule is removed"). I removed four rules from `service.ts` and the suite stayed **30/30** (Major 2).
* Journey score: **N/A**. This part is API only and has no screen. D1–D20 and BIC-01–20: N/A for the same reason.

## Blocker
1. **Required CI suites are red at this commit.**
   * `prisma/migrations/20261125100000_pf29a_plat_task/migration.sql:71-92`: the two trigger functions are plain SECURITY INVOKER functions. PF-12 requires every trigger function on a firm table to be SECURITY DEFINER, owned by `xr_wall_reader`, with `search_path` pinned. `check_pf12_walls` names both functions.
   * The migration folder name carries no area (SPD-2), so `migration-slots.py check` in ci.yml job "fast" refuses it.
   * The features card row is missing (module-cards, per the builder's later commit).
   * Failure: the PR cannot pass CI as reviewed, and if it merged anyway the tasks table would be the one firm table outside PF-12's trigger rule.
   * Later commits address all three (47f1fbe5c, 6a11b3b99, f70ceeef3, db0aa1aa5, cb85b0cf8). At f70ceeef3 I re-ran the PF-12 guard line and `migration-slots.py check origin/main..HEAD`, and both PASS. The next round should re-review only that diff, including 6a11b3b99's change of the `IN (...)` checks to regexes.

## Major
1. **A Restricted task still shows what kind of record it is on (BR-3).**
   * Where: `api/src/platform/tasks/service.ts:128` (`hostType: r.hostType`, sent for every view, Restricted included) and the type at `:84`.
   * Rule: BR-3 / AG-13-67 (c) say "title and Restricted only: no name, number, status, type or link". The concept's contract (§6) has no `hostType` field. The file's own header (`:4-5`) promises "no name, number, type or link".
   * Failure: an officer is taken off a case. They are still assignee of a task on it. GET `/api/platform/tasks/:id` returns `host: "RESTRICTED"` with `hostType: "case"` (or `"case_client"` / `"fo_person"`). That tells them the hidden record is a case, a case client or a lead.
   * Why the test misses it: `tests/check_tk1_tasks.ts:132-133` only checks that `"L-00001"` is absent.
   * Fix: return `hostType: null` when the host is Restricted, and assert it in TK3.
2. **Four rules can be removed and the suite stays green (STANDARDS §3 rule 10, §7 [M]).** I removed each of these in a copy of 54394f8 and `check_tk1_tasks` still gave 30/30:
   * (a) `:246` Cancel needs `agent/task:edit`. No test makes a person without `:edit` cancel.
   * (b) `:236` Reopen needs `:edit`. Same gap: no test without `:edit`.
   * (c) `:226` the assignee of a **Restricted** task can mark it Done (BR-3). I changed it to need the host visible and no test failed.
   * (d) `:195` only an open task can be assigned. No test assigns a closed task.
   * Also without a failing test: `:139`, where a reader who is neither assignee nor maker needs `agent/task:view.all`. All six starter roles hold `view.all`, so a test needs a grant without it.
   * Also without a passing test: Done by an `:edit` holder who is not the assignee.
   * And: the "view.all with edit" route to Take it is proven only when the Case Officer happens to win the race at `:153`. It is not deterministic.
   * Failure: any of these checks can be lost in p2–p5 with CI still green.
   * Fix: one pass and one fail each, for example Billing (no `:edit`) cancels and reopens → 403, the Restricted assignee marks it Done → 200, assigning a cancelled task → 409.
3. **Reopen can give an open task to a person who is no longer active (BR-19, AG-13-2).**
   * Where: `service.ts:233-239`. Reopen sets status OPEN and keeps `assigneeStaffId` without checking that person is still active. The trigger (`migration.sql:71-78`) checks only that the person belongs to the firm.
   * Failure: person X completes a task. X is then deactivated; BR-13 says done tasks keep X's name. A Case Manager reopens the task. It is now OPEN and assigned to X, who cannot sign in. p2's Unassigned list will not show it because the assignee is not null, and it sits in a My Tasks that nobody opens. This breaks the file's own rule at `:10` ("never a suspended or deactivated person").
   * Fix: on reopen, when the assignee is not ACTIVE, put the task back to Unassigned (and say so in the response). Add a pass and a fail.

## Minor
1. `service.ts:203,217` (Take it): the audit line's "before" is the row read **outside** the transaction. If an edit commits between that read and the `updateMany`, the audit shows that edit's change as part of "Task taken". Fix: re-read the row inside the transaction before the update, or use `RETURNING`.
2. `service.ts:144-147,196`: the active-staff check is a plain read with no lock. If the assignment races p3's deactivation, the task can commit to a person who was just deactivated after the hand-over has already moved their tasks. For p3 to close, for example with `SELECT … FOR SHARE` on the staff row.
3. Zones are not checked once they are read:
   * `hosts.ts:198` accepts any `zone` string from a host. `service.ts:166,184` also use the office zone without checking it.
   * If a host returns a bad zone, `dueInstant` gives an Invalid Date, which becomes a 500.
   * If ICU accepts a zone that PostgreSQL's tzdata lacks, `migration.sql:61` raises 22023, which also becomes a 500 instead of a 422.
   * Also, `now()` inside a CHECK (`:61`) is not immutable, so a restore on a server with older tzdata can fail.
4. `routes.ts:221-222`: POST create takes no `Idempotency-Key`. STANDARDS §4 [M] says "Idempotent creates", and `platform/idempotency.ts` exists for this. A retried Add task makes two tasks, each with its own audit line (and two "assigned" notices once p2 adds them). If this is deferred, name it in the PR.
5. `service.ts:182-187,197`: an edit with only `{version}`, or assigning a task to its current assignee, still bumps the version and writes an audit line where before and after are the same.
6. `service.ts:258`: the stale-version 409 returns only `version`. STANDARDS §4 asks for "409 with what changed". The concept's "Reload to see it" covers the screen, but the API could return the current task.
7. Tests:
   * The labels name `TK1`–`TK8`, not capability IDs. WAY-OF-WORKING "Every PR" wants labels like `PF-29a: …` / `R1.75: …`.
   * `check_tk1_tasks.ts:101` claims "updated_at moves" but never asserts it.
   * `:123` names "01:30 Toronto, the first, daylight one", but only 09:00 on 31 Oct and 2 Nov are tested. The repeated hour is not tested.
8. Silent deviation from the approved shape and from BACKLOG PF-29a ("composite (firm_id, assignee_staff_id) key"):
   * The assignee is checked by a trigger (`migration.sql:5-6,70-78`), following `fo_lead`'s precedent. That is sound because staff rows are never deleted.
   * But the shape's touch list (`store.ts`, the `firm-scope.ts` registry line, two back-relation lines) also differs, and the PR body still says "composite staff keys" and "Checks and results: To come with the code".
   * Fix: state the deviation and the results in the PR body.
9. For p2 (not a p1 bug): `routes.ts:223` declares `@Get(":id")`. Declare p2's `mine`, `unassigned`, `home` and `badge` routes before it, or they will be read as an id and get a 404.

## Met (evidence)
* Additive migration with its rollback recorded (`migration.sql:10-11`).
* PF-12 policy and forced RLS are present; TK1 checks the force flag.
* DELETE and TRUNCATE are revoked from `xr_data`.
* Database checks, each with a pass and a fail in TK1: reason only when CANCELLED, completed needs who and when, title 1-200, host and context shape, due needs its zone, `source_key` unique per firm, firm and host never move, version +1.
* Same-firm assignee trigger: 23503 (TK1).
* Every route is behind PF-4's guard, and the service checks each action: create 403 without `:create`, a host the caller cannot see → 404, assign 403 without `:assign`, Take it 403 for Read-only and Billing, edit 403 on a Restricted task, other firm → 404 (TK2–TK7).
* Version checked on every change → 409 "This task changed. Reload to see it." (TK4).
* First Take it wins under a real race, and the loser's 409 names the winner (TK5, BR-5).
* One audit line per change, in the change's own transaction (TK6).
* RFC 9457 problems with field errors in the screen's words.
* A failing host gives a 404, never a 500 (TK8). The host log carries no personal data.

## Could not check
* The full CI run for this commit.
* The later commits beyond the two checks I re-ran above.
* The module-cards check at 54394f8.

## List to fix
Blocker 1 (fixed later on the branch; re-review that diff), Major 1, Major 2, Major 3.

Reviewer: Block 54394f8464c8d50f289ef547e7ce5ad505c8a7fb
