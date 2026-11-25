# CS-D5 fresh challenge: preview for staff review (R1.68)

Written 22 Nov 2026 by an independent challenger (a fresh agent that did not draft the concept), following skill `screen-concept` §B. **Read:** `concept.md`, `design/csd5-boards.html`, BACKLOG rows CS-D5 and CS-D1, briefs `design/briefs/CS-D5.md` and `CS-D1.md`, `PRODUCT.md` §4, `STANDARDS.md` §1-§3, `EXPERIENCE.md` §2-§6 (BIC-01..20), `QUALITY.md` D1-D20, AG-09 v1.27 (AG-9-16, -20, -24, -32, -53, -55, §3.8, §3.x signed URLs, BR-9, data model, stories), DECISIONS P-607 and P-587, and on `main` at f393f44eb: `api/src/case-documents.ts`, `api/src/case-checklist.ts` (routes), `api/src/front-office/files.ts` (`FileLinks`), `web/src/runtime/checklist.tsx`, `web/src/runtime/documents-drawer.tsx`, `web/src/components/ui/controls.tsx`, `api/src/platform/files/file-type.ts`, `ports/files.ts`, `prisma/schema/evidence.prisma`.
**Freshness:** `bash ai-workers/tools/freshness.sh` fails (`FileNotFoundError: code/README-copies.md`). The team's code capture `code/` is not in this copy, so whether the team already ships a viewer, and every team-source claim, is **Unverified**. Requirement text is the name-free copy `domain/requirements-2026-11-02/`.

## Verdict
**Build after these changes.** Part 1 (API) can start once M1 and M2 are settled in the brief; part 2 (screen) also needs M3 and M4 ruled. No blocker: the safety design (clean files only, PDF.js to a canvas, scripts off, bytes into memory, same reach as the download) is sound.

## Objections

### Blocker
None.

### Major

**M1. The link renewal (BR-7) cannot happen under the concept's own fetch rule (BR-2), so its test cannot fail.** *Needed for the proof.*
* What breaks: BR-2 fetches the bytes once into an `ArrayBuffer` that PDF.js reads from memory; PDF.js given `data` makes no further requests, so a page turn after expiry never touches the link. BR-7 ("a page turn after expiry asks for one new link"), the "This preview ended" state, BR-5's "PDF.js's repeat fetches" and the §6 test "an expired link renews once (injected clock)" describe a path that does not exist. A builder either writes dead code to make the test pass or makes the viewer re-fetch per page, which breaks BR-2.
* Example: officer opens a 40-page bank statement, reads for 12 minutes, turns to page 30: page 30 is drawn from memory; nothing expires, nothing renews.
* Evidence (Fact): concept BR-2 "Bytes are fetched once into memory (`fetch` … → `ArrayBuffer` for PDF.js …)"; BR-7; §6 part 2 BR-7 test. AG §3.8 key screens ask for a "signed-URL with visible expiry" (AG-09 line 487).
* Judgment (high confidence): the link only needs to live until the one fetch starts.
* Fix: drop BR-7, the "preview ended" state and its test; if the single fetch is refused as expired (a slow open), the viewer asks for one new link once, else shows "could not open". Record in the concept that §3.8's "visible expiry" does not apply once the bytes are in memory (a departure noted for the founder's record, not a new feature).

