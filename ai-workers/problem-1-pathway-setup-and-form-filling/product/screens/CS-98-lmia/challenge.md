# CS-98 LMIA screens (CS-98s1 + CS-98s2): fresh challenge of concept r1

Challenger: a fresh agent that did not draft the concept (skill `screen-concept` §B), 22 Nov. Read: `concept.md` (89 lines), `design/layout.html` (11 boards), briefs CS-98s1, CS-98s2, CS-98b, CS-98c, CS-98d, CS-98e (CS-98r skimmed for the Sample rule), the requirement text from `tools/trace-requirements.py --brief` for CS-98s1, CS-98s2, CS-98b and CS-98c, `EXPERIENCE.md` (§2-§6), `STANDARDS.md` §2-§6, `design/TEAM-PATTERNS.md`, `QUALITY.md`, `PRODUCT.md`, `domain/TAXONOMY.md` §4, and on `main` 841ea6588: `web/src/modules/front-office/sales/pipeline-page.tsx`, `web/src/modules/README.md`, `web/src/App.tsx`, `web/src/runtime/clients.tsx`.
**Not available:** `ai-workers/tools/freshness.sh` does not run in this cloud copy (it stops with `FileNotFoundError: code/README-copies.md`; `code/` and `sources/` are absent), so the team's code and the team's style guide are **Unverified** here. canada.ca is not reachable: every LMIA value is Sample by P-801 (known, not an objection by itself). No CS-98a..e or CS-K3 code is on `main` (`api/src/case-delivery/` and `api/src/case-access.ts` do not exist), so every API point below is checked against the briefs only.

## Verdict
**Build after these changes.** The structure is right (board + List twin, wizard, Workspace file page with task-list steps, drawers, Sample marker, panels on the client screen), but two points contradict the contract: the file page designs a "stream to confirm" state that CS-98b's ruling makes impossible, and the file's steps, step statuses and What's next have no server read in any brief. Fourteen Majors are gaps or mismatches that r2 can close without changing the layout's shape. r2 must stay under 100 lines.

## Objections
Facts are marked **Fact** (with evidence); judgment is marked **Judgment** (with confidence). Each says *Needed for the proof* or *Not built*.

### Blockers
**B1. The stream is confirmed in the wizard, yet the file page still asks to confirm it.** *Needed for the proof.*
* **What breaks.** CS-98b's ruling: "The stream is confirmed before the file exists, not after … 'Open an LMIA file' then takes the job details **and the confirmed stream** in one call" (`design/briefs/CS-98b.md:6`). No CS-98b route confirms a stream on an open file. After opening, the only stream change is Change stream: it closes the file and opens a linked new one (CS-98b part 2, `:41-47`). The concept draws a state that cannot exist and an action with no API.
* **Example.** Wizard step 3 confirms High-wage and opens L-0042 (`layout.html:131-137`). L-0042's Set-up then shows "Stream: High-wage, proposed — confirm", What's next says "Confirm the stream … the file binds to a stream only once you confirm it", and the Stream panel's primary button is "Confirm High-wage" (`layout.html:144,153,157`). The board card says "Stream to confirm" (`:84`) and the List says "Proposed: High-wage" (`:115`).
* **Evidence.** Fact: `concept.md:28` (BR-7 "bound only when staff confirm"), `:43` ("primary 'Confirm High-wage' until confirmed"), `:60` (board shape `stream: {key, confirmed}`), `:61` (`stream: { proposed, confirmed, … }`). The s1 brief's "stream proposal and confirm with reason" (`CS-98s1.md:48`) is met by the wizard.
* **Fix.**
  * Remove the unconfirmed state everywhere: card chip, List cell, header chip, the What's next item, the "Confirm High-wage" button, and `confirmed` in both shapes.
  * Set-up's Stream panel becomes read-only: stream, the threshold with "Sample" or its source and date, and the recorded reason when the stream differs from the proposal.
  * "Choose another stream" (`layout.html:158`) becomes "Change stream", before submission only. Either draw its confirmation (it closes this file as "Stream changed", opens a linked file, the count is unchanged, advertising is not counted; AG-17-13) or mark it "Built after CS-98b part 2". It is not in the s1 brief's touch list, so the second is the in-scope choice.

