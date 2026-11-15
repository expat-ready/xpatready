# Brief: PF-21v, the complaint view fields for the screen (PF-21's part 3; cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6), rev 16.28 (ruling on #1821, comment 6894543666). **Starts when PF-21w (#1823) is on `main`**, because it edits PF-21w's `routes.ts`. Map row 109 needs it for PF-21s (J-109). Effort: Opus 5.5 **high** (a permissions row, P-608). No migration and no shared contract change.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-21v` and take **one row, PF-21v**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** the complaints screen (PF-21s) needs four things the server knows and the browser must not work out for itself (STANDARDS §7, no duplicated logic):
1. how many business days are left before acknowledging, or how many it is late;
2. the names behind the staff ids;
3. the firm's time zone;
4. who can be made handler.

The service keeps every rule, and the controller only passes values through. Requirement text: only what `python3 product/tools/trace-requirements.py --brief PF-21` prints.

**Read only these:**
* `api/src/platform/complaints/complaints.ts`: `view`, `ComplaintView`, `ComplaintPage`, `list`, `get`, the private `calendar` and `handlerIsActive`, `actor`.
* `api/src/platform/complaints/business-days.ts`
* `api/src/platform/complaints/routes.ts` (PF-21w)
* `api/src/platform/identity/guard.ts`
* the `PlatformStaff` model in `prisma/schema/platform.prisma`.

**What to build:**
* **`businessDaysLeft`** on every `ComplaintView` (list and `GET /:id`):
  - Add a pure function `businessDaysBetween(cal, from, to)` in `business-days.ts`, beside `acknowledgeBy`. It counts business days by the same rule `acknowledgeBy` uses: a weekday with opening hours that is not a closed day, in the firm's zone.
  - For an OPEN, not-acknowledged complaint, let T be today's local date in the firm's zone and D the local date of `acknowledgeBy`. The value is the number of business days d with T < d ≤ D (0 means it is due today). Once the complaint is past due (`overdue` true), it is the negative of the number of business days d with D < d ≤ T.
  - An acknowledged or closed complaint gets `null`.
  - Read the calendar **once per request**, not once per row. The sign must agree with the service's own `overdue` flag; test that.
* **`people`**: `ComplaintPage` and the `GET /:id` answer each gain `people: Record<staffId, displayName>`.
  - It covers every staff id that appears in what is returned: `handlerStaffId`, `recordedBy`, event `actor`s, and the `from`/`to` of a handler change.
  - Staff of any status are included (a deactivated person keeps their name on the record). The read is one `platformStaff.findMany` under `firmScope`.
  - It gives names only (no email, no roles), and only for ids in rows the reader may already see. It never widens what the list shows.
  - `system`-style actors are not staff, so they are left out.
* **`firmTimeZone`**: the zone string the service already reads (`TIME_ZONE`), on the list page and on `GET /:id`.
* **`GET /api/platform/complaints/handlers`**: declared `@PermissionKeys("agent/complaint:record")`, served by a new `ComplaintsService.handlers(ctx)`.
  - It returns `{ items: { id, displayName }[] }`: the firm's ACTIVE staff, ordered by `displayName` then `id`.
  - Nothing else about a person is returned.
  - Declare it **before** `/:id` in the controller, so Nest does not read "handlers" as an id.

**Named test cases (P-606):** list `PF-21v DW1` to `DW6` in the PR body before writing code; the reviewer ticks one per line. The file is `tests/check_pf21v_views.ts`, with a pass and a fail for each case, on the six seeded roles:
* **DW1 `businessDaysBetween`.**
  - Pass: a Friday-received complaint with a Monday closed day reports the right count on Friday, Tuesday and Thursday.
  - Fail: a weekend day or a closed day counted as a business day.
  - Also cover a daylight-saving change week in `America/Toronto`.
* **DW2 `businessDaysLeft` on the views.**
  - Pass: open and not acknowledged gives ≥ 0 before the date and < 0 when `overdue` is true.
  - Fail: an acknowledged or closed complaint shows a number instead of `null`.
  - The calendar settings are read once for a page of 100 (counted through a spy on `readSetting`, or the query count).
* **DW3 `people`.**
  - Pass: an OWNER's list carries the name of every handler, recorder and actor on the page, including one deactivated staff member.
  - Fail: a CASE_OFFICER handler's list carries no name of staff who appear only in complaints they cannot see.
* **DW4 `firmTimeZone`.** Pass: it equals the firm's setting. Fail: firm B's zone never appears in firm A's answer.
* **DW5 `GET /handlers`.**
  - Pass: OWNER, ADMIN and CASE_MANAGER get 200, active staff only, each item with exactly `id` and `displayName`.
  - Fail: CASE_OFFICER, BILLING_FINANCE and READ_ONLY get 403; no token gets 401; a suspended staff member is absent.
* **DW6 the start-up check:**
  - `assertEveryRouteDeclared` passes with the new route.
  - `GET /handlers` is not taken by the `/:id` route (no 404 "not found").
  - PF-21's and PF-21w's suites pass unchanged.

**Touch list (nothing else):**
* `api/src/platform/complaints/complaints.ts`
* `api/src/platform/complaints/business-days.ts`
* `api/src/platform/complaints/routes.ts`
* `tests/check_pf21v_views.ts` (new)

If anything else is needed, stop and ask in a PR comment.

**Must still be true:** PF-21's suite, PF-21w's suite, PF-4's suite, every other suite, the demo reset and C10.1 pass unchanged. The added fields are additive, so no existing assertion changes. If one would have to change, stop and ask. qa counts row 109 only after J-109 (P-606 (3)).

**Duplicate check (P-526):** BACKLOG, open PRs (`PF-21v`, `businessDaysLeft`, `complaints/handlers`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (P-278: permissions, personal data). The breaker tries three things:
* DW3: a name leaking through `people` from rows the reader cannot see.
* DW5: a keyless person, and another firm's staff.
* DW2: the time-zone edges.

The release holder reads the permissions diff before the label (P-423).

**P-610:** under 800 changed lines (code and tests), expected about 350. Split point if it would pass 800: part 1 is `businessDaysBetween`, `businessDaysLeft` and `firmTimeZone` (DW1, DW2, DW4); part 2 is `people` and `GET /handlers` (DW3, DW5, DW6). Re-review reads only the new commits (P-277).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5, with no model switch mid-session. Finish the row whole. If an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):**
* P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357).
* One row, one session, one PR; new files only outside the touch list.
* Opus reviewer (P-303); re-review reads only the diff (P-277).
* Label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385).
* Merge `main` only on a conflict (P-270).
---
