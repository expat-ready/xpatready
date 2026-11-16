# PF-6 part 2a: review (PR #2044)

**Verdict: Changes needed (Block) for commit 1e252237163d97201e0bc96701cd7bdd20905596.** The branch head 5c4906242 differs only by screenshots and one pinned test line (Admin and Case Officer, Build Lead A's ruling). I read that diff; the web code is identical. Two Majors are open. **Journey score: 9/10 (pass).**

Reviewer, 16 Nov 2026, Opus 5.5. I did not build this screen. Isolated copy `rev_pf6s` on :4581 (PLATFORM_IDENTITY=local, sample seed), Playwright Chromium. I walked it as the Owner, an Admin (invited and accepted) and the Case Officer. Report: `journey-test-reviewer-part-2a-2026-11-16.md`. The builder's suite on :4581 gives **44/44** (head 5c4906242) after I reset my own walk's role change.

## Blockers
None.

## Majors
* **MJ-1: a role save from an older read silently undoes someone else's change** (person-panel.tsx:53-57). The panel sends the whole role list built from its last read, and PATCH replaces the list. Concept §4 lists "conflict (reload)" as a state. None is built.
  - Steps (verified): as the Admin, open the Case Officer's panel. Meanwhile, Billing and finance is given to them (PATCH 200, the breaker's two tabs). In the open panel, tick Read only, then Save.
  - Result: 200 with no warning. Roles are now `CASE_OFFICER, READ_ONLY`, and the 12 money permissions given seconds earlier are gone.
  - Fix inside the touch list: read `GET /platform/staff/:id` again just before the PATCH. If the roles differ from the panel's base, save nothing and show "Changed by someone else. Reload to see the new roles." Add a DW2 fail line for it. A server-side precondition (expected roles) is a separate PF-4 row.
  - The breaker's M1 found the same problem independently.
* **MJ-2: closing Invite people drops keyboard focus to the page body** (team-page.tsx:44 and :66, invite-panel.tsx:43). The panel opens without a Radix trigger and gets no `returnFocus`. The Person panel does get one, and the house component documents it for exactly this case (controls.tsx:101-103, G1 PR 2b review MJ-2, WCAG 2.4.3).
  - Steps: Tab to Invite people, press Enter, then Escape.
  - Result: `document.activeElement` is BODY, and the next Tab starts again at the top of the page.
  - Fix: pass `returnFocus` pointing at the Invite people button, and add a DW8 check that focus returns.

