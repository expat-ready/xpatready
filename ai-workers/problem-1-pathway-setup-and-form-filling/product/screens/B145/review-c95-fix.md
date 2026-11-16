# B145 · C9.5-fix (P-641): "Read the list again" keeps Move off until the new read lands — review

Independent reviewer (did not build it), 16 Nov 2026. **Commit reviewed: `20494ba437d1a5cdcf28d5764048520aa3a055e6`** (PR #1989, branch `claude/lucid-bardeen-mzwdw5`, merge base `47b00dda`). Diff: 3 files (`web/src/runtime/release-update.tsx` +9/−1, `tests/check_c95_release_update_browser.ts` +5/−1, `product/tools/flaky-ledger.tsv` +1). Isolated copy `rv_c95` on :4466 only (started, then stopped and dropped), never :4400. Live AI off, US$0, no priced button. Journey report: `journey-test-reviewer-2026-11-16.md` (**8.5/10, pass**).

## Runs
* `check_c95_release_update_browser.ts 4466 xr_studio_rv_c95`, the PR's code, fresh copy: **34/34, exit 0** (200 s), then **34/34, exit 0** (171 s). Run from a scratchpad copy that differs only in the screenshot folder, so the tracked PNGs were not rewritten.
* Probes in the scratchpad (not committed), sampling the panel every 25 ms: success path, a GET answering 500 during the read, and Tab pressed while the read runs (GET held back 3 s).
* `flaky.mjs --self-test` 14/14. CI on this head: `pr-rules` **red** ("MISSING: no Done when"), see m5.

## (a) Cause and place of the fix: confirmed
* **Move was on with the old list.** On main, `onClick={() => { setProblem(null); void q.refetch(); }}` cleared the conflict straight away. Move's `disabled` depends only on `problem?.kind === "conflict"` and `refused` (`release-update.tsx:158`), so Move came back on while `v.target` was still the release that was refused. My conflict screenshot shows the window: the panel still says "Release 1 → Release 8" and Move reads "Release 8" while the server already answers Release 9.
* **The refetch threw away the 409's read.** The 409 handler starts a read with `invalidateQueries(["runtime","view",caseId])` (`:147`, a prefix of the query key at `:39`). `refetch()` defaults to `cancelRefetch: true` (`query-core/build/modern/queryObserver.js:171`), and with data present it cancels the read already running (`query.js:188`). The new list therefore needs a second full read: 1.3–3.9 s measured here.
* **Nothing on screen was busy.** `settle()` (test `:46`) waits only for `aria-busy` or `.animate-spin`. It returned at once, so `Enter` landed about 1.1 s later (300 + 800 ms), still inside the window.
* **The fix is in the narrowest place.** `reread()` (`:126-129`) awaits `q.refetch()` and clears the conflict only when `!r.isError`. The button is `busy` meanwhile, so `settle()` and a person both wait. Server, contract, `move()` and the 409 handler are unchanged. No re-render ordering hole: `refetch` resolves after `updateResult()`, and `useSyncExternalStore` reads the current result in the render that applies `setProblem(null)`. Probe A: `move:"off"` for every sample until the conflict cleared, then `ON:Release 9`.

## (b) The test is stronger, not looser
* The old check accepted any `/Release \d+$/`. The new one requires `Move this case to <the server's newest label>` **and** no conflict on screen (`:95-97`).
* No retry was added, no timeout was raised, no `ok()` was removed. `press()` now waits for the busy read through `settle()`.
* The builder's fail-first evidence on main (Release 8 vs Release 9, 33/34) matches my screenshot of the window. I did not re-run main's code.
* Gap, m2: the guard depends on timing.

## (c) Keyboard and focus
* Both buttons are reachable by keyboard. Reread has `aria-busy` and a spinner. Move is a real disabled button while the conflict stands, and is enabled after the read. axe found nothing in the conflict state (2/2 runs).
* **Focus after the read.** `busy` sets `disabled` (`controls.tsx:36`), so Chromium drops focus from the pressed button to `<body>` for the whole read. When the notice unmounts, Radix FocusScope's mutation fix-up (`handleMutations`, activeElement is body and nodes were removed) moves focus to the dialog container (`div[role=dialog]`). One Tab then goes to Close, and Shift+Tab goes to Move.
* **During the read, Tab stays in the dialog.** It continued from the button's place (to the "4 items" count), never to the page behind.
* **Main's code** removed the button at once, so Radix put focus on the container immediately. The fix adds a 1–4 s stretch with focus on `<body>`. This does not break WCAG 2.4.3: focus never leaves the modal and the order stays meaningful. It does lose the place, so it is filed as m1.

## (d) Error path: met
* A GET answering 500 during the read (2 GETs: `retry: 1`) gives `r.isError`, so the conflict stays and **Move stays off** ("Release 9", disabled). Pins: 1, nothing changed. Main would have turned Move on over the old list.
* The panel body becomes the existing `q.isError` notice "The list could not be worked out", which has no retry button (m4, already on main).

## (e) Regressions: none found
* `move()`, the success toast, and focus to `#release-moved-h` are unchanged. 2/2 runs moved the case (pins 1 → 2), and Fill then made the copy on the new release.
* The "This case was moved while you read the list" branch (`:169-171`) has no reread button and is untouched. If a reread finds no newer release, it clears the conflict and shows "This case is on the newest release", the same as main.
* The `refused` path is untouched. Closing the panel during a read is harmless: React 18 ignores state set after unmount, and the query keeps its cache.
* Ledger: the `release` line is well-formed (tabs). Its date `2026-11-16` is UTC midnight. A retry on 16 Nov before the merge would still count, but the builder shows none.

## Scores touched by this fix (other D and BIC scores stand as in `review.md`)
| Item | Score | Evidence |
|---|---|---|
| D5 Stability and recovery | Met | The double-refusal loop is gone. A failed read keeps Move off (probe B). |
| D11 Feedback and state | Met | Spinner and `aria-busy` on reread, Move off until the new list arrives (probe A). |
| D13 / BIC-20 Accessible, keyboard | Partly | Keyboard path complete, axe clean, 1024 px no scroll. Focus sits on `<body>` during the read, then on the dialog (m1). |
| D16 Testability | Partly | The check got stronger. It still depends on timing (m2). |
| BIC-18 States | Met | The conflict state shows "running" while the read runs. The failed state is the existing error notice. |
| D17, D20 | Simulated only | No intended user walked it. |

## Issues (ranked). No Blocker, no Major.
**Minor**
* **m1 · Focus is lost to `<body>` during the read and lands on the dialog container after it** (`release-update.tsx:128`; `controls.tsx:36`). *Should.* After a successful read, focus Move: give it a ref, then `requestAnimationFrame(() => moveRef.current?.focus())`, the same pattern `move()` uses for `#release-moved-h`. Then the keyboard is on the next step instead of back at Close.
* **m2 · The regression guard depends on timing** (test `:92-97`). With main's code it fails only when the read takes longer than about 1.1 s. *Should.* Right after `Enter` on reread, before `settle()`, assert that `[data-release-move]` is disabled (or reread has `aria-busy`) while `[data-release-conflict]` is present. Removing the rule then fails on any machine.
* **m3 · `q.refetch()` still cancels the 409's own read**, as the code comment says. `q.refetch({ cancelRefetch: false })` would join it and roughly halve the 1.3–3.9 s wait. Optional; correctness is the same.
* **m4 · Already on main, not this PR's:** a failed read replaces the panel body with "The list could not be worked out" and offers no retry inside the panel. The only way back is Not now, then open the panel again. Note only.
* **m5 · Process:** `pr-rules` fails on `20494ba` (body has no "Done when"), and the body still says "10 in a row with the fix: below (filled in when the runs end)". *Must before merge* (the merge gate). Not a code finding.

## What I could not check
A real screen reader announcement during the busy read. Firefox and Safari focus behaviour on a disabled focused button (Chromium only). Main's code at this commit, which I did not re-run (I rely on the builder's fail-first log and my mid-window screenshot). CI's own run of the suite on this head (it has not run).

