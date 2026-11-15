# Board audit: is every founder requirement built into the Progress Board v63? (15 Nov 2026, 15:40 IST)

Read-only audit of the Founder's Progress Board ("board", "cockpit"). Code checked: `cockpit/index.html`, `tools/cockpit-data.py`, `tools/cockpit-reconcile.py`, `tools/test_cockpit_data.py`, the hand-kept JSON files and `cockpit/screenshots-v63/`. The branch was `lead/2026-11-07-lead31` at 37184285d; v63 = ad1913b5e, merged here as 878b5fe17. Nothing else was changed.

## Summary

**59 requirements found: 37 done, 16 partly done, 2 not built, 4 superseded.**

Three things matter most:

1. **The founder cannot see v63.**
   * v63 is on the Lead branch only. It is not published: the old page sits on the old account, and the new account has no artifacts.
   * It is not on `main` either. Records PR #1814 (head d2d1d212c, open) carries board v62. Neither v63 (ad1913b5e) nor v53 is in it.
   * His 15 Nov 15:24-15:27 IST ask to "make the board work on any account" has no build yet.
2. **P-606 (1) is not built.** The board does not name "merged to proven" as the constraint. It does not show "opened → first Approve", and it does not list stuck PRs apart. The value-stream map and the Capacity line still put the bottleneck on the review wait (hours since last push). Desk 06 measured that as misleading.
3. **Several standing rules are written down but not enforced.** Each is "prose" in the RULES register:
   * refresh at every check;
   * the board link opens every report;
   * a weekly fresh review;
   * every red item worked at each check.

   Also, some numbers are typed into the page by hand, not fed from script data: Optional 8, Held 3, Deferred 31, and the Library list.

Known open items from the v63 lane report, all confirmed:

* **Maps 9, 38 and 40 are behind.** `MVP-CHECKLIST.md` lines 35, 83 and 85 still say "Shaped", though PF-14 #1757 and FO-3 #1760 merged.
* **The first-firm tile is empty.** `plan.json` has no `first_firm`.
* **Dependency ids with no dash** (F1, B185) are read differently by the board and the check.
* **The "31 Nov" typo risk is real.** `day_of()` at cockpit-data.py:690 skips an impossible date and reads on, so the typo would move a row to the next date in the text.

Sources read:

* `DECISIONS.md`: P-569, P-591 to P-596, P-599, P-602, P-606, P-609, P-611, P-615. Not about this board: P-147, P-176 and P-180 (product-screen boards) and P-597 and P-604.
* STATE "Founder asks" and its history files (A34, A53-A87).
* The founder's prompt log, 14-15 Nov, read-only. One entry, 15 Nov 08:24 IST, was not opened; it holds a typed value.
* Notes from strategy desks 05, 06 and 07 in the side-session folders.
* The git log of `cockpit/` and `cockpit-data.py`.
* PR #1814's comments (the v63 lane report).

**Not found:** no file is named as a "communication log" between the founder and the Leads. The prompt log (`~/.claude/projects/…/prompt-log/*.jsonl`, written by `ai-workers/tools/prompt-log.sh`) and the STATE "Founder asks" rows stand in for it.

## Requirements