**B2. No server read gives the file's steps, step statuses, items or What's next.** *Needed for the proof.*
* **What breaks.** AG-17-15 shows a step only when it has an item. AG-17-17's status needs every item and its done, waived or N/A state. AG-17-19 orders What's next by viewer, then employer, then others, then due date, then step. No brief defines the file's items or a route that returns them. CS-98b exports only the current step (`CS-98b.md:39`). CS-98c/d/e return their own records. CS-98s1 part 2's touch list has web files only (`CS-98s1.md:62`). The builder must therefore either compute statuses and the What's next order in the browser, which breaks the concept's own rule ("The server decides; the screen shows", `concept.md:20`) and STANDARDS §5 "one request per screen view", or widen the row silently.
* **Example.** CS-98s1 DW4 ("a step with no items is not shown; a step whose items are all done or waived with a reason reads 'done'") has no defined input. Is a passed CRITICAL an item? Is the latest-submission date an item?
* **Evidence.** Fact: `concept.md:61` ("The file page reads, one per step, CS-98b/c/d/e's replies, together giving `{ header, steps, currentStep, whatsNext … }`"); no route is named for `steps` or `whatsNext`.
* **Fix.** Name the gap in §6 and put it to the tech lead as a question. Recommended: one read `GET /api/runtime/cases/:id/corporate/summary` → `{ header, steps: [{step, label, status, items}], currentStep, whatsNext }`, built from CS-98b's step function, CS-98c's warnings and dated items, and CS-98d/e's records. It is added to CS-98s1 part 2's touch list (`api/src/case-delivery/corporate/summary.ts`, one route line) or to CS-98b part 1. The item list per step is defined there, as data. Until that ruling, CS-98s1 part 2 is not ready.

### Majors
**M1. The wizard cannot make a valid open call.** *Needed for the proof.*
* **What breaks.** CS-98b's open needs fields that the wizard lacks:
  * the prevailing wage and its source, as a required field when the table has none (AG-17-10; CS-98b DW4: "the open is refused as a required field (400, field named)");
  * the two workforce figures, total employees and low-wage employees at the location, labelled "Sample: until the questionnaire exists" (`CS-98b.md:11`, Lead 61).
  Board 3 also draws only occupation, wage and hours (`layout.html:122-127`). Duties, overtime rule, start date and duration (AG-17-7) are listed in the text (`concept.md:42`) but not drawn.
* **Example.** A Sample occupation with no prevailing wage in the table: the drawn wizard has nowhere to type it, and the open returns 400.
* **Fix.**
  * Add a conditional "Prevailing wage and its source" to step 2, shown only when the release holds none, with "Asked because the table has no prevailing wage for this occupation and region" (BIC-02).
  * Add the two workforce figures, each marked "Sample: until the questionnaire exists", shown only for streams the cap applies to.
  * Draw the remaining AG-17-7 fields.

**M2. A company client with no work location is a dead end.** *Needed for the proof.*
* **What breaks.** The wizard takes the location "from its locations" and says "'Add a location' is the client's" (`concept.md:42`). No client-screen row adds locations. CS-98b builds the add-location route with the same-location offer (`CS-98b.md:33`, AG-17-3), and the s1 brief puts "location (with the same-location offer)" in Set-up (`CS-98s1.md:48`).
* **Example.** A newly won company client has no locations: "Open an LMIA file" stops at step 1.
* **Fix.** Put "Add a location" in wizard step 1: address and region codes picked from the pack list, the server's "This employer already has this location. Use it?" [Use it] [Add as new], and the new location chosen on return. Draw it on board 3.

