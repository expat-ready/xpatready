# PF-21rs A2: journey test (reviewer), 24 Nov

**Commit:** `074eaaae3afd0041a7b41b50d86e87c97e08507d` (local branch `local/pf21rs-a2`; diff `ed99467dd..074eaaa`).
**Setup:**
* Isolated copy `rsrev` on :4437 with AI_LIVE=off, PLATFORM_IDENTITY=local and PLATFORM_SYSTEM_IDENTITY=local; j_86 ran on its own copy `j86` on :4436. US$0.
* Playwright Chromium (headless; no visible pane in this cloud session) at 1440, 1024, 1024 at 200 % and 400 px, with the browser zone set to IST.
* Sample firms seeded by SQL for this run: alpha (Owner and Admin), beta, gamma, one with nobody to notify, and one with a long Arabic name.
* Scripts and screenshots are in the session scratchpad.

**Score: 8.5 / 10. Pass** (8 or more, and no criterion at 0). The review still blocks on its one Major (axe in the "Words sent" state, `review.md` issue 1).

## Journeys (from concept §4-§5, row W4-W6, j_86 W6)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Platform Owner: "log the exposed link and tell both firms" | Card sign-in → Record a breach naming alpha and beta → the page → Decide (Notify, why, reason) → Send to alpha → Send to beta | Page opens with "Recorded. Next: …"; one notice each; no send left; Recorded | Held. Record → page 220-320 ms; send 90 ms. DB: 2 notices, 2 outbox rows for alpha; the words shown equal the API's; History has 5 lines with names |
| J2 keyboard | PO, no mouse | Tab to Decide → Enter → radio Space → Why → reason → Enter; Tab to "Send notice to alpha" → Enter → reason → Enter; Enter on "Words sent" | Done with no mouse; focus returns | Held. Focus returns to Decide or "Change the decision" and to "Notices to firms". **Partly:** after an empty reason the focus is on the dialog box, not the field (issue 5) |
| J3 two tabs | PO in two tabs | Tab 2 is opened before tab 1 sends beta; tab 2 then sends beta | 409 words on beta's row; one notice | Held. "This firm was already sent this breach's notice; nothing was sent again." on the row, reloaded; DB 1 |
| J4 stale change | PO with an old tab | Change the decision after a notice went out; remove a notified firm in Edit | API refusal; page refreshed | Words shown for DECISION_KEPT and NOTIFIED_FIRM_KEPT. **Partly:** the Decide close does not reload (issue 2) |
| J5 edit | PO adds the root cause, then clears it; saves with no change | Edit → Save | Only the change stored; "Change at least one field." | Held. root_cause stored, then NULL; a category toggled back sends nothing |
| J6 error | PO sends to a firm with no Owner or Admin | Send | NO_RECIPIENTS words on its row; stays Notices owed | Held |
| J7 words | PO, after the stored message was changed | Open the page | R0's note, never re-rendered words | Held ("The words sent could not be read back…") |
| J8 wrong role | Auditor, Support, firm Owner, by URL | Open the page | Auditor reads with no change button; Support sees 403 words; firm sees the card | Held. Auditor's API send 403; firm token's API read 403 |
| J9 draft | PO confirms a draft from an alert | Confirm the record | Asks for the firms' description | **Partly:** the box is pre-filled with the internal alert words and accepted unchanged (issue 4) |
| J10 boundary | PO back to the list; j_86 W6 | List row → page by keyboard → Back | Row reads 2 of 2 sent, Recorded | Held; j_86 27/28 (W10 is R1.87's) |

## Automated replay
* `check_pf21rs_browser.ts`: 37/37, run twice.
* `j_86`: 27/28.
* My walk:
  * axe 0 serious on the page with the words closed, on the Edit dialog at 1024, for the Auditor and for Support;
  * with "Words sent" open, `scrollable-region-focusable` is serious at 1024 and 400 even on the check's own short W4 notice (`breach-page.tsx:59`);
  * no page errors (only the expected 409/403 resource lines).

## Break-it pass (15 min)
* **Long text:** Arabic plus a 1,000-character description wraps in What happened and in the words box. A 108-character unbroken firm name overflows History, giving a 426 px sideways page scroll at 400 (issue 3).
* **Double send:** guarded in the browser by `busy` and on the server by the lock. The second tab proves the 409.
* **Ids:** an unknown id and a non-uuid id both give "No such breach." with no Retry.
* **Reload:** reload keeps `?recorded=1`, so the "Recorded…" line shows again (cosmetic).
* **Blockers found:** none. **Majors found:** issue 1.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: decide and two sends, stored once each (DB) |
| Next step obvious | 1 | Header names one next step per status; one filled button |
| Plain words | 1 | §5 copy exact; one bracket typo (issue 8) |
| Feedback and state | ½ | Done lines and row errors; arrival after recording not announced, focus on `<body>` (issue 5) |
| Correct data | 1 | Words equal the API's; times equal `plat_breach_notice`; PATCH carries only changes |
| Error recovery | ½ | 409s land on the row; a stale Decide leaves the page stale; focus is not on the refused field |
| Accessibility and sizes | ½ | Keyboard path works; axe serious with the words open; History overflows with long names |
| Speed | 1 | Open 180-230 ms; send 90 ms |
| Visual quality | 1 | Matches board §3 (walk `07-main-1440x1.png`) |
| Trust and sources | 1 | Words from the store, R0's note when unreadable; "Sample … Unconfirmed: no counsel" |

**Raising the ½s, most valuable first:**
1. A name and focusability for the words box, with axe run with the words open.
2. Reload after a refused Decide.
3. Focus the `h1` on arrival and the refused field after a refusal.
4. Wrap History.

**Not tested:**
* A real screen reader.
* Safari or Firefox.
* A visible headed browser.
* An intended user's unaided walk (D17/D20 stay with the founder).
* A 200-firm breach.
