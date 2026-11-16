# Journey test: FO-3sa, staff booking at any time (reviewer, 15 Nov)

Commit `8fe475646`. The row is API only, so the journeys were walked over HTTP against a scratch database (127.0.0.1:54329) with the suite's harness: PF-4 guard, the six seeded roles, fake clock Mon 26 Oct 2026 08:00 Toronto. No browser, no :4400, live AI off, US$0.

## Journeys (persona · goal · steps · expected · result)
1. **Main path.** Case Officer, on the phone with a lead: "book Sunday 11:00 with the Owner". POST the time → 409 "Book anyway?" listing "Outside Sample owner's hours" → POST again with `bookAnyway` → 201 with the audit reason. **Held** (DW3, DW4).
2. **Alternate, overlap.** Case Officer books over the Owner's 13:00 → 409 "Overlaps Lee Sample 13:00–13:30" → Book anyway → both rows kept, confirmer recorded. **Held** (DW2).
3. **Alternate, host choice.** A two-host type, Owner chosen → Owner hosts. A deactivated host → field error. **Held** (DW6).
4. **Alternate, any time on the grid gap.** Tue 10:15, in hours, host free → expected 201 (or Book anyway). **Failed:** 409 "That time is not available any more", Book anyway too (review M2).
5. **Error, Cancel.** No `bookAnyway` → nothing saved, no audit, no event. **Held** (DW4).
6. **Wrong role.** Billing and finance or Read-only with Book anyway → 403. Firm B's host or type → 404. Firm B reschedules firm A's booking → 404. **Held** (DW8, probe).
7. **Recovery, stale confirm.** The 409 lists outside hours only; a colleague books the same host and time; the Case Officer then clicks Book anyway → expected a fresh 409 naming the new overlap. **Failed:** 201, double-booked, audit names the Case Officer as having confirmed the overlap (review M1).
8. **Double click, two writers.** Two staff click Book anyway on the same fresh time at once → expected the second to be shown the overlap. **Failed:** both 201, one marked "confirmed" without seeing it (M1).
9. **Boundary, public page.** The public slots never show the booked-anyway times. **Held** (DW5).
10. **Reschedule.** A move to Sunday warns, Book anyway moves it, a move back clears the confirmer, a past time → 400. **Held** (DW7).

## Data underneath
Rows counted per time after each journey. The confirmer is only on the second row. The audit `detail` holds `bookedAnyway`, `warnings` (codes), `warningLabels` and `overlapConfirmedByUserId`; the labels carry another person's name (review m2). Nothing else changed: the FO-3 and FO-3sr suites passed at 133/0 and 29/0.

## Break-it
* Strict bodies: an unknown `hostStaffId` on reschedule → 400; `bookAnyway: "true"` → 400.
* A random host uuid → 404.
* A cancelled base booking leaves its confirmed overlap exempt from the database rule (m1).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | journeys 1-3, 5, 6, 9 and 10 work; journey 4 cannot book an in-hours time |
| Next step obvious | 1 | the 409 carries `code: WARNINGS`, every reason, and the host |
| Plain words | ½ | warning labels are plain; journey 4 answers the untrue "not available any more" |
| Feedback and state | ½ | the warnings are correct at first; the second answer can differ from the first without saying so (M1) |
| Correct data | ½ | a confirmer is recorded for an overlap they never saw (journeys 7 and 8) |
| Error recovery | 1 | Cancel saves nothing; field errors for host, past and body shape |
| Accessibility and screen sizes | N/A | no screen (FO-3st1) |
| Speed | 1 | the whole suite of 23 checks runs in seconds; each call is well inside the budget |
| Visual quality | N/A | no screen |
| Trust and sources | ½ | the audit says a person confirmed a clash they were not shown |

5.5 of 8 applicable criteria, which is **7/10 scaled. Not a pass** (below 8), with no criterion at 0.

**Fixes, most valuable first:** (1) tie Book anyway to the warnings shown, or refuse again when a new overlap appears (M1: raises correct data, trust, and feedback). (2) Save an in-hours, off-grid time instead of answering SLOT_TAKEN (M2: raises task completed and plain words).

**Could not test:** a browser walk, axe, widths, keyboard and a screen reader (no screen; FO-3st1). The public-door race was not driven over HTTP (the stamp and consent set-up was not built). D17 and D20 stay with the founder.
