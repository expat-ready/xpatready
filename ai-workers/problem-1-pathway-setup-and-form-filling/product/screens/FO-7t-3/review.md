# Review, round 1: FO-7t part 3, the "To move" routes and the 25-day item (API only, no screen)

Reviewed commit `35782510911740835bf89a8e914cae7dcef8d7ac` on `claude/zealous-keller-h3v4f4` (PR #3493). Scope: part 3's own diff only, `git diff 2b950dec5..357825109`: 9 files, +585 −2. Part 2 (#3442) was already approved. Reviewed 24 Nov 2026 by the Opus 5.5 reviewer, who did not build it. Nothing in the repo was edited apart from this file. The probes and mutants ran on a copy in a scratch folder, never on :4400.

**Verdict: Changes 35782510911740835bf89a8e914cae7dcef8d7ac** (Ship after fixes). There are 2 Majors and no Blocker. The money core is right. The route holds no rule of its own, the locks are taken in the right order, the walls hold and the job fires once. One database refusal still comes back as a 500, and one authorisation rule has no test.

## What I ran (Postgres 127.0.0.1:54329, each check on its own scratch database)
* `check_fo7t_to_move.ts` at the head: **32 passed, 0 failed**. Unchanged neighbours: `check_fo7t_trust` 62/0, `check_fo7t_money_out` 51/0, `check_fo7mv_move_list` 45/0, `check_ports_events` 31/0.
* Mutant A, `takeLocks` removed from `record` (`to-move.ts:96`): **30/2, caught.** The R3-m1 race gives 500s (40P01), so the 100-round test is real.
* Mutant B, the undo's C5 check (`:128`) and `trustShows` in `record`/`undo` (`:90,:122`) removed: **32/0, survives** (see Major 2 and Minor 1).
* Probes: a batch with the same entry twice (100 + 16900 of 169.50) → 409 at the second line, so the cumulative cap is the database's. Transfer dates `1999-12-31`, `1970-01-01` and `0000-01-01` → **500** (see Major 1).

## Brief conditions (FO-7t.md lines 12, 20, 60-66)
* **No rule of its own:** met. The list reads only `money_to_move` (`to-move.ts:68-72`). Writes are inserts into `money_move_batch` and `money_move_line` only (`:97-105`, `:130`). The only TypeScript arithmetic is the display totals and the audit total, which add up database figures. The over-cap test reaches the database.
* **Lock order (Lead 96, line 63):** met.
  * `takeLocks` (`:49-57`) takes each entry's party, plus each withdrawal's invoice party, in its own currency, sorted, through `money_trust_lock`, before the batch row. This is a superset of what `money_move_line_write` takes (migration 20261122170000:570-586).
  * The undo takes the same set (`:129`), which is a superset of the `money_move_batch_owed_back` loop (:533). Nothing is locked earlier: `trustShows` and the entry read are plain selects.
* **C5 and walls:** the list and "I moved these" are scoped and tested (DW10). Firm B gets 404 on everything. The undo check exists but has no test (Major 2).
* **Integer cents:** met. Amounts are 1..`MINOR_MAX`, `::int`. 100 × `MINOR_MAX` stays far below 2^53.
* **One audit line per change, in its transaction:** met (`:107`, `:133`). `trust.moved` carries ids, the total and the currency only (DW18).
* **25-day item:**
  * The age is counted from `money_to_move.created_at`, which is the source entry's time, as ruled.
  * The clock is injected.
  * The sweep's bypass use writes `platform.bypass` through `touchEachFirm` and drops firms that failed (`to-move-reminder.ts:51-57`), the same pattern as `limit-changes.ts:96`.
  * The job key is permanent: the pg-boss id is never deleted (`pgboss-jobs.ts:7-8`).
  * The waiting job reads again before it notifies (`:71`).

## The builder's deviations, judged
1. **422 instead of 400:** accepted (PF-28, Lead B rev 17.21). It matches the other money suites.
2. **Item kind "firm":** accepted. `money_to_move` is not in `NOTIFICATION_ITEM_KIND`, and adding it is not on the touch list. The store's upsert key includes the kind (`notifications/store.ts:35`), so it does not collide with FO-7c's firm item. Lead B should confirm this in the PR.
3. **"Fires once" = once per (firm, oldest waiting line):** accepted. A second notify only marks the existing item unread again. It never adds a second item (the upsert). DW14 proves that running the job twice gives one item.
4. **No clearing:** accepted as the brief's own contract gap 1 (line 98, "Lead B decides"). DW14's "after moving → cleared" is therefore open until Lead B rules. It must be raised in the PR body (Minor 4).
5. **Test file name:** `check_fo7t_to_move.ts` is the brief's own name for part 3 (line 70), so this is not a deviation.
6. **At most 100 lines a batch:** accepted. The audit `after` arrays are capped at 100 (`ports/audit.ts:40`). A transfer of more than 100 lines becomes two batches with the same date. Say so in the PR.

## Findings
**Major 1: a transfer date before 2000 is a 500, not a field error or the database's 409.** `to-move.ts:35-36` (`day` accepts any real date up to today) and `:146-149` (`write` maps only raised `money_x: …` messages).
* Scenario: someone types `1926-11-20` for `2026-11-20`, or sends `0000-01-01`. The database refuses with `money_move_batch_date_check` (23514; migration 20261116030000:111) or "date out of range". No branch in `write` matches, so the caller gets `500 Internal server error`. The same happens with an undo's optional `transferDate` (`:42`).
* This breaks the brief's "the database's refusal → 409 MOVE_REFUSED with its words" and the field-error standard.
* Fix: refuse a `transferDate` before 2000-01-01 as a 422 on `transferDate` (an input check reading the database's own bound). Alternatively, map 23514 and 22008 to 409 with the constraint's words. Add a case with a pass and a fail to DW12.

**Major 2: the undo's C5 check has no test.** `to-move.ts:128`. Mutant B removes it and all 32 checks still pass. DW10 tests C5 on the list and on "I moved these" only (`check_fo7t_to_move.ts:224-226`).
* Scenario: a later edit drops or inverts the check. A Case Officer with `agent/payment:record` who cannot see Client A's case then undoes Client A's batch, and the money returns to the list, with no test going red.
* This is the same class of finding as part 2's Major 2 (the pick's C5).
* Fix: in DW10, `tO` undoes a firm A batch whose lines it cannot see → 404, with no batch and no audit line written.

**Minor**
1. **The trust-off checks on the two writes are untested** (`:90`, `:122`; mutant B). DW1 sends `NIL` ids, so the 404 comes from "not found" whether or not `trustShows` runs. Scenario: after Yes → No with everything settled, an old batch can still be undone. Fix: in DW1, undo a real batch of a firm that is off with nothing held.
2. **A stray backtick in the 409 words.** `:148-149` keeps `said[0]` up to the end of the line, which includes Prisma's closing backtick. Seen: "…0 moved before)`. Nothing was saved." Part 2 trims it (`service.ts:285-286`).
3. **The lock sort is by text, the trigger's by uuid.** `:50-55` orders `::text`. The order is the same today: lower-case hex, hyphens in the same places, digits before a-f in both C and en_US. Sorting the uuid values would make the order match by construction.
4. **The PR body is still the draft plan.** It says "Two currencies → 400". It does not list deviations 1-6, the contract gaps (brief line 98: the clearing item, the `trust.moved` name) or the clock note below. The brief requires them in the body.
5. **Two clocks.** The reminder is built with `systemClock` (`features/client-money-trust.ts`, `TrustToMoveJobs`), while the list's `over25Days` uses `PlatformClock`. Both are `Date.now()` today. If `PlatformClock` is ever bound to the demo clock, the flag and the item would disagree.
6. **DW10's "a rollback leaves none" is shown only for refusals before the audit line.** No case forces a failure after `audit.record`.

## Journey score (reviewer, API only): 8/10
There is no screen, so the walk was the scripted check plus my probes. Accessibility and visual quality are N/A, so the score is 6.5 of the 8 criteria that apply, scaled to 8/10.
* Task completed: 1.
* Next step obvious: 1. A 409 says what to do: read the list again, record the moves again.
* Plain words: ½. The database's words include raw cents ("16951 CAD"), plus the stray backtick.
* Feedback and state: 1.
* Correct data: 1. The amounts, one batch under the race, and the undo returning the lines all held.
* Error recovery: ½ (Major 1).
* Speed: 1. 200 concurrent requests, no wait over 1 s seen.
* Trust and sources: 1. "Unconfirmed: no counsel" is present and the cron is labelled Sample.

The pass bar is met with no 0. There is no separate journey report: the brief gives no screen, and the lead asked for this file only.

**Not checked:** the full `ci`, the demo reset and checkpoint load (C10.1), and red-on-base (the PR body states 0/1). The graph tool was not run, because this change has no page. Lead B's and the release Lead's money read (P-423) stays with them.

Reviewer: Changes 35782510911740835bf89a8e914cae7dcef8d7ac
