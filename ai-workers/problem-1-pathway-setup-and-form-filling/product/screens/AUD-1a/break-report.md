# AUD-1a break report (breaker, 16 Nov 2026)

**Target:** branch `claude/upbeat-planck-5h4zoh`, commit `061823ebc` (PR #2003). The later head `25c67eeb6` changes one comment line in `audit.prisma`, so every result below holds for it too. **Spec:** `build-lead-c-briefs/AUD-1a.md` (approved) over `design/briefs/AUD-1a.md`. **Where:** isolated copy `brk_aud1a` on :4609 (`PLATFORM_SAMPLE_SEED=on`), DB `xr_studio_brk_aud1a`, plus scratch `xr_studio_brk_aud1a_m1` (dropped). Every attack ran as `xr_app` unless it says otherwise. US$0, no AI. The copy is stopped.
**Scope:** schema only, no route. Keyboard, 1024 px, 200 % zoom, uploads, reload/back and the screen budgets do not apply. Volume was measured on the reset only.
**Note:** at 16:24 UTC another session left uncommitted edits in this checkout: `migration.sql` (a "review M1" fix that falls back to `detail.firmId`) and `check_aud1a_insert_only.ts`. I ran nothing against them. My copy started at 16:20 on `061823ebc`'s migration.

## Findings

**B1 (Blocker): suites write actor words the mapping does not know, so "Done when" fails.** The brief asked for a re-measure of `api/src`. The tests' own words were never checked: `test`, `check`, `check:pf21v`, `force-audit-failure`. After the migration, `aud_event_fill` refuses them. I ran each suite on the branch (`tsx --tsconfig studio/api/tsconfig.json studio/tests/<suite>.ts`):
* `check_pf3_platform_schema.ts` (named in Done when): **74/75**. "PF-3 fail: a forced audit failure rolls the setting change back" fails. `aud_event_fill` fires before the test's own `pf3_force_audit_fail` trigger and raises `audit line refused: the actor word 'force-audit-failure'…`, so `/pf3 forced audit failure/` never matches (`tests/check_pf3_platform_schema.ts:187-190`).
* `check_pf4_identity.ts` (named in Done when): "PF-4 pass (m10): IANA's own spellings are accepted" fails. `zone()` writes with `by: "check"`, the insert is refused, and the error is swallowed to false (`tests/check_pf4_identity.ts:459-462`). Part B was not run: it needs its own :4541 copy.
* `check_fo2_leads_prospects.ts` stops at 44/45 (`'test'`). `check_fo5_retainers.ts` stops at 114/115 (`'test'`). `check_fo2v_lead_visibility.ts` stops after 2 checks (`'test'`, line 51). `check_pf6b_permission_rules.ts` stops at 19/20 (`'check'`, line 200). `check_pf21v_views.ts` crashes (`'check:pf21v'`).
* Even past its actor word, `check_fo2v_lead_visibility.ts:101,105` runs `update audit_event set at = at - interval '11 minutes'`. The trigger now refuses that even for the owner.
* The CI shard on `061823ebc` was **skipped**, so CI has not caught this.
* Risk I could not check (the demo DB is off limits): a long-lived database holding a `test` or `check` line fails `migrate deploy` (P3018, see H-mig). The demo update would then stop.

**M1 (Major): the app connection can make every `platform-audit` line deletable, including a real firm's, and the real demo reset then deletes them.**
* Why it works: the trigger trusts `workspace` existence and `workspace.key` (`migration.sql` ~96-99). `xr_app` holds `UPDATE, DELETE` on `workspace` (`xr_data=arwd`).
* The firm rule protects nothing written after the migration. The platform adapter does not fill `firm_id` (`api/src/platform/audit/audit-event.ts:30`). Seen: the seed's `system:firm-created` lines and my `staff:acme-owner` line all have `firm_id` null.
* Steps:
  1. As owner, add firm `acme-real` (not Sample).
  2. As `xr_app`, insert its `platform-audit` line, written the way the adapter writes one.
  3. As `xr_app`: `delete from workspace where key='platform-audit'` (no setting) → `DELETE 1`.
  4. `POST /api/demo/reset {"confirm":"RESET"}` → **201**. All 5 platform lines are gone, the `acme-real` line too (`count = 0`). P-571 (1) says "never a firm's production line or a platform-audit line".
* Same result inside one transaction: `UPDATE workspace SET key='demo-x' WHERE key='demo'; UPDATE workspace SET key='demo' WHERE key='platform-audit'; set_config(...,'on',true); DELETE … platform lines` → `DELETE 2`. The `delete from workspace` alone → `DELETE 2`.
* The PR's own `check_pf0p_ports.ts:291,299` now runs exactly that `delete from workspace where key='platform-audit'`, leaving orphaned platform lines for the next sweep. That is its scratch DB, so no harm there, but it shows the path.
* Reading only (not run): the uncommitted fix still lets a platform line with no `firmId` (for example `system:check`, a global line) be swept once its workspace row is gone, because `coalesce(…) IS NULL` returns it.

**m1 (Minor): one line the sweep may not delete silently blocks the whole sweep.** The `audit_event` sweep is a single `DELETE … WHERE NOT EXISTS(...)`. One refused orphan line (a non-Sample or unknown `firm_id`) aborts the whole statement. `catch { blocked.push(t) }` swallows the error and the reset answers 201. Seen: 3 orphan lines stayed after a reset (`api/src/demo.ts:596-599`).

**m2 (Minor, latent until AUD-1b fills firm_id):** a demo-workspace line with `firm_id = gen_random_uuid()` (unknown firm) makes `POST /demo/reset` answer **500 "Something went wrong on the server"**, and every later reset does the same. Only the owner disabling the trigger clears it. The refusal follows the ruled exception; the problems are the dead end and the generic message (STANDARDS §6 plain errors).

**m3 (Minor): an explicit `actor_type` skips the mapping.** `aud_event_fill` checks only `IF NEW.actor_type IS NULL`. Both inserts went through:
* `insert … (actor, actor_type) values ('totally-unknown','OUR_STAFF')` → `INSERT 0 1`.
* `('user-P','SYSTEM')` (a client recorded as system) → `INSERT 0 1`.

The brief: "the fill trigger refuses an insert whose actor word it does not know". No writer passes `actor_type` today; AUD-1b will.

**m4 (Minor): an id that is only whitespace passes.** `aud_event_actor_type('staff: ')`, `('staff:'||chr(10))` and `('staff:x'||chr(10)||'DROP')` each → `FIRM_STAFF` (the `.+` regex, `migration.sql` ~37-40). The port is stricter: `ports/audit.ts:13`, `^(staff|system|seed):[A-Za-z0-9]…`.

**m5 (Minor): the reset setting is a convention, not a privilege.** All three of these deleted all 103 demo lines (rolled back):
* `SET app.audit_sample_reset='on'` at session level, then `DELETE` in a later transaction.
* `PGOPTIONS="-c app.audit_sample_reset=on"` at connect.
* `set_config(…,'on',true)` in the same transaction.

Only demo-workspace lines are exposed. DW2's "does not carry over" covers only the local `set_config`.

## What held
| Attack (as `xr_app`) | Result |
|---|---|
| `UPDATE audit_event SET summary/firm_id/actor_type/at …` (with and without the setting; after `SET LOCAL ROLE xr_staff_bypass`) | `permission denied for table audit_event` |
| `TRUNCATE audit_event`; `… CASCADE` with the setting; `TRUNCATE workspace CASCADE` | permission denied |
| `ALTER TABLE … DISABLE TRIGGER aud_event_no_change` / `ALL`; `DROP TRIGGER`; `CREATE RULE`; `ALTER … OWNER TO xr_app` | `must be owner` |
| `GRANT UPDATE ON audit_event TO xr_app` | "no privileges were granted" |
| `CREATE OR REPLACE FUNCTION aud_event_no_change / aud_event_actor_type` | permission denied for schema public |
| Temp table `workspace` to shadow the trigger's lookup | no effect (`search_path` pinned, `pg_temp` last) |
| `SET session_replication_role = replica` (session and `SET LOCAL`) | permission denied |
| `COPY audit_event … FROM STDIN` with an unknown word | fill trigger refuses it |
| `COPY … FROM PROGRAM` | refused |
| `WITH u AS (UPDATE …)` | permission denied |
| `WITH d AS (DELETE …)` without the setting | trigger refuses |
| `INSERT … ON CONFLICT (id) DO UPDATE`; `MERGE … UPDATE` | permission denied |
| `MERGE … DELETE` without the setting | refused |
| Delete a demo line without the setting | refused |
| Delete `platform-audit` lines with the setting (workspace intact) | refused |
| Delete a line of an existing non-demo workspace (`firm-prod`) with the setting | refused |
| Setting value `'ON'` or `'true'` | refused |
| Rename a real firm to `sample-solo` (via `xr_staff_bypass`) | `platform_firm_key_fixed` refuses |
| Delete `sample-solo` and re-insert the real firm's id under its key | FK RESTRICT from `platform_subscription` |
| A real firm's line under a workspace renamed `demo` while `firm_id` is set | refused |
| Actor words `USER-A`, `user-a`, `' user-A'`, `'user-A '`, `user-D`, `user-Z`, `staff:`, `Staff:x`, `STAFF:x`, `' staff:x'`, `person:`, `System`, `SYSTEM`, `'system '`, `system:`, `Rules`, `seed:`, `seed`, `''`, `'  '`, `staffx:a` | each NULL, so an insert is refused, naming the word (`''` tried end to end) |
| Mapped words in `api/src`: `user-A/B/C/O/R/T/S/P/Q`, `staff:<id>`, `person:<id>`, `system`, `system:<door>`, `rules`, `seed:<row>` | all mapped. Every literal and built actor (`actorWord`, `writerOf`, `RESET_ACTOR="system"`, `x.createdBy`, `by`) traces to these |

Further checks that held:
* **H-mig (migration on unknown words):** `prisma migrate deploy` with lines `test`, `check:pf21v`, `user-A` → P3018, `aud1a: 2 audit actor word(s) have no actor type: 'check:pf21v', 'test'`. Nothing left behind: no enum, column or `aud_event_*` function. `_prisma_migrations` marks it failed (it needs `migrate resolve` before a retry).
* **Real demo reset as `xr_app`,** with a demo line carrying `sample-firm`'s `firm_id`: **201**. The demo was emptied to the reset's one line and the platform lines were kept (3 = 3).
* **The PR's own suite** `check_aud1a_insert_only.ts 4609 xr_studio_brk_aud1a`: **31 passed, 0 failed**.
* **Volume:** 100,000 demo lines (inserted through the fill trigger in 1.23 s). Delete with the trigger 1.08 s, without it 0.11 s (owner, rolled back). The full reset took 1.45 s, 201.
