# qa 12 — R1.27 and R1.4 on main 2d036c65c, 21 Nov (task QQ9B2)

qa 12 is a cloud session (Opus 5.5, effort medium), asked by the tech lead (Lead 9): prove R1.27, then R1.4, under P-339. Live AI off, US$0. Isolated copies only, never :4400.

Main `2d036c65c` has the same app tree as `ce1472916`.

## R1.27 Every lead carries a source: Partial, held only by the missing independent re-run
The Done when, with import dropped by the tech lead's ruling on QA-494: "Every lead has a source (form, embed with campaign, manual); a lead without one refused by the database (fail case); lists filter by source."

| Run | Where | Result |
|---|---|---|
| Pack: walks.yml `j_27` | GitHub, [run 44851612622](https://github.com/expat-ready/xpatready/actions/runs/44851612622) on ce1472916, job 136684206039 | 11/11 |
| Independent re-run: walks.yml `j_27` on main's head | asked of the Lead on #2612 (02:08 UTC) | **not yet dispatched** |
| `tests/journeys/j_27.ts`, fresh copy, twice | here (`2026-11-21-r127-qa12b/j27_{1,2}.txt`) | 11/11 twice |
| `check_fo4sf_source_filter.ts`, qa's `check_r127_lead_source.ts` | `2026-11-20-r127-qa12/` | 34/34 and 5/5, twice each |

**Each clause (j_27; the fresh reader checked the code):**
* **Form:** W1, by screens. A hosted send makes a WEB_FORM lead with source WEBSITE, shown as "Website form".
* **Embed with campaign:** W2. The embed's send (with Origin and utm values) makes a lead with the same source, and the campaign is kept and shown on the lead's page. By the Lead's ruling P-628, embed and hosted both keep the source Website. The drawn embed is walked by screens in J-26 (R1.26, Works).
* **Manual:** W3, by screens, through #2612's Add a lead. Saving with no source shows "Pick a source." and saves nothing; "Phone call" saves a MANUAL lead owned by the Owner. The source is required in the panel, the API (`leads.ts:139`) and the database. The button and route sit behind `agent/prospect:create`, and a Read-only user gets no button and a 403. One `lead.created` audit line is written.
* **Refused by the database:** W4. A NULL source and a blank source are both refused, and no lead of the firm is without a source.
* **Lists filter by source:** W5 on Leads (Source "Phone call" shows only the manual lead; "Website form" shows the two web leads). On Pipeline, the fo4sf pack.

**Gate A: met.**
* **Start:** where J-26 ends, with web leads in the Owner's Leads.
* **End:** the manual lead's page, which is R1.28's first step.
* **Before the walk:** j_27 switches the form on by SQL (`:48`). That is R1.26's step, walked by screens in J-26. #2612's follow-up S5 would move it onto #2556's screen.

**The fresh reader (Opus, ran nothing):** `2026-11-21-r127-qa12b/reader-verdict.md`.
* **Verdict:** Works, about 85%, on condition that the second GitHub walk is green.
* **A Minor outside the Done when:** the server accepts "WEBSITE" typed by hand as a manual source.

**Findings:**
* **QA-606: closed.**
* **QA-501** (Minor, test repeatability): does not hold Works.

**Next:** when the Lead's `j_27` re-run on main is green, qa flips R1.27 to Works on this PR.

## R1.4 Each query runs inside its firm: Partial, unchanged
Nothing for R1.4 has merged since qa scored it after #2029 (20 Nov, `2026-11-20-r14-qa12.md`):
* one change to `platform/firm-scope.ts`'s bypass audit: d412bfe80 (via #2527, for R1.8). `touchingAudit` now touches the firm a case audit line names and writes its bypass line; a line naming no firm is still refused. It changes neither QA-499's 11 own-firm uses nor QA-608, and pf12b 56/56 on 2d036c65c covers it;
* no PF-12b part 2.

| Run (here, main 2d036c65c) | Result |
|---|---|
| `check_pf12b_bypass_audit.ts` | 56/56 |
| `check_pf12_walls.ts` | 100/100 |
| Gate A by API: `tests/qa/check_r14_walls_gate_a.ts` (fresh copy; no screen, P-616) | 17/17 |

These are the same counts as on 20 Nov. On GitHub: ci full run 44759585301 (20 Nov, recorded in the row).
* **Held by** QA-499 (narrowed: 11 own-firm bypass uses write no audit line) and QA-608 (PF-12b part 2 has no row, no owner and no PR).
* **Also open:** QA-609, Minor.
* **No new reader:** the 20 Nov fresh reader's verdict stands, and nothing it read has changed.

## Questions for the tech lead
1. **Please dispatch the `j_27` re-run on main:** `gh workflow run walks.yml --ref main -f journeys="j_27"`.
2. **R1.4:** please shape PF-12b part 2 (QA-608). Until it merges, R1.4 cannot move.
