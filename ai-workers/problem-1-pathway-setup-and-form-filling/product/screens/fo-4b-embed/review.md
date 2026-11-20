# FO-4b embed script: review (commit 602a4f8b0, PR #2451, branch claude/magical-franklin-d11aig)

Reviewer: independent (did not build it), 20 Nov 2026. Row: BACKLOG FO-4b (AG-2-5 rules 2 and 7, AG-2-8a, AG-2-49); R1.26. No concept board (a "screens (embed script)" row, decisions: none), so the bar is the row, the Lead's Done-when, the requirement text, `STANDARDS.md` and `EXPERIENCE.md`. Isolated copies :4446 and :4447 (never :4400), live AI off, US$0. Chromium `/opt/pw-browsers/chromium`. Journey test: `journey-test-reviewer-2026-11-20.md` (score **8.5/10**).

Note: while this review ran, the builder pushed a newer head `7ec5724cf` ("breaker fixes: M1, m1, m3"). This review and its verdict cover **602a4f8b0 only**. The new head needs its own review.

## Suites run on 602a4f8b0
| Suite | Result |
|---|---|
| check_fo4b_embed_browser.ts (new) | 37/37, run 3 times (each at least 60 s apart, see m5) |
| check_fo2_leads_prospects.ts | 113/113, exit 0 |
| check_fo4_sales_browser.ts (:4447, PLATFORM_IDENTITY=local) | 45/45, exit 0 |
| check_pf12_walls.ts (named bypass uses, firm-scope.ts) | 100/100, exit 0 |
| graph.mjs --check | G1 0, G2 0, G4 0, G5 0 (exit 0) |

Done-when, line by line: the form draws on a test host page and one enquiry with `?utm_campaign=spring` becomes one lead whose attribution reads spring, plus the landing and referring page. **Met.** A bot send through the embed (honeypot, too fast) is thanked and nothing is saved. **Met.** The same send twice gives one lead. **Met.** A site not allowed is refused: the form is not drawn, and the send and pre-flight get 403. **Met.** No cookie or storage entry afterwards. **Met.** A blocked script leaves the link, and the hosted form works. **Met.** The FO-2 and FO-4 suites stay green. **Met.**

**The settings panel question.** It was sound to ask rather than build. FO-4 owns the panel ("web form page (hosted) and its settings panel", FO-4 not built), and FO-4b's row says it "waits on FO-4 (settings panel)". Building it here would add scope without a concept. The record still has to say the gap plainly: see m2.

## Findings (most severe first)
**M1 (Major, Must): under a strict host-page CSP the honeypot becomes a visible box, and a person who types in it loses the enquiry but is still thanked.**
- Where: form-embed.js:55. The `.trap` off-screen rule exists only inside the shadow root's `<style>` element. The trap is built at :115-117 and sent at :166.
- Reproduced on :4446: the host page sends `Content-Security-Policy: default-src 'self'; script-src <api>; connect-src <api>; style-src 'self'`. A firm must list our origin for script-src and connect-src anyway, but style-src can stay strict. Chrome blocks the inline `<style>` ("Applying inline style violates … style-src 'self'"). The trap input then shows as an unlabelled 185×21 px box just above "Send my enquiry", and the embed has no message field of its own. I typed "Can you help with my work permit?" into it and pressed Send. The page showed the firm's thank-you text, and **0 leads** were stored.
- Why it matters: this breaks AG-2-49 rule 3 ("people never see or reach it") and AG-2-5 §10 "Duplicate beats a miss": a real enquiry is lost while the visitor is told it arrived. It also breaks STANDARDS §7 [M] (OWASP basics: headers). A firm that hardens its own site is exactly the case that hits it.
- Fix: hide the trap in a way that does not depend on CSP. CSSOM property sets (`trapBox.style.position = "absolute"` and the rest) are not blocked by style-src. Then add a suite check on a strict-CSP host page: the trap is not visible, and a person's send makes one lead.
- The breaker found the same issue on its own (M1 in `break-report.md`).

**m1 (Minor, Should): a form switched off after it was drawn says "Please wait a minute and try again", not "This form is not available."**
- Where: public.ts:88-92 and :151-157. `form()` throws the 404 FORM_NOT_AVAILABLE before `corsFor` runs, so the answer carries no Access-Control-Allow-Origin. The browser cannot read it, and the `FORM_NOT_AVAILABLE` branch at form-embed.js:172 never runs on a firm's site.
- Reproduced (journey J5): the state stays `form` and the visitor is invited to retry for ever. Nothing is saved, which is correct.
- Rule: AG-2-5 rule 11.
- The 429 (public.ts:88-89) and the door's 413 are unreadable for the same reason. The 429 fallback words happen to fit.
- Fix: set the CORS header from the found row's allowed sites before the off-form, limit and size refusals.

