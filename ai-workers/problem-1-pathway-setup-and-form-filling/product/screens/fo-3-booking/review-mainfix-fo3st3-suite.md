# Review — main fix, FO-3st3 suite (PR #2782, head dbb5819861c0f520d6d4a4698701036bdd3b9e0a)

- **Reviewer:** an independent session that did not write the fix. **Diff:** `git diff origin/main..HEAD` touches only `prototype/studio/tests/check_fo3st3_types_browser.ts` (+13/−1). No product, schema or contract change.
- **Problem:** after #2718, merge batches failed on shard 1 (job 136773685790): (a) axe `color-contrast: button[type=submit]` at "FO-3st3 panel (375)" on both tries; (b) on the 2nd try, "break M1 fail … and the list shows the type".
- **Journey score (this check's one score): 9/10, a pass.** Report: `journey-test-reviewer-mainfix-fo3st3-suite-2026-11-21.md`.

## What I ran (fresh isolated copy `rev_fo3` on :4583, never :4400)
- The suite at dbb5819, twice: **57/57, 56/56**. Screenshots were restored afterwards, nothing was committed, and the copy was stopped.
- A scratch probe with the PR's own `settle`/`changing`, at 375 and 1024 px, 3 rounds each. Before settle, Save type had background-color and color transitions running in **6/6** cases. After settle there were none and axe found nothing in **6/6**. With settle skipped, the new check fails in **6/6**, so it is red without the fix.
- A scratch variant of the suite (copied outside the repo, the PR file not changed):
  - (i) the PR's 1 s list hold with the old read (the row wait removed): **break M1 FAIL**;
  - (ii) a 1 s hold on the list GET around the stale-save Reload: **"stale save pass: after Reload the list behind…" FAIL**;
  - (iii) a 700 ms hold on PUT `/hosts/:id/set`: **both "Uses set pass" checks FAIL**.

## Judgements asked for
1. **Fix in the test, not the product: right.** The disabled Save type (`types-page.tsx:145`, `disabled={!!id && !t}`) is an inactive control, which WCAG 1.4.3 exempts. The colours axe met (bg rgb(137,179,224), fg rgb(165,165,165)) are frames of a 150 ms `transition-all` (`controls.tsx:11`) from that exempt grey to the enabled blue. They last at most 150 ms after the panel's data arrives, and no person reads text in them. The steady enabled state passes axe at every size. Removing the transition would change the shared Button contract on every screen and would not help any reader. The fade also runs with `reducedMotion: "reduce"` emulated. That is not a finding: WCAG 2.3.3's understanding excludes colour and opacity changes from "motion".
2. **Settle helper: correct and bounded.**
   - **Data cannot land after settle.** `[data-type-panel]` is the form, and it renders only once the detail query has data (`types-page.tsx:146-149`). That same commit turns Save type enabled, so the transition exists before `openType` returns. `getAnimations()` flushes style, so a transition that has just started is seen.
   - **The filter.** Only finite animations are awaited (`endTime` is Infinity for the busy spinner's endless turn). A null effect gives NaN and is skipped.
   - **The cap.** `Promise.race` with 2 s bounds the wait (the timer is not cleared, which is harmless).
   - **Cancelled animations.** `finished.catch(() => undefined)` swallows the AbortError when a transition is cancelled or replaced. The very next line, `changing()` with `ok(…)`, then fails loudly on anything still running, including a transition that started after the snapshot or ran past the cap. So the rule's intent holds: the wait cannot pass silently.
3. **Break M1 route: makes the old race fail every time and unroutes cleanly.**
   - **The predicate.** It matches only the pathname `/api/front-office/booking-types`: not `/:id`, not `/hosts/:id/set`, and the query string is ignored. Only GET is held. The POST create passes through at once.
   - **The old read fails.** The list's reload comes from `onClose → reload()` (`types-page.tsx:97`). Variant (i) shows the old immediate read fails under the hold.
   - **Unroute.** `pa.unroute(isList)` passes the same function reference, and Playwright 1.64.1 (`urlMatchesEqual`) compares functions with `===`, so the route is removed. The default behaviour lets the in-flight handler finish.
   - **The catch.** `r.fallback()` does no I/O and rejects only with "Route is already handled!". Its `.catch` is not after a wait the test relies on: if the request were never continued, `row(pa, SETNAME).waitFor({ timeout: 15_000 })` fails loudly.
4. **WAY-OF-WORKING "Every PR":** met. No `.catch(() => undefined)` follows a wait the test relies on (see 2 and 3). The new labels carry the existing "FO-3st3 …" prefix. No `any` is added (`(u: URL)` is typed).
5. **Other races left:** two, both there before this PR and both of the same kind as (b). Neither has been seen failing. Listed as Minors m2 and m3.

## Issues
**Blockers:** none. **Majors:** none.

**Minors** (follow-ups, not blocking this fix):
- **m1. The evidence screenshots show the state the fix calls unreal.** `shot(p, "panel-375"/"panel-1024")` (test ~line 306) runs before `axe`, and so before `settle`. The saved `screenshots/fo3st3-panel-375.png` and `fo3st3-panel-1024.png` show Save type mid-fade, pale blue with grey text. Fix: `await settle(p)` at the start of `shot`.
- **m2. Stale save, "after Reload the list behind shows the other person's name too"** (~line 153). Reload invalidates both the detail and the list query. The loop waits only for the detail (the Name field). After Escape, the list counts are read at once. Variant (ii) fails it. Fix: `await row(pa, NAME).waitFor()` and `await row(pa, eighty).waitFor({ state: "detached" })` before the `ok`.
- **m3. "Uses set pass" ×2** (~lines 251–258). `saveAndWait` waits for the PATCH answer plus a fixed 400 ms. The host-set PUT is sent only after that answer (`types-page.tsx:122-125`), so the database read can come first. Variant (iii) fails both. Fix: after `saveAndWait`, `await panel(pa).waitFor({ state: "detached" })` (`onClose` runs after the PUT), or wait for the PUT's response.
- **m4 (nit).** The label says "nothing is still changing colour", but the check covers any finite animation. "nothing is still animating" would be exact. The `.catch` on `r.fallback()` can be dropped.

## Could not check
- GitHub's shard-1 timing: I did not re-run CI.
- Headed or visible walk, a real screen reader, 200 % zoom.
- The builder's untracked `tests/_probe_fo3st3.ts` was in the checkout at the start of this review and was gone by the end. I did not touch it.

Verdict: Approve dbb5819861c0f520d6d4a4698701036bdd3b9e0a
