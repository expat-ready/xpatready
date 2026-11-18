# PF-18s: lines owed to its brief (My account → Notifications, Advanced → Offices, the "?" button, Help & support) (row owner Lead B / Build Lead A)

PF-18s is **concept first** (BACKLOG row: concept and challenge, breaker yes). This file collects the lines its concept and brief must carry. It is not the brief.

## Owed lines
1. **Placing a staff member in an office** (rev 16.78, #2009 comment 6922123850): PF-18s adds `PUT /api/platform/staff/:staffId/office`, with its pass and fail tests. The service method exists on `main` but has no route.
2. **No double reply in Help & support** (qa on #2064, via Lead 82, 18 Nov 23:40 IST): PF-18b's reply route has no idempotency key, so two identical replies sent at the same moment both land. **Done when:** the reply form guards against a double send the way the complaints screen does (#1998's M1 pattern). The Send button is disabled from the first press until the answer comes back, Enter while sending does nothing, and a failed send re-enables it with the typed text kept. Two tests:
   * **pass:** a double click and a double Enter each make exactly one message (count the rows in the API answer);
   * **fail:** with the guard removed, the same test sees two messages.
   A server-side key is **not** part of PF-18s. If qa later sees duplicates arrive through the screen, that is a new PF-18b row with `Idempotency-Key` on the reply route (PF-21i's pattern).

## Waits on
PF-18a (merged), PF-18b (merged 23:37 IST 18 Nov) and PF-6 (part 2b, #2127, queued). Then the concept and the challenge.
