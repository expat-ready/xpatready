# Evidence: Release 1 case-side map rows 74, 76, 77, 80 (qa, 15 Nov 2026, main a31f52500)

Facts gathered by the qa lane for the fresh reader. Live AI off, US$0, no priced button.

## The rows (MVP checklist §A, lead branch `lead/2026-11-07-lead31`, 14 Nov 12:3x IST)
| Map | Capability | Checklist says |
|---|---|---|
| 74 | Government deadlines that remind; working days with holidays | built (map); no qa capability row · Merged |
| 76 | Notes; one timeline per record | built (map); no qa capability row · Merged |
| 77 | Submission number and UCI; decision, close, reopen | C8.2 Partial; BK-17, B5-filings · Merged |
| 80 | IRCC forms per applicant from one set of answers | C7.1, C7.8 Works; C7.2 Partial; BK-10, BK-16, BK-22 to BK-24 · Merged |

A row takes the status of its least advanced part (checklist and `qa/CAPABILITIES.md` R1 header).

## Duplicate check (P-526)
* Open records PR **#1792** (qa front-office lane, head c486b44d3, opened 15 Nov ~09:05 IST, not merged) already adds R1.74 (Partial, QA-471 Gap · Major) and R1.76 (Not built, QA-472 Gap · Major), and maps 77 → C8.2 + QA-474 (Gap · Major: decision, close, reopen not built) and 80 → C7.1, C7.8, C7.2 ("takes Partial").
* On `main` a31f52500 none of R1.74, R1.76, QA-471, QA-472, QA-474 exists yet.

## Code on main a31f52500 (read by qa)
* `engine/runtime/stages.ts:4-5`: "the deadline worked out on read (Sample, never a reminder)"; `:113-116` `deadlineOf`: "BR-8 … Sample everywhere … No filing item, no reminder, no Needs you." `DeadlineRule = { label, from_stage, field, add_days }`: calendar days only.
* Working-day and holiday code exists only in `api/src/platform/complaints/business-days.ts` (PF-21, Platform complaints), nothing on the case side.
* The one deadline in the data: `samples/routes.json` route `study_then_work`, stage `work`: "Apply for the work permit by" = study stage's `stage.permit_valid_until` + 0 days; labelled Sample, "not cited from canada.ca".
* Notes: the only note table is FO-1a's `FoNote` (`prisma/schema/front-office-sales.prisma:476-496`), for leads and prospects, with no route. No case-note model, route or screen. `GET /api/activity` (`api/src/main.ts:103`) gives a firm's staff their firm's audit lines (`api/src/case-feed.ts`); the Activity page (`web/src/pages/history.tsx`) is the only screen.
* Case status: `prisma/schema/cases.prisma` `status String @default("OPEN")`; no code on the case side sets another value (grep of `api/src`, `engine`, migrations). No decision, close or reopen route.
* Submission number and UCI: `engine/runtime/filing-record.ts` (application number per filing, UCI on the person), C8.2.

## Runs on GitHub's runners (P-339)
* **main's head a31f52500 has no nightly run.** Cloud lanes cannot dispatch (P-439); no Lead session reachable from this copy (ListAgents empty).
* **Nightly 43655888932** (schedule, attempt 2), head **e574b1bd8**, an ancestor of a31f52500. Overall "cancelled" (suites part 8 cancelled at the time limit). Every "works" job succeeded; job **132649598091** "Works packs C7.3, C4.11, C6.9, C6.16, **C7.8**, C9.2, C1.6, C3.4, C3.11, C3.16, C4.6, **C7.1**, C11.10, C11.15 … success"; job **132649632816** "Works packs C6.4, C7.6, C6.11, **C6.17**, … success"; suites parts 1-7 success. C8.2 and C7.2 (not Works rows) are not in that run.
* `git diff e574b1bd8 a31f52500` touches only platform and front-office code (`api/src/platform/**`, `api/src/front-office/**`, `api/src/features/{front-office-retainers,platform-consent}.ts`, `ports/`, three platform/FO migrations and their prisma files, `samples/fo5-starter-retainer.txt`) plus `tests/check_*` files: no `engine/`, `web/`, case-side `api/src` or `acceptance/` change.

