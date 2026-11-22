# PF-30s — the find box in the top bar (concept addendum to PF-1's shell)

Status: addendum r1, 22 Nov · row: BACKLOG PF-30s (the agreed spec) · capability R1.102 "find a person or case" · waits on PF-30a (#2884) · challenge: `challenge.md` · approval: the tech lead (P-223 (4), no board).

## 1. Job and journey
A firm's staff member types a name, email, phone or file number in the top bar of any staff page and opens the record in one step. Persona: case officer or intake staff mid-call ("what's the file for Lena Park?"). Source: map row 102 (P-586), AG17-D6; AG-02 keeps Cmd+K for the command launcher, so the box opens with "/".

## 2. Layers (STANDARDS §2)
* **Data, rules, engine, contract:** none new. The box reads only PF-30a's `GET /api/platform/find?q=` (`FindResult`: groups by kind, hits with title, subtitle, matched_on, url; `partial` + `message`).
* **UI:** new files under `web/src/modules/platform/find/` (`find-box.tsx`, `find-words.ts`); one line in each staff frame's header controls: `modules/platform/frame.tsx` (PlatformFrame) and `modules/front-office/sales/sales-frame.tsx` (SalesFrame). PF-1's shell has no shared staff top bar of its own; these two frames are where the bearer-token staff pages live. The Studio and the Cases area act as simulated people with no staff token, so the box is not shown there (Not built; follows when those areas sign in as staff).
* **AI, governance:** none. Recent searches are never stored (no localStorage, no URL, no log).

## 3. Business rules
* BR-1 Opens with "/" from any staff page unless focus is already in a text field, text area, select or editable area (the "/" is then typed). Cmd+K / Ctrl+K is left alone (AG-02).
* BR-2 Asks only after 2 characters (trimmed, counted as characters) and a 250 ms pause; fewer → no request and no list. Over 100 characters → no request, the line "Type 2 to 100 characters to search." (PF-30a's 400 words).
* BR-3 Groups in this order and words: Leads and prospects (`person`, `prospect`), Companies (`company`), Clients (`client`), Cases (`case`), People on cases (`case_person`). A group with no hits is not shown; a kind the box does not know is not shown (CS-S1 part 2 adds the case kinds; their groups stay hidden until it lands).
* BR-4 Each row shows the title with the typed text highlighted where it appears (`<mark>`), the subtitle (the API's role, number and stage words), and what matched ("Name", "Email", "Phone", "File number").
* BR-5 Enter opens the active row, or the first when none is active; arrow keys move (wrapping), Escape closes the list then clears the box; a click opens. Opening navigates in the app to the hit's `url`.
* BR-6 States: searching ("Searching…"), results (count announced: "N results"), empty ("No matches. Try an email, phone or file number"), partial (the API's "Some results could not be loaded" above the results), error ("Search is not available right now. Try again." with the box kept), signed out (no box).
* BR-7 A late answer for an older text never replaces a newer one (sequence check).
* BR-8 Never shows what the API did not return: no counts of hidden records. Row batch 5's "3 more you cannot see" needs a count PF-30a does not return → Not built here; follow-up question below.

## 4. Layout
Header control, right side, before the person's name: a text input (search icon, placeholder "Find a person or file  /") 16 rem at ≥1024 px, flexible down to 10 rem at 375 px (no sideways scroll). The list is a popover under the input (max 28 rem wide, max 70 vh tall, scrolls inside), team tokens (`bg-surface-raised`, `border-border`, `text-text-muted`, focus ring as `controls.tsx`). ARIA 1.2 combobox: input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; list `role="listbox"` with `role="group"` + label per kind; a polite live region for the count, empty, partial and error lines.

### 4b. Best in class
* **Linear / GitHub** "/" to focus search, Cmd+K for commands: the split AG-02 asks for. Copied: "/" opens, Cmd+K untouched.
* **Clio Manage** global search: grouped by Contacts / Matters / Documents, each row with the matter number. Copied: groups by kind and the number on each row.
* **Salesforce Lightning** global search: typeahead after 2+ characters, highlighted match, Enter opens the top hit. Copied: all three.
* **WAI-ARIA APG combobox (list autocomplete)**, the published practice: active descendant, Escape, live count. Followed as written.
Beats them on: never storing recent searches (privacy of client names on shared desks) and saying plainly when part of the answer is missing.

## 5. Copy
Placeholder "Find a person or file" with a "/" key hint; label (visually hidden) "Find a person, company or file"; lines as BR-6; match words as BR-4.

## 6. Contract and tests
Contract: PF-30a's, read with its zod `FindResult` (web-side copy in `find-words.ts` types only). Check `tests/check_pf30s_find_box_browser.ts` (the row names `check_fd3_find_browser.ts`; the lane's task names `check_pf30s_*`, so this name) on an isolated copy (PLATFORM_IDENTITY=local, Sample firms): a pass and a fail each for find by name (opens the lead), by file number (opens the prospect), by email; "/" focuses from a page and is typed inside a text field; 1 character sends no request; a view.own user gets no hit for a colleague's lead; empty state words; error state on a 500 (route stubbed); late-answer ordering; keyboard only; axe; 375 / 1024 / 1440 no sideways scroll.

## 6b. Capability or scaffolding
All capability, Needed for the proof (R1.102). Not built: the hidden-count line (BR-8), the box in the Studio and Cases frames.

## 7. Questions (for the tech lead)
1. Hidden counts ("3 more you cannot see", row batch 5): needs PF-30a to return a count per kind of records found but not openable, which leaks existence to view.own users. Recommendation: leave out until the founder rules; the box shows only openable hits.

Definition of ready: acceptance test `tests/check_pf30s_find_box_browser.ts`; row text as agreed; decisions P-223 (4), P-572 answered.
