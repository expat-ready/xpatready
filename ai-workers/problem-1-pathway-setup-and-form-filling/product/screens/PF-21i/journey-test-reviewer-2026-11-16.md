# PF-21i journey test (reviewer role), 16 Nov

This tests head **44f28ba6fd25b73de3f9c59e0dd1847d06d8d350** of PR #2012. That is 010579b6b plus three lines in the migration that hand the trigger function to `xr_wall_reader`.

**There is no screen yet** (PF-21s builds Record), so these are API journeys over HTTP:
* They are taken by the screen's future users, through PF-4's real guard, on a Nest app built from the feature's own classes.
* The harness is a scratch copy of `tests/check_pf21i_idempotent.ts` with my probes added, at `/tmp/claude-0/…/scratchpad/probe/base.mts`.
* It used its own database `xr_review_probe_<pid>` on :54329, which was dropped at the end, and a random port. :4400 was never touched. US$0.

## Journeys (persona · goal · result)
1. **Main path.** A Case Manager records a phone complaint. The connection drops, and the client sends it again with the same key and body.
   * Result: 201, then 200 with the same id. One row, one RECEIVED event, one audit line, one outbox row and one job (suite DW1). **Held.**
2. **Double click.** The owner presses Record five times at once.
   * Result: `200,200,200,200,201`, one id, and every count +1. Five rounds out of five. **Held.**
3. **Alternate.** The owner fixes the summary and resends with the old key.
   * Result: 422 "This request key was already used for a different complaint."
   * The same thing sent in parallel: one 201 and one 422, five rounds out of five.
   * A fresh key records the complaint. **Held.**
4. **Error: an old client sends no key.**
   * Result: 400 "Send an Idempotency-Key header with each new complaint." Nothing is written. **Held.**
5. **Error: odd keys.**
   * 256 characters → 400. A quoted key containing a space → 400.
   * The header sent twice on a raw socket, with different or identical values → 400 `IDEMPOTENCY_KEY_INVALID`.
   * A trailing space is trimmed by HTTP, and the key works. **Held.**
6. **Wrong role.** A Case Officer posts with a key.
   * Result: 403 before anything else (suite DW4). **Held.**
7. **Another person, same firm, same key and body.**
   * Result: 422 that never names the first complaint. **Held**, but the wording is not true for this case (review m3).
8. **Another firm, same key.**
   * Result: each firm gets its own complaint, and firm B never sees firm A's id (suite DW5). **Held.**
9. **Recorder without the read key comes back later.**
   * A Case Manager records a complaint handled by the Case Officer, who then acknowledges it.
   * Result: the Case Manager's `GET /:id` answers **404**. The same POST again answers **200, with `acknowledgedAt` (the officer's acknowledgement) and `status`**.
   * **Failed:** see review M1.
10. **Across the screen boundary (PF-21s Record).**
    * A retry's 200 answer has no `reminderScheduled`. A screen that shows "reminder not set" when it is `false` cannot tell this case from "set". This is review m1.

## Data underneath
I counted `plat_complaint`, `plat_complaint_event` (RECEIVED), `audit_event` (`complaint.record`), `module_event` (`complaint.received`) and the recorder's scheduled jobs before and after each journey. The counts were exact in every race. The stored key and hash match the request (suite DW1). Firm walls: see the review.

## Break it
| Probe | Result |
|---|---|
| NFC then NFD summary | 201, then 422 (the stored text would differ: correct) |
| Pretty-printed body against compact | 200 |
| Extra field `x: 1` against `x: 1.0` | Both 422 `COMPLAINT_FIELDS` (`.strict()`), so the number form cannot matter |
| Timing | First create 123 ms (cold), repeat 19 ms |

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–3: one complaint per key, every time |
| Next step obvious | 1 | 400 and 422 say what to send; a fresh key always records |
| Plain words | ½ | Journey 7: "already used for a different complaint" is said when the complaint is the same and only the person differs |
| Feedback and state | ½ | Journey 10: the repeat drops `reminderScheduled` |
| Correct data | ½ | Exact counts under every race, but journey 9 answers the complaint's current state to a person the read rule refuses |
| Error recovery | 1 | A retry gets the first id; a failed first post leaves the key free (breaker) |
| Accessibility and screen sizes | ½ | N/A, no screen (PF-21s) |
| Speed | 1 | Repeat 19 ms, create 123 ms cold |
| Visual quality | ½ | N/A, no screen |
| Trust and sources | ½ | The IETF draft is not quoted (P-170); the PR says so openly and asks the tech lead |

**7/10: below the pass mark of 8.** No criterion is at 0. The two N/A halves are mine, since there is no screen.

Fixes that would raise the score, most valuable first:
1. **M1:** a repeat answers the complaint as it was recorded, not as it is now (correct data → 1).
2. **m1:** a repeat carries `reminderScheduled` (feedback → 1).
3. **m3:** separate wording, or one neutral sentence, for another person's key (plain words → 1).
4. The draft quotes added by a session that can reach datatracker (trust → 1).

**Not tested:**
* A real screen, a screen reader, axe, and the 400/1024/1440 px widths: there is no screen.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* A mutation run of the lock and the index (reasoned only; see the review).
