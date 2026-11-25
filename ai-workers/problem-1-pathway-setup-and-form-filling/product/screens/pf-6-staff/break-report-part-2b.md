# PF-6 part 2b: break report (PR #2127, commit 165c91fd6)

Breaker, 18 Nov 2026. I used an isolated copy, `brk_pf6b` on :4593 (PLATFORM_IDENTITY=local), with a fresh `vite build` and the Sample firms seeded the way `tests/check_pf6_staff_browser.ts` does. I ran Playwright Chromium against the real routes and checked the results with psql. Scope: concept r2 BR-4 and BR-8, and §4's Accept invitation, Licences, My account → Licence and Security. Accept, Licences, My account and Security are web only; the API (PF-4/PF-4b) is unchanged and was not judged except where a screen depends on it.

## Findings

**M1 (Major): a save started from an older copy silently overwrites a newer licence record, on both Licences and My account → Licence.** Concept §4 lists "conflict (reload)" as a state. STANDARDS §4 [M] requires optimistic concurrency. Part 2a's MJ-1 was the same gap, and it was closed there by re-reading before the save.
Steps (Licences): as the Owner, open Licences in tabs A and B and open the Case Officer's panel in each. In B, choose Lawyer, Law Society of Ontario, `NEWER-B`, then Save. In A, which still shows the older values, choose College member, `OLDER-A`, then Save.
Happened: A gets 200, the panel closes and the toast says "saved", with no warning. The database now reads `College member (CICC)|College of Immigration and Citizenship Consultants|OLDER-A`, so B's type, body and number are gone.
Steps (My account): the Case Officer opens `/account/licence`. The Owner then sets their record to Notary / Chambre / `ADMIN-SET` (PUT staff/:id/credential). The Case Officer types a new number in the stale form and saves.
Happened: 200 with no warning. The type and body the Owner had just set revert to the College's.
Cause: `licences-page.tsx:32-38` and `licence-page.tsx:136-140` send the form's whole record with no check, and the PUT takes no version.
Fix inside the touch list: before the PUT, read the record again (`GET /platform/licences` for the row, or `GET /platform/me/account`) and compare it with `start`. If it differs, send nothing and show "Someone else changed this licence record. Nothing was saved." with the current values, as person-panel does. Keep `updatedAt` in the `Row` schema (zod drops it now) to make the comparison cheap. Add a DW6/DW7 conflict line that fails when the re-read is removed. The remaining window between the read and the PUT needs a server precondition, which is a PF-4 matter.

**m1 (Minor): the old seed values are kept on save without any prompt.** Steps: open the Second representative's record, which is seeded `rcic` / `CICC`. Only the number changes, then Save. Happened: the record stays `rcic|CICC|<new number>`. The form preselects "rcic (as recorded)" and "CICC (as recorded)" (`licence-form.tsx:84-88`), so a person can save again and again without ever choosing a BR-8 type or body. The Licences table shows the raw `rcic` / `CICC` with no marker (`licences-page.tsx:47`). Should: keep showing an "as recorded" value, but make it fail the form's check: put the option first and disabled, or refuse submit with "Choose a type from the list". The table should also mark such values "(as recorded)".

**m2 (Minor): the hint promises a format check that never happens.** Concept §5's hint reads "Checked against the usual format only. We never verify licences." BR-8 asks for "a soft format hint". Steps: save `x`, `ナンバー٣٤ Ünïcødé` or 100 × `x` as a College member's number. Happened: all are saved, with no hint or warning of any kind (`licence-form.tsx:78`, `:109`). Should: show a soft, non-blocking line when the number does not match the type's usual shape (shape labelled Sample until sourced). Otherwise the sentence is untrue.

**m3 (Minor): a control or invisible character gets misleading words.** Steps: paste `AB<Tab>CD`, or a lone zero-width space, into Licence number and save. Happened: "Give the licence number (1 to 100 characters)." The person typed 5 characters, or 1. Should: the form checks for `/[\p{Cc}\p{Cf}]/u` before sending and says "The licence number contains a hidden or control character. Type it again." (`licence-form.tsx:97-101`).

