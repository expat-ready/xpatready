# R1.109 merge batch CI (read by qa 7, 19 Nov)
- J-109 #2262 merged 14:20:31Z as b8fa9b962 with #2263 in batch draft #2288 (mergify/merge-queue/7bd38caa0a, head df32287ba).
- Batch tree d2c27b778 = main 23e242d37's tree (main now).
- ci run 44532604794: success (all shards, types, fast, regression).
- check_pf21_complaints.ts PASS 107 passed 0 failed (job 135591815243, shard 1)
- check_pf21i_idempotent.ts PASS 30 passed 0 failed (job 135591814983, shard 5)
- check_pf21w_routes.ts PASS 83/0; check_pf21v_views.ts PASS 54/0; check_pf21b_port.ts PASS 32/0; check_pf21s_complaints_browser.ts PASS 116/116
- BUGS.md on main: QA-506 (Minor, no menu entry to Complaints) Open; no open Major/Critical for R1.109.
135591814903.log: run-suites: check_pf21s_complaints_browser.ts starts, 1834 s into this part
135591814903.log: | check_pf21s_complaints_browser.ts | PASS | 29 s | 116/116 passed |
135591814983.log: run-suites: check_pf21i_idempotent.ts starts, 1243 s into this part
135591814983.log: | check_pf21i_idempotent.ts | PASS | 8 s | 30 passed, 0 failed |
135591815002.log: run-suites: check_pf21w_routes.ts starts, 942 s into this part
135591815002.log: | check_pf21w_routes.ts | PASS | 4 s | 83 passed, 0 failed |
135591815034.log: run-suites: check_pf21b_port.ts starts, 1381 s into this part
135591815034.log: | check_pf21b_port.ts | PASS | 11 s | 32 passed, 0 failed |
135591815035.log: run-suites: check_pf21v_views.ts starts, 1199 s into this part
135591815035.log: | check_pf21v_views.ts | PASS | 16 s | 54 passed, 0 failed |
135591815243.log: run-suites: check_pf21_complaints.ts starts, 1077 s into this part
135591815243.log: | check_pf21_complaints.ts | PASS | 15 s | 107 passed, 0 failed |
## Walks on main 3c9731cd7 (dispatched by the Lead 14:24Z; main = batch tree + PF-19r part 2 only, no complaints files)
- Pack run 44543315644, job 135627929501 (walk j_109): 26 passed, 0 failed.
- Independent re-run 44543321849, job 135627584968 (walk j_109): 26 passed, 0 failed.
- Step list of the pack run: walk-j109-pack-steps.txt.
- account-sections.ts on main: no Complaints entry (QA-506 still Open, Minor).
