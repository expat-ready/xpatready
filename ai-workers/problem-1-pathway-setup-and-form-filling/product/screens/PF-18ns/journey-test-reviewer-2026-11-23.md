# PF-18ns journey test (reviewer, 23 Nov)

Head `8d2a5c301f3b370245cadb6ca6843a70e4785c9a`. Own copy `pf18nsrev` on :4741 (fresh database; AI off; local sign-in). Each sign-in went through the sign-in card. Leads were assigned through the lead page's Assign panel, and later notices through the app's own assign route. Walked headless in Playwright with screenshots: no visible browser pane in this cloud session. Scratch screenshots were not committed; the builder's screenshots are cited by name. **Score: 9 / 10. Pass.**

## Journeys (persona · goal · result)
1. **Main path at 1440: a Case officer is handed a lead.**
   * Steps: the Representative opens a lead → Assign → "Case officer (Sample)" → Assign. The Case officer clicks a menu link → the bell reads "Notifications, 1 unread" with badge 1 (132 ms). Bell → panel (80 ms) → the row reads "Lead assigned to you · Client B Sample (L-00007)", "23 Nov, 13:57 · Unread", with "Times in America/Toronto" in the heading → Enter.
   * Result: lands on `/front-office/leads/<id>` in the sales frame, bell 0. Underneath: one `msg_notification` row for the Case officer, `read_at` set. **Held.**
2. **Mark all read** with 2 unread: the count goes to 0, the button disables, and Esc returns focus to the bell. **Held.**
   * Before that, the count was stale after a quick page change (finding 1).
3. **See all → All page** (crumbs: My account › Notifications › All, tabs Settings | All). 30 more rows: Unread filter, then page 2 with 5 rows. Mark all read is disabled on page 2. axe 0. **Held.**
4. **Errors**, each with the API answering 500:
   * The panel list: "Could not load your notifications." + Try again; Try again recovers. **Held.**
   * Mark read on a row: "Could not mark this read." shows, but focus falls to the page (finding 2).
   * The unread count: the bell says "none unread" (finding 3).
5. **Wrong person and ownership changes:**
   * Signed out: no bell, the sign-in card shows.
   * The Representative's panel: empty state "Nothing new. Work handed to you will show here."; the Unread filter shows "No unread notifications."
   * Lead reassigned to another person: the Case officer's row keeps its name and link. That is correct here: this firm lets the Case officer read every lead (GET lead answered 200). The own-only case is tested in #3289's DW3. **Held.**
6. **Recovery:**
   * Double click on a row: one navigation, one row, read once.
   * Reload with the panel open: the panel is closed and the bell is back.
   * Sign out, then sign in as another person in the same tab: nothing stale is announced. **Held.**
7. **Sizes:**
   * 375 px: the panel is a full-width sheet, the bell shows in both frames, the All page has no sideways scroll.
   * 1024 px at 200 % zoom (512 CSS px): the same.
   * 1024 px: 560 px side panel.
   * axe 0 serious everywhere. **Held.**
8. **Across the screen boundary:** a row in PF-6's frame opens FO-4's lead page, which carries its own bell, now 0. "Choose what you get" opens PF-18s's settings (DW6). **Held.**

## Replay as automated checks
`check_pf18ns_bell_browser.ts` passed 18/18 twice, each on a fresh copy (axe WCAG 2.2 A/AA; 375/1024/1440; keyboard path; page errors none). A third run on the same copy failed DW1, because rows from earlier runs were still there (finding 6). No console or page errors in the walk.

## Break it
* **Long non-English name** ("Zoë-Ångström Nakamura-Østergaard Fitzwilliam-Beauchamp de la Cruz"): wraps cleanly, with no sideways scroll at 375. It does not truncate and has no `title` (finding 5).
* **Another person's notification id** on the read route: 404 (DW3).
* **Two notices that arrive after the panel loaded:** they stay unread after Mark all read (DW2).

## Findings (all Minor)
1. **Stale count after a quick page change** (`bell.tsx:96`, `:99`, `:81`).
   * Within 2 s of the last count read, a page change does not refetch: the app's `staleTime` is 2 s and the bell remounts with each frame.
   * Result: bell 0 while the panel shows 2 Unread rows, and Mark all read is disabled.
   * Fix: staleTime 0 for the count, refetch when the panel opens, and enable Mark all read from the panel's own rows. Add an in-app navigation test line.
2. **Focus lost after a failed Mark read** (`bell.tsx:31`).
3. **A failed count reads "none unread"** (`bell.tsx:105`).
4. **Loading is a text line, not skeletons** (`bell.tsx:84`, `all-page.tsx:44`).
5. **Long names wrap without `title`, against concept §4** (`bell.tsx:41`). Wrapping is acceptable if recorded in build-notes.
6. **The check is not re-runnable on a reused copy** (`check_pf18ns_bell_browser.ts:112`).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J3 done through the product's own screens |
| Next step obvious | 1 | Bell, then the row, which opens its record; See all and Choose what you get in the footer |
| Plain words | 1 | §5 copy; times in words; zone named once |
| Feedback and state | ½ | Stale count with Mark all read disabled (1); loading text (4); "none unread" on failure (3) |
| Correct data | 1 | One row per assignment; `read_at` set on open; `seen` keeps late notices unread (SQL, DW2) |
| Error recovery | ½ | Try again recovers, and a failed mark still opens. Focus is lost after a failed Mark read (2) |
| Accessibility and screen sizes | 1 | axe 0 serious at 375/1024/1440 and 200 % zoom; keyboard path; announced once per change (DW4) |
| Speed | 1 | 132 ms count, 80 ms panel; one request per view |
| Visual quality | 1 | Team Panel and tokens (`pf18ns-5-panel-1440`, `pf18ns-6-all-375`) |
| Trust and sources | 1 | No AI here; each row shows its origin (what happened, the record, the time in the named zone); a row the person can no longer open says so, never a guessed name |

**Total 9 / 10. Pass (8 or more, no 0).** To raise it:
* Fix finding 1, which lifts feedback and state.
* Fix finding 2, which lifts error recovery.

## Could not test
* A real screen reader.
* A visible browser.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The SalesFrame terms-pending (428) path: checked in the code only.
