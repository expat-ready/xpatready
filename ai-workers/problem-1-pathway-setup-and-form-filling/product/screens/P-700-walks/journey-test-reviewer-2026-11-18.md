# Journey test, reviewer: PR #2133 recorded walks (P-700) at d09c8f6cd, 18 Nov

The person here is qa, who starts a recorded walk and judges gate A from what it leaves behind. This is tooling, so the "screens" are the run summary, the artifact folder, `walk.json`, `README.md`, `steps/` and the trace.

I could not walk it on GitHub: run 44318409310 is still queued, and a cloud lane gets 403 on dispatch (P-439). Everything below ran on this machine through `walk.mjs` and the plan step's shell. No app and no copy were started, and no j_6 or j_9 copy.

## Journeys
1. **Main.** qa walks a failing journey and reads the recording. I ran `tsx studio/tests/check_journey_recording.ts`, which walks the fixture.
   * Result: exit 1. walk.json says `1 PASS, 1 FAIL` and names the failed step. trace-1.zip, `001-pass` and `002-fail` shots, steps.jsonl and a README with `show-trace` are all there. The check passed 10/10 in 1.7 s.
   * Held. No video on this machine (known; CI judges it).
2. **Alternate.** qa picks journeys by number or id.
   * Result: `j_6 9` gave j_6, j_9 and the fixture. `j_6 j_6` gave one job. Empty gave every j_*.ts.
   * Held.
3. **Bad input.**
   * `6; rm -rf /`, `$(id)`, `j_06` and `0` were refused with a plain message. `j_7` got "no …/j_7.ts".
   * `*` is answered with "'AGENTS.md' is not j_<n>" (glob expansion). Confusing, but harmless.
   * At the runner, `walk.mjs j_99` and `walk.mjs` with no argument both exit 2 with a usage message.
4. **Error: the journey crashes** (scratch `throw.ts`: a click on a missing button).
   * Result: exit 1, and the screenshot was kept, but **no trace**. walk.json has `traces: []`.
   * **Major** (record.ts:93-94).
5. **Error: the journey stops itself mid-walk** (scratch `exitmid.ts`: `process.exit(2)` with the browser open).
   * Result: 2 more steps ran and were counted as PASS, then a crash, so the exit was **1 instead of 2**.
   * **Major** (record.ts:93).
6. **Recovery: a journey ends without an exit** (scratch `noexit.ts`).
   * Result: exit 0 and the trace was kept.
   * Held.
7. **Boundary: a journey closes its browser mid-run.** This is j_6.ts:197, checked in the code only.
   * Result: the patched `browser.close` traces and closes every context first.
   * Held.
8. **Break it: the out-dir argument.** `walk.mjs j_6 <dir>` runs `rm -rf <dir>` first (walk.mjs:19).
   * Result: `.` would delete the working folder. Not run, read from the code.
   * **Major.**

## Data underneath
* walk.json's counts match stdout's PASS and FAIL lines, except when steps run after an exit (journey 5).
* walk.json's `sha` comes from `GITHUB_SHA`, which a step's `env` probably cannot override. On a PR run it would be the merge commit, not the head sha in the artifact name (Minor, review Minor 1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The fixture walk records and fails as it should; the crash path loses the trace; the CI run is not finished yet |
| Next step obvious | 1 | README.md says how to replay; the run summary names the artifact; the qa skill says how to record a verdict |
| Plain words | 1 | Refusals and summaries are plain (`journeys: 'x' is not j_<n> or <n>`) |
| Feedback and state | ½ | `spawnSync` keeps the Actions log silent for up to 40 min; the summary at the end is good |
| Correct data | ½ | Steps after an exit are counted; the sha may be the merge commit on PR runs |
| Error recovery | ½ | On a crash, walk.json and the screenshots survive and the upload still runs, but the trace does not; the out-dir `rm -rf` hazard |
| Accessibility and screen sizes | ½ | Not a screen. Recordings at 1440 x 900 only; the step board is plain HTML |
| Speed | ½ | The fixture takes 1.7 s; real job times are unknown (run queued) |
| Visual quality | ½ | The step board is legible; the video is not seen (no video on this machine, CI run queued) |
| Trust and sources | 1 | API-only walks are labelled; artifacts are named by journey and sha; the walk refuses :4400 |
| **Total** | **6.5 / 10** | **Below the pass mark of 8** (no criterion at 0) |

## Fixes that raise the score, most valuable first
1. Finish the recording on uncaughtException, unhandledRejection and SIGTERM, and add a crashing fixture. This raises task completed and error recovery.
2. Stop recording steps after `process.exit` and keep its code. This raises correct data.
3. Refuse a non-empty out-dir that is not an earlier walk. This raises error recovery.
4. Stream the journey's output into the Actions log, and take the sha from the checkout. This raises feedback and correct data.

## Not tested
* The GitHub run, its artifacts and the video.
* A real dispatch.
* j_6 and j_9 themselves (not started, as instructed).
* D17/D20 do not apply: this is tooling, with no intended-user walk.

## Round 2: head ba7ac696b, the same journeys walked again here
| # | Journey | Round 2 result |
|---|---|---|
| 1 | Main (check_journey_recording.ts) | 17/17 PASS, run twice |
| 4 | Crash (`throw.ts`) | exit 1, trace-1.zip and the step shot kept: **fixed** |
| 5 | Exit mid-walk, then Playwright clicks (`exitmid.ts`) | exit 2, 1 PASS, trace kept: **fixed** |
| 8 | Out-dir is not a walk's | refused with exit 2, files untouched (R5): **fixed** |
| new | SIGTERM to tsx with record.ts (`hang.ts`) | exit 143, trace and step shot kept |

| Criterion | R1 | R2 | Evidence (round 2) |
|---|---|---|---|
| Task completed | ½ | 1 | Every exit path keeps the trace (R3, R4, SIGTERM test) |
| Next step obvious | 1 | 1 | Unchanged |
| Plain words | 1 | 1 | The new refusals are plain ("is not empty and holds no earlier walk") |
| Feedback and state | ½ | 1 | Output streams into the log as it happens |
| Correct data | ½ | 1 | Nothing after an exit counts; WALK_SHA is the head sha |
| Error recovery | ½ | 1 | Crash, exit and TERM all finish the recording; the out-dir guard |
| Accessibility and screen sizes | ½ | ½ | Unchanged (not a screen; 1440 x 900 recordings) |
| Speed | ½ | ½ | The check takes 6.9 s; CI job times still unknown |
| Visual quality | ½ | ½ | The video is still not seen anywhere |
| Trust and sources | 1 | 1 | Unchanged |
| **Total** | **6.5** | **8.5 / 10** | **Pass** (8 or more, no criterion at 0) |

Left open in round 2 (Minors, review.md):
* a recorder fault is reported as a journey crash;
* two closes of the same context at once;
* stdout and stderr chunks are mixed in one log;
* the CI self-test no longer checks `002-fail`;
* R6's temporary j_999.ts sits in the tracked folder.

Not tested: walks run 44320843067 on ba7ac696b, which is pending; the video.
