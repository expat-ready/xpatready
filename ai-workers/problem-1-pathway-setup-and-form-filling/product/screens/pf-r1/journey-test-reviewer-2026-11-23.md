# PF-R1 journey test: reviewer, 23 Nov 2026

Commit `d3679946b3a359163e6b942721d8be3174723d32`. API row with no screen, so the journeys are HTTP calls a client screen (PF-R3) will make. They ran on an isolated copy at :4431 (runtime ports, never :4400), signed in with the local stand-in, plus the row's test and a scratch probe through `fakeMetrics`. The app has no metric registered yet, by design: PF-R2fo, PF-R2cm and CS-R1 will register them. So the figures journeys use the test's Sample metrics (leads read under PF-12's walls, Sample invoices).

## Journeys
1. **Owner, main path.** "Show me the firm's numbers." GET `dashboards/owner` answers 200 in 28 ms: 8 widgets, each with its position and `registered:false`. A figure query (test DW1) gives the firm-wide count at scope `all`, with its source words and a drill link. **Held.**
2. **Case Officer, alternate.** "My caseload." GET `dashboards/case-officer` answers 200 with the same layout for every viewer. A query gives own-record figures only (DW1). Sending `scope:"all"` still gives own (DW2; a mutation run proved it). **Held.**
3. **Case Officer, wrong scope.** "Show me the Owner's numbers." A person filter naming the Owner answers 403 OWN_ONLY (DW1). **Held.**
4. **Billing / Finance, money.** "Collected this month." The answer is CAD and USD as two figures at scope `financial` (DW3). A read that gives one total or the same currency twice answers UNAVAILABLE. **Held.**
5. **Case Manager, money (break-it).** "Fees billed." With view.all and no view-financial (the seed's Case Manager), the probe gets the **firm-wide** fee figure at scope `all`. AG-14-35, -36, -37 and §2 l.179 say money needs view-financial. **Failed: Major 1 in review.md.**
6. **Error input.** Over HTTP: an empty list, 31 keys, start after end, 31 February, a non-uuid person, client type "none", an extra key and an array body each answer 400 QUERY_INVALID with `fields`. An unknown key answers 400 UNKNOWN_METRIC; a 20,000-character key is cut to 80 characters; non-English text is echoed back safely. **Held.** Zod's default words still show: "Unrecognized key", "expected object, received array".
7. **Wrong role or no session.** No token answers 401. A caller with no report key answers 403 on both routes (unit test). `rep`, `OWNER` and `..%2Fowner` answer 404. GET and DELETE on `query` answer 404. **Held.**
8. **Cross-firm.** The solo firm's Owner counts only their ~5,000 rows. Firm A's Owner counts only firm A's. With no firm, the count is 0 (DW6). **Held.**
9. **Failure and recovery.** A read that throws, or answers the wrong shape, comes back UNAVAILABLE while the others answer, and its words never leave the server. A read that **never settles holds the whole answer** (probe: still waiting after 3 s). **Partly: Minor 1.**
10. **Across the boundary.** Following the drill link without `agent/prospect:show` gives 403 from PF-4's real guard on the leads list. The Owner gets through, and the link carries the exact filter under the target's own parameter names (DW8). **Held.**

## Data underneath
The door writes nothing (AG-14-1). The catalogue has exactly AG-14 §10's defaults: view.own on all six roles; view.all on Owner, Admin and Case Manager; view-financial on Owner, Admin and Billing / Finance (test (6), checked against the PF-3 migration). Roles are enforced on the server: the scope comes from `caller.keys` only.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1–4 and 10 work. Journey 5 gives a role figures it should not see. |
| Next step obvious | 1 | `registered:false`, the OK / WITHHELD / UNAVAILABLE status, and a drill link on each figure |
| Plain words | ½ | The door's own messages are plain, but Zod's default words show (journey 6) |
| Feedback and state | 1 | Each metric has its own status, and the others still answer when one fails |
| Correct data | ½ | Own, all, firm walls and per-currency figures are right. The money scope is wrong for Case Manager and Case Officer. |
| Error recovery | ½ | The 400s name their fields. A hung read leaves no way to recover (journey 9). |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 10–30 ms over HTTP. DW7 is under 200 ms on about 5,000 rows. |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Each figure carries its `source` words and its drill target. No AI. |

**6 of the 8 criteria that apply = 7.5 / 10. Below the pass mark (8); no criterion is at 0.** Fixes that would raise it, most valuable first:
1. Money only with view-financial, else WITHHELD. This raises task completed and correct data.
2. A cap on each read, answering UNAVAILABLE. This raises error recovery.
3. Plain messages for Zod's default issues. This raises plain words.

Not tested: a real screen reader, any screen, an intended user's unaided walk (D17 and D20 stay with the founder), and figures from real module reads (none registered yet).

## Round 2: commit `67872c4496ae6f68bf97c1c0675b5b32090563c3`
Checked with the row's test (70 passed, twice), the mutation runs and a scratch probe through the fake. I did not repeat the HTTP walk: the routes and controller did not change.

| Journey | Now |
|---|---|
| 5. Case Manager, money | **Held.** WITHHELD without view-financial, and the Case Officer too (DW3 :143, contract). |
| 6. Error input | **Held.** "not a field here: extra", "this has the wrong type" and a plain message for a bad metric key. The client-type message is still Zod's default. |
| 9. Failure and recovery | **Held.** A read stuck for 5 s answers UNAVAILABLE (TIMEOUT) while the others answer (:216). |

| Criterion | R1 | R2 | Evidence |
|---|---|---|---|
| Task completed | ½ | 1 | Every journey holds, and each role gets exactly the figures it should |
| Plain words | ½ | ½ | One Zod default is left (client type), review.md Minor 6 |
| Correct data | ½ | 1 | The money scope follows AG-14-35 to -37. Reads get the viewer's keys. |
| Error recovery | ½ | 1 | Read time limit; the 400s name their fields |
| Other criteria | | | Unchanged: next step 1, feedback 1, speed 1, trust 1; accessibility and visual quality N/A |

**Round 2: 7½ of the 8 criteria that apply = 9.5 / 10, a pass, no criterion at 0.** The one fix that would raise it: give `invalid_value` a plain message.
