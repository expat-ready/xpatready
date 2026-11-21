# Review: FO-4as, Assign / Reassign, owner history, one-user hiding (R1.32 screen part), PR #2620

Reviewer: independent reviewer (fresh context, did not build it), 20 Nov 2026. **Commit reviewed: `3118d382771d7a6019549bbc7c47118328c60e3d`** (the first pass was on 8480fc6; the delta to 3118d38 only moves focus return to `Panel returnFocus`, and both were checked).
Sources: brief FO-4 part 2 (DW17, DW18), concept r2 (BR-4, BR-5, BR-10, §4 Panels), AG-2-13c from `trace-requirements.py --brief FO-4`, `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`. App: my own isolated copy at 3118d38 on :4441 (`xr_studio_rvas`, PLATFORM_IDENTITY=local; the web build was remade for that head), not :4400. The :4532 copy still served 8480fc6's web build, so I did not use it for the verdict.
Journey test: `journey-test-reviewer-2026-11-20.md`, **score 9/10**.

## Verdict: Ship after fixes (one Major), which means **Block**

## Re-run on 3118d38 (by the reviewer, not the maker)
`check_fo4as_assign_browser.ts 4441 xr_studio_rvas` **22/22** · `journeys/j_32.ts rvas 4441` **8/8** · my own walk (10 journeys, Playwright headless, scratchpad `jt/walk.mjs`), findings below. The screenshots those runs rewrote in the worktree were restored with `git checkout`.

## D1–D20
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | AG-2-13c rules 1, 2, 4 and 11 met: the picker lists all 3 active people of any role and never a deactivated one, and a Case Officer gets no button and a 403. X-4/BR-10 is only partly met: the menu still shows "1 unassigned" in a one-user firm (M1) |
| D2 Data integrity | 5 | Double-clicking Assign wrote 1 audit line. A take in between was refused, owner unchanged. Assigning to another firm's person gave 422 with the owner unchanged. Uses `expectedOwnerStaffId` |
| D3 Reuse | 4 | Reuses `Panel`, `useOwners`, the timeline route and `arrivedLabel`. The "active owner" test is written three times (m5) |
| D4 Rule integrity | N/A | No dependent questions |
| D5 Stability | 4 | Reload keeps the history. A stale assign is refused, the screen re-reads and a retry works. A failed `assignees` call hides things silently (m3) |
| D6 Governance | 4 | The history is the audit (who, when, oldest first). Once a person has left, an assign to them reads "A colleague" (m1) |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | Sales › Leads › Lead. The panel reads "L-00012 · now nobody" or "now <owner>" |
| D9 Flow | 4 | Open, choose, Assign: 3 clicks. The card's edge case says 2, but concept §4 makes Assign a right panel, so not a finding. Leads row and rail update |
| D10 Language | 4 | Plain verbs (Assign/Reassign, "Choose who gets the lead."). No ids on the main path. Toast "…is now Case officer (Sample)'s." reads awkwardly |
| D11 Feedback | 3 | The toast, owner line and history update. But the M1 badge, a 2 s rail reflow while `assignees` loads (m2), an empty history with no text (m4) and the silent hide (m3) |
| D12 Visual | 4 | One filled button per panel (Take it, or else Engage). Team components. Long Greek/CJK names wrap cleanly at 1024 (`j10-long-1024.png`) |
| D13 Accessibility | 4 | axe (WCAG 2.2 A/AA) is clean on the whole lead page and the open panel. Keyboard: 11 Tabs, Enter, Space, Enter. Escape and submit both return focus to Assign/Reassign. No sideways scroll at 400, 1024, 720 (1440 @200 %) or 512 (1024 @200 %). No screen reader used |
| D14 Team look | 4 | Same rail, panel and Notice as the other sales screens |
| D15 Speed | 5 | Leads first view 347–567 ms, lead page plus history 197 ms, assign round trip 199 ms. One timeline request per lead, none per row |
| D16 Testability | 4 | Suites re-run by the reviewer on the exact head. Each rule has a pass and a fail case (AS1–AS5). The AS5 hiding test does not look at the menu, so M1 passes unseen. Graph: the test names no capability (`caps: []`) and j_32 is not indexed. G3 lists every front-office route as untested because the tool does not parse `staffApi(...)` (tool limit, existed before) |
| D17 | simulated only | No intended user walked it |
| D18 Provenance | 4 | Each line is an audit line with actor and time. The arrival line shows for real (web-form) leads |
| D19 E2E closure | 4 | Web form → Unassigned → Assign → Engage panel names the assignee as owner (BR-7 hand-off) → Leads row shows the owner |
| D20 | simulated only | — |

