# FO-5s: review of the QA-778 fix (Check and send with typed, unsaved edits)

PR #3532 · branch `claude/screens-qa778-send-unsaved` · head `af1753603ec134660362680a3c6908acf536f975` · diff `origin/main...af1753603` (merge base a040b46d5; main's page is the same as the merge base) · reviewer, 24 Nov 2026 · scoped to this bug fix, not a new screen. Isolated copy `rv778` on :4446 (never :4400), web rebuilt with `npx vite build`, PLATFORM_IDENTITY=local, live AI off, US$0.

**Verdict: Ship** (no open Blocker or Major; three Minors below; the builder fixes them or lists them in the PR).

## What I ran
| Run | Result |
|---|---|
| `check_fo5s_retainer_screens_browser.ts` at head, twice | 45/45 both times (no flake) |
| Same suite with main's `retainer-page.tsx` | 41/45: the four "R1.53 QA-778" steps FAIL (refusedHere false; v2 false; hint "" and panel on the old version; DB `1:150000:sent`) |
| Same suite with the 409 guard removed (`save.mutate(fees)` without the per-call `onError`) | **45/45: no step catches it** (m1) |
| qa `tests/qa/check_s17_retainer_controls.ts` | S17 M1 PASS; M4 (a), M4 (b), M5 FAIL (QA-779, QA-780, not in scope) |
| `tests/journeys/j_53.ts` | 21/21 |
| My own probes (Playwright, not committed): keyboard, 409, double click, blockers, 400 / 1024 px / 200 % zoom, axe | below |
| `git merge-tree` with PR #3424 head 6ef5d12ec | merges cleanly: the hunks stay three lines clear of its import line and `warnings` state line |
| `product/tools/graph.mjs` | G1 0, G2 0, G4 0, G5 0; no new page or route in this diff |

## Concept fit (FO-5s r2: S3, S4, BR-6, BR-9)
* **Save-first is right for a person.** "Check and send" is S3's one primary; a person who typed 1750 and presses it means "check what I typed and send it". Warn-or-block would add a step that only says "save first". Save-first matches S3's own words ("Each save is a new version") and BR-9: the button exists on Draft only, where every save is a version. The rule that applies to sent versions ("leaving without sending changes nothing") is not touched, because a sent one has no Check and send. The hint says it before the click, the toast says "Saved as version 3." and S4's panel names "Version 3" and "CAD 1,750.00". Cancelling leaves version 3 as a draft: the same as pressing Save.
* **BR-6:** if the saved version has blockers, focus goes to the summary link ("Fee is missing. Add a fee row.") and no panel opens (suite step 2; probe J4 at 1024 px). A typed amount that is not money is refused on its field, with nothing saved and no panel (step 1; probe J6: role=alert says "Fee row 1: An amount in dollars with a dot for cents…").
* **Never a version the person did not see:** Send posts `expectedVersion` = the panel's version, and the server refuses a stale one (`service.ts:598`, B-24). With the head code, a colleague's save in between gives the notice "This agreement has a newer version (2) than the one you saw (1). Open it again." and no panel (probe J2). A plain Save afterwards opens no panel either. The guard that makes this true is not tested (m1).

## Code (correctness, races)
* `checkOnce` is set to `next` before the PATCH (`retainer-page.tsx:97`). After a success, `after` sets the query data; in the same commit the reset effect and the check effect see `r.version.n === next` and run once (the ref is cleared). The server always makes version n+1 (`service.ts:569`), so it never answers a different number.
* 409: the mutation's `onError` (`fail`) starts a refetch. The per-call `onError` clears the ref before that refetch returns, so the colleague's n+1 does not open the panel. **Load-bearing and untested** (m1).
* Double click: `busy={save.isPending}` disables the button. Probe J3 (`dblclick`): one new version (`1:150000,2:175000`), one panel, no conflict notice.
* Theoretical race (m3): the ref is armed before the answer. Any refetch that lands a colleague's n+1 while our PATCH is in flight would match and open the panel on their version. On this page `refetchOnWindowFocus` is false (`lib/api.ts:46`), so the only trigger is a network reconnect. The panel would still show that version and its fees, and Send would send exactly that.
* Validation is moved out of `submit` into `typedFees` and does the same thing for Save. The changes are web only; the server's authorisation and concurrency are untouched.

