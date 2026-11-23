# R1.90 invited sign-up (API only): break report

PR #3040, branch `claude/runtime-r190-invited`, head `bacf188d8a9aa8bf1bdb3afd9f94728775457b9a`. The copy was isolated as `brk_r190i` on :4436 (`PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`), with the API connecting as `xr_app`. It cost US$0: no Stripe and no live AI. The author's `check_r190_invited_signup.ts` passed 11/11 on that copy before the attacks. The attack scripts were kept outside the repo, and each POST was sent from its own loopback source address (127.0.x.y) so the per-IP limit did not hide results. Paths below are under `prototype/studio/`.

## Blockers
None.

## Majors
**M1. A badly formed token gets a 500, not the one 404. This is a PF-28 break on a public door.**
- How to reproduce:
  - `curl localhost:4436/api/public/signup/$(python3 -c "print('A'*65)")` gives 500.
  - The same happens for `.../signup/%41AAAA…`, `.../signup/A%2eB`, `.../signup/a%20b` and `.../signup/verify%2F`. GET and POST both give 500.
  - A 64-character token gives 404, as it should.
  - `api.log` shows `level:error` with a stack at `asBypass (firm-scope.ts:285)` ← `PlatformSignUp.invited (signup.ts:247)`.
- Expected: 404 "This link is not valid any more…". The concept says "Unknown, used and expired links are one 404", and PF-28 says a bad path value "answers 404, never 500".
- Why it happens: `invited()` and `signUpInvited()` enter `asBypass("platform.firms.signup")` (signup.ts:247, 258) before the `LINK_TOKEN` shape check (signup.ts:237, 264). The use's route list only allows `/^(GET|POST) \/api\/public\/signup\/[A-Za-z0-9_-]{1,64}$/i` (firm-scope.ts:139), checked against the raw path. A path over 64 characters, or one with a `%`, is refused as `BypassRefused`, which becomes a 500.
- Why the checks missed it: PF-28's sweep only sends a 43-character token (check_pf28_inputs.ts `:inviteToken`).
- Who can trigger it: anyone, without signing in. Each hit counts as an Error in the request metric and writes an error log line.

**M2. A refused open or form leaves no `platform.bypass` audit line, even though the code says it writes one.**
- How to reproduce:
  - Count `audit_event where action='platform.bypass'`.
  - `GET /api/public/signup/<43 unknown chars>` gives 404. Then POST the same token with a valid body: it gives 404 or 429.
  - The count does not change (it stayed at 62). The 300 unknown-token GETs I sent added 0 lines.
  - For comparison, `POST /api/public/signup/verify` with an unknown token adds one line `{step:"signup.verify-refused", key:null}` (143 → 144).
- Expected: one firm-less line for each bypass read, refused ones included. This is the Lead 15 ruling on #2814 that the verify door follows (signup.ts:285-293). It is also P-607 (3), "no action without its audit line". `liveLink` itself writes `touchPlatform(tx, {step:"signup-link.open", key: row?.id ?? null})` for exactly this case.
- Why it happens: in `liveLink` (signup.ts:238-243), `throw notFound()` happens inside the same `$transaction` that wrote the line. The rollback removes the line for every unknown, used and expired token, so only live opens are recorded. The operations log line (`platform_bypass` in api.log) remains, but the audit trail has nothing.

## Minors
**m1. A failed staff call is logged as ALLOWED, and the line never names the link.**
- What happens: `POST /api/system/signup-links` from an Owner gets 422 for an unknown planCode, for `period:"WEEKLY"`, for an extra key `firmId`, or for a bad email. Each one still writes `plat_system_audit outcome=ALLOWED, code=null`, though nothing was made. The line written for a real 201 has `target={}`: no link id and no email.
- Where: guard.ts:119 writes the line before the handler runs, and the route is not `@SystemChange` (signup-links.ts:16).
- Result: our staff trail cannot tell a link that was made from one that was refused. A line can be tied to a `platform_signup_link` row only through `created_by` plus the time.

**m2. Links can be made for emails that already have an account, and they stay live after the email's firm exists.**
- What happens:
  - A link for an email that already owns a firm gets 201. So does a link for `sample-firm`'s contact email. The staff member is not warned.
  - Two links for one email (S4): after one is used, the other still gives GET 200 with the plan offer, and its form gives 202. The person then gets only an "already have an account" email.
