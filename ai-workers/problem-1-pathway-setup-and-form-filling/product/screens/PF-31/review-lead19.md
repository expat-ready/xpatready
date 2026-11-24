# PF-31 (b) web, PR 3193: review of the merge with main and the test-only change (Lead 19)

Head reviewed: `91cb4a742186bbaf8188ade098e8636947cf155e`. Scope (set by the tech lead): diff only.
- `d7132e35c`: merge of origin/main `bdcf1e7be` (PF-18ns bell and brand mark, CS-D6 reads)
- `91cb4a742`: test-only change to `tests/check_pf31_multitab_browser.ts`

Earlier rounds' D1–D20 and BIC scores are not rescored here. Running copy: :4747 (db xr_studio_mg), staff user-S of sample-solo, Studio user-A. I probed it with Playwright from the scratchpad. I inserted two `msg_notification` rows for user-S for the probe and deleted them afterwards; the count is back to 0.

**Verdict: Ship after fixes.** One Major (M1) is open, so this is Changes, not Approve.

## 1. The merge resolution (d7132e35c)
I read `git show --remerge-diff d7132e35c`. Only the three expected files differ from a plain merge. Each is resolved by keeping both sides, and nothing is lost or doubled:
- **`web/src/components/frame.tsx`**: the branch's `useTabTitle(...)` line is kept. The branch's old one-line `brand` has gone, but it was only main's earlier text and the branch never changed it. Main's four-image brand block (the wordmark, plus `data-brand-mark` and `data-brand-mark-dark` below 375 px) is there once, with its comment. Compared with main (`git diff d7132e35c^2 d7132e35c`), the only changes are the branch's own: the `workspace` prop, `useTabTitle`, `<WorkspaceStrip />` and the `data-workspace-open` menu wrapper.
- **`sales-frame.tsx`** and **`platform/frame.tsx`**: one `<Frame ... workspace={!!who}>` each. Main's controls line is kept whole, `<NotificationBell />` included and gated the same way as before (`pending.checked && !pending.terms` in the platform frame). Neither the bell nor Find appears twice. The branch's `signOutHere()` import and call, which merged without a conflict, are still there.

The rest of main's web change is `all-page.tsx`, `contract.ts`, `routes.tsx`, `notifications-page.tsx` and CS-D6's `document-reads.tsx` and `checklist.tsx`. All of it came in unchanged.

## 2. Main's new code inside workspace tabs
Every mounted tab renders the whole app, header and bell included, into its own detached box (`workspace.tsx:108`, `:303`). So with N tabs mounted there are N bells.

- **Polling: fine.** All bells share one query key. With 3 tabs mounted, the probe saw 2 `unread-count` requests in 125 s (at 58 s and 118 s), so the poll is not multiplied. Bringing a tab forward refetches the count once (`refetchQueries` on activate), which fits BR-3.
- **Badge: fine.** The count came from the shared query and was right in whichever tab was shown (`data-unread-count=2` after two rows were inserted).
- **Panel: fine.**
  - Bell panel open, then Alt+PageDown: no panel is left in the document, `body[data-panel-open]` is cleared and `pointer-events` is `auto`.
  - Going back to the tab brings the panel back, as every other Panel does in this PR ("its state stays").
  - The panel's row links are portalled to `<body>`, outside `[data-workspace]`, so BR-5's marking on Ctrl or middle click goes through the browser's own path as on main.
- **Live region: broken. See M1.**
- **Brand mark below 375 px: no clash.**
  - The mark sits in the 56 px header. Below 768 px the strip folds into the "Open items (3)" button on its own row: 360 px gives mark [16,16–40,40], bell [104,12–140,44] and strip [16,62–162,106].
  - Below 375 px only the brand gives way. There is no sideways scroll at 360 or 320 (screenshot `pf31-merge-320.png`, scratchpad, not committed).
- **Other portals or always-open dialogs from main: none leak.**
  - CS-D6's File details is `{details ? <Dialog open ...>}` using the app's `Dialog`, which is `open && shown` (`checklist.tsx:205`). The line menu is `MenuRoot` (`:183`).
  - `document-reads.tsx` adds no portal, dialog or timer.
  - The bell panel is the app's `Panel`.