**M3. The duplicate warning does not match CS-98b's file check, and its route is unnamed.** *Needed for the proof.*
* **What breaks.** AG-17-95 as ruled in CS-98b (`:9`) has distinct answers:
  * unsubmitted match → "Add positions to it, or open a separate file anyway" (two choices; "open a separate file" is audited);
  * submitted → information only;
  * approved with unfilled positions → the count and the date;
  * different stream → points to Change stream;
  * a match the user can't open → "A matching LMIA file exists that you can't open. Ask a manager."
  The concept's one copy, "Open L-0031, or continue to open a new file" (`concept.md:56`, `layout.html:135`), loses the "Add positions" path, the audited choice and the not-visible case (which would otherwise leak L-0031's owner and step). The file check is CS-98b **part 2**, while CS-98s1 part 1/2 wait only on part 1 (`concept.md:83`). No route for calling it before the open is named.
* **Fix.**
  * Draw the five answers.
  * Name the route, or state that the open call answers the check and a second call with `openSeparate: true` proceeds.
  * Add CS-98b part 2 to the wizard's "waits on", or mark the duplicate step "after CS-98b part 2".

**M4. The consistency check is missing from the Recruitment step.** *Needed for the proof.*
* **What breaks.** The s1 brief's Recruitment list includes "consistency" (`CS-98s1.md:49`). That is AG-17-32 and CS-98c part 2: each ad and the job offer pre-filled from the job details, a CRITICAL for each wage, hours or location difference naming the field and the document, and one `dutiesMatch` tick per ad or offer (`CS-98c.md:48`). The concept and board 5 have no panel for it.
* **Fix.** Add a "Job ads and offer" panel to board 5: one row per ad and the offer, pre-filled fields with the differing one flagged, a `dutiesMatch` yes/no, and the CRITICAL naming field and document. Add one line to §3 and one test (wage differs → CRITICAL; same wage → none).

**M5. "Back to automatic" has no API.** *Needed for the proof.*
* **What breaks.** AG-17-55 requires "Back to automatic". CS-98b's override refuses every backwards placement with 409 (`CS-98b.md:39`), and its DW14 tests only forward, backwards and auto-clear. A manual clear is a backwards move from the placed step, so on the drawn contract the button returns 409.
* **Example.** The Harbour card's "Back to automatic" (`layout.html:96`) is refused.
* **Fix.** Name the call (for example `DELETE …/corporate/step-override`, allowed before submission, audited) as a question to the tech lead for CS-98b part 1. Add a pass/fail line to the concept's board test.

**M6. The file page draws a step with no items, against AG-17-15 and DW4.** *Needed for the proof.*
* **What breaks.** Boards 4 and 5 list "Preparation & quality check · Not started" (`layout.html:149`, `:177`), but no row builds its items (`CS-98s1.md:24`), so it has none. AG-17-15 and CS-98s1 DW4 say such a step is not shown. The concept also says the not-built steps are marked "Built in CS-98s3" (`concept.md:43`), which shows them anyway. The Lead 61 ruling and AG-17-15 need reconciling.
* **Fix.**
  * On the **board**, keep all nine columns (AG-17-55 forbids removing steps) and put "Built in CS-98s3" on the four empty columns' headers.
  * On the **file**, hide steps with no items, as BR-5 says. Remove the "Preparation & quality check" line from boards 4, 5 and 9.

**M7. The List does not show the same data as the board (AG-17-54).** *Needed for the proof.*
* **What breaks.** "A list view SHALL show the same data". Board 2's columns (`layout.html:112`) leave out:
  * positions approved;
  * the Submitted waiting-on chips: the Prairie row shows only "officer request", not "Fee paid · Awaiting decision";
  * the "Placed manually" mark with "Back to automatic", and "Move to step".
  The concept calls the List "the keyboard and screen-reader route" (`concept.md:41`), so a screen-reader user there cannot see or undo a manual placement.
* **Fix.** Add a "Positions" cell reading "4 requested · 3 approved", a "Waiting on" cell with the chips, and a row action menu: Move to step and Back to automatic, only before submission.