Verdict: Approve — Blockers: none · Majors: none · Minors: m1 focus to Move after a successful read (Should); m2 add a timing-independent assertion that Move is off while reread is busy (Should); m3 `cancelRefetch: false` (optional); m4 already on main, no retry in the error notice (note); m5 fix the PR body so `pr-rules` passes (Done when; fill in the 10-run line) before merge.

## Re-review (f2c20eee5)
**Diff reviewed:** `git diff 8cb41dc5d f2c20eee5 -- prototype/studio` (P-277): `release-update.tsx` +7/−4 and the browser check +8/−2. I read the code at `f2c20eee5` with `git show`, not from the working tree, which holds the builder's fail-first edit. I judged from the code only and started no copy, because the builder's runs on :4462 and :4464 rebuild `web/dist`.

* **m1 (focus on Move): met, with no ordering hole.**
  * `reread()` calls `setProblem(null)` and `setFocusMove(true)` after the `await`, then `setRereading(false)` in `finally`. These run in the same synchronous continuation, so React 18 batches them into one render.
  * In that render `problem` is null and `v` is already the new result: `refetch` resolves only after the observer's `updateResult()`, and `useSyncExternalStore` reads the current result. Move's `disabled` (`!v.target || refused || conflict`) is therefore already false in the DOM that commits.
  * `useEffect` runs after commit, and only when `focusMove && !problem`. So it cannot focus Move while Move is still disabled for the conflict.
  * If the new read shows no newer release (`!v.target`) or a server refusal, Move stays disabled. `focus()` then does nothing, and Radix's fix-up puts focus on the dialog container, as before. No error results, and the flag is reset.
  * A failed read sets no flag. `Button` forwards its ref (`controls.tsx:33`).
  * Accepted trade-off: if the person tabbed elsewhere during the read, focus jumps to Move when the read lands. Move is the next step of the action they started.
