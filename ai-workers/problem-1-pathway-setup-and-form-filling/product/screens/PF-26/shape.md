# R1.34 — one person's data as an export, logged: the shape (P-526)

Builder: runtime lane, 25 Nov IST. Rows: PF-26 (BACKLOG L303), PF-26s (L997), CS-X1 (L1124). Requirement text only from
`trace-requirements.py --brief R1.34` and the source map: AG-2-93, SA-11-36, SA-11-40 (AG-2-49a rule 6 for the background job).

**Capability (qa/CAPABILITIES.md):** "A holder of the key exports one person's data from every module in one file; logged
with who and why; others refused."

**Duplicate check (25 Nov):** searched open PRs (API search: R1.34, PF-26, PF-26s, CS-X1, FO-26, "person export",
"data export"), `BACKLOG*.md`, `main`'s code (`data-export`, `PersonExport`, `person-export`) and `qa/BUGS.md`; no copy.
Found the open #3411 (PF-11, R1.22, the **firm's** whole data as one zip): a different capability (an Owner, the whole
firm), not a duplicate. Its body says "PF-26 imports" its zip package; R1.34's package is JSON (AG-2-93 rule 10, "JSON and
PDF, as built"), so no part here waits on #3411 (never build on an unmerged PR). If #3411 merges first, a module's
firm exporter and person exporter can share their table readers; that is a later tidy, not a dependency.

## Parts (one PR each, under 800 lines)
| Part | What a person gets | Touch | Proof (pass and fail each) |
|---|---|---|---|
| **1** (this PR) | nothing visible: the seam every module plugs into | new `ports/person-export.ts`, `ports/contracts/person-export-port.contract.ts`, `api/src/platform/person-export/registry.ts`, `api/src/features/platform-person-export.ts`, `tests/check_pf26_person_export_port.ts`, two `MODULE.rows/PF-26.md` | contract on fake and registry; exporterCases pass on a good module and catch a family member swept in, a deleted item dropped, an empty section left out; one failing exporter fails the whole build |
| **2** (migration) | the request, the job, the download, the log, the refusals (API) | migration: key `agent/data-export:request` (catalogue + Owner, Admin, Case Manager, per AG-2-93 §8), table `platform_person_export` (walled, PF-12); new `api/src/platform/person-export/{service,routes,visibility}.ts`, the job on PF-14's runner, the file through FilesPort; `tests/check_pf26_person_export.ts`; one `ADDED_BY_LATER_ROWS` line in `check_pf3_platform_schema.ts` | a Case Manager who sees the person exports and downloads; no key → 403; key but cannot see the person (view.own, another's prospects) → 404; a person with no lead, prospect or client file → only `view.all`; another staff member's download → 404; expired → 410; a failing module → FAILED, no file; audit lines hold who, the person's id, the reason, the time and the file hash, never content; firm A never exports firm B's person |
| **3a** | the front office's sales sections | new `api/src/front-office/person-export/sales.ts` + its registration line: person and channels, leads, prospects (closed and lost too), calls, notes (Recently deleted marked), duplicate flags, company links; merged records (FO-9b lineage) | exporterCases on a seeded firm pair; a merged record's rows in it; a deleted note marked |
| **3b** | the rest of the front office and the platform | `api/src/front-office/person-export/{consent,booking,retainers,signing,compliance}.ts`, platform messages and consent; the completeness test: every table with a person column is a section or on the excluded list with a reason (AG-2-93 rule 9) | exporterCases; a new table with a person column and no section fails the completeness test |
| **4** | the case side's and client money's sections (CS-X1) | new `api/src/case-export/exporter.ts`, `api/src/features/case-export.ts`, `api/src/client-money/person-export.ts`; `tests/check_csx1_export.ts` | two cases both in it; a spouse on the same case never; a removed answer marked; an infected file listed, not attached; invoices, payments, trust entries of the person only |
| **5** | the PDF beside the JSON (AG-2-93 rule 10) | the job renders through DocumentRenderPort; download picks `?format=pdf` | the PDF names every module's sections; a render failure fails the export (no half package) |
| **6** | the screen (PF-26s) and the journey | new `web/src/modules/front-office/person-export/`, one line in FO-4's record-screen "More" menu, `tests/check_pf26s_export_browser.ts`, `tests/journeys/j_34.ts`, the `walks.yml` line, `qa/built/R1.34.md`, `Completes: R1.34` | below |

Each part is complete on its own (unfinished work merges switched off: before part 6 no screen shows the action).

## Journey j_34 (by screens, 1440 px; the next capability's first step is the person's record again)
1. A Case Manager who can see Client B opens Client B's record (FO-4) and picks **More › Export personal data**.
2. The dialog names Client B, says the file holds every module's data about this one person and is logged, and asks **why**
   (required). Empty → "Say why you are exporting this person's data." Sent → the record shows "Preparing export…".
3. The job finishes: "Download (expires <date>)" for the requester only. The file holds the front office's, the case side's
   and client money's sections; a family member on the same case is not in it; a deleted note is marked.
4. The firm's activity log (AUD-4) shows who, Client B, why and when, apart from list exports.
5. Refusals: a Reception user (no key) sees no action and a direct call answers 403; a Case Manager with `view.own` who
   cannot see Client B gets 404; a second staff member opening the link gets 404; an expired link shows "This download
   has expired" with "Request again".
6. Keyboard only, axe-core clean, 375/1024/1440.

## Question for the tech lead (one, with my recommendation)
**"Logged with who and why":** AG-2-93 rule 7 audits the request, requester, person and time; the capability row adds
**why**. Recommendation: the request takes a required reason (1-300 characters, Sample wording), kept on the export row
and copied into the audit line (the requester's own words, like a support reason; the package's content never). Part 2
builds this unless the tech lead says otherwise.
