# Break report: PF-12b part 5 (QA-703), webhook_receipt behind PF-12's firm wall

Branch `claude/runtime-pf12b5` at d67f746d7, diffed against 0f260fae3. Breaker, 21 Nov. Not committed.
Where I ran it: isolated copy `brk5` on :4565 (`PLATFORM_IDENTITY=local`, fake billing, API connected as `xr_app`), plus scratch databases `xr_brk5_scratch` (every migration) and `xr_brk5_base` (every migration but this one) on 127.0.0.1:54329. The copy is stopped and both databases are dropped.
Suites on this branch: `tests/check_pf12_walls.ts` 106/106 passed, `tests/check_pf5_signup_billing.ts` 94/94 passed (run with `tsx --tsconfig studio/api/tsconfig.json`).

**Result: no Blocker. 2 Major, both in the widened guard, not in the wall itself. 4 Minor.**

## Major

**M1. The guard does not see a view or a materialized view over a walled table, and that object leaks every firm.**
- Steps, on a database with every migration:
  - As the owner: `create view widget_leak_v as select * from webhook_receipt;`
  - As the owner: `create materialized view widget_leak_m as select id, firm_id, event_id from webhook_receipt;`
  - As `xr_app` with firm A: `select count(*), count(distinct firm_id) from widget_leak_v` returns `3|2`. The matview returns the same. The same session reading `webhook_receipt` directly returns `1`.
- Expected: `unwalled()` or `unguarded()` names both objects.
- Actual: neither names them.
- Why: `firmIdTables` and `unwalled` read only `relkind in ('r','p')` (`tests/check_pf12_walls.ts:48-49`, `:63-64`). Default privileges give `xr_app` SELECT on the new view, and a view owned by the superuser owner ignores row-level security.
- Context: the two existing views, `money_to_move` and `money_trust_shortfall`, are `security_invoker=true`, so nothing leaks today. Nothing checks that, though, so the next view without it would pass CI. The comment at `:37-39` says "the next webhook_receipt cannot slip"; a view can.

**M2. Other shapes that still get past the widened guard.** Each was run on the scratch database with the guard's exact queries.
- A firm column under another name: `widget_tenant(owner_firm uuid)` is not named. Real tables already look like this: `case_client_counter.firm_key` is unwalled, `xr_app` can SELECT and UPDATE it, and it is not on `FIRM_ID_ELSEWHERE`.
- Another schema: `brk_other.widget(firm_id)` with USAGE and SELECT granted to `xr_app` is not named, because the scope is `relnamespace = 'public'` only. `xr_app` already has USAGE on `case_lookup` and `extensions`.
- A policy that names the session firm but walls nothing:
  - `using (firm_id = platform_session_firm() or true)` passes, and firm A then reads firm B's row (`count = 1`).
  - `using (other_firm = platform_session_firm())`, which walls the wrong column, also passes.
  - Cause: the check in `unguarded()` is only a text regex for `platform_session_firm()` (`:76-79`).

## Minor

**m1. `FIRM_ID_ELSEWHERE` can silently hide a family table.**
- `walledScope` drops anything `t in FIRM_ID_ELSEWHERE`, family tables included (`:51`). The "exactly the named list" check (`:118-119`) only proves each entry still has `firm_id`. Adding `fo_lead: "..."` would take a PF-12 family table out of `unwalled(EMPTY)` and `unguarded(EMPTY)` with every check still green.
- `in` also matches `Object.prototype` names: a table called `constructor`, `toString` or `valueOf` would count as excepted.

**m2. The firm policy lets firm sessions write receipts, which no code needs.**
- As firm A, `xr_app` can still insert a receipt with its own firm and any event id. It can also update or delete its own handled receipts (for example, re-open one or mark it "set aside").
- No app path reads or writes receipts in a firm's scope. The door and the sweep both run on the bypass (`webhook.ts:66`, `:105`).
- Impact is low: event ids are Stripe's random ids, and a re-handled event is idempotent. The OWN-register pattern (forced, no policy) is another shape. I note it only and do not ask for a change.

**m3. A unique-key existence oracle for other firms' and firm-less receipts.** This is normal row-level security behaviour and applies to every walled table with a unique key.
- As firm A:
  - Inserting B's `event_id` gives `duplicate key ... webhook_receipt_service_event_id_key`.
  - `... on conflict do update` gives `violates row-level security policy (USING expression)`.
  - `on conflict do nothing returning id` gives no row.
- Each one tells firm A the event id exists. Low value, because the ids are random.

