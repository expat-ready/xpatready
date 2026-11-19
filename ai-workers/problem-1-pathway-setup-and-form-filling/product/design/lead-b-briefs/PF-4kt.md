# Brief: PF-4kt — a write checks the caller's permission keys inside its own transaction (all routes; follow-up from PF-21j) (row owner Lead B / Build Lead A)

Written 19 Nov 21:05 IST by Lead B (7), at Lead 95's ask. **Model: Opus 5.5, effort: high** (permissions, every route). **Breaker: yes** (P-303).
**Duplicate check:** no open PR or BACKLOG row checks keys inside the write's transaction. PF-6m2, the invitation recheck, covers money keys at accept only. Checked 21:05 IST against the open PRs and BACKLOG on main.

## The gap (older than PF-21j, on every route)
The platform guard (`identity/guard.ts`) reads the caller's roles and keys **once, at request start**, into `StaffContext.keys`. A write then runs its own transaction later. If an Owner removes a role, deactivates the person or ends a grant between those two moments, the write still goes through on keys the person no longer holds. For example, a handler made Read-only mid-request still closes a complaint (PF-21j's review), or a person removed from Admin still saves a setting. The window is short but real, and it is wide on slow writes and retries.

## The fix: one check, in the shared transaction path, never per service
1. **A keys version per person.** Add `platform_staff.keys_version integer not null default 0`, one migration with its own stamp (P-600). It is bumped, in the same transaction, by every change that can remove a key:
   * a role grant ended or changed;
   * a role's key set edited, which bumps every holder of that role;
   * deactivation;
   * a session revocation for the person.

   Database triggers on `platform_role_grant`, the role-keys table and `platform_staff.status` do the bump, so no writer can forget it.
2. **The guard records it.** `StaffContext` carries `keysVersion`, read with the keys.
3. **Every write transaction re-checks it.** The firm transaction wrapper in `firm-scope.ts` is the one place every firm write passes through. When a staff context is present, it runs `select keys_version from platform_staff where id = $staff for share` first.
   * If the value differs from `ctx.keysVersion`, it answers **409** `KEYS_CHANGED`: "Your permissions changed while this was being saved. Reload and try again." Nothing is written.
   * The `for share` row lock orders the write against a concurrent role change, so one of them always sees the other.
4. **Reads** keep the request-start keys; this row is about writes only. **Jobs and doors** with no staff context are untouched.

## Done when
`tests/check_pf4kt_keys_in_tx.ts`, with a pass and a fail each:
* a role removed between the guard and the write gives 409 `KEYS_CHANGED`, and nothing is written. Test this on three routes from different modules: a platform setting, a front-office prospect edit, and a complaint close;
* with no change in between, the write succeeds;
* a role change and a write racing each other leave a consistent result (both orders tested with a held lock);
* deactivation mid-request gives 409;
* a job write without a staff context is unaffected;
* removing the check in the wrapper makes each fail case pass wrongly, so the suite catches it;
* every existing suite is green. The extra row lock is one indexed read per write.

## Touch list
* one migration (column plus triggers);
* `identity/guard.ts` and `identity/keys.ts` (`keysVersion` on the context);
* `platform/firm-scope.ts` (the wrapper's check);
* `tests/check_pf4kt_keys_in_tx.ts`;
* `MODULE.rows/PF-4kt.md`.

No service file changes. Under 800 lines. **Parallel safety:** `firm-scope.ts` is shared with #2029 (PF-12b). Start after #2029 merges.

## Then
qa walks permissions (P-733). This is not tied to one R1 item; it hardens R1.4's walls. The Lead places it.
Source: P-733, PF-21j review (QA-517 follow-up), AG-1-45 (staff permissions). Unconfirmed: no counsel.
