# Review: PF-21s part 3 (complaints list, record drawer, read-only record page)

Reviewer (fresh agent, did not build it) · commit `e47fa19fc34189f92a29152ca8fe97ab24d96dfe` · PR #1998 · 16 Nov 2026.
Inputs: brief `PF-21s.md` rev 16.75 + `P-626-order.md` A5 (lead-b-front-office), `concept.md` (§6c part 1 = part 3), `design/layout.html`, `api/src/platform/complaints/`. Copy at :4571 (`xr_studio_screens_pf21s`, PLATFORM_IDENTITY=local).

**Verdict: Approve** (no open Blocker or Major). Journey score **9/10**, pass (`journey-test-reviewer-2026-11-16.md`).

## Done when, ticked against the suite (my re-run: `check_pf21s_complaints_browser.ts 4571 …` 54/54, exit 0)
| Line | Case in the suite | Result |
|---|---|---|
| DW1 Owner sees four views with right counts | "DW1 pass" ×4 (chip = rows = API), "DW1 fail" (closed absent from Open), view kept on reload | Met |
| DW2 a handler sees only their own | "DW2 pass/fail" (Case Manager: own rows only, every handler cell theirs; another's id → Not found) | Met; I also walked a no-key Case Officer handler (sees own, no Record button) |
| DW5 another firm's id → not found | "DW5 pass" ×3 (other firm, nonexistent, malformed) + "DW5 fail" (all four texts identical, incl. someone else's) | Met |
| DW6 overdue colour and days late | "DW6 pass" (! Overdue + "N business days late" in `text-text-warn`), "DW6 fail" (acknowledged row plain Open) | Met |
| Keyboard-only | "keyboard: Tab … reaches Record the complaint", "Enter on a row's link"; my walk Tab-only from page top (5 Tabs to Record, arrows in selects, Enter to save) | Met |
| axe-core every state | 12 axe checks (list, overdue, empty, closed, not found, drawer errors, record ×3 widths); my extra axe on overdue record and drawer errors: 0 violations of any impact | Met |
| 375/1024/1440 | "no sideways page scroll" ×7 + facts-above-timeline at 375; I added 512 px (= 1024 at 200 %): list, drawer, record fit | Met |
| Calls only PF-21w/PF-21v + /me | "the pages call only PF-21's complaints routes" | Met (first view: `/me`, `?view=all`, `?view=open`) |
| Under 800 lines (P-610) | diff 569 insertions | Met |

## D1–D20 (independent reviewer, browser + script evidence)
D1 4 BR-1/4/8/9 shown as written; where-line subject missing (m1) · D2 4 one row, one RECEIVED event, one audit line per record (DB read); zero-gap double submit makes two (m4) · D3 4 words and codes defined once in `contract.ts`; PF-6 frame and `staffApi` reused · D4 N/A · D5 4 reload and Back keep `?view=`; Esc with typed text asks first; list error has Try again · D6 4 insert-only timeline with who and when, newest first · D7 N/A (no AI) · D8 3 where-line reads "My account › Complaints › Complaint" (m1); no menu entry yet (A5: part 4) · D9 4 one filled button per area; the next-step bar is part 4 · D10 4 plain words; tooltips are `title` only (m2) · D11 4 busy button, toasts, errors on fields and in a summary · D12 4 team tokens, Panel, Table, Notice (`screenshots/list-1440.png`, `record-1024.png`) · D13 4 axe clean, widths and 200 % fine; focus lands on `<body>` after opening a record (m3) · D14 4 team components only · D15 5 first view 421 ms, 3 requests, none per row · D16 4 every DW has pass + fail; read-only line has no pass case (m6) · D17 simulated only · D18 4 firm zone labelled once, Sample marks, "Recorded by" · D19 Not yet evidenced (part 4 completes the walk) · D20 simulated only.

