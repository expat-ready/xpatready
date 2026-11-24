# FO-6 part 4 — the public signing door: rules note (step 1, check first)

Row: BACKLOG **FO-6** (rows rev 16.8, 16.13, 16.16; contracts §2.4, §7). Items: R1.54, R1.55, R1.61. Area: runtime (API only). Written 24 Nov (IST) on `claude/runtime-fo6-door` from `origin/main` a26e80b6a. The check-first test is `studio/tests/check_fo6_door.ts`: on main it fails 25 of 27 lines and exits 1 (`studio/tests/check_fo6_door.ts`'s output is in the PR). Step 1 only: no code until the tech lead says go.

## What is on main already (read, not assumed)
* Part 1 (#2038): `fo_signature_request`, `fo_signer`, `fo_signing_evidence`, `fo_signing_hook_receipt`. `fo_signer` already has the code columns (`code_sha256`, `code_expires_at`, `code_failures` 0-6, `locked_until`, `code_verified_at`), consent (`consent_text_version`, `consented_at`, no signature without consent), `link_token_sha256` (unique per firm).
* Part 2 (#2040): `SigningPort` and `fakeSigning` (`signing/port.ts`). The fake's `embeddedLink` answers `https://signing.fake.invalid/...`, which no browser opens.
* Part 3 (on main): Send makes the request and its signers (`prepareRetainerSigning`), the state read, the webhook door, evidence, `signing.completed`, the win. **The link tokens are made and only their sha256 is stored; the plain token is thrown away and no "Please sign" email is sent** (`signing/service.ts:60-82`). So today no client can ever open a retainer link, including on requests sent before part 4.
* FO-3c (consultation agreements, `booking/consultation-agreement/service.ts:392-476`) already runs a door on `fo_signer`: firm-first token, email code (10 min, sixth wrong code locks 15 min, 60 s resend gap), consent text `sign-electronically-v1`. Two gaps against FO-6's rules: the code check is not bound to a browser (a verified code opens the link from any browser for 30 minutes, so a forwarded link skips the code), and consent comes before the code. Question 3.

## The rules part 4 builds (each with the test line that proves it)
| # | Rule | Source | Test line (`check_fo6_door.ts`) |
|---|---|---|---|
| 1 | Send emails each client signer one "Please sign" email through our `MailPort` (Reply-To the firm's contact address) with `<public base>/sign/<token>`; the token is firm-first (`<firm id hex>.<43 base64url>`, part 3's and FO-3c's shape), kept only in memory until the email is handed over after commit; only its sha256 is stored. No vendor email (P-561 (2)). | FO-6 row; P-561; P-563 | A (part 4a) ×2 |
| 2 | `GET /api/public/sign/:token`, live: 200 with the firm's operating name, `codeRequired`, the consent text and its version; **no personal data** (no name, no email) before a session exists. | FO-6 row | B ×2 |
| 3 | An unknown, malformed or other firm's token, and a FIRM signer's token (the firm signer never uses the door), give **one identical** 404 "This link does not work." The token's firm is set with `withFirm` before any read: no bypass use. | FO-6 row | B |
| 4 | An ended request answers 200 with its state in words (updated, withdrawn, declined, signed, expired) and the firm's name, no personal data, and every write door (code, verify, consent, session) refuses. A request still SENT past `expires_at` (the day-14 job is part 5) already reads **expired**. | FO-6 row; AG-5-21; AG-5-65 r3 | B ×5, E |
| 5 | **Email code, P-564:** a firm setting `front-office.signing.email_code` (PF-3's settings home, boolean, **default true**). On: `POST …/code` mails 6 digits (Sample 10 minutes, single use, 60 s resend gap, FO-3c's values), only the sha256 stored. | P-564 | C, D |
| 6 | `POST …/code/verify`: a right code starts a **signing session bound to the browser**: a random session token in an http-only, `SameSite=Strict`, `Secure` (outside local) cookie with `Path=/api/public/sign/<token>`, Sample 30 minutes; only its sha256 stored. The sixth wrong code locks the link 15 minutes (423, Sample); a right code while locked is refused too. | FO-6 row; P-564 | C ×2 |
| 7 | `POST …/consent` and `GET …/session` refuse (401) without a live session for that browser; a forwarded link in a fresh browser needs the code again. Consent records `consent_text_version` once (AG-5-20) and is required before the session's link. | FO-6 row; AG-5-20, AG-5-25 | C ×3 |
| 8 | Code switched off: `codeRequired: false`, no code is mailed, and `POST …/consent` itself starts the session (sets the cookie). | FO-6 row ("with the code off the session starts at consent"); P-564 | D |
| 9 | `GET …/session` answers the adapter's embedded link (`SigningPort.embeddedLink`); the link reopens (state and session again) until its signer signs or declines. | AG-5-21; FO-6 row | C ×2 |
| 10 | Rate limited per caller address (Sample 60 a minute over the whole door), as part 3's webhook door and FO-3c's. | FO-6 row | F |
| 11 | **The copy's stand-in signing page (fake adapter only):** the fake's `embeddedLink` points at a page on the copy's own origin (`<public base>/api/public/sign-fake/<doc>/<signer>/<nonce>`, a short-lived nonce, the fake's 10 minutes) with Sign; Sign makes the fake's `act("signed")` and hands its webhook calls to our own `Signing.receive`, so the ordering, consent and evidence rules of part 3 apply unchanged. Mounted only while the process's adapter is the fake and `PLATFORM_ENVIRONMENT` is local or CI (never test or production): a start-up check refuses otherwise. | FO-6 row; P-561 (no vendor call in this part) | E ×2 |
| 12 | **The firm signer's link:** `POST /api/front-office/retainers/:id/firm-signing-link`, `@PermissionKeys("agent/retainer:show")`, `@OwnOrAll("agent/prospect")`, and the caller must be the retainer's representative (403 otherwise); only once every client signed (409 before). Answers the adapter's link (on the copy: rule 11's page). | FO-6 row ("declares `agent/retainer:show` and checks the caller is the retainer's representative") | E ×2 |
| 13 | Every door write (code sent, wrong code, lock, session started, consent) writes one audit line in its transaction through `AuditPort` (actor `system:signing-door`), never the code or token. | FO-6 row ("every change writes one audit line") | review, part 4b's own suite |

**Declarations (#3209):** AUD-3's `@ReadsFirm` / `@ChangesFirm` / `@ReadsAcrossFirms` / `@NoFirmData` bind routes under `/api/system` called by our own staff (`audit/access/declare.ts:1-12`). None of part 4's routes is one: the door is under `/api/public` (no staff), the firm signer's link under `/api/front-office` behind PF-4's guard (its `@PermissionKeys` is its declaration). Each new route still gets its entry-points line in `api/src/front-office/MODULE.rows/FO-6-4*.md` (P-712), and the door needs no PF-12 bypass use (rule 3). If #3209 is meant to cover more, question 7.

## Migration: yes (part 4b), the tech lead gives the stamp
`fo_signer` gains `session_sha256 text NULL` and `session_expires_at timestamptz NULL` (both or neither; sha format checked by part 1's `fo_signing_sha_ok`). Additive, on FO-6's own table (P-600 (1)). Why not without: a stateless signed cookie needs a server key (PF-24's `Secret`) and cannot be ended when the signer signs or the request ends; storing the session on `code_verified_at` (FO-3c's way) cannot tell one browser from another, which is rule 7's whole point. Lead 5 on #3065 tied the webhook's bypass use to "FO-6's next migration replaces it with a narrow SECURITY DEFINER lookup": question 1.

## The split (P-610; each PR under 800 changed lines, estimates)
| Part | What | Touch | Est. lines | Migration |
|---|---|---|---|---|
| **4a** | Rule 1 (the "Please sign" email after Send's commit, through `afterCommit`, which `Retainers.send` already calls, so `retainers/service.ts` is not touched; no overlap with #3424 FO-5cr), rule 5's setting registered, and a shared `signing/door-code.ts` (send, verify, lock: FO-3c's logic, the session added) with its own unit tests; no route yet | `signing/service.ts`, new `signing/link-mail.ts`, new `signing/door-code.ts`, `features/front-office-signing.ts`, `MODULE.rows/FO-6-4a.md` | ~450 | no |
| **4b** | Rules 2-10, 13: the five door routes, the session cookie, the rate limit | new `signing/door.ts`, new `signing/door.controller.ts`, `features/front-office-signing.ts`, `prisma/schema/front-office-signing.prisma`, one migration folder, `MODULE.rows/FO-6-4b.md` | ~700 | **yes** |
| **4c** | Rules 11-12: the fake's stand-in page and the firm signer's link | `signing/port.ts` (the fake's link base), new `signing/fake-page.ts`, `signing/routes.ts`, `MODULE.rows/FO-6-4c.md` | ~400 | no |

The test is one file for the three parts; each part's PR carries its lines green and leaves the later parts' lines red, named by part in each label. Breaker on 4b and 4c (external door, permissions).

## Journey lines each part turns green (as read on main a26e80b6a)
| Journey line | 4a | 4b | 4c | Still needs |
|---|---|---|---|---|
| j_54 W1 "Send made one live RETAINER signing request…" | | | | green already (part 3) |
| j_54 W1 "carried by the vendor's sandbox (BOLDSIGN)" | | | | **FO-6v** (held P-561), a Mac check |
| j_54 W2 "opens their emailed link, verifies the code, consents, session opens" | link | ✓ | | |
| j_54 W2 "client A signs; CLIENT_SIGNED" | | | ✓ | |
| j_54 W3 "the representative signs last; SIGNED" | | | ✓ | |
| j_54 W4-W6 (evidence stored, downloads, on the person) | | | unblocks | part 3's evidence rows follow once W3 signs; the downloads use j_54's guessed body `file: "signed" / "evidence"` and `GET people/:id/documents`: green only if those match main (not checked here) |
| j_54 W7-W9 (any document) | | | | FO-6d, FO-6ds |
| j_55 W1 "Send made one live signing request with the client's link" | | | | green already (part 3) |
| j_55 W1 "the withdraw stops the signing link (CANCELLED WITHDRAWN)" | | | | **FO-5d** (2) |
| j_55 W3 "the client has a signing link for version 3 in their email" | ✓ | | | |
| j_55 W3 decline with reason; the page shows it | | | | **FO-5d** (1) (`POST …/decline`, `decline_reason` migration), **FO-5s** (the door's page) |
| j_61 W1 "exactly one link to sign" and "no second link to pay" | ✓ | | | |
| j_61 W2 API "the link opens the agreement to sign (200, firm named)" | | ✓ | | |
| j_61 W2 page, W6 page, W7 page, W8 | | | | **FO-5s** (the door's web page `/sign/:token`) |
| j_61 W3 "code verifies, consent recorded, session opens" (with the cookie) | | ✓ | | |
| j_61 W3 "the client signs; CLIENT_SIGNED" | | | ✓ | |
| j_61 W4-W5 (the invoice on the same link, pay) | | | | G2's joining row (no backlog row yet), FO-7c |
| j_61 W6 API, W7 API (used link refused, no code, no session) | | ✓ | ✓ | |

## What part 4 leaves out
* **FO-6v (held, P-561):** the vendor adapter; whether the vendor's view shows its own consent (agreeing twice); its embedded link's life against our 30-minute session; how Decline appears there; the frame policy (the vendor's Canada host only) and the frame's title; `express.raw` on the webhook path. j_54 W1's BOLDSIGN line stays red.
* **Part 5 of FO-6:** expiry on day 14 by `JobPort` (rule 4 only reads it), reminders, **Send updated version** (one live request, one "Updated agreement" email, AG-5-65 r2-r4), the "needs you" item and email to the representative when the client signed (AG05-D4(2)), PF-27's locked-firm refusal (`firmAllows(firmId, 'sign')` is not on main).
* **FO-5d:** decline with its reason, withdraw and edit stopping the link.
* **FO-5s:** the client's web page for the door (375 px first), and the Owner's switch for the email code.

## Questions for the tech lead (with my recommendation)
1. **Migration stamp for 4b, and its scope.** Recommend: one stamp for the two `fo_signer` columns only; the SECURITY DEFINER lookup Lead 5 tied to "FO-6's next migration" goes in its own small part right after (it changes the webhook's read path and needs its own breaker look), unless you want it in 4b's folder.
2. **Code off and a forwarded unused link.** AG-5-21 says "A forwarded link cannot be reused"; P-564 lets a firm switch the code off and the row says "with the code off the session starts at consent". With the code off, a forwarded link that was never used opens a session in any browser (a bearer link, as AG-5-61 r13 accepts). Recommend: read AG-5-21's sentence as "after use" (rule 4 already kills a used link) and say so in the firm's switch text; it is a product point, so yours or the founder's.
3. **FO-3c's consultation door on main is not browser-bound** (a verified code opens the link from any browser for 30 minutes, so a forwarded link skips the code) and asks consent before the code. Recommend: a qa/BUGS row (qa's file, not mine) and a small follow-up that moves FO-3c onto part 4a's `door-code.ts` once 4b merges.
4. **j_61 W8's stand-in token has no firm prefix** (`randomBytes(24)`), so rule 3 answers "This link does not work.", not "expired". It is red anyway until FO-5s's page, but its API half will not turn green on part 4. Recommend: qa writes the stand-in token in the firm-first shape.
5. **Requests sent before part 4 have no openable link** (part 3 threw the plain token away). Recommend: accept on the demo (Sample data; a Send of a new version, part 5, mails a fresh link); no back-fill.
6. **The Owner's switch for the code** has no route on main. Recommend: 4a registers the setting (tests write it); the switch lands with FO-5s's settings, not in part 4.
7. **#3209's declaration rule:** I read it as binding only `/api/system` staff routes (above). If you meant every new route gets an AUD-3-style declaration, say which, and 4b adds it.
