# Break report: CS-D6 part 2, keep list and weekly keep-period reminder (PR #3497, head 8d1b712a5)

I tested on the isolated copy :4494 (db `xr_studio_runtime_csd6k`, PLATFORM_IDENTITY=local). I did not touch :4400. Cost US$0, no model call.
Scope: `GET /api/runtime/documents/past-keep-period?after=`, `documents/keep-period.ts`, `keep-period.bypass.ts` and `features/case-keep-period.ts`. The screen is deferred in the PR body, so it is not a finding.
I drove the job with the scratch script `/tmp/claude-0/-home-user-xpatready/d846b5fe-3e07-5cd7-bed4-f5aa494a28a0/scratchpad/job.mts`. It uses FakeClock, fakeJobs and fakeNotifications, or the real `PrismaNotificationPort` (mode `real`). It goes through the app's own walled `Db` (xr_app), with each handler wrapped the way `PlatformJobs.handle` wraps it (`withFirm` or `asJob`).
Run it with `cd studio && tsx --tsconfig api/tsconfig.json <script> basic|real|weeks [start ISO]`. I restored every database row I changed afterwards.

## Blockers
None.

## Majors
**M1. A firm with many files past its period gets no reminder at all, every week.** `keep-period.ts:158-160` sends every notification in one interactive transaction, and that transaction has Prisma's default 5,000 ms timeout.
- Each real `notify` makes 2 database calls: a preference read and an upsert. Locally that is about 3.9 ms per notification, so the timeout hits at about 1,300 notifications per firm (cases × holders). With network latency to a managed database the limit is lower.
- When the transaction times out it rolls back completely. The job fails, pg-boss retries it with the same work, and it fails the same way until it is dead-lettered. It fails again every Monday.
- The firms this hits are exactly the ones the reminder exists for. DW6 cannot catch it: it runs as the superuser with fakeNotifications.
- Reproduction:
  1. Insert 3,000 synthetic CLOSED cases, closed in 2015, into sample-firm (`set local session_replication_role=replica`, closed_reason `BREAK-TEST-SYNTH`).
  2. Run `job.mts real`.
  3. The remind job's status is `failed` with the error "Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5002 ms passed". 1,297 notify calls were made, and `msg_notification` holds 0 `keep-period-passed` rows afterwards.
- Expected: every holder is told, or the job does the work in chunks so it can finish.

## Minors
- **m1. The page cursor is refused when the keep number changes, or a case is reopened, between pages** (`keep-period.ts:60`). The answer is 400 "The page cursor is not one this list gave.", although the list did give it. Reproduction: as user-R, `?after=20af2cd1…` returns 200. Set the firm's `legal.closed_client_files_years` to 7 and the same call returns 400. A reopened cursor case gives the same 400. Expected: words saying the list changed, and start again.
- **m2. A redelivered firm job marks reminders unread again.** No new row is written, but every reminder the holder has already read becomes unread. The adapter's upsert in `store.ts` sets `read_at = null`. Reproduction: `job.mts real` gives 12 rows; set `read_at`, giving 12/12 read; run again in the same week and it is 0/12 read. R1.69.md says "a re-run in the same week tells nobody". That is only true of the weekly run's key, not of a retry of `keep_period_remind` after a commit. The PR asks this as its Question 2.
- **m3. A time zone the settings accept but PostgreSQL refuses gives a 500 on the list.** `settings.ts:215` (`TIME_ZONE`) accepts `US/Pacific-New` because Intl knows it. PostgreSQL answers `time zone "US/Pacific-New" not recognized`. The zone is used in SQL at `keep-period.ts:59,63`, so the list returns 500 and the remind job would throw every week. Reproduction: insert `platform.time_zone = "US/Pacific-New"` for sample-firm, then GET the list as user-R: 500.
- **m4. The job silently skips cases past 10,000 and does unused work.** `keep-period.ts:146,155` read at most 10,000 cases, so a firm's cases past that are never mentioned and nothing says so. Each job run also fetches every document id and filters them per case (`:70-75`, cases × documents) only to throw them away. I did not measure this at 10k.
- **m5. The weekly run writes audit lines for firms that cannot get a reminder.** It writes a `platform.bypass` line into every firm that has any closed case (`keep-period.ts:122-123`). That includes the firms that never set a number, which is the default, so each of those firms gets 52 lines a year for a job that does nothing for them. Seen: 34 bypass lines after my runs.
- **m6. A reminder is never withdrawn.** After its case is reopened, or the holder loses sight of the case, the unread "keep-period-passed" notification stays and points at an open case.
- **m7. A missed Monday run is skipped.** The cron is fixed at Mon 09:17 UTC (`keep-period.ts:39`) and pg-boss's `missed: skip` applies. If the API is down at that minute, that week has no reminder. The next week catches up, because the list is cumulative.

