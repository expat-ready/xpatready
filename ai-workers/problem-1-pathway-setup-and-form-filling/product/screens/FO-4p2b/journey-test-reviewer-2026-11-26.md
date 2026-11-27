# Journey test: FO-4 part 2b, prospect notes, calls and timeline (reviewer, 26 Nov 2026)

* Commit: be4b8a3c79a007467ac72b5b3c9fe9f9a5909590.
* Copy: isolated `rv_fo4p2b` on :4435 (never :4400), AI off, local sign-in, Sample firms; stopped afterwards.
* Method: a headless Playwright walk using only what a person sees (labels, buttons), with SQL reads after each journey. The script stays in the scratchpad.

## Journeys (persona · goal · result)
1. **Owner · "note what they asked, then log my call back"** (main path, 1440 px). Typed a note and clicked Add note: it showed first in 165-344 ms, the box emptied, and `fo_note` holds 1 INTERNAL row. Logged a call (Incoming, Connected, 4.5 min, notes): "Incoming call: connected (5 min). Wants a study permit for 2027." `fo_call` holds IN/CONNECTED/270 s, and there is one audit line each (`call.logged`, `note.added`) with no free text. **Held.**
2. **Owner · alternate: a call from 10 minutes ago on a lead added just now.** Refused at the field: "when: the call cannot be before the lead arrived." The rule is the API's; the raw "when:" words are this screen's (m1). Clearing When logged it. **Held, with poor words.**
3. **Error input.** No outcome → "Choose how the call went."; Minutes "abc" → "Minutes from 0 to 1440."; "4,5" is also refused (m8); a future time shows "when: a call cannot be logged in the future." An empty note → "Write the note first."; 5,001 characters → refused on the box with the count. **Held.**
4. **Failure.**
   * Offline on Add note: "Could not reach the server. What you typed is kept; try again.", with the text kept.
   * Offline on Log a call: a notice at the top of the panel, with the fields kept.
   * Timeline 500: "The timeline could not be loaded", with Add a note still usable.
   * A slow timeline shows a skeleton.
   * **Held.**
5. **Wrong role.** A Case Officer without `:edit` and `:log-call` sees the timeline but no box and no Log a call; the API answers 403/403. With the keys, the CO adds a note and it shows under their name. Firm B sees none of A's lines (builder PA4). **Held.**
6. **Recovery and the step across the screen boundary.** Move to… Qualified, and Set value, from part 2a: the timeline did **not** change until a reload (M1). Reload after a note: the note is there. A double-click on Add note stored it once. Two tabs: both notes were stored once, and both show after a save. **Failed (M1).**
7. **Long and odd content.**
   * Arabic text and `<img onerror>` show as plain text, right to left, and nothing runs.
   * A 60-line note is cut at 3 lines with no way to read the rest (M2).
   * 16 lines show 10 with "Show all 16 lines", then "That is everything on this prospect."
   * **Partly.**
8. **Keyboard only.** 20 Tabs reach the note box; Tab then Enter adds the note, and focus drops to `<body>` (m5). Log a call opens with focus on Direction; the arrow keys pick an outcome; Enter in Minutes submits. After Escape, Cancel or a save, focus lands on `<body>`, while part 2a's Mark lost returns focus to its button (M3). **Partly.**
9. **Screen sizes.** 375, 1024, and 1024 at 200 % zoom (512 CSS px): no sideways scroll, the panel's footer is visible, and axe WCAG 2.2 AA is clean on the section and the panel at each width. Add note is 32 px tall at 375 (m7). **Held, with a small target.**

## Score (QUALITY.md, each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: note and call saved and shown |
| Next step obvious | 1 | Add a note and Log a call sit at the top of the section; one primary |
| Plain words | ½ | "when: …" raw text; "Moved to another stage"; "Prospect updated" for a value; "Leave it empty for now." |
| Feedback and state | ½ | Stale after Move and Set value (J6); no announcement after save |
| Correct data | 1 | SQL: one row each, exact values, audit lines, firm scope, 403s on the server |
| Error recovery | 1 | J4: input kept offline; field errors; the panel stays open |
| Accessibility and screen sizes | ½ | axe clean, zoom fine; focus lost on panel close; 32 px target at 375 |
| Speed | 1 | First view 0.7-1.4 s cold; save under 400 ms |
| Visual quality | ½ | Long notes cut with no way to read them; two date styles on one page |
| Trust and sources | 1 | Who and when on every line; "The system" for automatic lines; "never sees them" said for notes; no AI |
| **Total** | **8/10** | Pass (8+, no zero) |

## Fixes that would raise the low criteria, most valuable first
1. Refresh the timeline after the page's own actions (M1).
2. Let long lines expand (M2).
3. Return focus when the panel closes and after Add note (M3, m5).
4. Use the screen's own field words, and name the stage on the move line (m1, m2).
5. Use the page's date formatter (m3).

## Could not test
* A real screen reader.
* A visible-browser walk by an intended user (D17/D20 stay with the founder).
* Mobile touch.
* j_76 W8 (the builder's claim).
