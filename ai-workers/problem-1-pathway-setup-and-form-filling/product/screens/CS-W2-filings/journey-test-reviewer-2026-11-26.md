# Journey test (reviewer): CS-W2 part `filings`, PR #3811 head 9d0b3417ececa13becaf9c94fa20315a2a6aa132

26 Nov 2026, reviewer role. Isolated copy `rt_rev` on :4498 (the caller's port; never :4400), plus scratch databases on 127.0.0.1:54329.
**This is a schema-only change with no screen.** Journeys were walked through the API and the database, not a browser. Criteria that need a screen
are N/A, and the score is scaled over the criteria that apply.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Case officer opens and prepares a Visitor visa case | `POST /runtime/cases`, `GET …/prepare` (the suite's W1) | 200; every group, filing, applicant and item carries the case's firm | Held (W1 pass; 0 mismatched) |
| J2 alternate | Officer runs eligibility, overrides, reviews | `check_c69_runs.ts` on a fresh copy | runs unchanged; assessment, override and review rows on the case's firm | Held (94/94; 46 + 2 + 2 rows, 0 mismatched or null) |
| J3 alternate | Officer applies filing changes | `check_qa329_filing_change_order.ts` | unchanged; filing_change rows on the case's firm | Held (7/7; 6 rows, 0 mismatched) |
| J4 boundary | Author resets the demo and loads the six | `check_d1_reset_to_six.ts`, fresh copy | 25/25 | Held |
| J5 error | Insert naming the other firm, or with the session firm set to B | suite DW1.2 and probes P18–P20 | refused 23514 in words; `''` read as no firm; a malformed id refused | Held |
| J6 error | Upgrade with rows under two firms' parents | suite DW1.1 fail | migration stops, naming the row | Held (one-side-empty case falls to Postgres's words: break m5) |
| J7 recovery | A firm-less case gets its firm later | probe P15 and suite follow case | its rows follow, frozen ones included | Held; the race in break m1 can leave a permanent null |
| J8 wrong role / break | App role moves a row to another firm's parent | `set role xr_app; update filing_applicant set firm_id = null, filing_id = <B filing>` | refused | **Failed: UPDATE 1** (M1) |

## Data underneath
Fresh copy after J1–J3: 0 rows with a firm other than the parent's, 0 nulls under a case that has a firm. The guards still refuse every
non-fill update (P10, P11). The guard exception never let a wrong firm in (P1–P9, P12).

## Break-it findings
Major: M1 above. Minor: the jsonb numeric equality in `case_filings_firm_fill_only`; the unpinned search_path in the rewritten guards; one cross-firm ghost row
blocks CS-W1's backfill for every case. Details are in `review.md` and `break-report.md`.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J4 unchanged and green |
| Next step obvious | N/A | nothing visible changes |
| Plain words | ½ | the migration stop and fill refusals are in words; break m5 and the P2010 log line (the message is dropped) are not |
| Feedback and state | N/A | no UI |
| Correct data | ½ | every API-made row is right, but M1 lets a row sit under another firm's parent with an empty firm |
| Error recovery | ½ | refusals hold; break m1 (a permanent null) and m4 (one row blocks every case's fill) are not recoverable without a hand fix |
| Accessibility and screen sizes | N/A | no UI |
| Speed | 1 | each per-row trigger is one primary-key lookup; a `(firm_id, …)` index sits beside each `(case_id, …)` one; suite run times normal (not timed against §9) |
| Visual quality | N/A | no UI |
| Trust and sources | N/A | no AI output and no immigration values |

**3.5 of 5 applicable = 7/10. Below the bar of 8** (no criterion at 0). The fix most worth doing: M1's null guard with its fail tests. That raises correct data to 1, which gives 8/10.
Then compare text in `fill_only` (break m2) and move the m1/m4 recovery to the NOT NULL sweep, which re-runs `case_filings_firm_backfill()` first.

Not tested: a browser walk (no screen), a real screen reader, an intended user's walk (D17 and D20 stay with the founder), CI on the head.
