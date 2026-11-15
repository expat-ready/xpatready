# FO-2 part 2 review (PR #1843, head eee7a5ba7, API only, no screen; permissions)

Reviewer: Opus, fresh context. I did not build this (P-303). Diff: `git diff origin/main...eee7a5ba7`, 9 files, +261/-27, in a clean worktree in my scratchpad.
Read: brief FO-2; Lead B's rulings 6892106486 and 6892510521 on #1813; BACKLOG row FO-2 (rev 16.21, 16.26); concept fo-4-sales §6 (BR-9, BR-10); AG-2-4, AG-2-13c, AG-2-80 and AG-2-86 in AG-02 v2.6.

## What I ran
* `tests/check_fo2_leads_prospects.ts` at eee7a5ba7: **95 passed, 0 failed** (the same as the builder).
* Probes: a throwaway copy of the suite with my own cases added before its `catch`, run on its own scratch database, then deleted. Nothing is committed. Results are quoted below.
* A timing run of `openMinutes`: 500 rows, with Sample hours Mon-Fri 09:00-17:00, America/Toronto.
* `graph.mjs`: GRAPH.md has no FO-2 entry. The routes are API only and FO-4 owns the screen, so there is nothing to map.
* CI at eee7a5ba7: one `pr-rules` run failed and the other passed; the rest succeeded or were skipped. The builder should read the failed run.
* The rules that hold, each tested and probed:
  * the assignees shape and its five named tests;
  * Assign checks the editor set inside the transaction after `FOR UPDATE`;
  * X-4 at arrival;
  * Close refuses system reasons and firm B's reasons;
  * Reopen writes an INTERNAL note;
  * the events are in `ports/events.ts`;
  * the advisory lock is transaction-scoped;
  * the name marks are refused;
  * a losing Take it gets 409 or 404 as Lead B ruled.

## Findings

### Blocker
None.

### Major
* **M1. Add a lead: a retry with the same `requestId` gets 409 KNOWN_PERSON, not the lead it already made.** `leads.ts:131-140`. The known-person check runs before the receipt (`arrival.ts:48-50`), so the idempotency by `requestId` only holds when the request says `confirmedNew: true`. The suite's test (`check_fo2_leads_prospects.ts:291-295`) sends `confirmedNew: true`, so it never hits this.
  * Scenario: the adder saves a new person, and the answer times out. The screen resends the same body and `requestId`. It gets 409 "This person may already be on file" naming the person it just created (probe P1: first call 200, second 409 `KNOWN_PERSON` naming that person).
  * If the adder then picks "someone new" with a fresh `requestId`, a duplicate person and lead are made.
  * Fix: look up the receipt `manual:<requestId>` first and return its lead, before any match check.
* **M2. Add a lead: `personId` lets someone attach a lead to a person they may not see, and then read that person's details.** `leads.ts:130` → `arrival.ts:54`. Only the firm is checked. AG-2-4 rule 6: for a person the adder cannot see, "Only Add as new is possible". The 409 answer hides the id (`personId: null`), but the server never checks a `personId` it is sent.
  * Scenario: with "everyone sees all" off, Case Officer O has an id for a person whose only lead belongs to T. O might have it because they owned that lead before it was reassigned. `leads.read(O, T's lead)` gives 404, but `leads.add(O, { personId })` succeeds. The answer returns that person's name and email (probe P2b), and O now owns a lead on them.
  * Fix: allow `personId` only for a person with at least one lead `sees()` passes for. Otherwise answer 404, the same as another firm's person. Add a pass/fail test.
* **M3. Captured attribution is still refused, so the public enquiry is lost.** `public.ts:181` cuts by code points, then calls `text()`, which measures UTF-16 length (`common.ts:27`).
  * Scenario: `utmCampaign` of 150 emoji is 150 code points but 300 UTF-16 units. The form post gets 422 "utmCampaign: at most 200 characters" and no lead is made (probe P3).
  * Same root: a `referrerUrl` holding U+2028 or U+2029 is not in `CAPTURED_JUNK` (`public.ts:38`). It reaches the one-line rule and gets 422 (probe P4).
  * Part 1's carried Minor said "never refused". Fix: run captured values through a separate cleaner that never throws (drop line separators as well, cut by code points with no second length check), and test with astral characters.
