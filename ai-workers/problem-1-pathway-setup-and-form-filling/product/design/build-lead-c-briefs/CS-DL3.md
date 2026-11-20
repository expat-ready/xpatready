# Brief: CS-DL3, government-step deadlines (a case's IRCC milestones with a due date and reminders) (R1.74, QA-591; cloud builder lane; row owner Build Lead C)

Written by Build Lead C (4) at 15:3x IST on 20 Nov, at Lead 2 (series 3)'s ask (P-745 Wave 1). **Item:** R1.74 ("Deadlines that remind, in calendar or working days"). qa 13 has it at Partial on 20 Nov (#2467), with this reason: **QA-591 (Gap · Major).** Government-step deadlines, such as a biometrics letter's "within 30 days", have no due date and no reminder. Only the current stage's deadline is armed (`api/src/case-deadlines/reminders.ts:100`). BACKLOG CS-DL1 item (1) names "a stage's **or milestone's** deadline (AG-7-33's deadline-bearing milestones)". This row closes QA-591. **This page is the concept, approved by the row owner (P-223 (4)).**

**Sources:**
* Doc 3 Agent Console (`domain/requirements-2026-10-19/01-techno-functional/05-Doc-3-Agent-Console.md`):
  * line 3337: "`CaseMilestone` — `id`, `firm_id`, `caseId`, `milestoneKey` (pack-defined value: AOR/biometrics/medical/ADR/PPR/COPR/PAL ...), `occurredAt`, `dueAt?`, `reference?`, `note?`";
  * line 3141: a milestone's deadline "drives the Minder ... to watch and prompt as the deadline nears";
  * line 3398 (US-6): a biometrics deadline.
* AG-7-96 rule 7: a recorded deadline never moves; a reminder falls on an open day.

**Two parts, two PRs** (P-610: schema, jobs and a screen would pass 800 lines):

## Part 1, the milestone record and its reminders (API)
**PR title:** `migration — runtime: CS-DL3 part 1 — government steps with a due date, reminded like stage deadlines (QA-591)`
**Model:** Opus 5.5, effort high (schema, jobs). **Reviewer:** a fresh Opus at high effort. **Breaker:** yes. **The Lead reads the migration and `ports/notifications.ts` before the label (P-423).**

