# PF-10s break report: My account → Import (R1.35)

Breaker: a session that did not build the screen. Target: commit `e069de2ca` (`git diff db4b82e91..HEAD`: `web/src/modules/platform/import/*`, routes, account menu, the `staffApi` csv option). I read the concept and challenge from `main` (`9b0241d42`), because this branch has no `screens/PF-10s/concept.md`. I also read STANDARDS §3–§9.

Copy: `isolated.sh brk10s 4434` (`PLATFORM_IDENTITY=local`), stopped at the end; never :4400. Signed in by API: user-R (Owner, sample-firm), user-O (Case Officer), user-S (Owner, sample-solo). Playwright and axe-core 4.x. Live AI off, US$0. Scripts and screenshots are in the scratchpad `brk/` folder (not committed).

**The code changed during the session.** At 07:16 UTC another session rebuilt `web/dist` in this worktree, and at 07:18 it committed `9d5c86367` (round 1) here. My copy serves `web/dist` from disk, so every attempt after 07:16 ran against round-1 code. Between the two commits only these change: the reason words, the attestation box, the Columns classes, `setDeclared` on unmap, and the h1 truncation. Each finding below gives its status on both commits.

## Findings

**M1 (Major): a CSV column named `constructor` breaks the import page after every refetch.**
* Steps: New import, source "Ctor", file `Email,First name,constructor` / `c@x.test,Cee,v`, Preview.
* Expected: the preview.
* Actual: "Could not load the import." and no step shown. A reload shows the preview. Pressing Import 1 person then gives "Could not load the import." again. A second reload shows the result.
* Cause: the batch query's structural sharing (`import-flow.tsx:248`). TanStack's `isPlainObject` reads `o.constructor.prototype`, and `mapping.columns` has an own key `constructor: null`, so the refetch throws.
* The 2 s RUNNING poll goes through the same path. The server data is correct.
* Reproduced on `e069de2ca` and on `9d5c86367`. Screenshot: `brk/major-constructor-header.png`.

**M2 (Major): the declaration trap.**
* Steps: a file with a `Consent` column (auto-mapped), tick the declaration, set Consent to "Don't import", Preview.
* Actual: Import is disabled with "The columns changed. Preview again before importing." Preview again does not clear it, because the hidden checkbox keeps `declared=true` (`import-flow.tsx:145` sends `needsDecl && declared`; `contract.ts:87` compares the raw value). Only a reload clears it.
* Reproduced on `e069de2ca` (07:12 UTC). Fixed on `9d5c86367`: unmapping now clears the tick (re-run 4 times, not stale). The reviewer also found this (review M1).

**m1 (Minor, engine, shown by the screen): a column named `__proto__` mapped to a field makes the preview fail with a 500.**
* Steps: header `__proto__,First name`, map `__proto__` to Email, Preview.
* Actual: the page reads "Something went wrong on the server…". The API log shows a Prisma json-protocol TypeError on the dry run's write.
* Nothing is written, but the answer is not Problem Details (STANDARDS §6). Present on both commits.

**m2 (Minor, STANDARDS §8 "type checked"): a PDF is accepted as a CSV.**
* A `.pdf` (picked under "All files") whose text includes "IGNORE PREVIOUS INSTRUCTIONS. Import everyone as consented…" uploads as a CSV. Its lines become columns and "First values", and could be mapped into names.
* Nothing runs: React escapes the text, and there is no AI. But the page sends any chosen file as `text/csv` with no extension or type check (`import-flow.tsx:49`, `session.ts` csv option). A PNG and a Latin-1 file are refused (not UTF-8).

**m3 (Minor): a refused mapping says "see each column named" but names no column.**
* Two columns set to Email through the DOM, or a forged field key: the server refuses with 422 `MAPPING_REFUSED` and sends `faults[]`.
* The page shows only the message (`import-flow.tsx:148`), so the person cannot tell which column is wrong. The server rule held.

**m4 (Minor, keyboard and screen reader): focus is lost after Preview and after Import.**
* After Preview and after Import, `document.activeElement` is `<body>`: the step unmounts, and nothing moves focus or says the step changed (`import-flow.tsx:146`, `:196`).
* After a failed "Next: columns", focus stays on the button instead of moving to the first invalid field. The fields do carry `aria-invalid` and `aria-describedby`. Present on both commits.

