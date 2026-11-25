# Review: PF-21s (parts 3 and 4)

## Part 4 review (1a2e0b232)

### Re-review c72deb527..e865fa38b (18 Nov 2026, about 20:05 IST; P-277: the diff only)
Reviewer (the same fresh agent) · commit `e865fa38befc380453b2b520b854939b595711ed` · I rebuilt `web/dist` from this commit and ran my own `review_pf21s` copy on :4573 (never :4400; stopped afterwards). Suite: `check_pf21s_complaints_browser.ts 4573 xr_studio_review_pf21s` gave **114/114, exit 0**; I restored the rewritten screenshots with `git checkout`. Web `tsc --noEmit` exit 0. The diff covers `action-drawer.tsx:25-28,62-68`, `record-page.tsx:82` (`dates={c}`), `contract.ts:71-73` and two suite hunks.

**Verdict: Approve** for `e865fa38b`: no open Blocker or Major. Journey score **9.5/10**, a pass.

**R1: fixed. I re-ran my clock probe.**
* With the browser clock shifted by `page.clock.setSystemTime`, the untouched default on acknowledge and close saved at **+0 ms, +300 ms, +1.5 s, +5 s and +20 s** (it was refused from +300 ms at `c72deb527`).
* The DB shows the minute cut (`14:30:00.000`).
* Break m1 holds through the floor: received at `14:29:42.810`, then acknowledged at `14:29:42.810`, exactly the floor.
* The floor follows the service's order checks:
  * acknowledge: received;
  * response: received or acknowledged, whichever is later;
  * close: the latest of all three.
  * The floor is a server-recorded date, so it is never later than the server's clock.
* ISO strings from the server and from `zonedToIso` share one format (`…Z` with milliseconds), so the string comparison is sound.
* The remaining exposure is a clock ahead by more than the seconds already gone in the current minute. The old code had the same exposure, and it is negligible.

**The new suite case:**
* It runs on its own page, waits outside a minute's first 4 s and last 10 s, then saves both acts.
* It would fail on `c72deb527`: the instant would be 2 s in the future, so `saved()` times out and stops the suite.
* The m5a change waits for focus and then judges inside `ok()`, so nothing is swallowed. The old assertion is not weakened.

**Nit fixed:** the BR-3 comment is back above `canChangeHandler`.

**New Minor (follow-up, does not block)**
* `action-drawer.tsx:66-68` with `contract.ts:100-108`: going back to the minute cut also undoes breaker m7a's instant. On a fall-back day, during the second pass of the repeated hour, the untouched default is read as the first pass, an hour early. Checked: `nowLocal` at 06:30Z on 1 Nov 2026 gives Toronto "01:30", and `zonedToIso` turns that into 05:30Z. The save is accepted, because the time is earlier rather than in the future, but it is recorded an hour off. This affects one hour a year, at night. The fix is to keep the instant when it is earlier than the server-safe cut, or to compare the cut with `Date.now()` and keep the second occurrence. List it with breaker m7a.

