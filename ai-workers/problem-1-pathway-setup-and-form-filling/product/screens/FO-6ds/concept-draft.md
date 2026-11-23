# FO-6ds concept DRAFT r2: "Send for signature" on the prospect page (addendum to FO-5s r2)

Drafter: helper agent (steps 1-7 only), 23 Nov 2026. r2 answers `challenge.md` (M1-M4, m1-m4). Not the concept: the tech lead writes `concept.md`. Board: `design/draft-send-for-signature.html` (self-contained). Source: AG-5-61 @94f12d02 (§5, §8, §10, §12), P-564; API at f6d048440. Sample values only. Legal points (e-signature validity, identity): Unconfirmed: no counsel.

## 1. Job and journey
A firm person sends any PDF from a prospect's page to one or more people on that prospect (optionally plus one firm person) for signature, then sees where each request stands and downloads the signed copy. Persona: case manager or Owner with `agent/portal:request-work`. Requirement: AG-5-61; journey J-54 W7-W9 (W9: Corporate prospect B's page offers a button named "Send for signature").
**Scope: the prospect page only (also a won prospect).** "From a client" (case side) and "from a document" (Documents file, generated letter) are **Not built**: no case-side documents read port, so FO-6d takes uploads only. Said in a one-line hint, not dead buttons.
**Who can be picked (fact):** the API offers the prospect's subject person, its primary contact and its company's live contacts (`peopleOn`). AG-5-61 §5.2's "spouse, sponsor" cannot be picked yet: a prospect has no family links (not this row's scope; no new rule here). So an Individual prospect usually has one signer; a Corporate prospect has several.

## 2. Ten layers
Job: above. Masters: none new. Links: signer ↔ prospect checked by FO-6d. Configuration: none (AG05-D1). Rules: in FO-6d's service; the screen repeats only cheap early hints. Engine: N/A. Contract: FO-6d's routes (§6), zod in `sign/contract.ts`. Screen: new. AI assist: none (AG-5-61 §4). Governance: audit by FO-6d. **Team mapping:** AG-5-61 §3 names the team's mock `src/features/esign/envelope-builder-page.tsx`; its fields map to File, Title, Who signs, Firm signer (Unverified: no `code/` capture in the cloud copy; check on the Mac).

## 3. Business rules (screen's share; the API stays the guard)
| BR | Rule | Source |
|---|---|---|
| BR-1 | "Send for signature" shows only with `agent/portal:request-work` and not on a Lost prospect (Q2); the list with `agent/prospect:show`; downloads only with `agent/document:show`. | AG-5-61 §8; routes.ts keys |
| BR-2 | Only an open PDF of at most 25 MB: the picker accepts `.pdf`, size checked on pick; the API's first-bytes, protected-PDF (`/Encrypt`) checks are final, their words on the File field. | FO-6d `checkPdf`; AG-5-61 §12; 25 MB Sample |
| BR-3 | A government form is never sent this way (`GOVERNMENT_FORM` on File). | AG-5-61 §5.6 |
| BR-4 | Signers: 1-9 people from the API's list, picked at send. A person without an email shows disabled ("No email: add an email first"); the API refuses one anyway (`SIGNER_NO_EMAIL`). Exactly one person with an email → pre-ticked. | AG-5-61 §5.2, §12; P-564 |
| BR-5 | Firm signer optional and **none by default**; only the firm's active people; signs after the clients. | AG-5-61 §5.3 |
| BR-6 | Nothing is sent until Send; Send is busy while sending; a double click makes one request. | AG-5-61 §10 (AG16-31) |
| BR-7 | Title 1-200 characters, one line, pre-filled from the file name without ".pdf", editable, trimmed. | FO-6d SEND schema |
| BR-8 | The "Signature requests" list shows every request, newest first, never hiding open ones: status in words, "n of m signed", each signer's opened/signed/declined date, expiry; "Download original" always, "Download signed copy" once Signed. Past its expiry date a live row reads "Expired on <date>" next to the pill (status stays the API's). | AG-5-61 §10 (AG16-60); J-54 W6 |
| BR-9 | A sent or signed document never moves the prospect: stage unchanged. | AG-5-61 §5.5 |
| BR-10 | Honesty until FO-6 part 4 (the public door): no word says "sent" or "emailed"; the request is "recorded"; the panel, toast and each live row say no one is emailed yet. All of it goes when part 4 lands. | FO-6d service header (no link exists) |

