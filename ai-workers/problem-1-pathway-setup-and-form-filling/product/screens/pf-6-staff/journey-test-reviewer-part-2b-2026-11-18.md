# PF-6 part 2b: journey test, reviewer (18 Nov 2026)

Commit 165c91fd6. Isolated copy `rev_pf6b` on :4591 (PLATFORM_IDENTITY=local, sample seed). Playwright Chromium, headless, real clicks and keys. Seats were lent in my copy (5 → 50) after the builder's suite filled the plan.

**Scaffolding:** the invitation email is held in memory with no reader. As the builder's suite does, I set the invitation's token to one I knew and opened `/invitation#t=…`. Everything after that is the product's own screen.

## Journeys
1. **Invitee, main path: "I got an invite; let me in."**
   - Invite from Team (UI), open the link, Continue, My account → Licence, then add a notary licence.
   - Held: the firm and the email are shown, and the token leaves the address. A double-click on Continue posts the accept once and lands on `/account`. The body is set to the Chambre on its own.
   - Stored exactly `Notary (Chambre des notaires du Québec)|Chambre des notaires du Québec|RV-…-é` (non-English text kept). The toast "Your licence record was saved." holds no number.
2. **Owner: "Record and fix everyone's licences."**
   - Licences → Change → Save. The toast names the person, and focus returns to Change.
   - A blank number gives "Give the licence number (1 to 100 characters)." and nothing is saved.
   - Add licence for a person with none works, but focus then drops to BODY (MJ-2).
3. **Owner, two tabs on one record:** the older panel's Save overwrote a newer save with no warning (MJ-1).
4. **Invitee, error states:**
   - expired → "This invitation has expired. Ask Sample immigration firm to send a new one."
   - used, revoked, or a made-up token → "This invitation is no longer valid."
   - revoked while the page was open → Continue shows the 410 words
   - a bare visit or a reload → "Open the invitation link from your email again.", nothing sent
5. **Invitee, a second link in the same tab (hash change):** the old invitation stays, and the token stays in the address (m1).
6. **Case Officer, wrong role by URL:**
   - The menu is Profile · Licence only.
   - `/platform/licences` and `/platform/security` show the server's words ("Your roles do not include the permission this needs (…)").
   - A crafted PUT on another person's licence is refused (403).
7. **Owner, Security:** only "Two-step sign-in is required for everyone." with no control. The menu is Profile · Licence · Team · Licences · Security.
8. **Case Officer, two-step reset by an Admin:**
   - Their session ends and the sign-in card shows.
   - After signing in again, Licence and Profile both say "Not set up yet", with different wording from each other (m4).
9. **Keyboard only:**
   - Accept: one Tab to Continue, then Enter signs in.
   - Licences: Tab to Add licence, then Enter. Focus is on the type select. Escape returns focus to Add licence. Arrow keys pick the type.
   - My account: a Tab reaches the Licence link, but focus drops to BODY after Save (MJ-2).
10. **Sizes:** 375, 1024 and 1440 px, plus 720 px at 2x (200 % zoom): no page sideways scroll on Licences, My account, Security or Accept.
    - At 375 the Licences number and Change sit behind the table's own scroll (m6, the same as Team).
    - axe (WCAG 2.2 A/AA): clean on Accept (valid, expired), Licences 1440, My account 375 and 1024, and Security at 375, 1024 and 1440.

## Data underneath
* One staff row and one accept per invitation.
* The audit line `platform.staff.credential_saved` holds field names only (`fieldsChanged`), plus "their own" or "by an Owner or Admin".
* No licence number appears in a request address, an audit line, an event, the outbox or the server log (`api.log`, 0 hits).
* The server refused the wrong role (403) and the made-up token (NOT_VALID).

## Break it
* Two tabs on one licence: lost update (Major, MJ-1).
* A 150-character paste is cut to 100 by `maxLength`, the same as the server's limit.
* Double-clicking Continue posts once.
* A reload mid-accept asks for the link again.
* An Owner who is signed in and opens another person's invitation sees it as valid. Continue would hand the tab to the invitee's session (the hand-off's rule, part 1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J7 done on the product's screens |
| Next step obvious | 1 | one primary per page; Continue names the step |
| Plain words | 1 | concept §5's lines; server words verbatim |
| Feedback and state | ½ | no conflict state (MJ-1); loading is text (m7) |
| Correct data | ½ | stored values exact, but an older panel overwrites a newer save (MJ-1) |
| Error recovery | 1 | every closed state names the next step; revoked-meanwhile handled |
| Accessibility and screen sizes | ½ | axe clean, widths fine; focus drops after two saves (MJ-2) |
| Speed | 1 | valid invitation in 238 ms; no request per row |
| Visual quality | 1 | team look, house list and panel (screenshots in the builder's folder) |
| Trust and sources | 1 | IMM 5476 cited and verified; law societies marked Sample |

**8.5/10, pass (no 0).** The fixes that would raise the score, most valuable first:
1. MJ-1 (correct data, feedback)
2. MJ-2 (accessibility)
3. m7 (feedback)

**Could not test:** a real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); the Cognito pages.