## BIC scorecard (EXPERIENCE §6; concept 4c chose it)
| Check | Score | Evidence |
|---|---|---|
| BIC-01–03, 05–10, 12, 15–17 | N/A | No facts asked, AI, applications, roles, tasks, signing or filing in this item |
| BIC-04 | N/A | Only one required choice. No optional inputs |
| BIC-11 | Met | Rail: Take it is filled, Assign and Engage are outline. Panel: one primary named "Assign" / "Reassign" under the title "Assign lead" (`j1-panel-1440.png`) |
| BIC-13 | Partly | "Choose who gets the lead." and the conflict text show as a Notice above the group, not tied to the radio group (m6). Input is kept |
| BIC-14 | Met | Nothing here needs a tooltip: times are absolute and the history is plain sentences |
| BIC-18 | Partly | Read-only (no key: no button) and conflict are drawn. Empty history and the `assignees` failure are not drawn, and loading is the text "Loading…" (m3, m4) |
| BIC-19 | Partly | At 1440 and 1024 each panel has one heading and one primary. But the "1 unassigned" count in a one-user firm counts a list the person cannot open (M1) |
| BIC-20 | Met | Keyboard-complete, focus visible and returned, 200 % zoom with no sideways scroll, headings in order |

## [M] lines (only the ones this diff touches)
Met: server authorisation (unchanged API; 403 and 422 seen) · concurrency, stale assign → 409 naming the owner · idempotent double click · no per-row requests · axe on every state drawn · comments say why, with numbers · no immigration values. **Not met:** EXPERIENCE §4 "error" state (m3) and BR-10's "every rule has a pass and a fail test" for the badge part of X-4 (M1).

## Issues, ranked
1. **M1 Major (Must):** in a one-user firm the menu badge "n unassigned" still shows, while the Unassigned chip, Take it and Assign are hidden. This breaks BR-10, X-4, AG-2-13c rule 15 and DW18 ("Unassigned … hidden"). The PR's own `fo-4-sales/screenshots/fo4as-04-one-user-leads-1440.png` shows "1 unassigned", and so does my `j6-solo-leads-1440.png`. Real path: a firm that drops to one active person keeps its unowned or "(Inactive)" leads. Cause: `sales-frame.tsx:18-20` gates the badge only on `seesUnassigned(me)`. **Fix:** also require `useOwners()` settled and not `oneUser`, and assert in AS5 that `[data-unassigned-badge]` has count 0 in sample-solo.
2. m1 Minor (Should): after the assignee is deactivated, the rail reads "(Inactive) <name>" but the history reads "…assigned it to A colleague", even for the assigner. The cause is that `owners.name` only knows active people (`lead-owner.tsx:65`), which breaks AG-2-13c rule 4 "to whom". Fix: name the target from the server (a name on the timeline line), or fall back to the rail's owner label for the current owner. People without the key seeing "A colleague" is a declared limit.
3. m2 Minor: while `leads/assignees` loads, the lead rail shows only a filled Engage. Owner, Take it and Assign then appear and Engage turns outline (`lead-page.tsx:105,152`; seen with a 2 s delay). Fix: wait for `owners.settled` before drawing the rail, as Leads now does.
4. m3 Minor: if `leads/assignees` fails in a firm of three, Leads quietly drops the Unassigned chip, the Owner column and Take it, with no error (`prospect-actions.tsx:22` defaults `oneUser` to true; `j10-assignees-fail-1440.png`). Fix: on error, show an error with Try again rather than treating the firm as one-user.
5. m4 Minor: a lead with no owner lines shows the "Owner history" heading over an empty list (`lead-owner.tsx:74`). Fix: "No owner changes yet." Also, `more` (over 500 lines) is not said.
6. m5 Minor: the same "active owner" test is written in `activeOwnerOf` (lead-owner.tsx:19), `ownerActive` (lead-page.tsx) and `unowned` (leads-page.tsx). Use the exported one (STANDARDS §7, no duplicated logic).
7. m6 Minor: tie the panel error to the radio group (`aria-describedby` on the fieldset, or the message under the legend) so it sits on the field (BIC-13).

## Could not check
A real screen reader. A visible headed browser (walked headless with screenshots). An intended user's unaided walk (D17, D20 stay with the founder). Prospect and Leads-row Assign and DW19 are declared out of this item, and #2476's rules are another lane's, so none of them is a finding.

**Verdict: Block** at `3118d382771d7a6019549bbc7c47118328c60e3d`. To fix: **M1** (hide the "n unassigned" menu badge in a one-user firm and assert it in AS5). m1–m6 are Should: fix them or list each with a follow-up row.

---

## Re-review, diff only (P-277): 3118d38 → `9b6088e59d829bbf261a5590a6b02c520a6bfb69`
Read: `git diff 3118d3827 9b6088e59 -- …/prototype` (sales-frame.tsx, lead-owner.tsx, lead-page.tsx, prospect-actions.tsx, the check). Ran on my own copy of 9b6088e (:4441, `xr_studio_rvas2`, web rebuilt; stopped after): check_fo4as **25/25** twice, plus a targeted walk (scratchpad `jt/rewalk.mjs`, `jt/r2.mjs`).