- Expected: either a refusal or a note at creation time, or the second link ending when the first is used.
- Where: makeLinkWork (signup.ts:218-233) has no `knownAccount` check.

**m3. The invited link's GET is not rate limited.**
- What happens: 300 GETs from one client all got 404, with no 429. The form POST shares the self-serve `signup:<ip>` limit (10 per 10 min). `X-Forwarded-For` is not trusted, which is correct.
- Risk: guessing a 256-bit token is not feasible, so the risk is low. But each live open writes an `audit_event` row, so anyone holding a link can grow the trail without limit.
- Where: signup.ts:247-249 has no `limit()` call.

**m4. The audit line for a firm made from a link says it came from self-serve, and does not name the link.**
- What happens: the `firm.created` summary reads "Firm created by self-serve sign-up (setting up)" for a firm made from an invite. No audit line names the link id, or the staff member who made it.
- Where: signup.ts:314.

## What held
- **Who can make links:** of the six PF-4s roles plus a staff member with no role, only Platform Owner and Admin got 201. Support, Billing, Content publisher, Auditor and the no-role member got 403 `MISSING_PERMISSION`.
- **Other tokens and sessions:** a firm Owner token got 403. No token, a junk token and `x-actor` alone each got 401. Upper-case paths kept the same results. A staff token on `/api/public/signup/:token` got 403 from the wall. Signing in without the second step (`secondStep:false` or missing) got 401 `TWO_STEP_REQUIRED`, so no token was issued.
- **Reason:** a missing, empty, spaces-only, control-only, zero-width-only, Hangul-filler-only, punctuation-only, emoji-only, number or array reason got 400 `REASON_REQUIRED`. 501 characters got 400 `REASON_TOO_LONG`. 500 characters worked. Control and bidi characters are removed before the reason is stored on the line. A non-English reason worked.
- **Body and size limits on the staff route:** an array body got 422. Null or a plain string got 400. Bodies of 300 KB and 1.1 MB got 413 on both doors.
- **Token storage and logs:** only the sha256 is stored. The raw token and its hash appear in none of `audit_event`, `plat_system_audit` or api.log. Request lines log the route pattern (`/api/public/signup/:token`), not the path. The link carries the token in the fragment (`#token=`), not a query string.
- **One 404:** unknown and expired tokens got identical 404 bodies, and a used token got 404 in the same words (author's IS3). Median GET times were 7.4 ms unknown, 7.9 ms expired, 11.6 ms live (200), and 2.7 ms for a wrong shape (the shape is public). Unknown and expired cannot be told apart by timing.
- **Single use:** 10 concurrent Confirms made 1 firm (200 + 9×404), and the link was marked used with its firm. Two forms followed by two Confirms made 1 firm: the older pending was REPLACED, and its code got 404. Two concurrent forms left 1 live pending, then made 1 firm.
- **Expiry and plan changes:** a link that expired between the form and Confirm got 404, with no firm and the link left unused. A plan made inactive got 409 `PLAN_GONE` on GET, POST and Confirm, made no firm and left the link unused. After the plan was made active again, the same code worked once.
- **The body cannot override the link:** `email`, `planCode`, `period`, `countryCode`, `website`, `formStamp` and `signupLinkId` in the body each got 422 "not a field of this form". The firm gets the link's plan and period (S4: MONTHLY from the second link).
- **Other body checks:** firmName (1 or 121 characters, NUL, bidi, zero-width only, spaces), password (11 characters, 257 characters, spaces only), terms (missing one, or a string), array, null and bad JSON all got the right 422 or 400. A non-English or emoji firm name worked.
- **Firm walls as `xr_app`:** with no `app.firm_id`, 0 link rows are visible. As `sample-firm`, 0 link rows and 0 pending rows are visible. As the firm a link was used for, only its own link row is visible, and its pending rows are not visible. A direct INSERT is refused by RLS. Clearing `used_at` on a used link is refused by `platform_signup_link_used_once`.

Verdict: Changes bacf188d8a9aa8bf1bdb3afd9f94728775457b9a
