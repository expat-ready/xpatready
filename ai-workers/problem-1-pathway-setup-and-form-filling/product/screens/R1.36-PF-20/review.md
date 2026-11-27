**Verdict: Block** (on the skill's scale, Ship after fixes: two Majors are open and there is no Blocker; this is not a rework)

# R1.36 / PF-20 part 1 review: automation engine (schema and API, no screen)

Reviewed commit `4ecd8ab2745377054e87d791b6bd54cb08c36dde` (PR #3646, branch `claude/trusting-mendel-00aq0p`), diff `origin/main...4ecd8ab27`. I checked it against the BACKLOG rows PF-20 and FO-12a (Done when, rev 11), AG-2-31, AG-2-33, `STANDARDS.md` and `RULES.md`. I am an independent reviewer and did not build this part. There is no screen, so the concept fit, BIC-01–20 and the 1024 px / keyboard checks are **N/A**.

**Ran (pinned at 4ecd8ab27, in a scratch worktree):**
* `check_pf20_engine.ts`: 21/21.
* `check_pf12_walls.ts`: 110/0.
* `run-suites --only "check_pf12_walls.ts check_pf3_platform_schema.ts"`: 110/0 and 75/0. This ran on the builder's newer head e32487828, where only the migration's folder name and one check changed.
* An isolated copy on runtime port :4438 (never :4400) for the HTTP walk.
* Two scratch race scripts, now deleted.
* Ten mutations, each reverted.

## Major

**M1. A run enrolled while the recipe is being switched off survives the off, and its queued steps send when the recipe is switched on again.** I reproduced this.
* Cause 1: `enrol` reads `auto_recipe.on` with no lock (`engine.ts:107-108`).
* Cause 2: when the Conductor finds the recipe off, it cancels only that one step and leaves the run RUNNING (`engine.ts:175`).
* Scenario, on a scratch DB with every migration:
  1. `setOn(false)` holds the recipe row FOR UPDATE and has already run `#endRuns`. It finds 0 runs.
  2. `enrol` runs in a second transaction. It reads `on = true`, because the off is not committed yet, and blocks on the FK's KEY SHARE lock.
  3. The off commits, and then the enrol commits.
* Result: `off: endedRuns 0, cancelledSteps 0`, `enrol: started true`, recipe `on=f`, run `RUNNING`.
* At step 1's time the step was `CANCELLED: recipe switched off`, the run was still RUNNING, and steps 2 and 3 were still QUEUED.
* After `setOn(true)`, at step 2's time: `SUCCESS`, outbox `SENT`. A queued send from before the off went out, which breaks the row's "switching a recipe off stops queued sends".
* **Fix:**
  * In `enrol`, read the flag with `SELECT "on" … FOR SHARE`. This conflicts with setOn's FOR UPDATE, so one of them waits for the other.
  * In `runStep`'s recipe-off branch, end the whole run (`#endRuns(tx, firmId, { id: run.id }, EXIT.RECIPE_OFF, STEP_REASON.RECIPE_OFF)`).
  * Add a test that fails today: a RUNNING run on an off recipe → step 1 at its time → the run is ENDED "recipe switched off" and nothing sends after the recipe is switched on again.

**M2. Four built rules have no test that fails when the rule is removed** (STANDARDS §7 [M] "A rule's test fails when the rule is removed"). All four are FO-12a/PF-20 Done-when lines. In each mutation below I removed the rule and the suite stayed **21/21**:
* `engine.ts:175`, the recipe-off check in the Conductor.
* `engine.ts:178`, "Ask me first" waits (FO-12a: "an Ask me first step waits for approval").
* `engine.ts:134-136`, `endRunsFor` changed to a no-op (FO-12a: "a reply ends the run and no later step sends"; AG-2-31 rule 8).
* `engine.ts:186`, the FAILED path for `MessageRefused` (FO-12a: "a step's action failing marks it Failed and retries per PF-14").

The other rules held up: removing the QUEUED re-check, STOPPED, the MARKETING class or `runsFor`'s firmScope each turned a line red.
* **Fix:** add a pass and a fail for each of the four (the code already exists), on the fake clock, in `check_pf20_engine.ts`.

## Minor
* **m1. The off's audit line and its answer over-count, and can call a sent message "cancelled".** I reproduced this. `#endRuns` lists the QUEUED steps first and only then runs `updateMany` (`engine.ts:149-153`). In READ COMMITTED a step the Conductor is sending is still listed, but the update then skips it.
  * Scenario: hold `runStep` in `send`, call `setOn(false)`, then release.
  * Result: the step is `SUCCESS` with outbox `QUEUED` (it is dispatched after the off), but the audit line says "2 running, **4** queued messages cancelled". Only 3 were cancelled.
  * Fix: `SELECT id … WHERE state='QUEUED' ORDER BY id FOR UPDATE` (or `UPDATE … RETURNING id`) and count what was really changed. Taking the locks in id order also avoids a possible deadlock with a withdrawal-ending `runStep` (I did not reproduce that).
* **m2. No test reaches either route.** Graph G3 names `GET /platform/automation/recipes` and `POST /platform/automation/recipes/:key/on`. I walked both by hand and they answer correctly (see the journey report). Add a server-level pass and fail: 403 for a Case Officer, 404 for an unknown key, 422 for a strict body.
* **m3. `check_pf20_engine.ts:38` runs as `xr_studio`, which is a superuser (`rolsuper = t`).** So the engine's writes (`ensure`'s raw INSERT, `enrol`, the Conductor) are never run under PF-12's walls as `xr_app`. Precedent for running as `xr_app`: `check_fo1p_person_port.ts`. The live app's first recipe write comes only in part 2, so run at least DW2 and DW4 as `xr_app`.
* **m4. Done-when lines that are neither built nor named in "Not in this part" (Q3):**
  * A quiet person is never enrolled (AG-2-31 rule 4, AG-2-59; FO-12a).
  * "Every change through AuditPort" (FO-12a). Only on/off is audited, not enrolment, skips or run ends (AG-2-33 §7 "Audit: … each skip"). They are kept as row reasons.
  * Fix: name them in Q3, together with the part that takes them (no new code asked here).
* **m5. Carry-forward for PF-20 part 2 ("Ask me first" approval):**
  * When an Ask step is the last step, the run ends "last step done" while the step still waits (`engine.ts:170-171`).
  * `#endRuns` cancels only QUEUED steps, so after an off an AWAITING_APPROVAL step stays open on an ENDED run (`engine.ts:151`).
  * Approval must check the run and the recipe first.

## What held
* Ordering against a running step: the step-run row lock plus the QUEUED re-check close the off-then-job race. Run order is equivalent to job-before-off or off-before-job, and the gate checks again in the PF-19b worker.
* No path sends without consent. Every send goes through `MessagePort.send`, the gate runs at send time and again at dispatch, and a person with no consent is SKIPPED with `NO_CONSENT: MARKETING`.
* The STOPPED regex matches the gate's real reasons (`WITHDRAWN`, `ADDRESS_UNSUBSCRIBED`, `SUPPRESSED: UNSUBSCRIBE|STOP|COMPLAINT`; `ports/consent.ts:142-145`).
* Duplicates:
  * The partial unique index gives one RUNNING run per person.
  * `ensure` uses ON CONFLICT.
  * A job run twice sends once (row state plus the outbox idempotency key).
* Firm scoping:
  * Every query is scoped or keyed by `(firm_id, id)`, with composite foreign keys.
  * All four tables are walled (110/0).
* The migration is additive, checks hold the data rules, the rollback is recorded, and migrate diff is empty.
* The audit line is written in the same transaction and has before and after.
* Problem answers are plain. Authorisation is server-side and deny-by-default.

## D1–D20 (independent reviewer, script and API evidence; 1–5)
D1 4: the row's three promises are built, with M1 as the gap · D2 2: M1 and m1 give wrong state or counts under a race · D3 5: reuses MessagePort, ConsentPort, JobPort and AuditPort · D4 4: step modes and reasons resolve · D5 3: idempotent, but a crash between commit and schedule strands a run (deferred sweep, named) · D6 4: the on/off audit names actor, before and after · D7 N/A (no AI) · D8–D14 N/A (no screen) · D10 4: the API's problem texts are plain · D15 5: routes answer in 8–32 ms, no per-row queries · D16 2: M2 · D18 4: the sent row names the consent that allowed it · D19 Not yet evidenced (part 1 of 6) · D17, D20 not applicable here (no screen; an unaided user walk stays with the founder).

**Journey (reviewer): 8.5/10, pass.** Report: `journey-test-reviewer-2026-11-25.md`.

**Could not check:** the real PF-14 runner (pg-boss) retries (fakeJobs never retries); the engine under `xr_app` (m3); a real recipe over HTTP, because none is registered until part 2.

**To fix before Approve:** M1, M2. Then m1–m4 (m5 goes to part 2).

Reviewer: Changes 4ecd8ab2745377054e87d791b6bd54cb08c36dde
