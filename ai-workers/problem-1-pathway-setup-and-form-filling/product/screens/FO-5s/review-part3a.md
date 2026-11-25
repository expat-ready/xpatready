# FO-5s part 3a review: the Withdraw and Signed offline panels (S6) on the retainer page (R1.55 W1, W4)

Reviewer: independent (P-303), Opus 5.5. I did not build this. PR #3679, branch `claude/pensive-maxwell-bsxoo9-panels`, **commit e1418b1d2e7778b2d5ed8e5f77a65242bcd8ebaa** (draft). Scope: `git diff origin/main...HEAD` without PNGs: 4 files, +327 / -3. Concept r2 (`origin/lead-b-front-office`) §3 BR-10, BR-11; §4 S5 actions, S6; §5 copy; §6 keys. Read 25 Nov 2026. I used the isolated copy `rv_fo5s3` on :4566 only, never :4400. Afterwards I put back the 7 screenshots the check rewrites, deleted my walk scripts and stopped the copy.

**Verdict: Changes (Ship after fixes).** Under the label rule this counts as **Block**: 1 Major is open, so no `review: approved` for this head. 0 Blockers, 1 Major, 7 Minors. Journey score **7.5/10, fail** (`journey-test-reviewer-2026-11-25-part3a.md`). Fixing the Major raises it to 9.

## 1. Runs (this commit, fresh copy)
| Run | Result |
|---|---|
| `check_fo5s3_end_panels_browser.ts 4566 xr_studio_rv_fo5s3` | **21/21, exit 0**, 13.7 s |
| My walks at 1440 px (Playwright, as a person, starting from the prospect page): keyboard, 1024, 512 CSS px (1024 at 200 %), two tabs, double click, 11 MB file, a 260-character Arabic and Chinese reason, Case Officer on screen and by API, two sent versions, Client signed | findings below |
| `graph.mjs` | G1 0 · G2 0 · G3 298 · G4 0 · G5 0 · G6 25. Every `/front-office/retainers/*` route shows `testedBy: []`, `webUse: false`, including routes the screen has used for weeks. The tool does not resolve this controller's prefix, so it says nothing about this PR (see §6). |