## Scorecard (EXPERIENCE §6)
Concept §4c: N/A as a whole (a firm-level register, not case-side). The checks it chose:
| Check | Score | Evidence |
|---|---|---|
| BIC-11 one filled button, named for the act | Met | "Record a complaint" / "Record the complaint" only; `list-1440.png`, `record-drawer-errors-1440.png` |
| BIC-13 errors on field + summary | Partly | on field and in summary, typed text kept; summary titled "Not recorded" (layout: "There is a problem"), items not linked, focus stays on the button (m5) |
| BIC-14 tooltips | Partly | Overdue chip and status use `title` only: nothing on keyboard focus (m2); the same words are in "How it works" |
| BIC-18 states | Met | empty (2 wordings), skeleton, overdue, closed, not found, long content; read-only line coded but unreachable with seeded roles (m6) |
| BIC-19 orange only for needs you | Met | `list-1440.png`: only Overdue chip, "!" status, "N business days late" |
| BIC-20 keyboard, contrast, widths | Met | keyboard walk; axe; 375/512/1024/1440 |
All other BIC rows N/A (no case facts, AI, signing or filing). Partly rows are Should (scope N/A; no §1–§5 [M] broken outright).

## Findings
**Blocker:** none. **Major:** none.

**Minor** (fix now or list in the PR as follow-ups):
* m1 `web/src/modules/platform/complaints/record-page.tsx:175` where-line is "Complaints › Complaint"; concept §4 says "Complaints › {subject}". Fix: set the last crumb from the loaded complaint (e.g. `useWhere` inside `RecordBody` once `q.data` is in). The "My account ›" prefix is PF-6's `PlatformFrame` (frame.tsx `Place`), disclosed in the PR; not this PR's to change.
* m2 `list-page.tsx:83`, `list-page.tsx:44`: the Overdue chip and the row's Overdue status carry their tooltip as `title`, which never shows on keyboard focus (EXPERIENCE §2.10, BIC-14). Fix: the team's `components/ui/tooltip.tsx`, or a visible hint.
* m3 `record-drawer.tsx:41` (and every route change into `record-page.tsx`): after saving or opening a record, focus is on `<body>` (measured), so a screen-reader user is not told the page changed. Fix: focus the record's `h1` (tabIndex -1) on load.
* m4 `record-drawer.tsx:55`: no in-flight guard on submit. Two submits inside one tick (Playwright `dblclick`, Enter twice with no gap) recorded **2** complaints, and BR-7 means they can never be deleted. With human gaps of 30–150 ms the `busy` button held (1 row each). Fix: `if (save.isPending) return` plus a ref guard in `onSubmit`. Server-side idempotent create (STANDARDS §4) is PF-21w's, outside this diff.
* m5 `record-drawer.tsx:56`: error summary titled "Not recorded" (layout Board 3: "There is a problem"); its items are not links to their fields and the summary is not focused (BIC-13). The service's lowercase field words ("choose how it was received") read fine.
* m6 `tests/check_pf21s_complaints_browser.ts:177`: the read-only reason has only its negative case. No seeded role holds the read key without record (Owner and Admin hold both), so the pass case cannot be seeded until PF-6 part 2's role editor. Say so in the PR. The rule is otherwise only tested by eye.
* m7 `record-page.tsx:135`, `:101`: the outcome ("Withdrawn") shows without its quiet "Sample" mark. Concept §5 marks every list as Sample once per field. Fix: add the mark in the closed line, or leave it to part 4's close drawer and say so.
* m8 `list-page.tsx:23-25`: past 100 complaints (this copy reached 146 during the checks), the chips read Open "100+", Overdue "0+", Closed "0+", All "100+", while overdue and closed complaints exist further down. "0+" reads as "none" on the one "needs you" chip. G1 accepted counting from one page, so this is within the concept. Fix: show "100+" (or no number) on views whose count the page cannot vouch for, per §2.7 "counts say what they count". Show more itself worked: 100, then 146 unique rows, and the button gone at the end.