* **m3 (`cancelRefetch: false`): met and correct.**
  * The read it joins can only have started at or after the 409. `invalidateQueries` cancels any older read and starts a new one, and the reread button exists only after a conflict 409.
  * A failed joined read gives `r.isError`, so the conflict stays and Move stays off. That is the same as round 1's (d).
* **m2 (Move off asserted before `settle()`): sound on main; on the fix, true except a narrow race.**
  * **On main it is false whatever the machine's speed.** Enter fires `click`, a discrete React event. `setProblem(null)` is flushed in the microtask at the end of that event, before Playwright's next round trip, and Move is then enabled whether or not the 409's read has landed.
  * **With the fix it is true while the read runs.** The race: because the read now joins the 409's read (m3), that read may land between Enter and `isDisabled()`, which is a few CDP round trips (roughly 10–50 ms) against a read of 1–4 s.
  * When does this happen? `state("conflict")` takes about 2–3 s and the read 1.3–3.9 s, so the 409's read is often still running at Enter. I estimate under 1 % of runs.
  * In those runs `moveOffWhileReading` is false on correct code. That is a pass-on-retry, which `flaky.mjs` counts toward quarantine.
  * The focus check (`activeElement === Move` after the read) is sound. It is true with the fix, and on main focus is on the dialog container. Pressing Enter without `.focus()` now really walks the keyboard path.
* **m5:** body fixed per the coordinator; I have not re-checked `pr-rules`.

**n1 (Minor, Should; no regression in the product).** Remove the race from the check, keeping it deterministic both ways. Before Enter on reread, wait until the 409's read has landed, for example `await p.waitForFunction((l) => document.querySelector("[data-release-move]")?.textContent?.trim().endsWith(l), newestLabel)`, with `newestLabel` read from the API first. Then the reread is a fresh read of at least 1 s, and `isDisabled()` cannot lose the race on the fix. Main still fails at once. Alternatively, accept it and watch the ledger.

Verdict: Approve f2c20eee5ada37bd697a87789b9ebeae83b62d3d — Blockers: none · Majors: none · Minors: n1 (the Move-off check can, rarely, lose a race with the joined 409 read; wait for that read before Enter); m4 is already on main (note).
