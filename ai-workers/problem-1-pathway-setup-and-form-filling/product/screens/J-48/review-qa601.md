# J-48 / QA-601 review: a refused firm email ends Failed (R1.48), PR #2521

Reviewer (independent, not the builder) · 20 Nov · branch `claude/modest-planck-xi4tzx`, head 73ad89aff30c904a258190887db1222b9444c36a.
Diff: `git diff origin/main...73ad89aff`. App code: `send/messages.ts` (+47), `channels/email/local.ts` (+7). Test: `tests/journeys/j_48.ts` (DW6 block, :301-327; the rest was reviewed in `review.md`). Records: `MODULE.rows/J-48.md`, `screens/J-48/`.

## Ran (isolated copy r601 on :4437, PLATFORM_IDENTITY=local, --ttl 30; stopped afterwards; never :4400)
- `tests/qa/check_qa601_provider_failed.ts 4437 xr_studio_r601`: 2/2, 5 tries, FAILED "send failed", 1 FAILED event.
- **Rule removed** (the `.catch(… ProviderRefused)` at messages.ts:218 dropped, then restored with `git checkout`): the QA check fails (QUEUED, no reason, 9 tries), and j_48 fails on DW6 pass and DW6 lead page ("Waiting to send"), 39/41, exit 1. The rule's tests bite.
- `j_48.ts r601 4437`: 41/41 exit 0, twice on the same kept copy (44 s each). Re-rendered screenshots restored with `git checkout`.
- Own probe (in process, fake clock, refusing adapter, copy's database):
  - P1: three `deliver()` at once on one row: 3 adapter calls, 2 counted ("try 2 of 5"). Under-counts in a race, never over-counts.
  - P2: a row at "try 3 of 5" that meets the daily cap reads "daily limit", and its next refusal reads "try 1 of 5". The count is lost (Minor 1).
  - P3: a files error after a counted try leaves "try 1 of 5": a non-adapter error is not counted.
  - P4: the sweep queues a counted row only once its wait is over (0 at 1 min, 1 at 3 min), once per try and hour (a second sweep queues 0). A later success clears the reason (SENT, null).
- Live job runner: the mutated run left a refused row QUEUED on the copy (58a94ea3). The copy's own pg-boss worker counted it as a firm job (`withFirm`, walls on): the old sweep's job gave "try 1 of 5" at 12:06:06Z, and pg-boss retries gave try 3 at 12:08:28Z. Each try has one log line of ids, "send failed (MessageRejected)", and no address.

## Read
messages.ts in full; local.ts; firm-scope.ts (walls, `asJob`, BYPASS_USES); platform-jobs.ts:68; pgboss-jobs.ts (keys used for ever, DEFAULT_RETRY 3 × 30 s doubling); ports/jobs.ts `fakeJobs`; mail.ts (`capHolds`, `heldOf`); identity/service.ts:338-344; email-sender.ts:43; staff-routes.ts:76-87; web contract.ts `reasonWords`/`STATE`; messages-panel.tsx; bounces.ts:117-143; demo-inbox.ts:32; BUGS.md QA-601/602.

## Checked and sound
- **Walls.** A firm send job runs inside `withFirm(job.firmId)` (platform-jobs.ts:68). `countRefusal`'s fresh `$transaction` (messages.ts:178) opens in the same async scope, so it gets the same firm and role. Its queries also name `firmScope`. The FAILED `msg_event` carries the job's firm. The new sweep query (:280) runs in the sweep job's named bypass (`job:messages.outbox_sweep`), like the existing one beside it.
- **Only the adapter counts.** The wrap is around `adapter.deliver` only (:218). A Prisma or files error rolls back uncounted (P3). An error after the adapter accepted the send is also uncounted, as before.
- **No double counting.** Each count needs its own adapter failure under the row lock. The `stateReason` guard on `updateMany` (:182) drops a stale second count (P1). pg-boss retries (about 30, 60 and 120 s) give tries 2-4, and the sweep's waits (4, 8, 16 min after a try) stay behind them, so the sweep normally gives only try 5. That puts a refused row at FAILED after about 20 min.
- **Sweep keys.** The old sweep (:270-275) takes reason NULL or "daily limit". The new one takes "send failed: try %". The two sets do not overlap. The key `msg.send:<id>:try:<n>:sweep:<hour>` is distinct from the dispatch key, the old sweep key and the platform key, and it is about 70 characters.
- **QUEUED with a reason, elsewhere.** The panel shows "Waiting to send", then "Trying again: the email provider did not take it yet", then "Failed" with "The email provider did not take it" (the words were already on main). `heldOf` and identity/service.ts read only `held` from `capHolds` at write time, and a new row's reason is NULL. A repeated key on a counted row answers QUEUED. On a FAILED row, mail.ts:96 refuses with "not sent: send failed". bounces.ts ignores a notice for a QUEUED row with no provider id. demo-inbox reads only SENT or DELIVERED rows.
- Local adapter: `SAMPLE_REFUSED_ADDRESSES` is labelled Sample. It throws before any event, and the thrown name is all that is logged (no address).

## Findings
No Blocker. No Major.

**Minor 1. The daily-cap hold erases the try count** (messages.ts:217; P2).
- A counted row that meets the cap gets "daily limit". After the hold its tries start again from 1.
- So a firm at its cap every day can keep a refused row QUEUED much longer than 5 tries. It is bounded only by the hold days.
- Fix: keep the count through a hold (for example, do not overwrite a "send failed: try" reason with the hold, and let the retry sweep re-try it), or record the reset as accepted in the PR.

**Minor 2. `countRefusal` reads and then writes, on Prisma's default 5 s transaction** (messages.ts:178-183).
- If another worker holds the row lock during a slow SES call (up to SES_TIMEOUT_MS, 20 s), the `updateMany` waits. The transaction then times out (P2028), and the job fails with the Prisma error instead of the provider's error. That try goes uncounted.
- P1 shows the same read-then-write losing a count without any timeout.
- Fix: one `UPDATE … SET state_reason = <next from the current value> … WHERE state = 'QUEUED' RETURNING` under the row lock, or pass `{ timeout: DELIVER_TX_MS }`.

**Minor 3. The retry sweep cuts at 2000 across all firms before it filters for "due" and for each firm's share** (messages.ts:280-287).
- During a provider outage (ACTIVE cap 2000 a day), one firm's not-yet-due rows (oldest `updated_at`) can fill the 2000. Other firms' due rows then wait.
- This is the break-M1 class that the query above it solves with `row_number() OVER (PARTITION BY firm_id)`. It recovers by itself as the waits pass.
- Fix: compute the due test (`updated_at <= now - 2 min · 2^(tries-1)`) and the per-firm `rn <= SWEEP_PER_FIRM` in SQL, as :270-275 does.

**Minor 4. DW6's in-process `Messages` acts as a second worker for the whole copy database** (j_48.ts:303-313).
- `m6.register()` plus `m6.sweep()` run as the table owner, on a fake clock hours ahead. Every QUEUED row of every firm then looks due (old crash rows, held rows on a new "day", platform rows). Those rows are sent through the in-process local adapter, which has no test events.
- Seen on my copy: the QA check's leftover row (refused.<run>@example.com, reason NULL) was sent by DW6. It ended SENT with no Delivered event, with sent_at 4 hours in the future.
- CI runs on a fresh copy, so no assertion is affected. But it breaks journey-test §4 ("nothing else changed") on a kept or shared copy.
- On the race asked about: the copy's own worker cannot take DW6's row. It is dispatched to `fakeJobs`. Its first try is counted within milliseconds of the send. After that its `updated_at` is in the fake future, so the copy's sweep never finds it due.
- Fix: before DW6, read the QUEUED rows other than DW6's. After DW6, assert that they are unchanged, or stop with a clear message if any exist.

**Minor 5. DW6's times on the lead page are in the future** (j_48.ts:303; committed `DW6-lead-messages-failed-1440.png`).
- The shot shows "Failed Nov 20, 3:44 p.m." and "Sent 3:44 p.m." under a lead that arrived at 11:43 a.m., because the fake clock ran 4 hours ahead.
- Fix: say so in notes.md beside the shot (moving the clock back would let the copy's own sweep race the row).

**Minor 6. notes.md does not record this PR** (screens/J-48/notes.md:13-14).
- Results still says 37/37, with no DW6, no QA-601 and no 41/41 evidence.
- Fix: add a QA-601 / DW6 line with the runs above, the builder's suite numbers and this review.

## Journey test (reviewer; scripted runs, probe and code, not walked headed)
Journeys:
1. Main: case staff send to a refused address. The row shows "Trying again", then "Failed", with the reason on the lead page.
2. Alternate: an address the provider takes is SENT.
3. Error: a files or DB error is not counted.
4. Race: two workers on one row.
5. Cap: a refused row meets the daily cap.
6. Recovery: a counted row is later accepted.
7. Wrong firm: the staff read of another firm gives 404 (W5 fail line).

| Criterion | Score | Evidence |
|---|---|---|
| Task done | 1 | QA check 2/2, j_48 41/41 twice; the rule removed fails both |
| Next step obvious | ½ | "Failed · The email provider did not take it" gives no hint of what to do (check the address) |
| Plain words | 1 | "Trying again: the email provider did not take it yet" / "Failed" |
| Feedback and state | 1 | the state goes Waiting, Trying again, Failed; Failed event with its time |
| Correct data | 1 | one FAILED event, "send failed", 5 tries; success clears the reason (P4) |
| Error recovery | ½ | the hold erases the count (Minor 1); a count is lost in a race (Minor 2) |
| Accessibility and sizes | 1 | axe clean on DW6; the same panel at 1024/1440 px in W5 |
| Speed | ½ | not timed; about 20 min to Failed by design (fake clock here) |
| Visual quality | 1 | danger pill with the word; reason in muted text |
| Trust and sources | 1 | address masked, from-name the firm's, Sample label on the refused addresses |

**8.5/10, pass, no 0.** Not tested: a screen reader, a real SES refusal (QA-602 blocks it), an unaided user walk (D17/D20 stay with the founder).

**Verdict: Approve** (no open Blocker or Major). Minors 1-6 can go on the PR as follow-ups.

Reviewer: Approve 73ad89aff30c904a258190887db1222b9444c36a
