# PF-18h break report: the staff Home's "Needs you" (R1.74, QA-471 part 2)

Breaker, 20 Nov 2026. Commit `8386faca7` on `claude/dreamy-faraday-j1htfh` (PR #2621). Spec: concept r3 (BR-1 to BR-8, DW1 to DW5).
Isolated copy `brk18h` on :4720 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end. US$0. No app code edited, nothing committed.
Method: the Sample firms, signed in through the local stand-in. Reminders written with `PrismaNotificationPort.notify` inside `withFirm`, as `tests/check_pf18h_home_browser.ts` does. Some odd rows were inserted directly with superuser SQL; each finding that uses them says so. Playwright Chromium for the page. Scope is the concept's "What gets built" only (P-26). Q2 (the case page acts as the simulated person) and the J-74 walk are accepted and are not findings.

## Verdict
No Blocker, no Major. 5 Minor.

## Findings

**m1 Minor: one row of a kind the page does not know empties the whole list.**
Steps: give a person an unread row with group `MY_DEADLINES` and a kind other than the two known ones (here `case-task-deadline`, by direct insert), next to a real step reminder. Open `/home`.
Expected: the known row shows. The unknown row is dropped or shown in generic words.
Actual: the API returns both rows (it filters by group, not by kind: `store.ts:79`). The page's `NeedsYou.parse` rejects the whole answer (`contract.ts:10` `z.enum(NEEDS_YOU_KINDS)`, `home-page.tsx:40`). Result: "Could not load what needs you. Try again", and Try again fails the same way.
Today `notify` only accepts the known kinds, so this cannot happen yet. But `ports/notifications.ts:6` says consumers add kinds. The first new deadline kind mapped to `MY_DEADLINES` will blank every Home that has one.

**m2 Minor: the case number breaks at its hyphen at 320 px, and at 360 px with 6-digit numbers.**
The concept says the case number never wraps (§5 "Long"), and build-notes repeats it. The link text has no `whitespace-nowrap` or `&#8209;` around the number (`home-page.tsx:29`).
Measured: Range line boxes over "C-…" in each row. With `C-2026-00002`: 2 lines at 320 px, 1 line at 360/375 px, and 1 line at 1024 and 1440 px at 200 % zoom. With `C-2026-100042`: 2 lines at 320 and 360 px. A 40-character number (the format allows `[1-9][0-9]{5,}`) shows as "C-2026-" on one line and the digits on the next, at 375 px and at 200 % zoom.
Evidence: scratchpad shot `b6-long-375.png`. No sideways scroll and no axe violation at any width.

**m3 Minor: "Hide until next reminder" on a reminder that came back while the page was open does nothing visible.**
Steps: open `/home`. Re-notify the same deadline at a later time (the 2-day reminder arrives). Press Hide on the row that is still showing.
Actual: POST `…/read?seen=<old createdAt>` returns `200 {"readAt":null}`. That is correct per PF-18n ("duplicate beats a miss"). The page treats it as success (`home-page.tsx:54-62`): the row is refetched and stays with the new time, no Notice appears, and focus jumps to the "Needs you" heading (`focusAfter` = null when no other row) although the row is still there.
Expected: some words ("A new reminder came in for this; it stays") and focus left on the row.

**m4 Minor: a click on another row's Hide while one row is busy is dropped silently.**
Steps: delay POST read by 1.5 s. Double-click Hide on row 1, then click Hide on row 2.
Actual: only 1 POST is sent and only row 1 leaves. Row 2's click is swallowed by `if (busy) return` (`home-page.tsx:54`). Row 2's controls look enabled and do not say they are busy.
The double click itself held: 1 POST.

**m5 Minor: `seen` breaks if `created_at` ever has more than millisecond precision.**
The API sends `createdAt` rounded down to milliseconds (`store.ts:85`, `toISOString()`). Postgres keeps microseconds, so `created_at <= seen` (`store.ts:102`) is false for such a row.
Direct-insert test: a row with `created_at` `…29.722941` comes over the wire as `…29.722Z`. Three marks with that `seen` all return `readAt:null`, and the row stays unread forever, so it cannot be hidden or used up by opening. A whole-millisecond row is marked read correctly.
`notify` writes JavaScript `Date` values today (whole milliseconds), so this is latent and only reachable through a future writer that uses `now()`.

Also by code reading (not run): a failed Hide on a linked row offers "Open the case anyway" (`home-page.tsx:75`), which answers a request the person did not make.

## What held
* **Signed out and odd identities:** signed out, a garbage bearer, and `x-actor` alone (no staff session) all get 401. A deactivated staff member whose session was live gets 401 `STAFF_NOT_ACTIVE`.
* **Person and firm come from the session (BR-3):** `?staffId=`, `?firmId=`, `x-firm` and `x-actor` headers are all ignored, and firm B's token with `x-actor: user-O` still sees only firm B's list.
* **Marking someone else's row:** another person or another firm gets 404 and the row stays unread. A bad `seen` gets 400. A `seen` earlier than `createdAt` leaves the row unread.
* **Other-firm items (BR-6):** firm B staff notified about firm A's step and case get `caseNumber:null, link:null`, and the page shows "a case you can no longer open" with Hide. A gone step does the same.
* **Other groups (BR-1):** `NEEDS_YOU` (`port-self-test`) rows never appear, and neither does a `case-stage-deadline` row filed under `NEEDS_YOU`.
* **Scale and ties (BR-5):** with 40 rows on the same `created_at`, total is 40, 20 are shown, and the order is the same on every call. With 5,040 unread plus 5,000 read rows, total is 5,040, 20 are shown, and the API answers in 12-24 ms over 10 calls. The page loads in under 0.8 s and says "5040 items need you" and "Showing the newest 20 of 5040". Three concurrent marks of one row all return the first `readAt`.
* **Open (BR-4):** the mark is awaited first. A 500 or a dropped connection keeps the page, shows `role=alert` "We could not hide this reminder." with "Open the case anyway", and leaves focus on the link. A double-click on Open sends 1 POST and lands on `/cases/<id>`. After Back, Home no longer lists the opened item. A reload while the mark is in flight is safe: no item is lost.
* **Keyboard (DW5):** Tab reaches the first row's link after the frame's 9 stops. Hiding a middle row moves focus to the next row's link. Hiding the last row moves focus to the previous row's control. One row left shows "1 item needs you".
* **Long, non-English and zoomed (BR-7, BR-8):** a Greek and Arabic display name of about 110 characters truncates in the header. At 375, 1024 and 1440 px, and at 1440 and 1024 px at 200 % zoom (720 and 512 CSS px), there is no sideways scroll and axe (WCAG 2.2 A/AA, whole page) finds 0 violations. Times show in America/Toronto, and the zone is named.
* **Landing and menu:** `/sign-in/callback` with a live session lands on `/home`. The brand link goes to `/home`. Home is the first menu entry with `aria-current` on `/home`, and Profile has it on `/account`. Signed out, `/home` shows the frame's sign-in card. No page errors in any tab.

## Evidence
Scripts and screenshots are in the session scratchpad (they are not committed): `/tmp/claude-0/-home-user-xpatready/c6b95366-07dc-527b-81cd-5463a73b676c/scratchpad/brk/` (`setup.mts`, `browser.mts`, `wrap.mts`, `prec.mts`, `shots/`). API log: `prototype/studio/var/isolated-logs/brk18h-api.log`.
