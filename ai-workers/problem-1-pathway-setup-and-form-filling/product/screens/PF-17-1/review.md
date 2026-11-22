# Review: PF-17 part 1 (R1.93), firms list with health and usage, API only

Reviewer (Opus 5.5, high), 22 Nov 2026. Branch `claude/stoic-newton-if7dgz`, head `27e8b406a09a215357e9fa3bbd4930bbbefcb21d` (`a948c009c` adds only the break report; same code).
What I reviewed: only this row's diff against `origin/claude/cool-babbage-88oj1o` (#2927): 8 files, +471/-3.
Spec: brief `design/briefs/track-b/PF-17-1.md` (`098153d17`), BACKLOG row PF-17, R1.93. Paths below are under `prototype/studio/`.
**Result: Ship after fixes.** There is one Major finding, and it is a test gap: the authorisation on `GET /api/system/firms/:id` can be weakened and the suite stays green.

## Not checked: no screen in this part (part 4)
Not done: concept fit; the walk as a user, keyboard-only, at 1024 px and 200 %; menu and words (`PRODUCT.md` §3-§4); team look; BIC-01-BIC-20 (N/A: platform console, not case-side).

**Journey score: not scored.** Five of the ten criteria need a UI. I walked API journeys instead (below), and they held.

## What I ran (exact commit, scratch databases on :54329, never :4400)
- `tests/check_pf17_console.ts`: **34 passed, 0 failed, exit 0**, about 10 s.
- Existing suites, all exit 0: `check_pf12b_bypass_audit` 70/70, `check_pf4s_system_signin` 78/78, `check_pf15_limits` 69/69, `check_pf15_booking` 42/42, `check_pf12_walls` 110/110, `check_pf12b_doors` 33/33.
- `tsc -p api/tsconfig.json`: no error in this row's files. The errors it shows are older ones, in other tests.
- Each mutation below was applied, run, then restored with `git checkout`.
- Mutations, red as expected: either `@SystemKeys` removed (the app refuses to start, PF-4s default deny); the list key changed to `@AnySystemStaff` (DW1 fail, DW5); `touchFirms` removed (3 checks); the route regex narrowed (DW6, DW7 500), widened to `/api/system/` or opened to any method (DW6 fail); over-limit `>=`, always false, or its reason dropped (DW3).
- **Mutation that survives:** the `:id` key changed to `@AnySystemStaff` stays green, 34/34 (Major M1).

- Breaker probes (temporary copy of the suite, deleted): forged claim and `alg:none` → 401; `/API/System/Firms`: publisher 403, firm 403, no token 401, owner 200; trailing slash and HEAD run as GET; `//firms`, `firms%2F<id>`, unknown or SQL-looking id → 404; 101-character `q` → 400; 3 parallel lists → 200.
- Timing: a list over 254 firms takes 1.2-1.5 s; one firm takes 9 ms.
- The graph tool (G3) says `GET /system/firms/:id` has no test. That is the tool's blind spot: it misses template-literal paths. DW5 and DW7 do call this route.

## API journeys walked (Support, Auditor, Content publisher, firm staff)
1. Support lists the firms, then filters `?health=attention`: HELD comes first, then ATTENTION, each with its plain reasons. Usage equals PF-15's reads (DW2).
2. Auditor opens one firm: its figures, one PF-4s line, and one `platform.bypass` line on that firm only.
3. The publisher, firm staff and anyone without a token are refused in words, and no figures leak.
4. Wrong input (`?health=GREEN`, `page=0`, a repeated filter, an unknown id) is refused in words. Nothing returned 500.

