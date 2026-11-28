# Break report: R1.36 PF-20 part 1 (automation tables, engine, recipe routes), PR #3646

Reviewed head 4ecd8ab2745377054e87d791b6bd54cb08c36dde. During the pass the builder committed three more times to the same checkout (now e324878283d55c859f5ed1dd3a76cb44d516e91e). Those commits rename the migration folder to `20261125100000_platform-automation__pf20_automation_tables`, rewrite the subject-kind check as a pattern (same meaning) and add a card row and `.mergify.yml`. `engine.ts`, `registry.ts`, `routes.ts` and the tests are byte-identical, so every finding applies to both heads.
How: a scratch database built from every migration. The engine ran as **xr_app** through `walledPool` and `oneQueryPerCaller`, the way the app does, with the real Messages and ConsentStore and fakeJobs on a FakeClock. Wall probes were raw psql as xr_app with `app.firm_id` set. Routes were tested on the isolated copy `brk_pf20` on :4432 (stopped, its database dropped). The PR's own `tests/check_pf20_engine.ts` passes 21/21. Scratch databases and files were removed. Cost US$0.

## Findings

**M1 (Major): switching a recipe off at the same moment as an enrolment leaves a RUNNING run on an OFF recipe. Switching back on sends from it.**
- Cause: `enrol` reads `recipe.on` with no lock (engine.ts:107).
- Sequence: `setOn(false)` locks the recipe row FOR UPDATE and ends the RUNNING runs it can see (engine.ts:90). An enrolment that has already read `on = true` waits only at its foreign-key check. It inserts its run after setOn commits.
- Repro: Automation with an AuditPort that waits 1.5 s before `record` (any slow off transaction). Call `setOn(A,"test.r",false)`. After 400 ms, `enrol` plus `schedule` a consented person. Then `setOn(false)` again, then `setOn(true)`, then advance the clock 61 min.
- Observed:
  - The enrolment returns `started:true`, and its run stays `RUNNING`.
  - GET recipes shows `on:false, running:1`.
  - A second `setOn(false)` gives `endedRuns:0`, because `r.on !== on` (engine.ts:88) skips the clean-up when the recipe is already off.
  - After switching on again, this person's step 1 is SUCCESS and the outbox row is SENT. The runs that were really ended stay CANCELLED.
  - If the recipe stays off, its steps are CANCELLED and the run ends with the wrong reason, "last step done".
- Expected: no run survives an off. Either enrol locks the recipe row (FOR SHARE) before reading `on`, or the off is repeatable (end RUNNING runs even when already off).

**M2 (Major): a step held by the daily send limit is still sent after the recipe is switched off.**
- Cause: `runStep` marks the step SUCCESS as soon as the outbox row is QUEUED. The off only cancels `auto_step_run` rows that are still QUEUED (engine.ts `#endRuns`). An outbox row held as "daily limit" stays QUEUED, and the sweep sends it later.
- Repro: enrol a consented person. Set `msg_send_counter.sent` above the cap for the firm's days. Advance 61 min: step 1 is SUCCESS, the outbox row is `QUEUED daily limit`. `setOn(false)` gives `endedRuns:1, cancelledSteps:1`. Clear the counter and advance 2 h.
- Observed: the outbox row is **SENT** after the off. The audit line's "queued messages cancelled" count leaves it out.
- Expected (R1.36 "switching a recipe off stops queued sends"): an off also stops this recipe's outbox rows not yet sent, or the step is not SUCCESS until the message is actually sent.

**m1 (Minor): `runStep` never checks `dueAt`.**
- Repro: enrol, then `runStep(A, stepRunIds[0])` at t+0 for a step due in 60 min. The same happened for the 120-min step during the race probe.
- Observed: SUCCESS, and the outbox row is written immediately.
- Expected: a step run before its time is refused or rescheduled. The job runner's timing is currently the only guard on "sends at its time".

**m2 (Minor): the registry accepts wording the database or MessagePort then refuses.**
- `OneLine` (registry.ts:19) only forbids CR and LF.
  - A subject containing TAB or U+2028 registers, and every send is FAILED "the address or wording was refused", because the MessagePort subject regex refuses control characters.
