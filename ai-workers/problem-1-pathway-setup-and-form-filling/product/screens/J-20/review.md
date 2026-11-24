# J-20 review: Invite people on the batch route (R1.20, P-727), PR #3370

This review covers commit `479291e52364f6ef0cfdcaa517892c096d7889a7` only, compared with origin/main `f0bc60179`. The reviewer is a fresh session that did not build it.
Paths: `panel` = `studio/web/src/modules/platform/staff/invite-panel.tsx`; `id/` = `studio/api/src/platform/identity/`.
The bar: PF-6 concept r2 (BR-1 to BR-3, read under P-727 as Lead 19 ruled in comment 7120981580), PF-4dn, PF-4c part 1b, STANDARDS, EXPERIENCE, QUALITY. Journey report: `journey-test-reviewer-2026-11-24.md`. Copy used: isolated `rv20` on port 4460, stopped afterwards.
**Note:** at 03:48 UTC the builder committed `661abe5c1` and `857a60169` into the same checkout, during this review (breaker M1, m1, m2, m5). I have not reviewed them. Every run listed below used 479291e code, except the two marked *.

**Journey score (reviewer): 8/10, no 0: pass** (see the journey report).

**Verdict: Ship after fixes.** The server part and the data underneath are correct. One Major is open at this commit: edits made while a send is in flight are lost without notice.

## What I ran
* At 479291e: `journeys/j_20.ts rv20 4460` 32/32 twice · `check_pf6_staff_browser.ts 4460 xr_studio_rv20` 91/91 twice · `check_pf4dn_invite_name.ts` 15/15 twice · `check_pf4c_batch_invite.ts` 24/24. None needed a retry: each wait in these tests is a poll for a condition, never a re-run.
* \* Run after the checkout moved on (the API and both tests are byte-identical at 479291e; the panel diff does not touch the catch path): `check_pf4c1b_batch.ts` 19/19 · `check_pf5t_terms_browser.ts` 35/35 on a fresh copy. On my probe-filled copy it failed at "sending it again makes the invitation". The cause was the 96 pending invitations my probes left, more than the lent seats (environment, not code).
* Probes (Playwright, scratch, not committed): double-click; edits, removals and added rows while a send is in flight (the response delayed 1.5 s); 51 and 50 rows; 0 free seats, and more seats used than the limit; mocked 428, 401 STEP_UP and 500; a 110-character name; an empty email; axe and sideways scroll at 1024, 720 (200 %) and 400 px; keyboard only. Screenshots: `/tmp/claude-0/-home-user-xpatready/90a006a3-1514-5615-b50e-ecfd9b9196af/scratchpad/shots/`.
* `graph.mjs`: G1 0 · G2 0. G3 lists `POST /platform/staff/invitations/batch` as reached by no test. That is a miss in the graph tool: j_20, pf4c, pf4c1b and pf6 all call it. It is not a finding against this PR.

## The two Lead 19 rules, checked
1. **The name is kept (personal data).**
   * The batch's audit line now matches the single invite exactly: `after: { email, displayName, roles, expiresAt }` (id/service.ts:454 against :425). Resend carries it (:495), and accept writes it to `platform_staff` with its own audit line, as PF-4dn does. The API answer never echoes the name (`name` is stripped at :460).
   * I searched every table on the copy for a typed name. Only `platform_invitation`, `platform_staff` and `audit_event` hold it (the created and accepted lines).
   * **Something else does hold it:** the stored copy of the sent email (the FilesPort rendered file the demo inbox reads) begins "Hello <name>,". The single invite never greets anyone by name, so names typed on this screen now land somewhere they did not before. See m5.
2. **P-727 over BR-2.**
   * Send is never disabled by the seat count (panel:66).
   * The warning says how many seats are free before Send (panel:24-26, :70).
   * The server gives the free seats to the rows with no flag, in order (id/service.ts:447-450). A row with another flag never reaches `valid`, so it uses no seat. j_20 W5 proves this: the staff row comes first and Y2 still gets the seat.
   * Removing the rule fails tests: putting `disabled={over > 0}` back fails pf6 BR-2 (`isEnabled`) and j_20 W5. Storing `null` as the name fails j_20 W2 and pf4c:98.

