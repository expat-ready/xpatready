# Verdicts · capability R1 re-score · main d52b7274e (tree cdf97e36e) · reader: fresh Opus 5.5, high effort, ran nothing (P-303) · 15 Nov 2026

Read: the tester's report (working copy on `claude/qa-r1-rescore-1115`) and every file in this folder; `qa/CAPABILITIES.md` rows R1.2, R1.9, R1.11, R1.12, R1.16, R1.38, C3.1, C6.5, C7.1, C7.2, C7.5, C7.8; `MVP-CHECKLIST.md` §A rows 2, 9, 11, 12, 16, 38, 80, 99 and §C row C26; `qa/BUGS.md` (QA-383, 449-452, 470, 473, 315, 165, 353, 380, 381); `RULES.md` "When a capability counts as Works", P-348 and P-606 in `DECISIONS.md`; qa skill §4 and Gate A; the two earlier verdicts (`…-R1-platform/verdicts.md`, `…-R1-fo/verdicts.md`); BACKLOG rows PF-14, BK-14, FO-3w, FO-3st, J-38; `tests/qa/check_r19_jobs_walk.ts`, `check_qa452_jobs_observed.ts`, `check_qa470_host_mail_zone.ts`, `tests/journeys/j_9.ts` (header); `api/src/platform/jobs/*`, `features/platform-jobs.ts`, `observability/health.ts`, `front-office/booking/{service,runtime-ports}.ts`, `ports/arrival.ts`.
**My own reads, said plainly:** `git cat-file` (d52b7274e and a94a1e3c5 both have tree cdf97e36e: the batch tested main's exact code), `git log`, `git diff --stat` (`web/` unchanged since 2b7fe0060; only `check_r19_jobs_walk.ts` differs from main in `prototype/`), grep. I did not open GitHub: run 43689837365 and its job ids are the tester's quote. The job ids in the table agree with `ci-43689837365-suite-lines.txt`. That file holds 366 suite lines and 49 pack lines; "499 units", "0 retries" and "conclusion success" are not in it (quote accepted, not verified).
**Gate A as written** (RULES, P-348 (3)): "by screens only, to the next capability's first step". No written exception exists for a capability with no screen of its own. The earlier platform reader accepted gate A by API for R1.2 (no Platform screen); I apply the same basis to R1.9 for consistency and flag it for the Lead below.

### R1.2 Database — Works (re-confirmed)
PF-3's suite 75/75 on GitHub (job 132738492283) on main's tree, and qa's re-run 75/75 on the same tree after `platform.prisma` changed (12 lines since 2b7fe0060). Gate A by API, R1.2 → R1.5: PF-3's seeded staff signs in and `/me` reads PF-3's firm, grants and duty (20/20 twice). No open Major or Critical names R1.2. Same basis as the earlier Works.

### R1.9 Background jobs, schedules, reminders — Works (was Partial)
Each Done-when clause has a pass and a fail on GitHub's runners (PF-14 92/92, job 132738492327; PF-23w 31/31, job 132738492301; qa re-runs equal):
* One key, runs once: "the same key twice → one job" and "a different key is a second job"; a finished key still refuses. Shared contract PF-0c DW2 passes for both adapters (P-606 (8)).
* Retry with back-off, then a failed list with its reason: "tried 1 + retryLimit times, the waits growing", then "on the dead-letter list with its name, key, firm and error"; fail: a job that recovers is not listed.
* A reminder fires at its time in the firm's zone: 09:00 Toronto runs at 13:00Z before and 14:00Z after 1 Nov, nothing at 13:00Z after (fail). PF-23w DW7: the booking's 24 h reminder runs after a restart at its due time; the 1 h one has not yet (fail).
* Stopping the worker mid-job loses nothing: a killed worker's job is not rerun before its claim ends (fail), then reruns once; SIGTERM finishes a running job; a job over the stop limit goes back for a retry.
The running app now uses PF-14's queue (QA-453 closed; `runtime-ports.ts` no longer names `fakeJobs`). Gate A by API, `check_r19_jobs_walk.ts` 8/8 + 6/6 twice: a booking over HTTP puts two reminders at exactly start − 24 h and − 1 h and one question at end + 30 min in `platform_jobs.job`. They survive `isolated.sh restart`, and the next step, R1.42's cancel by the visitor's link, cancels all three in the queue. The assertions are not vacuous: each needs exact counts and instants.
Weak points, none holding the row:
* The walk's "once" line proves only that five jobs have five distinct keys; the de-duplication proof is PF-14's.
* "The same jobs are there" compares counts, not keys. The restart is the tester's shell step; the check does not verify it.
* No reminder fires in the walk (they are 1-9 days out); firing is proven only in PF-23w DW7, with the test's own arrival port.
* In the running app, a booker reminder that runs after a restart finds no booker (`fakeArrival` keeps people in memory) and sends nothing (`service.ts` runReminder: `if (!person) return`). This is stated in `j_9.ts` and owned by FO-2 / J-37 (Lead B's ruling on #1800 as quoted there). It is ArrivalPort's gap, not the job runner's.
* The dead-letter list is readable only in code (`PlatformJobs.deadLetters`); no person can see it until PF-23c. The clause's "shows in a failed list" is met at platform level, as the earlier reader accepted.
**For the Lead:** confirm that a no-screen platform row may pass gate A by API. If "by screens only" binds here too, R1.2 and R1.9 both go to Partial together, and nothing else in this ruling changes.

### R1.11 Server framework — Not tested (unchanged)
`skeleton.yml` has not run on main's code since 549b9cfb; this session's dispatch was refused. A green run on an older main is not this head's (P-339). QA-449 stands.

### R1.12 Screen framework, one UI kit — Partial (unchanged)
PF-1 28/28 on GitHub (job 132738492332). The local re-run was refused by the sandbox, but `web/` is unchanged since 2b7fe0060, where qa re-ran it 28/28, so P-290 holds. Missing: the "one UI kit" half has no pack (QA-450); `web/src/modules/` holds only `_example`; QA-451 open.

### R1.16 Automated testing — Partial (unchanged)
Every suite on the batch is green on main's tree. Held by QA-449 (Major, open): the container smoke and its seeded fails never run on what reaches main (P-305 (3)).

### R1.38 Time zones from booking page to invite — Partial
Now met: the host's email states the host's office zone (FO-3h DW1-DW4 in FO-3 133/133, job 132738492356; qa's QA-470 check 3/3). The booker side holds across Toronto's 14 Mar 2027 change, with the instant stored in UTC (walk 19/19 twice). The invite's DTSTART stays in UTC.
Missing:
* The booking page (FO-3w, not built), so there is no walk by screens.
* J-38, the row's join-and-walk ("the walk passes in a visible browser"), is not merged, so under P-606 (2) not all parts are in.
* No test shows the **staff-zone time across a daylight-saving change**: every host-mail case is 17 Nov or America/Regina (no change).
* The invite cannot be seen in the running app (`fakeMail`).
**Tester's question 1 (does gate A need the booking page?): yes, settled by the rules.** Gate A is by screens, and this capability starts at a person's screen that is planned (FO-3w), so an API walk here is supporting evidence only. This is the same ruling as the earlier FO reader.

### Map 80 IRCC forms per applicant from one set of answers — Partial
* C7.1 and C7.8 are Partial on QA-383 (Critical), which still reproduces on d52b7274e (4/6, the same two lines) (P-305 (3)).
* C7.2 is Partial on **two** Majors, QA-315 and **QA-165** (the tester names only QA-315), plus the Mac's Adobe and barcode evidence.
* C7.1's only pack on the batch is "fixture only" (12/12), so it is not on its scoring data.
* BK-10/16/22/23/24 are recorded as merged.
`MVP-CHECKLIST.md` row 80 still says "C7.1, C7.8 Works". That is stale since 15 Nov, and the Lead should correct it at the next records pass.

### Map 99 AI on top of the guardrails — Partial (for the Lead)
On the product side nothing is missing:
* C3.1 (17/0, 107/0), C6.5 (57, 13, 33 on the checkpoint) and C7.5 (16/16 on the checkpoint) are green on main's tree.
* BK-14's own suites are green too, though the tester does not cite them: `check_bk14_sp_review_api.ts` 10/10 (job 132738492326) and `check_bk14_review_any_form.ts` 15/0 (job 132738492327).
* No open Major or Critical names C3.1, C6.5 or C7.5; only Minors (QA-353, 380, 381; C7.5's QA-365, 367, 385).
**Tester's question 2 (is the founder's model choice part of the capability?): the rules do not settle it, so it goes to the Lead.**
* In substance it is a launch condition: §C row C26 already tracks "AI unless the Canada model is chosen", and no Done-when names a model.
* But checklist row 99 lists it as a part, and "a row takes the status of its least advanced part".
* My ruling for now: **Partial**, held only by that line. If the Lead moves the choice to C26 alone, row 99 is Works on this round's evidence, with no new test.
* If the founder later picks a model other than the one behind the saved C6.5/C7.5 runs, those two need re-proof on it (a live run, founder's Go).

## Bug rulings
* **QA-452 (Major): may close.** The fix is on main: `features/platform-jobs.ts` provides the probe, `PlatformJobs.handle` wraps every handler with `observeJob`, and `stuck-check.ts` runs as a cron. PF-23w DW1-DW3 have a pass and a fail each on GitHub. One correction: qa's check ran **without a port**, so its output is 3/3 code-only lines. Its fourth line, ready on a running copy (BUGS says "0/4 today"), was not run. The same fact is shown by the walk's ready line (`job_queue.ok` true), gate A's R1.13 line, and DW1's 503 with pg-boss stopped. R1.13 stays Partial (PF-23c).
* **QA-470 (Minor): may close.** FO-3h DW1-DW4 and qa's check 3/3. The missing staff-zone daylight-saving case is R1.38's evidence gap, not a reopening.
* **QA-473 (Minor): may close too; the tester missed it.** Its cause (`fakeJobs` in `runtime-ports.ts`) is gone with FO-3f #1785, and the walk's restart lines and PF-23w DW4/DW7 show the jobs kept. Its closing line should name what is left: after a restart a reminder finds no booker (`fakeArrival`, FO-2 / J-37). No new bug for that (P-526: stated in code with an owner).
* **Proposed new Gap · Minor, nearest R1.9 (does not hold it), owner FO-3's lane:** the booking queues its reminders, question and emails **after** the commit, outside the booking's transaction. A failure to queue only writes a warn line ("a failure to queue is told, never thrown", `service.ts` afterCommit). A crash or a pg-boss outage between commit and queue leaves a booking with no reminders and no confirmation. pg-boss sits on the same database, so the jobs could be queued in the booking's transaction. Minor while mail is a fake. No test has a fail case for it. The tester logs it if the Lead agrees.
* Stay open and unchanged: QA-449 (Major), QA-450, QA-451 (Minor), QA-383 (Critical), QA-315 and QA-165 (Major). No severity change.

## What the tester got wrong or overstated
1. `check_r19_jobs_walk.ts` line 2 quotes P-348 (3) as "otherwise by API to the next step". P-348 (3) and RULES say "by screens only"; no such exception is written. Fix the comment. The API basis rests on the R1.2 precedent and needs the Lead's confirmation.
2. §2 says the walk proves each job runs "once" and the "same five jobs" survive. It proves distinct keys and an equal count; the once-only proof is PF-14's.
3. §2 says "the api log shows one event:"job" line per run". No log file in this folder shows it (PF-23w DW2/DW7 do, on GitHub).
4. The R1.9 claim omits the known gap in `j_9.ts` (no booker after a restart). The R1.38 claim omits the missing staff-zone daylight-saving case and J-38.
5. Map 80 names QA-315 but not QA-165 for C7.2, and does not flag the stale checklist line. Map 99 omits BK-14's own green suites.
6. QA-452 "3/3 (was 0/3)": the check has four lines, and the running-copy line was not run (BUGS: 0/4).
7. QA-473 is left open although its cause is fixed.
8. `check_r1_platform_gate_a.ts` still labels its R1.9 line "start only, not gate A: no module uses the runner, QA-453". That is stale since e888e0add (Minor wording).
9. The Mac re-runs used the sandbox shims (in-node `tsx`; `pg_ctl status` → `pg_isready`; a `nohup` that ignores hang-up), stated in §2. The GitHub runs are the evidence; the re-runs count for P-290 on that understanding.
