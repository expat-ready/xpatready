# R1.13 Logs, metrics, error reports, alerts — shape (runtime lane, 21 Nov IST, main 295661385)

Requirement read: `trace-requirements.py --brief PF-23m` (SA-11-37 only; `--brief R1.13` answers "no Release 1 row R1.13 in BACKLOG.md").
qa's row (`qa/CAPABILITIES.md` R1.13, Partial, 18 Nov main 15c75cd52): one logger, structured lines, no personal data
(a seeded email, name or passport number never appears: fail case); an error reaches the alarm; an alarm reaches a
person; logs kept 90 days in Canada.

## What is on main (merged)
PF-23 #1759 (the one logger, redaction, metrics, AlertPort, health live/ready), #1782 (CI "no personal data in logs"),
PF-23r #1812, PF-23w #1800 (jobs to ready, job metrics, the stuck-job alarm; this pair's J-row by BACKLOG rev 16.11).

## What qa still misses, by part
| qa's need | Part | Status |
|---|---|---|
| a seeded name never appears (names are not caught by pattern) | **PF-23m** | buildable now (this lane) |
| an error reaches the alarm (on a running copy, seen in its log) | **PF-23m** adds `tests/journeys/j_13.ts` W1-W4 | buildable now |
| an alarm reaches a person | **PF-23c** | **held (P-251):** the founder's AWS account (outside-dependencies row 1, account-level block) and the on-call address (founder decision, not named) |
| logs kept 90 days in Canada (ca-central-1) | **PF-23c** | **held**, same reasons; also waits on PF-8a (stack) |

So R1.13 cannot reach `Completes: R1.13` tonight: its last part is PF-23c, held on two outside inputs. PF-23m is the
part that can merge tonight; it carries J-13's local walk (W1-W4); PF-23c adds W5-W6 and the `Completes:` line.

