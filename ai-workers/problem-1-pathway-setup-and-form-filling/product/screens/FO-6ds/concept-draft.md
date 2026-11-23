# FO-6ds concept DRAFT: "Send for signature" on the prospect page (addendum to FO-5s r2)

Drafter: helper agent (steps 1-7 only), 23 Nov 2026, branch `claude/nice-curie-tzbprl` on top of FO-6d (b743b4870). Not the concept: the tech lead writes `concept.md` after a fresh challenge. Board: `design/draft-send-for-signature.html` (self-contained). Source: AG-5-61 @94f12d02 (§5 rules, §8 access, §10 safety, §12 edge cases), P-564. Sample values only. Legal points (e-signature validity, identity): Unconfirmed: no counsel.

## 1. Job and journey
A firm person sends any PDF from a prospect's page to one or more people on that prospect (optionally plus one firm person) for signature, then sees where each request stands and downloads the signed copy. Persona: case manager or Owner with `agent/portal:request-work`. Requirement: AG-5-61; journey J-54 W7-W9 (W9: the prospect page offers a button named "Send for signature").
**Scope: the prospect page only (which also covers a won prospect, i.e. a new client).** "From a client" (case side) and "from a document" (Documents file, generated letter) are **Not built**: the case side's documents read port does not exist, so FO-6d accepts uploads only. Said on screen as a one-line hint, not as dead buttons.

## 2. Ten layers
Job: above. Masters: none new (person, staff, prospect exist; `fo_signing_document` from FO-6d). Links: signer ↔ prospect checked by FO-6d (`SIGNER_NOT_ON_PROSPECT`). Configuration: none (no settings, AG05-D1). Rules: in FO-6d's service; the screen repeats only cheap early hints (type, size). Engine: N/A (no derivation). Contract: FO-6d's five routes (§6), parsed with zod in `sign/contract.ts`. Screen: new, this row. AI assist: none, identical with AI off (AG-5-61 §4). Governance: audit lines written by FO-6d; the screen adds none.

## 3. Business rules (screen's share; the API stays the guard)
| BR | Rule | Source |
|---|---|---|
| BR-1 | "Send for signature" shows only with `agent/portal:request-work`; the list with `agent/prospect:show`; download buttons only with `agent/document:show`. | AG-5-61 §8; routes.ts keys |
| BR-2 | Only a PDF of at most 25 MB. The picker accepts `.pdf`; size checked on pick; the API's first-bytes check is final and its words show on the file field. | FO-6d `checkPdf`; MAX_BYTES (Sample) |
| BR-3 | A government form is never sent this way: `GOVERNMENT_FORM` shown on the file field with the API's words. | AG-5-61 §5.6 |
| BR-4 | Signers: 1-9 people on this prospect, picked at send. A person with no email shows but cannot be ticked ("Add an email first"). If exactly one person has an email, they are pre-ticked. | AG-5-61 §5.2, §12; P-564 (code by email) |
| BR-5 | Firm signer optional and **none by default** ("No firm signer"); only the firm's active people. | AG-5-61 §5.3 |
| BR-6 | Nothing is sent until Send is clicked; Send is busy while sending; a double click sends once. | AG-5-61 §10 (AG16-31) |
| BR-7 | Title 1-200 characters, one line, pre-filled from the file name without ".pdf", editable. | FO-6d SEND schema |
| BR-8 | The "Signature requests" list shows every request, newest first, never hiding open ones: status in words, "n of m signed", each signer's opened/signed/declined date, the expiry date; "Download original" always, "Download signed copy" once Signed. | AG-5-61 §10 (AG16-60); J-54 W6 |
| BR-9 | A sent or signed document never moves the prospect: the stage pill does not change. | AG-5-61 §5.5 |
| BR-10 | Honesty: until FO-6 part 4 (the public door) lands, no signing email goes out; the panel and each live row say so. | FO-6d service header; STATE |