**M2. "Recorded once, at link creation" leaves the actual read unrecorded; AG-9-32 asks for every read.** *Needed for the proof.*
* What breaks: BR-5 and the brief's DW3 write "previewed" when the link is made and nothing when `GET /document-previews/:token` serves the bytes, and DW3 requires that "fetching its bytes twice writes no more". Within 5 minutes the same staff member (or a script in their session) can read the file again and again with no line. A link made and never used still writes "previewed".
* Example: officer opens the preview (one line), copies the token URL into a second fetch three minutes later: bytes served, no record.
* Evidence (Fact): AG-9-32 (line 754) "**Every read** writes a `DocumentAccessLog`"; BR-9 (line 1224) "Every read (preview/download/signed-URL issue)"; `DocumentAccessLog.action` "preview/download/url-issued" (line 1325); story line 1357 "When the URL is issued, Then … an entry is written to the access log". `FileLinks.check` (`front-office/files.ts:133-143`) is stateless: a token is valid any number of times until expiry.
* Judgment (high confidence): the requirement wants issuance logged and no unlogged read.
* Fix (recommended, smallest): make the preview token **single use**: the first successful GET consumes it (an in-process set keyed by the token's MAC until its expiry is enough in the reference app); a second GET answers 404 like an expired one. Then "one line at issuance" equals "one line per read", BR-5 stays as written and DW3 changes to "a second fetch of the same link → 404, no line". Alternative: write a line at each GET as well (two lines per opening).

**M3. The panel is modal and has no decision in it, so "check, then decide" means close and hunt; AG-09 §3.8 puts Accept beside the preview, and Accept will exist when part 2 is built.** *Needed for the proof (the requirement's review-in-place); Reject stays Not built.*
* What breaks: `Panel` is a Radix modal with a full-screen overlay; the checklist behind it cannot be clicked or scrolled and focus is trapped. The journey "reads it … beside the case, and goes back to the line to decide" is really: read, close, find the line, Accept. BR-8's reason ("neither exists for staff on `main`") is true today but stale by build time: part 2 waits on CS-D1 part 3, which follows CS-D1 part 2, which adds `POST /checklist-lines/:id/accept`.
* Example: officer previews a passport, sees it is fine, must close the panel and press Accept on the line; with three files in a set, three round trips.
* Evidence (Fact): `controls.tsx:118` overlay `fixed inset-0 z-50 bg-black/25`; `:101` "pinned footer (Close left, primary right)"; `:113` the kit's own note that side panels carry "its footer's Accept or Reject". `case-checklist.ts:399-405`: routes `checklist`, `request`, `waive`, `not-applicable`, `providers`, `documents`, no accept (concept's claim confirmed for today). CS-D1 brief line 41: the accept route in part 2. AG-09 §3.8 line 483 "preview + the accept / needs-replacing controls live on one screen"; line 487 "accept / needs-replacing controls adjacent to the preview"; story line 1347 "open the in-app preview and click Accept". The CS-D5 row says "accept and reject-with-reason stay where they are (C6.4)".
* Judgment (medium-high confidence): the row and AG §3.8 conflict; under AGENTS rule 2 the team's requirement leads and the conflict goes up, not settled silently.
* Fix: put the CS-D1 part 2 **Accept** as the panel's one primary ("Accept this document", shown only with `agent/document:change-status`, same route, same 409 "Not ready for review yet."), closing the panel on success with focus on the line. No new API. Reject stays out until it has a row (concept question 1). Question 1 below.

**M4. A 560 px panel is too narrow to read an A4 scan at "Fit width", and "100%" already scrolls sideways.** *Needed for the proof.*
* What breaks: the panel body has `px-6` padding, so the page gets about 512 px. A4 is 595 pt wide: at Fit width the scale is about 0.86 of 1 px per point, so 8-9 pt print (bank statements, passport data pages, letters) draws at about 7-8 px. "100%" (595-794 px depending on the unit chosen) and "200%" both overflow 512 px, so the officer reads with two scroll bars inside a modal. The board draws the page as a grey sheet, so this was never seen.
* Example: checking the balance line and account holder's name on a Sample bank statement at 1440 px: unreadable at Fit width, sideways scrolling at 100%.
* Evidence (Fact): `controls.tsx:119` `max-w-[560px]`, `:127` `px-6`; board note "The 'page' is drawn as a grey sheet". EXPERIENCE §3 "Side panel" is for "summary + quick actions"; reading a source document is closer to "Source + proposals" ("source page left").
* Judgment (medium confidence: arithmetic, not a measured render).
* Fix: before part 2, render one real Sample A4 scan in the board at 512 px and at a wider size. If 9 pt text is under about 11 px at Fit width, give the preview a wider panel on wide screens (for example up to 60 % of the window, full width under 1024 px), recorded as a departure from §3's 480-560 px; otherwise keep 560 px. Also state that the page area scrolls at every zoom, not only 200 % (§4 body). Question 2 below.

### Minor

**m1. The Preview button shows on lines whose file is not clean.** *Needed for the proof.* AG-9-55 (line 790): staff see "Checking for viruses…" until clean; AG19-D53: the line shows "Removed — infected file". Concept §4 S1 offers the button on any line with a current file, so the common path leads to a refusal panel (EXPERIENCE §2.8 "Prevent errors before messaging them"). Fix: on the line, a clean file gets the button; a checking file shows "Checking for viruses…" and a removed one "Removed — infected file", no button (CS-D1 part 3 already draws these line states, CS-D1 W1). Keep the panel's 409/410 states for the race. Judgment, high confidence.

**m2. Two wordings for the same state.** *Needed for the proof.* API (brief, concept §2) "Removed: unsafe file." and "Not available yet: still being checked."; panel "Removed — infected file" and "Not available yet"; AG-9-55 "Checking for viruses…". Fix: one wording per state, the requirement's ("Checking for viruses…", "Removed — infected file"), used by API message and panel alike. Fact (quotes above).

**m3. The token route is a stand-in, but §6b says "Scaffolding: none"; and the 5-minute life has a source.** *Not built (a note only).* AG-09 line 426: "the API never proxies bytes. Both PUT and GET use short-lived signed URLs (target: a small number of minutes; today 300s)". The reference app serves bytes through the API and still needs the session header (`FileLinks.check` takes the staff id, `files.ts:133`), which a storage pre-signed URL cannot check. Fix: list the token route in §6b as the local adapter's stand-in for storage signing (P-33), naming what carries over (expiry, no names in the URL, firm scope) and what does not (the staff binding); cite line 426 for 300 s instead of "Sample". Fact.

**m4. Keyboard: PageUp/PageDown both scroll and turn pages, inside two scroll areas.** *Needed for the proof.* The `Panel` body scrolls (`controls.tsx:127` `overflow-y-auto`) and the concept adds a separately scrolling page area; in a scroll area PageDown is expected to scroll. Fix: the page area is the only scroll area (body not scrolling), PageDown scrolls and turns to the next page only at the bottom (as Mozilla's viewer does); the W1 keyboard test checks both. Judgment, medium confidence.

**m5. One §6 check cannot fail as written.** *Needed for the proof.* "A 200-page fixture turns pages without freezing" has no threshold. Fix: "page 150 is drawn within 2 s of pressing Next page on the 200-page fixture, and the toolbar answers a click meanwhile" (Sample threshold). The BR-7 test goes with M1.

## What is sound
* **Safety:** only clean files open (BR-1, AG-9-20/-55); PDF.js to a canvas with `isEvalSupported: false`, no scripting bundle, worker from our origin, version checked against CVE-2024-4367 on the day; no `<iframe>`/`<embed>`/browser plug-in; DW6 `/OpenAction` fixture is a real pass/fail test. The web app has no page-wide CSP today (only per-route headers), so a same-origin PDF.js worker meets no CSP conflict; the download's `default-src 'none'; sandbox` on the bytes is harmless to a `fetch` and still protects a URL opened directly.
* **Reach:** same `reach(actor, caseId, "officer")` and 404 words as `file()` (`case-documents.ts:402-406`); AG-9-53 covered; DW4 compares to the download, so it can fail.
* **Nameless URL:** `FileLinks` tokens hold ids, not names; DW5 checks names against fixtures. Moving `FileLinks` to the platform (contract gap 1) is the right dependency, not a copy.
* **No duplicate:** the download route is reused for its checks; `documents-drawer.tsx` `OpenFile` left alone; one new file in `web/src/runtime/`; the team's `Panel` reused (BIC-14/18/20 answered; image keeps zoom and rotate per the board).
* **Scope discipline:** PDF, PNG, JPEG only (matches `case_document`'s SQL check, `evidence.prisma:52`), conversion and earlier files left to later rows; the "contains scripts" recompute uses PF-F4's exported scan (`file-type.ts`, `SCRIPTS_FLAG`) and is named as interim.
* **New technology:** `pdfjs-dist` goes through STANDARDS §1 with P-587's six checks and P-607 S3 Q9's ruling; PDF.js (Apache-2.0, Mozilla) is a plausible gold-class pick, to be shown in the gate note.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Preview button on the line | `case_document` (current), scan state via `FilesPort` (PF-F3) | `GET /cases/:id/checklist` (scan state per file, CS-D1 part 3) | m1: clean → button; checking/removed → line words | browser: button only on a clean line |
| Open → link | none stored; `FileLinks` token (firm, staff, key, expiry 300 s) | `POST /documents/:id/preview-link` | BR-1, BR-4; 409/410 no link | DW1, DW4 |
| "previewed" line | audit trail (CS-D6), entity `case document` | same call | BR-5 + M2: one line at issuance, none on refusal | DW3 (one line; second fetch 404, no line) |
| Bytes | `FilesPort.get` + sha256 recompute | `GET /document-previews/:token` (four headers) | single use (M2); 404 for expired/other firm/other staff/altered; 409 sha mismatch | DW1, DW2, DW3 |
| Metadata in header | `case_document` (name, type, size, uploadedAt, uploadedBy) | in the link response | read only | DW1 asserts fields |
| Contains scripts | recomputed by PF-F4 scan (gap 2) | `contains_scripts` in link response | flag shows, file still renders | DW6 |
| Accept in footer (M3) | `ChecklistLine.state` | CS-D1 part 2 `POST /checklist-lines/:id/accept` (no new API) | clean current file only; permission `agent/document:change-status` | browser: Accept from the panel → line Approved; Read-only role sees no button |
| Page, zoom, rotate | none | none | BR-6 view only | rotate, reopen → upright; sha unchanged |

## Questions for the founder (at most 3, recommendation first)
1. **Accept inside the preview?** The team's requirement puts Accept beside the preview (AG-09 §3.8, story "open the preview and click Accept"); our row says decisions stay on the line. **Recommend:** the panel's one button is Accept (the route CS-D1 part 2 already adds); Reject waits for its own row. Otherwise the officer closes the preview to accept every file.
2. **A wider preview than the standard side panel?** At 560 px small print on an A4 scan is hard to read. **Recommend:** measure one real Sample scan first; if too small, let the preview use up to about 60 % of the screen on wide screens, as a recorded exception to the 480-560 px panel rule.

## Lead response
Lead 4, 15:32 IST 22 Nov (PR #3005, comment 7077532328; P-223 (4)), written in by the screens lane as the Lead asked: **the CS-D5 preview concept is APPROVED on 30cd601c1**, after this challenge. Decisions (P-801: settled from sources, not founder questions):
1. **Accept sits inside the preview**, as the requirement says (AG-09 §3.8; requirements outrank our row, AGENTS rule 2); "Reject with a reason" goes beside Accept as CS-D1 part 2's row text.
2. **The preview panel may be up to 60% of the window, max 960 px**, recorded as an exception to the 480-560 px side panel (document review needs the width); below about 1300 px the 100%/200% zoom stays.
3. **Release 1 previews PDF, PNG and JPEG only**; where the scripts flag is stored is Lead B's call.

The concept's §8 corrections are carried into `design/briefs/CS-D5.md` (follow-up records PR #3024; #3005 was already queued). The Lead asked for the BACKLOG row CS-D5 in the same PR, but the repository guard forbids lanes editing BACKLOG, so the row text went to the Lead as a proposal (#3024 comment 7077574079): noted here, not done silently.

## Agreement
Concept r2.1 (30cd601c1) answers B: none, M1-M4, m1-m5 (concept §8); reviewer Approve on 30cd601c1 (#3005); Lead approval above.

## Build discoveries
Part 2 (screens lane, 24 Nov, PR #3500), found while building on main 30e97254c:
1. **BR-8 Accept is not in the panel.** CS-D1 part 2's `POST /checklist-lines/:id/accept` is not on main (`api/src/case-checklist.ts` routes: request, waive, not-applicable, providers, documents). The panel ships with Close only; no Reject either. Recommended: Accept joins the panel footer in CS-D1 part 2's PR (one button, its route, its 409 in the panel, focus to the line). Asked on #3500 under "Question for the tech lead".
2. **BR-1 has no scan state to read.** Case files have none until PF-F3 (part 1 answers `scan: "NOT_SCANNED"`, Lead 10's ruling on #3188). The Preview button shows on every current file; the panel's badge says "Not scanned yet", never "Checked: clean"; the 409/410 race states are built and checked by network injection only. A 409 whose words are not "Checking for viruses…" (a file changed on disk) shows "could not open" (review M1).
3. **Images are drawn on the same canvas** (`createImageBitmap`), not in an `<img>` with a Blob URL: no URL to the file at all, one draw path for rotate and zoom.
4. **pdfjs-dist 6 has no `isEvalSupported`**: the option and every `eval`/`Function` path were removed after CVE-2024-4367 (fixed in 4.2.67); 6.5.438 is pinned. BR-3 holds by having no annotation, scripting or XFA layer.
5. **No journey j_68** (qa's): `Completes: R1.68` cannot be stated until it exists (P-782 (2) check in pr-rules).
