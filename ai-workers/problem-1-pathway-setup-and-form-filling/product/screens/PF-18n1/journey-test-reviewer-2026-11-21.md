# PF-18n part 1: journey test, reviewer (21 Nov, about 02:15 IST)

**Head:** `ea830d41d`, checked out in a clean scratch worktree. **Copy:** isolated `rvpf18n` on :4425 (`AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), started and stopped by me. Never :4400. US$0.
**Scope:** this part has **no screen**. The bell and list are PF-18ns. So the journeys are walked through the person's own API, the way the PF-18ns screen will call it, with the data checked underneath. There is no browser pass of this part's own pages, because there are none. The J-74 browser walk covers the case page this part feeds.

## Journeys
1. **Main.** Case officer and lead representative. "A cited deadline's 7-day point tells me."
   * Steps: the sweep arms the reminders → the 7-day job runs → I list my notifications → open the case link → mark it read.
   * Expected: one row each, a link to `/cases/<id>`, and the count going to 0.
2. **Alternate.** The 2-day reminder for the same deadline. Expected: the same row, unread again, with a newer time.
3. **Empty.** A freshly seeded person. Expected: an empty list and a count of 0.
4. **Error: In-app off for My deadlines.** Expected: no row; the email switch does not matter.
5. **Wrong person and wrong firm.** The representative marks the officer's row read; firm B's person reads firm A's row. Expected: 404, and firm B's list empty.
6. **No session, and a malformed id.** Expected: 401 and 404.
7. **Recovery: double click and read-all twice.** Expected: the first `readAt` is kept, and the second read-all marks 0.
8. **Across the boundary:** from the job runner (CS-DL1/CS-DL3) into this store, then on to the case page via the link.

## Walked
* **J1 and J8:**
  * DW6 runs the real feature providers on the real `PlatformJobs` and pg-boss TestClock: the sweep arms 7/2/0, and the 7-day point writes one row for the officer and one for the representative. The list returns `link: /cases/<case id>`.
  * The isolated copy boots with the binding, and its log has **no** `case_deadlines_waiting` line.
  * J-74, the case-side journey, is **14/14** on the copy. Its reminders are on the fakes, as the brief says.
* **J2:** DW1 passes. The SQL probe as `xr_app` re-marks the same row unread with the new time, in one row.
* **J3:**
  * `GET …/items` answers `200 {"items":[],"page":1,"size":20,"nextPage":null}`.
  * `unread-count` answers `{"unread":0}`.
* **J4:** DW2 passes. Removing the preference check turns it red (mutation).
* **J5:** `POST /<officer's id>/read` as the representative gives 404, and so does `POST /<A's id>/read` as firm B. Firm B's list is `[]`.
* **J6:** No token gives 401, with "Sign in first: this needs a staff member's session (a bearer token)." The path `/zzz/read` gives 404.
* **J7:**
  * Reading the same row twice returns the same `readAt` both times.
  * read-all answers `{"marked":1}`, then `{"marked":0}`; the count is 0 and `?unread=1` is empty.
  * Underneath:
    * the representative's two rows have `read_at ≥ created_at`;
    * the officer's row is untouched (unread);
    * the database holds one row per item and kind.

## Break pass (about 15 min)
* **Two notifies at once on one key:** one row, no error. But `created_at` went from 14:00 back to 13:59 (review m1).
* **Read racing a re-notify:** the reminder that surfaced again is marked read by a click made before it arrived (review m2).
* **12 notifies at once:** all 12 fail with P2028 after 5 s and write no row. 6 at once all succeed (review M1).
* **Paging junk:** `page=9999999` answers page 1; `size=0`, `page=-1` and `abc` answer 200 with page 1 (review m5).
* **Wrong role by URL:** covered in J5 and J6. Every query names the session's firm and person.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: DW6 row → list → read; J-74 14/14 |
| Next step obvious | ½ | the case link is given; an unknown milestone gives `link: null`; no screen to judge |
| Plain words | 1 | the 404 and 401 texts are plain ("No such notification.", "Sign in first…") |
| Feedback and state | 1 | `readAt` returned, `marked: n`, the unread count |
| Correct data | 1 | one row per person, item and kind; own rows only; checked in the database |
| Error recovery | ½ | the double click is safe; but the M1 starvation rolls back callers, and the m2 race |
| Accessibility and screen sizes | ½ | N/A in this part (no screen); J-74's axe pass covers the case page only |
| Speed | 1 | 7-25 ms per call; two link queries per page, never one per row |
| Visual quality | ½ | N/A (no screen) |
| Trust and sources | 1 | ids only; the link is built on read; only CITED routes remind; Sample labels kept |

**Total 8/10. Pass** (8 or more, no criterion at 0). The two "N/A" halves are a limit of this part, not a fault.
**What would raise it:**
1. Fix M1 (prefs read through `tx`) and m2 (read only what was seen).
2. The screen criteria get scored on PF-18ns.

**Could not test:** a real screen reader, or an intended user's unaided walk (D17 and D20 stay with the founder); CI; the commits after `ea830d41d`.
