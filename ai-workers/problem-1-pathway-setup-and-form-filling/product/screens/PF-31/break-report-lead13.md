# PF-31 (b): break report on the Lead 13 fix (web PR 3193)

Head `2fd5352aa295b9652d5f570b4136b71c11db75ac`. I read only the diff (1ea167cf3, 6775f42a9, f9bdd7a1c, 5f77dcba0, a76b86b44, 95d1f6361, 2fd5352aa), on the running copy :4746 (db xr_studio_l13f, AI_LIVE=off, PLATFORM_IDENTITY=local). Playwright with Chromium 1243. My own records: offices BrkA–BrkD 3ph5 in sample-solo (user-S). Other accounts used: user-O and user-T (sample-firm), user-A (Studio). Nothing fixed, nothing committed.

**Verdict: Changes.** No Blocker. Three Majors.

## Major

**M1. A hidden tab's dropdown menu stays in the page over the shown tab and still works.**
Repro (Studio, `xr-actor`=user-A):
1. Open /programs and Ctrl-click Fields in the menu.
2. Show the Fields tab and open the header's "Demo" menu.
3. Press Alt+PageDown, or the browser's Back.

Expected: the menu closes with its tab.
Actual: the URL is /programs, but Fields' `[role=menu]` is still in `document.body` and visible. With its trigger detached, it jumps to the top-left corner (0,0) and covers the brand and the side menu. `body` keeps `pointer-events:none` and two `data-aria-hidden` siblings, so a click on the page is caught by the menu. Its items ("Reset demo…", "Load sample…") run in the hidden tab. Because that tab's confirm Dialog stays closed while hidden (controls.tsx:82), the dialog pops up later when the person goes back to Fields.
Cause: only `Dialog`, `Panel` and the terms page check `useTabActive` (controls.tsx:82, :118; terms-gate.tsx:80). Radix DropdownMenu portals do not: App.tsx:214, prospect-actions.tsx:70 ("Move to…" on the pipeline), checklist.tsx:180, filing-changes.tsx:111. The tab switch happens at workspace.tsx:198 (keys) and :174-177 (popstate). Tooltip (tooltip.tsx:55) is the same pattern. I did not walk it.
This leak is new with 1ea167cf3: before it, the hidden tab was `display:none`, so the anchor stayed.

**M2. "Add an office" → Close throws away what was typed, without asking.**
Repro (user-S, /platform/offices):
1. Click "Add an office" and type a name.
2. Press **Close**.

Actual: the panel closes with no question. Reopening it shows an empty name. Escape on the same panel asks "Discard your changes to this office?".
Cause: office-panel.tsx:95 (6775f42a9) now asks only `if (office && dirty)`. A new office's `local` state is reset when the panel opens again (office-panel.tsx:44). Expected: ask, as Escape, × and the tab close (`useTabDirty`) do.

**M3. The strip appearing on the first Ctrl-click moves the page under the pointer.**
Repro (user-S, /platform/offices, one item, no strip): Ctrl-click row 1's Edit.
Actual: the strip appears in the flow (sticky, workspace.tsx:292 and :302). Every row moves down 43 px. The point where row 2's Edit was now hits row 1 ("Sample solo practice"). Opening several records in a row therefore opens the wrong one, or nothing (an item already open is ignored), out of sight in the background. Closing back to one item shifts the page up 43 px.
This is a cost of "no strip for one item" (f9bdd7a1c). Expected: no layout shift over controls on the strip's main gesture.

## Minor

- **m1. Sign out on purpose still keeps a list. The NOBODY state lasts only milliseconds.**
  - Why: `signOutHere()` sets NOBODY (drafts.tsx forget → workspace.tsx:233-238). Then `endSession(null)` (platform/frame.tsx:91) or `setStaffToken(null)` (sales-frame.tsx:62) fires `onStaffChange`, where the owner is "local", was=NOBODY and there is no end reason. So workspace.tsx:226-230 sets `shownOwner="local"`, runs `load()`, and the save effect (:114) writes the signed-out page into `xr.workspace.v1:local`.
  - Repro: user-S on `/platform/activity-log?q=Secret-client-name`, press Sign out. Afterwards `xr.workspace.v1:local` = `[{path:"/platform/activity-log?q=Secret-client-name",title:"Activity log"}]`, and it survives a reload.
  - A page load of a staff address while signed out does the same, through `load()`.
  - Only a 401-answered Sign out keeps NOBODY.
  - B1 still holds: the next person's own list never contains it. But the claim "Sign out keeps no list" is false, and the shared "local" list carries the last person's address and query into the next session in that browser tab.
