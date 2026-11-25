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

## Round 2 (diff-only re-review, head ace1e1b5f3f7bb5778e737cfa612b4916586bf35)

Scope: `git diff e1418b1d2 ace1e1b5f -- ':!*.png' ':!*.md'` only: `end-panels.tsx` (+60 / -30) and `check_fo5s3_end_panels_browser.ts` (+37). Isolated copy `rv2_fo5s3` on :4568 (PLATFORM_IDENTITY=local), never :4400; stopped afterwards, the check's screenshots put back with `git checkout -- '*.png'`, walk scripts left in the session scratchpad.

**Verdict: Approve** for ace1e1b5f3f7bb5778e737cfa612b4916586bf35. 0 Blockers, 0 Majors open. 4 new Minors (below), none blocking. Journey score **9/10, pass** (round 2 section of `journey-test-reviewer-2026-11-25-part3a.md`). The #3648 condition from round 1 still stands: the PR stays draft until #3648 is on main.

### Runs
| Run | Result |
|---|---|
| `check_fo5s3_end_panels_browser.ts 4568 xr_studio_rv2_fo5s3`, twice | **23/23, exit 0** both times (13.7 s) |
| Hand replay in Chromium (Playwright, headless, 1440×900, as a person: prospect page → Open the retainer → Signed offline) | K1-K6 below; no page error |

### Does each fix close its finding?
* **B1 / M1 (Signed offline reset after a 409): closed.** K1, the breaker's exact steps: v1 Sent; PDF and "Signed v1 at the office"; a colleague's PATCH makes v2 Draft; Record → the server's words stay ("This agreement has a newer version (2) than the one you saw (1). Open it again."), the stale notice is up, the file (1) and the reason are kept, Record is disabled. A forced click and Enter on it sent **0** requests; DB stays `DRAFT v2`, nothing filed. K2, the second variant (v1 and v2 sent, Version 1 picked, a colleague makes v3): same, and the pick stays "1". The mechanism is sound:
  * `useOpenedOn` (`end-panels.tsx:42-47`) captures `{n, status}` in an effect on `[open]` only, and falls back to the live `r` for the one render before the effect runs (`stale` is false then, which is right).
  * `expectedVersion` is `on.n` (`:102`, and `expectedStatus: on.status` in Withdraw `:60`), so even if a re-read arrived without a 409 the server would still refuse. After a re-read the button is off anyway (`:117`, `:71`).
  * The reset effects (`:54`, `:92`) run on `[open]` only, so the re-read no longer clears the error, file, reason or pick.
  * Stale compares version and status, which matches the server (withdraw checks `expectedStatus !== r.status`, `service.ts:663`). The query client has `refetchOnWindowFocus: false` (`lib/api.ts:46`), so the panel goes stale only after a 409 or a page action, never because a tab regained focus.
  * After Cancel and reopening, the panel starts clean on the new version. It pre-selects "Version 2 (current)", the unsent draft. That is the concept's default (FO-5f item 3, "default the current one"), and now it is a fresh, deliberate opening. It is not a regression.
