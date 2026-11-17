# PF-6 part 2a: journey test (reviewer, 16 Nov 2026)

Reviewed PR #2044 at commit 1e252237163d97201e0bc96701cd7bdd20905596; the web code is the same at head 5c4906242. Isolated copy `rev_pf6s` on :4581 (PLATFORM_IDENTITY=local, sample seed). Playwright Chromium, signing in as a person would through the sign-in card. Review: `review-part-2a.md`.

## Journeys (persona · goal · result)
1. **Owner brings someone in** (main): Team → Invite people → type an email, tick Billing and finance → add a second row with a bad email → Send.
   - Held: the row with the good email was sent, with the toast "1 invitation sent.". The bad row stayed, showing the server's words "That is not an email address (name@example.com).".
   - Held: double-clicking Send created one invitation (checked in the DB). The Invited chip lists it.
2. **Owner manages an invitation** (alternate):
   - Resend: the old row is revoked and a new one is created (DB).
   - Revoke: works, but asks for no confirmation (m3).
3. **Owner changes roles**:
   - Ticking Billing and finance shows "This gives Second representative (Sample) 12 money permissions." Adding Admin as well shows 15 (the union).
   - Save works. Saving with nothing changed still says "Roles saved" (m1).
4. **Owner removes and restores access** (error then recovery):
   - Deactivate with no reason, then with 250 characters, shows the server's words each time. With "Left the firm" it works.
   - The person shows as "(Inactive) Second representative (Sample)" and the seats go 3 → 2.
   - Reactivate with no reason shows the server's words; with a reason it works. Sign out everywhere names the person.
5. **Owner gives Owner after an old sign-in** (step-up, real server, no stub):
   - Waited 310 s, ticked Owner, gave a reason, saved: 401 STEP_UP_REQUIRED, and the "Confirm it's you" dialog opens with the session kept.
   - Sign in again sends the same PATCH once, and it returns 200. The panel reopens from `?person=`.
6. **Admin invites** (wrong-role limits): the picker offers only Admin, Billing and finance, and Read only, with nothing pre-ticked (ruled, pinned). On the Owner's panel it shows "Also holds Owner, Case Manager, which you cannot give or remove."
7. **Case Officer opens /platform/team by URL** (wrong role): sees "Not available · Your roles do not include the permission this needs (agent/staff:manage)." and has no Team menu entry.
8. **Recovery**:
   - Reload with `?person=` reopens the panel.
   - A made-up person id opens no panel. The API answers 404 for an id from another firm.
9. **Keyboard and 200 % zoom** (512 px wide at a 2x scale):
   - Tab order: menu, Invite people, chips, search, table, names.
   - Enter opens the panel on the email field, and Space ticks a role.
   - Escape from Invite people drops focus to BODY (MJ-2). Escape from the Person panel returns focus to the name.
10. **Screen boundary**: the invite hands off to accept. Accept was done through the API and the hand-off page, because the Accept page is part 2b.

## Data underneath
* new.hire@example.com has two rows: the original, revoked by Resend, and the new one, revoked by Revoke.
* Roles after each save are exactly what was ticked.
* `platform.staff.money_keys_granted` is written (suite DW3).
* Three parallel invites with one free seat returned 201, 409 and 409.
* A crafted invite with no roles was refused: 400 "Give at least one role.".

## Break-it (15 minutes)
* **Major: a stale panel's role save overwrites a concurrent change** (MJ-1).
  - Steps: the Admin's open panel, while Billing and finance is given elsewhere, then tick Read only and Save.
  - Result: 200, with Billing and finance silently removed.
* **Outside the diff:** an Owner's crafted `POST /platform/staff/invitations` with `["OWNER"]` and a reason returns 201. BR-1's "never at invite" is enforced only by the picker.
* Held: double-click Send; parallel invites against the seat limit; a cross-firm id; the Case Officer by URL; a reason over 200 characters.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-8 all completed in the browser |
| Next step obvious | 1 | One primary per view; action buttons name the person |
| Plain words | 1 | Role lines from SA-06 Appendix C; the server's words shown verbatim (m8: a doubled step-up sentence) |
| Feedback and state | ½ | "Roles saved" when nothing changed (m1); "sent" even when `emailed:false` (m2); text loading (m7) |
| Correct data | 1 | DB checks above (MJ-1 is a concurrency gap, scored under the review) |
| Error recovery | 1 | Failed rows keep their words; reload keeps the panel; the step-up resends once |
| Accessibility and screen sizes | ½ | axe clean and no sideways scroll at 375, 512@2x, 1024 and 1440 px; focus lost after Invite people (MJ-2) and dialogs (m5); seat tooltip is title-only (m6) |
| Speed | 1 | Team 183 ms after sign-in; no request per row |
| Visual quality | 1 | House frame, panel and table; matches the builder's committed screenshots |
| Trust and sources | 1 | Sample labels; seat line and refusals from the server; no AI on these screens |

**9 / 10: pass, with no 0.** Fixes, most valuable first:
1. Return focus to Invite people after the panel closes (MJ-2).
2. Fix the save so it does not silently undo another person's change (MJ-1, in the review).
3. Honest toasts for "no change" and "email not sent" (m1, m2).

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17, D20 stay with the founder).
* The Cognito step-up (local stand-in only).
* The DW9 suites.