## D1–D20 (scored at 479291e)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | P-727 behaviour, BR-3 per row, PF-4dn name: j_20 W1-W6, pf6 BR-2/3 |
| D2 Data integrity | 5 | One locked transaction; seats never passed in pf4c DW3; one invitation per row, each with its audit line (j_20 W2) |
| D3 Reuse | 5 | The same rowCheck and seat check as the single invite; no logic duplicated in the web |
| D4 Rule integrity | N/A | No questionnaire rules |
| D5 Stability and recovery | 3 | Double-click sends 1 call; 428/401/500 keep the form. But an edit or added row in flight is lost (M1) |
| D6 Governance | 5 | An audit line per invitation (`batch: true`) |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | My account › Team, the panel title |
| D9 Flow | 4 | Flagged rows stay, so you fix and send again; W3 and W5 recover in one click |
| D10 Language | 3 | "comes back marked", "108 of 106 seats after these invites", "(rows)" (m3, m1) |
| D11 Feedback and state | 3 | Busy spinner, toast, form notice, words on the field; a silent loss in M1; focus is dropped (m2) |
| D12 Visual quality | 4 | Team components; the red notice and amber warning stacked (T-1440-after-top.png) |
| D13 Accessibility | 4 | axe clean at 1440/1024/720/400, no sideways scroll, aria-invalid, keyboard path (19 Tabs). Focus and alerts: m2 |
| D14 Team look | 4 | Same controls as PF-6 |
| D15 Speed | 5 | 50 rows in one call: 865 ms with 25 emails |
| D16 Testability | 4 | Each rule has a pass and a fail; no test covers edits in flight |
| D17 | — | Simulated only |
| D18 Provenance | 4 | The server's words name the plan and its seat count |
| D19 E2E closure | 4 | Invite → email → accept → Team active (W6); the downgrade walk needs Stripe (stated in the PR) |
| D20 | — | Simulated only |

## BIC scorecard
This is a staff platform screen, not a case-side one (§6 scope), so only the checks that apply are scored. BIC-01 to 03, 05 to 10, 12, 15, 16 and 17 are N/A (no facts, AI, filing or review).

| Id | Score | Evidence |
|---|---|---|
| BIC-04 | Met | "(optional)" on Name; an empty email is refused at the field ("Give the person's email address.") |
| BIC-11 | Met | One primary button, "Send 2 invitations" (W5-over-the-seats-1440) |
| BIC-13 | Partly | Words on the field, a summary notice at the top, input kept. Focus goes to the panel container, not the first error (m2) |
| BIC-14 | N/A | No new icon or status |
| BIC-18 | Partly | Saving and failed-to-save shown; an edit made mid-save is lost without notice (M1) |
| BIC-19 | Met | One heading and one primary button per panel; red only for errors (T-1024-before.png) |
| BIC-20 | Partly | Keyboard-complete; 1024 and 200 % with no sideways scroll; words such as "comes back marked" (m3) |

UXL (§7): not scored at 1280/375 for this check. At 400 px there is no sideways scroll.

## Issues (ranked)
* **M1 (Major, Must): the form stays editable while the batch is in flight, and the answer is applied to rows changed after Send.**
  * Where: panel:66. `busy` disables only Send; the inputs (:76, :80, :82), Remove (:85) and Add (:90) stay live. Then :53/:56 drop every row whose `n` was sent, and :62 closes the panel.
  * Failing scenario (probe P2b): rows [v4 valid, a staff email] → Send → while it is in flight, change row 1 to v5. Result: row 1 disappears, "1 invitation sent.", v4 is invited and v5 is not, and nothing says so. The invitation went to the address the person was correcting.
  * Second scenario (P2c): one good row → Send → add a row in flight. The panel closes and the new row is thrown away without "Discard the people you typed?".
  * Fix: lock the form while busy (a disabled fieldset), plus a j_20 step that edits in flight.
* **m1 (Should): no 50-row cap in the form (panel:90).**
  * 51 rows → whole-form 422: "Nothing was sent" / "Send 1 to 50 people in one form (rows). Nothing was sent." All rows are kept, so recovery works.
  * Fix: say the cap, or stop at 50 rows. Drop "(rows)" and the repeated "Nothing was sent".
* **m2 (Should): accessibility after a flagged send.**
  * Focus drops to the panel container (P4), because Send was disabled while busy.
  * Every flagged field mounts its own `role="alert"` (controls.tsx:61), so 25 flagged rows announce 26 alerts at once.
  * Fix: focus the first flagged field and let the form notice do the announcing.
* **m3 (Should): seat words.**
  * 0 free: "Every row comes back marked, to send after you free a seat…" is vague, and does not say that Send will invite nobody (panel:25).
  * Over the limit, the seat line reads "55 of 53 seats after these invites" (panel:68), which can no longer happen under P-727.
  * "Fix each row below" (panel:61) is also said to OVER_SEAT_LIMIT rows, which cannot be fixed in the form.
