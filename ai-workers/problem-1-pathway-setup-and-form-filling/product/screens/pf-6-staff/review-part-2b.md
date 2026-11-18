# PF-6 part 2b: review (PR #2127)

**Verdict: Changes needed (Block) for commit 165c91fd6bdd02b72166f2ebb4ca2a6c9f37b024.** Two Majors are open. **Journey score: 8.5/10 (pass).** The branch head ff1b12215 adds only `qa/built/PF-6.md` (records), so the web code is the same.

Reviewer, 18 Nov 2026, Opus 5.5. I did not build this screen. I used an isolated copy, `rev_pf6b` on :4591 (PLATFORM_IDENTITY=local), with Playwright Chromium at 1440, 1024 and 375 px and at 720 px with a 2x scale (200 % zoom). I walked it as the invitee, the Owner and the Case Officer. Report: `journey-test-reviewer-part-2b-2026-11-18.md`. The builder's suite gives **84/84** on :4591.

## Blockers
None.

## Majors
* **MJ-1: a licence saved from an older read silently undoes someone else's change** (licences-page.tsx:32-37, licence-page.tsx:21-25). The form sends what it read when it opened, and PUT replaces the record. Concept §4 lists "conflict (reload)" as a state, and STANDARDS l.27 [M] says a stale save must not overwrite. BIC-07 applies by analogy. This is part 2a's MJ-1 again, on the licence.
  - Steps (verified): as the Owner, open Licences and click Change on the Case Officer's record. Meanwhile another Owner tab saves number `B-…` (PUT 200). In the open panel, pick Lawyer and Law Society of Ontario, then Save.
  - Result: 200, no warning. The stored record is the panel's, and `B-…` is gone. My account has the same gap: an own edit made while a manager changes the record, or the other way round.
  - Fix inside the touch list:
    - Just before the PUT, read the record again: `GET /platform/licences` (this row) on Licences, `GET /platform/me/account` on My account.
    - If the type, body or number differ from the form's `start`, save nothing. Show "Someone else changed this licence record. Nothing was saved." and load the current values.
    - Add a fail line each to DW6 and DW7.
    - A server-side precondition stays a PF-4 matter.
