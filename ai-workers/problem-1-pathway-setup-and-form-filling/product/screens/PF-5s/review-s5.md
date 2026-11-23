# Review — PF-5s S5 Firm profile (R1.92), PR #3201

Reviewed head `2f44fe25e45ab75e5c0a949496414d0013ca7310`, `git diff origin/main...2f44fe25e`, on 23 Nov 2026. The reviewer did not build this screen.

**Spec:** step 2 of the hand-over on #3173, which outranks concept S5 (`pf-5s-saas/concept.md` on `lead-b-front-office`) where they differ.
**Evidence:** isolated copy `pf5srev` on :4748, never :4400, US$0.
- The builder's suite gave **22/22 twice**.
- j_92: W1 PASS; W6 fails only on #3173's part (19/20).
- My own walk: `journey-test-reviewer-s5-2026-11-23.md`, **8.5/10, Pass**.

## Verdict: Ship after fixes (Changes): 0 Blockers, 1 Major, 9 Minors
The page does what the hand-over asks, and the server-side behaviour I tried held:
- Read-only firm fields.
- Owner and Admin edit the six details; the billing email is the Owner's alone (an Admin's PUT gets 403).
- The version is sent on every save; a 409 reloads the latest.
- Each refusal shows on its own field.
- An IANA zone picker labelled "Time zone".

One [M] engineering line is not met at this head (M1). The PR cannot merge until it is fixed, and the fix is small.

**Known deviation (one inline form instead of a right panel per section): accepted.** EXPERIENCE §2.3 asks for a drawer so that the page keeps its scroll, filters, selection and expansion. This page has none of those to protect: it is one record with seven fields. One form with one Save is the usual settings pattern, takes fewer clicks than four panels, and keeps j_92 W1 direct.
- The reason given in the page header ("two panels racing for one version") is weak, because only one panel is ever open at a time. The real reason is that §2.3's purpose does not apply here.
- The deviation must be written in the PR body (m1).
- Also, the hand-over's own field list replaces the concept's sections (no owner contact; legal name read-only; address changed on Billing), so a panel per concept section would not fit anyway.