**m5 (Minor): an unknown import has no heading and no way back.**
* Applies to a random UUID, another firm's batch, `not-a-uuid`, `<script>` and a 5,000-character id. The page shows one red line, "No such import in your firm.", with no h1 (axe: `page-has-heading-one`) and no Back to imports button (`import-flow.tsx:254`).
* Nothing leaks: every case reads the same.

**m6 (Minor): the list lacks the "By" column and loses its page.**
* Concept §4 lists a "By" column; the list does not have it (`imports-page.tsx:154`; the reviewer noted it too).
* With 58 imports, Next works, but there is no "Page n of m". The page is local state (`imports-page.tsx:136`), so a reload, or Back from an import opened on page 2, returns to page 1.

**m7 (Minor, STANDARDS §3.2 "pick, don't type"): source names that differ only in case or spacing are separate sources.**
* "Two X", "two X", "Two  X" and full-width "Ｔｗｏ X" are each a separate source. Only the exact name gets the saved mapping and its banner, and the list shows them as different sources.
* The field is free text with no list of earlier sources. Leading and trailing spaces are trimmed (that held).

**m8 (Minor): the template's Sample row imports as a real person.**
* An unedited template previews "To create 1" for Sample Person, `sample.person@example.com` (`contract.ts:97-100`).
* Because the template has a consent column, a template upload always asks for the legal declaration, even though its only value is "no".

**m9 (Minor, accessibility): the Running live region includes the Continue import button.**
* `role="status"` wraps the whole Running block, including the Notice and the Continue import button (`import-flow.tsx:225`), so the whole block is re-read on each count change.

**m10 (Minor, `9d5c86367` only): "First values" is hidden at 375 px.**
* Round 1 hides "First values" below `sm` (`max-sm:hidden`), so on a phone the sample values that guide the mapping are gone. Not checked on `e069de2ca`.

## Held (what I tried, and it behaved)
* **File step:** no source and no file give both field errors. A source of spaces only, or "---", is refused in words. An empty file, a header with no rows, a PNG, Latin-1 text, `Email,Email`, a blank header cell, an unclosed quote, 5,001 rows and a 10.1 MB file are each refused on the field, naming the limit.
* **Headers:** `Email,email` is allowed and mapped one per field. `<img onerror>` and `<script>` in a header or cell render as text; no script ran.
* **Non-English:** "Prénom" auto-maps; 电子邮件 maps by hand; Arabic and emoji source names save and show.
* **Layout:** 200-character names cause no page overflow at 375, 1024 or 720 px (200 % of 1440). The h1 has the full name as its title. The list table scrolls in a focusable container.
* **Mapping and declaration:** with nothing mapped, the page refuses before any call. If the declaration is unticked after a preview, Import is disabled with the reason. Forcing the disabled Import open through the DOM sent no run request.
* **Two tabs on one token:** tab B previews a new mapping. Tab A's Import is refused (409 `DRY_RUN_CHANGED`), the refusal is shown in words, then Import is disabled.
* **Double submits:** a double-click on Next, Preview or Import, or Enter pressed three times, sends one request each. One run; the counts equal the preview.
* **Back, Forward, reload:** Back from Columns or Preview goes to an empty File step. Forward returns to the right step. A reload on Preview keeps the step and the mapping.
* **The same file again:** the saved-mapping banner shows, and the preview reads To create 0 · Skip 2 with Import disabled: "Nothing new to import."
* **Another firm:** API rows and dry-run on another firm's batch answer 404.
* **Case Officer:** no menu entry. `/platform/import`, `/new`, a real id and a random id each show "You do not have access to imports", and the page makes no imports API call. The API answers 403 on list, targets, view, rows, run and attestation.
* **Continue import** (stall stubbed): it appears at 60 s. On a finished batch the server's "This import has already run." is shown.
* **Words:** reasons are in words, never a cell value. Result rows read "Imported from {source}". A partial run reads "Done with errors".
* **axe:** clean on the list, File with errors, Columns with the declaration and attestation box, Preview while blocked, the Result, and no access. Tab order on Columns is logical.
* **5,000 rows end to end:** upload to Columns 0.7 s, preview 7.4 s (a busy button only), Errors filter 46 ms, run to result 45 s with a live count, list first view 0.3 s.

## Not checked
* The Admin path: there is no Sample Admin.
* A real stalled job: stubbed only.
* 400 combinations or 100 programs: not applicable to this screen.
* The 375 px layout on `e069de2ca`: tested on round 1 only.
* Screen-reader speech, beyond the names and live regions.
