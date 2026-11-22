# Journey test (reviewer): PF-4c part 2, the licence-number typo check, 22 Nov 2026

Head `f1741130774a2a90cb6f31ed4eab8db3e8845012`. API only, with no screen: the lead told the reviewer to skip the browser walk. The journeys were walked through the route by the suite's in-process Nest app (port 0 on 127.0.0.1, never :4400), plus pure-function probes against `licence-format.ts`.

## Journeys (persona: a firm Owner or Admin, or a staff member on their own record)
1. **Main path, a typo.** "I save my College licence number with a slip." The PUT credential with a number not matching the body's pattern → 200, saved, `warning: "This doesn't look like a College of Immigration and Citizenship Consultants licence number. Check it."`. The record holds what was typed. Held.
2. **Alternate, a correct number.** A matching number → 200, saved, no `warning`. Held.
3. **Body given by its kind.** `licensingBody: "CICC"` is checked like the full name. Held. A different spacing or letter case of a name also matches (probe). Held.
4. **Empty case: no pattern.** A law society, or any body today, since the pack holds none → saved, no warning. Held.
5. **Error: a body the pack does not know.** Free text → saved, no warning, never refused. Held.
6. **Privacy.** The number is in no log line, audit line, outbox row, email or answer; the warning names only the body. Held (DW6b).
7. **Wrong role.** Another person's record without `agent/firm-credential:manage` → 403 before any check (`service.ts:356`, unchanged; covered by `check_pf4_identity.ts` part A). Held.
8. **Pack integrity.** A pattern without a full source, or one that does not compile → the pack refuses to load. Held (DW6c).
9. **Across the boundary.** PF-6's licence form sends the body's name (`licence-form.tsx:53`) and ignores the answer today, so nothing breaks. Showing `warning` belongs to the screen row. Held.

## Data underneath
* `platform_staff_credential.licence_number` equals the value saved, every time.
* There is one `platform.staff.credential_saved` audit line per save, holding `licenceNumberChanged` and never the number.
* Nothing goes to the outbox and no mail is sent.

## Break it (results)
* `"Law  Society\tof ONTARIO"` → Law Society of Ontario.
* `law_society` and `Law Society` → no body. `Cicc` and full-width `ＣＩＣＣ` → CICC.
* Unaccented "Quebec" → no body (safe: no false warning).
* Alternation `A\d{2}|B\d{3}`: `A12x` and `xB123` are rejected. Anchoring holds.
* An empty pattern with a source, or a whitespace-only url → refused at load. A `null` pattern → no pattern.
* **`(a+)+b` on 24 characters → 579 ms** (Minor m1 in the review): the loader accepts nested quantifiers, and the check runs inside the firm-locked transaction. Patterns are committed-only and none exists yet.
* CI `module-cards` is red because of the fragment's backticked JSON path (Major M1 in the review).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every save answers 200 and stores the value (journeys 1–5) |
| Next step obvious | ½ | "Check it." is clear, but no screen shows it yet and the pack has no pattern, so no user sees it today |
| Plain words | 1 | One short sentence naming the body, no codes |
| Feedback and state | ½ | `warning` only appears in the answer; nothing visible until PF-6 reads it |
| Correct data | 1 | Database read after each save; audit and outbox clean |
| Error recovery | 1 | Never a hard block; an unknown body or unusual value is saved |
| Accessibility and screen sizes | ½ | Not assessable (no screen) |
| Speed | 1 | In-memory regex; the suite takes 6.8 s including migrations |
| Visual quality | ½ | Not assessable (no screen) |
| Trust and sources | 1 | A pattern needs {url, page, quote, date}; "no format published" confirmed in IMM 5476's XFA and page |

**8/10, pass (no criterion at 0).** To raise the score: once PF-6 shows `warning` beside the number, re-score the half points; add the ReDoS guard (m1).

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The bodies' official pages (not reachable from the cloud).
