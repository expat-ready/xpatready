# PF-21d part 1a journey test: the "Data erasure" switch (reviewer, 23 Nov 2026)

Head **43e53cec91c11cd2d5d1ad1a063eacfad9749a7e** (PR #3234). This is an API and schema item with no screen: the console page is PF-21rs. So the "walk" was the HTTP calls a console page would make, against the suite's own Nest app on a random local port (never :4400). I used a throw-away copy of `check_pf21d_switch.ts` with extra calls, then read `plat_switch`, `plat_switch_event` and `plat_system_audit` underneath. There was no browser, axe or width pass: no page exists.

## Journeys (persona: the Platform Owner unless stated)
1. **Main: emergency stop.** "Stop erasure now while a module is checked." The Owner lists the switches and gets 200 with "Data erasure" on. A POST `{on:false, reason}` gets 200, the switch is off, `changedBy` = the staff id, one event `is_on=false` with the reason, and one ALLOWED line carrying the reason, `switch` and `on`. `PlatSwitches.isOn` then reads off (the hand-over to 1b's job).
2. **Alternate: back on.** The second change gets 200: events read `false,true` and the switch reads on.
3. **Error: no reason.** 422 SWITCH_FIELDS with `fields.reason` "Give the reason." Nothing is written except one REFUSED line. (The brief's test list says 400; review m1.)
4. **Wrong role.** Support, Admin and Auditor each get 403 MISSING_PERMISSION and one REFUSED line each. Support's GET also gets 403. No token gets 401. A firm's token gets 403 (system plane wall). At the database, a firm session calling either definer is refused.
5. **Recovery: double click and repeat.** Four parallel "off" calls give one 200, three 409 SAME_STATE and exactly one event. A repeat "off" gets 409 "The switch is already off; nothing was changed."
6. **Unknown switch.** `platform.nothing` gets 404 NOT_FOUND, and `isOn("platform.nothing")` throws. It is never a silent on or off.
7. **Hostile input.**
   - Refused with 422: a U+202E bidi mark, an extra field, `"false"` as a string, an array body, and a reason over 500 characters.
   - A 5,000-character key: 404.
   - **A reason of `!!!`: 200 and saved, but the trail line's reason is NULL** (review m1).
8. **Data underneath.** Each change gives one event and one ALLOWED line in the same transaction. Refusals write no event. The `changedBy`/`changedAt` pair is set together. Owner DELETE, TRUNCATE, a key change and an event update are all refused by triggers.

## Findings (severity)
- Minor: punctuation-only reason accepted while the audit line records no reason (m1). Status 422 vs the brief's 400 (m1).
- Minor: the firm-session refusal text names "the register of requests", not the switches (m4).
- Port soundness (not a journey step, review M1): eraser rule 4 forces NOTHING on a re-call even when data is still kept.

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1/J2: tripped and restored with a reason; event and line written |
| Next step obvious | 1 | 200 returns the switch's new state; 409 says nothing changed |
| Plain words | ½ | Problem titles are plain; the definer's refusal names the wrong register (m4) |
| Feedback and state | 1 | `on`, `changedBy` and `changedAt` returned; field errors per field |
| Correct data | ½ | One event per change, race-safe; `!!!` reason missing from the trail line (m1) |
| Error recovery | 1 | 404/409/422 leave nothing half-written; refusals logged |
| Accessibility and screen sizes | N/A | No screen (PF-21rs) |
| Speed | 1 | Calls took 3-20 ms in the request log |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Reason and actor kept on event and line; key labelled Sample; legal points "Unconfirmed: no counsel" |

**7 of 8 applicable → 8.5/10, pass** (no criterion at 0; the two screen criteria are left to PF-21rs rather than given free points).

Raise it most cheaply with:
1. `@SystemReason()` on the POST, so the reason rule is one rule on both records.
2. A switch-specific refusal text.

**Could not test:** a screen, a screen reader, an intended user's unaided walk (D17/D20 stay with the founder), CI on GitHub.
