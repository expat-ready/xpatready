# PF-13 part 2: Branding panel — independent challenge

Challenger: a fresh agent that did not draft `concept.md`, 22 Nov. Read: the concept, the merged API (`api/src/platform/branding/*.ts`), `offices-page.tsx`, `account-sections.ts`, `session.ts`, the PF-13 trace brief and backlog row, and the relevant lines of STANDARDS and EXPERIENCE. Paths below are under `prototype/studio/` unless they say otherwise. `ai-workers/tools/freshness.sh` does not exist, so it was not run.

## Verdict
**Build after these changes** (2 Major, 5 Minor; no Blocker). The design is sound and sits on the merged API without changing it. The weak point is the multi-request Save: the concept does not say how it ends when a request fails or its answer never arrives.

## Objections
**M1 (Major, needed for the proof): the Save sequence and how a partial result reads are not specified.**
* What breaks: Save makes up to four requests. One PUT for the values runs in one transaction (`branding.ts:130`). Each image is its own PUT or DELETE with its own audit line (`images.ts:58-59`, `:66-67`). BR-8 promises "Saved: … Not saved: …", but three cases are open:
  * A request times out or the network drops. The page cannot tell whether that part was stored, so the line could be wrong.
  * The page keeps the form's starting values unchanged after a partial save. The next Save then sends the saved parts again (harmless, since unchanged keys are skipped, `branding.ts:128`), but the "Unsaved changes" marker and Discard stay wrong.
  * Only images changed. A PUT whose body names no field is a 422 (`branding.ts:122`), so a naive build fails a valid Save.
* Example: the colour PUT succeeds, then the logo upload loses its connection. The page shows "Not saved: logo", but the logo may in fact be stored.
* Fix (wording in BR-2/BR-8):
  1. Send the PUT only when a text value changed, with only the changed fields.
  2. Then send each changed image one after another, and carry on past a refusal.
  3. **Always finish with one `GET /api/platform/branding`.** The read becomes the new starting point: what it holds counts as saved, and a field whose request failed stays changed on the form, with its server words.
  4. When an answer was lost, the line says "Could not confirm every change; the form shows what is stored now."
* Test: in DW6f or DW6c, stub a 415 on the logo after the colour has saved. The colour is in the read, the logo is still marked changed, and a second Save sends only the logo.

**M2 (Major, needed for the proof): checking only the first bytes in the browser is weaker than the server's check.**
* Fact: the server does more than look at the first bytes:
  * it parses the whole PNG or JPEG structure (`image-walk.ts:97-102`);
  * it refuses images over 89.5 megapixels (`platform/files/file-type.ts:7`, `:165`);
  * it refuses any side over 65,535 px (`image-walk.ts:12-13`);
  * it refuses arithmetic-coded JPEGs (`image-walk.ts:47`).
* What breaks:
  * A file with a valid PNG or JPEG start that is truncated or arithmetic-coded passes BR-4 in the browser, shows in the preview, and is then refused with 415 at Save. That turns into an avoidable partial save (M1).
  * A 2 MB PNG whose header declares, for example, 20,000 × 20,000 px passes the size and first-bytes checks, and the preview tries to decode it in the tab (a pixel bomb). The server refuses it anyway.
* Fix (judgment, medium confidence):
  1. Read the width and height from the header (PNG IHDR at bytes 16-23, JPEG SOF segment) and refuse the server's limits, in the server's words, **before drawing anything**.
  2. Then draw only after `img.decode()` succeeds. If decoding fails, show "Use a PNG or JPEG file."
  3. Add a parity test: run a fixture list (truncated PNG, oversized header, arithmetic JPEG, SVG with a script, good PNG and JPEG) through both the web check and `walkImage`, as BR-3 already does for contrast.
* The server's 415 stays the authority, as the concept says.

**m1 (Minor): the object-URL preview needs one rule.** STANDARDS.md:53 says an upload is "never rendered as HTML in the app origin". A `blob:` URL takes the app's origin. Shown in `<img>` it runs no script, but opened as a page (a link or a new tab) an SVG blob would run script in the app's origin. BR-4 already refuses SVG before drawing, so the risk is low. Fix: build the Blob from the checked bytes with the type you checked (`image/png` or `image/jpeg`), never from the file's declared type. Use the URL only as an `<img src>`, never in a link. Revoke it on replace, remove, discard and unmount.