* **MJ-2: after a save, keyboard focus drops to the page body in two places** (WCAG 2.4.3; part 2a's MJ-2 is the same class).
  - **My account → Licence → Save:** `activeElement` is BODY. `key={JSON.stringify(a.licence)}` (licence-page.tsx:30) remounts the form, so the focused Save button is removed.
  - **Licences → Add licence → Save:** BODY. `returnFocus` (licences-page.tsx:56) points at the Add licence button. That button goes away once the person has a record. Change → Save does return focus correctly.
  - Fix:
    - On My account, keep the form mounted after a save (no `key` remount), or move focus to the "Your licence" heading (tabIndex -1).
    - On Licences, after an add, return focus to that person's new Change button (found by `data-licence-row=<staffId>`).
    - Add a DW8 check for each.

## Minors
* m1 accept-page.tsx:45-56: a second invitation link opened in the same tab (only the `#t=` part changes) is ignored.
  - The address keeps the live token, and the page still shows the first invitation (verified).
  - The sign-in link page handles this case (callback-page.tsx:58, `hashchange`; part 1 break M2).
  - Fix: listen for `hashchange`, then take the token and read it again.
* m2 tests/check_pf6_staff_browser.ts:313: the "never in an email" half of DW6 cannot fail.
  - Staff mail goes to `LocalMail` in memory (api/src/features/platform-staff-read.ts:15), never to `msg_outbox`, and that row holds only `rendered_hash`.
  - "Never in a log line" reads `audit_event` and `module_event`, but not the server log. I grepped `var/isolated-rev_pf6b/api.log`: 0 hits for all four numbers.
  - Fix: grep the copy's `api.log` in the test. For mail, say plainly that saving a licence has no mail path, rather than counting outbox rows.
* m3 licences-page.tsx:56-57: Cancel, Escape and the X discard typed licence changes without asking. Part 2a's m4 and EXPERIENCE §2.8 cover this. Ask only when the form differs from `start`.
* m4 licence-page.tsx:13: the two-step words differ from Profile's. Licence shows "On."; Profile shows "On (authenticator app)" (account-page.tsx:16). Use one set of words.
* m5 account-page.tsx:44: "Change your licence under Licence." is plain text. Make "Licence" a link to `/account/licence`.
* m6 At 375 px, the Licences table hides the number and Change behind the table's own scroll, and names break mid-word. Team does the same, and part 2a accepted it. The page itself has no sideways scroll.
* m7 Loading is a text line in all three pages, where BIC-18 asks for skeletons (part 2a m7).

## Builder decisions (judged)
1. **Bodies list: agree.** I checked the committed `page-imm5476.html`:
   - The quote is word for word.
   - The page date is 2025-12-12.
   - `college-ic.ca` and `cnq.org/en` are the page's own links.
   - The page links to `authorized.html#law-societies`, which is not in the copy.

   The 13 societies are labelled Sample, with "(Sample)" in the picker and a note under the form (AGENTS rule 4). The follow-up is records-only, on the Mac.
2. **Two-step with no link: agree.** `TwoStep` is `{method}`, and the brief forbids API changes. Under BR-9 (a), the provider's own enrolment at the next sign-in makes the sentence true. After a reset I saw "Not set up yet. The sign-in provider asks you to set it up when you next sign in." The missing link is a gap against concept §4 and belongs on PF-4b's row, not this PR.
3. **Licences reads Team: agree.** Today only Owner and Admin hold `agent/firm-credential:manage`, and both hold `agent/staff:manage`, so the fallback is never seen. A 403 does not end the session; only a 401 does (session.ts:81). The page makes one request, not one per row.
4. **A new "Licence" entry: agree.** The brief says "one entry in ACCOUNT_SECTIONS". Licences and Security are the frame's menu list (brief touch list), keyed by concept §6.
5. **Token kept in memory: agree.** This is the same pattern as the sign-in link page. A reload sends nothing and asks for the link again (verified).

## Done when (brief)
* **DW5 ✓**
  - Pass: valid → Continue → `/account`. A double-click posts the accept once.
  - Fail: used, revoked and a made-up token → "This invitation is no longer valid."; expired → "This invitation has expired. Ask Sample immigration firm to send a new one."; revoked between view and Continue → the 410 words; a reload → nothing sent.
* **DW6 ✓ (with m2)**
  - Owner: number shown in full; Change and Add work.
  - Case Officer: 403 by URL with the server's words; a crafted PUT also 403.
  - The toast names the person only. No request address carries a number. No audit or event line holds one (`fieldsChanged` only). The server log is clean.
* **DW7 ✓**
  - Security shows only "Two-step sign-in is required for everyone." with no control. A Case Officer gets 403 with the server's words.
  - My account: Licence saved, a blank number refused with the server's words, the audit line written.
* **DW8 partly:** axe is clean on every state I opened. 375, 1024 and 200 % have no page sideways scroll. The keyboard path is complete, but MJ-2 is open.
* **DW9 (my runs, :4591):**
  - PF-6a 52/52, PF-6f 11/11, FO-4 45/45, PF-6b 29/0.
  - J-6 on a fresh copy: 45/50. The 5 failures are J-6's child run of PF-6b (j_6.ts:200, a bare `tsx` with cwd `prototype/`). It fails here with "Parameter decorators only work when experimental decorators are enabled", while PF-6b with the API tsconfig passes 29/0. The PR touches none of those files. This is my environment, not this diff. On the shared copy P1-A1 also failed (data left by the other suites); it passed on the fresh copy.
  - Not run: PF-4 and PF-4b (API only; no API change). CI's full run has not run on this commit (draft).

## Standards and dimensions
* **[M] lines:**
  - path "My account › Licences" met
  - edit in a right panel met
  - accessible partly (MJ-2, m6)
  - prevent errors partly (MJ-1, m3)
  - speed met (the valid invitation shows 238 ms after the page opens)
  - server authorisation met
  - optimistic concurrency not met in the screen (MJ-1)
  - demo chrome separate met (the Accept page is the outside frame with no persona control)
* **D-scores:** D1 4 · D2 3 (MJ-1) · D5 4 · D8 5 · D9 4 · D10 4 · D11 3 (MJ-2) · D12 4 · D13 4 · D14 4 · D15 5 · D16 4 · D18 4 · D19 4. D3, D4, D6 and D7 are N/A (no library content, no AI). D17 and D20 are simulated only.
* **BIC** (§6 is for case-side screens; applied where it fits):
  - met: 04 (required selects, "No licence recorded" is a state), 11 (one primary per panel), 19
  - partly: 13 (server words in a notice, not on the field; the API returns no field), 18 (m7), 20 (MJ-2)
  - not met: 07 by analogy (MJ-1)
  - N/A: the rest
* **Graph:** `graph.mjs --check` exits 0. It does not read module routes, so these pages show no tests. That is the tool's limit, as in part 2a.

## Could not check
* A real screen reader.
* An intended user's unaided walk (D17, D20).
* The Cognito pages behind "Continue to set your password".
* J-6's P1-A4 lines in this environment (DW9 above).

**To fix before Approve:** MJ-1 (read the record again before the PUT on Licences and My account; a DW6 and a DW7 fail line) and MJ-2 (focus after the My account save and after Add licence; DW8 checks). The Minors are the builder's call. Re-review reads only the diff (P-277).

**Verdict: Changes needed** for commit 165c91fd6bdd02b72166f2ebb4ca2a6c9f37b024.

## Re-review (P-277: only the diff 165c91fd6..242065067 under `prototype/studio`), 18 Nov 2026
**Verdict: Approve for commit 242065067b9cb5ebf220ecd847ab3aa303fe02d1.** No Blocker or Major is open. On a fresh copy (`rev_pf6c`, :4593) the suite gives **90/90** and PF-6a gives **52/52** (`account-page.tsx` changed). I walked each fix myself at 1440 px.
* **MJ-1 closed.**
  - My original steps, on Licences: the Case Officer saves `B-…`, then the Owner's older panel saves. Nothing is saved, and the words are "Someone else changed this licence since you opened it. Nothing was saved; the form now shows the record as it is."
  - The form and the table cell both show `B-…`. The next Save, with an edit, goes through.
  - The other way round (a manager saves while My account is open) behaves the same.
  - Mutation check: with the Licences re-read removed, the suite stops at the DW6 conflict step. It goes red as an aborted run (a `waitFor` timeout), not as a counted FAIL line.
  - The window between the re-read and the PUT remains, as in part 2a. The server precondition stays a PF-4 matter.
* **MJ-2 closed.**
  - My account: after Save, focus is on Save; after Enter in the number field, it stays in the field.
  - Licences: after Add licence and Save, focus is on that person's new Change button. After Change and Save, it is on that row's Change button.
* **m1 closed.** A second link opened in the same tab shows the second invitation, the address is clean, and Continue accepts that one (`rev-h2-…`).
* **m2 closed.** The leak check now reads `var/isolated-<name>/api.log`. That is the path both the usage line and CI (`run-suites.sh` through `isolated.sh`) use, so it holds on CI. The label no longer claims an email check.
* **m3 closed.** Escape, Cancel and the X each ask "Discard the licence you typed?":
  - Dismiss keeps the panel open; accept closes it and focus returns to Change.
  - An untouched panel closes without asking.
* **m4 closed** ("On (authenticator app)"). **m5 closed:** the link in Profile's sentence opens `/account/licence`.
* **The breaker's fixes:**
  - m4: a Save with nothing changed sends no PUT, and the note reads "Nothing to save: the licence is as it was."
  - m8: an invitation to an email held by another firm gives a 409 at accept. The page ends the link with the server's words, and no Continue is left. axe is clean.
* **m6 and m7 stay open as Minors,** as the builder states: the 375 px table matches Team's, and skeletons are a house-wide pattern.
* **Nit:** the body of `load` in accept-page.tsx:47-60 is not indented one level in.
* **DW9:** as before, J-6's P1-A4 lines could not be proven in this environment. CI's full run must show them green before the label.
* **Journey score:** now 9.5/10. Correct data and accessibility now score 1 each (m6 matches Team's accepted pattern). Feedback stays at ½ for the text loading line (m7).

**Verdict: Approve** for commit 242065067b9cb5ebf220ecd847ab3aa303fe02d1.

## Re-review of the merge of `main` (1210f0771, parents f598b6ed3 and b403d310d), 18 Nov 2026
**Verdict: Approve for commit 1210f0771af0e3993e7e5cf52019152a860b5607.** I read the resolution only (P-277).
* **The two conflicts are a plain union:**
  - `account-sections.ts` keeps part 2b's Licence, Licences and Security entries and adds PF-5t's Terms entry (`agent/settings:list`).
  - `routes.tsx` keeps part 2b's four imports and routes and adds PF-5t's import and `/platform/terms` route.
  - Nothing is dropped, reordered or duplicated, and no path is used twice.
* **The merge changes nothing else in part 2b:**
  - `git diff b403d310d 1210f0771` is exactly part 2b's 10 studio files.
  - The merge leaves part 2b's own files unchanged (`f598b6ed3..1210f0771` on them is empty).
  - The studio tree at `f598b6ed3` is the same as `242065067`, the commit approved above.
* **Tests:** part 2b's tests do not depend on the new Terms entry. DW7 checks only that no Licences or Security entry shows for the Case Officer.
* **Not re-run by me:** I took the coordinator's runs on the merge as reported: PF-6 staff 90/90, PF-5t 35/35, PF-6a 52/52, PF-1 module routes 28/28, web `tsc` clean.
* **Before the label:** CI's full run on this head, including J-6's P1-A4 lines, as noted above.

**Verdict: Approve** for commit 1210f0771af0e3993e7e5cf52019152a860b5607.
