# Brief: FO-3pa, public booking answers (cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6). Row: rev 16.23 (BACKLOG once the release Lead copies it). It is the API half of the public booking pages (FO-3w waits on it). **Starts when FO-3sr #1811 is on `main`** (same booking feature; its routes are the base). Effort: Opus 5.5 high (public door).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3pa, public booking answers` and take **one row, FO-3pa, public booking answers**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** the concept `git show origin/lead-b-front-office:ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/fo-3-booking/concept.md` (approved r2, #1819; on `main` once #1819 merges) §3 BR-1 to BR-11 and §6 (Row X1); `api/src/front-office/booking/public.controller.ts`, `service.ts` (the public section: `publicSlots`, `publicBook`, `manageView`, `selfReschedule`, `selfCancel`), `ics.ts`, `tokens.ts`; FO-1b's booking types schema (`prisma/schema/front-office-booking.prisma` or where FO-1b put it). Requirement text: `python3 product/tools/trace-requirements.py --brief FO-3w` (AG-4-16..20, -36..38).

**What to build (no schema change unless a field below is missing; if one is, stop and ask in a PR comment, P-600):**
* `GET /api/public/firms/:firmKey/book`: the firm's active types with `showOnBookingPage`, as name, slug, length and modes only (no ids, BR-2).
* The type and manage answers carry `allowReschedule` and `allowCancel`, the firm's operating name, phone, email and address, the self-service limit in hours, and the join link once the booking is confirmed.
* **The consent tick is optional** (AG-4-19 rule 3, "Booking never needs the tick"): no tick means a booking with no marketing consent; a tick passes the wording id and time as today.
* `GET /api/public/bookings/:token/ics`: the same `.ics` as the confirmation mail (`ics.ts`).
* `POST …/:token/cancel` takes an optional `reason` (up to 500 characters), kept in the audit entry only.

**Named tests (P-606), list them in the PR body first; file `tests/check_fo3pa_public_answers.ts`:**
* **DW1** the list shows only active shown types and no id, and an unknown firm gives the one not-found (BR-2);
* **DW2** a hidden type's page gives the same not-found as an unknown slug;
* **DW3** booking without the tick succeeds and records no marketing consent; with the tick, one consent with the wording id;
* **DW4** the answers carry the firm's contact details and the limit hours, and never a staff or firm id;
* **DW5** `allowCancel: false` gives a cancel attempt by link the refusal, with the booking unchanged;
* **DW6** the `.ics` download equals the mailed invite (UID, SEQUENCE, UTC instants), and a voided token gives 404;
* **DW7** the cancel reason is kept in the audit only and never shown back on the public page;
* **DW8** the join link is shown only after confirmation, never on the type page.

**Touch list:** `public.controller.ts`, `service.ts` (public section only), `tests/check_fo3pa_public_answers.ts`. **Must still be true:** FO-3's, FO-3f's, FO-3h's and FO-3sr's suites, and every other suite.

**Duplicate check (P-526):** BACKLOG, open PRs (`FO-3pa`, `public/firms`, `booking`), BUGS; one line. **Reviewer and breaker** (public door: DW1, DW2, DW5, DW6).

**P-610:** under 800 changed lines. Split point: part 1 the list, answers and optional tick (DW1-DW4, DW8); part 2 the flags, `.ics` and cancel reason (DW5-DW7).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
