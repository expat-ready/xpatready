# FO-4b embed script: break report (commit 602a4f8b0, branch claude/magical-franklin-d11aig, PR #2451)

Breaker run, 20 Nov 2026. Isolated copy `brk_fo4b` with its own database (`xr_studio_brk_fo4b`). It started on :4447, and a reviewer's copy (`rev_fo4b_s`) took that port over mid-run, so it was restarted on :4491 with the same database. Live AI off, US$0. Test host pages were served on `http://localhost:5555` (allowed) and `127.0.0.1` (not allowed), using the snippet markup. Chromium was `/opt/pw-browsers/chromium`. The PR's own suite `tests/check_fo4b_embed_browser.ts` passed 37/37 first. Scope is BACKLOG row FO-4b (no concept.md exists for this item).

## Findings

### M1 (Major): under a strict page CSP the honeypot shows as a blank box, and text typed in it silently drops the enquiry
- Steps: put the snippet on an allowed-site page served with `Content-Security-Policy: default-src 'self'; script-src <api>; connect-src <api>; style-src 'self'`. A firm has to add our origin to script-src and connect-src anyway; style-src stays strict. Open the page. Fill First name and Email. Click the empty box above "Send my enquiry", type "Can you help with my work permit?" and press Send.
- Observed: the console shows "Applying inline style violates … 'style-src 'self''". The shadow root's `<style>` is blocked, so the form is drawn unstyled. The `.trap` input `website` is no longer moved off-screen: its box is at x=8, 185×21 px, a visible unlabelled text box just above the button. The embed has no message field, so a visitor will likely take this box for one. The send gets the firm's thank-you text, and **0 leads** are stored (the honeypot path). The enquiry is lost while the visitor is told it arrived.
- Expected: the honeypot stays hidden whatever the host page's CSP (for example through properties set on the element's style, which style-src does not block, or the `hidden` attribute), so a real person can never trip it. At minimum the snippet should warn about style-src. AG-2-5 §10 "Duplicate beats a miss"; AG-2-49 rule 3 assumes "people never see or reach it" (form-embed.js:20).
- Where: form-embed.js:55 (`.trap` hidden only by the CSS string), :115-117, :166, :190-192. Screenshot was taken in the run (not committed): the strict-CSP page shows the box between the consent tick and the button.

### m1 (Minor): a form switched off after it was drawn says "wait a minute and try again" instead of "This form is not available"
- Steps: draw the form on an allowed site and fill it. Then `update fo_web_form set enabled=false`. Wait 2 s and press Send.
- Observed: the alert reads "Not sent / The form could not be sent. Please wait a minute and try again.". The state stays `form`, so the visitor can retry for ever. Raw call: `POST …/submissions` with an allowed Origin on an off form returns 404 FORM_NOT_AVAILABLE with **no** Access-Control-Allow-Origin, because `this.form(token)` throws before `corsFor` runs (public.ts:91-92). The browser cannot read the body, so the `FORM_NOT_AVAILABLE` branch (form-embed.js:172) never runs on a firm's site. The 413 at the door (public.ts:184-187) and the 429 (public.ts:88-89) are unreadable the same way. For 429 the fallback wording happens to fit; for 413 it is the wrong advice, but the embed's maxlength inputs make 413 hard to reach.
- Expected: AG-2-5 rule 11, "A form that is off … shows a plain 'This form is not available' message", including on the embed. Nothing was stored, which is correct.

### m2 (Minor): the settings panel does not show the snippet
- The row's "What gets built" says "the settings panel shows the snippet", and snippet.ts:3 says "The settings panel shows this text". `embedSnippet` is imported only by the test. No web form settings screen exists in `web/src`: grep for `allowedSites`/`thankYou` finds only `web-form-page.tsx` (the hosted form), and FO-4 is still "not built" in the trace table. So a firm has no way to get the snippet in the product today. This is a gap on the FO-4 dependency rather than a code defect: it should be recorded in STATE/BACKLOG, and the comment should not claim it.