| Item | Status | Evidence |
|---|---|---|
| **M1** badge in a one-user firm | **Still open (path not covered)** | The badge now waits for `oneUser === false`, and AS5 passes. But AS5 opens Leads at `?view=all`. A one-user firm's person who opens **Leads with no `?view`** (the menu link) still gets **"1 unassigned"**: seen twice, after a clean copy restart. That stays true on Pipeline. Cause: while `useOwners` is pending, `solo` is false, so `chips[0]` is Unassigned. `useLeads("unassigned")` (`leads-page.tsx:57`) then fetches `["fo","leads","unassigned"]` (1 `view=unassigned` request seen). That is the badge's query key, and `useQuery({ enabled: false })` in `sales-frame.tsx:22` still returns that cached data. **Fix:** in `Menu` show the count only when `on` (for example `on ? data.length : 0`), or give the badge its own key. Also enable the Leads list only once `owners.settled`. Add an AS5 step that opens `/front-office/leads` with no `?view` and checks no badge |
| m1 history names a departed assignee | Fixed | AS4b: a Case Officer reads "assigned it to (Inactive) Sample Temp …". The names come from the timeline's own actors and the lead's owner label |
| m2 rail reflow | Fixed | With `assignees` slowed 2 s, the page holds Loading, then draws Owner, Take it, Assign and Engage at once |
| m3 failed `assignees` read | **Fixed on Leads, broke the lead page** | Leads with `assignees` answering 500 now keeps the Unassigned chip, the Owner column and Take it. But **the lead page never leaves "Loading the lead"**: over 60 s it made **119 `leads/assignees` requests** (`r2-fail-lead.png`). Before this round the page drew. Cause: `lead-page.tsx:92` gates on `owners.settled`, and the errored query keeps refetching as observers re-mount. **Fix:** treat an error as settled without refetch looping (for example `retryOnMount: false` on the `["fo","assignees"]` queries), or draw the lead and show the rail's owner parts as unavailable with Try again |
| m4 empty / over-500 history | Fixed | Shows "No owner changes yet."; the over-500 case is worded |
| m5 duplicated "active owner" test, and 3 clicks | Listed in the PR | Accepted as follow-ups |
| m6 error tied to the group | Fixed | `aria-describedby="fo-assign-problem"` → "Choose who gets the lead."; axe (WCAG 2.2 A/AA) clean with the error showing |
| Breaker 3b, 4, 5, 6, 7 | Hold | AS7 passes (sharing off → toast "You no longer see it." and back on Leads). After a refusal no choice stays checked and the description reads "now Case officer (Sample)". Escape returns focus to Assign |

### Ranked, to fix
1. **M1 Major (Must), still open:** the one-user firm's badge shows after opening Leads by its menu link (above).
2. **N1 Major (Must), new in this round:** if `leads/assignees` fails, the lead page stays on Loading forever and polls about 2 requests per second (`lead-page.tsx:92`, `prospect-actions.tsx:22`). A failed read must draw an error with Try again (EXPERIENCE §4), never a spinner plus a request loop. Add a check that routes `assignees` to a 500 and expects the lead page to draw.

Copy note: my own copy stopped twice during the walk with nothing logged (outside interference; no product error in its log). Every result above comes from a clean restart in which the copy stayed up (HTTP 200 after the run).

**Verdict: Block** at `9b6088e59d829bbf261a5590a6b02c520a6bfb69`. To fix: **M1** (the badge after opening Leads with no `?view`, with an AS5 step) and **N1** (the lead page stuck on Loading and looping when `assignees` fails, with a check).

---

## Re-check, diff only (P-277): 9b6088e → `e63311a878913cf153e968295c7ab0b1484e5ef2`
Read: `git diff 9b6088e59 e63311a87 -- …/prototype` (sales-frame.tsx shared `assigneesQuery` with `retry: false, retryOnMount: false`; the badge counts only when `on`; Leads fetches its list only once owners are settled; AS5 no-`?view` step; AS8). Ran on my own copy of e63311a (:4441, `xr_studio_rvas3`, web rebuilt, stopped after): check_fo4as **27/27**, plus my earlier repro scripts.

* **M1 fixed.** The one-user Owner opened `/front-office/leads` with no `?view`, with `assignees` answering at once and after a 1.5 s delay. Result: badge 0, 0 `view=unassigned` requests, chips "Mine · All open", badge still 0 on Pipeline. Firm A still shows the badge (AS5 fail side).
* **N1 fixed.** With `assignees` answering 500, the lead page drew in 363 ms with 1 `assignees` request (it never left Loading before, after 119 requests). AS8 covers this.
* Everything else still holds: m2 (rail waits), m4 ("No owner changes yet."), m6 (describedby, axe clean with the error), and breaker 4 (no choice kept after a refusal; Escape returns focus).
* New Minor (Should), not blocking: after a failed `assignees` read the panel says "No other active person in your firm.", which is wrong for a firm of three. A failure stays until reload (`retryOnMount: false`). Fix: when the read failed, say "Could not load your colleagues." with Try again (`lead-owner.tsx`, the empty-choices line). Fix it or list it with the PR's follow-ups (m5, clicks).

No Blocker or Major is open.

**Verdict: Approve** at `e63311a878913cf153e968295c7ab0b1484e5ef2`.
