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
