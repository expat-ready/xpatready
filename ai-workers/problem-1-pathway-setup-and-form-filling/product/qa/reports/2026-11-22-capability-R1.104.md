# qa capability R1.104 (consultation agreement signed before the first consult), 22 Nov 2026

Run: `/qa capability R1.104` (re-walk check after #2922 FO-3c merged as bc1f39c08) · main bc1f39c08 · isolated copy :4404 (`j104`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · no live mail (the local email adapter; SigningPort's fake). Legal points: Unconfirmed: no counsel.

## Status: Partial (was Not built); parts missing FO-6, FO-5s and J-104; no verdict (P-606)

J-104 joins FO-3c, FO-6 and FO-5s (BACKLOG J-104). Only FO-3c has merged, so the row gets no verdict yet. This walk shows what the merged part does, and two findings in merged code.

Done when: "A booking whose type needs it cannot start until signed; the reminder goes; the signed copy is on the person."

## j_104 on main's head
* Twice: 11/20, exit 1, same lines.
* Then once more: 12/20, after W5 was set to judge the host as the reminder's recipient. FO-3c's row reads: "the host gets one 'needs you' item and the reminder 24 h before the meeting while it is unsigned". qa had first expected the client; the independent review corrected it.

Held, on FO-3c's service (called directly, as J-104 will wire it):
* the client signs through the emailed link with consent and the one-time code, then the licensed host;
* the agreement is sealed and the signed copy is emailed to the client once, attached;
* by-person reads "Agreement signed" with the copy's sha256;
* the 24-hour reminder goes to the host once, and none goes an hour before;
* "needs you" lists the unsigned agreement;
* firm B reads 404, and a host without the list key gets 403.

Red, by missing part:
* **J-104's hand-off (W2, W5 running copy):** a booking made in the app reaches no agreement and queues no reminder; `features/front-office-consultation-agreement.ts:3-5` says it is not wired.
* **FO-5s (W3, W7 screen):** nothing about the agreement shows on the booking panel or the person's page.

Red in merged code:
* **QA-750 (W4, W9):** Attended and the consult record are accepted while the agreement is unsigned, so the consultation can start. No listed part names this gate, so it has no owner yet.
* **QA-751 (W4b):** a Follow-up gets the agreement too; there is no per-type switch.

## Could not test
A real e-signature provider; the client portal; the shared demo :4400 (cloud session); a real screen reader; D17/D20.

## Questions for the tech lead
1. QA-750 (the start gate on attendance and the consult record) belongs to no listed part of J-104. Which row builds it: an FO-3c follow-up, or J-104?
