# qa 10 (Track B): R1.68 and R1.93 have all parts on main; walks asked; #3533's reviewer minors

**Run:** qa 10, cloud qa lane (Opus 5.5, effort medium), 24 Nov 19:4x to 20:4x UTC (25 Nov ~01:1x to 02:1x IST). Main 46798e2a8 (after #3500) and e0be451c4 (after #3517). Isolated copies only, live AI off, US$0. Follows `2026-11-24-qa10-trackB-prep.md` (#3533, merged 19:42 UTC).

**Verdict:** no row moves yet. R1.68 and R1.93 now have every part merged, and their packs pass twice locally on main. Each waits only on two walks on GitHub's runners and a fresh reader (P-339). Cloud lanes cannot dispatch Actions (P-439), so the Lead is asked on this PR.

## Results
| Row | Main commit | Pack | Result |
|---|---|---|---|
| R1.68 | 46798e2a8 (CS-D5 part 2 #3500 merged) | `j_68` | **15/15, exit 0, twice** |
| R1.93 | e0be451c4 (PF-17 part 4 PR C #3517 merged; PR B #3489 earlier) | `j_93` | **24/24, exit 0, twice** |
| R1.93 | e3cd44b14 (after #3489, before #3517) | `j_93` | 23/24; W4 (Support page) the only FAIL |
| R1.87 | #3491's head 36a32698a | `probe_r187_firm_sees_our_read.ts` with P6 | 8/12. FAILs: P2 (AUD-3b's why, QA-776), P5 AUD-3 part 3, P5 AUD-3b, P6 (the breach-read line, in no PR yet) |
| R1.69 | #3497's head 97c89f463 (its zod fix for `after`) | `j_69` | 21/21, exit 0, twice; #3497 is not merged yet |
| R1.85 | — | — | PF-21d part 1a (#3234) merged. Parts missing: 1b (#3235), part 2 (the erasers), PF-21rs, PF-21c |

## Changes to the packs (the six minors of #3533's reviewer, a fresh Opus subagent)
1. Probe P6 says the breach-read line is in no PR yet (AUD-3 part 1 is merged: the read writes only a platform-trail line).
2. Probe P5 reads every page of the access report (50 lines a page, cursor `next`), so P1's line is never missed past page 1.
3. `j_85`'s part 2 step needs the person's row to stay (a deleted row no longer passes as anonymised).
4. `j_93` W2 counts the Failed jobs cell before reading it, so a page without the cell fails the step instead of timing out the walk.
5. The R1.87 records now describe P6 (this report and its row).
6. `j_85` W5's label says `Erasure.run` is called in this process, so the 07:40 Toronto schedule is not proven there.

`j_86` W10 moved to the R1.87 probe as P6 (the tech lead on #3533, after #3538's question 2). `j_86` itself is qa 9's row (R1.86) and is not changed here.

## Bugs
None new. QA-755 (Minor, nearest R1.93) and QA-776 (Minor, R1.87) stay open. No Major or Critical names R1.68 or R1.93.

## Questions for the Lead
1. `gh workflow run walks.yml --ref main -f journeys="j_68 j_93"`, twice (the run and the independent re-run). Both rows then need only a fresh reader to move to Works.
2. When #3497 merges: `gh workflow run walks.yml --ref main -f journeys="j_69"`, twice.

## Suggestions
* *Needed for the proof · Capability:* the breach-read line (R1.87 P6) needs a part in a lane: today `GET /api/system/register/breaches/:id` writes only `cross_tenant.access` on the platform trail.
