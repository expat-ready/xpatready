# FO-5s part 2 review: Settings › Retainer templates (S1) and part-1 minors (R1.53)

Reviewer: independent (P-303), Opus 5.5. I did not build this. Branch `claude/screens-fo5s-templates`, **commit 94658d9e7a5e05759bc90f7da059de8b5ff3b407**, stacked on #2802's head e6a03694e (approved earlier). Scope: `git diff e6a03694e 94658d9e7` without PNGs: 12 files, +311 / -22. Concept r2 §4 S1, BR-1, BR-17. Read 21 Nov 2026. I used isolated copies on :4571 and :4572 only, never :4400. Afterwards I put back the screenshots the suites rewrite (FO-5s, J-53) and deleted my walk scripts.

**Verdict: Block (Changes needed).** 1 Major, 9 Minors. Journey score **8/10, pass** (`journey-test-reviewer-2026-11-21-part2.md`).

## 1. Runs (this commit, fresh copies)
| Suite | Result |
|---|---|
| `check_fo5s2_templates_browser.ts` (rev2_fo5s :4571) | 16/16 |
| `check_fo5s_retainer_screens_browser.ts` (same copy, after the above) | 41/41 |
| `journeys/j_53.ts` (rev2_j53 :4572) | 21/21. W0 is by screens: menu → Download a starter template → Upload → panel "1 of 26 items marked" |
| `graph.mjs` | exit 0 (G1 0 · G2 0 · G3 192 · G4 0 · G5 0 · G6 16) |
| My own walks (Playwright: keyboard, 400/720@2x/1024/1440, two tabs, double click, hostile files, Case Officer by URL and API, part-1 minors live) | findings below |

## 2. D1-D20
D1 3: list, upload with refusal and warning, starter, checklist, new version, active/inactive all work. BR-1's "placeholders found are listed" and S1's "Placeholders you can use" are not built (M1). Versions are not downloadable (m1).
D2 4: a double-clicked Upload stored one row. A duplicate name gets 409. Version n+1 has a server guard. But a stale panel still uploads: it said "Upload version 3" and made version 4 (m4).
D3 5: reuses FO-5/FO-5b routes, `TemplateChecklist`, Panel, Table, Notice.
D4 N/A.
D5 4: errors keep what was typed. After a new version is uploaded, the file input still shows the file while the state is cleared (m2).
D6 4: Code source line with "current to" date, "Unconfirmed: no counsel"; audit lines for upload, each version and active (DB checked).
D7 N/A (no AI).
D8 5: Sales › Settings › Retainer templates; menu item under Settings; phone links too.
D9 3: one primary per panel. Writing your own template has no "what can I use" list (M1). Focus falls to BODY after a panel closes (m3).
D10 4: plain refusals ("{client.passport} is not a placeholder we know", "We could not read this file.", "A template is at most 5 MB."). Chips use `title` only (accepted pattern from part 1, m2 there).
D11 4: toasts, busy buttons, warnings kept as notices. Stale and file-input states are not right (m2, m4).
D12 3: team look. The name link has extra padding and sits below the other cells. One long name pushes Kind…Updated out of view on every row (m5).
D13 4: axe clean at 400, 720 CSS px (200 %), 1024 and 1440 px. No sideways page scroll. Keyboard path complete (6 Tabs to the menu item, Enter in Name submits). Focus is not returned (m3).
D14 5: SalesFrame, Panel, Table, Pill, Notice.
D15 5: list in 34 ms; one list request, one checklist request per open panel; no per-row calls.
D16 3: S1 rules have pass and fail tests, and "No fee" fails if `cad()` is reverted. The four part-1 minor fixes (n1, empty pick, roles in words, "not sent yet") have no test (m6).
D17 simulated only.
D18 4: checklist shows the Code's source and date. A template's own placeholders are only counted, never shown (M1).
D19 5: R1.53 now walks fully by screens (§5).
D20 simulated only.

## 3. BIC scorecard (concept §4c; S1 and the touched S2/S3/S4)
| Id | Score | Evidence |
|---|---|---|
| BIC-01 | Met | Signer emails and roles come from the records, also after Save (walk 3, n1 fixed) |
| BIC-02/03/05/06/07/08/09/10/15/17 | N/A | concept §4c. S6 is not in this part |
| BIC-04 | Met | A fee-less template is a warning, not a refusal. "missing" stays normal. CAD 0.00 reads "No fee" and does not block (ruling P-628) |
| BIC-11 | Met | Page: "Upload template" filled. Upload panel: one filled. Template panel: no filled button, only outline "Make inactive" and "Upload version n" (`template-panel-1440.png`) |
| BIC-12 | Met (S3/S4) | Check before sending and the Send panel show "No fee" (walk 3, `nofee-send`) |
| BIC-13 | Partly | Name, file, unreadable, size and unknown errors show on the field. "A template with this name already exists." shows only as a panel notice (Name not marked invalid, m7). After a version upload, "Choose a .docx file." appears under an input that shows starter.docx (m2) |
| BIC-14 | Partly | "How we check" is visible text (good). Active/Inactive and "warning" chips are `title`-only. Writing a template needs the placeholder list, which is missing (M1) |
| BIC-16 | N/A this part | |
| BIC-18 | Met | Empty state uses the concept's words and offers the starter (Sample, Unconfirmed: no counsel). Loading text. Error notice. Case Officer told who sets templates |
| BIC-19 | Met | One heading and one primary at 1440 and 1024 (`templates-1440.png`, walk `i-1024.png`) |
| BIC-20 | Partly | Keyboard-complete and 200 % works. Focus lost to BODY after Upload, Escape or Close (m3) |