- `body` (registry.ts:26) accepts NUL.
  - With one such recipe registered, `recipes()` throws `invalid byte sequence for encoding "UTF8": 0x00` for every firm, so GET recipes returns 500 for everyone.
- Expected: the start-up refuses both, as it already refuses a key registered twice.

**m3 (Minor): `enrol` does not check its input and throws inside the caller's transaction.**
- Repro: enrol with a `STAFF` subject (the `Subject` type allows it), with a subject id that is not a uuid, and with a 2-character address.
- Observed: raw database errors (`auto_run_shape`, `22P02`). These spoil the calling module's whole transaction, for example a lead capture.
- Also: a junk address, or channel WHATSAPP with an email address, is accepted and starts a run. Every step of it then FAILS.
- Expected: `enrol` validates first (subject kind, uuid, address normalised for its channel) and returns `started:false` with a reason. `runStep(A,"nope")` likewise throws a cast error instead of returning null, so a malformed job payload loops on retries.

**m4 (Minor): `auto_step_run.outbox_id` has no foreign key.**
- The migration header (migration.sql:12) says "nothing of firm A names anything of firm B", but `outbox_id` (migration.sql:69) has no key.
- Repro: as xr_app with firm A, `update auto_step_run set state='SUCCESS', outbox_id='<firm B's msg_outbox id>', done_at=now() …`.
- Observed: accepted.
- Expected: a composite foreign key `(firm_id, outbox_id) → msg_outbox(firm_id, id)`, or the header corrected.

**m5 (Minor): a firm's copy whose steps are gone blocks the person for good.**
- Repro: delete the recipe's `auto_recipe_step` rows, enrol, then advance 2 days.
- Observed: `started:true, stepRunIds:[]`. The run is RUNNING forever and a new enrolment answers "already running".
- No route deletes steps, so this needs a direct database edit.
- Expected: no run starts for a recipe with no steps.

**m6 (Minor, from reading the code): a step's class is taken from the firm's copy, never from the registry.**
- `ensure` copies `class` once. `runStep` sends with `step.class`.
- The registry comment says a firm keeps only on/off, wording, timing and mode. Yet if a module later changes a step from SERVICE to MARKETING, existing firms keep sending it as SERVICE, without the marketing consent check.
- Expected: the consent purpose comes from the registered recipe.

## What held
- **One running run per person:**
  - 10 concurrent enrolments of one person make one run; the other 9 answer "already running".
  - The database refuses a second RUNNING run and an ENDED run with no reason (PR test).
- **Firm walls as xr_app** on the 4 tables:
  - With firm B set, it reads 0 of A's rows; with no firm set, it reads 0.
  - An insert of an A row with firm B set fails RLS.
  - A B run that names A's recipe fails the composite foreign key.
  - Moving an own run to firm B fails RLS.
- **Firm walls in the engine:** `runStep(B, A's step)` gives null, and `runsFor(B, …)` gives `[]`.
- **No double send:**
  - A step job run twice sends once.
  - `runStep` against a concurrent `setOn(false)` sends at most once per step.
  - 8 concurrent on/off switches give consistent results.
  - Two concurrent first reads in a new firm make one copy (2 recipes, 3 steps).
- **Consent:**
  - A MARKETING step with no consent is SKIPPED "NO_CONSENT: MARKETING", including for a CASE_PARTY person, and the run goes on.
  - After a withdrawal the next step is SKIPPED and the run ends "unsubscribed" (PR test).
  - The maximum wait of 525600 minutes gives 365 days.
- **Routes on :4432:**
  - Not signed in: 401. Case Manager: 403 (`agent/template:configure`) on GET and POST. Owner GET: 200.
  - Odd keys (upper case, `..%2F`, NUL, a 201-character key, a trailing space): 404.
  - Bodies: `{}`, a string, a null, an extra field, `__proto__` and an array give 422. `null` and non-JSON give 400. A 3 MB body gives 413. PUT gives 404.
  - In the running app no module registers a recipe yet (FO-12b's part), so GET is `[]` and every POST is 404. This was expected for part 1 and is not a finding.

Verdict: **Changes** (M1, M2), head 4ecd8ab2745377054e87d791b6bd54cb08c36dde (also valid for e324878283d55c859f5ed1dd3a76cb44d516e91e: engine and routes unchanged).
