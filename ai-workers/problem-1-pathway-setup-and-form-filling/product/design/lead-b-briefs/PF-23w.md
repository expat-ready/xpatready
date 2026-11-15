# Brief: PF-23w, the job worker reports to health and metrics, and FO-3 runs on real jobs (QA-452, QA-453, QA-473; map rows 9 + 13; the join row of that pair) (cloud builder lane; row owner Lead B)

**Start once FO-3f #1785 is on `main`** (it has `runtime-ports.ts` and the booking files open; amendment C). It is first in the pull order (rev 16.11 (e) rank 1). No schema change: pg-boss keeps its own tables. Builder at medium effort, reviewer at high (P-605). FO-3h, the next row on `service.ts`, comes after this one. Duplicate lanes: as of 15 Nov 10:11 IST no open PR other than qa's #1789 names QA-452. Paste into a new cloud session on the repository (default branch `main`):

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-23w` and take **one row, PF-23w**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **PF-23w** (shaping lane S1, approved in batch 4 with amendment C; Done when lines added in rows rev 16.10). Read only these with it:
* the requirement text `python3 product/tools/trace-requirements.py --brief PF-23w` prints (SA-8-27, SA8-D40, NFR5-14; P-604);
* QA-452, QA-453 and QA-473 in `product/qa/BUGS.md`, and qa's tests `prototype/studio/tests/qa/check_qa452_jobs_observed.ts` and `check_qa453_real_jobport.ts`. Use `main` if qa's #1789 has merged; otherwise take them from its branch `claude/charming-babbage-n8gv53`, and do not commit them;
* `product/design/lead-b-rows-2026-11-14.md`, section "Rev 16.11", parts (a) (the DWn naming) and (b) (what a join row owns);
* on `main`:
  * `api/src/features/platform-jobs.ts` and `front-office-booking.ts`;
  * `api/src/platform/jobs/pgboss-jobs.ts` and `platform-jobs.ts`;
  * `api/src/platform/observability/health.ts` (`JOB_QUEUE_PROBE`), `jobs.ts` (`observeJob`) and `alerts.ts` (`stuckJobs`, `STUCK_JOB_MS`);
  * `api/src/front-office/booking/runtime-ports.ts`.

**What is on `main` (checked 15 Nov):**
* PF-23 built the probe slot, `observeJob`, `stuckJobs` and `STUCK_JOB_MS = 30 min` (SA8-D40). PF-14 built `PlatformJobs`, which `features/platform-jobs.ts` provides. Nothing joins them (QA-452).
* FO-3's running app uses `fakeJobs` on a following clock, so jobs are lost on restart (QA-453, QA-473). It is the only `fakeJobs` in `api/src`.

**Lead B rulings (row owner of PF-23w and of FO-3, 15 Nov):**
1. **The touch list grows by one line:** `api/src/features/front-office-booking.ts` may change only the line that hands `PlatformJobs` to `runtimeBookingPorts` (Nest injection). `runtime-ports.ts` swaps `fakeJobs` for that `PlatformJobs`, and its header comment drops the jobs line. Mail and arrival stay fakes (PF-4b/PF-18n and FO-2 replace them). Nothing else in `api/src/front-office/` changes.
2. **Every handler is wrapped once, in one place:** `PlatformJobs.handle` wraps the handler with `observeJob(queue, …)`, so no module wraps its own.
3. **The stuck check runs as a platform cron job** through `PlatformJobs`. It reads pg-boss's waiting and active jobs older than `STUCK_JOB_MS` and calls `stuckJobs`. It raises at most one `job.stuck` alert per job per 5 minutes; keep that memory in the process. Do not add a table.
4. **This is the join row for map rows 9 and 13** (rev 16.11 (e)): it owns the wiring, the fake-to-real swap and the walk. There is no screen. qa scores rows 9 and 13 when it merges.

**Named test cases (P-606: list them in the PR body before writing code; the reviewer ticks one per line).** In `tests/check_pf23w_jobs_wired.ts`:
* `PF-23w DW1 pass/fail`: on a copy that runs the worker, `/api/health/ready` reports `job_queue.ok: true`. It answers 503, naming the queue, when pg-boss is stopped. It never reports `null`.
* `PF-23w DW2 pass/fail`: one job run writes one metric line (queue, outcome, age), and a failing job writes one failure line. A handler registered through `PlatformJobs.handle` is wrapped by `observeJob`; a test handler registered by going around it fails the check.
* `PF-23w DW3 pass/fail`: a job older than `STUCK_JOB_MS` raises one `job.stuck` alert, and a second check within 5 minutes raises none.
* `PF-23w DW4`: FO-3's booking reminder is a row in pg-boss's job table, not in the fake.
* `PF-23w DW5`: qa's `check_qa452_jobs_observed.ts` passes. Paste the output in the PR.
* `PF-23w DW6`: qa's `check_qa453_real_jobport.ts` passes 2/2. Paste the output in the PR.
* `PF-23w DW7 (QA-473)`: a booking reminder and the attendance question queued before an API restart still run after it, on the fake clock driving pg-boss's due time.
* **The walk** (rev 16.11 (b); `tests/journeys/j_9.ts`, as a visible browser run and as a scripted check):
  * `J-9 W1`: book a slot on the public booking page in the browser;
  * `J-9 W2`: the reminder is in pg-boss;
  * `J-9 W3`: restart the API; `/api/health/ready` is ok and the reminder is still queued;
  * `J-9 W4`: the reminder runs at its due time and the booker's mail arrives in the demo inbox.

**Duplicate check (P-526):** BACKLOG, open PRs (including records PRs), `main`'s code and BUGS for QA-452, QA-453, QA-473, `JOB_QUEUE_PROBE` and `observeJob`; one `Duplicate check:` line. If another lane already holds QA-452/453, stop and ask.

**Breaker: no** (no money, schema, permissions or new screen). The reviewer runs at high effort.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