## Minors
* m1 person-panel.tsx:44 and :57: Save roles with no change shows "Roles saved for <name>." The server answered `changed:false`. Say "No change to save." or disable Save until something changes.
* m2 invite-panel.tsx:34 and :39, person-panel.tsx:105: the API returns `emailed:false` when the mail fails, but the toast still says "1 invitation sent." / "A new invitation was sent". Name the failure (the invitation exists; resend it).
* m3 person-panel.tsx:116: Revoke acts at once, with no confirmation. It kills the link and frees the seat (EXPERIENCE §2.8 [M] "in-page confirmation for destructive actions").
* m4 Escape on Invite people with typed rows discards them without asking (invite-panel.tsx:43; `confirmClose` exists). Also §2.8.
* m5 After closing a dialog over a panel (Compare roles, Sign out everywhere, Deactivate, Reactivate, Confirm it's you), focus goes to BODY. The next Tab recovers it, and the shared `Dialog` has no `returnFocus` (person-panel.tsx:24, roles.tsx:48, step-up.tsx:40).
* m6 team-page.tsx:43: the seat line's tooltip is only a `title` on a `<p>`, so keyboard and touch users never see it (BIC-14, EXPERIENCE §2.10).
* m7 team-page.tsx:32, person-panel.tsx:50: loading is a text line, where BIC-18 asks for skeletons.
* m8 step-up.tsx:40-42: "Confirm it's you" shows two near-identical sentences, the concept line plus the server's detail. One is enough.
* I agree with the breaker's m1-m4 (long names overflow, 400-character reason box, Admin shown Deactivate on an Owner, revoked invitation shown as live by URL). I did not re-test them.

## Builder decisions (judged)
1. No name on invite rows: agree. Build Lead A ruled it; the follow-up row is PF-4dn.
2. An Admin cannot give Case Officer: agree, and it matches the server (403 ROLE_BEYOND_OWN_KEYS). It is with the founder and pinned in 5c4906242.
3. Step-up: verified against the **real** server with no stub. I held a sign-in for 310 s, ticked Owner, gave a reason and saved. The sequence was PATCH 401 STEP_UP_REQUIRED, then the dialog with the session kept, then Sign in again, then the same PATCH sent once (200). The panel reopened on `?person=`. Accept, but it is local stand-in only (concept §2's honest boundary).
4. Seat check in the browser: accept. Three parallel invites with one free seat gave 201, 409, 409, and the line reads "5 of 5 seats used".
5. Money line as the union: accept. Admin plus Billing and finance shows 15, which equals PF-6m's count.

## Done when (brief)
DW1 ✓ (accept via the API plus the hand-off page; the Accept page is 2b) · DW2 ✓ · DW3 ✓ (Compare roles counts equal `/platform/roles`; "This gives … 12 money permissions."; the audit line written; Read only shows no line) · DW4 ✓ (the server's words on screen, 403, no Team in the menu) · DW8 ✓ for axe and widths, but MJ-2 is not covered · DW9 not re-run by me.

## Standards and dimensions
* [M] lines: path "My account › Team" met · edit in a panel or dialog met · accessible partly (MJ-2, m5, m6; no sideways scroll at 375 px, 1024 px, or 512 px at a 2x scale = 200 % zoom; axe clean on Invite people at 200 % and the Person panel at 375 px) · prevent errors partly (m3, m4) · speed met (Team 183 ms after sign-in, no request per row) · server authorisation met (cross-firm id 404, Case Officer 403, hidden roles 403).
* D-scores: D1 4 · D2 3 (MJ-1) · D5 4 · D8 5 · D9 4 · D10 4 · D11 3 · D12 4 · D13 3 · D14 4 · D15 5 · D16 4 · D18 4 · D19 4 · D3, D4, D6, D7 N/A (no library content, no AI) · D17 and D20 simulated only.
* BIC (§6 is for case-side screens; applied where it fits): 09 met (named, says what happens, never defaults to Yes) · 11 met · 13 partly (errors on the row, no top summary on a multi-row invite) · 14 partly (m6) · 18 partly (m7) · 19 met · 20 partly (MJ-2) · the rest N/A.
* Graph: `graph.mjs --check` exits 0. It does not read module routes, so `/platform/team` and the 13 staff routes show "0 tests": a limit of the tool, not a gap in this PR.

## Outside this diff (for the lead, not counted)
* The server accepts **Owner at invite** from an Owner by a crafted request: `POST /platform/staff/invitations {"roles":["OWNER"],"reason":…}` gave 201. BR-1's "never at invite" holds only in the picker (identity/service.ts:327-330). It belongs to a PF-4 row.
* The seeded key counts (Owner 233, Admin 215, Case Manager 146) differ from SA-06 Appendix C (231, 213, 145). Not checked further.

## Could not check
A real screen reader. An intended user's unaided walk (D17, D20). The Cognito step-up. The DW9 suites.

## Re-review (P-277: only the diff 1e2522371..4bb056d09), 16 Nov 2026
**Verdict: Approve for commit 4bb056d0957fb0d7ded70264864ceebd3cbb5e51.** No Blocker or Major is open. The suite on :4581 (rev_pf6s, fresh copy) gave **49/49**. I re-walked the fixes in the browser at 1024 px.
* **MJ-1 closed.** Same steps as before (panel open, Billing and finance given elsewhere, then tick Read only and Save):
  - Nothing is saved. The roles stay `CASE_OFFICER, BILLING_FINANCE`, and the panel shows "Someone else changed … Nothing was saved" with the current ticks.
  - The next Save keeps both roles. The new DW2 conflict line fails if the re-read is removed.
  - A small window between the re-read and the PATCH remains. The server-side precondition stays a PF-4 matter.
* **MJ-2 closed.** Escape on Invite people returns focus to the "Invite people" button (new DW8 check).
* Minors:
  - m1 fixed ("Nothing to save: the roles are as they were.").
  - m2 fixed (danger toast on `emailed:false`; read in code, not triggered).
  - m3 fixed (Revoke asks; a revoked invitation's address opens no panel).
  - m6 fixed (the seat rule is visible text).
  - m8 fixed (the step-up names the change and says it is sent again).
  - The breaker's fixes read correctly: one-line reasons with a 200 limit, the Owner-access line for an Admin, and wrapping.
* **m4 half fixed (Minor, open):** Escape and the X ask "Discard the people you typed?", but the footer **Close** button (invite-panel.tsx:44 calls `onOpenChange(false)` directly) discards typed rows without asking.
  - Steps: type an email, then click Close. The panel shuts and no prompt appears.
  - Fix: route Close through the same check.
* **New edge (Minor):** the change replayed after "Confirm it's you" (person-panel.tsx:48) skips the new re-read. A role change made by someone else during the sign-in could still be overwritten by that one resend.
* m5 and m7 stay open as Minors, as the builder states. The journey score stays at 9/10; accessibility and feedback would now score 1 each.
