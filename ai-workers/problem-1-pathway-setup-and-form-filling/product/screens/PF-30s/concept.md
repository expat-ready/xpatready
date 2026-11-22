# PF-30s — the find box in the top bar (concept addendum to PF-1's shell)

Status: addendum r2, 22 Nov (r1 challenged: `challenge.md`, Ready after changes; every Major and Minor taken) · row: BACKLOG PF-30s (the agreed spec) · capability R1.102 "find a person or case" · waits on PF-30a (#2884) · challenge: `challenge.md` · approval: the tech lead (P-223 (4), no board).

## 1. Job and journey
A firm's staff member types a name, email, phone or file number in the top bar of any staff page and opens the record in one step. Persona: case officer or intake staff mid-call ("what's the file for Lena Park?"). Source: map row 102 (P-586), AG17-D6; AG-02 keeps Cmd+K for the command launcher, so the box opens with "/".

## 2. Layers (STANDARDS §2)
* **Data, rules, engine, contract:** none new. The box reads only PF-30a's `GET /api/platform/find?q=` (`FindResult`: groups by kind, hits with title, subtitle, matched_on, url; `partial` + `message`).
* **UI:** new files under `web/src/modules/platform/find/` (`find-box.tsx`, `find-words.ts`); one line in each staff frame's header controls: `modules/platform/frame.tsx` (PlatformFrame) and `modules/front-office/sales/sales-frame.tsx` (SalesFrame). PF-1's shell has no shared staff top bar of its own; these two frames are where the bearer-token staff pages live. The Studio and the Cases area act as simulated people with no staff token, so the box is not shown there (Not built; follows when those areas sign in as staff).
* **AI, governance:** none. Nothing typed is stored: browser autocomplete off and no `name`, no history, no query cache (plain calls), no URL, no log; the box clears when a record opens, and unmounts on sign-out or session end.

## 3. Business rules
* BR-1 Opens with "/" (`e.key`, so any keyboard layout) from any staff page unless focus is in a text field, text area, select or editable area (the "/" is then typed), a modal dialog or drawer is open, Ctrl, Meta or Alt is held, or an input method is composing; the "/" is not typed into the box. Cmd+K / Ctrl+K is left alone (AG-02).
* BR-2 Asks only after 2 characters (trimmed, counted as characters) and a 250 ms pause; fewer → no request and no list. Over 100 characters → no request, the line "Type 2 to 100 characters to search." (PF-30a's 400 words).
* BR-3 Hits stay in the API's rank order (its groups are already ranked, challenge M1); each kind gets its group words: `person` and `prospect` → Leads and prospects, `company` → Companies. CS-S1 part 2's case finder (#2913, open) answers `case` → Cases and `case_person` → People on cases, so those words are in the box now; Clients get theirs when a finder answers a client kind (Not built). A kind without words shows under "Other", never hidden; the count is the rows shown.
* BR-4 Each row shows the title with the typed text highlighted for a name or number match (ignoring case and accents, text nodes only), the subtitle as the API sends it (role and number, e.g. "Prospect P-00012"; the stage name is Not built: PF-30a does not send it), and every match word ("Name", "Email", "Phone", "File number").
* BR-5 List autocomplete with automatic selection: the first row is marked (`aria-selected`, highlight) as Enter's target; arrow keys move the mark (wrapping); Enter opens it (not while composing); Tab closes the list and moves on; Escape closes the list, then clears the box, then leaves it; a click opens. Opening navigates to the hit's `url` and clears the box.
* BR-6 States: searching ("Searching…", shown, not announced), results ("N results"; at 8 or more "N best matches. Type more to narrow."), empty ("No matches. Try an email, phone or file number"), partial (the API's "Some results could not be loaded" above the results; with no hits "No matches in what loaded."), error ("Search is not available right now. Try again.", the text kept), a 401 (the session ends, the frame's sign-in card, no error line), terms pending (no box in PlatformFrame; SalesFrame has no terms gate, so its box shows the server's terms words on the 428), signed out (no box). Enter on the error line asks again.
* BR-7 A late answer for an older text never replaces a newer one (sequence check). Requests are not aborted: `staffApi` takes no signal (a follow-up if the door gets slow).
* BR-8 Never shows what the API did not return: no counts of hidden records. Row batch 5's "3 more you cannot see" needs a count PF-30a does not return → Not built here; follow-up question below.

## 4. Layout
Header control, right side, before the person's name: from 640 px a text input (search icon, placeholder "Find a person or file", a "/" key label from 1024 px) 14 rem, 16 rem from 1024 px; below 640 px a 44 px Find icon button that opens the input across the header with a Close button (challenge M4: the header has 343 px at 375). The list is a popover under the input (28 rem from 640 px; below it pinned 1 rem from each screen edge; max 70 vh, scrolls inside), team tokens (`bg-surface-raised`, `border-border`, `text-text-muted`, focus ring as `controls.tsx`). ARIA 1.2 combobox: input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; list `role="listbox"` with `role="group"` + label per kind; a polite live region for the count, empty, partial and error lines.

### 4b. Best in class
* **Linear / GitHub** "/" to focus search, Cmd+K for commands: the split AG-02 asks for. Copied: "/" opens, Cmd+K untouched.
* **Clio Manage** global search: grouped by Contacts / Matters / Documents, each row with the matter number. Copied: groups by kind and the number on each row.
* **Salesforce Lightning** global search: typeahead after 2+ characters, highlighted match, Enter opens the top hit. Copied: all three.
* **WAI-ARIA APG combobox (list autocomplete)**, the published practice: active descendant, Escape, live count. Followed as written.
Beats them on: never storing recent searches (privacy of client names on shared desks) and saying plainly when part of the answer is missing.

## 5. Copy
Placeholder "Find a person or file" with a "/" key hint; label (visually hidden) "Find a person, company or file"; lines as BR-6; match words as BR-4.

## 6. Contract and tests
Contract: PF-30a's, read with its zod `FindResult` (web-side copy in `find-words.ts` types only). Speed: the check measures the door's answers to the box (p95 < 200 ms, STANDARDS §9) on the copy's Sample firms; the "100 Sample firms" load is Not built here (no 100-firm seed; PF-30a's budget). Check `tests/check_pf30s_find_box_browser.ts` (the row names `check_fd3_find_browser.ts`; the lane's task names `check_pf30s_*`, so this name) on an isolated copy (PLATFORM_IDENTITY=local, Sample firms): a pass and a fail each for find by name (opens the lead), by file number (opens the prospect), by email; "/" focuses from a page and is typed inside a text field; 1 character sends no request; a view.own user gets no hit for a colleague's lead; empty state words; error state on a 500 (route stubbed); late-answer ordering; keyboard only; axe; 375 / 1024 / 1440 no sideways scroll.

## 6b. Capability or scaffolding
All capability, Needed for the proof (R1.102). Not built: the hidden-count line (BR-8), the box in the Studio and Cases frames, the Clients, Cases and People on cases groups and the row's "open the client" and "open the case" journeys (wait on CS-S1 part 2 / CS-30c; the lead and prospect journeys prove the box now), the stage name in a person's row (PF-30a's subtitle), the 100-firm timing.

## 7. Questions (for the tech lead)
1. Hidden counts ("3 more you cannot see", row batch 5): needs PF-30a to return a count per kind of records found but not openable, which leaks existence to view.own users. Recommendation: leave out until the founder rules; the box shows only openable hits.

Definition of ready: acceptance test `tests/check_pf30s_find_box_browser.ts`; row text as agreed; decisions P-223 (4), P-572 answered.
