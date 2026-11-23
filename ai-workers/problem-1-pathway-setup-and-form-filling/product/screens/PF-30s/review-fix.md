# PF-30s-fix: diff-only review of the find-box check race fix

Branch `claude/screens-pf30s-fix`, head `97ee46025a536e83970df895d697ffded2c9438f`. Scope is `git diff origin/main...97ee46025`: one file, `prototype/studio/tests/check_pf30s_find_box_browser.ts`, +13/−3. Test code only; nothing in the app changes. This review covers only the diff, so no screen review and no journey score.

## Is the root cause right? Yes, and here is the mechanism

* The app pins `react-router-dom` 7.18.2 with React 19.2.7. React Router 7's `BrowserRouter` runs every location update inside `React.startTransition` (`node_modules/react-router/dist/development/chunk-62JRHF6Z.mjs` ~l.10406–10412). There is no lazy route or Suspense in `web/src`.
* So `nav(h.url)` in `find-box.tsx` l.82 does `history.pushState` straight away. The new route renders as an interruptible transition, and the old `/home` PlatformFrame stays committed until that transition commits. `waitForURL`, `heading level 1` and `[data-find-input]` all match the old DOM during that gap.
* Typing into the old box causes urgent updates (`focusBox` → `setWide`/`setOpen`, `setText`). Those updates preempt the transition, so the typing itself makes the gap longer. Then the transition commits, the old FindBox unmounts with the typed text, and `[data-find-live]` never says "result". That matches the TimeoutError on main l.210.

**Reproduced** on an isolated copy (`rvfix`, :4577, `PLATFORM_IDENTITY=local`):

| Check | CPU 6× | Result |
|---|---|---|
| main's version (plus the same opt-in throttle line, scratch copy, deleted) | 3 runs | **3/3 TimeoutError** at the F9 `waitForFunction(... "result")` |
| this head | 3 runs | **3/3: 82/82 passed** |
| this head | unthrottled, 1 run | 82/82 passed |

I restored the screenshots the runs rewrote (`git checkout`). The worktree is clean apart from this file.

## Does `onSales` prove the new page is mounted? Yes

* **Only SalesFrame matches.** `Frame` (`web/src/components/frame.tsx` l.95) sets `aria-label={`${title} home`}` on the header brand link only when `home` is set. SalesFrame passes `title="Sales" home="/front-office/leads"` (`sales-frame.tsx` l.65), so "Sales home" is in its header on every render, including while it is loading. PlatformFrame passes `title={who ? who.firmKey : "Your firm"}` (`platform/frame.tsx` l.97). In this check the firm is `sample-firm`, so the old page's label is "sample-firm home" or "Your firm home", never "Sales home". No other `Frame` in `web/src` has the title "Sales".
* **The swap is atomic.** The route change replaces the whole tree in one transition commit. Once `header [aria-label="Sales home"]` is attached, the old PlatformFrame and its box are gone, and the next `box(p)` wait can only find the Sales box.
* **No remount after `useMe`.** SalesFrame and PlatformFrame call the same `useMe()` (`platform/session.ts` l.88, key `["fo","me",token]`), so `who` comes from the cache on SalesFrame's first render and the box mounts in the same commit. Even on a cold cache:
  * `controls` goes from `null` to `<FindBox/>` once, in the stable `<div className="ml-auto …">{controls}</div>` slot.
  * `subtitle` keeps its conditional slot.
  * A refetch keeps `data`.
  
  Nothing later in `Frame` or SalesFrame switches FindBox's position or type. LeadPage and ProspectPage each render one `<SalesFrame>` at the top level, and their loading/error states live in the body (`lead-page.tsx` l.182, `prospect-page.tsx` l.190), not around the frame. The `box(p).waitFor` (visible) after the label also covers a cold `useMe`.

## Other in-app navigations in the check: all covered

The only client-side navigations are F1's Enter (l.113), F2's row click (l.127) and F9's Enter (l.217), and `onSales` now follows all three. Every other move is `p.goto` (`home()`, F10's `goto /front-office/leads`), which loads a new document and has no stale-DOM race. The F8 and F11 stubbed hits point at `/home` but are never opened.

## Minimal and safe? Yes

* The change is three call sites and one helper with a comment that gives the reason and the evidence.
* The CDP throttle is opt-in. It does nothing unless `PF30S_CPU_SLOWDOWN` is set, and CI does not set it.
* No assertion is weakened. The F9 h1 wait it replaces only ever proved that *some* page had an h1.
* The existing `waitForURL(...).catch(() => undefined)` lines are unchanged.

## Findings (none blocking)

* **Minor, residual window, F9 only.** The "/" shortcut listener is added in a passive `useEffect` (`find-box.tsx` l.46–50). For a transition commit, React flushes passive effects after paint, not in the commit. So there is a short gap where the Sales box is in the DOM but "/" does nothing yet, and a "/" pressed in that gap would be lost. This gap is far smaller than the one fixed here, and it passed 3/3 at 6×. Optional hardening, without dropping the BR-1 "/" step: after `press("/")`, wait for `document.activeElement` to be `[data-find-input]` before typing, so a lost key fails clearly instead of as a 15 s "result" timeout. F1 and F2 are not affected because `find()` clicks the box.
* **Nit.** If Enter or a click ever fails to navigate (a real product bug), F1 and F2 now throw `onSales`'s 30 s TimeoutError instead of recording the named `ok(...)` FAIL line. The run is still red, just less clear.
* **Nit, already on main.** F1's "the box is cleared" now always reads a freshly mounted Sales box, which starts empty anyway, so the clause can no longer catch a `reset()` regression. This is out of scope here and is noted only so it is not mistaken for coverage.

**Verdict: Approve.** No Blocker or Major is open. The two nits and the Minor can go into a later row if wanted.

Reviewer: Approve 97ee46025a536e83970df895d697ffded2c9438f