## 4. Layout (pattern: Dialog/wizard in a right **Panel**, TEAM-PATTERNS)
* **Prospect page:** new section **"Signature requests"** (`data-signature-requests`) under the retainer card, same card style; header title + outline button **"Send for signature"** (Convert stays the one filled button, UXL-01).
* **Panel "Send for signature"** (480-560 px, Cancel left, **Send** right, one filled button), one step: (1) BR-10 info notice; (2) **File** ("PDF, at most 25 MB"; after pick: name, size, Change); (3) **Title**; (4) **Who signs** (checkbox per person, name + role on the prospect, e.g. "Primary contact", "Company contact"; no-email rows disabled); (5) **Firm signer (optional)**, default "No firm signer", with "Signs after the clients." once chosen; (6) hint "Sending from a client's documents comes later; for now, upload the PDF."
* **List rows** (table at ≥1024, stacked cards at 375): Title · status pill (keyboard-reachable tooltip) · "n of m signed" · signers with dates · recorded date · expiry · Download original / Download signed copy. Colour never alone (UXL-14).
* **Board sample:** Corporate prospect "Sample Bakery Ltd (Sample)": primary contact "Client B (Sample)" with email, company signatory "Client C (Sample)" without email; firm person "Representative (Sample)"; file "Employment offer - Sample Worker.pdf". Individual "Client A (Sample)" for the single pre-ticked case.

## 4b. Best in class (known; uncertain marked)
* **DocuSign:** upload, recipients, Send; per-recipient status with dates. Copy that. Beat: no field placing for a plain send (AG-5-61 §13).
* **Dropbox Sign:** who signs asked up front, very short form (Unverified that it pre-fills the title).
* **Adobe Acrobat Sign:** clear "Completed" with the signed PDF and audit report to download. Copy: download on the row.
* **Clio (Manage):** e-signature from a matter's document, status on the document (Unverified: labels, flow).
* **Docketwise (immigration):** e-signature through the client portal (Unverified).
* **Ours beats them on:** signers only from people on the prospect (nothing typed twice), no-email people and protected PDFs caught before or at Send, government forms refused, the list beside the prospect.

## 4c. Screen laws (front-office; BIC §6 is case-side scope)
UXL-01 one filled button per view · UXL-03 the section owns its button · UXL-05 Cancel left, Send right · UXL-07 no ids · UXL-09 Send ≥44 px at 375 · UXL-10/11 rows stack at 375 · UXL-12 loading/empty/error · UXL-13 title trimmed · UXL-14 status in words.

## 4d. States
* **Section:** loading ("Loading signature requests…"); empty ("No documents sent for signature yet. Upload a PDF such as an offer letter for this person to sign." + button when allowed); list; load error ("Could not load the signature requests." + Try again); read-only (list, no button); 404 ("You cannot see this prospect's signature requests.").
* **Panel:** signers loading; nobody has an email (warn "No one on this prospect has an email. Add one to the person's record first."; Send disabled); sending ("Recording…", busy); errors (below); success (panel closes, toast "Recorded for signature: <title>. No one is emailed yet.", focus to the new row).
* **Errors on their field, API words as given:** FILE_REQUIRED "Choose a PDF to send." · FILE_TOO_LARGE "This file is too large: at most 25 MB." · NOT_PDF "This file is not a PDF. Only a PDF can be sent for signature." · PDF_PROTECTED "This PDF is protected. Upload an open copy." · GOVERNMENT_FORM "Government forms are not sent for signature this way…" · SIGNERS_REQUIRED "Pick at least one person to sign." · TOO_MANY_SIGNERS "At most 9 people sign one document." · SIGNER_NOT_ON_PROSPECT "Each signer must be a person on this prospect." (list reloads) · SIGNER_NO_EMAIL "<name> has no email address. Add an email first." (list reloads) · FIRM_SIGNER_NOT_IN_FIRM "The firm signer must be an active person of your firm." (select reloads) · 403 "You cannot send documents for signature. Ask your firm's Owner or Admin." · 5xx "Could not send. Nothing was sent; please try again." · **no answer (network)** "We could not confirm the send. Check the list below before sending again." (panel stays, list reloads) · download 410 "This download link has expired. Try again."

