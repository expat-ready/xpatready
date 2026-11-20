# PF-12b part 1: break report, 20 Nov (PR #2029 @ 9d60f8a74, the changes since 865df8f2e)

Scope: the new `inside` field and the one nesting it allows (firm-scope.ts:103-105, 121, 169-172), the CS-K1 catch-up's
per-firm line (case-clients/live.ts:25-34, 60; prospect-won.ts:116-134), and sign-up's "already have an account" path
(platform/firms/signup.ts:140-149). How I tested: my own scratch database `xr_studio_break_pf12b_<pid>` on 127.0.0.1:54329,
every migration applied in order, `seedSampleFirms`, the app's client through `WalledPool` as xr_app, `oneQueryPerCaller`
and `wallUnscopedQueries()` (as the API server sets them). The script was dropped at the end, and :4400 was never touched. Probe:
`/tmp/claude-0/-home-user-xpatready/c9b4d7b9-186d-5a82-a622-ddb4ba5bdb02/scratchpad/probe_pf12b.mts`, run with
`cd …/prototype && studio/node_modules/.bin/tsx --tsconfig studio/api/tsconfig.json <probe>`. Result: 25 held, 3 BREAK
lines, all from one cause (M1 below). The PR's own `tests/check_pf12b_bypass_audit.ts`: 48 passed, 0 failed.
Firms: A = `sample-firm`, B = `sample-solo`.

Verdict: **one Major, two Minor. No Blocker.** No attempt crossed a firm wall without a line, and none put a line in the
wrong firm's trail.

## Findings

**M1 (Major): a won prospect the catch-up can never take adds a `platform.bypass` line to its firm's trail on every
poll, with no limit.**
`touchedEach` (live.ts:28-34) writes the firm's line once per *run*, before the prospect is tried. The catch-up query
(prospect-won.ts:119-128) lists the same prospect again on every run until a client exists. So a prospect whose
`onProspectWon` keeps throwing writes one line per run, by default every 10 s (live.ts:23; `PROSPECT_WON_POLL_MS` goes
down to 200 ms). Before PF-12b such a prospect only produced a console warning (live.ts:61).
Repro (probe C4, C5): insert into `module_event` a `prospect.won` for firm A whose payload names firm B (`makeClient`
refuses it at prospect-won.ts:61-67). Separately, insert one for firm B whose answers name no person (it throws at
prospect-won.ts:53). Then call `ProspectWonPoll.tick()` N times.
- Expected: one line for the crossing, or a back-off for a prospect that keeps failing.
- Actual: "6 lines from 6 runs" in A's trail and "3 lines in B's trail from 3 runs". Each run logs
  `FO-8: 1 won prospect(s) not taken in`. With two app processes (probe C9), each firm gets 2 lines per tick.
At the default setting that is 8,640 permanent lines a day per stuck prospect. Each one says "Our platform read or
changed this firm's records across the firm walls", yet nothing changes. AUD-4 shows all of them in the firm's own log
(firm-read/service.ts reads every `audit_event` of the firm; nothing filters `platform.bypass`). After about 11.6 days
every AUD-4 export over that period is refused with 413, "Narrow the dates" (`EXPORT_MAX` 100,000,
firm-read/service.ts:25, 183). This also breaks QA-499's count, which is meant to be uses × firms touched: here it grows
with time.
How reachable: I made the stuck prospects by writing outbox rows directly. Convert validates its payload
(prospects.ts:107), and arrivals require a first name, so I did not find a UI path that produces one. But the code plans
for prospects that fail ("A prospect that fails is logged by id and the poll goes on", live.ts:6; prospect-won.ts:131).
Any refusal that persists does the same, for example from FoPersonPort `party()` (fo-person-port.ts:45) or from a
`ProspectWonPayload` strict-parse change.

