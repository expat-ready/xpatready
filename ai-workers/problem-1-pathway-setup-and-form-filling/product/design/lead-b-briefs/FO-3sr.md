# Brief: FO-3sr, the staff booking routes (FO-3's part 2; cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6). Replaces the FO-3sr line of the shared `ROW-w.md` brief (rev 16.4), which predates P-604, P-606 and P-610. **Ready now:** PF-4 #1744, FO-3 #1760, FO-3f #1785 and FO-3h #1799 are all on `main`, and no open PR builds these routes (checked 15 Nov 13:5x IST). Effort: Opus 5.5 **high** (a permissions row, P-608). Paste into a new cloud session on the repository (default branch `main`).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3sr` and take **one row, FO-3sr**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** FO-3 left its staff services without routes until PF-4 was on `main` (#1760 body: "Staff: create, reschedule, cancel and attendance are services taking PF-0p's `StaffContext`. Their routes are wired once PF-4 is on `main`"). FO-3sr wires them. No rule moves into the controller; the service keeps every rule. Requirement text: only what `python3 product/tools/trace-requirements.py --brief FO-3` prints (FO-3sr is FO-3's second part; AG-4-67, AG-4-39, AG-4-63).

**Read only these:**
* `api/src/front-office/booking/service.ts`, the section "staff (services until PF-4)" (`staffCreate`, `staffReschedule`, `staffCancel`, `recordAttendance`, `attendanceDue`, `staffList`, `staffGet`) and `staffBooking`;
* `api/src/front-office/booking/public.controller.ts` (the providers it exports) and `api/src/features/front-office-booking.ts`;
* `api/src/front-office/retainers/routes.ts`, the pattern to follow (`@`-form decorators compile for `src/front-office/**`, PF-4t #1775);
* `api/src/platform/identity/keys.ts` (`PermissionKeys`, `AnyStaff`, `staffOf`) and `guard.ts`.

**The routes** (prefix `api/front-office/bookings`; one new file `api/src/front-office/booking/staff.controller.ts`):

| Route | Declares | Service | Why this declaration |
|---|---|---|---|
| `POST /` | `@PermissionKeys("agent/booking:create")` | `staffCreate` | |
| `POST /:id/reschedule` | `@PermissionKeys("agent/booking:edit")` | `staffReschedule` | |
| `POST /:id/cancel` | `@PermissionKeys("agent/booking:edit")` | `staffCancel` | |
| `GET /?from&to&staff` | `@AnyStaff("a host always sees their own bookings, AG-4-67; the firm's list needs agent/booking:list, checked by the service")` | `staffList` | a key here would hide a host's own list |
| `GET /:id` | `@AnyStaff(same reason)` | `staffGet` | the service answers 404 for another host's booking without the list key |
| `GET /attendance-due` | `@AnyStaff("the host's own due questions; the firm's with agent/booking:list")` | `attendanceDue` | |
| `POST /:id/attendance` body `{ outcome }` | `@AnyStaff("the host answers their own, AG-4-39; others need agent/booking:edit, checked by the service")` | `recordAttendance` | |

Register `GET /attendance-due` before `GET /:id`. `features/front-office-booking.ts` adds the new controller to its `controllers` list (one line). Every handler passes `staffOf(req)`.

**Named test cases (P-606):** list `FO-3sr DW1` to `DW10` in the PR body before writing code; the reviewer ticks one per line. File `tests/check_fo3sr_routes.ts`, a pass and a fail each, on the six seeded roles (OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE, READ_ONLY):
* **DW1** create: OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER → 201; BILLING_FINANCE and READ_ONLY → 403 `NOT_ALLOWED`.
* **DW2** reschedule and cancel: the four roles with `agent/booking:edit` → 200; BILLING_FINANCE and READ_ONLY → 403.
* **DW3** list: a role with `agent/booking:list` sees the firm's bookings and may filter by `staff`; a BILLING_FINANCE host (no list key) sees only their own, never 403, and `staff=` another person is ignored.
* **DW4** get: another host's booking without the list key → 404 (never 403, so ids are not confirmed).
* **DW5** attendance: the host without `agent/booking:edit` records their own → 200; a non-host without it → 403; before the start → 409 (the service's too-early answer); on a cancelled booking → 409 (its not-active answer).
* **DW6** attendance-due: own only without the list key; the firm's with it; a booking ending 29 minutes ago is not due, 31 minutes ago is.
* **DW7** no token → 401 `NOT_SIGNED_IN` on all seven routes.
* **DW8** firm A's token on firm B's booking id → 404 on get, reschedule, cancel and attendance; firm B's booking unchanged.
* **DW9** PF-4's start-up check passes with the new routes; `assertEveryRouteDeclared` (`guard.ts`) refuses a route list with one of the new routes stripped of its declaration (no second app).
* **DW10** the create answer carries no booking-link token (FO-3f item 3, review m7, kept).
Then the short scripted journey **FO-3sr W1**: create → it appears in the list → reschedule → the clock past the start → attendance Attended → `booking.completed` in the outbox; and a second booking cancelled → `booking.cancelled`.

**Touch list (nothing else):** `api/src/front-office/booking/staff.controller.ts` (new), `api/src/features/front-office-booking.ts` (one line), `tests/check_fo3sr_routes.ts` (new). If a case needs a change to `service.ts`, stop and ask in a PR comment (P-606: never widen the row silently).

**Must still be true:** FO-3's, FO-3f's and FO-3h's suites, PF-4's suite, every other suite, the demo reset and C10.1 pass unchanged. qa counts map rows 37 and 41 only after J-37/J-42 (P-592, P-606 (3)); say so in the PR body.

**Duplicate check (P-526):** BACKLOG, open PRs (`FO-3sr`, `staff.controller`, `api/front-office/bookings`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (P-278: permissions). The breaker tries DW3, DW4, DW5 and DW8 through the API. The release holder reads the permissions diff before the label (P-423).

**P-610 (founder, 15 Nov):** keep this PR under 800 changed lines, tests included (expected ~350). If it would pass 800, split it: part 1 the create, reschedule, cancel, list and get routes (DW1-DW4, DW7-DW10); part 2 the two attendance routes (DW5, DW6) and W1. Re-review reads only the new commits since the last Approve (P-277).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
