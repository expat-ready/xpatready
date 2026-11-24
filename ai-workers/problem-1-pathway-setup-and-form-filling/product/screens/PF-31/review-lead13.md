# PF-31 (b) review of the Lead 13 fix: head 2fd5352aa295b9652d5f570b4136b71c11db75ac

**Verdict: Changes (Ship after fixes).** Two Majors are open. The rest of the fix is right and fixes the root cause (one `main`, nav strip, router state, terms dialog, 409 guard, check races).

Scope: a diff-only review of 1ea167cf3, 6775f42a9, f9bdd7a1c, 5f77dcba0, a76b86b44, 95d1f6361 and 2fd5352aa, each read with `git show`. The merges 6051a00b1 and 0c18bd8e0 are left out. The app was walked on the builder's copy at :4746 with my own records: firm sample-solo, user-S, my own lead L-00001 "Reviewl13", and Studio person user-A. Probes were Playwright scripts kept outside the repo. Nothing was changed in the code.

## Findings, ranked

1. **Major: staff pages outside `/platform` and `/front-office` count as "another area", so PF-31's open-or-focus is lost for six "My account" items.** Source: `web/src/components/workspace.tsx:43` with `:188` (6775f42a9).
   - `personAreaOf` labels anything that is not `/platform`, `/front-office`, `/cases`, `/clients`, `/sign-in`, `/link` or `/inbox` as "studio". That includes the staff pages `/home`, `/account`, `/account/licence`, `/account/availability`, `/account/notifications`, `/settings/billing` and `/invitation` (`modules/platform/routes.tsx`, `modules/front-office/routes.tsx`).
   - What I saw on :4746, starting from `/platform/offices` with Offices and Team open:
     - Ctrl-click on "Team" adds an in-app tab, as before.
     - Ctrl-click on "Profile" (`/account`) adds no tab and opens a **second browser page** (the context went from 1 page to 2).
     - A plain click on "Home", a `data-workspace-open` menu link, **replaced the Offices tab** with Home, giving `[/home*, /platform/team]`.
     - From `/home`, a plain click on "Security" replaced the Home tab.
   - The same staff menu now behaves two ways. This regresses PF-31's own rule (a menu link opens or focuses a tab). No suite catches it: pf31 only clicks `/platform/*` links.
   - **Fix:** take the staff area from the staff route table, ideally a path list exported next to `modules/platform/routes.tsx` and the front-office routes so it cannot drift. Add a pf31 line: Ctrl-click "Profile" from Offices opens a background tab, and a plain "Home" click opens or focuses one.
2. **Major: after a normal Sign out, the tab list is still kept (the NOBODY state is overwritten), and the staff address lands in the signed-out list.** Source: `workspace.tsx:218-231` against `:233-238` (f9bdd7a1c).
   - `signOutHere()` runs `onForget` first, which sets `shownOwner = NOBODY`.
   - When the server answers 200, `frame.tsx:91` calls `endSession(null)`. `onStaffChange` then sees `scope` change from X to null, finds no end reason and `was = NOBODY ≠ "local"`. It sets `shownOwner = "local"` and runs `load()`.
   - `load()` takes the "local" list's shown tab and moves it to the current staff address (the 5f77dcba0 rule), and the save effect writes the result.
   - Measured on :4746: signed out on `/platform/branding`, and `sessionStorage["xr.workspace.v1:local"]` then held `{"path":"/platform/branding"}`, which replaced the earlier `/sign-in` tab.
   - Only the 401 path holds, because there the end reason returns early. That is the only path pf31 checks (line 300, and its `staffLists` leaves `:local` out).
   - This breaks the commit's own claims ("Sign out keeps no list", "no staff address reaches the signed-out list") and round 5's rule that "nothing of the person may stay". It also happens in the person's other windows through the `signout` broadcast. The impact is low (only an address, replaced on the next page load), but a claimed person-scope guarantee does not hold.
   - **Fix:** in `onStaffChange`, `if (was === NOBODY && owner === "local") return;` (keep NOBODY until a sign-in). Add a pf31 line for a 200 Sign out: no `/platform` or `/front-office` address in `xr.workspace.v1:local`.
3. **Minor, pre-existing (not caused by this fix; asked about): a hidden tab still writes `document.title`.** Source: `web/src/App.tsx:83`.
   - Each mounted Studio tab runs its own `App` effect. On Fields, Ctrl-click "Releases" sets the title to "Releases · Product Studio" while Fields is the page shown.
   - `/cases` shows the same title, and switching back does not fix it, because the effect is keyed on the label (WCAG 2.4.2).
   - Fix: write the title only when `useTabActive()`, and re-run it on activation.