| # | ID / source | Requirement in plain words | Status | Evidence (v63 code and tests) | What to do |
|---|---|---|---|---|---|
| 1 | P-569 (3); A34 | One cockpit to follow both the proof of concept and the Release 1 build | DONE | Strip tiles "Proof of concept" and Release 1 (`renderStrip`, index.html:418); "On track?" (`rStatus`, :716) | none |
| 2 | P-591 (3) | A live dashboard fed only by script data, with no numbers typed into the page | PARTLY | Most numbers come from `data.json`. Typed into the page: Optional "8", Held "3", Deferred "31" (index.html:964-966), the Library list `LIBRARY` (:933) and "112 capabilities" in its text | Move those counts and the Library list into `cockpit-data.py` (parse the map, BACKLOG and `library.json`) |
| 3 | P-591 (3) | The board shows: Needs you; plan with high and mid dates; who does what; burn-up over 101 and Works; quality; pipeline (DORA keys, queue wait, CI minutes, batch failures); resources (weekly %, burn, spend, disk); risks; learnings | DONE | `rNeeds` :673; `rPlan` :728 and timeline; Team tab `rTeamTab` :619; burn-up `drawBurnup`; `rQuality` :824; `rDevops` :848 (4 keys, approved → merged, batches, CI minutes, CI time thrown away); `rRes` :864; `rRisks` :877; `rLearn` :915 | none |
| 4 | P-591 (3), A71 (15 Nov 08:5x IST) | Refreshed at every 30-min check and on demand; the founder told when it is refreshed | PARTLY | The refresh script exists (README). RULES.md:120 lists the rule as prose, with no check that a refresh happened. v63 has never been refreshed onto a page the founder can open | Add a lead-watch line that ACTs when the published data is over 45 min old; publish v63 first (row 58) |
| 5 | P-591 (3) | Every report to the founder opens with the board link | PARTLY | Prose only (RULES.md:120); no hook or check | Add the link to the report template in the lead and lead-watch skills (at the founder's typed turn, as skills are sandboxed) |
| 6 | P-591 (3) | A fresh independent reviewer checks the board weekly: complete, not ambiguous, not overlapping | PARTLY | A fresh review is done per version (v53: 4 rounds; v63: 2 rounds, Approve at ad1913b5e). No weekly whole-board review exists yet; first due about 21 Nov | Put the weekly review on the Monday list beside "what's new"; record its result |
| 7 | P-591 (4), P-593 (3) | Retire the overlapping published pages | PARTLY | `cockpit/retire-list.md`: 11 of 14 deleted on 14 Nov; 3 wait for export (on the old account) | Finish from the old account, or record them as left |
| 8 | A54 addendum (14 Nov 12:4x IST) | No duplicate work: a thin aggregator over the existing scripts | DONE | `cockpit-data.py` reads flow-measure, app-code-prs, factory-board rules and lead-watch facts (header, :11-12) | none |
| 9 | A55 (14 Nov 12:4x IST) | One scroll: a "you are here" value stream with the bottleneck, team (cloud and Mac), architecture by module, capability grid, healing and improving trends, learnings | DONE | `rSystem`/`drawVSM` :691; lane kind cloud/Mac in `laneRow`; `rArch` :737; `rHeat` :975; `rHeal` :887; `rImprove` :905; `rLearn` :915 | none |
| 10 | P-592 (3) | Two numbers, never mixed: the proof's Works (M2/M3/T) and Release 1 (capabilities at qa Works of 101) | DONE | Strip tiles; `rStatus` :716 "Two numbers, never mixed" | none |
| 11 | P-592 (4) | The Lead keeps the checklist's status column current | PARTLY | Maps 9, 38 and 40 still read "Shaped" (MVP-CHECKLIST.md:35, :83, :85). The board shows "records differ" for them (test `test_records_differ_carry_their_cause`) | The Lead updates the three rows |
| 12 | P-593 (1), A57 | Library section: each master once, with name, what it is, version, where it lives, link | PARTLY | `rLibrary` :947 has Document, What, Status, Up to date?, Master. **No version column.** The list is typed into the page (:933). The sourcing-map link points to a page on the old account | Add a version per master (from `library.json` or git); feed the list from data; relink the map |
| 13 | A83 (15 Nov 10:5x IST) | Library documents kept current on need, at low token cost | PARTLY | The "Up to date?" column is built (`library_freshness`, cockpit-data.py:42; `tools/library-freshness.py`). Today it reports two masters behind: the Release 1 checklist (4 feed changes since 10:10 IST) and Contracts (since 12:59 IST) | Refresh those two |
| 14 | P-594 | The first release is named "Release 1 (production grade)" | DONE | Goal line in `render()` (index.html:1011) | none |
| 15 | A58 (14 Nov 15:3x IST) | One page saying what to see, do and know: Needs you, On track?, Risks, Library (living or history); details folded | DONE | `rNeeds` on top; `rStatus` "On track?"; Risks tab; Library Status pill (Living/History) | none |
| 16 | P-595 (2) | Key-number strip with written green/amber/red rules; Needs you on top | DONE | `renderTop` :397, `renderStrip` :418; health rules in `renderHealth` | none |
| 17 | P-595 (2) | Tabs: Overview, Capabilities, Factory, Launch readiness, Library, Details (Team added by v57) | DONE | `TABS` at index.html:1009 | none |
| 18 | P-595 (2) | Capabilities heat map: the 12 business functions against built, proven by qa, customer-experience walk, IRCC and compliance, risk, missing or optional | PARTLY | `rHeat` :975 shows the status columns only. The page says the walk, compliance and risk columns "join when TR-1 and qa's Release 1 capabilities land" | Add the three columns now that TR-1's Sources exist; keep rows and colours (A63) |
| 19 | P-595 (2) | Factory: DORA four keys, open Majors, cost, forecast | DONE | `rDevops` :848, `rQuality` :824, `rRes` :864; the forecast is on Overview `rPace` | none |
| 20 | P-595 (2) | A Launch readiness tab built from checklist section C | PARTLY | The tab holds only `rRisks` (risks.json) plus a count of section C items missing from it. The 33 section C conditions are not listed. "Launch conditions done 0/33" is in the Customer box (`launch_conditions`, cockpit-data.py:749) | List section C items with status on the tab |
| 21 | P-595 (2) | North Star line (P-518) on top | SUPERSEDED | P-518's North Star was the integration into the team's product; P-569 stopped the integration. The page shows the Release 1 goal line instead | none |
| 22 | P-595 (1), A70 (15 Nov 08:0x IST) | Requirement section ids per capability | DONE | "Sizes and requirements" table `rCapTable` :773; test `test_requirements_column` (test file :947) | none |
| 23 | P-596 (1), A61 | Pace line (needed vs done a day), burn-up with forecast, roadmap timeline | DONE | `rPace` :459, `drawBurnup`, `drawTimeline`; `monte_carlo` cockpit-data.py:1293; tests in class `Pace`, `MonteCarlo` (:93-197) | none |
| 24 | P-596 (1), A61 | Capacity line: lanes running vs ready rows, how many more could run | DONE | `constraint` cockpit-data.py:1316; `rCapacity` :560; tests `test_lanes_ready_room`, `test_constraint_rules` | (see row 43 for the constraint wording) |
| 25 | P-596 (1), A61 | Top 3 (today, week, month) with the Lead's recommendation | DONE | `rTop3` :574; tests `test_top3_ok`, `test_top3_missing_stale_example`. Shows "Lead has not updated this" without Lead input | Keep `top3` in the Lead input at each check |
| 26 | P-596 (1), A61, A77 (15 Nov 10:1x IST) | Org chart of who works now and how; Team view by component | DONE | `org_components` cockpit-data.py:1421; `rTeamTab` :619; class `TeamByComponent` (tests :1083-1175) | none |
| 27 | P-596 (1) | Health: one light, red only when a rule breaks, detail behind a click | DONE | `health` cockpit-data.py:2413 (7 items); `renderHealth`; class `Health` (:529-566) | none |
| 28 | A61, A69, A70 | Sizes simple, medium, complex per capability | DONE | v53 size rule (`cap_size` cockpit-data.py:636); tests `test_size_rule_counts_backlog_rows`, `test_works_today_size_mix` | none |
| 29 | P-596 (2), A62, A82 | Every number carries source, sha, time and class; a missing input shows "not measured", never a guess | DONE | `num`/`V`/`lineage_fill`; schema; tests `test_schema_refuses_missing_lineage_and_null_without_reason`, `test_lineage_on_every_new_number` | none |
| 30 | P-596 (2) | A data contract that fails loudly | DONE | `validate` → exit 2, no data.json (cockpit-data.py:3600-3608); `cockpit/data.schema.json` | none |
| 31 | P-596 (2) | Unit tests on fixed inputs with hand-worked expected numbers | DONE | 123 tests pass at ad1913b5e (lane report); fixtures in `tools/fixtures/cockpit/` | none |
| 32 | P-596 (2) | A second, independently written script recomputes the headline numbers; red "disagree" / amber "not checked" banners | DONE | `tools/cockpit-reconcile.py`; `reconcile_compare` :2367; tests `test_reconcile_compare`, `test_reconcile_absent_or_failing`, `test_reconcile_agrees_on_the_eight_new_keys` | none |
| 33 | P-596 (2) | A fresh reviewer audits the formulas before each publish | DONE | v53: 4 rounds (NOTES-v53.md); v63: 2 rounds, Approve at ad1913b5e (#1814 lane report) | none |
| 34 | P-596 (2) | Board tests run in CI | PARTLY | `.github/workflows/cockpit-tests.yml` is on `main`, but v57-v63 code is not on `main` yet (#1814 carries only v62; v63 nowhere but the Lead branch). The browser test of the ⓘ buttons on every tab (`InfoIconsInBrowser`, :1629) was skipped in the v63 run: no axe-core (`AXE_JS`) | Carry v63 to `main` in the next records PR. Propose installing axe-core 4.10 (npm, official) so the browser test runs (founder rule on missing tools) |
| 35 | A63 (14 Nov 15:5x IST) | Keep the heat map as is; mark where we work today along the journey | DONE | `working_today` data; marker and line in `rHeat` :976-990; test `test_working_today` | none |
| 36 | P-599, P-609 | Committed date 29 Nov in the plan, the measured forecast shown beside it | DONE | `cockpit/plan.json`: H1 2026-11-29 committed (P-609), H1F 12-14 Jan forecast | none |
| 37 | P-602 (4), A67 (14 Nov 19:4x IST) | Delivery per use of plan: weekly plan % per merged change and per capability at Works, rows a day done vs needed; measured only, no dollar estimate | DONE | `rDelivery` index.html:502; `parse_usage_log`/`usage_window` cockpit-data.py:1164-1220; class `Delivery24h` (:719-865) | Keep logging `usage-log.sh` each check |
| 38 | P-602 (1), A84 | Needs you counts only the founder's own items, each with one line and a date | DONE | `needs_split` cockpit-data.py:1243; classes `NeedsSplit`, `NeedsYouOnlyHis`; test `test_schema_refuses_needs_you_with_pr_questions` | (see row 53: his outside clocks are missing from it) |
| 39 | A66 (14 Nov 18:1x IST) | Speed, delivery rate, token use, the target and parallel work visible on the board | DONE | Pace line, top numbers, strip "Plan use", capacity lanes | none |
| 40 | A69 (15 Nov 08:0x IST) | Key numbers on top: capabilities at Works today vs 10 with the S/M/L mix, plan % per Works capability, lanes working/started/idle | DONE | `renderTop` :397; class `TopNumbers` (:867-1052) | none |
| 41 | A69, A70 | Rules governance shown (rules caught today), folded into the health light | DONE | Health item 4; test `test_rules_caught_fold_into_health_item_4`. The Lead's two counts show "not reported" without Lead input keys `breaches_found`, `push_guard_refusals` | Lead input to carry both keys |
| 42 | A72 (15 Nov 09:1x IST), desk 06 list | Test-optimisation numbers: test time per capability or module, which suites run and how they are selected, nightly part times vs the limit, batch-failure causes, review and qa waits | PARTLY | Built: batches and failed share, CI minutes a day, CI time thrown away (`rDevops`), qa wait (`rCapacity`), nightly red share and restore. Missing: test time per module, suites selected vs run per PR, nightly part times vs 59 min, batch-failure cause split | Build from `tools/suite-times.tsv` and the nightly job times; one board row |
| 43 | P-606 (1) | The board names "merged to proven" as the constraint, shows opened → first Approve, and lists stuck PRs apart | NOT BUILT | Nothing in `cockpit-data.py` or `index.html`. `constraint()` (:1316) still picks the longest wait among review/merge/qa; review wait = hours since the last push of Ready-for-label PRs (desk 06 showed this read 10.4-13.4 h from three stuck PRs). The value-stream map's orange "taking the most time" box uses the same | Add the first-Approve time (PR timeline), a "stuck" list (question or migration slot), and the merged → proven stage as the named constraint; tests and a reconcile key |
| 44 | A77 (15 Nov 10:1x IST) | Each number explains its window, its n and how to read it | DONE | `build_explain` cockpit-data.py:2577; class `Tooltips` (:1177-1272), `test_window_and_n_from_the_data` | none |
| 45 | A84 (15 Nov 11:0x IST) | Click-only ⓘ info icon beside numbers, on every tab | DONE | v61 info buttons (`addIcons`); explain entries for the v63 numbers (`test_each_has_an_info_entry_and_a_page_key`); screenshots-v63. The browser check was skipped in v63 (row 34) | Run the browser check once axe-core is installed |
| 46 | A78 (15 Nov 10:4x IST) | A daily view with an early, low-confidence estimate before 17 Nov, plus daily leading numbers (parts merged, capabilities with all parts merged, first-verdict Works share) | DONE | `rEarly` :487; class `EarlyBandAndLeading` (:1326-1391) | none |
| 47 | A80 (15 Nov 10:4x IST), A84 | The Lead runs on the board: every red item and every Needs-you item worked at each check | PARTLY | Prose only; `tools/lead-watch.sh` has no line that reads the board's health or Needs you (0 matches) | Add a lead-watch step that reads `data.json` health items and ACTs on red |
| 48 | P-611 (3), A85 (3) | "What's new this week" box: checked? when, by whom; adopt-yes count; detail on click | DONE | `whats_new` cockpit-data.py:1498; `rWhatsNew` :320; class `WhatsNew` (:1393-1543); `whats-new.json` W46 checked 15 Nov 13:02 IST | Next check Monday 16 Nov before 12:00 IST |
| 49 | P-615 (5) | Three behaviour numbers from records: founder asks a day, rules-file changes a day, target changes a week | DONE | `founder_asks_dated` :712, `target_changes` :732; `rBehaviour` :583; tests `test_founder_asks_a_day`, `test_rules_changes_a_day`, `test_target_changes_a_week`. Accepted limits: a "31 Nov" typo is skipped and the next date read (`day_of` :690); asks whose STATE row names no day count as undated | Lead keeps a day in each STATE ask row |
| 50 | P-615 (5) | Parts merged out of all Release 1 parts ("of 196") | DONE | Pace line "parts merged N of M"; test `test_parts_merged_of_all_parts`. The checklist cites 199 parts, so the board shows "of 199" (lane report) | none |
| 51 | P-615 (5), desk 07 step 2 | Customer perspective: first firm named and dated, journey steps walked, counsel and expert items open, launch conditions done | PARTLY | Box built (`rBehaviour`, test `test_customer_box`). Counsel open 6 and launch 0/33 are measured. First firm and journey steps walked read "not measured: no record". `plan.json` has no `first_firm` | Add `first_firm {name, date}` to `plan.json` once the founder names one; define a record for journey steps walked |
| 52 | A86 (7) (15 Nov 13:5x IST), desk 07 step 2 table | Fill the balanced-scorecard gaps on the board | PARTLY | Built: parts merged, the Customer box, first-verdict Works share (row 46), What's new. Not built and not decided in P-615: started-not-finished count, lanes working vs allowed, Lead hand-overs a day, forecast hit rate, cost per proven capability, runway to first revenue | The Lead decides which of the rest to add (not adopted by P-615 (5)) |
| 53 | A86 (5) (15 Nov 13:5x IST), desk 07 "care about three things" | What the founder should care about most, on the board | PARTLY | Parts merged and proven sit side by side in the pace line. **His outside clocks** (AWS, DNS, Google and Microsoft reviews; STATE hand-over says "Put these in Needs you") are not in Needs you: STATE's waiting line says nothing waits on him, and Needs you reads that line | Put the outside-clock steps in STATE's waiting line so Needs you shows them |
| 54 | Founder, 15 Nov 15:22-15:27 IST (prompt log) | Confirm the board is updated with all agreed changes; make the board work on any account, automatically, without losing quality or speed; publish so he sees it | NOT BUILT | STATE "Start here" 15:3x: "Board v63 merged …; not published". The old page is on the old account; the new account has no artifacts | Publish v63 on the current account (new link or edit access, his choice) and record the link in STATE and the Library; long term, one durable link not tied to an account |
| 55 | Founder, 15 Nov 13:56 IST (prompt log) | Do not trust board data that may be stale | DONE | Health item 2 (page-computed data age, amber 45 min, red 2 h); per-source freshness (`trust.freshness`) | none |
| 56 | A61 (14 Nov 15:4x IST) | Board templates challenged repeatedly by the best reviewers | DONE | Spec draft 3 after desk 05 rounds 1 and 2 (`spec-a61-a62-2026-11-14.md` header); per-version Opus reviews | none |
| 57 | A77 (v57 hover tooltips) | Tooltips on hover, focus and tap | SUPERSEDED | Replaced by A84's click-only ⓘ (v61, row 45) | none |
| 58 | P-599 (24 Nov target) | Board plan shows all 101 by 24 Nov | SUPERSEDED | P-609 moved it to 29 Nov; P-614 kept 29 Nov; `plan.json` H1 = 2026-11-29 | none |
| 59 | P-596 spec §2 "Sizes: cut" | No sizes on the board (only 1 of 105 rows sized) | SUPERSEDED | A69/A70 brought sizes back, counted from BACKLOG row numbers per capability (row 28) | none |

## Known open items from the v63 lane report, checked

| Item | Checked | What to do |
|---|---|---|
| Maps 9, 38 and 40 behind in `MVP-CHECKLIST.md` | Confirmed (lines 35, 83, 85 say Shaped; PF-14 #1757 and FO-3 #1760 merged) | The Lead updates the status (row 11) |
| `first_firm` tile empty | Confirmed (`plan.json` has no `first_firm`) | Row 51 |
| Dependency ids with no dash (F1, B185) read differently by board and check | Not changed in v63; today's ready count agrees (93 vs 93) | A shared id rule in both scripts, with a test |
| "31 Nov" typo risk | Real: `day_of` skips an impossible date and reads the next one | A test with "31 Nov"; flag an impossible date as a records error rather than skip it |
| v63 not on `main`, not published | Confirmed (#1814 head d2d1d212c holds v62; v63 only on `lead/2026-11-07-lead31`) | Rows 34 and 54 |
