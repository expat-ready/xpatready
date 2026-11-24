# qa capability R1.93: our team's console, health per firm, support button (24 Nov)

**Run:** `/qa capability R1.93`, qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. Live AI off, US$0. Tested on main a75254842, after #3431 (failed jobs per firm on our firms list) merged. Isolated copies only, started from j_93's header line (`PLATFORM_SYSTEM_IDENTITY=local`); :4400 not touched.

**Verdict: Partial. Parts are missing, so there is no verdict (P-606).** The one part missing is **PF-17 part 4**, our console's screens.

## Evidence
| What | Where | Result |
|---|---|---|
| j_93 on main, unaligned | isolated copies, twice | 21 PASS, 3 FAIL, the same steps |
| j_93 with W3 aligned (this PR) | isolated copies, twice | **22 PASS, 2 FAIL, the same steps** |
| GitHub walk | walks.yml runs j_93 on this PR, because the PR changes the file | see the PR's checks |

## What moved
* **Newly passing (#3431):** "each firm's failed jobs are its own dead letters". Firm A counts this run's failed job and firm B shows 0; the database and the API agree (`[1,0]`).
* **W3 aligned to #3209.** Our Platform Owner opening firm A now writes **two** lines on firm A's trail under one correlation id: PF-12's `platform.bypass` and AUD-3's `platform.system.firm_read`. Firm A's Owner sees both as ExpatReady staff access, and firm B sees none. This is by design, the same as R1.87's probe (#3447). The journey asked for exactly one more line, so it read 0 → 2 and failed. It now asks for those two actions.

## Still failing (2), both PF-17 part 4
* W2: our console's Firms page, listing firm A and firm B, with firm A's failed jobs and plan state. There is no page.
* W4: our console's support page, showing the ticket with firm A's name. There is no page.

## Questions for the Lead
1. Is PF-17 part 4 (the console screens) on a lane? It is the last part of R1.93. It also gives PF-21rs (R1.86) its home.

## Suggestions
* *Needed for the proof, Capability:* PF-17 part 4. Then R1.93 can go to gate A by screens, from our sign-in to the support page.
