# Verdicts · capability R1 Platform · main 2b7fe0060 (tree a96301aad) · reader: fresh Opus, ran nothing (P-303, P-432) · 15 Nov 2026

Read: the tester's report §1-6 (with QA-453), the raw outputs `*-mine.txt`, BACKLOG rows (lead31 branch), MVP-CHECKLIST §A, the 14 Nov verdicts and QA-449..451, the suites and `api/src/platform/**` on main. GitHub run 43656353002 is the tester's quote (I cannot open GitHub). What I could check locally holds: batch commit 180884d10 has tree a96301aad and parents e574b1bd8 + 35079f583, the same as main 2b7fe0060. The job ids are consistent: pf1 and pf24 share part 2's job 132636128199, as the table says. No Platform screen exists, so gate A is walked **by API, not by screens**, wherever it is counted below.

### R1.2 Database — Works
`check_pf3_platform_schema.ts` 75/75 on GitHub (ci run 43656353002, part 5, job 132636128165, as quoted). qa's re-run on the same tree gives 75/75, exit 0. Gate A by API, R1.2 → R1.5: PF-3's seeded `user-R` signs in through PF-4, and `/me` reads PF-3's firm, grants, keys and the duty `represent` (gate-a 20/20). No open Major or Critical. The 14 Nov Minors still stand: `migrate diff` is checked only for PF-3's lines, and the demo copy is demo-shaped.

### R1.5 Staff sign-in with two-step, passkeys, lock-out on leaving — Partial
Merged: PF-4 #1744 and PF-4t #1775. `check_pf4_identity.ts` 113/113 (job 132636128196; re-run 113/113): two-step is required (401 in words), a deactivated person is refused at the next request, and a second sign-in ends the first.
Missing: PF-4b (passkeys, web session, sign-out-everywhere), PF-4s, and a screen walk.
No merged or shaped Done-when tests a **wrong or expired second-step code or repeated wrong tries**, which this row's bar asks for. The Lead should name an owner, likely PF-4b. I add no scope.