**m4. `rollback.sql` restores the catalogue state but leaves the `_prisma_migrations` row.**
- Run on the brk5 copy:
  - `psql ... -1 -f prisma/migrations/20261122010000_pf12b5_webhook_receipt_wall/rollback.sql`
  - `prisma migrate deploy` then prints "No pending migrations to apply".
  - Afterwards `relrowsecurity, relforcerowsecurity` = `f|f`, and the row `20261122010000_pf12b5_webhook_receipt_wall|t` is still there.
- So a redeploy never puts the wall back.
- 6 of the 9 `rollback.sql` files delete their row; this one, `pf12b2_door_lookups` and `fo7lk_trust_lock` do not.

## What held

1. **Wall, as `xr_app`** (script: 33 statements, each rolled back; afterwards the owner saw the 3 seeded rows unchanged).
   - Reads: firm A reads only its own receipt. With no firm, it reads none, the firm-less one included.
   - Inserts for B or for no firm are refused by the gate (`platform_firm_first`), whether firm A or no firm is set. The same holds inside a CTE.
   - UPSERT and ON CONFLICT on B's row or a firm-less row: refused (USING). Moving its own row to B or to null: refused by the gate.
   - UPDATE, DELETE and CTE-wrapped UPDATE/DELETE with RETURNING touch only firm A's row; with no firm, 0 rows.
   - MERGE does not see B's row (it took the insert branch with A's firm).
   - Refused with "not owner" or "permission denied": TRUNCATE, ALTER … DISABLE RLS, DROP POLICY, DROP TRIGGER.
   - Also held: COPY TO returns only A's row; `pg_stats` hides the table even after ANALYZE.
   - Not this change: `set local role xr_staff_bypass` works from `xr_app`. This is the design `asBypass` relies on.
2. **The real Stripe door on :4565 (signed like `fakeBilling().sign`) works as on main.** No app code changed in this diff.
   - Firm-matched `checkout.session.completed`: 200, outcome `checkout.session.completed: no subscription yet`, `firm_id` = sample-firm, plus a per-firm `platform.bypass` line.
   - Unmatched `invoice.paid`: outcome `invoice.paid: no firm matched`, `firm_id` null, plus the firm-less `billing.no-firm-matched` line.
   - Non-billing event: `product.created: no firm matched`.
   - Duplicates: `{"received":true,"duplicate":true}`, not handled again.
   - Unsigned: 400, nothing stored.
   - Redelivery of two set-aside receipts (one with a firm, one without): handled again.
   - The `*/5` sweep job on its bypass use read and wrote receipts with firm A, firm B and no firm. It set `retry 1`, set B's 73-hour `retry 4` receipt aside, and raised `job_stuck`.
3. **No other reader goes blind.** Grep of `api/src`, `web/src`, `tools/`, `product/tools/` and `tests/` (demo reset, seeds, AUD, qa):
   - The only app readers and writers are in `webhook.ts`, all on the bypass.
   - Suites and tools use the owner (a superuser locally).
   - `restore-drill.sh` compares RLS dynamically.
   - `tests/qa/check_r14_walls_gate_a.ts` lists only the families, so it does not cover the table, but nothing breaks.
4. **Guard catches:** a later `ALTER TABLE … ADD COLUMN firm_id`, a partitioned parent and its partition, a forced policy `using (true)`, an INSERT policy `with check (true)`, and a missing first gate.
5. **Rollback** applies cleanly in one transaction. On a database with every earlier migration, migrate then rollback gives the same state as main: `f|f`, same ACL, 0 policies, 2 internal triggers. A second rollback fails loudly. Re-applying the migration after a rollback works.

## Exception list (asked; reported, not fixed)

Check run as `xr_app` with firm A on the brk5 copy:
- **`module_event`:**
  - Firm A can read every firm's events (payloads carry firm ids, subscription moves and hold reasons).
  - It can insert an event naming firm B: `firm.payment_hold` for sample-solo was accepted, seq 2. Update and delete are refused by `module_event_insert_only`.
  - Cross-firm consumers act on such rows: the prospect-won catch-up (`api/src/case-clients/prospect-won.ts:124`) and `account.ts:57` (the hold reason).
  - The listed reason holds in part: the case side reads it with no platform firm (`api/src/case-count.ts:32`).
- **`firm_case_counter`:** firm A inserted a counter for firm B and updated B's `next_value` to 999 (`api/src/runtime.ts:1047` reads it for case numbers).
- **`audit_event`:** firm A reads 5 lines of other firms. Update and delete are refused by AUD-1a.
- No app route does any of this today: all writes take the firm from context. What is missing is defence in depth, owned by CS-W3 and AUD-4 as the list says.
- Severity: Minor, documented by design.
