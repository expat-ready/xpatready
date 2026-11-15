# Brief: FO-3vr, a booking follows the visibility of its record (map rows 37 and 42) (cloud builder lane; row owner Lead B)

Drafted 16 Nov 01:4x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **FO-3vr** (rev 16.22, #1811). It closes the visibility half of the booking capabilities: on `main`, `staffList` with `agent/booking:list` returns **every** booking of the firm, whatever the lead's owner. **Model: Opus 5.5, effort: high** (permissions; reviewer and breaker at high, P-605).

**Starts when:** FO-3m **#1831**, FO-3sa **#1828**, FO-3pa **#1830** and PF-19b's booking mail **#1860** are all on `main` (each changes `api/src/front-office/booking/service.ts`; overlapping touch lists never run at once, P-526). Its own waits, FO-2 part 1 (lead ownership) and PF-6b (own versus all), are on `main`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3vr` and take **one row, FO-3vr, booking visibility**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the requirement text, in full: **AG-4-67** (`domain/requirements-2026-11-02/02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md`, "Who sees a booking", rules 1-5, its two tests and its edge case "Host changed → the old host no longer sees it unless the record rule allows"), and **AG-2-64** rules 1-4 and 7 (`AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md`, "Who sees which leads and prospects"); AG-4-67's rule 1 also names AG-7-90 for a booking on a case: **out of this row** (`fo_booking` has no case link on `main`; the case side's booking link brings it);
* on `main`: `api/src/front-office/booking/service.ts` (`staffList`, `attendanceDue`, `staffBooking` and the routes that use it), `booking/staff.controller.ts`, `api/src/front-office/sales/common.ts` (`visibilityOf`, `sees`), `prisma/schema/front-office-booking.prisma` (`FoBooking.personId`, `prospectId`) and `front-office-sales.prisma` (`FoLead.personId`, `ownerStaffId`; `FoProspect.ownerStaffId`, `personId`);
* the module card `api/src/front-office/MODULE.md`.

**The rule, as built here (each line cites its source):**
1. **Lists need the key** (AG-4-67 rule 4): `GET bookings` and `GET bookings/attendance-due` stay behind `agent/booking:list` (FO-3sr, rev 16.22). Within them, a row is returned when **any** of 2-5 holds.
2. **The host always sees it** (rule 2): `staffId = me`.
3. **On a prospect** (`prospectId` set; rule 1 → AG-2-64 rule 3): the viewer sees that prospect: `seesAll` from `sales/common.ts`'s `visibilityOf`, or the prospect's `ownerStaffId` is theirs, or it has no active owner and the viewer `seesUnassigned`.
4. **On a person with leads, no prospect** (rule 1 → AG-2-64 rule 2 a-c): the viewer sees any lead of that person (`sees(v, ctx, lead.ownerStaffId)`, the lead list's own rule), or owns any prospect of that person (rule 2 c).
5. **Not linked yet** (no lead and no prospect for the person, or no person; rule 3): AG-2-64's unassigned-lead rule: `seesUnassigned`.
6. **The record rule is in the query** (rule 10 "Server-side filters"; AG-2-64 rule 1): one Prisma `where` (or one SQL `EXISTS` set) built from 2-5, inside `firmScope`, before ordering and the 92-day window; never a filter after the read.
7. **Direct links** (`GET bookings/:id`, attendance, reschedule, cancel, which go through `staffBooking`): the same rule; outside it the one not-found (`notInFirm("booking")`, AG-2-64 rule 4 e). The host's own stays open without the list key (rev 16.22).
8. **No masking** (rule 5): a visible booking keeps its full view; nothing is blanked for some viewers.
9. **Reuse, do not copy:** call `visibilityOf` and `sees` from `sales/common.ts`; write no second own-versus-all rule. (Not yet built and out of this row: AG-2-64 rule 2 d-e, the File owner and the possible-match flag; they join here when FO-9a lands, through the same helper.)

**Done when** (P-606: list the cases in the PR body before writing code; the reviewer ticks one per line; a line with no case is a red finding). In `tests/check_fo3vr_visibility.ts`, with the firm setting `platform.everyone_sees_all` on and a Case Officer role copy **without** `agent/prospect:view.all` made in the test's own data (PF-6b DW6's pattern):
* `FO-3vr DW1 pass/fail` (AG-4-67 test 1): the own-only Case Officer does not see a booking on a colleague's lead in `GET bookings`, `attendance-due` or `GET bookings/:id` (404); the `view.all` holder does.
* `FO-3vr DW2 pass/fail` (AG-4-67 test 2): the same Case Officer, as host of a booking on a colleague's lead, sees it in the list and by id.
* `FO-3vr DW3 pass/fail` (edge case): after a host change (staff reschedule to another host) the old host no longer sees it unless rule 3-5 lets them; the new host does.
* `FO-3vr DW4 pass/fail`: a booking on a prospect the Case Officer owns is seen; on a prospect owned by a colleague it is not; on an ownerless prospect it is seen only with `agent/prospect:assign` or `view.all`.
* `FO-3vr DW5 pass/fail` (rule 3): a not-linked booking is seen by an `agent/prospect:assign` holder and not by the own-only Case Officer.
* `FO-3vr DW6 pass/fail`: firm B's bookings are never returned to firm A; READ_ONLY (holds `agent/booking:list`, `view.all`) sees the firm's rows; Billing/Finance (no booking key) gets 403 on the list.
* `FO-3vr DW7`: the filter is in the query: with 150 bookings of which 3 are visible, a 92-day list returns exactly those 3 (none dropped by a page cap), and a spy on the Prisma call shows one `findMany` with the visibility `where`.
* `FO-3vr DW8`: FO-3's, FO-3sr's, FO-3m's, FO-3sa's, FO-3pa's and FO-2's suites pass unchanged except cases that asserted the old "every firm booking" answer, each named in the PR body with the AG-4-67 line that changes it.

**Duplicate check:** BACKLOG (FO-3vr; PF-6b's sweep left bookings out by ruling 4), open PRs (none on booking visibility at 01:4x IST 16 Nov; #1828/#1830/#1831/#1860 touch the same file, hence the wait), `main` (`staffList`'s comment says AG-4-67 but filters only by host), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** `api/src/front-office/booking/service.ts` (`staffList`, `attendanceDue`, `staffBooking` only), `tests/check_fo3vr_visibility.ts`, `api/src/front-office/MODULE.md` (one invariant: "a booking follows its record's visibility, or its host sees it (AG-4-67)"; tests line). **Not touched:** `sales/common.ts` (imported as is; if it needs a new export, stop and ask), any schema.

**Contract used:** none new. Inside one module (front office): booking reads the sales area's visibility helper (contracts `platform-and-front-office-contracts-2026-11-14.md` §2.1 "who sees which leads"); PF-6b's own-versus-all keys.

**Parallel safety:**
* **FO-3a part 2's staff read feed** (concept FO-3sc §6: it "applies AG-4-67") must call this row's filter, not write a second one.
* `booking/service.ts` is the booking area's one service: **FO-3m #1831, FO-3sa #1828, FO-3pa #1830 and #1860 (PF-19b booking mail, which also edits `service.ts`) merge first**, then this row; **FO-3a part 1a and 1b** (brief `FO-3a.md`) do not touch `service.ts`'s read methods but do touch the file's type and slot readers, so FO-3a part 1a starts after this row merges, or this row waits for it (whichever lane starts second waits).
* `api/src/front-office/MODULE.md` is shared by every FO row: change only the one invariant and the tests line; a second PR merges `main` in.

**Reviewer and breaker** (P-278: permissions): the breaker tries a booking id from another lead, a `staff=` query for another host, the attendance route, and a lead reassigned between list and open (AG-2-64 rule 7).

**P-610:** under 800 changed lines (estimate ~400). Split point if it would pass: part 1 lists (DW1, DW2, DW4-DW7), part 2 direct links and host change (DW3 and the by-id lines of DW1).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
