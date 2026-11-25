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

## Round 2 (diff only: `357825109..48899e198`, then the merge of main to `2bc1a384d`)
The merge changes nothing under `api/src/client-money`, `ports`, `features/client-money-trust.ts`, the check or `prisma` (checked with `git diff --stat`, which was empty). `check_fo7t_to_move.ts` at `2bc1a384d`: **36 passed, 0 failed**. Mutants and probes ran on a `git archive` copy of 48899e198.

**Verdict: Changes 2bc1a384d44d58ec4441c42048836e831c18c383** (one Major is open).

**Closed**
* **Major 1:** a date before 2000 or `0001-01-01` now gets a 422 on `transferDate`, for both the batch and the undo (`to-move.ts:36-37`). The new DW12 and DW13 cases show it. An undo dated before its batch also gets a 422 (`:132`).
* **Major 2:** the new DW10 case has `tO` undo `part`'s batch → 404, with no batch written.
* **Minor 3:** the locks are now ordered by the uuid and enum columns in a subquery (`:51-56`), which is the trigger's own order.
* **Breaker m1:** only TRUST_TO_OPERATING lines count, consistently in the list flag (`:71`), the sweep and the waiting job (`to-move-reminder.ts:58,76`).
* **Can the new key fire again while nothing changes?** No. Move lines are insert-only, and an undo adds a batch, not lines, so the count only grows with a real move. The oldest line is chosen in a fixed order (`created_at`, then id). In my probe, three more idle days with three sweeps kept the notify count at 2.