## The builder's three choices
- **(a) Per-firm audit: I agree; the tech lead still has to confirm it.**
  - `firm-scope.ts` keeps `platform` for uses that touch no firm's rows. This use reads every matching firm's staff, invitations and cases, so `per-firm` is the only mode the file's own rules allow (`firm-scope.ts:122`).
  - The sort and the `?health=` filter need every matching firm's health. So a line on each firm read is true even for firms not on the returned page.
  - The cost is on each firm's own trail: N lines per list call (the breaker measured 400 lines per call with 400 firms).
  - The brief says to ask before choosing. The question must be answered in the PR before the label. If the ruling changes the mode, the code changes and this needs another review.
- **(b) Failed jobs shown, and they make a firm ATTENTION: acceptable.** R1.93 names failed jobs, and the brief's ATTENTION list does not. The PR body should state the widening (P-26: nothing silent).
- **(c) Unreadable queue gives count null: right to avoid a 500.** But the reason it adds turns every firm ATTENTION (m1).

## Findings

**Major**
- **M1: the authorisation on the one-firm route is not guarded by any test.**
  - Where: `api/src/platform/system-console/routes.ts:16`, and the test at `tests/check_pf17_console.ts:129-133`.
  - Failure scenario: someone edits `one()` to `@AnySystemStaff(...)` or to a wrong key. A Content publisher can then read any firm's usage and health (SA-7-11), and the suite still passes 34/34; I ran this mutation.
  - Why the suite misses it: DW1 sends the publisher only to the list. The firm token gets 403 from the plane wall whatever the key is.
  - Fix: in DW1 fail, also call `/api/system/firms/<id>` as the publisher and expect 403 `MISSING_PERMISSION`, with no figures in the body.

**Minor**
- **m1: an unreadable job queue turns every firm ATTENTION.**
  - Where: `firms.ts:169` (with `:124`).
  - Failure scenario: pg-boss is down. Every OK firm becomes ATTENTION with "failed jobs could not be read", and `?health=OK` returns nothing. A problem on our side looks like a problem with every firm, and real ATTENTION firms are lost in the noise.
  - Fix: keep `count: null` per firm, but leave health alone and say it once on the page (for example a `notices` field).
- **m2: recent failures can be missed once the dead-letter list is large.**
  - Where: `firms.ts:140`, which calls `deadLetters(10_000)`, and `jobs/pgboss-jobs.ts:226`, which reads "from its oldest 10 000".
  - Failure scenario: after more than 10 000 dead letters (the list keeps a year), the last 7 days' failures are left out. Count 0 and health OK is then a made-up 0, the very thing (c) is meant to avoid.
  - It also reads up to 10 000 rows on every list call and every one-firm call.
  - Fix: say "unavailable" when the read is cut off, or ask PF-14 for a read by date.
