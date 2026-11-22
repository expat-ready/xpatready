# PF-8b F7 — independent review (PR #3068, runtime lane)

Head reviewed: `d2f6a8eb6e7e65b45ca6dad017221f2968c58965` (branch `claude/runtime-pf8bf7`). Migration-only item: no screen, so the
UI parts of screen-review (D1–D20, BIC table, 1024 px / zoom, graph) are N/A. The journey-test is run as the operator's journey (below).
Reviewer did not build it. PostgreSQL 18.x (`/usr/lib/postgresql/18/bin`), throwaway clusters on 15641, 15645, 15651, all removed after.

**Verdict: Ship after fixes (Changes).** No Blocker. One Major, in the guard, not in the migrations. The ten edited migrations are correct
and safe as written. In the binary of the agent instructions this is not an Approve until M1 is fixed.

## What I ran
| Run | Result |
|---|---|
| `npx tsx tests/check_pf8b_f7_data_walls.ts 15641` | 14/15. The one FAIL is pf18bk's three counts, as the PR says to expect until #3060 merges. 84 parsed walls == 84 forced tables in the db. |
| The guard's audit with #3060's pf18bk (head `0702554`) in its place | 0 unguarded, 20 guarded: the guard turns green once #3060 merges. |
| `check_pf8b_f5_pg18_grants.ts 15651` / `check_pf8b_f4_migrations.ts` | 14/14 / 9/9 |
| Fresh db: up to PF-12 with BYPASSRLS, then **everything after it as a NOBYPASSRLS owner** (empty tables) | 123 applied. Stops at pf18bk with its own "cannot see every support row" message (expected on main). Afterwards 75 forced tables, 75/75 `0_pf12_firm_first` enabled ('O'). This runs the success path of fo7mv ×2, fo7ts ×2 and set_name_unique, which the guard's windows do not. |
| fo3a_set_name_unique as a NOBYPASSRLS owner, hidden duplicates `Normal hours` / `normal  HOURS` / `Normal hours (2)` | Renamed `normal  HOURS (3)`, version 2, one `availability.set_renamed` audit line, FORCE back, gate 'O'. The loop body (not run on an empty db) parses: no variable/alias clash. |
| fo7ts_money_settings as a NOBYPASSRLS owner, hidden `trust_enabled = true` | Stops (23514), migration not recorded, FORCE still true (the rollback undid the lift). |
| qa644 + the F7 migration as a NOBYPASSRLS owner (success path) | Applied. `platform_web_address_allowed('staging')` = f. Both address tables forced. |
| Upgrade: the ten rows set back to their origin/main sha256, the F7 row deleted, deploy again | All ten checksums now equal the files' sha256. |
| Independent sweep: every non-DDL statement in every migration after PF-12, checked for walled-table names, function calls and EXECUTE | No unguarded data statement except pf18bk. `case_firm_backfill()` (csw1) reads platform_firm only through `case_lookup.case_firm_id_of_key` (definer + its own policy), and csk1/aud1a/csnk1 touch only unwalled tables. **The inventory is complete.** |

## Judgement on the block (all ten files)
* **Superuser / BYPASSRLS path:** the IF is false, so the arrays stay `'{}'` and both loops are empty. The only change is that five top-level statements now run inside DO. I found no column named `t`/`lifted`/`walls`/`gated`. Internal names are `pf8b_`-prefixed, and the qualified `t.x` aliases in other blocks do not collide with a scalar variable. CI from empty passes.
* **DML semantics:** the statements are byte-identical apart from indentation. Triggers other than the gate still run (`fo_person_keys`, the set and zone triggers), because DISABLE names only `"0_pf12_firm_first"`.
* **Gate:** `platform_firm_first` is the only trigger that consults the session firm (it is the only trigger use of `platform_session_firm()`). It lets superuser/BYPASSRLS through, so disabling it for the owner reproduces that path exactly. It is safe because ACCESS EXCLUSIVE is held to the end of the transaction, past the ENABLE.
* **Restore:** only tables that were forced, and only gates that were enabled, are put back. An error rolls back the whole DO (seen with qa644 and fo7ts).
* **Existing lines:** the LOCKs, qa644's `lock_timeout` (set before the new ACCESS EXCLUSIVE) and the history→web_address order are kept. `unnest(walls)` keeps the array's order. The `row_security = off` lines are left in place.

