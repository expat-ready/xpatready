# FO-6 part 4b — the public signing door: plan (no code until 4a merges)

Row: BACKLOG **FO-6**. Rules note: `product/screens/FO-6-4/note.md` (on #3433, part 4a), rules 2-10 and 13. Lead 24's answers and Lead 25's answers are on #3433. Written 24 Nov (IST) on `claude/runtime-fo6-door-4b` from origin/main a75254842. **No code here:** WAY-OF-WORKING says never build on an unmerged PR, and the door calls 4a's `signing/door-code.ts` and `signing/email-code.ts` (Lead 25, answer 2). The build starts from origin/main once #3433 merges.

## Migration (Lead 24, answer 1)
* Stamp **20261124130000** (`20261124130000_fo6_signing_session`), re-stamped if main gets a later one first. On 24 Nov main's newest was 20261124050000.
* Two additive columns on `fo_signer`, and nothing else:
  * `session_sha256 text NULL`;
  * `session_expires_at timestamptz NULL`;
  * one CHECK: both or neither, the sha format via part 1's `fo_signing_sha_ok`, `isfinite`.
* No trigger change. Part 1's `fo_signing_signer_write` already freezes a signer once they have signed or declined, and once their request is final (`a signer who signed or declined does not change`; `the request is % and final`). So an ended session can never be written again.
* The webhook's SECURITY DEFINER lookup is its own part after 4c (answer 1).
* Rollback: `ALTER TABLE fo_signer DROP CONSTRAINT …, DROP COLUMN session_expires_at, DROP COLUMN session_sha256`.

## What 4b builds
| File | What |
|---|---|
| `prisma/schema/front-office-signing.prisma`, the migration folder | The two columns, above. |
| new `signing/door.ts` (service) | `resolve(token)`: the firm-first shape (`<32 hex>.<43 base64url>`, as FO-3c's `open`), then `withFirm(firm)` and the CLIENT signer by `link_token_sha256`. Anything else, including a FIRM signer's token, gives the one 404 "This link does not work." (rule 3). No bypass use. |
| | `state`: live gives the firm's operating name, `codeRequired` (`emailCodeOn`, read now, answer 8), the consent text and its version (`sign-electronically-v1`, the same as FO-3c's), and no personal data. Ended gives 200 with the state in words, the firm's name and nothing else (rule 4): "This agreement was updated. Please use the latest email.", withdrawn, declined, "This agreement has already been signed.", and expired. A request still SENT past `expires_at` already reads expired. `GET` of the state writes nothing. |
| | `code`: `askCode`, then the email after the commit (4a's mail, `templateKey signing.code`). `verify`: `checkCode`; OK gives a **new** session token (random 32 bytes, sha256 kept, Sample 30 minutes) that replaces any earlier one (rule 6). |
| | `consent`: needs a live session for this browser when the code is on (401 otherwise). Code off: it starts a new session itself, which is a bearer link until signed (answer 2). It records `consent_text_version` once, and a second consent is 200 with no change (rule 7). |
| | `session`: needs a live session and recorded consent. It answers `SigningPort.embeddedLink` and writes `viewed_at` once, SENT → VIEWED (rule 7). |
| | Every write runs under the request's row lock, with one audit line (actor `system:signing-door`) that never holds the code or the token (rule 13). |
| new `signing/door.controller.ts` | `GET /api/public/sign/:token` (`@OpenRead`, the module card's invariant); `POST …/code`; `POST …/code/verify` (strict body `{ code }`); `POST …/consent` (strict body `{ agree: true, consentTextVersion }`); `GET …/session` (`@OpenRead`). |
| | The cookie is `HttpOnly; SameSite=Strict; Path=/api/public/sign/<token>; Max-Age=1800`, plus `Secure` outside `local`. Every answer has `Cache-Control: no-store` (rule 10). |
| | Rate limits: per (address, token), Sample 30 a minute, and per address, Sample 300 a minute (answer 9). Bodies go through PF-28's `parseInput`. |
| `features/front-office-signing.ts` | Registers the controller. |
| `MODULE.rows/FO-6-4b.md` | Entry points, tables, tests (P-712). |
| `tests/check_fo6_door.ts` | The third argument becomes `4a,4b`. 4c's lines stay PENDING, and a PENDING line that passes fails (4a review m3). |

**#3209:** checked again against main's `audit/access/declare.ts`. It binds only `@SystemKeys` and `@AnySystemStaff` routes under `/api/system`, so these public routes take no AUD-3 declaration (Lead 24, answer 7).

**Estimate:** about 650-750 changed lines, under 800 (P-610). The breaker runs, because this is a public door with a schema change.

## Journey lines 4b turns green (with 4a merged)
* j_54 W2: the door half (code, consent, session).
* j_61 W2 API (the link opens the agreement to sign).
* j_61 W3: the door (code by email, verify with the cookie, consent, session).
* j_61 W6 API and W7 API need 4c's signature first.

## Read together with 4b: QA-777 (Lead 25: mine right after 4b; #3451)
FO-3c's consultation door (`booking/consultation-agreement/service.ts` `open`, about lines 392-476) moves onto 4a's `door-code.ts` and 4b's browser-bound session, and records consent **only after** the code. That fixes QA-777's two failures: a forwarded link that gets the signing link with no code for 30 minutes, and consent recorded before any code. Its own PR comes right after 4b, so the session code is reviewed once.

* **Touch:**
  * `booking/consultation-agreement/service.ts` and `controller.ts`, which gain the session cookie on `POST /api/public/consultation-agreements/open`, or move to 4b's routes (to decide when 4b's door shape is merged);
  * `tests/check_fo3c_consultation_agreement.ts` and `tests/check_fo3c2_consultation_agreement.ts`, where their consent-first steps change;
  * qa's `tests/qa/check_qa777_consult_door_not_bound.ts`, which must go from red (3/5, exit 1) to green (5/5, exit 0) and which I do not edit.
* **Red first:** `check_qa777_consult_door_not_bound` on an isolated copy of main, its output in that PR.

## The two follow-ups after 4b (Lead 25)
1. QA-777, above.
2. FO-6d's sends email their client links: one call to `sendPleaseSign(…, kind: "OTHER")` in `signing/any-document/service.ts` (Lead 25, answer 3).
