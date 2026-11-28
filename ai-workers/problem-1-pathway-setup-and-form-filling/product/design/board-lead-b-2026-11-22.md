# Track B board: 12 capabilities, one lane per open part (founder A286, 22 Nov 14:2x-14:4x IST)

Kept by the Lead (Lead 4 from 14:19 IST) with Lead B (Track B); updated at every check that changes it, like `board-lead-a-2026-11-22.md`. "Proven" = qa's journey exits 0 on main's head and the row is Works on the qa board. Plan page: https://claude.ai/artifact/2aNo4YH89N7CcJG7Jnx2Dn (source `reports/two-track-plan-2026-11-22.html`).

**Founder's bar (14:4x):** steps 1-4 (build, review, queue, journey written) go green as fast as possible, with no dependency between them; only step 5 (qa proof) waits on merges and labels. Every capability below has a lane.

Steps: B build · R review · Q queue · J journey written · P qa proof. ✔ done, ▶ now, · to do.

| # | Capability | Open parts → lane (started 14:4x unless named) | B | R | Q | J | P | Waits on | Proven by (Lead estimate) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | R1.56 client invoices, provincial tax | FO-7b 1b #2953 (queued); FO-7g 1w (LX945); FO-7s1 screens (new lane) | ▶ | ▶ | ▶ | ▶ qa-B | · | #2952 on main; FO-7g part 3 (client province, a migration) and a "from retainer" part, both needed by its journey (qa, 15:0x) | 24 Nov (was 23 Nov 09:00) |
| 2 | R1.29 duplicate warning, safe merge | FO-9b part 1 (lane, brief FO-9b-1, migration slot 3); FO-9s part 2 (lane, brief FO-9s-2; part 1 #2900 merged) | ▶ | · | · | ▶ qa-B | · | concept approval (Lead) | 23 Nov 18:00 |
| 3 | R1.55 withdraw, re-issue, decline | FO-5d decline and withdraw (lane, brief FO-5d, migration slot 5, after FO-6 part 3) | ▶ | · | · | ▶ qa-B | · | FO-6 lane | 24 Nov |
| 4 | R1.105 keep periods, leaving firm | PF-5 part 4 hold clock and notices 0/16/46/83 (P-799; lane, brief PF-5-4); AUD-5 p2 merged #2197; AUD-2 and PF-11c blocked (PF-11c lane stopped) | ▶ | · | · | ▶ qa-B | · | none | 24 Nov |
| 5 | R1.85 data requests, legal hold | PF-21b part 2 (lane, brief PF-21b-2, after #2927, migration slot 4) | ▶ | · | · | ▶ qa-B | · | none | 24 Nov |
| 6 | R1.106 assessment AS-1 | qa re-walk on today's main first (qa-B) | ✔ | ✔ | ✔ | ▶ qa-B | · | re-walk result | 23 Nov |
| 7 | R1.93 our team's console | PF-17 part 1 (lane, brief PF-17-1, PR after #2927) | ▶ | · | · | · | · | #2927 PF-4s on main | 25 Nov |
| 8 | R1.58 trust or operating, ledger | #2368 FO-7ts p3 (new owner lane); FO-7t 1-3 next | ▶ | · | · | · | · | #2368, then FO-7t | 25 Nov |
| 9 | R1.65 private storage in Canada | PF-F1 #2955 (queued); PF-F1b (LX943); PF-F1c on AWS | ✔ | ✔ | ▶ | · | · | AWS session | 25 Nov |
| 10 | R1.61 sign and pay by one link | FO-6 part 3 (lane, brief FO-6-3, after #2933 and #2919); FO-7c p1 #2938 (queued); FO-7c p2 | ▶ | · | ▶ | · | · | FO-6, FO-7c p2 | 26 Nov |
| 11 | R1.76 notes, one timeline | #2320 CS-NT1 p1 (card task_4ba789ec, app cap); p2, p3, CS-NT1t | · | · | · | · | · | founder starts the card | 26 Nov |
| 12 | R1.54 e-signature with evidence | FO-6 routes (shared with #10); FO-6d | ▶ | · | · | · | · | FO-6 | 26 Nov |

**qa lanes:** qa-B ("qa Track B · journeys ahead + R1.56 walk", started 14:3x) writes j_56, j_29, j_55, j_85, j_105, re-walks R1.106, walks R1.56 when its parts merge.
**After these 12:** R1.3 walls (10 database parts), R1.98 corporate and LMIA, R1.96, R1.111, R1.75, R1.64, R1.66, R1.68-70, R1.57.
**Why Track B was behind (14:2x):** it was planned on 15 deep rows (3-10 parts each) with 4 builders; seven partly built rows had no track; qa worked Track A only. Fixed 14:3x-14:4x: re-pointed at the nearest rows, one lane per part, its own qa lane.

**14:4x corrections (Lead B's duplicate check against main 68f74620b):** lanes redirected to Lead B's briefs on `lead-b/2026-11-22-track-b` @ fbe24aa20. Migration slot order: #2968 → #2368 → FO-9b p1 → PF-21b p2 → FO-5d. Effort high allowed for FO-9b-1, FO-5d, PF-17-1, FO-7ts-3 (schema, money, cross-firm reads; named to the founder, P-788).