**Major (new, about breaker M2's fix): the re-fire test passes without the fix.** I removed `:${f.n}` from the key (`to-move-reminder.ts:65`) and the check still gave **36/0**.
* Why it still passes: in DW14 the undone batch is the last of the clean-up batches (`check_fo7t_to_move.ts:282`). Its oldest line is not the line the first item was keyed on, so the key changes anyway.
* Scenario: a later edit drops the count from the key. Then a firm whose oldest line was moved and then undone is never told again, which is exactly what breaker M2 reported, and nothing goes red.
* Fix: undo the batch that moved the line the first key named, while every other line stays moved. Then expect one more notify, and still one after a second sweep. Asserting the queued job keys would also do.

**Minor (new)**
1. The trim at `to-move.ts:153` now also cuts a closing bracket. Probe: "…(16950 CAD to move: 16950 less 0 returned to trust, 0 moved before. Nothing was saved." Trim only the backtick and the whitespace.
2. "Never dated before its money left trust" (`:97-98`) is a TypeScript rule the database does not hold, so a write that goes around the route skips it. It is an input check, not a cap, eligibility or open amount, but Lead B's condition says "no move rule of its own". Name it in the PR for Lead B, or ask FO-7ts for it.

Round 1 Minors 1, 4, 5 and 6 are still open (not blocking).

Reviewer: Changes 2bc1a384d44d58ec4441c42048836e831c18c383

## Round 4 (diff only: `80185f1ae..5445767089`, Lead 29's ruling (b))
At `5445767089`: `check_fo7t_to_move.ts` **43 passed, 0 failed**; `check_fo7t_money_out.ts` **51 passed, 0 failed**.

I made two mutants on `git archive` copies. Both go red:
* Dropping the `askUncleared` call (`to-move.ts:105`): **39/4**. All four "ruling (b)" move cases fail.
* Dropping the refund check (`money-out.ts:149`): **42/1**. The refund fail case fails.

**The cover formula is faithful to `held`.** Cover = max(0, ledger on the case + open trust → operating lines on the case − uncleared deposits on the case), per party, case and currency (`to-move.ts:150-172`).
* **Waiting must count.** A trust application lowers the ledger, but the money stays in the trust bank account until it moves.
  * Without the waiting term, every fully applied case would read cover 0. Every move would then ask, even when the money was all cleared.
  * Money already moved is left out, which is right: it is no longer in trust.
* **Cleared money is counted first, as part 2's `clearedPart` does.**
  * Example: cleared 100, plus an uncleared cheque 500 of which 300 was applied. Cover is 300 + 300 − 500 = 100.
  * The tests show exactly this: 100 moves without asking, the next 50 asks, and the same 50 acknowledged goes through.
* **Grouping:** lines are grouped by the entry's own party and case, which is where the money was held. A pick line counts against its payer, as `held` reads it.

**Locks, blocking and audit**
* **Read under the locks:** yes. It runs after `takeLocks`, inside the same transaction, at READ COMMITTED, so it reads fresh after the lock waits. The refund check uses `held`, read after the payer's lock (`money-out.ts:130-132`).
* **It warns, never blocks:** the only refusal is when `unclearedAcknowledged` is not set. The 409 is an HttpException, so `write` passes it on unchanged. With the acknowledgement it writes. Operating → trust batches are not asked.
* **Audit flag:** it is true only when the question applied and was acknowledged, false otherwise. That holds both on `trust_money.moved` (tested) and on `trust_money.refunded`.
* **The changed money_out line:** the refund from CASE now acknowledges because that case still holds the uncleared cheque. That is correct under the ruling.

**Minor (new, not blocking)**
1. The refund's `unclearedAcknowledged: true` in the audit `detail` (`money-out.ts:157`) has no assertion. Only the move's flag is tested.
2. A cheque that was "Returned" while still not cleared is subtracted twice: the RETURNED correction already lowered the ledger, and the deposit is still counted as uncleared. This over-asks. It is the same reading as part 2's `held`, so it is consistent, and it only warns. Name it with the FO-7ts gap.

Verdict: Approve 5445767089cdc95f8db99220515a41bb4da65239

Reviewer: Approve 5445767089cdc95f8db99220515a41bb4da65239

## Round 5 (merge of main, 2ea622a7e)
This is a diff-only check (P-277). The last Approve was on `3ed855a66`. That commit holds only records on top of the round 4 code `5445767089`: nothing under `api/src/client-money` or the test changed between the two.

The new head `2ea622a7e` is a merge commit. Its parents are `3ed855a66` and main's `a040b46d5`, and main's `086f2d06c` is included.

**1. Part 3's files are unchanged.**
* `git diff 3ed855a66 2ea622a7e --stat` covers 170 files, all from main.
* `git diff --stat 3ed855a66 2ea622a7e` on part 3's files prints nothing (exit 0). The files checked:
  * `api/src/client-money/trust/` (all of `to-move*.ts` and `money-out.ts`)
  * `api/src/features/client-money-trust.ts`
  * `ports/events/client-money-trust.ts` and `ports/notifications.ts`
  * `tests/check_fo7t_to_move.ts`
* One correction to the brief: the ports are at `studio/ports/`, not `api/src/ports/`. I checked them at that path.

**2. What main brought in that part 3 could touch.** None of it changes a contract part 3 relies on.
* **`api/src/client-money/port.ts`** (FO-9b part 2): `ClientMoney.hasMoney` now also reads `money_party_tax_treatment` and the trust entry's payee. These are reads only, for the merge check. Part 3 does not call `hasMoney`.
* **`ports/client-money.ts`**: only the comment on `ClientMoneyPort.hasMoney` changed. Part 3 imports `MINOR_MAX`, `MoneyCurrency`, `InvoiceEventPayload` and `MONEY_EVENT` from this file (`to-move.ts:26`, `money-out.ts:18`), and none of those changed.
* **`ports/messages.ts`**: adds a new `MessageWordsPort` (PF-21rs R0). `MessagePort` is unchanged. Part 3 does not use the new port.
* **`ports/metrics.ts`**: `ReportQuery.scope` changes from `unknown` to an enum. Part 3 does not use it.
* **The migration `20261124070000_fo9b_review`**: only `fo_dup_review` and `fo_dup_merge`. No `money_*` table is touched.
* **`api/src/platform/firm-scope.ts`**: the pool that part 3's transactions run on is hardened in two ways. The firm-scope helpers that `to-move*.ts` import are unchanged.
  * A connection now refuses any query sent after its COMMIT or ROLLBACK.
  * A client released while a statement is still running is now judged only after its answers arrive.

  This is no contract change for code that ends its own transaction correctly, and the run below is green on it.
* **`web/src/modules/client-money/`** (FO-7s1 part 1): web only. Part 3 is API only.

**3. The check, run once at `2ea622a7e`:**

`npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7t_to_move.ts` gives **43 passed, 0 failed, exit code 0**. That is the same count as round 4.

There are no new findings. The two round 4 Minors are still open and still not blocking.

Verdict: Approve 2ea622a7ed9179a0b55e84f56a841a6c9b94b929

Reviewer: Approve 2ea622a7ed9179a0b55e84f56a841a6c9b94b929

## Round 6 (batch fix and merge of main, 921ee246f)
This is a diff-only check (P-277). The last Approve covered `7be8ca9cb`, which holds only records on top of round 5's `2ea622a7e`. Since then there are two commits on the branch (`git log --first-parent 7be8ca9cb..921ee246f`):
* `ed6036194`: the batch fix. Merge batch run 45469373950, shard 23, failed `check_pf28_inputs`: Undo with a malformed batch id answered 422, not 404.
* `921ee246f`: the merge of main (`4328e3dac`, which brings in #3497 CS-D6 part 2 and #3552 FO-7v part T).

**1. The reorder changes nothing else** (`to-move.ts:127-128`).
* The diff is one line moved: `bid` (UUID check, else `notFound("batch")`) now runs before `parse(UndoIn, body)`, not after it. No other line in `trust/` changed (`git diff 7be8ca9cb 921ee246f -- …/client-money/trust` is these two lines only).
* `scopeOf(ctx)` is still read on the same line as before, before `this.write(...)`, so it is still outside the transaction (the r9-M1 shape).
* Inside the transaction nothing moved. The order is still: `trustShows`, then the batch read, then the lines with C5 (`visible`), then `notFound` on an unseen line, then `takeLocks`, then the insert. C5 still comes before every lock, and the lock order is still `takeLocks`' sorted party and currency.
* The new early `notFound` throws before any read or write. A malformed id cannot be a real batch, so a 404 says nothing about another firm's data. It is the same pattern as the older trust routes: `service.ts:123` `cancel` (`idOf` before `parse`) and `reads.ts:34`.
* There is one small change in behaviour, and it is the intended one. A malformed id with a bad body now answers 404, not 422. A well-formed id still gets the body checked first (422 before any database read). DW13's "no reason → 422" case still passes.

**2. No other part 3 route has the same issue.** `to-move-routes.ts` has three routes, and only `POST batches/:id/undo` has a path parameter. `GET /to-move` takes only a query, and `POST /batches` takes only a body. Part 3's change to `money-out.ts` (the refund's `unclearedAcknowledged`) is on a body-only route. The new test (`check_fo7t_to_move.ts:194-195`) sends a malformed id with `{}`. It expects 404 and `batches() === 2` (nothing written), and it sits before the other DW13 cases.

**3. The merge resolution.** `git show --cc 921ee246f` shows one file resolved by hand, `ports/notifications.ts`, and nothing else.
* Both maps keep both kinds: `KEEP_PERIOD_PASSED → NEEDS_YOU` (main) and `TRUST_TO_MOVE_WAITING → PAYMENTS` (part 3).
* `NOTIFICATION_GROUP` is a `Record<NotificationKind, …>`, so a missing key would fail the type check. I checked both keys by eye. I could not run the API's `tsc --noEmit` here: it ran out of memory twice (exit 134). CI's types job is the check for this.
* `NOTIFICATION_ITEM_KIND` is unchanged. Part 3 uses item `firm`, and CS-D6 uses `case`. Both were already in the list.

**4. Main's new code against part 3**
* **CS-D6 keep period** (`documents/keep-period.ts`, `features/case-keep-period.ts`): no `money_*` table. Its jobs are `case_documents.keep_period_*`. Part 3's jobs are `client_money.trust_to_move_*`. The names do not overlap. Each feature has its own once-per-runner `WeakSet`.
* **FO-7v part T** (`client-money/reversals/`): it writes one `CORRECTION` naming a deposit, with kind RETURNED, RECORDED_BY_MISTAKE, WRONG_CLIENT or OTHER, under `money_trust_lock` for the deposit's party. Neither part changes the other's tables, routes or event names. The checks against part 3:
  * **The list:** `money_to_move` (FO-7mv) lists only `WRONG_ACCOUNT` corrections. The `money_move_line` trigger refuses any other correction kind, so a reversal never becomes a line to move. Part 3's `kindOf` (`CORRECTION → WRONG_ACCOUNT`) stays right.
  * **Locks:** a reversal takes one party lock and no invoice lock, so it cannot invert `takeLocks`' order.
  * **One overlap, now reachable: round 4's Minor 2.** Before this merge, a RETURNED correction could only be written straight into the database. With main's `POST /payments/:id/reverse` it can now be made from the product. I ran a probe: a copy of this check, with the reversals feature mounted, run on a scratch database and not committed.
    * Setup: Client v has a CAD 500.00 cheque (not cleared) and a CAD 500.00 e-Transfer (cleared). CAD 400.00 is applied to an invoice. The cheque is then reversed as RETURNED (201, balance 100.00).
    * Moving the CAD 400.00 gives **409 UNCLEARED: "CAD 400.00 of this is from a cheque not yet cleared"**. A refund of the remaining CAD 100.00 gives **409 UNCLEARED** as well.
    * The control case is the same, without the reversal: the move answers **201 without asking**.
    * The cause: the returned cheque's deposit still counts in `uncleared` (`to-move.ts:166`, `money-out.ts:69`), even though its reversal has already taken it out of the ledger.
    * The question only warns and never blocks (Lead 29's ruling (b)). No money is wrong.
    * But the wording and amount are false. If staff acknowledge, the audit line records `unclearedAcknowledged: true`.
    * It is the same reading as part 2's `held`, so it stays **Minor, not blocking**. It now has evidence.
    * Fix suggestion: count only what is left of each uncleared deposit (its amount plus its corrections), in both places. Name it in the PR body next to the FO-7ts gap.

**5. The check, run once at `921ee246f`.** `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7t_to_move.ts` gives **44 passed, 0 failed**. That is round 5's 43 plus the new PF-28 case. Postgres ran on 127.0.0.1:54329 with a scratch database each time. Port 4400 was not used.

**Journey score (reviewer, API only): 8/10, unchanged.** This round changes no journey step except one: Undo with a broken link now answers "not found" instead of a field error. That is the honest answer.

**Open, not blocking:**
* Round 4 Minor 1 (the refund's audit flag is not asserted).
* Round 4 Minor 2, now reachable through FO-7v part T and shown by the probe above.

There is no new Blocker or Major.

Verdict: Approve 921ee246f39b8e6bd44b07b20bc1632c16ebc5ea

Reviewer: Approve 921ee246f39b8e6bd44b07b20bc1632c16ebc5ea
