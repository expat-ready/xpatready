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

## Round 3 (24 Nov): re-stamp and merge of main, diff only, head d6186236088f2623c5fb9a9ff1ffe544454e09fc

**Scope.** I reviewed only what changed since the last approved head, 7d6a7a8fa (code at db8ee8a8c). The PR's base is now main, since #3189 merged on 23 Nov. Three commits:
- the merge of origin/main, a79e246c6 (18996be2f);
- the re-stamp, 462cac84d;
- a comment-only fix in the migration, d61862360. The coordinator flagged it mid-review, so this verdict is for d6186236.

This round changes no behaviour, so I gave no journey score: the screen and the API are the same as in round 2.

**Checks:**
- **The merge has no hand edits.** `git show --remerge-diff HEAD~1` printed nothing for 18996be2f. Its parents are 7d6a7a8fa and a79e246c6 (origin/main).
- **The PR touches only its own files.** `git diff origin/main...HEAD` lists the same 14 files (818 lines added). I compared the PR's whole added-line patch with round 2's: c62d4bcb3..7d6a7a8fa against origin/main...d6186236. Only these lines differ:
  - the stamp, in `brief.md:78`, `MODULE.rows/PF-21d.md:1` and `check_pf21d_switch.ts:19`;
  - the backticks removed around ports/erasure.ts in the rows file's Entry points line;
  - the one migration comment line.
  The `platform-register.prisma` file differs from 7d6a7a8fa by 108 lines. Those lines all came from main (PF-21b and PF-21c); the PR's own hunk in that file is the same as in round 2.
- **The rename is complete.** The folder `20261123110000_pf21d_switch` became `20261124080000_pf21d_switch` with 100% similarity in 462cac84d. `git grep 20261123110000 -- …/prototype` finds nothing. The new stamp appears only in the migration folder and the three references above.
- **The migration differs from round 2 by one comment line.** Against 7d6a7a8fa's file, the only change is line 79, the PF-8b F4 comment: "(as 20261123100000_pf21b_data_requests)" became "(as 20261123200000_pf21b_data_requests)". That is the folder name #3189's migration took when it merged, and it exists on main. No SQL changed. Before d61862360 the comment named a folder that no longer existed; it now names a real one.
- **The new stamp is unique and the latest.** No other folder uses 20261124080000. It sorts after every migration on origin/main; the newest there is `20261124032000_fo3c2_require_agreement`. The suite measures this itself: "after every one before it (newest before: 20261124032000_fo3c2_require_agreement)", and it applies the migration right after main's on an empty copy and on a demo copy.

**Runs.** All on d6186236, in a scratch worktree, against Postgres 18 on 127.0.0.1:54329. Nothing used :4400.

| Run | Result |
| --- | --- |
| `check_pf21d_switch.ts`, run 1 | 20 passed, 0 failed |
| `check_pf21d_switch.ts`, run 2 | 20 passed, 0 failed |
| `check_pf8b_f4_migrations.ts` | 9/9 passed |
| `check_pf21b_requests.ts` | 27 passed, 0 failed |
| `product/tools/check-module-cards.sh` | exit 0, "module cards: 44 fixtures", no FAIL lines |

**Setup note.** In a worktree, the tracked symlink `prototype/node_modules` points to `../../../.tools/…`, so it does not resolve there. I linked the worktree's `.tools` to the main copy's (untracked, scratch only). The repository is unchanged.

**Findings.** None new. Round 2's open Minors are as before: m3 (no case for the race or for the line sharing the transaction) and m5 (owner-only insert paths and the event `at`). Neither blocks.

**Verdict: Approve** (no open Blocker or Major).

Reviewer: Approve d6186236088f2623c5fb9a9ff1ffe544454e09fc

## Round 4 (eb19e71addc93d02ab6c6f9ba90079ec5432fbc9, diff only, Lead 23)