## 2. D1-D20
D1 4: BR-10 and BR-11 work as written. Keys are AG-05 C5's: Case Officer sees neither button and gets 403 by API (`agent/retainer:void`). Withdraw is offered on Sent, Viewed and Client signed; Signed offline also on Draft. The one gap is the "client is emailed" line, which needs #3648 (§4).
D2 3: one audit line after a double click; a 200-character reason is stored whole; Won (SIGNED_OFFLINE) once. But after a stale 409 the panel quietly switches to the colleague's unsent version (M1).
D3 4: reuses Panel, Field, Notice, Select, `problemOf`, StaffApiError. `postForm` is a fourth copy of the multipart helper (m5).
D4 4: every rule stays in the API. The client only repeats the PDF-size check and the "a reason is needed" check, both in the server's words.
D5 3: Withdraw re-reads after a 409 and keeps its reason. Signed offline loses the explanation, the file and the reason after a stale 409 (M1).
D6 4: `retainer.withdrawn` and `retainer.signed_offline` audit lines carry the version and sha256 (DB checked). The reason is never shown again on the page (m3).
D7 N/A (no AI).
D8 4: Sales › P-000nn › Retainer; the prospect card's "Open the retainer" leads there. After Withdraw the prospect card shows "The last retainer was withdrawn. Open it · Prepare retainer" (BR-10 M2 holds across the boundary).
D9 3: the two actions sit at the bottom of "Check before sending", under the Code panel, far from Edit (y 859 at 1440×900; m1).
D10 4: §5 copy word for word ("The signing link stops working. This cannot be undone."; "Marks the retainer Signed offline and makes … a client. No email is sent."). The confirm buttons name the action. The server's refusals are plain ("The client signed version 2 electronically: record that version, or withdraw it first.").
D11 3: busy buttons, a toast, the chip changes, focus goes to H1. A stale Signed offline drops its own message (M1). After a 409 the panel keeps a confirm button that can only fail (m4).
D12 4: team look; destructive red only on Withdraw retainer; one primary per panel.
D13 5: axe (full page, WCAG 2.2 AA) clean on both panels, their error states, and the Withdrawn and Signed on paper pages. Keyboard path complete; focus opens on the first field. No sideways scroll at 375, 512, 1024 and 1440.
D14 5: SalesFrame, Panel, Pill, Notice, toasts as elsewhere.
D15 5: Withdraw confirm to chip in 142 ms. One request per action.
D16 4: 21 checks, a pass and a fail per rule. The read-only fail case does catch a removed key check (the read-only person's `mayChange` is true). Two gaps: the "request ended" check is named but not asserted (m6), and Signed offline has no stale test (M1).
D17 simulated only. D18 3: the filed paper PDF cannot be opened from the page (m3). D19 4: Sent → Withdrawn → Prepare retainer, and Sent/Draft → Signed on paper → prospect Won, both through screens. D20 simulated only.

## 3. Scorecard (EXPERIENCE §6, concept §4c scope)
| BIC | Score | Evidence |
|---|---|---|
| 01-03, 05-08, 10, 12, 15, 17 | N/A | concept §4c; the panels ask nothing about the person |
| 04 | Met | both inputs labelled in words; a missing reason or file is refused at the field and nothing else blocks |
| 09 | Met | names the client and the effect; opens on Reason, not on the confirm; Cancel or Escape changes nothing; audit line; the way forward is Prepare retainer (`fo5s3-withdraw-panel-1440.png`, 1024) |
| 11 | Met | one filled button per panel: "Withdraw retainer" and "Record as signed on paper" |
| 13 | Partly | errors on the field with focus, typed input kept; no top summary (a panel with 2-3 fields); a stale Signed offline loses its words and input (M1) |
| 14 | Met | the status chip has a tooltip; the only icon button, X, is named "Close" |
| 16 | Partly | who and when are in the audit; the page shows "Ended …" and "signed on paper" per version, but not who, the reason or the paper file (m3) |
| 18 | Partly | busy, toast, read-only by key all drawn; the conflict state is lost in Signed offline (M1) |
| 19 | Met | at 1440 and 1024: one heading and one primary per panel; red only for Withdraw and errors |
| 20 | Met | keyboard-only Withdraw (check) and Signed offline (my walk: file → Reason → Cancel → confirm); 200 % zoom, no sideways scroll |

## 4. Issues, ranked
**M1 Major (Must). After a stale 409, Signed offline wipes the person's work and quietly picks a different version.** `end-panels.tsx:69` resets on `[open, r.version.n]`. A colleague saves version 2 while the panel is open. The person presses Record → 409 → `onStale` re-reads → `r.version.n` changes → the reset effect clears the server's message, the chosen PDF and the reason. Then "Version signed" pre-selects "Version 2 (current)", an unsent draft with the colleague's new fee (my walk K: "reason kept: \"\" | file kept: 0 | alerts: []"; page Draft, Version 2). This breaks EXPERIENCE §4 [M] (conflict state) and BIC-13 ("what was typed is kept"). It also defeats B-24's intent: the paper was version 1, and nothing now says so. **Fix:** reset on `open` only. Keep the 409 words. When the version list changed, keep the person's chosen version if it still exists, or leave "Version signed" unselected and required. Add a Signed offline stale case to the check.
**m1 Minor.** `retainer-page.tsx:233-238`: Withdraw and Signed offline sit under the Code panel inside "Check before sending". At 1440×900 they start at y 859, and on a shorter laptop screen they are below the fold. S5 lists them as the page's actions, with Edit. **Fix:** put them with Edit on the Agreement card or in the header row.
**m2 Minor.** `end-panels.tsx:98`: "Version signed" is offered on Client signed, where the server always refuses an earlier version (`service.ts` NOT_SIGNABLE; my J4 screenshot). **Fix:** show the select only when the status is not CLIENT_SIGNED. It is display only; the rule stays in the API.
**m3 Minor.** Concept S5 "downloads when signed" and S2 "Signed offline → links to the files": after Signed offline the page offers no link to the filed PDF, though `download-link` accepts `file: "signed-offline"`. The reasons that are "Kept with the retainer" are never shown either. **Fix:** add the link and show the reason in the version row, or name the later part that builds them in the PR and the row.
**m4 Minor.** `end-panels.tsx:47, 85`: after a 409 that re-reads an ended retainer (Withdrawn), the panel stays open with an active confirm that can only fail again (my J7 screenshot). **Fix:** once the re-read status is outside `WITHDRAWABLE` / `OFFLINE_FROM`, disable the confirm or close the panel with the server's words.
**m5 Minor.** `end-panels.tsx:26-31` duplicates `upload()` in `templates-page.tsx:28` (same folder) and `identity-panel.tsx:31`. **Fix:** share one helper.
**m6 Minor.** `check_fo5s3_end_panels_browser.ts:128-130`: the check's name says "the signing request ended". It only logs `req` (this run: `SENT:-`) and asserts nothing about it, so the line stays green without QA-770. **Fix:** once #3648 is in, assert `req` starts with `CANCELLED:WITHDRAWN`, and that one "Agreement withdrawn" mail is sent.
**m7 Minor.** `end-panels.tsx:51, 89`: Escape, the overlay or X throws away a typed reason and a chosen file without asking. Panel's `confirmClose` exists for this (G1 PR 2b break M4).
**Condition (not a finding at this head, because the PR is a draft and waits on #3648).** `end-panels.tsx:54` ("{client} is emailed that it was withdrawn") and the toast at `:44` ("The signing link no longer works.") are false on today's main: the request stayed SENT and no mail was sent. #3648 (open, head bd1a3874e) makes them true. Its email does not include the reason, so the hint "does not see it" holds. If this PR merges before #3648, this becomes a Major.
**Note for the Lead (concept, not this PR).** One action has three names: "Signed offline" (the button and the §5 sentence), "Record as signed on paper" (the panel title and confirm) and "Signed on paper" (the chip, `contract.ts:41`). The concept uses both terms. A one-line wording ruling would settle it.

## 5. Standards [M] (the lines this diff touches)
Met: server authorisation, deny by default (403 for Case Officer); optimistic concurrency (expectedVersion and expectedStatus → 409 in words); RFC 9457 field errors shown on the field; uploads checked for type (header and trailer) and size (10 MB) on the server; axe on every panel state; a rule's test fails when the rule goes (read-only case spot-checked); no `any` in web code; comments give the why with numbers; plain words, no ids on the main path; one primary per area; destructive action confirmed in place. Not met: §4 conflict state in Signed offline (M1). Partly: no duplicated logic (m5).

## 6. Could not check
A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder). The withdraw email and the request cancel (#3648 is not merged; I read its diff only). The graph's per-screen coverage: the tool's route table does not resolve the front-office retainer controller (all `testedBy: []`). That is a tool gap for qa, not this PR. Retrofit mapping: there is no team screen for S6 to map against; none recorded or needed for this part.

Reviewer: Changes e1418b1d2e7778b2d5ed8e5f77a65242bcd8ebaa
