# R1.40 — fresh reader's verdict (qa 12, 20 Nov; read only, ran nothing, P-303)

Read: the two walks.yml line files (runs 44730270454 / 44730281016, main e2f2e9ad0), j38-local-a/-b.log, `tests/journeys/j_38.ts`, git diff of a6597ab64..1b4727fa0 on j_38.ts, BUGS QA-570 / QA-522, CAPABILITIES R1.40.

**Lines.** Both GitHub runs 34/34 PASS, no FAIL line, the same 34 line ids in the same order; both local runs 34/34.

1. **Clauses shown.**
   - "Each booking and change sends an .ics with the same time": W4 (booker's mail, host's mail and Add to calendar each one event at 2026-11-23T15:00Z for 30 min, same UID; mailed invite equals the download) for the booking; W7 (both inboxes get METHOD:REQUEST at the new DTSTART 16:00Z, mails name the new time in each zone) for the change.
   - "An update replaces the event (same UID)": W7, same UID and SEQUENCE 0 -> 1, both booker and host.
   - "A cancel removes it": W8, METHOD:CANCEL, STATUS:CANCELLED, same UID, SEQUENCE 1 -> 2, both inboxes.
   Caveat (not blocking): the change and cancel are made by staff; the booker's own Reschedule/Cancel (W5 opens the page) is not walked. The Done-when names no actor.
2. **DW1 change is sound.** It is the only assertion change in the diff (rest is header/comment). It still demands exactly two outbox rows, `providerId` `local:`, the exact idempotency key per booking/sequence/recipient, and one mail in each demo inbox; it refuses QUEUED, FAILED, BOUNCED. DELIVERED follows SENT on the local adapter's Delivery event, so accepting it hides no defect.
3. **Verdict: Works** — every clause is shown by J-38 green on main's head on GitHub's runners twice, plus two independent local runs (P-606 (2), P-339).
4. **Close QA-570** (DW1 green on e2f2e9ad0) **and QA-522** (J-38 now walks reschedule W7 and cancel W8).
