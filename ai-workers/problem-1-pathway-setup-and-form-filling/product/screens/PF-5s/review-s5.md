# Review — PF-5s S5 Firm profile (R1.92), PR #3201

Reviewed head `2f44fe25e45ab75e5c0a949496414d0013ca7310`, `git diff origin/main...2f44fe25e`, on 23 Nov 2026. The reviewer did not build this screen.

**Spec:** step 2 of the hand-over on #3173, which outranks concept S5 where they differ.
**Evidence:** isolated copy `pf5srev` on :4748, never :4400, US$0. The builder's suite gave **22/22 twice**; j_92 W1 PASS, W6 fails only on #3173's part (19/20); my walk `journey-test-reviewer-s5-2026-11-23.md` scores **8.5/10, Pass**.

## Verdict: Ship after fixes (Changes): 0 Blockers, 1 Major, 9 Minors
The page meets every hand-over line: read-only firm fields; Owner and Admin edit the six details; the billing email is the Owner's alone (an Admin's PUT gets 403); the version on every save, a 409 reloads; each refusal on its own field; an IANA picker labelled "Time zone".

One [M] engineering line is not met at this head (M1): small, but CI will block the PR on it.

**Known deviation (one inline form, not a right panel per section): accepted.**
- EXPERIENCE §2.3's drawer exists so that a page keeps its scroll, filters, selection and expansion. This page has none of those to protect: one record, seven fields.
- One form with one Save is the usual settings pattern, takes fewer clicks than four panels, and keeps j_92 W1 direct.
- The hand-over's field list also replaces the concept's sections, so a panel per section would not fit anyway.
- The header's reason ("two panels racing for one version") is weak, because only one panel is ever open at a time. Record §2.3's purpose instead (m1).

