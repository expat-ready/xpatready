# FO-4 part 1 — break report (PR #1822 at 3bb03d144)

Breaker: fresh agent, 15 Nov 2026. Scope: the hosted form `/front-office/web-form/:token`, Leads (chips, search, Take it), one lead, the sign-in card and the `xr-staff-session` token (concept r2 on `lead-b-front-office`, PR "What and why"). Not findings: anything the PR lists under "Not in this part" (Assign, open-hours waited time, one-user hiding, Closed, search by email/phone).
Copy used: http://localhost:4461, db `xr_studio_screens_fo4`, `PLATFORM_IDENTITY=local`. **The copy runs FO-2 at b9424b88b (merge b058cdf6a), not #1813's head f15bba1dd.** API findings below say which version they hold on.
Paths: `web/…` = `prototype/studio/web/src/modules/front-office/sales/`; `api/…` = `prototype/studio/api/src/front-office/sales/` on `origin/claude/festive-maxwell-76x597`.

**Verdict: 0 Blocker, 4 Major (1 already raised in the PR), 10 Minor on the screens; 1 Major and 3 Minor for the API that still hold at #1813's head.**

## Screen findings

**S1 Major: an expired session (every hour) is never noticed.**
Steps: sign in, open Leads. Set the stored `expiresAt` to the past (the same as waiting the 3600 s `expiresIn`). Click "All open".
Expected: the sign-in card, as on any 401.
Actual: the header still shows the person's name, "Sign out" and the badge "16 unassigned". The list reads "Sign in first: this needs a staff member's session (a bearer token)." with "Try again", and Try again fails every time. Only a reload or Sign out gets out.
Why: `read()` drops the expired token (`web/session.ts:69`), but no listener is told. `staffApi` then sends no `Authorization` header, and the 401 clears the session only `if (… && token)` (`web/session.ts:103`), which is false here. The text also uses the jargon "bearer token".

**S2 Major: after a 401, the next person in the tab sees the previous person's leads.**
Steps: the Owner signs in and opens All open (32 rows). The token goes bad (a 401) and the sign-in card shows. A Case Officer signs in on the same tab ("Everyone sees all" is off) and clicks All open.
Expected: only the Case Officer's 20 rows.
Actual: polled every 10 ms, the table showed 0, then **32**, then 20. For a moment it showed leads the Case Officer may not see (AG-2-94 rule 16), with their Take it buttons.
Why: the 401 path clears the token but keeps the `["fo"]` cache (`web/session.ts:103`); only Sign out removes it (`web/sales-frame.tsx:68`). The query keys do not include the staff member (`web/leads-page.tsx:22`, `web/lead-page.tsx:111`, `web/sales-frame.tsx:18`). The lead page cache behaves the same way. S1's expiry path has the same gap.

**S3 Major: an enquiry sent within 2 s of the page drawing is thanked and thrown away.**
Steps: at 375 px, fill First name and Email (as browser autofill does in one go) and press Send about 1 s after the page loads.
Expected: the enquiry is stored, or the visitor is told to wait.
Actual: the thank-you page shows, but no person or lead exists for `brk-fast-1794734722791@example.com`.
Why: the API treats a fill under 2 s as a bot (`api/public.ts:111` at head). The page sends as soon as it is asked (`web/web-form-page.tsx:112-130`); it does not hold Send until the stamp is 2 s old. This breaks the concept's job "loses nobody". Shared with the API (A1).

**S4 Major (already raised as PR Question 4): any site can frame the hosted page.**
`curl -D -` of `/front-office/web-form/<token>` returns no `Content-Security-Policy` (only `Cache-Control: public, max-age=0`). The JSON read does carry `frame-ancestors`. This breaks BR-3 ("shown only on the firm's allowed sites"). It is still open until FO-2 part 3 or FO-4b serves the page with the header.

**S5 Minor: "page out of date" cannot be fixed without retyping.**
With a forged load stamp, head's API answers 400 `RELOAD`. The page shows "Please reload it…", but pressing Send again posts the same stamp (`web/web-form-page.tsx:124`), and a reload clears every typed answer. The page never reads the form again. Every API restart makes all open forms stale when `FO_FORM_STAMP_KEY` is unset (A2).

