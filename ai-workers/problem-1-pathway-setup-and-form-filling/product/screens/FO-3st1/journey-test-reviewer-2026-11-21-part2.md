# FO-3st1 part 2: journey test (reviewer, 21 Nov 2026)

PR #2717 at dc96c99e26a5bfbf219e13498494a64913c60e43. This was run on an isolated copy at :4444, with a fresh database and Sample firm `maple`. The staff were an Owner, a Case Officer host, a Read-only person and a Billing and finance host. Each meeting had ended 2 to 7 hours before. Browser: Playwright Chromium, headless, at 1440, 1024, 720 (200 %) and 400 px. Script and screenshots are in the reviewer scratchpad `rv/` (walk.ts, walk2.ts, shots/). Result: 35 of 37 checks passed. The two fails are explained below; neither is a product bug. US$0, no model call.

## Journeys
1. **Main path.** The Case Officer, as host, records a consult and starts the next step. The booking detail shows no record until "Attended" is clicked; the form then opens in 215 ms, with time spent 30 (the booked length) and CAD set. They type notes with Persian text and a second line, add "Work permit" and "work permit" (the second is dropped), add a Persian item, type fee "1,500.50" in USD, and press Enter. "Saved" shows in 100 ms, and the Next step "Engage and prepare retainer" is scrolled into view. Underneath: 35 min, 150050 USD, two items, created by the host, one audit line without the notes' text. A second save takes version 2. A reload keeps everything.
2. **Alternates.**
   * A prospect booking offers "Prepare retainer", which opens the prospect.
   * A Follow-up (case) booking pre-fills 45 and shows no next step.
   * The Owner (not the host) can edit and gets the same next step.
3. **Error.** Minutes 0 and fee "abc" each get the concept's words at the field (`aria-invalid`, described by the message). A 121-character item is refused at the field. A fee with no currency gets "Choose a currency for the quoted fee." Nothing is stored.
4. **Conflict.** The Owner saves a note; then the host saves from an older form. The host sees "Someone else saved this record. Reload to see their changes.", and Reload shows the Owner's note. The Owner's save is kept.
5. **Across the boundary.** "Engage and prepare retainer" opens the lead page with FO-4's Engage panel and drops the `engage=1` flag. Cancel → no prospect is made (J-S7). A reload does not reopen the panel, and Back returns to the booking.
6. **Later No-show (J-S8).** The notice "Attendance changed to No-show." shows over a read-only record, with no Save and no Next step. Back to Attended → editable again with the saved values. No-show on a booking with no record → no Consult record section.
7. **Wrong role.**
   * Read-only (list key only): no section; the API answers 403 to GET and PUT.
   * `?engage=1` opened by a Read-only person: no panel.
   * A Billing and finance host records their own consult; no retainer button (no `retainer:draft`).
8. **Recovery.** A double click on a first save makes one record and no stale message.
9. **Keyboard only, 1024 px.** Tab order: Attended, No-show, Time spent, Notes, Recommended item, + Add, Quoted fee, Currency, Save record. Enter in the item input adds the item, and Enter in a field saves (55 min, "Study permit" stored). Focus is visible.
10. **Screen sizes.** No sideways scroll at 1440, 1024, 400 or 200 % zoom. axe (WCAG 2.2 A/AA) is clean on the empty form, errors, saved with next step, No-show read-only, 1024 and 400.

## Break it
* Notes with a pasted U+0001, or an item of only U+200B: the server refuses with "Not saved / Please check the highlighted details." and nothing is highlighted, which is a dead end. **Major** (review M3).
* Text typed in "Recommended item" but not added, then Save: "Saved" shows and the item is not stored. **Minor** (review m1).
* Removing an item by keyboard drops focus to the panel. **Minor** (m2).
* Fee "12345678" is refused with words that do not give the limit. **Minor** (m3).
* Long and right-to-left items render in `<bdi>` chips and the read-only list without overflow.
* Two people saving the same record: held (journey 4).

## Why two checks failed
* The first fail is my own script. It added a 121-character item, then pressed Save, and Save clears the item error. Run alone, the error shows. This is the m1 behaviour.
* The second fail is the console check. The only console lines were the browser's "Failed to load resource" for the expected 404 `NO_RECORD` and the 409 stale answer. There were no page errors.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Record saved and the next screen opened (journeys 1, 2, 5) |
| Next step obvious | ½ | One click to Engage. But the "prepare retainer" step is not there yet (declared), and a pending item is silently dropped |
| Plain words | 1 | The concept §5 strings, exactly; "Nothing is sent to <person> from here." |
| Feedback and state | ½ | "Saved", stale and No-show states are clear. A server refusal points at nothing (M3) |
| Correct data | 1 | Values exact; one audit line, no notes text; a stale save refused; a double click makes one record |
| Error recovery | ½ | Stale → Reload works; a server refusal gives no way forward |
| Accessibility and screen sizes | ½ | axe clean, keyboard path, all widths; focus lost on removing an item; × has no tooltip |
| Speed | 1 | 215 ms to open, 100 ms to save |
| Visual quality | ½ | Clean and in house style, but two filled buttons in one panel (M4); fee shown without grouping |
| Trust and sources | 1 | No AI; says nothing is sent; who and when audited |

**7.5/10. Below the pass of 8; no criterion at 0.** What would raise it, most valuable first:
1. Map server issues onto the fields (M3).
2. Make the Next step buttons outline (M4).
3. Add or refuse a pending item on Save (m1).
4. Keep focus after removing an item (m2).

## Not tested
A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder). FO-5's retainer draft (not on main). I did not re-run j_42 itself (about 15 minutes of real clock, and it rewrites the committed screenshots in the shared copy).
