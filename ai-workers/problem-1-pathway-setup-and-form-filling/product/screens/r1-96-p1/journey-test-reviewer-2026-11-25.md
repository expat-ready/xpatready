# Journey test: R1.96 part 1, write off a small balance (API) · reviewer · 25 Nov 2026

Head `2fdfd6a1da486417144597993794258119005b48`. No screen in this part, so the journeys are walked through the API the
screens will call (FO-7s4 later): `tests/check_r196_write_offs.ts` (run as written, 22/22 PASS, 11 s) plus my break-it
script on its own scratch database on 127.0.0.1:54329 (scratchpad only, never :4400). Browser, axe, widths and keyboard: N/A.

## Journeys (persona · goal · expected)
1. Owner (holds `agent/invoice:void`) · "the client paid 200 of 500, write off the 300 left" · 201, Written off, nothing due, one row, one audit line. **Held.**
2. Owner · same, with no / blank / 201-character / hidden-only reason · 422 on `reason`, nothing written. **Held.**
3. Case Officer without the key; no session · refused 403 / 401. **Held.**
4. Owner · write off twice; two tabs at once · 409 ALREADY_WRITTEN_OFF; one row. **Held.**
5. Owner · credit note after the write-off · 409 "Already settled by write-off". **Held.** A later payment → extra money. **Held.**
6. Owner · a draft; a paid invoice · 409 DRAFT / NOTHING_DUE. **Held.**
7. Firm B's staff on firm A's invoice; unknown and malformed id · 404. **Held.**
8. Owner · invoice 500 with 300 paid from trust · write-off takes 200, never the trust part. **Held** (break B4).
9. Owner · invoice paid from trust, half moved and covered by a "Refund to the client" credit note, the unmoved half returned, 50.00 due · write-off 201. **Failed: 409 UNBALANCED** (L5 false positive, break B5).
10. Owner · person F shares a case's credit ledger with person E; write off F's other invoice · 201. **Failed: 409 UNBALANCED** (L2 false positive, break B6).

## Data underneath
Journeys 1-8: `money_write_off` once, amount exactly the due, reason stored as sent (trimmed), `audit_event`
`invoice.written_off` with actor, entity key and reason; firm B unchanged. No `module_event` for the write-off (only
`invoice.issued` on the invoice): the shape's `invoice.written_off` event is missing.

## Break it
* Lone surrogate in the reason (`"Small \ud800 balance"`) → **500** (audit jsonb P2007). Major.
* Newline in the reason → 422, but with the "hidden or direction-changing characters" text instead of "One line". Minor.
* `amountMinor` in the body → 422 "not allowed here" (good: no typed amount).
* 190 characters of French and Chinese plus 10 emoji (200 code points) → 201, stored whole.
* A full credit note with "Refund to the client" on a trust-paid invoice → the whole ledger check reports L5 (false). Major (with 9).

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | journeys 1-8 complete; 9 and 10 refuse a legitimate write-off |
| Next step obvious | 1 | refusals name the way on ("edit or delete it instead", "already written off") |
| Plain words | ½ | refusal words plain; UNBALANCED lists entry ids and raw cents; newline gets the wrong message |
| Feedback and state | 1 | 201 returns the invoice after; every refusal ends "Nothing was saved." |
| Correct data | ½ | rows and audit exact; no `invoice.written_off` event |
| Error recovery | ½ | rollbacks hold; lone surrogate is a 500 |
| Accessibility and screen sizes | N/A | no screen in this part |
| Speed | 1 | 22 checks plus app boot and every migration in 11 s; no per-row requests |
| Visual quality | N/A | no screen in this part |
| Trust and sources | 1 | amounts Sample; "Unconfirmed: no counsel; no accountant"; audit names who and why |

**6 of 8 applicable = 7.5 / 10. Not a pass** (pass is 8 with no 0; no criterion is at 0).

## Fixes that raise it, most valuable first
1. L5 uses the triggers' trust figure (less `OVERPAID_REFUND` cover) → task completed, correct data.
2. L2 narrows to whole holders, not to the party's rows inside a case → task completed.
3. Reuse `words("The reason", 200)` for the reason → error recovery, plain words.
4. Write `invoice.written_off` (or record the tech lead's ruling to drop it) → correct data.
5. Give UNBALANCED one plain sentence ("The money on this invoice does not add up: ask the Owner") with the rule list kept in the log → plain words.

## Not tested
A real screen reader and an intended user's unaided walk (no screen; D17/D20 stay with the founder); a write-off racing Pay
from trust or the card webhook; a caller truly outside C5 scope (with "everyone sees all" off the Owner still read and
wrote, read 200 and write 201: consistent).

## Round 2 (a3192ded1, diff only)
Journeys 9 and 10 now hold (WO9 (d) and (b): 201, firm balanced); the lone surrogate, a line break and a NUL give 422 on
`reason`; `invoice.written_off` is written once per write-off and not on an UNBALANCED refusal. 40/40, run twice.
Score: task 1, next step 1, plain words ½, feedback 1, correct data 1, error recovery 1, speed 1, trust 1 (two N/A):
**7 of 8 = 8.75, recorded as 8.5 / 10 (rounded down to the half point). Pass.** To raise plain words: one plain sentence for UNBALANCED, rule list to the log.