- **m2. Focus drops to `<body>` after clicking a strip tab.** The clicked button belongs to the old tab's box, which is detached, and `activate`/`show` (workspace.tsx:310 → :121-128) never calls `focusTab`.
  - Seen on a click from /platform/offices to the Activity log tab: `document.activeElement` = BODY.
  - Arrow keys, Alt+PageDown and close do focus the tab (:198, :294, :148).
- **m3. `document.title` belongs to the last tab drawn, not the shown one.** Studio /programs + /library/fields: after switching back to Programs, the title is still "Fields · Product Studio".
  - Cause: App.tsx:83 sets it in an effect keyed on the tab's own label. A hidden tab never rewrites it, and showing a tab doesn't re-run the effect.
  - I did not check the favicon. No code sets it per page.
- **m4. The strip mixes person areas.**
  - Repro: Studio [Programs, Fields]. In Fields, plain-click "Cases (as Case officer) →". The tab moves to /cases (actor user-O), and the Cases strip offers "Programs". One click shows the Studio as the Case officer ("This page is for the configuration people", tab title "No such page").
  - Cause: workspace.tsx:188 guards link clicks only. `activate`, popstate and `load()` never check `personAreaOf`.
  - Related: an address typed while the shown tab holds a draft (`/inbox`, the demo mail page) is added to the staff person's list (workspace.tsx:92-98).
  - The simulated person did not change in a background tab in any walk.
- **m5. A side panel jumps when the strip goes.**
  - Repro: 3 tabs, office C's panel open (top 99 px = strip bottom). Close the other two tabs with their × (allowed through the panel, controls.tsx:122).
  - Actual: `--ws-top` is removed and the panel jumps to top 0 over the header while the person is typing in it. The value is never stale, though: 99/99 after switching tabs, and empty after the close.
- **m6. (Code reading, not walked: no proposals on this copy.)** job.tsx:52-62's `window` keydown handler (j/k/a/n) stays live in a hidden JobPage tab and acts on the shown page's `article[data-proposal]` cards. With two job tabs mounted, "j" moves two cards and "a" can press Accept twice in one keypress (the button is not disabled before the second listener runs). The duplicated listener is older; detaching hidden tabs makes it act on the shown page.

Outside the diff, noted only:
- At 200 % zoom (720×450) with 12 items, the folded "Open items" list is sticky and ends at y=693, so the last items cannot be reached.
- Typing in "Add an office" is lost on a reload without the leave-page question, because workspace.tsx:201 checks shared drafts only.

## What held

- **Move the shown tab on load (5f77dcba0).** Draft on office B, then a typed /platform/team, a typed office C `?x=1`, a reload, and a typed /inbox and Back. The leave-page question came each time. The draft tab was never moved: each new address got its own tab. Office B's tab still showed "Draft on B" at its own address. Nothing was lost or shown under another address.
- **History state `{ws, usr}` (a76b86b44).** Activity log (`?ours=1`, stamped), an office list tab and an office record tab: Back ×2, reload, Back, Forward ×3, plus a document Back after a typed URL. Each entry kept its own `usr`, and the stamp stayed on the activity-log entries only. No filter or redirect went wrong.
- **B1.**
  - Expiry with 3 tabs and a draft: the screen stays.
  - Same person signs in again: tabs, active tab and draft come back.
  - user-T signs in instead: one tab, user-S's list and draft are deleted from sessionStorage, and no hidden panel survives.
  - "Sign in again here" (SIGNED_IN_ELSEWHERE) keeps the list, and the same person gets it back.
  - Sign out answered 401: no list kept. The next sign-in keeps lists again, so NOBODY never sticks.
- **Cross-area Ctrl-click.** Studio → Cases opens a browser tab. `xr-actor` stays user-A, the original strip is unchanged, and the new tab copies no sessionStorage.
- **Strip.** One item: no strip and one `main`. Two items: strip, with `--ws-top` = strip bottom. The terms page draws only in the shown tab (read). Scroll comes back when switching by the strip.
- **Keyboard shortcuts.** "/" in a hidden tab left nothing visible. Ctrl+K from a hidden Programs tab: not reproduced. Alt+PageDown/PageUp, Delete and Alt+Shift+W work from the keyboard.
- **Test-only commits.** 95d1f6361 and 2fd5352aa only fix waits. They hide no app behaviour. PF-18s DW5 now expects the conflict state, as decided.

Breaker: Changes 2fd5352aa295b9652d5f570b4136b71c11db75ac