## PF-23m — touch list (one line each; every file checked against all 67 open PRs on 21 Nov ~02:3x IST)
Moves console calls that put an error's or a run's text into a log line to `logPort.error(event, e, ids)` /
`logPort.warn(event, ids)` (class, code and frames only; record ids and rule names; SA-11-37 rules 1-3):
* case side (release holder's OK needed, BACKLOG PF-23m): `api/src/rounds.ts` 169, 178, 200, 205 · `fill-case.ts` 381 ·
  `draft-qd.ts` 156, 270, 313, 342 · `form-masters.ts` 381, 384, 432, 439 · `pqr-drafts.ts` 200, 203, 252 ·
  `review-runs.ts` 246 · `people-ai.ts` 164, 289, 293 · `impact.ts` 185 · `plain-run-text.ts` 8 · `firms.ts` 54 (and
  `whyNot` callers: `demo.ts` 42) · `case-clients/live.ts` 84
* platform side: `platform/entitlements/storage.ts` 98, 121 · `platform/identity/service.ts` 102 ·
  `platform/jobs/pgboss-jobs.ts` 103 · `platform/jobs/platform-jobs.ts` 40 · `platform/web-address/routes.ts` 42
* new `tests/check_pf23m_log_calls.ts`, new `tests/journeys/j_13.ts`, `api/src/platform/MODULE.rows/PF-23m.md`,
  `qa/built/R1.13.md` (part line only)

**Not touched, and why:** `main.ts` 226 (open #2619, #1959; `console.error(e)` already reduces an Error to class and
frames), `platform/identity/sample-seed.ts` (open #2001), `platform/firms/signup.ts` (open #1959; already logs
`e.name` only), `front-office/retainers/service.ts` (open #2478; logs code and constraint only), the five P-774 (c)
PRs' files (#2608, #2556, #2326, #2568, #2478: none listed above). `demo.ts` 132/173/248 pass the Error as an argument
(already class and frames). The three one-shot CLIs that print `{ error: String(e) }` as their JSON answer
(`case-clients/prospect-won.ts` 238, `front-office/firm-seed.ts` 202, `platform/web-address/firm-created.ts` 108) are
a caller's protocol, not the server log: listed as a question, left as they are.

## Done when (each line names its test)
1. `C-R1.13 PF-23m: no plain error text` — `tests/check_pf23m_log_calls.ts` (pass and fail): a scan of `api/src`
   finds no `console.(log|info|warn|error|debug)` whose arguments hold `.message`, `String(e|err|x)` or `whyNot(`
   outside the listed exceptions; the fail case is a fixture line with `console.warn(String(e))` that the scan flags.
2. `C-R1.13 PF-23m: a name in a thrown error never reaches the log` — same file: at each moved site, an error whose
   message is "Sample Zelda Quixote W012345678 zelda@example.test" is thrown into the site with a capturing logger;
   no captured line holds the name, any word of it, the number or the email; the line holds the event and the ids.
3. `J-13` — `tests/journeys/j_13.ts` on an isolated copy (never :4400), reading the copy's `api.log`:
   W1 a booker's requests to a firm's public booking door (as built: the door needs no sign-in, so it is a person's own
   request; one refused with the passport number in an unknown field, one booked) are answered and each logged as one
   JSON line with the booker's `X-Request-Id`; W2 every line of `api.log` parses as JSON and none
   holds a seeded value (fail case: the walk's own leak probe line, written to a scratch copy of the log, is flagged);
   W3 `/api/health/live` and `/api/health/ready` are 200 (`job_queue.ok: true`); W4 a pg-boss job older than
   `STUCK_JOB_MS` (Sample, 30 min) written to the copy's job table raises one `Alerts` metric line with
   `AlertKind: job_stuck` in `api.log` within 2 minutes, and no second one in the next sweep.
   (PF-23c later: W5 a test alarm reaches the on-call address; W6 retention reads 90 days in ca-central-1.)
4. Every existing suite of a touched file unchanged (`run-suites.sh --changed` exit 0).

Size: ~35 one-line edits + ~250 test lines; under 800. Reviewer only (no money, schema, permissions or screen, P-303).
US$0, live AI off.

## As built (21 Nov IST)
* 31 sites moved (the list above; `demo.ts` 42 and `firms.ts` 54 use `dbRuleOf` for the rule name in place of the old
  `whyNot` text, now removed), plus the booking door's two `this.warn` lines (`front-office/booking/service.ts` 637,
  694: the error's class in place of its message; no open PR touches the file).
* DW2 as built: every moved site is checked to hand logPort the caught error or ids only (never a text); the seeded
  person is thrown at the logger, at `plainRunText` and at the booking door's two warn sites (real code, no server).
  The other sites sit deep in AI and job runs that need a database and a launcher; they are covered by the site check
  and the logger's contract, not each run end to end. Said in the PR.
* Found while walking: Stripe's SDK 23.1.0 writes one plugin hint straight to stderr when `CLAUDECODE` is set (agent
  sessions only), past the logger. No personal value; J-13 names that exact line as its one exception.
* Review fixes after the reviewer's Approve at 0f49fafb0 (5 Minors, all fixed): m1 the scan is wider (launcher and
  provider words, `.stack`, JSON of an error, a text after a literal, injected `log?.(` callbacks, logPort fields from a
  template) and flags the 7 old lines it used to miss; m2 `launcherReason` logs a fixed reason code (guard,
  usage_limit, live_off, timeout, not_found, spend_cap, busy, other, none) where the launcher's words were dropped;
  m3 `plainRunText(t, runId)` names the run, so its callers `runs.ts` (one line) and `ai.ts` (one line) join the touch
  list (no open PR touches either); m4 the site check refuses text-like field values; m5 J-13 W3b reaches a moved site
  on the running copy (`GET /api/runs/:id`). Added exception: `platform/identity/sample-seed.ts` 30 (open #2001's
  file; `d.why` is one of three fixed sentences).
