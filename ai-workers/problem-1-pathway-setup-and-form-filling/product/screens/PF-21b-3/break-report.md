# PF-21b part 3 — break report (register of privacy requests made to ExpatReady, /api/system/register/requests)

PR #3189, branch claude/runtime-pf21b-requests, head 1b9733fd136dd842d024b92698db334aca9faf1d. Only the row's own change was attacked (migration
`20261123100000_pf21b_data_requests`, `api/src/platform/register/requests/*`, `features/platform-register-requests.ts`). No screen.
How: the row's suite was run first, unchanged: **27 passed, 0 failed**. Then two scratch tsx probes outside the repo that reuse the suite's set-up
(scratch database `brk_pf21b3_<pid>` on 127.0.0.1:54329 with every migration; the Nest test app on a random port with PF-4s's guards and local
identities; a fake clock; an AlertPort that can work, fail or take 6.5 s; a second `DataRequests` on its own PrismaClient as a second process).
psql ran as xr_studio (owner), as xr_app, and as xr_app after `SET ROLE xr_staff_bypass`. Port 4400 was not used. Both scratch databases were dropped. No code was changed and nothing was committed.

## Findings

**M1 — Major: a request logged past (or near) its target while alerts are down is saved, then answers 500. A retry saves it again, for good.**
`log()` commits the request, its RECEIVED step and the ALLOWED audit line inside `change()`. Only after that commit does it call `checkOne(id)`
(service.ts:106). `checkOne` runs outside the change and outside its try/REFUSED path. Reproduction: AlertPort throws, then POST
`{type:"ACCESS", …, receivedOn: today−40}` as the Platform Owner → **500 "Internal server error"**. The database has 1 new row (PENDING, not
OVERDUE) and the audit has +1 ALLOWED line. The same POST again → 500 again, and there are now **2 rows** for that requester. The near-target case
(receivedOn today−27) gives the same 500 with the row saved. Nothing removes duplicates: the register refuses DELETE by design, and three identical
parallel POSTs make 3 rows (no idempotency). The Platform Owner is told "failed" for a write that went through, and a permanent legal register
fills with copies. Fix direction: run the check in its own try (the daily check already retries it) and still answer 201. Or catch and log it,
as `sweep()` does.

**m1 — Minor: the database wall is "no firm in the session", and xr_app's bypass role reads and writes both tables directly.**
The migration says "xr_app reaches them only through the plat_data_request_* definers" (migration.sql:5). But xr_data keeps SELECT, INSERT and
UPDATE on `plat_data_request`, and SELECT and INSERT on `plat_data_request_event` (only DELETE/TRUNCATE are revoked, :106). xr_app may
`SET ROLE xr_staff_bypass` (BYPASSRLS). Reproduction as xr_app: `begin; set local role xr_staff_bypass; …`:
- `select count(*), min(requester_email) from plat_data_request` → all 48 rows with emails.
- `insert into plat_data_request_event (…, kind, actor) values (…, '<open id>', 'NEAR_DATE_ALERTED', 'staff:forged')` → OK. The next
  `sweep()` raises **no** near-date alert for that request, so the stored mark suppresses NFR5-14's alert.
- `update plat_data_request set status='OVERDUE'` → OK (Overdue by hand, no mark, no alert). A forged `STATUS_CHANGED PENDING→COMPLETED` step is
  also accepted, so the steps contradict the row.