**m1 (Minor): `platform.account.mail` can be opened from any scope outside a request, including a firm's job; the
`inside` limit applies only under another bypass use.**
The entry is `outside: true` (firm-scope.ts:121). Under `withFirm(A)` (a firm's job: no route, no bypass) the check at
firm-scope.ts:162 lets it through, and the scope switches to BYPASSRLS with no firm.
Repro (probe N12): `withFirm(A, () => asBypass("platform.account.mail", () => currentBypass()))` returns
`"platform.account.mail"`.
Inside that scope the use has no technical limit to PLATFORM_ACCOUNT rows (probe N13). It read 2 firms' staff with no
line, and a `touchFirm` there writes a line named `platform.account.mail`, a "none" use. That this use touches no firm's
rows is guaranteed only by MessagesMail.write (mail.ts:61-75). No current caller sends a platform email from a job: in
the server, sign-up's background step keeps its request route. So `outside: true` grants more than the one sign-up
nesting needs; `direct: true` already covers suites. Expected: only the sign-up routes (and direct calls). Actual: any
job or start-up code.

**m2 (Minor): the catch-up's `why` text describes work the use does not do.**
BYPASS_USES `cases.prospect-won.catch-up` (firm-scope.ts:123) says "at the first run each firm with an unlinked client
gets its one-time link job". That read and the enqueue run *after* `asBypass` returns (live.ts:62-64), outside the use
(`case_client` has no wall). A reviewer counting what the use crosses is pointed at work that writes no line, by design.
The text should list only the outbox read.

## Not findings (seen, left as is)
- `touchedEach` keys its cache on the firm id exactly as given. `A` and its upper-case form give two lines in one run
  (probe C7). This cannot happen from live.ts, because the query returns `firm_id::text`, which is always lower case.
- `touchedEach` is not tied to its use: under `platform.demo.reset` it writes that use's line (probe C6). This is correct
  behaviour, noted only because the helper is exported.
- The list query reads `platform_firm` and `module_event` across firms but writes lines only for firms with a due
  prospect. This is the same known limit as the outbox sweep (check_pf12b_bypass_audit.ts:103-105).

## What held (probe ids)
- **Nesting** (N1-N9): `platform.account.mail` inside `platform.demo.reset`, `job:messages.outbox_sweep`,
  `job:messages.send` or the CS-K1 catch-up is refused. `job:messages.send` inside sign-up is refused, and so is a third
  use inside the inner one. Sign-up again inside `platform.account.mail` is refused (no way back out), as is
  `platform.account.mail` on a staff route. It is allowed inside sign-up on `/api/public/signup` and `/verify` only.
- **Look-alike names** (N10): `Platform.Account.Mail`, a trailing space, `__proto__`, `constructor` and `toString` are
  all refused as not on the list.
- **Scope after the inner use** (N11): after the inner use returns, and after it throws, sign-up's use is back and no
  firm appears. Only a timer started inside the inner use keeps the inner scope. That is how AsyncLocalStorage behaves,
  and no code path does it (dispatch is awaited after return, mail.ts:39-40).
- **Concurrent sign-ups** (S1): six at once (A's staff, B's staff, B's contact, A's staff in upper case, two new):
  A got 2 lines and B got 2, each in its own trail. There is 0 lines where firm_id ≠ entity_key ≠ detail.firmId, 0 firm
  outbox rows, and the "already" emails are PLATFORM_ACCOUNT rows.
- **Fail-closed "already" path** (S2): when A's line cannot be written, no "already have an account" email is written
  (`[sign-up] background step failed: BypassNotRecorded`).
- **A line failure never makes a client** (C1): when B's line fails, B's prospect is not made a client (in `failed` as
  BypassNotRecorded), while A's is. On the next run B gets its line and then its client, in that order in B's trail (C2).
- **Wrong firm** (C3): a won event in A whose payload names B writes nothing to B's trail and makes no client. The work
  inside `touchedEach(A)` runs walled as A and reads A's staff only (C8). Two pollers at once make one client (C9).
- **`job:messages.send` and `platform.account.mail` cannot be steered onto firm rows** (by reading; the PR's 1m checks
  pass). The strict union refuses `platformAccount` together with `firmId` before `asBypass` (ports/mail.ts:40-48,
  mail.ts:61). A job with no firm only reaches `deliverPlatform` (`firm_id IS NULL`, messages.ts deliver), and the
  runner refuses a platform job that names a firm (pgboss-jobs.ts:283).

Nothing was fixed or committed. The scratch databases were dropped (0 `xr_studio_break%` databases left).
