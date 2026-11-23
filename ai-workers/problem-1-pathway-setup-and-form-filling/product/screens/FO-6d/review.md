# FO-6d review: send any document for signature (API only)

Reviewer: independent reviewer agent, 23 Nov. Branch `claude/nice-curie-tzbprl`, commit **f6d0484407425aa219059161fe82ec1e44f925c7**. Scope: this row's own diff, `git diff 7d7979437..f6d048440` (stacked on #3065 FO-6 part 3, reviewed separately). I also read #3065's `signing/service.ts`, `port.ts`, `handlers.ts` and migration `20261122020000_fo6_signing_tables`, plus BACKLOG row FO-6d, the AG-5-61 / P-564 text (`trace-requirements.py --brief FO-6d`) and `screens/FO-6d/pr-body.md`.

## What I ran (Postgres 127.0.0.1:54329)
| check | result |
|---|---|
| `tests/check_fo6d_any_document.ts` | **30 passed, 0 failed** (exit 0) |
| `check_fo6_signing_port` (the contract, including the new clients-only case) | 17/17 |
| `check_fo6_signing`, `check_fo6_signing_api` (FO-6 parts 1-3 after the trigger and port change) | 47/47, 51/51 |
| `check_fo3c_consultation_agreement` (CONSULTATION still needs its firm signer) | 42/42 |
| `check_pf6b_permission_rules` (the own-or-all sweep, 7 new routes) | 41/41 |
| `check_pf12_walls`, `check_pf19r_every_sender`, `check_pf8b_f4_migrations` | 110/110, 21/21, 9/9 |
| `check_pf8b_f7_data_walls` | static checks pass; 6 fail because its scratch server on :15461 would not start here ("Connection refused"). Environment, not this diff |
| The new migration applied **in one transaction** (`psql -1 -f`) on a database at the previous migration | applies; `ADD VALUE` in a transaction is fine because nothing uses `'OTHER'` as an enum literal before commit (the bodies cast to text). Afterwards all three functions are owned by `xr_wall_reader`, `SECURITY DEFINER`, `search_path=pg_catalog, public, pg_temp` |
| `checkPdf` run on **20 real IRCC forms** already on disk (`studio/var/.../imm*.pdf`), renamed `letter.pdf` with title "Letter" | **0 of 20 caught as GOVERNMENT_FORM**. 19 refused as `PDF_PROTECTED`, 1 (`imm5476e-2021.pdf`) **accepted**. See Major 1 |