- **m3: `?q=%` and `?q=_` match every firm.**
  - Where: `firms.ts:100`. Prisma `contains` does not escape LIKE wildcards.
  - Failure scenario: a search for `_` lists all 254 firms, and writes 254 bypass lines.
  - Fix: escape `%`, `_` and `\` before the query.
- **m4: several queries per firm on every call (STANDARDS §5 [M] "no N+1").**
  - Where: `firms.ts:109-117` and `:131`. Per firm: 1 case count, 1 seats query, 4 `limitOf`, a walk of the file tree, and 1 audit transaction.
  - Measured: 254 firms take 1.2-1.5 s.
  - The brief forces most of it ("PF-15's own reads, never a second count"), and the Sample data stay inside §9. Record it in the PR body so part 4 knows.
  - Fix, if wanted: read `limitOf` once per plan.
- **m5: health says OK for firms that are not fine.**
  - Where: `firms.ts:160-170`. `SECURITY_LOCK`, `ABANDONED`, `DELETED` and "no live plan" (every limit 0) all give OK.
  - The status is shown and the brief's list is closed, so this is not a defect against the brief. Part 4's screen will mislead without a reason line. Record it for part 4.
- **m6: two edits outside the brief, neither stated.**
  - `tests/check_pf12b_bypass_audit.ts:74-79` was edited, but the brief says that suite should "pass unchanged".
  - `api/src/features/MODULE.rows/PF-17-1.md` is not on the touch list.
  - Both are needed: the new `BYPASS_USES` line the brief requires breaks pf12b's hard-coded list. The PR body should say so (the brief: "never widen the row silently").
- **Not a code finding:** STANDARDS §6 asks for cursor paging, and the brief asks for page numbers. Health is computed and sorted in memory, so page numbers are the honest choice. Record it in the PR body.

## Quality dimensions (API only)
- **Met:**
  - D1: every DW1-DW8 behaviour is present.
  - D2: read only; the only writes are the audit lines, and they fail closed.
  - D3: PF-15's own reads, no second count.
  - D5: a broken queue does not cause a 500.
  - D6: one PF-4s line plus per-firm lines.
  - D18: "Sample values" is in the answer.
- **Partly:**
  - D15: see m4.
  - D16: see M1. Every other rule has a passing and a failing test, and each mutation turned red.
- **N/A (no UI):** D4, D7-D14. D17 and D20 are simulated only. D19 waits for part 4.

## Fixes before Approve
1. M1: the publisher gets 403 on `/api/system/firms/:id` in DW1 fail.
2. Put in the PR body: the question for (a) and the tech lead's answer, (b)'s widening, m4, m6 and the paging note.

m1-m3 are worth fixing in this PR, but they do not block it.

Round 1 result (27e8b406a): Changes.

## Round 2: head `b6965705f91b9c6567da454d3d6f4571594a0827`, diff only
Scope: `git diff 27e8b406a..b6965705f -- prototype/studio`, which touches only `firms.ts` (+36/-12) and `check_pf17_console.ts` (+22/-2).
I ran everything in my own `git archive` copy of `b6965705f`, never in the shared checkout, with scratch databases on :54329.

**Check:** 38 passed, 0 failed, exit 0, on two runs. `tsc` shows no error in either changed file.

**Every round-1 finding is fixed, and each fix has a test that fails when the fix is removed.** I removed each fix in turn, ran the check, then restored the file from the archive:

| Finding | Fix | Mutation | Result |
|---|---|---|---|
| M1 | publisher gets 403 on `:id` | `:id` key changed to `@AnySystemStaff` | red, 37/38 (DW1 fail) |
| m1 | page-level `failedJobsNote` | put the per-firm reason back | red |
| m1 | page-level `failedJobsNote` | drop the note | red (2 checks) |
| m2 | at the 10 000 cap: count null and a note | remove the cap rule | red |
| m3 | `likeText` escapes `%`, `_`, `\` | make it a no-op | red (`?q=%` matched 56 firms) |
| m3 | unknown query keys → 400 | allow them | red |
| m5 | status reasons | drop them | red |
| m5 | "no live subscription" reason | drop it | red |
| m5 | status reasons | give a reason to ACTIVE firms too | red: DW3 fail and m1 |

**Extra probes** (a temporary file, deleted afterwards). A firm named `Fifty_Fifty 100% Back\slash Firm` is still found by:
- `_Fifty`, `Fifty_F`, `y_F`
- `100%`
- `back\slash`

`0%25` finds nothing, which is correct. So the escaping keeps literal search working.

Other probes:
- An empty `q` and `page=1` → 200.
- One firm with an extra query key → 200. The key rule applies to the list only, which is right: `one()` takes no query.

**Notes for the PR body (not findings):**
- `firms.ts:166-178` widens the brief's ATTENTION list. A `DELETED` or `ABANDONED` firm now stays in ATTENTION for good: its status reason and "no live subscription" both apply. The tech lead may prefer to leave them out; that is a product choice, not a defect.
- At exactly 10 000 dead letters the count is reported unavailable, even though nothing was cut off. That errs on the safe side; keep it.
- m4, m6 and the paging note still belong in the PR body, as agreed.

**Choice (a), one audit line per firm (`firm-scope.ts:122`):** unchanged, and I still agree with it. The brief asks the tech lead to decide this, and the ruling is still pending. Do not add the label before the ruling is in the PR. If the ruling changes the audit mode, the code changes and needs another review.

No Blocker or Major is open. Head reviewed: b6965705f91b9c6567da454d3d6f4571594a0827.

Round 2 result (b6965705f): Approve.

## Round 3: head `47716a7d3737945cd738ff77f76a472aec14ec40`, diff only
Scope: `git diff b6965705f..47716a7d3 -- prototype/studio`, which touches only `firms.ts` (+24/-8) and `check_pf17_console.ts` (+15/-6).
Why it changed: Lead 4's ruling (15:42 IST):
1. Keep the per-firm audit line for every firm a list call reads.
2. Keep pf12b's extra line and the card row.
3. Keep failed jobs, labelled Sample. Locked firms and firms with no live subscription are ATTENTION. Deleted or abandoned firms are CLOSED.

The builder also fixed two of the breaker's round-2 Minors (r2 m4 and r2 m5).
I ran everything in my own `git archive` copy of `47716a7d3`, never in the shared checkout, with scratch databases on :54329 (Postgres was up after its restart).

**Check:** 41 passed, 0 failed, exit 0, on two runs. `tsc` shows no error in either changed file.

**The ruling is met in the code.**
- `HEALTH` is `HELD, ATTENTION, OK, CLOSED`. That is also the sort order, the `counts` keys and the values `?health=` accepts.
- A `DELETED` or `ABANDONED` firm returns early as CLOSED with that one reason (`firms.ts:179`). It stays off `?health=attention`.
- `SECURITY_LOCK` and "no live subscription" are ATTENTION.
- Failed jobs are still labelled Sample (`FAILED_JOBS_DAYS`, and the `samples` text).
- The audit mode (`firm-scope.ts:122`) and pf12b are unchanged, as the ruling says. With the ruling now in, my round-1 condition on choice (a) is met.

**Mutations: each new rule turns the check red.** I removed or changed each rule, ran the check, then restored the file from the archive:

| Mutation | Result |
|---|---|
| CLOSED early return removed | red, 3 checks (closed pass, closed fail, DW8 order) |
| CLOSED keeps the other reasons | red (exactly one reason) |
| CLOSED sorted before OK | red (DW8 order) |
| `counts.CLOSED` missing | red |
| `?health=closed` refused | red (the check stops) |
| ABANDONED no longer CLOSED | red, 2 checks |
| the 400 echoes the unknown key | red (r2 m4) |
| "failed jobs not counted" turns the firm ATTENTION | red (m1 check) |
| "failed jobs not counted" reason dropped | red |

**Minor (not blocking)**
- **r3 m1: the PROVISIONING reason has no test.**
  - Where: `firms.ts:170`, `STATUS_SAY.PROVISIONING`.
  - I dropped it and the check stayed green, 41/41.
  - Failure scenario: a later edit removes it, and a firm still being set up that already has a live subscription shows OK. If it has no live subscription yet, "no live subscription" still makes it ATTENTION, so the harm is small.
  - Fix: add one firm in `PROVISIONING` to the DW3 checks, or drop the extension. The ruling names only locked and no-subscription firms.
- **r3 m2: three code comments still list the old health values, without CLOSED.**
  - Where: `firms.ts:69` (the query doc: "HELD, ATTENTION, OK"), `firms.ts:89` (the `list()` doc: "sorted HELD, ATTENTION, OK"), and `routes.ts:11` ("HELD then ATTENTION then OK").
  - Effect: the code is right, but a reader, or part 4's builder, is told the old order and set.
  - Fix: add CLOSED to all three, in this PR or in part 4.

No Blocker or Major is open. Head reviewed: 47716a7d3737945cd738ff77f76a472aec14ec40.

Reviewer: Approve 47716a7d3737945cd738ff77f76a472aec14ec40
Verdict: Approve
