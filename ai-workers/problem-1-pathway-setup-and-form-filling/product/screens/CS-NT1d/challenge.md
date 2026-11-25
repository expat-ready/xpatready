# CS-NT1 part 4 (CS-NT1d): fresh challenge of concept r1

Challenger: a fresh context that did not draft the concept (skill screen-concept, section B), 25 Nov. I read `concept.md` r1, `design/board.html`, PR #3649's `api/src/case-notes/{service,routes,timeline}.ts` (branch `claude/admiring-fermat-ly00ih`, head b1af31e21), `PRODUCT.md`, `STANDARDS.md` §2-§6, `EXPERIENCE.md` §2-§7, `QUALITY.md`, BACKLOG row CS-NT1, `design/briefs/CS-NT1.md`, `tests/journeys/j_76.ts` W8, `web/src/runtime/cases.tsx`, `web/src/runtime/case-decision.tsx`, the AG-13 requirement (snapshot 2026-11-02, v1.19), and `api/src/case-access.ts`, `case-documents.ts`, `runtime.ts` where the timeline's words come from. `ai-workers/tools/freshness.sh` cannot run in this copy (`code/README-copies.md` is absent), so every statement about the team's code (concept §2's "none found") is **Unverified**. The concept's best-in-class section already says it is Unverified.

## Verdict
**Build after these changes.** The shape is right: one panel, sections rather than tabs, the API decides, and the session pattern is copied from CS-C1s. One Blocker remains. The timeline lines the board draws cannot come from the API as it stands, and the API's raw words would put ids, hashes and "US$0" on the main path. There are also six Majors, each a contained change to the concept.

Count: **1 Blocker, 6 Majors, 9 Minors.**

## Objections

### Blocker

**B1. The timeline's words are not the API's words (side 4 UX, 7 standards, 8 D10). *Needed for the proof.***
* *What breaks:* concept §2 says "Rules: none: the screen shows the API's answers", and the board draws lines such as "Uploaded the passport for the principal applicant (PDF)". The timeline sends each audit line's `summary` as it was written (`timeline.ts` line 146, `summary: r.summary`). Those summaries are log text.
* *Example (fact, high confidence, from the code):*
  * a document upload reads "Sample Owner uploaded Passport for the principal applicant on case 1a2b3c4d (PDF, 184233 bytes; no checklist line)" (`case-documents.ts` line 306);
  * opening a case reads "… opened case 1a2b3c4d on "…" released version 3 (3f9c0a1b22de) …", with a sha256 prefix (`runtime.ts` line 393);
  * a document read reads "… read 2 documents … (ai_vision; US$0)" (line 488);
  * a note pin reads "Note pinned on case 1a2b3c4d" (`service.ts` `audit()`).
  * Each summary already starts with the actor's name, so "{who} · {when}" says the name twice. Each **view** of a document writes a "viewed" line (line 404), so the timeline fills with views.