4. **Minor, pre-existing: a user-opened Radix menu stays drawn over another tab.** Source: `workspace.tsx:195-198`.
   - Open the Studio "Demo" menu and press Alt+PageDown. The tab changes, but the menu (portalled to body) stays open over the new tab until Escape.
   - Fix: ignore Alt+PageUp/Down while a `[role=menu]` or modal is open, or close open layers on switch.
5. **Minor: switching tabs with the mouse drops focus to `<body>`.** Source: `workspace.tsx:310` and the 375 px menu at `:328`.
   - The clicked item sits in the box that is taken out of the document. The keyboard paths (arrows, Alt+PageDown) do refocus.
   - This also happened before (`hidden`). Fix: call `focusTab(t.id)` after `activate`, as `go()` does.
6. **Minor: scroll comes back 10 px short on every round trip.** Measured on `/platform/activity-log` at 1440×450: 200, then 190, then 180. Offices went 326, then 306.
   - I could not tell whether detaching caused this. Window scroll is otherwise kept per tab.
7. **Minor: arrow keys on the strip are not discoverable.** Only the current item is tabbable (`tabIndex` -1 elsewhere, `:308`), and since `role=tab` is gone nothing tells a person that the arrows move along the strip. `aria-keyshortcuts` names only Delete.

## Each fix against the tech lead's rules

| Claim | Result |
|---|---|
| Hidden tabs portal into a detached box; only the shown box is in the document | **Met.** Two and three open items gave one `main`, one `main h1`, one `nav "Open items"`, one child in the slot, and no tab roles. The `--ws-top` reading taken while detached is corrected by ResizeObserver: 99 px after every switch. |
| One `main` for the visible tab only; no change to strip widths | **Met.** The strip classes (`h-9 max-w-56 min-w-24`) are unchanged. axe WCAG 2.2 A/AA is clean with the strip drawn at 1440, 1024 and 400 px, with no sideways scroll. |
| Strip is `nav` with `aria-current` | **Met** (see 7). |
| A link into another area keeps the browser's behaviour | **Not met** for staff pages outside `/platform` (finding 1). It holds for Studio to cases. |
| A session that ends by itself leaves the screen; reset only on a real change | **Met in code.** `lastScope` ignores "Sign in again here". Same person: carries on. Another person: their own list, the others removed. |
| Sign out on purpose keeps no list (NOBODY) | **Only on the 401 path** (finding 2). |
| No strip with one item | **Met.** No strip at 1440 or 375 px with one item; the second item brings it. |
| A load to an address no tab has moves the shown tab, unless it holds a draft | **Met.** With a lead phone draft in the shown tab, loading `/platform/security` added a tab and kept the draft tab. The next load to `/platform/branding` moved the Security tab. A full load loses nothing but the moved tab's address, because only stored drafts survive a load anyway. |
| History keeps `{ ws, usr }` | **Met.** The activity log's `usr.auditOwner` is kept over a background open, tab switches, Back and Forward. |
| Terms dialog only in the shown tab | **Met in code.** The early return comes after every hook (`terms-gate.tsx:80`). |
| Lead phone guard freed on 409 | **Right.** `sending.current = false` is set before `setConflict` (`lead-page.tsx:64`), and a later `mutate` supersedes the old callbacks. |
| Office Close asks only for a record's draft | **Matches main.** On main, the footer Close never asked. |

Test changes:
- **pf31 selectors and the new one-`main` line:** forced by the nav change and a visible change. Justified.
- **"No strip for one item":** a visible change, with the reason given.
- **PF-18s DW5:** it now expects the conflict state that PF-31 already showed and that was approved (T5). The assertions still cover the 409 words, the saved name and the stored value after Keep mine. Justified. The commit names "the founder's 23 Nov decision" but gives no P-number; EXPERIENCE line 43's conflict state carries it.
- **bk4a:** registering the wait before `goto` is Playwright's documented pattern, and no assertion is weakened. Strictly, it is not "a change a person sees", so it is the tech lead's call. I did not reproduce the race on main.
- **multi-view T8:** it now waits for both the stored value and the 200. Stricter. Justified.

