# Release 1 forecast, analyst report (read-only Opus analyst for Lead 69, 16 Nov 2026, ~20:5x IST; word for word)

Lead 69 correction: the analyst listed "the AWS account is not opened" and "the BoldSign sandbox is held"; `design/outside-dependencies.md` shows the AWS account done (domain purchase blocked) and the BoldSign sandbox done. The analyst wrote "Measured 16 Nov ~21:30 IST"; the clock read 20:53 IST when the report came back.

# Release 1 forecast (101 R1 rows), measured 16 Nov 2026 ~21:30 IST

Sources: origin/main d66bcfd2d (qa/CAPABILITIES.md, BACKLOG.md, design/merge-queue-failures-2026-11-16.md); MVP-CHECKLIST.md on origin/lead/2026-11-07-lead31 (newer than main's: 5 extra parts, e.g. FO-4sf, PF-5t); GitHub API, 294 PRs merged to main 9-16 Nov. "App-code PR" = title starts screens:/runtime:/forms:/evidence:/migration (records:/lead: excluded, P-500).

## 1. Proven (Works) over time. Sample: R1 rows on main's first-parent commits
- 14 Nov: 0 on main (R1.2 Works on a branch 15:27, landed 15 Nov 08:57). 15 Nov: 1 -> 2 (R1.9, 18:10). 16 Nov: 4 (03:56, R1.11, R1.12) -> 5 (14:09, R1.99) -> 11 (18:23).
- The 18:23 jump of 6 (R1.63, 73, 82, 83, 84, 101) came from growing the table 81 -> 101 rows: those six were already Works from M2/M3. Rows newly proven by an R1 qa verdict: 5 in ~2 days (15-16 Nov), about 2.5 a day.
- Your known figures match, give or take minutes (I used main's first-parent commit times).

## 2. Build state now. Sample: 101 rows, column 5
- Not built 67 · Partial 22 · Built, awaiting qa 1 (R1.100) · Works 11. Confirmed.
- Moves on 16 Nov (the 81 rows in both snapshots): 5 left Not built (R1.19, 47, 49, 59 to Partial; R1.100 to Built awaiting qa); 3 to Works. On 15 Nov (08:57 -> 24:00): 14 rows went Not built -> Partial and 1 went to Works.
- The checklist says 5 rows not yet proven have every listed part merged: R1.4 (PF-12, 16 Nov 13:47), R1.16, R1.38, R1.40, R1.80. CAPABILITIES still shows R1.4 as Not built.

## 3. Build rate in checklist parts. Sample: 90 rows not proven, 204 distinct parts
- A part counts as merged when an app-code PR title names it exactly; "part 1" with no final part counts as only partly merged.
- 26 parts fully merged; 7 partly merged (FO-2, FO-3w, FO-4, PF-19b, PF-21, PF-5, PF-6); 171 untouched. **178 parts remain.**
- Rows: 5 have every part merged, 40 have some, **45 have none**. Remaining parts per row: median 2; most R1.98 10, R1.106 8, R1.75 7.
- Shaping: every remaining part has a BACKLOG row, and no row lacks parts (BACKLOG on main and lead31; agrees with the checklist's "Not shaped 0").
- Parts fully merged per day: 13 Nov 0 · 14 Nov 9 · 15 Nov 13 · 16 Nov 3 (to 21:00). Parts first touched: 1 / 10 / 15 / 7.
- Mean over 13-16 Nov (3.9 days): 6.5 fully merged a day. Best two days (14-15 Nov): 11 a day.
- App-code PRs merged a day: 13 / 18 / 30 / 20. Naming an exact checklist part: 1 / 11 / 22 / 7. Sub-parts or hardening of a part (PF-6b, PF-6r, PF-6f, FO-3sa, FO-3pa, FO-3m, CS-C1a, FO-7mv, PF-18np and others): 0 / 0 / 5 / 11.
- Caveat: exact matching undercounts work done in sub-parts. The checklist does not say which sub-parts finish which part.

## 4. Proving capacity
- qa R1 report files: 14 Nov 1, 15 Nov 3, 16 Nov 8. Distinct R1 rows named (re-scores included, overlaps counted): 8 / ~31 / ~24.
- qa gives about 25 row verdicts a day, but only ~2.5 Works a day.
- Hours from the last part merged to Works, measured on main (n=4): R1.2 21.5, R1.9 17.6, R1.11 47.8, R1.12 50.7. **Median ~35 h.** R1.11 and R1.12 waited for the R1 table to exist.

## 5. Merge throughput. Source: merge-queue-failures-2026-11-16.md, window 15 Nov 09:00 to 16 Nov 10:10 IST
- Approved to merged: median 61 min, p90 132 min (n=78). From the first label: median 121 min for code PRs.
- Failed batches: 3 of 54 (5.6%), none after 15 Nov 18:52 IST. The page names the batch check's length as the merge-time limit and qa as the pipeline's limit (P-623).
- Not re-measured for 16 Nov after 10:10.

## Forecast (178 parts left, plus ~1.5 days from built to Works)
| case | rate | build done | all 101 proven |
|---|---|---|---|
| best | 11 parts/day (14-15 Nov mean) | ~3 Dec | ~4-5 Dec |
| likely | 6.5 parts/day (13-16 Nov mean) | ~13 Dec | ~15 Dec |
| worst | 3 parts/day (16 Nov) | ~14 Jan | ~16 Jan 2027 |

- These dates assume the outside clocks don't hold anything up, but they do:
  - the AWS account is not opened (rows 1, 14, 65, plus the cloud halves of 15 and 24 through PF-8b);
  - Google and Microsoft reviews take "weeks" (43, 52);
  - the BoldSign sandbox is held (54).
- **By 29 Nov at the likely rate:** ~85 of the 178 parts get built.
  - Taken in random order, that fully builds about 23 rows (p10 to p90: 19-29; includes the 5 already built), so about 30-35 of 101 proven.
  - Taken row by row, fewest parts first, it fully builds 67 rows, at most about 75 proven. But qa at today's ~2.5 Works a day proves only ~30 more by 29 Nov, so about 40-45.
- **What 29 Nov needs:**
  - about 15 parts a day fully merged for 11.6 days (2.4 times the likely rate, 1.4 times the best day of 13);
  - 90 rows proven in 13 days, about 7 Works a day (2.8 times the measured 2.5).

## Biggest drivers of delay in the data
1. Volume: 171 of the 204 remaining parts are untouched, and 45 rows have no part merged.
2. Splitting: on 16 Nov, 11 of 20 app-code PRs were sub-parts or hardening, not new checklist parts, so fully merged parts fell to 3.
3. Proving: Works runs at ~2.5 a day against ~7 needed, and a row takes a median ~35 h from built to Works. 5 rows are built but not proven (R1.4, 16, 38, 40, 80), and CAPABILITIES shows only 1 as awaiting qa.
4. Outside dependencies (AWS, Google and Microsoft reviews, BoldSign) block at least 6-8 rows whatever the rate. Merge latency (61 min median) and batch failures (5.6%) are small next to these.