## Issues
**Major**
* **M1 — the guard misses common forms of the exact bug it exists to catch** (`tests/check_pf8b_f7_data_walls.ts:50,53,54`). A statement is seen only after `; BEGIN THEN ELSE LOOP $tag$ IN AS`, with string literals blanked and table names matched case-sensitively. I fed made-up migrations to the rule. Each of the following, on a walled table outside any lift, passes as **not flagged**:
  * `IF EXISTS (SELECT 1 FROM "w")`
  * `n := (SELECT count(*) FROM "w")`
  * `IF (SELECT count(*) FROM "w") > 0`
  * `EXIT WHEN NOT EXISTS (SELECT …)`
  * `RAISE … (SELECT …)`
  * `EXECUTE 'UPDATE w …'` / `EXECUTE format('UPDATE %I …','w')`
  * `MERGE INTO "w"`
  * `update W …`

  The repo shows the gap itself: fo3a_set_name_unique's `EXIT WHEN NOT EXISTS (SELECT 1 FROM "fo_availability_set" …)` is not among the 17 "guarded" (it is safe only because it sits in a lifted block). A pre-check written as `IF EXISTS (SELECT …)` is the likeliest next form of breaker M1, and the guard would stay green. The dynamic part does not backstop this: it only covers the hand-picked windows.

  **Fix:** treat any reference to a live walled table in a non-DDL statement (an identifier match, case-insensitive for unquoted names, string literals in DO blocks included) as a data statement. Or widen the lookbehind to `( , = := WHEN EXISTS RETURN` and add MERGE/COPY. Add a self-test for each form above.

**Minor**
* **m1 — windows:** the dynamic windows do not cover fo7mv ×2, fo7ts_money_settings, fo7ts_card_terminal or fo3a_set_name_unique, so removing their lift fails only the text rule. I checked two of them by hand (above). Add windows, at least set_name_unique (it writes) and one stop check.
* **m2 — FK validation under FORCE, a related blind spot (no existing migration affected):** on PG18 a NOBYPASSRLS owner's `ALTER TABLE … ADD FOREIGN KEY` on a FORCE table runs the initial check under the policy. I reproduced it: a violating row was hidden and the constraint was still marked `convalidated = t`. The three cases after PF-12 are harmless: fo7a2:17 and fo7ts_ledgers:43 are new NULL columns, and fo3a_hour_sets:73 follows the lifted backfill. The guard should still flag `FOREIGN KEY`/`VALIDATE CONSTRAINT` on a pre-existing walled table, or the rule's comment should state this limit.
* **m3 — member of the owning role:** a runner that is a member of the owning role but not the owner can run `NO FORCE`, yet RLS still applies to it, so it still reads nothing, silently. Suggestion: `PERFORM set_config('row_security','off',true)` inside the lifted part and `'on'` again before the restore. Any table missing from `walls`, or a non-owner, then fails loudly instead of reading nothing.
* **m4 — restore and schema details:** `ENABLE TRIGGER` always restores 'O', even if the trigger was 'A' or 'R' (all are 'O' today). `tgrelid::regclass::text` and `'public'::regnamespace` assume `public` is on the search path. Today that is true, as it is across PF-12.
* **m5 — locks (information):** on the RDS path every block takes ACCESS EXCLUSIVE. That is unavoidable, because `ALTER TABLE … [NO] FORCE` needs it. In qa644 it now also blocks readers of the address tables, for up to the 5 s timeout. The other nine blocks have no `lock_timeout`, though the same files' DDL already took ACCESS EXCLUSIVE.
* **m6 — nits:** the usage line says "uses port..port+1" but the test uses only `port`. The rule accepts a table named in any ARRAY literal of the block, not only in `walls`. It does not check that the LOCK precedes the lift.

## Journey test (reviewer role; operator persona: whoever runs `prisma migrate deploy` on RDS as a NOBYPASSRLS owner)
These are the runs above:
* J1 fresh deploy goes through to pf18bk.
* J2 hidden rows are backfilled: five guard windows, plus set_name_unique by hand.
* J3 a data check stops with its message and FORCE comes back: qa644, fo7ts.
* J4 an existing db upgrades its checksums.
* J5 the superuser path from empty passes.
* Break pass: guard false negatives (M1) and FK validation (m2).

Scores:
* Task completed 1
* Next step obvious 1 (each stop names its fix)
* Plain words 1
* Feedback/state 1
* Correct data 1 (every hidden row was changed or stopped; m2 is forward-looking only)
* Error recovery 1 (rollback restores FORCE)
* Speed ½ (m5)
* Trust and sources ½ (the guard says "every" and misses forms, M1)
* Accessibility and screen sizes: N/A (no UI)
* Visual quality: N/A (no UI)

**7 of 8 applicable criteria = 8.5/10 scaled; pass, no 0.** Raise it by fixing M1 first, then m1. I could not run this on a real RDS instance: the rds_superuser-member admin was simulated with a NOBYPASSRLS CREATEROLE owner, as the guard does.

Reviewer: Changes d2f6a8eb6e7e65b45ca6dad017221f2968c58965
