Verdict: Approve 53580c5ddcf787f7e0b016efd6e62d3345641e0e

# PF-23r review: redaction hardening (PF-23's review minors 1-4 and FO-13 break 11)

* PR #1812, branch `claude/awesome-hamilton-um8miq`, reviewed commit **53580c5dd**. The independent Opus reviewer (P-303), reviewer only (no breaker).
* Read: `git diff origin/main...53580c5dd` (4 files), row PF-23r (BACKLOG line 432, amendment line 451), brief `lead-b-briefs/PF-23r.md` (`origin/lead-b-front-office`), the PR body, `redact.ts`/`alerts.ts`/`health.ts`/`log.ts`/`hook.ts`/`scan-logs.ts` at the commit, `main.ts` `ProblemErrors`, `runtime.ts:315-321`, `platform/jobs/stuck-check.ts`.
* Not a screen: no UI, so the screen dimensions, the BIC table and the journey score do not apply (**journey score: n/a, no user journey**). Instead I ran the suites below and throw-away probes of the new patterns (scratchpad only; nothing committed).

## What I ran

| Command | Result |
|---|---|
| `tsx tests/check_pf23_observability.ts 4493 xr_studio_rt_pf23r` | **93/93 passed** |
| `tsx --tsconfig api/tsconfig.json tests/check_pf23w_jobs_wired.ts` (imports `alerts.ts`, its own database) | **31 passed, 0 failed** |
| `tsx --tsconfig api/tsconfig.json tests/qa/check_qa452_jobs_observed.ts 4493` | **4 passed, 0 failed** |
| `scan-logs.ts --self-test`; `scan-logs.ts var/isolated-logs` | self-test ok; 135 lines, **0 findings** |
| `tsc -p api/tsconfig.json --noEmit` | no error in `platform/observability/*` or the test |
| Probe of the new regexes, the walk and `alertIds` | outputs quoted under the findings |

## Rules

