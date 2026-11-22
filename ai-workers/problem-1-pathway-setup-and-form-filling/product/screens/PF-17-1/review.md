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

Verdict: Changes
