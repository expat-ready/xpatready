# FO-5s part 1 review: retainer card, retainer page, Send panel (R1.53)

Reviewer: independent (P-303), Opus 5.5, did not build it. PR #2802, branch `claude/laughing-noether-tam1zn`, **commit 95ff4d2d97f3961006782387d49ac1dbea291659**, read 21 Nov 2026. Concept: approved r2 (`origin/lead-b-front-office:…/screens/fo-5s-retainer-signing/concept.md`). This part claims S2, S3/S5 (agreement, fees, Check before sending, FO-5b checklist, versions) and S4. S1, S6, S7 and Sign as the firm are deferred by the brief, so they are not findings here. Diff: 26 files, +708 / -0. Isolated copies only (:4571, :4572). Never used :4400.

**Verdict: Rework (Block).** 2 Majors, 10 Minors. Journey score **7/10, fail** (`journey-test-reviewer-2026-11-21.md`).

## 1. Runs (isolated copies, this commit)
| Suite | Result |
|---|---|
| `check_fo5s_retainer_screens_browser.ts` run 1 (fresh copy rev_fo5s :4571) | 31/31 |
| same, run 2 and run 3 on the same copy | **crash at BR-3**: "the only template is chosen" fails because each run uploads one more active template. The test only passes on a fresh database (m6) |
| `journeys/j_53.ts` (fresh copy j53r :4572) | 20/20 |
| My own walk (Playwright, 1440 / 1024 / 200 % zoom, keyboard, three roles, two tabs, double click) | findings below |

## 2. D1-D20
D1 3: S2-S5 are built and BR-5/6/7/9/17 behave, but S3 has no Signer choice, so Corporate prospects reach a dead end (M1) · D2 5: one live retainer per prospect, stale save gives 409 with the version, a double-clicked Send sent once (v3 only, live) · D3 5: reads FO-5/FO-5b answers, no logic copied except the `EDITABLE`/`CLOSED` lists, which mirror FO-5 · D4 N/A · D5 4: stale tab told "newer version (3) than the one you saw (2)", but what was typed is replaced (m5) · D6 4: Code line shows "current to" and Unconfirmed: no counsel; versions lack "made by" (m4) · D7 N/A (no AI) · D8 3: path is Sales › Pipeline › Retainer, and Back goes to Pipeline, not the prospect (m1) · D9 3: one primary per panel, but signer blockers have no next step (M1, M2) · D10 4: plain words, but tooltips are `title`-only and "missing… You can send without it" sits on values that do block (M2, m2) · D11 4: toasts "Saved as version n", busy buttons, conflict and identity notices · D12 4: team components, calm two-column layout; the card is full width, not in the right rail (m7) · D13 4: keyboard path works, axe clean, no sideways scroll at 375/1024/1440 and at 200 % (720 and 512 CSS px); tooltips cannot be reached by keyboard (m2) · D14 4: SalesFrame, Panel, Pill, Notice; the team Tooltip is unused · D15 5: one request for the card, one for the page; no per-row requests · D16 3: main rules have pass and fail tests, but the read-only check cannot fail and BR-2 refusal and Prepare-after-Withdrawn are untested (m6) · D17 simulated only · D18 3: Check before sending does not give each value's source (m3) · D19 2: R1.53 walks end to end only for Individual prospects and only with a template uploaded by API (§5) · D20 simulated only.

## 3. BIC scorecard (EXPERIENCE §6; concept §4c)
| Id | Score | Evidence |
|---|---|---|
| BIC-01 | Met | Client, signer, firm and representative values filled from records (walk A, C; `retainer-1024.png`) |
| BIC-02/03/05/06/07/08/10/15/17 | N/A | concept §4c |
| BIC-04 | Partly | "missing" is a normal state (Client phone). But Person who signs and Signer's email show "missing / You can send without it" while they block (walk A, C) |
| BIC-09 | N/A this part | Withdraw and Signed offline panels are S6, deferred |
| BIC-11 | Met | One filled button per panel: "Check and send", "Send to <client>", "Prepare retainer" |
| BIC-12 | Partly | Every value is listed and errors are kept apart from "missing", but no value shows its source (m3) and the signer errors do not link to a fix (M2) |
| BIC-13 | Partly | Fee errors appear on the field and in the summary. "Choose who signs." / "The signer needs an email." link to a `<dt>` that cannot take focus (focus stays on the link, walk A) and give no fix (M2). A stale save throws away the typed value (m5) |
| BIC-14 | Partly | Status chip and "missing" tooltips are `title` on a span with tabindex -1, so hover only (m2) |
| BIC-16 | Partly (this part) | Sent with time per version, ended "Replaced by a newer version", download per version. Signed events are FO-6 |
| BIC-18 | Met | Loading text, "No retainer yet.", no-template and no-licensed notices, read-only (no Edit/Download for READ_ONLY, live), withdrawn notice |
| BIC-19 | Met | One heading and at most one primary per panel at 1440/1024 (`retainer-1440.png`, `retainer-1024.png`); no ids except the prospect number |
| BIC-20 | Partly | Keyboard walk done: 14 Tabs to Prepare, focus lands on Template, Enter in the fee field saves. 200 % zoom has no sideways scroll. Focus is lost to BODY after Prepare navigates (m9), and tooltips cannot be reached by keyboard |

