# Brief: FO-3sa, staff booking at any time (cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6). Row: rev 16.23 (BACKLOG once the release Lead copies it). It is the staff calendar's API half (FO-3st1 waits on it and on FO-3a part 2). **Starts when FO-3sr #1811 is on `main`** (same booking feature; its routes are the base). Effort: Opus 5.5 high (permissions).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3sa, staff booking at any time` and take **one row, FO-3sa, staff booking at any time**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** the concept `git show origin/lead-b-front-office:ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/fo-3-booking/concept.md` (approved r2, #1819; on `main` once #1819 merges) §3 BR-13 and §6 (Row X2); AG-4-63 in full (`python3 product/tools/trace-requirements.py --brief FO-3st1`); `api/src/front-office/booking/service.ts` (`staffCreate`, `staffReschedule`, `create`, `move`), `slots.ts`, `staff.controller.ts` (FO-3sr).

**What to build:**
* `staffCreate` and `staffReschedule` accept a time **outside** the free slots. The answer lists the warnings (`CLOSED_DAY`, `OUTSIDE_HOURS`, `OVERLAP`), and nothing is saved until the body carries `bookAnyway: true`.
* With it, the booking saves, the host row's `overlapConfirmedByUserId` is the staff member, and the audit entry records the reasons (AG-4-63 field 9).
* The host may be chosen (`hostStaffId`) among the type's hosts. A deactivated host is never offered (AG-4-53).
* The public page never offers those times.

**Named tests (P-606), list them in the PR body first; file `tests/check_fo3sa_any_time.ts`:**
* **DW1** a closed-day time gives the warning "Closed day", nothing saved; then Book anyway saves it, with the reason in the audit;
* **DW2** an overlap gives the warning; then Book anyway keeps both bookings, with the confirmer recorded;
* **DW3** outside the host's hours gives the warning;
* **DW4** Cancel (no `bookAnyway`) saves nothing;
* **DW5** a public slots request never shows that time;
* **DW6** a deactivated host gives the field error "choose an active host";
* **DW7** reschedule to any time gives the same warnings and Book anyway;
* **DW8** BILLING_FINANCE and READ_ONLY still get 403, and firm B's host id gives 404.

**Touch list:** `service.ts` (staff create and reschedule), `staff.controller.ts` (body fields only), `tests/check_fo3sa_any_time.ts`. **Must still be true:** FO-3's and FO-3sr's suites, and every other suite.

**Duplicate check (P-526):** one line. **Reviewer and breaker** (permissions, double-booking).

**P-610:** under 800 changed lines. Split point: part 1 create (DW1-DW6, DW8); part 2 reschedule (DW7).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
