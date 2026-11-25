# CS-NT1 part 4: Notes and timeline on the case page (concept r1)

Row CS-NT1 (BACKLOG line 1092), brief `design/briefs/CS-NT1.md` part 4; Release 1 row R1.76 ("Notes; one timeline per record"). API on which it sits: CS-NT1 part 1 (#2999, merged) and part 3 (#3649: notes on a case client, the case timeline, @mentions). No board for the founder (P-223 (4)): layout `design/board.html`; a fresh challenge writes `challenge.md`; the tech lead approves. Part 2 (rich text, delete, Recently deleted) is not on `main`: its controls are **not in this part** (§6b). Legal points: none (no immigration value is shown).

## 1. Job and journey
* **Job:** a staff member reads what happened on a case, newest first, and writes a short note for the team (or, with the key, for the client), mentions a colleague, pins what matters, and corrects a note while every earlier version stays readable.
* **Persona:** firm staff signed in through PF-4's sign-in. Keys (PF-3's seed): `agent/case:show` (every staff role) reads; `agent/case:edit` writes (Owner, Admin, Case manager, Case officer); `agent/note:share-with-client` marks a note client-visible.
* **Journey (j_76 W8, by screens):** open a case → panel **Notes and timeline** → type a note → **Add note** → it shows at the top of the notes and on the timeline with who and when → pin it → edit it ("Edited", history opens in place) → filter the timeline by kind → **Show older** pages back. Activity and SA-01B ids: not known.