### m3 (Minor): click ids other than the four named are not captured as the click id
- `?gbraid=…`, `?wbraid=…` (Google iOS) and `?dclid=…` set no `clickId`/`clickIdKind`, although the server accepts kind `OTHER` (public.ts:43) and AG-2-8a rule 2 lists "other" (form-embed.js:19, :27). Nothing is lost: the landing page keeps the full query string. Noted for the attribution report later.

## Attacks that held
- **CORS matching** (OPTIONS, read and send): exact origin only. Refused: `null`, trailing dot `https://allowed.example.`, `http://` downgrade, `:8443`, `https://allowed.example.evil`, `https://evil.allowed.example`, a comma list of two origins, `file://`, a punycode lookalike, `127.0.0.1` for `localhost`. Variants that are the same origin (upper case, `:443`, a path, userinfo) are echoed only as the canonical lower-case origin, which a browser compares exactly, so nothing is misreflected. `Vary: Origin` is set. Access-Control-Allow-Credentials is never sent. The pre-flight answers a fixed `content-type, accept` list (an `x-evil` request header is not echoed). No Set-Cookie on the script, read, pre-flight or send.
- **Pages on a site not allowed**: the read is unreadable, so only the link is shown. A JSON send is stopped at the pre-flight (403). A "simple" `text/plain` cross-site POST and a POST with no Origin header both get 403 SITE_NOT_ALLOWED, because the server checks Origin itself, not only the browser.
- **Idempotency and attribution once**: 8 concurrent identical sends gave 8× 201 and 1 lead with 1 attribution row. 8 concurrent sends with the same submissionId but different utm values gave 1 lead. A double press sends 1 POST (the suite also checks this).
- **Attribution injection**: NUL and U+202E were removed, a 5000-char landing page was cut to 2000, `javascript:alert(1)` as the referrer was stored as plain text, and the lead page shows it as text only (lead-page.tsx:131, no link). `clickIdKind` outside the list → 400.
- **Honeypot, 2 s stamp, rate limits, 32 KB**: there is no separate embed path, the same `submit` runs. The pre-flight counts in the per-address read bucket and cannot be used to get around the post limits. It does 2 DB reads at most, within 120/min. A cached pre-flight cannot let a removed site through, because the POST checks Origin again. A 40 KB body → 413 at the door. X-Forwarded-For is ignored (no trust proxy).
- **XSS through firm text**: a form name `<img src=x onerror=…>` with Arabic, emoji and 300 characters, a thank-you `<script>…</script>`, and a service label `</option><img …>` are all shown as literal text, with no element created and `window.__xss` unset. The page passes with Trusted Types enforced (`require-trusted-types-for 'script'; trusted-types 'none'`).
- **Script loaded twice, or three times with `?v=2`**: one form. Two hosts on one page: two forms with separate ids. A token for an off form, or a `../../platform/session` token: link only, encoded, no request elsewhere. A hostile host stylesheet `*{all:unset!important}`: the form is intact, the trap stays off-screen.
- **RELOAD**: changing the consent wording mid-fill gives "The form was refreshed…", answers kept, the new words shown, the tick cleared and the summary focused. Resending makes 1 lead and 1 consent row. Reloading during the 2-second hold sends nothing. Back after the thank-you draws a fresh form and no second lead.
- **Storage**: cookies, localStorage, sessionStorage and indexedDB are all empty after a send. No request after the thank-you (suite).
- **Keyboard only**: Tab goes before-link → First name → Last name → Email → Phone → Interested in → tick → Send → after-link. The honeypot and the hidden link are never reached. Enter on an empty form moves focus to the error summary.
- **1024 px, 200 % zoom (640 CSS px at scale factor 2), 320 px**: no sideways scroll, and axe (WCAG 2.2 AA, shadow root included) reports no violation at any size.
- **Bypass rule** (firm-scope.ts:98): the new rule matches only `OPTIONS /api/public/forms/<one segment>/submissions`. It is not too broad.
- **Errors**: they reveal nothing beyond FO-2's existing read. The 404 for an unknown or off form is the same answer, and no firm is named.

