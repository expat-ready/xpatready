# J-37 review: public booking walk (evidence lane, join-and-walk)

Reviewed commit: 48b350a4f8c0b031b35d5090a04c095fcc7f8159 (branch `claude/evidence-j37`; diff vs origin/main = one new file,
`prototype/studio/tests/journeys/j_37.ts`, 107 lines). Brief: `lead-b-briefs/J-rows.md` §J-37 on `origin/lead-b-front-office`.
Reviewer did not build it. Repository untouched. Copy `rev37` on :4447 only, never :4400. Web built from this branch first.

## Runs
| Run | How | Result | Time |
|---|---|---|---|
| 1 | plain, fresh copy | 7 PASS, 0 FAIL, 1 HELD | 12.7 s |
| 2 | plain, fresh copy | 7 PASS, 0 FAIL, 1 HELD | 12.8 s |
| 3 | same copy, `--import record.ts`, WALK_OUT in scratchpad | 7 PASS, 0 FAIL, 1 HELD. 2 traces and 15 step shots, **video/ empty** | ~45 s |
| probe | my own script on run 2's copy (scratchpad/probe/probe.mjs) | see below | - |

No flakiness seen in three runs. Mail got to the demo inbox within seconds, not minutes.

Probe results (run on run 2's copy, read from the copy's database and the inbox API):
* Outbox: A's mail TRANSACTIONAL and the host's SERVICE, both `SENT` with a `local:` provider id. No row for B.
* Inbox shape: keys are `id, class, from, reply_to, headers, subject, body, html, attachments, sent_at`. There is **no `text`**. The subject is "Your Free consultation is booked". The manage link is in both `body` and `html`.
* A true simultaneous race (both browsers on the same next slot, both clicks in one `Promise.all`): one page reached "booked", the other showed "This time was just booked.", and the firm went from 1 to 2 bookings with one per start time. The product holds under real concurrency.
* The manage page reads "Your booking: Thursday 19 November, 09:00 America/Toronto time, with Sample J-37 firm." That matches slotA. A bad token shows "This link is no longer valid. …".

## Builder's decisions
1. **W4b HELD until FO-2 part 3b: accepted.** It is honest, the reason is printed, and the header (`j_37.ts:9-12`) agrees with `runtime-ports.ts` (`arrival: fakeArrival()`). `runMail` and the reminder read the person through `arrival.contactOf`, so after a restart the fake has no booker. Condition: this Approve covers 48b350a4f only. The PR head that opens after 3b, with W4b real, must be reviewed again. For that step: the 1-hour and 24-hour reminders are scheduled only when `at > now` (`service.ts` afterCommit). The first slot is often same-day (here 09:00 today), so W4b needs the clock seam or a slot far enough ahead, or no reminder is ever queued.
2. **Mail needs no swap: accepted, verified.** `runtimeBookingPorts(mail)` takes the app's MailPort over MessagePort. The rows are SENT by the local provider, and `demo-inbox.ts` reads only `msg_outbox` `state=SENT` with a `local:` provider id. W4 reads the real outbox, not fakeMail.
3. **Sample firm, host, hours and type written to the database: accepted.** It is the same as j_9 and labelled Sample (`j_37.ts:14-15, 53-56`). This is set-up, not the step under test, so P-33 does not apply.
4. **No video in this cloud image: accepted, confirmed.** Playwright 1.64.1 wants ffmpeg revision 1013, and `/opt/pw-browsers` has 1011. Even with 1013 linked to 1011, video/ stayed empty. Traces and step shots recorded fine under record.ts. The header matches walk.mjs's `copyOf` pattern (parsed: `j37 4437 --ttl 30`), and the file starts `chromium`, so WALK_BOARD=0. CI's walks.yml picks it up from `j_*.ts`.

## Step-by-step against the brief
| Step | Proves | Fail side |
|---|---|---|
| W1 lists slots | type link present, a time label present | none needed |
| W2 A books | "booked" state on screen | DB values not asserted (m3) |
| W3 B refused, next slots | refusal words, "Next free times", answers kept, exactly 1 booking in DB | yes (the one-booking count). But **sequential, not simultaneous** (m1) |
| W4 confirmation in demo inbox | at least 1 SENT local mail to A | B got none, but checked too early (m4) |
| W4b reminder after restart | HELD | - |
| W5 row 42 first step | the link from A's mail opens a page with Reschedule and Cancel | does not check it is A's booking, no bad-link side (m5) |

## Findings
No Blocker. No Major.

