# FO-3h review: the host's booking emails in the host's office time (QA-470)

Independent Opus reviewer at high effort (P-303, P-605), 15 Nov 2026. I did not build this row. Commit **0d40a7419a9ac0a64ce400d78b737a20e107f9b2**, branch `claude/zen-archimedes-hyocil`, draft PR #1799.
* **Read:** `git diff origin/main..0d40a741` (2 files, +73/−3); the brief after its `---` (`origin/lead-b-front-office:…/lead-b-briefs/FO-3h.md`, rulings 1-3 and the named cases); QA-470 in `qa/BUGS.md`; qa's `tests/qa/check_qa470_host_mail_zone.ts`; `service.ts` `runMail`/`runReminder`/`runAttendanceAsk`; `settings.ts` `readSetting`/`TIME_ZONE`; the PR body and its "Question for the tech lead" comment.
* **Not applicable:** there is no screen, so the walks, 1024 px / 200 %, D1-D20 and the BIC table are N/A (FO-3/FO-3f precedent; the Lead said to skip the screen walk).
* **Journey test:** `journey-test-reviewer-2026-11-15.md`, **8.5 / 10, pass**.

## What I ran (never :4400; scratch worktrees and databases, all removed afterwards)
* **Suite on the branch** (`tsx tests/check_fo3_booking.ts`): **132 passed, 0 failed**.
* **Suite on main e888e0add with only the test commit 79b300ba3:** **127 passed, 5 failed**. The 5 failures are DW1 pass, DW1 fail, DW3 pass, DW3 fail and DW4, each showing "7:00 p.m. (Asia/Dubai)" or "1:00 a.m. (Asia/Tokyo)" in the host's mail. DW2 and DW5 pass on main by design: they guard what must stay the same. This matches the builder's numbers.
* **qa's check, unchanged:** **0/3 on main and 0/3 on the branch**. The booker's "kept" line fails too, so the cause is the harness, not this diff.
* **qa's check with 3 lines added in a scratch copy** (`const jobs = fakeJobs(clock)`, `await svc.registerJobs()`, `await jobs.runDue()`): **1 pass, 2 fail on main** (exactly QA-470's recorded state) and **3/3 on the branch**.
* **Type check** (`product/tools/typecheck.mjs`, `NODE_OPTIONS=--max-old-space-size=6144`, an environment need): **PASS, no new type errors (15 known)**.
* **Graph** (`graph.mjs --check`): G1 0 · G2 0 · G4 0 · G5 0, and G3 55 · G6 17, the same on main. No new gap.
* **Mutant:** with `hostZone` returning the literal "America/Toronto", the suite still gives **132/0**, so the mutant survives (m1).
* **CI at this head:** guard success; the rest is skipped because the PR is a draft (P-371). The full check runs when the PR is marked ready.

## Named cases (one per line)
* [x] **DW1 pass**: the host's mail reads "10:00 a.m. (America/Toronto)" in both subject and text. It fails on main, where it read "7:00 p.m. (Asia/Dubai)". `check_fo3_booking.ts:556-557`.
* [x] **DW1 fail**: exactly one host mail, and no "Asia/Dubai" in it. Fails on main. `:558`.
* [x] **DW2**: the booker's confirmation reads "7:00 p.m. (Asia/Dubai)". Passes on main and on the branch, so it is kept as is. `:560`.
* [x] **DW3 pass**: the booker moves the meeting from Dubai and is now in Tokyo; the host's moved and cancelled mails read "11:00 a.m. (America/Toronto)" in subject and text. Fails on main (it read Asia/Tokyo). `:580-581`.
* [x] **DW3 fail**: neither host mail names Asia/Tokyo or Asia/Dubai, and the booker's own moved mail stays "1:00 a.m. (Asia/Tokyo)". Fails on main. `:582-583`.
* [x] **DW4**: the attendance question, run 30 min after the end, reads "10:00 a.m. (America/Toronto)" and never Asia/Dubai. Fails on main. `:586-590`.
* [x] **DW5**: the host's and the booker's .ics have DTSTART 20261117T150000Z and DTEND …153000Z, byte-equal to `bookingIcs` for the same inputs. It passes on both main and the branch, so the bytes are unchanged before and after. `:562-569`.
* [x] **qa's 3/3**: met in substance, not as a literal run of the unchanged file (see the judgement below). Adapted harness: 3/3 on the branch and 1/2 on main. Unchanged file: 0/3 on both, for a harness reason.

## Scope and code
* **All four host mails go through `hostZone`** (service.ts:145-147). The `runMail` host branch builds the subject and text from one `hostWhen` (:503-505), covering booked, moved and cancelled through `booking.host_${p.kind}`. `runAttendanceAsk` uses it too (:554). No host-facing time in booking mail still uses `b.bookerTimeZone`.
* **Unchanged:**
  * The booker's mails still use `zone`/`when` = `b.bookerTimeZone` (:491, :515).
  * Reminders are not in the diff (:542).
  * The `.ics` is built by the same `invite()` with UTC `bookingIcs` (:493-497), untouched.
  * Staff screens and the public label paths (:239, :597, :639) are untouched.