### R1.6 Permissions: deny by default, own versus all, money and licence apart — Partial
Deny by default is merged and tested: a route with no declared keys stops start-up, naming it (stronger than the bar's 403), and firm routes refuse `system/*` keys. Gate A by API: no token 401; `user-T` 403 on invitations; `user-O` 403 on invite; Owner 200.
Missing: "own" versus "all" keys, "money and licence keys never with another key", and wrong role by URL on screen. The tester names PF-6 for these, but PF-6's Done-when (BR-1…BR-10) does not name them in words. The Lead should confirm which row owns them.

### R1.9 Background jobs, schedules, reminders — Partial
`check_pf14_jobs.ts` 72/72 (job 132636128216; re-run 72/72). On real pg-boss it has a pass and a fail for every Done-when line: the same key gives one job; back-off, then the dead-letter list with the reason; 09:00 Toronto across 1 Nov; a kill mid-job reruns once; SIGTERM loses nothing. PF-21's suite shows its reminder dated in the firm's own zone.
What holds the row: **QA-453 (Major)**. No module of the running app uses PF-14's runner, and FO-3's booking reminders sit on the in-memory fake. Gate A ends at "the `platform_jobs` schema exists": it never reaches a reminder, because PF-21w is not merged.

### R1.11 Server framework — Not tested
`skeleton.yml` + `tools/skeleton-smoke.sh` has never run on main's head. It was skipped on batches 43656353031 and 43668064105. Its last green run (43583766746) was on 549b9cfb, 14 commits of app code ago, and a green run on an older main is not this head's (P-339). The pack still matches the Done-when. To score: the Lead dispatches it on main's head (asked on #1748). QA-449 also applies.

### R1.12 Screen framework, one UI kit — Partial
PF-1's seam Works: `check_pf1_module_routes.ts` 28/28 (job 132636128199; re-run 28/28). A clash names both sides and stops the app, with pass and fail cases, and existing pages open as before.
Missing: the "one UI kit" half has no pack (QA-450, Minor, open), and `web/src/modules/` still holds only `_example`. QA-451 (Minor): the BACKLOG row still says a clash stops `vite build`.

### R1.13 Logs, metrics, error reports, alerts — Partial
`check_pf23_observability.ts` 65/65 (job 132636128211; re-run 65/65). Each of these has a fail case: redaction, the request line with its id, metric format, the audit alarm and its 5-minute repeat rule, ready 503 with the database down, and the leak scanner.
What holds the row: **QA-452 (Major)**; PF-23's CI step (#1782) is still open, so the "no personal data in logs" gate does not run on merges; and PF-23c is not built (alarm to a person, 90 days in Canada).
Minor: the suite asserts "job queue not counted" as a pass, so it locks in QA-452's gap. Gate A's check named "with the database and job queue up" passes while `job_queue.ok` is null; the name misleads.

### R1.15 Secrets in a managed store — Partial
`check_pf24_secrets.ts` 70/70 (job 132636128199; re-run 70/70), each case with a pass or fail: a missing secret stops start-up, naming it and never its value; the route sweep (146 GET routes) and the logs hold no seeded secret; tampering is refused; firm A's credential never opens for firm B; the re-encrypt job moves every value.
Missing: the managed store itself (PF-8's deploy, not built; MVP-CHECKLIST row 1 is Not shaped). "The image holds none" is proven only by `skeleton.yml`, which has not run on this head (QA-449).

### R1.16 Automated testing — Partial
Every non-quarantined suite ran green on main's tree: ci run 43656353002, 8 parts, 0 retries, type check job 132636128144 (as quoted).
What holds the row: **QA-449 (Major, still open)**. The container smoke still never runs on what reaches main (see QA-449 below). Minor (from 14 Nov): quarantined suites skip the queue.

### R1.24 Each firm's own web address — Partial
`check_pf25_web_address.ts` 68/68 (job 132636128172; re-run 68/68). Malformed, reserved and taken addresses are refused in words with a suggestion; a firm's own staff are refused (403); firm A's address serves only firm A; an unknown host gives the same 404 as an unknown slug. Gate A by API confirms it.
Not met as worded: "`<firm>.expatready.com` opens that firm's public pages". Wildcard DNS and the certificate are PF-8's (not built), so no `.expatready.com` address opens anywhere. The host resolves only `/api/public/site → {webAddress}`, because the public pages (FO-3w's host-routed booking) are not merged. Gate A stops at the resolver, before the next capability's first step.
Minor: the staff change has no route until PF-4s and is tested only through a StaffContext fake.

### R1.109 Complaints record — Partial
Merged: PF-21 part 1 #1753. `check_pf21_complaints.ts` 107/107 (job 132636128218; re-run 107/107). It covers the record with who, what and dates, insert-only events, delete refused (405), RESTRICT keys, firm walls, and the overdue view.
Missing: PF-21w (routes), so no API reaches the register in the running app; PF-21s (screens); and "the list filters by state" as a person would use it (the service tests only the overdue view and the handler's own list).

### QA-452 — real · Gap · Major · keeps R1.13 Partial (not R1.9)
I confirmed it in the code on main. `health.ts:34` answers `job_queue {ok: null}` whenever no `JOB_QUEUE_PROBE` is provided, and nothing provides one: `features/platform-jobs.ts` only registers `PlatformJobs`. `observeJob` (`observability/jobs.ts`) and `stuckJobs` (`alerts.ts:95`) have no caller outside the PF-23 suite. `pgboss-jobs.ts` and `platform-jobs.ts` never import observability.
So a dead queue never makes ready 503, job runs write no job lines or metrics, and the SA8-D40 alarm never fires. This is a real gap against PF-23's row text, (2) and (4). It is not wrong output, so Major, not Critical. PF-23's own test list only asks for 503 with the database down, so no row owns the fix. It belongs to row 13's capability (metrics and alerts), not to R1.9's Done-when; R1.9 is Partial for QA-453 anyway.

### QA-453 — real · Gap · Major · keeps R1.9 Partial
I confirmed it on main. `front-office/booking/runtime-ports.ts:3-4, 9, 18` wires `fakeJobs(jobClock)`, "in-process; lost on restart … until PF-14's pg-boss adapter". No file outside `platform/jobs` uses `PlatformJobs`, and PF-21's reminder has no runtime binding (PF-21w). The QA-453 check is 0/2.
R1.9's "a reminder fires … stopping the worker mid-job loses nothing" holds for PF-14's adapter in its own suite and for no reminder in the running app: a booking reminder queued before a restart is silently never sent. Major, not Critical: the interim is stated in the code and no production copy exists. It would become Critical once bookings reach real people. No BACKLOG row owns the swap (owner: FO-3's lane or a PF-14b).

### QA-449 — still holds on main 2b7fe0060 · Gap · Major
`.github/workflows/skeleton.yml` on 2b7fe0060 still has only `pull_request` and `workflow_dispatch` triggers. Its header says Mergify batches do not run it and it is not a required check. Neither it nor `.mergify.yml` has changed since 549b9cfbb (git log empty), and the tester's skipped runs 43656353031 and 43668064105 agree. It keeps R1.16 Partial and blocks scoring R1.11.

### Disagreements with the tester
* **R1.24:** the tester proposes "Works (in the app)". My verdict is **Partial**. The row's own words ("`<firm>.expatready.com` opens that firm's public pages") need PF-8's DNS and certificate and FO-3w's host-routed pages, and neither is merged. "Works (in the app)" is not a status the Works rule allows.
* **R1.9:** the first proposal (Works) is withdrawn in the report. I agree with Partial, held by QA-453 and not by QA-452.
* **Gate A:** the R1.9 walk proves only that the schema exists, and the R1.13 check's name claims "job queue up". Neither carries a walk to the next capability's first step. Both are Minor wording and test-scope points, not counted as gate A passes for those rows.
* **R1.5, R1.6:** I agree with Partial, and add the missing owners noted in those rows (wrong or expired code and repeated tries; own versus all and money apart).
