# PF-17 part 1 (R1.93) — merge review, round 3 (one merge of main only)

Reviewer role, fresh agent. Scope: the merge `98dccb3e2` = `cd306cb67` (part 1 as reviewed and broken, both Approve: `review.md`, `break-report.md`) + `origin/main` at `e72e500e9`, which brings AUD-3a (#3178) and AUD-3c (#3296). Part 1 as a whole was not reviewed again. No journey score: merge-only round (Lead 15). Nothing committed or pushed; branch not switched.

## What was checked

1. **The PR's own files are unchanged by the merge.** `git diff cd306cb67 98dccb3e2 --stat -- …/system-console …/features/platform-system-console.ts …/tests/check_pf17_console.ts` is empty. The combined diff `git show --cc 98dccb3e2` is empty, so no conflict was resolved by hand. `git diff e72e500e9 98dccb3e2` is exactly the PR's 10 files (code, MODULE rows, test, its own screen records), +1032/-0: nothing on main's side was changed.
2. **What main brought that this code depends on** (`git log cd306cb67..98dccb3e2` on those files: `5ea8cd28e` AUD-3a, `72930ef37` + `c508a835b` AUD-3c):
   * `api/src/platform/observability/hook.ts:44-50` (AUD-3a): a request with `req.systemStaff` (PF-4s's guard, `system-identity/guard.ts:125`) acts as `ourstaff:<staffId>`, `OUR_STAFF`. It is read lazily (`requestScope.run({… audit: () => auditOf(req) })`), so it is set when the handler's lines are written. It sets no firm.
   * `api/src/platform/audit/audit-event.ts:59-62` (AUD-3a): in our staff's request an ordinary firm entry must carry the request's own `ourstaff:` word. A `system:<use>` word is refused, which made `touchFirm` answer 500 before AUD-3c. `:108`: a case-side line is refused in our staff's request, which made `touchPlatform` answer 500.
   * `api/src/platform/firm-scope.ts:341-343` (AUD-3c): `touchFirm` writes the request's `ourstaff:<id>` (from `ourStaffActor`, `:347`) and keeps `system:<use>` otherwise. `:375-382`: `touchPlatform` writes the new firm-less kind (`OurStaffPlatformEntry`, `ports/audit.ts`) in our staff's request: firm null, `plat_bypass_use`, the use as key. Otherwise it keeps the case-shape `system:<use>` line.
   * `audit-event.ts:77-89` `recordOurStaffPlatform`: the platform audit workspace, `OUR_STAFF`, firm and case null. It is refused outside our staff's request, under another actor, or when a firm is in scope. None of these applies to `GET /api/system/firms`, which has no `req.platform` and so no firm (`touchPlatform`'s own firm check at `firm-scope.ts:364` passes too).
   * The database side: migration `20261123030000_aud_ourstaff_actor_word` maps `ourstaff:` to `OUR_STAFF` in the insert trigger.
3. **Verdict on the two routes.** `firms.ts:118` (list: `touchPlatform` in the list's one short transaction) and `firms.ts:152` (one firm: `touchFirm(tx, row.id)` in that firm's transaction) need no change. They now write:
   * list: one firm-less line, actor `ourstaff:<caller>`, `OUR_STAFF`, entity `plat_bypass_use`, key `platform.console.firms-list`, firm and case null, workspace `platform-audit`, the request's correlation id;
   * one firm: one line on that firm's own trail, actor `ourstaff:<caller>`, `OUR_STAFF`, entity `platform_firm`, key the firm id.
   * Neither writes a `system:` word or a firm staff word. Neither answers 500 for our staff, because every allowed call in the suite is 200. A failed write still rolls back fail-closed through `BypassNotRecorded`, unchanged.
4. **Other assumptions still hold.**
   * `firms.bypass.ts` (`defineBypassUse`, `audit: "platform"` / `"per-firm"`, `direct: true`, route regexes): `defineBypassUse`, `entryOf`, `asBypass` and `mayRunInside` are unchanged by the merge. The firm-scope diff touches only `touchFirm`, `touchPlatform`, `ourStaffActor` and one import.
   * The PF-4s guard's per-call line goes to `plat_system_audit` through `SystemIdentity.audit`, not `audit_event`. `system-identity/` is untouched by the merge, and DW5 still counts one line per call, allowed or refused.
   * New on main: PF-25w's `POST /api/system/firms/:id/web-address` (`web-address/routes.ts:124`) shares the controller prefix. It matches neither bypass route (`^GET /api/system/firms$`, `^GET /api/system/firms/[^/]+$`), and it runs in the firm's scope, not a bypass.
   * New on main: PF-31c's global `IfMatchVersion` interceptor acts on saves only, and both PF-17 routes are GETs.
   * `entitlements/`, `case-count.ts`, `identity/keys.ts` and `http/input.ts` are unchanged.

## Runs (postgres 18 on 127.0.0.1:54329; scratch databases; never :4400)

From `ai-workers/problem-1-pathway-setup-and-form-filling/prototype`:
* `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf17_console.ts`: **38 passed, 0 failed** (the builder's 38/0).
* `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud3c_platform_line.ts`: **16 passed, 0 failed** (the builder's 16/0).
* Reviewer's own check, not committed. I ran a scratch copy of `check_pf17_console.ts` outside the repository with three extra assertions after DW5: **41 passed, 0 failed**. The assertions and what the database showed:
  * one firm: `{"actor":"ourstaff:<billing staff id>","actor_type":"OUR_STAFF","entity":"platform_firm","firm_id":<firm A>}`
  * list: `{"actor":"ourstaff:<billing staff id>","actor_type":"OUR_STAFF","entity":"plat_bypass_use","entity_key":"platform.console.firms-list","firm_id":null,"case_id":null,"ws":"platform-audit"}`
  * zero `platform.bypass` lines under `system:platform.console.*`.

## Findings

### Blocker
None.

### Major
None.

### Minor
* **m1: the PR's suite does not pin the actor of its own bypass lines.** `studio/tests/check_pf17_console.ts:185-199` (DW5) and the DW9 line count check that the lines exist and where they are: `firm_id` null with `detail->>'use'`, and firm A's trail with `detail.use`. They do not check `actor`, `actor_type` or `entity`. A regression that put the list's line back under `system:<use>`, or under a firm staff word, would still pass the PF-17 suite while those were the only checks. Today it would be caught indirectly in two ways:
  * `check_aud3c_platform_line.ts` DW1/DW2 pin the same helpers on test-only routes;
  * the adapter's refusal would make PF-17's allowed calls answer 500, failing DW1.

  The actor on these two routes was confirmed by the reviewer's scratch run above. Fix (small, test only): in DW5, for both lines, assert `actor = 'ourstaff:<the billing staff id>'` and `actor_type = 'OUR_STAFF'`; for the list's line also assert `entity = 'plat_bypass_use'`. This can be done in this PR or in part 2. It does not block.

### Note (no action)
* Opening one firm now writes an `OUR_STAFF` line on that firm's own trail. It shows as "ExpatReady staff" in the firm's activity view (`audit/firm-read/render.ts:42`, the `ours` filter at `firm-read/service.ts:119`). Before, it was a system line. This is the intended effect of AUD-3c (Lead B's point 1 on #3040) and is consistent with P-571 (1).

Verdict: Approve on 98dccb3e283084b0e72b60256a9c90244cc7e608
