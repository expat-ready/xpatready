# PF-17 part 4, PR A (API and start-up; R1.93): independent review, 24 Nov

Reviewer: a fresh context that did not build it. Head reviewed: `34f58ea0b4be249431cf1f793538b43e9f36b916` (#3470, branch `claude/festive-hawking-3i8mgi`); diff `git diff origin/main...HEAD -- studio/` (13 files, +276 −28). App = `prototype/studio`.
Read: concept r2 (§3 BR-3/4/5, §6, §7 Q4), `challenge.md` (M1, M2, m1), `handover.md` (m1-m3), Lead 26's approval comment, STANDARDS, QUALITY. PR A builds no screen, so the screen parts of the skill (keyboard, 1024 px, BIC table, look) are **N/A here** and go to PRs B and C.

## Verdict
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
