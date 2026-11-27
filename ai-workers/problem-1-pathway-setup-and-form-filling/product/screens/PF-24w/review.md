# PF-24w review: the environment setting fails closed (PR #2001)

Reviewer (Opus, P-303), reviewer only (no breaker: no money, schema, permissions or new screen). Reviewed commit **ff64a4d5e** on `claude/nifty-sagan-q6u4k3`. `main` has moved 8 commits past the merge base (FO-3w part 2's records and web files only), and none of them overlap this change.
Read: brief `lead-b-briefs/PF-24w.md` (on `origin/main`), `git diff origin/main...ff64a4d5e`, `config/settings.ts`, `identity/port.ts`, `identity/sample-seed.ts`, the launchers, `features/platform-config.ts`, `health.ts`, `run-suites.sh`, and the PR body.
No screen. The journey test is API and operator only (P-616 (1)): `journey-test-reviewer-2026-11-16.md`. I used my own ports 4610-4619 and never touched :4400. Live AI was off, cost US$0.

## What I ran (shell with `PLATFORM_ENVIRONMENT` unset)
* `check_pf24w_environment.ts 4610 rv24w`: **23/23**. `check_pf24_secrets.ts 4613 rv24`: **84/84**.
* `isolated.sh rvpf4 4618 start PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on` followed by `check_pf4_identity.ts 4618`: **119/119**. The same for pf4b on 4617: **55/55**.
* In-process suites that reach the loader or delete the setting, all exit 0: pf6b 29 · pf12 100 · features_registry 27 · pf21v 54 · pf21w 83 · pf5 53 · pf14 92 · pf23w 31 · csc1 55 · fo3m 14 · fo3sa 39 · fo3sr 29 · pf6r 17 · pf19b_sending 40 · pf19b_mail 28 · pf25 68 · pf3 75 · pf21 107.
* Demo reset, each on its own isolated copy (:4612): `check_d1_reset_to_six` **25/25**, `check_s7_reset` **4/4**.
* `tests/qa/check_r16_deny_sweep.ts` on isolated copy `rvr16` :4616: it **crashes before its first check** (ConfigRefused, see M1). With `PLATFORM_ENVIRONMENT=local` it passes **9/9**.
* `typecheck.mjs`: PASS (15 known errors, 0 new). `graph.mjs --check`: G1 0 · G2 0 · G4 0 · G5 0.
* `check_qa_s2_probe.ts` fails to import on `main` too, as the builder says: `engine/twin.ts` has no `screenMapProposals` (`git show origin/main:` gives 0 hits). This is unrelated.
* CI at ff64a4d5e: the shard, types and skeleton jobs are all `skipped`. Only pr-rules, guards, guard and module-cards ran. **DW7's CI part has not been shown yet.**

## Mutations (a scratch worktree; each one put back afterwards)

| Mutation | Effect on `check_pf24w_environment.ts` |
|---|---|
| `\|\| "local"` put back in the loader | DW1 fails twice (unset and blank) |
| The stand-in rule taken out of the loader | DW3 fails, for production and for test |
| `identityConfig` reads `env.PLATFORM_IDENTITY` directly | DW4 fails: the scan and "set after load" |
| `sample-seed.ts` reads `process.env.PLATFORM_SAMPLE_SEED` | DW4 fails: the scan and "set after load" |
| `platformConfig()` no longer caches | The suite goes red with an uncaught ConfigRefused at :187. It fails, though not on a named line. |
| The refusal echoes the value | DW5 fails |

None of the cases is a tautology.

## Spawn points: my own grep
I ran `grep -rln` for `src/main.ts`, `container-entry`, `restart-api` and `isolated.sh` over `studio/`, `prototype/tests`, `product/tools`, `.github` and `.githooks`. I then grepped every test for the in-process calls `registerFeatures(`, `platformConfig(`, `identityConfig(`, `identityPortFromConfig`, `runtimeSignUpPorts`, `sampleSeedDecision` and `seedSampleOnStart`.
* **Start main.ts:** `start.sh` (exports `local`), `tools/restart-api.sh`, `tools/isolated.sh` and `deploy/container-entry.mjs`. The entry file gets its environment from `compose.test.yml` (now `local`) or from PF-8b's task; the Dockerfile sets nothing, which is correct because it fails closed.
* **Tests that spawn main.ts:** `check_pf12_walls`, `qa/check_qa_s2_probe`, `check_pf24_secrets` and `check_pf24w_environment`.
* **CI:** `ci.yml` and `nightly.yml` start the API only through `run-suites.sh`, which uses `start.sh` and `isolated.sh`. `demo-update.yml` uses `start.sh`. `skeleton.yml` uses compose. Its `docker run --entrypoint id` does not start the app. **The builder is right that no `.github` line is needed.**
* **In-process:** pf4 and pf6b are fixed in this PR; features_registry uses temporary folders; pf5 passes its configuration explicitly. **Missed: `tests/qa/check_r16_deny_sweep.ts:35`** (M1: `registerFeatures` on the real `features/` loads `platform-config.ts:8` `platformConfig()`) and the `seed-sample-firms.ts` command-line run, line 106 (m3).
* `tools/new-machine.sh:215` calls `restart-api.sh`, which sets `local` itself, so it is covered.

## Done when: one line each

| Case | Ticked | Evidence |
|---|---|---|
| DW1 | yes | `{}` and `"  "` are refused, naming `PLATFORM_ENVIRONMENT` and the three values; `local` loads. Mutation 1 turns it red. |
| DW2 | yes | A bare spawn exits 1 in 1.7 s, the port is checked closed, and the output names the setting. `local` gives ready 200. |
| DW3 | yes | `local` + `local` starts and the stand-in's door answers. `production` and `test` with `local` are refused, with every other setting complete. |
| DW4 | yes | The source scan has a positive control. Values set in `process.env` after the load change nothing. |
| DW5 | yes | `sk_live_x` gives "local, test or production" with no `sk_live` in the message or `inspect`. Unknown identity or seed values are not echoed either. |
| J-15 W1 | yes, with m1 and m2 | Start fails closed. With `test` and every required secret it starts. 16 names are read once at start and 0 times over 10 requests. The log holds no seeded value. |
| DW7 | **no** | The local suites and the demo reset pass. `qa/check_r16_deny_sweep` breaks (M1), and CI has not run. |

**The known point.** Excluding `DATABASE_URL` from the J-15 W1 count is correct. `core.ts` reads it, and so does Prisma. `settings.ts:164-168` records this, and `core.ts` is outside this row. J-15's "read once" therefore holds for every setting except `DATABASE_URL`, and the PR should keep saying so.
Excluding Node's copy of the environment for a child process is also correct: copying the environment into a child is not the app reading a setting. **But the NOTE's claim is wrong** (m1).

## Findings
**M1 (Major): the R1.6 deny sweep can no longer run as written.**
* Where: `tests/qa/check_r16_deny_sweep.ts:22,35`.
* What happens: run by its own usage line (lines 12-14) from a shell without the setting, it throws `ConfigRefused: … Missing required setting: PLATFORM_ENVIRONMENT` before its first check (0 PASS). With `local` it passes 9/9.
* Why CI misses it: `run-suites.sh` runs only `tests/check_*`, so CI green will not catch it. This is the in-process case the brief asked me to verify; the builder fixed pf6b the same way but missed this one.
* Fix: add `process.env.PLATFORM_ENVIRONMENT ??= "local";` before the `features.ts` import at :22 (one line, as in pf6b), and add the file to the PR's spawn-point table. The test is the sweep itself, run with the setting unset.

**m1 (Minor): the NOTE and PR Question 1 describe a leak that does not happen.**
* Where: `check_pf24w_environment.ts:261`.
* What the code does: `health.ts:21` runs `gitSha()` in `HealthService`'s field initialiser. That is Nest's dependency injection, which runs after `registerFeatures` → `platform-config.ts` has scrubbed the secrets. It is not module load.
* What I measured: a preload of my own on a `test` copy (:4612) saw git receive only the 6 non-secret settings: `PLATFORM_ENVIRONMENT`, both Cognito ids, `PLATFORM_SES_REGION`, `PLATFORM_ZOOM_CLIENT_ID` and `PLATFORM_SECRET_BOX_KEY_VERSION`. No secret reached it.
* Fix:
  * Reword the NOTE and withdraw Question 1, so no needless follow-up row is opened.
  * Better: make the preload assert that no `SCRUBBED_FROM_ENV` name is among the copies, so a future early spawn fails the test.

**m2 (Minor): J-15 W1 does not prove the copy ran as `test`.**
* Where: `check_pf24w_environment.ts:255-260`.
* The gap: `local` also reads every `SETTINGS` name exactly once. So if `isolated.sh`'s own `local` ever won over the caller's value, every J-15 W1 line would still pass. I checked the order by hand: `isolated.sh … start PLATFORM_ENVIRONMENT=test` with no secrets is refused, naming 11 missing settings.
* Fix: have the preload record the `PLATFORM_ENVIRONMENT` value it read (it is not a secret) and assert `test`.

**m3 (Minor): the seed command's usage line no longer works on its own.**
* Where: `api/src/platform/seed-sample-firms.ts:10`.
* What happens: its usage line `tsx api/src/platform/seed-sample-firms.ts` now refuses unless the shell sets the setting, because line 106 calls `platformConfig()`.
* Fix: make it `PLATFORM_ENVIRONMENT=local tsx …`. This is one line outside the touch list, so list it for the Lead.

**Notes (no fix asked):**
* `restart-api.sh:11` always sets `local`, so a caller's exported value does not win there; only `isolated.sh` lets the caller win. That is fine for its two callers, `start.sh` and `new-machine.sh`.
* Touching the five existing suites is the minimum the new rule forces, and Question 2 asks the Lead about it openly.

## Could not check
* CI shards (skipped at this head).
* `start.sh` on :4400 (the rules forbid it; the builder reports 200).
* The compose stack (no Docker here).
* PF-8b's task definition (not built).

**Journey score: 8.5 / 10, pass** (`journey-test-reviewer-2026-11-16.md`; error recovery ½ because of M1).

**Verdict: Block** (request changes). Fix M1. Fix m1-m3 or list them in the PR. Re-review reads only the diff.

## Re-review at cc8f6d05e (P-277: diff only)
I read only `git diff ff64a4d5e..3f461d3b6`, which touches 3 files and 11 lines. `3f461d3b6..cc8f6d05e` adds only this file and the journey-test file, so there is no code change after 3f461d3b6. I ran everything with `PLATFORM_ENVIRONMENT` unset, on my own ports.

| Finding | Fixed? | Evidence |
|---|---|---|
| M1 | yes | `check_r16_deny_sweep.ts:22` sets `??= "local"` before the `features.ts` import. Run by its usage line (copy `rvr16b` on :4616): **9/9**. |
| m1 | yes | The NOTE now says that names, not secrets, are copied. A new fail case asserts that no secret setting (DATABASE_URL aside) reaches a child process's environment; it matches what my own preload saw (6 non-secret names). Small leftover: the preload's comment still says "reported, not asserted". |
| m2 | yes | The preload records the value main.ts starts with, and a new case asserts `test`. That case would turn red if `isolated.sh`'s `local` won. |
| m3 | yes | `seed-sample-firms.ts:10` now reads `PLATFORM_ENVIRONMENT=local tsx …`. |

**Runs:** `check_pf24w_environment.ts 4610 rv24w2` gives **25/25**. `typecheck.mjs` passes (15 known errors, 0 new).

**Still open, outside my verdict:** CI's shard, types and skeleton jobs are still `skipped` at this head. Green CI is a separate condition before the label (P-277, P-385), and DW7's CI part has to be pasted once it runs.

No Blocker or Major is open.

**Verdict: Approve** cc8f6d05e4c4a93607cb3ecc25bebce2e2b6446e (code as reviewed at 3f461d3b600dfc708b6442b7bf015a5c3d317866).

## Re-review (diff-only, supersede #2635) at 2f0a166efbae85a3afcd18c8ca95c1022354d0a0
Reviewer (Opus, P-303), diff only. PR #2635 re-lands #2001 (9 commits cherry-picked with `-x` onto `origin/main` d3d014857). I checked two things: (1) how the conflicts were resolved, and (2) code that landed on `main` after #2001 last merged it and now runs into the fail-closed setting. I did not re-review the PF-24w parts approved above. I ran no server and never used :4400. I read from the shared tree using `git show` and `git diff` only. My one suite run used a scratch database named by its process id, which I dropped afterwards. Cost US$0.

### 1. Conflict resolution: clean
I compared `git diff 39c1203cd 42372844d` (#2001's net change; 39c1203cd is the last `main` that #2001 merged, and it is an ancestor of today's `origin/main`) with `git diff origin/main 2f0a166ef`, ignoring index lines and hunk headers. Everything outside the five files is byte-identical, which includes `settings.ts`, `port.ts`, all of the test edits, compose, `restart-api.sh` and the runbook.

| File | Result |
|---|---|
| `studio/start.sh` | Main's `PLATFORM_SAMPLE_SEED` and `PLATFORM_IDENTITY` defaults are kept. `export PLATFORM_ENVIRONMENT=local` comes after them (start.sh:18). Nothing was dropped. |
| `studio/tools/isolated.sh` | Line 88 has `PLATFORM_ENVIRONMENT=local` before `"$@"`, so a caller's argument still wins, and keeps main's `PLATFORM_SAMPLE_SEED="${…:-on}"`. Both comments are kept. |
| `identity/sample-seed.ts` | The hunks match #2001 exactly. Main's AUD-5 `seedSampleSettings` / `seedFirmsAndValues` are intact. |
| `seed-sample-firms.ts` | Main's PF-5t comment block is kept. Only the `Run:` line changed (m3). |
| `platform/MODULE.md` + `MODULE.rows/PF-24w.md` | Main's frozen `Tables.` and `Tests.` lines are unchanged. The invariant line is added (39 lines, under the 40 limit). The fragment is `Tests: tests/check_pf24w_environment.ts`. `module-cards.py tree`: PASS (15 cards). |

### 2. New code on `main` that now fails closed: found, ten suites plus one
After #2001 last merged `main` (0c5dfede5, 18 Nov 07:18), PF-19r part 1 (e33308330, 18 Nov 17:45) made `features/platform-complaints.ts`, `platform-firms.ts`, `platform-staff-read.ts` and `front-office-booking.ts` import `features/platform-messages.ts`. That file calls `platformConfig()` when it loads (`platform-messages.ts:27`). PF-19r part 2 (0948eaf08) also made `person-link.ts` import it. On `main`, an unset setting fell back to `local`. Under PF-24w the import throws `ConfigRefused`.

I probed every `api/src` module that a test or tool imports (220 of them), with the setting unset. Five modules throw on import: `front-office-booking`, `platform-complaints`, `platform-firms`, `platform-messages` and `platform-staff-read`. No other module throws. The spawn points on `main` are unchanged since #2001's sweep: start.sh, isolated.sh, restart-api.sh, new-machine.sh→restart-api.sh, container-entry, and the pf0bp, pf12, pf24, pf24w and qa_s2 tests. No `.github` or `product/tools` line sets or needs the setting.

**B1 (Blocker): ten existing suites crash on import (DW7: "existing suites stay green").**
Eight of them delete the setting themselves, so even a runner that exports `local` cannot save them. The other two never set it, and neither `run-suites.sh` nor any workflow does.

| Suite | Deletes the setting at | Throwing import at |
|---|---|---|
| `tests/check_pf21w_routes.ts` | :30 | :41 platform-complaints |
| `tests/check_pf21i_idempotent.ts` | :34 | :45 platform-complaints |
| `tests/check_pf21j_handler_key.ts` | :31 | :40 platform-complaints |
| `tests/check_pf21v_views.ts` | :30 | :48 platform-complaints |
| `tests/check_pf19r_senders.ts` | :36 | :61 platform-messages |
| `tests/check_fo3a2_feed.ts` | :37 | :50 front-office-booking |
| `tests/check_pf18a_notifications.ts` | :32 | :238 front-office-booking |
| `tests/check_pf4b_session_reads.ts` | :42 | :60 platform-staff-read (unchanged since #2001; the import under it is new) |
| `tests/check_pf19b2_ses.ts` | never set | :336 platform-staff-read, :337 platform-messages |
| `tests/check_pf19r_every_sender.ts` | never set | :170 platform-messages |

* **Failing scenario (run):** `PLATFORM_ENVIRONMENT=local tsx tests/check_pf21j_handler_key.ts` exits 1 with `ConfigRefused { environment: 'unset', missing: ['PLATFORM_ENVIRONMENT'] }` before its first check. I did not run the other nine. Each of them deletes the setting (or never sets it) before importing one of the five modules that the probe showed throwing.
* All ten are in the builder's own `run-suites.sh --only …` list, which is running on this tree now. When I looked, that run had not reached them yet.
* **Fix (test-only):** in each of the eight, add `process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)` straight after the delete loop, as `check_fo3sr_routes.ts:45` already does. In the two that never set it, add `process.env.PLATFORM_ENVIRONMENT ??= "local";` before the import (as in pf23w). Then add all ten to the PR's spawn-point table.

**B2 (Blocker): `tests/check_pf19r_case_links.ts` (new on main, 18 Nov 21:30) crashes at its P-710 block.**
* **:181** calls `seedSampleOnStart({ DATABASE_URL, PLATFORM_SAMPLE_SEED: "on", PLATFORM_ENVIRONMENT: "production" })`. Under PF-24w this goes through the loader, so an incomplete production configuration throws `ConfigRefused` (Missing required settings: PLATFORM_COGNITO_USER_POOL_ID, …) where `main` returned null.
* **:183** passes no `PLATFORM_ENVIRONMENT`, so it throws "unset".
* I reproduced both by calling `sampleSeedDecision` with those exact objects. The throw is uncaught, so the suite ends `STOP` with exit 2 after its DW checks have run.
* **Fix:** the same change PF-24w made in `check_pf4_identity.ts:497-503`. Give :181 a complete production configuration (copy pf4's `PROD`) and add `PLATFORM_ENVIRONMENT: "local"` at :183.

**Not findings:**
* `demo.ts:39` spreads `process.env`, and it only runs inside the app, where a launcher sets the setting. It was present before #2001's review.
* `check_pf5v_signup_mail.ts:66` only reads the feature file as text.
* `journeys/j_109.ts:10` mentions it in a comment.

**Journey score:** I did not walk it again, because the R1.15 behaviour is the same code as reviewed above. So **8.5 / 10 stands for the PF-24w walk**. DW7 is not met at this head (B1, B2).

**Reviewer: Block 2f0a166efbae85a3afcd18c8ca95c1022354d0a0**. Fix B1 (ten suites, one line each) and B2 (`check_pf19r_case_links.ts:181,183`). Then re-run those eleven with `PLATFORM_ENVIRONMENT` unset, and paste the counts. Re-review reads only that diff.

## Re-review round 2 (diff-only) at 11a2ac144b06f01616ed4ce8e439351f405b9e46
Reviewer (Opus, P-303). I read only `git diff 2f0a166ef..11a2ac144`: one commit, 17 code and test files plus `break-report.md` and this file. I used `git show` and `git diff` only, made no checkout and ran no server. I ran in-process probes from scratch scripts outside the tree. Cost US$0.

**A correction to my round 1.** I listed `demo.ts:39` under "Not findings". The breaker showed it is a real regression (break M1): the copy of `process.env` re-runs the loader after the secrets have been scrubbed. I missed it, and it is fixed below.

### Each fix, and whether something fails without it

| Finding | Holds? | Evidence |
|---|---|---|
| B1: the ten suites | yes | Each line comes straight after its delete loop and before the first import that throws: pf21w :31→:42 · pf21i :35→:46 · pf21j :32→:41 · pf21v :31→:49 · pf19r_senders :37→:62 · fo3a2 :38→:51 · pf18a :35→:248 · pf4b :43→:61. The two that never set it use `??=` before the import: pf19b2 :336→:337, and pf19r_every_sender :165, which comes before the feature-loop import at :167 and `platform-messages` at :171. The failing case is round 1's probe and my pf21j run (exit 1, ConfigRefused). |
| B2: `check_pf19r_case_links` | yes | :181-185 now passes a complete `PROD` (the same 13 settings as pf4's `PROD`, every value made by the run). :187 adds `local`. Without the fix, the loader refuses the incomplete production configuration and the unset value; I reproduced both refusals in round 1. |
| Break M1: Demo › Reset 500 | yes | See the probe below. |
| Break m1: an exported value is overwritten | yes, safe | See the m1 section below. |

**The probe for break M1** (scratch script; every required setting generated; `platformConfig()` loads and scrubs; then each call is made):

| Environment | The old copy `{...process.env, SEED:on}` | `sampleSeedDecision(process.env, { forceOn: true })` |
|---|---|---|
| test | throws ConfigRefused | `run:true` (test) |
| production | throws ConfigRefused | `run:false`, "refused: … never seeds" |
| local with a secret-box key | throws ConfigRefused | `run:true` (local) |

* Production still never seeds.
* Without an argument, `sampleSeedDecision()` still says off, so `forceOn` only affects the one demo caller. `demo.ts:39` is now the only caller outside the seed module.

**The failing cases for M1 are real:**
* DW4 calls `forceOn` after `process.env` has been set to `production` with the seed on. If it re-read the environment, it would answer "refused" and fail; reverting to the old code also fails it.
* The `demo.ts` scan has a positive control.
* J-15 W1 now posts Demo › Reset on the test copy, after the scrub. At 2f0a166ef this was the breaker's 500. It still asserts zero re-reads.

**Break m1: launchers keep an exported value.** `start.sh:18`, `isolated.sh:89` and `restart-api.sh:11` now use `"${PLATFORM_ENVIRONMENT:-local}"`, and an argument to `isolated.sh` still wins over both.
* **Can this open anything?** No. An exported value can only be `test` or `production`, which require every secret and refuse the stand-in and the seed, or an invalid value, which is refused by name. Empty or unset falls back to `local`, as before. Compared with the old forced `local`, the change can only make a start stricter.
* **Does CI or a tool export it?** `git grep PLATFORM_ENVIRONMENT` over `.github/`, `product/tools/` and `.githooks/` finds 0 code lines. Neither `run-suites.sh` nor any workflow sets it.
* **Can a test leave a value behind for a launcher?** Tests that set a non-local value in-process (pf24w DW4 sets `production` at :77) delete it at :87, before J-15 W1's `iso()` call. pf24 and pf24w pass `test` to `isolated.sh` as an argument. Other tests set only `local`.

**Runs on this tree.** These are the builder's 92-suite run logs in `studio/var/suites/`, written 21:41-21:45 against the commit at 21:41, all with the setting unset:
* pf24w 28/0, including the three new break-M1 lines as PASS.
* pf24 84/0 and pf4 120/120.
* pf21w 83/0 · pf21i 30/0 · pf21j 19/0 · pf21v 55/0.
* pf19r_senders 27/0 · fo3a2 26/0 · pf18a 72/0 · pf4b 57/0 · pf19b2 44/0 · pf19r_every_sender 21/0 · pf19r_case_links 21/0.

**Minor (no fix needed to approve; list them in the PR or fix them in passing):**
* **m1:** `check_pf24w_environment.ts` J-15 W1's reset accepts any status from 1 to 499. If the demo route ever answered 403 or 404 on a test copy, the case would pass without the seed decision running. Asserting 200 would make it exact.
* **m2:** no check covers break m1 (an exported value wins). Only the argument path is covered (J-15 W1 "the copy ran as test").
* **m3:** with `forceOn`, the `why` text still says `PLATFORM_SAMPLE_SEED=on (…)` even when the setting is off. The demo does not log it, so this is wording only.
* **Note:** on an operator's shell that exports `test`, `start.sh` (which defaults `PLATFORM_IDENTITY=local`) is refused as it should be. But `start.sh` sends `restart-api.sh`'s output to `/dev/null`, so the refusal shows only as a missing "Product Studio" line. This fails closed, and only on a shell that exports the setting.

No Blocker or Major is open. CI green for this head is still a separate condition before the label.

**Journey score: 8.5 / 10 stands** (R1.15's walk is the same code; break M1's reset is now part of J-15 W1 and passes).

**Reviewer: Approve 11a2ac144b06f01616ed4ce8e439351f405b9e46**
