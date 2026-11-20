# Review: R1.26 QA-605, web form on/off on Sales › Settings › Web form (PR #2556)

I am a fresh-context reviewer and did not build this.

- **Commit:** `c3a80a138b0310585dc7703d1a7b8e606891b185` on `claude/blissful-heisenberg-c05ibg`; diff `origin/main...c3a80a138`.
- **Diff size:** 18 files, +153 / -13 (7 of them screenshots).
- **Scope (tech lead's ruling):** the switch only. It is Owner and Admin, uses key `agent/prospect:configure-form`, answers 409 STALE on an old version, and writes one audit line per change with `before`/`after`. Consent wording and thank-you text come in a later part and are not findings.
- **Concept:** FO-4 r2 screen 2b, "On/off … Owner/Admin" (`origin/lead-b-front-office` `screens/fo-4-sales/concept.md:27`).

**Verdict (skill wording): Ship after fixes.** One Major (M1) is open.

## What I ran (exact head, own copies; never :4400, :4527 or :4426; US$0, AI off)
- `check_fo4w_web_form_settings_browser.ts` on `rv_fo4w` :4537, run twice: **45/45 and 45/45**.
- `j_26.ts` on `rv_j26` :4538, run twice: **17/17 and 17/17**. No SQL switches the form: j_26.ts:59 sets `enabled = false`, and W1 switches it on by the screen (j_26.ts:94-99).
- Probe on `rv_probe` :4539 (throwaway script in the session scratchpad):
  - Admin switch: 200, and the audit line names the Admin.
  - Case Manager: 403. Read-only: 403 on both read and switch.
  - Public POST while off: 404 `FORM_NOT_AVAILABLE`.
  - Concurrency: 4 parallel switches on one version, 5 rounds. Each round gave one 200, three 409s and one audit line. A sites save racing a switch gives one 200 and one 409.
  - Odd input: a `null` body gives 400; an array, or a body missing `version`, gives 422; a bad or unknown id gives 404.
  - Browser: keyboard walk at 1024 px; 720 px at scale 2 (200 % zoom); 400 px; double click; two tabs.
- Journey test: `journey-test-reviewer-2026-11-20-qa605.md`, **8.5/10**.
- `graph.mjs`: G1, G2, G4 and G5 are 0.
  - G3 lists `PUT web-forms/:id/enabled` as unreached. The parser misses calls made through the pack's `api()` helper and the page's `staffApi`, as in #2525's review. Not a finding.

## Concept fit and the row's "done when"
- On/off is present for Owner and Admin, saved at once, with the Off pill and the "This form is off" notice.
- A switched-off form refuses the public read and the send.
- The pack covers the pass case: the Owner switches off and on by screens, with one line each, `before`/`after` booleans and the actor (pack :182-195). It covers the fail cases: Read-only 403 (:109), stale 409 on the API (:111) and on the screen (:197-204), 422 bodies, another firm's form 404 (:115), and a same-state call that changes nothing (:117).
- **Rule-removal check (by reading):**
  - Dropping the version compare fails :111.
  - Dropping the key fails :109.
  - Dropping the same-state early return fails :117, because the version changes.
  - Dropping the audit call fails :186 and :195 (the audit count).
- Not met: the switch fails for the firm state that QA-605 names, a new firm (M1).

## Issues, ranked

### M1 Major (Must): switching on a new firm's form answers 500
- **Where:** `api/src/front-office/sales/web-form-settings.ts:128`, the `updateMany`.
- **Cause:** the table has `fo_web_form_consent_check CHECK (NOT enabled OR consent_wording_version_id IS NOT NULL)` (migration `20261114153000_fo1a_front_office_sales/migration.sql:932`). `firm-seed.ts:118` creates every firm's form off and with no wording. `saveEnabled` never checks the rule, so the database refuses the update. The API log shows `DriverAdapterError` and the route answers 500.
- **On screen:** "Something went wrong on the server. Refresh to see the current state, then try again." (`rv-00-newfirm-switch-500`, session scratchpad). Refreshing cannot help.
- **Standards broken:** STANDARDS [M] "Errors as RFC 9457 Problem Details with field-level messages", and EXPERIENCE [M] 8 and 10 (prevent errors; say what happened and how to fix it).
- **Why the tests miss it:** both suites set the wording by SQL before switching (pack :41, j_26.ts:59). j_26's header claim "it starts off, as a new firm's does" (j_26.ts:5-6) is therefore not quite true.
- **Fix:**
  1. Inside the lock, when `enabled` is true and the row has no `consentWordingVersionId`, return 422 with field `enabled` in plain words. For example: "Choose the consent wording first: the form cannot go on without it."
  2. The screen shows those words on the switch. Better still, read the wording state in `GET web-forms` and explain before the press.
  3. Add a pack fail case with the wording null: 422, nothing stored, no audit line.

  This keeps consent wording itself out of scope.

### m1 Minor (Should): keyboard focus is lost after the switch
- **Where:** `web/src/modules/front-office/sales/web-form-settings-page.tsx:126`. `busy` disables the button (`controls.tsx:36`), so the focused button drops focus to `<body>`.
- **Evidence:** in the probe, `document.activeElement` was the body after Space on the switch at 1024 px.
- **Standards:** EXPERIENCE [M] 12 and BIC-20 (keyboard path, visible focus).
- **Fix:** keep focus on the switch. Either use `aria-disabled` while busy instead of `disabled`, or refocus the button when the request ends. The pack's keyboard step (:205-207) should assert focus afterwards.

### m2 Minor (Should): the sites STALE words are now inaccurate
- **Where:** `web-form-settings.ts:98`.
- **Problem:** after this PR a switch also makes a new version. A sites save in another tab then says "Someone else changed this form's sites…" when only on/off changed (probe, two tabs).
- **Fix:** use the switch's wording: "Someone else changed this form since you opened it…".

### m3 Minor (Should): the off-state send door is not tested here
- **Where:** pack :187-188 and j_26.ts:95-96 probe only `GET /api/public/forms/:token`. The tech lead's scope says "refuses public sends".
- **Fix:** add one `POST …/submissions` while off, expecting 404 `FORM_NOT_AVAILABLE`. The probe confirms it works.

### Considered, not findings
- Switching off has no confirm step. One press reverses it and the effect is shown, so "undo where possible" is met.
- Audit `before`/`after` are booleans. That is the whole changed state, and the line holds no personal data.
- The Sites reset effect is now keyed on the stored list (page :52-54). I checked it: a Reload after a sites STALE caused by someone else's list still resets the rows, and typed rows survive a switch.

## Standards [M] lines touched
| Line | Status | Evidence |
|---|---|---|
| Optimistic concurrency, 409 STALE | Met | pack :111, :197-204; 5-round race |
| Server authorisation, deny by default | Met | Read-only, Case Manager and Case Officer 403; nobody 401; Admin 200 |
| Problem Details with field messages | **Not met** | M1 (500 with no field) |
| Firm scope / another firm 404 | Met | pack :115; the lock and every read use `firmScope` |
| Comments say why, with numbers | Met | `web-form-settings.ts:11-15` cites QA-605 and the ruling |
| EXP 8, 10 (prevent errors, say how to fix) | **Not met** | M1 |
| EXP 12 / BIC-20 (keyboard, 1024 px, 200 %) | Partly | Keyboard path and sizes are fine; focus is lost (m1) |

**Retrofit mapping:** recorded in `MODULE.rows/QA-605.md`, `sales/README.md`, the `routes.ts` header and `qa/built/R1.26.md`.

## D1–D20 (1–5)
D1 4 (switch built; M1) · D2 5 (lock, version, one winner, no-op on same state) · D3 5 (same view, same SELECT) · D4 N/A · D5 4 (double click one change; stale → Reload; M1 dead end) · D6 5 (one line, actor, before/after) · D7 N/A · D8 5 (crumb, active menu) · D9 4 · D10 4 (m2) · D11 4 (pill, notice, busy; the 500 text, M1) · D12 5 (`qa605-01/02`) · D13 4 (axe 0, sizes fine; m1) · D14 5 (team controls) · D15 5 (40 ms) · D16 4 (pass and fail cases; M1 and m3 untested) · D17 simulated only · D18 5 · D19 3 (by screens only once the wording is set underneath) · D20 simulated only.

## BIC (EXPERIENCE §6; this is a sales settings screen, not case-side, so most checks are N/A)
| Check | Status | Evidence |
|---|---|---|
| BIC-13 errors say what and how to fix | Partly | Stale words and Reload are good; the new firm gets a generic 500 (M1) |
| BIC-14 help in place | Met | The effect sentence sits under "On or off"; no icon-only control |
| BIC-20 accessible, keyboard-complete | Partly | `qa605-01/02` at 1440, `rv-02` at 1024, `rv-03` at 200 %; focus lost (m1) |
| BIC-01–12, 15–19 | N/A | No case facts, documents, AI, roles, review or filing on this screen |

## Could not check
A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).

Reviewer: Changes requested
