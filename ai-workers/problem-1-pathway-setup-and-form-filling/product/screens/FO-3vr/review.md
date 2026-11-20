# FO-3vr review: a booking follows its record's visibility, or its host sees it (runtime, no screen)

PR #2308, branch `claude/busy-babbage-bpqaoi`, head `74c6936e661c552604820d12f589654b18fc8e92`. Independent reviewer, 19 Nov 2026, Opus 5.5, effort high (P-605).
**Read:**
- the brief `design/lead-b-briefs/FO-3vr.md`;
- AG-4-67 (AG-04 v2.1) and AG-2-64 rules 1-4 and 7 (AG-02 v2.6), from `domain/requirements-2026-11-02`;
- the diff;
- `sales/common.ts` `visibilityOf`/`sees`, and `sales/leads.ts` `seenWhere`/`activeOf`;
- the booking and sales schemas, and the `fo_sales_owner_in_firm` trigger.

**Screen-review parts that do not apply:** concept fit, keyboard, 1024 px and 200 % zoom, the menu and words of §3–§4, D1–D20, BIC-01–20 and the graph. There is no screen and no concept.

## What I ran
- **The PR's check on the head:** 17/17 on a good run. In 5 runs, 2 failed at `DW4 setup` (M1).
- **The check against main's `service.ts`:** 6 cases red.
  - Red, as they should be: DW1 fail (list, due and get all leaked), DW3 fail, DW4 fail ×2, DW5 fail, DW7 ×2.
  - Green on main too: the DW1/DW3/DW4/DW5 pass cases, DW2 and DW6. These guard access that main also granted.
- **DW8 suites on the head:** all pass.

  | Suite | Result |
  |---|---|
  | `check_fo3_booking` | 133/0 |
  | `fo3sr` | 29/0 |
  | `fo3m` | 14/0 |
  | `fo3sa` | 39/0 |
  | `fo3pa` | 45/0 |
  | `fo3a2` | 39/0 |
  | `fo2v` | 14/0 |
  | `fo2` | 113/0 |

- **Probes in the scratchpad (not in the repo):** 11/11.
  - `staff=` naming another host.
  - Attendance, cancel and reschedule on a booking the caller cannot see: 404 each.
  - A lead reassigned and then moved back.
  - A deactivated lead owner, in the list and by id.
  - Rule 2c: a person-level booking whose prospect the viewer owns.
  - An ownerless lead.
  - A hostile `staff=` value.
- **Parity sweep on the PR's own data:** list, attendance-due and by-id agree for 7 viewers × 159 bookings, with 0 mismatches.
- **Mutations:**
  - Making SQL "unowned" mean `IS NULL` only: caught by DW4.
  - Dropping the deactivated-owner handling in `seesBooking` (prospect or lead): **not caught** (m1).
- **`module-cards.py pr` with BASE = the merge base:** fails, the same as CI (B1).

**Shared checkout.** For the main comparison and the mutations I swapped `service.ts` for a few minutes and then restored it with `git checkout`. Those swaps were the "other session" in `break-report.md`. One uncommitted change to `tests/check_fo3vr_visibility.ts:122` (a stage-pick fix) was not made by me, and I left it in place. This review is of the commit, not of that change.

## Done when (brief DW1–DW8)
- [x] **DW1:** list, attendance-due and by-id (404) for the own-only officer; view.all sees it. Red on main.
- [x] **DW2:** the host sees it in the list and by id. Without the list key, the host still opens their own and not the colleague's.
- [x] **DW3:** after the host change, the old host loses it, unless they own the lead. The new host sees it. Red on main. The change is written to the database, because no staff route changes the host.
- [x] **DW4:** a prospect the officer owns, a colleague's prospect, an ownerless prospect, and a deactivated owner. Red on main. **The setup is flaky (M1).**
- [x] **DW5:** a not-linked booking, with no person or with a person who has no lead or prospect: seen by the assigner, not by the own-only officer. Red on main.
- [x] **DW6:** firm walls, READ_ONLY = the firm's rows, and Billing/Finance without the key. Both list routes declare the key. The 403 itself comes from PF-4's guard and is not called here.
- [x] **DW7:** 3 of 150+ returned. One `findMany` on `fo_booking` carries the ids, and one raw statement holds the rule. Red on main.
- [x] **DW8:** suites unchanged except `check_fo3_booking.ts:319`. `ctxA` gains `agent/prospect:assign` for a not-linked booking hosted by someone else, which is AG-4-67 rule 3. That change is justified, and no assertion was weakened.