## 2. Ten layers
| Layer | In the app (main + #3649) | Team's code | New here |
|---|---|---|---|
| Records | `case_note` (insert-only versions), `audit_event` | none found for case notes | none (no schema) |
| Rules | `CaseNotes` (`api/src/case-notes/service.ts`), `CaseTimeline` (`timeline.ts`) | none | none: the screen shows the API's answers |
| Contract | `GET|POST cases/:id/notes`, `…/versions`, `PUT …/text|pin|visibility`, `GET cases/:id/timeline`, staff bearer only | none | **one read** `GET cases/:id/notes/people` (who may be mentioned, §6, question 1) |
| Screen | nothing calls these routes | none | `web/src/runtime/case-notes.tsx`; one mount line in `cases.tsx` |
| Session | `staffApi`, `useMe`, `useStaffToken`, `SignInCard embedded` (as CS-C1s) | none | none |

## 3. Business rules shown (the API decides)
* **BR-1** (AG-13-20): a note is plain text, 1-5,000 characters; the counter shows from 4,500; empty is not sent (Add note is disabled with the reason as a tooltip).
* **BR-2** (AG-13-21): a note is internal by default; **For the client** is offered only with `agent/note:share-with-client`; a client-visible note carries the badge "Client can see this".
* **BR-3** (AG-13-23): Pin / Unpin; pinned notes first, then newest.
* **BR-4** (AG-13-24): Edit shows only when the note's `canEditText` is true (author, Owner, Admin); an edited note says "Edited"; History lists every version newest first with who and when.
* **BR-5** (STANDARDS §4): every change names the version it was made on; a 409 `NOTE_CHANGED` shows "Someone changed this note since you opened it" with the current words and **Use the current note**; what was typed is kept.
* **BR-6** (AG-13-22): @mention picks people from a list (never typed names); a person of another firm cannot be picked; the note says "Mentioned: {names}".
* **BR-7** (AG-13-30..32): the timeline is newest first, 50 at a time; **Show older** reads the next page while the API says `more`; kind chips All · Notes · Documents · Decisions · Other change only the timeline.
* **BR-8** (BR-20): another firm's case → "This case is not in the firm you are signed in to."; a missing key → the role words, as CS-C1s.

## 4. Layout (`design/board.html`)
* **Pattern:** a case panel (as Decision and closing), placed directly **under the case header and above Documents** (notes are read on every visit; question 2). Sections, not tabs (EXPERIENCE §2.2): **Notes** (writer + list) then **Timeline**.
* **Panel header:** heading "Notes and timeline", one-line purpose, "Signed in as {name} (firm staff)" as CS-C1s.
* **Writer:** a labelled text box "New note" (3 rows, grows to 8), below it: **Mention** (button opening a searchable list, chosen people as removable chips), **For the client** checkbox (key only), counter, and the one filled button **Add note**. Ctrl/⌘+Enter adds.
* **Notes list:** pinned first; each note: words (line breaks kept, long notes fold after 6 lines with "Show all"), "{author} · {when}" (relative, exact date in the tooltip), badges Pinned, Client can see this, Edited; quiet actions Pin/Unpin, Edit, History (in place). Edit turns the note into a text box with Save / Cancel.
* **Timeline:** kind chips (one row, scrolls sideways at 375 px), then lines: icon by kind + words + "{who} · {when}"; a note line shows its words folded to 2 lines; **Show older** at the end; "That is everything on this case." when `more` is false.
* **States:** loading (fixed-height skeletons, so the page below does not jump), no staff session (SignInCard inline, typed note kept), empty notes ("No notes yet. Notes are for your team unless you mark one for the client."), empty timeline ("Nothing has happened on this case yet."), saving (button "Adding…"), failed save (error on the box, words kept), conflict (BR-5), read-only (no `agent/case:edit`: no writer, "Your role can read notes but not add them."), 375 px (one column, chips scroll).

## 4b. Best in class (product knowledge, not re-read today: **Unverified**)
* **HubSpot record timeline:** notes, calls and changes in one feed with type filters and pinned notes on top. Copied: kind chips, pin.
* **Clio matter notes + activity:** notes kept per matter, the activity log apart. Beaten: one panel holds both, with no second page.
* **GitHub issue timeline:** comments and events interleaved in time order, "edited" with a visible history, @mentions from a list. Copied: Edited + history in place, mention picker.
* **Salesforce Chatter:** @mention notifies; internal vs customer-visible posts. Copied: the explicit "For the client" choice, off by default, with a badge.
Effort saved: no page change to read history; the note box is first on the page; mentions are picked, never misspelt; a conflict never loses words.

## 4c. Scorecard (BIC, EXPERIENCE §6)
01 author, time and case come from the session and the case, nothing typed twice · 02-03 N/A (no questions) · 04 empty note not sent, "(optional)" N/A (one field) · 05-07 N/A · 08 N/A (one case) · 09-10 N/A · 11 one filled button (Add note) · 12 N/A · 13 errors on the box with the fix, words kept · 14 tooltips on badges, icon buttons and relative times · 15-17 N/A · 18 all states in §4 · 19 two sections, one primary, three type sizes · 20 keyboard: Tab order writer → list → chips → lines; visible focus; 1024 px and 200 %.
UXL (§7): 01 one filled · 03 each note's actions sit in its card · 06 five chips · 09 Add note 44 px at 375 · 10 chips scroll, no page scroll · 12 skeletons and saving states · 14 badges by text, not colour.

## 5. Copy
Purpose: "Notes for your team, and everything that happened on this case, newest first." · For the client tooltip: "The client sees this note on their page. Leave it off for notes meant only for your team." · Mention tooltip: "The people you pick are told in their notifications." · Conflict: "Someone changed this note since you opened it. Your words are kept below." · 403 add: "Your role can read notes but not add them." · Too long: "Keep the note to 5,000 characters ({n} now)."

## 6. Contract and tests
* **Reads:** notes (`["pf","case-notes",caseId,token]`), timeline (`["pf","case-timeline",caseId,kinds,token]`, infinite query on `nextCursor`), people (`["pf","case-note-people",caseId,token]`); after each write, invalidate notes and timeline.
* **New read** `GET /api/runtime/cases/:id/notes/people` (`agent/case:show`): the firm's active staff `{ staffId, name, onCase }`, the case team first (question 1).
* **Tests:** `tests/check_csnt1d_panel_browser.cjs` (Playwright, 1440 and 375 px, axe): DP1 add → shows in notes and timeline, stored once; DP2 empty and 5,001 characters refused on the box; DP3 pin moves it first, unpin restores; DP4 edit → Edited, history shows both; a Case officer sees no Edit on another's note; DP5 conflict (two tabs) keeps the words; DP6 For the client hidden without the key, badge with it; DP7 mention picker lists only the firm's staff, the person is told once; DP8 kind chip and Show older; DP9 no session → SignInCard, typed note kept; another firm → the firm words. Plus `j_76` W8 passes. One pass and one fail per BR.
* **Touch:** new `web/src/runtime/case-notes.tsx`, one line in `web/src/runtime/cases.tsx`, `api/src/case-notes/{routes,service}.ts` (the people read), `web/src/runtime/MODULE.rows/CS-NT1d.md`, the test, this folder.

## 6b. Capability or scaffolding
Every element is capability, *Needed for the proof* (R1.76 W8). Scaffolding: PF-4's local sign-in stand-in. *Not built here:* rich text, delete, Undo, Recently deleted (part 2, not on `main`); the client's timeline (part 3b); a person's timeline tab (part 5).

## 7. Questions for the tech lead (recommendation first)
1. **Who may be mentioned:** every active staff member of the firm, the case team listed first, through one new read (`notes/people`, `agent/case:show`). *Recommended* (AG-13-22 says same-firm users; no staff list is readable with `agent/case:show` today).
2. **Where the panel sits:** under the case header, above Documents (read on every visit). *Recommended*; the other choice is the end of the page after Decision and closing.
3. **The bell's words for a mention** (review m-note on #3649: it reads "Something needs you"): add "{name} mentioned you in a note on {case}" in PF-18n's labels here (one line), or leave it to PF-18ns. *Recommended: here*, so the journey ends where the person is told.

## 8. Definition of ready
Acceptance tests named (§6) and j_76 W8; row text in the brief's part 4; API on `main` once #3649 merges; challenge answered (`challenge.md`); **approval:** the tech lead, after the independent challenge (P-223 (4)).