## 4. Layout (pattern: Dialog/wizard in a right **Panel**, TEAM-PATTERNS "a pane that collects a value is a right panel")
* **Prospect page:** a new section **"Signature requests"** (`data-signature-requests`) directly under the retainer card (`[data-retainer-card]`), same card style. Header: title + outline button **"Send for signature"** (outline, so Convert stays the one filled button, UXL-01).
* **Panel "Send for signature"** (480-560 px, pinned footer Cancel left, **Send** right, one filled button), one step, top to bottom: (1) **File** (picker, "PDF, at most 25 MB"; after pick: name, size, Change); (2) **Title** (pre-filled); (3) **Who signs** (checkbox list of people on the prospect, each with name; no-email rows disabled with "No email: add an email first"); (4) **Firm signer (optional)** select, default "No firm signer"; (5) a quiet line "Signs after the clients, from their own link." when a firm signer is chosen; (6) hint "Sending from a client's documents comes later; for now, upload the PDF." (7) Notice (info) for BR-10.
* **List rows** (a table at ≥1024, stacked cards at 375): Title · status pill (with tooltip reachable by keyboard) · "1 of 2 signed" · signers with dates · Sent date · Expires date · actions (Download original, Download signed copy). Status words: Sent, Viewed, Client signed (waiting for the firm), Signed, Declined, Expired, Cancelled; colour never alone (UXL-14).
* Sample data on the board: prospect "Client A (Sample)", spouse "Client B (Sample)" without email, firm person "Representative (Sample)", file "Employment offer - Sample Bakery.pdf".

## 4b. Best in class (from what is known; uncertain points marked)
* **DocuSign:** upload, add recipients, Send; per-recipient status (sent, delivered/viewed, completed) on the envelope. Copy: per-signer status with dates. Beat: no field placement step for a plain send (AG-5-61 §13 keeps no order editor).
* **Dropbox Sign:** asks up front who signs ("Just me / Me & others / Just others"), very short form. Copy: one short form, file name becomes the title (Unverified that it pre-fills the title).
* **Adobe Acrobat Sign:** "Out for signature" / "Waiting for you" style states and a clear "Completed" with download of the signed PDF plus audit report. Copy: signed copy download right on the row.
* **Clio (Manage):** e-signature started from a matter's document, status on the document (Unverified: exact labels and flow).
* **Immigration case tool (Docketwise):** e-signature of retainers/forms through the client portal (Unverified).
* **Ours beats them on:** signers picked only from people already on the prospect (no typed emails, nothing typed twice), no-email people caught before Send, government forms refused at send, the state list on the same page as the prospect.

## 4c/7-law notes (front-office screen; BIC §6 is case-side scope, so only the screen laws)
UXL-01 one filled button per view · UXL-03 the section owns its button · UXL-05 Cancel left, Send right · UXL-07 no ids shown · UXL-09 Send ≥44 px at 375 · UXL-10/11 list stacks at 375, no sideways scroll · UXL-12 loading/empty/error drawn · UXL-14 status in words. UXL-13: title trimmed.

## 4d. States
* **Section:** loading ("Loading signature requests…"); empty ("No documents sent for signature yet. Send a PDF such as an offer letter for this person to sign." + the button when allowed); list; load error ("Could not load the signature requests." + Try again); read-only (list without the button, no `request-work`); 404 ("You cannot see this prospect's signature requests.").
* **Panel:** signers loading; no person has an email (warn Notice "No one on this prospect has an email. Add one to the person's record first."; Send disabled); sending (Send busy "Sending…"); errors (below); success (panel closes, toast "Sent for signature: <title>", focus to the new row, row status Sent).
* **Errors, plain words, on their field (API detail shown as given):** FILE_REQUIRED "Choose a PDF to send." · FILE_TOO_LARGE "This file is too large: at most 25 MB." · NOT_PDF "This file is not a PDF. Only a PDF can be sent for signature." · GOVERNMENT_FORM "Government forms are not sent for signature this way…" · SIGNERS_REQUIRED "Pick at least one person to sign." · SIGNER_NOT_ON_PROSPECT "Each signer must be a person on this prospect." (+ the list reloads) · FIRM_SIGNER_NOT_IN_FIRM "The firm signer must be an active person of your firm." (+ the select reloads) · 403 "You cannot send documents for signature. Ask your firm's Owner or Admin." · network/5xx "Could not send. Nothing was sent; please try again." · download 410 "This download link has expired. Try again."

