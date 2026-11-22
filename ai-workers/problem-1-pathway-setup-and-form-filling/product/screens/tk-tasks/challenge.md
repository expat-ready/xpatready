# PF-29f challenge: tasks (My Tasks, Unassigned, the Tasks panel, the Home section, the hand-over step)

Fresh challenger (did not draft the concept), 22 Nov 2026, skill `screen-concept` §B. Read: `concept.md` and `design/tk-boards.html` (S1-S7); BACKLOG PF-29a to PF-29f and CS-T1; the trace brief for PF-29f (AG-13-5, -62, -63, -67, AG-11-115) plus AG-13 §6, §10, AG-13-6, -8, -64, -65, -66; `PRODUCT.md`, `STANDARDS.md`, `EXPERIENCE.md` (§2-§7, BIC-01..20, UXL-01..14), `QUALITY.md`; P-584, P-223; PF-18h's concept; the app code listed below. **Freshness:** `ai-workers/tools/freshness.sh` fails (`FileNotFoundError: code/README-copies.md`); the team's code capture `code/` is not in this copy, so every claim about the team's task screens is **Unverified**. The requirement text is the name-free copy `domain/requirements-2026-11-02/`.

## Verdict
**Build after these changes.** The scope, the rules and the hard parts (Restricted, lost race, zone named, hand-over inside deactivation) are right. What fails is the back end per element: several things the board shows are returned by no planned API (M1, M2, M6), one queue item the case side already promised is missing (M3), the Home and My Tasks disagree on "today" (M4), the menu count means two things (M5), and row actions are not gated (M7). All are fixable in the concept and in the PF-29b/c/e and CS-T1 briefs; nothing needs a rethink.

## Objections

### Blocker
None.

### Major

**M1. Fields, counts and states that no planned API returns.** *Needed for the proof.*
* What breaks: the builder must invent data, or the screen ships blanks, when the APIs merge.
* Example and evidence (Fact): the contract (§6) parses `windowWord` and `typeLabel`, but PF-29b's `registerHost` gives only `canSee`, `label`, `url` (BACKLOG PF-29b) and PF-29c says it *sorts* by window, not that it returns the word. Board S2's "Why unassigned" ("Handed over when Case officer G left", "Made by a rule; its assignee is inactive") has no column in PF-29a's `plat_task` (BACKLOG PF-29a) and is not asked by AG-13-62. The conflict state "409 This task changed" (§4 States) needs a version; PF-29a has none (STANDARDS §4 [M] optimistic concurrency). Add a task pre-fills "the record's office zone" (§4b), but no host method returns a zone. S3's Stage, Next deadline and Type: CS-T1 names the queue route, not its fields. Tab, Home and menu counts: concept Q3 already sees the missing `total`.
* Fix: add a "Contract per answer" table to §6 (field → which row returns it) and carry it into the briefs: PF-29b `registerHost` also returns `typeLabel` (null for a lead) and `zone`; PF-29c items carry `windowWord` and `total` (concept Q3); PF-29a gains a `version` (or `updated_at` used as one) for the 409; CS-T1's queue item = `{caseId, caseNumber, clientName, stage, nextDeadlineAt, typeLabel}` with `total`. **Drop "Why unassigned"** (not in the requirement; gold-plating without a record).

**M2. The hand-over step has no API shape, and PF-6's dialog cannot carry it as it is.** *Needed for the proof.*
* What breaks: S6 needs the leaver's open-task count, the first 10 and the offered owners before confirming, then one server transaction for "deactivate + move". PF-29e lists `handover.ts` and "one call in PF-4b's deactivation service" but no route for the preview and no field in the deactivate request.
* Evidence (Fact): Deactivate is the generic `ActDialog` shared with Sign out and Reactivate, posting `{reason}` to `/platform/staff/:id/deactivate` (`staff/person-panel.tsx:18-29`, `:95`). Deactivating an Owner can need "Confirm it's you": the change is kept as `{path, json}` and re-sent after step-up (`person-panel.tsx:43-48`), so a hand-over choice held only in dialog state is lost on that path.
* Fix: PF-29e defines `GET /api/platform/staff/:id/open-tasks` → `{count, first: [{title, dueAt, dueZone, windowWord}] (10), offered: [{staffId, name}]}` (active, same firm, `agent/task:view.own`, not the leaver, not suspended), and the deactivate body gains `tasks: {to: staffId} | "unassign"` (required when count > 0), applied in the deactivation transaction. The concept says: Deactivate gets its own dialog component (the other two keep `ActDialog`); the choice rides in the step-up `json`; tasks opened between preview and confirm move too, and the toast says the moved number from the server.