## What held
- **Identity:** `x-actor: user-R` alone gives 401. `x-actor` together with another person's bearer token answers as the token's person. The Case officer (O) and Case manager (T) get 403 without `agent/document:dispose`.
- **Another firm:** the sample-solo Owner (1 year) lists none of sample-firm's cases. Sending sample-firm's case id as solo's `after` gives 400.
- **Own-cases-only role:** I gave CASE_MANAGER the dispose key and removed view.all. T then lists only the case where T has an open team row; the case with an ended team row is excluded. A hidden case's id as cursor gives 400. The job tells T about 1 case and R about all of them.
- **Cursor:** an uppercase UUID is accepted. These all give 400 with no SQL error: `' or 1=1--`, the nil UUID, a leading space, a trailing newline, and a repeated `after`. An empty `after` gives the first page. `zone` is never taken from the request: it is the firm setting, passed as a bound parameter.
- **Budgets:** 3,008 past cases page as 61 pages of at most 50, in about 60 ms each, with no gap.
- **Time zone at a date boundary:** closed at 2020-11-25 03:00 UTC (22:00 on 24 Nov in Toronto) is listed with passed 2026-11-24. Closed at 05:00 UTC (00:00 on 25 Nov in Toronto) is not listed.
- **Dates:** a 29 Feb close plus 1 year is 2025-02-28; plus 4 years is 2028-02-29. Closes during the March and November DST changes, Auckland and Kolkata closes on New Year's Eve, and Toronto 23:59:59 on 31 Dec all give the right local date.
- **Reopen and re-close:** reopen clears `closed_at` (database check, `case-close.ts:207`). Closing again writes a new `closed_at` (`case-close.ts:176,191`).
- **Who is told:** an Owner grant on staff who are DEACTIVATED or SUSPENDED tells nobody. An ended Owner grant tells nobody. A new live Owner grant on ACTIVE staff is told. The query matches `holdsKey`.
- **Redelivery and timing:** a redelivery adds no record. A W48 payload run in W49 tells nobody. The same job on Sunday 23:59 UTC tells everyone; on Monday 00:01 UTC, which is the next ISO week, it tells nobody. An envelope naming sample-solo with sample-firm's key reminds only sample-solo (0 cases). An unknown firm id returns 0 with no error.
- **Weeks, year end and DST:** over 21 days spanning 2026-W52, W53 and 2027-W01, and across the US DST start and end, each holder is told exactly 3 times per case (once a week). The ISO weeks were checked for 2020, 2024, 2026, 2027 and 2028.
- **Bypass:** `asJob` runs the weekly handler on the declared `job:case_documents.keep_period_weekly` use. Its body reads only `runtime_case.firm_id` for closed cases, writes one bypass line per firm and queues the job rows. The per-firm job runs under `withFirm`, behind the walls, with no bypass. The use has `routes: []`, so no request can use it.
- **Nothing removed:** the diff has no delete or update outside the tests. The counts of `case_document` and `runtime_case` are unchanged by the job.
- **Registration:** `platform_jobs.schedule` on :4494 has `case_documents.keep_period_weekly | 17 9 * * 1 | UTC`.
- **The answer contents:** it holds no file name (document ids and a count only). The words never say "legal obligation". A firm with no number gets an empty list and "Your firm has not set a keep period for closed client files."

Verdict: Changes 8d1b712a5225f5ab2493c52cc3730e9be5699e86

## Round 2: diff-only re-check, `8d1b712a5..74fb5af8c` (new head 74fb5af8c)
The coordinator asked me to check only this diff (`keep-period.ts` and the check file). I re-ran the scratch `job.mts` against xr_studio_runtime_csd6k through the app's walled `Db` and the real `PrismaNotificationPort`. I removed every row I added: 3,000 cases, 3,022 notifications and one setting change.
- **M1 is fixed.** `keep-period.ts:166-171` now runs each notification in its own short transaction, and a failure is logged and counted. Reproduction: the same 3,000 synthetic past cases, then `job.mts real`. The remind job ends `done` with 3,022 notify calls in 15.8 s and no timeout. `msg_notification` holds 3,022 rows for 3,022 distinct cases (it held 0 before). A failing notification leaves the others sent and then fails the job so the runner retries it; the new DW6 assertion shows this with a fake.
- **m4 is fixed.** `allPast` (`:176-183`) pages 500 at a time with no cap and `withDocuments=false`, so the job reads no document ids. All 3,022 cases were reached; the old code stopped at 10,000.
- **m5 is fixed.** The weekly run (`:125-127`) joins `platform_firm_setting` on `legal.closed_client_files_years`. Reproduction: set sample-firm's value to JSON `null` and run `weekly-only`: 0 firms queued, 0 new `platform.bypass` lines. Set it back to 6: 1 firm queued with key `keep-period:fc3b9d79…:2026-W49`. The solo firm has a number but no closed case, so it is not queued.
- **New, Minor (n1).** The weekly bypass now also reads `platform_firm_setting`, which is a walled table, for every firm. It reads only whether the key is present. Its declared reason in `keep-period.bypass.ts:5` still says only "lists which firms have a closed case"; the reason should name the setting read too.
- **Not changed, taken to the PR as known:** m1 (cursor 400 when the set changes), m2 (reminders marked unread again on retry; a failed notification now makes the whole job retry, which re-raises all of them), m3 (a zone PostgreSQL refuses), m6 and m7.
- **Held in the diff:** the DW5 and DW6 role edits are now restored in `finally`. The new checks cover the 21:30-Toronto close, the 29 February close, a late week, a suspended holder and an own-cases-only holder who is never told.

Verdict: Approve 74fb5af8ce8985a7c0675956d6d2f551a5ad36ac
