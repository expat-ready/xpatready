# PF-17 part 4, PR A (API and start-up; R1.93): independent review, 24 Nov

Reviewer: a fresh context that did not build it. Head reviewed: `34f58ea0b4be249431cf1f793538b43e9f36b916` (#3470, branch `claude/festive-hawking-3i8mgi`); diff `git diff origin/main...HEAD -- studio/` (13 files, +276 −28). App = `prototype/studio`.
Read: concept r2 (§3 BR-3/4/5, §6, §7 Q4), `challenge.md` (M1, M2, m1), `handover.md` (m1-m3), Lead 26's approval comment, STANDARDS, QUALITY. PR A builds no screen, so the screen parts of the skill (keyboard, 1024 px, BIC table, look) are **N/A here** and go to PRs B and C.

## Round 3 (log fix, diff only; head `bdab2d27cb45abe713beb4dad9a91f6f0e189293`): the current verdict
Lead 28 on #3470 asked for this. The fix answers batch #3485's "no personal data in logs" failure (SA-11 BR-16). I checked only `git diff 1d2cf9221 bdab2d27c` (3 files, +15 −6).

**Verdict: Approve.** The leak is closed and DS6 is a real failing test.

**The leak is closed.**
* `seedSampleSystemStaff` now returns `{ added: number }` (`sample-staff.ts`).
* The start-up line is `platform: Sample ExpatReady staff added: <n>` (`sample-seed.ts:49`). No email reaches it.
* The refusal message (`SampleStaffRefused`) carries only the setting's name.

**DS6 is a real failing test.**
* It captures `console.log`, `warn` and `error` around the two concurrent seeds and restores them in `finally`.
* It fails on any email address in any captured line. It also requires a staff line saying `added: N`, so a silent seed cannot pass it.
* I put the emails back into the line on a scratch copy: DS6 went red (`added: 2 <email> <email>`). With the line restored, `check_pf17_demo_signin` passes 16/0.

**A copy scanned by me:**
* I started `isolated.sh rvlog 4451` with both stand-ins. A Sample sign-in answered 200 and an unknown email 401.
* Log line 2 reads `…staff added: 2`.
* After stopping the copy, `scan-logs.ts var/isolated-logs/rvlog-api.log` answered "0 finding(s) — ok" (exit 0).
* The only "@" in that log is a tool hint on line 1, which is not an email.

**Nothing else in PR A writes an email to a server log.**
* `live-plan.ts`, `support.ts`, `firms.ts` and `sample-staff.ts` make no log call (grep).
* The request lines carry the route and status only.
* The sign-in by email is PF-4s's existing code, and it logged no email on the copy, even on a refused sign-in.

Reviewer: Approve bdab2d27cb45abe713beb4dad9a91f6f0e189293

## Round 2 (head `d4b5ea3fbd19a95eff64b368cc1c371525a444c3`): superseded by round 3
**Verdict: Approve.** No Blocker and no Major is open; round 1's M-1 and m-1 to m-3 are closed. The delta since `34f58ea0b` is 6 files, +38 −14: tests, the MODULE row, one comment, and the seed's catch for a race.

**Suites, run by me on this head:**
* `check_pf17_console` 50/0
* `check_pf17_support` 34/0
* `check_pf17_demo_signin` 15/0, run twice to catch flakiness

**Round 1's findings:**
* **M-1, closed.**
  * DW12 now takes the first firm from `?health=OK` and asserts OK with no reasons at 0 and at 5 failed jobs (`tests/check_pf17_console.ts:341-348`).
  * My round-1 mutation now turns DW12 red, re-run on a scratch copy: an OK firm with 3 or more failed jobs goes to ATTENTION and gives `noisy:["ATTENTION",[]]`.
  * DW12 also goes red when failed jobs add a reason.
* **m-1, closed.**
  * At the cap, every firm with no entries reads 0, and the page says `failedJobsComplete:false` (:338-339).
  * Mutation "a firm with no entries reads null" turns DW10, DW11 and DW12 red.
* **m-2, closed.**
  * The known limit is in `api/src/platform/MODULE.rows/PF-17-4.md`.
  * `pgboss-jobs.ts:226` names `DEAD_LETTER_CAP`. The builder is right that only the comment carried the literal.
* **m-3, closed.**
  * The PR body now covers what was built, the checks with exit codes, and "On the demo" with the Sample sign-in.
  * Its suite counts are round 1's numbers. This needs no action.

**The breaker's Minors:**
* **Seed race, sound.**
  * `sample-staff.ts:35-41` skips only Prisma `P2002` (the unique email) and rethrows everything else. The losing start-up adds nobody and does not stop.
  * DS1 runs two seeds at once. With the catch removed, DS1 goes red (`PrismaClientKnownRequestError` on `create`).
  * The person and their grant are one nested create, so a race cannot leave a person without a role.
* **DW13, sound.** The Firms list, one firm and `livePlanOf` agree in each of three states: active (a plan), `PAYMENT_HOLD` (a plan) and only `ENDED` (null). The test restores the status afterwards. Together with SQ-plan, both pages are now held to the helper in all three states.
* **SQ-plan role check, sound.** It is a pure read of `plat_system_role_permission`: every `system/support:list` role must also hold `system/firm:read`. Today the list is empty, which is correct.

**What the delta could break: nothing found.**
* No route, type or SQL changed.
* The DW12 and DW13 changes clear the dead-letter list and restore the subscription, so later checks start clean.
* Neighbouring suites are unaffected: the delta touches only the seed's error path.

**Journey score: unchanged at 9.4/10.** The delta changes no behaviour a user meets. The one ½ (next step obvious) now has its fix in the PR body.

Reviewer: Approve d4b5ea3fbd19a95eff64b368cc1c371525a444c3

## Round 1 (head `34f58ea0b`), kept as written

### Verdict (round 1)
**Verdict: Block.** On the screen-review scale this is **Changes (Ship after fixes)**: one Major, a small test fix. The code behaves correctly. One acceptance test (DW12) does not prove its rule, and that breaks an [M] line of STANDARDS. Fix it and the three Minors, then re-review the new head.

## Suites (run by me on this head, PostgreSQL 127.0.0.1:54329, never :4400)
`check_pf17_console` **49/0** · `check_pf17_support` **33/0** · `check_pf17_demo_signin` **14/0**. Neighbours, also green: `check_pf14_jobs` 95/0, `check_pf24w_environment` 28/0, `check_pf23m_log_calls` 15/0. `check_pf4_identity` part B needs its own copy on :4541, which I did not start.
**Mutation spot-checks** (scratch copy; STANDARDS line 48, "a rule's test fails when the rule is removed"). Each change turned at least one test red:
* cap test off by one (`<` → `<=`, firms.ts:186);
* a failed read reported as complete (:188);
* the read asking for the reader's default of 100;
* queue plan always null (support.ts:122);
* the ticket without a plan (:148);
* `livePlanOf` hiding a payment-hold plan;
* the seed's environment check removed (sample-staff.ts:22);
* the loader's stand-in guard removed (settings.ts:158);
* the "(Sample)" label dropped.

**One change survived:** M-1.

## Findings
### Blocker
None.

### Major
**M-1. DW12 (m3, BR-3 "failed jobs are shown, not judged") cannot catch the rule it exists for.**
* Concept §6 fixes the test as "a firm OK in every fact with 5 failed jobs → `health:"OK"`, `reasons:[]`".
* The test uses firm S, which at that point is already **ATTENTION, "seats over the limit"** (I logged this from the suite).
* It then only asserts that health and reasons are equal before and after (`tests/check_pf17_console.ts:340-344`).
* I added the very rule BR-3 forbids: 3 or more failed jobs turn an OK firm to ATTENTION (in `firms.ts` `figures`, :222-229). The suite stayed **49/0**.
* **Fix:** run DW12 on a firm that is OK in every fact (lift firm S's seat overage first, or use a fresh Sample firm). Assert `health === "OK" && reasons.length === 0` both before and after the 5 failed jobs. Keep the equality check.

### Minor
**m-1. DW11 at the cap never checks a firm with no entries.**
* Concept §6 includes "a firm with none reads 0 with the flag", but at the cap both firms hold one entry (`check_pf17_console.ts:330, 334`).
* **Fix:** at the cap, assert that a firm with no entry answers `failedJobs: 0` and the page answers `failedJobsComplete: false`. This is the case behind the screen's "0+".

**m-2. The known limit is not recorded where the challenge asked.**
* Challenge m1 wanted "past the cap, the newest failures are left out; paging is PF-14's" in the MODULE row.
* `api/src/platform/MODULE.rows/PF-17-4.md` says only "false when the read reaches `DEAD_LETTER_CAP` … or fails". The fact is in the `firms.ts` header only.
* `pgboss-jobs.ts:226` still writes "oldest 10 000" as a literal number.
* **Fix:** add a Known limit clause to the row, and make the doc line name `DEAD_LETTER_CAP`.

**m-3. The PR body is still step 1's (the concept).**
* It says "No code yet" and "On the demo: nothing yet", and gives no checks or results for PR A (WAY-OF-WORKING "Body").
* **Fix:** describe what PR A built, the three suites with counts and the card rows. Add "On the demo: API only; after merge `start.sh` turns our stand-in on and `ops.sample@` / `support.sample@expatready.example.com` can sign in; the pages come in PR B".

## Lead 26's demo sign-in terms: met
* **Refused at start-up outside local.**
  * `settings.ts:158` refuses `PLATFORM_SYSTEM_IDENTITY=local` outside local. Seen live: a copy restarted with `PLATFORM_ENVIRONMENT=test PLATFORM_SYSTEM_IDENTITY=local` stopped with `ConfigRefused` naming that setting.
  * The seed is refused by its own decision (`sample-staff.ts:22`: it throws and writes nothing) and again by the hook's condition (`sample-seed.ts:49`).
  * DS2 and DS3 go red when either guard is removed.
* **People labelled Sample:** "Platform Owner (Sample)" and "Support (Sample)" on `expatready.example.com`. DS4 goes red without the label.
* **No password or token in git:** sign-in is by email plus the second step, the stand-in's key stays random per start (no `PLATFORM_SYSTEM_LOCAL_SECRET`, DS5), and the source holds no secret-like value (DS4).
* **The demo gets it:** `.github/workflows/demo-update.yml:36` restarts through `start.sh`, and `start.sh:18` defaults the stand-in to local. Challenge M1 closes on merge.
* **Idempotent:** a restart logged `{"added":[]}`, and DS1 shows a changed role is kept. Isolated copies seed only when passed the setting, so builders' suites are unchanged.

## "Two pages cannot disagree" (BR-5, challenge M2): enforced
* **One helper:** `system-console/live-plan.ts`. `firms.ts:213` and `support.ts:122` both call it; support's list, ticket and reply all reach it through `ticket()` :148. The old per-metric loop is gone.
* **`seats` alone loses nothing:** in `platform_entitlement_limit` (`20261121130000_pf15b_plan_booking`), the plan code and name come from the live subscription's plan through a LEFT JOIN on the limit row. The plan depends on neither the metric nor `now`, so part 1's plan figure cannot regress.
* **Live check on my copy:** the queue row, the ticket and the Firms page gave the same answer in each state. Active: Solo (Sample). `PAYMENT_HOLD`: Solo (Sample), with the Firms page saying HELD, "on payment hold". Only `ENDED`: null on all three.
* **Tests:** SQ-plan proves it with a pass and a fail, plus a static check that both files call the helper.

## Plan reads inside the queue's bypass transaction: sound
* All reads run inside the existing `asBypass(SUPPORT_QUEUE | SUPPORT_TICKET, … $transaction)` (support.ts:78, :93, :108).
* They are sequential `await`s, at most 50 firms a page, with no nested `asBypass`, so PF-12b's "one use at a time" holds.
* They go through PF-15's SECURITY DEFINER function. It allows every firm only while the session has no firm, which is the case on `/api/system/*`.
* They write no per-firm audit line; DW6 still passes.
* **Cost:** the Firms page makes 5 definer calls per firm instead of 4, accepted for one source. Timings on the Sample data: queue 35 ms, firms 69 ms.

## m1's flag (BR-4): honest at the cap and when the read fails
* At the cap: `complete: letters.length < DEAD_LETTER_CAP` (firms.ts:186), with the cap imported from PF-14 (`pgboss-jobs.ts:35`). PF-14's reader maps rows without filtering, so the length is the number read.
* On a failed read: `counts: null, complete: false`, and figures stay `null` (never 0).
* The flag sits on the page and on `/:id` only, as the challenge asked.
* m2 (DW10 asks for the cap) holds, and each of its cases goes red under mutation.

## Parts 1 and 2: no regression found
Both suites pass unchanged. `FirmRef.plan` and `FirmsPage.failedJobsComplete` are additive, and nothing in web, contracts or other code reads these types yet (grep).

## Journey score (reviewer, the one score for this check)
**9.4 / 10** (7.5 of the 8 criteria that apply, scaled; accessibility and visual quality are not evidenced in an API-only PR). Pass. Report: `journey-test-reviewer-2026-11-24.md`.

## Not checked
* Browser, keyboard, axe, 1024/1440/375 and BIC (no screen: PRs B and C).
* j_93 W2/W4 (screen lines).
* `check_pf4_identity` part B.
* Graph G3 lists `GET /system/firms/:id` as untested. That is a tool limit: the suite calls it through a template string at :331, and the route is part 1's.
* D17/D20 stay with the founder.

**Fix list for Approve:** M-1 (required); m-1, m-2, m-3 in the same round.

Reviewer: Changes 34f58ea0b4be249431cf1f793538b43e9f36b916
