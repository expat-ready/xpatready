# Journey test (reviewer): FO-3a part 2a, the consult record, commit a0bc261c7 (17 Nov 2026, ~19:10 IST)

Skill `journey-test`, reviewer role: this is the one score for this check. Scoring rule: QUALITY.md, "Journey score".

**How it ran:**
- This is a runtime row with no screen (FO-3st1 is the screen), so the journeys were walked over HTTP like the screen will call them.
- The suite's own Nest harness: PF-4's guard, the local sign-in, FO-3sr's staff routes to book and answer attendance, and fake clock, mail, jobs and audit.
- One scratch database per run, on an ephemeral 127.0.0.1 port. Never :4400.
- Data read from PostgreSQL (`fo_consult_record`, `msg_outbox`, `module_event`) and from the fake audit trail.
- Probe scripts were kept in the reviewer's scratchpad. Nothing was written to the repository beyond this report and the review.

## Journeys
Personas: the Owner as host; a Case Officer with `agent/booking:edit`; Billing and finance as host with no booking key; Read-only; firm B's Owner. Sample firm.

| # | Goal in the person's words | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Main path, host: "Write up Client L's call" | Attended → GET (404 NO_RECORD, 45 min) → PUT notes and items → PUT 35 min and CAD 150.00 | Saved; time defaults to 45; fee kept | **Held.** About 10-15 ms per call; one record; audit "created", then "changed" |
| 2 | Alternate, a colleague: "Fix the fee on Owner's record" | Case Officer PUT | 200 | **Held** |
| 3 | Next step | GET on the lead, prospect and case bookings | Lead: Engage and Close; prospect: Prepare retainer; case: none | **Held for the suite's data. Broken for a Case review of a person with an open prospect**: the answer offers `PREPARE_RETAINER` (review M2) |
| 4 | Empty | GET before any save, unanswered or cancelled | 404 NO_RECORD with `bookedMinutes` | **Held.** No currency to pre-fill (review m2) |
| 5 | Error: bad input | Fee with no currency, EUR, −1, 1e12, 1.5, "100", 0 min, 21 items, an extra field, an array body, 10,001 characters | 400, nothing changed | **Held.** "Choose a currency for the quoted fee." on `quotedFeeCurrency`. EUR's issue is in zod's words (m4) |
| 6 | Error: not attended | PUT on a booking not answered, No-show or cancelled | 409, nothing saved | **Held** |
| 7 | Wrong role | Billing and finance on another host's booking; Read-only; firm B; no sign-in | 404 / 403 / 404 / 401 | **Held** (decision 2 accepted) |
| 8 | Recovery: attendance changed | Save, then No-show, then GET, then PUT | Record kept, `attendanceChanged: "NO_SHOW"`, PUT 409 | **Held** |
| 9 | Two people, one record | Host's form open → Case Officer saves CAD 3,500 → host saves | 409 stale, or the fee kept | **Failed.** The host's save is 200 and the fee is NULL: a silent lost update (M1) |
| 10 | Boundary to FO-5 | `ConsultRecordPort.read` on the adapter and on the fake | Party, items, fee; another firm's id → null | **Held**, including inside the caller's transaction |

## Break-it pass
| Probe | Result |
|---|---|
| 8 parallel first saves | 1 record, 1 "created" line |
| 10,000 Devanagari characters | Saved in full |
| Accented item "Permis de travail — Québec" | Saved |
| Duplicate and space-padded items | Merged into one |
| A save while the audit fails | Rolled back (suite) |
| Malformed booking id | 404 |
| Malformed firm id on the port | Throws instead of answering null (nit) |

## Data underneath
- Exactly one row per booking, holding the values entered.
- A refused save changes nothing.
- Each save writes one audit line, with before and after facts and no notes text.
- No mail, no `module_event` and no `msg_outbox` row.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J10 |
| Next step obvious | ½ | `nextSteps` is worked out by the server, but wrong in J3's case variant (M2) |
| Plain words | ½ | Most messages are plain; EUR shows zod's words (m4) |
| Feedback and state | 1 | NO_RECORD with `bookedMinutes`; `attendanceChanged`; created vs changed lines |
| Correct data | ½ | J9: a silent lost update (M1) |
| Error recovery | 1 | J5, J6 and J8: nothing saved on a refusal; audit fail-closed |
| Accessibility and screen sizes | N/A | No UI |
| Speed | 1 | About 10-15 ms per call |
| Visual quality | N/A | No UI |
| Trust and sources | 1 | No AI; the steps come from the server; values are Sample |

**6.5 of 8 scorable = 8.1, reported as 8/10. No criterion is at 0, so this is a pass by score.** The review still Blocks, on M1 and M2.

**To raise the score:**
1. A version check and a stale 409 (Correct data → 1).
2. Purpose before prospect in `partyOf` (Next step → 1).
3. A plain currency message (Plain words → 1).

## What I could not test
A real browser, a screen reader or screen sizes: there is no screen in this part. An intended user's own walk (D17 and D20) stays with the founder.
