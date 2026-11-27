# Journey test: R1.8 audit trail (reviewer, 20 Nov 2026), PR #2527 at e81b8cd51

Scope: R1.8 is a capability, not a screen. The journey is J-8 (`prototype/studio/tests/journeys/j_8.ts`), run with its own header command on an isolated copy on :4436 (runtime lane ports; never :4400). The headed browser walk with video was not possible here: Playwright's ffmpeg is missing, the same environment gap the builder and qa reported. So the walk ran headless through J-8's own Playwright steps.

## Journeys
1. **Firm A's Owner adds an office, then renames it (PF).** Expected: two lines, each with who and when. The add's line carries the name as an after value only; the rename's line carries the name before and after. Held (DW6). AUD-4's reader shows "name: old → new".
2. **The Owner changes a person's phone (FO).** Expected: the number before and after in full (P-687). Held (DW6).
3. **The case officer answers, moves a stage and supplies a document on firm A's case.** Expected: each line carries firm A, although the case routes name no firm. Held (DW7, W1, W2).
4. **Firm B's request writes a line about firm A's case.** Expected: refused, nothing written, and the alert names firm B. Held (DW7 in-process; `check_aud1b_adapter` DW9).
5. **The app's role tries UPDATE or DELETE on a line.** Expected: refused. Held (DW3).
6. **An action fails after its line was written.** Expected: the line rolls back with the action. Held (DW5).
7. **The firm exports its activity log and reads the export's own line.** Expected: no false change on that line. **Failed**: `check_aud4_firm_log` DW6 shows "rows: (none) → 100000" and two more false additions (review Major 1).

## Data underneath
* After each journey, `audit_event` was read: one line per action, `firm_id` set, `<field>_before` / `<field>_after` exactly as entered, and no secret.
* Five older suites that assert "no personal data in the audit line" now fail. P-687 changes those rules, but the tests were not updated in the same PR (review Major 2).

## Break-it (short)
* Cross-firm case line: refused.
* Unknown case id: refused.
* Configuration line naming another firm: refused.
* Secret-named value (`passwordHash`, `resetToken`): refused.
* `_after` key put in `detail`: refused.
* 4001-character value and 61 fields: refused.

## Score: 8.5 / 10
The table, with evidence, is in `review.md`. The ½ scores are next step obvious, plain words and correct data.

## Could not test
A real screen reader. The CI walk with video. An intended user's unaided walk (D17/D20 stay with the founder).
