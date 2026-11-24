# qa capability R1.104: consultation agreement signed before the first consult (24 Nov)

**Run:** `/qa capability R1.104`, cloud qa copy, Opus 5.5 medium, live AI off, US$0. SigningPort's fake was used; there was no live e-signature and no live mail. Tested on main d0dc92161, after #3184 (FO-3c part 2) merged as f6f2645ea. Isolated copy :4477 only; :4400 not touched. Unconfirmed: no counsel.

**Verdict: Partial, with one item left: QA-772.** All three parts the last read named have now merged: the poller, the agreement on screen, and the gate on the start.

## Evidence
| What | Where | Result |
|---|---|---|
| walks.yml, j_104 | run 45334849542, job 138244712581, on main d0dc92161 | 20 PASS, 0 FAIL, exit 0, with video and traces |
| The same, locally | fresh isolated copy :4477 on d0dc92161 | 20/20 |
| item-proof | none: no PR carries `Completes: R1.104`, and #2922 says it is not the last part | the journey is the pack |
| Fresh Opus reader (read only, P-339) | this session | Works, about 75% confidence; it named the QA-772 case as a note for a ruling |

#3184 changed j_104 by one setup line: the fake clock is set 10 minutes before the meeting, because FO-6's time check wants a request's end at or after its send. No assertion changed, and the hold and the start are still judged by the running app.

## Done when, clause by clause
* **"A booking whose type needs it cannot start until signed."**
  * W2: a booking made on screen gets exactly one CONSULTATION agreement on the running app (the poller), and by-booking says "Agreement not signed yet".
  * W3: the booking's panel says the same.
  * W4: Attended is refused on screen in the panel's own words, which name the agreement, and the booking stays Scheduled. The API refuses both Attended and a valid consult record, and nothing is stored.
  * W9: once the agreement is signed, both are accepted.
  * W4b: a Follow-up booking, whose type does not need an agreement, gets none and starts without signing.
  * **One case is not held: QA-772, below.**
* **"The reminder goes."** W5: nothing goes an hour before the 24-hour mark. At the mark, exactly one reminder goes to the host who signs for the firm and none to the client. On the running copy, the W1 booking's reminder is queued in the app's own job queue (`platform_jobs`).
* **"The signed copy is on the person."**
  * W6: the client signs by the emailed link with consent, then the firm signs. The agreement is sealed and the copy is emailed once.
  * W7: by-person says "Agreement signed" with the copy's sha256. The lead page shows "Agreement signed" and a link that opens the file.
* **Walls (W8).** Another firm gets 404 by person and by id; a person without the list key gets 403; the firm's own read answers 200.
* **Gate A.** The walk ends at W9: Attended is saved and the consult record accepted. That is the first step of R1.42 (staff record the outcome and the note).

## The item left: QA-772 (Gap · Major; a question for the tech lead)
`gate.ts:9-11` does not hold a booking whose type needs an agreement when none could be made: the person has no email, there is no active consultation template, or nobody is licensed to sign. Attended and the consult record are then accepted, and the consultation starts unsigned. The code states this as its design ("there is nothing to sign … settings already warn"), but cites no ruling for it, unlike the hold rules around it. A walk-in with no email is a realistic case, and the cited rule (SOR/2022-128 s. 23, a written agreement before services) points the other way. Unconfirmed: no counsel.

* **If the Lead rules this case out of R1.104,** R1.104 is Works on walks 45334849542 with no new walk.
* **Otherwise, the smallest fix:** `agreementHold` also holds a booking that needs an agreement and has none, with words pointing to FO-5's Signed offline or to adding the email, plus one j_104 step.

I differ from the reader on purpose: it called this a note, but the Done when says "cannot start until signed", and I don't lower that bar without a ruling.

## Bugs
* **Closed:** QA-750 (a consultation started unsigned) and QA-751 (every type got the agreement). See `history/qa-bugs-closed-2026-11-24-r1104.md`.
* **New:** QA-772 (Gap · Major, runtime FO-3c or the Lead).

## Notes (not blocking)
* Axe runs only at 1440 px, on the booking panel. There are no 400 or 1024 px sizes and no axe check on the lead page.
* The type's agreement switch (`requireAgreement` on or off) is not walked.
* The download is fetched with the session's token, as the click handler does; the real click is not walked.
* On the running app the reminder is counted in the job queue, but its start time and recipient are checked only on the stand-in. Both run the same code.

## Questions for the Lead
* **QA-772:** may a consultation start unsigned when no agreement could be made? Recommendation: no. Hold it and offer Signed offline, because the rule says "before services".

## Suggestions
* *Later · Scaffolding:* add 400 and 1024 px axe checks on the booking panel and the lead page to j_104, and walk the type switch.
