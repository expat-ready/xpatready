# Journey test, reviewer: PF-21d part 2b-1, the front-office eraser (PR #3713, f9faf8699)

**Score: 5/10, fail.** Two criteria are at 0. This is a back-end item: nobody walks it in a browser, and its "user" sees the
request's steps and status written by the daily job. I walked it through the app's own paths (`arrive()`, `Erasure.run`) as xr_app under PF-12's walls,
and through `j_85` on an isolated copy on :4437 (never :4400). Scratch databases only, Sample values, US$0.

## Journeys
* **J1 (main).** Our Platform Owner approves a deletion for a person a firm added by hand; on day 8 the job runs.
  * Expected: the front-office words are cleared, and the request ends HELD naming the activity log.
  * Got: words cleared, `front-office: ERASED — cleared: person 1`, request **COMPLETED**, and the person's name and email still in `audit_event.detail` (lead.created line). **Blocker** (review B1).
* **J2 (alternate).** The person has a do-not-contact entry, a note and bookings.
  * Expected: KEPT, with each class and its count.
  * Got: as expected, HELD (test :127, :177).
* **J3 (recovery).** The same order is run again.
  * Expected: KEPT again or NOTHING, never ERASED.
  * Got: as expected (test :133-139). A *new* request for the same person answers ERASED "cleared: person 1" (review m4).
* **J4 (wrong scope).** The eraser is run under another firm's scope.
  * Got: refused before any write (test :142).
* **J5 (other parties).** A family member, and the same email in another firm.
  * Got: untouched (test :125-126).
* **J6 (across the boundary).** The person is also a case client.
  * Expected: HELD until the case side's eraser exists.
  * Got: **COMPLETED**, with `case_client.display_name` and `contact` kept (review B2; reproduced in the break report, read in code here).
* **J7 (journey pack).** `j_85` W5 "no hold → Completed, name replaced", on :4437: **FAIL**.
  * The owner client is not walled, so `mark_add` refuses (42501).
  * The check also reads `coalesce(given_names, 'gone')`, which is "gone" after a correct erasure (review M1).
* **J8 (empty).** The person record is not in this firm.
  * Got: NOTHING, no change (test :140).

## Data underneath
* After J1:
  * the `fo_person` row stays, with "Erased person <n>" and email, phone, language and zone null;
  * the leads, prospect, call, receipt, bookings and consult record have no words;
  * `audit_event` still holds `givenNames_after` and `email_after`.
* After J2: the note, the suppression and the activity line stay, and are counted.
* Existing suites: `check_pf21d_erasure` 41/41, `check_pf21d_switch` 20/20, `check_fo9b_merge` 88/88.

## Break pass (15 min)
* A merged-away loser keeps its words, labelled LINK (review M3).
* Conflict checks of other subjects list this person, uncounted (m1).
* The 300-character note cut can drop the legal label (m2).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Words are cleared on the mutable tables; the common path ends wrong (J1) |
| Next step obvious | ½ | The HELD step names classes; it gives no step for staff and no date for "not yet erasable" |
| Plain words | ½ | "not_yet_erasable 3" and "do_not_contact 1" in a staff-facing step |
| Feedback and state | 0 | COMPLETED is shown while personal data is kept (J1, J6) |
| Correct data | 0 | Name and email stay in the activity log after COMPLETED |
| Error recovery | 1 | One transaction; a failure rolls back; the retake is idempotent; a wrong firm is refused |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | About 17 statements per order; the whole suite runs in seconds |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | Sample and "Unconfirmed: no counsel" are shown, but also on AUD-5's code floors (m2) |

4 of 8 applicable criteria, scaled to **5/10**. It fails both the 8+ bar and the no-0 rule.

**Fixes that raise it, most valuable first:**
1. Count every audit line that names the person (B1).
2. Answer KEPT for rows handed to unregistered modules (B2).
3. Make j_85 W5 able to pass: use the walled client, and read `family_name` (M1).
4. Use plain words for class names in the step.

Not tested: a real 07:40 runner tick; a real screen reader (no screen); an intended user's walk (D17 and D20 stay with the founder).