**m2 (Minor, Should): the records claim more than main delivers.**
- qa/built/R1.26.md:1 calls this "R1.26's last missing part: a firm pastes one snippet on its own site". snippet.ts:3 says "The settings panel shows this text". The PR's demo note says "a site in the Sample form's allowed sites".
- On main, no route or screen writes `allowed_sites` (schema default `[]`, no seed value), and no screen shows `embedSnippet`. The embed draws only after a direct database update (test file :58), so a firm cannot use it through the product today (P-33).
- Fix: reword both lines to name the FO-4 settings-panel dependency, and keep R1.26 Partial until a staff path sets allowed sites and shows the snippet. No new build is asked of this PR.

**m3 (Minor, Should): there is no busy feedback while sending.**
- Where: form-embed.js:53 and :158. During the hold of up to 2.1 s plus the network time, the button only dims (opacity .7). The hosted form's Button shows a spinner (controls.tsx:36).
- EXPERIENCE: feedback and state, BIC-18.
- Fix: show a spinner or the words "Sending…" while `aria-busy` is set.

**m4 (Minor, Should): click ids other than the four named are not kept as kind OTHER.**
- `gbraid`, `wbraid` and `dclid` set no `clickId` (form-embed.js:19, :27), although AG-2-8a rule 2 lists "other" and the server accepts `OTHER` (public.ts:43). Nothing is lost: the landing page keeps the full query.

**m5 (Minor, Should): suite hygiene.**
- The suite's last step fills the per-address minute (test file :271). A re-run on the same copy within 60 s fails with a locator timeout at :131 and gives no clear message: seen here.
- graph.mjs counts GET `/public/embed/form.js` under G3 (no test reaches it), although the suite calls it at :74 through `raw()`. It does not list the OPTIONS route at all. This is a blind spot of the tool, shared with FO-2's routes, and not a defect of the PR. It is noted so that qa does not count it.

Not FO-4b, noted only: a first name of "!!!" gets the server message "this is required." on the field. That wording comes from FO-2's `text()`, and the hosted form shows the same.

## What held (checked)
- CORS: exact origin only, with `Vary: Origin` and never credentials. The pre-flight answers a fixed header list. The POST checks Origin again on the server.
- The new bypass pattern (firm-scope.ts:98) is anchored to the one OPTIONS route, and pf12 is green.
- Every value from the firm is set as DOM text only, never HTML.
- A shadow root isolates the form's styles from the page. The script loaded twice still draws one form.
- RELOAD after a wording change: answers are kept, the tick is cleared, and the resend makes 1 lead (J4).
- Attribution is cut to 200 or 2000 characters. A non-English last name is stored exactly. Each lead has one audit line.
- The form draws in 90 ms. The keyboard order is First name → Last name → Email → Phone → Interested in → tick → Send. The honeypot and the hidden link are never reached.
- 1024 px at 200 % zoom (512 CSS px), 400 px and 1440 px: no sideways scroll, and axe finds 0 violations.

## Scores (D1–D20, 1–5)
D1 4 (rules 2 and 7, AG-2-8a and AG-2-49 met; rule 11 is not met on the embed, m1) · D2 4 (one lead and one attribution row per submissionId; the CSP case loses a real lead, M1) · D3 4 (reuses FO-2's door unchanged; the hosted form's words are repeated in plain JS because there is no build step) · D4 N/A · D5 3 (reload, double press and RELOAD hold; M1 loses data) · D6 N/A · D7 N/A (no AI) · D8 4 (the form's name is the heading) · D9 4 · D10 4 (the hosted form's exact words) · D11 3 (m1, m3) · D12 4 (calm, hosted look; values are hard-coded because there is no build step) · D13 5 (keyboard, 200 %, 400 px, axe 0) · D14 4 · D15 5 (90 ms draw) · D16 4 (each Done-when line has a pass and a fail; no strict-CSP test and no off-form-after-draw test) · D17 simulated only · D18 4 (the attribution is kept on the lead) · D19 3 (no staff path to the snippet or allowed sites, m2) · D20 simulated only.