## 4. Issues (ranked)
**Majors (Must, block the merge)**
* **M1 — Corporate retainer can never be sent from the screens.** `retainer-page.tsx:103` shows the Signer as read-only (`<Pill>Choose who signs</Pill>`) with no control. `retainer-card.tsx:25-26` discards the draft answer's `signerOptions` and `warnings`. `read()` returns no options, and the PATCH (`retainer-page.tsx:43`) never sends `signerPersonId`. Concept S3 ("left: Template · Signer · Representative · Fees") and BR-6 ("choices that must be made … one signer with an email (field errors)") require the choice, and BR-4 / AG-5-50 say "a pick from the company's other contacts, never a block". **Failing scenario (walked live):** Corporate prospect "Walk Holdings Sample Ltd" with one OTHER contact and no SIGNATORY → Prepare retainer → fee 900 → Save as version 2. The page now warns "This company has no signatory contact. Pick who signs from its contacts." but nothing on the page lets you pick → Check and send focuses "Choose who signs." → clicking it does nothing (`A3-corp-blocked`). Send cannot be reached. **Fix:** a Signer select on S3 for Corporate (the company's contacts, SIGNATORY first), sent as `signerPersonId` in the PATCH. Add a pass and a fail test (pick → blocker gone; none picked → field error).
* **M2 — Signer blockers say neither where the problem is nor how to fix it, and the page contradicts them.** `BLOCKER_FIELD.signerPersonId = "fo-signer"` points at a `<dt>` with no tabindex (`retainer-page.tsx:23,103,150`), so the summary link moves no focus. "The signer needs an email." has no fix or link to the person's record. Concept copy names the fix: "Fix it on Client B's record". In the same panel, `retainer-page.tsx:154` marks Person who signs and Signer's email "missing" with the tooltip "Not on X's record yet. You can send without it." This breaks EXPERIENCE §2.10 [M] ("errors say what happened and how to fix it, on the field"), so BIC-13 counts as a Must under §6. **Failing scenario:** an Individual prospect with no email (walk C, case officer) → the summary says "The signer needs an email." → the link goes nowhere, and Signer's email says "You can send without it". **Fix:** put the message on the Signer row (focusable), add "Add an email on <name>'s record" with a link to the prospect, and do not mark blocking keys as "missing".

**Minors (Should)**
* m1 `retainer-page.tsx:187-188`: the path is Sales › Pipeline › Retainer and Back goes to Pipeline. Concept S3 says "Sales › Client B › Retainer". Fix: put the prospect in the crumb trail and point Back at the prospect.
* m2 `retainer-page.tsx:87,154`, `retainer-card.tsx:51`: tooltips use `title`, so they do not open on keyboard focus (BIC-14). Use the team Tooltip (`components/ui/tooltip.tsx`, as in `conflict-panel.tsx:70`).
* m3 `retainer-page.tsx:152-155`: no "source" per value (concept S3: "every filled value with its source"; D18). "Total fees" shows "empty" with the tooltip "Not in this template." even when the template prints `fees.total`.
* m4 `retainer-page.tsx:7,132-144`: S5's Activity, "who has signed" and each version's "made by / when made" are not built, and the header does not list them as deferred. Either build them or name them as part 2.
* m5 `retainer-page.tsx:34,40`: after a 409 CHANGED, the refetch resets the form, so a typed 9999 became 2600 with no notice. Keep the typed rows (or show them next to the newer version).
* m6 Tests. `check_fo5s…:183` "BR-2 fail: read-only gets no Prepare" cannot fail: Ana's retainer is live, so `mayPrepare` is false for everyone (`retainer-card.tsx:36`). It also visits only the prospect page. Untested: the no-licensed refusal (BR-2), Prepare coming back after Withdrawn/Expired (`CLOSED`), and the BR-3 fail case (preparer not eligible → empty; walk C showed it works). `:90` assumes one active template, so the suite fails on re-run. Graph: GET `prospects/:id/retainers` has `testedBy: []` and the check has `caps: []` (the graph does not follow `staffApi`; the same is true for all FO-5 routes).
* m7 `prospect-page.tsx:142`: the card is full width under the grid, not in the right rail. The pipeline card does not show the retainer status in words (both concept S2).
* m8 `retainer-page.tsx:170`: the Send panel does not use concept §5's copy ("one email from <firm>", the code line). This is acceptable while FO-6 sends nothing, but the copy should follow when FO-6 lands.
* m9 After Prepare navigates to the retainer page, focus is on BODY. Move it to the h1.
* m10 `qa/built/R1.53.md`: it says "a person prepares the retainer from the Retainer card" without saying that, until S1, the template exists only by API upload (no seed). See §5.

## 5. Does the cut leave R1.53 short?
Yes, in two ways. (1) **M1:** for Corporate prospects with no SIGNATORY contact, "edits make versions until sent" cannot reach "sent". This is inside the claimed S3, so it is a fix for this PR. (2) **The S1 cut:** no seed or screen makes a retainer template, so on a fresh firm or the demo, Prepare shows "No active retainer template yet." Both suites upload the starter by API, which is scaffolding under P-33. R1.53 can be Partial (Individual path proven), not Works, until S1 merges. The Done-when items that are on screen work: the 26 items marked or not and never blocking, a new version per save, and a sent version unchanged (v2 kept CAD 1,500.00 and its sent time after Edit; DB checked).

## 6. Not checked
A real screen reader. D17/D20 with an intended user. Retrofit mapping (no build-notes in `screens/FO-5s/`, so nothing recorded). Cards for states only FO-6 can reach (Client signed, Declined, Signed). Mutation runs on the web code (I reasoned about the effect instead; rebuilding the bundle per mutation was not done). The breaker's `break-report.md` (untracked, not read).

**Verdict: Block** (95ff4d2d97f3961006782387d49ac1dbea291659). Fix M1 and M2: `retainer-page.tsx:103/43` + `retainer-card.tsx:25` (no signer choice), and `retainer-page.tsx:23,150,154` (signer errors with no target or fix, contradicted by "You can send without it").