* **Minor m1: W3 is a stale-page conflict, not a race** (`j_37.ts:72-77`). A clicks and waits for "booked", and only then does B click. So the walk proves the availability re-check under the lock, not two writers at once. The brief's words ("on the same slot in a second browser, is refused") are met. Concurrency is proven at service level (`tests/check_fo3_booking.ts:183-185`, 20 parallel), and my browser probe held. Fix: fire both "Book this time" clicks in one `Promise.all`, then assert one booked, one refused, one row. The probe shows this result is deterministic.
* **Minor m2: the inbox's plain text is never read** (`j_37.ts:37, 88`). The API returns `body`, not `text`, so `m.text` is always undefined and W5 finds the link only in `html`. Fix: read `m.body` and type it as `body`.
* **Minor m3: W2 and W3 do not check the stored booking** (`j_37.ts:74, 79`). `status` is selected but never asserted, and A's email and start time are not checked. Fix: assert one SCHEDULED row whose start matches slotA, and whose person or email is A's.
* **Minor m4: W4's fail side can false-pass and W4 does not check what the mail is** (`j_37.ts:89-90`). B is checked right after A's first mail arrives. A wrong mail for B would be queued about 1 s after A's, two pg-boss hops of about 2 s each, so it could still be in flight. Also, `mails.length >= 1` accepts any mail. Fix: also wait for the host's mail (queued after A's) or a fixed few seconds before reading B. Assert the subject "… is booked".
* **Minor m5: W5 says "opens A's booking" but does not check it** (`j_37.ts:100`). Fix: assert the manage text contains slotA's time ("Thursday 19 November, 09:00 …"). A bad-token load showing "This link is no longer valid." would give W5 a fail side.
* **Minor m6: the timing edge on the minimum notice** (`j_37.ts:63, 68`). Both bookers take the first free slot, which is often today. If the walk runs right on the notice cut-off, B's first slot can differ from A's (W3 set-up FAIL) or A's booking can be refused. The chance is small (a window of a few seconds). Fix: pick the first slot on tomorrow or later.
* **Minor m7: the journey's own screenshots fall outside the walk's artifact** (`j_37.ts:28`). It writes to `studio/var/walks/j_37-shots`, which is git-ignored and outside walk.mjs's OUT. walk.mjs collects only `product/screens/*/screenshots`, which is what j_6 uses (`j_6.ts:37`). record.ts's step shots cover the walk, so the evidence still exists.
* **Minor m8: the port** (`j_37.ts:17`). 4437 is in the runtime lane's range (`WAY-OF-WORKING.md:18`), and several runtime checks use it (`check_c75…`, `check_s5…`). The evidence lane has no range. In CI each job runs on its own machine, so there is no clash. On the Mac two copies could collide. For the tech lead.

The test is honest about what it cannot prove. The HELD line, the header and the fail-on-fake note are accurate. Timing: the 3-minute poll (60 × 3 s) is far more than the two 2-second pg-boss hops. The outbox sweep (each minute) backs up a lost dispatch, so a flake from mail timing is unlikely.

## Journey test (reviewer role), FO-3w through J-37
Persona: a prospective client booking a free consultation. A second client is on the same time.
Journeys: main (W1, W2, W4, W5), alternate or error (W3 refused), recovery (B's answers kept, next times offered), the step to row 42 (manage link). Break pass: a simultaneous double click across two browsers held. A bad manage token gave a clear message. Not tested: axe, 400 and 1024 px, keyboard-only, a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder).

| Criterion | Score | Evidence |
|---|---|---|
| task completed | ½ | W1–W5 pass. W4b (part of the row) is HELD |
| next step obvious | 1 | refusal lists 4 next times. Manage shows Reschedule and Cancel (step shots 004, 008) |
| plain words | 1 | "This time was just booked. Please choose another time." |
| feedback and state | 1 | "booked" state, red-edged refusal panel |
| correct data | ½ | one booking per slot (DB). Values right in the probe but not asserted by the test (m3) |
| error recovery | 1 | answers kept after the refusal. Bad link message is clear |
| accessibility and screen sizes | ½ | 1440 px only, no axe in this walk |
| speed | 1 | whole walk about 13 s. Mail within seconds |
| visual quality | 1 | clean public pages in the step shots |
| trust and sources | 1 | firm named, Sample wording labelled, no AI |
| **Total** | **8.5 / 10** | pass (8 or more, no 0) |

What would raise it: m1 and m3 (correct data, proof of the race), then axe plus 1024 and 400 px on W1 and W3.

## Note on where this was written
The skills say to write `product/screens/NN/review.md` and a journey-test file. The calling agent's rules for this check say to edit no repository file and to write only this scratchpad file. I followed the caller, so the journey-test report is the section above.

**Verdict: Approve** (no open Blocker or Major) for 48b350a4f8c0b031b35d5090a04c095fcc7f8159 only. The PR head after FO-2 part 3b, with W4b made real, needs a fresh review.
