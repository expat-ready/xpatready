# Journey test (reviewer): PF-22a part 2, API only (26 Nov 2026)

Commit 614a425d935902897d5c31e343d664384055f289. There is no screen yet (parts 4 and 5), so these journeys were walked as HTTP calls against the feature's own Nest app (PF-4's guard, a scratch database seeded with the Sample firms). That was a copy of `tests/check_pf22a_custom_fields.ts` plus 12 probes. The database was dropped afterwards. No browser, axe or widths.

## Journeys (persona · goal · result)
1. Owner · "add a required Referral partner choice to prospects" · POST gives 201, key `referral_partner`, one audit line. **Held.**
2. Agent · "fill it in on my prospect" · GET shows `missing: [referral_partner]` and version "0". The PUT with "tomorrow" in a date or an unlisted choice gets 422, with the field named. Valid values: 200, a new version, one audit line. **Held.**
3. Agent · "record the client's credential assessment" (a CHECKBOX the Owner added) · PUT `true` gets **500**, an audit alarm, nothing saved. **Failed (M1).**
4. Agent · "paste the long background notes" (LONG_TEXT, 4,500 characters, under the 5,000 limit) · **500**. **Failed (M2).**
5. Two tabs · "both save the same record" · parallel PUTs on one version: one 200, one 409 `STALE_VERSION`. The 409 carries no latest values or changed keys, so a screen cannot show what changed. **Partly (M3).**
6. Other Agent (wrong person) · "open a colleague's prospect by URL" · 404 on read and write. Read-only: reads it (canEdit false), PUT gets 403. Firm B: 404, and no fields listed. **Held.**
7. Prospect's Agent who is not the lead's owner · "see the person's fields" · 200 (challenge m10). **Held**, but no test pins it.
8. Owner · "archive a field in use, then bring it back" · without confirm: 409 `FIELD_IN_USE`, count 1. With confirm, it leaves the record and the value is kept; un-archive shows it again. At 50 active fields, un-archive gets 422. **Held.** The detail reads "1 prospect have a value … Send confirm" (m3).
9. Owner · "archive, then re-add with another type" · new key `spare_2` (challenge M4). **Held.**
10. Owner · "change a type in use / remove a choice in use" · 409 `TYPE_FROZEN` and 409 `OPTION_IN_USE`, naming the choice and the count. **Held.**

## Data underneath
Every value is stored exactly as sent (trimmed in NFC; the trim matches the database over the whole Basic Multilingual Plane). There is one audit line per change, with the values in before/after and none in the summary. Nothing else changed. Roles were enforced by the server (403, 404).

## Break it
Duplicate label (any case) gives 422. The 51st field gives 422. Parallel saves are handled. A malformed id or an unregistered kind in the path gives 404. Breaks found: M1 and M2 (a 500 from the audit port's limits), and m4 (`position` on an archived field writes a no-change audit line).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | journeys 1, 2 and 6–10 hold; 3 and 4 fail |
| Next step obvious | ½ | FIELD_IN_USE names the count; STALE gives no latest values (5) |
| Plain words | ½ | "1 prospect have", "persons", "Send confirm" |
| Feedback and state | ½ | 422 by key is good; the 500s have no words |
| Correct data | 1 | exact values, one audit line, walls hold |
| Error recovery | ½ | the 409 cannot be resolved without a fresh GET; the 500s |
| Accessibility and screen sizes | N/A | no screen |
| Speed | 1 | each call well under 200 ms in the suite |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | every change audited, the actor named |

**5.5 of 8 applicable = 6.9/10: below the pass of 8.** Fixes, most valuable first:
1. M1 and M2: values the audit port refuses.
2. M3: a 409 with `current` and the changed keys; `@Versioned()`.
3. m3: the wording.

Not tested: a real screen reader, an intended user's unaided walk (D17 and D20 stay with the founder), and the full app's If-Match interceptor.
