# Journey test, reviewer: PF-19r part 2 (case link and code emails through MessagePort)

Commit `ed070da45a76249fe12407ec9469a47cbbec0510`. Isolated copy `rev_pf19r2` on :4438 (never :4400), Visitor visa released by `setup_visitor_visa.ts`. This row changes no screen, so the journeys were walked through the product's own API routes, the same calls the case page and the link page make. The data was read with SQL (`msg_outbox`, `demo_message`, `person_link`, `audit_event`) and from the copy's API log. There was no visible-browser walk. Review: `review-part2.md`.

## Journeys and results
| # | Persona, goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Client A: "send my partner their own link" | POST …/people/:S/link with an address | one outbox row (CASE_PARTY, TRANSACTIONAL, the case's firm), the email with the firm's layout, the link in the demo inbox | Held (DW7, worker SENT) |
| 2 | The partner: "get a code and get in" | open the link, Send me a code, type it | code email, code works | Held (DW8, B1 verify 200) |
| 3 | Client A, error: the address is suppressed | send to a suppressed address | 409 "Not sent: …", nothing changed | Held (DW7 fail, DW8 fail) |
| 4 | Staff, error: the firm has no platform account | send on such a case | 409 "This firm cannot send email yet", nothing written | Held (DW10) |
| 5 | Client A, recovery: the request is retried with the same key | the same idempotency key twice | one link, one row, one copy | Held (DW9) |
| 6 | Client A, alternate: Resend the link the firm sent, minutes apart | Resend four times, more than a minute apart | an email each time | **Failed**: presses 3 and 4 answer 201 and write an audit line, but send nothing (M1) |
| 7 | Client A, error: Resend to an address that is now suppressed | suppress, then Resend | 409 "Not sent" | **Failed**: 201 and an audit line, nothing sent (M1) |
| 8 | The partner, double click: "Send me a code" pressed at once | 3 parallel presses, 6 runs | the code in force is the one emailed | **Failed** in 1 of 6 runs: no working code reached the person (M2) |
| 9 | Staff of the solo firm, across the boundary: the email shows the right firm | the solo case sends a link | the solo firm's name and outbox | Held (B2) |

## Break pass (15 min)
* Same key twice: one row (held).
* Resend pressed repeatedly: key repeats from the third press (M1).
* Parallel code presses: key collides within one millisecond (M2).
* `firm_id` null on a key with a platform firm: falls back to `firmIdByKey` (held).
* A token or code in the log, audit, outbox key or answers: none found (held).
* A rolled-back change that still sends: none (outbox row in the same transaction, dispatch after commit).
* The suite's own CI header does not run in `run-suites.sh` (M3, not a user journey).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1-5 and 9 pass; 6, 7 and 8 fail (M1, M2) |
| Next step obvious | 1 | The refusals say what happened and that nothing was sent (brief's words) |
| Plain words | 1 | "Not sent: this address does not take email from the firm. Nothing was changed." |
| Feedback and state | ½ | A 201 "sent again" when nothing was sent (M1); 200 `sent: true` with a code never emailed (M2) |
| Correct data | ½ | An audit "resent" line with no email (M1); stored code hash with no email (M2); otherwise exact |
| Error recovery | 1 | Refusals roll back the link, code, audit and copy; the person can press again |
| Accessibility and screen sizes | ½ | No screen changed; not walked in a browser this check |
| Speed | 1 | `/api/link/code/send` 44-59 ms, link send under 200 ms in the copy's log |
| Visual quality | 1 | Email layout: firm name on top and a "Sent by Sample …" line (DW7) |
| Trust and sources | 1 | Sender is the case's own firm (B2); content labelled Sample |

**Score: 8/10, no criterion at 0.** That meets the score bar, but the review is Block for the open Majors M1-M3.
Fixes that would raise the low criteria, most valuable first:
1. Unique Resend key (M1).
2. Unique code key (M2).
3. A browser walk of the link page after the fix.

Not tested: a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder).
