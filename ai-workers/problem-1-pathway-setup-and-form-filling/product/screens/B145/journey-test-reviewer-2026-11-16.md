# B145 · C9.5-fix journey test (reviewer, 16 Nov 2026)

Commit `20494ba437d1a5cdcf28d5764048520aa3a055e6` (PR #1989). Isolated copy `rv_c95` on :4466 (fresh, then stopped). Chromium headless, 1440 and 1024 px, keyboard only. Live AI off, US$0. Scope: the conflict recovery the fix touches. The rest of C9.5 was scored on 7 Nov (`journey-test-reviewer-2026-11-07.md`).

## Journeys (case officer, Sample family case on release 1)
1. **Main: recover from a conflict and move.** Open the panel. A newer release is published meanwhile. Press Move: "Nothing was changed … read the list again". Press Read the list again, then Move. Expected: Move names the newest release and the case moves.
2. **Error: the read fails.** In the conflict state, Read the list again gets a server error. Expected: nothing changes and Move stays off.
3. **Keyboard while it reads.** Enter on Read the list again, then Tab during the read. Expected: focus stays in the panel; after the read the next step can be reached.
4. **Not now during a read.** Expected: closes cleanly (code reading only; not walked).
5. **Boundary.** After the move, Prepare application shows "Moved to Release N", takes focus, and Fill makes the copy on the new release.

## What held
* J1, 2/2 runs (34/34 each): conflict, then reread (spinner and `aria-busy`, Move disabled for every 25 ms sample), then "Move this case to Release 9" (the server's newest). Move succeeds: pins 1 → 2, toast "Moved to Release 9 …", focus on "Moved to …".
* J2: two GETs answered 500 (`retry: 1`). Move stays disabled. The body shows "The list could not be worked out". Pins stay at 1.
* J3: Tab during the read went to the next control in the dialog (the "4 items" count), never behind the modal.
* J5: Fill makes its copy on the new release, and the group shrinks (the suite's checks).
* Data: the case's pin revisions were 1 after the conflict and the failed read, and 2 after the move. No other row changed (the suite's SQL checks).
* axe WCAG 2.2 A/AA was clean in every state at both widths, with no sideways scroll. No console or page errors.

## Findings
* **Minor · focus.** During the read, focus is on `<body>`: the busy button becomes `disabled`, `controls.tsx:36`. After the read, Radix puts focus on the dialog container, and one Tab goes to Close, not Move (`release-update.tsx:128`). Main focused the container at once. Fix: focus Move after a successful read.
* **Minor · speed.** The read takes 1.3–3.9 s here because `refetch()` cancels the read the 409 already started. `cancelRefetch: false` would join it. STANDARDS §9 sets no budget for this action.
* **Minor (already on main) · error recovery.** After a failed read there is no retry inside the panel. The only way back is Not now, then open the panel again.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 moved the case, 2/2 runs |
| Next step obvious | 1 | After the read, Move names the newest release; it is off while reading |
| Plain words | 1 | "Nothing was changed", "Read the list again", "Move this case to Release 9" |
| Feedback and state | 1 | Spinner and `aria-busy` on reread; Move off until the new list arrives |
| Correct data | 1 | Pins 1 after the conflict and failed read, 2 after the move; one revision |
| Error recovery | ½ | A failed read keeps Move off (correct), but the panel offers no retry (already on main) |
| Accessibility and screen sizes | ½ | axe clean, 1024 px fine, keyboard complete; focus on `<body>` during the read, then on the dialog |
| Speed | ½ | The read takes 1.3–3.9 s, doubled by the cancelled read |
| Visual quality | 1 | Conflict screenshots at 1440 and 1024 px match the team look |
| Trust and sources | 1 | Every word and label comes from the server; Demo release marked |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that would raise the low criteria, most valuable first: focus Move after the read; join the 409's read (`cancelRefetch: false`); a retry button in the error notice (already on main, not this row's scope).

## Not tested
A real screen reader; Firefox and Safari; an intended user's unaided walk (D17 and D20 stay with the founder); J4 in a browser.
