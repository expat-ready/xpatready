# PF-4c1b journey test (reviewer), 22 Nov 2026

Commit `36113d6983f51c2c1b21913395f23111e49670dc`, `POST /api/platform/staff/invitations/batch`.
This row is API only, so no browser walk was done; the PF-6 screen comes later. Each journey ran as calls to a Nest app of
PF-4's classes, on a scratch database on 127.0.0.1:54329 (dropped afterwards), using the shipped suites and the reviewer's probes in a scratch copy. PF-28 ran against an isolated copy on :4436.
The data underneath was read with SQL after each journey.

## Journeys (persona: a firm Owner, unless stated)
1. **Main path: invite my team of 50.** 50 valid rows, 50 seats → 200, 50 invited, 50 invitations, 50 audit lines, 50 emails, no token in the answer. 464 ms. Held.
2. **Alternate: some rows are wrong.** 5 rows: a bad email, an unknown role, 3 good → rows 1, 3 and 5 invited; rows 2 and 4 listed with a reason and plain words. The flagged people get no email and no record. Held.
3. **Short of seats.** 8 valid rows (plus 1 bad email), 5 seats free → rows 1, 2, 4, 5, 6 invited in row order; rows 7-9 get OVER_SEAT_LIMIT with "Remove someone or upgrade your plan, then send this row again". One EntitlementPort check. Afterwards seats used = the limit. Held.
4. **Empty and too many.** 0 rows, or 51 → 422 ROWS_COUNT with `fields.rows`; nothing sent. Held.
5. **Error: no live plan.** Every row gets OVER_SEAT_LIMIT with "no live subscription" (fails closed). Held.
6. **Recovery: double submit or resend.** The same batch again → the invited rows come back ALREADY_INVITED; no second invitation, audit line or email. Held.
7. **Wrong role.** An Admin's Owner row gets "Only an Owner gives the Owner role"; a role beyond the Admin's keys gets ROLE_BEYOND_OWN_KEYS. A READ_ONLY sender gets 403 and nothing is stored. Held.
8. **Two owners at once.** Two batches of 2 with 3 seats free → 3 invited and 1 OVER_SEAT_LIMIT; the seats never pass the limit. Held, but the test does not force the two batches to overlap (review m2).
9. **Across the boundary.** The answer feeds PF-6's "fix and resend": `flagged[].row/reason/detail`. A failed email gives `emailed: false` with the invitation still pending; the daily mail cap gives `heldRows`. Held.

## Break it
* **Major:** a role written as `{"toString":1}` → 500, and the valid row in the same form is not sent (`id/service.ts:71`).
* **Minor:** `ΑΣ@example.com` and `ασ@example.com` were both invited, so non-ASCII case gets past the duplicate check (`id/service.ts:66`).
* Held:
  * an upper-case staff email gives ALREADY_STAFF;
  * a leading space or a zero-width character gives INVALID_EMAIL;
  * an unknown row key gives 422 and nothing is sent;
  * a forced insert failure on row 3 rolls back the whole form.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | Journeys 1-3: the valid rows are sent, the flagged rows are listed |
| next step obvious | 1 | Each flagged row's `detail` says what to do ("then send this row again", "resend it instead") |
| plain words | 1 | Every `detail` is plain English; no IDs |
| feedback and state | 1 | `invited`, `flagged`, `emailed`, `heldRows`, `seatsUsed`/`seatsLimit` |
| correct data | ½ | Counts and the audit match the database exactly; but non-ASCII case variants can create two invitations for one person |
| error recovery | ½ | A repeat is safe and a failed send stays pending; but one crafted row gives a 500 that drops the valid rows |
| accessibility and screen sizes | 1 | N/A: no UI in this row |
| speed | 1 | 50 rows in 464 ms |
| visual quality | 1 | N/A: no UI in this row |
| trust and sources | ½ | No AI involved. The seat words name the plan, but the reason codes are not documented for PF-6 (review m3) |

**Score: 8.5 / 10. Pass** (8 or more, no 0).
Fixes that would raise the low criteria, most valuable first:
1. Flag non-text roles on their row instead of giving a 500 (error recovery).
2. Compare emails by a case-folded key (correct data).
3. List every reason code in the card fragment (trust and sources).

**Not tested:** a real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder); the PF-6 screen (not built); CI.