Also, inside a firm-A transaction, `set_config('app.firm_id','',true)` followed by `plat_data_request_list` returns the rows. That is the platform's model,
and it was graded Minor in PF-21b-2 (m1). The definers run as xr_wall_reader, which needs none of xr_data's table grants, so `REVOKE SELECT, INSERT,
UPDATE … FROM xr_data` on both tables would make the claim true.

**m2 — Minor: the daily check reads only 501 due rows, newest first, so the oldest overdue request can be skipped day after day.**
`sweep()` reads `LIST_MAX + 1` rows (service.ts:147). `plat_data_request_list` orders them `received_on DESC` (migration.sql:209). Near-alerted
requests stay PENDING, so they stay in the due set. Reproduction: 505 requests with targets in 3 days and 1 request 15 days past its target.
Two runs: the overdue one is **not marked either time** (still PENDING, no alert). Nothing records that rows were cut. This volume is unlikely for
our own register, but the result is a silent miss of the overdue alert. Fix direction: order the due read by `target_date ASC`, or page through all due rows.

**m3 — Minor: an AlertPort slower than Prisma's 5 s transaction raises the alert, then loses the mark.**
`alerts.raise` runs inside `$transaction` with the default timeout (service.ts:159–163). Reproduction 1: the alert takes 6.5 s on an overdue request.
Run 1 reports `failed:1` with no mark. Run 2 marks it and raises again: **2 alerts** for one request. Reproduction 2: the same slow alert, and
meanwhile staff move the request to HELD. The move waits 4.6 s, then gets 200. Final state: HELD, no OVERDUE mark, but **1 overdue alert was
raised** for it. LogAlerts writes synchronously, so this needs a slow adapter. Fix direction: a longer `timeout`, or record the mark, then raise.

**m4 — Minor: some invisible or line-breaking text passes `plain()` (service.ts:39–40).** These were accepted (201) and stored:
- U+061C ARABIC LETTER MARK (a direction mark that is not on the list).
- A name made only of U+200B (an invisible requester).
- Tab, line feed and U+2028 inside a one-line name.

Separately, `.max(200)` counts UTF-16 units: 150 emoji or supplementary CJK characters → 422 "at most 200 characters". RLO, LRM, NUL, C1 and
U+3000-only names were refused, correctly.

**m5 — Minor: "today" is the UTC day, while the register's clock is Toronto's.** `today()` (service.ts:79) is the ISO day in UTC. At 22:30 on
24 Nov in Toronto (03:30Z on 25 Nov), `receivedOn:"2026-11-25"` (tomorrow in Toronto) → 201 (the check at :101 passes). A request completed at
that moment gets `completedOn = 2026-11-25`. Both are off by a day for about 5 hours every evening.

**m6 — Minor: "Overdue → In progress" (refused, 409) is reachable in two moves: Overdue → Held → In progress (200, 200).**
The next daily check moves it back to OVERDUE without an alert (the one mark already exists). So staff can make an overdue request read
"In progress" until the next 07:20 run. The trigger (migration.sql:90) and the definer (:161) both allow HELD → IN_PROGRESS whatever came before.

**m7 — Minor: the firm and person named by SA-11-40 are not checked.** `firmId` and `subject.id` only need to be uuid-shaped. A non-existent firm,
or `00000000-…` for both, → 201 with that link stored (no FK, no lookup). Only the Platform Owner can do this, so it cannot spoof another firm's
data, but the "one person record" link can point at nothing.

**m8 — Minor (owner level and wording).**
- As the owner (xr_studio): `update … set status='OVERDUE'` and `set actions_taken=null` on an open request both succeed. The header (migration.sql:8)
  says "OVERDUE only by the daily check's mark", but only the definer enforces that.
- A `NOTE` step with a null note is accepted by the event check.
- service.ts's `move` comment says Overdue by hand → 409. It is 422, and the suite expects 422.

## What held
- **Routes:** every route (list, read, log, move) refuses all of these, with nothing written and the request unchanged: no token or a garbage
  token (401); a firm staff token and a firm owner token, Support, Admin and Auditor (403). A firm token with `firmId` in the body and an `x-firm-id`
  header → 403. The Platform Owner's `x-firm-id` header is ignored.
- **Firm session:** in a firm's session, all six `plat_data_request_*` functions (including `_mark` and `_system_only`) are refused by the database.
  As xr_app with no firm: SELECT sees 0 rows; INSERT is refused by RLS; UPDATE touches 0 rows; DELETE and TRUNCATE of both tables, and UPDATE of a
  step, are refused (permission denied). The bypass role also gets DELETE, TRUNCATE and step UPDATE refused.
- **Owner:** DELETE, TRUNCATE (both tables), a changed step, changed facts, `created_at`, and OVERDUE → IN_PROGRESS are all refused. COMPLETED
  without `completed_on` breaks the check.
- **Moves:** COMPLETED → In progress or Held → 409 MOVE_REFUSED; → Completed → 409 SAME_STATUS; → OVERDUE or PENDING → 422. The sweep never marks
  a completed request.
- **Parallel moves:** 10 parallel COMPLETED → exactly one 200 and one step. IN_PROGRESS, HELD and COMPLETED in parallel → one 200, one step.
  A move racing two sweeps → one overdue mark, one alert, then COMPLETED.
- **Parallel sweeps:** four sweeps on two PrismaClients over 8 overdue and 8 near requests → **exactly one alert each**, 0 failed. A request logged
  40 days late reads OVERDUE at once with one alert (when alerts work).
- **Inputs:** each of these → 422 with a field: Feb 30, month 13, 1899 and 0000, a datetime, a short date, a number or null as a date; bad, IDN,
  unicode-local and two-`@` emails; unknown fields (including status, id and recordedBy); a firm without its person and the reverse; subject kind
  CASE or with extra keys; a lower-case type or status; array bodies.
- **Sizes:** a 2 MB body → 413; a reason over 500 → 400 REASON_TOO_LONG. A list limit of 0, 501, −1, 1.5, a word, a repeated status or an unknown
  parameter → 422. `truncated` is set correctly.
- **Ids:** a non-uuid, `%00`, SQL-looking ids and the nil id → 404. Upper-case uuids work. Emails are stored lower-cased and trimmed.
- **Non-English text:** CJK, Arabic and accented names are stored intact.

Verdict: Changes 1b9733fd136dd842d024b92698db334aca9faf1d

## Round 2 — head 0cda0efbf27edd1f545f039b021f53fea45ca3a5 (diff-only)

I read only `git diff 1b9733fd1..0cda0efbf -- …/prototype/studio`. The branch has since moved to 0e8a6610f, a records-only commit that I did not review.
**Set-up:** a `git archive` copy of the new head in the scratchpad. The row's suite passes: **27 passed, 0 failed**. The suites touched by the change
also pass: `check_pf12_walls` **110/0** and `check_pf4s_system_signin` **102/102**. I re-ran my round-1 probes against that copy on a new scratch
database, dropped afterwards. Port 4400 was not used.

**Fixed:**
- **M1, fixed.** With alerts down, a POST 40 days late and a POST 27 days late → **201 PENDING** each, with one row and one ALLOWED line apiece.
  The next run with alerts up marks the late one OVERDUE and gives the near one its alert, one alert each, 0 failed.
- **m1, fixed.** `REVOKE ALL` (migration.sql:106) leaves no table grants for anyone but the owner. Through xr_app, and xr_app → `xr_staff_bypass`,
  every attempt is now **permission denied**: SELECT on both tables, a forged NEAR_DATE_ALERTED, a hand-set OVERDUE, and a direct INSERT.
  The definers still work for xr_app (list → 3 rows, move → MOVED). The near alert is raised normally after these attempts.
- **m2, fixed for the overdue alert.** 505 near-window requests plus 1 that is 15 days late: the late one is marked OVERDUE **on run 1**.
  The console list still shows newest received first.
- **m3, fixed for duplicates.** An alert that takes 6.5 s → one alert, the mark kept, nothing more on the next run. A POST log of a late
  request with that slow alert → 201 OVERDUE after 6.5 s.
- **m5, fixed.** At 22:30 Toronto on 24 Nov, receivedOn 25 Nov → 422 "cannot be in the future"; a completion gets `completedOn` 2026-11-24.
  At 23:30 Toronto: a target of 23 Nov → overdue; a target of 24 Nov (today) → near only, not overdue.
- **m8 comment, fixed.**
- **The daily job's handler** now throws when a check failed (alerts down → "1 check(s) failed") and resolves when alerts work. Each failure is
  logged as `data_request_check_failed`.

**New and residual (all Minor, none blocking):**
- **n1 — Minor.** Because checkOne's transaction now lives up to 60 s, a slow alert keeps the request's row locked. A staff move on that same
  request, made while the alert is pending, waits on its own default 5 s transaction. It then answers **500** after 6.1 s, with a REFUSED line;
  the request stays OVERDUE and nothing is half-written. This is the same shape as PF-21b part 2's m2. It needs an adapter slower than 5 s;
  LogAlerts writes synchronously.
- **n2 — Minor (m2 residual).** The due read is still capped at 501. Near-window requests that already have their near alert stay in that read,
  ahead of others with the same target. With 505 in the window, run 1 raised 499 near alerts and run 2 raised 1, so 5 had none after two runs.
  The overdue alert is never lost: older targets come first, and a marked overdue request leaves the read. This volume is unrealistic for our
  own register.
- **n3 — nit.** `log()` swallows checkOne's error without a log line (service.ts:107). The daily check retries it and logs it, so nothing is lost.
- **Still open (not findings in this round):** m4, m6 and m7 are questions in the PR body. The m1 note about clearing `app.firm_id` inside a firm's
  transaction is the platform's model, as in PF-21b part 2.

Verdict: Approve 0cda0efbf27edd1f545f039b021f53fea45ca3a5