**M3. The case side's read-only `CaseTask` items are missing from My Tasks.** *Needed for the proof.*
* What breaks: CS-T1 (the row this screen reads) says today's `CaseTask` rows show "as read-only items in My Tasks linking to their filing ('Complete on the filing page')", with a 409 when completed from the queue. The concept says instead that CS-T1 "decides how it surfaces" (§2) and draws no such row, no contract shape and no test.
* Evidence (Fact): `model CaseTask` has no assignee and no due date (`prisma/schema/cases.prisma:380-405`); it shows today only as the "tasks after filing" notice in Submission to IRCC (`runtime/submission.tsx:82-97`). AG-13-65 says items without an owner and a due date "SHALL NOT create tasks" and that completing in either place completes both. Judgment (high confidence): CS-T1 and AG-13-65 pull in different directions; the screen must not settle it silently (AGENTS rule 2).
* Fix: Question 1. If "show": a fourth row shape `{kind: "case-item", words, caseNumber, filingUrl}` in "No due date", owner = the case's current OFFICER, no Done, one link "Open the filing", plus a pass and a fail test.

**M4. Two "today" rules on one journey, and a Home count that does not match its link.** *Needed for the proof.*
* What breaks: BR-2 groups My Tasks by **each task's** office zone; BR-9 (rightly, AG-11-115 rule 2) puts a task on Home when due by the end of today in **my** office zone. Example: a Toronto officer at 22:00 on 22 Nov, a task due 23:30 Vancouver time (02:30 Toronto, 23 Nov). My Tasks says "Today"; Home leaves it out; Home's "3 due today or overdue · see all" opens a My Tasks showing 4 under Overdue and Today. Bulk "Due date…" over rows in two zones has the same gap (which zone is the date in?).
* Evidence (Fact): PF-18h's Home shows every time in my zone with one footer "Times in <zone>" (`home/home-page.tsx:101`, BR-7 in its header comment); the concept's S5 names each task's zone instead. AG-13-5 says "overdue is a derived flag in firm TZ"; PF-29c chose the item's office zone.
* Fix: one server function decides "due today or overdue" for both `…/home` and a My Tasks filter of the same name; "see all" opens My Tasks with that filter on. State which zone each list uses, and that bulk "Due date…" keeps each task's zone and sets the date in it. On Home, follow PF-18h's footer and name a task's zone only when it differs from mine.

