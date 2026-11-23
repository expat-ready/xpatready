# Journey test (reviewer): QA-605 web form on/off, PR #2556 at c3a80a138

I did not build this. All runs were on my own isolated copies: :4537 (pack), :4538 (j_26), :4539 (walk and probes). I never used :4400, :4527 or :4426. Live AI was off; cost US$0.

## Journeys (written from QA-605, the concept FO-4 r2 screen 2b "On/off … Owner/Admin" and the tech lead's ruling)
1. **Main.** The Owner of a firm whose form is off opens Sales › Settings › Web form and switches it on. The page says On. Visitors can send.
2. **Alternate.** An Admin switches the form on (API). The Owner switches it off. The hosted page and the send then say "not available".
3. **New firm.** A firm as `firm-seed.ts:118` creates it (off, no consent wording). The Owner presses "Switch the form on".
4. **Error: stale.** Tab A switches the form. Tab B, still open, then presses the switch, or saves sites.
5. **Wrong role.** A Read-only member and a Case Manager try by URL and by API.
6. **Recovery.** Double click on the switch. Reload after a stale notice. A site typed but not saved is kept across a switch.
7. **Keyboard and sizes.** Keyboard only at 1024 px, then 200 % zoom (720 CSS px at scale 2), then 400 px.
8. **Across the boundary (J-26).** The Owner switches on, saves a site and copies the snippet. A visitor sends. The lead lands in Unassigned.

## What held
- **Pack and journey, each run twice:** `check_fo4w_web_form_settings_browser.ts` 45/45 twice. `j_26.ts` 17/17 twice. j_26 switches the form on through the screen; its SQL sets only `enabled = false` plus the wording and thank-you text (j_26.ts:59).
- **J1 (main):** the Owner's switch stores on. One `fo.web_form.enabled_changed` line has detail `{"before": false, "after": true}` and the summary `switched on (was off)`. The pill, the notice and the "Switched on." message all agree (`qa605-02-on-1440`).
- **J2 (alternate):** the Admin gets 200 and the line names the Admin's staff id. While off, `GET /api/public/forms/:token` and `POST …/submissions` both return 404 `FORM_NOT_AVAILABLE`.
- **J4 (stale):** 4 parallel switches with the same version, run 5 times: each round gave 200, 409, 409, 409 and exactly one audit line. A sites save racing a switch on the same version gives one 200 and one 409. The screen's stale notice offers Reload, which shows the newest state.
- **J5 (wrong role):** Read-only gets 403 on read and switch. Case Manager gets 403. Nobody signed in gets 401. The Read-only page shows "Owners and Admins only" with no switch.
- **J6 (recovery):** a double click makes one change (the busy button is disabled). A site typed but not saved survives a switch. Tab B's typed site also survives Reload and then saves.
- **J7 (keyboard and sizes):** at 1024 px, 7 Tabs from the top reach the switch and Space toggles it in 40 ms. axe finds 0 violations in the on and off states. No sideways scroll at 1440, 1024, 720 @2x or 400 px.

## Findings
- **Major: J3, a new firm's switch answers 500.** The table has `CHECK (NOT enabled OR consent_wording_version_id IS NOT NULL)` (migration fo1a, line 932). `saveEnabled` does not check it first (`web-form-settings.ts:128`), so the database refuses the update and the API returns 500. The screen says "Something went wrong on the server. Refresh to see the current state, then try again." That is screenshot `rv-00-newfirm-switch-500` (session scratchpad). Refreshing does not help, and no screen sets the wording yet. Both suites set the wording by SQL first, so neither sees this.
- **Minor: focus is lost after the switch.** The busy button is disabled during the request, so focus falls to `<body>`. After the "Switched on." message, `document.activeElement` is the page body (probe at 1024 px). A keyboard user has to Tab again from the top (`web-form-settings-page.tsx:126`).
- **Minor: the sites stale message is now wrong.** After another tab switches the form, a sites save says "Someone else changed this form's sites since you opened it" (`web-form-settings.ts:98`). Only on/off changed.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1, J2 and J8 pass. J3: the new firm's own path ends in 500 |
| Next step obvious | 1 | The one primary button "Switch the form on" sits under "On or off" with a sentence on its effect |
| Plain words | 1 | "Switched off. Visitors now see "This form is not available"." (m3's sites wording aside) |
| Feedback and state | 1 | Pill, warn notice, success notice and busy state all agree (`qa605-01`, `qa605-02`) |
| Correct data | 1 | One line per change, before/after, actor. The race gives one winner. A same-state call changes nothing |
| Error recovery | ½ | Stale → Reload works. The new firm's 500 gives no way forward |
| Accessibility and screen sizes | ½ | axe 0. 1024, 200 % and 400 px fine. Focus is lost after the switch |
| Speed | 1 | Switch round trip 40 ms at 1024 px |
| Visual quality | 1 | Team controls and tokens, aligned with the existing page |
| Trust and sources | 1 | No AI. The audit line names who and what changed |
| **Total** | **8.5 / 10** | Pass (8 or more, no 0), but the Major is open |

**To raise the score, most valuable first:**
1. Refuse "on" without consent wording in plain words (422 on `enabled`), shown on the screen.
2. Keep focus on the switch after it answers.
3. Make the STALE words for sites say "this form".

**Could not test:** a real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).

## Re-run at 1a571ee7b (20 Nov)
- **Suites:** pack 47/47 twice; j_26 17/17 twice. All on my own copies (:4537, :4538); my probe on :4539.
- **J3 (new firm):** the press now shows "This form cannot be switched on yet: it has no consent wording for visitors to agree to…". The form stays off, nothing is written, and there is no 500.
- **J7 (keyboard):** focus stays on the switch after Space.
- **J4 (stale):** the sites STALE words now say "this form". The send while off is tested in both suites.
- **Score: 9.5 / 10.** "Error recovery" and "accessibility and screen sizes" are now 1. "Task completed" stays ½ until the wording part exists. Pass.
- **Remaining Minor (m4):** the switch is still offered on a form with no wording; it refuses only after the press.
