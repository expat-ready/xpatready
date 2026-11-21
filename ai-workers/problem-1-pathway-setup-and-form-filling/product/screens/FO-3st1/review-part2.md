# FO-3st1 part 2 (R1.42): review (independent, fresh context)

PR #2717 · reviewed head **dc96c99e26a5bfbf219e13498494a64913c60e43** against origin/main (`git diff origin/main...dc96c99e`). The PR head has since moved to 6095e326c. That commit changes screenshots only (21 PNGs, no code), so this verdict covers its code too. What I read: concept fo-3-booking r2 (BR-15, BR-16, §4, §4c, §5, §6 J-S5..J-S8, Q3), `design/staff.html` #s4, STANDARDS, EXPERIENCE, QUALITY, the consult service and controller, `feed.ts`, and the PR's question comment (05:06Z). What I ran: my own walk, 37 checks, on an isolated copy at :4444 (stopped afterwards; script and shots in the reviewer scratchpad `rv/`). The journey test is `journey-test-reviewer-2026-11-21-part2.md`. Unless a path says otherwise, paths are under `prototype/studio/web/src/modules/front-office/`.

**Journey score 7.5/10.** That is below the pass of 8. No criterion scored 0.

## Done-when / concept journeys
* J-S5 pass ✔. Attended → the Consult record opens in 215 ms, with time spent = the booked length (30, and 45 on a 45-minute type) and CAD set.
* J-S5 fail ✔ as walked. No-show with no record → no section. **No committed test (M2).**
* J-S6 ✔. A fee with no currency → "Choose a currency for the quoted fee."; the options are Choose, CAD, USD. j_42 W8 tests this.
* J-S7 partly:
  * Lead → "Engage and prepare retainer" → FO-4's Engage panel ✔. Cancel → no prospect ✔ (walked, untested).
  * Case → no button ✔ (walked, untested).
  * Prospect → "Prepare retainer" opens the prospect ✔ (walked, untested).
  * The retainer draft step is not built (declared; see below).
* J-S8 ✔ as walked. A later No-show shows "Attendance changed to No-show." with the record read-only and no Save or Next step. Back to Attended → editable again. **Untested (M2).**

## Deliberate choices (judged)
1. **"Close lead" not rendered.** Accepted, pending the tech lead's answer on the PR. FO-4's lead page on main has no Close panel (lead-page.tsx:3), and P-606 keeps this part waiting for that row.
2. **The retainer step stops at the prospect** (FO-5s not on main). Accepted, pending the same answer. Consequence: the button says "…and prepare retainer", but neither the Engage panel nor the prospect page shows a retainer step yet. The tech lead should confirm the label stays while R1.53 is open.
3. **CAD pre-filled. "Assessment (staff only)" not rendered.** Both accepted. No firm currency setting exists, and the code comment labels CAD as Sample. No assessment source exists, and the mock-up shows the assessment "when one exists", so showing nothing is correct.
4. **Who sees the section:** `canAnswerAttendance && (COMPLETED || hasConsultRecord)` (detail-panel.tsx:86). Accepted. It matches the route: host or `agent/booking:edit`. Walked: a Read-only person sees no section, and the API answers 403 to both GET and PUT. A Billing and finance host records their own consult and gets no retainer button (no `retainer:draft`).
5. **Server issues not mapped to fields:** **not accepted**, see M3.
6. **Not declared anywhere:** "Recommended from 'Interested in'" (M1).

## Findings
**Major**
* **M1 BR-15 "recommended from 'Interested in'" is missing and not declared.**
  * consult-record.tsx:93 starts Recommended empty. The mock-up says: "From Client B's 'Interested in' list."
  * The data exists. The lead answer carries `interestedIn` (sales/contract.ts:25; api `sales/leads.ts:101`), and lead-page.tsx:144 shows it.
  * *Fix:* on a first record for a booking on a lead or prospect, pre-fill Recommended with that lead's "Interested in" as a removable item, read once when the viewer may read the lead. Otherwise, put it to the tech lead on the PR and follow the answer.
* **M2 The screen's rules have no test that fails when they are removed** (STANDARDS §3.10 and §7 [M]; concept §3 asks for a pass and a fail test per BR; Definition of ready names `check_fo3st1_calendar_browser.ts`).
  * Only j_42 drives the panel, and it covers J-S5 pass, J-S6 and Engage done.
  * These have no test: J-S5 fail; J-S7 Engage cancelled, case with no button, and prospect "Prepare retainer"; J-S8 read-only; a stale save with Reload; `?engage=1` for someone who may not engage.
  * Spot-check: deleting consult-record.tsx:65 (the No-show branch) or `can(me, KEY.edit) &&` at lead-page.tsx:97 fails nothing.
  * *Fix:* add these cases, each with a pass and a fail half, to `check_fo3st1_calendar_browser.ts`. My walk did each in a few lines.