**m2 (Minor): where the firm's name comes from.** The staff read returns values, `neutral`, `limits` and `images`, but no firm name (`branding.ts:115`, `routes.ts:47`). `Me` carries `firmKey` but no name (`front-office/sales/contract.ts:14`). Fix: say that the preview's firm name (and BR-7's unset sender name) comes from `GET /api/public/firms/{me.firmKey}/branding` → `name` (`images.ts:89-93`). That read serves only ACTIVE or TRIAL firms; otherwise show the neutral wording.

**m3 (Minor): the leave guard as written cannot be built.** The app uses `<BrowserRouter>` (`web/src/App.tsx:44`), which has no route blocker. The app's other editors ask only on closing or reloading the tab (`components/eligibility-gates-editor.tsx:136`). Fix: BR-2 becomes "closing or reloading the tab with unsaved changes asks first". Moving to another page in the app does not ask, as in the other editors. Say this in the PR.

**m4 (Minor): the §4b Stripe claim is Unverified.** docs.stripe.com could not be reached from this session (its host is not allowed in this session's network). Mark the sentence "Unverified (from memory)" until someone checks it. The design does not depend on it.

**m5 (Minor): test edges.** The server refuses at `> limit` (`images.ts:45`). Add a file of exactly 2 MB (accepted) and 2 MB + 1 byte (refused) to DW6d, and the favicon at 256 KB + 1 byte, so the browser check matches the server.

## What is sound
* The design uses only the merged API: no API change, no migration, no new library. The permission key `agent/settings:edit` matches `routes.ts:43-49` and the Offices entry (`account-sections.ts:14`). The row's older `agent/firm-branding:manage` was replaced by part 1a.
* Contrast:
  * BR-3's words match the server exactly (`branding.ts:101`).
  * The ratio is cut to two decimals, never rounded up, as the server does (`branding.ts:33`).
  * There is a parity test.
  * Keeping the last acceptable colour in the preview is right.
* Size and type checks:
  * Refusing a file at the moment it is chosen, with its limit, uses the server's own Sample limits and words (`image-setting.ts:15`, `images.ts:23`).
  * A 6 MB logo meets multer's cap and gets the kind's words (`routes.ts:29`, `images.ts:18`).
* "Nothing stored until Save" is honest in what the browser does: no request is sent before Save.
* BR-6's refusal follows the Offices pattern (`offices-page.tsx:61`).
* The scope stays inside the brief. The four other values and the "applied" line are named as Not built, not cut silently.
* The states list and the tests cover every Done-when line.

## Back-end plan (element → record → API → rule → test)
* Brand colour → setting `platform.branding.colour` → `PUT /api/platform/branding {colour}` → BR-3 (4.5:1, cut ratio) → DW6b and the parity test.
* Sender name → `platform.branding.sender_name` → same PUT → 1 to 80 characters, one line, trimmed (`branding.ts:104-108`) → DW6a.
* Logo, favicon, banner → `platform.branding.{kind}` plus the file `branding/{kind}/{sha}` → `PUT|DELETE /api/platform/branding/:kind` → BR-4 and BR-5, plus M2's header limits → DW6c, DW6d, DW6f.
* Preview → none (form state, the staff read's `images.*.link`, the public read's `name`) → `GET` both → BR-1 and BR-7 → DW6a.
* Partial save → each request's result, then a re-read → M1 → the M1 test.
* Audit → one line per changed key (`branding.ts:130-133`, `images.ts:58`) → DW6a (fail case).

## Questions for the founder
None. Both §7 questions are the tech lead's, and the recommendations stand:
* Q1: a follow-up part on this page for the other four values. P-629 already puts the tagline in.
* Q2: allow the one menu line. Without it nobody can reach the page from the menu.

## Lead response
Builder's answer, 22 Nov (the tech lead's approval is asked on the PR, P-223 (4)): M1, M2 and m1 to m5 are all taken, in `concept.md` (BR-2, BR-4, BR-7, BR-8, §4b, §6) and in the build. One difference from M1's fix 3, said here: when a request's answer never arrives the form drops every change and shows the read, with "Could not confirm every change; the form shows what is stored now."

## Agreement

## Build discoveries
