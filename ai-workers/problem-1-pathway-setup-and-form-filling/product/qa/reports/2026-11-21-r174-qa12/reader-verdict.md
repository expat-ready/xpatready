# R1.74 fresh reader verdict (P-339, P-303), main 12f270bb9

Reader: fresh Opus 5.5 context. I did not build or test this, and I ran nothing: I read files, `git show`, `grep` and the REST API only. Paths: P = `ai-workers/problem-1-pathway-setup-and-form-filling/product`, S = `…/prototype/studio`.

## Evidence checked
- Walks 44802323596 (job 136517649317) and 44802327945 (job 136517708523) are `walks`, workflow_dispatch, head_sha 12f270bb90ac…, conclusion success (REST).
- qa's local files: `csdl3_{1,2}.txt` 43/43 exit 0, and `j74_{1,2}.txt` 14/14 exit 0.
- `S/tests/journeys/j_74.ts` last changed in aea1c9082 (CS-DL1 part 2). It has no milestone step.

## 1. Each Done-when clause
- **"Deadline worked out from its rule and shown" (stage):** met on screen. `S/web/src/runtime/stages.tsx:35-37, 75` shows the deadline. J-74 W2 shows "Mon 8 Mar 2027 (closed day)" at 1440 px, with axe (`j_74.ts:93-96`). This is still Sample everywhere (BR-8, P-412 F13 (b)).
- **"Deadline worked out and shown" (government step, QA-591):** test only. `GET …/stages` adds `milestones` (`S/api/src/case-stages.ts:132-138`), and the routes are in `S/api/src/features/case-milestones.ts`. `grep -rn milestone S/web/src` finds 0 hits, so no screen can record a step or show its deadline.
- **"Reminds the case's people before it falls due":** test only, and only on fakes. `S/api/src/features/case-deadlines.ts:16` declares `CASE_DEADLINE_NOTIFICATIONS`, and `:22-24` injects it as `@Optional`. With nothing bound, it logs `case_deadlines_waiting` and returns. Nothing on main binds it: the token appears only in that file and in `MODULE.cases.rows/CS-DL1b.md`, and no `provide:` names it. So the running app arms no reminder for stages or for government steps (`reminders.ts:90, 194` run only inside the test). J-74 uses fakeJobs, FakeClock and fakeNotifications, as its header says (`j_74.ts:17-19, 40, 62`), and so does `check_csdl3_milestones.ts` (DW1 pass/fail at :99-117).
- **"Working days skip weekends and the firm's holidays (a pass and a fail)":** met, for the reminders' count-back. Stages: J-74 DW1 and its NR at `j_74.ts:98-101`, with closed days from Settings. Steps: CS-DL3 DW1 pass at :99-102, fail at :106-108. The government date itself never moves (AG-7-94), which is right by Lead 61's ruling. The row's wording is still QA-592.

## 2. Bugs
- **QA-591: narrowed (API half done), not closed.** On main: the table, the routes, the reminders and the stages read. Missing: the screen, J-74's walk of a step, and any real reminder.
- **QA-471: unchanged.** No NotificationPort is bound (PF-18n), and no "Needs you" item exists for deadlines (the only "Needs you" text is in complaints and review).
- **QA-592: unchanged.**

## 3. Gate A by screens
- j_74 ends at W4, a reopen proven on fakes (`j_74.ts:122-124`). It does not go on to the next capability's first step, and it walks no government step.
- The reminders clause is shown only on fakes (fakeJobs and fakeNotifications), in J-74 and in check_csdl3 alike. No person in the running app is reminded.

## 4. Verdict
**Partial: parts missing: (1) a bound NotificationPort, so a real person is reminded (PF-18n, QA-471); (2) the "Government steps" screen and J-74's walk of a step (CS-DL3 part 2, QA-591); (3) the "Needs you" item (QA-471).** Already Works: the stage deadline shown, and working days over the firm's closed days. Confidence: high. The binding search and the web grep are exhaustive over S. The green runs prove only what they walk.
