# FO-6ds fresh challenge: "Send for signature" on the prospect page

Challenger: a fresh agent that did not draft the concept, 23 Nov 2026 (skill screen-concept part B). Read: `concept-draft.md`, `design/draft-send-for-signature.html`, BACKLOG rows FO-6d and FO-6ds, AG-5-61 @94f12d02 (via `trace-requirements.py --brief FO-6d`) and P-564, `EXPERIENCE.md`, `STANDARDS.md`, `QUALITY.md`, `design/TEAM-PATTERNS.md`, the API `api/src/front-office/signing/any-document/routes.ts` and `service.ts` at f6d048440, the prospect page (`web/src/modules/front-office/sales/prospect-page.tsx`), the FO-5s retainer card (`retainers/retainer-card.tsx`, `retainer-page.tsx` download), the role grants in `prisma/migrations/20261114015002_pf3_platform_tables/migration.sql`, and qa's `tests/journeys/j_54.ts` on `pr3044` (4da87e739). `ai-workers/tools/freshness.sh` does not run in this cloud copy (no `code/` capture: `code/README-copies.md` missing), so the team's frontend mock named by AG-5-61 §3 is **Unverified** here. Legal points (e-signature validity, identity): Unconfirmed: no counsel. Every value Sample.

## Verdict
**Build after these changes.** No Blocker. The scope (prospect page only, uploads only, honest notice until the public door) is right and the API it needs is built. Four Majors are copy, sample and test corrections that the concept must carry before the build, so the builder does not build tests and states for cases the API cannot produce, or tell an RCIC something untrue.

## Objections

### Blocker
None.

### Major

**M1. The concept is stale against the API: two §12 refusals it calls "Not built" are built, and one error is missing.** *Needed for the proof.*
* What breaks: §6b lists "password-protected PDF refusal" as Not built and §7 Q2 asks the founder whether to add `SIGNER_NO_EMAIL`; the §4d error list has neither, nor `TOO_MANY_SIGNERS`. A builder following the concept draws no words for three answers the API gives, and the founder is asked a settled question.
* Example: an RCIC picks a protected "Offer letter.pdf"; the API answers 422 `PDF_PROTECTED` with `fields.file`; the concept has no mapping, so the panel shows a generic top error or nothing on the field.
* Evidence (fact, high confidence): `service.ts` `checkPdf` refuses `/Encrypt` with "This PDF is protected. Upload an open copy." (`PDF_PROTECTED`, field `file`); `send` refuses a no-email signer with "<name> has no email address. Add an email first." (`SIGNER_NO_EMAIL`, field `signerPersonIds`) and more than 9 with `TOO_MANY_SIGNERS`; commit f6d048440 "AG-5-61 §12 (a protected PDF and a signer with no email are refused)".
* Fix: add the three codes to §4d with the API's words on their field; move the protected-PDF rule from Not built into BR-2 with a pass/fail test (an `/Encrypt` sample PDF → words on File, no row); drop Q2 (answered by the API); keep the disabled checkbox as the early hint and test that a forced POST with a no-email id is refused (the API is the guard).

