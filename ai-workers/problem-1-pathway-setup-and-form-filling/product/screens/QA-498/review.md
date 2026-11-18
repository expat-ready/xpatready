# QA-498 review: BK-5 BR-6 lands on Immigration programs in any shard order (PR #2054)

Independent reviewer (Opus 5.5), 17 Nov. Commit **57ce8390665eaeb3615322b908d1d8a8802f2a17** (`claude/runtime-qa498`), diff `origin/main...57ce839`: 2 files, +8/-9. It is a test or timing fix with no breaker. I reviewed it **read-only**: the builder is running the browser suites on this machine, so I started no isolated copy and ran no browser suite (on the caller's instruction). Journey score (reviewer; the one score for this check): **8.5/10, pass**, from code and evidence with no browser walk (`journey-test-reviewer-2026-11-17.md`).

**Verdict: Ship.** There is no open Blocker or Major. Approve 57ce839. One condition: DW2's pasted results must be on the PR before the label (see the DW table).

## Root cause: verified in the code (DW1)
* **The landing order** is in `web/src/pages/start.tsx:200-201`. After `await api("/demo/load")` it calls `toast.push(...)`, then `onClose(); nav("/")`.
  * `toast.push` (`web/src/lib/api.ts:78`) is a plain `setList`, so it is an urgent update.
* **React Router's transition** is in `react-router` 7.18.2, the installed version and the one `package.json:72` pins. In `node_modules/react-router/dist/development/chunk-62JRHF6Z.mjs:10391-10413`, `BrowserRouter`'s `setState` runs `React.startTransition(() => setStateImpl(newState))` unless `useTransitions === false`.
  * `App.tsx:43` mounts `<BrowserRouter>` with no `useTransitions` prop, so navigations render inside a transition.
  * `history.push` changes the URL synchronously. So the URL `/` and the toast commit before the route tree re-renders. The old Starting points page stays on screen until the transition commits.
  * This matches the builder's timeline: at the toast, the URL is `/` and the h1s are `["Starting points Demo"]`; Immigration programs follows 48 ms later at x1, and 303 ms later at x6.
* **ProgramsPage renders its h1 unconditionally.** `web/src/pages/programs.tsx:123` has one top-level `return`, at line 257, and the `<h1>Immigration programs</h1>` is at line 261. There is no early return, no Suspense and no `use()` in `programs.tsx` or `App.tsx`. So once the transition commits, the heading is there, even while the cards still show skeletons.
  * The builder's head run (screenshot `BK-5-start-page/screenshots/bk5-09-door2-landed-1440.png`, uncommitted in the working tree) shows exactly this: the h1, skeleton cards and the done toast.
* **Classification 1 (the check) is right.**
  * It is not 2 (the product): the final page is the right one. The gap is one React transition, about 48 ms at normal CPU, well under perception thresholds.
  * It is not 3 (shard order): the suite resets the demo at its start (`check_bk5_start_browser.cjs:51`), and main's unchanged suite failed alone on the cloud copy (45/1, with the right calls).
  * The brief's example for cause 2, "the router lands before the list loads", would be a page that stays wrong. Here it is a transient frame that settles on its own.
* **Builder evidence I took as reported, not re-run:** the MutationObserver timeline and the x6 one-shot read. They come from a diagnostic copy that is not committed, and they are consistent with the code above.

## The fix (test file, lines 195-202 at head)
* **The wait.** `programsH1.waitFor({ timeout: 30000 })` waits for the one Immigration programs h1. 30 s is the same budget as the suite's other page waits (lines 44, 104, 153, 207). It is a web-first wait, the brief's named fix (`expect().toHaveCount(1)` equivalent).
  * It adds no longer timeout. The real gap is 48-303 ms.
* **BR-6 is not loosened; it is slightly stricter.** The step still requires:
  * exactly `["/api/demo/reset","/api/demo/load"]`;
  * `landed`;
  * `programsH1.count() === 1`.
  * `sent3` is now read after the landing, so a late duplicate POST from the double click would also be caught.
  * `locator.waitFor` is strict: two matching h1s throw, so `landed` is false and the step goes red.
* **The "fails loudly" rule** (`WAY-OF-WORKING.md:37`) is met. `.then(() => true, () => false)` turns a timeout into `landed = false`, which fails the step with detail `{sent3, url, h1s}`. It is not swallowed, and it is the suite's existing pattern (lines 106, 207, 218, 240).
* **DW3** shows that the line goes red when it should. The caller relayed the builder's detail with a temporary `nav("/review")`: `{"sent3":[...],"url":"/review","h1s":["To review"]}`.
* **The quarantine.** `run-suites.sh:114` removes the name and the whole QA-498q comment block, and nothing else. The other 5 entries and the QA-420 block are unchanged.

## Other readers of the quarantine entry: none need a change
* `.github/workflows/ci.yml:177,229` passes only `SUITES_QUARANTINE_AUTO`.
* `flaky.mjs` and `flaky-ledger.tsv` hold the automatic rule. There is no hand row for bk5, and the old QA-498q comment recorded that the automatic list was already empty for it in run 43914096576.
* `suite-times.tsv:17` holds a time only (397 s). It is still used to deal the suite into a shard now that the suite runs in PR and queue checks.
* `check-flaky.sh` fixtures do not name bk5.
* Mentions in `qa/` reports and `merge-queue-*.md` are records, so they stay.
* Note, not a finding: a `release` line for bk5 in `flaky-ledger.tsv` would stop the 16 Nov pass-on-retry from counting toward a future automatic quarantine. That file is outside the touch list, so it is the tech lead's call.

## Checks I ran
* `bash product/tools/check-flaky.sh`: **84 passed, 0 failed** (49 s).
* `run-suites.sh --list --skip-quarantined` at head lists `check_bk5_start_browser.cjs`; `check_c613…` is still skipped.
* `git merge-tree origin/main 57ce839` merges cleanly. Main (fc0971103) has not touched `run-suites.sh`, the test, `start.tsx`, `programs.tsx` or `App.tsx` since the merge base 6dcff65f5.
* The touch list is respected: the test file and `run-suites.sh` only, with no web code and no `qa/BUGS.md`.

## Done-when (P-606)
| Item | Status | Evidence |
|---|---|---|
| DW1 root cause | Ticked | Cause 1; code verified above; timeline and h1s at failure in the PR body |
| DW2 46/46 ×5 (alone and in shard order) | **Not ticked: pending** | The PR body says "results to follow". The label waits for the pasted lines. Any red run voids this Approve |
| DW3 goes red when it should | Ticked (relayed) | `nav("/review")` gives a red line with `h1s ["To review"]`. The builder should paste it in the PR body |
| DW4 off QUARANTINE, check-flaky passes | Ticked | 84/0, re-run by me |

## D1-D20 (test-only change; the product is unchanged)
* D1 requirement fit 9: BR-6's pass line still asserts both halves.
* D2 N/A: no data path changed.
* D3, D4 N/A.
* D5 stability 9: the double click is still asserted as one call each.
* D6, D7 N/A.
* D8-D15: unchanged screen, not re-walked.
* D16 testability 9: the race is removed, the strictness is kept, the line is proven to go red (DW3), and the suite is back in PR and queue checks.
* D17, D20: simulated only, not walked.
* D18, D19 N/A for this row.

**BIC-01 to BIC-20:** N/A. This is a Studio demo page, not a case-side screen, and no UI changed.

## Issues
* **m1 · Minor · Should:** DW3's red line is only in the session report. Paste it in the PR body's DW3 tick, so the record holds it (P-557).
* **m2 · Minor · Should:** the working tree has 9 modified `BK-5-start-page/screenshots/*.png` from the builder's runs. They are outside the touch list, so leave them out of the commit, or say why in the PR.
* Product observation, not a finding: for one transition (about 48 ms) the done toast shows over the Starting points page. That is below perception and follows React Router's default. No change is asked.

## What I could not check
* I ran no browser: no isolated copy, no suite run, and no DW2 or DW3 re-run.
* I did not reproduce the timeline.
* No keyboard, 1024 px or 200 % walk, because the UI did not change.
* No real screen reader.

**Verdict: Approve 57ce8390665eaeb3615322b908d1d8a8802f2a17**
