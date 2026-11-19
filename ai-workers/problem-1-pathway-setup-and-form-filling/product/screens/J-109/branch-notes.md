# J-109 branch notes (claude/vibrant-meitner-3t1yfe; the PR opens only after #2012 is on main, P-683)

* **Approve:** `Reviewer: Approve 5b04aab9ae704e7ad24b16152a8b1af30214d66a` (R7, 19 Nov: diff-only from R6's 306dcd2a9; the merge of #2012's tip aeba7d148, one line of MODULE.rows/PF-21i.md, no code). Earlier: R6 306dcd2a9 (the #2195 / P-712 card merge; J-109 needs no MODULE.rows entry), R5 497af411d, R4 eb49e116b, R3 9f36c6502. Commits after it add only this record and review.md's R7.
* **Results on 306dcd2a9 (19 Nov):** `tests/journeys/j_109.ts` 26/26 (J-109 W1-W5, DW1-DW2; the DW lines fail on the fake job runner and fake clock, checked 18 Nov); `check_pf21s_complaints_browser.ts` 116/116; `check_pf21_complaints.ts` 107/0; `check_pf21w_routes.ts` 83/0; `check_pf21v_views.ts` 54/0; `check_pf21i_idempotent.ts` 30/0. Typed actors: the walk's are `seed:j109`; the reviewer saw every complaint audit line carry firm_id and the right actor type (FIRM_STAFF, SYSTEM).
* **Next:** #2012 on main → merge origin/main once (P-270) → re-run the walk and these suites → open the PR non-draft with the Approve first.
* **Question for the tech lead (goes in the PR):** a Read-only person chosen as a complaint's handler can see, acknowledge and close it (break-report M1; PF-21v/w code, not this row). Recommendation: a bug row against PF-21v/w; J-109 is not widened.

* **For #2012, not J-109 (R6):** main now has migration `20261119031000_fo3a_hour_sets`, later than PF-21i's `20261118233000`; rows rev 15.2 / P-600 want PF-21i's stamp later than main's newest when it merges.
