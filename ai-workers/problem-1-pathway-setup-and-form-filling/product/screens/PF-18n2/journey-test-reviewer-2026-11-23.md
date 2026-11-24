# PF-18n part 2: journey test, reviewer (23 Nov)

**Head:** `c97b85ca34d04c7a55ecbad8240885a977027814`.
**Copy:** isolated `rv18n2` on :4445, with `AI_LIVE=off PLATFORM_IDENTITY=local`. I started and stopped it. It was never on :4400. US$0.
**Front-office seed:** run into the copy's database with `seedSampleFirmsFrontOffice`, as the browser suites do. The web form was switched on through its own route, `PUT web-forms/:id/enabled`.
**Scope:** this row has no screen; the bell and its list are PF-18ns. So I walked the journeys through the person's own API, the way PF-18ns will call it, as `xr_app` behind the firm walls, and checked the data underneath with psql.

## Journeys
1. **Main (the row's walk).**
   * Who and goal: Owner R and Agent T. "A lead R hands me shows up and opens."
   * Steps: R adds a lead → R assigns it to T → T reads the unread count → T reads the list → T opens the link → T marks it read.
   * Expected: one `lead-assigned` row, the lead's name and number, its page, the zone, and the count going 1→0.
2. **Alternate (rule).** A public web-form enquiry, with a rule naming O. Expected: O gets one row; a repeat post of the same submission adds none.
3. **No hand-off.** R adds a lead by hand. Expected: R gets no row, because nobody handed it to R.
4. **Reassigned away.** R reassigns T's lead to O, and the firm's everyone-sees-all is off. Expected: T's row stays, with `label` and `link` null and no name anywhere in the body; T's GET is 404; O sees it named.
5. **Wrong person.** O lists and marks T's row. Expected: O never sees it, and marking it gives 404.
6. **Bad input.** `items?zone=x`. Expected: 422, naming the key.
7. **Long name (break).** A web-form lead with a 92-character first name, Unicode and CJK included, and a 100-character last name. Expected: named and linked for its owner.
8. **Hand-over to the next screen.** The link `/front-office/leads/<id>` is a real web route (`web/src/modules/front-office/routes.tsx:27`), and it opens for its owner (API GET 200).

## What held
* **J1:**
  * the assign answered 200 in 47 ms;
  * T's count went to 1;
  * T's list (37 ms) gave `{"kind":"lead-assigned","group":"WORK_HANDED_TO_ME","item":{"kind":"lead",…},"label":"Walk Sample (L-00001)","link":"/front-office/leads/<id>","readAt":null}` and `zone: "America/Toronto"`;
  * the mark answered 200 and the count went to 0.
* **J2:** O got 1 row; the repeat post answered 201 and O still had 1 row.
* **J3:** R had 0 rows for the lead R added.
* **J4:** T's row had `label: null, link: null`, and the body does not contain "Walk". T's GET is 404, and O's row is named and linked.
* **J5:** O's list does not contain T's row, and O's mark gave 404.
* **J6:** 422.
* **Data underneath:** one `msg_notification` row per hand-off. It holds ids only: kind, group, item kind and id. Nothing else changed.

## Findings
* **J7 failed (Minor, review m2).** O's row had `label: null, link: null`, while O's GET for the lead answered 200. The label would be 202 characters, and `labels.ts:38` caps labels at 200. The bell would then say the owner's own lead "can no longer be opened".
* **Booking door (Minor, review m1).** I did not walk it. The code shows no port is passed (`booking/runtime-ports.ts:19`), so a booking host is never told.
* **Done when DW5's rollback line is vacuous (Major, review M1).** This is a test finding, not a journey finding. The break-it pass by the breaker shows the rollback itself works.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 complete end to end behind the walls |
| Next step obvious | 1 | Every handed-off row carries the page it opens (J1, J8) |
| Plain words | 1 | Label "Walk Sample (L-00001)": no ids or jargon |
| Feedback and state | 1 | `readAt`, the unread count 1→0 and `zone` are answered |
| Correct data | ½ | One row per hand-off, values exact. But J7: a visible lead loses its label and link |
| Error recovery | 1 | A refused Assign or a repeat post adds nothing; a bad query gives 422 (J6); the breaker's throwing port rolls back |
| Accessibility and screen sizes | ½ | Not testable: no screen (owed by PF-18ns) |
| Speed | 1 | List 13-37 ms, Assign 47 ms; one query per kind |
| Visual quality | ½ | Not testable: no screen |
| Trust and sources | 1 | The label and link come from the record on read; the name is withheld when the person no longer sees the lead; the data is Sample |

**Total 8.5/10, no criterion at 0: pass.** The fix that would raise it most is to shorten the name in the labeller so the label always passes (correct data → 1).

## Could not test
* A screen reader, the keyboard, axe and screen widths: there is no screen.
* An intended user's unaided walk (D17, D20 stay with the founder).
* The booking door: not wired.
