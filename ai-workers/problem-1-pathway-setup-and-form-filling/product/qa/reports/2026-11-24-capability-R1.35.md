# qa capability R1.35: contacts import from a spreadsheet (24 Nov)

**Run:** `/qa capability R1.35`, qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. Live AI off, US$0. Tested on main 3af5fc4b0, after #3276 (PF-10a) merged as 14e6d3783.

**Verdict: Not built for a person (unchanged). Parts are missing, so there is no verdict (P-606).**

## Evidence
| What | Where | Result |
|---|---|---|
| `check_pf10a_import_schema.ts` (#3276's own check) | `run-suites.sh --only`, main 3af5fc4b0 | 82 passed, 0 failed |
| Routes, engine, screens | `api/src`, `ports/`, `web/src` on main | none: no `ImportTargetPort`, no import route, no Settings › Import page |
| Journey | none exists (no j_35) | nothing a person can walk |

## What is on main (PF-10a)
PF-10a adds four tables: `plat_import_batch`, `plat_import_row`, `plat_import_mapping` and `plat_import_attestation`. They are firm-scoped behind PF-12's walls. Reasons are stored as `{field, rule}` names only, and attestations are insert-only and Owner only. These hold the Done when's data shape (each bad row's reason; good rows once; source and consent) but nobody can use them yet.

## Done when, clause by clause
| Clause | On main? | Waits on |
|---|---|---|
| Preview (dry run) | no | PF-10b (engine), PF-10s (screen) |
| Column mapping | table only (`plat_import_mapping`) | PF-10b, PF-10s |
| Each bad row's reason | table only (`plat_import_row` reasons) | PF-10b, PF-10t |
| Good rows imported once; a re-import adds no duplicate | no | PF-10b (natural key, merge fills only empty fields), PF-10t |
| With source and consent set | no | PF-10t |

## Parts missing
* **PF-10b:** the import engine, with its mandatory dry run and its undo.
* **PF-10t:** people, companies and leads as import targets.
* **PF-10s:** Settings › Import.

None of the three has a PR open.

## Questions for the Lead
1. Are PF-10b, PF-10t and PF-10s on lanes? PF-10b's breaker left four Minors for it, R3-F1 to R3-F4 (`3f7be23cf`).
2. Question 7 (the .xlsx library through STANDARDS §1) is still open. It blocks PF-10b's XLSX half.

## Suggestions
* *Needed for the proof, Scaffolding:* write j_35 before PF-10b merges, as was done for j_58 and j_86, so the row can be walked within the hour of its last part.
