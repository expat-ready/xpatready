migration: `20261123120000_fo6d_any_document` (one enum value `OTHER`; one new table `fo_signing_document`; FO-6 part 1's two trigger bodies `fo_signing_request_write` and `fo_signing_evidence_write` ask for the signed firm signer only when the kind is not OTHER). Shared contract: `SigningPort.send` takes **at most one** firm signer (was exactly one) and at least one client; `ports/events/signing.ts` gains the `OTHER` variant of `signing.completed`.

**Stacked on #3065** (FO-6 part 3, head 7d7979437) as the tech lead asked; nothing pushed to #3065. Until #3065 merges, this diff shows its commits too; this row's own diff is `git diff 7d7979437..HEAD` (see Checks for its measured size).

## What and why (R1.54, "any uploaded PDF can be sent for signature"; AG-5-61)
A person with `agent/portal:request-work` uploads a PDF from a prospect they can see, picks one or more people on that prospect (its subject, its primary contact, a live contact of its company) and optionally one active firm person, and clicks Send. One `fo_signature_request` of kind `OTHER` is made on the fake adapter (FO-6v held, P-561), with one audit line in the same transaction. The provider's webhook (FO-6 part 3's door) hands OTHER requests to this row's handler: viewed / signed / completed as FO-6 (consent first, the firm signer when added signs last); completed stores the sealed copy and the audit file, hashed, sets SIGNED, writes `signing.completed` (kind OTHER) last and emails each client signer "Your signed document" once. **OTHER never moves a prospect, never makes a client, never touches a retainer.**

Routes (`/api/front-office`): `POST signature-requests` (multipart) · `GET signature-requests?prospectId=` (the state list) · `GET signature-requests/:id` · `GET prospects/:id/signers` (the picker) · `GET people/:personId/documents` (the signed copies on a person, any kind, retainers too) · `POST signature-requests/:id/download-link` + `GET signing-files/:token` (BR-15's short-lived link).

## Plan (as built)
1. Schema: `OTHER`, `fo_signing_document` (insert-only, never deleted, PF-12 wall, firm-first), the two trigger bodies (part 1's text with one condition each).
2. Port: at most one firm signer; contract case "clients only is accepted and completes once every client signed".
3. `signing/any-document/service.ts` + `routes.ts`; `features/front-office-signing-any-document.ts` registers the OTHER handler; FO-6 part 3's `receive` hands every non-RETAINER kind to its registered handler (one line).
4. `tests/check_fo6d_any_document.ts` (33 checks, a pass and a fail per Done-when line).

## Done when → the test that proves it
| BACKLOG FO-6d line | check |
|---|---|
| an uploaded PDF signed by two people ends with the sealed copy filed | S4 pass ×4 (SIGNED, hashes, download sha256 = stored, filed on both people, `signing.completed` OTHER, two emails) |
| `OTHER` never moves a prospect or makes a client | S4 fail (stage unchanged, no `prospect.won`, no retainer) |
| a non-PDF → refused | S2 fail (422 `NOT_PDF` "…not a PDF…", nothing stored) |
| a person without the key → 403 | S3 fail (Read-only 403; no session 401) |
| another firm's document id → 404 | S3 fail (read, send, file link: 404) |
| government forms are never sent this way | S2 fail ×2 (a real IRCC form renamed letter.pdf; /XFA only in a deflated stream; a raw XFA form or IMM-numbered name) and S2 pass (a plain deflated PDF) |
| each signed copy on a person follows its own prospect (review M2) | S6 pass/fail |
| AG-5-61 §12: a PDF with a password refused; a signer with no email cannot be picked | S2 fail ×2 ("This PDF is protected. Upload an open copy."; SIGNER_NO_EMAIL "…Add an email first.") |
| firm signer optional, signs last | S5 pass/fail |
| the database keeps part 1's rule for every kind but OTHER | D fail/pass |

## j_54 lines this row owns
* **W7 line 1** (an uploaded PDF to the prospect's two people: one OTHER request, two client signers): built to pass (same route, fields and answer shape as the journey guessed).
* **W8** both lines (not a PDF → 422 with "PDF", nothing sent; no session → 401): built to pass.
* **W7 lines 2-4** need FO-6 part 4 (the signing email, the public door's code, consent and session, a signing page for the fake on the copy): not this row. Line 3's person route `GET people/:id/documents` is built here; line 4's prospect-unchanged half is proved here by S4.
* **W9** is FO-6ds (the screen).

## Checks and results
<filled at the end: suites exit codes ×2, graph, count-any, module-cards, review verdicts>

## Duplicate check
searched BACKLOG*.md ("FO-6d", "any document", "OTHER", "send for signature"), open PRs (all 70, records PRs too: none for FO-6d/FO-6ds; #3065 is FO-6 part 3, #3184 FO-3c part 2), main's code (`signature-requests`, `fo_signing_document`, `documentKind: "OTHER"`: none), qa/BUGS.md (FO-6d: none); none.

## Deviations, said
* **A new table** (`fo_signing_document`) beyond the row's "one enum value": an OTHER request has no FO-5 version to name, so its file key, title and prospect need a home; insert-only, walled. Lead read asked (migration).
* **Two FO-6 part 1 trigger bodies replaced** in this migration (one condition each) and **the port's signer rule widened**: AG-5-61's "no firm signer unless added" cannot be met otherwise. RETAINER and CONSULTATION keep "exactly one firm signer" in code (`prepareRetainerSigning`) and in the database (test D).
* **Event kind name `OTHER`, not `DOCUMENT`** (review m1): BACKLOG FO-6 rev 16.16 and AG-5-61 §9 name the non-retainer kind `DOCUMENT`; the code keeps the row's enum word `OTHER` end to end (database, API, `signing.completed`). Consumers (FO-7 and later) read `OTHER`. Lead: rename now if you prefer `DOCUMENT` (one enum value, before any row exists).
* **Government-form check** (review M1): an IMM number in the name or title; `/NeedsRendering`, `/XFA`, or `/AcroForm` with `/Perms` in the raw bytes; `/XFA` inside a deflated stream. Measured on the 22 committed IRCC forms, their previous editions and two open copies: 27 of 27 caught, and checked before the password so a protected IRCC form is never told "upload an open copy". A Reader-extended fillable PDF that is not a government form is refused too (conservative; Unconfirmed: no immigration expert).
* **Case documents** (the case side's read port) are not built: uploads only, as the row allows.
* No signing email in this part (FO-6 part 4 sends every signer's link, retainers too).

## On the demo
Nothing visible yet (API only; FO-6ds is the screen). With a staff token: `POST /api/front-office/signature-requests` from a prospect page's people.

Cost: US$0 (fake adapter, fake mail, no model call). Context share: ~40%.

## Questions for the tech lead
1. **FO-6ds has no concept** (the row says "concept addendum and challenge first"). I recommend: I draft it with a separate drafter and challenger agent and put it to you for approval (P-223 (4)) on its own PR; the screen PR follows your approval.
2. The webhook's answer to the provider for an OTHER (or CONSULTATION) event is FO-6 part 3's fixed "handed to its module" even for a duplicate; harmless (the provider only needs 2xx), effects are once. Recommend leaving it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXNda5dDH8q1AQGRnF5WM4
