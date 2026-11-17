# PF-6 part 2a: break report (PR #2044, commit 1e2522371; head 6f004a277 adds only screenshots)

Breaker, 16 Nov 2026. Isolated copy `brk_pf6s` on :4582 (PLATFORM_IDENTITY=local, sample seed), real routes, Playwright Chromium. Scope: concept r2 §3 BR-1 to BR-7, §4 Team / Invite people / Person panel / Confirm it's you, and the PR's DW1-DW4, DW8. Licences, Security, My account and Accept invitation are not in part 2a and were not judged.

## Findings

**M1 (Major): two sessions saving the same person's roles. The second save silently undoes the first.** Concept §4 lists "conflict (reload)" as a state, and the screen has none.
Steps: as the Admin, open the Case Officer's panel in tab 1 and in tab 2. In tab 2, tick Billing and finance, then Save (200). In tab 1, which still shows the old roles, tick Admin, then Save.
Happened: tab 1 sends `{"roles":["CASE_OFFICER","OWNER","READ_ONLY","ADMIN"]}` and gets 200 with no warning. Billing and finance, given seconds earlier, is gone. The save removes a role that brings 12 money permissions, and nobody chose to remove it.
Should: the Save that started from an older copy is refused, or reads the person again first, and shows "Changed by someone else, reload". The cause is that the panel sends the full role list built from its last read (person-panel.tsx:53, :55-58). The PATCH route takes no version, so a fix may need the API owner (PF-4).

**m1 (Minor): a long unbroken name pushes the Person panel's text off screen** at 375, 1024 and 1440 px.
Steps: give a person a display name with a 100-character word (Latin, CJK and Arabic mixed), then open their panel.
Happened: the title, the legend "Roles for <name>" (person-panel.tsx:74; roles.tsx:25) and every role's can/cannot line run off the right edge and are cut off. The panel's scrollWidth is 1015 px against 374 or 559 px. The Team table wraps the name correctly.
Should: the legend and the title wrap (`overflow-wrap:anywhere`, as the table already does).

**m2 (Minor): the reason boxes accept text the server always refuses.**
Steps: open Deactivate, type "Left the firm.<Enter>Last day Friday." and confirm. Then paste 250 characters.
Happened: the box is a multi-line Textarea. The newline gets "The deactivation reason contains a control character. Type it again." The box takes up to 400 characters (person-panel.tsx:26 `maxLength={400}`), although its label says "1 to 200" and the server answers REASON_TOO_LONG. The Owner-change reason (:76) has neither limit.
Should: a single-line input, or newlines replaced before sending, and `maxLength={200}`.

**m3 (Minor): an Admin is shown Sign out everywhere and Deactivate on an Owner, and both are always refused.** BR-10 says "no button for anything not built".
Steps: as the Admin, open the Owner's panel, then Deactivate, enter a reason and confirm.
Happened: 403 "Only an Owner deactivates an Owner." The server's words appear correctly, but the button can never work for this person (person-panel.tsx:88-89).
Should: hide both buttons for a non-Owner viewing an Owner, or show the reason in their place, as the Roles section already does with "which you cannot give or remove".

**m4 (Minor): a revoked or replaced invitation opened by its address looks live.**
Steps: open `/platform/team?invitation=<id of a REVOKED invitation>`.
Happened: the panel shows "works until 19/11/2026" with Resend and Revoke. It has no status line, because STATUS_WORDS has no REVOKED or ACCEPTED. Both buttons answer "This invitation was already revoked." (team-page.tsx:36 searches every invitation, not only the listed ones; person-panel.tsx:112, :125).
Should: show the revoked or accepted state, with no actions, or no panel.

**m5 (Minor): the Confirm it's you dialog has wrong and contradictory copy.** The dialog always says "sign in again to give or remove the Owner role" (step-up.tsx:10, :40). The same dialog also opens for deactivating or reactivating an Owner, which the server also guards. The server's line under it (:42) adds "then try once more", but the screen resends the change itself. The person reads three "Confirm it's you" sentences that disagree.
Should: describe the step-up in terms of the action that triggered it, and do not tell the person to try again.

**m6 (Minor): DW8's "Enter opens the panel on its first field" does not hold.** Steps: using the keyboard only, Tab to a person and press Enter. Happened: focus lands on the dialog container. The next Tab goes to Close, then to the body region, then to the first role checkbox. Should: focus lands on the first field, as the PR states, or the PR's claim is corrected.

**m7 (Minor, API, outside this PR's files): an Owner can still create an Owner invitation by a crafted request.** BR-1 says "Owner is never offered at invite". The UI holds this, but `POST /platform/staff/invitations {"roles":["OWNER"],"reason":"x"}` from an Owner with a fresh sign-in returns 201. For PF-4.

**m8 (Minor): two parallel invite forms each send part of their rows.** BR-1 says "the whole form is seat-checked first". At 3 of 5 seats, tabs A and B each send 2 rows. Each gets one 201 and one 409 PLAN_LIMIT_REACHED. The seat limit itself held at 5 of 5. Each panel keeps the refused row with the server's words and shows "6 of 5 seats after these invites". The check covers one form, not the firm, because there is one call per row (invite-panel.tsx:33).

## What held
* An Admin giving Owner by a crafted PATCH or invitation gets 403 OWNER_ONLY. An Admin giving Case Officer gets 403 ROLE_BEYOND_OWN_KEYS. Removing, deactivating or signing out an Owner as an Admin gets 403.
* The only Owner deactivating themself, through the UI, sees SA-6-44's words. Changing one's own roles gets OWN_ROLES, and the panel hides the picker.
* An expired invitation link replayed gets 410 "This invitation is no longer valid.". After a resend, the old link also gets 410.
* `/platform/team?person=<sample-solo's Owner id>` (and `?invitation=`) opens no panel and leaks nothing. The API answers 404 for read, deactivate and sign-out-everywhere.
* The seat line under parallel invites: 6 parallel POSTs at 3 of 5 seats gave exactly 2 created (201) and 4 refused (409), and 5 parallel invitations to the same email gave 1 created. Reactivating over the limit shows the server's seat words.
* Duplicates: upper-case and already-invited emails are refused with the server's words. The same email twice on one form is flagged before anything is sent.
* Step-up, with a 5-minute-old Owner sign-in giving Owner by double click: 1 PATCH answered 401, then Confirm it's you, then Sign in again (double-clicked), which made 1 sign-in, then exactly 1 PATCH answered 200. The change applied only to that person, and the panel reopened from `?person=`.
* Double-clicking Save roles, Deactivate and Send each sent exactly one request.
* A deactivated person's open Team tab shows the sign-in card on its next request.
* There is no sideways page scroll at 375, 1024 or 720 px (200 % zoom). The table scrolls inside its own box. The invite panel and Compare roles fit at 375 px.
* Keyboard only: Tab reaches the chips, search, Invite people and each person. Escape returns focus to the row.

Screenshots in the breaker's scratchpad (not committed): admin-owner.png, stepup.png, person-375.png, after-deactivate.png, invite-A.png.
