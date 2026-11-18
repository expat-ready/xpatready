# qa capability re-score: wave 0, sections G to L (18 Nov 2026, 19:2x IST)

**Mode:** `/qa capability` (re-score), wave 0 of `design/release1-end-to-end-review-2026-11-18.md` (P-697, P-698), sections G (client money), H (client links and portal), I (documents), J (case work), K (government forms, assessment), L (privacy registers and audit views): 33 Release 1 rows.
**Commit tested:** main 15c75cd52 (last merge #2014). GitHub CI: run 44290020058 (`ci`, merge-queue batch), green, on a tree identical to main 15c75cd52 (tree f7630bac8, checked through the API).
**Base of this records branch:** `claude/qa-after-merge-1118b` (#2121, which contains #2088's and #2117's branches), so the newer verdicts for R1.58, 77, 102, 105 and 109 are kept, not overwritten. #2121 has since merged, and origin/main was merged in once. Its rows C8.2 and C11.6, and qa-2's rows in sections A to F, are not touched.
**Cost:** US$0, live AI off, no paid runs, :4400 not touched.

## Verdict
**No row in G to L reaches Works in wave 0.** 32 of the 33 rows still miss named parts (MVP-CHECKLIST's parts column), so they get "parts missing" with no verdict (P-606). R1.80 has all its parts merged, but its C7.2 still waits on QA-165: the tech lead's Adobe Validate run on the Mac (P-442). No newer run exists on any branch (`git log --all --since=2026-11-17`). The review expected R1.80 to reach Works on that run, and it has not happened yet.

Status moves (the rule: Partial when at least one named part is merged, Not built when none is):
* **Not built → Partial (5):** R1.56 (FO-7a #1758; FO-7s0's concept #2016 is records only and does not count), R1.61 (FO-6 part 2 #2040, SigningPort; found by the fresh reviewer), R1.72 (C6.1 Works was a named part all along; corrected), R1.85 (PF-21b part 1 #2025), R1.106 (AS-1m #2105).
* **Partial, unchanged (8):** R1.58, 59, 74, 77, 80, 102, 105, 109.
* **Not built, confirmed (20):** R1.57, 60, 62, 64, 65, 66, 67, 68, 69, 70, 75, 76, 79, 86, 87, 88, 96, 97, 107, 111.

## Part checks re-run on this commit (locally, twice each, US$0)
For each part merged since its row was last scored:
| Part (PR) | Check | Result | Row |
|---|---|---|---|
| PF-Fd (#1997) | `check_pffd_delete.ts` | 24/24, 24/24 | R1.65 (input, not a named part) |
| PF-Fp part 1 (#2028) | `check_pffp_pdf.ts` | 41/41, 41/41 (fake; Gotenberg not reached) | R1.68 (input to CS-D5) |
| PF-21b part 1 (#2025) | `check_pf21b_port.ts` | 32/32, 32/32 | R1.85 |
| AS-1m (#2105) | `check_as1m_eligibility_move.ts` | 50/50, 50/50 | R1.106 |
| AUD-5 part 1 (#2008) | `check_aud5_keep_periods.ts` | 57/57, 57/57 | R1.105, R1.69 (input to CS-D6) |
| AUD-1a (#2003) | `check_aud1a_insert_only.ts` | part A 31/31 twice; part B not run (below) | R1.8 (qa-4's row), shown here under R1.97 and R1.87 |

## What I could not test
* **Isolated copy (ports 4478-4479):** `studio/tools/isolated.sh` refuses to start inside this session's sandbox. It runs `pg_ctl status`, and the sandbox hides the database server's process even though the server answers on its port (the scratch-database checks above reached it). So AUD-1a's part B and BK-21's check (`check_bk21_pinned_account.ts`, which also needs the checkpoint set-up) did not run here. CI run 44290020058 ran both green. Gate A was not needed, because no row claims Works.
* **Headed walks:** none needed. No row in G to L has all its parts merged except R1.80, and R1.80 waits on the Lead's Validate run, not on a screen.

## Review
A fresh reviewer (a new Opus context that ran nothing and did not write this) checked 20 rows against MVP-CHECKLIST's named parts and main's merged PRs. It asked for one change, R1.61 (Not built → Partial), plus two wording points (R1.76's FO-2 merges, and concept PRs counted the same way in R1.56 and R1.88). All three are fixed.

## Bugs
No new bugs. QA-165 (C7.2, Gap · Major), QA-471, QA-472 and QA-502 stay open, unchanged.

## Questions for the Lead
1. **QA-165:** the Adobe Validate run on the Mac (P-442) is the only thing between R1.80 and Works. When will it run? Once it passes, qa needs a fresh reader and gate A on the checkpoint.
2. **Sandbox and `isolated.sh`:** in a sandboxed qa session, `pg_ctl status` cannot see the database server, so gate A on an isolated copy cannot run. Should the check use `pg_isready` (which tests the port, not the process), or should gate-A sessions run without the sandbox? This needs a tooling row, not a qa change.

## Suggestions
* *Needed for the proof · Scaffolding:* `isolated.sh` could test the database with `pg_isready -h 127.0.0.1 -p 54329` instead of `pg_ctl status`, so sandboxed qa sessions can run gate A (Question 2).
* *Later · Capability:* the review's gap G2 (no row joins FO-6's signing to FO-7c's paying, R1.61) and gap G3 (no screen row for QA-502, R1.77) still have no BACKLOG row.