## What holds (checked, not taken from the PR)
* **Migration.** `CREATE OR REPLACE` of the two `xr_wall_reader`-owned functions is safe here. The migrator holds `xr_wall_reader` membership (pf12 line 149), and fo9b and fo7ts_part3 set the precedent. The DO block puts back `SECURITY DEFINER`, the owner and the `search_path` that `CREATE OR REPLACE` resets, and the CREATE-on-public grant/revoke pair is in order (F4 check passes). The bodies are part 1's text with exactly one extra condition each (`document_kind::text <> 'OTHER'`), compared line by line. **RETAINER and CONSULTATION still need a signed firm signer** for evidence and for SIGNED: test D shows a clients-only RETAINER request refused at evidence, and FO-6 and FO-3c pass unchanged. In code, `prepareRetainerSigning` and FO-3c's send both always name the FIRM signer. `fo_signing_document` has a forced RLS policy, the firm-first trigger, and no update, delete or truncate. Default privileges give `xr_data` and `xr_wall_reader` their grants.
* **Port contract.** "At most one firm signer, at least one client, each once" is enforced in `SigningSend` and has a contract case for clients-only (pass) and firm-only (fail). The webhook still hands only non-RETAINER kinds to a registered handler.
* **Routes, keys, firms.** Send and the signer picker need `agent/portal:request-work`. Reads need `agent/prospect:show`. Link and file need `agent/document:show`. All are `@OwnOrAll("agent/prospect")` and the PF-6b sweep covers each. Another firm's request, prospect, link, person or firm signer reads as 404 or 422, with nothing written. `state()` filters `documentKind: "OTHER"`, so a retainer's sealed key cannot be downloaded through this door. Download sends `no-store`, `nosniff`, a CSP sandbox and a fixed filename.
* **Webhook OTHER handler.** It verifies again and finds the request in its own firm. Order: a duplicate is answered before any fetch; files are fetched and stored only when CLIENT_SIGNED and every signer signed, before the transaction. In the transaction: receipt (request row locked) → evidence → SIGNED → audit → `signing.completed` (kind OTHER, schema-parsed) **last**. "Your signed document" goes to each client after commit, with an idempotency key. Other rules: no consent gives 409 with nothing kept; the firm before the clients gives 409; a redelivery applies; a duplicate `completed` changes nothing (S4).
* **OTHER never moves a prospect or makes a client.** The handler has no prospect, retainer or won write, and S4 checks stage, `prospect.won` (audit and module event) and `fo_retainer`. Nothing in `api/src` consumes `signing.completed` yet, so no consumer can misread kind OTHER.
* **File checks that work:** magic bytes (`%PDF-`, not name or type), the 25 MB limit, `/Encrypt`, no file, signer with no email, signer not on the prospect, firm signer not active in this firm. Each has a fail case, and no file is stored before the checks pass.

## Findings

### Blocker
None.

### Major
1. **The government-form check misses real IRCC forms, and the PR claims it is proven.**
   * **Where:** `any-document/service.ts:127`, `Buffer.from(f.bytes).includes("/XFA")`.
   * **Why it misses:** IRCC forms keep their AcroForm/XFA dictionary inside compressed object streams (`/ObjStm`), so `/XFA` never appears in the raw bytes.
   * **Evidence:** on 20 real forms (IMM 0008, 1294, 1295, 1344, 5257, 5406, 5409, 5475, 5476, 5483, 5484, 5532, 5533, 5556, 5562, 5589…), the XFA test fired **0 times**. 19 were stopped only by chance, by `/Encrypt` (IRCC forms carry an owner password). The message they get is "This PDF is protected. **Upload an open copy.**", which tells staff to remove the protection and send the government form anyway. `imm5476e-2021.pdf` (no encryption) was **accepted** once renamed. Inflating that file's streams finds `/XFA` in 2 of them, so the marker is there, only compressed.
   * **Why the test passes:** S2's XFA fixture puts a plain `/AcroForm << /XFA … >>` in the raw bytes, which real forms never do.
   * **What this breaks:** the row's "government forms are never sent this way" and AG-5-61 r6. The PR's table claims both are proven.
   * **Fix:**
     * Run the government-form check **before** `/Encrypt`.
     * Detect XFA in compressed objects too: inflate each FlateDecode `/ObjStm` stream (zlib, capped by size and count) and look for `/XFA`. A cheap second signal is the IMM number or "Immigration, Refugees and Citizenship Canada" in the uncompressed metadata.
     * Add a test fixture built in the test: an object stream holding `/XFA`, deflated, with no `/Encrypt`. It must be refused with `GOVERNMENT_FORM`. Keep a plain-PDF pass case.
2. **`GET people/:personId/documents` breaks own-or-all for each item.**
   * **Where:** `service.ts:248-259`. The route checks only that the viewer can see *some* prospect the person is on. It then lists **every** signed request the person signed: OTHER documents sent from prospects the viewer cannot see, and retainers of prospects the viewer cannot see. Each item shows title, date and hashes.
   * **Why it matters in practice:** a company's primary contact or signatory sits on every corporate prospect of that company, often owned by different staff. An own-only case officer who owns one of those prospects reads the titles of documents from colleagues' prospects (for example "Employment offer — Pine Bakery"). No file bytes leak, because the download door checks each request's own prospect.
   * **Why the tests miss it:** the PF-6b sweep and S4 check only whether the person can be reached, not each item.
   * **Fix:** unless `seesAll`, keep only items whose own prospect is visible. OTHER: `fo_signing_document.prospect_id`. RETAINER and CONSULTATION: the retainer's `prospect_id`. Add a pass and a fail: one person on two prospects with different owners, where the own-only viewer sees only their prospect's document.

