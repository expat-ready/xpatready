# Break report: PF-5s S8 invited sign-up (R1.90), PR #3202 at 65e4e1fa3

Breaker, 23 Nov. Diff `origin/claude/runtime-r190-invited..65e4e1fa3`; main file `prototype/studio/web/src/modules/platform/signup/invited-page.tsx`. Concept: `pf-5s-saas/concept.md` (lead-b-front-office) §4 S8, BR-13, §7b M4 and m8. Isolated copy `brk_pf5si` on :4614 (`PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`), restarted once to clear the door's in-memory rate limits, stopped at the end. Links were made as our staff (`plat_system_staff` + `platform-owner`, `POST /api/system/session/local`, `POST /api/system/signup-links`). Chromium via Playwright from scratch scripts. US$0, no live AI, no live mail. Scope is S8 only; the staff console is Not built (concept §2).

## Blockers
None.

## Majors
**M1. A network or server failure while the invitation loads leaves no way to retry, and a reload then says the link "doesn't work".**
Steps: make a link; open it with the first `GET /api/public/signup/:token` aborted (or answered 503).
Expected: "The invitation could not be loaded" with a Try again button. The token is still held in memory, so `read()` can simply run again.
Actual: the Notice says "Check your connection and try again." (or "Something went wrong on our side. Please try again."), but the page has no button at all (`buttons: []`). The token has already left the address, so a reload shows the dead-link page: heading "This sign-up link doesn't work", "Open the link from your invitation again.", and "To ask for a new link, reply to the invitation email." A live link is presented as dead, and the person is pointed to our staff for a new one. This breaks BIC-13 (say how to fix it) and UXL-12 (an error state with a way forward).
Where: `invited-page.tsx:71` (the error view gets no retry), `:153` (the Notice with no action), `:60` (the no-token page reuses the dead link's title and `ask: true`).

## Minors
**m1. The no-token page wears the dead-link title.** Steps: open a link, send the form, reach Check your email, then press Reload (or Back then Forward across documents).
Expected: words that match the documented design ("Open the link from your invitation again.").
Actual: the heading and tab title read "This sign-up link doesn't work", and the page adds "To ask for a new link, reply to the invitation email". The link is still unused and the email's Confirm still works. Fix with M1: give NO_LINK its own title (for example "Open your invitation link again") and `ask: false`. Where: `invited-page.tsx:60`.

**m2. The 429 words are wrong for the form and for Send it again.** Steps: an 11th sign-up POST from one IP inside 10 minutes. The door's `signup:<ip>` budget is 10 per 10 minutes and is shared with self-serve S2. Then press the form's Start free trial, or Send it again.
Expected: the person keeps the form and is told to wait a few minutes and try again (the door says "Wait a few minutes and try again.").
Actual: "Not sent. Too many tries from here. Wait a minute, then open the link again." The window is 10 minutes, not one. And "open the link again" throws away the typed form, when pressing the button again later would work. The same words appear on the GET's 429 page. Where: `invited-page.tsx:28`, `:90`, `:115`.

**m3. A token the server rejects by size shows "could not be read" instead of the one dead page.** Steps: open `/sign-up/invited#token=` followed by 20,000 characters.
Expected: the one "This sign-up link doesn't work" page (BR-13: malformed counts as dead).
Actual: the server answers 431 to the GET, and the page shows "The invitation could not be loaded / The invitation could not be read. Please try again." (no retry; see M1). The door accepts only `^[A-Za-z0-9_-]{43}$`, so the page could check that shape before sending anything. Where: `invited-page.tsx:69-71`.

**m4. A door refusal in the summary does not name its field (BIC-13 "same words and links").** Steps: firm name "A", or a password of 12 spaces.
Actual: the summary lists only "2 to 120 characters." or "Not only spaces.", with no field name and no link. The words on the field itself are right, and focus goes to the summary. S2 (`signup-page.tsx`) has the same pattern, so fix both or leave both.

**m5. (Door, shown by this screen; shared with S2.) Ordinary Persian or Hindi firm names are refused as "No control characters."** Steps: firm name `می‌خواهم مهاجرت` (it contains U+200C ZWNJ, which is normal in Persian), or any name with a ZWJ emoji.
Actual: the door's `firmName` check rejects `\p{Cf}`, so the screen shows "No control characters." for a name the person typed normally. Where: `api/src/platform/firms/signup.ts` (`Body.firmName`). Logged for the door's owner; nothing to change in the screen.

## What held
* **The token leaving the address and staying out of storage.** The token is gone from `location`, `history.state`, the DOM and the title after the first load, and again after a second link arrives by hashchange. Walking history back never reaches a `#token=` entry. sessionStorage and localStorage stay empty. The terms links carry `rel="noopener noreferrer"`.
* **A second link in the same tab.** It replaces the page and shows the second link's email.
* **Back and Forward inside the app.** Going to Sign in and pressing Back reloads the invitation from memory (typed fields are not kept: acceptable). Reload after the token is gone gives the documented page (see m1 for its words).
* **Double submit.** A double click plus Enter sends one POST and leaves one pending row.
* **Terms published while the page is open.** The tick is cleared, the current versions are shown, "The terms have changed since this page opened…" appears, focus goes to the summary, and ticking again sends.
* **A plan retired (409 PLAN_GONE).** On opening, and between opening and sending, the page shows "This link's plan is not offered" with the m8 lines.
* **A link expired between opening and sending, or between Send it again presses.** The dead page appears. Send it again after 60 s sends a second email, and is disabled with a countdown before that.
* **Hostile tokens.** `..`, `.`, `..%2F..%2Fplans`, `%2e%2e`, `verify`, `<script>…`, a broken `%E0%A4%A`, `x&token=y` and an empty token all reach the one dead page: the path is encoded, or a URL that normalises to `/api/public/` or `/api/public/signup/` answers 404. No page errors, no dialogs.
* **XSS through the email.** The door refuses a link whose email holds HTML (422). React escapes whatever is shown.
* **A long email (a 64-character local part and a domain of about 190 characters) and a 120-character Arabic and Latin firm name.** No sideways scroll at 375 px, at 1024 px, or at 1280 px with 200 % zoom (640 CSS px), on the form or on Check your email (`overflow-wrap:anywhere`).
* **Keyboard.** Tab order runs Password → Firm name → tick → three terms links → Start free trial → Sign in. Enter submits. Focus goes to the summary on a refusal (`aria-invalid` set on the field) and to the heading on Check your email and on the dead page.
* **Deviations M4 (no plan Change) and BR-13 (the email check still asked).** Both are recorded with reasons in `challenge.md`. They are not findings here.

Round 1 verdict: Changes (65e4e1fa39bc666f0a71e89f42f4ab366c3ccf77): fix M1 (a Try again on the load-error view, and the no-token page's own title, which covers m1). The Minors can be fixed or listed in the PR.

## Round 2: `git diff 65e4e1fa3..e7748d5d3` (diff only)
Same method: a fresh copy on :4614, restarted twice to clear the door's 10-per-10-minute sign-up limit, then stopped. I made plans with SQL: an inactive one, a 0-day-trial one and one withdrawn mid-test. The schema has no "internal" or private plan flag (`platform_plan.active` is the only gate), so for the door "internal" means inactive.

**Round-1 fixes: all held.**
* **M1:** with the first GET aborted, Try again now loads the form without reloading the page. The words say the link is kept on the page.
* **m1:** a reload now shows "Open your invitation link" with "…If you haven't finished signing up, it still works.", no ask line, and the matching tab title.
* **m3:** a 20,000-character token goes straight to the dead page and sends no request.
* **m4:** the summary now reads "Password: Not only spaces. | Firm name: 2 to 120 characters."
* **m2:** checked in the code only. `slowSend(action)` reads "Your answers are kept: wait a few minutes, then press <action> again."
* **m5:** the door's shared rule, passed to the tech lead (not re-tested).

**Plan Change path: what held.**
* **Body tampering, straight against `POST /api/public/signup/:token`:** an inactive plan, an unknown plan, `TEAM`, `team' or '1'='1` → 422 "planCode: choose one of the plans offered". 41 characters, `""`, `null` or `1` → 422 "planCode: check this answer". `period` "WEEKLY" or "yearly" → 422. An extra `email` or `countryCode` → 422 "not a field of this form". The link's email cannot be changed.
* **A valid change:** `firm`/`YEARLY` → 202; the pending row is `firm YEARLY`.
* **A 0-day-trial plan:** picking it changes the heading and button to "Sign up" and drops "14 days free". The pending row holds that plan. A link made on a 0-day plan opens as "Sign up".
* **The plan list unreachable:** `/api/public/plans` aborted → no Change button. The link's plan is shown and sent.
* **375 px and 1280 px at 200 % zoom:** no sideways scroll with the picker open. Tab reaches Change, the selects and Done, and arrow keys change the select. The plan line updates and reads "Changed from your invitation's plan."

**Round-2 Minors**
* **r2-m1. A plan withdrawn between opening and sending is fixable, but the page doesn't say what happened.** Steps: a link on plan W; open it; set W inactive; send. Result: 422 "Plan: Choose one of the plans offered." in the summary and under the plan line, which still reads "W, monthly … From your invitation." Change still lists W, selected (`choices` is read once at load, `invited-page.tsx:88`). After picking Team and pressing Done, the old error stays until the next send. Sending again then works (pending row `team`). Same result when the plan the person chose is the one withdrawn. Suggestion: on a `planCode` refusal, read `plans` again and say "That plan is no longer offered; choose another."
* **r2-m2. Focus is lost when the picker opens or closes.** Steps: keyboard only, at 375 px or 200 % zoom: Enter on Change, then Enter on Done. Result: `document.activeElement` is BODY both times, so a screen reader announces nothing. Chrome's next Tab happens to land on the select or Change. Escape does not close the picker. S2 (`signup-page.tsx:134-140`) has the same pattern, so fix both: focus the plan select on open and Change on Done.
* **r2-m3. (Door GET; question.)** A link whose plan is withdrawn before it is opened still gets the dead page "This link's plan is not offered … Ask us for a new link". On POST the person can now pick another plan, so the door could answer the GET with the link's data and a "plan no longer offered" flag, and the page would open with the picker. The GET's 409 carries no invitation, so the screen cannot do this alone.
* **r2-m4. "No card needed." stays on a 0-day-trial plan.** Steps: pick the 0-day plan. The heading becomes "Sign up", but the line still says "You were invited to Expat Ready. No card needed." With no trial, Checkout takes the first payment. S2 has the same line (`signup-page.tsx:116`).

Verdict: Approve at e7748d5d3e401c4dc77b062acb0dfb2f376381e6
