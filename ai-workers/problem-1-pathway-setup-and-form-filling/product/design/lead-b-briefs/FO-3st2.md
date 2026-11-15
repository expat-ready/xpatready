# Brief: FO-3st2, My account → Availability and Time off (map row 41's screen) (cloud builder lane; row owner Lead B)

Drafted 16 Nov 02:3x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **FO-3st2** (part 2 of 3 of FO-3st; shaping S2). Concept approved: `screens/fo-3-booking/concept.md` r2 (FO-3sc, #1819, on `main`). With FO-3a part 1b and this screen on `main`, map row 41 needs only J-41's walk. **Model: Opus 5.5, effort: high** (new screen; reviewer and breaker at high, P-605).

**Starts when:** FO-3a **part 1b** (named sets, time off, timings; brief `FO-3a.md`) and PF-6 **part 1** (the platform frame with My account at `/account`; brief `PF-6.md`) are on `main`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens FO-3st2` and take **one row, FO-3st2, Availability and Time off**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the concept `product/screens/fo-3-booking/concept.md` §3 **BR-17**, §4 "My account → Availability", §4 "States drawn", §5 "My account and Settings" (the Availability and Time off strings), §6 **FO-3st2's journeys J-A1 to J-A5** and "Who sees what"; the mock-up `screens/fo-3-booking/design/settings.html` (Availability part);
* requirement text, in full: **AG-4-62** rules 1-8, §8 Access and §11 Tests (`domain/requirements-2026-11-02/02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md`);
* on `main` after FO-3a 1b: `api/src/front-office/booking/settings/availability.controller.ts` (the routes and their answers) and `tests/check_fo3a_hours_timings.ts`; after PF-6 part 1: `web/src/modules/platform/{frame.tsx,session.ts,account-page.tsx,routes.tsx}`;
* the module card `web/src/MODULE.md`.

**What to build:** My account → **Availability** inside `PlatformFrame` (a section beside PF-6 part 1's read-only My account, at `/account/availability`): the set list on the left and the week editor on the right with its zone line "Times in <zone>" and "Change zone"; "Add a set", "Make default", "Delete set" with its confirm; per weekday "Add hours" / "Remove hours" / "Unavailable"; "Save hours" and the line "Existing bookings are not moved."; the **Time off** section below (whole day or From/To, "Save time off", "Remove", the empty text); for an Owner or Admin (holding `agent/booking-event-type:configure-availability`) the "Viewing" picker "Choose a colleague", hidden for everyone else. Field errors are the server's, on the field ("End must be after start.", "These hours overlap.", "You cannot delete your default set."). Files: new `web/src/modules/front-office/booking/availability/` (pages and `contract.ts`), the route line in `web/src/modules/front-office/routes.tsx`; the frame's My account menu gains the "Availability" item by one entry in `web/src/modules/platform/account-sections.ts` (PF-6 part 1's list; no edit to `frame.tsx`).

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_fo3st2_availability_browser.ts`:
* `FO-3st2 J-A1 pass/fail` (AG-4-62 rule 1): a new staff member sees one set "Normal hours", Mon-Fri 09:00-17:00, in the office zone, marked Default; no Delete on it.
* `FO-3st2 J-A2 pass/fail` (rules 1a, 1b): adding "Evening calls" Tue/Thu 18:00-20:00 and making it default changes the public slots (read through FO-3's slots route) for a type that names no set.
* `FO-3st2 J-A3 pass/fail` (rule 2): 14:00-13:00 → "End must be after start." on the field, nothing saved (the server's answer); two overlapping windows → "These hours overlap.".
* `FO-3st2 J-A4 pass/fail` (rule 8): an Admin picks Client F and enters time off Mon 26 Oct → saved, her booking that day unchanged (read through the API); a Case Manager sees no picker.
* `FO-3st2 J-A5 pass/fail` (rule 4): changing the zone to Asia/Kolkata shows "Times in Asia/Kolkata"; saving shows "Existing bookings are not moved.".
* `FO-3st2 DW6`: the empty states (no hours: "You offer no times on the booking page. Staff can still book you, with a warning."; no time off: "No time off planned.") and loading skeletons render; keyboard-only; axe-core with no serious or critical finding; 375, 1024, 1440.

**Duplicate check:** BACKLOG (FO-3st2; FO-3a 1b is its API; FO-3st3 is the types and timings screen), open PRs (none on `booking/availability/` at 02:3x IST 16 Nov), `main` (no availability screen), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** new files under `web/src/modules/front-office/booking/availability/`; `web/src/modules/front-office/routes.tsx` (one route line); one entry in `web/src/modules/platform/account-sections.ts`; `tests/check_fo3st2_availability_browser.ts`.

**Contract used:** FO-3a part 1b's availability routes over HTTP (contracts §2.2); the staff session from `modules/platform/session.ts` (PF-6 part 1). No `ports/` change.

**Parallel safety:** `front-office/routes.tsx` gets one line per screen row (FO-3w, FO-3st3, FO-4 parts): the second PR merges `main` in. `modules/platform/account-sections.ts` is PF-6's list: PF-6 part 2 and FO-3s5 also add one entry each; a one-line add, so the second PR merges `main` in. FO-3st3 builds in the front-office Bookings frame, not here: no overlap.

**Reviewer and breaker** (P-278: new screen): the breaker tries a set saved in two tabs, a zone search for an invalid name, and the colleague picker with a deactivated person.

**P-610:** under 800 changed lines (estimate ~600). Split point if it would pass: part 1 the sets and week editor (J-A1-J-A3, J-A5); part 2 time off and the colleague picker (J-A4, DW6's time-off states).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
