# J-109 break report (the complaints journey, R1.109)

Breaker, 18 Nov. Target: 648daeea9 on `claude/vibrant-meitner-3t1yfe`. The branch moved to d455699ce (review R1) during the run; where that changes a finding, it is noted. Isolated copy `j109b` on :4583 (`PLATFORM_IDENTITY=local`, never :4400), stopped afterwards. Real pg-boss (PlatformJobs), system clock, fakeMail. Probes were scratchpad scripts (API, Playwright Chromium, psql); none are committed. Screenshots: scratchpad only.
**Scope (P-26):** J-109 is the join (complaints on PlatformJobs and the system clock; mail stays fakeMail) and the walk `tests/journeys/j_109.ts`. Each finding below says whether it is **J-109** or an **existing part's** bug.

## Findings

| # | Sev | Owner | What I did | Expected | Actual | Where |
|---|---|---|---|---|---|---|
| M1 | Major | existing (PF-21v handler list + PF-21w `canAct`) | As a Case Manager, I recorded a complaint and chose the Read-only person as handler (`POST /api/platform/complaints`, `handlerStaffId` = Read-only). Then I signed in as that Read-only person. | A Read-only role writes nothing, or at least is not offered as a handler. | 201. The Read-only person now sees it (GET 200, list 1). They acknowledged it (200) and **closed it with outcome "Not upheld"** (200). The handler list offers every active staff member, Read-only included. | `api/src/platform/complaints/complaints.ts:188-192` (handler acts with no key), `:323-326` (handlers = all ACTIVE staff) |
| m1 | Minor | existing (PF-14) | Recorded 400 complaints with past received dates (all reminders already due). Then ran the walk on the same copy. | A due reminder runs soon after its date. | The queue drained at about 0.5 jobs/s (one job per 2 s poll). 338 jobs were still waiting about 1.5 min later. Each run takes about 28 ms. The walk's own past-due reminder stayed `created` for its whole 60 s wait, so **DW1 FAILED** (`{"ran":"created","sent":0}`, 25/1). The reminder queue is shared by every firm, so one firm's backlog delays another firm's reminders. | `api/src/platform/jobs/pgboss-jobs.ts:98` (poll 2 s), `:266` (`batchSize: 1`) |
| m2 | Minor | J-109 (walk) | Read DW1 and DW2. | Each test fails on the fake port and passes only on the real one, whatever else is in the queue. | (a) At 648daeea9, DW1 passes on pg-boss state `completed` alone, which a handler that skipped would also give. **Fixed at d455699ce**, which also needs a `REMINDER_SENT` event. (b) DW1 waits a fixed 60 s, so it fails on any copy with a reminder backlog (m1). (c) DW2: a fake clock frozen at server start would pass both checks if the walk runs within about 60 s of the start, because "a minute ago" is then before the frozen instant. In practice the walk's setup takes longer, so this is a weak proof, not a false pass. | `tests/journeys/j_109.ts:117-118` (648daeea9), `:118-125` (d455699ce) |
| m3 | Minor | J-109 (join choice, allowed by brief) | Let a past-due reminder run, then opened the record. | The record and audit say what really happened. | The timeline shows "Reminder sent to acknowledge · The system" and the audit says "sent to the handler". With fakeMail nothing leaves the machine, so on the demo the record claims a delivery that never happens. The brief allows fakeMail; the walk header says so. The visible event wording is not caveated anywhere. | `features/platform-complaints.ts:20`; `web/.../complaints/contract.ts:36` |
| m4 | Minor | existing (PF-21s) | Opened Record the acknowledgement, typed a note, pressed browser Back. | The same "Discard what you typed?" as Cancel or Escape. | No prompt: the page left and the note was silently dropped. Forward returned to the record with no panel. | `web/.../complaints/action-drawer.tsx:42` |
| m5 | Minor | existing (PF-21i screen), code read + API | A lost answer: same Idempotency-Key, body changed by one trailing space in the name. | The person can recover without a duplicate. | The API gives 422 IDEMPOTENCY_KEY_REUSED ("already used for a different complaint"). The drawer keeps one key per opening (`record-drawer.tsx:36-42`), so an edit after a lost answer gets this refusal. The only way out is close and reopen, which makes a new key and a second complaint. | `web/.../complaints/record-drawer.tsx:34-42` |