### Minor
1. **The event kind name differs from the requirements.** BACKLOG FO-6 rev 16.16 names the payload kind `DOCUMENT`, and AG-5-61 §9 says `envelope.signed` with `kind = DOCUMENT`. The code uses `OTHER` (the row's enum word). It is defensible, but should be added to the PR's "Deviations, said" so FO-7 and later consumers do not code against `DOCUMENT`.
2. **`fo_signing_document` has no foreign keys.** `firm_id` has none to `platform_firm`, although every other signing table has one. `uploaded_by` has none to `platform_staff(firm_id, id)`, as `sent_by` has. The comment cites "other areas' files are not edited", but the sibling tables already reference `platform_firm` and `platform_staff`. Add the FKs, or say why not.
3. **Stale comments.** `handlers.ts:20` ("any-document/hooks.ts") and `service.ts:84, 262` ("./hooks.ts") name a file that does not exist; registration is in `features/front-office-signing-any-document.ts`.
4. **Possible size overrun.** The PR says "about 780 lines, under P-610's 800". The diff without `pr-body.md` and `MODULE.rows` is 806 insertions plus 10 deletions. Recount by P-610's rule and correct the claim if needed.
5. **Owner-password PDFs are refused.** A PDF with only an owner password (it opens without one, as many bank or employer letters do) is refused as "protected". AG-5-61 §12 says "a PDF with a password". This is conservative, so note it on the screen row (FO-6ds) or narrow the check to a user password later. No change is needed for this PR beyond Major 1's ordering.
6. **Orphan files on a failed send.** A file stored before `port.send` stays as an orphan when the adapter fails. Retainer sends behave the same way, and write-once keys make it harmless. Note only.
7. **Declines on OTHER requests are stored, not applied.** A `declined` event on an OTHER request is stored as a receipt and answered "applied by FO-5d". That matches FO-5d's row ("the adapter's declined event … is applied the same way"; "a non-retainer document gets no item"). FO-5d must cover kind OTHER: worth one line in FO-5d's hand-over.

## Done-when → proof (verified)
| line | pass | fail | holds? |
|---|---|---|---|
| uploaded PDF signed by two people ends with the sealed copy filed | S4 ×4 | S4 duplicate | yes |
| OTHER never moves a prospect or makes a client | (S4 state) | S4 | yes |
| a non-PDF → refused | S2 pass (real PDF) | S2 NOT_PDF | yes |
| without the key → 403 | S3 owner reads | S3 Read-only 403, no session 401 | yes |
| another firm's document id → 404 | S3 owner | S3 read/send/link 404 | yes |
| (row text) government forms never sent this way | none | S2 synthetic only | **no: Major 1** |
| AG-5-61 §12 password / no email | S2 pass | S2 ×2 | yes |
| firm signer optional, signs last | S1 (none), S5 | S5 | yes |
| database keeps part 1's rule except for OTHER | D pass | D fail (RETAINER) | yes (CONSULTATION by FO-3c's suite) |

## Journey score
Not applicable. This row is API only with no screen; FO-6ds owns the screen journey and its score. My replacement for the walk was two things: the API journeys through the row's suite and the PF-6b sweep, and a break-it pass with real IRCC files (Major 1) and a shared-contact visibility case (Major 2). I wrote no journey-test report for this row.

Fix list for Approve: Major 1, Major 2 (each with its pass and fail test). The Minors can be done in the same PR or recorded.

Verdict: Changes
