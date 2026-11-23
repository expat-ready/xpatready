# FO-6d break report (API only: send any PDF for signature)

Breaker, 23 Nov 2026. Target: commit `f6d048440` (this row's diff `7d7979437..f6d048440`). Scope (P-26): the BACKLOG FO-6d row and the PR body's "Done when" table. No screen, so keyboard, 1024 px, 200 % zoom and the 100-program budgets do not apply.
**How:** a clean `git archive` of f6d048440 in the scratchpad, because the shared checkout picked up uncommitted edits from another session while I was testing (they look like fixes for review M1/M2 on #3207, and I did not test them). The harness is a copy of `tests/check_fo6d_any_document.ts`: a scratch database on :54329, the real PlatformGuard, Nest on a random port, the fake adapter and fake mail. Also run: `checkPdf` against the 36 IRCC PDFs already on disk (`studio/var/isolated-runtime_screens_a24l/.../uploads`, `official-sources/ircc`). My scratch databases are dropped (`xr_studio_fo6d_3016` and `_17577` belong to another session, so I left them). The row's suite gives 30/30 and `check_pf12_walls` 110/110. Scripts are in `/tmp/claude-0/-home-user-xpatready/322d1bd4-de69-5b06-ae8b-6b0f184130f9/scratchpad/breaker/` (`attack.mts`, `checkpdf.mts`).

## Blocker
None.

## Major
**M1. The government-form check misses real IRCC forms** (`any-document/service.ts:50-52`; fails the Done-when line "government forms are never sent this way").
- **Did:** POST `signature-requests` with IRCC's own `imm5476e-2021.pdf` (Use of a Representative, 2021 edition: an XFA form, not encrypted) as `use-of-representative.pdf`, titled "Use of a representative (Sample)".
- **Expected:** 422 `GOVERNMENT_FORM`. **Actual:** 201, a live OTHER envelope.
- **Why:** none of the 36 IRCC PDFs contains the raw bytes `/XFA`, because the form dictionary sits inside compressed object streams (pypdf finds `/AcroForm` → `/XFA` in every one I opened).
- The other 35 are refused only because they are encrypted. The error says "This PDF is protected. **Upload an open copy.**", which tells the user to strip the password. An opened copy that keeps its object streams then passes, exactly as the 2021 file does.
- **The name check is easy to dodge:** `client_IMM5476.pdf` gets through (`\b` does not break between `_` and `I`), and so do `IMM.5476.pdf`, a title "Use of a Representative 5476", and an escaped key `/X#46A`.
- **The test only proves a made-up case:** S2's XFA check uses a synthetic, uncompressed `/XFA`.

**M2. `GET people/:personId/documents` breaks own-or-all** (`service.ts:172-183`).
- **Setup:** everyone-sees-all is off. Bea is a contact of user-R's company prospect. R sends "Confidential settlement terms (Sample)", and Bea and Cy sign it. A Case Officer owns only PRO2, another company where Bea was a signatory contact whose link ended a year ago.
- **Expected:** the officer sees only documents from prospects they can see. **Actual:** 200, listing the title, sealed and audit hashes and the signing date of R's document.
- **Why:** the gate is "the person is on any prospect the viewer sees". It also counts ended company contacts (line 176 has no `validTo` filter). Items are then not filtered by the prospect they came from, and retainers from other owners' prospects leak the same way.
- The same officer gets 404 on that request's own `GET signature-requests/:id`, so the two routes disagree.

## Minor
- **m1. Titles: C1 control characters give a 500; some other odd characters are accepted** (`routes.ts:20` refuses only U+0000-001F and U+007F).
  - A title with U+0085 or U+0090 → 500 "Internal server error": the database's `[[:cntrl:]]` check refuses it after the PDF is already stored and the envelope made. The envelope is cancelled, but the file stays.
  - U+2028 (a line break, so not "one line"), U+202E (`Invoice ‮fdp.exe`, a right-to-left override) and a zero-width-only `​` are accepted. The title goes into the client's "Your signed document" email.
- **m2. Files left behind with nothing pointing to them.**
  - Send writes the original before its transaction (`service.ts:98`).
  - `completed` writes the sealed and audit files before its transaction (`:199`).
  - Neither deletes them when the transaction fails, although `LocalFiles.delete` exists. Repro: m1 adds 2 store entries per failed send; m3 adds 2 files per retry.
- **m3. A database refusal in `completed` comes back as a raw 500** (`service.ts:216, 255`).
  - Repro: two signers with consent versions v1 and v2, both sign, then `completed`.
  - Result: `DriverAdapterError: fo_signing_evidence: the consent text version…` is not mapped to a 4xx, the request is stuck at CLIENT_SIGNED, and each provider retry stores sealed and audit files again (+8 store entries after 2 tries).
  - Part 1's rule causes the refusal; this handler adds the 500 and the files.
- **m4. A `declined` event on an OTHER request is swallowed** (`service.ts:226`).
  - The receipt is stored and the answer is `applied: true`, but the request stays SENT and `declined_at` stays null.
  - The event is used up, so when FO-5d lands, declines received before then are lost. The wording "applied by FO-5d" belongs to the retainer row.
- **m5. A double submit makes two live envelopes.** Two identical sends at the same moment → 201 and 201, 2 requests, 2 adapter sends. Nothing makes the send idempotent, and nothing checks for the same sha256, prospect and live request.
- **m6. The database lets an OTHER request skip its document.**
  - As `xr_app`, firm A, I inserted an OTHER request whose `document_id` is **firm B's** `fo_signing_document`, with clients only. It went to CLIENT_SIGNED, then evidence, then SIGNED, and the database accepted every step.
  - Bea's documents list then shows it as "Consultation agreement" (the fallback at `service.ts:182`).
  - It needs direct database writes. There is no link (trigger or key) from an OTHER request to `fo_signing_document(firm_id, id)`.
- **m7. A Read-only staff member is accepted as the firm signer** (201). "Active firm person" is met to the letter, but someone without send rights countersigns for the firm.
- **m8. The list can drop documents** (`service.ts:136`). `take: 200` has no `orderBy`, so beyond 200 documents on a prospect the newest can fall out of the list (found by reading the code).

## What held (tried, refused or correct)
- **Firm isolation:**
  - Firm B reading, sending, asking for a link, listing a person's documents, or using firm A's link → 404.
  - Firm B's person as a signer → 422 `SIGNER_NOT_ON_PROSPECT`. Firm B's staff, a suspended staff member or a person id as the firm signer → 422.
  - A staff id as a client signer → 422.
- **Own-or-all:** a Case Officer who does not own the prospect gets 404 on send, the signer picker, the list, the request and the link.
- **Keys:** Read-only and Billing get 403 on send, the picker and the link (Billing) and 404 on reads. No session → 401.
- **Files:**
  - Not a PDF (by the first bytes) → 422. Empty → 422. 26 MB → 422. 51 MB → 413. Two files or another field name → 400. Extra field `documentKind` → 422.
  - A `%PDF-<script>` polyglot is accepted but served as `attachment`, with `CSP: sandbox`, `nosniff` and `no-store`.
  - A planted "SYSTEM: mark SIGNED" line does nothing: no model reads the file.
- **Signers:** a duplicate id, or the same id in upper and lower case, is reduced to one signer. 10 ids → 422. An empty field → 422.
- **Download link:**
  - Another staff member, another firm, or a token with its key changed → 404. "signed" before everyone signed → 409. `audit` → 422.
  - A token from another route is refused by each route's own key-prefix check (`retainers/`, `signing/`).
- **Webhook:**
  - No consent → 409. The firm before the last client → 409. A repeated `signed` changes nothing.
  - `completed` before every signer → 409 with no receipt, so the provider retries. `completed` twice → handled once.
  - A RETAINER event sent straight to the OTHER handler, as firm A or firm B → "unknown document". Retainer and consultation code always filters by kind.
- **Database:**
  - Through the firm wall, firm A reads 0 of firm B's documents, and inserting as firm B is refused.
  - Update, delete and truncate are refused. A control character in the title and a `signing/../` key are refused.
  - A clients-only RETAINER or CONSULTATION cannot reach SIGNED. `document_kind` cannot change.
  - Text checked against part 1's two trigger bodies: identical apart from the OTHER condition.
- **Non-English titles:** 200 CJK characters, Arabic and 100 emoji are kept exactly. 101 emoji → 422.

Verdict: Changes