## 5. Copy
Button "Send for signature" · panel description "For <name>. They sign from their own link; nothing is sent until you click Send." · BR-10 notice "Signing emails are not switched on yet: the request is recorded, but no one is emailed until the client signing page is live." · status tooltips: Sent "Waiting for the signers to open it." · Viewed "Opened, not signed yet." · Client signed "The clients signed; the firm signer signs next." · Signed "Everyone signed. The signed copy is filed on each signer." · Declined "A signer declined. Send a new request if needed." · Expired "Not signed in time (14 days, Sample)." · Cancelled "Cancelled; it can no longer be signed."

## 6. Contract and tests (`tests/check_fo6ds_send_browser.ts`, isolated copy, never :4400)
Routes: `GET /api/front-office/prospects/:id/signers` · `POST /api/front-office/signature-requests` (multipart: file, title, prospectId, signerPersonIds, firmSignerStaffId?) · `GET /api/front-office/signature-requests?prospectId=` · `POST /api/front-office/signature-requests/:id/download-link` {file} → {url, expiresAt}. Zod: `Signers`, `SignatureRequest`, `SignatureRequests` in `web/src/modules/front-office/sign/contract.ts`.
| BR | Pass | Fail |
|---|---|---|
| 1 | Owner sees the button | role without `request-work` sees no button; the POST answers 403 |
| 2 | a 1-page PDF sends, row "Sent" | a .docx renamed .pdf → "This file is not a PDF…" on File, no row |
| 3 | an ordinary PDF sends | "IMM5257 sample.pdf" → government-form words on File |
| 4 | two people ticked → "0 of 2 signed" | no-email person's box disabled; Send with none ticked → "Pick at least one person to sign." |
| 5 | default sends 0 firm signers (db) | choosing a firm person sends 1 FIRM signer; a staff id made inactive meanwhile → firm-signer error |
| 6 | one click → one request | double click → still one `fo_signature_request` row |
| 7 | title pre-filled from file name | emptied title → "Enter a title." (client), 201 characters refused |
| 8 | signed request (fake adapter) shows "Signed" + signed-copy download whose sha256 matches | an open request is never hidden after a newer one |
| 9 | stage pill unchanged after send and after signed | n/a: asserted as the fail of a stage change in db |
| 10 | notice shown while no door | the notice is absent once FO-6 part 4 flags the door live (later test) |
Plus: keyboard only (Tab to button, Enter, fill, Space ticks, Send, focus returns to the new row; Esc closes); axe-core clean on page and open panel; 375/1024/1440 no sideways scroll, Send ≥44 px at 375; J-54 W9 passes.

## 6b. Capability vs scaffolding
Capability, Needed for the proof: button, panel, upload, signer pick, firm signer, Send, state list, downloads. Scaffolding: the BR-10 notice (removed when FO-6 part 4 lands). **Not built:** Send from a client's case page, from a Documents file, from a generated letter (no documents read port); remind, void, signed offline (no FO-6d routes for OTHER yet); password-protected PDF refusal (AG-5-61 §12; FO-6d does not check it); organisation signatory and stored signature (X-15); field placement.

## 7. Questions (recommendation first)
1. **Ship before the door?** Recommend: build and merge now with the BR-10 notice (J-54 W9 needs the button; the request is real and visible). Alternative: hold the screen until FO-6 part 4.
2. **No-email signer:** FO-6d accepts a person without an email (it does not check). Recommend: the screen disables them now, and a small API follow-up row refuses them (`SIGNER_NO_EMAIL`), since P-564's code goes by email. Alternative: screen only.
3. **Lost prospects:** recommend the button shows on every stage (AG-5-61 sets no stage limit; the API allows it). Alternative: hide on Lost, as the page's other actions.
Missing decisions: none blocking; the password-protected PDF rule (AG-5-61 §12) is unbuilt in the API (Not built here).

## Definition of ready
Acceptance test: `tests/check_fo6ds_send_browser.ts` (§6) plus J-54 W9 on `pr3044`. Row text: BACKLOG FO-6ds as written, scoped to the prospect page (other entry points Not built). Decisions: questions 1-3 answered; fresh challenge written to `screens/FO-6ds/challenge.md`; tech lead approval (P-223 (4)).
