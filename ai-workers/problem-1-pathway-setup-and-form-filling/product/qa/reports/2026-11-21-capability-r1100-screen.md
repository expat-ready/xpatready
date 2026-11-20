# qa capability R1.100 after PF-5s part 1: 21 Nov 2026 (cloud qa lane, asked by Lead 8 (series 3); Opus 5.5, medium; US$0, live AI off)

Main tested: **3abfe81cc** (21:42 UTC 20 Nov). That is main's head, and it includes PF-5s part 1 #2608 ("Completes: R1.100", merge fa72345c7, 21:41 UTC). This was a read-only score: the walks ran on GitHub's runners, so no isolated copy was needed. :4400 was not touched.

## R1.100 Recorded acceptance of our terms, privacy notice and data agreement: **Works** (was Partial, 20 Nov)

**Signal (P-606):** every checklist part is merged: PF-5, PF-5t parts 1-2, QA-481 (PF-5v part 2), and now the sign-up screens PF-5s part 1. The 20 Nov score held only one point: clause 1 had been proven at the API door alone (`reports/2026-11-20-capability-r1100.md`). Lead 4's answer was a screen step in `j_100`, and #2608 adds it as W0.

**Walks on main's head (P-339, P-700), dispatched by Lead 8, `j_100` with `j_26`:**
* Run **44823507364**, job 136590488128: `j_100` 27/27, exit 0 (artifact walk-j_100-3abfe81cc…).
* Run **44823699814**, job 136591027423: `j_100` 27/27, exit 0.

The 20 Nov run had 22 checks. The 5 new ones are the W0 screen steps; the other 22 are unchanged and still pass.

**Fresh Opus reader (P-303; read only, ran nothing):** "Verdict: Works. Confidence: high."

| Done when clause | Status on main 3abfe81cc | Evidence |
|---|---|---|
| Sign-up cannot finish without accepting the current versions | **Met on screen** and at the API | W0 (`j_100.ts:58-63`): Start free trial with the tick unticked shows "Please accept the terms to continue." on the tick. No request leaves the page (the walk listens for one), and there is no pending sign-up, no firm and no email. Screenshot `w0-terms-refused`. The tick names the three versions from the same current-terms read the API checks (`web/src/modules/platform/signup/signup-page.tsx:48,162`; `api/src/platform/firms/signup.ts:106`). If the API refuses, the page re-reads the terms and clears the tick (`signup-page.tsx:71-74,88-89`). The API door accepts only the exact current set (`signup.ts:124-126`); W1 sends none and two of three. Ticked, the page answers Check your email. Confirm my email makes the firm and its Owner. |
| Who, when and which version: stored and shown | Met, on screen | Stored with who, when and version, plus the audit line (`j_100.ts:117-119`; `signup.ts:205-206`). Shown in Settings → Terms (`j_100.ts:139-145,163-165`; screenshot `w5-settings-terms`). |
| A new version asks again at the next sign-in | Met, on screen | W5 (`j_100.ts:149-165`): the terms page shows the new terms of service, the API answers 428 TERMS_PENDING, I accept records the acceptance, and Settings → Terms then shows 4 rows. Screenshot `w5-asked-again`. |

**Verdict: Works.** All three clauses are proven on main's head on GitHub's runners, twice, and the reader agrees with high confidence. Terms wording and versions: Sample. Legal points: Unconfirmed: no counsel.

## Bugs
None new. The reader listed four small test-debt points, none of which fails a clause. I filed them as suggestions, not bug rows:
1. The new version is inserted by SQL (`j_100.ts:151`): no publish path is used.
2. The walk never sends a stale version id, and never shows the tick clearing after an API refusal. The code handles both.
3. If a version is published between sign-up and verify, the older ids are stored (`signup.ts:161,205`). The sign-in gate should then ask again, but nothing tests it.
4. Accepted times show in browser-local time with no time zone.

0 Blocker · 0 Critical · 0 Major · 0 Minor.

## Could not test
* Coverage (c8) and the 400/1024 px replays were not rerun. J-100 runs at 1440 px. This is a capability score on the recorded walks.

## Questions for the Lead
None.

## Suggestions
* J-100: send a stale version id at the door, and show the tick clearing after an API refusal (*Later*, *Scaffolding*).
* A test for "version published between sign-up and verify, then asked at first sign-in" (*Later*, *Capability*).
* Show the time zone on Settings → Terms acceptance times (*Later*, *Capability*; UX).
* Drop PF-19e from focus-list.md row R1.100, as said on 20 Nov (*Later*, *Scaffolding*).