Scope: AUD-3 (#3209) reached main. The API now refuses to start when an /api/system route our staff call has no firm-data declaration (`api/src/platform/audit/access/declare.ts`, `SystemAccessLines.onModuleInit`). Since the last approved head ba86ad46c the branch has two commits: the merge 92936f39c of origin/main (a26e80b6a), and eb19e71ad, which adds the declarations and the test-list change.

This round changes only declarations, so I gave no journey score. Neither the screen nor the API's behaviour changed.

**Checks:**
- **The merge has no hand edits.** `git show --remerge-diff 92936f39c` (HEAD^) printed only the commit header, no diff. The merge base of eb19e71ad and origin/main is a26e80b6a, which is origin/main's tip.
- **@NoFirmData is true for both routes.**
  - `PlatSwitches.list` reads only `plat_switch_list()`. `set` calls only `plat_switch_set(...)` and `plat_switch_list()`, then writes our staff's own line through `identity.audit` (plat_system_audit).
  - In migration `20261124080000_pf21d_switch`, `plat_switch` has the columns key, is_on, changed_by, changed_at. `plat_switch_event` has id, seq, key, is_on, reason, actor, at. Neither table has a firm or tenant column, and the definers refuse inside a firm's session.
  - The answer holds only the switch key, its name, on/off, changedBy (`staff:`/`seed:`/`system:`) and changedAt. It contains no firm's data and no firm's name.
- **The declarations follow the precedent on main.**
  - Reads of registers that name firms are declared @ReadsAcrossFirms: #3189's `DataRequestController` GET / and GET /:id, and PF-21c's `BreachController` GET / and GET /:id.
  - Writes to ExpatReady's own registers are declared @NoFirmData: `DataRequestController.log`/`move`, and `BreachController.open`/`fromAlert`/`change`.
  - A switch names no firm, so its read is not a cross-firm read. @NoFirmData on the GET matches `SystemIdentityController.me`, and on the POST it matches the register writes.
  - Both reasons are plain words that pass `words()`; if they did not, importing the module would throw.
- **The `check_aud3_access.ts` change is right and minimal.**
  - It imports `features/platform-erasure.ts` and adds its controllers to the start-up list (DW3 pass) and to the opt-out list (m4).
  - It adds `PlatSwitchController.list` and `PlatSwitchController.set` to the reviewed @NoFirmData list, in sorted order, and updates the two test names to mention them.
  - It is a +6/−5 hunk; nothing else in the file changed.
- **Nothing else in the PR changed.** I compared `git diff origin/main...eb19e71ad` with round 3's `git diff origin/main...ba86ad46c`, ignoring index and hunk-header lines. The only differences are:
  - the `NoFirmData` import line in `switches/routes.ts`;
  - the decorators on its two routes;
  - the new `check_aud3_access.ts` hunk.
  The PR is now 15 files (+906 −5); it was 14 files (+899). The extra file and the −5 are the test-list hunk.

**Runs.** All on eb19e71ad, in a scratch worktree, against Postgres 18 on 127.0.0.1:54329 (accepting connections). Nothing used :4400.

| Run | Result |
| --- | --- |
| `check_aud3_access.ts` | 30 passed, 0 failed |
| `check_pf21d_switch.ts`, run 1 | 20 passed, 0 failed |
| `check_pf21d_switch.ts`, run 2 | 20 passed, 0 failed |
| `isolated.sh rv1a 4473 start --ttl 15` | started on :4473 (xr_studio_rv1a) |
| `GET /api/health` | 200 |
| `GET /api/system/switches`, no token | 401 NOT_SIGNED_IN |
| `POST /api/system/switches/platform.data-erasure`, no token | 401 |
| `GET /api/system/no-such-route` | 404 |
| `isolated.sh rv1a 4473 stop` | stopped; database and files removed |

- The `check_aud3_access.ts` result includes the DW3 start-up pass, which now names PF-21d's switches, and the m4 opt-out list, which includes the two PlatSwitchController routes. I ran this suite a second time only to print those two lines; it gave the same result.
- **The real start-up passed with the merged tree.** `onModuleInit` checks every controller in every module, so the start-up assertion passed with PlatSwitchController loaded. The API log shows both routes as Nest route templates (`GET /api/system/switches`, `POST /api/system/switches/:key`). The 404 on the unknown route shows that the 401s came from the real switch routes, not from a catch-all.
- **Setup and clean-up.** As in round 3, I linked the worktree's `studio/node_modules`, `studio/api/node_modules` and `.tools` to the main copy's. I removed the `.tools` link and the worktree afterwards. The repository is unchanged apart from this section.

**Findings.** None new. Round 2's open Minors are unchanged: m3 (no case for the race or for the line sharing the transaction) and m5 (owner-only insert paths and the event `at`). Neither blocks.

**Verdict: Approve** (no open Blocker or Major).

Reviewer: Approve eb19e71addc93d02ab6c6f9ba90079ec5432fbc9
