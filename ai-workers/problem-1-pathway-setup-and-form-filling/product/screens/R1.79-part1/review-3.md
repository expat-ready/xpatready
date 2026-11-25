# R1.79 part 1 (CS-R1 part 1): review, round 3 (diff only)

PR #3642 · head `d8cc68eb13aac8e2c5d2bfc6115008da76524f98` · diff `bfd4ae9cc..d8cc68eb1`. The tech lead allowed this round on the PR (Lead 5, 25 Nov 11:17 IST). The reviewer did not build it.

The only code change is to `studio/tests/check_csr1_reports.ts`. The other three files are review records: `review-2.md`, `break-report-2.md` and the round 2 journey test. `api/src/` has no change.

**Verdict: Ship → Approve.** N1 (a) and (b) are each now caught. No Blocker or Major is open. Journey score **9.4/10**: 7.5 of the 8 criteria that apply, pass (`journey-test-reviewer-2026-11-25-r3.md`).

## What I ran
* **The PR's test**, run from `prototype/` against Postgres at 127.0.0.1:54329: **43 passed, 0 failed, exit 0** (10 s). That is round 2's 41 plus 2 new lines. I ran it once on the repo files and once on the scratch copy, with the same result.
* **Repo checks:**
  * `typecheck.mjs`: no new type errors (15 known).
  * `graph.mjs --check`: exit 0.
  * `count-any`: 416, unchanged.
  * `run-suites --changed bfd4ae9cc..HEAD --list` selects `check_csr1_reports.ts`.
* **Mutations:** each ran on a scratch copy of `studio/` in the scratchpad, never on the repo files, and each copy was restored after its run. No test databases are left behind, and the worktree is clean.
* **Dimensions:** there is no screen, so D1-D20's browser dimensions and BIC-01 to BIC-20 are N/A (they go to PF-R3). D17 and D20 were not walked by an intended user.

## N1 from round 2: is each rule now caught?
| Mutation (scratch copy only) | Result |
|---|---|
| (a) Recursive step cut (`where up.depth < 32` → `where false`) | **41/43**: both DW5 Corporate/Individual lines fail (`test:222,224`) |
| (b) Farthest Pathway (`order by combination_id, depth desc`) | **42/43**: "Corporate keeps the corporate case only" fails. The Individual line passes by symmetry (the two combinations swap groups), which is enough |
| (c) Zone hard-coded (`const zone = "America/Toronto"`) | **42/43**: the new Kolkata line fails (`test:186`); it gets Toronto's Oct 2 / Nov 2 |
| Extra: month buckets hard-coded to Toronto (`:129`) | 42/43: the Kolkata line fails |
| Extra: `node_kind = 'PATHWAY'` filter dropped | 41/43: both DW5 lines fail |
| Extra: CTE joins `p.id = x.id` (wrong column) | 42/43, caught only by the 400-combination line (`test:245`; see R3-n3) |

**N1 is closed: (a) and (b) are fixed.**

## New fixtures: valid and realistic?
* **Valid against the schema:**
  * `parent_node_key` is a real column (`pathways.prisma:26`). The PROGRAM node has a null `client_type`, as the schema intends ("PATHWAY only", `:35`).
  * `combination.program_def_id` points at the PROGRAM row, which exists, so the FK holds even with replica role on.
  * Node keys are unique per call (`csr1.<k>.*`). `name_key` is null, so the per-parent unique index does not apply.
* **The zone row is valid:**
  * `platform.time_zone` is the registered key. `'"Asia/Kolkata"'` passes `TIME_ZONE.schema`; otherwise the read would be UNAVAILABLE and the line would fail.
  * The row is deleted again right after the read (`test:185`), and an UNAVAILABLE answer still reaches the delete.
  * The arithmetic holds: c6 is 03:30 UTC on 1 Nov, which is 23:30 on 31 Oct in Toronto (EDT) and 09:00 on 1 Nov in Kolkata (checked in Postgres).
* **Realistic:**
  * combination → PROGRAM → Pathway is the real shape, and it matches `check_csc1_count.ts:78-85`. Mutation (a) fails because of that PROGRAM step.
  * The outer Pathway is not a reachable shape (R3-n2).
  * Every label is "Sample …". No immigration value is involved.
* **Coverage given up:** the old `combo()` took `null`, but nothing called it that way.

## Regressions
None. The 41 lines from round 2 pass unchanged. No app code changed. The diff adds no new `any`, no type error and no graph gap.

## Issues (ranked; all Minor, none blocks)
**R3-n1, Minor, Should: the new "before 1970" line does not catch the clamp it names (round 2 n1, part of it; not worse in behaviour, but the record overstates).**
* `test:187` asks with `from: "0001-01-01"`. Year 1 is a valid Postgres date (`'0001-01-01'::date` works), so removing the frame's `clampDay` (`case-reports.ts:49`) still passes 43/43.
* With `"0000-01-01"`, which is the case from round 2 and the breaker's m3, the same removal fails that line (42/43), and it passes on the unmutated code.
* **Fix:** change `0001` to `0000` on `test:187` (a one-character change), in part 1b with n1 or in the next push.

**R3-n2, Minor, Should: the comment says "as on real data", but the outer Pathway is a shape the editor refuses.**
* `test:66-68`: a Pathway inside a Pathway of the other type is refused by `structure.ts:84` ("A pathway is the top level under its type; it has no parent") and by BR-8 (`:89`).
* On data the editor can make, the nearest and the farthest Pathway are the same. So that level pins the rule in `groupOfCombination` (`case-count.ts:63`, `order by depth limit 1`), not a case a user can reach.
* Keeping it is right: it is the only way to tell (b) apart. The record should say so.
* **Fix:** reword the comment: "the PROGRAM step is the real shape; the outer Pathway (refused by the editor) only pins the nearest-Pathway rule".

**R3-n3, Minor (nit): the combination reuses its PROGRAM node's id (`'${c}'`, `test:75-76`).**
* This is legal, since they are two tables. But it means a wrong join (`p.id = x.id`) passes every two-combination line. Only the 400-combination line catches it.
* **Fix:** give the combination its own `randomUUID()`.

**Noted, not raised:**
* DW7's 400 combinations still sit directly on Pathways (`test:145-147`), so the read budget measures the walk at depth 0. Round 2's probe at three levels deep was 7-13 ms per metric.
* Outside the diff: the comment at `test:123` says "04:30 UTC". The value is 03:30 UTC, which is right for EDT.

## Carried, not reopened
The six open Minors go to part 1b by the tech lead's ruling: round 2's n1, n2 and m3, and the breaker's round 2 Minors. None is worse on this head. R3-n1 only corrects what the new line claims about n1.

## Could not check
* Browser dimensions, BIC, D17 and D20: there is no screen (PF-R3).
* CI on this head: I did not read it. My local test, type check and graph check stand in for it.

Reviewer: Approve d8cc68eb13aac8e2c5d2bfc6115008da76524f98
Verdict: Approve d8cc68eb13aac8e2c5d2bfc6115008da76524f98
