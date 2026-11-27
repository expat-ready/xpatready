# Journey test (reviewer) — main fix, FO-3st3 suite (PR #2782 at dbb5819), 21 Nov 2026

- **Role:** the reviewer (one journey score for this check). **Scope:** the change is test-only (`studio/tests/check_fo3st3_types_browser.ts`); the product (Settings → Booking types, concept r2 BR-19, §6 J-T1..J-T4) is unchanged. The journeys below are judged on the unchanged screen, through the suite's journeys and my own probes.
- **Copy:** isolated `rev_fo3` on :4583 (`PLATFORM_IDENTITY=local`), fresh database, stopped and removed afterwards. Headless Chromium only.

**Score: 9/10, a pass (no criterion at 0).**

## Journeys (persona: a firm Admin; a Case Manager for read-only)
1. Main path: the Admin adds a booking type (name, 30 min, host Client F), sees it in the list and on /book/sample-firm.
2. Error: length 4, name of 81 characters, the reserved address "manage": the reason shows at the field and nothing is saved.
3. Conflict: someone else saves first, then "Someone else changed this type…" with Reload, and Reload shows their name.
4. A set of hours deleted before Save: the type is saved and the screen says in words that the set was not (break M1).
5. Retire, then Duplicate, then Delete; Preview as a booker (a working Monday, a closed 25 December, another time zone).
6. Wrong role: the Case Manager gets read-only text, Billing and finance gets the refusal, and the server answers 403.
7. Sizes and keyboard: 375, 1024 and 1440 px; New booking type → name → Enter with no mouse.

## What I did
- Ran the suite twice on one fresh copy at dbb5819: **57/57 and 56/56** (the empty-state check runs only on a fresh database).
- Probe (scratch script, same settle and axe as the PR) at 375 and 1024 px, 3 rounds each: Save type was still mid-fade (background-color and color transitions running) after the panel opened and the screenshot was taken in **6/6** cases. After settle: none running, and axe found nothing in **6/6**. With settle skipped, the new "nothing is still changing" check would fail in **6/6**.
- Variant (scratch copy of the suite, the PR file untouched): with the PR's 1 s hold and the old read (no wait for the row), break M1 **fails every time**. A 1 s hold on the list's reload after the stale-save Reload makes "after Reload the list behind shows the other person's name" fail. A 700 ms hold on the host-set PUT makes both "Uses set pass" checks fail (see the review, m2 and m3).

## What held
- Data: each journey's database read matched (one type per create, version +1, no write from Preview, soft delete, 403 for the Case Manager).
- Accessibility: axe A/AA found nothing serious on the settled states (list, new and edit panel, preview, read-only) at 1440, 1024 and 375. No sideways scroll. The keyboard-only path works.
- Words: field errors, the stale-save line and the M1 warning are plain, and the next step is named ("Open the type to choose again").

## Findings (the product)
- None new. Seen, not a finding: the Save type colour fade (150 ms, `transition-all` in `web/src/components/ui/controls.tsx:11`) still runs with reduced motion emulated. WCAG 2.3.3 says motion "does not include changes of color, blurring, or opacity", so `EXPERIENCE.md` "Reduced motion respected" still holds.
- Evidence quality: `screenshots/fo3st3-panel-375.png` and `fo3st3-panel-1024.png` show Save type mid-fade, pale blue with grey text (the review, m1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J7 pass in both suite runs |
| Next step obvious | 1 | One New booking type button. Empty state teaches it. The M1 warning names the next step |
| Plain words | 1 | Field errors and the stale-save line read as written in the concept |
| Feedback and state | ½ | After Save, "Added X." shows before the list's reload lands, so the row arrives later (seen with the 1 s hold) |
| Correct data | 1 | Database reads after each journey |
| Error recovery | 1 | Stale save → Reload. M1 says the type saved but the set did not, and the type is saved once (M2) |
| Accessibility and screen sizes | 1 | axe finds nothing on settled states at 375/1024/1440. Keyboard path. No sideways scroll |
| Speed | ½ | Click → filled panel 350–480 ms locally. Not measured against the `STANDARDS.md` §9 budgets |
| Visual quality | 1 | Team look. Disabled grey and enabled blue are distinct |
| Trust and sources | 1 | Sample values labelled "Sample". Nothing from AI on this screen |

## Not tested
A real screen reader. A visible (headed) walk. 200 % zoom. An intended user's unaided walk (D17/D20 stay with the founder). GitHub's shard timing: CI was not re-run by me.