**S6 Minor: focus falls to `<body>` after Take it** with the keyboard. On the list, the row leaves Unassigned (`web/leads-page.tsx:80`). On the lead page, the button unmounts (`web/lead-page.tsx:165`). Measured: `document.activeElement` = BODY in both. WCAG 2.4.3.

**S7 Minor: a person deactivated mid-session gets the sign-in card with no reason.**
The 401 clears the token, so `failed={token ? refused : null}` (`web/sales-frame.tsx:76`) drops the API's "This staff account is not active…". The reason appears only after they try to sign in again.

**S8 Minor: losing the Take it race on the lead page turns it into "Lead not found".**
A viewer without see-all loses the race. The refetch after the refusal (`web/take-it.ts:136`) returns 404, and the page then says "There is no such lead in your firm, or it is not one you may see." (`web/lead-page.tsx:114-118`). BR-5 asks for "<name> already has this lead". At head that appears only in the toast, while the page says the lead does not exist.

**S9 Minor: the raw code `WEBSITE` is shown as the Source** in the list (`web/leads-page.tsx:76`) and on the lead page ("WEBSITE · Website enquiry form", `web/lead-page.tsx:154`).

**S10 Minor: 375 px, and 200 % zoom at 1024 px (512 CSS px).** The menu with the "n unassigned" badge is hidden (`hidden md:block`, `web/sales-frame.tsx:24`). Owner, Waited and Take it sit off to the right inside the table's scroll box, so a phone user must scroll the table sideways to reach Take it.

**S11 Minor: search has no accent folding and no cap notice.** "zoe" finds 0 rows and "ZOË" finds 6 (`web/leads-page.tsx:35`). The search covers only the ≤500 rows the API returns (`api/leads.ts:41`, `take: 500`), and the page does not say when the list is capped.

**S12 Minor: "no active owner" is worked out from the owner's label text.** `startsWith("(Inactive) ")` (`web/leads-page.tsx:37`, `web/lead-page.tsx:125`) repeats the API's rule (STANDARDS §7: no duplicated logic). A staff display name that starts with "(Inactive) " gets Take it offered on a lead someone owns, and the server then refuses it with 409. Found by reading the code.

**S13 Minor: any lead state other than OPEN shows "Closed"** (`web/lead-page.tsx:133`). `FoLeadState` also has ENGAGED, so engaged leads will read "Closed" once Engage lands. Found by reading the code; not live in this part.

**S14 Minor: a Read-only person's empty Mine** says "Take one from Unassigned leads" (`web/leads-page.tsx:18`), but they cannot take one.

Outside this PR's files (note only): `/front-office/web-form/<token>/x` or a link ending in `/..` falls to the app's catch-all. The public visitor then sees the internal Studio "Demo" person list (Configuration author, Client A, …).

## API (FO-2) findings, for #1813

**Still at head f15bba1dd:**
* **A1 Major:** a fill under 2 s gets the thank-you and nothing is stored (`api/public.ts:111`). This is the API side of S3. A real person using autofill is treated as a bot with no trace. Either log a rejected-fast count or let the page wait.
* **A2 Minor:** without `FO_FORM_STAMP_KEY` the stamp key is random per process (`api/public.ts:56`). Every restart makes all open forms answer `RELOAD`.
* **A3 Minor:** the possible match points to the newest person with that email. A visitor who sent "Leak Test" with a known email became the match name ("Possible match: Leak Test (L-00036)"), so visitor-typed text is shown as the matched person on later leads.
* **A4 Minor:** `GET /api/front-office/leads` stops at 500 rows with no cursor (`api/leads.ts:41`; STANDARDS §6 asks for cursor pagination).

**On the copy's b9424b88b only; head fixes them (re-run DW4 on head):**
* Take it race: the Case Officer (no see-all) lost to the Case Manager and was told "No such lead in your firm.", not "<name> already has this lead.". Head checks `sawIt` before the lock.
* U+202E (right-to-left override) was stored in a family name (L-00012, hex `e280ae…`), and a zero-width mark in a first name.
* A forged stamp got 201 with the thank-you and nothing stored.
* The open read had no `Cache-Control: no-store`.