## 3. The test-only change (91cb4a742)
The change is narrow and honest.
- **The selection count.**
  - `pages/history.tsx` now chooses 29 suites, and `check-select-suites.sh` passes 83/83 (run here). The limit at line 49 is unchanged.
  - check_pf31 is still chosen for every change to its own code: `workspace.tsx`, `frame.tsx` and `bell.tsx` each give "every browser suite", 235. It is also chosen for `/library/rules` (28 suites).
- **The check keeps its purpose.**
  - Scrolled-page check: the probe at 1440×400 shows the page stays scrolled (scrollY 150 before the Ctrl-click with Rules). With Releases it was 370, because `scrollIntoViewIfNeeded` moved it.
  - After the click there are 2 tabs, scrollY is 193 (+43, the strip) and `main` top is still -61. So the "content still" assertion is checked on a really scrolled page.
  - Menu check: the menu-in-a-hidden-tab line (Demo menu, Alt+PageDown, no menu, `pointer-events` not `none`) is untouched.
- **Should, pre-existing:** the scrolled check never asserts `scrollY > 0` before the click (`check_pf31_multitab_browser.ts:298`). A later layout change could make it pass on an unscrolled page without anyone noticing. A one-line `ok` would close that.

## Journey test, reviewer (scoped to the merge: staff user with several tabs and the bell)
Journeys walked:
1. The owner opens Home, then two menu items as tabs, and a notice arrives. The badge and the panel show it.
2. Panel open, then switch tab and come back.
3. Widths 360 and 320 with the strip folded.
4. Studio author: Ctrl-click Rules from a scrolled Fields page.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Badge 2, panel lists the rows, in any tab |
| Next step obvious | 1 | Bell, "Open items (3)" and Sign out are all visible at 320 |
| Plain words | 1 | Main's words unchanged |
| Feedback and state | ½ | Badge right, but the screen reader status is lost (M1) |
| Correct data | 1 | One shared count; no doubled polls; probe rows cleaned up |
| Error recovery | 1 | Panel closes in a hidden tab and comes back; page takes clicks |
| Accessibility and screen sizes | ½ | No sideways scroll at 320 and 360; BR-8 / WCAG 4.1.3 fails with 2+ tabs (M1) |
| Speed | 1 | One poll per 60 s with 3 tabs mounted |
| Visual quality | 1 | 320 px header and strip are clean |
| Trust and sources | 1 | No AI or immigration values in this diff |

**9/10, pass**, but M1 is Major. No separate journey-test report was written: the tech lead asked for this one file only.
Not tested: a real screen reader (this result comes from reading the DOM), and an intended user's own walk (D17 and D20 stay with the founder).

## Issues, ranked
1. **M1 (Major, Must). The bell's count change is announced only in the first mounted tab, which is usually hidden.**
   - **Cause.** `announcementFor` keeps one "last announced" value for the whole page (`contract.ts:52-55`). Each bell's effect consumes it in tab order (`bell.tsx:147`), so the first mounted tab's bell takes the words and every later bell gets `null`.
   - **Probe.** Tabs /home, then two menu items, with /account shown. Two notices arrive and the panel is opened:
     - The shown tab's `[data-notifications-live]` stays `""` while its badge says 2.
     - Switching to /home attaches a live region that already holds "2 unread notifications". That text is stale and is probably never announced.
   - **Impact.** Breaks PF-18ns BR-8 and WCAG 4.1.3 whenever the shown tab is not the first one. That is the normal case after opening an item from the menu.
   - **Fix.**
     - Announce only from the shown bell: use `useTabActive()` in `NotificationBell` and skip `announcementFor` while hidden, with `shown` in the effect's dependencies, so the change is said once the tab comes forward.
     - Leave a hidden bell's live region empty, so a tab coming forward never brings old words with it.
     - Add a line to check_pf31: two tabs, the second shown, the count changes, and the shown live region says it once.
2. **S1 (Should).** Add the missing `scrollY > 0` precondition at `tests/check_pf31_multitab_browser.ts:298` (section 3).

(b) Changes 91cb4a742186bbaf8188ade098e8636947cf155e