## 4. Issues (ranked)
**Major (Must, blocks the merge)**
* **M1. A firm cannot see which placeholders it may use, or which ones its template has (BR-1, S1; EXPERIENCE §2.8 [M] "prevent errors before messaging them").**
  - The concept's Upload panel is "name, `.docx` file, then **Placeholders found** (known ✓, unknown refused, named) and a **Placeholders you can use** list". BR-1 also says "placeholders found are listed".
  - `templates-page.tsx:86-93` has only name and file. The template panel (`:94-112`) and the table (`:80`, a count: "17") never list them.
  - `GET /api/front-office/retainer-templates/placeholders` was added for exactly this help (concept §7 gap 8). It exists, but no page calls it (graph: `webUse:false`, `pages:[]`). The upload answer's `placeholders` is dropped (`:49`).
  - **Failing scenario (walked):** the Owner uploads the firm's own Word retainer with `{client.full_name}` or `{x.unknown0..13}`. The panel says "{x.unknown0} is not a placeholder we know; … and 4 more." and nothing on the screen says what *is* known, or how to write the fee rows (`{#fees}…{/fees}`). A template with no placeholders is accepted with two warnings and fills nothing. The only way out is to reverse-engineer the starter.
  - **Fix:** in the Upload panel, render the `/placeholders` list as "Placeholders you can use" (label + `{name}`, the fee loop shown). In the template panel, list the template's own placeholders ("Placeholders found"). Add a pass test (the list matches the API) and a fail test (unknown still refused and named).

**Minors (Should)**
* m1 Template panel: "versions (each downloadable)" (S1) is missing. FO-5 has no template-file route (FO-5 review part 2, m11). Name it as a gap in the PR or the row.
* m2 `templates-page.tsx:49,63-67`: after "Upload version n", `setFile(null)` clears state but the uncontrolled input still shows starter.docx. Clicking "Upload version n+1" then says "Choose a .docx file." under it (walk `f-file-after-version.png`). Fix: reset the input (a `key` bump) with the state.
* m3 `templates-page.tsx:86,94`: neither Panel passes `returnFocus`, so after Upload, Escape or Close focus is on BODY (WCAG 2.4.3). `types-page.tsx:144` and `lead-owner.tsx:49` show the pattern.
* m4 Stale panel: the client sends no expected version, so a tab opened at v2 uploads "version 3" as v4 with no notice. The toast states the real number. Send the version and let the server answer 409 CHANGED.
* m5 `templates-page.tsx:80`: the name is a `Button` (`whitespace-nowrap`). A 119-character name (allowed: max 120) hides Kind, Version, Placeholders, Status and Updated for **every** row at 1440 and 1024 (walk `l-long-1440.png`). There is no page scroll, only an inner one. Fix: `whitespace-normal text-left` on that button.
* m6 Tests: the n1 / empty-pick / roles-in-words / "not sent yet" fixes have no test, so removing any of them stays green. All four work live (walk 3). Also `check_fo5s_retainer_screens_browser.ts:63` still says the template "cannot be done by screens yet".
* m7 `templates-page.tsx:46`: a 409 NAME_TAKEN is not mapped to the Name field (EXPERIENCE §2.10, on the field).
* m8 BR-1: "the upload panel offers Download a starter template". It is only on the page header.
* m9 `templates-page.tsx:33`: `revokeObjectURL` right after `click()` can cancel the download outside Chromium. Revoke on a timeout.

Not findings (outside this diff, for the Lead): the Sample starter marks only 1 of 26 Code items (FO-5/FO-5b content), so a firm that starts from it sees 25 unmarked. The draft's checklist link opens the in-page list, not S1, where Owner/Admin fix it (BR-17 "where Owner and Admin can fix it"; part 1 code). Open from part 1: m3, m8, m9, n2.

## 5. Is R1.53 now whole by screens?
**Yes.** Done-when, walked on this commit:
* The draft shows the Code's 26 items, each marked or not, never blocking and labelled Unconfirmed: no counsel (retainer page and the template panel).
* Each Save is a new version until sent.
* A sent version never changes: Edit after Send made v3, v2 kept its sent time (DB). The card now says "Version 3 is not sent yet: … cannot sign until it is.".
* The template no longer needs API setup: J-53 W0 uploads it by screens. The P-33 point from part 1 §5 is closed.

M1 is an S1 / BR-1 gap, not a Done-when gap. "Completes: R1.53" is justified once M1 is fixed. The FO-5s row itself stays open (S6, S7, Sign as the firm wait on FO-6).

## 6. Part-1 minors and the ruling, walked live
* **n1 fixed:** contacts keep their email right after Save, without a reload.
* **Empty pick:** with a signer set, picking "Choose who signs" leaves Save disabled.
* **n3 fixed:** roles read "Primary contact", "HR", "Billing".
* **"Not sent yet":** works as described above.
* **CAD 0.00 (ruling P-628):** reads "No fee" in Check before sending and in the Send panel, and Send went through.
* **Server authorisation:** a Case Officer gets 403 on upload, PATCH and starter. The page says who sets templates, with no Upload.

## 7. Not checked
A real screen reader. D17/D20 with an intended user. A browser other than Chromium (m9 is reasoned). Consultation-kind templates (no screen makes one). Retrofit mapping (no build-notes for part 2).

**Verdict: Block** (94658d9e7a5e05759bc90f7da059de8b5ff3b407). Fix **M1** (`templates-page.tsx:86-112`: placeholders you can use and placeholders found, with a pass and a fail test). Fix the Minors or list them in the PR.