PF-31's own behaviour after the fix:
- Drafts (dot, close question, kept on load): held.
- B1 person scope: held except for finding 2.
- Conflict and M1–M3: unchanged code paths. I did not re-run them.
- Hidden tabs' other document effects (all from before this fix, not regressions):
  - document listeners still fire in hidden tabs (`find-box.tsx:49`, `job.tsx:62`, `programs.tsx:150`) and change only hidden state;
  - in-app navigation into another area (Demo > "Open the case area") still mixes the case area and Studio tabs in one strip.

## Journey score (reviewer, the one score for this check): 8 / 10

Journeys walked:
- **J1:** the Owner opens Team and Activity log in the background, then switches by click, arrows, Alt+PageDown, Back and Forward.
- **J2:** "My account" links outside `/platform`.
- **J3:** a lead phone draft, then typing other addresses.
- **J4:** Sign out (200), then the case area.
- **J5:** a Studio background tab and the title.
- **J6:** Demo menu plus Alt+PageDown.
- **J7:** axe, 400/1024/1440 px, and keyboard to the strip (5 Tabs).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J2 fails (finding 1) |
| Next step obvious | 1 | J1 and J3 clear |
| Plain words | 1 | "Open items", unchanged words |
| Feedback and state | ½ | wrong title (3), focus to body (5) |
| Correct data | ½ | staff address kept after Sign out (2) |
| Error recovery | 1 | draft tab kept on load; 409 frees the guard |
| Accessibility and sizes | ½ | axe clean, no sideways scroll; title and focus (3, 5) |
| Speed | 1 | switches render the same frame |
| Visual quality | 1 | no strip for one item; classes unchanged |
| Trust and sources | 1 | nothing AI-made or sourced in the strip |

Fixing findings 1 and 2 raises task completed and correct data. Fixing 3 and 5 raises feedback and accessibility.

## Not checked

- I did not run the full suites. pf31 seeds sample-firm and signs in user-R on the shared copy, and the breaker is using it. I rely on the branch's 67/67 and the 32 named suites.
- No screen reader. No intended user's unaided walk (D17 and D20 stay with the founder).
- No separate journey-test file, screenshots, or BIC table. The task allowed only this file, and PF-31 is not a case-side screen.
- I did not compare scroll drift (6) against 74e27fc45.

## Addendum: re-review of head 30ab3cde21af8b6f94ff9c0918bc5b70c65f55a0 (24 Nov)

**Verdict: Changes (Ship after fixes). One Major is open: the M3 scroll fix moves the page by the strip's height on a page that is scrolled.** Both earlier Majors are fixed.

Scope: diff only, `git show 6c4ff1f54` and `git show 30ab3cde2`. I walked the fresh copy at :4747 as user-S (sample-solo) and as Studio person user-A. Synthetic clicks were used where Playwright's own scrolling would have hidden the result.

### Earlier findings
- **Major 1: fixed.** `personAreaOf` now gives "cases" for `/cases` and `/clients`, `/sign-in`, `/link` and `/inbox` each their own, and "app" for everything else (`workspace.tsx:45`).
  - Ctrl-click on "Profile" (`/account`) from Offices opens a background app tab, and the browser keeps one page.
  - The menu's Home (`[data-workspace-open]`) opens a new tab. A second click on Profile focuses the tab already open.
  - bk3_links and bk4a still Ctrl-click from the Studio into `/cases`, which is still another area, so they keep their browser tab.
  - The new pf31 line covers it.
- **Major 2: fixed.** `if (was === NOBODY && owner === "local") return;` (`workspace.tsx:226`). After a Sign out answered 200, sessionStorage held only the old `xr.workspace.v1:local` `/sign-in` list and no staff address. The new pf31 line checks every list.
- **Minor 3 (title): fixed.** Ctrl-click on Releases from Fields keeps "Fields · Product Studio". The title follows on activation, because `shownTab` is in the effect's dependencies.
- **Minor 4 (menu over another tab): fixed by MenuRoot**, although the note lists it as left for later. Demo menu open, then Alt+PageDown: no `[role=menu]` left and body `pointer-events: auto`. All seven `DropdownMenu.Root` now go through `components/ui/menu-root.tsx`, and none is left.
- **Minor 5 (focus on a mouse switch): fixed.** `focusTab` runs on click, and focus is on the shown strip item.
- **Minors 6 and 7:** left for the follow-up, as agreed.
- **job.tsx keys (breaker m6):** right; the listener is attached only while the tab is shown.
- **Breaker M2, "Add an office" Close:** I agree it stays. Main's footer Close never asked (checked on main at 430ef1aca).

