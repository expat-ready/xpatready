# PF-5s S5 Firm profile (R1.92): break report

Breaker (Opus 5.5, did not build it), 23 Nov 2026. Branch `claude/screens-pf5s-firm-profile` at head `2f44fe25e` (draft PR #3201). I ran an isolated copy `pf5sbrk` on :4749 (`AI_LIVE=off PLATFORM_IDENTITY=local`), never :4400, and stopped it at the end, which dropped its database. I used real Chromium through Playwright, curl against the real routes, and psql on the copy's database. Sign-ins: user-R is the Owner, user-O the Case Officer, and user-T was made an Admin by the Owner. Live AI was off and nothing was spent (US$0). I edited no code and committed nothing. Scope is the R1.92 brief: the page `web/src/modules/platform/settings/firm-profile-page.tsx` and `firm-profile-contract.ts` over the API on main. The PR's recorded deviation (one inline form, not a panel per section) is not counted as a finding. Screenshots are in the session scratchpad only (`…/scratchpad/brk/shots/`, not committed).

## Findings

**Major 1. A 409 throws away everything the person typed, and does not say what changed.**
- Steps, test 1: two Owner tabs. Tab A types website `https://tab-a.example.ca`. Tab B changes phone, public email and billing email. Both press Save at the same moment.
  - B saves. A gets 409.
  - A's form is now B's values. `tab-a.example.ca` is gone, and there is no "unsaved changes" flag.
- Steps, test 2: Owner and Admin racing.
  - The Admin changes only the time zone and saves.
  - The Owner had typed billing email `owner-race@example.ca` and currency USD, then saves: 409.
  - The form now shows the old billing email and CAD. Both of the Owner's edits are lost, even though neither field touched the Admin's change.
  - Screenshot `owner-admin-409.png`.
- Notice text: "The latest details are loaded: check them and save again." It does not say the person's own edits were dropped, and it does not say which fields someone else changed.
- Code: `firm-profile-page.tsx:79-83`. `load(latest)` resets both `start` and `f`.
- The standards this goes against:
  - STANDARDS §4 (l.27): "stale save → 409 with what changed".
  - EXPERIENCE §2 conflict state (l.43): "reload or merge".
  - BIC-13: "what was typed is kept".
- The sibling page keeps typed work in the same situation: `notifications-page.tsx:67` says "your unsaved changes are kept on top. Save again."
- "Loads the latest" can be met without discarding work. The usual way: rebase the changed fields onto the latest values, and flag any field that both people changed.

**Minor 2. Leaving with unsaved changes gives no warning.**
- Steps: type a phone number, then:
  - reload the page;
  - click Home in the menu, then press Back.
- Result: no prompt. The typed phone number is gone in both cases.
- Code: `firm-profile-page.tsx` has no `beforeunload` listener. Its siblings do (`notifications-page.tsx:33`, `branding-page.tsx:80`), and so does `Dialog guard` in `controls.tsx:75`.

**Minor 3. Typing while a save is in flight is wiped silently.**
- Steps:
  - Delay the PUT by 1.5 s with `page.route`.
  - Change the website and press Save.
  - While it saves, type `+1 416 555 0199` into Public phone. The inputs are not disabled during the save.
- Result: on success the phone field goes back to "" and no "unsaved changes" flag shows.
- Code: `firm-profile-page.tsx:76`. `load(r.profile)` replaces the whole form. Inputs stay editable while `busy` (line 73).

**Minor 4. Long values are cut silently.**
- Steps: paste a 600-character website and press Save.
- Result: `maxLength={500}` keeps the first 500 characters, and the save goes through. psql confirms: `length(detail->>'value_after') = 500` on the `platform.website` audit line. A cut address opens the wrong page for clients, with no word to the firm.
- The same happens for phone (`maxLength 30`) and both emails (254). A 40-character phone is cut to 30 and then refused with "7 to 15 digits", which hides what was actually sent.
- Code: `firm-profile-page.tsx:104-106,118`.

**Minor 5. Spaces-only values get a wrong message, and the page's comment claims the server handles them.**
- Steps: put three spaces in Public phone and in Website, then Save.
- Result: 422 with:
  - Phone: "digits, spaces and + ( ) . - only". Spaces are allowed, so the message misleads.
  - Website: "a web address starting https:// or http://".
- Hints on both fields say "Leave empty for none."
- `firm-profile-contract.ts:31` says "The server trims and treats "" as "none" for phone, email and website". That is not so: `service.ts:147` compares with `""` before trimming. The page sends the value untrimmed.

**Minor 6. Clearing the billing email gives a message that doesn't say why.**
- Steps: the Owner empties Billing email and saves.
- Result: 422 with "an email address like office@firm.ca" on the field. Focus goes there, which is fine.
- The hint ("Invoices and receipts from ExpatReady go here.") does not say the field is needed, while its neighbours say "Leave empty for none." So the error reads as a format error, not "needed".
- BIC-13 asks for the reason and the fix.

**Minor 7. A keyboard user loses focus after a successful save.**
- Steps: change the phone, Tab to Save, press Enter.
- Result:
  - The toast "Firm profile saved." is announced (polite region).
  - Focus is on `BODY`, because the busy Save button became `disabled` while it had focus (`controls.tsx:36`).
  - The next Tab starts again from the top of the page.
- This goes against WCAG 2.4.3.

**Minor 8. The zone picker offers ICU's old spellings.**
- Chromium's 418 zones include `Asia/Calcutta` and `Europe/Kiev`, and leave out `Asia/Kolkata`, `Europe/Kyiv` and `UTC`. Someone typing "Kolkata" or "Kyiv" in the list finds nothing.
- When the stored zone is `Asia/Kolkata`, it is put at the top, out of order, with `Asia/Calcutta` further down the same list.
- Code: `firm-profile-page.tsx:51`, `allZones()`.
- Nothing is refused, though: every one of the 418 options saved with 200.

**Minor 9. A demoted Admin sees the permission key, and the form stays editable.**
- Steps: the Owner sets user-T to CASE_MANAGER while T's page is open with a typed phone number. T presses Save.
- Result:
  - The notice reads "Your roles do not include the permission this needs (agent/settings:edit)." The server's words are passed through with the raw key.
  - All 6 inputs and Save stay live.
- Back in the app, the cached profile first shows the editable form (about 100 ms, 6 inputs in the first sample), then switches to read-only.

## What held
- **Double-click Save**, and Enter twice then a click: exactly 1 PUT. The second press says "No changes to save."
- **Two saves at the same moment:** exactly one wins and the other gets 409 (row lock). Nothing is half-written.
- **Body contents:** only the changed fields plus `version` are sent. The Admin's PUT carried only `{"version":…,"timeZone":"Europe/Paris"}` and never the billing email.
- **Billing email by role:**
  - Admin sees it as text with "Only the Owner can change this", and has no input.
  - The API sends `null` to the Case Officer, and no billing section is drawn.
  - A direct Admin PUT of `billingEmail` gets 403 OWNER_ONLY.
  - A Case Officer PUT gets 403.
- **Case Officer view:** no input, select or Save in `main`. The only focusable element in `main` is the breadcrumb link. Text is read-only, with "Only an Owner or Admin can change these."
- **Zones the browser does not list:** `Etc/GMT+5`, `UTC` and `Asia/Kolkata`, when stored, are shown selected and kept on an unrelated save. The server refuses `America/Argentina/ComodRivadavia` and names the field.
- **422 handling:**
  - Every field error has `aria-invalid` and is described by a `role=alert` note.
  - The summary notice is `role=alert`.
  - Focus goes to the first invalid field.
  - Typed values are kept.
  - After a 409, focus goes to the notice.
- **Hostile input:** emoji in phone, a right-to-left override in the website, `javascript:`-style and private hosts are refused in words. A punycode email and an IDN website are accepted.
- **Accessibility and layout:**
  - axe (WCAG 2.2 A/AA) finds nothing on the Case Officer, "nothing to save" and 422 states.
  - No sideways scroll at 640 px (200 % zoom), 375 px and 320 px (400 %), for both Owner and Case Officer.
  - A 470-character website and a 136-character email wrap in the read-only view.
- **Role change:** after a reload the page follows the new role, both when demoted and when promoted.

Verdict: **Changes.** Major 1 must be fixed: a 409 must keep the person's typed fields over the latest values and name what changed. Minors 2-9 can be fixed with it or recorded.
