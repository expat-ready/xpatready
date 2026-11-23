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
