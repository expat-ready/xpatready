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
  * m1: at 375 px, Where moves under the name, and zones break only at the slash. Below 768 px Hours is hidden and shown nowhere else (round 2 Minor: breaker m6, reviewer r2-m1).
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

---

# PF-18s part 2 — the "?" button and Help & support: build notes

Part 2 of 3 (concept #2332, approved by Lead 19 with the challenge's Majors; the part order of challenge M7). R1.92. US$0, live AI off, no model call. Part 3 (Notifications) runs in another lane; none of its files are touched.

## What a person can now do
* On every staff page in PF-6's frame, anyone who holds `agent/support-ticket:create` sees a **"?"** in the header ("Get help with this page"). It opens **Ask for help**, a right panel with one text box, up to three files and the line "We'll note the page you're on: /account/licence". Only the path is noted, never the query, fragment, title or any field (m7). Send → "Ticket sent. We'll answer in Help & support." with "Open your ticket".
* **My account → Help & support** (everyone with `agent/support-ticket:list`) lists their tickets by subject (the first line), with the status in words and a tooltip; Waiting on firm is orange. Owner and Admin see the whole firm's tickets, with a "Raised by" column. "Raise a ticket" opens the same panel.
* **One ticket**: the subject as heading, "Raised from <page>" quietly, messages oldest first ("You", the colleague's name, or "ExpatReady support"), attachments by a short-lived link, and a reply box. A Closed ticket has no box: "This ticket is closed. Raise a new one if you still need help."

## Files
* API, additive, no migration: `api/src/platform/support/support.ts`: list items and one ticket answer `subject` (first line with words, cut to 80 characters, M5) and `raisedByName`; one ticket's staff messages answer `authorName` (M4). Names come from `platform_staff` in the ticket's firm in the same read, so the Help pages never call `GET /staff`.
* Web, under `web/src/modules/platform/`:
  * `settings/help-button.tsx` (`HelpButton`, `RaisePanel`), `settings/support-page.tsx` (list, ticket, reply), `settings/support-contract.ts` (no app imports).
  * **Frame file changed: `frame.tsx`**: one slot in the header's `controls` (plus its two imports). The "?" is hidden until the terms check is done and while terms are pending (m6), and for anyone without the create key.
  * One line each in `account-sections.ts` and `routes.tsx` (two routes).
  * `session.ts`: `staffApi` takes an optional `form` (multipart, for the files). Additive; nothing else calls it with `form`.
* Test: `tests/check_pf18s_help_browser.ts` (DW1-DW6, each with a pass and a fail; 25 checks). Screenshots `screenshots/pf18s-help-*.png`.
* Module-card rows: part 2 lines in `PF-18s.md` beside the web-shell and api-platform cards.

## The double-send guard (#2064, challenge M3, owed line 2)
* Raise and reply each keep a `sending` ref set before the request and cleared when it settles (the complaints and office-panel pattern). Send also shows busy and is disabled.
* **The check holds the first POST** (`page.route`) until the second action was dispatched: on Raise a second click (forced) and two `requestSubmit()` in one moment, which bypass the disabled button so only the ref can stop them; on reply Enter twice on the focused Send plus a second submit. Then it counts POSTs at the network and rows in the database: 1 and 1.
* **Red run, guard line removed** (both `if (sending.current) return;` lines commented out, fresh copy `pf18s2r` on :4722, 22 Nov): `FAIL PF-18s DW2 … {"seenWhileHeld":3,"seen":3,"made":3}`, 12/14 then stopped, exit 1. Restored afterwards (`git status` clean on both files).
* The fail line in the check itself: the same two sends straight to the API make two tickets, so the server does not deduplicate and the screen's guard is what stops the second.
* **Known residual (m10):** a send whose answer is lost and then retried still lands twice: there is no server key. If qa sees it, it becomes a PF-18b `Idempotency-Key` row.

## How the challenge's points landed (part 2's share)
* **M3**: above. **M4**: names on records from the server, no `GET /staff`. **M5**: the subject is the list's link and the ticket's heading; the page moves to a quiet "Raised from" line, and the list has no page column.
* **M6**: support's reply and Closed are seeded by SQL in the check, labelled scaffolding for PF-17's console (P-33). No demo seed was added: the demo's sample firm has no ticket until someone raises one (a Sample "Waiting on firm" seed can come with PF-17).
* **m4**: plain Enter in either box is a new line, never a send; no Ctrl/⌘+Enter. After a failure focus goes back to the box; after a reply, to the new message.
* **m6**: the "?" is hidden while terms are pending. **m7**: path only; the rule for other frames ("never note a public or token route") stays with the Q3 follow-up row.
* **m9**: support's 422 `fields` (`body`, `files.N`) show on their fields.

## Deviations and why
* **"?" only in PF-6's frame** (Q3 as recommended): the sales, Studio and case frames get it in the follow-up row.
* **Attachments show as "Attachment 1", "Attachment 2"**: the server stores no file names (`support/<id>/<n>`).
* **A 404 on a raise** (no such route, an old copy) shows "Not sent… try again", the same as a 500, rather than the server's words.

## Checks run
* `check_pf18s_help_browser.ts`: 25/25 on a fresh isolated copy (`pf18s2`, :4721), exit 0. Guard removed: red (above).
* `--changed` selected 333 suites (the shared `session.ts` and `frame.tsx`), so only the touched files' suites ran here through `run-suites.sh --only`; the PR check runs the rest. Results are in the PR body.
* `graph.mjs --check` exit 0. `count-any`: 416, the same as the base. `module-cards.py pr` and `tree`: PASS. Web and API `tsc --noEmit`: clean.
