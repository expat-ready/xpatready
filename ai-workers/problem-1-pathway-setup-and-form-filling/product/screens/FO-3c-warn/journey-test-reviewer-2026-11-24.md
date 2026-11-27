# Journey test: FO-3c-warn (R1.104 warns, never blocks), reviewer role, 24 Nov 2026

Commit: f53b39de6f13984b0f6a84030e614da3c3a3e068.
Copy: isolated `j104r` on :4435 (the runtime ports in WAY-OF-WORKING, never :4400), seeded by j_104 (firm maple104, Sample) and stopped afterwards.
Walk: Playwright headless (Chromium) as a person would use it. I clicked and typed only, then read the database underneath. My script and screenshots are in the session scratchpad (`walk/walk.mts`, `walk-shots/r1…r4`); they are not committed.

## Journeys (persona · goal · expected)
1. **Main path, nothing sent.** Client C (the licensed host) wants to record that the meeting took place and write the record, although no agreement was sent. Booking ended about 70 min ago; 1024 px; keyboard only. Expected: the panel warns with the cause; Attended is saved; the record is saved with the warning.
2. **Sent, unsigned, Attended (j_104 W4).** Client C reads the panel and the record afterwards. Expected: one warning with one true next step. Checked at 1440 px and at 200 % zoom (720 px CSS).
3. **After signing (j_104 W6/W9).** Expected: "Agreement signed" with no warning.
4. **Wrong role.** Client D (Billing, no list key) posts Attended and saves a record by API. Expected: refused, nothing changes.
5. **Recovery.** Reload after saving the record. Expected: the warning is still there.
6. **Boundary.** The money event at Attended. Expected: one `booking.completed`, nothing billed (AG-4-44 unchanged).

## What happened
- **J1.** Before Attended the panel said: "No consultation agreement has been sent for this booking yet. Attended and the consult record can still be saved. None was sent before the meeting started: reschedule the meeting…". I tabbed to Attended and pressed Enter. The booking went to COMPLETED in 222 ms, with no alert and no refusal. I focused Save record and pressed Enter. Then:
  - one `fo_consult_record` row;
  - the notice "Consultation agreement not signed" showed the server's words;
  - axe found 0 problems before and after;
  - no sideways scroll at 1024 px.
  Words wrong after Attended: "Attended and the consult record can still be saved … to meet the client, make a new booking" on a booking that is already Attended (m1).
- **J2.** The panel and the record's notice on the same booking disagree (M1):
  - panel: "Not signed yet. The client signs from the link in their email, then Client C signs. This booking is already marked Attended…";
  - record notice: "…this booking can no longer be signed for or rescheduled: a new booking sends a new agreement".
  The client's link is in fact closed (`consultation-agreement/service.ts:402-403`). Axe found 0 problems at 1440 px, and there was no sideways scroll at 720 px.
- **J3.** j_104 W6/W9 pass: the signed booking shows "Agreement signed" and no `[data-agreement-why]`. W6 signs W5's agreement because W4's booking is Attended and its link is closed, which is evidence for M1.
- **J4.** Client D got 404 on Attended and 404 on the record; the booking stayed Scheduled. j_104 W8 and check_fo3c2 W3 also pass.
- **J5.** The record's warning was still shown after a reload.
- **J6.** `module_event` had `booking.completed` once for the booking. Nothing in `api/src` consumes it for billing.
- **Console.** One 404 from the record's GET before the first save (NO_RECORD, expected). No page errors.

## Break-it pass (15 min)
- **Double press and repeat Attended:** `status === o` returns the same booking and the warning again; nothing is written twice (code `booking/service.ts:454`).
- **Wrong role by URL:** refused (J4).
- **CLIENT_SIGNED then Attended:** the words say it can no longer be signed, yet `hostLink` still signs it, and Needs you drops the item. Major, part of M1. I confirmed this in the code; the break report's X2 reproduces it.
- **Read failure after commit:** a 500 after the save, then STALE_VERSION on retry. Minor (m2), from the code and the break report's X6.
- **Long or non-English text:** not exercised (this change adds no input field).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1/J2: Attended and the record were saved while unsigned. |
| Next step obvious | ½ | Right before Attended; contradictory and partly false after it (J2, M1). |
| Plain words | ½ | No statute, plain words. But "Attended … can still be saved" appears on an Attended booking (J1, m1). |
| Feedback and state | 1 | The pill, the warning that stays, and the notice after save and after reload. |
| Correct data | 1 | One record row, COMPLETED, one outbox event; nothing changed for the wrong role. |
| Error recovery | ½ | Reload holds. A failed read after commit leads to STALE_VERSION on retry (m2). |
| Accessibility and screen sizes | 1 | Axe 0 at 1024 and 1440 px; no sideways scroll at 1024 or 720 px; keyboard reached Attended and Save record. |
| Speed | 1 | The panel opens in 377-416 ms; Attended saves in 222 ms. |
| Visual quality | 1 | Team Notice and Pill in the warn tone (J-104 w4 capture). |
| Trust and sources | 1 | No AI. The record shows the server's words. Rule 7 is met. |
| **Total** | **8.5 / 10** | Passes the score bar (8 or more, no 0). The open Major M1 still blocks the review verdict. |

## Fixes that raise the low criteria, most valuable first
1. Give one set of true words per booking status and agreement status, written on the server and shown by the panel (M1). This raises "next step obvious" and "plain words".
2. Drop "can still be saved" and "reschedule" from the words shown on an Attended booking (m1).
3. Read the warning inside the transaction, or answer null when the read fails (m2).

## Not tested
- A real screen reader, or an intended user's unaided walk (D17 and D20 stay with the founder).
- A visible (headed) browser: I ran headless and used screenshots instead.
- A cancelled booking with an agreement still sent.

## Re-run at 9e97b8aa3 (24 Nov)
- **Same journeys** on `j104r` :4435. j_104 passed 20/20.
- **J2 is fixed:** the panel and the record's notice now read the same true words ("…the client's link no longer opens…").
- **J1:** the words for an Attended booking no longer say what can be saved.
- **Record before its first save:** the server's 404 carries the warning, but the screen drops it (`sales/contract.ts:10` `problemOf`), so no notice shows. The panel still warns (Minor).
- **Score:** feedback and state ½; next step, plain words and error recovery are now 1. **Total 9.5/10: pass.**
