# PF-18ns: break report (bell, panel, All page)

PR #3302, head `8d2a5c301f3b370245cadb6ca6843a70e4785c9a` (stacked on #3289). Scope: concept r2 §1-§6 (the bell in PlatformFrame and SalesFrame, the panel, `/account/notifications/all`). Isolated copy `pf18nsbrk` on :4751 (fresh build, `AI_LIVE=off PLATFORM_IDENTITY=local`), front office seeded as `check_pf18ns_bell_browser.ts` does. Notifications came from real lead assignments (R → O), with extra unlinked rows inserted in SQL. The copy was stopped at the end. Probes and screenshots: `/tmp/claude-0/-home-user-xpatready/d4a803f4-3580-57ec-aa34-45a99ccaeb6a/scratchpad/breaker18ns/` (p1-p7.ts, *.out, *.png). Nothing was fixed.

**Result: 0 Blockers, 1 Major, 7 Minors.**

## Major

**M1. "Mark read" drops keyboard focus to the page (WCAG 2.4.3).** `bell.tsx:55` shows the button only while a row is unlinked and unread, so a successful mark unmounts the button that has focus.
* Steps: on the All page, choose Unread, page 2 (or any filter). Tab to "Mark read" on a row that can no longer be opened, then press Enter.
* Evidence (p4 `P_afterMarkLastOnPage2.focus`): `document.activeElement` is `<body>`. The next Tab starts again at the logo, so marking 25 rows by keyboard means 25 trips from the top of the page. In the panel the same thing happens with Mark all read (`bell.tsx:81`, disabled at 0): focus falls to the dialog container (p1 `B_kbdMarkAllFocus`). The app's own `Panel.returnFocus` doc records this exact case as a Major (G1 PR 2b, review MJ-2).
* Fix: after a mark, move focus to the next row's control, or to the list heading when the list is empty. Keep Mark all read focusable with `aria-disabled` and do not unmount it.
* Fail test: DW5b. Keyboard Mark read on an unlinked row, then expect `activeElement` inside the list (not `body`). Keyboard Mark all read in the panel, then expect focus still on a named control.

## Minors

**m1. The bell causes sideways scroll at 320 px (WCAG 1.4.10 reflow, 1280 px at 400 %).** The frame already hides the name below 359 px to fit (`frame.tsx:99` `max-[359px]:hidden`), but the 36 px bell pushes "Sign out" out of view.
* Evidence (p4 `w320`): `scrollWidth` is 357 with the bell and 320 with the bell hidden. Screenshot `99-320-_home.png`. The project's own bar (375 px, 1024 px, 200 %) holds.
* Fix: below 360 px, tighten the gap or drop the "?" into the menu.
* Fail test: 320 px, /home, expect `scrollWidth` = 320.

**m2. The panel's Mark all read and the bell's name follow the bell's count, not the rows shown.**
* Evidence (p7 `stale`): a lead is assigned after the last count read, then the panel is opened. The panel shows 1 unread row, but the badge says 0, the bell is named "Notifications, none unread", and Mark all read is disabled (`bell.tsx:81`). The person has to navigate or wait up to 60 s.
* With `unread-count` answering 500 (p2 `H_500count`), the bell is named "none unread" while there are 2 unread (`bell.tsx:105`, `n ?? 0`).
* Fix: refetch the count when the panel opens, and enable Mark all read from `q.data.items.some(readAt === null)`. When the count is unknown, name the bell "Notifications" with no count claim.
* Fail test: assign, open the panel without navigating, expect Mark all read enabled and the badge at 1. Route the count to 500, expect the name not to say "none unread".

**m3. Paging past the end.**
* Evidence (p4 `P_afterMarkLastOnPage2`, `page2-empty.png`): Unread filter with 26 unread. On page 2, mark its only row. Page 2 then says "No unread notifications." with Next disabled, while 25 unread remain on page 1 (the API confirms it).
* Fix: when a page beyond 1 comes back empty, step back to the last page that has rows.
* Fail test: the same steps, then expect page 1 and 25 rows.