* **Firm scope:** `hostZone` → `readSetting` → `firmScope(firmId, { key })` (settings.ts:77). `firmId` is `b.firmId`, from a row loaded under `firmScope(job.firmId)`. No new unscoped read. The `_staffId` argument is unused today, as ruling 1 intends, so PF-18a can extend it.
* **Touch list:** only `api/src/front-office/booking/service.ts` and `tests/check_fo3_booking.ts`. No schema, no migration, no port or event change.
* **Correctness:** the zone is read when the mail is sent, so a firm that changes its zone gets the current office time. A stored value that is not valid throws, the job fails and the runner retries it, the same as the slots path. Cost: one indexed read per host mail.
* **Tests are meaningful:** 5 of the 7 new cases fail on main for the exact defect and pass on the branch. DW2 and DW5 guard the kept behaviour. The new block uses its own firm, clock, jobs and mail, so FO-3's 125 earlier cases are undisturbed.

## Judgement: qa's check failing on main unchanged
**It does not block Approve.**
* The unchanged file gets 0/3 on main and 0/3 on the branch. Even its booker line fails, and this diff does not touch that line, so the cause is the harness and not the product.
* That harness has been out of date since FO-3f #1785 moved the mails into JobPort jobs. qa's check never registers or runs them, so no mail is sent at all.
* With the 3 job-runner lines, I reproduced qa's own recorded state on main (1/2) and 3/3 on the branch.
* The brief forbids the builder from committing `tests/qa/`. DW1/DW2 assert the same three things, with the jobs run.
* The builder disclosed all this on the PR ("Question for the tech lead", 05:46Z) and did not widen the row.

**Follow-up (not this PR):** qa adds the 3 lines to `check_qa470_host_mail_zone.ts` in its next records PR. QA-470 stays open until that file passes 3/3 on main.

## Issues
* **m1 (Minor, Should):** no test proves that `hostZone` reads the firm's setting. `check_fo3_booking.ts:536` writes `TIME_ZONE` = "America/Toronto", which equals the setting's default (settings.ts:173). A mutant returning the literal "America/Toronto" passes 132/0. Fix: in a later touch of this file, give one firm another zone (e.g. America/Vancouver) and check that the host's mail reads "7:00 a.m. (America/Vancouver)" for the 15:00Z booking. Not blocking: the code reads the setting through the standard firm-scoped helper, and the brief's named cases fix Toronto.
* **m2 (Minor, process):** the PR body says "Checks: to follow" and has no pasted output at this head. Before asking for the label (brief; rows rev 16), paste:
  * the suite line (132/0);
  * qa's check output, unchanged (0/3) and adapted (3/3);
  * the CI-part and shard suite lines on `main` merged in.
* **n1 (Nit):** `!!b1` in DW4 (:590) asserts nothing useful.

**Could not check:** a live run with PF-14's pg-boss JobPort (the change is inside `runMail`/`runAttendanceAsk`, which that path calls unchanged); a real mail client; full CI (the PR is a draft).

**Head moved during review:** the branch is now at 0b9ecac1f, which adds only `product/qa/built/FO-3h.md` (1 line, records). This Approve is for 0d40a741. A re-review of the newer head reads only that diff (P-277).

**Verdict: Approve** (no open Blocker or Major; m1, m2 and n1 are not blocking. Label only after green CI on the ready head, P-277/P-385.)

Reviewer: Approve 0d40a7419a9ac0a64ce400d78b737a20e107f9b2

## Re-review, diff only (P-277): 0d40a741..5ba4c9d0b9e24c92dc099a1c26d638c2230b4cbd

I read only `git diff 0d40a7419a9ac0a64ce400d78b737a20e107f9b2..5ba4c9d0b9e24c92dc099a1c26d638c2230b4cbd`. It touches 4 files, and no app code changed.

* **`product/qa/built/FO-3h.md`** (+1 line): a records line. It states the same scope as the review: four host mails, `hostZone` returns the firm's zone, the booker's mails, reminders and .ics are unchanged.
* **`screens/FO-3h/review.md` and `journey-test-reviewer-2026-11-15.md`**: committed byte-identical to what I wrote (`git diff --quiet` against the head is clean).
* **m1 closed** (`check_fo3_booking.ts:592-598`): new case "FO-3h hostZone". The firm's `platform.time_zone` is set to America/Regina, then a booking for 19 Nov 17:00Z mails the host "11:00 a.m. (America/Regina)" in subject and text, with no Toronto or Dubai.
  * The expected time is right: Intl gives "11:00 a.m." in Regina and "12:00 p.m." in Toronto for that instant.
  * Regina (UTC-6 all year, no DST) avoids any tz-data doubt.
  * The case runs last in FO-3h's own firm, so no earlier case sees the new zone.
  * **Mutant re-run at this head:** with `hostZone` returning the literal "America/Toronto", the suite now gives **132 passed, 1 failed**, and the failure is exactly this case ("12:00 p.m. (America/Toronto)"). At 0d40a741 that mutant survived 132/0.
* **n1 closed** (`:590`): `!!b1` is replaced by `ask.to === "fo3h-host@staff.example"`. This is a real check that the attendance question goes to the host. Removing the `b1` binding is harmless.
* **Suite at this head:** `tsx tests/check_fo3_booking.ts`, **133 passed, 0 failed**, exit 0. This matches the builder.
* **Still open, owner the builder:** m2, pasting the checks into the PR body before the label. It is process, not code, and does not block. The qa follow-up from the first review stands: qa adds the 3 job-runner lines to its check, and QA-470 stays open until that file passes 3/3 on main.

**Re-review verdict: Approve.** No Blocker or Major. m1 and n1 are closed; m2 is the builder's, before the label. Label only after green CI on the ready head (P-277, P-385).

Reviewer: Approve 5ba4c9d0b9e24c92dc099a1c26d638c2230b4cbd
