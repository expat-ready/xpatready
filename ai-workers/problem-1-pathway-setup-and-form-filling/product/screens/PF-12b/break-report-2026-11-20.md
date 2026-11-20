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

## Break 2: exact head 2cc0c3149

Scope: the per-prospect backoff in `touchedEach` (case-clients/live.ts:25-50, the poller's map at :57, :78), the
`mayRunInside` refactor (firm-scope.ts:154-158, 176), and main's FO-4b OPTIONS pre-flight on `fo.sales.web-form`
(firm-scope.ts:109; front-office/sales/embed.ts:33-34, public.ts:133-140, 153-158). I used the same method as Break 1:
my own scratch database `xr_studio_break_pf12b2_<pid>`, every migration, `seedSampleFirms`, the walled `xr_app` client,
and `wallUnscopedQueries()`. Every catch-up run went through the real `ProspectWonPoll.tick()`. To make time pass, I moved
each backoff entry's `until` back by one poll per tick, which is the same as the clock moving on. Probe:
`/tmp/claude-0/-home-user-xpatready/c9b4d7b9-186d-5a82-a622-ddb4ba5bdb02/scratchpad/probe_pf12b_2.mts`. Result: 26 held
and 2 BREAK lines, both from one cause (m3). The PR's `tests/check_pf12b_bypass_audit.ts` gave 54 passed, 0 failed.

Verdict: **no Blocker or Major.** I found one Minor. Break 1's M1 is closed for every prospect that throws. No prospect
was made a client without its firm's line first, and no line landed in another firm's trail.

**m3 (Minor): the backoff starts only when a run throws. A listed prospect whose run returns, but which stays on the
list, still writes its firm's line on every poll, with no limit.**
`touchedEach` writes the firm's line (live.ts:38-40). Then any run that does not throw clears the key (live.ts:42). The
catch-up lists prospects by `e.subject_id` and checks for an existing client by `c.prospect_id::text = e.subject_id`
(prospect-won.ts:121, 126). `makeClient`, however, reads the newest row by the payload's `prospect_id` (prospect-won.ts:73).
It returns null when that id has no won row (:74), or `made: false` when it finds a client by the payload's id (:77-78, :90).
Either way the same row is listed again on the next run.
- Repro R6: insert into `module_event` a `prospect.won` for firm A with subject S, whose payload names a different
  prospect id Q. Run 30 ticks, one poll apart. Expected: one line, then a wait. Actual: 30 lines in A's trail, 0 clients,
  `failed` empty, and no backoff entry.
- Repro R6b: a won row in firm B whose subject id is in upper case and whose payload has the same id in lower case.
  Actual: 30 lines in B's trail from 30 ticks, 0 clients.
How reachable: the product's only writer sets both ids to `p.id` read from the database (front-office/sales/prospects.ts:91,
109). So this needs a hand-written outbox row, like Break 1's M1 repro, and M1's wider route (any refusal that persists) is
now bounded. But any later `return null` or `made: false` in `makeClient` for a condition that lasts would bring back the
8,640 lines a day per prospect, and the AUD-4 413 that follows (Break 1, M1). A fix could treat "still listed after its
run" as not taken, or have `onProspectWon` refuse a row whose payload id is not its subject id.

**What held (probe ids)**
- **M1 through the real tick** (R1): 8,640 ticks, a simulated day at 10 s. A's prospect that names no person wrote **32**
  lines to A. B's won event that names firm A wrote **32** lines to B. In Break 1 each would have written 8,640. The wait
  stops at `BACKOFF_MAX_MS` (live.ts:32, 45): the final wait was 3,600,000 ms. Neither prospect was made a client.
- **No prospect taken without its line** (R2, R3): while A's stuck prospect waits, a new prospect of A in the same run
  gets A's one line, then its client. The waiting prospect is not tried and is not in `failed`. When A's trail refuses
  the line, neither of A's two new prospects is made (`BypassNotRecorded`) and both wait (R3). A tick inside the wait
  tries neither (R3b). After the wait, both are made: A's trail reads
  `platform.bypass>client.created>client.created`, and both keys leave the backoff (R3c).
- **Success after a wait** (R4): the stuck prospect, mended by a newer won row after a one-hour wait, is made a client
  and leaves the backoff.
- **No poisoning across firms** (R5): the same prospect id is in A (failing) and in B (good). B's prospect is made, and
  only `A:<id>` waits. The firm part of the key is `firm_id::text`, a 36-character uuid with no colon, so two firms'
  `firm:prospect` keys cannot be the same string.
- **Two pollers** (R8): over 6 simulated hours, one stuck prospect in B gave 28 lines, about twice one poller's count.
  Each process keeps its own map, and the count stays bounded. Break 1's C9 still holds: two pollers make one client.
- **Lines in the right firm** (R1b, R8b): after every run above, 0 catch-up lines have `firm_id`, `entity_key` and
  `detail.firmId` disagreeing.
- **FO-4b OPTIONS** (O1-O8): on A's token from A's site, the pre-flight answers only `Vary`,
  `Access-Control-Allow-Origin`, `-Methods`, `-Headers` and `-Max-Age`. The origin it sends back is the caller's own, and
  it carries no form, firm or site list (O1, O7). The rest of that request runs as A with no bypass (O1). A's token from
  B's site gets 403 and no CORS header (O2). On firm B's address, A's token is refused before any CORS header
  (`enterFirm` → not found) (O6). OPTIONS on the read path, or with an extra path segment, is refused by `asBypass` (O3,
  O4). Another use, such as sign-up, is refused on the OPTIONS route (O8). The pre-flight reads only the form row its
  token names (public.ts:155). Nothing it reads is returned except the yes or no on the caller's own origin, so it opens
  no cross-firm read.
- **Nesting** (N1-N6): `mayRunInside` is the same expression as before (firm-scope.ts:156-158, used at :176). Over the
  whole list it allows exactly one pair, `platform.account.mail` inside `platform.firms.signup` (N1, N2). A per-firm use
  that names an outer use, or a "none" use that names none, is refused (N3). `account.mail` inside the catch-up is still
  refused (N5). Sign-up on `OPTIONS /api/public/signup` is refused (N6).

**Not findings (seen, left as is)**
- The backoff map is never pruned (R7). An entry stays until restart when its prospect leaves the list some other way:
  an Undo convert, a deleted firm, or another process making the client. The map grows with such prospects, not with time,
  and the wait is still capped.
- A firm whose line cannot be written backs off all of its due prospects at once (R3). After an outage of the audit trail,
  a won prospect can wait up to an hour more before it becomes a client. This is the documented design (live.ts:25-30).
- Lines grow with the number of app processes (R8). The OPTIONS pattern is case-insensitive (O5), like every other door
  pattern.
- At the end, a database `xr_studio_pf12b_24421` (the PR suite's own name pattern, created 12:24 UTC by a run that was not
  this break's) was on the cluster. I left it as is. My own scratch databases were dropped. Nothing was fixed or committed,
  and :4400 was never touched.
