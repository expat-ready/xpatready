# J-37 break report (breaker, high effort, 19 Nov)

**Row:** J-37, the public booking page with no double booking (join-and-walk). Brief: `lead-b-briefs/J-rows.md` §J-37 on `lead-b-front-office`.
**Code tested:** head `6567e1b75` with `origin/claude/runtime-arrival-port` (#2196, the real ArrivalPort) merged in. Tested in a separate git worktree (detached), never in the main copy.
**Copies:** `bj37` on :4448 and `bj37f` on :4449 (head without #2196, so fakeArrival). Both were started with `tools/isolated.sh`; the server's working folder was the worktree (checked with `/proc/<pid>/cwd`). Both copies are stopped and their databases dropped. :4400 was never used.
**Probes:** `p1`…`p7` in the session scratchpad `breaker-j37/`. They call the HTTP API, use Playwright for P5, and read or change the copy's own database.
**Walk:** `j_37.ts bj37 4448` gave **9 passed, 0 failed**. The walk ran from the worktree, so the main copy's screenshots were not rewritten.

## Broke

| # | Attempt | Expected | Actual | Severity |
|---|---|---|---|---|
| B1 | **Restart between commit and after-commit.** The booking's transaction commits, then the API stops before `afterCommit` has queued the jobs. To hit this window on purpose, a second session held `platform_jobs.job` in SHARE mode. Then: (a) `kill -9` (P3); (b) SIGTERM, as a deploy does (P3b). | The booking still gets its confirmation, the host email, the reminders and the attendance question (AG-4-34). | (a) The booking is committed, with no mail jobs and no attendance job. The booker's request failed, so they retried with a fresh form and were told **"That time is not available any more"**. The time is held by their own booking. Only one reminder got queued, and only by chance: the blocked insert landed after the process died. So the person later gets a reminder for a booking they were told had failed. (b) The answer is **201 "You are booked"**, but there is no confirmation, no host email and no attendance job. The log shows only `[booking] person email … failed after commit: jobs: the job runner has not started (or has stopped)`. In both cases nothing redoes this work after the restart: the `booking.scheduled` row in `module_event` is written, but nothing reads it. | **Major.** The window is narrow: it did not happen without the held lock (B1 repro note). But it is exactly the restart-mid-action path, and a failed queue insert after commit (for example a pg-boss pool error) ends the same way. `booking/service.ts:461` (afterCommit runs in the same process after the commit), `:553-571` (`safe()` only warns), `:456` (the outbox event has no consumer). |
| B2 | **A form open across a restart (P5).** In the browser: pick a time, fill the form, restart the API, then press "Book this time" twice. | The visitor books on the next press, or gets a fresh form that keeps their answers. | Both presses show "We could not take this booking. Please reload the page and try again." The answers stay on the page, but no new stamp is fetched, so every press fails until a full page reload. Cause: the form-stamp key is random per process. `runtime-ports.ts:15-19` gives no `formKey`, so `service.ts:201` uses `randomBytes(32)`. The stamp check is at `:870`. On the web side, `type-page.tsx:195` shows the detail but does not call `onStale()`. Every visitor with the form open during a deploy has to reload and retype. | **Minor** |
| B3 | **Job throughput (P4 log).** 10 reminders due at the same moment. | They arrive close to their due time. | The jobs run one at a time, **2 s apart** (api.log: 03:08:34.7, 36.7, 38.7 …). Each email then waits for its own outbox worker. `pgboss-jobs.ts:266` (`batchSize: 1`) and `:98` (polling every 2 s). At the brief's scale (about 100 firms), 300 one-hour reminders due in the same minute would finish about 10 minutes late. STANDARDS §9 has no budget for jobs, and the runner belongs to PF-14. | **Minor** (the J-37 path exposes it) |

**B1 repro (a):**
1. `isolated.sh bj37 4448 start`, then make a firm with one host and the type `free` (the walk's Sample rows).
2. GET `/api/public/firms/<key>/book/free/slots`, then wait 3.2 s.
3. In a second psql session: `begin; lock table platform_jobs.job in share mode;`
4. POST `/api/public/firms/<key>/book/free/bookings`.
5. Poll until the `fo_booking` row is committed, wait 0.5 s, then `kill -9` the listener on :4448.
6. `rollback;` in the second session, then `isolated.sh … restart`.
7. Result: `platform_jobs.job` for `booking:<id>:%` holds only `reminder-1h:created`. The demo inbox for the booker is empty. Booking the same time again with a fresh form gets 409 slot-taken.

For (b), do the same but send SIGTERM in step 5, and roll back 2 s later.

## Held

* **Real concurrency (P1):** the same slot was raced over HTTP: 9 bookers on 1 host, 9 on 2 hosts and 9 on 3 hosts. Each time exactly 1, 2 and 3 bookings were made (`201`), each on its own host. Every other booker got 409 `SLOT_TAKEN`. No person, lead or mail was made for any refused booker. Each winner got exactly one confirmation.
* **API killed mid-race (P2):** 9 bookers on one slot, with a SIGKILL 5, 40, 120 and 300 ms after they fired, then a restart. There was never more than one booking, and the number of people always equalled the number of bookings. The committed holder was answered 201 and got the confirmation, the reminder and the attendance job. A cut booker who resubmitted their old form got 400 "Please reload the page". It never booked twice. SIGTERM 60, 150 and 300 ms into 9 in-flight bookings (P3c, without the held lock): every 201 had its mail jobs, and requests that were cut never committed.
* **Reminders after a restart (P4).** Bookings made before the restart, everything else after it:
  * A booking two days out queued both reminders, the 24 h one and the 1 h one. Both arrived once each ("tomorrow", "in one hour").
  * Moved by link after the restart: the sequence-0 reminders were `cancelled`, and two new sequence-1 reminders were queued and sent.
  * Cancelled by link: every reminder was `cancelled`, and none was sent.
  * **Adversarial:** I put the cancelled and old-sequence jobs back to `created` with `start_after = now()` (the instant pg-boss's own note describes). They ran and sent nothing, because `runReminder` checks the sequence and the status (`service.ts:625-635`).
  * A completed reminder run again sent nothing new (the outbox `idempotency_key`). A firm-A booking's job with firm B in its envelope also sent nothing (P6).
* **Firm B through the real port (P4):** the same email, in upper case at firm B, made its own firm-B person. Firm B's front office was seeded in the booking's transaction. Each firm's reminders greet that firm's person and name that firm.
* **Consent through the real port (P4):** with no tick, the booking made one person and one lead and wrote **no `msg_consent` row**. The SERVICE-class reminders still arrived. With the tick: one person, one lead and one consent row with source `BOOKING_FORM`.
* **Manage link after a restart:** the link from an email sent before the restart opens the booking (200, `canReschedule`), and moves and cancels by that link work (P4, walk W5). After a restart, a move by link raced 5 new bookers for one time, and exactly one got it (P7).
* **False PASS:** the walk run on the head without #2196 (fakeArrival, `bj37f`) gave W1-W4 and W5 PASS and **W4b FAIL**: the reminder was queued and run, but nothing arrived. So W4b fails on the fake, as the PR claims. The other ways a step could pass when it should fail also hold:
  * A refused restart (the copy cap) makes `execFileSync` throw, so the walk exits non-zero.
  * No reminder queued, or a reminder lost by the restart, leaves `due` undefined, which is a FAIL.
  * W3 counts the database rows after both screens have settled.
  * W4's "fail side" passes on both the fake and the real port, which is right for a negative check.

## Not attacked (why)
I did not test hostile uploads, rules and hierarchy, keyboard, 1024 px or 200 % zoom. The joined path has no uploads or rules, and the screen is FO-3w's (its own row; the brief says to attack the joined path, not the walk's style). The per-IP and per-firm limits and the used-stamp list live in memory, so a restart resets them. That was seen, but it is FO-3f's design and not part of this row.
