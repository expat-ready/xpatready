# FO-5cr journey test (reviewer role), 2026-11-24

Commit a894ca308d9450aaf067920f10580d70c0659bad (PR #3424). **This run is simulated.** The caller asked for no isolated copy and no browser suite, and no app was listening on the builder's ports. Each journey below was walked through the code path, the service test (`tests/check_fo5cr_consult_prefill.ts`, 19/19), the FO-5 suite (248/248), and the builder's 1440 px screenshots `screens/fo-5cr/screenshots/fo5cr-1..5` (head 77b767fd8, which adds only images). No step was clicked by me.

## Journeys (persona: the host, a licensed representative with `agent/retainer:draft`)
1. **Main path, a prospect.** "I've done the consult; start the retainer without retyping." Steps: Attended booking → Save record (items Work permit; CAD 3,500) → Prepare retainer → the panel opens by itself → Prepare retainer. Expected: a draft whose first fee row is "Quoted at the consultation: Work permit", CAD 3,500.00, not sent. **Held.** d1 in the test, fo5cr-2 (the panel says the row comes from the record) and fo5cr-3 (row, amount 3500.00, total CAD 3,500.00, Draft, Not sent).
2. **Alternate, a lead.** Engage and prepare retainer → Engage box → Engage as Individual → the prospect's panel → the draft. **Held.** d4, fo5cr-4 and fo5cr-5 ("Quoted at the consultation: Translation", 1200.00).
3. **Alternate, a USD quote.** Expected: items filled, amount empty, told to enter CAD. **Held on the server** (d7, and no CAD amount stored). On screen it is a 4.5 s info toast that is not repeated on the retainer page (review m2).
4. **Empty record** (no items, no fee). Expected: "Deposit on signing" and no notice. **Held** (unit case).
5. **Error, a foreign or unknown id in the URL.** Expected: an empty row, the one neutral notice, nothing of the record. **Held** (d2, d3, d5, d6 identical). The panel sentence promises a fill first (review n1).
6. **Wrong role** (no draft key, or a retainer already live). Expected: no dead end. **Held by the code:** `retainer-card.tsx:47` shows a toast for each case, and the buttons are hidden without the key (server `nextStepsFor`).
7. **Recovery.** Reload after arrival: the param is gone (`replace`), so the panel does not reopen. Back goes to the booking. Double submit: the one-live rule (FO-5 suite). Cancel Engage: no prospect (fo3st1 C4).
8. **Across the boundary.** The draft opens on FO-5's retainer page, ready to check. Nothing is sent (d1: DRAFT, v1, `sentAt` null).

## Data underneath
Test d1: one retainer, version 1, the audit line `retainer.drafted` with `consultRecordId`. The refused calls (p9) write no retainer. The USD draft has no non-null amount. A foreign id is not in the audit (d2).

## Break it
A list longer than 120 units is cut at a whole character with "…" and is accepted by the DB (p8: 20 × "é"×60+emoji). A malformed id gives 422 on the field. An id together with fees gives 422. Another prospect's record in the same firm fills nothing. Not tried live: two tabs at once, or 200% zoom.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Server proven (d1, d4) and screenshots fo5cr-3/5. Not walked by me, and no regression test of the screen path (review M1) |
| Next step obvious | 1 | The panel opens by itself, with a sentence saying where the row comes from (fo5cr-2) |
| Plain words | 1 | "Quoted at the consultation"; "No consultation record to fill in from, so the fee row starts empty." |
| Feedback and state | ½ | The action-needed USD notice is a short-lived toast lost on navigation (m2); the panel promises before it knows (n1) |
| Correct data | 1 | 19/19 and 248/248; CAD only; nothing converted; the audit names the record |
| Error recovery | 1 | Every miss gives the default row and a neutral notice; refusals keep nothing; no dead end |
| Accessibility and screen sizes | ½ | Team panel and fields, but no keyboard, 1024 px, 200% or axe run on the new state |
| Speed | 1 | One read by primary key per draft; no request per row (`service.ts:480`) |
| Visual quality | ½ | Only the builder's 1440 px shots look right; no 1024 or 400 px |
| Trust and sources | 1 | The row label names its source (MS-D18(4)); no AI |

**Score: 8/10, no 0: pass (simulated).** Fixes that raise the low criteria, most valuable first: (1) a browser assertion and axe on the pre-filled panel and draft (M1: task completed, accessibility); (2) the warnings kept on the retainer page (m2: feedback and state); (3) shots at 1024 and 400 px (visual quality).

Not tested: a real screen reader, keyboard-only and zoom in a live browser, and an intended user's unaided walk (D17, D20 stay with the founder).
