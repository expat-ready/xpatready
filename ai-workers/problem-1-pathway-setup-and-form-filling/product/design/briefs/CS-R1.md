# Brief: CS-R1, case metrics registered through PF-R1's `MetricRegistry` (map row 79; reports, API only; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 04:0x IST by the case-side shaping lane from BACKLOG row CS-R1 (line 843, batch 5 consolidated: Lead 52's ruling via Lead B (4)), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818, approved, not merged). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: medium (read-only numbers behind PF-R1's own scope check; no schema, no new door; reviewer at high effort for the scope rule). **Three parts, three PRs** (the row says 2; part 3 waits on data that no row yet makes).

**Ready when:**
* **Part 1** after all of these are on `main`:
  * PF-R1 (`ports/metrics.ts`, the query route, the `agent/report:*` keys);
  * CS-C1a (#1818: `closedAt`, `status` CLOSED);
  * CS-C1b (`api/src/case-count.ts`, the client-type reader this row reuses);
  * CS-K3 (`api/src/case-access.ts` `caseScope`, the one own-versus-all check);
  * CS-W1, and CS-W2's `cases`, `review` and `evidence` PRs (`firm_id` indexed on every table read; today's keys start with `workspace_id`, so a firm-only filter cannot use them).
* **Part 2** after part 1.
* **Part 3** after a configurator row adds a target to the stage definitions (ruled below; no BACKLOG row adds it yet).

**Points the release Lead confirms in the approval (the requirement or `main` corrects the row):**
* **The client type is not `Combination.clientType`.** That column does not exist. The type is the PATHWAY node's `program_def.client_type` (`pathways.prisma:37`), as Lead 60 ruled on #1818 (ruling 4) and as CS-C1b's reader does. Use that reader, not a second one.
* **The shape lives once, in PF-R1's `ports/metrics.ts`.** Batch 5 makes CS-R1's `MetricDefinition` PF-R1's zod type. The row's `contracts/metrics.ts` would be a second home, so the definitions are data in `api/src/reports/definitions.ts`, typed by the port.
  * Ports on `main` are flat, so PF-R1's `ports/fakes/metrics.fake.ts` is read as the fake inside `ports/metrics.ts`.
  * **The scope comes from PF-R1:** `read(ctx, filters)` gets `ctx.scope` (`own | all`), worked out by PF-R1 from `agent/report:view.own` and `view.all` (AG-14-19@d3d2dea2). This row never reads keys or the request for scope. Under `own` it narrows with CS-K3's `caseScope`.
