# Journey test (reviewer): FO-5s part 3a, the Withdraw and Signed offline panels (R1.55 W1, W4)

Commit e1418b1d2e7778b2d5ed8e5f77a65242bcd8ebaa (PR #3679, draft). Isolated copy `rv_fo5s3` on :4566 (PLATFORM_IDENTITY=local), never :4400. Chromium (Playwright, headless; no headed pane in this cloud session), mostly at 1440×900. Every name and value is Sample. Concept r2 §3 BR-10, BR-11; §4 S5, S6; §5.

## Journeys (written from the concept before walking)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Owner / Case Manager: "the client changed plans, stop the agreement" | prospect page → Open the retainer → Withdraw → read → reason → Withdraw retainer → back to the prospect | Withdrawn, the reason kept, focus on the page, Prepare retainer back on the prospect | **Held.** 142 ms; one `retainer.withdrawn` audit line; focus on H1; card "The last retainer was withdrawn. Open it · Prepare retainer". The signing request is still `SENT` (needs #3648) |
| J2 alt | Case Manager: "they signed at the office" (from a Draft) | Signed offline by keyboard: file → Tab → reason → Tab Tab → Enter | Signed on paper; prospect Won (SIGNED_OFFLINE) once; no email | **Held.** Focus opened on the file input; one audit line "Signed on paper; the prospect is won". No link on the page to the filed PDF |
| J3 alt | the paper is version 1; version 2 was sent since | Signed offline → Version signed = Version 1 | v1 filed as a copy (v3); v2 "Not signed" | **Held.** Versions read "Copied from version 1, signed on paper" / "Not signed" / "filed as version 3" |
| J4 error | Client signed v2 electronically; staff pick v1 | Version signed = 1 → Record | refused in words | Refused in the server's words. The UI offered a choice that cannot succeed (m2) |
| J5 error | bad input | 11 MB PDF; 260-character Arabic and Chinese reason; double-click Withdraw retainer | refused at the field; cut at 200; one action | **Held.** "At most 10 MB." on the field with focus; 200 characters stored whole; one audit line after the double click |
| J6 wrong role | Case Officer (has send, not void or offline-sign) | open a sent retainer; POST withdraw by API | no buttons; 403 | **Held.** Neither button; 403 "…(agent/retainer:void)" |
| J7 recovery | two tabs; Escape | tab B withdraws while tab A has Signed offline open; Escape after typing | refused, re-read; Escape keeps nothing | Refused ("A withdrawn agreement cannot be recorded as signed."), page re-read to Withdrawn, but the confirm stays active (m4). Escape discards typed text without asking (m7) |
| K recovery | a colleague saves version 2 while Signed offline is open | Record | 409 explained, input kept | **Failed (Major).** Message, file and reason all cleared; "Version 2 (current)" (unsent draft) pre-selected; nothing says why |
| J8 sizes | 1024 px and 1024 at 200 % (512 CSS px) | actions and panel | reachable, no sideways scroll | **Held.** Sideways 0; confirm visible; buttons at y 859 at 1024×768, below the fold (m1) |
| J9 boundary | Withdrawn → next screen | the prospect card | Prepare retainer | **Held** (J1) |

## What held
Concept §5 copy word for word. Confirm buttons name the action (BIC-09, BIC-11). Keys per AG-05 C5, enforced on the server. axe WCAG 2.2 AA clean on both panels, their error states, and the Withdrawn and Signed on paper pages. The builder's check is 21/21, exit 0.

## Data underneath (DB read after each journey)
J1: `fo_retainer.status` WITHDRAWN, `withdrawn_reason` exact, 1 audit line; `fo_signature_request` still SENT (QA-770, #3648). J2: SIGNED_OFFLINE, sha256 and reason stored, `fo_prospect` WON / SIGNED_OFFLINE. J3: versions `1:UPDATED, 2:UPDATED, 3:SIGNED_OFFLINE`. J5: 1 audit line, 200 characters. J6: nothing changed.

## Findings (file:line in `review-part3a.md` §4)
* **Major M1:** after a stale 409, Signed offline drops the person's work and switches the version (`end-panels.tsx:69`).
* Minor m1: action placement (`retainer-page.tsx:233-238`). m2: version choice on Client signed (`end-panels.tsx:98`). m3: no link to the filed PDF and no reason shown. m4: confirm stays active after a 409. m5: duplicate multipart helper. m6: "request ended" check named but not asserted (`check_fo5s3_end_panels_browser.ts:128-130`). m7: Escape discards without asking.
* Condition: the Withdraw sentence and toast are true only once #3648 merges.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | J1, J2, J3 end to end through screens |
| next step obvious | ½ | actions under the Code panel, near or below the fold (J8; m1) |
| plain words | 1 | §5 copy; server refusals in words. One action has three names (note for the Lead) |
| feedback and state | ½ | toast, chip and focus are good; K loses its message; J7 keeps a dead confirm |
| correct data | ½ | J1-J6 stored exactly; K pre-selects the colleague's unsent version for filing |
| error recovery | ½ | field errors keep input (J5); K wipes the file and the reason |
| accessibility and screen sizes | 1 | axe clean; keyboard both panels; 375 / 512 / 1024 / 1440 |
| speed | 1 | 142 ms to the chip |
| visual quality | 1 | team look; one primary; red only on the destructive action and errors |
| trust and sources | ½ | audit lines and sha256 kept, but the filed PDF and the reasons cannot be seen on the page (m3) |
| **Total** | **7.5 / 10: fail** | no criterion at 0 |

**To reach 8+, most valuable first:** fix M1 (feedback, data and recovery move to 1, giving 9). Then m1 (next step). Then m3 (trust).

## Could not test
A real screen reader. A headed, visible browser pane (headless, with screenshots at each decision point instead). An intended user's unaided walk (D17, D20: the founder's). The withdraw email and the request cancel until #3648 merges.

## Round 2 (head ace1e1b5f3f7bb5778e737cfa612b4916586bf35, copy `rv2_fo5s3` on :4568)
Re-walked the journeys round 1 failed or flagged, in headless Chromium at 1440×900, starting from the prospect page. The builder's check ran twice: 23/23, exit 0, no page error.
| # | Journey | Result |
|---|---|---|
| K1 | B1 exactly: v1 Sent, PDF and reason, a colleague's edit makes v2, Record | **Held.** The server's words, the stale notice, the file and the reason all kept; Record off; forced click and Enter sent 0 requests; DB `DRAFT v2` |
| K2 | v1 and v2 sent, Version 1 picked, a colleague makes v3 | **Held.** Pick stays 1; 409 in words; Record off; nothing filed |
| K3 | Signed offline with typed work, success | **Held.** Closed with no prompt; toast "… is now a client."; `SIGNED_OFFLINE v1` |
| K4 | Withdraw, a colleague edits meanwhile | **Held.** 409 in words, reason kept, the button off, "Version 1, sent to …" |
| J7 | Escape / Cancel on a dirty panel | **Held.** Escape asks "Discard the file and reason you entered?" (dismiss keeps it); Cancel closes at once, focus on the opener |
| J4 | Client signed, v1 and v2 sent | **Held.** No version pick offered |
| K5 | Escape while the request runs, a colleague withdrew first | Closed without asking; the 409 shown nowhere; focus on BODY (r2-m4, Minor) |

## Round 2 score
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | J1-J3 as round 1; K3 |
| next step obvious | ½ | actions still under the Code panel (m1, accepted for later) |
| plain words | 1 | consultation copy fixed; stale notice plain. "This retainer … a colleague" on consultation agreements is a small wording point (r2-m3) |
| feedback and state | 1 | K1, K2, K4: the server's words plus the stale notice, the button off |
| correct data | 1 | K1, K2: nothing filed on a stale panel; K6 hides the choices that cannot succeed |
| error recovery | 1 | file, reason and pick kept after a 409; focus on the server's field |
| accessibility and screen sizes | 1 | check: axe clean, 375 / 1024 / 1440, no sideways scroll |
| speed | 1 | unchanged |
| visual quality | 1 | one warn and one danger notice, one primary (`fo5s3-offline-stale-1440.png`) |
| trust and sources | ½ | the paper file and the reasons are still not on the page (m3, part 3b) |
| **Total** | **9 / 10: pass** | no criterion at 0 |
To reach 10: m1 (placement), then m3 (the paper file and the reason on the page). Could not test: a real screen reader, a headed pane, an intended user's unaided walk, the #3648 email.

## Round 3 (head ed7d9d8441113572fd5ba040b6bf7601a11b4ad3, local merge with main for QA-770, copy `rv3_fo5s3` on :4569)
Re-walked only what the diff touches, in headless Chromium at 1440×900, with requests delayed or held. The builder's check ran twice on the merge: 23/23, exit 0, no page error. A mutation run (no toast, no danger Notice) gave 21/23.
| # | Journey | Result |
|---|---|---|
| K1 | Withdraw, then Escape, X and overlay while the request runs (3 s) | **Held.** The panel stays open with 0 prompts, closes on success, `WITHDRAWN` |
| K2 | A colleague withdrew first, then Escape during my request | **Held.** The panel stays open: the stale notice ("This retainer changed meanwhile (it was saved, sent, signed or ended elsewhere) …"), the server's 409, the confirm off |
| K3 | Cancel while the request runs (a colleague withdrew first) | Cancel closes at once, focus on "Withdraw". The late 409 is shown nowhere and focus falls to BODY after the re-read (r3-m1, Minor) |
| K4 | The request never returns | Not stuck: Cancel closes. On reopening, the confirm is busy and Escape is inert, and the late answer closes the reopened panel and drops its typed reason (r3-m1, Minor) |
| K5 | Signed offline, Escape during the upload | **Held.** Stays open, 0 prompts, `SIGNED_OFFLINE` |
| J1 | Withdraw by keyboard (the check) | **Held.** `CANCELLED:WITHDRAWN`, one "Agreement withdrawn" email |

## Round 3 score
Same as round 2 (**9 / 10: pass**, no criterion at 0). The round-2 note on plain words (r2-m3) is fixed. Feedback and state stay at 1: r3-m1 is an edge case, a hung request or a Cancel mid-request. Still ½: next step obvious (m1) and trust and sources (m3). The #3648 email is now tested. Could not test: a real screen reader, a headed pane, an intended user's unaided walk.