**Admin sees the billing email (the API's break m1).** The hand-over says "null and hidden for other readers"; the API on main sends it to Admins too (`service.ts:120-123`).
The page follows the server (text plus "Only the Owner can change this.", never a field); the wording gap is the tech lead's to settle, not a page defect. The address shown to Admins agrees with concept M5.

## D1–D20 (independent reviewer, browser and script)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | Every hand-over line is met; the concept's trial summary line is not drawn (m4) |
| D2 Data integrity | 5 | Version + `FOR UPDATE` (409 on a stale save); a double click sends one PUT; a refusal writes nothing; 403s on the server |
| D3 Reuse | 4 | Shared `allZones` (as the Offices panel), house controls, web contract file as offices/support |
| D4 Rule integrity | N/A | No configuration rules |
| D5 Stability and recovery | 3 | A 409 drops the person's typed edits but says "save again" (m2); no leave guard (m5) |
| D6 Governance | 4 | One `platform.setting.change` line per key; one `billing_email_changed` line (database read) |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 5 | "My account › Firm profile" breadcrumb, menu item highlighted |
| D9 Flow | 4 | One form, one Save; "Go to Plan and billing" next to the address |
| D10 Language | 4 | Plain labels and hints; field errors are lower-case fragments (m3) |
| D11 Feedback and state | 4 | Unsaved line, busy Save, toast, notice; loading is text, not a skeleton (m6) |
| D12 Visual quality | 4 | Three calm cards, team tokens, one filled button; the 375 px screenshot is stale (m7) |
| D13 Accessibility | 4 | axe clean at 375/1024/1280/1440/200 %, keyboard path; focus lost after Save; Save 36 px at 375 (m8) |
| D14 Team look | 4 | Platform frame, house controls, account-menu words |
| D15 Speed | 5 | 166 ms first view, 243 ms save, one GET per view |
| D16 Testability | 4 | A pass and a fail per rule, 22/22 twice; FP5 gap (m9); card row missing (M1) |
| D17 First use / D20 Pain and wow | simulated only | No intended user or founder walk yet |
| D18 Provenance | 4 | Legal fields say who changes them; the address says where it is changed and why |
| D19 End-to-end | 4 | R1.92 W1 passes; W6 waits on #3173 |

## BIC scorecard (EXPERIENCE §6; concept 4c chose it)
Evidence: my steps J1–J8 at 1440 and 1024 px, and the builder's 1280 and 375 px screenshots.

| Check | Score | Evidence |
|---|---|---|
| BIC-01 | Met | Address read here, changed only on Billing; trading name and country carried from sign-up |
| BIC-02 | Met | Only the fields the hand-over and the API name |
| BIC-04 | Partly | "Leave empty for none" on three fields; nothing marked "(optional)"; the billing email cannot be emptied (an API matter) |
| BIC-11 | Met | One filled "Save"; "Undo changes" is a ghost button |
| BIC-13 | Partly | Words on each field, `aria-invalid`, focus on the first error; the summary repeats no words and has no links (m3) |
| BIC-14 | Met | No chips or icon-only buttons; help a person needs is in visible hints |
| BIC-18 | Partly | Saved, failed and read-only states visible and say why; loading is text, not a skeleton (m6) |
| BIC-19 / BIC-20 | Met | One heading and at most one primary per card; keyboard path, 200 %, no sideways scroll |
| BIC-03, 05–10, 12, 15–17 | N/A | No dependent facts, AI, people, filing, review or task list |

UXL (§7, 1280 and 375 px): Met on 01–08 and 10–14. **UXL-09 Not met** (m8).

## [M] lines
**Met:** §4 optimistic concurrency (409 with the latest); §5 one request per view; §6 server authorisation, deny by default (Case Officer PUT → 403, Admin billing email → 403); §6 Problem Details shown on each field; §7 no `any` in the page, axe on every state; EXPERIENCE §2.1 path, §2.10 errors on the field, §2.12 accessible, §4 conflict and read-only states.

**Not met:** §7 module card (M1); EXPERIENCE §4 loading skeleton (m6); §2.3 is a recorded deviation, accepted above.

**Retrofit mapping:** none recorded (m1).

## Issues, ranked
1. **Major M1 (Must): the module card is not updated.** `module-cards.py pr` on this diff and the PR body gives `FAIL update the card(s) in this PR, or put "Card unchanged: <reason>"` (web-shell: 4 files under `web/src/modules/**`).
   - Fix: add `web/src/MODULE.rows/<row>.md`, as PF-5s1/PF-5s2 did, with `Tests: tests/check_pf5s_firm_profile_browser.ts` and the entry point (`/platform/firm-profile`, menu "Firm profile", `agent/settings:list`).
2. **Minor m1:** write the inline-form deviation, its reason (§2.3's purpose) and a retrofit line in the PR body, as the page header claims (`firm-profile-page.tsx:10-11`).
3. **Minor m2: a 409 replaces the whole form** (`firm-profile-page.tsx:79-83`). The Owner's typed phone and currency vanished, yet the words say "check them and save again", and Save then says "No changes to save".
   - Fix: re-apply `changesOf(start, f)` on top of the latest, or say "Your changes were not kept: enter them again."
4. **Minor m3 (BIC-13): field words are the server's fragments** ("an email address like office@firm.ca"); the summary names no field. Fix: list each field's label and words in the notice, linked to the field.
5. **Minor m4: concept S5's summary line "Free trial ends 28 Nov. Add your business address before then." is not drawn.** Only the missing-address hint shows. Fix: draw it, or record the omission with the deviation.
6. **Minor m5: leaving by the menu with unsaved edits drops them without a warning.** Fix: a leave guard while `dirty`.
7. **Minor m6:** loading is the text "Loading the firm profile…" (`:62`), not a skeleton (EXPERIENCE §4).
8. **Minor m7:** `screenshots-s5/pf5s-s5-owner-375.png` shows the old hint "New invoices and fees start in this currency."; the head says "Your firm's default currency." Re-take the screenshots at the head.
9. **Minor m8 (UXL-09, WCAG 2.4.3):**
   - Save is about 36 px tall at 375 px.
   - After a successful Save, focus falls to `<body>`, because the shared `Button` is disabled while busy (`components/ui/controls.tsx:36`).
   - Fix: focus the heading or Save afterwards; use a 44 px primary at 375 px.
10. **Minor m9 (STANDARDS §7): FP5's "never carries the billing email" would pass if `changesOf` sent every field,** because the server lets an unchanged value through (break m6). Fix: assert on the PUT body.

## Could not check
- **Graph (P-86):** `graph.mjs` ran (G1 0, G4 0). It indexes neither module pages nor `api/src/platform/**` controllers, so neither the page nor its route appears with a test. `features/platform-firm-profile.ts` shows as G6 "dead": a false positive already on main.
- No real screen reader; no intended user's walk; the "Not available" state (every role holds `agent/settings:list`); PR CI (the PR is a draft).

Reviewer: Changes 2f44fe25e45ab75e5c0a949496414d0013ca7310
