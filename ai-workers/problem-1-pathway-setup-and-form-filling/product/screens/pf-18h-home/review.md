# Review: PF-18h, the staff Home's "Needs you" list (R1.74, QA-471 part 2), PR #2621

**Verdict: Approve** on `8386faca7bc09f4f061a86a0d9ceee0b19416f75`: no Blocker or Major is open. Three Shoulds and seven Minors are listed below.

Reviewer: a fresh agent (`screen-review`) that did not build this screen. Copy: isolated `rev18h` on :4719 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end; never :4400 or :4718. Live AI off, US$0.
**Checked against:** concept r3, `challenge.md`, `design/home-needs-you.html`, STANDARDS, EXPERIENCE, QUALITY, PRODUCT §3–§4. The decisions already made (Q1 (a), Q2 scaffolding, Q3, J-74 moved, m5 and m6 for the founder) are not re-opened.
**Journey report:** `journey-test-reviewer-2026-11-21.md`, **9/10** (pass).

## Re-run on the exact commit (my copy)
| Check | Result |
|---|---|
| `check_pf18h_home_browser.ts 4719 xr_studio_rev18h` | 21/21 in 2 min 20 s |
| `check_pf6a_frame_browser.ts` / `check_pf6f_callback_browser.ts` (same copy) | 52/52 / 11/11 |
| `check_pf18n_notifications.ts` (its own database; store change) | 34/34 |
| My walk scripts (UI only; setup through the real `PrismaNotificationPort`) | see the journey report |

## Concept fit
* **Elements:** all present and behaving as written. `h1` Home, the section `h2` "Needs you", then the count in words ("3 items need you"). Each row: the link ("A government step on case C-2026-00008" or "A stage deadline on case …"), the muted line "Reminder came in 20 Nov 2026, 17:53", and "Hide until next reminder". The foot reads "Times in America/Toronto.", plus "Showing the newest 20 of 26. …" when there are more than 20. Home is the first menu entry (`aria-current`); sign-in and the brand link both open `/home`; the J-74 hooks `data-needs-you-item`, `-open`, `-hide`, `-count` are present.
* **Rules, each walked:** BR-1: a NEEDS_YOU-group row never shows. BR-2: a new reminder on the same deadline moves that row back to the top among others; no second row. BR-3: firm B gets an empty list; another person's row gives 404. BR-4: Open awaits the mark-read, then sends 1 POST; a failed mark keeps the page with the Notice and "Open the case anyway". BR-5: newest first, 20 shown of 26. BR-6: an item with no case has no link and keeps Hide. BR-7: the London colleague sees Europe/London. BR-8: the count is in words.
* **States:** all drawn (empty, loading with 5 skeleton rows and `role=status`, normal, error with Try again that recovers, open-failed, over 20), except "long": the case number wraps at 320 px (S3).
* **Q2 scaffolding (accepted):** In a fresh browser the case page opens as "Acting as Case officer · Simulated"; the representative also lands on it as the Case officer. A browser with a Studio person stored gets "Cases are worked by the firm … Continue as Case officer". It is labelled in the PR and build notes, so it is not a finding; P-33 does not apply, because the Home step is the product's own screen.

