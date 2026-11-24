# FO-6 part 4 — the public signing door: rules note (step 1, check first)

Row: BACKLOG **FO-6** (rows rev 16.8, 16.13, 16.16; contracts §2.4, §7). Items: R1.54, R1.55, R1.61. Area: runtime (API only). Written 24 Nov (IST) on `claude/runtime-fo6-door` from `origin/main` a26e80b6a. The check-first test is `studio/tests/check_fo6_door.ts`: on main it passes 2 of 31 lines (setup and part 3's Send) and exits 1 (`studio/tests/check_fo6_door.ts`'s output is in the PR). Step 1 only: no code until the tech lead says go.

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
| 4 | An ended request answers 200 with its state in words: "This agreement was updated. Please use the latest email." (AG-5-65 r3), withdrawn, declined, "This agreement has already been signed." (worded to match j_61's refusal words), expired and the firm's name, no personal data, and every write door (code, verify, consent, session) refuses. A request still SENT past `expires_at` (the day-14 job is part 5) already reads **expired**. | FO-6 row; AG-5-21; AG-5-65 r3 | B ×5, E |
| 5 | **Email code, P-564:** a firm setting `front_office.signing_email_code` (PF-3's settings home, boolean, **default true**). On: `POST …/code` mails 6 digits (Sample 10 minutes, single use, 60 s resend gap, FO-3c's values), only the sha256 stored. | P-564 | C, D |
| 6 | `POST …/code/verify`: a right code starts a **signing session bound to the browser**: a **new** random session token on every verify (and on a code-off consent), replacing any earlier one (no session fixation), carried in an http-only, `SameSite=Strict`, `Secure` (outside local) cookie with `Path=/api/public/sign/<token>`, Sample 30 minutes; only its sha256 stored. The sixth wrong code locks the link 15 minutes (423, Sample); a right code while locked is refused too. | FO-6 row; P-564 | C ×2 |
| 7 | `POST …/consent` and `GET …/session` refuse (401) without a live session for that browser; a forwarded link in a fresh browser needs the code again. Consent records `consent_text_version` once (AG-5-20; part 1's trigger refuses a second write); a second consent is answered 200 with no change. Consent is required before the session's link. `GET …/session` writes `viewed_at` the first time the document is shown (SENT → VIEWED), once, whichever of it and the webhook's `viewed` comes first; `GET` of the state writes nothing. | FO-6 row; AG-5-20, AG-5-25 | C ×3 |
| 8 | Code switched off: `codeRequired: false`, no code is mailed, and `POST …/consent` itself starts the session (sets the cookie). A second browser's consent (consent already recorded, not written again) starts its own session and replaces the first: **with the code off a live link is a bearer link until signed** (question 2). The setting is read on each door call, not fixed at Send (question 8). | FO-6 row ("with the code off the session starts at consent"); P-564 | D |
| 9 | `GET …/session` answers the adapter's embedded link (`SigningPort.embeddedLink`); the link reopens (state and session again) until its signer signs or declines. | AG-5-21; FO-6 row | C ×2 |
| 10 | Rate limited per (caller address, token), Sample 30 a minute, plus a per-address ceiling (Sample 300 a minute), so one caller cannot block other clients' links. The address is `req.ip`; no trust-proxy is set in the API today, so behind a proxy every caller shares one address and only the per-token limit protects a link (question 9). Every door answer carries `Cache-Control: no-store`. The Referer the vendor's frame sees is set by the page that holds the token in its address, so FO-5s's `/sign/:token` page sends `Referrer-Policy: no-referrer` (4a review m6); the API answers carry it too, which is harmless but not the protection. A malformed token is refused before any read and a well-formed one after a lookup; the time difference tells nothing an attacker lacks (256-bit tokens, firm ids not secret). | FO-6 row | F |
| 11 | **The copy's stand-in signing page (fake adapter only):** the fake's `embeddedLink` points at a page on the copy's own origin (`<public base>/api/public/sign-fake/<doc>/<signer>/<nonce>`, a short-lived nonce, the fake's 10 minutes) with Sign; Sign makes the fake's `act("signed")` and hands its webhook calls to our own `Signing.receive`, so the ordering, consent and evidence rules of part 3 apply unchanged. The page checks its nonce against the one the fake issued (in memory, single use, 10 minutes); after a restart the fake forgets its envelopes and `/session` answers 409 "Ask the firm to send it again" (local only). Registered only when `PLATFORM_ENVIRONMENT` is `local` (the only values are local, test, production, `config/settings.ts:18`); in test and production the route does not exist (404), and a start-up assertion checks it is not registered there; it never stops the app. | FO-6 row; P-561 (no vendor call in this part) | E ×2 |
| 12 | **The firm signer's link:** `POST /api/front-office/retainers/:id/firm-signing-link`, `@PermissionKeys("agent/retainer:show")`, `@OwnOrAll("agent/prospect")`, and the caller must be the retainer's representative (403 otherwise); only once every client signed (409 before). The body takes `{ consent: true, consentTextVersion }` and records the firm signer's consent once (AG-5-25: part 3's webhook refuses a signature with no consent, `signing/service.ts:211`; FO-3c's `hostLink` does the same); without it 422. Answers the adapter's link (on the copy: rule 11's page). | FO-6 row ("declares `agent/retainer:show` and checks the caller is the retainer's representative") | E ×3 |
| 13 | Every door write (code sent, wrong code, lock, session started, consent) writes one audit line in its transaction through `AuditPort` (actor `system:signing-door`), never the code or token. | FO-6 row ("every change writes one audit line") | C (audit line) |

**Declarations (#3209):** AUD-3's `@ReadsFirm` / `@ChangesFirm` / `@ReadsAcrossFirms` / `@NoFirmData` bind routes under `/api/system` called by our own staff (`audit/access/declare.ts:1-12`). None of part 4's routes is one: the door is under `/api/public` (no staff), the firm signer's link under `/api/front-office` behind PF-4's guard (its `@PermissionKeys` is its declaration). Each new route still gets its entry-points line in `api/src/front-office/MODULE.rows/FO-6-4*.md` (P-712), and the door needs no PF-12 bypass use (rule 3). If #3209 is meant to cover more, question 7.

## Migration: yes (part 4b), the tech lead gives the stamp
`fo_signer` gains `session_sha256 text NULL` and `session_expires_at timestamptz NULL` (both or neither; sha format checked by part 1's `fo_signing_sha_ok`). Additive, on FO-6's own table (P-600 (1)). Why not without, honestly: (a) a stateless signed cookie works (the door re-reads the signer and request each call anyway) but needs a server key (PF-24's `Secret`) and cannot replace one browser's session with another's (rule 6, rule 8); (b) after a verify the single-use code columns are free, and `code_sha256`/`code_expires_at` could hold the session's hash and expiry within `fo_signer_code_check`; rejected because one column pair would mean two things (a pending code or a live session), which the code's own rules (resend gap, lock, expiry) then have to tell apart; (c) `code_verified_at` alone (FO-3c's way) cannot tell one browser from another. I recommend the two columns; (b) is the fallback if you refuse the stamp. Lead 5 on #3065 tied the webhook's bypass use to "FO-6's next migration replaces it with a narrow SECURITY DEFINER lookup": question 1.

## The split (P-610; each PR under 800 changed lines, estimates)
| Part | What | Touch | Est. lines | Migration |
|---|---|---|---|---|
| **4a** | Rule 1 (the "Please sign" email after Send's commit, through `afterCommit`, which `Retainers.send` already calls, so `retainers/service.ts` is not touched; no overlap with #3424 FO-5cr), rule 5's setting registered, and a shared `signing/door-code.ts` (code send, verify and lock only: FO-3c's logic on part 1's columns; the session waits for 4b's columns) with its own unit tests; no route yet | `signing/service.ts`, new `signing/link-mail.ts`, new `signing/door-code.ts`, `features/front-office-signing.ts`, `MODULE.rows/FO-6-4a.md` | ~450 | no |
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
2. **Code off: a bearer link until signed.** AG-5-21 says "A forwarded link cannot be reused"; P-564 lets a firm switch the code off and the row says "with the code off the session starts at consent". Consent is written once (part 1's trigger), so a client who consented on a phone needs a second browser to get a session too; then anyone holding the link gets a session at any time before signing (rule 9 keeps it alive until then). Only the code makes AG-5-21's sentence true. Recommend: accept it as the firm's own choice when it switches the code off, say so in the switch's text ("anyone with the link can sign until it is signed"), and keep the code on by default (P-564). A product point: yours or the founder's. The test's D line encodes this recommendation.
3. **FO-3c's consultation door on main is not browser-bound** (a verified code opens the link from any browser for 30 minutes, so a forwarded link skips the code) and asks consent before the code. Recommend: a qa/BUGS row (qa's file, not mine) and a small follow-up that moves FO-3c onto part 4a's `door-code.ts` once 4b merges.
4. **j_61 W8's stand-in token has no firm prefix** (`randomBytes(24)`), so rule 3 answers "This link does not work.", not "expired". It is red anyway until FO-5s's page, but its API half will not turn green on part 4. Recommend: qa writes the stand-in token in the firm-first shape.
5. **Requests sent before part 4 have no openable link** (part 3 threw the plain token away). Recommend: accept on the demo (Sample data; a Send of a new version, part 5, mails a fresh link); no back-fill.
6. **The Owner's switch for the code** has no route on main. Recommend: 4a registers the setting (tests write it); the switch lands with FO-5s's settings, not in part 4.
7. **#3209's declaration rule:** I read it as binding only `/api/system` staff routes (above). If you meant every new route gets an AUD-3-style declaration, say which, and 4b adds it.
8. **The setting is read on each door call** (recommend), so switching the code off turns links already sent into bearer links at once and switching it on protects them at once; the other way is to fix it on the request at Send (needs a column). Recommend: live read, and the switch's text says so.
9. **The caller's address behind a proxy.** The API sets no trust-proxy; behind the demo's Vite proxy or a load balancer every caller has one address. Recommend: part 4b keys the limit per (address, token) as above, and trust-proxy goes to the platform row that owns `main.ts` (not part 4).
10. **j_54 W3's guessed firm-signer body is `{}`**; with rule 12 it needs `{ consent: true, consentTextVersion }`. Recommend: qa changes j_54 W3's body (it is qa's file); otherwise that line stays red with a 422 after 4c.

## Challenge (P-303)
A fresh Opus challenger read this note, the test, the row and the code on main: **Changes** (no Blocker, 7 Majors, 11 Minors). Fixed in this note and the test:
* Majors: rule 12 now takes the firm signer's consent (part 3 refuses a signature without it); the code-off bearer exposure is stated (rule 8) and question 2 rewritten; 4a no longer needs 4b's columns; the stand-in page is local only, and test and production never register it; the cookie path is anchored, `SameSite=Strict` is checked and the test's cookie jar honours `Path`; the non-representative is a fixed case officer and the 403's own code is asserted; the rate limit is keyed per (address, token), with question 9 added.
* Minors: the migration reasoning is honest and names the code-column fallback; the setting is read live (question 8); `no-store` and `no-referrer` are added; timing is addressed; the right code is refused while locked (tested); consent is written once (tested); an audit line per door write (tested); GET writes nothing and the session writes `viewed_at`; a new session token on every verify; the nonce is checked; the "signed" wording matches j_61's; question 10 (j_54 W3's body).
* Not taken: no rule was cut. The test keeps its stand-ins by SQL, said in its header.

## Part 4b additions (Lead B's three Minors on #3433, 4a's first read)
1. **The email's words** name every end: "It works until you sign or decline, until it expires, or until <firm> sends you a newer version." (`link-mail.ts`; test `check_fo6_door_code` S).
2. **No localhost link outside local:** `signingPublicBase()` is null outside `PLATFORM_ENVIRONMENT=local` when `STUDIO_PUBLIC_URL` is unset, and then no "Please sign" email is sent (logged as an error). The copy still starts, because refusing to start would stop every other module (test `check_fo6_door_code` S).
3. **Who can read the stored email (and so the full link):**
   * Staff's message list (`GET /api/platform/messages`) shows a message's facts, never a transactional body: "transactional bodies stay sealed, PF-19e" (`platform/messages/staff-routes.ts:4`).
   * The rendered email is a file in the firm's file space. It is read only by the demo inbox (`GET /api/demo/platform-inbox`, the local adapter, demo workspace only, 404 elsewhere) and by whoever operates the file store and database (our own staff with infrastructure access).
   * With the code on, the link alone opens nothing (rule 7). With it off, it is a bearer link until signed (Lead 24, answer 2), so this exposure is the firm's choice, named in the switch's words.

## Part 4b round 1 fixes (reviewer and breaker on 2ba80d7c4, `review-4b.md`, `break-report-4b.md`)
* **Rule 10, the rate limit, changed** (breaker M1, reviewer m4):
  * Per (address, token), Sample 30 a minute, as before.
  * The address ceiling now counts only **misses** (malformed or unknown links), Sample 300 a minute. Past it, further misses get 429, but a live link is never refused because of other callers. With no trust-proxy, every client behind a proxy shares one address, and the old 300-a-minute ceiling on every call was one global limit.
  * POST bodies must be JSON (415 otherwise; breaker m4).
* **Rule 4's signed words** are now "This agreement has been signed.", which j_61's refusal words match (reviewer M1).
* **The code:**
  * A check with no live code (none asked, expired, or already used) is refused and not counted, so a forwarded-link holder cannot lock the client out (breaker m2).
  * With the code on, only a session a right code started counts: a session started by consent while the code was off ends when the firm switches the code back on (breaker m1).
  * The code's email key holds nothing of the code (reviewer m1).
* **Small fixes:**
  * The state is re-checked after the request's lock: 409 in words, never a 500 (reviewer m3).
  * The retainer moves to VIEWED only at its current version (reviewer m2).
  * The view line has before and after (reviewer m6).
  * With the code off, the 401's words say "Agree first" (reviewer m5, breaker m3).
  * `rollback.sql` deletes its `_prisma_migrations` row (reviewer m7).
* **Tests** (reviewer M2): headers; consent needed; GET writes nothing; viewed and VIEWED; session replacement with the code on; the server-side expiry; checks with no code asked; JSON only; the code switched back on; SIGNED_OFFLINE in the ended-state loop; misses never blocking a live link.

## Hand-over: FO-6 part 4c (written 24 Nov at 4b's Approve; Lead 28: no 4c in this session)
**State.** 4a is on main (#3433). 4b (#3460) has round 3 approved by the reviewer and the breaker on fcb8e3ad8. Still owed, by the Lead, before the label: Lead B's re-read, the Lead's read line, and `ci` on the final head. Its stamp 20261124130000 lands after #3234 and #3235 (Lead 28). **Start 4c only once #3460 has merged**, on a new branch from origin/main (never build on an unmerged PR).

**4c builds** (rules 11 and 12 above; the concept first, Lead 28: "Start 4c's concept now"):
1. **The fake's stand-in signing page** (local only):
   * `fakeSigning`'s `embeddedLink` points at a page on the copy's own origin, never `signing.fake.invalid`. That origin is `signingPublicBase()` from `link-mail.ts`, which is null outside local.
   * The page checks a single-use nonce (10 minutes, held in the fake) and has a Sign button. Sign runs the fake's `act("signed")` and hands its webhook calls to `Signing.receive`, so part 3's order, consent and evidence rules apply unchanged.
   * The route is registered only when `PLATFORM_ENVIRONMENT=local`. In test and production it does not exist (404), and a start-up assertion checks that it is not registered there. **4a review m5:** a unit line proves the 404 outside local.
   * After a restart the fake has forgotten its envelopes, so `/session` answers 409 "Ask … to send it again" (already in `door.ts`).
2. **The firm signer's link:** `POST /api/front-office/retainers/:id/firm-signing-link`.
   * Keys: `@PermissionKeys("agent/retainer:show")`, `@OwnOrAll("agent/prospect")`, and the caller must be the retainer's representative (403 `NOT_THE_REPRESENTATIVE`).
   * Only after every client signed (409 before). The body is `{ consent: true, consentTextVersion }`, which records the firm signer's consent once (part 3's webhook refuses a signature without it, `signing/service.ts:211`); without it, 422.
   * It answers the adapter's link, which on the copy is item 1's page.
3. **Lead B 6's two Minors on #3460:**
   * `session` asks the provider for the embedded link before the lock. Re-check the end and the session under the lock after the link is fetched, and refuse if the request ended meanwhile.
   * The limiter is in one process and its map is swept only of expired keys. Carry both as **known limits** in the module card (Lead 28: fine until two tasks share a limit).
4. **The test:** `check_fo6_door.ts` drops its third argument (`4a,4b`), so every line counts; E's six lines must go green. If the door's page path changes, j_54 W3's `{}` body is qa's to change (Lead 24, answer 10).
5. **Records:** `break-report-4b.md` is 107 lines after three rounds; the facts were kept, nothing cut (rule 8).

**Size:** about 400 changed lines; no migration. Breaker: yes (a staff permission route and a public page).
**Journey lines 4c turns green:**
* j_54 W2 (signs) and W3;
* j_61 W3 (signs), and W6 and W7 API;
* it unblocks j_54 W4-W6.

**Not 4c:**
* FO-6v, the vendor (held, P-561);
* part 5: expiry by JobPort, reminders, Send updated version, the representative's "needs you", PF-27;
* FO-5d (decline, withdraw);
* FO-5s, the client's `/sign/:token` page;
* QA-777 (the R1.104 lane);
* FO-6d's link emails (a small row after 4b, Lead 25).
