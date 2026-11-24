# J-20 journey test: reviewer, 24 Nov 2026 (R1.20 Invite people on the batch, PR #3370 at 479291e52)

Role: the reviewer (the one journey score for this check). Copy: isolated `rv20` on port 4460 (`PLATFORM_IDENTITY=local`), stopped afterwards.
Browser: Playwright Chromium, headless. A visible pane was not available in this cloud session, so each walk was scripted step by step, the way a person clicks and reads.
Scratch screenshots (not committed): `/tmp/claude-0/-home-user-xpatready/90a006a3-1514-5615-b50e-ecfd9b9196af/scratchpad/shots/`. Builder's screenshots: `screenshots/W1…W6-*-1440.png`.

## Journeys (persona: the firm's Owner, "invite my team in one go")
1. **Main:** four rows (named, unnamed, an existing staff email, an already-invited email) → Send → 2 invited; 2 stay, each with its own words; a notice says 2 were not invited. j_20 W1/W2 passed twice.
2. **Fix and send again:** correct one flagged row, remove the other → Send → invited, and the panel closes (W3).
3. **Seat taken while the form is open:** the second row stays with "No seat left for this person: your plan (Team (Sample)) has 9 seats…" (W4).
4. **More valid rows than free seats (P-727):** the warning says "2 free seats" before Send → 2 invited; the staff row and the third valid row stay; the staff row used no seat (W5).
5. **Big form:**
   * 50 rows with 25 free → one call, 865 ms, 25 invited, 25 left with the seat words.
   * 51 rows → "Nothing was sent / Send 1 to 50 people in one form (rows). Nothing was sent." All rows kept.
6. **No free seat:** before Send, "Your plan has no free seat. Every row comes back marked…". After Send, each row has its own reason: the staff row says it is already on the staff, the other says no seat (T-1440-after-top.png).
7. **Errors:**
   * Mocked 428, 401 STEP_UP and 500 each show "Nothing was sent" with the server's words, keep the row, and keep the session.
   * An empty email gets "Give the person's email address." under Email.
   * A 110-character name is refused under Name: "1 to 100 characters".
8. **Recovery:**
   * A double-click on Send makes 1 batch call.
   * **Editing row 1 while the send is in flight: the edit is lost.** v4 was invited, v5 was not, the row left the form, and the toast said "1 invitation sent.".
   * Adding a row in flight: the panel closes and the new row is discarded without asking.
9. **Keyboard only:** Invite people (Enter) → focus is on Email → type → 19 Tabs to Send → Enter → invited; the panel closes and focus returns to "Invite people". After a flagged send, focus lands on the panel container.
10. **Next screen:** the invitee opens the emailed link → Accept → signed in with the typed name → Team lists them as active (W6).

## Data underneath (read in PostgreSQL)
* One invitation per invited row, with the roles chosen and `display_name` as typed (NULL when no name was typed).
* One `platform.invitation.created` line each, with `batch: true` and `after.displayName`.
* No row for a flagged email. The already-invited row still has exactly one invitation.
* Seats used never passed the limit.
* The typed name was found only in `platform_invitation`, `platform_staff` and `audit_event`, plus the stored copy of the sent email ("Hello <name>,"). See review m5.

## Screen sizes and accessibility
* axe WCAG 2.2 A/AA on the flagged state: 0 violations at 1440, 1024, 720 (200 %) and 400 px, and 0 px sideways scroll at each.
* `aria-invalid` and `aria-describedby` are set on each flagged field.
* Every flagged field mounts its own `role="alert"`: 25 flagged rows give 26 alerts.

## Findings
| Sev | Finding | Where |
|---|---|---|
| Major | Rows stay editable while a send is in flight. An edit or added row is lost without notice, and the toast reports an invitation sent to the address that was being corrected | panel:66 (busy only on Send), :53-62 |
| Minor | No 50-row cap in the form; the 422 words say "(rows)" and repeat "Nothing was sent" | panel:90, batch-invite.ts:52 |
| Minor | Focus goes to the panel after a flagged send, and alerts stack | panel:57, controls.tsx:61 |
| Minor | Seat words: "comes back marked"; "55 of 53 seats after these invites"; "Fix each row" also on seat-only rows | panel:25, :68, :61 |
| Minor | Names of 101-120 characters were accepted before and are refused now | batch-invite.ts:37 against id/service.ts:98 |

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-6 and 10 complete; j_20 32/32 twice |
| Next step obvious | 1 | Flagged rows stay with their fix; one click resends (W3, W5) |
| Plain words | ½ | "comes back marked", an impossible seat line, "(rows)" |
| Feedback and state | ½ | Spinner, toast and notice are good; the in-flight loss is silent |
| Correct data | 1 | Every value exact in the DB; seats in order; flagged rows use no seat |
| Error recovery | ½ | 422, 428, 401 and 500 keep the form; edits in flight are lost |
| Accessibility and screen sizes | ½ | axe clean at four widths, keyboard path works; focus dropped, alerts stack |
| Speed | 1 | 50 rows in one call, 865 ms |
| Visual quality | 1 | Team components; one primary button (W5, T-1024-before) |
| Trust and sources | 1 | The server's words name the plan and its seat count; no AI |

**Total 8/10, no 0: pass.** What would raise it, most valuable first:
1. Lock the form while sending (feedback, recovery).
2. Focus the first flagged field and keep one live announcement (accessibility).
3. Plain seat words, and a seat line that matches P-727 (words).

Could not test: a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); real SES timing.
The builder's later commits `661abe5c1` and `857a60169`, which landed in the checkout during this test, were not tested.
