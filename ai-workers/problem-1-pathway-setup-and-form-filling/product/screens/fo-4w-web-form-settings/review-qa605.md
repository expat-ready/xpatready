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

---

## Re-review at `1a571ee7bc2d4998f55f1f7aa93bd3a3c4295032` (diff `c3a80a138..1a571ee7b`; c8d34e9 is screenshots only)

I did not build this. I read only the fixes, then reran everything on my own copies (:4537, :4538, :4539). Never :4400, :4527 or :4426. US$0, AI off. The screenshots were restored with `git checkout` afterwards.

**Runs**
- `check_fo4w_web_form_settings_browser.ts`: **47/47 twice**.
- `j_26.ts`: **17/17 twice**.
- My probe again, on a fresh copy:
  - New firm (no wording) presses "Switch the form on": the screen shows the plain reason, the form stays off, no 500.
  - Admin 200; Case Manager and Read-only 403; send while off 404.
  - Race, 5 rounds: one 200 and three 409s each, one audit line each.
  - Keyboard at 1024 px: after Space, focus is on `BUTTON: Switch the form off`.
  - 200 % zoom and 400 px: no sideways scroll; axe 0; no page errors.

**Each finding**
- **M1 → closed.**
  - `web-form-settings.ts:132-135` checks the wording inside the row lock, after the version and same-state checks. With none, it returns 422 `NO_CONSENT_WORDING`, with the reason on `enabled`. `unprocessable` throws, so the transaction rolls back and no audit line is written.
  - The screen shows the field text (`web-form-settings-page.tsx:120`; `qa605-00-no-wording-1440`).
  - Tests: pack :123 (API: 422, still off, no line) and :161 (screen: the message, no "Something went wrong").
  - Rule-removal check: without the guard the database refuses the update and returns 500, so :123 fails.
  - j_26's header no longer claims the form starts as a new firm's.
- **m1 → closed.** Focus returns in `finally` (`web-form-settings-page.tsx:123`). The pack's keyboard step now waits for focus on the switch (:223), and my probe confirms it.
- **m2 → closed.** The sites STALE words now say "this form" (`web-form-settings.ts:100`). Probe: a sites save in tab B after tab A's switch reads "Someone else changed this form since you opened it". The pack expectations were updated to match.
- **m3 → closed.** A POST to `…/submissions` while off returns 404 `FORM_NOT_AVAILABLE` (pack :203-204, j_26.ts:97-98).

**New, Minor (Should; not blocking):**
- **m4: the switch is still offered on a form that cannot go on yet.**
  - **Where:** `web-form-settings-page.tsx:130`.
  - **Problem:** EXPERIENCE [M] 8 says "prevent errors before messaging them". The refusal is honest and plain, and the wording screen is the later part (out of scope), so this is not blocking.
  - **Fix:** when the wording part lands, return whether the form has a wording in `GET web-forms`, then explain beside the switch instead of after the press.

**Scores changed**
- D1 5 · D5 5 · D11 5 · D13 5 · D16 5.
- D19 stays 3: a firm still needs its wording set underneath, by scope.
- Journey: **9.5/10**. "Error recovery" and "accessibility and screen sizes" move from ½ to 1. "Task completed" stays ½ because a new firm cannot go on until the wording part exists.

**Open:** no Blocker and no Major. One Minor (m4).

Reviewer: Approve 1a571ee7bc2d4998f55f1f7aa93bd3a3c4295032

---

## Re-review at `8fb9274c769ec82b56869bd8d295f2935f28e9ef` (diff `41cec86e4..8fb9274c7`; 41cec86e4 is a pure merge of origin/main)

**What I ran**
- The pack on my own copy (:4537): **48/48**. This includes the new "transition held at its midpoint" axe step.
- A focus probe on :4538. Owner at 1024 px; six switches alternating keyboard (Enter or Space) and mouse; then the stale path. Each read of `document.activeElement` is taken 1 s after the "Switched…" message. Chrome CPU throttling at 1x, 4x and 8x, the slow-runner condition this fix itself uses as evidence.
- Screenshots restored with `git checkout`.

**What holds**
- **Audit line.** `web-form-settings.ts:143-144` passes the port's top-level `before: { enabled }` / `after: { enabled }`. On main (`ports/audit.ts:44-53`, `audit-event.ts:61`) these are stored as `enabled_before` / `enabled_after`, the shape the Activity log reads. `detail` no longer carries a `before`/`after` the port's refine would refuse. The tests read the new keys (pack :208, :218; j_26.ts:101).
- **Contrast.** Keying the switch (`web-form-settings-page.tsx:132`) removes the secondary-to-primary animation. The pack now holds every transition at its midpoint and runs axe (pack :202-207), so a test fails if the animation comes back. Brand tokens are unchanged.

