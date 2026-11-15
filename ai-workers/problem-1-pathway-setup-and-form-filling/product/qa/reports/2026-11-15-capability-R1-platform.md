# qa · capability R1 Platform — scoring the merged Platform rows (15 Nov 2026)

**Mode:** `/qa capability` on the Release 1 **Platform** rows of `qa/CAPABILITIES.md` section "R1 · Release 1 capabilities" (rows and ids from #1748, P-592). Lead 51's brief (15 Nov, changed 09:1x IST): score only the Platform rows whose changes are merged; no new section. **Tested on `main` 2b7fe0060** (tree a96301aad). Live AI off, US$0, no priced button (P-175).
**Verdicts:** a fresh Opus reader that ran nothing (P-303, P-432): `2026-11-15-capability-R1-platform/verdicts.md`. The tester's evidence is below; the reader's verdict is what the rows carry.

## 1. What was run

**Machine run on `main`'s head (P-339).** Merge-queue batch **ci run 43656353002** (head 180884d10, "Merge of #1753"; its tree a96301aad is `main` 2b7fe0060's tree, same parents e574b1bd8 + 35079f583). Every non-quarantined suite ran on 8 GitHub parts, 0 retries; the PF suites' rows, verbatim from the job logs:

| Suite | Part · job | Result on GitHub | qa re-run (cloud copy, same tree) |
|---|---|---|---|
| check_pf3_platform_schema.ts | 5 · 132636128165 | PASS, 75 passed, 0 failed | 75 passed, 0 failed, exit 0 |
| check_pf1_module_routes.ts | 2 · 132636128199 | PASS, 28/28 | 28/28, exit 0 (copy qa_pf1 :4471) |
| check_pf4_identity.ts | 3 · 132636128196 | PASS, 113/113 | 113/113, exit 0 (copy pf4 :4473) |
| check_pf14_jobs.ts | 8 · 132636128216 | PASS, 72 passed, 0 failed | 72 passed, 0 failed, exit 0 |
| check_pf21_complaints.ts | 1 · 132636128218 | PASS, 107 passed, 0 failed | 107 passed, 0 failed, exit 0 |
| check_pf23_observability.ts | 6 · 132636128211 | PASS, 65/65 | 65/65, exit 0 (copy qa_pf23 :4472) |
| check_pf24_secrets.ts | 2 · 132636128199 | PASS, 70 passed, 0 failed | 70 passed, 0 failed, exit 0 |
| check_pf25_web_address.ts | 4 · 132636128172 | PASS, 68 passed, 0 failed | 68 passed, 0 failed, exit 0 |
| check_pf0p_ports.ts (shared ports, an enabler) | 7 · 132636128175 | PASS, 71 passed, 0 failed | 71 passed, 0 failed, exit 0 |

Type check (job 132636128144): green, api 15 known errors, 0 new; web 0. Outputs: `2026-11-15-capability-R1-platform/check_*-mine.txt`.
**Not run on `main`'s head:** `skeleton.yml` (PF-7's container proof) was **skipped** on that batch (run 43656353031) and on the next one (43668064105); its last run on `main` is the Lead's dispatch 43583766746 (green) on 549b9cfb, 14 commits of app code ago. QA-449 (Major, raised on #1748) still holds. A dispatch on `main`'s head is asked on #1748 (comment 6888025422). No docker daemon in the cloud copy, so qa cannot re-run it.

**Gate A by API (P-348 (3)), said plainly:** no Platform row has a screen yet (PF-4b, PF-5s, PF-21s are not merged; PF-1 ships only a fixture module), so each walk goes by the API from the row's output to the next capability's first step. `tests/qa/check_r1_platform_gate_a.ts` on a fresh copy (qagate :4474, `PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`): **20 passed, 0 failed** (`gate-a-by-api-mine.txt`):
* **R1.2 → R1.5:** PF-3's seeded Sample staff `user-R` signs in through PF-4's local stand-in with the second step; `/api/platform/me` reads PF-3's firm (`sample-firm`), the Owner + Case Manager grants, the `agent/*` keys and the duty `represent` (licence record). Without the second step: 401 "Two-step sign-in is required…".
* **R1.6:** no token → 401; `user-T` (Case Manager only) on the invitations list → 403 "Not allowed" (missing permission); `user-O` (Case Officer) inviting → 403; `user-R` (Owner) → 200.
* **R1.24 → FO-3's public page:** the Sample firm got the address `sample-firm` from its key; `Host: sample-firm.localhost` → `/api/public/site` 200 `{webAddress: "sample-firm"}`; a staff route on that host → the plain not-found; an unknown host → 404, the same status as FO-3's unknown booking slug; `Maple`, `-maple`, `ma`, `www` each refused with a plain reason and a suggestion. FO-3's host-routed booking pages are FO-3w (not merged), so the walk ends at the firm the host resolves.
* **R1.13:** `/api/health/live` and `/ready` 200; a request's `X-Request-Id` is kept in its one JSON log line (route, status, duration); a seeded email in the body never reaches the log. **But ready does not count the job queue (QA-452).**
* **R1.9 → PF-21's reminder:** the pg-boss worker starts with the app and creates its `platform_jobs` schema (13 tables). PF-21's reminder runs on `JobPort` in its own suite (107/107); its routes are PF-21w (not merged), so no API reaches it yet.
Two first-run failures were the test's own faults, fixed before the counted run: Node's `fetch` drops a `Host` header (now `node:http`), and `user-R` is Owner as well as Case Manager by the seed's rule (now `user-T`).