* **M4. The open-hours wait gets slower with each lead's age and blocks the Node process.** `open-minutes.ts:104-108` walks every day from arrival to now for each row. Each day makes about 6 `Intl.DateTimeFormat` objects (`business-days.ts:15`, through `zonedInstant`). `leads.ts:52-57` runs this for up to 500 rows per list read.
  * Timings for 500 rows: 1 day old 0.3 s, 7 days 1.5 s, 30 days 6.0 s, 90 days 20 s, about 300 days 59 s. All of it is synchronous CPU, so every firm's requests wait meanwhile (one process, P-562).
  * Scenario: one firm whose open backlog is a month old opens "All open". The whole API stalls for about 6 s on each refresh.
  * Sample data is still fast (28 rows in 34 ms), but this is a fault in how the work is done, not scale tuning. Fix: work out each local date's open and close instants once per request (all rows share one calendar), or count whole weeks directly. Keep the four named tests.

### Minor
* **m1.** `leads.ts:136`: the known-person check decides "seen" from the raw `ownerStaffId`, whereas `read()` and the lists treat a deactivated owner as none (BR-4).
  * Scenario: O lists the lead under Unassigned (probe P5a), yet Add tells O "A person you cannot see" (P5b), and only Add as new is possible.
  * Fix: use `activeOf` here as well.
* **m2.** `leads.ts:206`: the ALREADY_TAKEN 409 also answers Close, Reopen and Assign.
  * Scenario: O closes a lead T owns and gets "Second representative (Sample) already has this lead." (P9). The words are for Take it.
  * The ruling (6892510521) covers Take it, so other changes by someone who cannot see the lead should get 404.
* **m3.** `leads.ts:158`: Assign reads the assignee's status from the staff map taken before the transaction (`leads.ts:196`). Only the editor set is read under the lock.
  * Scenario: a deactivation that commits between the two reads lets an Assign reach an inactive person.
  * Fix: read `platform_staff.status` inside the transaction.
* **m4.** `arrival.ts:48-50`: `payloadHash` is stored and never compared.
  * Scenario: the same `requestId` with a different body silently returns the first lead (P11: it asked for other1@ and got first1@).
  * Answer 409 on a mismatch, or record why not.
* **m5.** Close and Reopen are under `agent/prospect:edit` (`routes.ts:145-149`, which matches concept BR-10), but AG-2-80 §8 says `agent/prospect:lose`. The same four roles hold both keys today, so nothing differs yet. Route this to Lead B. `lead.closed` carries `reasonKey`, where AG-2-80 §7 and §9 name it `closeReasonKey` (`ports/events.ts:119`).
* **m6.** AG-2-4 rule 1 makes the source required, but `leads.ts:126` falls back to "MANUAL" when none is sent.
* **m7.** Weak test: `check_fo2_leads_prospects.ts:249` only checks `waitedOpenMinutes >= 0` on list rows. Replacing it with 0 or with the plain elapsed time still passes. Assert one row's exact value against `openMinutes`.
* **Note for the founder (not a finding):** Lead B's assignees rule (editors only) differs from AG-2-13c rule 11 ("the everyday picker lists active users of this firm, not filtered by role"). It is a ruling against a requirement (AGENTS rule 2), so it should be recorded rather than settled here.

## Screen-review dimensions
API only: D1-D20 and BIC-01-BIC-20 are N/A (no screen; FO-4 walks them). Standards [M] §9: the "no request per row" rule is met, since the wait is worked out in memory. The CPU cost per row is M4.

## Journey test (reviewer role, API journeys, no browser: no screen)
Journeys, run against the service on a scratch database:
1. A Case Manager lists Unassigned and sees the wait.
2. Assigns to an editor.
3. Assigns to a Read-only member (refused).
4. A Case Officer adds a known person, picks them, then retries.
5. Adds a new person and retries the same request.
6. Closes, then reopens.
7. A visitor posts with an emoji campaign tag.
8. A wrong-role or hidden-person pick.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | journeys 1-3 and 6 held; 5 (M1) and 7 (M3) fail |
| Next step obvious | 1 | each refusal names its field or code (`KNOWN_PERSON`, `fields.staffId`) |
| Plain words | ½ | Close on another person's lead says "already has this lead" (m2) |
| Feedback and state | 1 | the change returns the lead read again; events and audit lines are one each |
| Correct data | ½ | a lead on a hidden person (M2); same request id with a new body returns the old lead (m4) |
| Error recovery | ½ | a retry turns into a false duplicate warning (M1) |
| Accessibility and sizes | 1 | N/A for an API; problem+json is consistent |
| Speed | ½ | 34 ms on Sample data; 6 s for 500 month-old rows (M4) |
| Visual quality | 1 | N/A (no screen) |
| Trust and sources | 1 | the match line hides people the viewer may not see; Sample labels kept |

