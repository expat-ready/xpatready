# PF-18s part 1 (My account → Offices): break report

Breaker: a fresh context that did not build it. Commit `f5a1ea6c4` on `claude/affectionate-cerf-jw9hv7` (PR #2897). Scope: `git diff origin/main...f5a1ea6c` only, checked against `concept-draft.md` and `challenge.md` on `origin/claude/runtime-pf18s-concept` (Lead 19: part 1, with the challenge's Majors) and `build-notes.md`. Ran on an isolated copy `break_pf18s` on :4445 (`PLATFORM_IDENTITY=local AI_LIVE=off`), restarted once for a one-office state, then stopped. The web bundle was checked to be current with the source. Headless Chromium through the studio's playwright; curl for the API; psql for `audit_event` and `platform_staff_office`. US$0, no model call. Paths below are under `prototype/studio/web/src/modules/platform/`.

## Findings

**B1 (Blocker): the Offices page shares the Team page's query cache entry with a narrower parser. Team then goes blank, and "Who works where" shows the wrong offices.**
* Cause: `settings/offices-page.tsx:19` uses the key `["pf","staff","list",token]`, the same key as `staff/team-page.tsx:22`, `staff/licences-page.tsx:24`, `booking/settings/types-page.tsx:33` and `availability-page.tsx:51`.
  * The two pages parse the data differently. Offices uses `People.parse`, which drops `email`, `roles` and the top-level `seats`. The others use `StaffList.parse`, which drops `officeId`.
  * Whichever page fetches last writes its stripped shape into the shared cache.
* (a) Steps: sign in as Owner (user-R). Open `/platform/offices` and wait for "Who works where". Then click **Team** in the My account menu (client navigation).
  * Expected: the Team page.
  * Actual: a blank white page. The browser reports `pageerror: Cannot read properties of undefined (reading 'line')`, from `staff/team-page.tsx:39,44` (`list.data.seats.line`).
  * Happens every time, both straight away and after the 2 s staleTime. A reload recovers. This breaks an existing screen one click from the new one.
* (b) Steps: place the Case Officer in Calgary and the Owner in the first office (API, 200). Open `/platform/team`, then click **Offices** within 2 s.
  * Expected: Calgary and the first office in "Who works where".
  * Actual: all three rows say "No office", with the notice "3 people have no office yet". It is still wrong 8 s later; nothing refetches until a reload.
  * Pressing Change on the Case Officer opens the panel with "No office" checked. Save is disabled for "No office", so the person cannot be taken out of an office they are shown not to have.
  * This is the "Who works where" fact the part exists to show (DW4 "reload shows it", challenge m1).

**M1 (Major): choosing "Your firm's time zone" after picking a province saves the province's zone, and the audit says "province".**
* Steps: Add an office, name it, pick province AB. The zone shows `America/Edmonton` with "Pre-filled from AB". Open Time zone and choose **Your firm's time zone**.
  * The hint now reads "Your firm's time zone is used unless you choose another." Press Add office.
* Expected: the firm's zone (`America/Toronto`), or the option is not offered while a province is set; audit `chosen`.
* Actual: the office is saved as `America/Edmonton`. The audit line reads `timeZoneFrom: province`, "pre-filled from the province".
* Cause: `settings/office-panel.tsx:43` sends `timeZone` only when `f.zoneTouched && f.zone`. The firm option's value is `""` (`FIRM_ZONE`, `:89`), so the person's explicit choice is dropped and the server pre-fills from the province again.
* Why Major: this is challenge M2's path ("the person confirms or edits it", AG-16-75 §10; "chosen when picked", build notes). The saved zone, which runs that office's deadlines and bookings, differs from what the panel told the person would be used. The toast shows the real zone only after saving.

**m1 (Minor): at 375 px the offices table scrolls inside itself and is not stacked.**
* Concept §4 "States drawn": "375 px: tables become stacked rows, the page never scrolls sideways".
* Actual: the page does not scroll (`scrollWidth` 375). The Offices table region is 437 px wide inside 341 px, so the Hours column and the **Edit** buttons are off-screen to the right. They can be reached only by scrolling the table (it is focusable, so the keyboard works).
* Names break letter by letter ("Calg|ary", "Lond|on", "Sam|ple immi|grati|on firm").
* `settings/offices-page.tsx:76` uses the shared `Table`, unchanged; the builder's own `pf18s-7-offices-375.png` shows the same layout.

**m2 (Minor): a 120-character unbroken office name makes the edit panel scroll sideways.**
* Steps: an office named "W"×120 (allowed). Press Edit at 375 px.
* Actual: the panel title "Edit WWW…" does not wrap. The dialog's `scrollWidth` is 2276 px inside 374 px. The concept lists "long content (120-char office name)" among the states.
* `settings/office-panel.tsx:68`; the list cells wrap correctly with `[overflow-wrap:anywhere]`.

**m3 (Minor): with "Outside Canada" and country `ca` (or `Canada`), the office is saved as a Canadian office with no province.**
* It gets the firm's zone and the Where column says "Canada".
* The radio says abroad, yet no field error appears. `settings/office-panel.tsx:40` sends the typed country as-is, and the service maps `canada`/`CA` to `CA`.

**m4 (Minor): after a refused save, focus stays on the panel container (a `DIV`), not on the error summary or the first field in error.**
* Steps: Outside Canada, empty country, Add office.
* What does work: the summary "Please check the highlighted details." shows, and Country gets `aria-invalid=true` and its message. But a keyboard or screen-reader user is not taken to either.
* The concept cites BIC-13 (errors on the field plus a summary).
* Secondary: the Country message reads "This is not in the expected format." It does not say "a two-letter country code", which is what the service says in `issues`.

**m5 (Minor): the place panel opens with focus on the first office's radio, not on the checked one.**
* Steps: Change on a person with "No office". Focus lands on "Sample immigration firm", which is unchecked.
* Pressing Space, or Down then Up, checks that office. Opening and pressing Enter does nothing (Save is disabled), so no wrong placement happens without a further key press.
* `settings/place-panel.tsx` relies on the Panel's default first-focusable element.

## What held
* **Roles:**
  * A Case Officer has no Offices menu line.
  * `/platform/offices` by address shows "Only an Owner or Admin can manage the firm's offices." with no list and no Add (M1).
  * As the Case Officer, `GET offices/provinces` returns 403 (`agent/settings:edit`), `PUT staff/:id/office` returns 403 (`agent/staff:manage`), and `GET /staff` returns 403. With no token, the PUT returns 401.
* **Cross-firm:**
  * Firm A's Owner placing firm B's staff member → 404.
  * Placing A's Case Officer in B's office → 404.
  * Firm B placing A's Case Officer → 404.
  * Nil UUID office → 404.
  * `officeId` on staff rows is firm-scoped.
* **Malformed input:**
  * A bad path id returns 404 before the body is read, even when the body is also bad.
  * Extra field, missing `officeId`, non-UUID, number, or array body → 422 with `fields`.
  * `null` or invalid JSON → 400. A body over 2 MB → 413.
  * Upper-case UUIDs in the path and the body are accepted and lower-cased.
* **Audit (m1):**
  * Repeat placements, including an upper-case repeat, and taking out someone who already has no office write no line.
  * Place, move and take out write one line each.
  * Ten concurrent identical PUTs write exactly one line.
  * Six concurrent alternating PUTs leave a consistent from→to chain (advisory lock).
* **Zone pre-fill (M2):**
  * Picking AB pre-fills `America/Edmonton` before saving.
  * Saved untouched, the audit says `province`. A picked zone is audited `chosen`. "Mountain" is refused with "Choose a time zone from the list".
  * `provinces` is served from the pack only (13 codes with their zones).
* **Duplicates:**
  * "  CALGARY " against "Calgary" → 409, shown in the panel.
  * Three concurrent first adds ("Calgary", "calgary ", "Halifax") on a one-office firm give 201, 201 and 409. Exactly one first office is written.
* **Names:**
  * A zero-width space or RLO in a name is refused, with the message on the name field.
  * Arabic, and mixed Arabic/Latin names, save and render.
  * 120 code points are accepted; 121 are refused; a 120-emoji ZWJ name is refused.
* **Double submit:** a double click plus two Enters on Add office, with a 1.5 s held response, sends one POST and creates one office.
* **Stale version:**
  * A second-tab PATCH, then Save, gives 409. The text reads "Someone changed this office since you opened it. We've loaded the latest; make your change again and save."
  * The latest zone (`America/Regina`) is loaded, and the next Save succeeds.
  * The PUT has no version, which is accepted and recorded in the build notes.
* **Keyboard:**
  * Enter on Change opens the right panel (not a modal, m5 of the challenge). Arrows and Space choose an office; Enter submits.
  * Focus returns to that row's Change button.
  * Escape on a dirty add panel asks "Discard your changes to this office?", and cancelling keeps the panel open.
* **Layout:**
  * One office shows only "Your firm works from one place" plus Add, with no zone and no list, at 375 px with no page scroll.
  * At 1024 px nothing scrolls sideways. The place panel at 375 px does not overflow.

## Verdict: Block
One Blocker (B1: the Offices page's shared cache key with a narrower parse blanks the Team page and shows wrong placements) and one Major (M1: an explicit "Your firm's time zone" choice is replaced by the province's zone and audited as `province`).