### New findings
1. **Major: on a scrolled page, the strip appearing or going away now moves the content by the strip's height.** Source: `web/src/components/workspace.tsx:296-308` (30ab3cde2).
   - Chrome's scroll anchoring already keeps the content still when the sticky strip is added above the viewport. The effect then calls `window.scrollBy(0, h)` on top of that, so the correction happens twice.
   - Measured on Studio Fields at 1440×400, from scrollY 150, with a Ctrl-click on Releases:

     | Case | scrollY | Heading moved |
     |---|---|---|
     | Anchoring on (default) | 150 → 236 | −43 px |
     | `overflow-anchor: none` | 150 → 193 | 0 px |
     | Page at the top | 0 → 43 | 0 px (correct) |

   - Staff `/platform/activity-log` gave the same result in both directions:
     - appearing: scrollY 150 → 236, heading −43 px;
     - closing the other tab: 150 → 61, heading +46 px.
   - So breaker M3's case ("Ctrl-click Edit row after row") is fixed only at the top of the page and broken again as soon as the list is scrolled. The new check measures only at scrollY 0 (pf31 T1).
   - **Fix:** measure the change instead of assuming it. Keep the shown box's top from the last layout in a ref, then scroll by the actual change; anchoring differs by browser (Safari has none). The alternative is to set `overflow-anchor: none` on the root while the strip toggles.
   - Add the T1 check from a scrolled list as well.
2. **Minor: the `[data-ws-room]` spacer is left on `<body>` when the strip unmounts without `drawn` going false.** Source: `workspace.tsx:300-307`.
   - Example: the session ends and the Frame drops `workspace`. Seen on :4747 as room 1 with no strip after my session was ended elsewhere.
   - It is only an aria-hidden gap at the foot of the page until a reload. Fix: remove the spacer (and undo the scroll) in the effect's cleanup.
3. **Minor: closing back to one tab undoes the scroll only in the tab that measured the strip's appearance** (`strip.current` is 0 in any other tab). It folds into fix 1.

### Test changes in the delta
- pf31 gains four lines: My account Ctrl-click, Sign out answered 200, the strip not moving the list at the top, and a menu closing in a hidden tab. Each is a change a person sees, with its reason, and the code before fails them (67/69, then 69/71).
- They are justified. The T1 line needs the scrolled case (finding 1).

### Journey score: 9 / 10

| Criterion | Change from before |
|---|---|
| Task completed | ½ → 1 (My account links work) |
| Correct data | ½ → 1 (no list after Sign out) |
| Accessibility and sizes | ½ → 1 (title and focus) |
| Feedback and state | stays ½ (the page jumps 43 px when scrolled, finding 1) |
| Visual quality | 1 → ½ (the same jump, and the spacer left behind) |

Everything else is unchanged at 1.

Not checked: full suites (shared copy, and the breaker ended my user-S session once during the walk); Firefox and Safari anchoring; a screen reader.

## Addendum 2: re-review of head a42412e7f653e4abd05909a96b87be97f5b4ede8 (24 Nov)

**Verdict: Approve (Ship).** No Blocker or Major is open.

Scope: diff only, `git show a42412e7f`. I walked :4747 as user-A (Studio) and user-S (sample-solo), using synthetic Ctrl-clicks so that Playwright's own scrolling could not hide a jump.

### The Major from addendum 1: fixed
The tab now scrolls by how far `main` actually moved, read in render before the DOM changes (`workspace.tsx:305-318`).

Measured on Studio Fields at 1440×400:

| Start | Strip appears | Strip goes (other tab closed) |
|---|---|---|
| Scrolled to 150 | scroll 150 → 193, `main` −61 → −61 | back to 150, `main` −61 |
| At the top | scroll 0 → 43, `main` 89 → 89 | back to 0, `main` 89 |

- On the short staff Offices page at the top, the spacer is added (room 1) and `main` stays at 56.
- In the cases where the active tab also changes, the render-time read can see the old tab's `main`. `show()`, `close()` and `leave()` then restore each tab's own scroll in their rAF, which overrides it. Only the person-change reset has no such restore, and it is rare.
- **Minor 2 (spacer left behind): fixed in code.** The cleanup on unmount removes it. The session-end walk did not trigger on my run, so this is checked in the code only.
- **Minor 3 (one-tab undo): gone** with the measured scroll.
- The new check line measures from a scrolled page. Justified.

### The breaker items in this commit
- **N1:** `PUBLIC` (`workspace.tsx:49`) puts `/pricing`, `/book`, `/sign-up`, `/invitation`, `/front-office/web-form/…`, `/sign-in`, `/link` and `/inbox` each in its own area. A Ctrl-click on one keeps the browser's behaviour.
  - The staff settings page `/front-office/settings/web-form` is not caught by it. Correct.
  - Nit: the check line plants its own `<a href="/pricing">` instead of clicking Home's real link. That does test the rule, but the comment says "as Home shows it".