## Code (STANDARDS §4–§7)
Server decides access: the screen only reads `/me` keys to hide or show, and every route is refused for wrong roles (my API checks as a Case Officer: GET another's id 404, `/handlers` 403, POST 403). zod parses every answer at the edge. Dates are typed and shown in the firm's zone (`zonedToIso`): 11:10 typed was stored as 11:10 America/Toronto. Non-English text was stored exactly. No migration, no per-row requests. `tsc --noEmit` clean. A rule's test fails when the rule is removed (spot-check by reading the assertions, not by mutation): dropping the "!"/warn class fails DW6, and counting Open from all rows fails DW1. `Me` and `Loading` come from `front-office/sales`, as PF-6's own frame already does. Card: "Card unchanged" in the PR body, which is reasonable (web-shell card covers `modules/**`).

## Graph (P-86)
`graph.mjs`: G3 lists every complaints API route as "no page uses it". The tool does not see `staffApi` template paths, and the new pages are absent from its page list. That is a tool blind spot, not a missing test: the suite visits both pages and asserts the calls (line 186). No element serves anything outside this part's capabilities.

## Could not check
A real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). `reminderScheduled: false` (needs a failing job port). A real front-office or case-party id in the address. Outside this diff, noted for PF-21's owner: the service accepted a made-up `frontOfficePerson` id. CI on the PR (draft; GraphQL unavailable here; the builder reports touched suites green).

