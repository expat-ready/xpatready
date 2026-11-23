# PF-18h challenge: the staff Home and its "Needs you" list

Fresh challenger (did not draft the concept), 21 Nov. Read: `concept.md`, `design/home-needs-you.html`, briefs PF-18h and PF-18n1 (at 093ded45e), PF-18n part 1's store on `origin/claude/loving-fermat-eyd2nq` (`platform/notifications/{store,routes}.ts`, `features/platform-notifications.ts`, `ports/notifications.ts`), and on this branch `web/src/App.tsx`, `modules.tsx`, `modules/platform/{frame,callback-page,routes,account-sections}`, `runtime/cases.tsx`, `lib/api.ts`, `lib/simulated-people.ts`, `api/src/platform/settings.ts`, `api/src/platform/settings/offices/clock.ts`, `api/src/case-deadlines/reminders.ts`, `prisma/schema/{cases,platform-offices}.prisma`, `tests/journeys/j_74.ts`, `tests/check_pf6f_callback_browser.ts`; PRODUCT, STANDARDS, EXPERIENCE, QUALITY. `ai-workers/tools/freshness.sh` fails here (`code/README-copies.md` missing): team sources Unverified; the concept relies on none.

## Verdict
**Build after these changes.** The slice is right-sized and reuses PF-18n's rows and mark-read route correctly, but the one click it exists for (Home → the case) does not reliably reach the case as the signed-in person, and two readings (time zone, link building) contradict code already on main or in #2596.

## Objections

### Blocker
**B1. Opening an item reaches the case URL, not reliably the case as the signed-in person (DW3, the J-74 walk).** *Needed for the proof.*
* What breaks: Home runs on PF-4's bearer session (`staffApi`); `/cases/*` is `<KnownPerson><RuntimeApp/>` (App.tsx line 44), whose every read goes through `api()` with the Studio's simulated `x-actor` (`lib/api.ts` lines 10–36). `RuntimeApp` silently sets the actor to `user-O` (Case officer) when no person is stored (`runtime/cases.tsx` line 59) and shows "NotACasePerson" when a Studio person is stored (line 60). `Me` (`front-office/sales/contract.ts` line 14) carries no `actorId`, so Home cannot align the two.
* Example: reminders go to the case's OFFICER **and** LEAD_REPRESENTATIVE (`reminders.ts` lines 36, 200–205). The representative signs in, opens the item: the case page shows the case as "Case officer (simulated)", with the officer's rights (no representative review acts). A solo-firm or firm-B staff member opens theirs: the case page reads as `user-O` of the Sample firm and finds no such case. A browser last used in the Studio gets the "not a case person" notice first.
* Evidence (fact, high confidence on the mechanism; medium on each exact screen): code lines above. J-74 itself sets `localStorage xr-actor = user-O` by hand before the case page (j_74.ts line 74), which is why the concept's DW3 ("lands on `/cases/<id>`", URL only) would pass while a person fails.
* Fix (no case-page edit, which the brief forbids): (a) DW3 and the J-74 step assert the case page renders the case's number in its header, signed in as the officer, in a browser with no stored person; (b) add a named fail: the representative's item opens, and the test records what they see; (c) the concept states the two-identity gap as scaffolding (P-33) with its rule, and the founder rules on Q1 below. If the founder wants it closed now, the smallest step is returning the session's `actorId` beside `zone` in the needs-you answer and calling `setActor(actorId)` (a seen "Now: …" change, P-484) before navigating.

### Major
**M1. "Firm time zone" is the wrong reading: a per-person zone exists.** *Needed for the proof.*
* What breaks: BR-7 says "there is no per-person zone today". PF-18a part 1 is on main: `OfficeClockPort.officeOfStaff(firm, staff)` then `zoneFor(firm, office)` (`settings/offices/clock.ts` lines 26–40; `platform_staff_office`, "no row … the firm's own zone applies"), provided as `OFFICE_CLOCK` in `features/platform-settings-personal.ts`.
* Example: a firm with a Toronto and a Vancouver office; the Vancouver officer sees "09:00" for a reminder that reached them at 06:00 their time.
* Evidence: fact, high confidence. The brief says "the person's time zone".
* Fix: `zone = zoneFor(firmId, await officeOfStaff(firmId, staffId))` through the port; it already falls back to `platform.time_zone`. One test: an officer in a second office sees their office's zone named.

