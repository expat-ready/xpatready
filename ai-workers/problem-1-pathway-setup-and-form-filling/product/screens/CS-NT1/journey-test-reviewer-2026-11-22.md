# Journey test (reviewer, diff-only re-review): CS-NT1 part 1 after the merge of main, API level

Commit `7b53833466cad3536c90975ad55b70114630d49a` on `claude/runtime-csnt1-notes` (PR #2999). Walked on the real server, an isolated copy `rv_csnt1` on :4438 (runtime ports, never :4400; `PLATFORM_IDENTITY=local`, Sample seed). The copy connects as PF-12's `xr_app`, and CS-W3's door (`features/case-firm-door.ts`) is in the app. Each journey ran twice: first with main's walls as they are, then with the CS-W3 walls fixture applied (`tests/fixtures/csw3/csw3-spike-walls.sql`: seven case tables forced). The copy was stopped afterwards. Script: scratchpad `walk.mjs`, 38/38 OK. Part 1 has no screen (the panel is part 4), so there was no browser. Live AI off, US$0.

## Journeys (both rounds)
1. **Case officer, main path:** firm A's officer (signed in, Bearer) adds an internal note and a client-visible note (201, 201), lists them (200) and pins one (200). **Held.**
2. **Client:** user-P `GET /api/runtime/cases/:id` goes through the door, which tags the request with the case's firm. 200; `notes` holds only the CLIENT_VISIBLE note, with no internal text and no staff ids. **Held**, walls off and on (19-21 ms).
3. **Officer's own case read:** has no `notes` key (staff use the notes routes). **Held.**
4. **Wrong firm, staff:** firm B's representative on firm A's case or note: list, add, history, text edit, and pin through firm B's own case. **404 on all five**, and still 404 with `x-actor: user-O` added. The door leaves these routes to PF-4's guard (they declare keys), so a typed x-actor never picks a firm. **Held.**
5. **Stray header, right firm:** firm A's signed-in officer sends `x-actor: user-S` (firm B). The add gives 201, with no 403 or 404: the firm comes from the session. **Held.**
6. **No session:** x-actor alone on the notes list gives 401. **Held.**
7. **Wrong firm, client:** user-Q (firm B's client) on firm A's case gives 404. **Held.**
8. **Across the boundary, demo reset:** not walked by hand this round. Instead, `check_csw1_firm_id` DW5 ran on an isolated copy and passed 47/47: its reset deletes cases of both firms, and the `case_note_follow_case` trigger is installed.

## Data underneath
* `case_note` rows carry firm A's firm id. The api.log has no note text (0 matches).
* **As `xr_app` with no firm set, all 4 `case_note` rows of the run are readable**, even with the walls on, because the table has no forced policy. The app's own firm checks hold (journeys 4 and 7). But PF-12b part 5's guard requires every firm_id table to be walled or named on purpose, and `check_pf12_walls` fails on this (review B1).

## Break pass (this diff)
The merge resolution, the re-stamp order and a migration apply on an empty database (`check_pf12_walls` applies all 145 migrations; DW7 passes). Cross-firm routes with a forged x-actor in both directions (above). Two neighbour suites are red on this head: `check_pf12_walls` and `check_csw3_firm_scope`'s census. Details in `review.md`.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-3 complete through the product's own routes, walls off and on |
| Next step obvious | ½ | No screen (part 4); responses carry `version`, `canEditText` |
| Plain words | 1 | Unchanged since 19 Nov (same code) |
| Feedback and state | 1 | 201/200 with the note; 404 for another firm, never 403 |
| Correct data | 1 | Client sees only CLIENT_VISIBLE; firm id is the case's; no text in the log |
| Error recovery | 1 | Unchanged since 19 Nov (409 with the current note, idempotent add; suite 56/56) |
| Accessibility and screen sizes | ½ | No screen to test (part 4) |
| Speed | 1 | Client read 19-21 ms, list 13-17 ms |
| Visual quality | ½ | No screen to test (part 4) |
| Trust and sources | 1 | Author and last changed by; every version kept; client sees no staff ids |

**Total 8.5 / 10, pass (8 or more, no 0).** The journeys hold. The block in `review.md` comes from two red guard suites, not from a failed journey.

## Could not test
A browser, keyboard, axe and screen widths (no screen). A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). The full `ci` set (a migration makes CI run every suite). I ran only the neighbours named in `review.md`.