**Admin sees the billing email (the API's break m1).** The hand-over says the billing email is "null and hidden for other readers". The API on main sends it to Admins as well (`service.ts:120-123`), and the page shows it to an Admin as text with "Only the Owner can change this."
- The page follows the server and never offers an Admin a field.
- The gap between the hand-over's wording and the API is for the tech lead to settle. It is not a page defect.
- The business address shown to Admins agrees with concept M5.

## D1–D20 (independent reviewer, browser and script)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | Every hand-over line is met. The concept's summary line (trial end and address) is not drawn (m4) |
| D2 Data integrity | 5 | Version + `FOR UPDATE` (409 on a stale save); a double click sends one PUT; a refusal writes nothing; 403 on Case Officer and Admin-billing writes |
| D3 Reuse | 4 | Shared `allZones` (same list as the Offices panel), house `Field`/`Select`/`Notice`, web contract file as offices/support |
| D4 Rule integrity | N/A | No configuration rules on this screen |
| D5 Stability and recovery | 3 | Reload and network failure are fine. A 409 drops the person's typed edits but says "save again" (m2); no leave guard (m5) |
| D6 Governance | 4 | One `platform.setting.change` line per changed key, one `billing_email_changed` line (database read) |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 5 | "My account › Firm profile" breadcrumb; the menu item is highlighted |
| D9 Flow | 4 | One form, one Save; "Go to Plan and billing" next to the address |
| D10 Language | 4 | Plain labels and hints. Field errors are the server's lower-case fragments (m3) |
| D11 Feedback and state | 4 | Unsaved line, busy Save, toast, problem notice. Loading is text, not a skeleton (m6) |
| D12 Visual quality | 4 | Three calm cards, team tokens, one filled button. The 375 px screenshot is stale (m7) |
| D13 Accessibility and screen sizes | 4 | axe clean at 375/1024/1280/1440/200 %; keyboard path. Focus falls to body after Save; Save is 36 px at 375 (m8) |
| D14 Team look | 4 | Platform frame and house controls; words match the account menu |
| D15 Speed | 5 | 166 ms first view, 243 ms save, one GET per view |
| D16 Testability | 4 | A pass and a fail per rule; 22/22 twice by me. FP5's "never carries the billing email" would still pass if every field were sent (m9). Module card row missing (M1) |
| D17 First use | simulated only | No intended user walked it |
| D18 Provenance | 4 | Legal fields say who changes them; the address says where it is changed and why |
| D19 End-to-end | 4 | R1.92 W1 passes; W6 waits on #3173 |
| D20 Pain and wow | simulated only | Founder's walk |

## BIC scorecard (EXPERIENCE §6; concept 4c chose it)
Evidence: my steps J1–J8 at 1440 and 1024 px, and the builder's 1280 and 375 px screenshots.

| Check | Score | Evidence |
|---|---|---|
| BIC-01 | Met | The address is read here and changed only on Billing; trading name and country are carried from sign-up |
| BIC-02 | Met | Only the fields the hand-over and the API name |
| BIC-04 | Partly | "Leave empty for none" on phone, email and website; nothing marked "(optional)". The billing email cannot be emptied (an API matter) |
| BIC-11 | Met | One filled "Save" per page; "Undo changes" is a ghost button |
| BIC-13 | Partly | Words on each field with `aria-invalid` and focus on the first error. The summary does not repeat the words or link to the fields (m3) |
| BIC-14 | Met | No chips or icon-only buttons; the help a person needs is in visible hints |
| BIC-18 | Partly | Saved, failed and read-only states are visible and say why; loading is text, not a skeleton (m6) |
| BIC-19 | Met | One heading and at most one primary per card; red only for errors |
| BIC-20 | Met | Keyboard path, 200 % zoom, no sideways scroll; focus after Save is a Minor (m8) |
| BIC-03, 05–10, 12, 15–17 | N/A | No dependent facts, AI, people, filing, review or task list |

UXL (§7, 1280 and 375 px): Met on 01–08, 10–14. **UXL-09 Not met:** Save is about 36 px tall at 375 px, under 44 px (m8).

## [M] lines (STANDARDS / EXPERIENCE)
**Met:**
- §4 optimistic concurrency (409 with the latest).
- §5 one request per view.
- §6 server authorisation, deny by default (Case Officer PUT → 403; Admin billing email → 403).
- §6 Problem Details with per-field messages, shown on each field.
- §7 no `any` in the page; comments give their numbers.
- §7 axe on every state (Owner, Case Officer, Admin, errors, conflict, 375 px).
- EXPERIENCE §2.1 path; §2.10 errors on the field; §2.12 accessible; §4 conflict and read-only states.

**Not met:**
- §7 module card (M1).
- §2.3 drawer: a recorded deviation, accepted above.
- §4 loading skeleton (m6).

**Retrofit mapping:** none recorded. The page follows the house platform pages (offices, branding). Nothing is compared with the team's AG-01 §3.1 screen (m1).

## Issues, ranked
1. **Major M1 (Must): the module card is not updated.** `module-cards.py pr` on this diff and the PR body gives `FAIL update the card(s) in this PR, or put "Card unchanged: <reason>"` (web-shell).
   - Why it matters: four `web/src/modules/**` files changed, with a new entry point and a new test. The sibling rows did this with `web/src/MODULE.rows/PF-5s1.md` and `PF-5s2.md`.
   - Fix: add `web/src/MODULE.rows/<row>.md` with `Tests: tests/check_pf5s_firm_profile_browser.ts` and the entry point (`/platform/firm-profile`, menu "Firm profile", `agent/settings:list`).
2. **Minor m1 (Should):** write the inline-form deviation and its reason (§2.3's purpose) in the PR body, as the page header already claims (`firm-profile-page.tsx:10-11`). Add a line on retrofit.
3. **Minor m2 (Should): a 409 throws away the person's typed edits but still says "check them and save again".** `firm-profile-page.tsx:79-83`: the Owner's phone and currency vanished; Save then says "No changes to save".
   - Fix: re-apply `changesOf(start, f)` on top of the latest profile, or add "Your changes were not kept: enter them again."
4. **Minor m3 (Should, BIC-13): field errors read as fragments** ("an email address like office@firm.ca"). The summary "Please check the highlighted details." names no field.
   - Fix: list each field's label and words in the notice, linked to its field. The field text can stay as the server sends it.
5. **Minor m4 (Should, concept S5 layout): the summary line "Free trial ends 28 Nov. Add your business address before then." is not drawn.**
   - Today only "Not added yet. Needed before your first invoice…" shows, and only when the address is missing.
   - Fix: add the trial line, or record its omission with the deviation.
6. **Minor m5 (Should, D5): leaving by the menu with unsaved edits drops them without a warning.** Fix: a leave guard while `dirty`.
7. **Minor m6 (Should, EXPERIENCE §4 / BIC-18): the loading state is the text "Loading the firm profile…"**, not a skeleton (`:62`).
8. **Minor m7 (Should): stale evidence.** `screenshots-s5/pf5s-s5-owner-375.png` shows the old currency hint "New invoices and fees start in this currency."; the page at head says "Your firm's default currency." Fix: re-take the screenshots at the head.
9. **Minor m8 (Should, UXL-09 / WCAG 2.4.3):**
   - Save is about 36 px tall at 375 px.
   - After a successful Save, focus falls to `<body>`, because the shared `Button` is disabled while busy (`components/ui/controls.tsx:36`).
   - Fix: focus the heading or Save after the save; use a 44 px primary at 375 px.
10. **Minor m9 (Should, STANDARDS §7: the test fails when the rule is removed).** FP5 asserts "never carries the billing email", but it would pass if `changesOf` sent every field: the server lets an unchanged billing email through (break m6). Fix: assert on the PUT body in FP5.

## Could not check
- **Graph (P-86):** `graph.mjs` ran (G1 0, G4 0). It indexes neither module pages (`/platform/firm-profile`) nor `api/src/platform/**` controllers. So neither the page nor `GET|PUT /api/platform/firm/profile` appears, and the graph cannot name their tests. `api/src/features/platform-firm-profile.ts` shows as G6 "dead": a false positive already on main.
- No real screen reader; no intended user's walk (D17, D20).
- The "Not available" state: every role holds `agent/settings:list`.
- PR CI: the PR is a draft, so only the guard runs.

Reviewer: Changes 2f44fe25e45ab75e5c0a949496414d0013ca7310
