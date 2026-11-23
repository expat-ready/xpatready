# PF-21d part 1a review: the "Data erasure" switch and ErasurePort (reviewer, 23 Nov 2026)

Reviewed head **43e53cec91c11cd2d5d1ad1a063eacfad9749a7e** (branch `claude/sharp-shannon-mdy7sc`, PR #3234), only `git diff c62d4bcb3...43e53cec9` (11 files, +609; base = #3189's head, PF-21b part 3, approved). Spec: `screens/PF-21d/brief.md` decision 1 and "Split of part 1"; the tech lead's acceptance on #3189; SA-11-16 (d), SA-11-28, SA-11-40 (`trace-requirements.py --brief PF-21d`). Compared with #3189's `register/requests/service.ts` and `20261123100000_pf21b_data_requests`, PF-4s's `SystemGuard`, and the holds routes.

**Left out (screen-only):** concept fit walk, keyboard/1024 px/200 % walk, PRODUCT §3-§4 menu words, BIC table, retrofit mapping. This item has no screen (console pages are PF-21rs). D1-D20 are scored only where an API item can be (below).

**Runs (own worktree, Postgres 18 on :54329; :4400 never used):**
- `check_pf21d_switch.ts`: 20 passed, 0 failed, twice (exit 0 both).
- Unchanged and green on this head: `check_pf21b_requests` 27/27, `check_pf21b_holds` 67/67, `check_pf21b_port` 32/32, `check_pf12_walls` 110/110, `check_features_registry` 27/27, `check_aud5_keep_periods` 57/57, `check_pf4s_system_signin` 102/102 (the DW7 flake did not fire), `check_pf8b_f4_migrations` 9/9, `tools/check-port-contracts.mjs` 0 problems (ErasurePort ×2). `typecheck.mjs`: no new type errors. `module-cards.py pr` with the PR body: PASS (the `Card unchanged: api-features` line). `pr-size.sh`: 609 lines, under 800.
- My own probes (a throw-away copy of the suite plus psql on a migrated scratch DB): Admin → 403; Support GET → 403; no token → 401; every refusal writes one REFUSED line with its code (MISSING_PERMISSION, SWITCH_FIELDS, SAME_STATE, NOT_FOUND); 4 parallel "off" calls → one 200, three 409, one event; a bidi mark, an extra field, `"false"` as a string and an array body → 422; a 5,000-character key → 404; xr_app with no firm can call both definers, cannot read either table, cannot take xr_wall_reader; `plat_switch_set` with a NULL key → NOT_FOUND, NULL state → refused (NOT NULL).

## Findings

### Major
**M1. Eraser rule 4 contradicts rule 5 and SA-11-28, and `eraserCases` enforces the contradiction.** `ports/erasure.ts:12-13` says a second call for the same order "answers NOTHING (the job may re-run an order whose result it could not record)", and the contract asserts exactly that (`ports/contracts/erasure-port.contract.ts:58-63`). Part 2's front-office eraser is the brief's own example of KEPT: `fo_person` anonymised in place, money rows kept 7 years by id (SA-11-16 (c), rule 5 at `erasure.ts:14-16`). Called again, it still keeps those rows, so the truthful answer is KEPT again. The contract instead forces NOTHING. In the scenario rule 4 names (the result was not recorded and the job re-runs), the job then sees only NOTHING/ERASED and can close the request COMPLETED. That is the "false COMPLETED" SA-11-28 forbids and rule 5 promises against. Brief test 7 (a module fails, the job retries) is how 1b reaches it. The first case has the same blind spot: "the person's rows gone" (`:52`) does not say whether a kept, de-identified money row counts. Fix, about 4 lines, now, because 1b and part 2 build against this text:
- Rule 4: "a second call erases nothing more: it answers NOTHING, or KEPT again naming what it still keeps; never ERASED".
- The case: keep the first outcome and assert `again.outcome !== "ERASED" && (first.outcome !== "KEPT" || again.outcome === "KEPT")`.
- `EraserHarness.rowsOf`: one line saying it counts rows that still identify the person.

### Minor
- **m1. Reason handling bypasses the house mechanism, against the brief's test list.** Brief test 4 says "without a reason → 400". The route (`switches/routes.ts:18`) has no `@SystemReason()`, which the holds routes use for "a reason required" (`register/holds/routes.ts:18,21`). Instead the service refuses with 422 SWITCH_FIELDS (`service.ts:18-22`), and the suite asserts 422 (`check_pf21d_switch.ts:125`). Side effect, reproduced: a reason of `!!!` is saved (200, the event holds `!!!`), but the guard's `reasonOf` needs a letter or digit, so the ALLOWED line's `reason` is NULL. The event and the trail then disagree on the reason for tripping the kill switch. Fix: add `@SystemReason()` (400 REASON_REQUIRED, the same rule on both records) and record 422 vs 400 in the PR body.
- **m2. Literal invisible bidi characters in source** (`switches/service.ts:21`: U+200E, U+200F, U+202A-U+202E, U+2066-U+2069 typed as raw characters inside the regex). They work (probe: refused), but a source line that hides direction marks is the Trojan-source shape that review tools flag. #3189 writes them as `\u` escapes (`requests/service.ts` `plain`). Fix: reuse #3189's `plain(500, "the reason")`, or use escapes.
- **m3. Rules without a failing test (STANDARDS [M] "a rule's test fails when the rule is removed").** Each removal below still passes the suite:
  - the `FOR UPDATE` in `plat_switch_set` (`migration.sql:66`): no case runs two sets at once (my probe shows the lock holds);
  - the `tx` on the ALLOWED line (`service.ts:47`): the case counts lines but does not prove they share the change's transaction;
  - the REFUSED lines and the Admin role from brief test 4: the case asserts only the 403 statuses (`check_pf21d_switch.ts:126`).
- **m4. The switch definers reuse the register's refusal text.** `plat_data_request_system_only()` (`migration.sql:57,65`) tells a firm session "only ExpatReady's own staff read or work the register of requests made to ExpatReady" when it calls a switch. It also couples the switches to PF-21b's function name. Fix: a `plat_switch_system_only()` with its own words, or accept and note it in the card.
- **m5. Time and insert rules are looser than the change path.** `changed_at` is `clock_timestamp()` from the trigger (`:39`). The event's `at` is `CURRENT_TIMESTAMP` (transaction start, `:24`), and an inserter may set it: as owner I wrote an event dated 2000-01-01. Nothing stops an owner INSERT of a new switch already off with no event (probe: `platform.ghost`, off, no history). These are owner-only paths, the same posture as #3189's events. Fix (small): a BEFORE INSERT trigger setting `at := clock_timestamp()` on events, and refusing a switch born off or with `changed_*` set.
- **m6. Record wording.** The rollback line (`migration.sql:9`) omits the trigger function `plat_switch_kept()`. The contract header says `eraserCases` proves "rules 3 to 5" (`erasure-port.contract.ts:2`), but no case exercises KEPT or its note (rule 5 is only `EraseOutcome.parse`); the suite rightly labels them "rules 3-4". `ports/erasure.ts:2` points to `api/src/platform/erasure/service.ts`, which arrives in 1b.

## What held
- **Walls:** both tables forced RLS with no policy; xr_data has no grants on them (only owner xr_studio). Both definers are SECURITY DEFINER, owned by xr_wall_reader (BYPASSRLS, member of xr_studio), with search_path pinned. EXECUTE is revoked from PUBLIC and granted to xr_data only. The CREATE grant/revoke wraps the hand-over as in PF-8b F4. Each definer refuses a firm session (tested). xr_staff_bypass cannot read the tables (tested).
- **Triggers:** DELETE and TRUNCATE are refused on both tables, an UPDATE on an event is refused, and a key change is refused. CHECKs require a key shape, `changed_by` ⇔ `changed_at`, an actor shape, and a trimmed reason of 1-500 characters. The seed runs before the walls go up. The migration is additive.
- **Change path:** validation, the definer call, the 404/409 mapping and the ALLOWED line all run in one `$transaction`. A refusal writes one REFUSED line after the rollback (as #3189's `change()`). `allowed()` re-checks the key after the guard. `isOn` throws on an unknown key. `migrate diff` is empty. Measured right after itself on empty and demo copies, the shape is the same.
- **Port:** zod-only imports. Registry rules 1-2 are shared through `registerInto`, and fake and registry pass the same 3 cases. The registry is one provider in the single root module, so part 2's features can inject it.

## D1-D20 (API item; 1-5)
D1 4 (SA-11-16 (d) met; M1 is a port-rule gap) · D2 4 (race-safe, one event per change, DB checks; m5) · D3 4 (reuses DSR_KEY, CallLine, system_only) · D4 3 (rules 4/5 conflict, M1) · D5 4 (409 on repeat, parallel calls serialised) · D6 4 (who, when and why on event and line; m1) · D16 3 (pass/fail lines present; m3 gaps) · D18 4 (reason and actor kept, Sample labelled) · D7, D8-D15, D17, D19, D20: N/A (no screen; D17/D20 not walked by an intended user).

Graph note: `graph.mjs` lists `POST /system/switches/:key` under G3 ("no test reaches"). That is a false positive: the suite calls it through the `SW` constant (`check_pf21d_switch.ts:114-120`). The same happens to #3189's parameterised routes.

**Could not check:** CI on GitHub for this head (read only the body and head SHA via the REST API); a real RDS runner (non-superuser owner); a screen (none).

Journey score: **8.5/10** (pass), `journey-test-reviewer-2026-11-23.md`.

**Verdict: Block.** Fix before `review: approved`:
1. **M1 (Major)**: `ports/erasure.ts:12-13` and `ports/contracts/erasure-port.contract.ts:52,58-63`: a re-call may answer KEPT again, never ERASED; say what `rowsOf` counts.

Minor, fix in this PR if cheap, else record: m1 `switches/routes.ts:18`; m2 `switches/service.ts:21`; m3 `tests/check_pf21d_switch.ts:126` and `migration.sql:66`; m4 `migration.sql:57,65`; m5 `migration.sql:24,34-41`; m6 `migration.sql:9`, `erasure-port.contract.ts:2`.

Reviewer: Block 43e53cec91c11cd2d5d1ad1a063eacfad9749a7e

## Round 2 (reviewer, 23 Nov 2026): head db8ee8a8c7b1d4e03ca675ae49ff5061bcbaea85

Reviewed only `git diff 43e53cec9..db8ee8a8c` (one commit: 6 code/test files, +78/-29, plus the round-1 records), in a fresh worktree; :4400 never used.

**Runs:**
- `check_pf21d_switch.ts`: 20/20 twice (exit 0).
- `check_pf21b_requests` 27/27, `check_pf12_walls` 110/110, `check_features_registry` 27/27, `check_pf8b_f4_migrations` 9/9, `check_pf21b_port` 32/32.
- `check-port-contracts.mjs`: 0 problems.
- `typecheck.mjs`: no new errors (15 known).
- `module-cards.py pr` with the PR body: PASS.
- Code and tests against #3189's head: 629 lines.

**Round-1 findings:**
- **M1, closed.** Rule 4 (`ports/erasure.ts:12-14`) now reads "never answers ERASED; NOTHING, or KEPT again". The case (`erasure-port.contract.ts:61-68`) asserts it, and `rowsOf` says kept floor rows are not counted. I ran the case against four stand-in erasers:
  - ERASED→NOTHING and KEPT→KEPT pass;
  - KEPT→NOTHING and ERASED→ERASED fail.
  The rule now fails when it is broken.
- **m1, closed.** The POST is `@SystemReason()` (`switches/routes.ts:18`). No reason, or one with no letter or digit (the `!!!` case and an invisible-only reason), gets 400 from the guard with a REFUSED line, so the event and the trail keep the same reason. Tested at `check_pf21d_switch.ts:126-131`.
- **m2, closed.** The bidi characters in `switches/service.ts:21` are now `\u` escapes.
- **m4, closed.** `plat_switch_system_only()` has its own words. It is owned by xr_wall_reader, EXECUTE revoked from PUBLIC and granted to xr_data, as the register's.
- **m6, closed.** The rollback line names `plat_switch_kept()`. The contract header says rules 3 and 4, with KEPT left to the module's own test. The port no longer points to a file that does not exist.

**The breaker's fixes I checked:**
- **NUL or odd key.** It gets 404 inside the change, so a REFUSED line, and never reaches SQL (`service.ts:44`, tested with `%00`).
- **The answer.** It is read inside the change's transaction, through the definer (`service.ts:51-52`), so it is the state this call left.
- **Registration.** `registerInto` refuses an eraser without an `erase` function, and stores a frozen `{module, erase}` with `erase` bound. My probe confirmed `this` still works and the entry is frozen. The contract proves a later rename does not change the registered name.

**Still open, Minor, as stated by the builder:**
- m3: no case for the `FOR UPDATE` race or for the line sharing the transaction. My round-1 probe showed both hold. The new REFUSED assertion uses `>=`.
- m5: owner-only insert paths and the event `at`.

Neither blocks.

**New issues:** none.

**Verdict: Approve** (no open Blocker or Major).

Reviewer: Approve db8ee8a8c7b1d4e03ca675ae49ff5061bcbaea85
