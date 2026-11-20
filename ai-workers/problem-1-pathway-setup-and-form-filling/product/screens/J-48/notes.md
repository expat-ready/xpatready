# J-48: sending, delivery state, bounces and the firm's sender name, joined and walked (R1.48)

Brief: `design/build-lead-c-briefs/J-48.md` on `claude/build-lead-c-647b40`. Test: `prototype/studio/tests/journeys/j_48.ts`. This lane owns R1.48's whole chain (P-719): PF-19b part 3, then this.

## What it proves, in product terms
* A visitor books on the firm's public page; the visitor and the host each get the email, from the firm's name, in the one layout (browser).
* An Owner invites a staff member from the Team screen; the invitation has the same layout (browser).
* Case staff "Send to ..." an adult on a case; the link email goes through the outbox (API).
* An address that hard-bounces is stopped: the next send is refused and the sender reads why (API; the provider's test event for a Sample bounce address).
* Staff read each message's state: the lead page's Messages box shows the booking email as Delivered (browser, axe, 1024 and 1440 px); the staff read gives a case party's Delivered and Bounced.
* The five swaps (DW1-DW5) are each shown real and each fails on its stand-in.

## Results
37/37, exit 0: once on a fresh copy and again on the same kept copy, before and after the review fixes. Reviewer (Opus, high, fresh context): `review.md`, Approve on 0ec7e5dd0, 8.5/10, no Blocker or Major, seven Minors, all fixed in 2eb0b505d.
**QA-601 / DW6 (20 Nov, PR #2521, onto main):** DW6 adds the Failed state: an email the provider keeps refusing (a Sample refused address the local adapter refuses) is tried 5 times and ends Failed "send failed" with one Failed event; NR on an address the provider takes; the lead page shows "Failed" with "The email provider did not take it" (`DW6-lead-messages-failed-1440.png`; its Failed and Sent times are hours after the lead's arrival because DW6 runs the worker on its own fake clock). 41/41, exit 0, `walk.mjs j_48` twice; `check_qa601_provider_failed.ts` 2/2. Reviewer (Opus, fresh context): `review-qa601.md`, Approve on 73ad89aff, 8.5/10, six Minors: m2 fixed (the count's transaction gets the worker's timeout); m5, m6 this paragraph; m1 (a daily-cap hold restarts the try count), m3 (the retry sweep's per-firm share is taken after the first 2000 rows) and m4 (DW6's in-process worker sweeps a kept copy's other QUEUED rows; CI runs a fresh copy) listed on the PR as accepted, for a follow-up.
The earlier "not verified here" walk line is superseded: walks ran here with the system ffmpeg.
Not verified here (before 20 Nov): the recorded walk (`walk.mjs`): this cloud container has no ffmpeg for Playwright's video; CI's `walks` job installs it and runs the journey on the PR.

## Waits on (found while building; the brief names only the first)
1. PF-19b part 3 (this lane's first PR).
2. #2177, PF-19r part 2: the case side's link emails through the outbox (W3, W4).
3. #2196, FO-2 part 3b, the real ArrivalPort: on main a booking's person lives only in the in-memory stand-in, so there is no lead and the lead page cannot show a booking's messages (W5).
The branch is built on those three heads; the PR opens when all three are on main, so its diff is this row only.

## Where the walk departs from the brief (each declared to the reviewer; all accepted as declared except the last, accepted only if the row owner records the waiver: question 4)
* W3 and W4 are walked through the API, not the browser (the case's screen is C6.16's, walked by its own suite).
* DW3's signed notice runs in process with the run's own certificate ("Not verified on the running copy": it fetches Amazon's certificate). The copy's door answers 400 to any notice here, so that line proves nothing about a good signature.
* W2's invitation is a message to a staff member: no staff read or screen lists those, so its state is read from the database.
* The ending: the brief says "the unsubscribe link in W1's email". The visitor's confirmation is sent as TRANSACTIONAL and carries no unsubscribe header; the host's email is SERVICE and carries the one-click headers. The walk ends on the host email's headers.
* No breaker run (P-303: the diff is a test). Of the brief's breaker tries the test covers the forged notice, the notice twice, another firm's bounce and the soft bounce; not covered: a From name with line breaks, and two sends at once past the cap.

## Questions for the tech lead (go on the PR)
1. J-49's brief starts from "the visitor's booking confirmation (SERVICE)", but the code sends it as TRANSACTIONAL (`booking/service.ts` line 601), so it has no unsubscribe link. Which is right? Recommendation: leave the code (a confirmation the person asked for is transactional) and start J-49 from a SERVICE or marketing email. Unconfirmed: no counsel.
2. R1.48 says "each message shows" its state. Messages to staff (invitations, the two-step reset notice, host emails) show on no screen. Recommendation: a small later row, or narrow R1.48's words to messages to clients and leads.
3. The Messages box is on the lead page only; the case page mount is the case side's row (Build Lead C), so a case party's state is read through the API here.
4. BACKLOG names a breaker for this row; this lane's rule gave none for a test-only diff. Recommendation: the row owner records the waiver, or asks for the two uncovered tries as a follow-up.

## Round 2 (diff-only, the last round): Reviewer: Approve b15ecb8b4e27f160d8f2a9a543024c8a05a443a2
All seven fixes real, 37/37 exit 0 twice on the reviewer's own copy. One Minor left open in the test, listed on the PR and not fixed here (two review rounds are the limit; a third is the tech lead's call): on a kept copy, if this run's host email were written but stayed QUEUED, the W1 host line and the ending line could still pass on an earlier run's host email (`j_48.ts` lines 128-131). It cannot happen on a fresh copy, which is how CI runs it. Fix when next touched: require the inbox's newest host email to be this run's outbox row. The reviewer's second Minor was this file's heading above, now reworded.
