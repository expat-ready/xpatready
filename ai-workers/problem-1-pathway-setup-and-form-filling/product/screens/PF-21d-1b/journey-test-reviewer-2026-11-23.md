# PF-21d part 1b: journey test (reviewer), 23 Nov

Commit `2a39e1473`. This is an API and job item with no screen, so each journey is walked over HTTP against a test app
on :4431 (runtime range, never :4400). The app runs on scratch databases with a fake clock, and I read the database after
each step. Scripts were scratch only and are deleted with the worktree.
Persona: the Platform Owner, who manages the register of requests made to ExpatReady (`system/compliance:dsr-manage`).
Other roles tried: our Support and Auditor, and a firm's staff.

## Journeys
1. **Main path.** A client asks ExpatReady to delete their data. The Owner approves → `200 {status: IN_PROGRESS,
   eraseOn: day+7}`. On day 7 the job erases that person's rows only and the request reads COMPLETED, with one step per
   module and the actions taken. **Held.**
2. **Alternate: the client changes their mind.** Cancel on day 6 → `eraseOn: null`; day 7 erases nothing; a second
   cancel → 409. **Held.**
3. **Emergency stop.** The switch is off, so day 14 erases nothing and writes one SKIPPED step over two runs. After the
   switch goes back on, the next run erases. **Held.**
4. **Held file.** A legal hold on the person → HELD with the hold's reason, nothing erased. After the release the next run
   erases. **Held.**
5. **Error: one module fails.** Everything rolls back and the request stays scheduled. **But the request shows no
   error** (only the log has it; SA-11-40 Failure). **Partly.**
6. **Wrong role.** Support, Auditor and a firm's staff all get 403 on approve and on read (`MISSING_PERMISSION`,
   `FIRM_SESSION_REFUSED`). **Held.**
7. **Recovery: double click.** Two approves at once → 200 and 409, with one ERASURE_APPROVED step (32 ms). **Held.**
8. **Across the boundary: the job runs while the Owner cancels.** Cancel → 200, yet the rows are erased and the request
   reads cancelled with no record of the erasure. **Failed** (review B2).
9. **Across the boundary: the register's own status control.** Marking the request COMPLETED by hand during the window →
   it reads "COMPLETED" and "Erasing on 2026-12-08" at once, and nothing is ever erased. **Failed** (review M3).
10. **Before part 2 ships.** With no module registered (today's real app), an approved deletion would end COMPLETED with
    "nothing to erase". **Failed by reading the code** (`service.ts:167-168`; review M1).

## Break it
Bad notes: a number, an extra field, a bidi character, 2001 characters, blank → 422, each with a field message. A bad id →
404. An upper-case id is accepted. Notes in French and Chinese are stored exactly as entered. A firm session calling any
of the six definers is refused by the database. xr_app updating `erase_on` directly is denied.

## Data underneath
Each change writes one step and one audit line (ALLOWED, or REFUSED with its code). The person's rows are gone only in
journeys 1, 3 and 4 (and 8, wrongly). A family member's rows and another firm's stay. The audit target has no person id
(m3).

## Score (8 criteria apply; accessibility and visual quality are N/A with no screen; 5 of 8 scales to 6.25)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1-4 work; journeys 8 and 10 give a wrong outcome |
| Next step obvious | ½ | `eraseOn` and the status are returned; after a failure the request shows nothing to act on (journey 5) |
| Plain words | ½ | The details are plain, but one names "SA-11-40" (`service.ts:102`) |
| Feedback and state | ½ | A cancel answers 200 yet the data is erased (journey 8); "Completed" and "Erasing on" at once (journey 9) |
| Correct data | ½ | Firm and person scope are exact; an erasure goes unrecorded (8); a false COMPLETED can happen (10) |
| Error recovery | 1 | Rollback and retry, hold then release, cancel then re-approve all recover |
| Speed | 1 | Approve 17 ms; a run takes milliseconds per order |
| Trust and sources | ½ | Steps name module, outcome and counts; an erasure can happen with no trace (8) |
| Accessibility and screen sizes, visual quality | N/A | No screen in this item |

**Score: 6/10 (5 of 8). Fail (under 8). No criterion at 0.**
What raises it, most valuable first: B2 (claim the order, so a cancel waits) → criteria 1, 4, 5 and 8. M1 (with no eraser
registered, never COMPLETED) → 1 and 5. M2 (the failure as a step) → 2 and 4. M3 (the move refuses COMPLETED while an
erasure is scheduled) → 4. m4 (no requirement id in user text) → 3.

Could not test: a screen reader, widths or axe (no screen); a real PF-14 runner; real erasers (part 2). D17/D20 stay with
the founder.