**M8. Submit has no entry point and no form (AG-17-36).** *Needed for the proof.*
* **What breaks.** CS-98s2 builds "submit with the sign-off confirmation" (`CS-98s2.md:35`). AG-17-36 records the date, the application number, the submitted application copy (uploaded, never re-typed), other documents and the submitter. Board 9 draws only the 409 confirm dialog and a file already submitted (`layout.html:226`, `:241`). No board shows where "Submit" lives before submission (Recruitment? the header?) or its drawer. Preparation & quality check is not built, so the button needs a home.
* **Fix.** Draw a "Record the submission" drawer: date, application number with "Sample label", upload of the submitted copy, other documents, submitter defaulted to the viewer. Name its place: the Recruitment step's footer panel, or the header until CS-98s3 builds Preparation. Its primary is "Record the submission".

**M9. "Create work permit case" lacks the Individual combination choice.** *Needed for the proof.*
* **What breaks.** CS-98e opens the worker case "on the chosen Individual combination" (`CS-98e.md:41`). The concept and board 10 go straight from the button to the worker's case (`concept.md:36`, `layout.html:249`). There is nothing to choose, nothing confirming what moves, and no way to see that it counts as one individual case (BR-14) or may hit the plan limit (409 `PLAN_LIMIT_REACHED`).
* **Fix.** Draw a side panel: combination picker (Individual › Work permits › Employer-specific › With an LMIA pre-chosen; TAXONOMY row 4), the facts that will be copied, "Will be created as: a work permit case for Worker B", and primary "Create the work permit case". Draw the 409 and plan-limit answers in place.

**M10. Seven drawers are named but not drawn, and the decision drawer is incomplete.** *Needed for the proof.*
* **What breaks.** §4 and the briefs need these drawers, which the boards don't draw:
  * record a candidate, with the server's same-name offer "<Name> is already logged … Same person?" (AG-17-26; part of W1);
  * edit job;
  * add position;
  * Withdraw: date, reason, optional letter, and an in-page confirmation (EXPERIENCE §2.8). AG-17-89 says "at any time before the decision, **including before submission**", but the concept places Withdraw under "(s2) Submitted" (`concept.md:43`);
  * record an officer contact, with its respond-by date and the task it creates;
  * assign a worker (an existing or new person; AG-17-43);
  * Re-apply, with the optional "Copy from a previous LMIA" and the link.
  The decision drawer (`layout.html:233-240`) has no decision-letter upload (AG-17-39) and no Refused path with its optional root cause and note (AG-17-41). Only Waive and Log a channel are drawn (`:199-201`).
* **Fix.** Draw each as a Side panel with its fields, server errors and primary. Withdraw goes in the header on every step before the decision. A builder who invents these is deviating silently.

