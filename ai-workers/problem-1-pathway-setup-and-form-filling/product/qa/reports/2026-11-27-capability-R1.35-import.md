# qa capability R1.35: Contacts import from a spreadsheet, 27 Nov 2026

**Run:** cloud qa (new account, first hour), Opus 5.5 medium (P-608, P-788), main **0c90a3cf6** (head at start, 06:2x IST). Live AI off, no model call, no live mail, US$0 (P-175). Isolated copies only (:4471, :4472, :4473); :4400 not touched.

## Verdict: **Works** (was Not built)
Every part on the checklist row has merged, and the Done-when holds by screens and underneath, on GitHub's runners on main's head and locally on fresh isolated copies.

## Parts (MVP-CHECKLIST row 35: PF-10a, PF-10b, PF-10t, PF-10s): all merged
| Part | PR | On main |
|---|---|---|
| PF-10a import tables | #3276 | 14e6d3783 |
| PF-10b part 1 (engine: CSV, mapping, dry-run preview with reasons, run once) | #3644 | f7c8d6956 |
| PF-10t people as an import target (merge fills empty fields, consent on the declaration, source, origin) | #3705 | 8e04e9d15 |
| PF-10s concept (records) | #3707 | 5dc399b78 |
| PF-10s screens (My account → Import, j_35) | #3824 | e0c16e907 |

PF-10b's backlog row is sized "2 PRs (dry run; run, report and undo)". Part 2 (undo, result report) is **not** merged, but nothing in R1.35's Done-when needs it (it needs preview, mapping, reasons, import once, source, consent). The builder's `qa/built/R1.35.md` names undo, the report, .xlsx, companies and leads, value mapping and the AG-18-13 warning as follow-up rows. Scored on the Done-when as written (P-606); see Question 1.

## Done-when, item by item (j_35 step → evidence)
| Done-when | Step | Seen |
|---|---|---|
| Preview | W4 | To create 2 · To merge 1 · Skip 1 · Errors 1; a column changed after the preview disables Import "The columns changed. Preview again before importing." until a fresh preview (BR-2) |
| Column mapping | W2, W3 | each column offered its field from the header; a field used by one column disabled in the others; consent column refused until the declaration is ticked; Owner attestation once |
| Each bad row's reason | W4 | "Email: is not an email address", in words, never the cell's value |
| Good rows imported once | W5 | "Done: 2 created, 1 merged, 1 skipped, 1 not imported."; database: 2 people added, the known person kept "Kim" and gained the phone in E.164 |
| A re-import adds no duplicate | W6 | same file: saved mapping offered, To create 0 · To merge 0, Import disabled "Nothing new to import.", no person added; engine DW5: a re-run adds no record; DW4: email case folded (B@Client.test merges with the known b@client.test) |
| Source set | W5 | created rows read "Imported from Old CRM"; origin `IMPORT`, sourceName "Old CRM", batch id |
| Consent set | W5 | one IMPORT_DECLARED marketing consent for the "yes" person, none for "no"; no lead, no message |
| Roles | W7 | Case Officer: no Import entry, page says no access, API 403 |
| Screens | W8 | 375, 1024, 1440 px: no sideways scroll, axe WCAG 2.2 A/AA clean, no page error |

## GitHub's runners on main's head (P-339)
* **walks.yml run 45919089701** (workflow_dispatch by this lane, ref main, head 0c90a3cf6), **job 140245465308 "walk j_35": 17 PASS, 0 FAIL**, exit 0; artifact `walk-j_35-0c90a3cf6e3729a0ff872aad1c087d961f27654c` (id 15164031038: video, 8 traces, step shots). Self-test jobs j_0_fails / j_0_throws behaved (failed on purpose, recording kept). Note: steps 11-16 logged "record: no screenshot … page closed" (W8's per-width pages close before the recorder's shot); the PASS lines and axe results stand; cosmetic for the recording only.
* Prior on #3824's own PR: j_35 17/17 and `check_pf10s_import_browser.ts` 16/16 → 21/21 after break round 1 (builder's record).

## Local, fresh isolated copies (P-339), main 0c90a3cf6
* `j_35.ts` on fresh `qa_r135` (:4471): **17/17**. On fresh `qa_r135b` (:4472): **17/17**.
* `check_pf10a_import_schema.ts` 82/82 · `check_pf10b_import_engine.ts` 46/46 · `check_pf10t_targets.ts` 26/26 · `check_pf10s_import_browser.ts` on fresh `qa_r135c` (:4473) **21/21** (keyboard only, Admin's Owner line, Case Officer).
* A second j_35 run **on the same copy** (:4471) gave 15/17: W1 expects the empty state (the first run's batch is there) and W3 expects the attestation prompt (given once per firm, by design). The app is right; the journey's header claims "Re-runnable on one copy". **QA-799** (Minor, scaffolding).

## Bugs
0 Blocker · 0 Critical · 0 Major · 1 Minor (new **QA-799**, j_35's re-runnable claim).

## Not tested this round
* Not walked headed in a browser pane by hand (cloud session, no pane); the recorded GitHub walk (video, traces) stands in (P-700).
* Not read on the shared demo :4400 (cloud copy; the demo is on the Mac).
* No c8 coverage run this round; no two-tab or concurrent Import click probe of my own (the engine's DW5 proves a resumed run writes each row once).
* Undo, the result report, .xlsx, companies and leads: not built (follow-up rows), not in the Done-when.

## Questions for the Lead
1. **PF-10b part 2 (undo, result report) is not merged.** R1.35's Done-when does not name undo, and the checklist row names PF-10b as one part. qa scored Works on the Done-when as written. If undo is part of R1.35's proof (AG-18-1 "mandatory dry run and an undo"), say so and the row goes back to "parts missing: PF-10b part 2".

## Suggestions
* j_35: make W1 and W3 accept a copy that already holds a batch and an attestation, or drop "Re-runnable on one copy" from its header (QA-799). *Later* · *Scaffolding*.
* walk.mjs: take W8's per-width screenshot before the page closes. *Later* · *Scaffolding*.
