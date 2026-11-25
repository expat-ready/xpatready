# FO-10 part 2 review (PR #2622, commit c817dc305, runtime, API only, no screen; additive migration)

Reviewer: Opus, fresh context. I did not build this. Diff reviewed: `git diff 1cd42b133 c817dc305` (11 code files; part 1's `review.md` ignored). PR #2476 (part 1) is taken as approved at 1cd42b133.
Read: the PR body; AG-02 v2.6 AG-2-85 (rules 1, 3-6, 9, 10, 18, 20; §7-§12) in `domain/requirements-2026-11-02/`; the part 1 review; WAY-OF-WORKING (ports).
The screen-only checks (concept, BIC scorecard, keyboard, 1024 px, zoom) do not apply: this part has no screen. The Assign screen is #2620.

## What I ran
* `tests/check_fo10p2_sharing.ts`: **25 passed, 0 failed**. Part 1's `check_fo10_assignment.ts` on the new engine: **42/42**. `check_prisma_schema.ts`: **8/8** (migrations equal the schema, 0 differences). `check_pf12_walls.ts` (main checkout detached at c817dc305, then put back): **100/100**. `graph.mjs --check`: G1/G2/G4/G5 0.
* Mutations (worktree, each reverted; the PR's suite):
  * Pick back to "next id after the cursor": 4 fail, including "back again, least recently given gets the next one".
  * `for update` dropped from the locked read (place.ts:62): the 20-parallel test fails in both runs ([9,7,4], [10,5,5]).
  * Possible-match return disabled: 3 fail. Possible match checked only for round robin: "a one-person rule does not place a possible match" fails.
  * `&& fact !== "HOST_INACTIVE"` dropped (arrival.ts:114): rule 18 fails. Host status filter dropped: rule 18 fails. Port stops passing the host: the real-ArrivalPort test fails.
  * ANYONE made a no-op: 2 fail.
  * `firm_id` dropped from the port's `fo_booking` read (arrival-port.ts:68): **still 25/25** (m5).
* Probes (scratch suite, deleted): a one-user firm with an inactive booking host (m1); GET then PUT of the same body (m2).
* Live HTTP on an isolated copy (`tools/isolated.sh fo10p2rev 4434`, runtime ports, `PLATFORM_IDENTITY=local`, stopped after). Journeys are below. PUT gave **500 before FO-1a's front-office seed** (M1). After the seed, Round robin over O and T placed four web-form enquiries as O, T, O, and the fourth (a repeat email) went Unassigned "a possible match waits for a person". `turns` = {O: 3, T: 2}, `turn_no` 3.

## Findings

### Major
* **M1. Saving the sharing setting gives a 500 for any firm whose front office was never set up, which includes every newly signed-up firm.** `rules.ts:111/114` → `save()` → `rules.ts:64` upsert. `fo_assignment_rule.firm_id` has a foreign key to `fo_sales_setup` (part 1 migration :35). That row is created only lazily, by `seedFirmFrontOffice`, which is called from `arrival-port.ts:138` (first booking) and `fo-person-port.ts:64`. `signup.ts:196` creates a firm without it.
  * Scenario (reproduced): a fresh firm whose Owner has added a second user opens "How new leads are shared" (AG-2-85 §12: "A firm grows from 1 user to 2: the setting appears"). `GET` returns ANYONE, but `PUT {"mode":"ROUND_ROBIN"}` or `{"mode":"ONE_PERSON",…}` returns **500 "Something went wrong on the server"**. The log shows `PrismaClientKnownRequestError P2003 at rules.ts:64`. A retry fails the same way. Only a first booking unblocks it.
  * The root is part 1's FK. This PR makes it the main action of a new firm-wide route, and the suite seeds the front office first, so it never sees it.
  * Fix: call the idempotent `seedFirmFrontOffice(tx, firmId)` (or just `foSalesSetup.createMany({skipDuplicates})`) inside `save()` before the upsert. That fixes both routes. Add a fail test on a firm with no `fo_sales_setup` row.

### Minor
* **m1. An inactive booking host in a one-user firm writes a false audit line.** `arrival.ts:106` sets `fact = "HOST_INACTIVE"`, then X-4 (`:110`) gives the lead to the one active user. `placedWords` (`:53`) still says "left in Unassigned leads: the booking's host is not active", with `ownerFact: HOST_INACTIVE`, while `ownerStaffId` is set (probe output). The owner itself is right (rule 1(a) comes first), but the timeline line is wrong. It is reachable only by a race, because the booking page offers active hosts only (`booking/service.ts:728`). Fix: let X-4 clear `fact`, or give `placedWords` an "owned by the firm's one user" branch.
* **m2. PUT refuses GET's own shape.** `rules.ts:106,110`: GET always returns `rotationStaffIds: []` (and `onePersonStaffId: null`). Sending that back for ANYONE gives 422 "Anyone takes it names nobody". For ONE_PERSON it gives 422 with `rotationStaffIds: "Leave empty for one person."`, although the list *is* empty. This was reproduced live. A settings form that keeps one state object and only changes `mode` will hit it. Fix: treat `[]` as absent (as `null` already is for `onePersonStaffId`).
* **m3. Field errors name part 1's fields, not this API's.** A bad person or list comes back as `fields.ownerStaffId` or `fields.eligibleStaffIds` (and the detail reads "eligibleStaffIds: a list of people of your firm."), but the client sent `onePersonStaffId` or `rotationStaffIds`. A screen cannot put the error on its field. Fix: map the keys in `setSharing` (catch and rename), or pass the field names into `save`.
* **m4. The migration drops part 1's cursor.** Existing round-robin rules start with `turns = {}`, so the first lead after deploy goes to the lowest id even if that person got the last one (`last_staff_id` is ignored). Seed `turns = jsonb_build_object(last_staff_id::text, 1), turn_no = 1 where last_staff_id is not null`. The impact is small while part 1 is not on main.
* **m5. Tests that would pass for the wrong reason, or not bite:**
  * "a newcomer is next" (test:84) passes against the old cursor rule about half the time (the newcomer's random uuid is either the highest or the lowest of the four). "Back again" (:89) does bite.
  * ":128 (403 at the guard)" reads seeded role data only, not the guard. The live 403 holds (J4).
  * No test covers the `firm_id` filter of the port's `fo_booking` read (the mutation survived). The filter is present and correct.
* **m6. Nits:**
  * The catch-all is also listed and editable through `GET|POST assignment-rules` as "any door". The same roles hold both keys today, but its audit summary ("Assignment rule for any door set to round robin.") does not say it was the sharing setting.
  * An unchanged PUT still writes an audit line with an empty diff.
  * Stale comments: `rules.ts:5-6` "Not yet (FO-10 part 2…)" and `place.ts:59` "reading the cursor afresh". `rule.last` is selected but unused (place.ts:45).

## What held
* **Fairness and locking.** The pick reads `turns` under the rule's `FOR UPDATE`. The single UPDATE uses the old `turn_no` on both sides, so `turn_no` and the person's entry stay equal. Ties go by id (`eligible()` orders by id). The 20-parallel test gives 6/7 and fails without the lock. `save()` now locks before reading `before` (r2-m1). Share locks on staff do not conflict with it.
* **Recursion.** A rule switched off or changed while an arrival waits is read again under READ COMMITTED (no isolation level is set anywhere on these paths), with `o` passed on. It terminates because each pass sees committed state.
* **Possible match.** It returns before the lock, so no turn moves. It applies to OWNER rules too, matching "not shared by the setting", rule 10. Facts (host, X-4, adder) still come first, per rule 1.
* **Host fact.** It is read in the booking's own transaction, from the row written just before (`booking/service.ts:527-528`). It is firm-scoped in both reads. HOST_INACTIVE skips every rule (rule 18). Ordering with X-4 is m1. The manual adder is unchanged (`owner === null` guard).
* **Sharing mapping.** ANYONE switches the catch-all off (the row keeps its turns) and is a no-op when none exists. ROUND_ROBIN and ONE_PERSON save `ANY:ANY` through part 1's validation (active, sales key, same firm; a person of firm A named from sample-solo gives 422). Door and service rules still win (test :138).
* **Tenant isolation and permissions.** Every raw query names `firm_id`. `agent/firm-capability:manage` is held by OWNER and ADMIN only. Case Officer and Case Manager get 403 `MISSING_PERMISSION` live, and sample-solo reads its own ANYONE.
* **Audit.** Each save and off writes before/after (3/3 in the suite, 4 lines live).
* **Migration.** Additive: two columns with defaults and NOT NULL, plus a check constraint. No drift. The ordering after main's latest migration is fine.

## Journey test (reviewer role; API-adapted as for part 1; no browser walk possible)
Journeys, as Owner (user-R) unless named:
* J1 main: Round robin O+T → leads O, T, O ✔.
* J2 Always one person ✔.
* J3 errors: an unknown mode, `[]` or a missing person gives 422; `null` body gives 400 ✔.
* J4 wrong role: O and T get 403 ✔.
* J5 recovery: a repeat PUT is idempotent ✔, but the GET→PUT round trip gives 422 ✘ (m2).
* J6 back to Anyone: no owner ✔ (suite).
* J7 other firm: isolated ✔.
* J8 boundary: possible match → Unassigned ✔.
* J9 fresh firm: 500 ✘ (M1).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | works after the front-office seed; a fresh firm gets 500 (M1) |
| Next step obvious | ½ | 422s name part 1's fields (m3); GET's shape is refused (m2) |
| Plain words | ½ | plain texts; "Leave empty" when it is empty; a false line in m1 |
| Feedback and state | 1 | PUT returns the stored setting; GET reflects it; one audit line per change |
| Correct data | 1 | turns {O:3,T:2}; a possible match moves no turn; the host owns |
| Error recovery | ½ | the M1 500 is generic and a retry fails the same way |
| Access | 1 | key-guarded, firm-scoped, walls 100/100 |
| Speed | 1 | 10-40 ms per call |
| Consistency | ½ | field names differ from the API's own; two routes edit one row |
| Trust and sources | 1 | AG-2-85 rules cited; what is not built is stated in the PR (rules 8, 9, 11, 15, 20) |

**7½/10, no criterion at 0: below the bar (8).** Fixes, most valuable first: M1, then m2 and m3.
Not checked: no screen (D17/D20 stay with the founder); bookings through the real booking page over HTTP (covered by the suite's real-ArrivalPort test only).

Verdict: Block
* Major: M1 (500 on saving the setting for a firm without its front-office setup; `rules.ts:64` via `rules.ts:111/114`).
* Minors to fix with it, or record as follow-ups: m1-m5.

---

# Re-review, diff only (P-277): `git diff c817dc305 12f7387b2` at 12f7387b26b9d9dec0e4fc410e15f40e1eacfdeb

Read: the fix diff (place.ts, rules.ts, arrival.ts, migration, suite) and the breaker's `break-report-part2.md` (for the fixes it names).

## What I ran
* `check_fo10p2_sharing.ts` **34/34**, `check_fo10_assignment.ts` **42/42**, `check_prisma_schema.ts` **8/8** (worktree at 12f7387).
* Mutations, each reverted (worktree clean after):
  * seed call removed from `save()` → the review-M1 test fails ("HttpException");
  * Round robin list made optional again → the break-M1 test fails;
  * host check back to status-only → the break-M2 test fails (Read-only host owned the lead);
  * X-4 keeping `fact` → the review-m1 test fails (line said Unassigned);
  * turn sanitiser removed → **still 34/34** (n2).
* Live HTTP on a fresh isolated copy (main checkout detached at 12f7387, `tools/isolated.sh fo10p2rev 4434`, `PLATFORM_IDENTITY=local`, **no FO-1a seed**; stopped and put back on claude/gracious-curie-zolt7r):
  * `fo_sales_setup` rows 0 → `PUT {"mode":"ROUND_ROBIN"}` 422 `rotationStaffIds` "Tick at least one person." → with O and T **200**, setup rows 1;
  * GET's body sent back with `mode: ONE_PERSON`, `rotationStaffIds: []` → 200; unknown person → 422 under `onePersonStaffId`; `{"mode":"ANYONE","onePersonStaffId":null,"rotationStaffIds":[]}` → 200;
  * audit summaries "How new leads are shared set to round robin." / "… always one person." 

## Earlier findings
* **M1 fixed.** `save()` seeds the firm's front office in its transaction (`rules.ts:62`), and a firm that cannot be seeded gets 409 NO_FRONT_OFFICE in words. Fixes part 1's POST too. Deadlock check: an arrival takes KEY SHARE on `fo_sales_setup` at its receipt insert, before the rule lock; `save()` takes the setup row FOR UPDATE (inside the seed) before the rule lock. Both take setup before rule, so no cycle (the breaker's 30-arrival mode-cycling run agrees).
* **m1 fixed** (`arrival.ts:112`, test bites). **m2 fixed** (`rules.ts:112`, test). **m3 fixed** (checked in `setSharing` with its own field names; `save()` re-checks inside its transaction). **m4 fixed**: the migration UPDATE seeds `turns`/`turn_no` from `last_staff_id`, after the check constraint, which it satisfies. No test (suites migrate an empty DB); the SQL is a one-liner and correct. **m5 fixed**: the newcomer id now sits just after the trio's lowest, the "403" test is renamed, and a cross-firm booking-id test was added.
* The breaker fixes I checked: M1 (a ticked list is required), M2 (host must pass `eligible()`), m5 (sanitiser) are as described.

## New findings (no Blocker, no Major)
* **n1 (Minor). Splitting `eligible()`'s lock reopens a narrow race that part 1 had closed.** `place.ts:27-36`: the ids are read without a lock, then locked by id with a second `for share` that does not re-check status. A deactivation already in flight when the arrival reads is waited for, but its result is ignored, so the deactivated person can still be picked. The old single `… for share of s` re-checked `status = 'ACTIVE'` after the wait.
  * Reproduced on a scratch table: one session updates row 1 to DEACTIVATED and commits 2 s later, while another reads. The old form returns `2`; the new form returns `2,1`.
  * Scenario: an Owner deactivates a person while a web-form lead arrives. The lead is given to that person, or the deactivated booking host becomes BOOKING_HOST.
  * Impact is small: such a lead counts as unassigned (AG-2-13c rule 6; `leads.ts:59` keeps it visible).
  * Fix: put `and status = 'ACTIVE'` (and the grant test) on the lock query and return its rows. Or keep one query with a conditional `for share of s` fragment (`Prisma.sql`/`Prisma.empty`). A `FOR SHARE` outside a transaction is harmless in PostgreSQL anyway.
* **n2 (Minor, test).** The break-m5 test ("a turn that is no whole number counts as 0", suite :178) passes with the sanitiser removed. With `{R:'abc', T:5}`, `'abc' < 5` and `5 < 'abc'` are both false, so `reduce` keeps `set[0]`, which is R whenever R's id < T's id. Give the junk value to the higher id, or use a negative or huge number instead of a string.
* **n3 (nit).** Every `save()` now holds the firm's `fo_sales_setup` row FOR UPDATE until commit (`firm-seed.ts:105`). Every arrival, note, call or person insert of that firm (FK KEY SHARE) waits behind a rule save. This is correct and short. Checking `seeded_at` before calling the seed would avoid the lock on already-set-up firms.
* **n4 (nit).** ANYONE still writes "Assignment rule switched off." for the catch-all (`rules.ts` `off()`), unlike the new "How new leads are shared set to …" lines.
* Left as recorded by the builder (accepted): breaker m6 (turn_no overflow), the empty-diff audit line, and the catch-all being editable through assignment-rules.

## Journey score (re-scored on the fixed head)
Rows changed from 7½:
* Task completed: 1. A fresh firm saves.
* Next step obvious: 1. Own field names, GET's shape accepted.
* Plain words: 1. The m1 line is fixed.
* Error recovery: 1. 409 in words for a firm that cannot open.
* Consistency: ½, unchanged (n4; two routes edit one row).

All other rows are as before. **9½/10, no 0: passes.**

Verdict: Approve 12f7387b26b9d9dec0e4fc410e15f40e1eacfdeb

---

# Re-review 2, diff only (P-277): `git diff 12f7387b2 b9fdc07d7` at b9fdc07d70ee038c4941d2040ac94635e7182211

* **Suites** (worktree at b9fdc07): `check_fo10p2_sharing` **35/35**, `check_fo10_assignment` **42/42**.
* **n1 fixed.** `eligible()` (`place.ts:27-47`) is one query again: the filter and `for share of s` run together when `lock` is true. This is the form my scratch-table race kept correct (old form `2`, not `2,1`). `lock=false` runs the same query without the lock. Only `setSharing`'s pre-checks use it, outside a transaction, and `save()` re-checks with the lock inside its own. The duplicated SQL text is a nit only.
* **n2 fixed.** The junk turn now sits on the higher id. With the guard reverted to `(t as number) ?? 0`, the test fails (mutation run, reverted).
* **n4 fixed.** Switching the firm-wide rule off writes "How new leads are shared set to anyone takes it." (`rules.ts:92`). Reverting it fails the new test.
* **n3** is left as recorded (setup-row lock during a rule save). Accepted: saves are rare and short, and there is no lock cycle (re-review 1).
* No new findings. Journey score is unchanged at 9½/10, no 0.

Verdict: Approve b9fdc07d70ee038c4941d2040ac94635e7182211