- **N2:** the tooltip's `useTabActive()` is called on every render, so the hook rule holds. A hidden tab draws no tooltip.
- **N3:** the cap notice is positioned against the sticky strip, so the strip does not grow and `--ws-top` is unchanged.
- **m1:** the "local" list leaves out `STAFF` addresses (`workspace.tsx:120-123`). After a reload while signed out, `xr.workspace.v1:local` held only `/sign-in`.

### New Minors, for the follow-up (not blocking)
1. **The spacer is removed on any tab switch.** The shown-strip cleanup at `workspace.tsx:319` also runs when `shownHere` goes from true to false.
   - On a short page, the scroll of 43 is then clamped to 0 when you come back. Offices `main` sat at 56 before the switch and 99 after the return.
   - This does not affect the Ctrl-click-row-after-row case, where the person stays on the list.
2. **The cap notice (N3) now covers about one line of the page's top for its 6 seconds**, including the top of an open side panel.
   - It appears only at 12 tabs. It could hide a focused control briefly (WCAG 2.4.11).
3. **Earlier Minors 6 (10 px scroll drift) and 7 (strip arrows not discoverable) stay as agreed.**

### Journey score: 10 / 10
Up from 9. Feedback and state, and visual quality, are now 1: the content no longer jumps when the strip appears or goes, at the top or scrolled.

Not checked: the full suites (I rely on the builder's 73/73 twice), Firefox and Safari anchoring, a screen reader, and the spacer cleanup on a live session end.

## Addendum 3: re-review of head 13621c4934697cc2721a1f336264280f68a6f854 (24 Nov)

**Verdict: Approve (Ship).** No Blocker or Major is open.

Scope: diff only, `git show 13621c493`. I walked :4747 as user-S with my own lead L-"Reviewfin".

### Product change: refetch when a tab comes forward
The change is `workspace.tsx:130-131` (the effect is on 131): when a tab comes forward, `queryClient.refetchQueries({ type: "active", stale: true })` runs. The first show is skipped.

Measured with four tabs open (lead with a phone draft, Leads, Team, Activity log):
- **Switch after 2.5 s idle:** 12 GETs. These are every stale active query, the hidden tabs' queries included.
- **Switch back within 2 s:** 1 GET.
- **12 Alt+PageDown at 60 ms:** 24 GETs in total, none failed or cancelled.

The amount is bounded by the 2 s staleTime, so there is no storm.

Nothing a person has open is clobbered:
- The typed phone draft stayed (`+14165550111`) over a switch-back that refetched.
- I let another save go through first (200), then saved. The conflict box opened, and after 2.5 s away and back (which refetched the lead with the newer version), both the conflict box and my value were still there.
- Drafts live in `useSharedDraft` and the conflict in component state, so a refetch only renews the base. That is the same thing T4's "saved" invalidation already does.

### Test change in check_pf5t: justified
- The cause is a change a person sees: PF-31 keeps Terms open in its tab, so the accept's invalidation now re-reads the list at once rather than at the next visit. The reason is written in the check (`check_pf5t_terms_browser.ts:156` and `:160-162`).
- The 428 pass-through only stops the route rewrite from crashing on a non-list answer. No assertion is weakened.
- Nit: the 2.1 s wait is tied to the staleTime. Waiting for the acceptances response after the click would hold if staleTime ever changes.

### Minors, for the follow-up (not blocking)
1. **Every switch also refetches queries that opt out of the staleTime, in hidden tabs too.** The activity log's `["pf","audit",…]` has `staleTime: 0` (`activity-log-page.tsx:88`), so it was fetched on all 13 of 13 fast switches between other tabs.
   - So the claim "matches the remount of before PF-31" is broader than a remount, which refetched only that page's queries.
   - Possible fixes: refetch only on a switch, not on each key press, or leave out queries whose observers sit in hidden tabs.
2. **`refetchQueries` cancels any refetch already running** (`cancelRefetch` defaults to true). On a slow network, switching faster than the answers arrive keeps restarting them.
   - Passing `{ cancelRefetch: false }` keeps the request already running. I saw no failures locally.

Journey score unchanged: 10 / 10.

Not checked: the full suites (I rely on pf31 73/73 twice and pf5t 35/35 three times), a slow network, and other browsers.