## [M] lines (met unless named)
* **STANDARDS:** §4: the case table is read only inside `linksOf` (Q1 (a)), one firm-scoped select of `id, caseNumber`. §5: indexed by `@@index([firmId, staffId, createdAt])`; 3 queries plus 2 for the zone, none per row. §6: `@AnyStaff`, person and firm from the session; a Studio `x-actor` alone gets 401. §7: the module card (`MODULE.rows/PF-18h.md`, api and web) is there. **"axe-core on every screen state" and §3.10 are met only by my run, not by the committed check (S1).** §9: about 185 ms from reload to the list (3 runs).
* **EXPERIENCE:** §1: team components (PlatformFrame, Button, Notice, Loading) and tokens; matches the board. §2.1: the path "My account › Home" (m5 is the founder's). §2.12: axe clean at 375, 1024 and 1440 px and at 200 % zoom (720×450, 512×384), no sideways scroll, keyboard path complete; one exception (S2). §4: all states drawn. §5: no ids; words from PRODUCT §4. §3 pattern: m6 is the founder's.

## Code (correctness, races, authorisation, tests that can fail)
* **Mark-read:** Sent with `seen=createdAt`, so a reminder that comes back while the list is open stays unread (PF-18n's rule). `created_at` comes from a JS `Date` (ms), so the `seen` comparison is exact. A stale Hide gives 200 and no error; a double click on Hide or Open sends 1 POST.
* **Removing a rule fails a test (checked by reading):** BR-1 (the DW1 fail line), BR-3 (DW4), BR-5 and BR-8 (the 26-item line), BR-6 (its line), BR-7 (the colleague's zone). **Not covered: BR-4's failure branch and its awaited-first order; no test fails the POST (S1).**
* **Graph (P-86):** `graph.mjs` gives G1 0, G4 0, G5 0, but it cannot see this screen (m7).

## D1–D20 (independent reviewer; browser, script and code)
| Dim | Score | Evidence |
|---|---|---|
| D1 | 4 | BR-1 to BR-8 as written; "number never wraps" fails at 320 px (S3) |
| D2 | 4 | read-only list; mark-read idempotent, own only; double click = 1 POST; cross-firm 404 |
| D3 | 4 | one link builder (`linksOf`); PF-18n's mark-read reused; no second write path |
| D4 / D6 / D7 | N/A | no dependent questions; read-only own state; no AI |
| D5 | 4 | reload, Back, double click, stale tab, failed load and failed mark all recover |
| D8 | 4 | crumb My account › Home; menu entry current |
| D9 | 4 | one click from Home to the case |
| D10 | 4 | plain words; raw zone id shown; empty hint names an unbuilt settings screen (m3) |
| D11 | 4 | skeleton, busy spinner, error and failure Notices; focus loss while busy (S2) |
| D12 / D14 | 4 / 4 | team look and house controls; matches the board at 1440/1024/375 |
| D13 | 4 | axe clean in every state at 3 widths and 200 %; keyboard complete; S2 |
| D15 | 4 | ~185 ms to the list; no request per row |
| D16 | 4 | 21/21 re-run by me; each DW has a fail; gaps S1, m5, m6 |
| D18 | 4 | case number, kind, time and zone named; due date absent by design (Q1) |
| D19 | 3 | reminder → Home → case works, but the case page acts as the simulated person (Q2, accepted) |
| D17 / D20 | simulated only | no intended user walked it; the founder's walk |

## Best-in-class scorecard (EXPERIENCE §6)
BIC-01 to 10, 12, 13, 15, 16 and 17 are N/A: the screen asks nothing, shows no document or AI value, and has no tasks, filing or review.
| Id | Score | Evidence |
|---|---|---|
| BIC-11 | Met | no filled button; "Hide until next reminder" names what it does (`pf18h-1-one-item-1440.png`) |
| BIC-14 | Met | no chips or icon-only buttons; the count is in words |
| BIC-18 | Partly (Should) | empty says what appears, but its first action points at an unbuilt settings screen (m3); skeleton; failures visible |
| BIC-19 | Met | one heading per panel; 3 type sizes (16/14/12); red only in the error Notice; the count says what it counts (1440 and 1024 px) |
| BIC-20 | Partly (Should) | keyboard path complete, 200 % works, headings in order; focus falls to `body` on a busy or failed Hide (S2) |

## Issues, ranked (none Must)
1. **S1 Should: the committed check misses BR-4's failure branch and four states.** No test covers the error, loading, empty or open-failed states, or axe in them (STANDARDS §7 [M], §3.10). My axe runs on all four were clean at this commit. Fix in `check_pf18h_home_browser.ts`: `page.route` the POST to 500, then assert the Notice, "Open the case anyway" and URL `/home`; the GET to 500, then the Notice and Try again recovering; axe on each.
2. **S2 Should: focus falls to `body` around Hide.** `Button busy` sets `disabled`, so focus drops during a Hide (`home-page.tsx`, Row's Hide button) and stays on `body` if the hide fails (`act()`'s catch). Fix: on failure, put focus back on the row's Hide or on the Notice.
3. **S3 Should: the case number splits at 320 px.** It breaks at its hyphens as "C-2026-" / "00006", against concept §5 and the build notes' claim; `itemWords` makes one string (`contract.ts`). Fix: put the number in a `whitespace-nowrap` span, as the board does.
4. **m1:** a Ctrl/Cmd or middle click opens the case without marking it read (`home-page.tsx`, Row `onClick` returns early). Challenge m1, accepted at r2, says it fires mark-read without waiting.
5. **m2:** the web parses `kind` as a closed enum (`contract.ts`), while `needsYou()` filters by group only, so a future MY_DEADLINES kind makes the whole list "Could not load". Fix: filter `kind in NEEDS_YOU_KINDS` on the server, or drop unknown kinds.
6. **m3:** the empty hint says "…in your notification settings", and no web screen for them exists yet. It is the concept's copy (m8), for the Lead.
7. **m4:** after an Open, the failure Notice says "We could not hide this reminder." and gives no retry hint (EXPERIENCE §2.10). The concept's copy, for the Lead.
8. **m5:** the check presets `xr-actor = user-O` in every tab (`tab()` init script), so DW3 never covers the fresh browser named in challenge B1 (a). My walk did.
9. **m6:** two concept behaviours are walked by me only, not in the check: focus moving to the *next row* after Hide, and BR-2's "back to the top" among other items.
10. **m7:** the graph tool cannot see `/home` (a module route) or `GET /platform/me/needs-you` (the second controller in `routes.ts`), and lists `POST …/:id/read` as untested although DW4 posts it. A limit of the tool, not a missing test.

**For the Lead (records, not findings):** The X-rows for Q1 (`CaseLabelPort`) and Q2 (the case page acting as the signed-in staff member) are named in the concept, the build notes and a comment in `store.ts`. BACKLOG rows are the Lead's to write (P-521, P-582).
* m5 and m6 of the challenge go to the founder's morning look.

## What I could not check
* A real screen reader, or an intended user's unaided walk (D17, D20).
* Refetch on window focus: my synthetic events fell inside `staleTime` 2 s, so the result was inconclusive.
* The full CI, and the J-74 walk (moved to another PR).
* The later commit `7fd6b3189` (build notes only).
* The builder's uncommitted edits to `home-page.tsx`, `contract.ts` and the check, which appeared in this checkout after my runs (22:59 UTC). They are not part of this verdict.

**Verdict: Approve** (for `8386faca7bc09f4f061a86a0d9ceee0b19416f75`).

## Re-review at b1737d7e1786c4d04eebda41eee8f90d45eebe70
A fresh reviewer read only `git diff 8386faca7..b1737d7e1` (P-610): `home-page.tsx`, `contract.ts`, the check, build notes, the added records and the re-taken screenshots. Copy `rer18h` on :4721 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end. The screenshots my run re-took were restored with `git checkout`. US$0.

**Re-run:** `check_pf18h_home_browser.ts 4721 xr_studio_rer18h` passed 24/24 on a fresh copy in 2 min 10 s. I also ran my own probes on the same copy (scripts in the session scratchpad). They used the colleague's rows with linked whole-millisecond rows added by SQL.

**Each fix, checked against build notes:**
* **S3 / break m2 (number wraps):** fixed. `Words` puts the number in a `whitespace-nowrap` span. At 320 px, all 4 number spans stay on 1 line, with no sideways scroll and axe clean.
* **Review m2 / break m1 (unknown kind):** fixed. `kind` is now `z.string()` and `whatOf` gives "A deadline". I inserted a `case-task-deadline` row in MY_DEADLINES. Its row reads "A deadline on case C-2026-00002", the known rows show, and there is no error.
* **S2 (focus lost on a failed Hide):** fixed. With the POST at 503, focus returns to that row's Hide after a mouse press and after a keyboard Space. The Notice says "We could not hide this reminder." and offers no "Open the case anyway". The item stays unread.
* **S1 (failure branch and states untested):** partly fixed. New lines cover the open-failed state (page stays, Notice, link, item unread, axe) and axe on the empty state. **Still untested:** the load-error state (GET fails, "Could not load…", Try again recovers) and the loading state. Build notes call S1 fixed (see R1).
* **Break m3 (Hide on a reminder that came back):** fixed. The info Notice is announced (`role=status`/`alert`), and the row stays unread. Focus lands on that row's link, not on the Hide that was pressed (R3).
* **Break m4 (swallowed second Hide):** fixed for Hide. While one row is busy, the other rows' Hide is `disabled` and their links get `aria-disabled`. A forced click on another row's link sends nothing and stays on `/home`, but the link looks unchanged (R5).
* **Review m1 (modified clicks):** fixed. Ctrl/Cmd-click sends 1 POST, opens a new tab, leaves the page on `/home` and marks 1 row read. A middle click does the same. A right click sends nothing.
* **Review m4 (open-failure copy):** changed in code, and "Open the case anyway" now shows only for an open (R4).
* **Not changed (m5 microsecond `seen`, m3 settings hint, DW3 preset, graph, X-rows):** the reasons are recorded and acceptable. Break m5 is still latent: rows I inserted with `now()` would have hit it, so I truncated them to milliseconds.

**No regression:**
* **Open order:** Open still awaits the mark before it navigates (DW3 passes, and the BR-4 fail line passes).
* **Focus after Hide:** a successful keyboard Hide moves focus to the next row's link (probe). The last Hide moves focus to the heading (DW2).
* **Scope:** firm and person scope are unchanged; the diff touches no server code. DW4 and its fail line pass.
* **Check changes:** the `remind` clock change and the looser DW3 fail line keep the line able to fail, through `rowsOf(REP) === 1`.

**The new lines can fail:**
* **Empty-state axe:** fails on a violation.
* **m3 line:** waits for the new words, and a timeout drops into the check's catch, which counts a FAIL and exits 1.
* **BR-4 fail line:** asserts the new copy, the URL, the link, the unread row and axe.

**Scope:** nothing beyond the findings. The only new words are the two Notice texts and "A deadline".

**Journey (reviewer, diff only):** I walked the changed paths by mouse and keyboard at 320 and 1440 px: failed Hide, failed Open, a reminder that came back, a second Hide while busy, a new tab, an unknown kind. All held, and the earlier 9/10 stands: **9/10** (pass, no 0). The half point is still Q2's simulated person on the case page, which is accepted. No separate journey report was written; the 21 Nov report stands.

**Issues (none Blocker or Major):**
1. **R1 Should:** the load-error state (Try again recovering) and the loading state have no check line and no axe run, so S1 is only half done (`check_pf18h_home_browser.ts`). Fix: `page.route` `**/platform/me/needs-you` to 500, then assert "Could not load what needs you." and that Try again recovers, with axe. Also correct build notes' "S1 fixed".
2. **R2 Minor:** the BR-4 fail line's `focusBack` tests the link, which never loses focus (`aria-disabled` only). It would pass with S2's fix removed, and the failed-Hide focus has no line. Fix: assert focus on Hide after a failed Hide.
3. **R3 Minor:** after the "came back" Notice, focus goes to the row's link, because the `focusAfter` selector `a, button` picks the first control (`home-page.tsx`, the focus effect). Keyboard users land one stop back from the Hide they pressed. The m3 line does not assert focus.
4. **R4 Minor, for the Lead:** the copy differs from concept r3 §5. Open-failed is now "We could not open this reminder." (the concept says "hide", and review m4 sent this to the Lead). "A newer reminder came in for this deadline, so it stays on your list." and "A deadline" are new words. They are recorded in build notes but not in the concept; the Lead should confirm them or update concept §5.
5. **R5 Minor:** a locked row's link is `aria-disabled` but looks the same (colour unchanged), so a click on it is swallowed with no visible cue. Hide does show as disabled.
6. **R6 Minor:** Ctrl/Cmd or middle click marking read has no check line (it works by my probe).

**Verdict: Approve** (for `b1737d7e1786c4d04eebda41eee8f90d45eebe70`).

## Re-review at 0a9b2a0115aee5d92396d60036c77d8de7e8474d
A fresh reviewer read only `git diff b1737d7e1..0a9b2a011` (P-610). That diff covers the focus target in `home-page.tsx`, two check changes, build notes, review.md and the re-taken screenshots. Copy `rr218h` on :4722 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end. The screenshots my runs re-took were restored with `git checkout`. US$0.

**Re-run:** `check_pf18h_home_browser.ts 4722 xr_studio_rr218h` passed **25/25** on a fresh copy (2 min 13 s). The same copy, reused, then passed every other line in the mutant runs below.

**Each fix:**
* **R1 (loading and load-error states):** fixed. The new line holds the GET open and waits for `role=status` named "Loading what needs you…", then runs axe. It then releases a 500 (with `retry: 1`, the retry also gets 500), waits for "Could not load what needs you.", runs axe, unroutes, presses Try again and waits for the list. Both axe runs were clean. Build notes now say S1 was half done and how it was finished.
* **R3 (focus after the "came back" notice):** fixed. `focusAfter` now carries `{ id, control }`. The came-back path asks for `button`, and the next-row path asks for `a` with a `button` fallback (`home-page.tsx:60,79-80`). Probe by keyboard (Tab to Hide, Space, server answers `readAt: null`) at 320 and 1440 px, as the officer and as the representative: focus is on the pressed Hide every time, Shift+Tab reaches that row's link, and there is no sideways scroll.

**The new check lines can fail.** I built mutant bundles into the session scratchpad. The shared `web/dist` was not touched, and its stamp still matches. I served them through a temporary routed copy of the check, deleted afterwards:
* **M1, R3 undone** (came-back asks for `a` again): the m3 line **FAILS**, and the other 24 pass. 24/25.
* **M2, Try again inert:** the states line stops on the list wait. The catch counts a FAIL and exits 1. (The summary still prints "4/4 passed" when a run stops. That comes from the existing recorder and is not part of this diff.)
* A loading status with no name also stops at its `waitFor`, and an axe violation on either state turns the line false (read from the code).

**No regression:**
* **Open order:** unchanged. The diff does not touch `act`'s mark-then-navigate. DW3 and the BR-4 fail line pass.
* **Focus after a successful Hide:** the new `a`-then-`button` lookup does what the old first-of-`a, button` did. Probe with 3 items, keyboard Space on the first Hide: focus lands on the link of row 2, the expected row. The last Hide still goes to the heading (DW2 passes). The failed-mark focus (`requestAnimationFrame`, S2) is unchanged.
* **Scope:** no server, contract or copy change.

**Scope:** nothing added. There are no new words, and the only UI change is which control gets focus.

**Journey (reviewer, diff only):** I walked the changed paths by keyboard at 320 and 1440 px: a load that fails then recovers, and a came-back Hide. Both held. Score **9/10** (pass, no 0), unchanged. The half point is still Q2's simulated person on the case page, which is accepted. No separate journey report was written; the 21 Nov report stands.

**Issues (none Blocker or Major):**
1. **R7 Minor:** the m3 line reads `document.activeElement` straight after the notice text appears. The notice renders before the refetch that moves focus, so a slow machine could fail it falsely. It never passes falsely: M1 failed as it should. Fix: wait for the focus with `waitForFunction`.
2. **Still open from the last re-review, Minor:** R2 (no line for focus after a failed Hide), R4 (copy beyond concept §5, for the Lead), R5 (a locked row's link looks unchanged) and R6 (no line for new-tab clicks).

**Verdict: Approve** (for `0a9b2a0115aee5d92396d60036c77d8de7e8474d`).

## Re-review at 52d9d5b527458a6fc4ccdb866b2e4074d42db4cb

**Scope (P-610, diff only):** `git diff 65f56d5c 52d9d5b5`. 65f56d5c is records only on top of 0a9b2a01, which I approved above. The diff touches 22 files: two test files (+5/−3) and 20 re-taken PNGs (5 in `pf-18h-home/screenshots`, 15 in `pf-6-staff/screenshots`). It changes no product code, server code, contract or copy.

**Shard 15 (usage line):** fixed. The line now reads `zsh studio/tools/isolated.sh pf18h 4718 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf18h_home_browser.ts 4718 xr_studio_pf18h`. I ran the usage regex from `run-suites.sh` (line 364) through bash on both versions:
* The new line **matches**: name `pf18h`, port `4718`, env `AI_LIVE=off PLATFORM_IDENTITY=local`, tool `tsx`, args `4718 xr_studio_pf18h`.
* The old `tsx --tsconfig …` line does **not** match, which explains the plain run against a database that did not exist.
* `$TSX` (line 138) adds `--tsconfig $S/api/tsconfig.json` itself, so dropping it from the usage line loses nothing.
* In my run the suite used its own copy: the log shows `http://localhost:15718/home` (prefix `screens_`, ports +11000), never :4400 or :4718.

**Shard 13 (PF-6 hand-off):** fixed, and the check is not weakened. The new helper `landedAs(p, email)` does three things:
1. It waits for the exact URL `${BASE}/home`.
2. It opens My account from the menu (`nav[aria-label="My account"] [data-account-section="/account"]`).
3. It waits for `[data-account]` to contain the email.

`[data-account]` is rendered only by `account-page.tsx`, from `GET /api/platform/me/account` with the session token. So the email still comes from the server's view of who signed in, not from the address or the page that just closed. That is the same proof as before, plus one new condition: the landing must be Home, as PF-18h requires.
* **DW5/BR-4 ("exactly once"):** the `ok` line is unchanged. It still requires `count(*) from platform_staff where email = W` = 1 and exactly one `POST …/accept` from that page. Opening My account sends no accept, so the count cannot be inflated or hidden.
* **DW1 (second browser):** the old wait for X on My account is replaced by `landedAs(x, X)`. Team-shows-Active, the role change, and "Sign out everywhere then the next click shows the sign-in card" (line 111) all follow unchanged. Before this change, `x` also sat on `/account` at line 111, so that line tests the same situation as before.

**Nothing else changed:** I checked the stat and the full text diff. Only the two test hunks above and the PNGs differ. No other suite, helper or app file is touched.

**Re-run (CI's way, from `product/`):** `bash tools/run-suites.sh --only "check_pf18h_home_browser.ts check_pf6_staff_browser.ts check_pf6a_frame_browser.ts check_pf6f_callback_browser.ts"` exited 0:
* `check_pf18h_home_browser.ts`: **25/25** (128 s).
* `check_pf6_staff_browser.ts`: **90/90** (29 s).
* `check_pf6a_frame_browser.ts`: **52/52** (19 s).
* `check_pf6f_callback_browser.ts`: **11/11** (16 s).

These match the builder's counts. The run re-took the screenshots, and I restored both screenshot folders with `git checkout --` afterwards.

**Journey (reviewer, diff only):** no product code changed, so the journey I walked for 0a9b2a01 still applies. The one path the diff touches (accept an invitation, land on Home, open My account and see yourself) ran in a real browser in the PF-6 suite above. Score **9/10** (pass, no 0), unchanged. No new journey report was written; the 21 Nov report stands.

**Issues (none Blocker or Major):**
1. **R8 Minor:** `landedAs` waits for the exact URL `${BASE}/home`. If Home ever gains a query string or a trailing slash after sign-in, the check fails falsely. It cannot pass falsely. A glob or regex (`**/home*`) would be sturdier.
2. **Still open, Minor:** R7 (the m3 focus read races the refetch), R2, R4, R5 and R6, as listed in the re-review at 0a9b2a01.

**Verdict: Approve** (for `52d9d5b527458a6fc4ccdb866b2e4074d42db4cb`).
