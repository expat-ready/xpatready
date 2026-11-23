# Pilot A result (Lead O 2, 23 Nov 18:12 IST). Measurement only, never merged.
Run 45169056072, push of e7cd9fab6 on main 7bd590d6f, 17:22 to 18:09 IST, 12 jobs, 4 machines at most, US$0. One shard only: **7 of 24**, 27 units: 21 packed, 6 serial after them (check_pf4c_licence_format, check_p2_launch, check_aud4_firm_log, check_csc1_close, check_csdl3_milestones, check_fo3sa_any_time: shared demo database or outside tests/). The R1 group and check_studio_browser.cjs are not in this shard. 4-CPU GitHub machines, no --retry, set-up not counted. The jobs read green even with a red suite (my script does not fail the job): judge by the red column.
| At once | Run | Packed min | Serial min | Wall min | CPU mean / p95 / max (of 4) | Memory mean / p95 / max GB | Red |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 16.0 | 1.1 | 17.1 | 0.94 / 1.53 / 2.00 | 2.05 / 3.46 / 3.64 | none |
| 1 | 2 | 20.7 | 1.6 | 22.2 | 1.07 / 1.66 / 2.24 | 2.08 / 3.40 / 3.63 | none |
| 1 | 3 | 20.4 | 1.6 | 21.9 | 1.07 / 1.70 / 2.67 | 2.07 / 3.20 / 3.56 | none |
| 2 | 1 | 9.9 | 1.3 | 11.2 | 1.87 / 2.74 / 2.97 | 3.07 / 4.24 / 4.77 | none |
| 2 | 2 | 8.8 | 1.0 | 9.9 | 1.83 / 2.80 / 2.89 | 3.06 / 4.24 / 4.89 | none |
| 2 | 3 | 11.5 | 1.6 | 13.0 | 2.09 / 2.86 / 3.53 | 3.08 / 4.29 / 4.56 | none |
| 3 | 1 | 7.6 | 1.4 | 8.9 | 2.74 / 3.55 / 3.70 | 4.02 / 5.82 / 6.06 | none |
| 3 | 2 | 7.8 | 1.6 | 9.4 | 2.68 / 3.58 / 3.83 | 3.98 / 5.71 / 5.91 | none |
| 3 | 3 | 6.7 | 1.1 | 7.7 | 2.73 / 3.62 / 3.81 | 4.06 / 6.24 / 6.38 | none |
| 4 | 1 | 8.6 | 1.6 | 10.2 | 3.53 / 3.95 / 3.97 | 4.91 / 6.91 / 7.05 | c91_impact, pf5t_terms |
| 4 | 2 | 8.5 | 1.6 | 10.1 | 3.57 / 3.96 / 3.98 | 4.94 / 7.04 / 7.16 | c91_impact, c75_review_page |
| 4 | 3 | 8.4 | 1.6 | 10.0 | 3.58 / 3.96 / 3.98 | 4.95 / 7.07 / 7.23 | c91_impact, pf5t_terms |
Steal 0.0 and swap 0 in all twelve. Same suites in every row, so each row compares with "at once 1".
* **3 at once: about 2.6 times faster in the packed part (mean 7.4 against 19.0 min), 2.3 times in the wall time (8.7 against 20.4), no red in three runs.** The serial runs themselves vary 16.0 to 20.7.
* **4 at once does not pay:** slower than 3 and red each time (CPU at its limit). c91_impact red 3 of 3 (timeout), pf5t_terms 2 of 3 (timeout), c75_review_page 1 of 3; none is red at 1, 2 or 3. So these are packing reds, not flakes of the suite alone (3 serial runs each; small).
* Overlap: dispatched full run 45170135484 (#2590, c836593b6) ran 17:29 to 17:58 IST beside it. GitHub gives each job its own machine, but queueing was not measured. It ended green.

**Machines (arithmetic, not a test):** at 3 suites on 4 CPUs one machine did the work of 2.3 serial shards. If every job were like this shard and set-up cost nothing: 72 jobs average = about 31 such machines, 170 peak = about 73. At 0.75 suite per CPU: 96 and 227 CPUs. Not shown: other shards, other suites, set-up, regression and pack jobs, a full run's wall time, large servers. Pass rule "full run at most 30 min" is **not tested**; Pilot B is the test of that and has not run.
