# Journey test, reviewer: PF-21d part 2b-2, the insert-only exception (head 70c939fc1)

**Score: 8/10, pass (no criterion at 0).**
* This is a back-end item: nobody walks it in a browser. Its "user" is our Platform Owner, who reads the request's steps
  and status as the daily job writes them.
* I walked it through the job's own path (`Erasure.run`, as xr_app under PF-12's walls), in the check's scratch database,
  and probed the database underneath.
* The isolated copy for `j_85` was refused: `isolated.sh` reported 4 copies already running (cap 4), and I stopped none.
* Never :4400. Sample values only. US$0.

## Journeys
* **J1 (main).** Our Platform Owner approves a deletion for a person who has:
  * a note;
  * a lead with attribution words;
  * a record merged into them (the merge row holds both snapshots);
  * a sent message with an event.

  On the day, the job runs. **Held.**
  * Expected: the note reads "Erased.", the attribution words are null, both snapshots are `{"erased": true}`, the event
    detail is null, and the merged-away record is anonymised.
  * Expected: the request ends HELD, naming "message addresses (whom each was sent to) 1".
  * Got: all of the above (test :278-288). The step lists "notes 1, lead attribution 1, merge records 1, message events 1".
* **J2 (wrong role / forged).** As xr_app in the person's firm, with no claim, a random request id, a wrong time or
  another person's claim. **Held for the note.**
  * Every attempt to blank the note is refused, and so is a delete (test :260-271).
  * The other three tables have no such test (review M2).
* **J3 (other firm).** Firm B's session with A's valid claim: nothing changes (test :272-273). Probe: the definer gives
  false for another firm's session or for no firm.
* **J4 (precision).** A claim 1 ms or 1 µs off gives false. The same instant written +05:30 gives true (probe).
* **J5 (other parties).** A family member's note in the same firm keeps its words (test :289).
* **J6 (recovery).** Rollback, then the migration again: the definer goes and comes back, and the rows are insert-only
  again (test :291-295). The catalog is identical to the database before the migration.
* **J7 (across the boundary).** The person's erased merge, then Undo: refused in code (merge/service.ts:288). It was not
  walked (review m1).
* **J8 (neighbours).** Other users of the same trigger functions: their template versions, consent wordings and consent
  withdrawals. Expected: still refused with the same words. **Did not hold** (review M1).
  * They are still refused, but with `42703 record "new" has no field "detail"`.
  * `check_pf19a_messages_schema` goes from 94/94 to 91/94.

## Data underneath
* J1:
  * exactly the named columns changed (each exception lists every other column; checked against `information_schema`);
  * `plat_data_request_event` holds the front office's KEPT step;
  * the family member, the other firm and the other person are untouched.
* With no claim:
  * UPDATE, DELETE and TRUNCATE on fo_note, fo_lead_attribution, fo_stage_move, fo_dup_merge and msg_event refuse with
    the same SQLSTATE and words as before the migration;
  * FO-9b's merge branch is unchanged, and `check_fo9b_merge` is 88/88.

## Break pass (15 min)
* A flat `IF` in `msg_write_once` breaks the error contract on three msg_* tables (**Major**, M1).
* A mutation run drops the claim check from the msg_event and attribution branches, and the merged-into chain from the
  definer. The check still reads 43/43 (**Major**, M2).
* Erasing X blanks the other party's `survivor_before` on an undone merge (Minor, m7).
* A firm session cannot read the request id or claim (system-only register definers). Raw SQL as xr_app could clear
  `app.firm_id`, as for all of PF-12; that power can already run a real erasure.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: all four insert-only tables cleared through the job |
| Next step obvious | ½ | The HELD step names what was kept, but gives staff no next step for the message addresses |
| Plain words | 1 | "message addresses (whom each was sent to) 1"; "notes 1, lead attribution 1 …" |
| Feedback and state | ½ | HELD, never a false COMPLETED; but three msg_* tables now answer with a wrong-column error (M1) |
| Correct data | 1 | Exactly the named columns; no other person, family member or firm touched (J1, J3, J5) |
| Error recovery | 1 | One transaction; a refused write rolls back the order; rollback and re-apply are clean (J6) |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | One definer call per affected row; the check runs in seconds |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | Message addresses labelled Sample with no ruling under P-819 (m4) |

6.5 of 8 applicable criteria, scaled to **8/10**. It passes the 8+ bar with no 0.

**Fixes that raise it, most valuable first:**
1. Nest the msg_event branch (M1).
2. Ask the Lead about the message-address class, or keep it "not yet erasable" (m4).
3. Name a next step for staff in the HELD note.

Not tested: `j_85` on an isolated copy (cap reached); a real 07:40 tick; a real screen reader (no screen); an intended
user's walk (D17 and D20 stay with the founder).
