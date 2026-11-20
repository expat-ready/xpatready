# PF-18h build notes: the staff Home's "Needs you" (R1.74, QA-471 part 2)

PR expat-ready/xpatready#2621. Concept r3 (tech lead's approval at r2, PR comment 7051265937). Opus 5.5, effort high. Live AI off, US$0.

## Files changed
* **Web** (`prototype/studio/web/src/`):
  * `modules/platform/home/home-page.tsx` and `contract.ts`: new.
  * `modules/platform/routes.tsx`: `/home`, written after #2608 merged, so no fallback.
  * `callback-page.tsx`: sign-in lands on `/home`.
  * `frame.tsx`: the brand link opens `/home`.
  * `account-sections.ts`: Home is the first menu entry.
  * `MODULE.rows/PF-18h.md`.
* **API** (written after #2596 merged; main merged first, P-270):
  * `api/src/platform/notifications/store.ts`: `needsYou()`, and `linksOf` now also gives each case's number from one firm-scoped case read (Q1 (a)).
  * `routes.ts`: `NeedsYouController`, `GET /api/platform/me/needs-you`, with my zone from `OFFICE_CLOCK`.
  * `features/platform-notifications.ts`: binds it.
  * `api/src/platform/MODULE.rows/PF-18h.md`.
* **Tests:**
  * `tests/check_pf18h_home_browser.ts`: new.
  * `tests/check_pf6a_frame_browser.ts` and `check_pf6f_callback_browser.ts`: a signed-in callback now lands on Home, and My account is opened from the menu to prove who is signed in.

## Mock vs real
* The reminders are real: `CaseDeadlines.runMilestoneReminder`, CS-DL3 part 1's own job, writes through `PrismaNotificationPort`, PF-18n's real adapter, into the copy's `msg_notification`.
* The job runner in the check is PF-0p's `fakeJobs` on a FakeClock. PF-18n's DW6 proves the real `PlatformJobs` fires the same job.
* **Labelled scaffolding (Q2):** `/cases/*` acts as the Studio's simulated person, which defaults to the case officer, not as the signed-in staff member. The walk shows it: the representative signs in, and the case page says "Acting as Case officer (Simulated)". X-row: "the case page acts as the signed-in staff member".
* **X-row (Q1):** "a case-side `CaseLabelPort` replaces platform reads in `linksOf`".

## Checks run
| Check | Result |
|---|---|
| `check_pf18h_home_browser.ts`, on an isolated copy | 21/21: DW1–DW5 each with a fail case, BR-5 to BR-8, landing and menu |
| `check_pf18n_notifications.ts` (store change) | 34/34 |
| `check_pf6a_frame_browser.ts` | 52/52 |
| `check_pf6f_callback_browser.ts` | 11/11 |
| `tsc`, web and api | no new errors (the 15 api-side errors are on main too) |
| Smoke against a mocked answer at 375, 1024 and 1440 px | axe clean, no sideways scroll |

* **Walk by screens (P-352), 1440 px:** sign-in card on `/home` → sign in as the representative → Home shows "1 item needs you · A government step on case C-2026-00004" → open → the case page with that number and its Government steps → Back → "Nothing needs you right now." Screenshots `screenshots/walk-*.png`.

## Standards (STANDARDS / EXPERIENCE)
* **States:** empty, loading (skeleton, `role=status`), normal, long (text wraps; the case number never breaks), error (Notice with Try again), mark failed (Notice with "Open the case anyway"), more than 20 (foot line).
* **Keyboard:** the link and the Hide button are plain controls. After Hide, focus goes to the next row, else the heading.
* **No ids on the main path.** Words come from the item kind.
* **Server authorisation:** `@AnyStaff`; person and firm come from the session; another person's row is 404, as PF-18n's.
* **Deviation (m6):** no EXPERIENCE §3 pattern is a home. The page is one list in a section, for the founder's morning look. m5 ("Home" under the "My account" heading) is noted the same way.

## Self-score D1–D20 (honest)
Most dimensions are 4.
* **D-UX:** 3, because the case page opens as the simulated officer (Q2).
* **D-performance:** not measured. One page of at most 20 rows makes two indexed queries plus one case read.

## Known gaps
* Q2, the simulated person on the case page.
* No link to the full notification list, which is PF-18ns and not built.
* No due date on the item, by design (Q1).
* The J-74 walk belongs to Lead C's CS-DL3 part 3.