## What held
* **Names with markup:** `<img src=x onerror=…>` and `<script>` names render as text in the list, the lead's h1 and the page title. Nothing ran.
* **Double send:** three `requestSubmit()` calls in one tick sent 3 POSTs with one submissionId and made one lead. Send is disabled while busy.
* **Known or new visitor:** identical 201 body (same md5) and ~20 ms timings for a known email and a new one. Nothing tells the visitor they are known.
* **Odd tokens:** `nope`, 5,000 characters, encoded `<img>`, `..%252F`, `%3Fa=1` and the other firm's disabled form all show "This form is not available." The token is `encodeURIComponent`-ed.
* **Odd lead ids:** `not-a-uuid`, the all-zero id, the other firm's lead and encoded `../platform/me` all show "Lead not found". An upper-case id opens.
* **Read-only person:** no Take it button. A forced `POST …/take` gets 403.
* **Sign in and out:** an unknown firm and an unknown email get the same refusal. Sign out empties the cache. A 401 while holding a token shows the sign-in card.
* **Widths:** no sideways page scroll at 320, 375, 1024, 640 and 512 CSS px (200 % zoom); the table scrolls inside itself.
* **Long text:** 10,000 characters are cut to 100 by `maxLength`.
* **Keyboard:** the form's tab order is First name → Last name → Email → Phone → Interested in → consent → Send, and the honeypot is never reached. Chips carry `aria-pressed`. Take it buttons are named "Take it: <name>, <number>".
* **After the thank-you:** Back works, and a reload draws a fresh form with a new submissionId.
* **Speed:** the leads API answers in under 20 ms (budget < 1 s).

Not re-tested: the "cannot see" match line (DW3). My probe matched an unassigned duplicate, which the viewer may see.

## Re-check at ff9c21216 (15 Nov; :4524 = this head + FO-2 ceda426a9, db `xr_studio_screens_fo4`)
**Result: S1, S2 and S3 are fixed. No screen Blocker or Major is left, apart from S4 (`frame-ancestors`), which stays FO-2's PR question. One API Major is left for #1813 (A5).**
* **S1 fixed.** With the expiry set in the past and a chip clicked, the sign-in card shows, the name leaves the header and the stored session is removed. A 4 s session with nothing clicked shows the card after 5 s on Leads (0 rows left) and on one lead (the email is gone). Signing in again stays on the same lead.
* **S2 fixed.** Leads: the Owner had 13 rows on All open. After a 401 the Case Officer signed in on the same tab, and the table read 2, 0, then 9 (polled every 10 ms); the Owner's 13 never showed. One lead: the Owner had open a lead the Case Manager owns. After the Case Officer signed in, the h1 went "Sign in to your firm", then empty, then "Lead not found"; the lead's name never showed.
* **S3 fixed.** Send pressed 350 ms after the page loaded was held, then thanked, and the enquiry was stored. Three `requestSubmit()` calls during the hold sent 3 POSTs and made 1 lead.
* **S5 fixed.** A forged stamp got `RELOAD`. The page said "The form was refreshed…", moved focus to the summary and kept the answers. Sending again was thanked and made 1 lead.
* **Fixed in the diff, not re-tested in the browser:** S9, S13 and S14. **Still open, all Minor:** S6, S7, S8, S10, S11 and S12.
* **A5 Major, API (FO-2), still at ceda426a9: BR-5 fails for viewers without see-all.** The Case Manager took a lead; 0.7 s later the Case Officer ("Everyone sees all" off) pressed Take it on their stale row. The toast read "No such lead in your firm.", not "<name> already has this lead.". Cause: `sawIt` is worked out from the row read before the lock (`api/leads.ts:99-102`). By then the lead is someone else's, so the server answers 404; only a truly simultaneous click gets the 409 with the name. Naming the owner or not is a choice for the row owner. Until then the screen shows a 404 as if the lead did not exist.