* **m4 (Should): two rules for one stored name.**
  * The screen now refuses 101-120-character names that PF-4dn stored before (batch-invite.ts:37 allows 100; id/service.ts:98 allows 120).
  * The words for an invisible character became less specific (pf4dn test :95).
  * Fix: align nameOf with displayNameOf, or say the limit on the field.
* **m5 (Should): the "stored only there" claim misses the sent email.**
  * The stored copy of the sent email holds the greeting name (see rule 1).
  * pf4c:98-101 checks only the database, against a fake MailPort; the PR body and `api/src/platform/MODULE.rows/R1-20.md` say "nowhere else".
  * Fix: name the email copy in that line, or ask the Lead whether the greeting should stay. It is PF-4c part 1's rule (#2998), not new code.
* **Note (not new here):** the breaker's invisible or overflowing names (braille blank, stacked combining marks; ZWNJ refused) follow the same rule as the single invite.

## What I could not check
A real screen reader · a real 428 arriving mid-send at 479291e (only mocked, plus pf5t on the newer head) · 50 rows with real SES (local adapter only) · the founder's unaided walk (D17, D20) · commits after 479291e.

Verdict: Changes

## Round 2: diff 479291e52..c5845b16efb8156b2c522c046c1d898cb0c0b7f0 (that diff only)
I ran everything on a fresh isolated copy, `rv20` on port 4460, and stopped it afterwards.
* **Tests:** `journeys/j_20.ts rv20 4460` passed 36/36 twice, with no retry.
* **Probes:** Playwright, scratch, with the batch answer held for 8 s.

**M1 is closed.** `<fieldset disabled={busy}>` at invite-panel.tsx:72 locks the form while a send is in flight.
* **Scenario 1 (edit in flight):** typing into Email or Name, Remove, + Add and ticking a role were all refused. v4 was invited and v5 was never typed. The staff row stayed with its words.
* **Scenario 2 (add in flight):** + Add was refused. The panel closed with v6 invited and no typed row lost.
* **Double send:** Enter, Enter, Space on Send invited once.
* **Fails when removed:** j_20 W3 asserts that Email and + Add are disabled while the route is held, so taking the fieldset out fails it.

**The other fixes, checked:**
* **50-row cap (breaker m2, my m1):** at 50 rows, + Add gives way to "50 people is the most in one form. Send these, then invite more." (panel:95-96, j_20 W7). The server still refuses 51 as before.
* **Focus:** after a flagged send, focus goes to the first flagged field (panel:64). This is the Name field when the name is what's flagged (probe: an invisible character in the name). j_20 W1 asserts it, and fails on the old behaviour, where focus went to the panel container.
* **Seat words (my m3):**
  * 0 free now reads "Your plan has no free seat, so Send invites no one now: every row stays here…".
  * Over the limit, the seat line reads "12 of 12 seats used · 2 on this form" (j_20 W5).
  * The notice reads "Each row below says why: fix it, or free a seat, then send again."
* **Email copy (my m5):** the API card row now names the stored copy of the sent email. The PR body still has to drop "nowhere else", as the builder said they would.
* **Accessibility:** axe finds no violations at 1024 and 720 px (200 %), with no sideways scroll and no page errors.

**Left open by choice, accepted as Minor:**
* **m2:** one alert per flagged row. This is PF-6's existing field pattern; focus now lands on the first flagged row.
* **m4:** the 100-character name rule is shared with PF-4c and named in the PR body.

**New Minor (not new code; it behaves the same on main):** the footer's Close button sits outside the fieldset, so it stays live while a send is in flight, and it closes without the discard question (on main too). Closing mid-send still invites the valid rows and shows the toast, but the flagged rows disappear without their reasons.
* Probe: rows [c1, a staff email] → Send → Close. c1 was invited, the toast said "1 invitation sent.", and the staff row was gone.
* Fix later: disable Close while busy, or leave it as it is.

**Round 2 score:**
* **Journey score: 9/10, no 0.** Feedback and state, and error recovery, each go from ½ to 1 (the form locks while sending; focus lands on the first flagged field). Plain words stays at ½ ("marked" is still in the seat words), and so does accessibility (one alert per flagged row).
* **D5** goes from 3 to 4 and **D11** from 3 to 4. BIC-13 and BIC-18 are now Met.

No Blocker or Major is open at c5845b16e.

Verdict: Approve