**m4. A `link` that is not an app path is trusted** (`contract.ts:14` `z.string()`, `bell.tsx:38,47`).
* Evidence (p2, planted with `page.route`): `https://example.org/phish` is rendered as the raw `href`, so Ctrl-click or middle-click opens the off-site page in a new tab. A plain click navigates to `/home/https:/example.org/phish`, and `//example.org/x` goes to `/example.org/x`. `javascript:` is blocked by React. The server builds links today (`store.ts`, labels), so this is defence in depth.
* Fix: in the contract, `link: z.string().regex(/^\/(?!\/)/).nullable()`, or render the row as unlinked when the link fails that check.
* Fail test: routed items with `link: "https://example.org/x"`, expect no `a[href^=http]` and the unlinked line instead.

**m5. Screen-reader names.**
* Evidence (p5 `S_panelAria`): an unread row's link is named "Lead assigned to you · <name>", and "Unread" sits in the next paragraph, so Tab or a links list never hears it (BR-4). Every unlinked row's button has the same name, "Mark read: Lead assigned to you" (p4 `S_allAria`, 25 identical buttons).
* Fix: add a visually hidden "Unread, " inside the link, and the time inside the Mark read button's name.
* Fail test: `getByRole('link', { name: /^Unread/ })` count equals the unread rows, and the Mark read names are unique.

**m6. Long names are neither truncated nor given a `title`** (concept §4 says "long lead name truncated with full text in `title`").
* Evidence (p7 `long375`, `long-375.png`): a 100 + 100 character name wraps to 5 lines (170 px row) at 375 px. The server cuts it with "..." and there is no `title` anywhere. The build notes do not record this deviation.
* Fix: either clamp to 2 lines and add `title={item.label}`, or record the change in the build notes.
* Fail test: a 200-character label, expect row height ≤ 3 lines and a `title` holding the label.

**m7. Filter and page are not kept across reload or Back, and the previous list shows under the new filter.**
* Evidence (p4 `R_reload`): Unread, page 2, then reload, lands on All, page 1. While a page loads, `placeholderData` (`all-page.tsx:28`) keeps showing the old filter's rows under the newly pressed Unread button, with no busy sign and Mark all read enabled (p4 `Q_filterWhileLoading.mid`). The final state is correct.
* Fix: put `?unread=1&page=2` in the URL, and use `isPlaceholderData` to set `aria-busy` and disable the buttons.
* Fail test: reload on Unread page 2, expect Unread page 2.

**m8. Comments landed on the wrong lines.** `frame.tsx:18` carries both PF-18ns's comment and PF-18s's HelpButton comment. `routes.tsx:46` gives PF-18s part 3's comment to the All route, and `:45` has lost it.
* Fix: put each comment back on its own line.

## What held
* Double-click on a row sends 1 `POST :id/read` and opens once (p1 A). Double-click on Mark all read sends 1 `read-all` (p1 B).
* When the mark fails with a 500, the row still opens, stays unread in the database and the count stays 1 (p1 C).
* Ctrl-click marks the row read: the new tab and the old tab both show 0, and the panel row turns read (p1 D).
* A 428 in the sales frame shows no bell, and the bell comes back after the next navigation (p2 G).
* A 401 on a mark ends the session and the sign-in card shows (p2 F).
* A session revoked while the panel is open: Mark all read closes the panel and focuses "Signed in elsewhere" (p3 F2).
* HTML in a label is shown as text and nothing runs. Arabic and Chinese labels render (p3, `labels-375.png`).
* 99+ fits with no sideways scroll at 375 px, 1024 px, 200 % of 1440 and 200 % of 1024, in both frames and in the panel (p3).
* The live region speaks once per change. A page change, Back or Forward does not repeat it (p5 `K_live`).
* The panel's Tab order cycles inside the dialog, and Escape returns focus to the bell (p5).
* Another person's or firm's row: `:id/read` answers 404 for T and for S in sample-solo, S sees 0 of O's rows, and a `staffId` parameter is refused 422.
* Server limits: page 99999 answers empty with `nextPage: null`, size is capped at 100, a bad `seen` is refused 422, and no token is refused 401.
* Next pressed three times during a slow load, and a filter switch during a load, both end on the right rows.

Focus after a row navigates lands on `<body>` of the new page, with the first Tab on "Sales home". This is page-load behaviour and is not counted.

Outside scope (pre-existing on main, not this diff): going from Licence to My account in the client crashes ("Cannot read properties of undefined (reading 'length')"). `licence-page.tsx:19` and `account-page.tsx:25` share the query key `["pf","account",token]` with different schemas. This is for the lead.

Verdict: Changes 8d2a5c301f3b370245cadb6ca6843a70e4785c9a
