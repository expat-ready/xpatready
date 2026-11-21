# PF-12b part 4 review (QA-697): the outbox sweep's firm-less read writes one firm-null platform.bypass line

Reviewed commit `deb5389090c1cac4eaabd17cd70791b794e85581` (branch `claude/runtime-pf12b4`). I read only `git diff 1b5e6ac14 deb53890`.
I checked it against Lead 16's ruling on #2845 (QA-697 Major) and its Done-when: "a test fails if the sweep queues a firm-less send without that line".
I am a fresh session that did not build this row. Postgres was on :54329. The isolated copy used runtime port 4434, never :4400. This is a backend row with no screen, so the screen-only parts of the skill are N/A.

## What I ran (shared tree, clean, HEAD = deb53890)
- `tests/check_pf12b_bypass_audit.ts` **70/0**. The three PF-12b4 lines are at test:380, :391, :397.
- `check_pf19p_platform_mail` 68/0 and `check_pf19b_sending` 42/0. I did not re-run the builder's other suites.
- `product/tools/typecheck.mjs`: **PASS** (15 known errors, none new).
- **Mutation A** (my own run of the builder's mutation): I removed the `touchPlatform` call at `send/messages.ts:324`. Result **68/2**: PF-12b4 pass and PF-12b4 fail both turn red. The Done-when holds.
- **Mutation B:** I made the line unconditional (dropped `if (pick.length)`). Result **68/2**: the PF-12b4 idle test and DW7's real-DB count both turn red. So the "no line when idle" rule is guarded twice.
- **Real copy `rv_pf12b4`**, with the real pg-boss and the real AuditPort. Details are in the journey report.
  - One due PLATFORM_ACCOUNT row gave exactly one line: firm_id NULL, `system:job:messages.outbox_sweep`, SYSTEM, entity `bypass use`, detail `{use, step: "sweep.platform-rows", key: null, method: "none"}`. The send was then queued.
  - With an owner trigger refusing that one line: no send was queued, the row stayed `QUEUED`, `messages_sweep_platform_skipped` was logged, and the sweep job went to `retry`.
  - After I dropped the trigger, the retry queued the send and wrote the second line.
  - Two idle sweeps after that added no line.
  - I removed the trigger and stopped the copy (its database was dropped).

## The judgement call: a line only when the sweep will queue, not on every read
**This meets the ruling.** My reasons:
- The Done-when is about queuing ("queues a firm-less send without that line"), and the tests pin exactly that.
- `job:messages.outbox_sweep` is a per-firm use. Its rule on main, accepted in part 1, is that a row read but not acted on writes no line (`messages.ts:302-305`: "a retry row still waiting is read but not acted on, and writes no line"). Part 4 applies the same rule to the firm-less branch.
- An idle read returns no firm-less record, so nothing crossed the wall that a line could name. A line on every run would add about 1,440 empty lines a day to an append-only trail.
- Precision: the line is written when the read **picks** rows (`:324`), before `enqueue` (`:329`) knows whether the key was free. That is safe in one direction only: it can record more than was queued, never less (m1).
- Recommendation: state this reading under "Questions" in the PR body, so Lead 16 confirms it against the words "each firm-less read". It is not a review blocker.

## Focus questions
- **Ordering, firm branch then platform branch.** The firms' lines and enqueues (`:306-309`) run before the platform transaction (`:316`).
  - A failed platform line does not undo a firm's queued send. That is correct: they are separate parties, as with firm B in part 1.
  - `throw error ?? platformError` (`:330`) throws the firm's error first, and both skips are logged.
  - A non-BypassNotRecorded error inside the platform transaction (for example a pool timeout) is rethrown at once (`:326`) and hides the firm `error`. The firm skip is already logged and the job fails either way, so nothing is lost.
  - If a firm enqueue throws, the platform branch does not run that minute. That behaviour was already on main.
- **Transaction length.** The transaction holds one read and one insert:
  - the read is 3 columns, `take 2000`, on `@@index([firmId, state, createdAt])`, which serves `firm_id IS NULL AND state = 'QUEUED'`;
  - the pick is done in memory, and the insert is the workspace lookup plus the line.
  - It runs under Prisma's default interactive limits (5 s timeout, 2 s maxWait). `enqueue` runs outside the transaction, so no pg-boss call happens while the connection is held.
  - Measured on the copy: sweep `durationMs` was 24 and 43.
  - Firm-less rows are sign-up verification mails, so few are QUEUED. Acceptable as is. A possible tidy-up: read outside, open the transaction only when `pick.length` is non-zero. Not required.
- **Retry of a failed sweep.** pg-boss retries 3 times with a 30 s backoff (`pgboss-jobs.ts:45`), and a key never queues twice (`pgboss-jobs.ts:7`).
  - So the retry re-reads the firm rows, gets `queued: false` for each, and sends nothing twice.
  - The platform rows that the failed run did not queue are queued by the retry. I saw this on the copy (`retry_count` 1, send queued at 09:53:06).
  - Side effect: the retry rewrites each firm's line, because `touchEachFirm` cannot know the key is used. The same happens on main whenever a firm's line fails. Over-recording only.
- **Does the PF-12b1m sweep test (test:372) still mean what it says?** Yes.
  - Its line check reads `sweepRec.entries`, the firm-shaped entries only, and its `failOn` refuses only firm B. So the new firm-less line neither breaks it nor is hidden by it.
  - "Retried as a platform job with no touchFirm" is still true. The title is now incomplete (m3).

## Issues (no Blocker, no Major)
- **m1 (Minor, Should): the comment and the test title say "queues" where the code means "picks".** `send/messages.ts:313-314` says "A read that queues nothing writes no line", and the test:380 title says "queuing the firm-less send wrote".
  - A picked row whose hour key is already used (its job still waiting, or a failed sweep's retry within the hour) writes a line and queues nothing.
  - Fix: say "a read that picks no row to queue writes no line", or accept it as worded. No behaviour change is needed.
- **m2 (Minor, Should): the PF-12b4 pass leans on the PF-12b1m run for "a send was queued".** test:380 does not itself assert `platJobs.length === 1`. Also, `platLines[0].firmId === undefined` is always true with the fake recorder (a case-shaped entry has no `firmId`).
  - No suite checks the sweep's line on the real AuditPort: DW7's real sweep has no platform row due. My copy walk covers it for this commit.
  - Fix: assert the platform job inside the PF-12b4 pass. Optionally, add one real-DB due platform row to DW7 and check `firm_id IS NULL`.
- **m3 (Minor, Should): the PF-12b1m title (test:372) predates part 4.** Fix: add "(its firm-less line: PF-12b4 below)" so the two lines read as one run.
- **m4 (Minor, optional): `firm-scope.ts:115`'s `why` names only "every firm's stuck rows".** It now also reads, and audits, firm-less PLATFORM_ACCOUNT rows. One clause would make the list say so.
- **Note, not this diff:** the sweep's lines carry `correlationId: null`. A recurring run's id `job:messages.outbox_sweep:at:<minute>` fails `CORRELATION` (`firm-scope.ts:198`, job:<uuid> only), so a line cannot be joined to its run's log. This applies to firm lines on main too. It is for qa, not this row.

## Scores (D1–D20; backend row)
- **D1 9:** the ruling is met. The judgement call matches the Done-when and part 1's rule (Lead to confirm the wording).
- **D2 9:** the line and the read share one transaction, and enqueue happens only after it commits. Fail-closed on the copy.
- **D5 9:** a failed line queues nothing and fails the job. The retry recovers with no duplicate (keys).
- **D15 9:** idle minutes add no line. One indexed read plus one insert when due.
- **D16 8:** pass, fail and idle tests, each killed by a mutation. m2: the pass relies on a neighbour's assertion.
- **D18 8:** MODULE card invariant updated, and `MODULE.rows/PF-12b4.md` names the suite. m1 wording.
- **N/A:** D3, D4, D6, D7, D19; D8 to D14 (no UI). **D17 and D20:** simulated only. **BIC-01 to BIC-20:** N/A (no case-side screen).
- **Graph (P-86):** not run. `graph.mjs` always rewrites `qa/graph.json`, which is outside my write scope. The suite is named in `MODULE.rows/PF-12b4.md`.

## Journey score (reviewer, the one score for this check)
**9.5 / 10, pass.** Details: `journey-test-reviewer-2026-11-21.md`.

## Could not check
- The PR body and CI on GitHub.
- The builder's other suites (pf12_walls, pf12b_doors, pf19b3, pf19r_every_sender) at this commit: not re-run by me.
- A real mail send: the rows I inserted had no rendered file, so they ended `FAILED content changed`, as designed.

**Verdict: Approve deb5389090c1cac4eaabd17cd70791b794e85581.** No Blocker or Major is open. m1 to m3 are recommended in the next push, or can be recorded for later.

Reviewer: Approve deb5389090c1cac4eaabd17cd70791b794e85581

## Re-review: 6d3471166f67b7d3605e1582e47a9a3b0d69d149 (diff `deb53890..6d347116` only)
What changed: f9df4575 adds the breaker's report (records only). 6d347116 changes a comment, the tests, one `why` string and the MODULE card, and commits my two reports unchanged (both byte-identical to what I wrote). No behaviour change: the sweep's code at `send/messages.ts:316-332` is the same as at deb53890.
- **m1 (and the breaker's m1): closed.** The comment (`messages.ts:313-316`) now says the line is written when the read picks a due row; a picked row whose hour key is already used is still lined ("added, never missed"). The test title says "picking and queuing", and MODULE.md says "when its read picks one due". These now describe the code.
- **m2: closed.** The PF-12b4 pass (test:380) now asserts `platJobs.length === 1` and `typeof workspaceId === "string"` itself. The `firmId === undefined` check stays, but it no longer carries the meaning.
- **m3: closed.** The PF-12b1m title says "(its firm-less line: PF-12b4 below)".
- **m4: closed.** `firm-scope.ts:115`'s `why` names "the firm-less PLATFORM_ACCOUNT rows due a retry (PF-19p; their firm-less line: PF-12b part 4)".

Runs at 6d347116 (a scratch worktree, since removed):
- `check_pf12b_bypass_audit` **70/0**.
- Mutation A again (line removed at `:326`): **68/2**. The PF-12b4 pass (now also via its own job assertion) and the PF-12b4 fail both go red.
- `typecheck.mjs` in that worktree: 8 "new" errors, all `ajv` and `@anthropic-ai/sdk` imports not found under `prototype/p2` and `contracts/portal-capture.ts`. The cause is my scratch worktree, which linked only the studio's node_modules. None is in a touched file, and at deb53890 in the shared tree it was PASS.

Still open: none from this review. The correlation-id note stays for qa (not this row). Lead 16 should still confirm the "picks" reading (now stated in the code and the MODULE card) against "each firm-less read".

Verdict: Approve 6d3471166f67b7d3605e1582e47a9a3b0d69d149