* **"Deficiency" in AG-14-12 means document deficiencies, not review findings.** AG-14 §3 (`AG-14-reporting-and-analytics_v1.14_2026-10-25.md:231`) says "count and rate of **document deficiencies** raised, time-to-cure". The row's "open review findings … as the deficiency count (Sample definition)" is a different fact. Both are built:
  * **document deficiencies** = checklist lines `rejected` (`case-checklist.ts:303` state) for count and rate;
  * **open review findings** (`ReviewFinding`) under their own name.

  **Ruled (Lead 61, comment 6900882993 on #1876, item 7): time-to-cure is read from the audit trail; no new history table.** A line's state changes in place (`checklist_line.state`, `version`), but `case-checklist.ts` writes one audit line per state change with the line's id (`:198`, entity "checklist line", the state's words) and one "received" line on an upload (`:306`). Time-to-cure is the span from a "rejected" line to the next "received" line for the same line id. The firm comes through the line's case (`audit_event` has no firm column until AUD-1a).
* **Rules the row leaves out or defers.** Per Lead 61's ruling (comment 6900282370 on #1867), they are sequenced as later parts, not dropped:
  * AG-14-12's **processing time** (end to end, per segment, with cohort comparison): part 2;
  * AG-14-12's **SLA breaches** and AG-14-11's **on-time %** and **breach list**: part 3. They need a target per stage, which `main` lacks; `CaseStage.spec.deadline` is a Sample government deadline (P-412 F13 (b)), not a firm service level. **Ruled (Lead 61, comment 6900882993 on #1876, item 8): stage targets live in the configurator's stage definitions.** This is confirmed against the snapshot's owning text: the delivery stages "are the per-program `StagePipeline` published in the Country Pack (Doc 1 §5.13.4; the Reporter reads them, does not define them)", and on-time means "within their `deadlineOffsetDays`/SLA target" (`05-Doc-3-Agent-Console.md:6681`). `main`'s stage definitions carry no target (`git grep deadlineOffsetDays` is empty). Part 3 waits on a configurator row that adds one, and **the Lead names or adds that row**.
  * AG-14-9's **office** and **service** groupings: **ruled (same comment, item 8): they live in platform settings.** This is confirmed: offices are a firm setting under `agent/settings:edit` (`SA-06-rbac_v3.15_2026-10-25.md:1061`; AG01-10, offices hidden until a second one), and services are the one Settings → Services list (MS-D18, `SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:79`, Home AG-16). `api/src/platform/settings.ts` on `main` registers neither, and a case has no office or service field. The PR names both as missing; they join part 3 when a platform row registers them and the case gains the link.
* **Ruled (Lead 61, comment 6900882993 on #1876, item 9): "overdue tasks by person" is PF-29's number.** Batch 5 moved tasks to PF-29a's `plat_task` (CS-T1's brief: no schema in any part), and AG-13-68@e3e4feb7 also lists AG-10's Waiting-on-us threads. PF-29's tasks module registers it, PF-R3 already names the list, and it leaves this row.
* **Live reads, not rollups.** This departs from AG-14-3@7d18fdc4. It is ruled in PF-R1 (Q8, Lead B), and each read must pass STANDARDS §9's budget on 100 Sample firms (P-562), as PF-R1's budget test runs it.
* **No money metric here** (FO-7r and PF-R2cm).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-R1` and take **one part of row CS-R1** end to end on a fresh branch from `origin/main`, one PR per part.

**The row:** `product/BACKLOG.md` row **CS-R1**, read with the points above. Requirement text (cite these, read only this text):
* **AG-14-4@c3e8fcae**: metrics are `MetricDefinition` data, not controller code;
* **AG-14-9@cdb7cf2a**: case load by status, stage, program, office and officer, plus new versus closed;
* **AG-14-10@844f30a8**: stage durations, average and median, slowest flagged;
* **AG-14-11@9c7c2ce3**: on-time % and breach list;
* **AG-14-12@fdd888ac**: deficiency count, rate and time-to-cure, SLA breaches, processing time with cohorts;
* **AG-14-33@dee714d3**: an Individual / Corporate split on every number;
* **AG-14-22@84db3dd1**: every figure drills through to its list;
* AG-14 §3 `:230-231` (what "on-time" and "deficiency" mean);
* decisions **P-584 (2)** (the registration pattern), **P-562** (about 100 firms), **P-588 (2)**; Lead ruling 6 (first numbers as `main`'s data supports them).

**Read only these:**
* `ports/metrics.ts` (PF-R1's) and `api/src/platform/reports/*.ts` (how `read` is called and the budget test);
* `api/src/case-access.ts` (CS-K3);
* CS-C1b's client-type reader (`api/src/case-count.ts`);
* `prisma/schema/cases.prisma` (`Case`, `CaseStage`, `CaseTeamMember`), `review.prisma` (`ReviewFinding`), `evidence.prisma` (`ChecklistLine`, `CaseDocument`, `DocumentReview`), `pathways.prisma` (`program_def.client_type`);
* `api/src/case-checklist.ts` (the line states and the audit lines it writes);
* `api/src/features/platform-complaints.ts` (run-once registration);
* `api/src/MODULE.cases.md`.

**Each metric (all parts):**
* One file under `api/src/reports/` exports one `MetricDefinition` (typed by the port): key `case.<name>`, module `case-side`, label, kind `COUNT | PERCENT | LIST`, `scopeAware: true`, a drill target (the case list or the case, with the same filter), and a definition **in words** ("Open cases, by their current stage. A closed case is not counted.").
* Its `read(ctx, filters)` is one SQL query (Prisma `$queryRaw` with parameters, or `groupBy`).
  * It filters by `ctx.firmId` (the platform firm, on `firm_id` after CS-W1 and CS-W2), by `caseScope` under `own`, and by PF-R1's filters: date range, person (the officer), and client type `INDIVIDUAL | CORPORATE` from the PATHWAY node.
  * It returns `{ rows, total }` with **0 for no data, never an error**.
  * **Every number carries the client-type split** (AG-14-33).
* Registered once at start by new `api/src/features/case-reports.ts` (`MetricRegistry.register`, run-once).

## Part 1 (CS-R1a): case load, new versus closed, stage durations, documents waiting (expected ~600 lines)
* `case.load`: open cases by current stage, combination (its program name), officer (current `OFFICER` team rows) and status.
* `case.new_vs_closed`: per calendar month, opened (`createdAt`) and closed (`closedAt`, CS-C1a). Months are in the firm's zone (PF-3's setting), never UTC by accident.
* `case.stage_durations`: per stage key, average and median of `endedAt - startedAt` over ended stages in the range (`percentile_cont(0.5)`), with the slowest flagged; open stages are not counted (stated in words).
* `case.documents_waiting`: current documents with no `DocumentReview.confirmedAt`, with count and oldest wait in days. The row names it with no source id, so the PR says "the row's own number, Lead ruling 6".
* **Named test cases** (P-606), file `tests/check_csr1_reports.ts`, a pass and a fail each:
  * **CS-R1 DW1:** a seeded firm (fixed fixture: 7 open cases over 3 stages, 2 closed this month, 1 last month) returns the exact counts per stage, officer, status and month.
  * **CS-R1 DW2:** a second firm's identical fixture never changes firm A's numbers, and firm A's query never reads firm B's rows (the walls' cross-firm test, PF-12's pattern).
  * **CS-R1 DW3:** a `view.own` ctx counts only the cases whose current team holds the viewer (`caseScope`); a `view.all` ctx counts the firm; a scope field sent in the filters is ignored (PF-R1's route; this read never sees it).
  * **CS-R1 DW4:** an empty firm returns 0 and empty rows, never a throw, for every metric; a firm whose only cases are closed returns 0 open cases (never the closed count) on `case.load`.
  * **CS-R1 DW5:** stage durations on fixed dates give the hand-computed average and median, the slowest is flagged, and an open stage is left out.
  * **CS-R1 DW6:** a CORPORATE-pathway case counts under Corporate and a family case under Individual, and the client-type filter narrows every number.
  * **CS-R1 DW7:** small fixtures make the planner prefer a sequential scan, so the test runs each read's `EXPLAIN` under `SET LOCAL enable_seqscan = off` and requires an index scan on the firm column. It also checks in `pg_indexes` that a firm-first index exists on every table the read touches. Each read passes PF-R1's budget test on 100 Sample firms; a throwaway read on a column with no index fails.
  * **CS-R1 DW8:** each metric returns its definition in words, and its drill target opens the list with the same filter; a target followed without `agent/case:view.all` re-checks and narrows (PF-R1 (5)).
* **Touch (part 1, nothing else):** new `api/src/reports/definitions.ts`, new `api/src/reports/case-load.ts`, `new-vs-closed.ts`, `stage-durations.ts`, `documents-waiting.ts`, new `api/src/features/case-reports.ts`, new `tests/check_csr1_reports.ts`, `api/src/MODULE.cases.md` (paths gain `reports/*`; the metrics under Entry points).

## Part 2 (CS-R1b): deficiencies, findings and processing time (expected ~450 lines)
* `case.document_deficiencies`: lines `rejected` by stage and officer. The rate is rejected lines over lines with a document. Time-to-cure (from "rejected" to the next "received" for the same line, read from the audit trail as ruled) is given as average and median.
* `case.review_findings_open`: open `ReviewFinding` by stage and officer, named as findings, not deficiencies; time to resolve from `createdAt` to `resolvedAt`.
* `case.processing_time`: end to end (`createdAt` → `closedAt`) and per stage, by the month opened (the cohort), with average and median.
* **Named test cases** (same file), a pass and a fail each:
  * **CS-R1 DW9:** the hand-computed deficiency count, rate and time-to-cure (from fixture audit lines) on a fixture; a line rejected and never re-received is counted with no cure time, not as 0.
  * **CS-R1 DW10:** findings count only `open` and give the hand-computed time to resolve.
  * **CS-R1 DW11:** cohorts by opened month give the hand-computed end-to-end median, and a reopened case counts once, from first open to last close.
  * **CS-R1 DW12:** cross-firm, `own` scope and the budget, as DW2, DW3 and DW7, for the three numbers.
* **Touch (part 2):** new `api/src/reports/document-deficiencies.ts`, `review-findings.ts`, `processing-time.ts`, `api/src/features/case-reports.ts` (three lines), `tests/check_csr1_reports.ts`.

## Part 3 (CS-R1c): on-time % and breaches (after the stage-target row)
* `case.on_time` (share of stages ended within their target), `case.breaches` (LIST: the stage, case, officer and days over), SLA breaches by stage and officer.
* Named cases **CS-R1 DW13** (hand-computed on-time share; a stage with no target is left out and stated) and **DW14** (the breach list drills to the case; a `view.own` viewer sees only their own).
* Touch: two new files under `api/src/reports/`, the feature file and the test file.

**Done when:** `tsx studio/tests/check_csr1_reports.ts` exits 0, with each DW case of the part passing and failing as named. These must pass unchanged: PF-R1's `check_pfr1_reports.ts` (its budget test with these metrics registered), `check_csk3_summary.ts`, `check_csc1_close.ts`, `check_case_feed.ts` and every case suite. The module-card check passes and full `ci` is green on the head.

**Duplicate check:** BACKLOG (PF-R1 is the one door; PF-R2fo and PF-R2cm register theirs; PF-R3 is the screen and folds in CS-R2; PF-29 holds tasks), open PRs (`metrics`, `MetricRegistry`, `reports`), `git grep -n "MetricRegistry\|MetricDefinition\|reports/" api/src ports web/src` on `main` (empty); no dashboard or report code on `main`; one `Duplicate check:` line.

**Parallel safety:**
* New files only, plus `api/src/MODULE.cases.md` (one paragraph; merge `main` on a conflict).
* No schema, so the row holds no baton. If DW7 shows a missing index, stop and ask: the index goes in that area's CS-W2 PR or a one-line migration by its holder, never here silently.
* `runtime.ts`, `core.ts`, `case-feed.ts` and `ports/` are untouched.
* PF-R2fo and PF-R2cm register in their own folders, so they do not overlap with this row.

**Contract gap (for the PR body):**
* `MetricRegistry` is not on `main` and in neither contract's ports list.
* PF-R1 names `read(ctx, filters)` without naming `ctx`'s fields: this brief needs `firmId`, `scope` and the viewer's staff and actor id for `caseScope`.
* The drill-through filters the case list must accept (stage, officer, client type, month) are not routes on `main`: the PR lists which exist.
* The stage target in the configurator's stage definitions (part 3) is not shaped by any row; nor are offices or services in platform settings.

**Reviewer and breaker** (P-278: no breaker, as no schema, money, permission key or screen; the reviewer checks the scope rule at high effort). The reviewer tries:
* a `view.own` viewer who has just been taken off a case;
* a reopened case in the new-versus-closed months;
* a stage that started before the date range and ended inside it (stated rule in words);
* firm B's rows with the same stage keys.

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556). Re-review reads only the diff since the last Approve (P-277, P-610).
---