**m4 (Minor): saving with nothing changed still writes "a licence record was changed" and toasts "saved".** Steps: open My account → Licence and click Save without editing anything. Happened: one new `platform.staff.credential_saved` audit row with `fieldsChanged: []`, and the toast "Your licence record was saved." Part 2a's m1 was fixed with "Nothing to save". Should: when the values equal `start` (after trimming), send nothing and say "Nothing to save: the licence is as it was." (`licence-form.tsx:97-99`).

**m5 (Minor): keyboard focus falls to the page after Add licence.** Steps: Tab to "Add licence for …", press Enter, fill the form by keyboard and press Enter. Happened: the record is saved and the person moves into the table, but focus lands on `<body>`. Panel's own doc says returnFocus names "the next one when that row left the list". After Change, focus does return to the Change button correctly. Should: `returnFocus` finds the new row's Change button by `staffId` (`licences-page.tsx:31`, `:56`).

**m6 (Minor): the Licences panel discards a typed number without asking.** Steps: type a number, then press Escape, the X or Cancel, or reload. Happened: the panel closes and the number is lost. Invite people asks "Discard the people you typed?" (Panel's `confirmClose`). Should: pass `confirmClose` when the form differs from `start` (`licences-page.tsx:56`).

**m7 (Minor): a long unbroken name runs off the Licences panel's title.** Steps: give a person a 100-character unbroken display name (Cyrillic, CJK and Arabic) and open Change. Happened: the title "Licence: <name>" is cut off at 375 and 1440 px, with the dialog's scrollWidth at 767 against clientWidth 374 and 559. The page itself does not scroll sideways. Should: use the title "Licence" and put the name in the body inside an `[overflow-wrap:anywhere]` element (`licences-page.tsx:56`), because the Panel's title is shared code.

**m8 (Minor): after a 409 "This email already signs in to another firm…", Continue stays on the page.** Steps: open a valid link for an email that is already a sample-solo staff member, then click Continue. Happened: the words are right, but "Continue to set your password" stays enabled, and every click answers the same 409 (`accept-page.tsx:65`). Should: for `EMAIL_IN_ANOTHER_FIRM`, show the words as the closed state with no Continue (BR-10: no button that cannot work).

**m9 (Minor, sources): BR-8's "each with its official site and the date read" holds for 2 of the 15 bodies.** The 13 law societies have `site: null` and `read: null`. They are correctly labelled Sample, following AGENTS rule 4, and the question is raised on the PR. The file cites IMM 5476 for the types. Concept BR-8 names IRPA s. 91(2), so cite it too, with its date, in `representative-bodies-ca.json`'s `_note`.

## What held
* **BR-4 states.** An expired link, a replayed expired POST (410), and a link that expired or was revoked while its page was open each show the fixed words. Expired shows "This invitation has expired. Ask Sample immigration firm to send a new one."; used and revoked show "This invitation is no longer valid.".
* **Double use.** A double-clicked Continue sent 1 POST and created 1 staff row. In the two-tab case, tab B accepts, then tab A's Continue shows "no longer valid". Two tabs clicking Continue at once created 1 staff row; the loser shows "no longer valid". After the hand-off, Back leaves the site and does not return to Continue.
* **Odd tokens.** `../../api/platform/me`, `%2e%2e%2f`, an `<img onerror>` token, `a&t=b`, 10,000 characters and `%00%0d%0a` are all percent-encoded into one path segment and answered "no longer valid". Nothing renders as HTML. An empty `#t=` sends nothing. The address loses the token at once, and the API log records only `/api/public/invitations/:token`. The responses carry `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
* **Roles.** A Case Officer opening `/platform/licences` or `/platform/security` by URL sees the server's 403 words, and their menu shows only Profile and Licence. A Case Manager's PUT on the Owner's licence gets 403 "You can change only your own licence record.". Another firm's staff id gets 404 for both the Case Officer and the Owner, and so does `..%2F..%2Fme`. An upper-cased own id is accepted as their own record.
* **The number never leaks.** It is not in a toast, the address, any request URL, the page title, `audit_event`, `module_event`, `msg_outbox` or `var/isolated-brk_pf6b/api.log`. I checked nine numbers, including the seed's `R000002` and non-Latin text. The audit row holds only the field names.
* **Inputs.** `maxLength=100` holds. Padded spaces are trimmed and shown trimmed. Non-English text saves and shows correctly. Picking a type resets a body that does not fit it, and a lawyer is offered only the law societies.
* **Session end.** When the Owner signs in elsewhere while the Licences panel is open, the next Save gets "You signed in on another device." with Sign in again here, and nothing is saved. With storage refused, accepting still signs in, kept in memory only.
* **Keyboard, widths and double-clicks.** The keyboard reaches every control. Enter opens the panel on its first field, Escape returns focus to the opener, and Enter on Continue accepts. A double-clicked Save sends 1 PUT. The Licences list and panel, My account → Licence, Security and Accept have no sideways scroll at 375 px or at 512 px (1024 px at 200 % zoom). Security shows only the read-only line.

Screenshots are in the breaker's scratchpad and not committed: other-firm.png, lic-panel-375.png, long-375.png, session-end.png.

Verdict: Changes needed

## Re-break at 242065067 (only the diff 165c91fd6..242065067), 18 Nov 2026
I ran a fresh copy, `brk_pf6b` on :4598, from a fresh build of 242065067. The reviewer's copy had taken :4593, so I moved; I stopped mine when done. I ran Playwright Chromium and checked the results with psql. No screenshot in the repository was written.

**M1 closed.** Licences panel and My account → Licence each take a fresh GET before the PUT.
* A record changed after the form opened: nothing is saved. The panel shows "Someone else changed this licence since you opened it. Nothing was saved; …" and the form now shows the current record.
* A record deleted after the form opened is also caught. The form empties to the "Add" state, and on My account the line under the heading changes to "No licence recorded…".
* Retry: re-entering values after the conflict saves them, through a PUT that creates the record again. Focus returns to the row's Change button.
* Repeated conflicts: two conflicts in a row in the same open panel are each caught, and the next save goes through. My account also catches a conflict that follows its own successful save.
* Saving the shown values unchanged right after a conflict says "Nothing to save" and writes no audit row.
* No other route was harmed: the conflict check is in the web layer only.

**m10 (Minor, server matter): the window between the re-read and the PUT remains.** Steps: open the same record in tabs A and B. In A, hold the PUT for 2 s after its GET passes; in the meantime B saves `GAP-B`. Happened: A's PUT lands and the record reads `GAP-A`, with no warning. Clicking Save in both tabs at the same moment, with no hold, also saves both: the last write (`SIM-B`) wins and neither tab is warned. This window is the same one the part 2a re-review accepted for roles. Only a server precondition closes it (a version or `If-Match` on `PUT staff/:id/credential` and `PUT me/account`), which is a PF-4 matter. Nothing in the touch list can close it.

**m4 partly open (Minor): a change made only of spaces still counts as a change.** Steps: on My account, add a trailing space to the stored number (`TRIM` → `TRIM `) and Save. On Licences, add a leading space instead. Happened: a PUT is sent, a `credential_saved` audit row is written with `fieldsChanged: []`, and the toast says "saved". The server trims, so nothing changed. The input then keeps showing `TRIM `. Fix: compare trimmed values when computing `dirty` (`licence-form.tsx`, `const dirty`), and save the trimmed values as the new `base`.

**The other fixes hold.**
* m5: after Add licence, focus lands on the new row's Change button.
* m6: a typed panel asks "Discard the licence you typed?" on Escape. After a conflict reset, with nothing typed, it closes without asking.
* m8: a 409 ("This email already signs in to another firm. Ask Sample immigration firm to invite another address.") now shows as the closed state, with no Continue.
* The new hashchange handling on the Accept page holds. Changing to a revoked link's hash shows "no longer valid", and changing back to a valid one shows the valid state. The token leaves the address each time. A hash change while Continue was in flight still finished the first link's accept (one staff row) and the hand-off.

The not-changed items (m1, m2, m3, m7, m9) were not re-judged: the PR gives their reasons.

Verdict for 242065067b9cb5ebf220ecd847ab3aa303fe02d1: Approve (no Blocker or Major open; m10 is the server's, m4's remainder is Minor)
