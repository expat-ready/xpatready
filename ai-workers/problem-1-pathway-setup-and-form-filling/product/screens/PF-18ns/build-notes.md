# PF-18ns — the bell and the notification list: build notes

R1.50. Built to `concept.md` r2 (approved by the tech lead at c9353ae76, Lead 10 on #3279; Q1 to Q3 answered: a bell in both staff frames, the All page at `/account/notifications/all`, built on PF-18n part 2, #3289). Stacked on #3289 (Lead 12). US$0, live AI off, no model call.

## What a person can now do
* On every staff page (My account, Home, Settings: PF-6's frame; Leads and the lead page: FO-4's sales frame) they see a bell. It is a button named "Notifications, N unread", with a badge from 1 to 99, then "99+".
* The bell opens the Notifications panel. It shows the newest 20, with:
  * what happened ("Lead assigned to you"), the record ("Client A Sample (L-00006)") and the time;
  * the zone named once in the heading;
  * unread rows marked by a dot and the word "Unread".
* Opening a row marks it read and goes to its page. "Mark all read" marks what the panel showed. "See all" and "Choose what you get" are in the footer.
* My account → Notifications → All has "Settings | All" tabs, an All / Unread filter and 25 per page. A row whose record the person can no longer open says so and offers "Mark read".

## Files (all new under `web/src/modules/platform/notifications/` unless named)
* `contract.ts`: zod shapes, the words, and the announcer that speaks once per change per tab.
* `bell.tsx`: the bell, the panel and the shared row.
* `all-page.tsx`: the All page and `NotificationTabs`.
* One line each in `platform/frame.tsx`, `front-office/sales/sales-frame.tsx` and `platform/routes.tsx`; two lines in `platform/settings/notifications-page.tsx` (the tab line and its import).
* `web/src/MODULE.rows/PF-18ns.md`.
* Test: `tests/check_pf18ns_bell_browser.ts`, 18 checks (DW1-DW6, each with a pass and a fail). Screenshots are in `screenshots/`.

## Concept to build: how each point landed
* **BR-3, refresh.** The count is read again on every navigation (`useLocation().key`) and every 60 s while the tab is visible. A 401, 402 or 428 shows no bell; the sales frame has no terms gate (challenge m1).
* **BR-4, unread never shown by colour alone.** A dot and the word "Unread"; the bell's name carries the count.
* **BR-5, opening a row.** It is marked read with the time it showed (`seen`), then the page opens. A failed mark still opens. A new-tab or middle click marks it too.
* **BR-6, Mark all read.** It sends `seen` = the newest row shown, so a notice that arrives later stays unread. DW2 tests this.
* **BR-8, announcements.** The count is spoken once per change. The last announced count lives in `contract.ts`, once per tab (challenge M1), so a page change or a poll says nothing new. DW4 tests this with Playwright's clock.
* **BR-9.** "Choose what you get" links to PF-18s's settings, and nothing is edited here.
* **Panel.** It is the app's right `Panel`, with its focus trap, Escape and focus return (challenge m5), not a popover anchored under the bell. The board's look is kept: heading, rows and footer links. This is a deviation from the board, with that reason.
* **Words.** One map in `contract.ts` (§5). Home's `whatOf` still keeps its own two deadline words. Moving them into one map would edit PF-18h's file, which is outside this row's touch list; that is a follow-up.
* **The record's number.** It stays on one line at 375 px, using a non-breaking hyphen in "(L‑00007)".

## Checks run
* `check_pf18ns_bell_browser.ts` 24/24 (round 2) on a reused copy and on a freshly built isolated copy (:4731, never :4400).
* axe-core: 0 serious or critical on the page, the open panel and the All page at 375, 1024 and 1440 px, with no sideways scroll.
* Keyboard only: Tab reaches the bell, Enter opens the panel with focus inside, and Escape returns focus to the bell.
* Neighbouring suites, the web type check and module cards: results are in the PR.

## Review round 1 (reviewer Approve, 9 Minors; breaker Changes, 1 Major, 8 Minors) → round 2
Fixed, each with a test line that fails first:
* **Focus after a mark (break M1, review m3).** After Mark read, focus stays on the row (`li tabIndex=-1`). After Mark all read, focus goes to the list.
* **The count (review m1, break m2).** It is read again on every page change (`staleTime: 0`, `refetchOnMount: "always"`) and when the panel opens. The panel's Mark all read follows its own unread rows. A failed count is named "Notifications, count not available" (review m4).
* **Links (break m4).** Only an app path is trusted as a link in the browser too (`contract.ts`).
* **Screen-reader names (break m5).** "(unread)" is inside the row link's name, and each Mark read button names its row and time.
* **Paging (break m3).** A page emptied by a mark goes back one. While a page loads, the list shows busy and Mark all read waits (break m7, part).
* **Loading (review m2).** Skeleton rows instead of a text line.
* **Long names (review m5, break m6).** They wrap rather than being cut (the number at the end must stay readable), and the full text is in `title`. This is a deviation from the concept's "truncate", recorded here.
* **The check (review m8).** It re-runs on a reused copy: it clears O's and R's rows and switches first.
* **Comments.** Two comments put on the wrong lines are back in place (review m7, break m8).

## Known gaps
* The bell is not yet on the case pages' frame (`runtime/cases.tsx`, the Studio's simulated person). This is an X-row (Lead 10).
* The kind words are not yet shared with Home (see Words above).
* No push channel in Release 1 (the row).
* Follow-ups recorded on the PR, not built here:
  * the 320 px header (WCAG reflow; the project bar of 375 px passes);
  * the filter and page kept in the address (break m7);
  * the My account menu's current entry on the All page (review m6, PF-6's file);
  * one word map shared with Home (review m9, PF-18h's file).
