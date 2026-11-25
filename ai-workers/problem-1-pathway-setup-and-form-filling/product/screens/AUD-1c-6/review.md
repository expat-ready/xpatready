# Review: AUD-1c part 6 (R1.97; Lead 5 on #2129; SA-11-6): the heartbeat-absence alarm (round 1)

Reviewer (Opus 5.5, independent; did not build it). Head `af57fa17cfaf562017765019c7513077ae78e4c6` (branch `claude/deploy-aud1c-heartbeat`), diff against part 5's `3e877239`: 4 files, +42 -10.
This is not a screen, so concept fit, keyboard and zoom, D1-D20 and BIC-01..20 do not apply (N/A). I did not run the graph tool because it writes GRAPH.md. The CDK is synth only; deploying it and sending one test page are owed under P-782 and P-821, so they are not findings.

## Runs (in /home/user/wt-p56)
* CDK `node --test test/*.test.ts`: 140/140. `check_aud1c_verify.ts`: 22/22. `check_pf0p_ports.ts`: 127/127.
* **A probe on the real line** (scratchpad script, not committed). I ran the real `AuditChainVerifier.pass` with a capturing `JsonLog` and an empty database, then fed the lines it wrote to the CDK's own `matchesFilter(FILTERS.ChainVerifyOk.pattern, …)`:
  * the incremental pass's `audit_chain_verify` line matches;
  * the `full` line and a sliced `full` line do not match.
  * The line comes from `log().trusted` (`log.ts:55-57`, stamp keys first and never overwritten) plus `emf({ Mode }, …, { mode, chains, linesRead, breaks })`: `event: "audit_chain_verify"` and `mode: "incremental"` are at the root.

## Findings
No Blocker. No Major.

## Minor
1. **The "fail" half of the new test is blind.** `deploy/cdk/test/observability.test.ts:194-195` clones the template, sets `notBreaching` and asserts that this differs from the original. That can never fail on its own, and it runs no checker.
   * The pass half (`:189-191`) and the thresholds test (`:172`) do pin `breaching`, `LessThanThreshold` 1, the period and the OK action. So removing the rule does fail the suite.
   * Fix: delete `:194-195`, or run a real finder on the broken copy (for example, extend `alarmFindings` to check `TreatMissingData` for this key).
2. **The test line is hand-built.** `LINES.chainOk` (`:38`) is written by hand, and the contract with `verify.ts` is a regex over source text (`:197-199`). My probe shows the real line matches today. A test that captures one real `pass("incremental")` line, like the probe, would guard against a field rename that the regex misses.
3. **The detection window is wider than "an hour".** With two passes an hour and a 60-minute period, one missed pass does not page (Lead's note). If CloudWatch buckets on clock hours, two missed passes either side of an hour boundary can also go unpaged, so up to about 90 minutes without a heartbeat. The window is labelled Sample; the README (`deploy/cdk/README.md:65`) and R1.97 could say "within about 90 minutes".
4. **Normal operation has not been checked on AWS.** With missing data breaching and a one-period evaluation, whether the first seconds of each period (before the :00 pass's line lands) ever flap to ALARM cannot be checked by synth. Suggest adding "the heartbeat alarm stays OK for 24 h on staging" to R1.97's owed P-782 line (`qa/built/R1.97.md:5`).

## Checked and sound
* **The filter** `{ $.event = "audit_chain_verify" && $.mode = "incremental" }`, value 1:
  * it counts only completed 30-minute passes;
  * a pass with a chain that cannot be checked throws before the line (`verify.ts:80-82`), so it writes no heartbeat;
  * a pass that finds a break still writes it, so a BROKEN chain does not hide the checker;
  * the weekly slices (`mode: "full"`) are left out.
* **The alarm** `xr-<stage>-audit-chain-verify-missing`: LessThanThreshold 1, Sum over 3600 s, 1 of 1, missing data breaching, with alarm and OK actions to the on-call topic.
  * `alarmFindings` checks that both actions are routed and that it reads `ChainVerifyOk` from its filter.
  * It fires when the app, the worker or the log shipping is down (no datapoint means breaching), and when every pass fails.
  * No default value is set on the filter, which is right: a 0 would also breach, but this keeps "no line" and "no pass" the same.
  * At the first deploy it will page until the app logs its first pass. That is expected.
* **The near misses in the filter test:** `chainOkWeekly` and `chainFailed` do not match. If the `mode` term is dropped, `chainOkWeekly` matches and `:145` fails. The TreatMissingData rule is now per alarm (`:171-172`).
* **The records:** the README entry replaces the "Held" line. The lib header and R1.97 match the code, and the counts are right (22/22, 140/140). The owed list names the timed pass and the deployed alarms.

## Journey test (operator journeys, simulated; no UI)
* J1, the app is down: no line arrives, the alarm pages, and it sends OK when passes return. Held, by synth and the probe.
* J2, normal day: two passes an hour, so it stays quiet. Held by design; not checked on AWS (Minor 4).
* J3, one pass fails: no heartbeat for that pass, but the other pass that hour keeps it quiet (Sample window).

Scores (N/A criteria not scored):
* task completed: 1
* next step obvious: 1 (the description names the filter and the log group)
* plain words: 1
* feedback and state: 1 (OK action)
* correct data: 1 (the real line matches)
* error recovery: ½ (window up to about 90 minutes)
* speed: ½
* trust and sources: 1 (SA-11-6, Sample, "synth only")
* accessibility, visual: N/A

**Score: 7 of 8 = 8.8/10: pass.**

**Verdict: Approve.** Minors 1-4 are optional and can ride with part 5's fixes.

## Round 2 (diff only: `af57fa17..55dcc7d5`, head `55dcc7d5cf3157ee04c35fcf5b8b53e2be8f533a`)
* **What changed:** the head merges part 5 (`7b9b28e9`, reviewed in AUD-1c-5 round 2) and adds records text. `git diff af57fa17 55dcc7d5 -- '*/deploy/cdk/*'` is empty, so the CDK lib, test and README are byte for byte the ones approved in round 1.
* **Runs:**
  * CDK `node --test test/*.test.ts`: 140/140, with `node_modules` linked;
  * `check_aud1c_verify.ts`: 24/24;
  * `check_aud2_archive.ts`: 43/43;
  * pf21c via `run-suites.sh`: 49/49.
* **The filter still holds after part 5's change.** The daily deep slices write `mode: "full"`, which `ChainVerifyOk` does not count (round 1 probe; `LINES.chainOkWeekly`). Running deep slices every hour adds no heartbeat lines.
* **Records:** `qa/built/R1.97.md` now owes "the heartbeat alarm staying OK for 24 hours" on staging, which closes my round-1 Minor 4.
  * It still opens with "weekly from seq 1 (the deep check: every chain in full every day …)" and "the weekly slices". That wording is stale; it is part 5's Minor 5 and lives in the same file.
* **Round-1 Minors 1-3 (the blind fail half, the hand-built line, the about-90-minute window):** unchanged. Still optional.

**Journey, round 2:** unchanged, 7 of 8 = 8.8/10: pass.

**Verdict, round 2: Approve.**