**M2. The board and the BR-4 tests assume a spouse on an Individual prospect; the API never offers one.** *Needed for the proof.*
* What breaks: the board's panel shows "Client A" ticked and spouse "Client B (Sample) · No email". The API's signer set is only the prospect's subject person, its primary contact and its company's live contacts. On an Individual prospect that is usually one person, so the "two people ticked → 0 of 2 signed" pass and the no-email disabled row cannot be set up there; the builder will either fail the test or fake the data.
* Example: Client A's Individual prospect: `GET /prospects/:id/signers` returns one person (subject = primary contact), so "Who signs" has one row and nothing to disable.
* Evidence (fact, high confidence): `service.ts` `peopleOn` (subject, primary contact, `foCompanyContact` live rows); `front-office-sales.prisma` comment "Applicant and spouse are family links, not company roles"; `j_54.ts` lines 100-101 build B as a Corporate prospect with two people (primary contact B, signatory C), and W7 and W9 use B.
* Fix: redraw the board's panel and BR-4 tests on a Corporate sample prospect (primary contact plus a company signatory, one of them without an email), as J-54 does; keep one Individual case for the single pre-ticked signer. Note as a fact in §1 that AG-5-61 §5.2's "spouse, sponsor" cannot be picked yet because the prospect has no family links (not this row's scope; no new rule here).

**M3. "Sent" is not true before the public door, and the toast and pill say it anyway.** *Needed for the proof.*
* What breaks: BR-10 adds a notice, but the success toast reads "Sent for signature: <title>", the row pill reads "Sent" with tooltip "Waiting for the signers to open it", and the panel says "They sign from their own link". Until FO-6 part 4 no one receives a link, so an RCIC reading the pill (not the notice) tells the client to check their inbox. EXPERIENCE §2.5 "statuses are calculated" and §5 plain words; AG-5-61 §10 "duplicate beats a miss" is served only if the RCIC knows it was not sent.
* Example: the RCIC sends "Employment offer - Sample Bakery", sees the toast and the green-path pill "Sent", and calls the client; nothing is in their inbox.
* Evidence (fact): `service.ts` header "this part sends no signing email (FO-6 part 4's door sends every signer's link)"; the link token is made and only its sha256 kept (`token()`), so no link exists to give out. The board's first row is also self-contradictory: "Viewed · Client A opened 22 Nov" next to "no one has been emailed".
* Fix (copy only, no new state): while the door is off, the toast reads "Recorded for signature: <title>. No one is emailed yet." and a live row's pill tooltip reads "Recorded. No one is emailed until the client signing page is live." (the pill word may stay the API's status in words, with the row's notice next to it, as the concept already draws). Drop "They sign from their own link" from the panel description while the notice shows. Use a "Sent" sample row on the board, not "Viewed". All of it is the BR-10 scaffolding and goes when part 4 lands (its later test already in §6).

**M4. The network-error copy can be false and invites a second send.** *Needed for the proof.*
* What breaks: §4d says for "network/5xx": "Could not send. Nothing was sent; please try again." A 5xx from the service is safe (a failed transaction cancels the envelope), but a dropped connection after the commit leaves a real request; the RCIC is told nothing was sent and sends again. BR-6 guards only the double click; the POST has no idempotency key.
* Example: the RCIC's laptop drops Wi-Fi as the 201 returns; the panel says nothing was sent; the second Send makes a second `fo_signature_request`.
* Evidence (fact): `routes.ts` `send` has no idempotency key; `service.ts` `send` cancels the envelope only when its own transaction fails. Judgment (medium confidence) on how often this happens.
* Fix: split the copy: 5xx "Could not send. Nothing was sent; please try again."; network failure (no answer) "We could not confirm the send. Check the list below before sending again." and reload the list. Test: abort the response after the server answers (Playwright route) → the list shows one row and the panel says to check it.

### Minor

**m1. "Client signed (waiting for the firm)" is wrong when there is no firm signer.** *Needed for the proof.* The service moves a request to `CLIENT_SIGNED` when every client signed, with or without a firm signer, until the provider's completed event makes it `SIGNED` (`service.ts` `apply`, "clientsDone"). With no firm signer the label and tooltip "the firm signer signs next" mislead. Fix: words depend on the row having a FIRM signer: without one, "Signed, being filed" / "Everyone signed; the signed copy is being filed."

**m2. A request past its expiry date still reads "Sent".** *Not built.* For kind OTHER nothing sets `EXPIRED`, `DECLINED` or `CANCELLED` yet (no sweep, decline left to FO-5d, no void route), but the webhook refuses a signature after `expiresAt` (`apply`: "the request has expired"). The row would show "Sent · Expires 5 Dec" on 6 Dec. Fix on screen without new logic: once the expiry date has passed, write the date as "Expired on 5 Dec" next to the pill; the status itself stays the API's (an expiry sweep for OTHER belongs to FO-6, not here).

**m3. Lost prospects: the recommendation in Q3 departs from the page's own rule.** *Needed for the proof.* The page says "A lost prospect does not move. To work with this person again, engage the lead again." and the retainer card hides Prepare when not `working` (`retainer-card.tsx` `mayPrepare`). Showing Send on Lost is a second, inconsistent rule (judgment). Fix: see Question 2.

**m4. The team's send screen is not mapped.** *Not built.* AG-5-61 §3 names the team's frontend mock `src/features/esign/envelope-builder-page.tsx` ("the send screen and signing page are the same for every document"). The concept does not mention it (STANDARDS retrofit: a divergence needs a mapping). Fix: one line in §2 naming the team mock and that its fields map to File, Title, Who signs, Firm signer, marked Unverified until checked on the Mac against the newest `code/` capture.

**m5. Signers are shown by name only.** *Not built.* The list cannot tell two contacts with the same name apart, and the RCIC cannot see which address the link will go to. The API's `signersFor` returns name and `hasEmail` only. Judgment, low priority; no change asked for this row.

## What is sound
* **Scope and honesty:** prospect page only, uploads only, the other entry points named Not built with a one-line hint, not dead buttons (P-33; AG-5-61 §12 "said on screen").
* **Contract:** every route it uses exists with the keys it states (`request-work` for send and signers, `prospect:show` for the list, `document:show` for links); zod parsing in `sign/contract.ts`; download through the short-lived link, the same pattern as `retainer-page.tsx`. Role split is testable with seeded roles: Billing and finance sees the list without downloads, Read only sees the list and downloads without the button (migration grants).
* **Rules on the screen are hints only;** the API stays the guard (first-bytes PDF check, government-form refusal, signer on prospect, active firm signer).
* **Firm signer none by default** (AG-5-61 §5.3) and signs last; **nothing sent until Send** (§10, AG16-31); **a signed document never moves the prospect** (§5.5) asserted in the database.
* **Layout:** a section under the retainer card with its own outline button keeps one filled button per card (BIC-11, UXL-01, UXL-03); a right panel with Cancel left and Send right (TEAM-PATTERNS "a pane that collects a value is a right panel"); states, keyboard path, axe, 375/1024/1440 all planned.
* **Best in class:** picking signers from people already on the prospect (no typed emails) and refusing government forms at send beat the benchmarks on errors prevented; the list on the same page as the prospect saves a trip.
* **J-54 W9:** a button named "Send for signature" on Corporate prospect B's page satisfies it as written.

## Back-end plan (no new back end)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Section list | `fo_signing_document` + `fo_signature_request` (OTHER) + `fo_signer` | `GET /api/front-office/signature-requests?prospectId=` | `prospect:show`, own-or-all; newest first; open rows never hidden | BR-8 pass/fail; read-only role sees list, no button |
| Who signs, Firm signer | `fo_person`, `fo_company_contact`, `platform_staff` | `GET /api/front-office/prospects/:id/signers` | subject, primary contact, live company contacts; active staff | M2 Corporate sample; no-email row disabled |
| Send | the three records + audit `signing.request_sent` | `POST /api/front-office/signature-requests` (multipart) | `checkPdf` (FILE_REQUIRED, FILE_TOO_LARGE, NOT_PDF, PDF_PROTECTED, GOVERNMENT_FORM), SIGNERS_REQUIRED, TOO_MANY_SIGNERS, SIGNER_NOT_ON_PROSPECT, SIGNER_NO_EMAIL, FIRM_SIGNER_NOT_IN_FIRM; 403 without key | one test per code (M1); double click → one row; lost response (M4) |
| Downloads | `fo_signing_document.file_key`, `fo_signing_evidence.sealed_file_key` | `POST …/:id/download-link` {file} then `GET …/signing-files/:token` | `document:show`; NOT_SIGNED 409 before SIGNED; 410 expired link | signed copy sha256 = `sealedSha256` (fake adapter); no download buttons for Billing and finance |
| Stage pill | `fo_prospect.stage_id` | none | OTHER never moves a prospect | stage unchanged in db after send and after signed |

## Questions for the founder (recommendation first)
1. **Ship before the public door?** Recommend: build and merge now, with the BR-10 notice and the corrected words of M3 (J-54 W9 needs the button; the request is real and visible). Alternative: hold the screen until FO-6 part 4.
2. **Lost prospects:** Recommend: hide "Send for signature" on a Lost prospect and keep the list, as the page's other actions and the retainer card do (the page already says "engage the lead again"). Alternative: show it on every stage (AG-5-61 sets no stage limit; the API allows it).

## Lead response

## Agreement

## Build discoveries
