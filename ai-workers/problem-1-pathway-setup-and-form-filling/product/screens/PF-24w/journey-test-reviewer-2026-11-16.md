# PF-24w journey test (reviewer, 16 Nov 2026), commit ff64a4d5e

Skill `journey-test`, reviewer role: the one journey score for this check. PF-24w has no screen, so every journey is an API or operator walk (P-616 (1), J-15).
* The "person" is whoever starts the app: a deployer, a lane builder, or the qa lane.
* I used my own ports 4610-4619 and isolated copies, never :4400. Live AI was off, cost US$0.
* What was seen: process exit codes, console output, port probes, `/api/health/ready`, and a counting preload.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Lane builder: "start my copy" | `isolated.sh rvd1 4612 start` from a shell with no setting | It starts as `local` and serves | Up. `check_d1_reset_to_six` 25/25 and `check_s7_reset` 4/4 on it |
| J2 error | Deployer forgot the setting | `main.ts` started with only PATH, HOME, port and DB | Refused before listening, naming the setting | Exit 1 in 1.7 s, port closed. The line: "Missing required setting: PLATFORM_ENVIRONMENT. Set PLATFORM_ENVIRONMENT to local, test or production (there is no default)." |
| J3 recovery | The same deployer reads the line and sets `local` | The same start with `PLATFORM_ENVIRONMENT=local` | It starts | Ready 200 (DW2 pass, `check_pf24w` on 4610) |
| J4 bad input | Deployer pastes a key, or types `Local` | `PLATFORM_ENVIRONMENT=sk_live_x`, then `=Local` | Refused, value never echoed | "expected local, test or production", with no value shown |
| J5 wrong role | Test environment tries the stand-in | `test` + `PLATFORM_IDENTITY=local`, every secret set | Refused, naming PLATFORM_IDENTITY only | Refused (DW3) |
| J6 deploy (J-15) | Test environment with every secret | `isolated.sh … start PLATFORM_ENVIRONMENT=test` plus 12 generated settings | Starts; each setting read once; log clean | 16 names read once and 0 times over 10 requests; log free of seeded values |
| J7 boundary | Caller's value must reach the app | `isolated.sh rvprec 4611 start PLATFORM_ENVIRONMENT=test`, no secrets | `test` wins over the launcher's `local`, so it is refused | Refused, naming 11 missing settings: the caller wins |
| J8 next lane | qa runs the R1.6 deny sweep by its usage line | `isolated.sh rvr16 4616 start …`, then `tsx … check_r16_deny_sweep.ts 4616` | 9/9 as on `main` | **Crash** before its first check: ConfigRefused in the suite's own process. 9/9 only with `PLATFORM_ENVIRONMENT=local` set by hand (review M1) |

## Data underneath
* **J6, read once:** the counting preload reports each setting name read exactly once at start and never again.
* **Git child:** health.ts's `gitSha` passes git only the 6 non-secret settings (my own preload's stack: `HealthService` initialiser, after the scrub). No secret reaches a child.
* **Values after load:** a value set in `process.env` after the load changes nothing (DW4).

## Break it
| Try | Result |
|---|---|
| Blank value `"  "` | Refused (DW1) |
| Capitalised `Local` | Refused |
| Pasted live key | Refused, not echoed (DW5) |
| Unknown `PLATFORM_IDENTITY` or `PLATFORM_SAMPLE_SEED` | Refused by name, not echoed |
| Five code mutations (default put back, rule removed, direct reads, no caching, value echoed) | Each turns the suite red (review §Mutations) |
| Launcher ordering | The caller's value wins in `isolated.sh` (J7). `restart-api.sh` always forces `local` (note, not a defect) |

## Findings
* **Major:** J8, the qa sweep breaks (review M1).
* **Minor:**
  * The NOTE says secrets leak to git; they do not (m1).
  * J6's test does not assert the copy really ran as `test` (m2).
  * The seed command's usage line (m3).

## Score (QUALITY.md "Journey score"; 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J3, J6 start; J2, J4, J5 refuse |
| Next step obvious | 1 | The refusal names the three values and `deploy/RUNBOOK-secrets.md` |
| Plain words | ½ | The line is plain, but "(PLATFORM_ENVIRONMENT=unset)" reads like a value, and Node prints it inside an 18-line crash dump |
| Feedback and state | 1 | Exits non-zero in 1.7 s; the port never opens |
| Correct data | 1 | Settings read once; no later change takes effect; seed and identity come from the loader |
| Error recovery | ½ | The operator recovers in one step, but the qa lane's sweep (J8) fails with no hint in its usage line |
| Accessibility and screen sizes | 1 | No screen: text-only output, no colour or layout dependence |
| Speed | 1 | Refusal in 1.7 s; copies ready within `isolated.sh`'s start |
| Visual quality | ½ | No screen; the refusal is surrounded by a source excerpt and a stack trace |
| Trust and sources | 1 | Never echoes a value; the leak finder has a positive control; the runbook is cited |

**Score: 8.5 / 10, pass (8 or more, no 0).** Raising it, most valuable first:
* Fix J8 / M1 (error recovery).
* Print the ConfigRefused message alone, without the crash dump (plain words, visual quality). This is PF-24's existing format and outside this row: a suggestion, not a finding.

## Could not test
* A real deploy (PF-8b).
* The compose stack (no Docker here).
* :4400 (forbidden).
* An intended user's unaided walk (D17/D20 stay with the founder).
