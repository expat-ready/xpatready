# CS-DL3 part 2 break report: "Government steps" on the case page (R1.74, QA-591)

Commit 324b8ca, branch claude/trusting-goldberg-k4xn9w. Isolated copy br_csdl3 on :4671 (AI_LIVE=off, PLATFORM_IDENTITY=local,
PLATFORM_SAMPLE_SEED=on, sample "configured" loaded). The copy is stopped. Checked only against the brief's "Part 2" Build list.
Tools: curl against the API, Playwright Chromium (1440/1024/768/512/375/320 px), axe-core WCAG 2.2 A/AA, psql. Five Visitor
visa cases. US$0, no model call.

## Findings (no Blocker, no Major)

**m1 (Minor): a refusal from the server does not move focus to the refusal message.** Focus ends on the dialog container.
Repro: open "Cancel…" on a step and type a reason. Cancel the same step through the API in another session, then press "Cancel
the step". The dialog shows "This step is already cancelled. Nothing was changed.", but `document.activeElement` is
`DIV#radix-…` (the dialog), not `[data-gov-refusal]`. This happened 4 times out of 4. A record refused as CASE_CLOSED (the case
withdrawn while the dialog was open) and as 403 (role changed) end the same way. The message is still read out because it is a
`role="alert"`, and focus stays inside the dialog. Likely cause: `busy` disables the focused submit button (controls.tsx:36,
`disabled={disabled || busy}`), so the browser drops focus. Then `focusError()`'s requestAnimationFrame (milestones.tsx:109)
finds nothing to focus. Field errors from local checks do get focus (the due date before the letter's date, Other with no note).

**m2 (Minor): when the session ends mid-dialog, the dialog vanishes and what was typed is lost, with no message.** Repro:
open "Record a step…", fill step, dates and note. Send POST /api/platform/session/sign-out with that token (this stands in for
signing out in another tab), then press "Record the step". The dialog closes and focus goes to the "Government steps" heading.
The section shows only "Sign in as firm staff (under Decision and closing) to see and record government steps." Nothing on the
page says the session ended or that nothing was recorded (screenshot was in the scratchpad, not kept). The code does this on
purpose (milestones.tsx:115, `if (… status === 401) { onClose(); return; }`). It does not match the file header's own rule, "a
refusal shows in words where the person acted" (milestones.tsx:6-7). The server wrote nothing, which is correct.

**m3 (Minor): the reminder labelled "on the day" is not on the due date when that date is a weekend.** Repro: record ADR, letter
20 Nov 2026, due 20 Dec 2026, which is a Sunday. The row reads "Due Sun 20 Dec 2026 (weekend) · in 30 days … Reminders planned:
Thu 10 Dec 2026 (7 working days before), Thu 17 Dec 2026 (2 working days before), Fri 18 Dec 2026 (on the day)". Fri 18 Dec is
two days before the due date. The label comes from `OFFSET_WORDS = { 0: "on the day" }` (milestones.tsx:27-28). Offset 0 is
counted back to the last working day, so a better label would be "last working day" or similar. The date itself is printed
correctly.

**m4 (Minor): "Back" throws away a filled dialog without asking. Escape and the X do ask.** Repro: open "Record a step…", type a
reference, press Back. The dialog closes and no confirm appears. Pressing Escape on the same dirty dialog asks "Discard your
unsaved changes?". Back calls `onClose` directly (milestones.tsx:163, :187), so it skips the Dialog `guard` (controls.tsx:79).

**m5 (Minor): a letter's date in the far future or far past is accepted and shown with no warning.** Repro (API or dialog): letter
2199-01-01, due 2200-12-31 → 201, and the row shows "in 63593 days" with reminders in December 2200. Letter 1900-01-01, due
1900-01-02 → 201, and the row shows "Overdue · overdue by 46343 days". A letter's date after today cannot happen. The only limit
is the schema's range of 1900–2200 (contracts/milestones.ts:180). The dialog sets no `max` on "Letter's date"
(milestones.tsx:156).

**m6 (Minor): text the API refuses for bidi or control characters gets a misleading message.** Repro: in the dialog, type
reference `ABC` U+202E `DEF` (7 characters) and record. The field error reads "Plain text, at most 100 characters."
(contracts/milestones.ts:185). Nothing is written and focus goes to the field. The reason field does say "Plain text only."
(:215). Related: the client's `maxLength` counts UTF-16 units (milestones.tsx:159-160, :183-184), so only 50 of 60 typed
characters like `𝟙` were kept, while the server allows 100 characters. The reason counter also counts an emoji as 2.

**m7 (Minor, API from part 1, which this UI relies on): a step on a closed case can still be cancelled through the API.** Repro:
withdraw a case (POST …/withdraw {reason, withdrawnOn}), then POST …/milestones/:mid/cancel {reason} → 200, and the line is
cancelled. Recording on the same closed case → 409 CASE_CLOSED. The UI hides "Cancel…" on a closed case (milestones.tsx:52,
:98). The header comment says "Every rule stays in the API", but here the rule exists only on the screen
(case-milestones.ts:116-127 has no status check).

## What held
* **Double submit:** Enter pressed three times in the reference field recorded 1 row (the button is disabled while busy, and
  each dialog opening has its own idempotency key). 10 parallel POSTs with one key gave 1 row with the same id each time; the
  same key with a different body → 409 IDEMPOTENCY_KEY_REUSED. 5 parallel cancels of one step → one 200 and four 409
  ALREADY_CANCELLED.
* **Validation:** due date before the letter's date, refused in the dialog and by the API, at the field and focused. Other with an
  empty or zero-width-only note, refused at the note. 29 Feb 2027, refused. Unknown fields and an array body, 400. Bidi
  overrides U+202A-E and U+2066-9 refused in both reference and reason. RLM and ALM are accepted and shown inside `<bdi>`.
  Arabic and Japanese reference and note show correctly. A 5-digit year typed in Chrome's date field is refused by the API at
  the field.
* **Roles and firms:** no token → 401 and the section shows the sign-in line. The anchor `#case-decision-h` exists on the page.
  Another firm's staff (sample-solo/user-S) → 404 on GET, POST and cancel, and the section says "This step or case is not in
  your firm." with no data leaked. Role changed to READ_ONLY with the dialog open → 403, "Your role does not allow this… Nothing
  was changed.", then both buttons hide and "Your role does not record government steps." appears.
* **Closed case:** a withdrawn case shows no buttons and says "The case is closed: reopen it to record a step." A case withdrawn
  with the dialog open → 409 shown in words, then Record hides.
* **Cancelled lines** stay visible, struck through, with the "Cancelled" pill and "Cancelled by … · Reason: …", and no reminders.
  Overdue is said in words ("Overdue" pill and "overdue by N days"), not by colour alone.
* **Keyboard:** Record is reachable by Tab. Focus opens on the Step field. The cancel dialog cycles reason → Back → Cancel the
  step → Close. After a record, focus returns to "Record a step…"; after a cancel, to the heading.
* **Layout:** no sideways scroll at 1440/1024/768/512/375/320 px, including a 100-character unbroken reference, a 2000-character
  note and a 500-emoji reason. At 512×450 (1024 px at 200 % zoom) the dialog fits and "Record the step" can be reached by Tab.
* **axe:** 0 violations on the section (empty, 3 rows, 12 rows, 101 rows), on both dialogs, and on the record dialog showing
  field errors.
* **Load:** 101 steps on one case: GET in about 52 ms (58 KB), all rows shown about 1.15 s after navigation. No request per row.
  No page errors apart from the expected 401/403/409 console lines.