* **M3 A server refusal says "Please check the highlighted details." and highlights nothing** (EXPERIENCE §2.10 and §4 [M]: errors on the field, with the fix; STANDARDS §7 field-level messages).
  * Walked: notes with a pasted control character (U+0001; pasted text can carry U+000B or U+000C) and an item of only U+200B. Each gives "Not saved / Please check the highlighted details.", with nothing marked and no way to find the cause.
  * The cause is consult-record.tsx:132, which shows only `err.message`, while `problemOf` drops `issues`.
  * The same root makes :54 and :76 recompute the booked length, although the 404 carries `bookedMinutes`. That duplicates a rule between web and API (STANDARDS §7 [M]).
  * *Fix:* keep the problem's extension fields. new-booking.tsx's `bookingWrite` already does this, or `problemOf` can keep them. Map `issues` paths (timeSpentMinutes, notes, recommended.N, quotedFeeMinor, quotedFeeCurrency) onto their fields, and read `bookedMinutes` from the 404.
* **M4 Two primary buttons in one panel** (BIC-11 Partly, which counts as a Must under EXPERIENCE §6; concept §4c names "Save record" as this panel's one primary).
  * "Save record" and "Engage and prepare retainer" (consult-record.tsx:197, `variant="default"`) are both filled (`rv/shots/j1-saved-1440.png`, `kb-1024.png`).
  * *Fix:* `variant="outline"` on the Next step buttons.

**Minor**
* m1 **A typed but un-added item is dropped on Save, and the screen still says "Saved".** Walked: "Pending item not added" was not stored. Save also wipes the item's own error (:119 replaces the error set). *Fix:* Save adds the pending text through `add()`'s checks, or refuses with words.
* m2 **Removing an item drops focus to the panel** (walked: focus on a DIV; WCAG 2.4.3). The "×" has an aria-label but no tooltip (BIC-14) (:150). *Fix:* move focus to the next item's ×, or to the item input, and add `title`.
* m3 **An 8-digit fee ("12345678") gets "Enter the fee as an amount, for example 1500 or 1500.50."** (:37, :45). The words do not say the limit. *Fix:* add "up to 9,999,999.99".
* m4 **The fee shows as "1500.50 USD" read-only and "1500.50" after a reload,** although "1,500.50" was typed (:43). *Fix:* format with en-CA grouping.
* m5 **Records:** 21 screenshots rewritten by the builder's runs are uncommitted in the shared copy. The PR body still says "Checks, screenshots, walk: to follow".

## D1–D20
* D1 3: M1, plus the declared J-S7 retainer gap.
* D2 4: version check; a stale save is refused; a double click makes one record; values stored exactly.
* D3 4: reuses FO-4's Engage panel, house controls and Loading.
* D4 N/A.
* D5 4: reload, double click, stale and Reload all hold; m1.
* D6 4: one audit line with who, when and the facts, never the notes' text.
* D7 N/A.
* D8 4: the section sits under Attendance; the lead page has Back.
* D9 3: one click to the next screen, but the retainer step is not there yet; m1.
* D10 4: the concept's words; m3.
* D11 3: "Saved", the stale message and the No-show notice are good; M3.
* D12 4: tokens and components; M4.
* D13 4: axe clean on 7 states; keyboard path; 400, 1024 and 200 % with no sideways scroll; m2.
* D14 4: team components.
* D15 5: opens in 215 ms, saves in 100 ms, one record request.
* D16 2: M2.
* D17 simulated only.
* D18 4: "Nothing is sent to <person> from here"; audit.
* D19 3: lead → prospect works; the retainer is R1.53.
* D20 simulated only.

## BIC scorecard (concept §4c)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 | Partly | The lead's person is not re-asked. "Interested in" is not carried (M1). Items and fee do not reach a retainer yet (declared, FO-5s) |
| BIC-02, 03, 05-10, 12, 15-17 | N/A | No phone question, facts, documents, applications or tasks here |
| BIC-04 | Partly | "(optional)" in words. Client checks are at the field with the fix; server refusals are not (M3) |
| BIC-11 | Partly | Save record and Engage and prepare retainer are both filled (M4; `j1-saved-1440`, `kb-1024`) |
| BIC-13 | Partly | Inline and worded, input kept, focus stays on Save. No summary. Server refusals not on the field (M3) |
| BIC-14 | Partly | The × has no tooltip (m2). No other new chip or icon |
| BIC-18 | Met | Skeleton while loading, "Saved", a failed save, and read-only after No-show saying why (`js8-noshow-1440`) |
| BIC-19 | Met | One heading per section, no ids, at 1440 and 1024 |
| BIC-20 | Partly | Keyboard-complete; 200 % and 400 px with no sideways scroll; focus lost on removing an item (m2) |

## Code checks
* Authorisation is on the server: the route checks host or the edit key, and Read-only gets 403. The screen takes `nextSteps` and `canAnswerAttendance` from the server and derives no permission.
* Concurrency: the PUT names the version; a second save from the same form uses the new version (walked: v2). A double click on a first save makes one record.
* No migration and no API change. One request for the record, none per row. No `any`.
* `?engage=1` opens the panel once and is then dropped; a reload does not reopen it, and a Read-only person gets nothing.
* Graph: G1 0, G4 0. The tool lists no front-office pages, the same tool limit as part 1.

## Not checked
A real screen reader. An intended user's unaided walk (D17, D20). FO-5's retainer step (not on main). j_42 itself: I did not re-run it, because a run takes about 15 minutes of real clock and rewrites the committed screenshots in the shared copy. The builder's 29/29 log was read.

**Verdict: Block** at dc96c99e26a5bfbf219e13498494a64913c60e43. Fix M1 (or get the tech lead's written acceptance on the PR), M2, M3 and M4. The minors can be fixed or listed with a follow-up.

## Re-review (diff only), 21 Nov 2026, head e9c0389cb114f261552d902a0d2f68a1358fc76b
**Scope.**
* Read: `git diff dc96c99e..e9c0389c -- prototype` (consult-record.tsx, sales/contract.ts, lead-page.tsx, the new `tests/check_fo3st1_consult_browser.ts`, MODULE.rows/FO-3st1.md).
* Re-ran the new check myself on a fresh copy at :4444: **21/21**, matching the builder's log. I then restored the one screenshot it rewrites.
* Walked the fixes on the same copy (reviewer scratchpad `rv/walk3.ts`, `rv/shots/rr-saved-1440.png`). No page errors. Copy stopped.

**My Majors**
* **M1: fixed.**
  * consult-record.tsx:83-96 reads the lead once, only while there is no record, through the lead page's own query key and parser.
  * It pre-fills "Interested in" as one removable item, trimmed the way the route's Item is. A lead the viewer may not read leaves the list empty.
  * Walked: "Sample: Express Entry assessment" pre-filled; removed by keyboard.
  * Test C1 pass.
* **M2: fixed.** Each rule has a pass and a fail case:
  * J-S5 pass/fail and Read-only (C1);
  * J-S6 and decimal-comma fees (C2);
  * field issues (C3);
  * J-S7 Engage cancelled, prospect and case (C4);
  * J-S8 (C5);
  * stale save and Reload (C6);
  * `?engage=1` for Read-only, a closed lead and the host (C7).
  * Removing the No-show branch, the `can(me, KEY.edit)` check or the pre-fill now fails C5, C7 and C1.
* **M3: fixed.**
  * `problemOf` keeps `issues` (additive; other callers ignore it). `errorsOf` puts each issue at its field: notes, recommended.N as "Item n: …", minutes, fee, currency.
  * Walked: a 10,001-character note → "at most 10,000 characters" at Notes; C3 checks U+0001 at Notes with `aria-invalid`.
  * Its side point is not fixed: :76 and :107 still work out `bookedMinutes` from the feed (now m-b below). Same value as the route. Not blocking.
* **M4: fixed.** Next step is outline (:246), so Save record is the panel's one primary (`rr-saved-1440.png`). C4 checks it.

**My minors**
* m1 fixed: a typed item is saved with the rest. Walked: "Typed not added" was stored.
* m2 fixed: focus goes to the item input after a removal, and the × has a tooltip.
* m3 fixed: the fee words give the limit.
* m4 fixed: the fee is shown grouped (en-CA).
* Breaker M1 fixed: the fee regex reads a comma only as a thousands mark.
* Breaker M2 fixed: `?engage=1` says why the panel did not open (lead-page.tsx:100).

**Open minors.** Fix later or list with a follow-up.
* m-a **Unsaved edits are dropped by Next step without a warning.** The builder lists this one. *Fix:* disable Next step while the form has changes, or ask first.
* m-b **The booked length is worked out in the browser** (:76, :107), although the 404 carries it. *Fix:* `problemOf` can keep `bookedMinutes` the same way it now keeps `issues`.
* m-c **The route's issue words reach the field as lowercase fragments with no fix** ("no control characters", "at most 10,000 characters"). EXPERIENCE §2.10 asks for the fix. *Fix:* word them as sentences in the route (for example "Remove the special characters pasted with the text."), or map them in the form.
* m-d **"Interested in" is pre-filled only for a booking on a lead,** not for one on a prospect, whose lead has it too. *Fix:* read the prospect's lead.
* m-e Also open: Engage on an ENGAGED lead (the panel warns), and the declared Close lead and retainer questions on the PR, which the tech lead still needs to answer.

**Journey score now 9.5/10.**
* 1 each for task, words, feedback, data, recovery, accessibility, speed, visual and trust.
* ½ for next step obvious: m-a, and the "prepare retainer" step is not there yet (declared).

**D16 is now 4.** A new suite with 21 named pass and fail cases, re-run by the reviewer. j_42 was not re-run by me.

**Open:** no Blocker and no Major.

**Verdict: Approve** at e9c0389cb114f261552d902a0d2f68a1358fc76b.

Verdict: Approve 36a1cb058e46d42eecf9eb996bd1fe15e3b9ef8b (records-only delta on e9c0389c)