**M2. A second link builder.** *Needed for the proof.*
* What breaks: the response carries `link`, but PF-18n's rule for it (`linksOf`, store.ts) is a non-exported function; a separate `platform/home/` reader must rebuild it, so where a notification opens is decided in two places and will drift (PF-18ns, FO-10 add item kinds).
* Evidence: fact (store.ts). Q3's reason ("never edit PF-18n's files") holds only while #2596 is open; the concept already waits for #2596 to merge (Definition of ready), after which `store.ts`/`routes.ts` are main's and the brief puts the route there.
* Fix: build on the fake (P-576) now; the real adapter calls PF-18n's code: a `group` filter on `MyNotifications.list` (or a `needsYou` method beside it) and the route in `routes.ts`, as the brief says. Recommend **reversing Q3**: no `platform/home/` API folder or `features/platform-home.ts`; keep the web module.

**M3. Q1 reads a case-side table, against the brief's ruling and STANDARDS [M].** *Needed for the proof.*
* What breaks: STANDARDS.md line 25 [M] "modules talk through services and contracts, not each other's tables"; the brief: "no read of case-side tables". The brief also asks for "the case number from the link", which the link (`/cases/<uuid>`) does not hold, so the brief is self-contradictory and the concept settles it by precedent (`linksOf` already reads `case_stage`/`case_milestone`).
* Evidence: fact (brief text, STANDARDS line, store.ts). Judgment: the case number is needed (two items are otherwise indistinguishable); the rule conflict must be ruled, not inherited (AGENTS rule 2).
* Fix: founder Q2 below. If allowed, read only `id, case_number` firm-scoped inside PF-18n's store beside `linksOf` (M2), with a card "do not" line naming the exception until the case side offers a read contract.

**M4. "Mark as done" says the deadline is done; it only hides the reminder.** *Needed for the proof.*
* What breaks: the button marks the notification read; the deadline is untouched and comes back at 2 days and on the day (BR-2). An RCIC reads "done" as finished work. After hiding all items Home says "Nothing needs you right now" while deadlines are open.
* Evidence: judgment, medium-high confidence; PRODUCT §4 has no word for this, so it is the concept's choice.
* Fix: "Hide until next reminder" (or "Dismiss"), with the tooltip-free muted line "It comes back 2 days before and on the day." Same label in BR-4/BR-6 and the board.

