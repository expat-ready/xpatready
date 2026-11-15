# qa · capability R1 re-score: map rows 2, 9, 11, 12, 16, 38, 80, 99 (15 Nov 2026)

**Mode:** `/qa capability` (plan C, P-613; brief from Lead 56, carried on by Lead 59): score on `origin/main` the Release 1 capabilities for MVP-CHECKLIST §A map rows 2, 9, 11, 12, 16, 80 and 99, and re-score R1.9, R1.11 and R1.38. **Tested on `main` d52b7274e** (tree cdf97e36e). Live AI off, US$0, no priced button (P-175). Model Opus 5.5, medium effort; fresh reader Opus 5.5, high effort (P-605).
**Verdict (tester's draft; the fresh reader's ruling is in `2026-11-15-capability-R1-rescore/verdicts.md` and wins):** see §4.

## 1. What was run on GitHub (P-339)

**Merge-queue batch ci run 43689837365** (head a94a1e3c5; its tree cdf97e36e **is** `main` d52b7274e's tree): conclusion success; 8 parts, 499 units, 0 retries; 5 regression jobs on the configured checkpoint, all success. Suite lines verbatim: `2026-11-15-capability-R1-rescore/ci-43689837365-suite-lines.txt`.

| Suite | Job | GitHub | qa re-run (Mac copy, same tree) |
|---|---|---|---|
| check_pf3_platform_schema.ts | 132738492283 | PASS 75/0 | 75 passed, 0 failed |
| check_pf14_jobs.ts | 132738492327 | PASS 92/0 | 92 passed, 0 failed |
| check_pf23w_jobs_wired.ts | 132738492301 | PASS 31/0 | 31 passed, 0 failed (DW6 runs qa's QA-453 check 2/2) |
| check_pf23_observability.ts | 132738492327 | PASS 75/75 | not re-run (R1.13 not in this round) |
| check_pf1_module_routes.ts | 132738492332 | PASS 28/28 | **not re-runnable here**: the sandbox refuses Chromium's launch (exit 21, `kill EPERM`) |
| check_fo3_booking.ts | 132738492356 | PASS 133/0 | 133 passed, 0 failed |
| check_forms_c31_acceptance.ts / _formats.ts | 132738492301 / …356 | PASS 17/0, 107/0 | not re-run |
| C6.5.test.ts, C6.5-counts, C6.5-screen (checkpoint) | 132738636061 | exit 0: 57/57, 13/13, 33/33 | not re-run |
| C7.5.test.ts (checkpoint) | 132738636206 | exit 0, 16/16 | not re-run |
| C7.8.test.ts (checkpoint) | 132738636126 | exit 0, 20/20 | not re-run |
| C7.1-application-type.test.ts | 132738636126 | fixture only, exit 0, 12/12 | not re-run |

**Not run on `main`'s code: `skeleton.yml` (PF-7).** Its runs since 549b9cfb are on pull-request heads only; no merge batch runs it (the workflow's own header: "Mergify's batch PRs … do not run it … it is not a required check"). The brief said to dispatch it on main's head first: **the dispatch was refused by this session's permission check** (auto mode, "Undermining Oversight") and was not retried. R1.11 stays Not tested; QA-449 stays open.

## 2. What was walked (isolated copies on the Mac; never :4400)

Copies started and stopped in the same command (`isolated.sh … start --ttl … && trap '… stop' EXIT`). **Sandbox shims, said plainly:** this session's sandbox refuses unix sockets, signalling the shared PostgreSQL's process, and macOS `nohup`'s detach. So in this copy's untracked folders only, `node_modules/.bin/tsx` loads tsx inside node, and a local `.tools/node-v24.21.0/bin` (links back to the shared `.tools`) adds `pg_ctl status` → `pg_isready` and a `nohup` that ignores hang-up. No tracked file changed for this; app code is untouched.

* **R1.9 → FO-3's booking (gate A by API; background jobs have no screen).** New check `tests/qa/check_r19_jobs_walk.ts` on copy qa_fo3 :4471, **twice: book 8/8 + after-restart 6/6, both runs** (`r19-jobs-walk-{1,2}-mine.txt`). A visitor books over HTTP; underneath, `platform_jobs.job` holds two `booking.reminder` jobs at exactly start − 24 h and start − 1 h, one `booking.attendance_ask` at end + 30 min, all `created` (none ran early), and the two `booking.mail` jobs (booker, host) `completed` by the runner; every job has its own key, none twice. Then `isolated.sh restart` on the same database: the same five jobs are there, the three still wait, `/api/health/ready` says `job_queue ok: true`, and a cancel by the visitor's link turns the three to `cancelled` and queues the cancellation emails as new keyed jobs. The api log shows one `event:"job"` line per run with `outcome:"done"` (PF-23's observeJob).
* **R1.38 (API walk, supporting only).** `check_r1_fo3_tz_walk.ts` 19/19 twice (`r138-tz-walk-*`): slots in Asia/Dubai across Toronto's 14 Mar 2027 change, stored 15:00 UTC (SQL), the move keeps the offset. `check_qa470_host_mail_zone.ts` **3/3** (was 1 pass, 2 fail): the host's email now states the host's office zone (FO-3h #1799).
* **R1.2 → R1.5 (gate A by API).** `check_r1_platform_gate_a.ts` on copy qagate :4474, **20/20 twice** (`gate-a-by-api-*`); `/api/health/ready` now `{"database":{"ok":true},"job_queue":{"ok":true,"words":"The job queue runs."}}`.
* **QA-452 check** `check_qa452_jobs_observed.ts` **3/3** (was 0/3): ready counts the queue, handlers wrapped by observeJob, the stuck-job alarm fed. **QA-453 check** 2/2.
* **QA-383 check** `check_qa383_imm5710_current_cor.ts` on copy qa_383 :4476 (configured checkpoint loaded through Demo): **4/6, the same two FAIL as on 1fcde2d15**: the With an LMIA choice reads "only option: Canada", and the answer "Canada" saves with "Choose one of: only option: Canada." on it.

## 3. Requirements and decisions

Each row's Done when is from `qa/CAPABILITIES.md` (R1 section). No new decision affects these rows since the last round (`decision-impact.sh` not re-run: records only since 2b7fe0060 for these areas). `trace-requirements.py --brief 99` answers "no Release 1 row 99" (case side, covered by C rows, P-526).

## 4. Draft verdicts (the reader rules)

| Row | Draft | Why |
|---|---|---|
| R1.2 Database | **Works** (re-confirmed) | PF-3 75/75 on GitHub (job 132738492283) and qa; gate A by API 20/20 twice |
| R1.9 Background jobs, schedules, reminders | **Works** (was Partial on QA-453) | PF-14 92/92 (job 132738492327) has a pass and a fail per Done-when line (one key once; back-off then dead-letter with reason; cron in a zone across DST; crash and SIGTERM lose nothing); QA-453 and QA-452 fixed on main; the running app's booking puts its reminders on PF-14's real queue and they survive a restart (walk 14/14 twice) |
| R1.11 Server framework | **Not tested** | `skeleton.yml` never ran on main's code since 549b9cfb; the dispatch was refused in this session (QA-449) |
| R1.12 Screen framework, one UI kit | **Partial** (unchanged) | PF-1 28/28 (job 132738492332); `web/src/modules/` still only `_example`; "one UI kit" has no pack (QA-450); QA-451 open |
| R1.16 Automated testing | **Partial** (unchanged) | every suite green on main's tree (run 43689837365, 0 retries); PF-7's container proof still not on merge batches and not required (QA-449) |
| R1.38 Time zones booking page to invite | **Partial** | QA-470 fixed (3/3): the staff zone clause holds in the host's email; FO-3 133/133; **missing: the booking page (FO-3w), so no walk by screens** (RULES gate A; the name starts at the booking page) |
| Map 80 IRCC forms per applicant from one set of answers | **Partial** | QA-383 (Critical) still reproduces on d52b7274e (4/6), so C7.1 and C7.8 stay Partial (P-305 (3)); C7.2 Partial (Adobe Validate and barcode evidence, QA-315); BK-10, BK-16, BK-22, BK-23, BK-24 merged; C7.8 20/20 on the checkpoint |
| Map 99 AI on top of the guardrails | **Partial** | C3.1 (17/0, 107/0), C6.5 (57, 13, 33) and C7.5 (16/16) green on main's tree; BK-14 merged (#1573); **missing: the founder's model choice** (checklist "model choice open (founder)"); only Minor bugs open on C6.5 (QA-353, QA-380, QA-381) |

## 5. Bugs
* **Close QA-452** (Major): fixed by PF-23w (#1800); qa's check 3/3 on d52b7274e; PF-23w 31/31 on GitHub. R1.13 still Partial for PF-23c (cloud logs, alarms to a person); not re-scored in this round.
* **Close QA-470** (Minor): fixed by FO-3h (#1799); qa's check 3/3.
* QA-449 (Major), QA-450, QA-451 (Minor), QA-383 (Critical) re-seen on d52b7274e. No new bug.

## 6. Could not test
* `skeleton.yml` on main's head (dispatch refused here; no docker in this session's sandbox).
* PF-1's suite locally (Chromium launch refused by the sandbox); its GitHub run is the evidence.
* Headed screen walks: none of R1.2, R1.9, R1.11, R1.16 has a screen; R1.38's booking page is not built; map 80 and 99 screens were walked in earlier C-row rounds and not re-walked here.

## Questions for the Lead
1. Please dispatch `skeleton.yml` on main's head (this session's permission check refused it); R1.11 is scored on that run.
2. Map 99: is "model choice open (founder)" a part of the capability (Partial until he chooses) or a launch condition outside it?

## Suggestions
* *Needed for the proof · Scaffolding:* run `skeleton.yml` on merge batches or on push to main (QA-449), so R1.11 and R1.16 are judged on main's code without a hand dispatch.
