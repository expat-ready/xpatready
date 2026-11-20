# qa 12 — R1.74 Government deadlines that remind; working days with holidays: Partial on main 12f270bb9, 21 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), asked by the tech lead (Lead 6, series 3, 01:0x IST): "/qa capability R1.74", after CS-DL3 part 1 (#2485) merged. It used isolated copies only, never :4400. Live AI off, US$0.

## Verdict
**Partial. Parts missing:**
1. **PF-18n bound to `CASE_DEADLINE_NOTIFICATIONS`:** the running app reminds nobody (QA-471).
2. **The deadline "Needs you" item** (QA-471).
3. **CS-DL3 part 2:** the Government steps screen and its walk (QA-591, narrowed here).

The fresh Opus reader agrees: Partial, high confidence.

## The runs (main 12f270bb9)
| Run | Where | Result |
|---|---|---|
| Pack: walks.yml `j_74` | GitHub, [run 44802323596](https://github.com/expat-ready/xpatready/actions/runs/44802323596), job 136517649317, artifact 14660098886 | success |
| Independent re-run: walks.yml `j_74` | GitHub, [run 44802327945](https://github.com/expat-ready/xpatready/actions/runs/44802327945), job 136517708523, artifact 14661408720 | success |
| `tests/journeys/j_74.ts`, fresh copy, twice | here (`2026-11-21-r174-qa12/j74_{1,2}.txt`) | 14/14 twice |
| `tests/check_csdl3_milestones.ts` (CS-DL3 part 1), twice | here (`csdl3_{1,2}.txt`) | 43/43 twice |

Both walks were dispatched by the Lead. `j_74.ts` has not changed since 20 Nov (aea1c9082), so these walks re-prove the scope qa scored then. They walk no government step.

## Each Done-when clause
| Clause | On main 12f270bb9 |
|---|---|
| A stage's government deadline worked out and shown | **Met on screen:** `web/src/runtime/stages.tsx:35-37, 75`; J-74 W2. Every route is still Sample (P-412 F13 (b)) |
| A government step's deadline (QA-591; CS-DL1 (1) "a stage's or milestone's deadline") | **By test only.** The API is built by #2485: `case_milestone`, routes, `milestones` on the stages read (`api/src/case-stages.ts:132-138`). There is no screen: `grep milestone web/src` is empty |
| Reminds the case's people before it falls due | **By test only, on fakes.** `api/src/features/case-deadlines.ts:16, 22-24` waits for an optional port that nothing on main binds, logs `case_deadlines_waiting` and returns. J-74 and `check_csdl3` prove reminders with fakeJobs, a FakeClock and fakeNotifications |
| Working days skip weekends and the firm's holidays (a pass and a fail) | **Met for the reminders' count-back:** stages (J-74 DW1, pass and fail; closed days set in Settings) and government steps (CS-DL3 DW1, pass at :99-102, fail at :106-108). The government date itself never moves (AG-7-94); the row's wording is still QA-592 |

**Gate A by screens: not met.**
* J-74 ends at the reopen (W4); it does not go on to the next capability's first step, and it walks no government step.
* The reminders clause is shown only on fakes.

## Findings
* **QA-591, narrowed:** the API half is built (#2485). Still open:
  * the screen and the walk (CS-DL3 part 2);
  * a real reminder (QA-471).
* **QA-471:** unchanged.
* **QA-592:** unchanged.
* No new rows.

## Not tested
* Coverage (c8).
* 200% zoom.
* The shared demo (:4400): this cloud copy has none.

## Questions for the tech lead
1. **Which part of R1.74 comes next?** R1.74 needs all three before Works.
   * CS-DL3 part 2: the screen, and J-74 walking a government step to the next capability's first step.
   * PF-18n binding the port.
   * The deadline Needs you item.

   Is a row shaped for PF-18n's binding and for Needs you?
2. **Please read and label this records PR.**