### Minor
* **m1. Open-failed Notice cannot be seen.** §5 navigates to the case anyway and shows "We could not mark it as done", but Home has unmounted and the case page is out of bounds. Fix: await the mark-read (short timeout) then navigate; on failure navigate anyway with no Notice (the item still listed on return says enough). Modified clicks (new tab) open the `<a href>` and fire mark-read without waiting. *Needed for the proof.*
* **m2. Focus after "Hide".** The row disappears and focus falls to `body` (EXPERIENCE §2.12, BIC-20). Fix: focus the next row's link, else the "Needs you" heading (`tabIndex=-1`); add to DW5. *Needed for the proof.*
* **m3. Tests vs DW1–DW5.** DW5 has no fail case (each needs one: e.g. a row reachable only by mouse fails); DW2's fail ("two rows would be counted 2") names no mechanism (use: bypass the upsert with a second insert under another kind and show Home counts kinds, not rows); no test for BR-6 (null link → no link, Hide only), BR-7 (zone named), BR-8 (count in words). *Needed for the proof.*
* **m4. Landing change breaks a test not on the touch list.** `check_pf6f_callback_browser.ts` line 88 asserts `/account` after the callback flow and `check_pf6a_frame_browser.ts` counts `ACCOUNT_SECTIONS`. Fix: add both to the touch list. *Needed for the proof.*
* **m5. Home sits under "My account".** PlatformFrame's side nav is headed and labelled "My account" and the place line starts "My account" (`frame.tsx` lines 50–62); the board shows neither. Fix: draw it as it will render, or accept "My account" as the frame's name for now in the concept; no frame rework in this row. *Not built.*
* **m6. Pattern invented.** EXPERIENCE §3 says "choose one; do not invent". Name the To review list (#616/#637) row style as the pattern reused, or record the exception for the Lead. *Not built.*
* **m7. Raw SQL in the real reader.** store.ts reads through Prisma with `firmScope`; raw SQL skips that helper. Fix: Prisma with `firmScope` (moot if M2 is taken). *Needed for the proof.*
* **m8. Empty state when reminders are switched off.** In-app off for "My deadlines" writes no row (PF-18n DW2), and Home says reminders "show here". Fix: no new read; change the muted line to "Deadline reminders on your cases show here when In-app reminders are on in your settings." *Not built.*

## What is sound
* One item per deadline from PF-18n's upsert (`on conflict … read_at = null, created_at = greatest(...)`), newest first by `created_at`, 20 shown with a total: matches the store exactly.
* Own only from the session (`@AnyStaff`, `staffOf`), never a parameter; firm B gets its own empty list. Mark-read reuses PF-18n's `POST …/:id/read` (idempotent, firm and person scoped): one write path.
* No table, no migration, no AI; scope held to the brief; the PF-29f seam (one `<section>` per block) costs nothing.
* BR-6 (never hide an unlinkable item) and BR-8 (count in words) are right; copy avoids ids and "notification" on the main path.
* Q2's plan (build now, add the route line after #2608, merge main per P-270) is right; the throwaway `modules/home` fallback is not worth it for one array line.
* Duplicate check done and specific.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Needs you list | `msg_notification` (#2596), unread, group `MY_DEADLINES`, own firm and person | `GET /api/platform/me/needs-you` in PF-18n's `routes.ts`, via `MyNotifications` with a group filter (M2) | BR-1, BR-3, BR-5 | DW1, DW4, scale 25 → 20 |
| Re-surfaced item | same row, `read_at` null, `created_at` moved | same | BR-2 | DW2 |
| Case number on the row | `runtime_case.case_number`, firm-scoped, `id, case_number` only | same answer, `caseNumber` | M3 (founder Q2) | DW1 shows "C-…"; firm B's case gives no number |
| Link | built by PF-18n's `linksOf` only | same answer, `link` | BR-6 | BR-6 test: stage gone → no link, Hide only |
| Open / Hide | `read_at` | PF-18n `POST /api/platform/me/notifications/:id/read` | BR-4 | DW3 (case header rendered, B1), m2 focus |
| Times | `platform_staff_office` → `platform_office.time_zone`, else `platform.time_zone` | `zone` in the answer via `OFFICE_CLOCK` | BR-7 (M1) | second-office officer sees their zone |
| Landing and nav | none | none | sign-in lands on `/home` | DW5 + updated pf6f, pf6a (m4) |

## Questions for the founder (recommendation first)
1. **Home opens the case page, which still runs as a simulated person, not the signed-in staff member (B1).** Recommend: accept it for Release 1 as labelled scaffolding, with DW3 proving the officer reaches the rendered case and the representative's case recorded as a known gap, until the case page moves to the staff sign-in. Alternative: Home switches the simulated person to the signed-in person's match before opening (small; the change of person is shown).
2. **May Home's list read the case number from the case side's table (M3)?** Recommend: yes, as one named exception (case id and number only, own firm, inside PF-18n's store), recorded in DECISIONS, until the case side offers a read contract. Without it each row says only "a deadline on one of your cases".
3. **The button that hides a reminder (M4).** Recommend "Hide until next reminder"; alternative "Dismiss". Not "Mark as done": the deadline is not done.

## Lead response

## Agreement

## Build discoveries