## qa's own runs on main a31f52500 (P-290), fresh isolated copies, configured checkpoint loaded through Demo › Load the configured checkpoint
`packs-local.txt` (gate-b.mjs, GATE_B_DATA=checkpoint, 3 slots):
* C6.17.test.ts: exit 0, 47/47 · C8.2.test.ts: exit 0, 19/19 · C7.1-application-type.test.ts: exit 0, 12/12 · C7.8.test.ts: exit 0, 20/20 · **C7.2.test.ts: exit 0, 11/11** · "Gate B: passed."
* `C7.2-local-4475.txt`: C7.2 again on the walk's copy, 11/11; lines include "the upload reports the barcode check", "fail: a copy whose barcodes cannot be read … is never ready for filing", the six evidence lines from `studio/evidence/c7-2-adobe-validate/result.json` (committed by 371b90242 "evidence: BK-20 — Adobe Validate on the finished story's Paper IMM 5257 (C7.2 evidence, QA-165, QA-315)"): Validate "completed successfully", 5 barcodes decoded, slots 186/186, 0 unexplained.
* `qa/CAPABILITIES.md` C7.2 is still **Partial** (8 Nov, nightly 42480587588, 2/10), with **QA-165** (Gap · Major: Adobe proof; its row asks the tech lead to confirm) and **QA-315** (Bug · Major: last retest 13 Nov, pack 3/11 — "P-46 barcode check not reported; the never-ready step; the 6 evidence lines need the Mac's Adobe run") open in `qa/BUGS.md`. C8.2 is **Partial**, held by **QA-397** (Bug · Major, open). C7.1 and C7.8 are **Works**.
* BK-22, BK-23, BK-24 (parts of row 80) are "built, awaiting qa" (`qa/built/BK-22.md`, `BK-23.md`, `BK-24.md`); not scored by qa yet. BK-13 (Study permit by data reaches filled, read-back forms) is Works (14 Nov).

## Walk by screens (gate A, P-348 (3)) — `tests/qa/check_qa_r1_case_walk.cjs`, as the Case officer, configured checkpoint, port 4475
Outputs: `walk-1440.txt`, `walk-1024-run1.txt`, `walk-1024-run2.txt`, `walk-400.txt`; screenshots `walk/`.
* 1440: 16/16 PASS, 14 GAP · 1024: 16/16, 14 GAP (twice) · 400: 15/16 — FAIL "no sideways scroll at 400 px: family case, Ready to file" (page 697 px wide at 400; widest element the People and filings table, 496 px; the same table and cause as open **QA-413** (UX · Minor), which measured a Visitor visa case at 0 px on 12 Nov). Screenshot `walk/07-400-sideways-ready-to-file-400.png`.
* **74.** Open a case › With an LMIA (a later stage of the Sample route) › UCI 12345678, Study permit valid until **2027-07-01** (Canada Day, a Thursday holiday). The case page shows "Apply for the work permit by 1 Jul 2027 Sample" (`walk/02-74-deadline-line-*.png`); underneath `deadline = { due: "2027-07-01", sample: true, why: "The day study permit valid until (2027-07-01). Sample: not cited from canada.ca." }`. GAP: the date is not moved off the holiday; GAP: no reminder, task or "Needs you" line anywhere for it (page text and `prepare.tasks`).
* **76.** GAP: no note box or "Add a note" on the case page; no timeline on it; `GET /runtime/cases/:id/notes`, `/timeline`, `/activity` answer 404. Underneath, `GET /api/activity` as the Case officer holds the opening line "Case officer opened case aa59050a on …". **On screen, the Activity page tells the Case officer "This page is for the configuration people — Case officer (simulated) works on cases. … your work is in Cases." and lists nothing** (`walk/03-76-firm-activity-page-*.png`): case staff have no screen that shows a case's history.
* **77.** GAP: no decision, close or reopen control on the case page; `POST /runtime/cases/:id/decision`, `/close`, `/reopen` answer 404; the new case's status underneath is OPEN. (Submission number and UCI: C8.2's pack 19/19 above; not re-walked this round; C8.2's last walk 11 Nov, `qa/reports/2026-11-11-c116-c82-c411/walk.md`.)
* **80.** On the checkpoint's Sample family case (Visitor visa, 4 people, one household questionnaire "483 questions for this household"): Prepare application lists each person's own forms ("IMM 5257 for Client A (Sample)", "… for Partner (Sample)", "… for Child (Sample)", "… for Child 18 or over (Sample)"); underneath each form line belongs to that person's own filing (Client A: IMM 5476, 5707, 5257, 5257 SCH1; Partner: 4; Child (minor): IMM 5257 only; Child 18 or over: 4). "Generate a new copy" pressed by screens for Client A's and Partner's IMM 5257: audit lines "asked for a new copy of IMM 5257 for the principal applicant … (81 confirmed facts)", "… for the spouse or partner …", each "generated: 66 form fields written, read back 66/66, intact". Next capability's first step: **Ready to file (C7.6) opens and lists both IMM 5257 lines** (`walk/06-80-next-step-ready-to-file-*.png`). axe: 0 serious or critical; no page error; no sideways scroll at 1440 and 1024.
* Not walked: keyboard only, 200% zoom; the shared demo :4400 does not exist in this cloud copy.
