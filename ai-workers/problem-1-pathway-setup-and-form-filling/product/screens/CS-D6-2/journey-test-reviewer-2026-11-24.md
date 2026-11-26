# Journey test (reviewer): CS-D6 part 2, closed files past their keep period and the weekly reminder (24 Nov)

PR #3497, head `8d1b712a5225f5ab2493c52cc3730e9be5699e86`. Isolated copy :4494 (`xr_studio_runtime_csd6k`, PLATFORM_IDENTITY=local); :4400 not touched. US$0, live AI off.

This part ships no screen (API and job only), so I walked the journeys on the routes, the database and the job, as the person's tools would reach them: a staff session (bearer), the firm's own data, and FakeClock or the real notification adapter. There was no visible-browser walk. j_69 W7 covers the adjacent Documents panel (axe, 400/1024/1440 px).

## Journeys (persona · goal · result)
1. **Owner (main path):** "Which closed client files are past our keep period?" `GET /api/runtime/documents/past-keep-period` with the Owner's session gives 200 in 15 ms.
   * The answer carries years 6, source "firm setting", the words "Your firm keeps closed client files for 6 years after closing. This is a reminder, not a lock: nothing is deleted automatically.", the zone America/Toronto and today 2026-11-24.
   * It lists 7 cases, oldest close first, each with its case number, client, `closed_on`, `passed_on`, `documents_held` and document ids.
   * No file name appears. **Held.**
2. **Owner of a firm with no number (empty):** gets an empty list and "Your firm has not set a keep period for closed client files." (DW4). **Held.**
3. **Boundary dates:**
   * A case closed 6 years ago today (firm date) is listed, with "passed today".
   * One closed a day later is not listed. An open case and a reopened case are never listed.
   * By SQL probe, a close on 29 February passes on 28 February, and a close at 04:30Z counts on the Toronto date.
   * **Held.** It is not proven by a failing test for the zone (review m1).
4. **Wrong role:**
   * The Case officer (no `agent/document:dispose`) gets 403.
   * No session gets 401, and so does the Owner's `x-actor` alone.
   * A key holder limited to own cases does not see a case they are not on.
   * **Held.**
5. **Another firm:**
   * The solo firm's Owner, with 1 year set, never sees the Sample firm's cases.
   * This firm's case id used as their cursor gets 400 with the same words as an unknown id.
   * **Held.**
6. **The reminder (on the fake clock):** over 14 days the Owner is told twice (once a week) about the past case, as `keep-period-passed` on the case. Nobody is told about the open or reopened case, and the case a day short is not told before its day (DW6). **Held.**
7. **The reminder (on the real adapter):** `remind` inside `withFirm` writes 7 `msg_notification` rows, and a second run still leaves 7 (upsert). With no firm scope it refuses. I deleted the rows afterwards. **Held.**
8. **Recovery:**
   * A second weekly run in the same week queues 0.
   * A redelivered firm job adds no notification.
   * No file and no row is removed (counts 19/25 before and after).
   * **Held.**
9. **Across the boundary:**
   * The notification points at the case, so the bell links to it. The bell's words are the generic "Something needs you" (no `keep-period-passed` line in the web contract), and Home's "Needs you" does not show this kind.
   * Dispose (part 3) is not built yet.
   * **Partly.**

## Break pass
* Cursors of `' or 1=1--`, 5000 characters, or a doubled `after` → 400 with field words. An upper-case uuid is accepted. POST → 404.
* Mutation by reading: replacing `keep-period.ts:155` with `seen = cases` would tell every holder about every case, and no test fails (review M1).

## Replayed checks
* `check_csd6_reads_keep.ts`: 42/42.
* `j_69.ts`: 21/21. That includes W7: axe clean, with no sideways scroll at 400, 1024 and 1440 px, and no page error.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Both missing parts work; j_69 21/21; journeys 1-8 |
| Next step obvious | ½ | No screen yet; the bell reads "Something needs you"; Dispose is not built (part 3) |
| Plain words | ½ | The API words are plain and avoid "legal obligation"; the bell's words are generic |
| Feedback and state | 1 | The not-set words; a 400 with field words; `next` for paging |
| Correct data | 1 | Dates, leap day, zone date, ISO weeks and counts verified; no file name |
| Error recovery | 1 | Idempotent weekly run, redelivery, stale week, bad cursor |
| Accessibility and screen sizes | ½ | Not applicable: no screen. The adjacent panel is axe clean at three widths (j_69 W7) |
| Speed | 1 | 14-17 ms per list; no query per row |
| Visual quality | ½ | No screen to judge |
| Trust and sources | 1 | The firm's number with its source ("firm setting"); "a reminder, not a lock"; no AI |

**Score 8/10. Pass (8 or more, no 0).** To raise it, most valuable first:
1. The keep-period screen, with the bell's `keep-period-passed` words (next step, words, visual quality).
2. The M1 test.
3. The m1 zone test.

**Not tested:**
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* A real pg-boss Monday fire.
* RLS on the app's own database role.
