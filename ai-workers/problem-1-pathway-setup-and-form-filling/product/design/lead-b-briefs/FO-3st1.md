# Brief: FO-3st1, the bookings calendar, booking detail, attendance and the consult record (map row 42; rows 37, 39) (cloud builder lane; row owner Lead B)

Written 16 Nov 07:4x IST by Lead B (6), rev 16.43, for P-626. Row: BACKLOG **FO-3st1** (split of FO-3st, no new scope). Concept: `screens/fo-3-booking/concept.md` r2 (FO-3sc, #1819), approved; mock-up `screens/fo-3-booking/design/staff.html`. **Model: Opus 5.5, effort: high** (new screens with permissions; reviewer and breaker at high, P-605).

**Two PRs (P-610):**
* **Part 1, calendar, detail, new booking and attendance** (J-S1 to J-S4, J-S9). Starts when **PF-6 part 1** (the platform frame and session holder) and **FO-3a part 2b** (the feed) are on `main`. FO-3sa and FO-3sr are already there.
* **Part 2, the consult record and the next step** (J-S5 to J-S8). Starts when part 1 and **FO-3a part 2a** are on `main`.

**Not waited for (rev 16.43):** **PF-18a**: the office zone is the firm's zone until PF-18a, as concept §6b says, and PF-18a names the office as its own Done when line. **PF-6 part 2**: no piece of it is used. The row's old "waits on PF-6" means part 1 of PF-6 only.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens FO-3st1 part 1` (or `part 2`) and take **one part** end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the concept §1, §3 **BR-13 to BR-16**, §4 "Booking detail" and "New booking", §4c, §5 (every string; AG-04's words win where it has them), §6 (the table, "Who sees what", **FO-3st1's journeys J-S1 to J-S9**), §6b and §7 Q3, Q4; the mock-up `design/staff.html`;
* the requirement text the trace tool prints: `python3 product/tools/trace-requirements.py --brief FO-3st` (AG-4-39, -49, -50, -63, -67);
* on `main`: `web/src/modules/platform/session.ts` and `frame.tsx` (PF-6 part 1), `web/src/modules/front-office/routes.tsx`, FO-4's `sales/leads-page.tsx` and `lead-page.tsx` (the house list and panel patterns, and the Engage and Close lead panels the next step opens), `web/src/components/frame.tsx`, `web/src/MODULE.md`; the answers of FO-3a part 2b's feed, FO-3sr's and FO-3sa's routes, and for part 2 FO-3a part 2a's consult-record route, through their tests.

**What to build:** new files under `web/src/modules/front-office/booking/calendar/` (pages, `contract.ts` with zod shapes of the feed and consult-record answers), inside **`PlatformFrame`**, in a "Bookings" area (Calendar now; Settings is FO-3st3's). Its route lines go in `web/src/modules/front-office/routes.tsx`.
* **Calendar:** day, week and list views on our own components (no calendar library); Mine and Team (Team only with `agent/booking:list`); times in the office zone with the zone named.
* **Booking detail:** a side panel with When, Who, Attendance, Consult record and Next step, plus Reschedule and Cancel in "More".
* **New booking:** a dialog with FO-3sa's warnings and "Book anyway".
* **The attendance question:** asked, never guessed. It is pinned only for the viewer's own bookings, at the end + 30 minutes (BR-14).
* Part 2 adds **the consult record** (opens only after Attended, BR-15) and **the next step buttons**, taken from the record's `nextSteps` (BR-16). The buttons open FO-4's Engage and Close lead panels, and FO-5's retainer draft with `?consultRecord=<id>`. **Nothing is sent from the record.**
* The browser works out no permission or rule: it shows what the feed's `canAnswerAttendance`, `canEdit` and `nextSteps` say (STANDARDS §7). There is no simulated-person control and no `x-actor` header.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line), in `tests/check_fo3st1_calendar_browser.ts` (Playwright on the local stack, the seeded roles, Sample firm `maple`):
* **Part 1:** `FO-3st1 J-S1`, `J-S2`, `J-S3`, `J-S4`, `J-S9` exactly as concept §6 words them, a pass and a fail each.
* **Part 2:** `FO-3st1 J-S5`, `J-S6`, `J-S7`, `J-S8`, a pass and a fail each. **J-S7 checks that the retainer draft opens with the record's id.** "FO-5 shows the record's items and fee" is **FO-5cr**'s line, not this row's.
* `FO-3st1 DW10` (each part): axe-core finds nothing serious or critical on every page and state of the part; keyboard only; 375, 1024 and 1440 widths; the week view holds 60 bookings with no overlapping blocks.
* `FO-3st1 DW11` (each part): FO-4's suites and PF-6 part 1's suite pass unchanged; no new path overlaps `APP_ROUTES` (PF-1's test).

**Touch list:** new files under `web/src/modules/front-office/booking/calendar/`; `web/src/modules/front-office/routes.tsx` (its route lines only); `tests/check_fo3st1_calendar_browser.ts`; `web/src/MODULE.md` only if an invariant changes (else `Card unchanged: <reason>`). No API, schema or `ports/` file. Anything the API lacks becomes a question on the API row's PR, or a PR comment here.

**Duplicate check (P-526):** BACKLOG (FO-3st1; FO-3st2 and FO-3st3 are the other booking screens; FO-3a part 2 is the API), open PRs (`booking/calendar`), `main`, BUGS; one `Duplicate check:` line per part.

**Parallel safety:** `routes.tsx` is shared by every front-office screen row (FO-4, FO-3w, FO-3st2, FO-3st3, FO-5s). Each adds its own lines only, and the second PR merges `main` in. FO-3st2 and FO-3st3 may run beside this row: their folders are `availability/` and `settings/`.

**Reviewer and breaker** (P-278: new screens, permissions). The breaker tries:
* a Billing and finance host opening someone else's booking by a typed address;
* the week at 200 % zoom;
* a booking across a DST change;
* answering attendance twice from two tabs;
* a consult record fee of `-1`.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** as in `FO-3w.md`'s last paragraph (P-559; one row, one session, one PR; Opus reviewer, P-303; re-review reads only the diff, P-277; label only after `Reviewer: Approve <sha>` and green CI, P-277, P-385; merge `main` only on a conflict, P-270; the red-part suites before asking for the label; live AI off, US$0, P-175; push after every step, P-557; questions as a PR comment headed "Question for the tech lead"; report to the current Lead for the queue and to Lead B for the row; P-556).
---
