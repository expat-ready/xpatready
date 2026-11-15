# Brief: FO-3m, booking service answers (cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6). Row: rev 16.23 (BACKLOG once the release Lead copies it). It holds the small FO-3 service fixes found on #1811 and #1819. **Starts when FO-3sr #1811 is on `main`** (same booking feature; its routes are the base). Effort: Opus 5.5 medium.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3m, booking service answers` and take **one row, FO-3m, booking service answers**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** `api/src/front-office/booking/service.ts` (lines named below, as on `main` at your branch start), #1811's Questions 4 and 5, #1819's attendance finding, AG-4-39 rule 2.

**The six fixes, each a pass and a fail (P-606); file `tests/check_fo3m_answers.ts`:**
* **DW1** the attendance 400 names `outcome`, not `body` (near `service.ts:305`);
* **DW2** attendance on a cancelled booking before its start gives the not-active answer, not too-early (check cancelled first, near `:311-312`);
* **DW3** the service's own 403 (`need`, near `:722`) carries code `MISSING_PERMISSION`, like the guard;
* **DW4** the 400 titles on the list and attendance say what was refused, not "Not booked" (near `:124-127`);
* **DW5** the attendance body is `z.strictObject({ outcome })`, so an extra key gives 400;
* **DW6** the attendance job sends **no mail**: AG-4-39 rule 2, "Shown, not pushed (no email, no alert)". `runAttendanceAsk` stops sending `booking.attendance_ask`; the booking stays in attendance-due. Test: after the job runs, no mail with that template, and the booking is listed as due.

**Touch list:** `service.ts`, `tests/check_fo3m_answers.ts`; FO-3's and FO-3sr's tests only where an assertion names the old answer (list each line in the PR). **Must still be true:** every other suite.

**Duplicate check (P-526):** one line. **Reviewer only.**

**P-610:** small (expected under 300 lines); no split.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