## 5. Copy
Button "Send for signature" · panel description "For <prospect>. Nothing is recorded until you click Send." · BR-10 notice "Signing emails are not switched on yet: the request is recorded, but no one is emailed until the client signing page is live." · pill words and tooltips: SENT "Recorded" / "Recorded. No one is emailed until the client signing page is live." (after part 4: "Sent" / "Waiting for the signers to open it.") · VIEWED "Viewed" / "Opened, not signed yet." · CLIENT_SIGNED with a firm signer "Client signed" / "The clients signed; the firm signer signs next."; without one "Signed, being filed" / "Everyone signed; the signed copy is being filed." · SIGNED "Signed" / "Everyone signed. The signed copy is filed on each signer." · DECLINED "Declined" / "A signer declined. Send a new request if needed." · EXPIRED "Expired" / "Not signed in time (14 days, Sample)." · CANCELLED "Cancelled" / "It can no longer be signed."

## 6. Contract and tests (`tests/check_fo6ds_send_browser.ts`, isolated copy, never :4400)
Routes: `GET /api/front-office/prospects/:id/signers` · `POST /api/front-office/signature-requests` (multipart) · `GET /api/front-office/signature-requests?prospectId=` · `POST /api/front-office/signature-requests/:id/download-link` {file} → {url, expiresAt}. Zod: `Signers`, `SignatureRequest`, `SignatureRequests` in `web/src/modules/front-office/sign/contract.ts`.
| BR | Pass | Fail |
|---|---|---|
| 1 | Owner sees the button; Read only sees list + downloads, no button; Billing sees list, no downloads | role without `request-work` → no button, POST 403; Lost prospect → no button, list kept |
| 2 | a 1-page PDF records a row | a .docx renamed .pdf → NOT_PDF words on File; an `/Encrypt` sample PDF → PDF_PROTECTED words on File; no row |
| 3 | an ordinary PDF records | "IMM5257 sample.pdf" → government-form words on File |
| 4 | Corporate prospect: Client B ticked → "0 of 1 signed"; Individual Client A pre-ticked | Client C (no email) disabled; a forced POST with C's id → SIGNER_NO_EMAIL; none ticked → "Pick at least one person to sign." |
| 5 | default sends 0 FIRM signers (db) | a firm person made inactive meanwhile → firm-signer error on the select |
| 6 | one click → one request | double click → still one `fo_signature_request` row |
| 7 | title pre-filled from file name | emptied title → "Enter a title." (client); 201 characters refused |
| 8 | signed request (fake adapter) shows "Signed" + signed copy whose sha256 = `sealedSha256` | an open request is never hidden after a newer one; a row past expiry reads "Expired on <date>" |
| 9 | stage unchanged in db after send and after signed | n/a (the stage-change assertion is the fail) |
| 10 | toast, pill and notice say "Recorded…", no "Sent"/"emailed" anywhere on the page | the notice and "Recorded" go once FO-6 part 4 flags the door live (later test) |
| M4 | abort the response after the server answers (Playwright route) → "We could not confirm the send…", list shows exactly one row | a 500 → "Nothing was sent", no row |
Plus: keyboard only (Tab, Enter, Space ticks, Send, focus to the new row; Esc closes); axe-core clean on page and open panel; 375/1024/1440 no sideways scroll, Send ≥44 px at 375; J-54 W9 passes.

## 6b. Capability vs scaffolding
Capability, Needed for the proof: button, panel, upload, signer pick, firm signer, Send, list, downloads. Scaffolding: BR-10 words (go with FO-6 part 4). **Not built:** Send from a client's case page, a Documents file, a generated letter; remind, void, signed offline for OTHER; an expiry sweep for OTHER (FO-6); spouse/sponsor signers (no family links); organisation signatory and stored signature (X-15); field placement; signer email shown in the picker (API gives `hasEmail` only).

## 7. Questions (recommendation first)
1. **Ship before the door?** Recommend: build and merge now with the BR-10 words (J-54 W9 needs the button; the request is real). Alternative: hold until FO-6 part 4.
2. **Lost prospects:** Recommend: hide the button on Lost, keep the list, as the page's other actions and the retainer card do. Alternative: show on every stage (AG-5-61 sets no limit; the API allows it).

## Definition of ready
Acceptance test: `tests/check_fo6ds_send_browser.ts` (§6) plus J-54 W9 on `pr3044`. Row text: BACKLOG FO-6ds, scoped to the prospect page (other entry points Not built). Decisions: questions 1-2 answered; challenge answered in its Lead response; tech lead approval (P-223 (4)).
