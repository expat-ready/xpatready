# qa capability R1.104 (consultation agreement signed before the first consult), 22 Nov 2026

Run: `/qa capability R1.104` (re-walk check after #2922 FO-3c merged as bc1f39c08) · main bc1f39c08 · isolated copy :4404 (`j104`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · no live mail (the local email adapter; SigningPort's fake). Legal points: Unconfirmed: no counsel.

## Verdict: Fail, so the row moves to Partial (was Not built); four parts missing (QA-750 to QA-753)

Done when: "A booking whose type needs it cannot start until signed; the reminder goes; the signed copy is on the person." #2922 is the agreement service on SigningPort's fake, API only. Its service holds; how bookings reach it, the start gate and the screens are not built.

## j_104, twice on fresh copies of main's head: 11/20, exit 1, same lines
Held:
* W1: a Case Officer signs in on screen, opens Bookings and books a lead two days ahead: "Booked".
* W4 setup and W6, with the agreement sent to the service directly (stand-in): the client signs through the emailed link with consent and the one-time code, then the licensed host; the agreement is sealed and the signed copy is emailed to the client once, attached.
* W5: no reminder an hour before the 24-hour mark (fail-before), and "needs you" lists the unsigned agreement.
* W7 (API): by-person reads "Agreement signed" with the copy's sha256.
* W8: another firm reads 404 (by person and by id), a host without the list key gets 403, and the route answers its own firm.
* W10: the booking panel has no serious axe violation; no page error.

Failed:
* **W2, W5 (running copy): QA-752.** The booking made on screen sends no agreement ("No agreement was sent"), queues no reminder and mails nothing; the booking's hand-off to the service is not wired.
* **W3, W7 (screen): QA-753.** The booking panel says nothing about the agreement, and the person's page neither says "Agreement signed" nor offers the copy.
* **W4 (screen and API), W9: QA-750.** Attended is saved and the consult record accepted while unsigned. The consultation can start, which is the row's first clause.
* **W4b: QA-751.** A Follow-up gets an agreement too; there is no per-type switch.
* **W5 (recipient):** the 24-hour reminder goes to the firm's representative (`consultation-agreement/service.ts:247`), not the client. That is a question for the tech lead, raised on #2945 and in QA-753.

## Journey score: 5 / 10 (no pass)
Task completed 0 · next step obvious ½ · plain words 1 · feedback and state 0 · correct data ½ · error recovery ½ · accessibility and sizes 1 · speed 1 · visual quality ½ · trust and sources 0 (a regulated agreement invisible on screen).

## Could not test
A real e-signature provider (SigningPort's fake only); the client portal; the shared demo :4400 (cloud session); a real screen reader; D17/D20.

## Questions for the tech lead
1. Who builds QA-750 to QA-753? They read as one FO-3c follow-up: the booking hand-off, the start gate on attendance and the consult record, the per-type switch, and the screens.
2. The reminder's recipient: the client (AG-4-15 "the reminders still go") or the firm's representative (as built)?