## Not FO-4b (noted only)
- A first name of "!!!" gets the server message "this is required." on the field. This is FO-2's `text()` wording; the hosted form shows the same.
- Running the PR suite rewrites `product/screens/fo-4b-embed/screenshots/*.png`. `fo4b-07-too-many-1440.png` was already modified in this working tree before this run. This breaker committed nothing.

Verdict: Block (M1 open; m1-m3 do not block on their own).

## Re-check on 7ec5724cf

Scope: only `git diff 602a4f8b0 7ec5724cf`. Only `form-embed.js`, the test file, screenshots and this report changed; no API file did. Test set-up:
- A fresh isolated copy `brk_fo4b2` on :4492, seeded as the suite does, now stopped and dropped.
- The working tree stays at 602a4f8b0 (no checkout here), so each test page got the exact `git show 7ec5724cf:…/form-embed.js` through a Playwright route on `<api>/api/public/embed/form.js`, against the real API.
- Host pages on `http://localhost:5555`, the only allowed site.

### Held
- **M1 fixed** under the exact CSP from M1 (`default-src 'self'; script-src <api>; connect-src <api>; style-src 'self'`):
  - The honeypot's box has `hidden` and measures 0×0. The constructed stylesheet is applied (one adopted sheet, no `<style>`, button `rgb(29,78,216)`), and there are 0 CSP console errors.
  - A person's send makes 1 lead.
  - With `adoptedStyleSheets` removed (the fallback path), the `<style>` is blocked (1 CSP error) and the form is unstyled, but the honeypot is still 0×0 and hidden. The send makes 1 lead.
- **m1, the case it targets**: the form is switched off after the draw. The send is followed by one read; the visitor gets "This form is not available." (state `not-available`) and 0 leads.
- **m3 fixed**: `?wbraid=w-1&li_fat_id=l-2` is stored as `w-1|OTHER` (the first one in list order). The suite covers `gbraid`.
- **A post refused with 429 while the read still works**: "Not sent / … wait a minute and try again.", answers kept, state `form`.
- **Extra request per refused send**: exactly one GET per refused send, and only after an unreadable refusal (seen: POST, then GET). It counts in the per-address read limit, needs the visitor's own press (`busy` guard), writes nothing, and gives an attacker nothing it cannot already get from the open read. It does not amplify traffic.

### R1 (Major, new in 7ec5724cf): a network failure, or a 429 on the read, shows "This form is not available." and erases the answers
- **Steps, offline**: draw the form on the allowed site, fill First name and Email, wait 2 s, go offline (`context.setOffline(true)`), press Send.
  - Observed: POST fails, GET fails, and the box is replaced by "This form is not available." (state `not-available`). The typed answers are gone and there is no retry button or link.
  - The same happens when both requests are cut with a connection reset (`route.abort("connectionreset")`).
  - At 602a4f8b0 this case said "The form could not be sent. Please wait a minute and try again." and kept the answers.
- **Steps, 429 on both**: from the allowed page, use up the address's minute: 30 POSTs, then 119 reads, plus the page's own read = 120. Then fill and press Send.
  - Observed: POST 429, read 429, then "This form is not available." with the answers erased.
  - Cause: limit refusals carry no Access-Control-Allow-Origin, because `limit()` runs before `corsFor` (public.ts:67, :88-89, :132). The browser therefore rejects with a bare TypeError, `q.status` is never 429, and the 429 branch at the new form-embed.js:194 is dead code on a firm's site.
