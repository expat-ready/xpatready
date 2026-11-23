migration: `20261123120000_fo6d_any_document` (enum value `OTHER`; new table `fo_signing_document`, keyed to platform_firm and platform_staff, insert-only, walled; FO-6 part 1's `fo_signing_request_write` and `fo_signing_evidence_write` ask for the signed firm signer only when the kind is not OTHER). Shared contract: `SigningPort.send` takes **at most one** firm signer (was exactly one) and at least one client.

**FO-6d part 1 of 2** (P-610: the row measured 870+ lines, split at its seam). **Stacked on #3065** (FO-6 part 3, head 7d7979437) as the tech lead asked; nothing pushed to #3065. This part's own diff: `git diff 7d7979437..HEAD`. Part 2 (the webhook's OTHER handler, the sealed copy filed, "Your signed document", the person's signed copies, and both review reports) is its own PR stacked on this one.

## What and why (R1.54 "any uploaded PDF can be sent for signature"; AG-5-61)
A person with `agent/portal:request-work` uploads a PDF from a prospect they can see, picks one or more people on it (its subject, primary contact, a live contact of its company) and optionally one active firm person, and clicks Send: one `fo_signature_request` of kind `OTHER` on the fake adapter (FO-6v held, P-561), one audit line in the same transaction; a failure cancels the envelope. Sending never moves a prospect or makes a client. Refused in words: not a PDF (by its bytes), a government form (r6), a protected PDF and a signer with no email (§12), a signer not on the prospect, a firm signer not active in the firm, a title that is not plain one-line text.
Routes (`/api/front-office`): `POST signature-requests` (multipart) · `GET signature-requests?prospectId=` · `GET signature-requests/:id` · `GET prospects/:id/signers` · `POST signature-requests/:id/download-link` + `GET signing-files/:token`.

## Done when → test (`tests/check_fo6d_any_document.ts`, 24 checks)
| FO-6d line | check |
|---|---|
| uploaded PDF … sealed copy filed | S1 pass ×2 (the send); signing and filing: part 2 |
| OTHER never moves a prospect or makes a client | S3 fail (after the sends); after signing: part 2 |
| non-PDF refused | S2 fail `NOT_PDF` |
| without the key 403 | S3 fail (Read-only 403, no session 401) |
| another firm's id 404 | S3 fail (read, send, link) |
| government forms never sent | S2 fail ×2 (real IRCC form renamed letter.pdf; /XFA only in a deflated stream; raw XFA; `client_IMM5476.pdf`), S2 pass (plain deflated PDF) |
| §12 protected PDF; signer without email | S2 fail ×2 |
| firm signer optional | S1, S5 pass/fail |
| database keeps part 1's rule except for OTHER | D fail (RETAINER), D pass (OTHER clients-only reaches SIGNED) |

**j_54:** W7 line 1 and W8 (both lines) are this part's, built to pass on the journey's guessed route and fields. W7 lines 2-4: part 2 + FO-6 part 4 (the door). W9: FO-6ds.

## Review round 1 (f6d048440): Reviewer Changes, Breaker Changes; fixed
* **M1** government forms missed in real IRCC files (XFA in compressed, encrypted streams): now IMM number in name or title, `/NeedsRendering`, `/XFA`, `/AcroForm`+`/Perms`, or `/XFA` in a deflated stream, checked **before** the password. 27/27 committed IRCC forms and open copies caught.
* **M2** person documents leaked titles across owners: fixed in part 2 (the route moved there), with its pass and fail test.
* Minors taken: keys on the new table; titles refuse C1/format/line-separator characters; newest 200; stale comments. Left, said: orphan file on a failed send (as retainers); double submit (the screen disables Send); a Read-only staff member as firm signer (AG-5-61 "one firm person"); the database does not check an OTHER request names its firm's document (the API writes it first).

## Checks and results
<filled at the end>

Duplicate check: searched BACKLOG*.md ("FO-6d", "any document", "OTHER", "send for signature"), open PRs (all, records PRs too: none for FO-6d/FO-6ds), main's code (`signature-requests`, `fo_signing_document`, `"OTHER"`), qa/BUGS.md; none.

## Deviations, said
* New table beyond "one enum value" (an OTHER request has no FO-5 version to name). Lead read asked.
* Two FO-6 part 1 trigger bodies replaced and the port's signer rule widened (AG-5-61 r3); RETAINER and CONSULTATION keep one firm signer in code and database (test D).
* Kind `OTHER`, not AG-5-61 §9's `DOCUMENT` (the row's word). Rename now if you prefer.
* The government-form check is a check of the file (a Reader-extended non-government form is refused too; Unconfirmed: no immigration expert); an owner-password-only PDF is refused as protected.
* Uploads only (no case documents read port); no signing email (FO-6 part 4).

On the demo: nothing visible (API only; FO-6ds is the screen). Cost: US$0. Context share: ~55%.

## Questions for the tech lead
1. FO-6ds concept is on #3220 for your approval (P-223 (4)) before the screen is built.
2. Keep `OTHER` unless you say `DOCUMENT`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXNda5dDH8q1AQGRnF5WM4
