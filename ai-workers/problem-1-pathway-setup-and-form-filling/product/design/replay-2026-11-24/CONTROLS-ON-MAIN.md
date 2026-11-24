# The 21 true Major claims on the 9 control PRs, against main (24 Nov 2026)

Asked by Lead 26. Read `origin/main` `ba2ad41e7` (code only, nothing run, no subagent). Severity here is the replay judges', not qa's. "Not recorded" means a keyword search of BUGS, BUGS-CLOSED and the BACKLOG files found no row; a differently worded row can be missed. Paths start at `prototype/studio/`; `sales`, `retainers`, `booking` are under `api/src/front-office/`, `billing` under `api/src/platform/`, the retainer page is `web/src/modules/front-office/retainers/retainer-page.tsx`.

**Result: 17 still on main and not recorded; 1 still on main and recorded; 3 fixed.**

| Claim | On main | Where, or what settled it |
|---|---|---|
| S01 M1 | Still | `tests/journeys/j_4.ts:88` accepts 400 or 201; `sales/routes.ts:41` is strict (422 expected) |
| S01 M2 | Still | `sales/routes.ts:33` LONG 20,000, unchanged since #2909; `tests/journeys/j_10.ts:370` sends 20,000. The service still caps after the row is found |
| S02 M2 | **Fixed**, #1843 | `sales/public.ts:233` drops control and invisible marks. Left over: an unknown `clickIdKind` still refuses the whole form (`:230`) |
| S06 M2 | Still (test gap) | `tests/check_pf15c_case_limits.ts:44` sets a corporate limit, opens no corporate case |
| S15 M1 | **Fixed**, #2321 | `sales/prospects.ts:73,88`: the lock no longer joins the stage |
| S15 M3 | Still | `sales/prospects.ts:343-362` no catch; `sales/corporate/service.ts:308` guards open prospects only; trigger in the fo1a migration `:786` |
| S17 M1 | Still | retainer page `:173`: Check and send ignores `changed` (`:70`) |
| S17 M2 | Still | retainer page `:116`: options are only eligible people |
| S17 M4 | Still | retainer page `:135` `disabled={!changed}`; no route edits a person's email (`people/edit.ts` has none) |
| S17 M5 | Still | retainer page `:46` sends no `templateId`; no template control |
| S17 M8 | Still | `retainers/service.ts:511-512` lists every company contact with email |
| S21 M1 | Still | `api/src/case-clients/live.ts:84-85`, `client-link.ts:15`: same key while the oldest client waits |
| S25 M1 | Still | `api/src/studio.ts:936-961` never checks `subjectKind`; `engine/resolver.ts:68` gives the person, not the filing |
| S25 M2 | **Fixed**, commit `7984c9398` (C7.7, 3 Nov) | `engine/render.ts:359-365` decides by role |
| S25 M5 | Still | `engine/runtime/case.ts:677` counts a group with no rows as open |
| S25 M6 | Still | `engine/runtime/case.ts:675` counts only questions in the caller's view; `runtime.ts:677` passes the client's |
| S25 M8 | Still, partly | `web/src/runtime/questionnaire.tsx:191-200`: no list, no checkbox. An officer note now exists (`engine/runtime/case.ts:466`) |
| S27 M3 | Still, **recorded: QA-571** (Minor) | `booking/service.ts:622` moves the host; `:695-697` mails only the current one |
| S28 M1 | Still | `billing/exit-notices.ts:46-49`; `billing/webhook.ts:44,126` (ENDED is final and skipped) |
| S28 M2 | Still | `billing/webhook.ts:163` writes the hold event only on a status change; `billing/exit-clock.ts:42` reads its reason |
| S28 M3 | Still | `billing/exit-notices.ts:65-95`: all refused, or nobody to send to, is still recorded as sent |

## Candidates for qa (17, not recorded), reachable today first

"Today" means by a screen or a route the running app has, read from code; none was walked.

1. **S17 M1** Check and send drops typed, unsaved edits and sends the old version. Ordinary use.
2. **S17 M4** "Save a new version here" cannot be pressed; a missing email has no way to be added. Ordinary use.
3. **S17 M5** Template cannot be changed on a draft; a conflict refusal tells the person to do that.
4. **S25 M6** Client can be told "Looks eligible so far" while ticked questions were left out (the PQR route; no screen asks for it was the judge's own note).
5. **S25 M5** "None apply" never lets the PQR result appear (same route).
6. **S17 M2** Representative no longer eligible: another name shows as chosen, draft can be stuck.
7. **S17 M8** A representative who cannot see the company reads all its contacts' emails.
8. **S15 M3** Undo convert answers 500 for good when the corporate contact was ended.
9. **S25 M1** A section check on a case fact, saved without a subject, fires but never blocks (the route; no screen calls it, by the judge's note).
10. **S25 M8** A required multi-choice field with no list cannot be answered.
11. **S01 M1** Journey J-4's check expects the old answer; it should fail when walked (not run).
12. **S01 M2** Over-long text refused with the wrong limit or unnamed (API callers).
13. **S21 M1** One client that keeps failing stops every later link of that firm (needs a lasting fault).

Needs a live payment provider or a hold, so not reachable in the demo by ordinary use (wiring not checked beyond `api/src/features/platform-billing-exit.ts`):

14. **S28 M3** Deletion warning recorded as sent when nobody got it. Highest harm of this group.
15. **S28 M1** Ended subscription told that a card restores the account; no route does that.
16. **S28 M2** Warnings give the wrong remedy when the cause changes during a hold.

Test only:

17. **S06 M2** No corporate case in the limit suite.

Not judged here: whether items 4, 5 and 9 are owned by a later screen row. BUGS and BACKLOG were not edited. Pushed once, not after each 7: the reading took three calls in one turn.