* *Evidence:* EXPERIENCE §5 [M] ("no hashes, IDs … on the main path"); QUALITY D10; AG-13-32 (v1.19): "per-locale presenters (bilingual verbs/labels)". The timeline needs a presenter, and neither the API nor the concept has one.
* *Fix:* add a presenter to the concept as rule BR-9: one map in `case-notes.tsx` from (`kind`, `type`) to plain words, as `case-decision.tsx`'s `WORDS`/`REFUSAL` maps do. For example:
  * `uploaded` → "Document uploaded"; `case.decision.recorded` → "Decision recorded"; `case.note.pinned` → "Note pinned"; `case.note.marked-client-visible` → "Note shown to the client";
  * a `note` line → its folded words;
  * an unknown pair → "{Kind} change".
  * The raw `summary` goes only behind a quiet "Details" fold on the line (EXPERIENCE §5's "Details" for admins).
  * Write the map's rows in §5 Copy. Add one test: a line with a known type shows its words and no 8-hex id; an unknown type shows the fallback.
  * Whether "viewed" and "read" lines belong on the timeline at all is question 2. This is not an API change (no new scope).

### Major

**M1. "Edited" shows on a note that was only pinned (side 2 data truth, 8 D2/D10). *Needed for the proof.***
* *What breaks:* BR-4 says "an edited note says 'Edited'". The API sets `edited: n.version > 1` (`service.ts` line 157). A pin, an unpin or a change of visibility each writes a new version (`change()`, `pin()` line 267). So a note whose words never changed says "Edited", and its History lists versions with identical words. The board's frame 1 shows that exact case: the pinned note is badged Edited.
* *Fix:*
  * (a) In `service.ts` (already in the concept's Touch list), `edited` becomes "a version's text differs from version 1": one `exists` in `current()`'s SQL, with a pass and a fail test (pin → not edited; text change → edited).
  * (b) History labels each version by what changed from the one before it ("Words changed", "Pinned", "Unpinned", "Shown to the client", "Made internal"). These labels are worked out in the panel from the history response's `text`/`pinned`/`visibility`, with no new read.

**M2. A note's visibility cannot be changed after it is added, and the brief's journey needs that (sides 1, 4; EXPERIENCE §2.8). *Needed for the proof.***
* *What breaks:* the concept offers "For the client" only on the writer. A note added as internal can never be shared. A note shared by mistake can never be taken back, because Delete is part 2 and is not on `main`. The client keeps reading it.
* *Evidence:*
  * the brief's part 4 named journey CS-NT1 W1 runs "add a note → pin → **mark client-visible** → the client sees it → edit …";
  * the brief lists the "visibility badge";
  * AG-13-21 says marking client-visible is "audited and badged";
  * the API already has `PUT …/:noteKey/visibility`, which needs `agent/note:share-with-client` in both directions;
  * EXPERIENCE §2.8: "undo where possible".
* *Fix:* add one quiet action per note, shown only with the key: "Show to the client" (confirmed in place: "The client will see this note on their page. Show it?") and "Make internal" (no confirmation). Each names its version and handles 409 as BR-5 does. In §6, name W1's walk without part 2's steps: add → pin → show to the client → the client's case read lists it → edit → make internal → the client's read no longer lists it → the timeline shows each step.

**M3. "Mentioned: {names}" has no data behind it (side 3 back end). *Needed for the proof* (as written).**
* *What breaks:* BR-6 says "the note says 'Mentioned: {names}'". `case_note` has no mentions column. `view()` returns none, the history returns none, and the timeline line returns none. The ids are only in the audit line's `detail.mentioned` (`service.ts` lines 222 and 251), which no read returns. The add's response doesn't say who was told either (line 224). The concept's §2 says "no schema" and its touch adds only the people read.
* *Fix (recommended):*
  * drop the persistent "Mentioned:" line;
  * right after Add, the saved state says "Note added. Told: {names}" from the people the writer picked;
  * DP7 checks the notification count, not a line on the note.
  * AG-13-22 asks only that the people be notified ("note-mention Notification linking to the note").
  * If the line is wanted, it is an API change, so it belongs in a follow-up row, not here.

**M4. No zod contract for the four reads (side 7 STANDARDS §6 [M]; side 6 retrofit). *Needed for the proof.***
* *What breaks:* STANDARDS §6: "Contract first: zod schemas in the shared package used by API and web". The sibling panel parses `CaseDecisionsView` from `contracts/runtime.ts`. #3649 adds no note or timeline schema (its diff does not touch `contracts/`), and the concept's §6 names query keys but no shapes. A builder would type the answers by hand.
* *Fix:* add `CaseNotesView`, `CaseNoteHistory`, `CaseTimelinePage` and `CaseNotePeople` to `contracts/runtime.ts`, matching the shapes in `view()`, `history()`, `read()` and the new people read. The panel parses every answer through them, as `useCaseDecisions` does. Add `contracts/runtime.ts` to Touch.

**M5. Add is not idempotent from the screen (side 2; STANDARDS §4 [M] "Idempotent creates"; QUALITY D5 "double click"). *Needed for the proof.***
* *What breaks:* the API takes `idempotencyKey` (`service.ts` line 64), but the concept never sends one. Ctrl/⌘+Enter pressed twice, or a retry after a timeout, stores the note twice and tells the mentioned people twice. The concept's DP1 says "stored once", but nothing in the design makes that true.
* *Fix:*
  * make one key per draft (`crypto.randomUUID()`) and send it on every Add of that draft;
  * make a new key whenever the words, visibility or mentions change, and after a success;
  * map `IDEMPOTENCY_KEY_REUSED` to a fresh key and a retry;
  * add a DP1 fail case: two fast Adds give one row.

**M6. At the top of the page, an unbounded panel pushes the case's working panels down (side 4 UX; EXPERIENCE §6 BIC-19). *Needed for the proof.***
* *What breaks:* the notes read has no paging (the API returns every current note), and the timeline's first page is 50 lines. With 15 notes and 50 lines, the panel is several screens tall. "Under the case header, above Documents" puts it above `PeopleAndFilings`, `DocumentsPanel`, `FormsPanel` and the Agent view. Those panels are what an RCIC works in on most visits, and the fixed-height skeleton does not stop the shift when the data arrives. The page already guards against late loads that move panels (`cases.tsx` lines 411-413: "placed below the case panels so its late load never moves them: check_c69_page_browser's focus check"). The concept's placement is also ambiguous: "under the case header" and "above Documents" are five panels apart (StageStrip, GovernmentSteps, ReleaseNotice, PeopleAndFilings and EarlierFactsCard sit between them).
* *Fix:* keep both lists short by default, using controls the concept already has:
  * the notes list shows the pinned notes and the 3 newest, then "Show all notes ({n})";
  * the timeline shows its first 10 lines, then "Show more", which reveals the rest of the page and then becomes Show older.
  * Name one exact mount line. Question 3 sets the place.
  * Add a test: with 30 notes and 60 lines, the panel's height at 1440 px is under one screen, and `check_c69_page_browser.cjs` still passes.

### Minor

**m1. The people read underspecified (side 3). *Needed for the proof.*** `CaseTeamMember.userId` is a string that may hold a staff id or a staff member's `actorId`. `case-access.ts` reads both: `teamIds = [staffId, actorId]`. So "onCase" must match both. The read lists `status = ACTIVE` only; the API's `mention()` does not check status (`service.ts` line 110), so the screen is the only filter. The writer is left off the list, since they are never told. Cap the chips at 20, with the words "At most 20 people", matching the API. Map 503 `MENTIONS_UNAVAILABLE` to "Mentions cannot be sent right now; your note is not saved yet. Remove the people or try later."

**m2. Conflicts without `current` (side 2, BR-5). *Needed for the proof.*** The serialisation 409 (`service.ts` line 169) is `NOTE_CHANGED` with no `current`, so "Use the current note" has nothing to show. A conflict on Pin or Show to the client has no words to keep. Fix: on any `NOTE_CHANGED` without `current`, refetch the notes and show "This note changed; here it is as it is now." For Edit, keep the typed words in the box.

**m3. The j_76 locator could match twice (side 8 D16). *Needed for the proof.*** W8 uses `getByRole("region", { name: /notes/i })` with no `.first()`. If the inner "Notes" section is also a labelled `<section>`, two regions match and Playwright's strict mode fails the step. Fix: only the panel is a region, labelled by its h2 "Notes and timeline". The inner "Notes" and "Timeline" are headings in plain `div`s. Say so in §4.

**m4. A disabled Add note cannot show its reason to keyboard users (EXPERIENCE §2.10; BIC-13, BIC-20). *Needed for the proof.*** A disabled button takes no focus, so its tooltip never opens from the keyboard. Fix: keep Add note enabled. On an empty box it shows "Write the note first." on the box (the API's own words) and moves focus there.

**m5. The counter must count as the API does (side 2). *Needed for the proof.*** The API counts code points after trimming (`[...t].length`). A counter that uses `.length` (UTF-16 units) shows 5,001 on a note the API accepts when the note has emoji or other non-BMP characters. Fix: count `[...text.trim()].length` and test it with a note of 4,999 emoji.

**m6. The read-only and key edges (side 7). *Needed for the proof.*** Without `agent/case:edit`, Pin is hidden too, not only the writer. Edit on a client-visible note also needs the share key (`editText` → `needShare`), so hide Edit there when the key is missing. PF-3 seeds the key on every role that holds edit today, so this is low risk.

**m7. A timeline line with no known person (side 4). *Needed for the proof.*** `actorName` is `null` for an actor that is not a staff member (for example a simulated Studio person with no `actorId` link). Fix: show "Someone outside the firm's staff list" instead of an empty "· 2 days ago". The raw actor goes behind Details.

**m8. The part 2 controls need a follow-up row (side 6). *Not built.*** The brief's part 4 lists a rich-text box, delete with Undo and Recently deleted. The concept rightly leaves them out because part 2 is not on `main`. Fix: in the Lead response, name the follow-up row that adds them once CS-NT1b merges, so R1.76's row does not close with them unbuilt.

**m9. Small specification gaps (side 4). *Needed for the proof.***
* (a) The kind chips: say they are single-select, with All as the default and `aria-pressed` on one chip.
* (b) The panel gets an anchor (`#notes`) so the bell's link (the API points the mention at the case) lands on it.
* (c) If question 3 of the concept is answered "here", add PF-18n's labels file to Touch.
* (d) A typed "@Name" tells no one. When the box holds "@" followed by a word, show the hint "Typed names tell no one; use Mention." (EXPERIENCE §2.8, prevent errors).

## What is sound
* **The API decides everything.** Keys, the author-or-admin edit, 404 for another firm, plain text of 1-5,000 characters and the version on each change all come from the routes, and the screen only shows them. This is correct and matches the routes in #3649 (keys checked as the routes declare them).
* **The session pattern is copied from CS-C1s.** It uses `staffApi`, `useMe`, `useStaffToken`, the inline SignInCard and keys under `["pf", …]`, so sign-out clears them. j_76 W8 seeds `xr-staff-session` the same way.
* **Sections, not tabs** (EXPERIENCE §2.2). There is one filled button (Add note), Edit happens in place with the page keeping its scroll, and History opens in place.
* **BR-5's conflict keeps the typed words,** and the 409 from `change()` carries `current`, so "Use the current note" is buildable for Edit.
* **The kind chips map one-to-one** onto the API's `NOTE`/`DOCUMENT`/`DECISION`/`ACTIVITY`. Show older follows the API's `more`/`nextCursor`.
* **No schema change, and nothing is invented:** part 2's controls are left out, and the line between scaffolding and capability is drawn correctly (§6b).
* **The j_76 W8 contract holds:** a region named /notes/i, a first textbox and a button named /add note/i, with the caveat in m3.
* **The states list is complete** against EXPERIENCE §4 (empty, loading, saving, failed, conflict, read-only, no session, 375 px).

## Back-end plan
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Notes list, badges | `case_note` (current version per `note_key`) | `GET cases/:id/notes` → `CaseNotesView` (M4) | BR-2, BR-3; `edited` = text differs from v1 (M1, `service.ts current()`) | DP3, DP4 + M1 pass/fail |
| Writer, Add | `case_note` v1, `audit_event`, notification | `POST cases/:id/notes` with `idempotencyKey` (M5), `mentions` | BR-1, BR-2, BR-6 | DP1 (with double-Add fail), DP2, DP6, DP7 |
| Edit, History | `case_note` vN | `PUT …/text` (`version`), `GET …/versions` → `CaseNoteHistory` | BR-4, BR-5; per-version change label (M1 b, in the panel) | DP4, DP5, m2 |
| Pin | `case_note` vN | `PUT …/pin` (`version`) | BR-3, BR-5 | DP3, m2 |
| Show to the client / Make internal | `case_note` vN, `audit_event` | `PUT …/visibility` (`version`; share key) | BR-2 (M2) | new DP: shown → in `clientNotesOf`; made internal → gone |
| Mention picker | `platform_staff`, `case_team_member` | **new** `GET cases/:id/notes/people` (`agent/case:show`) → `CaseNotePeople` | ACTIVE only, same firm, team first (both id forms, m1); who is listed: question 1 | DP7 + firm-B person absent |
| Timeline | read view over `audit_event` + `case_note` | `GET cases/:id/timeline?kinds=&cursor=` → `CaseTimelinePage` | BR-7; presenter BR-9 (B1) | DP8 + B1 pass/fail |
| Firm, keys, session | `platform_staff`, keys | 404 `NOT_FOUND`, 403 | BR-8 | DP9 |

The only API code this part touches is in `service.ts`/`routes.ts`: the people read and the `edited` fix. The rest is `contracts/runtime.ts`, `case-notes.tsx`, one line in `cases.tsx`, the test and the module row.

Fact for the tech lead (outside this part, not an objection to the screen): the notes and timeline routes check only the firm (`subjectOf`), not `case-access.ts`'s own/all case scope that `case-document-reads.ts` applies. A staff member with `agent/case:view.own` can read the notes of a case they are not on. This belongs to #3649's follow-up, not to this panel.

## Questions for the founder (recommendation first)
1. **Whom can a note mention?**
   * *Recommended:* only the firm's active staff who may open this case (the case team first). A person who cannot open the case would get a bell that leads nowhere.
   * *The other choice:* every active staff member of the firm, as the concept proposes and as AG-13-22's "same-firm users" literally reads.
2. **Do "viewed" and "read" lines show on the case timeline?**
   * *Recommended:* no, hide them by default. They are access records, not things that happened on the case, and a busy case gets several a day. They stay in the workspace Activity page.
   * *The other choice:* show them under "Other".
   * This only changes which `type` values the presenter (B1) shows.
3. **Where does the panel sit?**
   * *Recommended:* directly under the case header (after the client line, before the stage strip), kept short (M6). Notes are read on every visit.
   * *The other choice:* after Decision and closing, at the end of the case panels.

## Lead response
*Builder's answers in concept r2, for the tech lead to accept or overrule:*
* **B1** accepted: BR-9, one words map in the panel (§5), the summary behind Details, access lines hidden (question 2), test DP12.
* **M1** accepted: `edited` = the words differ from version 1 (one line in `service.ts`); History labels what changed; DP11.
* **M2** accepted: Show to the client / Make internal per note, behind the share key; DP10.
* **M3** accepted: no "Mentioned:" line; "Told: {names}" after Add.
* **M4** accepted: four zod shapes in `contracts/runtime.ts`.
* **M5** accepted: one idempotency key per draft (BR-10); DP1's double-Add fail.
* **M6** accepted: directly under the case header, kept short (pinned + 3 notes, 10 lines), fixed-height skeleton.
* **Minors:** 1, 4-7 and 9 go into the build as written. 2: a 409 without a current note shows "Open the note again" and keeps the words. 3: the inner sections are headings, not labelled regions, so j_76's locator matches once. 8: a follow-up line on row CS-NT1 for part 2's controls in this panel, after part 2 merges.
* **Outside this screen:** the case scope gap in the notes and timeline routes (`caseScope` not applied; part 1 on `main` and `case-close.ts` alike) is raised with the tech lead on #3649 as a follow-up row. Only a firm that removes `agent/case:view.all` is affected; every seeded role holds it today.

## Agreement

## Build discoveries