## Correctness of the record rule (`booking/service.ts:441-460`)
- **Rule 2 (the host):** `b.staff_id = me`. In `staffBooking:834` the host short-circuits before the key check, as rev 16.22 says.
- **Rule 3 (on a prospect):** the prospect is in the firm, and it is the viewer's own, or it has no active owner and the viewer `seesUnassigned`. This matches AG-2-64 rule 3.
- **Rule 4 (a person with leads, no prospect on the booking):** a lead of the person seen by the lead list's rule (AG-2-64 2a-b), or a prospect of that person owned by the viewer (2c).
- **Rule 5 (not linked):** no person, or a person with neither a lead nor a prospect, and the viewer `seesUnassigned`.
- **The short-circuit:** `seesAll` (everyone-sees-all on and view.all) returns `{}`, the same flags as `visibilityOf`. There is no second own-versus-all rule.
- **Inactive owners:** `NOT EXISTS (active staff of this firm with that id)`. The `fo_sales_owner_in_firm` trigger guarantees every owner is a staff member of the firm, so this is the same set as `leads.ts`'s `inactive` list.
- **NULL handling:** an ownerless prospect gives `(NULL OR su)`, which is true only when `su` is true. Correct.
- **Firm walls:** the `b.firm_id = $firm` parameter; every subquery joins on `firm_id = b.firm_id`; the `findMany` keeps `firmScope`. The firm-B probe was refused.
- **Injection:** every value is a bound `Prisma.sql` parameter (`me`, `su`, the window dates, `staffId` after `z.uuid()`). The only fragments are literal column names. A hostile `staff=` is refused at parse.
- **Parity, list (`seenWhere`) against by-id (`seesBooking`):**
  - By reading, branch by branch: identical.
  - Empirically: 0 mismatches in the sweep and in probes B4–B6.
- **The declared deviation (raw EXISTS, then an id list): accepted.** `FoBooking` has no relation to `FoLead` or `FoProspect` (schema `front-office-booking.prisma:194-224`). A relation would be a schema change, which is out of the touch list. The rule is worked out in SQL inside the caller's window and the firm, before the ordering and the one read, with no page cap.
  - Two residual costs: the id list's size (m2), and the two statements are not one snapshot. The second is harmless under AG-2-64 rule 7.

