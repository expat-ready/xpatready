# FO-13s part 1 concept: the Identity check panel (R1.110)

Written 19 Nov 2026 by the screens builder (R1.110 lane), from Lead B's brief `design/lead-b-briefs/FO-13s.md` Part B (branch `lead-b-front-office`; the brief wins). Approval: Lead B (P-223 (4)) after the fresh challenge in `challenge.md`. No board: the panel is a section on an existing page.

## 1. Job and journey
A firm staff member records how they confirmed a client's identity and sees the checks already recorded, from the person's lead page, before a retainer is sent. Persona: an RCIC or an assistant who holds `agent/identity-check:record`. Journey: lead → **identity check** → engage → retainer send (FO-5), where the server's warning "No identity check is recorded for <signer>." disappears once a check exists.

## 2. Layers
* Data, rules, API: FO-13i (merged, #2011) and FO-13i part 2 (#2305: expired → 422 `fields.documentExpiry`). Routes: `GET`/`POST people/:personId/identity-checks` (multipart, `requestId` uuid, optional `copy`), `POST identity-checks/:id/copy/download-link`, `GET identity-copies/:token` (bearer). No API change in this part.
* UI: new `web/src/modules/front-office/compliance/identity/` (panel, record form, contract). Mount: one line in `sales/lead-page.tsx` (after #2268 merges, which also edits that page). No client view exists on main, so there is no second mount.
* The team's code has no identity check screen: this is new, not a retrofit.

## 3. Business rules (all enforced by the server; the screen shows them)
* BR-1 A check is insert-only. A correction is a new check. The panel has no edit or delete (FO-13i, P-579).
* BR-2 Only the last 4 characters of the document number are taken. The field says so, and nothing else asks for the number (FO-13i DW1).
* BR-3 A document is named by type, issuing country and last 4 together. An expiry needs a document. A copy needs a document (FO-13i parse rules).
* BR-4 An expiry before the firm's today is refused (422), and the field shows "This document has expired. Check a current one." This is the firm's own rule (P-735). No screen text says the Code requires it. Unconfirmed: no counsel.
* BR-5 The copy is a PDF, JPEG or PNG of at most 10 MB, checked by content (413 and 415 show on the copy field).
* BR-6 At least one corroborated detail (Name, Home address, Phone, Email, Business details), each once.
* BR-7 A Save makes one `requestId`. A retry after a lost answer reuses it, so there is one row; a new Save makes a new one (STANDARDS §4).
* BR-8 Keys: the list shows with `agent/prospect:show`; Record shows only with `agent/identity-check:record`; Open copy only with `agent/document:show`. Without a key, the action is not offered and one plain line says why (BIC-18).
* BR-9 With no check recorded, the panel says "No identity check is recorded for <name>." This is the same sentence the retainer Send answers in `warnings` (retainers/service.ts:508), so the warning a person meets later is already visible here.

## 4. Layout (pattern: Workspace section, EXPERIENCE §3; team tokens through `@/components/ui/controls`)
* Section "Identity check" in the lead page's left column, below Person. Header row: title and "Record a check" (outline button).
* List: a table, newest first. Columns: Checked (date and time, by whom) · Method · Document (type, country, ···last 4) · Expires · Details · Copy ("Open copy" link-button, or "No copy").
* Empty: a warn Notice with BR-9's sentence and one line: "Record a check before the retainer is sent."
* Record: the side Panel (as Engage). Fields:
  * Method (select). The note is required for Other.
  * Document type (select, optional), issuing country (2 letters), last 4, expiry (date).
  * Corroborated details (checkboxes, Name ticked by default).
  * Copy (file).
  * Footer: Cancel and Save check.
* Errors from `fields` show under their field, and the first one takes focus. A copy over 10 MB is caught before upload with the same words as the server.
* States: loading (skeleton rows), load error (plain reason and Try again), 404 (the page already says lead not found), saving (busy button, form locked), saved (toast "Identity check recorded.", panel closes, list refreshes).
* Widths: 375 px, where the table becomes stacked rows (the Table component's own overflow), 1024 px and 1440 px.

## 5. Copy
Words: Record a check · Save check · Open copy · No copy · "Only the last 4 characters. Never type the full number." (hint on last 4) · "PDF, JPEG or PNG, at most 10 MB." (hint on copy) · BR-4's and BR-9's sentences, word for word.

## 6. Contract and tests
* `compliance/identity/contract.ts` parses the list answer with zod: `{ personId, checks: [{ id, method, methodDetail, documentType, issuingCountry, documentExpiry, documentNumberLast4, details[], hasCopy, checkedBy { staffId, name }, checkedAt }] }`.
* `tests/check_fo13s_identity_browser.ts`: Playwright on an isolated copy. Each rule has a pass case and a fail case:
  * BR-4: an expired date shows the sentence and the list is unchanged; today saves.
  * BR-3: an expiry with no type shows an error on type.
  * BR-5: a .txt renamed .pdf shows 415's words on copy.
  * BR-8: an assistant without `document:show` sees no Open copy.
  * BR-9: the empty sentence shows before a check and not after.
  * Also keyboard only, axe-core with no serious findings, and 375, 1024 and 1440 px with no horizontal scroll.
* `tests/journeys/j_110.ts` (J-110): record a check (with a PDF copy) → see it listed → open the copy (download bytes = uploaded) → retainer send through the API answers the warning before any check and none after → an expired expiry shows the field's sentence, with nothing stored (row count by API).

## 6b. Capability or scaffolding
All elements are the capability (P-33). The retainer send step in J-110 goes through the API because no retainer screen is on main (FO-5s is not built). This is scaffolding for the proof only, and it is named so in the J-test.

## 7. Questions (recommendation first)
1. Mount on the prospect page too? **Recommend no, for this part.** The brief names lead-page only, and the person is the same `fo_person`. Add it with the retainer screen, where Send lives.

## Definition of ready
Acceptance: `tests/check_fo13s_identity_browser.ts` and `tests/journeys/j_110.ts` green twice. Row text: brief Part B. Decisions: P-579, P-735, P-728. Concept approved by Lead B after `challenge.md`.