## Re-review e47fa19fc..e80bd9c08 (16 Nov 2026, P-277: the diff only)
Reviewer (fresh agent) · commit `e80bd9c08bc382ac4170a8f2c53bead302dd4529` · copy :4571 (built `web/dist` holds this commit's strings). Suite re-run: `check_pf21s_complaints_browser.ts 4571 xr_studio_screens_pf21s` **59/59, exit 0**; screenshots restored afterwards. Web `tsc --noEmit` clean. My probes (scratchpad only) on :4571, and one on a Vite dev server (React StrictMode) on :4573 proxying to :4571, stopped afterwards.

**Verdict: Approve** (no open Blocker or Major). Journey score **9/10**, pass (re-score appended to `journey-test-reviewer-2026-11-16.md`).

**Breaker Majors**
| | Fix | Proof it works | Test fails on the old code? |
|---|---|---|---|
| M1 double submit | `sending` ref in `onSubmit`, released `onSettled` (`record-drawer.tsx:49,71`) | suite `dblclick` 1 POST / 1 row; mine: three `click()`s in one tick → 1 row; `requestSubmit()` ×2 → 1 row; a 422 then a valid submit still goes (guard released) | Yes: the breaker's `dblclick` gave 2 POSTs on `e47fa19fc` |
| M2 "0+" | past one page, All "100+" and no number on Open/Overdue/Closed; orange only on a real non-zero count (`list-page.tsx:24-28,89-90`) | suite with `next` forced: `["Open","Overdue","Closed","All 100+"]` | Yes: old All read "N+" from the page (≠ "100+") |
| M3 draft lost | `kept` in tab memory keyed by `staffId`, restored with "Your session ended … not recorded yet" (`record-drawer.tsx:18-19,30-36,72`; `list-page.tsx:64`) | suite (signed in elsewhere); mine: expiry path (25 s session) brings the draft back too; Escape on it asks; nothing was recorded (0 rows) | Yes: the old drawer never reopened |

**Regressions checked.** Privacy across people: T's draft, session ends, R signs in on the same tab → no drawer, R's drawer blank, no notice, no T text on the page; T's text stays only in tab memory and is dropped on R's open or on leaving the page signed in. Focus: Cancel/Escape return to "Record a complaint"; field errors focus the summary; recording opens the record with focus on its `h1`. Hooks order: every new hook in `record-page.tsx` and `record-drawer.tsx` runs before any early return. BR-4: `handlers`, `zzz`, `..%2F..%2Fme` → "Complaint not found" without a call; all-zero uuid → one GET, 404, same words; 403 now shows the same Not found too. m7: Cancel on `?view=closed&frontOfficePerson=…` leaves `?view=closed`, reload opens no drawer. m12: row links read "Person …, received Nov 16, 2026" (visible date is in the name).

**Findings. Blocker:** none. **Major:** none. **Minor:**
* r1 `record-drawer.tsx:30`: the draft is cleared in an unmount cleanup (`if (staffToken()) kept = null`). Under React StrictMode (on in `main.tsx`; dev only) the simulated unmount runs after re-sign-in, so the drawer reopens **blank with no notice**. Measured on the Vite dev server: `[back true, name "", notice 0]`. Built copies (demo, isolated, CI) are fine. Fix: never clear in a cleanup with a live token. Save the draft in the cleanup only when the token is gone, and clear it only on record, discard or another person's open.
* r2 `tests/check_pf21s_complaints_browser.ts:200-211`: M3 has no fail case for the privacy branch ("another person's draft is never shown", `record-drawer.tsx:34`). It also does not assert that nothing was recorded. Add: sign in as R on that tab, then expect a blank drawer and no notice. Both hold by my probe.
* r3 `list-page.tsx:24-26` vs concept §4/G1 ("100+" when `next` is set): showing no number on three chips is the honest reading, but it changes the concept's words. Say so in the PR (the body still describes `e47fa19fc`). The M2 check (`tests/check_pf21s_complaints_browser.ts:193-199`) would also pass with "4+" on Overdue. Assert that the three chips show no number.
* r4 `record-drawer.tsx:72`: the restored "Your session ended" notice is `role=status` present at open, and focus goes to the first field. A screen-reader user may not hear that the complaint was not recorded. Fix: focus the notice, or reference it from the drawer's description.
* r5 `contract.ts:67-76`: a time the clock skips moves in a different direction per zone. Toronto 02:30 → 1:30 a.m.; Paris 02:30 → 3:30 a.m. The comment says "an hour earlier". Every real time round-trips (checked: Toronto, Paris, Lord Howe, Kolkata). Make one rule (forward, like `Temporal` "compatible") or fix the comment.
* r6 The two focus fixes (h1 after recording, summary after errors) have no assertion in the suite. I measured both by hand. Add `document.activeElement` checks.
* Still open from before, not in this diff: review m1 (where-line), m2 (`title` tooltips), m6 (read-only pass case); breaker m3, m4, m5, m9, m10. List them in the PR as follow-ups.

## Re-review e80bd9c08..8ec6c2011 (16 Nov 2026, P-277: the diff only)
Reviewer (fresh agent) · commit `8ec6c2011` · own isolated copy `screens_pf21sr` on :4574 (never :4400), stopped afterwards. Suite re-run: `check_pf21s_complaints_browser.ts 4574 xr_studio_screens_pf21sr` **59/59, exit 0**; rewritten screenshots restored with `git checkout`. Diff: `c94625b1e` (review records only) and `8ec6c2011` (Devin's two comments on #1998).

**Verdict: Approve** (no open Blocker or Major). Journey score stays **9/10**: the diff changes no product code.

**What I checked**
* **No assertion weakened.** All five `ok(...)` conditions in the changed lines are word for word the same (DW1 chip counts, M1 doubles, empty view). Only how `body` is read changed. `call()` now returns `body: unknown`. Every read goes through the web contract's zod schemas: `Complaint.parse` for the POST answer and `ComplaintPage.parse` for the four GETs. A parse throws on a wrong shape: a missing `items`, `next`, `people` or `firmTimeZone`, or a bad row field. A wrong shape used to give `undefined` reads, so the suite is now **stricter**. Default zod `object` strips unknown keys, so `Complaint.parse` accepts the POST's `Recorded` answer (`reminderScheduled` extra). The filter's `x` gets its type from the schema now, not a hand-written `{ complainantName: string }`.
* **No `any` left.** `grep -nE '\bany\b'` on the suite finds only the words "in any browser" in a check name. CI's type check covers only api and web, so I also ran strict `tsc --noEmit` (`noImplicitAny`) on the suite file from a scratchpad tsconfig. The suite file has no errors. The only errors are in imported api files outside this diff.
* **No personal name left.** The made-up full name in `journey-test-reviewer-2026-11-16.md` J2 became "a multilingual sample name (accents, a hyphen and CJK characters)". A search of the three changed files at `8ec6c2011` for that name or its parts found nothing. The suite's own names are role labels (`Person Late …`, `Person Double …`). The `c94625b1e` re-score block names roles only.
* **Collision.** Importing the contract's `Page` as `ComplaintPage` keeps Playwright's `Page` type intact.

**Findings. Blocker:** none. **Major:** none. **Minor:** none new. Earlier r1–r6 and the listed follow-ups stay open as before. **Nit:** J2 in the journey record now reads "type name a multilingual sample name". Drop the first "name".
