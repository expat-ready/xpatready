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