## Standards ([M] lines touched by this fix)
* STANDARDS §2 optimistic concurrency: **met** (server `expectedVersion`; page refetches on 409). Idempotent create: **met** (double click makes one version).
* EXPERIENCE 12 accessible: **met with a Minor**. Real button; the keyboard path works (Tab ×8 then Enter, panel in 121 ms); axe WCAG 2.2 AA finds nothing on the hint state at 1024 px or on the panel; no sideways scroll at 400 px, 1024 px or 200 % zoom (720 CSS px, scale 2). The hint is not tied to the button (m2).
* P-473 copy: "You have unsaved changes. Check and send saves them as version 3 first." is second person, plain, 13 words.

## D1–D20 (this fix only)
D1 5 (QA-778's expected result met; concept S3/S4/BR-6/BR-9 kept) · D2 5 (DB `1:150000:-,2:null:-,3:175000:sent`; one version per double click) · D3 N/A · D4 N/A · D5 4 (409, double click and wrong field all hold; m1 leaves the 409 guard without a test) · D6 N/A · D7 N/A (no AI) · D8 5 (unchanged) · D9 5 (one press, hint first) · D10 5 (hint words) · D11 5 (hint, busy spinner, toast, panel version) · D12 4 (hint matches the muted hint style; see "Pre-existing") · D13 4 (m2) · D14 5 (shared Button, text styles) · D15 5 (save plus panel in 121 ms) · D16 4 (four steps fail on main; m1) · D17 simulated only · D18 5 (panel says Version 3 and the total) · D19 5 (j_53 21/21, S17 M1 passes) · D20 simulated only.

## BIC (EXPERIENCE §6; a front-office screen, so only the checks this fix touches)
BIC-11 Met (one primary, named) · BIC-12 Met (the typed version is checked before the panel: step 2, probe J4) · BIC-13 Met (error on the field, role=alert, typed text kept: J6) · BIC-20 Partly (keyboard and zoom fine; m2) · BIC-03 Met (Send never uses the stale version: J2, `service.ts:598`) · all others N/A (not case-side, not touched). Evidence: `screenshots/qa778-unsaved-hint-1440.png`, `screenshots/qa778-send-panel-after-typing-1440.png` (builder's); my probe captures at 1024 px and 200 % are outside the repository.

## Journey test (reviewer; the one score for this check)
Journeys (persona: Case Manager / representative):
1. Main: type 1750 over 1,500.00 → hint → Check and send → panel v3 CAD 1,750.00 → Send. Held (suite; probe J1 by keyboard).
2. Alternate: no edit → panel on the current version. Held.
3. Error: "17,50" or "abc" typed. Refused on the field, nothing saved. Held.
4. Error: amount cleared or row removed → v2 with "Fee is missing." summary focused, no panel. Held (J4, J7).
5. Colleague saved meanwhile → 409 notice, no panel, no stray panel on the next Save. Held. The typed value is replaced by the colleague's version; the notice says why (pre-existing behaviour).
6. Recovery: double click → one version. Held (J3).
7. Boundary: the S4 panel → Send → Sent v3, versions 1–2 never sent. Held (suite step 4, j_53).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | suite step 4: v3 sent at 175000 |
| Next step obvious | 1 | the hint before the click; the panel names the version |
| Plain words | 1 | hint, field error, 409 notice |
| Feedback and state | 1 | busy spinner, "Saved as version 3.", panel Version 3 |
| Correct data | 1 | DB rows per journey; one version per double click |
| Error recovery | 1 | J2, J4, J6 |
| Accessibility and sizes | ½ | axe clean, 400/1024/200 % OK; hint not described-by (m2) |
| Speed | 1 | 121 ms Enter → panel, including the save |
| Visual quality | 1 | hint sits under the primary in the muted hint style |
| Trust and sources | 1 | no AI; the panel shows the version and the total it will send |
| **Total** | **9.5/10** | **Pass** (8+, no 0) |

## Issues
* **m1 Should (Minor):** the 409 guard has no test. `retainer-page.tsx:98` `save.mutate(fees, { onError: () => { checkOnce.current = null; } })`. Failing scenario: remove the `onError`. The suite stays 45/45, but in probe J2 (a colleague saves v2 while you have 1750 typed, then you press Check and send) the Send panel opens on the colleague's v2 at CAD 1,200.00 behind the conflict notice. Fix: add a fifth "R1.53 QA-778 fail" step (PATCH v→v+1 by API after typing, press Check and send, then assert the notice, no dialog and no new version) that fails with that line removed.
* **m2 Should (Minor):** the hint is not tied to its button. `retainer-page.tsx:191-192`: `<p data-unsaved-hint>` has no id and the button has no `aria-describedby`. Failing scenario: a screen reader user tabs to "Check and send" and hears only the name, not that it saves version N first. Fix: give the hint an id and point the button's `aria-describedby` at it while it shows.
* **m3 Could (Minor):** arm the check from the save's own answer, not before the request. `retainer-page.tsx:97`. Failing scenario, theoretical: a reconnect refetch lands a colleague's n+1 during our PATCH and opens the panel on their version. Fix: set `checkOnce.current = x.version.n` in the per-call `onSuccess` (it runs before the batched render).
* Pre-existing, not this PR (no finding): focus goes to `<body>` after closing the Send panel, with or without edits. At 1024 px the fee row is cramped and two toasts briefly cover the hint.

## Could not check
A real screen reader (NVDA or VoiceOver); an intended user's unaided walk (D17, D20 stay with the founder); a real network reconnect for m3 (reasoned from code only). The FO-5s and J-53 screenshots in the working tree were regenerated by my runs and left as they are; nothing is committed.

## Round 2 (diff only, 91dc3c42c)

Second reviewer, 24 Nov 2026 · `git diff af1753603 91dc3c42c`: `retainer-page.tsx` (+5 −5) and `check_fo5s_retainer_screens_browser.ts` (+14 −4). The two qa778 screenshots and this file are records. Nothing else changed. Isolated copy `rv778b` on :4446 (never :4400), web rebuilt with `npx vite build`, PLATFORM_IDENTITY=local, live AI off, US$0.

**Verdict: Ship** (Approve; no open Blocker or Major; m1, m2 and m3 closed; one nit, not blocking).

### What I ran
| Run | Result |
|---|---|
| Suite at 91dc3c42c, twice | 46/46 both times |
| Variant A: `if (!fees) return; checkOnce.current = next; save.mutate(fees);` (armed before the request, no reset on error) | **45/46**: only "QA-778 fail (review m1)" FAILs; the later v4 steps still pass |
| Variant B: round 1's code (armed before, per-call `onError` resets) | 46/46: the new step does not fail on correct code |
| My probe (Playwright, temporary, deleted) | 10/10: below |
| `product/tools/graph.mjs` | G1 0, G2 0, G4 0, G5 0 |

Environment note (not this PR): `/home/user/wt-qa780` symlinks its `studio/node_modules` to this clone's, and a run there regenerated `node_modules/.prisma/client` from another branch at 17:51. That client has `fo_signer.session_sha256` and `session_expires_at` (9366ac51f), which this branch's migrations do not create. On a fresh copy, Send failed with 500 P2022 at suite line 154, before any QA-778 step. I added the two nullable columns to my isolated database only (`xr_studio_rv778b`, since dropped). I changed no file and did not regenerate the shared client, which the other copies use. Anyone starting a copy from this clone gets the same failure until a client is generated from the branch's own schema.

### m1: closed
* The step (test:253-262) has staff T PATCH v2→v3 (120000) while 1600 is typed. It then clicks Check and send and asserts all four: T's PATCH answered 200, the "newer version (3)" notice and the "Version 3" header are seen, there is no dialog, and the database still holds 3 versions. Under variant A the refetched v3 has no blockers, so the armed ref opens the panel on T's version and the step FAILs. It fails for the right reason.
* The 500 ms pause (test:259) is acceptable. It comes after two positive waits (the notice and the page showing v3) and sets the window for a check that something does *not* happen, which cannot wait on an event. The comment says why. Under the regression the panel opens one render after the refetch commits (effect → `setSending(true)`); the probe timed Enter → panel, a PATCH included, at 123 ms. Variant A failed in my run, so the window is ample and is not a silent wait.
* The later version numbers are right. The page holds v3 after the refetch, so the hint says "version 4", the panel shows Version 4 and CAD 1,750.00, and there are 4 versions. The database read was `1:150000:-, 2:null:-, 3:120000:-, 4:175000:sent`. The new `versions[2]…=== 120000n` and `slice(0, 3).every(sentAt === null)` checks are stricter than before.
* **n1 (nit, not blocking):** the failure detail is `{ theirs, stale }` only (test:261). In variant A the FAIL line printed `{"theirs":200,"stale":true}`, which does not say that the dialog clause failed. Adding the dialog count and the version count to the detail would make a red run readable.

### m2: closed
`retainer-page.tsx:191-192`: `aria-describedby="fo-unsaved-hint"` is set exactly while the hint shows (same `form && changed` condition), and the hint has that id. The shared `Button` passes the prop through (`controls.tsx:37` `{...props}`). In the probe: no attribute before an edit; after typing, the Chromium accessibility tree (CDP `getFullAXTree`) gives the button the description "You have unsaved changes. Check and send saves them as version 2 first."; there is one `#fo-unsaved-hint` on the page; axe WCAG 2.2 AA is clean on the hint state and on the panel; at 400 px the hint shows with no sideways scroll.

### m3: closed; the ordering claim holds (checked in the library source)
`retainer-page.tsx:98` arms `checkOnce.current = x.version.n` in the per-call `onSuccess`. The order, from @tanstack/query-core 5.101.1 and react-dom 19.2.7:
1. `mutation.js:123` awaits `options.onSuccess`, which is `after`. That calls `setQueryData` (v_new is in the cache now) and the React setters (`setEditing`, `setError`, `setWarnings`, `toast.push`).
2. `mutation.js:144` dispatches `success`. In `mutationObserver.js:76-87` (inside `notifyManager.batch`) the per-call `onSuccess` runs and the ref is armed.
3. Between 1 and 2 there are only `await`s of non-promises: `after` returns `undefined`, and the QueryClient has no `mutationCache` callbacks (`lib/api.ts:46`). That is microtasks only, with no macrotask boundary.
4. Nothing can render `RetainerBody` before step 2. Query and mutation observers reach React through `notifyManager.batchCalls` → `scheduleFn` = `systemSetTimeoutZero` (`notifyManager.js:18,27`; `useBaseQuery.js:60`, `useMutation.js:25`), which is a macrotask. The setters in `after` run outside an event, so `resolveUpdatePriority` returns DefaultLane 32 (`react-dom-client.production.js:829-833`). `scheduleTaskForRootDuringMicrotask` sends non-sync lanes to a Scheduler task, also a macrotask. `toast.push` is a plain `useState` setter (`lib/api.ts:78`), with no `flushSync` or external store.

The builder's comment ("the cache shows the version only after this runs") states the reason a little too narrowly. Any render reads the cache at once (`useBaseQuery.js:55` `getOptimisticResult`), so what actually guarantees the order is that no render can happen before step 2. The conclusion is right.

What could make the effect miss and leave the panel shut:
* StrictMode is a no-op in the production build. In dev it doubles only mount effects, where the ref is null.
* A refetch cannot land between steps 1 and 2 (no macrotask). One landing later finds the ref already consumed.
* A second `mutate` replacing the per-call options while one is pending is prevented: Save and Check and send are both `busy`, and Enter's implicit submit is blocked because the default button is disabled.
* A future `after` that returns a promise, or a `flushSync` inside it, would break the order. The pass steps (the panel on v4, and focus on v2's blocker) would then fail, so a regression is caught.
* The theoretical race from round 1 (a colleague's n+1 refetched while our PATCH is in flight) can no longer open their version: our PATCH answers 409 and arms nothing. The probe confirmed that a plain Save after the refused try opens no panel.

### Journey test (reviewer; the one score for this check)
I re-walked round 1's journeys on the diff by keyboard (probe): main 1750 → v4 panel (123 ms); 409 by keyboard → notice, no panel after 1.5 s, still 2 versions; a plain Save afterwards → no panel; double click with an edit → one version (5), one panel; 400 px; no page error. All held. The score is round 1's table with accessibility raised from ½ to 1 (m2 fixed, the description checked in the accessibility tree). The other nine criteria are unchanged at 1, with the evidence above and in round 1. **Total 10/10, Pass.**

### Could not check
A real screen reader announcing the description (NVDA or VoiceOver); D17 and D20 (an intended user's unaided walk; simulated only). The screenshots my runs regenerated are restored (`git checkout`), and the web bundle is rebuilt at 91dc3c42c.

Reviewer: Approve 91dc3c42c5f9173ca9aa6ee79472468a95137c5