**Changes requested: M2 Major (Must). Focus restore is racy: focus is lost on a slow CPU, and the pack's focus check will flake there.**
- **Where:** `web/src/modules/front-office/sales/web-form-settings-page.tsx:123`. `requestAnimationFrame(() => button.current?.focus())` in `finally` runs on a timer, not after React's commit.
- **Why it races:** when the frame comes before the commit, `button.current` is still the old button, disabled while busy (or about to unmount, now that it is keyed, :132). The focus call does nothing and focus stays on `<body>`.
- **Probe results:**

| CPU | Focus kept after a switch | Stale path |
|---|---|---|
| 1x | 6 of 6 | on the button |
| 4x | 6 of 6 | on the button |
| 8x, run 1 | 2 of 6 (both key presses lost) | on the button |
| 8x, run 2 | 3 of 6 | on `<body>` |

- The stale path does not remount, so the race predates the key change and was already in 1a571ee. I approved that commit without throttling.
- **Impact:**
  - A keyboard user loses their place again on a slow machine (EXPERIENCE [M] 12, BIC-20).
  - The pack's assertion `waitForFunction(activeElement … "Switch the form off")` at pack :231 waits 5 s for a focus that never arrives. On the slow CI runner that caught the contrast failure, it will fail intermittently and stall the merge queue.
- **Fix:** move the focus to after the commit.
  1. In `finally`, set a `refocus` ref to true. Remove the rAF.
  2. Add `React.useEffect(() => { if (!busy && refocus.current) { refocus.current = false; button.current?.focus(); } }, [busy, form.enabled])`. Effects run after the commit, so the new keyed button is mounted and enabled.

  Rerun the pack's keyboard step with Chrome's CPU throttled 8x, via CDP `Emulation.setCPUThrottlingRate` (the way the contrast step now holds transitions), so it fails on the old code and passes on the fixed code.

**Open:** M2 (Major). Earlier m4 stays Minor.

Reviewer: Changes requested

---

## Re-review at `f295b3db950b2635381279ae37ffdd1b0186341c` (diff `8fb9274c7..f295b3db9`)

**M2 → closed.**
- **The fix:** `finally` now only sets `refocus.current = true` and `setBusy(false)`. An effect on `[busy, form.enabled]` focuses `button.current` after React's commit (`web-form-settings-page.tsx:113-114`, `:127`). It runs once the new keyed button is mounted and enabled. The stale path is covered because `busy` changes there too.
- **The test:** the pack's keyboard step now makes five Enter presses with Chrome's CPU throttled 8x via CDP. After each press it records `activeElement` (pack :231-241). A lost focus makes the next label wait fail, so the test can no longer pass silently.
- **My runs (own copies; screenshots restored with `git checkout`):**
  - Pack on :4537: **48/48**. `kept` was on the new switch all five times.
  - My focus probe on :4538: CPU 1x, 2x, 4x, 8x, 8x and 12x, six switches each (keyboard and mouse alternating), plus the stale path. Focus was on the new switch **42 of 42** times. At 8fb9274 it was lost 3 or 4 times in 6 at 8x.
- **Note, not a finding:** TanStack Query 5.101 sends `setQueryData` to subscribers on a `setTimeout(0)`. In principle `busy = false` could commit before the new state, which would spend `refocus` on the old button. It never happened in 48 throttled presses up to 12x, and the pack would catch it. If it ever shows, clear `refocus` only when the button's label matches `form.enabled`.

**Open:** no Blocker and no Major. m4 (the switch offered before a wording exists) stays Minor.

Reviewer: Approve f295b3db950b2635381279ae37ffdd1b0186341c

---

## Re-review at `b3d63580dd135520160ba5d9661c2777e07cde3c` (diff `57c233b35..b3d63580d`; 57c233b is a type cast plus PNGs, approved)

**The change:** `refocus` now holds the version the press produced. On success that is `saved.version`; after a refusal it is the unchanged `form.version`. The effect on `[busy, form.version]` focuses only when `!busy` and the version matches (`web-form-settings-page.tsx:116`, `:130`). This closes the cache-tick race in my f295b3d note: if `busy = false` is drawn first, nothing is spent, and focus fires when the new keyed button arrives.

**Edge cases, by reading:**
- A refusal (422 or 409) focuses at once.
- If a background refetch moves the version during a refusal, `refocus` keeps a stale value that can never match again. That is harmless.

**My runs (screenshots restored with `git checkout`):**
- Pack on :4537: **48/48**, including the five throttled Enter presses.
- Focus probe on :4538 at CPU 1x, 8x and 12x: **21 of 21** focused on the new switch, including the stale path.

**Open:** no Blocker and no Major. m4 stays Minor.

Reviewer: Approve b3d63580dd135520160ba5d9661c2777e07cde3c