## 2. Findings

* **QA-452 (Gap · Major, R1.13; the fix lands in PF-14's worker, R1.9's code) — new.** PF-23 left three hooks for PF-14's real job worker and nothing on `main` connects them: (1) no module provides `JOB_QUEUE_PROBE`, so `/api/health/ready` answers `job_queue: {ok: null, "No job queue on this copy yet (PF-14 adds it); not counted."}` on a copy where PF-14's worker is running: a dead queue never makes ready 503 (PF-23 Done when (4): "ready (database and job queue)"); (2) no job handler is wrapped by `observeJob`, so a job run writes no job line and no job metrics (PF-23 (2): "job runs, failures and age per queue"; `observability/jobs.ts`: "PF-14's worker wraps every handler with it"); (3) `stuckJobs` (the SA8-D40 alarm) has no caller. Cause: PF-14 was built against PF-0p's fakes before PF-23 merged (#1757's body), and no BACKLOG row owns the wiring. Check: `tests/qa/check_qa452_jobs_observed.ts` 0/4 today (`qa452-mine.txt`). Owning lane: runtime.
* **QA-453 (Gap, R1.9; the swap lands in FO-3's runtime ports) — new, added after the first reader brief.** PF-14's `PlatformJobs` (the real JobPort, injectable) is used by **no module of the running app**: the only module that queues jobs today, FO-3's booking (reminders), still gets PF-0p's in-memory `fakeJobs` "until PF-14's pg-boss adapter" (`front-office/booking/runtime-ports.ts:3-4, 18`), so a booking reminder lives in memory and is lost on a restart; PF-21's reminder has no runtime binding yet (PF-21w). R1.9's Done when ("a reminder fires at its time …; stopping the worker mid-job loses nothing") holds for PF-14's adapter in its suite, not for any reminder in the running app. Also reported as a fact by the Front office qa lane (#1748 comment 6888030400). Check: `tests/qa/check_qa453_real_jobport.ts` 0/2 today (`qa453-mine.txt`). Severity for the reader. Owning lane: front office (the swap), runtime (PF-14).
* **QA-449 (Major, R1.16 and R1.11) — still open, re-seen on 2b7fe0060** (skipped batches 43656353031, 43668064105).
* **QA-450, QA-451 (Minor, R1.12) — still open:** `web/src/modules/` still holds only `_example`; no pack checks the "one UI kit" half; the BACKLOG wording on a clash is unchanged.
* **Minor, not filed:** `check_pf25_web_address.ts`'s usage line reads `tsx studio/tests/…`, but it needs `--tsconfig api/tsconfig.json` (as `run-suites.sh` gives) or it stops at `core.ts`'s decorators. Same for every suite that imports `api/src`; the runner is right, only the line misleads a person.

## 3. Rows (the tester's proposal; the reader's verdicts decide)

| Row | Changes merged | Not merged (scope of the row) | Proposed |
|---|---|---|---|
| R1.2 Database | PF-3 #1728 | — | Works |
| R1.5 Staff sign-in, two-step, passkeys, lock-out | PF-4 #1744, PF-4t #1775 | PF-4b (passkeys, web session, invitation acceptance), PF-4s (our staff) | Partial |
| R1.6 Permissions | PF-4 #1744 (deny by default, keys per route) | PF-6 (own versus all, money and licence apart) | Partial |
| R1.9 Background jobs, schedules, reminders | PF-14 #1757 | no running-app module uses it yet (QA-453; QA-452 is R1.13's) | Partial (for QA-453; reader decides) |
| R1.11 Server framework | PF-7 #1713 | — | Not tested (no run on `main`'s head) |
| R1.12 Screen framework, one UI kit | PF-1 #1711 | the kit half has no row or check (QA-450) | Partial |
| R1.13 Logs, metrics, error reports, alerts | PF-23 #1759 | PF-23's CI step (#1782, open), PF-23c (cloud log groups, alarms to a person); QA-452 Major | Partial |
| R1.15 Secrets in a managed store | PF-24 #1756 | the managed store itself (PF-8's deploy) | Partial |
| R1.16 Automated testing | PF-7 + CI | QA-449 Major | Partial |
| R1.24 Each firm's own web address | PF-25 #1763 | wildcard DNS and certificate (PF-8, BACKLOG says so) | Works (in the app) |
| R1.109 Complaints record | PF-21 part 1 #1753 (schema, service, events) | PF-21w (routes), PF-21s (screens) | Partial |

## 4. What could not be tested
* R1.11 and the container half of R1.16 on `main`'s head (QA-449; dispatch asked). No walk by screens: no Platform screen exists. The shared demo (:4400) has no Platform screen to walk read-only.
* Coverage (c8) not rerun for these rows: the PF suites start their own scratch databases and copies; the floor is unchanged by records.

## 5. Questions for the Lead
1. Please dispatch `skeleton.yml` on `main`'s head (asked on #1748, comment 6888025422); R1.11 stays Not tested until then.
2. QA-452: which row owns the PF-14 ↔ PF-23 wiring (a small PF-14b or PF-23 part 2)? No BACKLOG row names it.
3. R1.15 (PF-24) is scored with the others; say if it should wait.

## 6. Suggestions
* *Needed for the proof · Scaffolding:* a "wiring" line in the Done when of any row built against a port fake while the real side is in another row (QA-452's cause).
