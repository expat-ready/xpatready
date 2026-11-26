# Journey test: CS-NT1 part 4 (Notes and timeline on the case page), reviewer, 26 Nov

Commit d4070b586 (PR #3822, stacked on #3649). Tester: the reviewer agent, a fresh context that did not build this screen. Isolated copy on :4434 (`AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), headless Chromium, Postgres :54329. Never :4400. The copy was restarted once, after the builder said wt4 briefly held other edits; every result below comes from the clean tree (`git status` empty at d4070b586). Screenshots are in the reviewer's scratch folder and are not committed. The builder's walk shots are in `walk/`.

## Journeys (persona · goal · expected)
1. **Main path** (the Owner, "Representative (Sample)"): "note the client's call, tell the officer, pin it, fix a word". Case list → case → the panel under the header → type 2 lines → Mention → pick → Add note → "Told: …" → Pin → Edit → History → timeline. Expected: one row, versions, audit lines, one bell row for the officer.
2. **Alternate** (the Owner, a case with 6 notes): pinned + 3 newest, then "Show all 6 notes"; the timeline's 10 lines, then Show older.
3. **Empty** (a fresh case): "No notes yet. …"; the timeline shows the case's opening lines.
4. **Keyboard only, 1024 px, 200 % zoom** (the Owner): write → Tab → Mention → For the client → Add note → note actions → chips; Ctrl+Enter twice.
5. **Error: busy timeline** (the Owner, a case whose newest 60 lines are document views, one older upload): All, then the Documents chip.
6. **Break** (375 px): HTML, a 300-character unbroken word, Arabic and Chinese; two tabs pin the same note.
7. **Wrong role / scope:** the builder's DP6 (no share key, no edit key) and DP7 (a Case manager without `view.all` gets 404 on notes, timeline and people). I re-ran these in the builder's suite, not by hand.
8. **Across the boundary** (the case officer): the bell row for the mention, read through the API.

## What held
* J1: the writer is ready in 437 ms. The panel sits directly under the case header (h1, then the panel, then Government steps). The mention list leaves out the writer and puts "Case officer (Sample) · On this case" first. Add → "Told: Case officer (Sample)" in 147 ms. DB: 1 row, version 1, audit `case.note.added`, one `note-mention` row. History reads "Words changed · Pinned · Written", each with who and when, and words only where they changed. The timeline reads "Note edited", "Note pinned" and the note's words, with no ids.
* J2: "Show all 6 notes" with 4 notes shown (pinned + 3).
* J4: Tab order: box → Mention → For the client → Add note → Unpin/Edit/Show to the client/History → chips. Focus is visible (screenshot focus-note-action). Ctrl+Enter twice stores **1** note. No sideways scroll at 1024 px or at 200 % zoom (512 CSS px).
* J6: the HTML shows as text (no `img` in the DOM). The long word wraps, with no sideways scroll at 375 px. Add note is 44 px tall at 375 px. axe at 375 px: 0 violations. In the two tabs, the stale Pin says "Someone changed this note since you opened it. Nothing was saved; look again and retry." and the DB holds one pin (version 2).
* J8: the officer's row is `note-mention`, label "C-2026-00004", link `/cases/<id>`. The bell shows "You were mentioned in a note · C-2026-00004".
* Builder suite re-run: `check_csnt1d_panel_browser` **48/48**, `check_csnt1_notes` **56/56**, `check_csnt1_timeline` **36/36**.

## Findings
* **Major: a kind chip can say "Nothing has happened on this case yet." when it is false, with no way to page** (J5). The API's first DOCUMENT page held 50 lines, all `viewed`, with `more: true`. The panel drops access lines on the client (`case-notes.tsx:228`). Nothing is left, so `:239` shows the empty line, and `:249` hides Show older because `shown.length` is 0. The upload two hours earlier is unreachable. Under All, the same shape shows 2 lines plus Show older, so it is not stuck there.
* **Major: the page jumps on load** (J2). The skeleton is 351 px and the loaded panel 1,356 px (6 notes, 10 lines, 1440×1000). The page's CLS is 0.47 against the §9 budget of 0.1. The concept §4 says "a fixed-height skeleton while it loads, so nothing below moves".
* Minor: Add note is disabled on an empty box, and its reason ("Write the note first.") is only a hover `title`, so a keyboard user never reaches it (challenge m4, which the Lead response put in the build).
* Minor: the first two lines on a fresh case read "Other change" twice (the case-opening audit types). This follows the concept's fallback, but it tells the person nothing.
* Minor: a reused idempotency key (after a lost response, a retry with changed mentions) shows the API's "This idempotency key was already used …", and the panel has no fresh-key retry (`case-notes.tsx:84` renews the key only when the words change).

## Score (0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 end to end; DB rows, audit and bell checked |
| Next step obvious | 1 | the writer comes first and Add note is the one filled button; the mention list says "On this case" |
| Plain words | ½ | "Other change" ×2 on every new case; key-reuse jargon; the 404 words say "not in the firm" when the case is only outside the person's scope |
| Feedback and state | ½ | "Adding…", "Told:", conflict and stale messages are good; the page jumps (CLS 0.47); disabled Add has no keyboard-reachable reason |
| Correct data | ½ | stored data is exact (1 row on a double add, versions, one bell row); the timeline under a chip can state "Nothing has happened" falsely (J5) |
| Error recovery | 1 | a conflict keeps the typed words with "Use the current note"; a stale pin is refused in words; a network error keeps the words |
| Accessibility and screen sizes | 1 | axe 0 at 1440 and 375 px (builder: every state); keyboard path; 1024 px and 200 % zoom without sideways scroll; Add 44 px at 375 px |
| Speed | 1 | writer 437 ms; add→told 147 ms; notes 16 ms, timeline 24 ms, people 27-38 ms (3 staff) |
| Visual quality | ½ | the kind pill renders as an 80×50 px grey tile on every line (`:242`; walk shot 4, j6-break-375); the panel is taller than one screen at the top of the page |
| Trust and sources | 1 | who and when on every note, version and line; History in place; raw summary behind Details; no AI |

**Total 8/10, pass (no 0).** Most valuable fixes: (1) J5: keep reading pages while a filtered page is empty and `more` is true, and show the empty line only when there is no next page; (2) reserve the kept-short panel's height while loading; (3) let the empty-box reason reach the keyboard (m4).

Could not test: a real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); j_76 W8 (builder's result, not re-run).