## BIC scorecard (public embed, not a case-side screen: most checks N/A)
- BIC-04: Met. The words say "(optional)", never an asterisk.
- BIC-11: Met. One primary action, "Send my enquiry".
- BIC-13: Met. Messages show on the field and in the summary (screenshot fo4b-02).
- BIC-18: Partly. Busy state (m3), off-form state (m1).
- BIC-19: Met. One heading and one button.
- BIC-20: Met. Keyboard, 200 % zoom and axe (journey J1, J2).
- BIC-01–03, 05–10, 12, 14–17: N/A (no case data, AI, signing or review here).

## Could not check
- A real screen reader.
- Safari and Firefox (Chromium only).
- An intended user's unaided walk (D17 and D20 stay with the founder).
- The newer head 7ec5724cf.
- Running the suites rewrote screenshots in this working tree, as in the builder's and breaker's runs. I committed nothing.

**Verdict: Block** for 602a4f8b0. To fix: M1, keeping the honeypot hidden whatever the host page's CSP, with a strict-CSP suite check. m1–m5 should be fixed or listed with a follow-up row; m2's record wording is a small change worth making in the same PR.

## Re-review on 0f60e4737 (diff since 602a4f8b0 only)
I ran a fresh isolated copy on :4448 (and :4449 with PLATFORM_IDENTITY=local for FO-4); the script cache started empty. Live AI off, US$0. HEAD was 0f60e4737 at the start and at the end.

**Suites:**
- check_fo4b_embed_browser.ts: 45/45, twice.
- check_fo4_sales_browser.ts: 45/45.
- check_fo2_leads_prospects.ts: 113/113.
- pf12 not re-run: the diff does not touch firm-scope.ts.

**Each finding:**
- **M1: closed.**
  - The trap box now carries `hidden` (form-embed.js:117), and the browser's own rule hides it. The form's styles go through an adopted constructed sheet (:202-206).
  - My strict-CSP page from before: the trap input is now "not visible", so a person cannot click or type in it.
  - The suite's strict-CSP page has its styles (8 px radius, no CSP console line), and a person's send makes one lead. Screenshot fo4b-08 shows the styled thank-you under `style-src 'self'`.
- **m1: closed.**
  - `openRefusals` (public.ts:196) sets `*` before the form is known.
  - `corsFor` (public.ts:148) removes it for a site that is not allowed, or names the allowed site.
  - Probed by hand on a found form:
    - allowed origin, read and 400 send: `Access-Control-Allow-Origin` names the site;
    - other origin, read 200 and send 403 SITE_NOT_ALLOWED: no header;
    - other origin, pre-flight: 403, no header.
  - So only the generic 429 and not-available answers are open, and they carry no data and never credentials.
  - Journey J5 now ends in "This form is not available." (state `not-available`), and nothing is saved.
  - An answer the page cannot read now gets one read; the form closes only on a readable FORM_NOT_AVAILABLE, otherwise the answers stay with a retry line. The suite's offline check covers this, and back online the same press makes one lead.
- **m2: closed.** qa/built/R1.26.md and snippet.ts:3-5 now say that no screen sets allowed sites or shows the snippet, and that R1.26 stays Partial until FO-4's panel lands.
- **m3: closed.** The button reads "Sending…" while busy and resets afterwards (form-embed.js:160, :198).
- **m4: closed.** gbraid, wbraid, dclid, li_fat_id and twclid are kept with kind OTHER; the suite checks gbraid → OTHER.
- **m5: accepted as is.** run-suites.sh always gives a fresh copy.

**Journey re-walk on :4448:**
- J1 to J6 all held, J5 included. The only console lines were expected network logs (the RELOAD 400, an off form's failed pre-flight and its 404 reads); there were no page errors.
- Journey score on this head: **9/10** ("feedback and state" and "error recovery" rise to 1; "correct data" stays ½ only for the residual below).

**Residual (Minor, not blocking):**
- A body over 32 KB is refused by the door's middleware (public.ts:184-187), which runs before `openRefusals`, so that 413 stays unreadable and the visitor sees the connection-retry line. The embed's input limits make this hard to reach.
- If a site is removed from the allowed list during a fill, the visitor also sees the connection-retry line. This is rare, and nothing is saved.

No Blocker or Major is open on 0f60e4737.

**Verdict: Approve** for a37264b37 (code as at 0f60e4737; a37264b37 adds only the breaker's re-check section in break-report.md, checked with `git diff 0f60e4737 a37264b37 --stat`).