**Journey score: 7.5 / 10, below the pass (8).** The fixes that raise it most: M1, M3, M2, M4.

Not checked: a browser walk (no screen); `check_forms_qa53` (it fails in this container on main as well, and CI runs it); a live HTTP run through the guard (the keys are checked by the suite's metadata test).

**Verdict: Block** (reviewed eee7a5ba7). Fix M1, M2, M3 and M4, each with a pass and a fail test. The Minors can go in the same PR or be recorded for later.

## Re-review: diff only, `eee7a5ba..982738fb6` (Lead B rev 16.29 applied)
Read: `git diff eee7a5ba 982738fb6`, in a clean worktree of my own. Suite at 982738fb6: **110 passed, 0 failed**. I reran my first-round probes on a throwaway copy of the suite, then deleted it.

| Finding | Status | Evidence |
|---|---|---|
| M1 retry | Fixed | `leads.ts` `add()` looks up the receipt `manual:<requestId>` first. Probe P1: the same body twice, with no `confirmedNew`, returns the same lead id. |
| M2 hidden pick | Fixed | The picked `personId` must have a lead that `sees()` passes for, counting only active owners. Probe P2: O picking T's person gives 404, in lower or upper case. |
| M3 attribution | Fixed | NFC first, then junk removed (U+2028 and U+2029 added), then the cut by characters; `text()` counts characters. Probe P3: 300 emoji plus U+2029 → the lead is kept, nothing refused. |
| M4 wait cost | Fixed | `openWindows` runs once per list; each row is a binary search over prefix sums. Timing, 500 rows: 30 days old 20 ms, 400 days 121 ms, 1,000 days 112 ms (the walk is capped). Fri 16:30 → Mon 09:30 still gives 60. |
| m1-m7 | Fixed | m1 `activeOf` in the known-person check; m2 `namesLoser` is set for Take it only (probe: Reopen and Assign of T's lead by O give 404); m3 the assignee is read in the transaction; m4 409 `REQUEST_REUSED`; m5 the event field is `closeReasonKey` (no other reader of `reasonKey` in api, ports or tests); m6 `source` is required; m7 the wait is checked exactly. |

The breaker fixes I checked:
* `expectedOwnerStaffId` with 409 STALE_OWNER, checked under the row lock, so a Take that won is never overwritten;
* `{ id, done: true }` when the assigner loses sight of the lead;
* `personId: null` counts as absent;
* character limits.

Each has a pass and a fail test. Lead B's rev 16.29 matches AG-2-13c rule 11 (any active staff member, suspended people refused), which also clears my note for the founder.

New, Minor (Sample, no fix asked): a wait older than 400 days reports its last 400 days (136,860 minutes for both a 400-day and a 1,000-day row). The code says so (`open-minutes.ts` `MAX_DAYS`); the screen could show it as "over a year".

Journey score after the fixes: **9.5 / 10, a pass**.
* Task completed now 1: journeys 5 and 7 hold.
* Plain words now 1: Close on another person's lead gives 404, not "already has this lead" (m2).
* Correct data now 1.
* Error recovery now 1.
* Speed stays ½: the list still does about 120 ms of synchronous work for a firm with a year-old backlog.

Verdict: Approve (982738fb6dde4f9bec63d8495fd329044fe364f5)

## Re-review: diff only, `76e6a403..82a649d73` (Devin's three fixes)
Read: `git diff 76e6a403 82a649d73`, in a clean worktree of my own. Code: `arrival.ts` +2, `leads.ts` +4. Tests: +10. Suite at 82a649d73: **113 passed, 0 failed**.

What held:
* **Closing note.** `close()` writes an add-only INTERNAL note "Closed (<label>): <note>" in the same transaction. Nothing is written when there is no note. `fo_note.text` is unbounded, so the prefix cannot overflow it. The test checks the note after Reopen.
* **Assign with null (breaker m9).** Null is accepted only when the locked row has no active owner. The raw owner id still matches. An active owner who is not the expected one still gets 409 `STALE_OWNER`.
* **One request id reused at once.** After the unique receipt key has serialised the two requests, `arrive()` throws 409 `REQUEST_REUSED` inside the second transaction, which rolls it back, so it writes nothing. The rule is limited to door MANUAL, so the public form stays silent.

Minors (no fix asked):
* The owner's active status comes from the staff map read just before the transaction (`leads.ts` `change`), the same window as the earlier m3.
* The race test passes whichever of `add()`'s receipt lookup or `arrive()`'s check catches the reuse, so it cannot fail if only the new check is removed.

Verdict: Approve (82a649d73eae7b0bc1a985d24f873797f1ef401a)
