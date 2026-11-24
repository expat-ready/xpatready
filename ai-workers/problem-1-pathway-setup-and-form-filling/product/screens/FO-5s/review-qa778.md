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
