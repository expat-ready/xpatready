# Brief: PF-21s, the complaints list and record page (concept first; cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6). Row: BACKLOG PF-21s ("concept first"; map row 109). **Two stages in one lane:** stage 1 (the concept) can start now; stage 2 (build) starts when **PF-21w** (the routes; brief `PF-21w.md`) is on `main` and the concept is approved. The row also waits on **PF-6** (staff, roles and licences screens; not built): the concept says which PF-6 pieces it uses (the app frame's Settings entry, the staff picker for a handler). **If it uses none, ask Lead B in a PR comment to drop the PF-6 wait** rather than waiting. Effort: Opus 5.5 medium for the concept; the challenge is Fable 5.2 medium (P-608).


> **Rev 16.28 (15 Nov, Lead B ruling on #1821):** stage 2 waits on PF-21w, **PF-21v** (view fields `businessDaysLeft`, `people`, `firmTimeZone`, and `GET /handlers`) and **PF-6 part 1** (the platform frame and staff session holder). The chip counts are made in the browser from one `view=all` page ("100+" past one page). The full ruling is on PR #1821.
---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens PF-21s` and take **one row, PF-21s**, end to end.

**Stage 1, concept (records PR, skill `screen-concept`):** write `screens/pf-21-complaints/concept.md`, then a fresh challenge, then Lead B's approval (P-223 (4); there is no board). Inputs: only what `python3 product/tools/trace-requirements.py --brief PF-21s` and `--brief PF-21` print, PF-21's service (`api/src/platform/complaints/complaints.ts`: fields, `LIST_VIEWS` open/overdue/closed/all, `OUTCOMES`, the acknowledge-by date in `business-days.ts` (2 business days, Sample; corrected 15 Nov rev 16.28: there is no 30-business-day clock), who sees what), PF-21w's route table, `EXPERIENCE.md` and P-473's style. It covers:
* **Jobs:** an Owner or Admin sees every complaint; a handler sees and handles their own; a Case Manager records but does not read all.
* **List:** the four views with counts, the due date and the business days left (overdue in the one "needs you" colour), the subject's kind, the handler and the channel.
* **Record page:** the facts, then a timeline of events (insert-only; a closed complaint changes only by a new event), with the next step as the one filled button (acknowledge → steps → response sent → close with an outcome); change handler only for those holding both keys.
* **Record a complaint:** a drawer.
* **States:** empty, loading, overdue, closed, not found (the same 404 words for another firm's complaint and someone else's), a refused action.
* **Copy:** plain words, with "Sample" marked quietly on every field and period until the College's by-laws are read (Unconfirmed: no counsel).
* **qa journeys** and at most three founder questions (expected none).

**Stage 2, build (one PR):** files in `web/src/modules/platform/complaints/` (see `web/src/modules/README.md` and `_example/`), `tests/check_pf21s_complaints_browser.ts`.
* **Named tests (P-606), from the concept's journeys, listed in the PR body first, at least:** **DW1** Owner sees all four views with right counts · **DW2** a handler sees only their own · **DW3** the next-step button walks acknowledge → step → response sent → close · **DW4** change handler is hidden for a Case Manager · **DW5** another firm's complaint id shows the not-found state · **DW6** overdue shows the needs-you colour and days late · keyboard-only, axe-core, 375/1024/1440.

**Must still be true:** every suite passes unchanged; the screen calls only PF-21's routes: PF-21w's and PF-21v's (rev 16.28), nothing else.

**Duplicate check (P-526):** BACKLOG, open PRs (`PF-21s`, `complaints`), BUGS, `screens/`; one `Duplicate check:` line.

**Reviewer and breaker** (new screens).

**P-610:** the build PR stays under 800 changed lines, tests included. Split point: part 1 the list and the record drawer (DW1, DW2, DW5, DW6); part 2 the record page's actions (DW3, DW4). Re-review reads only the new commits (P-277).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