## Findings
**Blocker**
- **B1, the module-cards CI job is red on this head.** Reproduced locally with `module-cards.py pr`. There are two failures:
  - `api/src/front-office/MODULE.md:30` hand-edits the frozen `Tests.` line (P-712; the card's own row-list rule).
  - `MODULE.md:25` brings the card to 41 lines, over the 40-line cap.

  The brief's "tests line" predates P-712; the rule wins.
  **Fix:**
  1. Revert line 30.
  2. Add `api/src/front-office/MODULE.rows/FO-3vr.md` containing `Tests: tests/check_fo3vr_visibility.ts`.
  3. Fold the invariant into an existing bullet, for example append it to the PF-12 "database walls" bullet, so the card stays at 40 lines.
  4. Rerun `module-cards.py pr`.

**Major**
- **M1, the PR's check is flaky:** about 1 run in 4 fails, and the CI shard goes red with no code change. At `tests/check_fo3vr_visibility.ts:122`, the stage pick `... pipeline = 'INDIVIDUAL' limit 1` has no `ORDER BY` and no kind filter. 2 of the 8 seeded stages (WON, LOST) fail `fo_prospect`'s rules, so every DW4 case is skipped. It failed 2 of 5 runs for me and 2 of 8 for the breaker.
  **Fix:** `... and kind = 'ACTIVE' order by sort_order limit 1`, then run the check about 5 times and paste the result lines.

**Minor**
- **m1, parts of the rule have no test.** The behaviour is correct (probes B4, B5), but nothing protects it:
  - Rule 2c, a person-level booking whose prospect the viewer owns: no booking in the check has that shape. Covers `service.ts:454` and `:480`.
  - The deactivated *lead* owner (brief rule 4).
  - Deactivated-owner handling on direct links: both mutations survived. Covers `service.ts:467-480`.

  **Fix:** add three cases to DW4/DW5:
  1. A booking with `personId` only, where the person has a prospect owned by the officer: list and 200, and not seen by another own-only officer.
  2. A lead owner deactivated: the assigner sees it in the list and by id.
  3. `byId(assigner, bTheirs)` after the prospect owner is deactivated.
- **m2, attendance-due can return a 500 at scale** (breaker F1). The ids return as `id: { in: [...] }` (`service.ts:459`), and `attendanceDue` has no lower bound (`:416`). About 32.7k visible unanswered bookings exceed the parameter limit. That is unlikely at the target firm size, and main never had the limit.
  **Fix:** read the rows in one raw statement and map them, or bound attendance-due (for example to the last N days), or send the id list in pieces. A note on FO-3a 2b (the feed that reuses this) would also do.
- **m3, rule question for Lead B, not a build bug** (breaker F2). A person-level booking (`prospect_id` null) on a person whose only prospect has no owner is seen by no one except the host and `seesAll`. AG-2-64 rule 3 and §10 ("ownerless items are visible to everyone who can assign them") suggest the assigner should see it. The code follows brief rules 4-5 literally, and `arrival-port.ts:153-158` can produce such bookings.
  **Fix:** a PR comment headed "Question for the tech lead", or `challenge.md`. Do not widen this row silently.
- **Accepted, not a finding:** breaker F3, the time-of-check/time-of-use gap of `staffBooking` before the write transaction. The window is milliseconds, and AG-2-64 rule 7 says "on the next read".
- **Accepted, not a finding:** the consult-record access gap the builder raised (`booking/consult/service.ts:166`). It is out of the touch list and correctly asked as a question.

## Journey score
**8.5/10** (7 of 8 applicable criteria; no screen, so 2 are N/A). Report: `screens/FO-3vr/journey-test-reviewer-2026-11-19.md`.

## Not checked
- The walls under the `xr_app` role with RLS: every script runs as the table owner.
- A live HTTP 403 from PF-4's guard.
- Performance at production volume, beyond the breaker's 2,203-booking timing.

**Blocked on B1 and M1;** m1–m3 are recommended in the same push.

Reviewer: Changes requested

## Re-review (P-277, diff only): `74c6936e6..65e78041e`
Head `65e78041e64f3ca413e7504f0e2c66625d846b87`, 19 Nov 2026, the same reviewer (Opus 5.5). Four files: `MODULE.md`, the new `MODULE.rows/FO-3vr.md`, `booking/service.ts` (`readSeen`), and `tests/check_fo3vr_visibility.ts`. I also read the PR's two newest comments: the builder's "Question for the tech lead" (15:33Z) and Lead B's answer (15:38Z).

### What I ran
- **`module-cards.py pr`**, with BASE = the merge base `67ae91df2` and the changed-file list from `git diff --name-only`: `PASS module cards: 1 module(s) touched, 15 cards`. The card has 40 lines. CI `module-cards` is also green on this head.
- **The PR's check, 5 runs:** 22 passed, 0 failed every time.
- **DW8 suites on the head:** all pass.

  | Suite | Result |
  |---|---|
  | `fo3_booking` | 133/0 |
  | `fo3sr` | 29/0 |
  | `fo3m` | 14/0 |
  | `fo3sa` | 39/0 |
  | `fo3pa` | 45/0 |
  | `fo3a2` | 39/0 |
  | `fo2v` | 14/0 |

- **Mutations of `readSeen`.** No repo file was touched: each mutation was an ESM preload from the scratchpad that replaced `BookingService.prototype.readSeen`. A faithful copy gives 22/0, which shows the harness works.
  - Drop one id per piece: caught by the new DW7 pieces case (`one 4, pieces 2`).
  - Repeat one id across pieces: caught (`one 4, pieces 5`).
  - Remove the merge sort: **not caught** (n1).

### Findings from the first review
- **B1, fixed.** The frozen `Tests.` line is back to the merge base, byte for byte. The test is listed in `MODULE.rows/FO-3vr.md`. The invariant is folded into the "Platform rules apply" bullet, so the card stays at 40 lines. Checked as described under What I ran.
- **M1, fixed.** The stage pick is now `kind = 'ACTIVE' order by sort_order`, and 5 of 5 runs are green, matching the builder's 5 of 5.
- **m1, fixed.** Three new cases, each with a pass and a fail:
  - Rule 2c: a person-only booking whose prospect the officer owns, with a colleague owning the lead. The officer sees it; with the colleague owning both, the officer does not.
  - A deactivated prospect owner, by id: 404 for the assigner, then 200 once the owner is deactivated. The own-only officer stays at 404.
  - A deactivated lead owner, in the list and by id.

  These cover both `seesBooking` mutations that survived the first review: the by-id branch for the prospect and the one for the lead.
- **m2, fixed.** `readSeen` reads the visible ids in pieces of `seenChunk` = 10,000. That is under PostgreSQL's limit of 32,767 parameters per query, with room for the other bound values.
- **m3: the tech lead answered "apply", and the head does not have the change yet.** See M2 below.

### `readSeen` (`service.ts:434-442`)
- **Order.** Each read is ordered by `[startsAt|endsAt asc, id asc]`.
  - With more than `seenChunk` ids, the pieces are merged by `getTime()`, then `id.localeCompare`.
  - `id` is `@db.Uuid`, and PostgreSQL compares uuids byte by byte. For lowercase uuid text that is the same order as `localeCompare`: 200,000 random pairs gave 0 mismatches in node 24.
  - Times are written from JS Dates, so they carry no sub-millisecond part to disagree on.
  - The new `id` tie-break also makes the single-read order deterministic. Before, rows with equal times came back in any order.
- **Duplicates.** None.
  - `seenWhere` returns `b.id` from `fo_booking`, which is the primary key, so the ids are unique.
  - The pieces are disjoint slices.
  - Each read re-applies `firmScope` and the caller's `where`.
- **The single-read path.**
  - With `ids.length <= seenChunk`, the loop runs once (`i = 0`) and returns that one ordered read without re-sorting. This is the same one `findMany` that DW7 counts, and DW7 still passes (1 booking read, 1 raw statement).
  - When `seesAll` is true, `seen.id` is undefined, and there is one read with no id filter. This is unchanged.
  - An empty visible set still reads once with `id: { in: [] }`. It returns `[]` and never falls through to the unfiltered branch, because `seen.id` is an object, so the check is false. Correct.
- **The non-list path of `staffList`** (the host's own) is unchanged apart from the shared `where` object.
- **Residual cost, accepted.** The pieces are separate reads, not one snapshot. That was already true of the raw statement plus the read, and it is harmless under AG-2-64 rule 7.

### New findings
**Major**
- **M2, the tech lead's "apply" on m3 is not built** (PR comment, Lead B, 15:38Z). Lead B ruled that this goes in this PR:
  > "In the person branch, count the person's prospects by the same owner rule as a named prospect: the owner, **or** no active owner with Unassigned seen ... one condition in the SQL and one in `seesBooking`, with a pass and a fail case."

  The head was committed at 15:32Z, before that answer, and it still has the briefed rule:
  - `seenWhere`'s person branch has `p.owner_staff_id = ${me}::uuid` only (`service.ts:466`).
  - `seesBooking` has `prospects.some((p) => p.ownerStaffId === ctx.staffId)` only (`service.ts:492`).

  So an assigner still cannot see a person-only booking whose prospect has no active owner when the person's lead has an active owner. Yet the same assigner sees that booking once it names the prospect. This is AG-2-64 rule 3 as the row owner has now read it. It is in scope by that ruling, not new scope.

  **Fix:**
  1. In both places, use the named-prospect rule: `seenOwner(p.owner_staff_id)` in the SQL, and `sees(vis, ctx, activeOwnerOrNull)` in `seesBooking`, with the active-owner lookup the prospect branch already uses.
  2. Add the pass and fail case Lead B named: an assigner sees, in the list and with 200 by id, a person-only booking whose only prospect has no active owner while the lead's owner is active. The own-only officer gets 404 and does not see it in the list.
  3. Re-run DW8.

**Minor**
- **n1, the pieces case does not protect the merge order.** With the sort removed, the check still passes. The 4 bookings the assigner sees come back from `seenWhere` already in time order (one slot per insert), so the pieces join in order by luck. In the same case:
  - `whole >= 0` is always true.
  - `.catch(() => [])` swallows any error from `attendanceDue`.

  So the chunked `endsAt` path is never asserted.

  **Fix:** make the order of the raw ids differ from time order, for example by inserting one visible booking at an earlier slot after the others, or by moving an early one later. Then assert that `attendanceDue` gives the same ids, in the same order, with pieces of 2 as with one read, and drop the `catch`.

### Journey score (re-scored on the diff)
**9/10** (7.5 of 8 applicable criteria; 2 are N/A with no screen).
- **Speed:** ½ → 1, because the 32.7k-parameter limit is gone.
- **Trust and sources:** ½ → 1, because the check is deterministic and `module-cards` is green.
- **Correct data:** 1 → ½, because of M2: by the row owner's ruling, a booking that assigners must see stays hidden.

No criterion is at 0. The full journey report `journey-test-reviewer-2026-11-19.md` is unchanged, because this pass changed no journey other than M2's.

**Shared checkout:** one slip. For about a second, inside one shell command, I copied a scratch probe file into `studio/tests/` and then deleted it. `git status` afterwards shows only this untracked review folder. No tracked file was changed, and `service.ts` was not swapped this time.

**Blocked on M2;** n1 is recommended in the same push.

Reviewer: Changes requested

## Re-review 2 (P-277, diff only): `65e78041e..57032cd4a`
Head `57032cd4a02d83c5848d53862cc95968a0ebf2a3`, 19 Nov 2026, the same reviewer. Two files changed: `booking/service.ts` (the person branch of `seenWhere` and of `seesBooking`) and `tests/check_fo3vr_visibility.ts`.

### What I ran
- **The PR's check, 3 runs:** 24 passed, 0 failed each time.
- **The new check against the previous head's `service.ts`:** 23 passed, 1 failed. The one failure is the new "DW4 pass (AG-2-64 rule 3, person only)" case, so that case is red without the fix. I ran this in a `git archive` copy in the scratchpad; no repo file was swapped.
- **Mutations of `readSeen`,** as scratchpad ESM preloads:
  - A faithful copy: 24/0.
  - Remove the merge sort: **now caught** (n1).
  - Drop one id per piece: caught.
  - Repeat an id across pieces: caught.
- **DW8 suites:** all pass.

  | Suite | Result |
  |---|---|
  | `fo3_booking` | 133/0 |
  | `fo3sr` | 29/0 |
  | `fo3m` | 14/0 |
  | `fo3sa` | 39/0 |
  | `fo3pa` | 45/0 |
  | `fo3a2` | 39/0 |
  | `fo2v` | 14/0 |

- **`module-cards.py pr`,** with BASE = the merge base `67ae91df2` (unchanged): PASS. On CI, `module-cards`, `guard` and `pr-rules` are green; CodeQL was still running when I read it.

### Findings from re-review 1
- **M2, fixed, as Lead B ruled.**
  - In the SQL person branch, a person's prospect now counts through `seenOwner(p.owner_staff_id)`, the same rule as a named prospect: the owner, or no active owner and `su`.
  - `seesBooking` looks up active owners over the person's leads and prospects together, then applies `sees(vis, ctx, activeOwnerOrNull)` to each. With `seesAll` handled earlier, that is `owner === me || (owner === null && seesUnassigned)`, which matches the SQL row by row. So list and by-id still agree.
  - The "not linked" branch is unchanged.
  - The new pass/fail pair covers both sides. The assigner sees the booking in the list and gets 200 by id. The own-only officer does not see it in the list and gets 404.
- **n1, fixed.**
  - A fresh own-only officer gets 5 bookings, written latest first. The record rule's ids therefore come back in reverse time order, and with `seenChunk = 1` only the merge puts them right. The case asserts the exact time order (`[...mine].reverse()`), the same as in one read.
  - Attendance-due is now read in pieces too, with no `catch`. Each `due` call moves the clock 200 days ahead, so all 5 bookings are due.
- **`readSeen` itself** did not change in this diff. My notes on order, duplicates and the single read in re-review 1 still hold.

### New findings
None at Blocker, Major or Minor.
- **Nit, not blocking:** attendance-due in pieces is compared by set size only (`duePieces.size === dueOne === 5`), not by its ids or order. The list case already covers the shared merge code, and only the sort key differs.

### Journey score (re-scored on the diff)
**10/10:** all 8 applicable criteria score 1, and 2 are N/A with no screen.
- **Correct data:** ½ → 1, because a booking naming only the person now follows the named-prospect rule (M2).
- **Trust and sources:** stays at 1. The check is deterministic, and every new case was shown red against the code before its fix.

The full journey report is unchanged.

**Verdict: Approve.** No Blocker or Major is open.

Reviewer: Approve 57032cd4a02d83c5848d53862cc95968a0ebf2a3

## Re-review 3 (P-277, diff only): `57032cd4a..8f5551bc0`
Head `8f5551bc04b69970daa05bd6d26ffb35b758bbb8`, 19 Nov 2026, the same reviewer.

**The change.** One line in `booking/service.ts:479`: `status: "ACTIVE"` becomes `status: "ACTIVE" as const` in the `active` lookup of `seesBooking`. This changes the type only. The query and its result are the same, and no other file changed.

**What I ran**
- **The type check:** `node product/tools/typecheck.mjs --project api=prototype/studio/api/tsconfig.json`, which is the CI types job's script, run with `NODE_OPTIONS=--max-old-space-size=8192`. Without that flag, a bare `tsc` ran out of memory on this machine.
  - Output: `tsc api: 1083 source file(s), 15 error(s) in files, 0 without a file`, then `PASS no new type errors (15 known, 0 fixed)`.
  - All 15 are lines in `typecheck-known.txt`, in `tests/check_c18`, `check_c69`, `check_cost_check`, `check_vv_checklist` and `check_x2b`. Nothing in `service.ts` is reported.
- **The PR's check, 2 runs:** 24 passed, 0 failed each time.
- **Two of the suites that call `seesBooking`:** `fo3_booking` 133/0 and `fo3a2` 39/0.

**Findings:** none.

**Journey score:** unchanged at 10/10.

**Verdict: Approve.** No Blocker or Major is open.

Reviewer: Approve 8f5551bc04b69970daa05bd6d26ffb35b758bbb8
