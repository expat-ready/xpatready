# PF-18s part 1 — Offices: build notes

Part 1 of 3 (Lead 19 on #2332, P-223 (4): concept approved, with the fresh challenge's 7 Majors taken as written, split in 3 parts under P-610; Q1: the lines stay in My account). Concept and challenge: `concept-draft.md`, `challenge.md` (records PR #2332). R1.92. US$0, live AI off, no model call.

## What a person can now do
An Owner or Admin opens **My account → Offices**.
* With one office they see no list and no zone, only "Add an office" and what it does.
* They can add an office. The time zone shows pre-filled from the province before saving, and they can change it.
* They can edit an office's name, address and zone.
* They can place each person in an office, or in none, under "Who works where".

A Case Officer, or anyone without `agent/settings:edit`, has no Offices line. Opened by address, the page says "Only an Owner or Admin can manage the firm's offices."

## Files
* API, additive, no migration:
  * `api/src/platform/settings/offices/routes.ts`: `GET offices/provinces` and `StaffOfficeController` (`PUT staff/:staffId/office`).
  * `service.ts`: no change writes nothing (m1). The answer's `officeId` is lowercased.
  * `staff-read/service.ts`: `officeId` on the staff rows.
  * `features/platform-settings-personal.ts`: registers the controller.
* Web, under `web/src/modules/platform/settings/`:
  * `offices-page.tsx`
  * `office-panel.tsx`
  * `place-panel.tsx`
  * `offices-contract.ts` (no app imports)
  * one line each in `account-sections.ts` and `routes.tsx`.
* Test: `tests/check_pf18s_offices_browser.ts` (DW1-DW7, each with a pass and a fail; 25 checks). Screenshots are in `screenshots/`.
* Module-card rows: `PF-18s.md` beside the api-platform, api-features and web-shell cards.

## How each Major and minor of the challenge landed (part 1's share)
* **M1:** the menu line and the page are keyed `agent/settings:edit`. With one office there is only "Add an office" and its line, never an office card or a zone. DW1 has a pass and a fail.
* **M2:** `GET offices/provinces` reads from `zones.ts` only.
  * The zone is pre-filled in the add panel as soon as a province is picked, and stays editable.
  * `timeZone` is sent only when the person picked one, so the audit says `province` when untouched and `chosen` when picked (DW3 pass and fail).
  * Provinces show as Canada Post codes. The pack has no names, and the web types none in (the challenge's rule).
* **M7:** the part order was taken as written.
* **m1, PUT:** keyed `agent/staff:manage`. `officeId` is added to the existing staff read; there is no new placements route. A repeat placement writes no audit line (DW6).
  * The PUT carries no version. If two Admins place the same person, the last one wins and both changes are audited. This is accepted: a placement is one value, and both lines are in the trail.
* **m5:** Change opens a right panel, not a centred dialog.
* **m8:** the subtitle reads "In Settings: Advanced → Offices".
* **m9:** a refused office is a 422 with `fields`, shown on each field. A duplicate name is a 409, shown in the panel.

## Top 5 production improvements over the board
1. The pre-filled zone is visible and editable before saving, not only in a later edit (M2).
2. "N people have no office yet", with what that means for their times.
3. "First office" is marked in the list, so it is clear which row was written from the firm's settings.
4. The hours summary joins days with the same hours ("Mon–Fri 09:00–17:00").
5. Focus goes back to the button that opened a panel. If that row has gone, it goes to the page heading.

## Deviations and why
* **The 409 reload re-reads `GET offices`.** It does not use the 409's `current`, because the staff client's `problemOf` keeps only a problem's plain fields. Widening that shared contract was not this part's job.
* **The firm's own zone is not shown on add when no province is picked.** No firm-settings read exists on this page. The option reads "Your firm's time zone", and the server fills it in.

## Checks run
* `check_pf18s_offices_browser.ts`: 25/25 on an isolated copy.
* Through `run-suites.sh --only`: `check_pf18a_offices` 87/87, `check_pf4b_session_reads` 57/57, `check_pf1_module_routes` 28/28, `check_pf28_inputs` 41/41, `check_pf6_staff_browser` 90/90, `check_pf6a_frame_browser` 52/52; all exit 0.
* `--changed` selected 350 suites, which is effectively all of them. Per the skill, only the touched files' suites ran here; the PR check runs the rest.
* `graph.mjs --check` exited 0. `count-any`: 416, the same as the base. `module-cards.py pr` and `tree`: PASS.
* **Found while testing:** the input sweep asks for a bad path id to be a 404 before the body is read, so the PUT reads the id first.

## Self-score (honest; D17 and D20 need an intended user, so they are not scored)
* **Strong:** D5 (refusals in words on the field, 409 reload), D9 (keyboard and focus return), D10 (no ids on the main path), D11 (one filled button per page).
* **Weaker:**
  * D4: provinces appear as codes.
  * D6: hours and closed days per office are read-only. AG-16-75's editor is not built here.

## Known gaps (Not built in part 1)
* Editing an office's hours and closed days (AG-16-75).
* Default lead representative (AG-16-68).
* Province names.
* The office's own hours in Home's zone line is PF-18h's.
* Parts 2 ("?" and Help & support, with #2064's double-send guard) and 3 (Notifications) follow.

## Round 1 (review Block and break Block at f5a1ea6c) and what changed
* **B1:** "Who works where" now has its own cache entry, `["pf","staff","placements"]`. Before this, Team and Offices overwrote each other's staff list and Team went blank. The new check goes Offices → Team → Offices by the menu.
* **M1:** while a province gives a zone, "Your firm's time zone" is not offered. The server would pre-fill the province's zone over an empty choice. When a province is picked after choosing the firm's zone, the province pre-fill comes back. Covered by a check line.
* **Breaker's Minors:**
  * m1: at 375 px, Where and Hours move under the name, and zones break only at the slash.
  * m2: the panel title is "Edit office", which no longer overflows on a long name.
  * m3: "Canada" typed as a country abroad is refused on the field.
  * m4: after a refusal, focus moves to the field in error, else to the notice.
  * m5: the place panel opens on the ticked office.
* **Reviewer's Minors:**
  * m-2: a name in use is shown on the name field.
  * m-4: the check waits for focus to come back after the panel closes. This was the reviewer's 24/25 flake.
  * m-5 and m-6 are covered by m4 and m2 above.
  * The zone hint now says what happens when no province gives a zone.
* **Left as Minors, with their reason:**
  * The country and required-field words come from PF-18a's service and the shared `http/input.ts`, outside this part's files.
  * Hours wrap at 1024 px.
  * graph.mjs does not see `staffApi(` calls, a tool gap.
  * Outside Canada, the firm's zone is not named on add, because no firm-settings read exists on this page.
* `check_pf18s_offices_browser.ts` now has 28 checks: 28/28 on two fresh copies.
