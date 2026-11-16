# Review: FO-3w part 1, the public booking pages (PR #1921): re-review at 003e49c33

Reviewer: Opus 5.5, effort high, fresh context (did not build it). Skill `screen-review`. Journey test: `journey-test-reviewer-fo3w-part1-2026-11-16.md`, **8/10** at 52d96246d. The fixes below lift error recovery and accessibility to 1 each, so **9/10 at this head**.
**First review:** 52d96246d, verdict Block. **Re-review:** the diff only, `git diff 52d96246d..003e49c33 -- …/prototype`. Five files changed: `type-page.tsx`, `time.ts`, `contract.ts`, `frame.tsx` and the test. Date 16 Nov 2026, ~10:00 IST.
**The bar:** brief `lead-b-briefs/FO-3w.md` with A1 (P-626-order.md) and P-629; concept `fo-3-booking` r2 §3 BR-1..BR-7 and BR-11, §4 Public, §5 and §6.

**Verdict: Approve.** Every Major from the first review is fixed, each with a check that fails without its fix. CI's `pr-rules` and `module-cards` are green on this head. Four new Minors and the earlier Shoulds remain; none blocks.

## Re-run at 003e49c33 (ports 4545 and 4845-4846; never :4400)
- **Suite:** `check_fo3w_booking_browser.ts` 65/65, exit 0, on a fresh copy. I rebuilt `web/dist` at this head and ran from a scratch worktree, so no shared-tree file was touched.
- **My walks, repeated on the same copy:**
  - Zone dialog at 360 px: Close 44 × 44; "Use this zone" 126 × 44; input 286 × 44.
  - axe (WCAG 2.2 tags) on the dialog finds nothing.
  - 200 % zoom at 1024 and 1440: no sideways scroll.
  - No console or page error.
  - The two-tab slot-taken journey and the Persian and long names still hold.
- **DW11:** passed at 52d96246d (PF-1 28/28, FO-4 45/45). Not re-run: the diff touches neither `routes.tsx` nor any shared file.

## First review's findings
| Id | Status | Evidence at 003e49c33 |
|---|---|---|
| R1: dialog targets under 44 px | **Fixed** | The picker has its own Radix dialog (`type-page.tsx:82-99`), Close and the button `min-h-11 min-w-11` / `h-11`; `controls.tsx` untouched. The test's `small()` now covers `[role=dialog]` with the dialog open (`check_fo3w…:272-276, 283-287`). |
| B-M1: zone change hid times at the month's edge | **Fixed** | The zone is in the query key (`type-page.tsx:34`). A keyboard change to London fetched once with `tz=Europe/London`, and the labels redrew. New check: Dubai → Toronto still shows Mon 30 Nov 16:30. That instant is past Dubai's month end, so the check fails without the fix. |
| B-M2: picker took zones the server refuses | **Fixed** | `realZone`, `browserZone` and `allZones` keep only the server's shape (`time.ts:8-15`). Factory, +05:30 and Etc/GMT+14 are refused on the field. |
| B-M3: a lost answer showed nothing | **Fixed** | A failed `fetch` becomes Problem status 0 (`contract.ts:42-44`), and the catch guards the shape (`type-page.tsx:185`). Aborted POST → "We could not take this booking. Please try again.", answers kept, no page error. |
| m1: focus dropped to BODY | **Fixed** | Each step's h1 takes focus when it replaces another (`useHeadingFocus`, `type-page.tsx:64-69`). Walk: after choosing a time, focus is on "Your details"; after Back, on "Choose a time". Escape, Close and "Use this zone" return focus to "(change)", as the Trigger should. |
| m2: undeclared strings | **Declared** in the PR body for concept §5. |
| m3: `title` tooltip | Left as a Should, as the PR states (BIC-14 Partly). |
| m4: header 16 px off | **Fixed** (`frame.tsx:12-13`). |
| m5: J-P2 fail did not check the zone | **Fixed** (`check_fo3w…:143`). |
| CI body | **Fixed:** `pr-rules` and `module-cards` succeed on 003e49c33. |

Also in the diff, and checked:
- Names are wrapped and wrapped in `<bdi>` (breaker m3, m4).
- A later error keeps the page drawn (breaker m8). Walk: a month load aborted → the grid and h1 stay, with "We could not load the times. Please try again." above them.
- Breaker M4 (Reschedule and Cancel lead to a dead end until part 2) is answered in the PR with the brief's split. Accepted.

## New Minors (Should; none blocks)
- **n1. A failed month says both "could not load" and "No free times in December. Try the next month."** Cause: `type-page.tsx:146` draws the no-times text from the last good data. To see it: abort the slots call, then press Next month. Fix: when `error` is set for this month, draw no grid and no no-times line.
- **n2. A success answer that fails the zod contract would still crash the catch.**
  - `schema.parse` throws a ZodError (`contract.ts:48`).
  - A ZodError has an `issues` array of objects, so the guard `"issues" in x` takes it as a Problem (`type-page.tsx:185`).
  - `i.split` then throws (`:186`). The booking is made, but nothing is shown.
  - This only happens if the API drifts from the contract.
  - Fix: test `typeof x.status === "number"`, or turn a parse failure into a status-0 Problem in `publicCall`.
- **n3. The picker opens with focus on Close, not on "Search for a city or zone".** Radix's default is the first focusable element. The team's `Dialog` focuses the first field (`openOnFirstField`). Fix: `onOpenAutoFocus` → the input (`type-page.tsx:86`).
- **n4. The server's zone pattern is copied into the web app** (`time.ts:8`, from `service.ts`'s `ZONE_NAME`), as the phone pattern is (`type-page.tsx:23`). STANDARDS §7 says no logic duplicated between web and API. Fix: move both into a shared contract, as a later item.

## Scores at this head (changes from the first review only)
- **D5** 3 → 4: a lost answer is said, and a later error keeps the page.
- **D12** 4: the header is aligned.
- **D13** 3 → 4: 44 px in the dialog, focus managed; the tooltip is still hover only.
- **D16** 4 → 5: each fix has a fail check; the dialog is measured.
- **BIC-20** Partly → Met.
- **BIC-13, BIC-14** still Partly (Should).
- Others as in the first review: D1 4, D2 5, D3 4, D8-D11 4, D14 4, D15 5, D18 4, D19 4; D4, D6, D7 N/A; D17 and D20 simulated only.

## Could not check
- A real screen reader. A visible (headed) browser: headless only here.
- An intended visitor's unaided walk (D17 and D20 stay with the founder).
- Safari and Firefox zone spellings.
- The full CI run: the PR is still a draft.

Verdict: Approve