**M5. The menu count means two things, and sits where most work pages cannot see it.** *Needed for the proof.*
* What breaks: §4 S1 puts "my tasks due today or overdue, **plus** the unassigned count" on one "Tasks" entry; the board shows a single "3" (S1 note: "its count = my open tasks due today or overdue") while S5 says "Unassigned work is a badge on the Tasks menu entry". A reader cannot tell which number they see (EXPERIENCE §2.7 "counts say what they count", BIC-19). AG-13-62 asks for one badge that counts **all unassigned work** for those who can reassign; the concept does not say whether unassigned cases count.
* Evidence (Fact): `account-sections.ts:3` has no count field and the file has "no imports"; the menu renders only in `PlatformFrame`'s My account side menu (`frame.tsx:54-60`), not on the case or front-office frames.
* Fix: one badge, one meaning: unassigned work this person may take or assign (tasks, plus cases for `agent/case:assign` holders, CS-T1's count), with a tooltip naming both numbers; drop the "my due" count from the menu (the Home section carries it). Say how the count reaches the frame (an optional `count` on the section, read once per page from `…/badge` or the totals of M1), and that the entry is the "home-screen badge" of AG-13-62 because the menu sits on Home. Question 2.

**M6. No place to read a task.** *Needed for the proof.*
* What breaks: Add a task collects "Details (optional, ≤ 5,000)", but no screen shows them: rows show title and category, and details are reachable only through ⋯ Edit, which a person without `agent/task:edit` should not open (M7). AG-13-67 (c) says the assignee "SHALL see the task and its title in My Tasks **and on the task itself**".
* Example: a case manager adds "Ask for the employer letter" with three lines on what the letter must say; the officer sees the title only.
* Evidence (Fact): PF-29b's routes list create, edit, assign, Take it, complete, reopen, cancel, archive: no read of one task.
* Fix: the title opens a Side panel (EXPERIENCE §3, 480-560 px): details, On (or "Restricted"), due with zone, priority, assignee, created by, and the same actions; list items carry `description`, or PF-29b adds `GET …/tasks/:id` under the same visibility rule. One test: the details show for the assignee of a Restricted task, and the parent's name does not.

**M7. Row actions are not gated by the person's keys.** *Needed for the proof.*
* What breaks: only Add a task is gated (BR-8: "Only holders of `agent/task:create`"). Done, Edit, Reopen and Cancel… show to everyone, including the Read-only starter role, which holds `view.own` and `view.all` (AG-13 §10). Example: a Read-only user opens a case's Tasks panel, presses Cancel…, writes a reason and gets a 403 after typing.
* Evidence (Fact): AG-13 §10: `:create / :edit / :delete` are per action; AG-13 §6: reopen is "permissioned"; AG-13-67 (c): the assignee may complete. PF-29b tests only "a role without `:assign` → 403".
* Fix: BR-8 states: Edit, Cancel… and Reopen need `agent/task:edit`; Done needs being the assignee or `:edit`; Assign… and Reassign… need `:assign`; a hidden action leaves a muted line "You can view these tasks" (EXPERIENCE §4 read-only says why). PF-29b enforces each on the server; the browser test adds a pass and a fail for Read-only.

### Minor

**m1. Restricted rows: three loose ends.** *Needed for the proof.* BR-1 says each client or case task shows its type label; BR-3 lists what Restricted hides but not the type label, which is a detail of the parent (AG-13-67 (c) "nothing else of the parent"). The tooltip "You are assigned this task…" is wrong for a Restricted row under "Assigned by me" (PF-29c shows it to the creator too). BR-3 says "Search … follow the same rule", but the page has no search. Fix: hide the type label on Restricted; tooltip "You cannot open the record this task is on"; drop "Search" from BR-3.

**m2. Home section order and length are unstated.** *Needed for the proof.* AG-11-115 rule 5: inside a section, government-deadline items first, then urgent or overdue (oldest due first), then the rest by due time; PF-18h caps its section at 20 with the total in words (`home-page.tsx:101`, its concept line 35). BR-9 says neither, and PF-29c's `…/home` has no order. Fix: one line each in BR-9 and in PF-29c's brief; test an Urgent task due tonight above a Medium one due earlier today.

**m3. EXPERIENCE §7 (UXL-01..14, P-794, 22 Nov) is not answered; BIC-08 is mis-scored.** *Needed for the proof.* EXPERIENCE §7: "the concept answers each check". At risk: UXL-06 (S1 shows 3 tabs, 2 chips and 3 filter menus, 8 equal choices), UXL-09 (Done on the 375 px cards needs 44 px), UXL-10 (the tab row and the filter chips must show they scroll). BIC-08 (applications as cards) is about case structure: N/A here, not "met". Fix: a §4d with one line per UXL check; filters behind one "Filter" menu at 375 px.

**m4. The case page runs as the Studio's simulated person; the panel must not.** *Needed for the proof.* Fact: `runtime/cases.tsx:1-3` ("the people are simulated"), PF-18h's known gap (`home-page.tsx:8`); the Decision panel on the same page already calls through `staffApi` and shows the staff sign-in inline (`runtime/case-decision.tsx:5-8`). Fix: say the Tasks panel does the same, so its visibility is the signed-in staff member's; reuse the lead page's `MessagesPanel subject={{kind, id}}` shape (`lead-page.tsx:154`) for the panel's props. Say which tasks the prospect page lists after a lead is engaged (all on the `fo_person` host, or by context).

**m5. Row text dropped without a line.** *Needed for the proof.* PF-29f's batch 5 says each row shows "the stage"; task rows have none, and no host label carries it (CS-T1: "case number and client name"). Copy differs between board S6 ("Deactivate and leave them unassigned") and concept §5 ("Deactivate, leave unassigned"). Fix: write "stage: Unassigned cases only" in the agreement; one copy string.

**m6. One browser test cannot be set up from the screen.** BR-6's "a set with another firm's id → Nothing changed" needs a forged request; it is PF-29c's API test. Fix: the browser test keeps "one id refused (fake) → Notice in words, no row moved"; the cross-firm case stays in `check_tk3_task_queues.ts`.

## What is sound
* The scope line (§6b): letter tasks, nurture rows, booking prompts, Unassigned leads, the case hand-over and leaver reports are named as other rows; nothing is gold-plated except "Why unassigned" (M1) and the second menu count (M5).
* Restricted (BR-3) follows AG-13-67 (c) to the word, with Done still allowed and a test for both sides.
* The lost race is named for tasks and cases (BR-5), matching PF-29b and CS-T1's 409 words.
* Every due time names its zone; "Overdue" is in words, never colour alone.
* The hand-over lives inside deactivation, so nothing is orphaned (AG-13-63), and done or cancelled tasks keep their owner.
* Concept questions 2 (lead tasks out of Unassigned, AG-13-62) and 3 (totals) are real gaps, put in the right briefs.
* Retrofit: `CaseTask` is not rewritten (contract §1 rule 2); the Home section joins PF-18h's one-`<section>`-per-block layout (`home-page.tsx:107-113`); typed fakes stay unbound as PF-18h did; plain names follow AG17-D61 (BR-11).
* One test per rule with a pass and a fail, a journey (J-75), and keyboard, axe and three widths.
* Immigration fit: "Unassigned" on a case means no case officer (AG-11-115, AG-7-36); Take it needs `case:edit` and Assign… `case:assign`; nearest government deadline first is the right order. No immigration values are introduced. Product logic (TAXONOMY §4): tasks hang on records, not on the program tree, so no taxonomy case breaks a rule.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API (row) | Rule | Test |
|---|---|---|---|---|
| My Tasks rows, groups | `plat_task` (PF-29a) + host label | `GET /api/platform/tasks/mine` (PF-29c): `items`, `next`, `total`, `windowWord`, `dueAt`, `dueZone`, `host`, `typeLabel`, `version` | BR-1, BR-2, BR-3; M1, M4 | tk3 (zone, DST, Restricted); tk6 BR-1-3 |
| Read-only case items | `case_task` (C8.2) | CS-T1's surfacing, shape per Q1 | M3 | cst1 (409); tk6 one pass and one fail |
| Unassigned tasks + bulk | `plat_task`, `assignee` null, not LEAD | `GET …/unassigned` (`total`), `POST …/bulk` (≤ 200, all or none) | BR-4, BR-6; `view.all` or `:assign` | tk3 (403, 201 ids); tk6 BR-4, BR-6 |
| Take it, Assign… | `plat_task.assignee`, `version` | PF-29b Take it / assign (409 with name) | BR-5, M7 | tk2 (race); tk6 BR-5 |
| Unassigned cases | `CaseTeamMember` (no OFFICER) | CS-T1 queue: `caseNumber`, `clientName`, `stage`, `nextDeadlineAt`, `typeLabel`, `total`; Take it | BR-7 | cst1; tk6 BR-7 |
| Tasks panel + Add | `plat_task` on host `fo_person`, `case`, `case_client` | PF-29b create / edit / complete / reopen / cancel; host `zone`; staff picker (active only) | BR-8, M6, M7 | tk2, tk4; tk6 BR-8 + Read-only |
| Task side panel | `plat_task.description` | list item `description` or `GET …/tasks/:id` | AG-13-67 (c) | tk6: details shown, parent hidden |
| Home "My Tasks" | read model | `GET …/home` (`total`, order of AG-11-115, ≤ 20) | BR-9, m2, M4 | tk3 (same function as the filter); tk6 BR-9 |
| Menu badge | counts | `total` of unassigned tasks + CS-T1 case count | M5, AG-13-62 | tk6: badge for `:assign`, none without |
| Hand-over step | `plat_task` + staff status | `GET /platform/staff/:id/open-tasks`; deactivate body `tasks` (PF-29e) | BR-10, M2 | tk5 (one transaction); tk6 BR-10, step-up keeps the choice |

## Questions for the founder (at most 3, recommendation first)
1. **Today's after-filing case items in My Tasks.** CS-T1 shows them read-only in My Tasks; AG-13-65 says items without an owner and a due date do not become tasks. **Recommend** showing them (the officer would otherwise miss them), read-only, owned by the case's officer, under "No due date", with "Open the filing". Other choice: leave them on the filing page only and trim CS-T1's line.
2. **What the unassigned-work badge counts.** AG-13-62: "all unassigned work for anyone who can reassign". **Recommend** unassigned tasks the person may see plus unassigned cases for `agent/case:assign` holders, one badge on the Tasks entry with both numbers in its tooltip; unassigned leads stay on their own list (AG-2-13c) until that list's row adds them.

## Lead response
Written in word for word by the screens lane from PR #3072, comment 7079309749 (#3072 was already queued, so it lands in a follow-up records PR):

**Lead response (Lead 5, 18:13 IST 22 Nov; P-223 (4)): concept r2.1 approved.** The fresh challenge found no Blocker; M1-M7 and m1-m6 are each answered in §8 and visible in BR-1 to BR-14, §6's contract table and the tests. Rulings:
1. **Unassigned gate:** "`view.all` or `:assign`" (AG-13-62's "or"), lead tasks excluded; PF-29c's "+" is corrected to the requirement.
2. **Deactivate** becomes its own dialog with BR-13's wording; Sign out and Reactivate keep `ActDialog`; the choice rides in the step-up body.
3. **§8's brief lines** (PF-29a `version`; PF-29b `registerHost` → `typeLabel` + zone, `GET /tasks/:id`; PF-29c `windowWord`, `total`, `badge`, Home order and cap, the filter; PF-29e preview route and deactivate body; CS-T1 queue fields and `total`) go into those rows in my next records PR.
4. **Founder questions, one at a time with the recommendation, before the build** (the build waits on PF-29b-e and CS-T1 anyway): Q1 after-filing case items read-only in My Tasks (recommend yes); Q2 the badge counts (recommend BR-12); and the zone conflict (AG-13-5 "firm TZ" vs AG-11-115 "my zone"; recommend my office zone, BR-2). Until answered, BR-2 is built as written and the CaseTask rows are not drawn.
Write this into `challenge.md` "Lead response", fill "Agreement" from BR-1 to BR-14, get the record reviewer's Approve on that head, and label (records).


## Agreement
Concept r2.1 (46a70e597), approved by the tech lead above. Agreed for the build, rule by rule (the concept's §3 is the full text):
* **BR-1** My Tasks: assigned to me (default) or by me; no Individual/Corporate filter; type label on client and case tasks only.
* **BR-2** One "today" in my office zone for My Tasks and Home; "This week" to the end of Sunday; times in my zone with a footer, a task's own zone named when it differs; bulk keeps each task's zone. Built as written until the founder answers the zone question (ruling 4).
* **BR-3** Restricted: title only, no name, number, status, type or link; the assignee can read and complete it.
* **BR-4** Unassigned tasks: "`view.all` or `:assign`", each host's visibility applied, lead tasks excluded (ruling 1); no "why unassigned" column.
* **BR-5** First Take it wins; the loser reads "<name> already has this task" (or "… this case").
* **BR-6** Bulk up to 200, all or nothing, for `agent/task:bulk`.
* **BR-7** Unassigned cases: the third tab, for `agent/case:edit` or `:assign`; its rows show the stage.
* **BR-8** Actions follow keys: Add `:create`; Edit, Cancel, Reopen `:edit`; Done for the assignee or `:edit`; Assign and Reassign `:assign`; Take it `:assign`, or `view.all` with `:edit`; otherwise "You can view these tasks".
* **BR-9** The Tasks panel on lead, prospect, client and case pages; Add a task due in the record's office zone.
* **BR-10** A title opens one task's side panel (`GET /tasks/:id`).
* **BR-11** Home "My Tasks": due by the end of today in my zone, after "Needs you", not drawn when empty, ordered and capped at 20; "see all" opens My Tasks with the same filter.
* **BR-12** One badge: unassigned tasks for `task:assign` holders plus unassigned cases for `case:assign` holders. Waits on the founder's answer to question 2 (ruling 4).
* **BR-13** Deactivate is its own dialog with the hand-over; the choice rides in the deactivate request and its step-up re-send (ruling 2).
* **BR-14** Plain names: "Tasks", "My Tasks", "Unassigned tasks", "Unassigned cases".
* **Not drawn until the founder answers question 1:** today's `CaseTask` rows in My Tasks (ruling 4).
* **§8's brief lines** go into PF-29a/b/c/e and CS-T1 in the tech lead's records PR (ruling 3).


## Build discoveries
