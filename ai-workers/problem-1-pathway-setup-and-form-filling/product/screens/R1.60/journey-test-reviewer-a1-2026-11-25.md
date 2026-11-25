# R1.60 a1: journey test (reviewer, 25 Nov 2026)

Head: `bd28f653a0f508470097d38ef67fa4efc2d468c0`. This change is API only, so there is no screen to walk in a browser. The journeys were walked through the product's own paths: the Signed offline service, and the signing provider's webhook door with the fake vendor.

How they ran:
- on a scratch database on :54329, never :4400;
- through the app's `Db` as `xr_app`, behind PF-12's walls;
- the data was read underneath with psql.

The builder's suite `tests/check_r160_deposit_prepare.ts` (36/0) covers the same paths as a superuser.

## Journeys (each: persona · goal · result)
1. **Representative, firm on trust Yes, retainer signed on paper.** Goal: "the client's deposit is asked for, and I decide when it goes." Result: one Prepared request, 123,457 cents plus 16,049 estimated HST, no DR- number, one Needs you item. **Held.**
2. **Client and representative e-sign; the provider calls the webhook.** Goal: the same. Result: one Prepared request, `actor system:signing-webhook`, the prospect won, `signing.completed` written last. **Held.**
3. **The provider sends the completion twice** (recovery and duplicates). Result: `duplicate: true`, still one request, one audit line, one item. **Held.**
4. **Firm on trust No or Unanswered** (alternate). Result: nothing prepared and no held line. In the database the trust check is still the trigger's. **Held.**
5. **First row not On signing, or no amount** (empty). Result: nothing prepared. **Held.**
6. **Three signings of one version at the same moment** (break it: a race). Result: 1 row, 1 audit line, 0 held lines. **Held.**
7. **A listener fails** (error). Result: the signature, the evidence, the win and the event all stand, and one `retainer.signed_listener_held` line is written. **Held. The recovery gap is open:** nothing retries in a1 (review m2).
8. **The wrong firm** (wrong role or tenant): the listener is called with firm B's id inside firm A's scope. Result: the walls show no firm row, so nothing is written at B. **Held, fails closed.**
9. **Representative opens Needs you** (the step across the boundary). Result: the row reads "Something needs you", with no words for the request and no page, because nothing labels `trust-request` yet. **Finding** (review m4).
10. **Staff request stored unsent by #3033** (B6). Result: it reads Waiting, never Prepared, carries no tax, and the database refuses to set `prepared_at` later. **Held.**

## Data underneath
- Each request exists once, keyed by the signed version id. The e-sign request matches `fo_signature_request.document_version_id` and the offline one matches the filed version (O5).
- The amounts are exactly the signed row, and the tax is half-even.
- No `money_invoice` row is written.
- The audit line comes before the event row.
- The trigger function is still SECURITY DEFINER, owned by `xr_wall_reader`, with `search_path` pinned.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 |
| Next step obvious | ½ | J9: the item has no words or page (m4) |
| Plain words | 1 | Audit summaries such as "Deposit request prepared (Ask me first): CAD … + … estimated HST … Not sent: a person sends it." |
| Feedback and state | 1 | `GET /trust/requests/:id` reads Prepared, with `estimatedTaxMinor` and `retainerVersionId` |
| Correct data | 1 | J1-J6, J10 |
| Error recovery | ½ | J7: the signature stands, but a held request has no retry in a1 (m2) |
| Accessibility and screen sizes | N/A | API only |
| Speed | 1 | 3 small statements inside the signing; the whole suite runs in about 10 s |
| Visual quality | N/A | API only |
| Trust and sources | 1 | The actor is named. Tax and figures are labelled Sample; "Unconfirmed: no counsel" in the code and the PR. |

**7 of 8 applicable, scaled to 8.75/10: pass**, with no criterion at 0.

Fixes that would raise the score, most valuable first:
1. Name the Needs you item's words and page (m4).
2. Give a held request a retry, or state it as a named gap (m2).

## Could not test
- A browser walk: there is no screen.
- A real screen reader.
- An intended user's unaided walk (D17, D20 stay with the founder).
- Real email: a1 sends none.
