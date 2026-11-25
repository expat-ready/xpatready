# QA-770 journey test (reviewer), 25 Nov

PR #3648, head `c1c181cf0f6e28615f0c5bd1defbc77ceb9cbeed`. This PR has no page: main's retainer page has no Withdraw, Edit-after-send or
Signed offline control yet (retainer-page.tsx:7). So the walk is what those controls will send, through the real services (`Retainers.withdraw`,
`edit`, `signedOffline`) and the real webhook route (`SigningHooksController.receive`), on a scratch database. Fake signing adapter, fake mail,
Sample data, US$0. The tools were the suite `check_fo6_signing_api.ts` (65/0) plus a probe script in my scratchpad, outside the repo, with its database dropped.
I used no browser (no page) and never port :4400.

## Journeys (persona · goal · expected)
* J1 main, case officer: "withdraw the retainer I sent, the client changed plans". The client's request becomes CANCELLED:WITHDRAWN with one
  audit line, the envelope is cancelled once, and the client gets one "Agreement withdrawn" email with Reply-To the firm.
* J2 alternate, case officer: "fix the deposit on a sent retainer". The old request becomes CANCELLED:UPDATED, the envelope is cancelled, and no email goes out.
* J3 alternate, case officer: "the client signed on paper at the office". SIGNED_OFFLINE, and the request becomes CANCELLED:SIGNED_OFFLINE.
* J4 error, vendor down: Withdraw gives 503 "Try again" and nothing changes. Then the same withdraw succeeds.
* J5 error, vendor down during Edit: 503 and nothing changes. During Signed offline: the paper signature is still recorded.
* J6 wrong state / stale page: a withdraw that names version 2 while version 1 is current gives 409 and cancels nothing at the vendor.
* J7 boundary to the client's side: after J1 or J2, the client's late `viewed` or `signed` and the vendor's `completed` are refused and stored once.
* J8 race, the client and firm finished at the vendor: the case officer withdraws before the `completed` webhook lands. The withdraw should be refused.
* J9 race, a webhook at the same moment: one side gives way cleanly.
* J10 recovery, a slow vendor: a retry finishes the withdraw.

## Results
| Journey | Result |
|---|---|
| J1 | Holds (suite :380-386): CANCELLED:WITHDRAWN:ended, 1 audit line, 1 cancel, 1 email `signing.withdrawn` |
| J2 | Holds (suite :326-328): CANCELLED:UPDATED, 1 cancel, 0 emails |
| J3 | Holds (suite :393-396) |
| J4 | Holds (suite :372-377): 503 SIGNING_UNAVAILABLE, retainer and request SENT, no audit line; the next withdraw → 200 |
| J5 | Holds (probe P4: Edit 503, SENT:1 / SENT; P5: SIGNED_OFFLINE recorded, the vendor envelope still live, logged) |
| J6 | Holds (suite :367-368) |
| J7 | Holds (suite :345, :357, :428): `applied: false`, "the request is cancelled", the signer unchanged |
| J8 | **Fails** (probe P1): withdraw → 200 WITHDRAWN, "Agreement withdrawn" emailed, then `completed` refused and 0 evidence rows (review M1) |
| J9 | Partly (probe P2): a deadlock, and the withdraw loses after 1051 ms with "someone else saved it" (review m1) |
| J10 | Partly (probe P3): a 6 s cancel → 500, database rolled back but the envelope cancelled; the retry → 200 (review m2) |

## Data underneath (J1)
* Database: `fo_signature_request` reads `CANCELLED`, `cancel_reason WITHDRAWN`, `ended_at` set. `audit_event` has one `signing.request_cancelled` line (detail.reason WITHDRAWN,
  actor `staff:<id>`) and one `retainer.withdrawn` line. No live request is left for the retainer.
* Vendor: exactly 1 cancel at the fake, and the fake gives no link afterwards.
* Mail: 1 email to the person's address, idempotency key `signing:<request>:withdrawn:<person>`.

## Break-it pass
* **Double withdraw:** the second one waits on the version row, then gets 409 CHANGED, and the vendor gets 0 extra cancels.
* **Stale version:** refused before any write.
* **Failure in the transaction** (forced audit failure): nothing ended and 0 cancels (suite :370-371).
* **Webhook race:** see J9.
* **Vendor completed:** see J8.
* **Another firm:** every query is firm-scoped by `ctx.firmId`, and `check_pf12_walls` 110/110.
* **Long or non-English text:** the withdraw reason is unchanged by this PR (FO-5's 1-200 rule).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J3 complete through the services |
| Next step obvious | ½ | 503 "Try again in a minute" is clear. J9 says "someone else saved it" when it was a webhook; J10 gives a 500 |
| Plain words | 1 | The email reads "has withdrawn … The signing link no longer works and there is nothing for you to do." |
| Feedback and state | 1 | The state read shows the request CANCELLED; refusals name the cause |
| Correct data | ½ | J8: WITHDRAWN is recorded over an agreement everyone signed, and the evidence is refused |
| Error recovery | ½ | J4 and J5 are right; J10 recovers only on a retry, after a 500 |
| Accessibility and screen sizes | 1 | N/A: no page in this PR; counted 1 (as in earlier reviews of API-only items) |
| Speed | 1 | The full 65-line suite ran in 15 s; only the forced deadlock waited about 1 s |
| Visual quality | 1 | N/A: no page; counted 1 |
| Trust and sources | 1 | Sample values; an audit line in each transaction; no AI |

**8.5 / 10, pass (no criterion at 0).** Fixes that raise the low criteria, most valuable first:
1. Refuse a withdraw or edit when the vendor reports the envelope completed (M1). This raises correct data.
2. Bound the vendor cancel and map P2028 to 503 (m2). This raises error recovery.
3. Lock the request before the retainer (m1). This raises next step obvious.

Not tested:
* A browser walk: there is no page.
* A real screen reader.
* A real vendor's timing.
* `check_fo6_door` and qa's j_55 W1: both need a running copy.
* D17 and D20 stay with the founder.
