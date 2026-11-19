# AUD-1a journey test (reviewer role, 16 Nov 2026), commit 061823ebc

The row has no screen. Its user-visible paths are Demo › Reset demo… (the content publisher) and the audit lines that every write leaves behind. Tested on the isolated copy `rev_aud1a`, port 4608, with headless Playwright Chromium, psql as `xr_app`, and the API.

## Journeys
1. **Main path.** The content publisher (user-A) resets the demo: Demo › Reset demo…, types RESET, confirms.
   * Expected: the result dialog, the demo's lines gone, platform lines kept.
   * Held at 1440 px (888 ms) and 1024 px (846 ms): no sideways scroll, no console errors.
   * Data underneath: the new demo workspace holds only the `reset` line (actor_type FIRM_STAFF), and the 2 platform-audit lines are unchanged.
2. **Alternate.** Reset with a demo line carrying the `sample-firm` id.
   * Held: the line went and the reset reported 2 rows removed.
3. **Error.** Reset with a demo line carrying a non-Sample firm id.
   * Fails closed: nothing removed.
   * But the person sees a bare 500 "Something went wrong on the server" (review m2).
4. **Two people at once.** Two people propose a form role at the same moment (DW4, real route).
   * The later proposal gets a 409 in words.
   * Its `proposed` line stays, and a `withdrawn` line says why.
5. **Error.** A writer passes an unknown actor word (`alice`, `check`, `staff:`).
   * Refused, naming the word; nothing written.
6. **Recovery.** A line left under a deleted workspace (a reset that raced a load).
   * The next reset's sweep removes it.
   * Without the setting, the same delete is refused.
7. **Break-it.** Three probes, all as `xr_app`:
   * UPDATE and TRUNCATE: refused by the grant and the trigger.
   * A delete with the setting on for another workspace's line: refused.
   * Platform-audit lines through the orphan branch: delete the `platform-audit` workspace row, set the setting, then delete its null-firm lines. **This went through** (review M1, Major).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | Journeys 1, 2, 4 and 6 complete |
| next step obvious | 1 | Reset dialog unchanged; the result names the counts |
| plain words | 1 | The trigger's messages are in plain words; the reversing line's words |
| feedback and state | 1 | Result dialog with rows, files and fingerprints |
| correct data | ½ | Journey 7: platform lines can be deleted through the orphan branch |
| error recovery | ½ | Journey 3: a bare 500 with no words (nothing changed) |
| accessibility and sizes | 1 | No UI change; no sideways scroll at 1024 and 1440 px; axe not run |
| speed | 1 | Reset under 0.9 s end to end |
| visual quality | 1 | Unchanged |
| trust and sources | ½ | Departures not recorded in the PR body (review M2) |

**8.5 / 10, no 0: passes the score bar.** The review's verdict is still **Changes needed** because of B1 (Done-when suites red).

Fixes that would raise the low scores, most valuable first:
1. Close the orphan route (M1).
2. Record the departures in the PR body (M2).
3. Give the failed reset a 409 in words (m2).

**Not tested:** a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); the shared demo database's actor words.
