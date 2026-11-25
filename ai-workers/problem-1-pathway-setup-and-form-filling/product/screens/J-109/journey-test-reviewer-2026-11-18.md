# J-109 journey test, reviewer, 18 Nov 2026 (commit 648daeea9)

Isolated copy `j109rv` on :4437 (runtime range; never :4400), `PLATFORM_IDENTITY=local`, headless Chromium. Sample firm: the Owner (Representative), a Case Manager (Second representative) and a Read-only person. The builder's `j_109.ts` ran 3 times on the same copy, 27/0 each time. A reviewer probe (scratchpad, not committed) covered keyboard, widths, axe, double click, long text and two tabs.

## Journeys
1. **Main (Case Manager):** "I log a complaint that came by email." Open Complaints, Record a complaint, fill the form, record. **Held.** It opens on its record page with the acknowledge-by date and "Needs you".
2. **Main (Owner):** "I acknowledge it, then close it as resolved." Overdue, open it, Record the acknowledgement, Close with an outcome. **Held.** It ends Closed in the Closed list. The handler sees it closed too.
3. **Keyboard only (Case Manager):** Tab to Record a complaint, Enter, then type every field. **Held.**
   * Focus lands inside the panel.
   * The record took 219 ms.
   * Focus then moves to the new page's h1.
4. **Error (Owner):** close with no outcome. **Held.** "There is a problem: Outcome: choose the outcome" shows in the panel, and the row stays OPEN.
5. **Wrong role (Read-only):** look in the list, then open the complaint by its address. **Held.** The list is empty and there is no Record button. The page says Not found and the API answers 404.
6. **Recovery (double click):** double click Record the complaint. **Held.** One POST, one row.
7. **Two tabs (Owner):** acknowledge the same complaint in two tabs. **Held.** The second tab shows "Already acknowledged. The acknowledgement is recorded once." in the panel, and the database has one ACKNOWLEDGED event.
8. **Long, non-English text:** an Arabic, Chinese, Japanese and Latin name plus a 1,360-character Greek/Arabic summary. **Held.**
   * The name is capped at 200 characters by the field.
   * The text wraps, with no sideways scroll.
9. **Boundary (end of capability):** the closed complaint in the Closed list. **Held.** No next capability follows (brief).

## Data underneath
* `plat_complaint`:
  * one row per record;
  * received time exact (12 Nov 10:00 Toronto);
  * `requestKey` = the browser's Idempotency-Key;
  * after close, status CLOSED and outcome RESOLVED.
* `platform_jobs.job`: one reminder per complaint, due at the acknowledge-by instant. It runs when past due, and the acknowledgement cancels it.
* `audit_event`: `complaint.record`, `complaint.acknowledge` and `complaint.reminder` lines present.

## Accessibility and sizes
* axe (WCAG 2.2 A/AA, serious or critical) is clean on:
  * the filled drawer;
  * the record page;
  * the list at 400, 1024 and 1440 px, and at 1440 px with 200 % zoom.
* No sideways scroll at any of those sizes, on the list or the record page.
* No page errors. The only console errors are the expected 422 and 409 answers.

## Findings
* **Major (evidence, not product):** the committed screenshots are from the builder's fake-wired run. `w2` reads "5 business days late", which is FakeClock's 24 Nov. `w4-closed` has no reminder event. Details in `review.md` M1.
* **Minor (PF-21s screen, outside this diff):** in the close panel, the error summary and field errors stay after the person fixes them, until the next submit (`w4-close-1440.png`).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1, 2 and 3 end to end; the walk passes 27/0, three times |
| Next step obvious | 1 | one filled button that follows the state (W4 :152; screenshot w2) |
| Plain words | 1 | "Needs you", "Close with an outcome", Not found words; Sample labels |
| Feedback and state | ½ | toasts, timeline and 409 in the panel are good; stale close-panel errors (minor above) |
| Correct data | 1 | DB rows, key, reminder row and audit lines exactly as entered |
| Error recovery | 1 | field errors on the field; repeat key 422; two tabs 409; double click gives one POST |
| Accessibility and screen sizes | 1 | axe clean; 400/1024/1440 and 200 %; keyboard-only record |
| Speed | 1 | record 219 ms; pages settle well under budget in the walk |
| Visual quality | 1 | team look; long text wraps cleanly |
| Trust and sources | 1 | Sample lists and "Sample period: 2 business days" marked; no AI |

**9.5 / 10, pass** (8 or more, no 0). To raise "Feedback and state": clear a field's error, and the summary once nothing is left in it, when the person corrects it (PF-21s).

Not tested:
* a visible browser (no display here);
* a real screen reader;
* an intended user's unaided walk (D17, D20 stay with the founder).
