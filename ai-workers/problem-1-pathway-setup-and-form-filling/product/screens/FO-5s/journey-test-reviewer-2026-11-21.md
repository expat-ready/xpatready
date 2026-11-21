# FO-5s part 1 journey test (reviewer, 21 Nov 2026)

Commit 95ff4d2d97f3961006782387d49ac1dbea291659 (PR #2802). Isolated copies only: rev_fo5s :4571 (walk and browser check), j53r :4572 (J-53). Playwright Chromium, headless, with screenshots read by the reviewer (no headed pane in this environment). US$0. Scope: S2, S3/S5, S4 (S1, S6, S7 deferred by the brief).

## Journeys (written from concept r2 before walking)
1. **Main, Representative (Owner + Case Manager), Individual:** "Prepare Ana's retainer, add the deposit, send it" → card → Prepare → fee → Save v2 → Check and send → Send.
2. **Alternate: edit after sending:** "the fee changed after I sent it" → Edit → Save v3 (v2 stays as sent) → send again.
3. **Empty:** the prospect has no retainer → "No retainer yet." + Prepare. No template / no licensed person → notices.
4. **Error: Corporate with no signatory:** "prepare for the company" → choose who signs → send.
5. **Error: client with no email (case officer, not licensed):** representative not pre-selected → choose → fix the email blocker.
6. **Wrong role:** read-only person and case officer by URL; malformed id.
7. **Recovery:** two tabs saving the same draft; double click on Send; reload.
8. **Boundary:** the card after Send ("Waiting for …"), after Withdrawn (Prepare comes back), signed (no Edit).
9. **Long text:** 110-character name at 1024 px and 200 % zoom (720 and 512 CSS px).

## What held
* J1 and J2 end to end, also keyboard-only (14 Tabs to Prepare; focus opens on Template; Enter in the amount field saves). DB: v1 has no amount, v2 CAD 1,500.00 sent, v3 Draft, v2 `end_reason UPDATED`; the sent version is unchanged.
* J3: "No retainer yet." / Prepare; the empty template submit gives the field error "Choose the template."
* J5: case officer is not pre-selected, gets the field error "Choose the representative.", and the draft is made.
* J6: READ_ONLY sees no Prepare, Edit or Download; malformed id gives "Retainer not found" with Back to Pipeline; API 404/422 for an unknown or malformed prospect.
* J7: stale tab told "This agreement has a newer version (3) than the one you saw (2). Open it again."; double click on "Send to …" sent once.
* J8: Sent card "Waiting for … to sign."; after Withdraw "The last retainer was withdrawn. Open it · Prepare retainer"; signed page shows no Edit.
* J9: long name wraps, no sideways scroll at 375/1024/1440 and at 200 %; axe-core clean on every state the builder's check covers (I re-ran it).
* Suites: browser check 31/31 on a fresh copy; J-53 20/20.

## Findings
* **Blocker for the journey (review M1):** J4 cannot finish. Corporate prospect, OTHER contact only → the draft says "This company has no signatory contact. Pick who signs from its contacts." but there is no picker anywhere. Check and send focuses "Choose who signs.", and the link goes nowhere. Evidence: `A3-corp-blocked` (reviewer scratch), `retainer-page.tsx:103`, `retainer-card.tsx:25`.
* **Major (review M2):** J5 "The signer needs an email." has no fix and no focus target. The same panel says Signer's email is "missing … You can send without it". `retainer-page.tsx:23,150,154`.
* Minor: Back and crumbs go to Pipeline, not the prospect (m1). Tooltips are hover-only (m2). No source per value (m3). Typed fee lost after a stale-save refetch (m5). Focus on BODY after Prepare (m9). The browser check fails when re-run on the same database (m6).

## Score (QUALITY "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1, J2 done; J4 cannot be completed |
| Next step obvious | ½ | One primary per panel; the signer blockers give no next step |
| Plain words | ½ | Plain and short. "You can send without it" on values that block |
| Feedback and state | 1 | Toasts per version, busy Send, conflict and identity notices, status chip + version |
| Correct data | 1 | DB matches each step; sent version unchanged; one send on double click |
| Error recovery | ½ | Fee errors on field + summary; stale save loses typed value; signer errors dead-end |
| Accessibility and screen sizes | ½ | Keyboard path, axe clean, 200 % ok; tooltips not keyboard-reachable; focus lost after navigation |
| Speed | 1 | Card and page each one request; Prepare → page under 1 s on the copy |
| Visual quality | 1 | Team components, calm two columns, one heading per panel |
| Trust and sources | ½ | Code line with "current to" and Unconfirmed: no counsel; values carry no source, versions no author |
| **Total** | **7/10** | **Fail** (below 8; no criterion at 0) |

Fixes that would raise it, most valuable first: (1) Signer choice on S3 for Corporate (task, next step, recovery). (2) Signer errors on the field with a link to the record, and blocking keys not shown as "missing". (3) Team Tooltip on chips and "missing", and focus on the h1 after navigation. (4) Source per value in Check before sending. (5) Keep typed rows on a 409.

## Could not test
A real screen reader. A headed, person-paced walk (headless with screenshots instead). An intended user's unaided walk (D17/D20 stay with the founder). States only FO-6 reaches (Client signed, Declined, Signed e-signature). The client email (FO-6 not on main).

## Re-test at c20dae7 (21 Nov 2026, the fixed journeys only)
Fresh copies :4571 and :4572. J4 (Corporate) and J5 (no email) walked again through the card. Browser check 40/40 ×2, J-53 20/20 ×2.
* **J4 now completes:** Who signs lists the company's contacts → the no-email contact gives "The signer needs an email." → the contact with an email clears it → Sent v3. Keyboard: Check and send focuses the summary, and Enter on a link focuses its field.
* **J5:** the blocker sits on the Signer row with "Add it on Olu Noemail's record". The link opens the prospect page, which cannot add an email (no person edit on main; review n2). This screen-external gap is why J5 stays unfinished.
* After a Save, every contact in Who signs reads "no email" until reload (review n1).

| Criterion | Was | Now | Why |
|---|---|---|---|
| Task completed | ½ | 1 | J1, J2, J4 complete; J5 blocked outside this row (n2) |
| Next step obvious | ½ | 1 | Every blocker has a field and a focus target |
| Plain words | ½ | 1 | "blocks Send" replaces the contradictory "You can send without it" |
| Feedback and state | 1 | 1 | Also: "Version n is not sent yet" notice after Edit |
| Correct data | 1 | ½ | DB right; the Who signs list says "no email" wrongly after a save (n1) |
| Error recovery | ½ | ½ | 409 reloads but replaces typed values; email fix link leads nowhere (n2) |
| Accessibility and screen sizes | ½ | ½ | Field focus fixed; tooltips hover-only (deferred), focus on BODY after Prepare |
| Speed | 1 | 1 | Unchanged; one request per view |
| Visual quality | 1 | 1 | Long labels wrap |
| Trust and sources | ½ | ½ | No source per value (m3) |
| **Total** | 7 | **8/10** | **Pass** (no criterion at 0) |