**Still open as follow-ups (agreed, none blocks):** breaker m6 (browser Back drops a panel without asking), breaker m7b and my m4 (the server's words in `api/`), my m2(a) (StrictMode, dev only), my m3 (links in the error summary).

Reviewer: Approve e865fa38befc380453b2b520b854939b595711ed

### Re-review 1a2e0b232..c72deb527 (18 Nov 2026, about 19:55 IST; P-277: the diff only)
Reviewer (the same fresh agent) · commit `c72deb52761aff842b311c612d61b9ec8a3ce9c0` · I rebuilt `web/dist` from this commit and ran my own `review_pf21s` copy on :4573 (never :4400). Suite: `check_pf21s_complaints_browser.ts 4573 xr_studio_review_pf21s` gave **113/113, exit 0**, and I restored the rewritten screenshots with `git checkout`. Web `tsc --noEmit` exit 0. The diff covers `action-drawer.tsx`, `contract.ts`, `record-page.tsx` and 11 new suite checks.

**Verdict: Block** for `c72deb527`: one new Major (R1), introduced by this diff. Journey score **9/10**, a pass (re-score in `journey-test-reviewer-2026-11-18.md`).

**Closed by this diff (I re-ran my own repros)**
* **M1: fixed.** Repro (a): after "Already acknowledged" and Cancel, the bar fills "Add a handling step" and the timeline shows `ACKNOWLEDGED,RECEIVED`. Repro (b): the page behind the 409 shows Closed with only "Add a note", without a reload. "Add it as a note" carries the typed text into the note panel at a fresh date, and the carried panel does not claim the session ended. Every refusal except 404 now re-reads the record (`action-drawer.tsx:73-76`). The suite has a pass and a fail for it.
* **m1: fixed.** Response sent → Close (`contract.ts:58-64`), with a suite case. Break m2a ("answered first leads to Close, acknowledge quiet") follows from the same rule and matches concept BR-5.
* **m2(b): fixed.** The restored notice is focused, with `role=status`. m2(a), the StrictMode cleanup, is left as a follow-up (dev only, like part 3's r1). It does not block.
* **Breaker items:** m3 (a restored panel opens only if the act is still allowed), m4 (a restored step keeps its default), m5a/b (focus) and m7c (a cleared step date sends none) read correctly and each has a suite check. Hooks still run before every early return, and the `open` callback only reads `restoredAct` when clicked.

**New finding. Major**
* **R1 An untouched default date is now refused whenever the person's computer clock runs even slightly ahead of the server's.** `action-drawer.tsx:62` sends `new Date().toISOString()` (the browser's instant) for an untouched When on acknowledge, response and close. The service's `notFuture` (`complaints.ts:218-221`) refuses any instant later than its own clock, with no tolerance. The old minute-cut default had up to 59 s of slack; the new one has only the request latency (about 15 ms measured).
  * Repro (Playwright `page.clock.setSystemTime(now + offset)`, the Owner, a complaint received a day ago): click the filled "Record the acknowledgement", leave the date alone, then save. At +0 ms it saves. At **+300 ms, +1.5 s and +5 s** the panel says "When: this date is in the future". The same happens with "Close with an outcome".
  * A person who touched nothing is told their date is in the future, on the main path. CI and the demo never show it, because the browser and server share one clock.
  * Fix (web only): for an untouched default, send the minute-cut time raised to the complaint's latest recorded instant the act must follow (received, acknowledged, response), i.e. `max(cut, floor)`. That keeps break m1's case (received seconds ago) working without depending on the browser's clock. Add a suite case with `page.clock.setSystemTime(Date.now() + 2_000)` on acknowledge and close. (Alternative: let the service fill an absent `at`, as it already does for steps. That is in `api/`, outside the touch list, so it would be a question for the tech lead.)

**Nits (no fix required):** `contract.ts:71`: the BR-3 doc comment now sits above `allowedActions`'s own doc comment, so `canChangeHandler` has none; move it down one line. After a closed 409 the panel's filled button is still "Add the step", which can only be refused again, while the act that works ("Add it as a note") is the quiet one.

**Follow-ups left open: none blocks**
* Breaker m6 (browser Back drops a panel without asking): an unsaved draft is lost on a deliberate navigation, and the record drawer from part 3 behaves the same way. Minor (D5); list it.
* Breaker m7b and my m4 (the server's words in `api/`): outside the touch list. A follow-up for the guard's and the service's owner is right.
* My m2(a), StrictMode: dev only, the same as part 3's r1.
* My m3, links in the error summary (BIC-13 Partly): a Should, and the summary is focused and names each field.

**Verdict: Block** for `c72deb52761aff842b311c612d61b9ec8a3ce9c0`. To fix: R1.

### First pass (1a2e0b232)
Reviewer (fresh agent, did not build it) · commit `1a2e0b23272ecd9fbc0e46b6ac2a12e1ccc66d4f` · PR #2134 (draft) · 18 Nov 2026, about 19:30 IST.
Bar: start sheet `lead-b-briefs/wave1-registers.md` "PF-21s part 4" (lead-b-front-office), concept §4 "Record page" and "Drawers", §5 "Refused", §6 DW3/DW4. Diff: `action-drawer.tsx` (new), `record-page.tsx`, `contract.ts`, the suite, screenshots, `qa/built/PF-21s.md`. Nothing in `api/`. About 330 code lines (sheet: 400–500).
Copies: the suite on the builder's :4571 (it serves `67998d8cc`; web and api are byte-identical to `1a2e0b232`), and my walks on my own `review_pf21s` :4573. Never :4400.

**Verdict: Block** (changes needed: one open Major). Journey score **8.5/10**, a pass (`journey-test-reviewer-2026-11-18.md`).

### Done when, ticked (my re-run: `check_pf21s_complaints_browser.ts 4571 xr_studio_screens_pf21s` **102/102, exit 0**; screenshots restored with `git checkout`)
| Line | Evidence | Result |
|---|---|---|
| DW3 the walk, one request on a second click | suite pass + 3 fails (step without a note, response before the acknowledgement, close without an outcome or note) + Withdrawn from the quiet act; mine: Enter ×3 → 1 POST, 1 NOTE row; two tabs → 1 ACKNOWLEDGED row | Met |
| Each act refreshes the timeline, keeps the draft across an ended session | suite "break M3 (acts)" pass + fail; J1 DB `RECEIVED,ACKNOWLEDGED,STEP,RESPONSE_SENT,CLOSED`, 5 audit lines | Met |
| DW4 hidden for a Case Manager, the server's 403 shown if forced | suite (forced through a faked `/me`); mine: Case Officer `POST /:id/handler` 403, `GET /handlers` 403 | Met |
| DW7 a closed complaint has no action buttons | suite: acts = `["note"]` only (outline button), and a second close gets 409 | Met, as the concept says (judged below) |
| DW8 the old handler sees "Not found" with DW5's words | suite: identical text, nothing of the record left, the step never recorded | Met |
| Refused 403/409 shown in the page, never a toast alone | suite and mine: the words show in the panel | Met for the words; the page behind stays stale (M1) |
| Keyboard, axe, 375/1024/1440; part 3 unchanged | suite; mine at 512 px (= 1024 at 200 %): the bar wraps, the submit is in view, axe 0; part 3's `ok(...)` lines untouched in the diff | Met |

**The known choice (closed → "Add a note").** I agree with the builder. Concept §4 ("closed → none, Add a note only"), §6 DW3 ("then only Add a note"), BR-6 (the service accepts a note on a closed complaint) and the closed banner's own words ("add a note if something more happens") all say the same thing. The sheet says it is not a new concept and that gaps go to the PR, and the builder asked there. I read the sheet's "no action buttons" as no acts that change the complaint. A quiet outline note button keeps every other line true. Not a finding. Lead B confirms on the PR.

### D1–D20 (part 4's diff)
D1 4 BR-2, BR-3, BR-5 and BR-6 behave as written; one ordering line differs (m1) · D2 5 one row per act, under double submit and two tabs (the server locks) · D3 4 the words and the next-step rule are defined once in `contract.ts`; one panel component for six acts · D4 N/A · D5 3 reload, Esc and M3 drafts hold; the 409 path loops (M1) · D6 4 insert-only timeline with who and when; "From X to Y" on a handler change · D7 N/A · D8 3 where-line still "Complaints › Complaint" (part 3 m1, open) · D9 4 one filled button by state (J1); m1 · D10 4 the concept's words; the forced 403 shows a key name (m4) · D11 3 busy button, toast, focus back on the next button; the page is stale after a 409 (M1) · D12 4 team Panel, Button, Notice (`record-next-step-1440.png`) · D13 4 axe 0; 1 Tab from the h1 to the filled button; Esc returns focus; 375/512/1024/1440 · D14 4 team components only · D15 5 panels open in 34–57 ms and save in 86–126 ms; no per-row requests · D16 4 each DW has a pass and a fail; no check that the page refreshes after a 409 · D17 simulated only · D18 4 "Sample list" on outcomes, firm zone labelled · D19 3 the walk now closes on one page; J-109 joins it · D20 simulated only.

### Scorecard (concept §4c: N/A as a whole; the checks it chose)
| Check | Score | Evidence |
|---|---|---|
| BIC-11 one filled button, named for the act | Met | `record-next-step-1440.png`; closed → outline "Add a note" only; panel submit names the act ("Add the step", "Close the complaint") |
| BIC-13 errors on field + summary | Partly | field + "There is a problem" summary, focused (measured), typed text kept; items are not links to their fields (m3) |
| BIC-14 tooltips | N/A here | no new status or icon; part 3 m2 stays open |
| BIC-18 states | Partly | normal, field errors, refused 403/409, 404 lost, closed, restored draft drawn; conflict has no reload (M1, EXPERIENCE §4 [M]) |
| BIC-19 orange only for needs you | Met | the bar and panels add no orange |
| BIC-20 keyboard, contrast, widths | Met | J8; axe; 375/512/1024/1440 |

### Findings
**Blocker:** none.

**Major**
* **M1 After a 409 the page shows a state the server has refused, and the filled button repeats the refused act** (EXPERIENCE §4 [M] "conflict (someone else saved: reload or merge)"; STANDARDS §4 [M] "stale save → 409 with what changed"). `action-drawer.tsx:66-68`: `onError` focuses the summary but never refreshes the complaint, so `record-page.tsx:73-74` keep the old `q.data`.
  * Repro (a): open a new complaint as the Owner and open "Record the acknowledgement". Acknowledge it in a second tab, then save in the first. The panel says "Already acknowledged". Press Cancel: the page still shows Record the acknowledgement as the filled button, and the timeline still holds only "Complaint received" (measured `["RECEIVED"]`). Click the button again: the same 409.
  * Repro (b): open "Add a handling step" and type a note. Close the complaint elsewhere, then save. The panel says "…add it as a note instead". Press Cancel: the page asks to discard the typed text, then still says **Open**, with all five acts and Change handler (`j5c-closed-while-working.png`, scratchpad). Only a browser reload shows the truth.
  * Fix: on a 409 (and a 403), `void qc.invalidateQueries({ queryKey: ["pf","complaints"] })`, so the header, bar and timeline behind the panel show what changed. Add a check to the suite's 409 case: after Cancel, `[data-status="Closed"]` is shown and the acts are `["note"]`. (Should: let the closed case carry the typed text into Add a note, the "merge" half, rather than discard and retype.)

**Minor**
* m1 `contract.ts:58-63` `nextAction`: acknowledged, response sent and no step → the filled button is "Add a handling step", and Close is quiet. Concept §4 says "response sent → Close with an outcome", and §1 says "Steps are never required". Repro: acknowledge a new complaint, then use the quiet "Record the response sent". The bar fills "Add a handling step" (`j1b-response-no-step.png`). Fix: check `responseSentAt` before the step rule (`if (c.responseSentAt) return "close"`), with a suite case.
* m2 `action-drawer.tsx:40` repeats part 3's r1: it clears the draft in an unmount cleanup while a token exists, so under React StrictMode (dev only) the restored panel opens blank. `action-drawer.tsx:91` repeats r4: the "Your session ended" notice is not focused or announced, and focus goes to When. By reading; the same code as the r1/r4 measurements. Fix with r1/r4.
* m3 `action-drawer.tsx:94`: the summary items ("When: …", "Note: …") are not links to their fields (BIC-13). Repro: "Close with an outcome" → save empty. Fix: `<a href="#field-id">` for each item.
* m4 `action-drawer.tsx:81` with the guard's words: a forced 403 reads "Your roles do not include the permission this needs (agent/complaint:read)" (`action-handler-refused-1440.png`). The key name is an ID (EXPERIENCE §5 [M]), though only on a forced path. The 409 closed notice also says "add a note instead" twice (concept words + `complaints.ts:47`). The guard's text is in `api/`, outside this diff: list it in the PR as a follow-up for the guard's owner rather than change `api/` here.

**Observation, not a finding:** when a response was recorded before any acknowledgement (allowed by BR-5), the filled "Record the acknowledgement" defaults to now and is always refused ("the acknowledgement comes no later than the response"), so the person must back-date it. This is as the concept says. The field error is clear.

### Code (STANDARDS §4–§7)
Correct: the in-flight ref plus `busy` (`action-drawer.tsx` submit). Bodies are per §4 "Drawers": a step or note left at its default sends no date, and acknowledge, response and close send the minute. `zonedToIso` uses the firm's zone, and `Complaint.parse` checks every answer. The `kind` sent is NOTE or STEP. The 404 removes the cached record and shows `NotFound`. Hooks run before every early return. Server authorisation is unchanged and holds (J4). No migration, no per-row requests, `tsc --noEmit` (web) exit 0. Comments give reasons with finding numbers, with no status words. A rule's test fails when the rule is removed (spot-check by reading): DW7 fails if any open act shows, DW4 fails if the read key is dropped from `canChangeHandler`, and DW3's double click matches part 3's measured M1 (`dblclick` gave 2 POSTs without a ref guard). Not mutated and rebuilt here.

### Graph (P-86)
`graph.mjs`: G3 119 still lists the complaints routes as "no page uses it", including the five part 4 calls. This is the same `staffApi` template blind spot as part 3. The suite asserts the calls ("the pages call only PF-21's complaints routes"). Every new element serves this part's acts.

### Could not check
A real screen reader. A visible-browser walk (headless only). An intended user's unaided walk (D17 and D20 stay with the founder). The read-key-only person (part 3 m6). The StrictMode dev build (m2, by reading only). CI on the PR (draft).

**Verdict: Block** for `1a2e0b232`. To fix: M1. Fix m1–m3 now or list them in the PR (m4 as a follow-up outside `api/`'s touch list).

---

## Part 3 review: PF-21s part 3 (complaints list, record drawer, read-only record page)

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

## Re-review 8d06b5eb8..14a687459 (16 Nov 2026, P-277: the diff only)
Reviewer (fresh agent) · commit `14a687459` · no server started (the diff is one type-only import line). Diff: `web/src/modules/platform/complaints/contract.ts:6`, `import type { Me } from "@/modules/front-office/sales/contract"` → `"../../front-office/sales/contract.ts"`.

**Verdict: Approve** (no open Blocker or Major). Journey score stays **9/10**: the diff changes no behaviour (`import type` is erased at build).

**What I checked**
* **Cause and fix match.** `tests/check_pf21s_complaints_browser.ts:15` imports this contract, so the api type-check (`api/tsconfig.json`, `moduleResolution: nodenext`, no `@/*` path) reaches it and cannot resolve the `@/` alias. The relative path names the same file (`web/src/modules/front-office/sales/contract.ts`), which imports only `zod`, so no further alias is pulled in. Both tsconfigs set `allowImportingTsExtensions`, so the `.ts` ending is valid under `nodenext` (api) and `bundler` (web).
* `NODE_OPTIONS=--max-old-space-size=6144 node product/tools/typecheck.mjs`: **exit 0**. "PASS no new type errors (15 known, 0 fixed)". tsc web 0 errors. The api's 15 known errors include no complaints file and no TS2307.
* `web`: `npx tsc --noEmit -p .` **exit 0**. `npx vite build` (out to a scratchpad folder, `dist/` untouched) **exit 0**, built in 1.3 s.

**Findings. Blocker:** none. **Major:** none. **Minor:** none new. Earlier r1–r6, the listed follow-ups and the J2 nit stay open as before. **Nit:** this is the only web module file that uses a relative `.ts` import, while the rest use `@/`. The trailing comment explains why. If another web contract is ever imported by a suite, one rule for every contract would be better than single-line exceptions (for example `@/*` in the api tsconfig `paths`). Not for this PR.

## Re-review 14a687459..b15c7376a (16 Nov 2026, P-277: the diff only)
Reviewer (fresh agent) · commit `b15c7376a` · own isolated copy `screens_pf21sv` on :4577 (never :4400), stopped afterwards. Diff (`review.md` left out): `126a12e13` + `b15c7376a`. Net: `tests/check_pf21s_complaints_browser.ts:79-80` (`chip()`) and `web/src/modules/platform/complaints/list-page.tsx:96-107` (`data-shown-view`, fragment → `div`). The 300 ms delay from `126a12e13` is gone from the net diff.

Suite re-run on my copy: `check_pf21s_complaints_browser.ts 4577 xr_studio_screens_pf21sv` gave **66/66, exit 0**. That is 59 + 7: one new "chip is kept in the address" check for each of the 7 `chip()` calls. I restored the rewritten screenshots with `git checkout`.

**Verdict: Approve** (no open Blocker or Major). Journey score stays **9/10**: nothing a person sees changes (measured below).

**What I checked**
* **The diagnosis holds, and I measured it.** I clicked the Closed chip with a fresh cache and sampled the page in the same tick, then on every animation frame:
  * In the same tick: `url=closed loading=false rows=6 shown=open`. The old condition (address changed, no `[data-loading]`, a row on screen) is already true while **Open's 6 rows** are shown.
  * Next frames: `loading=true rows=0` (the skeleton), then `rows=1 shown=closed`.
  * React Router 7's `BrowserRouter` writes the address at once and renders in a transition, so the old `listed()` could resolve on the old rows. The count that followed could then land in the skeleton. That fits "0 rows under Closed and All".
  * It also explains why a 300 ms server delay reproduced nothing. The gap is between the address change and the next render, not in the network, so it is a polling race at frame level.
* **`data-shown-view` cannot mark the wrong view's rows.**
  * `view` and `rows` come from the same render. The query key is `["pf","complaints","list", view]`, with no `placeholderData` or `keepPreviousData`, so a view not yet cached is `isPending` and shows the skeleton, which has no mark.
  * The mark is only on the two branches that show this query's data: the empty state, and the table with its footer.
  * Probe: a MutationObserver on the page across 90 chip clicks, many without waiting between them. It took 78 snapshots. **None** had a mark that disagreed with the pressed chip or with its rows (Closed rows all `Closed`, Overdue rows all `data-overdue`, Open rows with no `Closed`), and none had a mark during the skeleton.
* **No assertion weakened.**
  * The old wait required the address, no skeleton, then any row or empty state. The new wait requires the chosen view's own rows or empty state, and the skeleton can never carry the mark, so it is stricter.
  * The address condition moved from the wait into an explicit `ok(...)` for each view, so a wrong address is now a named failure rather than a timeout.
  * The DW1, DW6 and other `ok(...)` conditions are unchanged.
  * `listed()` is still used after `goto` and `reload`, where no old view is on screen.
* **The layout is unchanged.**
  * The new wrapper is `flex flex-col gap-4` inside the page's `flex flex-col gap-4`, and `Table` has a single root.
  * Measured on All:

    | Width | Chips → table | Table → footer | Footer → "How it works" | Table, wrapper and parent width | Sideways page scroll |
    |---|---|---|---|---|---|
    | 1440 | 16 px | 16 px | 16 px | 1152 px each | none |
    | 375 | 16 px | 16 px | 16 px | 343 px each | none |

    At 375 the table scrolls inside its focusable region, as before.
  * The comment inside `( … )` is JavaScript, not text in the page.
  * No other suite selects the list's DOM structure, and `data-shown-view` is used only by this suite.

**Findings. Blocker:** none. **Major:** none. **Minor:** none new. Earlier r1–r6, the listed follow-ups and the J2 nit stay open as before.

**Nit:** `data-shown-view` says which view the rows belong to, not that they are fresh. When a view is opened again within `staleTime` (2 s) or during a background refetch, its cached rows carry the mark at once. The old wait behaved the same way. DW1 and DW6 change nothing between visits, so they are safe. A future check that changes a complaint and then opens a view again should wait for the change itself, not for the mark. A one-line comment at `chip()` would say so.

## Re-review b15c7376a..a2ee2e183 (2026-11-16)

Scope (P-277): only `git diff b15c7376a..a2ee2e183 -- ':!**/review.md'`, one file, `web/src/modules/platform/complaints/list-page.tsx` (+3/-3). It fixes CI shard 8: `tests/check_bk2_fold_outs.ts` failed "no raw <details> or <summary> outside the shared fold-out" on the complaints list's "How it works".

What changed: the raw `<details data-how>`/`<summary>` is now `<FoldOut … data-how summaryClassName="font-medium" summary="How it works">` from `@/components/fold-out`. The body `<p>` is the same as before.

Judgement:
- **Correct use of FoldOut.** `FoldOut` renders native `<details data-fold>` and passes `...rest` to it, so `data-how` and the container classes stay on the `<details>` element. Anything that finds the section by `[data-how]` still finds the same element. The summary keeps `cursor-pointer` (the component adds it) and `font-medium` (passed in).
- **Arrow.** The summary now starts with the shared `FoldArrow`. It points right when closed and turns down when open, which is the BK-2 standard. Before this change the section had no arrow, so this is the one visible difference, and BK-2 requires it.
- **Keyboard and screen readers.** The element is still a native `<details>`/`<summary>`. Tab reaches it, Enter and Space toggle it, and it is announced as expanded or collapsed, the same as before. No script is added.
- **Nothing visible broken.** The text, the classes and the place on the page are the same. Closed by default, as before. The drawer and the rest of `ListBody` are not touched.

Evidence (run by me at a2ee2e183):
- `npx tsx tests/check_bk2_fold_outs.ts`: 16/16 passed (FoldOut 35, FoldArrow 12, listed non-fold-outs 9). The builder reported 15/16 before the fix.
- `web`: `npx tsc --noEmit -p .` exit 0.
- `check_pf21s_complaints_browser.ts` 66/66 exit 0 on a fresh isolated copy: the builder's evidence, not rerun here. A one-line swap of a static fold-out does not need a new journey score. The journey score from the earlier review stands.

**Findings. Blocker:** none. **Major:** none. **Minor:** none new. Earlier r1–r6, the listed follow-ups and the J2 nit stay open as before.

**Verdict: Approve** (for commit a2ee2e183541938d32e0dad86226ce85cd1125d2)
