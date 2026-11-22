# PF-18s part 3 (My account → Notifications, R1.92): independent review

Commit reviewed: **dc04e9a7f792ed52a86ae73a379b4a964519759b** (branch `claude/focused-volta-qipbeu`, PR #2904). Reviewer: a fresh context that did not build it. Spec: board A of `concept-draft.md` + `challenge.md` (m2 409 overlay, m3 plain checkboxes + "Changes apply when you press Save") on `origin/claude/runtime-pf18s-concept` (#2332, Lead 19). API on main: `api/src/platform/settings/notifications/{routes,service}.ts`. Run on isolated copy pf18snr :4446 (fresh database, stopped after), live AI off, US$0. Journey test: `journey-test-reviewer-part3-2026-11-22.md` (**8.5/10, pass**).

**Head moved during the review** to d78d78fe7: it changes only `MODULE.rows/PF-18s.md` line 1 (full paths) and re-shot PNGs. Code and test are byte-identical to dc04e9a7f (`git diff dc04e9a7f d78d78fe7 -- '*.ts' '*.tsx'` is empty), so the runs below were on the same code. The label is for dc04e9a7f; d78d78fe7 is docs-only.

## Verdict: Ship (Approve) for dc04e9a7f. No Blocker, no Major, seven Minors.

## Concept fit (board A)
* **Placement met:** `Notifications` line in `ACCOUNT_SECTIONS` keyed `agent/notification:manage-preferences` (`account-sections.ts:10`); route `/account/notifications` (`routes.tsx`); crumb "My account › Notifications"; `aria-current="page"` on the line (walk J1).
* **Matrix met:** one row per group the API returns (Case Officer 1-5 + Payments because the Sample Case Officer holds `agent/invoice:list`; Owner all 8), label + `whatIsInIt` verbatim, In app · Email checkboxes named "Email for Mentions"; security row text "Always on", no control (BR-1, BR-2, BR-3; DN1).
* **m3 met:** plain native checkboxes (no `role="switch"`), the line "Changes apply when you press Save" by the one Save, plus "N unsaved change(s)".
* **One Save met:** disabled until a change; one PUT with only the changed groups and the view's version (`notifications-contract.ts:22-23`, DN2: one DB row); toast "Notification settings saved"; "Default" shown quietly when a group equals its defaults.
* **m2 met as written:** 409 → latest read, person's changed groups laid on top, groups missing from the latest dropped, next Save carries the new version, Save enabled only while a difference remains (`overlay`, `notifications-contract.ts:27-30`; DN3 browser + pure). `beforeunload` while unsaved; in-app menu click not blocked, stated in the page comment (`notifications-page.tsx:6`). Known build choice accepted: re-reads GET on 409 because the shared `problemOf` drops `current` (one extra request, rare path).
* **Copy met:** subtitle and 409 words exactly §5; 422 shows the server's `detail` (DN4).
* **States:** loading (text status, the PF-6 pages' pattern, not a skeleton: m7), normal, long content (Team watch text wraps), error (422 with issues, failed send, failed load + Try again), conflict, read-only N/A (everyone edits their own). 375 px: table kept, fits, no sideways scroll (m5).

## Standards [M] (relevant lines)
* STANDARDS §4 optimistic concurrency: met (version hash, 409, overlay). Idempotent: one PUT in flight (`busy` ref + disabled Save; DN5 double click → 1 PUT).
* §5 one request per view: met (1 GET; +1 GET only on 409). §6 server authorisation: `@PermissionKeys` on both routes, `me`-scoped; no token 401 (DN API line). Errors RFC 9457 with `fields`: met.
* §7 contract parsed at the edge with zod (`PrefsView`); no `any` in web code; comments say why with numbers; module card row updated. Rule tests fail when the rule goes (spot-check by reading the asserts): overlay removed → DN3 "Work handed to me in app off" fails; untouched-group overlay → "Needs you email off" fails; all groups sent → DN2 `rows()===1` fails; `beforeunload` removed → DN6 fails; axe fail line proves the axe run can fail.
* §9 speed: open from menu 91 ms, Save 93 ms (walk J1).
* EXPERIENCE §1 one primary action (Save), team tokens/components (`Table`, `Notice`, `Button`); §2.1 path shown; §2.12 keyboard path, visible focus, 1024 px and 200 % zoom (720 css px at 2x, no sideways scroll, menu becomes the top row); §4 conflict state drawn; §5 plain words except m3.

## D1–D20
D1 4 every board-A element and BR present, Billing leg of DW1 not walked (m6) · D2 4 stale saves refused, one row per changed group, overlay per group (m2) · D3 N/A no masters · D4 N/A · D5 4 reload, double click, failed send/load recover; 409 with failed re-read misstates (m1) · D6 N/A personal choice, no audit by design (service.ts:7) · D7 N/A no AI · D8 5 menu line, crumb, aria-current · D9 5 tick, Save, done · D10 4 plain words, one raw group code in the 422 list (m3) · D11 5 unsaved count, Default, toast, busy Save, notices · D12 5 aligned matrix, team look (n1, n3 screenshots) · D13 4 axe clean on 5 states and 3 widths, keyboard path, 200 % zoom; focus lost after Save (m4) · D14 5 PlatformFrame + shared controls · D15 5 <100 ms · D16 4 31/31 twice, every rule a pass + fail line, Billing leg missing · D17 simulated only · D18 4 "Default" shows where a value comes from · D19 N/A (part of R1.92, finished by its last part) · D20 simulated only.

## BIC scorecard
N/A as a whole: personal settings, not a case-side screen (concept §4c, EXPERIENCE §6 scope). Spot-checked: BIC-11 Met (one filled Save, named Save; n3) · BIC-13 Partly (server words + issues list, no per-field target in a matrix; m3) · BIC-18 Met (states above; n5 load failed) · BIC-19 Met (one heading, one primary, no red outside errors; r1 1440, r2 1024) · BIC-20 Partly (keyboard, zoom, axe met; focus lost after Save, m4).

## Minors (Should; fix or list with a follow-up row)
1. **m1 409 with a failed re-read says "We've loaded the latest" when nothing loaded.** `notifications-page.tsx:58-60`: the text is set whether or not `current.success`. Walk B1: the old values stay, the next Save is 409 again with the same words. Fix: when the re-read fails, say "Reload the page to see the latest" (or keep the text only on success).
2. **m2 The overlay is per group, so the other tab's change to the other channel of a group the person touched is re-saved back.** Walk B2: tab 2 set Needs you In app off; this tab unticked Needs you Email; after 409 the row shows In app on, Email off and Save writes In app on. It matches challenge m2's "re-apply only the groups the person changed", and the value is visible before saving, so no silent write; still a lost update the standard aims to stop. Fix: overlay per switch (`inApp`/`email` compared with `loaded`) in `overlay` (`notifications-contract.ts:27-30`), or record the group-level choice in build notes.
3. **m3 A role change after load: the 422 shows a raw code and gives no way forward.** Walk B3 (Owner loses OWNER, ticks Firm and connections, Save): "This group cannot reach you, so it has no switches. • FIRM_AND_CONNECTIONS cannot reach you"; every Save is refused until a manual reload. Concept §5 says "the service's `detail`, then reload"; EXPERIENCE §5 no ids on screen. Fix: on 422 re-read GET and overlay (it already drops missing groups), or drop the issues list for this refusal and add "Reload the page".
4. **m4 Focus falls to `<body>` after a successful Save** (the button disables; walk J1 `activeElement` BODY). A keyboard user restarts from the top. Fix: move focus to the hint line or the heading on success (failures already focus the notice, `:34`).
5. **m5 375 px keeps the three-column table** (concept §4 "tables become stacked rows"). It fits with no sideways scroll (n7-375), same deviation as part 1's m-3; record it.
6. **m6 Concept DW1's Billing leg** ("Billing sees Payments with its in-app-only items") is not walked: no Billing Sample user. Add one in the check or name the gap in its header.
7. **m7 No part-3 build notes.** `build-notes.md` is part 1's; the 409 re-read choice, the per-group overlay, loading text instead of a skeleton (module pattern) and the 375 table live only in code comments and the PR. Add a short part-3 section (skill screen-review (6)).

## Graph (P-86)
`graph.mjs` run: G1 0, G2 0, G4 0, G5 0. The graph knows only Studio pages and `C\d+.\d+` capabilities, so `/account/notifications` and R1.92 are invisible to it; the new check visits the page and calls GET/PUT (not listed in G3). No finding.

## Could not check
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); a Billing role (no Sample user); the 409 `current` body use (by design not read).

Reviewer: Approve dc04e9a7f792ed52a86ae73a379b4a964519759b

## Round 2 (diff-only re-review)

Commit reviewed: **b2154d65c641c6eb1bf8f095c7cd99bfe0e260fa**. Read only `git diff dc04e9a7f b2154d65c -- ':!*.png'` (code: `notifications-page.tsx`, `notifications-contract.ts`, `check_pf18s_notifications_browser.ts`; records: `build-notes.md` "Part 3", module row path; the rest are the round-1 records). Check run on isolated pf18snr :4446 (fresh database, `AI_LIVE=off PLATFORM_IDENTITY=local`), **40/40, exit 0**; copy stopped, re-shot PNGs restored. Plus a scratch Playwright probe (outside the repo) of the changed paths, P1-P7 below. US$0, no model call. Journey test: `journey-test-reviewer-part3-2026-11-22.md` "Round 2" (**9.5/10, pass**).

### Verdict: Ship (Approve) for b2154d65c. No Blocker, no Major. Two new Minors, two Nits.

### The breaker's M1 (role change → every Save refused): fixed
* `notifications-page.tsx:58-70`: a 422 now re-reads the view like a 409, overlays the draft (groups that left are dropped) and names the dropped group by its label from the old view (`:65`); the person's other changes stay and the next Save carries the latest version.
* Fail test DN8: the API line proves the same save is refused as a whole (422, nothing written), and the browser lines need "This group no longer reaches you … Payments.", no Payments row, Mentions kept, then a 200 that writes Mentions and no Payments row. On the dc04e9a7f code the old 4xx branch shows "This group cannot reach you …" and keeps Payments, so the browser line fails: the test guards the fix. Run: PASS (demote 200, direct 422). Role restored in `finally` and at setup (a stopped run cannot leave the Case Officer demoted).
* P7 (probe): role restored while the page is open → the next Save's answer brings Payments back to the table.

### Round-1 Minors (mine m1-m7, breaker m1-m5)
| Item | State | Evidence |
|---|---|---|
| R m1 / B m2 failed re-read said "loaded the latest" | Fixed | `:63` danger "We could not load your latest settings: reload the page."; DN8 (break m2) PASS |
| R m2 overlay per group | Fixed | `overlay` per box (`notifications-contract.ts:27-32`); DN3 pure line PASS; P5 browser: other tab Needs you in-app off + my Email off → row off/off, Save writes `NEEDS_YOU:false:false` |
| R m3 / B m1 raw code, only last field | Fixed | issues list removed (only `detail`); a dropped group is named by label; DN8 asserts no `PAYMENTS` in the text |
| R m4 / B m4 focus to `<body>` | Fixed | Save `aria-disabled` + `aria-busy` + "Saving…" while sending, heading (`tabIndex=-1`) after success; DN8 (review m4) PASS; P1: during an 800 ms PUT focus is `BUTTON "Saving…" aria-disabled=true`, Enter + Enter + Space → 1 PUT, after → `H1`, next Tab → the table |
| R m5 375 px table | Recorded | build notes "Kept as is" |
| R m6 Billing leg | Recorded | build notes "Kept as is" (no Sample Billing user); not named in the check header as I asked, the build-notes record is enough |
| R m7 no part-3 build notes | Fixed | `build-notes.md` "Part 3" |
| B m3 "Save again" with nothing to save | Fixed | `:67` "it already matches your changes, so there is nothing left to save"; DN8 (break m3) PASS, Save disabled |
| B m5 stale cached view on return | Fixed | adoption effect `:29` (newer version, nothing unsaved); P3: leave, other tab saves My deadlines in-app off, Back → box unticked, Save disabled |

### New in the fixes
1. **r2-m1 (Minor) The dropped-group notice contradicts itself when the dropped group was the only change.** P2: only Payments Email unticked, role → READ_ONLY, Save → "This group no longer reaches you, so its changes were removed: Payments. We've loaded the latest; **it already matches your changes**, so there is nothing left to save." The change was removed, not matched (`:67-68`: `tail` is chosen without `gone`). EXPERIENCE §5 plain, true words. Fix: when `gone.length && !left`, end with "There is nothing left to save." Save is disabled and focus is on the notice, so nothing goes wrong; wording only.
2. **r2-m2 (Minor) Two of the fixes have no check line.** Focus kept on Save *while sending* (break m4) and the background-view adoption (break m5) work (P1, P3), but no DN line fails if either goes (STANDARDS §7: a rule test fails when the rule goes). DN8's focus line covers only after the Save. Fix: add both lines to the check, or list them in build notes.
3. Nit n-a: while sending, Save takes the grey `aria-disabled` look with no spinner (controls.tsx: a busy primary "keeps its colour and the spinner"), and "Save" → "Saving…" widens the button so the hint line shifts. Accessible and clear; a look difference only.
4. Nit n-b: the adoption effect would take an older view if a mount-time background GET started before a Save finished after it (React Query lets the late fetch overwrite `setQueryData`). Not reproduced: needs a Save within the GET's ~100 ms after coming back (`refetchOnWindowFocus` is off); a later Save would 409 and recover.

Checked and held: the 422 re-read on a non-role refusal keeps the person's boxes and shows the server's words (DN4 PASS); the notice takes focus on 409/422 (P2, P5); no page error in any tab; axe clean 375/1024/1440 (DN7).

### D1–D20 changes from round 1
D5 4 → 5 (409, 422, failed re-read, role change all recover) · D10 4 (raw code gone; r2-m1 wording) · D13 4 → 5 (focus kept while sending and placed after) · D16 4 (40/40, every M1 path a pass + fail line; r2-m2 two fixes untested). Others as round 1.

### Could not check
A real screen reader (the "Saving…" name change while focused is announced or not); an intended user's unaided walk (D17, D20 stay with the founder); a Billing role.

**Verdict: Approve** (no open Blocker or Major; r2-m1, r2-m2 to fix or list).

Reviewer: Approve b2154d65c641c6eb1bf8f095c7cd99bfe0e260fa