* Touch list kept: only `api/src/platform/observability/{redact,alerts,health}.ts` and `tests/check_pf23_observability.ts`. No migration, no `ports/` change, no new package. US$0, no model call, no personal names (the canaries are PF-23's made-up values).
* Two existing asserts changed with the row's behaviour, named in the PR (m6 now expects `"[shared]"`; m2 allows `[stack] Error at`). Both follow the row's own words.
* **The error mapper needs no change (PR's claim): agreed.** `ProblemErrors` answers P2002 with fixed text, the 500 with fixed text, and `combination_level:` with the trigger's own first line, whose only placeholders are a level kind and `NEW.parent_node_key` (config keys, not personal). Its log line is `console.error(e)`, which the patched console reduces to `safeError` (class, code, frames; never message or `meta`). The live case in the test is a real database refusal: `runtime.ts:316` catches the unique violation and answers its own fixed 409 text.
* Other callers: `alertIds` has one production caller, `stuck-check.ts` → `stuckJobs` (queue names from pg-boss go through `WORDS`; job ids are uuids). `writeAuditWithAlarm` and `clocksNear` are called only from tests. `logPort` has no caller outside observability, so `"[shared]"` reaches only `console.*` object arguments (each redacted on its own, `hook.ts:66`) and observability's own writes. No other suite asserts `[stack] at`, `[cycle]` or `not_an_id`.

## Done when: a real pass and a real fail for each line

| Done when | Test | Can it fail? |
|---|---|---|
| 20 shared refs × 10 levels finish under the budget, shared show `[shared]` | `PF-23r pass (budget)` + `fail (budget)` (7,500 values stop at 2,000) + cycle guard | Yes: main's walk visits 20^6 paths (no `[shared]`) and has no budget marker |
| `entityKey: "Jane Doe"` refused; `entity: "case fact"` → `case_fact` | `PF-23r fail (alertIds)`, `pass (alertIds)`, id guard | Yes: main gives `Jane_Doe` |
| 3-line message with a stack logs frames only | `PF-23r pass (frames only)` + 2 guards | Yes: main's `STACK` needs line 2 to be an indented frame, so it keeps `Invalid …` |
| `0900-1700` stays; `Cookie sid=abc` redacted | `PF-23r fail-guard (UCI8)`, `pass (cookie)` | Yes: main gives `[number]` and keeps `abc` |
| A refused insert of a seeded name logs and answers without it (amendment) | `PF-23r pass … the answer`, `… the server's log`, `… logPort`, control `fail (the driver's error repeats the name)`; unit `pass (DETAIL)`, `pass (Prisma meta)` | Yes: on main, `{...pgErr}.detail` and `meta.driverAdapterError…originalMessage` are walked as text and the name stays |
| No-personal-data CI check green | existing `PF-23 pass (live log): the CI check passes` | Yes (scanner self-test proves it fails on a planted line) |

## Findings (no Blocker, no Major)

**m1 (Minor) `redact.ts:53` TIME_RANGE also exempts about 2.2 % of dashed 8-digit UCIs.** Each half is accepted as any hhmm (1,440 and 1,500 of 10,000 values), so a UCI like `1130-0845` or `2359-2459` (not even a time) stays in free text. Probe: `redactText("uci 1130-0845")` → `uci 1130-0845`. The row asked for time ranges to stay, so the trade-off is the row's; it should be narrower: e.g. minutes in steps of 5 (`[0-5][05]`) and only `2400` for hour 24, which drops it to about 0.01 %. The field `uci` is still redacted by name.

**m2 (Minor) `redact.ts:56`, `:58`, `:43` stop at a double quote, so the rest of a quoted value leaks.** `PG_DETAIL` and `PG_ROW` use `[^\n"]`; PostgreSQL does not escape quotes inside `Key (…)=(…)` or `Failing row contains (…)`. Probe: `DETAIL:  Key (display_name)=(Jane "JJ" Doe) already exists.` → `DETAIL: [redacted]"JJ" Doe) already exists.`; `Failing row contains (1, Jane "JJ" Doe, null).` → `…"JJ" Doe, null).`. A case reference is typed free text, so it can hold quotes. The cookie case is partly older: `Cookie sid="abc"` → `Cookie [redacted]"abc"` (main's `Cookie: sid="abc"` already did this). Fix: for `DETAIL:` take the rest of the line (`[^\n]*`); for the cookie, let the value run past quotes up to the end of the line.

**m3 (Minor) `redact.ts:57` PG_KEY misses a column list that contains brackets.** `[^)\n]{0,200}` stops at the first `)`, so an expression index's detail is not matched: `Key (lower(email::text))=(Jane Doe) already exists.` → kept as it is. There is no expression unique index today (191 `unique index` lines in the migrations, none on an expression), and a `DETAIL:` line or a field named `detail` is caught anyway; this only matters for the bare `Key …` text written into a message. Fix: allow one level of brackets in the column list.

**m4 (Minor) `redact.ts:151` FRAME_LINE now takes any line that starts with `at `, indented or not.** Ordinary multi-line text loses every other line: `"Summary line\nat 10:00 the job ran for Jane"` → `[stack] at 10:00 the job ran for Jane` (also "at least …", "at the moment …"). Because `framesOf` keeps every line that starts with `at `, a message line such as `at Jane Doe's office` is kept as a "frame" (`"Error: x\nat Jane Doe's office\n    at f (/a.js:1:1)"` → `[stack] at Jane Doe's office | at f (/a.js:1:1)`). The second part is older (`framesOf`), but more text now goes down this path. Fix: count a line as a frame only when it ends like V8's (`(path:line:col)` or `path:line:col`), in both `FRAME_LINE` and `framesOf`.

**m5 (Minor) `redact.ts:118-120` `"[shared]"` also applies to a Date or an Error met twice.** `seen` is filled before the Date and Error branches, so `{ startedAt: d, at: d }` → `{"startedAt":"1970-…","at":"[shared]"}`: a timestamp is lost, though nothing leaks. Fix: return Dates (and other leaf values) before they are added to `seen`.

**Note (no action) `alerts.ts:67`:** an id refused as `not_an_id` shares `LogAlerts`' repeat key, so two records whose ids were both names would raise one alert within 5 minutes. The only production caller passes uuids, so this cannot happen today; it is how emails already behaved on main.

**Nit:** `health.ts:34`'s words still say "(PF-14 adds it)". The row fixes only the comment, so this is not part of the row.

## Could not check

* The full CI shards (the builder's pre-label run, brief rows rev 16). I ran only the three suites that import these files, plus the scanner.
* Prisma's exact error text with a driver adapter (whether `DETAIL:` reaches a message string). I tested the redaction of each shape the PR names, not every Prisma version's wording.