No Blocker found.

## What held (with the attempt)
* **Swaps are real:** `features/platform-complaints.ts` is the same on `origin/main` and at 648daeea9 (`systemClock`, `PlatformJobs`, `fakeMail`). Each new complaint leaves one row in `platform_jobs.job`, with `start_after` equal to the acknowledge-by instant (for example 18 Nov 12:02 gives Fri 20 Nov 17:00 Toronto). The walk otherwise passed 25 checks on my copy.
* **Duplicate reminders:**
  * The same key and body repeated: 201 then 200, the same id, one row, one job.
  * 10 parallel requests with one key: one 201 and nine 200, one row, one job.
  * Asking pg-boss for the same reminder key again: `{queued:false}`.
  * The same key from another person: 422. The same key in another firm: its own 201 (no collision).
  * The same key in quotes, or with the body keys in another order: 200. The key in upper case: a new 201 (keys are case-sensitive, which is acceptable).
  * No key: 400.
* **Cancel:** acknowledging cancels the job (`cancelled`). Closing without an acknowledgement cancels it too. Two sessions acknowledging at once: 200 and 409, one ACKNOWLEDGED event, job cancelled. Two parallel closes with different outcomes: 200 and 409, one CLOSED event.
* **Past-due run twice:** a reminder already sent, then a second job for the same complaint under another key: `completed` and skipped, `REMINDER_SENT` count stays 1.
* **Job for another firm:** a job enqueued as the solo firm, with a payload naming the Sample firm's complaint: completed, nothing sent (firm scope hides it). A payload naming the solo firm with the Sample firm's id: nothing sent.
* **Closed days:**
  * A closed day added before recording moves the date (19 Nov closed gives Mon 23 Nov).
  * A complaint received on a closed day still counts from the next business day.
  * A closed day added *after* recording leaves the stored date and the job's `start_after` unchanged (the database trigger keeps acknowledge-by fixed), and "business days left" drops from 2 to 1. Row, job and screen stay consistent. Whether the date should move later is a question for the lead, not a bug.
  * Closing every day for 13 months is refused by the setting.
* **Wrong role:**
  * Read-only and Case Officer: a list of 0 (open, all, closed, overdue).
  * Opened by address: Not found and nothing of the complaint shown. API GET, acknowledge, close, steps: 404. Change handler and handlers list: 403. Recording: 403. No Record button.
  * The solo firm's Owner gets 404 on GET and on acknowledge.
  * A handler from another firm is refused with 422.
* **Closed complaint:** acknowledge, response, step, handler change and close all give 409; a note is allowed (by design); DELETE gives 405. A stale page (closed elsewhere, then Acknowledge clicked) shows "closed while you were working", re-reads, and leaves Note as the only action.
* **Double submits:** a triple click on Record the complaint, a triple click on Acknowledge and a double click on Close each send exactly 1 POST. Reload straight after submitting the acknowledgement: one event, next step "step".
* **Text:**
  * Accepted: a 200-character Arabic name, a 4000-character Hindi, Chinese and Latin summary, and a 305-character contact.
  * Refused with 422: 4001 characters, 201 characters, a right-to-left override inside a name, zero-width-only text, spaces only.
  * No horizontal overflow at 1440, 1024, 720 (200% zoom) or 375 on the record page, the Close panel or the list, and the submit button stays visible.
* **Keyboard:** 5 Tabs reach Record a complaint. Enter opens the drawer with focus on the first field, the Tab order is logical, and Escape closes the drawer and puts focus back on a button.
* **Budgets (400 complaints and 405 reminders):** the list API with 100 rows takes 25-43 ms for every view. Browser first view of All: 368 ms with 3 API requests. Changing the view to Overdue: 162 ms with 2 requests. Show more: 197 ms with 1 request. No request per row; every result is under the 1 s and 200 ms budgets. No page errors.
* **Not applicable to this row:** uploads, test PDFs, rules and hidden fields, and renaming or deleting a master are not part of the complaints journey.