**M11. Unlabelled Sample-derived LMIA values on boards 1, 2 and 5 (P-801, AGENTS rule 4).** *Needed for the proof.*
* **What breaks.** Each value below comes from a Sample advertising minimum, window or residence-status flag, but carries no "Sample" marker. CS-98c says "While the stream's advertising row is Sample, both dates are shown marked 'Sample'" (`CS-98c.md:18`).
  * "Running · day 10 of 28" and "day 17 of 28" in the channel rows (`layout.html:182-183`). Only the clock strip carries "Sample minimum".
  * "Earliest recruitment complete: 4 Dec 2026" (`:179-180`). Only the latest date is marked.
  * The card and List "4 Dec · advertising minimum met" (`:93`, `:114`).
  * "Expired before submission" (`:184`), which comes from the Sample window.
  * "Candidate C and Candidate D are Canadian citizens or permanent residents" as the reason a rejection reason is needed (`:187`). This states the residence-status flag as fact (AG-17-27: CS-98r's list flag). The Residence status values carry no "Sample list" marker, though Kind and Occupation do.
* **Fix.** Put "Sample" on every value worked out from a Sample row, in the rows, the card and the List as well as the strip. Mark the residence-status list "Sample list". Word the candidate warning from the flag: "2 candidates whose residence status needs a rejection reason (Sample list) have none". Add a test line: no LMIA number or derived date is visible without "Sample" while its row is Sample.

**M12. The prevailing-wage rule is stated backwards.** *Needed for the proof.*
* **What breaks.** BR-8 says "prevailing wage below the job's wage … [is] CRITICAL" (`concept.md:29`), and board 4's What's next item reads "Prevailing wage below the job's wage check" (`layout.html:154`). AG-17-10 and CS-98b say the reverse: "a wage below it [the prevailing wage] SHALL raise a CRITICAL" (`CS-98b.md:10`). Board 4's warning panel gets it right (`:166`). A builder or reviewer following BR-8 would test the wrong condition.
* **Fix.** In BR-8 and board 4, read "the job's wage below the prevailing wage".

**M13. The staff client screen exists on `main`; the concept's dependency on it is stale.** *Needed for the proof (part 2 timing).*
* **What breaks.** The concept follows the s2 brief (16 Nov, `main` 81505985f): "`main` has no client screen" (`CS-98s2.md:13`). It therefore makes board 11 wait on "the staff client screen (no row yet)" (`concept.md:44`, `layout.html:257`) and asks Q2 about it (`concept.md:78`). Fact: `main` 841ea6588 routes `/clients/*` to `ClientsApp` (`web/src/App.tsx:44`). `web/src/runtime/clients.tsx:1-7` (CS-K1s, R1.72) is the staff client list and `/clients/:id` "one client: its header, the 'Open a case?' card … and its cases", with `COMPANY` kind (`:31`).
* **Judgment, high confidence.** That is AG-7-86's host, or its start.
* **Fix.**
  * Reword Q2 to: "Is `/clients/:id` (CS-K1s) the staff client screen of AG-7-86? Recommend yes: board 11 mounts there, CS-98s2 part 2 stops waiting".
  * Name `/clients/:id` as the wizard's "from a company client's page" entry and as the target of What's next's "Open the client" (`layout.html:155`).
  * Whether the business number shows there is the front office's company read.

**M14. The board read cannot page by a computed step without scanning every file.** *Needed for the proof.*
* **What breaks.** The brief requires `GET /api/runtime/corporate/board` "paged on the server … with no unbounded in-memory scan" (`CS-98s1.md:44`). The concept groups cards by "the current step from CS-98b's exported function" (`concept.md:60`). Before submission, that step is the furthest step with a started item (AG-17-18), worked out in code. Placing any file in a column, giving column counts, or applying `step=` therefore means running the function on every file in scope.
* **Judgment, medium confidence.** The CS-98b brief does not say whether its function can be expressed in SQL. Breaker scenario: 300 files (`CS-98s1.md:72`).
* **Fix.** Ask the tech lead to rule that CS-98b part 1's step function is a SQL expression or view over `corp_*` the board can group and count on, or name a bounded fallback (for example, the firm's files capped at N with the Pipeline's "The board shows your first 1,000" notice, `pipeline-page.tsx:79`). Record the choice in §6.

### Minors
* **m1. The persona's keys are incomplete.** *Needed for the proof.*
  * **What breaks.** `concept.md:8` lists only create, edit and waive-deficiency. The screens also depend on `agent/case:show` (read, CS-98c), `agent/case:submit` (Submit, CS-98d) and `agent/case:record-decision` (Decision and Withdraw, CS-98d DW8: 403 without it).
  * **Fix.** List all six, and say which buttons are hidden without each one.
* **m2. "Undo the waive" has no route.** *Not built.*
  * **What breaks.** CS-98b has a pass and no unpass (`concept.md:43`). This is scope added beyond the briefs.
  * **Fix.** Drop it.
* **m3. Acknowledging MAJOR, MINOR and INFO warnings is not drawn.** *Needed for the proof.*
  * **What breaks.** CS-98b acknowledges these in one click (`:14`, `:38`). Board 4 and BR-8 cover CRITICAL only, and CS-98c adds a combined MAJOR for missing proof.
  * **Fix.** Draw one MAJOR row with "Acknowledge".
* **m4. Board data that teaches the wrong rule.**
  * Northern Timber's card shows "1 CRITICAL" (`layout.html:84`), while its file shows two open (`:154-155`).
  * Harbour is "Placed manually" into Advertising & recruitment (`:96`), while board 5 shows its channels running, so the computed step has reached it and the mark should have cleared (AG-17-55).
  * Maple Bistro's "Next: job details · no date" (`:87`) is not a next-due chip (BR-3: the nearest dated item).
  * The passed CRITICAL does not name its warning (`:167`).
  * **Fix.** Make the samples agree.
* **m5. "Move to step" is incomplete.** "Move to step ▾" is drawn on one card only, and its menu (later steps only, with the current one excluded) is not drawn (`layout.html:87`). **Fix.** Draw it on every pre-submission card and draw the open menu.
* **m6. The filter row does not follow FilterLayout.** All nine filters sit inline (`layout.html:68-80`). The team rule is at most two primary filters, then chips, with the rest collapsed (`TEAM-PATTERNS.md`, List). The 375 px board has no filters. **Fix.** Make Mine and Step primary, put the rest under "More filters", and show the active chips. (Team style guide Unverified here.)
* **m7. The Log a channel drawer.** "The start date can't be in the future" (`layout.html:201`) is a rule in no brief, and the drawer has no "link" field (AG-17-22). **Fix.** Drop the rule or cite it, and add Link.
* **m8. More than one filled button in the positions panel.** "Create work permit case" is primary on every eligible row (`layout.html:249`), so the panel gets several filled buttons (BIC-11, BIC-19). **Fix.** Use outline buttons on the rows.
* **m9. "Validity expiring" is undefined.** No window or source is given (`concept.md:24`), and validity is Sample. **Fix.** Say where the window comes from (the validity row's lead time, Sample) and what the filter returns while validity is Sample.
* **m10. Test names collide with the briefs'.** The concept's DW1-DW7 (`concept.md:63-69`) reuse the names of the briefs' CS-98s1 DW1-DW6, but test different things (`CS-98s1.md:54-60`), and the briefs' Done-when lines name those DWs. **Fix.** Rename the concept's checks (for example C1-C7) and map each to a brief DW.
* **m11. BR-2 states only the pre-submission rule.** AG-17-18's event rules are missing: Workers & permits at the decision if an approved position has a worker, else on the first worker assigned; Compliance on the first worker's start date. **Fix.** Add one clause (server-side).
* **m12. §4b claims AG-17-79 reuse that the wizard doesn't offer.** The wizard has no "Copy from a previous LMIA" (`concept.md:50`), and CS-98s1 does not require one. **Fix.** Drop the claim; do not add the feature.
* **m13. Mixed outcome words.** The decision outcome reads "Positive" (`layout.html:235`), while the requirement, the API (`APPROVED`) and the position statuses say "Approved". **Fix.** Use "Approved", or keep "Positive" only with a cited ESDC label marked Sample.
* **m14. A household employer can't open a file.** *Not built.* TAXONOMY row 18 (household hiring a caregiver files an LMIA) has no path, because CS-98b requires a `COMPANY` client (DW1 "a non-company client is not offered"). **Fix.** None in this row. Add one §6b line naming it as out of scope by CS-98b.

* **m15. No conflict or stale-save state.** *Needed for the proof.* Board 7 has no conflict state, which EXPERIENCE §4 [M] requires. The s2 breaker tries "a stale page submitting after another user recorded the decision (the server's 409 must show)" (`CS-98s2.md:58`). **Fix:** draw "Someone else changed this file. Reload to see it." with Reload, plus saving and failed-to-save on a drawer (BIC-18).

## What is sound
* **Coverage.** Every AG-17-54 card field and every AG-17-55 filter is named (`concept.md:23-25`) and drawn (`layout.html:68-80`). The filters are in the address with the route parameters listed (`concept.md:47`). The Closed column is hidden behind "Show Closed (n)". Forward-only moves have a keyboard "Move to step" path that copies the Pipeline's proven "Move to…" + drag pattern (`pipeline-page.tsx:7-10, 81`). There is no move after submission.
* **Briefs and rulings followed.** The module page route `/case-delivery/corporate/files/:id` follows the brief's recommended option and the module README's word rule. The board route `GET /api/runtime/corporate/board` matches the brief. Owner = case officer (Lead 61). No view toggle (PF-6vt). The decision counts with not-approved positions chosen. ESDC's decision number has its own field marked "Sample label". Sign-off asks once on 409. The Sample validity has no reminder line. "Not built yet" is named per missing panel.
* **Patterns.** Every pattern is from EXPERIENCE §3: Library list header, Dialog/wizard of 3 steps with "Will be created as", Workspace with a task-list of steps (BIC-10), Side panels with Cancel left and primary right. There is one filled button per panel almost everywhere (m8 is the exception). The Sample marker and its tooltip are consistent.
* **States and widths.** States are drawn (empty, nothing matches, loading skeleton, error with retry, 403, 404 with the same words for another firm, read-only after submission, long content). 375/1024/1440 with the board scrolling inside itself.
* **Candidates.** Staff only, with one combined CRITICAL (AG-17-27, -30).
* **Size and dependencies.** `concept.md` is 89 lines, under the 100-line rule; r2 must absorb these fixes without passing 100 (move detail to `layout.html` notes). "Waits on" names are right for the parts, except M3.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API (brief) | Rule | Test |
|---|---|---|---|---|
| Board, List, filters | `corp_job`, `corp_position`, `case_client`, `CaseTeamMember OFFICER` | `GET /api/runtime/corporate/board` (CS-98s1 part 1, new `board.ts`), scoped by CS-K3 `caseScope` | AG-17-54/-55; the step from CS-98b's function (M14) | s1 DW1, DW3 |
| Move to step / Back to automatic | the override on the file (CS-98b part 1) | CS-98b override route; clear route **unnamed** (M5) | forward only before submission; 409 otherwise | s1 DW2 + the clear line |
| Open wizard | `case`, `corp_job`, N `corp_position REQUESTED`, wage check row | `POST …/corporate/stream-proposal` (read); open under `/api/runtime/clients/:id/corporate/…`; locations add/list (CS-98b part 1) | AG-17-7..11, -3; 400 required prevailing wage; 409 no `fo_company_id` | CS-98b DW1-4, DW9, DW15; s1 W1 |
| Duplicate check | none (read) | CS-98b part 2 file check (route unnamed, M3) | AG-17-95 states, never blocks, audited "separate file" | CS-98b DW12 |
| Steps, statuses, What's next | items per step: **undefined** (B2) | **missing**; proposed `GET …/corporate/summary` | AG-17-15/-17/-19 | s1 DW4 |
| Set-up: job, positions, warnings | `corp_job`, `corp_position`, `ReadinessPass` | CS-98b part 1 job, positions, warnings and pass | 409 after submission; 400 `REASON_REQUIRED`; 403 without waive key | s1 DW5, DW6; CS-98b DW5-6 |
| Recruitment: channels, clock, candidates | `corp_channel`, `corp_candidate` (CS-98a) | `/api/runtime/cases/:id/corporate/recruitment/…` (CS-98c part 1) | least-advanced channel; combined CRITICAL; client actor 404 | CS-98c DW1-7 |
| Dated items, consistency, report | CS-DL1 jobs; consistency capture; document via `FilesPort` | CS-98c part 2 | no reminder on Sample; CRITICAL per difference; 502 on render failure | CS-98c DW8-10; M4 test |
| Submit | `FilingRecord` (C8.2) | CS-98d part 1 submit; 409 `SIGN_OFF_CONFIRM` | AG-17-36, AG17-D46 | s2 DW2 |
| Decision, Withdraw, Re-apply | `case_decision`, `corp_job.decision_reference`, positions, `corp_case_link REAPPLICATION_OF` | CS-98d part 1 | not-approved count = requested − approved; Withdraw before decision; plan limit on Re-apply | s2 DW1, DW3; CS-98d DW1-8 |
| Validity, officer contacts | CS-DL1 job; `TaskPort` task | CS-98d part 2 | Sample → no reminder | s2 DW4; CS-98d DW9-10 |
| Positions and workers, Create work permit case | `corp_position`, `corp_case_link WORKER_PERMIT`, `RELIED_ON` audit, new individual case | `/api/runtime/cases/:id/corporate/positions/…` (CS-98e part 1) | `WORKER_ASSIGNED` only; once per position (409); chosen Individual combination (M9) | s2 DW5, W1 |
| Submitted chips | fee, officer contact, decision state | board read (CS-98s1) extended by CS-98s2 part 1 | AG-17-54 Submitted chips | s2 part 1 |
| Corporate panels | company read (front office), `corp_employer_location`, board read, CS-98e | existing reads; host `/clients/:id` (M13) | "Not built yet" per missing panel | s2 DW6 |

## Questions for the founder (≤3, recommendation first)
None. Every open point above is a contract or ruling question for the tech lead: B2's summary read, M5's clear route, M13's client-screen host and M14's step query. The concept's Q1 (run on Sample until CS-98r step 0, Proven only with cited values) is sound as written.

## Lead response
*Drafted by the runtime lane that wrote the concept, 22 Nov, for the tech lead to confirm or overrule.* All 31 accepted and applied in r2 (`concept.md` r2, `design/layout.html` boards 1-12):
* **B1** the stream is confirmed in the wizard only; the file shows it read-only with its proposal and source; "Change stream" drawn as text, after CS-98b part 2 (BR-7). **B2** placed as concept Q2 (recommend `GET …/corporate/summary` in CS-98b part 1); CS-98s1 part 2 not ready until ruled.
* **M1** wizard step 2: AG-17-7 fields, conditional prevailing wage with "Asked because…", workforce figures marked Sample. **M2** "Add a location" with the same-location offer in step 1. **M3** the five duplicate answers drawn; the open call answers the check and "Open a separate file anyway" resends with `openSeparate: true` (BR-10; reviewer round 1); s1 part 2 waits on CS-98b part 2. **M4** "Job ads and the job offer" panel + C6. **M5** concept Q3. **M6** file shows only steps with items; board columns keep "Built in CS-98s3". **M7** List: positions approved, waiting on, Move to step, Back to automatic. **M8** "Record the submission" panel and drawer. **M9** Create work permit case drawer with the combination. **M10** nine drawers drawn (board 12); decision letter and Refused path; Withdraw in the header before submission too. **M11** Sample on every derived value. **M12** BR-8 and board 4 corrected. **M13** concept Q4 (`/clients/:id`). **M14** concept Q5.
* **m1** six keys listed; **m2** un-pass dropped; **m3** MAJOR "Acknowledge" drawn; **m4** samples agree (2 CRITICAL; placed-manually card moved to Maple Bistro; "No dated item yet"; the passed CRITICAL names its warning); **m5** Move to step on every pre-submission card, menu drawn; **m6** FilterLayout; **m7** future-date rule dropped, Link added; **m8** outline buttons per row; **m9** validity expiring defined; **m10** concept checks renamed C1-C7 and mapped; **m11** BR-2 event rules; **m12** AG-17-79 claim dropped; **m13** "Approved"; **m14** household employer named *Not built*; **m15** conflict, saving and failed-to-save states.

## Agreement
The tech lead (Lead 4) approved r2 on #3002, 22 Nov 15:44 IST (comment 7077590191), with Q1-Q5 as recommended. The reviewer's round-2 Minor (board 3 reused the file number L-0019) is fixed: it now reads L-0035.

## Build discoveries