- **Expected**: "not available" only on positive evidence that the form is off. A failed read cannot tell CORS, network and 429 apart. Otherwise the visitor should keep their answers and get a retry message (or the hosted-form link), as AG-2-49 rule 1 and the old line did.
- **Why Major**: a failed connection is the most common failure in the wild, far more common than a form switched off mid-fill. Telling a visitor on a flaky mobile connection that the firm's form is off, and erasing what they typed, will lose enquiries on the firm's main public entry. The fix for m1 turned a recoverable state into a false final one.
- **Where**: form-embed.js:187-197 (new); `done()` at :139-146 clears the box.

Verdict: Block (R1 open; M1, m1's target case and m3 fixed; m2 remains the tech lead's question).

## Re-check on 0f60e4737

Scope: only `git diff 7ec5724cf 0f60e4737` (public.ts `openRefusals`, the `corsFor` header removal, form-embed.js refusal handling and "Sending…", a snippet.ts comment). Set-up: a fresh isolated copy `brk_fo4b3` on :4493, seeded as the suite does, now stopped and dropped; the tree was at 0f60e4737, so the API served the script from disk; host pages on `http://localhost:5555` (allowed) and `http://127.0.0.1:5555` (not allowed).

### Held
- **R1, offline**: drew and filled the form, went offline, pressed Send. Result: "Not sent / … Please check your connection and try again.", answers kept, button back to "Send my enquiry". Back online, the same press made 1 lead. Both POSTs carried the same submissionId.
- **R1, double 429**: 40 POSTs and 130 reads from the page, then Send. The pre-flight itself got 429 (it counts in the read limit and has no CORS header), so one read followed. That read was a readable 429, and the visitor saw "Too many requests. Please wait a minute and try again." with answers kept. A 429 on the POST alone is now readable directly: one request, the same words, no extra read.
- **Form switched off mid-fill**: the pre-flight 404 has no CORS header, so one read followed. Its readable 404 FORM_NOT_AVAILABLE gave "This form is not available." and 0 leads.
- **M1 still fixed** under the exact CSP from M1 (constructed sheet and `<style>` fallback both checked). The honeypot is hidden at 0×0 and a send makes 1 lead.
- **`*` scope**: `*` appears only on the form door's refusals made before the form is known. Those are the 404 for an unknown, off or malformed token (one identical body), 429 and the in-controller 413.
  - No CORS header on: an existing form read from a site not allowed or with no Origin (200; `removeHeader` works), a send from a site not allowed, JSON or text/plain (403), and that site's pre-flight (403).
  - An allowed site gets its own origin, never `*`.
  - `*` does not leak onto other routes: staff `/api/front-office/leads` and `/api/session` give 401 with no CORS header, and the public booking page has none.
- **A real page on the site not allowed**, in Chromium: the form is not drawn (link only). Reading the existing form, a JSON send and a text/plain send are all blocked. `credentials: "include"` against a `*` refusal is blocked by the browser. The only readable thing is the generic 404 body.
- **Leaks**: nothing new. A page on a site not allowed can now tell "unknown or off token" (readable 404) from "live form" (blocked). The same read is already open to any server-side client: 200 with the form's words for anyone holding the token, and its `frame-ancestors` header lists the allowed sites, as before this PR. The token is 32 random characters, and the 404 names no firm.

### m4 (Minor, new): a site removed from the allowed list mid-fill is told "check your connection"
- Steps: draw the form on the allowed site. `update fo_web_form set allowed_sites = array['https://other.example']`. Fill and press Send.
- Observed: the pre-flight gets 403 with no CORS header, and the read gets 200 with no CORS header, so both fail. The visitor sees "Please check your connection and try again", answers kept, 0 leads. Retrying cannot help, and there is no pointer to the hosted form.
- Expected: wording that fits, or the hosted-form link. It needs a firm to change its settings while a visitor is filling the form, and nothing is stored wrongly, so it does not block.
- Where: form-embed.js:192-196.

Verdict: Approve (no open Blocker or Major for 0f60e4737; m2 and m4 remain Minor).