**Ready when:** now. CS-DL1 parts 1 and 2 are on `main` (#2000, #2317), with `case-deadlines/plan.ts` (7 and 2 working days before, and on the day) and the job-based reminders.

**Build:**
1. **`case_milestone`** (one migration with its rollback file; stamp later than `main`'s newest at PR open, confirmed by the Lead, P-600):
   * columns: `id`, `firm_id` (PF-12 wall), `case_id`, `milestone_key` (text), `occurred_on` (date, the letter's date), `due_on` (date, nullable), `reference` (text, nullable, the IRCC letter's number), `note`, `recorded_by` (typed actor), `recorded_at`, `cancelled_at`, `cancelled_by`;
   * `due_on >= occurred_on`;
   * it is insert-only apart from cancelling. **A due date is never edited:** a wrong one is cancelled and recorded again, and both lines stay (AG-7-96 rule 7).
2. **Milestone keys:** a fixed list in code, each with plain words: biometrics instruction letter, medical exam request, additional documents request (ADR), passport request (PPR), procedural fairness letter, and Other (with a note). Labelled **Sample** (pack-defined in the source) until the configurator defines them per program.
3. **The due date is the one on IRCC's letter, typed by staff.** The app never computes a government deadline, so no fee or day-count value is guessed (P-170). Because the date comes from the letter, a milestone deadline reminds **whatever its route's basis is**. This is the one exception to CS-DL1b's "only CITED routes remind", ruled here: the stage plan's basis governs the stage's own deadline only.
4. **Reminders:** the same `plan.ts` days through `JobPort`, with keys `case_milestone:<id>:<offset>`, on an open day (the firm's working days, as CS-DL1). A cancel cancels its jobs; a case close stops them and a reopen resumes them (CS-DL1b's pattern). Add `CASE_MILESTONE_DEADLINE` to `NOTIFICATION_KIND`, add-only.
5. **Routes** (zod contracts in a new `contracts/milestones.ts`, not `contracts/runtime.ts`, so CS-K1s does not collide):
   * `GET /api/runtime/cases/:id/milestones` (`agent/case:show`);
   * `POST …/milestones` (`agent/case:edit`);
   * `POST …/milestones/:mid/cancel` with a reason (`agent/case:edit`).
   * Each write gets one audit line through AuditPort and one `case.milestone_recorded` or `case.milestone_cancelled` outbox event, ids only.
   * The case's deadlines read (the one the case page uses) includes open milestone due dates beside the stage deadline.

**Done when:** `tsx studio/tests/check_csdl3_milestones.ts` passes these, each with a pass and a fail:
* **DW1:** recording a biometrics letter with a due date schedules the three reminders on open days. **Fail:** a reminder dated on a weekend or holiday is caught.
* **DW2:** a due date is never edited: there is no update route, and a direct SQL update is refused by a trigger. Cancel plus a new record keeps both, and the cancelled line's jobs are cancelled.
* **DW3:** a close stops the reminders and a reopen resumes them.
* **DW4:** a milestone on a Sample-route case still reminds (ruling 3).
* **DW5:** firm B gets 404, and its walls hold (`check_pf12_walls.ts`).
* **DW6:** `due_on` before `occurred_on` → 400 at the field.
* **DW7:** the audit line and the outbox event carry ids only, with no note text.

These pass unchanged: `check_csdl1_*`, J-74, `check_pf12_walls.ts`, `check_csv1_inputs.ts` and `check_case_feed.ts`. Full `ci` green.

**Touch list:**
* the migration folder
* `prisma/schema/cases.prisma`
* new `api/src/case-deadlines/milestones.ts`
* `api/src/case-deadlines/reminders.ts`: arm milestones
* new `api/src/features/case-milestones.ts`
* new `contracts/milestones.ts`
* `ports/notifications.ts`: add-only
* new `tests/check_csdl3_milestones.ts`
* the card through the card tool

**Size:** about 500–700 lines.

**Parallel safety:** it runs beside CS-K1s (no shared files). If CS-W3 part 1 (#2349) is still open, stamp later than it and add `case_milestone` to its census allow-list only if that PR is on `main` (otherwise CS-W3 part 2 counts it).

## Part 2, the case page's "Government steps" section and J-74's milestone walk
**PR title:** `screens: CS-DL3 part 2 — Government steps on the case page; J-74 walks a biometrics letter's deadline`
**Ready when:** part 1 **and CS-K1s** are on `main` (both touch the runtime route files).

**Build:**
* On the case page, a "Government steps" section listing each step's name, the letter's date, the due date with "in N days" or "overdue" (not colour alone), the reference, and who recorded it.
* "Record a step": pick the step, the letter's date, the due date and an optional reference. One confirm: "The due date can't be changed later; if it's wrong, cancel it and record it again."
* "Cancel" asks for a reason. A cancelled step stays visible as cancelled.
* Keyboard only, axe-core clean, 1024 and 1440 px.

**Done when:**
* `tests/check_csdl3_milestones_browser.ts` passes DW8 (record and see it), DW9 (cancel and re-record, both shown) and DW10 (no `agent/case:edit` → no buttons), each with a pass and a fail.
* `tests/journeys/j_74.ts` gains a walk: record a biometrics letter due in 30 days → its reminders are listed on the case → cancel and re-record. It exits 0 twice.
* PR body: "Fixes: QA-591", "Item: R1.74". qa re-scores R1.74 after it merges.
* **Not this row:** R1.74's other two Partial reasons, reminders that reach a person (PF-18n, NotificationPort) and the Needs you item (QA-471). They stay with their rows.

**Duplicate check (both parts):** at 15:2x IST on 20 Nov, `git grep -n -i "case_milestone\|CaseMilestone\|due_on\|dueDate" origin/main -- prototype/studio` returned 0 lines. No open PR names CS-DL3 or QA-591.

**Standard rules (P-644):** as in `CS-K1s.md`. Immigration values only from cited official sources (P-170). Labels marked Sample where not cited. Report to the current Lead and to Build Lead C.
