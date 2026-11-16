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