* **Reviewer m4 / breaker m2 (a dead confirm after a 409): closed** by `disabled={stale}`. K4 (Withdraw, a colleague edits): 409 in words, the reason kept, "Withdraw retainer" disabled, the description still "Version 1, sent to …" (the version it opened on, now correct).
* **confirmClose: never blocks a successful close or Cancel.** Success and Cancel call the `onOpenChange` prop directly (`:61`, `:107`, the footer Cancel), while Panel runs `confirmClose` only on Radix's own close paths (Escape, overlay, X; `controls.tsx:125`). Checked: K3 succeeded with a dirty panel and closed with 0 prompts, toast "Recorded as signed on paper. … is now a client."; Cancel on a dirty panel closed with 0 prompts, focus back on "Signed offline"; Escape on a dirty panel asked "Discard the file and reason you entered?", and dismissing kept the panel and the reason. Reviewer m7 / breaker m5: closed.
* **Version choices on CLIENT_SIGNED (reviewer m2 / breaker m3): closed.** `choices = [on.n]` when the status is CLIENT_SIGNED, so the select is hidden and no `signedVersion` is sent. K6 (v1 and v2 sent, status set to CLIENT_SIGNED in the DB to stand in for the e-signature) showed no select. Elsewhere `v.n <= on.n` keeps a re-read's newer versions out of the list.
* **Breaker M1 (consultation copy and toast): closed.** The panel copy branches on `r.kind` (`:119-121`). The toast follows `prospectWon === true` from the response (`:106-107`), which the server sets only for a RETAINER that actually moved to Won (`service.ts:755`, `:764`). The retainer path still says "… is now a client." (K3). The check's consultation case reads stage ACTIVE. Breaker m6 (the Withdraw wording on a consultation agreement) is closed too.
* **Breaker m1 (focus on a server field error): closed** via `focusOf` (`:93`, `:109`) and `:64`. **Breaker m7 (wrapping at 375 px): closed** by `WRAP` on the body (`:25`). The check's 375 line still shows 0 sideways scroll.
* **The two new test lines are honest, and both fail on the old code.** On e1418b1d2 the B1 line gets reason "", file 0, an enabled button and no "changed meanwhile" (round 1 walk K: `reason kept: "" | file kept: 0`), and its `status === "DRAFT"` part proves nothing was filed. The M1 line fails on the old copy's "makes … a client".

### New findings (Minor, none blocking)
* **r2-m1 Minor (test honesty).** `check_fo5s3_end_panels_browser.ts:197`: `/newer version|changed/i` is satisfied by the panel's own stale notice ("changed meanwhile"), so the line's claim "the server's 409 is shown in its words" is not proven. If the error Notice vanished, the line would stay green. **Fix:** assert `/newer version \(2\) than the one you saw \(1\)/` on the alert.
* **r2-m2 Minor (test gap).** No line asserts the RETAINER toast "… is now a client." (`:174-176` checks Won in the DB but not the toast), so a mis-read `prospectWon` (always false) would pass every line. **Fix:** add `body.includes("is now a client")` to the Signed-offline pass line.
* **r2-m3 Minor (copy).** `end-panels.tsx:48`: STALE says "This retainer changed … (a colleague saved, sent or ended it)" on a consultation agreement too, and it blames a colleague when the client's own signing or viewing caused the change. **Fix:** say "agreement" when `consult`, and "(someone saved, sent, signed or ended it)".
* **r2-m4 Minor (breaker m4, still open and not in the PR's "Listed, not fixed").** `end-panels.tsx:70, 116`: `confirmClose` returns true while `busy`, so Escape during a running request closes the panel. K5 (request delayed 2.5 s, a colleague withdrew first, Escape): the panel closed without asking, the 409 was shown nowhere (no toast), and focus fell to BODY. DB `WITHDRAWN`, so no data harm. **Fix:** return false while `busy`, or toast the refusal when the panel is already closed. Either way, list it in the PR body.
* Observation, not a finding: `check_fo5s3_end_panels_browser.ts:147`'s Escape now meets the discard prompt, which Playwright auto-dismisses, so the panel stays open until the next `goto`. The line is harmless but no longer closes anything.

### The Minors the PR body leaves open
I accept leaving all of them for this PR:
* Round-1 m1 (placement under the Code panel): layout, no data risk.
* m3 (no paper-file download and no reasons on the page): it is named for part 3b with the Declined state.
* m5 (duplicate `postForm`): small, three copies.
* m6 (assert `CANCELLED:WITHDRAWN` once #3648 is on main): tied to the existing merge condition.
* The Lead wording note: a concept question.

I ask that r2-m4 be added to that list, or fixed. r2-m1 and r2-m2 are one-line test changes, worth doing with m6.

Reviewer: Approve ace1e1b5f3f7bb5778e737cfa612b4916586bf35
